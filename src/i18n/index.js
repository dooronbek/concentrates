import ru from './ru.json';

const dictionary = ru;

export function t(key, params) {
  const segments = key.split('.');
  let value = dictionary;
  for (const segment of segments) {
    value = value?.[segment];
    if (value === undefined) return key;
  }
  if (typeof value !== 'string') return key;
  if (!params) return value;
  return value.replace(/\{\{(\w+)\}\}/g, (_, name) =>
    params[name] !== undefined ? String(params[name]) : ''
  );
}

export default dictionary;
