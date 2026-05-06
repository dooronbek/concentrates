# Deploy to Vercel

First-time deploy of the production-tracking PWA. Assumes:

- Vercel account exists (no CLI yet).
- Repo is on GitHub (private is fine — Vercel reads via the GitHub App).
- Migrations `0001_init.sql` and `0002_flavors.sql` have been applied in the
  Supabase SQL Editor.
- `npm run db:seed` has been run locally at least once so live data exists.

## Pre-flight (one-time, before importing)

1. Create the operator user in Supabase Auth (Auth → Users → "Add user"
   → email + password, no email confirmation).
2. Set the operator's role with one SQL run in Supabase SQL Editor:
   ```sql
   update auth.users
      set raw_app_meta_data = jsonb_set(
            coalesce(raw_app_meta_data, '{}'::jsonb),
            '{role}', '"operator"'
          )
    where email = 'operator@concentrates.local';
   ```
3. Disable email signup (Auth → Providers → Email → toggle off "Enable
   signups"). The app does not expose a registration flow.

## Deploy via Vercel web UI (recommended)

1. **Import the repo**

   Go to <https://vercel.com/new>. Click *Import Git Repository*, select
   GitHub, authorize the Vercel app for the org/account that owns the repo,
   then pick this repository.

2. **Configure** (most fields auto-fill from `vercel.json`)

   | Field            | Value                  |
   | ---------------- | ---------------------- |
   | Framework Preset | Vite (auto-detected)   |
   | Build Command    | `npm run build`        |
   | Output Directory | `dist`                 |
   | Install Command  | `npm install`          |
   | Root Directory   | (leave at repo root)   |

3. **Environment Variables**

   Expand the *Environment Variables* panel and paste these. Scope each one
   to **Production**, **Preview**, **Development** (all three) unless noted.

   | Name                      | Value                                        |
   | ------------------------- | -------------------------------------------- |
   | `VITE_SUPABASE_URL`       | `https://<project-ref>.supabase.co`          |
   | `VITE_SUPABASE_ANON_KEY`  | (copy from Supabase → Project Settings → API → `anon public`) |
   | `VITE_OPERATOR_EMAIL`     | `operator@concentrates.local`                |

   Do NOT add any of:
   - `VITE_USE_MOCK_API` — leave unset; the app's default is real-Supabase
     when this var is missing. (Setting it to `true` in Vercel would ship
     the mock backend to production.)
   - `VITE_MOCK_PASSWORD` — local dev only.
   - `SUPABASE_URL` — local seed-script only.
   - `SUPABASE_SERVICE_ROLE_KEY` — **NEVER**. The service role key bypasses
     RLS and grants god-mode access. It belongs in your local `.env.local`
     and nowhere else.

4. **Deploy**

   Click *Deploy*. First build takes ~1–2 minutes. When it finishes,
   Vercel shows a `*.vercel.app` URL.

## Deploy via Vercel CLI (alternative)

```sh
npm i -g vercel
vercel login                 # opens browser for SSO
cd "<this repo>"
vercel link                  # links the local checkout to a Vercel project
vercel env add VITE_SUPABASE_URL production
vercel env add VITE_SUPABASE_ANON_KEY production
vercel env add VITE_OPERATOR_EMAIL production
# repeat with `preview` and `development` scopes if you want non-prod parity
vercel --prod                # build and deploy to production
```

`vercel.json` in the repo root sets framework / build / install / SPA
rewrites so no further flags are needed.

## Post-deploy verification

In the deployed URL:

1. **Login screen renders** with the `Производство` logo and a single
   password input. (No "мок" badge in the sidebar after login — confirms
   real-Supabase mode is active.)
2. **Login with the operator password** succeeds. Network tab shows a
   request to `*.supabase.co/auth/v1/token?grant_type=password`.
3. **Dashboard loads** with the seeded data: alerts for Фруктоза /
   Грейпфрут (low stock) and Лимонная кислота / Лимон / Манго (expiring).
4. **Recipes screen** shows the B common card and the 2×4 flavor grid.
5. **DevTools → Application → Service Workers** lists the registered SW
   (`sw.js`). DevTools → Network with *Disable cache* off, hard-reload the
   journal — the request to `*.supabase.co/rest/v1/batches?...` shows
   "(disk cache)" → **never**, always a 200/304 from network. (The
   `NetworkOnly` workbox route in `vite.config.js` enforces this.)
6. **Install prompt** (Chrome desktop): browser address bar shows the
   install icon → installable as a standalone PWA.

## Rotating the service-role key

The service role key was shared with Claude during Phase 2.5 setup. It is
not in the repo and not in Vercel, but the conversation transcript
contains it. If transcript persistence is not acceptable for your threat
model, rotate now:

1. Supabase → Project Settings → API → *Reset service role key*.
2. Update your local `.env.local` with the new key.
3. Re-run `npm run db:seed` to confirm the new key works.

The anon key and project URL are browser-safe and don't need rotation.

## If routing breaks (deep link 404)

`vercel.json` already includes the SPA rewrite. If you see a 404 visiting
e.g. `/journal` directly, confirm the file is at the repo root and was
included in the deploy (Vercel logs will show "Detected `vercel.json`").

## Bundle size note

The current production bundle is ~505 KiB (~145 KiB gzipped) because the
Supabase client is included. Vite emits a soft warning above 500 KiB; not
blocking. If it becomes an issue, the cleanest split is to load
`src/api/supabase.js` via a dynamic `import()` from `supabaseApi.js` so the
client lazy-loads on first authenticated request.
