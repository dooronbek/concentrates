-- 0002_flavors.sql — Phase 3 schema.
--
-- Replaces the simple `recipes` table with a richer model:
--   - flavors            (catalog of available flavors)
--   - concentrate_types  (3 fixed types: A, B, emulsion; B is shared)
--   - recipe_variants    (per-flavor overrides for flavor-specific types)
--
-- Updates `batches` to track flavor + shift, and renames the recipe-pointer
-- column to match the new model. Adds an atomic `create_batch()` RPC so
-- Production (Phase 4+) can write a batch and deduct stock in a single
-- transaction.
--
-- ----------------------------------------------------------------------
-- Migration path notes
-- ----------------------------------------------------------------------
-- (a) Inferred mapping rule: when copying rows from the old `recipes` table
--     into `concentrate_types`, we set
--          is_flavor_specific := (id <> 'concentrate_b')
--     because at the time of writing, only Concentrate B is shared across
--     all flavors. Concentrate A and Liquid Emulsion are flavor-specific.
--
-- (b) Why this is safe today: the only data in `recipes` is seed data we
--     authored ourselves (the fixed three IDs concentrate_a, concentrate_b,
--     emulsion). The id-based heuristic above happens to be correct for
--     those rows.
--
-- (c) What would change for live data: a real-world migration would not
--     rely on an id-based heuristic. Each historical recipe would need an
--     explicit is_flavor_specific decision (probably from a manually
--     populated migration table or a domain expert review). The
--     batches.recipe_id → concentrate_type_id rename would also need a
--     longer multi-step deployment with both column names coexisting
--     briefly so reads from old code don't break during rollout.
-- ======================================================================

-- ======================================================================
-- flavors
-- ======================================================================

create table if not exists public.flavors (
  id          text primary key,
  name_ru     text not null,
  color_hex   text,
  active      boolean not null default true,
  notes       text not null default '',
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

drop trigger if exists flavors_updated_at on public.flavors;
create trigger flavors_updated_at
  before update on public.flavors
  for each row execute function public.touch_updated_at();

alter table public.flavors enable row level security;

drop policy if exists "flavors: authenticated full access" on public.flavors;
create policy "flavors: authenticated full access"
  on public.flavors for all
  to authenticated
  using (true) with check (true);

-- ======================================================================
-- concentrate_types
-- ======================================================================

create table if not exists public.concentrate_types (
  id                   text primary key,
  name_ru              text not null,
  output_unit          text not null,
  output_quantity      numeric(12, 3) not null default 1,
  is_flavor_specific   boolean not null,
  protocol_steps       jsonb not null default '[]'::jsonb,
  base_composition     jsonb not null default '[]'::jsonb,
  notes                text not null default '',
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now()
);

drop trigger if exists concentrate_types_updated_at on public.concentrate_types;
create trigger concentrate_types_updated_at
  before update on public.concentrate_types
  for each row execute function public.touch_updated_at();

alter table public.concentrate_types enable row level security;

drop policy if exists "concentrate_types: authenticated full access" on public.concentrate_types;
create policy "concentrate_types: authenticated full access"
  on public.concentrate_types for all
  to authenticated
  using (true) with check (true);

-- Carry over existing recipes data, if any. See migration-path notes (a–c).
do $$
begin
  if exists (
    select 1 from information_schema.tables
    where table_schema = 'public' and table_name = 'recipes'
  ) then
    insert into public.concentrate_types
      (id, name_ru, output_unit, output_quantity, is_flavor_specific,
       protocol_steps, base_composition)
    select
      r.id,
      r.name_ru,
      r.output_unit,
      r.output_quantity,
      (r.id <> 'concentrate_b'),
      r.protocol_steps,
      r.composition
    from public.recipes r
    on conflict (id) do nothing;
  end if;
end
$$;

-- ======================================================================
-- recipe_variants
-- ======================================================================

create table if not exists public.recipe_variants (
  id                     text primary key,
  concentrate_type_id    text not null references public.concentrate_types(id) on delete cascade,
  flavor_id              text not null references public.flavors(id) on delete cascade,
  overrides              jsonb not null default '{"add":[],"modify":[],"remove":[]}'::jsonb,
  protocol_addendum      jsonb not null default '[]'::jsonb,
  notes                  text not null default '',
  created_at             timestamptz not null default now(),
  updated_at             timestamptz not null default now(),
  unique (concentrate_type_id, flavor_id)
);

drop trigger if exists recipe_variants_updated_at on public.recipe_variants;
create trigger recipe_variants_updated_at
  before update on public.recipe_variants
  for each row execute function public.touch_updated_at();

alter table public.recipe_variants enable row level security;

drop policy if exists "recipe_variants: authenticated full access" on public.recipe_variants;
create policy "recipe_variants: authenticated full access"
  on public.recipe_variants for all
  to authenticated
  using (true) with check (true);

-- Cross-table guard: a variant only makes sense if its concentrate_type is
-- flavor-specific. Concentrate B (and any future shared recipe) must never
-- have rows in recipe_variants. CHECK constraints can't reference another
-- table, so this is enforced as a row-level trigger that raises a Russian
-- error message naming the offending concentrate.
create or replace function public.check_variant_flavor_specific()
returns trigger
language plpgsql
as $$
declare
  v_is_flavor_specific boolean;
  v_name_ru            text;
begin
  select is_flavor_specific, name_ru
    into v_is_flavor_specific, v_name_ru
    from public.concentrate_types
    where id = new.concentrate_type_id;

  if not found then
    raise exception 'Концентрат с id % не существует', new.concentrate_type_id
      using errcode = 'foreign_key_violation';
  end if;

  if v_is_flavor_specific is false then
    raise exception
      'Концентрат "%" не может иметь вариантов по вкусам — это общий рецепт',
      v_name_ru
      using errcode = 'check_violation';
  end if;

  return new;
end;
$$;

drop trigger if exists recipe_variants_flavor_specific_check on public.recipe_variants;
create trigger recipe_variants_flavor_specific_check
  before insert or update on public.recipe_variants
  for each row execute function public.check_variant_flavor_specific();

-- ======================================================================
-- batches: rename recipe_id → concentrate_type_id, extend with flavor/shift
-- ======================================================================

-- Drop the old FK before renaming so we can repoint at concentrate_types.
alter table public.batches
  drop constraint if exists batches_recipe_id_fkey;

-- Rename the legacy columns. Wrap in DO blocks so the migration is
-- idempotent — re-running won't fail if the rename already happened.
do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public'
      and table_name   = 'batches'
      and column_name  = 'recipe_id'
  ) then
    alter table public.batches rename column recipe_id to concentrate_type_id;
  end if;

  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public'
      and table_name   = 'batches'
      and column_name  = 'recipe_name_ru'
  ) then
    alter table public.batches rename column recipe_name_ru to concentrate_type_name_ru;
  end if;
