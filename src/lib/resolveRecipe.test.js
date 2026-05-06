import { describe, expect, it } from 'vitest';
import { resolveRecipe, variantOverrideCount } from './resolveRecipe.js';

const ingredients = [
  { id: 'maltodex', name_ru: 'Мальтодекстрин', unit: 'г' },
  { id: 'salt', name_ru: 'Цитрат натрия', unit: 'г' },
  { id: 'vit-c', name_ru: 'Витамин C', unit: 'г' },
  { id: 'lemon-oil', name_ru: 'Масло лимона', unit: 'мл' },
  { id: 'orange-oil', name_ru: 'Масло апельсина', unit: 'мл' },
];

const concentrateB = {
  id: 'concentrate_b',
  name_ru: 'Концентрат B',
  is_flavor_specific: false,
  base_composition: [
    { ingredient_id: 'maltodex', amount: 200, unit: 'г' },
    { ingredient_id: 'salt', amount: 50, unit: 'г' },
  ],
  protocol_steps: ['Шаг 1', 'Шаг 2'],
};

const concentrateA = {
  id: 'concentrate_a',
  name_ru: 'Концентрат A',
  is_flavor_specific: true,
  base_composition: [
    { ingredient_id: 'maltodex', amount: 800, unit: 'г' },
    { ingredient_id: 'salt', amount: 50, unit: 'г' },
    { ingredient_id: 'vit-c', amount: 30, unit: 'г' },
  ],
  protocol_steps: ['Смешать сухое', 'Упаковать'],
};

const lemon = { id: 'lemon', name_ru: 'Лимон' };
const orange = { id: 'orange', name_ru: 'Апельсин' };

