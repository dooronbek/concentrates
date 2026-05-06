// Seed the live Supabase database with the canonical mock data.
//
// Run: `npm run db:seed`
//
// Reads SUPABASE_URL (or VITE_SUPABASE_URL) and SUPABASE_SERVICE_ROLE_KEY from
// .env.local. Idempotent — uses upsert, so re-running overwrites with the
// canonical seed values.

import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createClient } from '@supabase/supabase-js';

import { seedData } from '../src/api/seedData.js';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '..');

// Tiny .env.local loader (avoids the Node 20.6+ --env-file flag).
try {
  const text = readFileSync(resolve(root, '.env.local'), 'utf8');
  for (const line of text.split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/i);
    if (!m) continue;
    const [, key, raw] = m;
    if (process.env[key]) continue;
    process.env[key] = raw.replace(/^"(.*)"$/, '$1').replace(/^'(.*)'$/, '$1');
  }
} catch {
  // No .env.local — rely on the ambient environment.
}

const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !serviceKey) {
  console.error(
    'Missing SUPABASE_URL (or VITE_SUPABASE_URL) and/or SUPABASE_SERVICE_ROLE_KEY.\n' +
      'Add them to .env.local and re-run.'
  );
  process.exit(1);
}

const supabase = createClient(url, serviceKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});

async function upsert(table, rows, conflictKey) {
  const { error } = await supabase.from(table).upsert(rows, { onConflict: conflictKey });
  if (error) {
    console.error(`Failed to seed ${table}:`, error.message);
    process.exit(1);
  }
  console.log(`✓ ${table}: ${rows.length} row(s)`);
}

console.log(`Seeding ${url}…`);

// Insert order matters for FKs:
//   ingredients, flavors, concentrate_types  (parents)
//   recipe_variants                          (refs concentrate_types + flavors)
//   batches                                  (refs concentrate_types + flavors)
//   settings                                 (independent)

await upsert('ingredients',       seedData.ingredients,       'id');
await upsert('flavors',           seedData.flavors,           'id');
await upsert('concentrate_types', seedData.concentrate_types, 'id');
await upsert('recipe_variants',   seedData.recipe_variants,   'id');
await upsert('batches',           seedData.batches,           'batch_id');

const settings = Object.entries(seedData.settings).map(([key, value]) => ({ key, value }));
await upsert('settings', settings, 'key');

console.log('Done.');