end
$$;

-- New columns
alter table public.batches
  add column if not exists flavor_id      text,
  add column if not exists flavor_name_ru text,
  add column if not exists shift_id       text;

-- Old indexes off the renamed column
drop index if exists public.batches_recipe_id_idx;

-- New FKs (idempotent)
alter table public.batches
  drop constraint if exists batches_concentrate_type_id_fkey;
alter table public.batches
  add  constraint batches_concentrate_type_id_fkey
       foreign key (concentrate_type_id)
       references public.concentrate_types(id)
       on delete restrict;

alter table public.batches
  drop constraint if exists batches_flavor_id_fkey;
alter table public.batches
  add  constraint batches_flavor_id_fkey
       foreign key (flavor_id)
       references public.flavors(id)
       on delete restrict;

create index if not exists batches_concentrate_type_id_idx on public.batches (concentrate_type_id);
create index if not exists batches_flavor_id_idx          on public.batches (flavor_id);
create index if not exists batches_shift_id_idx           on public.batches (shift_id);

-- ======================================================================
-- Drop the old recipes table now that everything points at concentrate_types
-- ======================================================================

drop table if exists public.recipes;

-- ======================================================================
-- create_batch() — atomic insert + stock deduction
-- ======================================================================
--
-- Wraps the two operations Production needs into a single transaction:
--   1. INSERT a row into batches (denormalizing concentrate type + flavor
--      names so the journal is robust against later renames).
--   2. For each entry in p_ingredients_used, decrement that ingredient's
--      current_stock. The WHERE clause guards against negative stock; if
--      any decrement affects 0 rows the function raises and the entire
--      transaction (including the batch insert) rolls back.
--
-- security invoker — RLS still applies as the calling user, so when the
-- manager-vs-operator role split lands, no rewrite needed here.

create or replace function public.create_batch(
  p_batch_id              text,
  p_concentrate_type_id   text,
  p_flavor_id             text,
  p_produced_at           timestamptz,
  p_produced_by           text,
  p_quantity              numeric,
  p_ingredients_used      jsonb,
  p_notes                 text,
  p_shift_id              text
)
returns public.batches
language plpgsql
security invoker
as $$
declare
  v_batch              public.batches;
  v_concentrate_name   text;
  v_flavor_name        text;
  v_used               record;
  v_updated            integer;
begin
  -- Look up display names for denormalized snapshots on the batch row.
  select name_ru into v_concentrate_name
    from public.concentrate_types
    where id = p_concentrate_type_id;
  if not found then
    raise exception 'Концентрат с id % не найден', p_concentrate_type_id;
  end if;

  if p_flavor_id is not null then
    select name_ru into v_flavor_name
      from public.flavors
      where id = p_flavor_id;
    if not found then
      raise exception 'Вкус с id % не найден', p_flavor_id;
    end if;
  end if;

  insert into public.batches (
    batch_id, concentrate_type_id, concentrate_type_name_ru,
    flavor_id, flavor_name_ru,
    produced_at, produced_by, quantity,
    ingredients_used, notes, shift_id, status
  ) values (
    p_batch_id, p_concentrate_type_id, v_concentrate_name,
    p_flavor_id, v_flavor_name,
    p_produced_at, p_produced_by, p_quantity,
    coalesce(p_ingredients_used, '[]'::jsonb),
    coalesce(p_notes, ''),
    p_shift_id,
    'completed'
  )
  returning * into v_batch;

  -- Deduct stock per ingredient. The WHERE clause's stock check guarantees
  -- we never write a negative value; a missing row or insufficient stock
  -- both result in row_count = 0, which we map to a clear exception.
  for v_used in
    select
      (elem ->> 'ingredient_id')::text as ingredient_id,
      (elem ->> 'amount')::numeric    as amount
    from jsonb_array_elements(coalesce(p_ingredients_used, '[]'::jsonb)) as elem
  loop
    update public.ingredients
       set current_stock = current_stock - v_used.amount
     where id = v_used.ingredient_id
       and current_stock >= v_used.amount;

    get diagnostics v_updated = row_count;

    if v_updated = 0 then
      if not exists (
        select 1 from public.ingredients where id = v_used.ingredient_id
      ) then
        raise exception 'Ингредиент с id % не найден', v_used.ingredient_id
          using errcode = 'foreign_key_violation';
      else
        raise exception 'Недостаточно ингредиента % для производства партии', v_used.ingredient_id
          using errcode = 'check_violation';
      end if;
    end if;
  end loop;

  return v_batch;
end;
$$;

grant execute on function public.create_batch(
  text, text, text, timestamptz, text, numeric, jsonb, text, text
) to authenticated;
