// Resolves a (concentrate type, flavor?) pair into a concrete composition
// and protocol ready for production. Pure function — no I/O, no state.
//
// Inputs:
//   concentrateType  { id, name_ru, is_flavor_specific, base_composition,
//                      protocol_steps }
//   flavor           { id, name_ru } | null
//   variant          { overrides: { add, modify, remove }, protocol_addendum }
//                    | null  (only meaningful when concentrateType is
//                              flavor_specific and flavor is set)
//   ingredients      array of { id, name_ru, unit }  — used to denormalize
//                    name_ru and to validate that overrides reference real
//                    ingredients
//
// Output:
//   { composition, protocol, warnings }
//   composition  array of { ingredient_id, name_ru, amount, unit }
//   protocol     array of strings (steps in order)
//   warnings     array of human-readable Russian warning strings; empty if
//                everything resolved cleanly
//
// Override semantics on a flavor-specific type:
//   1. Start from base_composition.
//   2. Filter out anything in overrides.remove (by ingredient_id).
//   3. Apply overrides.modify (replace amount/unit on ingredients still
//      present after step 2).
//   4. Append overrides.add at the end.
//   Protocol = base.protocol_steps then variant.protocol_addendum.

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function buildIngredientLookup(ingredients) {
  return new Map(asArray(ingredients).map((ing) => [ing.id, ing]));
}

function denormalize(entry, ingredientById) {
  const ing = ingredientById.get(entry.ingredient_id);
  return {
    ingredient_id: entry.ingredient_id,
    name_ru: ing?.name_ru ?? entry.ingredient_id,
    amount: entry.amount,
    unit: entry.unit ?? ing?.unit ?? '',
  };
}

export function resolveRecipe({ concentrateType, flavor, variant, ingredients }) {
  const warnings = [];
  const ingredientById = buildIngredientLookup(ingredients);

  if (!concentrateType) {
    return {
      composition: [],
      protocol: [],
      warnings: ['Концентрат не указан'],
    };
  }

  const baseComposition = asArray(concentrateType.base_composition);
  const baseProtocol = asArray(concentrateType.protocol_steps);

  // Flavor-agnostic: ignore the flavor argument entirely (warn if one was
  // passed, since that's almost always a caller bug).
  if (concentrateType.is_flavor_specific === false) {
    if (flavor) {
      warnings.push(
        `Концентрат «${concentrateType.name_ru}» — общий рецепт; выбранный вкус «${flavor.name_ru}» не применяется`
      );
    }
    return {
      composition: baseComposition.map((entry) => denormalize(entry, ingredientById)),
      protocol: [...baseProtocol],
      warnings,
    };
  }

  // Flavor-specific from here on.

  if (!flavor) {
    return {
      composition: baseComposition.map((entry) => denormalize(entry, ingredientById)),
      protocol: [...baseProtocol],
      warnings: [
        `Для «${concentrateType.name_ru}» не выбран вкус — показан только базовый рецепт`,
      ],
    };
  }

  if (!variant) {
    return {
      composition: baseComposition.map((entry) => denormalize(entry, ingredientById)),
      protocol: [...baseProtocol],
      warnings: [
        `Вариант «${concentrateType.name_ru}» + «${flavor.name_ru}» не настроен — показан только базовый рецепт`,
      ],
    };
  }

  const overrides = variant.overrides ?? {};
  const adds = asArray(overrides.add);
  const modifies = asArray(overrides.modify);
  const removes = asArray(overrides.remove);
  const removeIds = new Set(removes);
  const modifyById = new Map(modifies.map((m) => [m.ingredient_id, m]));

  const baseIds = new Set(baseComposition.map((b) => b.ingredient_id));

  // Validate references and surface warnings (non-fatal).
  for (const id of removes) {
    if (!baseIds.has(id)) {
      warnings.push(
        `remove: ингредиент «${id}» отсутствует в базовом рецепте — пропуск не имеет эффекта`
      );
    }
    if (!ingredientById.has(id)) {
      warnings.push(`remove: ингредиент «${id}» не найден в справочнике`);
    }
  }
  for (const m of modifies) {
    if (!baseIds.has(m.ingredient_id)) {
      warnings.push(
        `modify: ингредиент «${m.ingredient_id}» отсутствует в базовом рецепте — изменение не применится`
      );
    }
    if (!ingredientById.has(m.ingredient_id)) {
      warnings.push(`modify: ингредиент «${m.ingredient_id}» не найден в справочнике`);
    }
  }
  for (const a of adds) {
    if (!ingredientById.has(a.ingredient_id)) {
      warnings.push(`add: ингредиент «${a.ingredient_id}» не найден в справочнике`);
    }
  }

  // Apply: filter removes, apply modifies on remaining, then append adds.
  const composition = [];
  for (const entry of baseComposition) {
    if (removeIds.has(entry.ingredient_id)) continue;
    const mod = modifyById.get(entry.ingredient_id);
    composition.push(
      denormalize(
        mod ? { ...entry, amount: mod.amount, unit: mod.unit ?? entry.unit } : entry,
        ingredientById
      )
    );
  }
  for (const a of adds) {
    composition.push(denormalize(a, ingredientById));
  }

  const protocol = [...baseProtocol, ...asArray(variant.protocol_addendum)];

  return { composition, protocol, warnings };
}

// Small helper used by the Recipes screen to render variant-status badges
// like "База + 2 изменения" / "Только база".
export function variantOverrideCount(variant) {
  if (!variant?.overrides) return 0;
  const o = variant.overrides;
  return asArray(o.add).length + asArray(o.modify).length + asArray(o.remove).length;
}
