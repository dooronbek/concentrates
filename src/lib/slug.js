// Slug helper. Used to auto-generate ids from Russian names — e.g.
// "Декстроза (глюкоза)" → "dekstroza-glyukoza".
//
// `uniqueSlug` accepts a list of existing ids and appends a counter on
// collision so we never write a duplicate primary key.

const CYRILLIC = {
  а: 'a', б: 'b', в: 'v', г: 'g', д: 'd', е: 'e', ё: 'yo',
  ж: 'zh', з: 'z', и: 'i', й: 'y', к: 'k', л: 'l', м: 'm',
  н: 'n', о: 'o', п: 'p', р: 'r', с: 's', т: 't', у: 'u',
  ф: 'f', х: 'h', ц: 'ts', ч: 'ch', ш: 'sh', щ: 'sch',
  ъ: '', ы: 'y', ь: '', э: 'e', ю: 'yu', я: 'ya',
};

export function slugify(input) {
  if (typeof input !== 'string') return '';
  let out = '';
  for (const ch of input.toLowerCase()) {
    if (CYRILLIC[ch] !== undefined) out += CYRILLIC[ch];
    else if (/[a-z0-9]/.test(ch)) out += ch;
    else out += '-';
  }
  return out
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
}

export function uniqueSlug(input, existingIds, prefix = '') {
  const base = (prefix ? prefix + '-' : '') + (slugify(input) || 'item');
  if (!existingIds.includes(base)) return base;
  let n = 2;
  while (existingIds.includes(`${base}-${n}`)) n += 1;
  return `${base}-${n}`;
}
