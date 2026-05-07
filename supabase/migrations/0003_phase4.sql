-- 0003_phase4.sql — Phase 4 schema additions.
--
-- Three changes:
--   1. batches.actual_ingredients_used jsonb — what was actually used
--      (may differ from recipe targets, e.g. shift-mode overrides). The
--      original ingredients_used keeps the recipe target for intent
--      traceability; stock deduction in create_batch() now happens
--      against actuals when present.
--   2. Ingredient delete guard — BEFORE DELETE trigger that scans the
--      jsonb columns of concentrate_types, recipe_variants, and batches.
--      A reference anywhere blocks the delete with a Russian error
--      listing where it's used. (FK constraints can't reach into jsonb.)
--   3. Auto-create empty recipe_variants when a new flavor is inserted
--      for every is_flavor_specific=true concentrate_type. The check
--      trigger from 0002 still applies — if a future shared type exists,
--      it's correctly skipped by the WHERE clause here.
--
-- Plus a replacement of create_batch() with the actuals-aware signature.

-- ======================================================================
-- 1. batches.actual_ingredients_used
-- ======================================================================

alter table public.batches
  add column if not exists actual_ingredients_used jsonb;

-- ======================================================================
-- 2. Ingredient delete guard
-- ======================================================================

create or replace function public.check_ingredient_deletable()
returns trigger
language plpgsql
as $$
declare
  v_ct_count int;
  v_rv_count int;
  v_b_count  int;
  v_parts    text[] := array[]::text[];
begin
  -- Referenced in any concentrate_type's base_composition?
  select count(*) into v_ct_count
    from public.concentrate_types
    where base_composition @> jsonb_build_array(
      jsonb_build_object('ingredient_id', old.id)
    );

  -- Referenced in any recipe_variant's overrides? Three sub-checks because
  -- add/modify hold objects but remove holds bare ids.
  select count(*) into v_rv_count
    from public.recipe_variants
    where overrides -> 'add' @> jsonb_build_array(
            jsonb_build_object('ingredient_id', old.id)
          )
       or overrides -> 'modify' @> jsonb_build_array(
            jsonb_build_object('ingredient_id', old.id)
          )
       or overrides -> 'remove' ? old.id;

  -- Referenced in any batch's ingredients_used (intent) or
  -- actual_ingredients_used (actuals)?
  select count(*) into v_b_count
    from public.batches
    where ingredients_used @> jsonb_build_array(
            jsonb_build_object('ingredient_id', old.id)
          )
       or coalesce(actual_ingredients_used, '[]'::jsonb) @> jsonb_build_array(
            jsonb_build_object('ingredient_id', old.id)
          );

  if v_ct_count > 0 then v_parts := v_parts || 'базовых рецептах'; end if;
  if v_rv_count > 0 then v_parts := v_parts || 'вариантах рецептов'; end if;
  if v_b_count  > 0 then v_parts := v_parts || 'исторических партиях'; end if;

  if array_length(v_parts, 1) > 0 then
    raise exception 'Ингредиент "%" используется в % — нельзя удалить',
      old.name_ru, array_to_string(v_parts, ', ')
      using errcode = 'foreign_key_violation';
  end if;

  return old;
end;
$$;

drop trigger if exists ingredients_check_deletable on public.ingredients;
create trigger ingredients_check_deletable
  before delete on public.ingredients
  for each row execute function public.check_ingredient_deletable();

-- ======================================================================
-- 3. Auto-create empty recipe_variants for new flavors
-- ======================================================================
--
-- Saves the operator a second click after adding a flavor. Each variant
-- starts with empty overrides; the resolver returns base composition for
-- those (no warnings — empty {} is treated as "no overrides", not as
-- "broken variant"). The check_variant_flavor_specific trigger from 0002
-- still fires here, so flavor-agnostic types are correctly skipped via
-- the WHERE clause rather than via a trigger refusal.

create or replace function public.auto_create_variants_for_flavor()
returns trigger
language plpgsql
as $$
begin
  insert into public.recipe_variants (id, concentrate_type_id, flavor_id)
  select
    ct.id || '__' || new.id,
    ct.id,
    new.id
  from public.concentrate_types ct
  where ct.is_flavor_specific = true
    and not exists (
      select 1 from public.recipe_variants rv
       where rv.concentrate_type_id = ct.id
         and rv.flavor_id = new.id
    );
  return new;
end;
$$;

drop trigger if exists flavors_auto_create_variants on public.flavors;
create trigger flavors_auto_create_variants
  after insert on public.flavors
  for each row execute function public.auto_create_variants_for_flavor();

-- ======================================================================
-- 4. create_batch() — replace with actuals-aware signature
-- ======================================================================
--
-- The new optional parameter p_actual_ingredients_used carries the actually-
-- weighed amounts. If null (single-batch mode without overrides), targets
-- and actuals are identical and we deduct from targets. When set
-- (shift-mode overrides), stock deduction switches to actuals so the
-- inventory matches reality.
--
-- The original 9-arg signature from 0002 is dropped first to avoid
-- function overloading ambiguity.

drop function if exists public.create_batch(
  text, text, text, timestamptz, text, numeric, jsonb, text, text
);

create or replace function public.create_batch(
  p_batch_id                 text,
  p_concentrate_type_id      text,
  p_flavor_id                text,
  p_produced_at              timestamptz,
  p_produced_by              text,
  p_quantity                 numeric,
  p_ingredients_used         jsonb,
  p_notes                    text,
  p_shift_id                 text,
  p_actual_ingredients_used  jsonb default null
)
returns public.batches
language plpgsql
security invoker
as $$
declare
  v_batch              public.batches;
  v_concentrate_name   text;
  v_flavor_name        text;
  v_deduct             jsonb;
  v_used               record;
  v_updated            integer;
begin
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

  -- Stock deduction uses actuals when provided; otherwise targets. The
  -- batch row records both columns so the journal can show planned vs
  -- actual whenever they differ.
  v_deduct := coalesce(p_actual_ingredients_used, p_ingredients_used);

  insert into public.batches (
    batch_id, concentrate_type_id, concentrate_type_name_ru,
    flavor_id, flavor_name_ru,
    produced_at, produced_by, quantity,
    ingredients_used, actual_ingredients_used,
    notes, shift_id, status
  ) values (
    p_batch_id, p_concentrate_type_id, v_concentrate_name,
    p_flavor_id, v_flavor_name,
    p_produced_at, p_produced_by, p_quantity,
    coalesce(p_ingredients_used, '[]'::jsonb),
    p_actual_ingredients_used,
    coalesce(p_notes, ''),
    p_shift_id,
    'completed'
  )
  returning * into v_batch;

  for v_used in
    select
      (elem ->> 'ingredient_id')::text as ingredient_id,
      (elem ->> 'amount')::numeric    as amount
    from jsonb_array_elements(coalesce(v_deduct, '[]'::jsonb)) as elem
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
        raise exception 'Недостаточно ингредиента % для производства партии',
          v_used.ingredient_id
          using errcode = 'check_violation';
      end if;
    end if;
  end loop;

  return v_batch;
end;
$$;

grant execute on function public.create_batch(
  text, text, text, timestamptz, text, numeric, jsonb, text, text, jsonb
) to authenticated;
