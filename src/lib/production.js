// Helpers shared between the single-batch wizard and shift mode.
//
// Pure functions — no I/O, no React. Keeping them here so both wizards stay
// thin and the resolver-permissive / UI-strict contract stays consistent.

import { resolveRecipe } from './resolveRecipe.js';

// Multiply a resolved composition by `multiplier`. Returns a new array with
// each entry's `amount` scaled. Non-finite multipliers fall back to 1.
export function scaleComposition(composition, multiplier) {
  const m = Number(multiplier);
  const factor = Number.isFinite(m) && m > 0 ? m : 1;
  return composition.map((entry) => ({
    ...entry,
    amount: round3(Number(entry.amount) * factor),
  }));
}

// Sum required amounts across multiple compositions (used by shift mode for
// the combined stock check). Same-ingredient entries are merged additively;
// units are taken from the first encounter (UI assumes consistent units per
// ingredient — the catalog enforces that).
export function unionCompositions(compositions) {
  const map = new Map();
  for (const comp of compositions) {
    for (const entry of comp) {
      const cur = map.get(entry.ingredient_id);
      if (cur) {
        cur.amount = round3(Number(cur.amount) + Number(entry.amount));
      } else {
        map.set(entry.ingredient_id, { ...entry, amount: Number(entry.amount) });
      }
    }
  }
  return Array.from(map.values());
}

// Compare a required composition against on-hand stock. Returns one row per
// required entry with status: 'ok' | 'short' | 'missing'.
export function checkStock(required, ingredientsById) {
  return required.map((entry) => {
    const ing = ingredientsById.get(entry.ingredient_id);
    if (!ing) {
      return { ...entry, available: 0, status: 'missing', ingredient: null };
    }
    const available = Number(ing.current_stock) || 0;
    const need = Number(entry.amount) || 0;
    return {
      ...entry,
      ingredient: ing,
      available,
      status: available >= need ? 'ok' : 'short',
      shortBy: available >= need ? 0 : round3(need - available),
    };
  });
}

// "Permissive resolver, strict UI" — turn resolver warnings + unknown
// ingredients into a hard block at production time. A fallback-name row
// (where name_ru === ingredient_id) means the catalog is missing the
// reference; we can't deduct stock against nothing.
export function blockingProblems(resolved) {
  const problems = [];
  for (const entry of resolved.composition) {
    if (entry.name_ru === entry.ingredient_id) {
      problems.push(
        `Ингредиент «${entry.ingredient_id}» не найден в справочнике — рецепт нельзя выполнить`
      );
    }
  }
  for (const w of resolved.warnings) {
    problems.push(w);
  }
  return problems;
}

// Convenience: resolve + scale + return everything the stock-check screen
// needs in one call.
export function planProduction({
  concentrateType,
  flavor,
  variant,
  ingredients,
  multiplier,
}) {
  const resolved = resolveRecipe({
    concentrateType,
    flavor,
    variant,
    ingredients,
  });
  const scaled = scaleComposition(resolved.composition, multiplier);
  return {
    composition: scaled,
    protocol: resolved.protocol,
    warnings: resolved.warnings,
  };
}

function round3(n) {
  if (!Number.isFinite(n)) return n;
  return Math.round(n * 1000) / 1000;
}
