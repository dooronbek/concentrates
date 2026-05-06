-- Phase 2.5: initial Supabase schema.
--
-- Mirrors the in-memory mock model from Phase 1/2:
--   - ingredients     text PK ("ing-001" style; UI-stable)
--   - recipes         text PK ("concentrate_a", "concentrate_b", "emulsion")
--   - batches         text PK ("concentrate_a-20260505-01"; will extend in
--                     Phase 3 to include a flavor segment, e.g.
--                     "concentrate_a-lemon-20260505-01" — id generation
--                     lives client-side and is already flavor-aware)
--   - settings        key/value rows (jsonb), one row per setting
--
-- RLS: enabled on all four tables. Today every authenticated user has full
-- read/write access ("operator" role). Phase 3+ will tighten with role-
-- based policies once "manager" exists.

create extension if not exists "pgcrypto";

-- ingredients ---------------------------------------------------------

create table public.ingredients (
  id              text primary key,
  name_ru         text not null,
  unit            text not null,
  current_stock   numeric(12, 3) not null default 0,
  min_threshold   numeric(12, 3) not null default 0,
  lot_number      text,
  expiry_date     date,
  supplier        text,
  notes           text not null default '',
  updated_at      timestamptz not null default now()
);

create index ingredients_expiry_date_idx on public.ingredients (expiry_date);

-- recipes -------------------------------------------------------------

create table public.recipes (
  id               text primary key,
  name_ru          text not null,
  output_unit      text not null,
  output_quantity  numeric(12, 3) not null default 1,
  composition      jsonb not null default '[]'::jsonb,   -- [{ ingredient_id, amount, unit }]
  protocol_steps   jsonb not null default '[]'::jsonb,   -- ["step 1 text", ...]
  updated_at       timestamptz not null default now()
);

-- batches -------------------------------------------------------------

create table public.batches (
  batch_id          text primary key,
  recipe_id         text not null references public.recipes(id) on delete restrict,
  recipe_name_ru    text not null,                       -- snapshot at production time
  produced_at       timestamptz not null,
  produced_by       text not null,
  quantity          numeric(12, 3) not null default 1,
  ingredients_used  jsonb not null default '[]'::jsonb,  -- [{ ingredient_id, name_ru, amount, unit, lot_number }]
  notes             text not null default '',
  status            text not null default 'completed'
                    check (status in ('completed', 'cancelled'))
);

create index batches_produced_at_desc_idx on public.batches (produced_at desc);
create index batches_recipe_id_idx on public.batches (recipe_id);

-- settings (key-value) ------------------------------------------------

create table public.settings (
  key         text primary key,
  value       jsonb not null,
  updated_at  timestamptz not null default now()
);

-- updated_at triggers -------------------------------------------------

create or replace function public.touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger ingredients_updated_at
  before update on public.ingredients
  for each row execute function public.touch_updated_at();

create trigger recipes_updated_at
  before update on public.recipes
  for each row execute function public.touch_updated_at();

create trigger settings_updated_at
  before update on public.settings
  for each row execute function public.touch_updated_at();

-- RLS -----------------------------------------------------------------
-- Single role today; all signed-in users can read and write everything.
-- When the manager role lands in Phase 3+, swap these `using (true)` policies
-- for ones that read auth.jwt() ->> 'app_metadata' ->> 'role'.

alter table public.ingredients enable row level security;
alter table public.recipes     enable row level security;
alter table public.batches     enable row level security;
alter table public.settings    enable row level security;

create policy "ingredients: authenticated full access"
  on public.ingredients for all
  to authenticated
  using (true) with check (true);

create policy "recipes: authenticated full access"
  on public.recipes for all
  to authenticated
  using (true) with check (true);

create policy "batches: authenticated full access"
  on public.batches for all
  to authenticated
  using (true) with check (true);

create policy "settings: authenticated full access"
  on public.settings for all
  to authenticated
  using (true) with check (true);
