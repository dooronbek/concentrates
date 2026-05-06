// Russian plural form selection.
//
// Russian has three grammatical number forms keyed off the last digit(s):
//   one  — 1, 21, 31, ... (last digit 1, but not 11)
//   few  — 2-4, 22-24, ... (last digit 2-4, but not 12-14)
//   many — 0, 5-20, 25-30, ...
//
// Pass [one, few, many] in that order. Examples:
//   pluralRu(1,  ['день',  'дня',  'дней']) // 'день'
//   pluralRu(3,  ['день',  'дня',  'дней']) // 'дня'
//   pluralRu(11, ['день',  'дня',  'дней']) // 'дней'
//
// `plural` returns the number prefixed: "5 дней".

export function pluralRu(n, [one, few, many]) {
  const abs = Math.abs(Number(n) | 0);
  const mod10 = abs % 10;
  const mod100 = abs % 100;
  if (mod10 === 1 && mod100 !== 11) return one;
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return few;
  return many;
}

export function plural(n, forms) {
  return `${n} ${pluralRu(n, forms)}`;
}

export const FORMS = {
  days: ['день', 'дня', 'дней'],
  ingredients: ['ингредиент', 'ингредиента', 'ингредиентов'],
  batches: ['партия', 'партии', 'партий'],
  items: ['позиция', 'позиции', 'позиций'],
  changes: ['изменение', 'изменения', 'изменений'],
  flavors: ['вкус', 'вкуса', 'вкусов'],
};