describe('resolveRecipe', () => {
  it('returns base unchanged for a flavor-agnostic concentrate type', () => {
    const result = resolveRecipe({ concentrateType: concentrateB, ingredients });
    expect(result.composition).toEqual([
      { ingredient_id: 'maltodex', name_ru: 'Мальтодекстрин', amount: 200, unit: 'г' },
      { ingredient_id: 'salt', name_ru: 'Цитрат натрия', amount: 50, unit: 'г' },
    ]);
    expect(result.protocol).toEqual(['Шаг 1', 'Шаг 2']);
    expect(result.warnings).toEqual([]);
  });

  it('flavor-specific type with empty overrides returns the base composition', () => {
    const variant = {
      overrides: { add: [], modify: [], remove: [] },
      protocol_addendum: [],
    };
    const result = resolveRecipe({
      concentrateType: concentrateA,
      flavor: lemon,
      variant,
      ingredients,
    });
    expect(result.composition.map((c) => c.ingredient_id)).toEqual([
      'maltodex',
      'salt',
      'vit-c',
    ]);
    expect(result.composition.find((c) => c.ingredient_id === 'salt').amount).toBe(50);
    expect(result.protocol).toEqual(['Смешать сухое', 'Упаковать']);
    expect(result.warnings).toEqual([]);
  });

  it('add appends a new ingredient to the composition', () => {
    const variant = {
      overrides: {
        add: [{ ingredient_id: 'lemon-oil', amount: 25, unit: 'мл' }],
        modify: [],
        remove: [],
      },
    };
    const result = resolveRecipe({
      concentrateType: concentrateA,
      flavor: lemon,
      variant,
      ingredients,
    });
    expect(result.composition).toHaveLength(4);
    expect(result.composition.at(-1)).toEqual({
      ingredient_id: 'lemon-oil',
      name_ru: 'Масло лимона',
      amount: 25,
      unit: 'мл',
    });
    expect(result.warnings).toEqual([]);
  });

  it('modify updates the amount of an existing ingredient', () => {
    const variant = {
      overrides: {
        add: [],
        modify: [{ ingredient_id: 'salt', amount: 100, unit: 'г' }],
        remove: [],
      },
    };
    const result = resolveRecipe({
      concentrateType: concentrateA,
      flavor: lemon,
      variant,
      ingredients,
    });
    const salt = result.composition.find((c) => c.ingredient_id === 'salt');
    expect(salt.amount).toBe(100);
    // No new entries; modify only mutates the existing row.
    expect(result.composition).toHaveLength(3);
    expect(result.warnings).toEqual([]);
  });

  it('remove filters an ingredient out of the composition', () => {
    const variant = {
      overrides: { add: [], modify: [], remove: ['vit-c'] },
    };
    const result = resolveRecipe({
      concentrateType: concentrateA,
      flavor: lemon,
      variant,
      ingredients,
    });
    expect(result.composition.map((c) => c.ingredient_id)).toEqual(['maltodex', 'salt']);
    expect(result.warnings).toEqual([]);
  });

  it('applies add + modify + remove together, plus protocol_addendum', () => {
    const variant = {
      overrides: {
        add: [{ ingredient_id: 'orange-oil', amount: 25, unit: 'мл' }],
        modify: [{ ingredient_id: 'salt', amount: 75, unit: 'г' }],
        remove: ['vit-c'],
      },
      protocol_addendum: ['Добавить масло апельсина последним'],
    };
    const result = resolveRecipe({
      concentrateType: concentrateA,
      flavor: orange,
      variant,
      ingredients,
    });
    expect(result.composition.map((c) => c.ingredient_id)).toEqual([
      'maltodex',
      'salt',
      'orange-oil',
    ]);
    expect(result.composition.find((c) => c.ingredient_id === 'salt').amount).toBe(75);
    expect(result.protocol).toEqual([
      'Смешать сухое',
      'Упаковать',
      'Добавить масло апельсина последним',
    ]);
    expect(result.warnings).toEqual([]);
  });

  it('warns when add references an unknown ingredient', () => {
    const variant = {
      overrides: {
        add: [{ ingredient_id: 'mystery-x', amount: 1, unit: 'г' }],
        modify: [],
        remove: [],
      },
    };
    const result = resolveRecipe({
      concentrateType: concentrateA,
      flavor: lemon,
      variant,
      ingredients,
    });
    expect(result.warnings.some((w) => /mystery-x/.test(w))).toBe(true);
    // Even with an unknown ingredient, we still emit the row — name_ru falls
    // back to the id so the operator can see what was meant.
    expect(result.composition.at(-1)).toEqual({
      ingredient_id: 'mystery-x',
      name_ru: 'mystery-x',
      amount: 1,
      unit: 'г',
    });
  });

  it('warns when modify references an ingredient that is not in the base', () => {
    const variant = {
      overrides: {
        add: [],
        modify: [{ ingredient_id: 'lemon-oil', amount: 50, unit: 'мл' }],
        remove: [],
      },
    };
    const result = resolveRecipe({
      concentrateType: concentrateA,
      flavor: lemon,
      variant,
      ingredients,
    });
    expect(result.warnings.some((w) => /lemon-oil/.test(w))).toBe(true);
    // No mutation happens — the base is unchanged.
    expect(result.composition.find((c) => c.ingredient_id === 'lemon-oil')).toBeUndefined();
  });

  it('warns when remove references an ingredient that is not in the base', () => {
    const variant = {
      overrides: { add: [], modify: [], remove: ['orange-oil'] },
    };
    const result = resolveRecipe({
      concentrateType: concentrateA,
      flavor: lemon,
      variant,
      ingredients,
    });
    expect(result.warnings.some((w) => /orange-oil/.test(w))).toBe(true);
    // Base composition is preserved — there's nothing to remove.
    expect(result.composition).toHaveLength(3);
  });

  it('treats variant with missing or null overrides as base (no crash)', () => {
    // A recipe_variants row that was inserted without an explicit overrides
    // value would arrive here as either an object missing the field
    // entirely or one with overrides: null. Both must resolve to the base
    // composition with no warnings — the resolver is permissive so the UI
    // can render without throwing.
    const variantNoField = {
      id: 'concentrate_a__lemon',
      concentrate_type_id: 'concentrate_a',
      flavor_id: 'lemon',
      protocol_addendum: [],
    };
    const variantNullOverrides = {
      ...variantNoField,
      overrides: null,
    };

    for (const variant of [variantNoField, variantNullOverrides]) {
      const result = resolveRecipe({
        concentrateType: concentrateA,
        flavor: lemon,
        variant,
        ingredients,
      });
      expect(result.composition.map((c) => c.ingredient_id)).toEqual([
        'maltodex',
        'salt',
        'vit-c',
      ]);
      expect(result.protocol).toEqual(['Смешать сухое', 'Упаковать']);
      expect(result.warnings).toEqual([]);
    }
  });

  it('warns when a flavor is passed to a flavor-agnostic concentrate type', () => {
    const result = resolveRecipe({
      concentrateType: concentrateB,
      flavor: lemon,
      ingredients,
    });
    expect(result.warnings.some((w) => /общий рецепт/.test(w))).toBe(true);
    // The flavor is silently ignored — composition is the base.
    expect(result.composition.map((c) => c.ingredient_id)).toEqual(['maltodex', 'salt']);
  });
});

describe('variantOverrideCount', () => {
  it('returns 0 for missing or empty overrides', () => {
    expect(variantOverrideCount(null)).toBe(0);
    expect(variantOverrideCount({})).toBe(0);
    expect(variantOverrideCount({ overrides: { add: [], modify: [], remove: [] } })).toBe(0);
  });

  it('sums add + modify + remove counts', () => {
    expect(
      variantOverrideCount({
        overrides: {
          add: [{ ingredient_id: 'x', amount: 1 }],
          modify: [
            { ingredient_id: 'y', amount: 2 },
            { ingredient_id: 'z', amount: 3 },
          ],
          remove: ['w'],
        },
      })
    ).toBe(4);
  });
});
