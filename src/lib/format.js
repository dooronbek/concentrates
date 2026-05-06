import { format, isToday, isYesterday, parseISO } from 'date-fns';
import { ru } from 'date-fns/locale';

function toDate(value) {
  if (!value) return null;
  if (value instanceof Date) return value;
  if (typeof value === 'string') return parseISO(value);
  return new Date(value);
}

export function formatDate(value) {
  const d = toDate(value);
  if (!d || isNaN(d.getTime())) return '—';
  return format(d, 'd MMM yyyy', { locale: ru });
}

export function formatDateTime(value) {
  const d = toDate(value);
  if (!d || isNaN(d.getTime())) return '—';
  return format(d, 'd MMM yyyy, HH:mm', { locale: ru });
}

export function formatRelativeDay(value) {
  const d = toDate(value);
  if (!d || isNaN(d.getTime())) return '—';
  if (isToday(d)) return 'сегодня';
  if (isYesterday(d)) return 'вчера';
  return formatDate(d);
}

// Format a number with up to 2 fractional digits, using a regular space as the
// thousands separator. "1.234" → "1,23", "1234" → "1 234". Russian locale uses
// comma as the decimal separator.
export function formatAmount(n) {
  const num = Number(n);
  if (!Number.isFinite(num)) return String(n ?? '');
  const fixed = Number.isInteger(num) ? String(num) : num.toFixed(2).replace(/\.?0+$/, '');
  const [intPart, fracPart] = fixed.split('.');
  const grouped = intPart.replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
  return fracPart ? `${grouped},${fracPart}` : grouped;
}

export function formatAmountUnit(amount, unit) {
  return `${formatAmount(amount)} ${unit ?? ''}`.trim();
}
