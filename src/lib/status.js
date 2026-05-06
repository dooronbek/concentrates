// Status calculations for warehouse alerts.
//
// `daysUntil(iso)` rounds to whole days at local midnight, so an item with
// expiry 2026-05-25 viewed on 2026-05-06 returns 19, regardless of the clock.

export function daysUntil(iso) {
  if (!iso) return null;
  const target = new Date(iso);
  if (isNaN(target.getTime())) return null;
  target.setHours(0, 0, 0, 0);
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  return Math.round((target - now) / 86400000);
}

export function expiryStatus(iso, warningDays = 30) {
  if (!iso) return { kind: 'unknown', days: null };
  const days = daysUntil(iso);
  if (days === null) return { kind: 'unknown', days: null };
  if (days < 0) return { kind: 'expired', days };
  if (days <= warningDays) return { kind: 'expiring', days };
  return { kind: 'fresh', days };
}

export function stockStatus({ current_stock, min_threshold }) {
  const cur = Number(current_stock) || 0;
  const min = Number(min_threshold) || 0;
  if (min <= 0) return 'ok';
  if (cur <= min) return 'low';
  if (cur <= min * 1.5) return 'warn';
  return 'ok';
}

// Combine an ingredient's stock + expiry into a single severity bucket.
//   critical → low stock OR expired
//   warning  → expiring within warningDays
//   ok       → no problems
export function ingredientSeverity(ingredient, warningDays = 30) {
  const stock = stockStatus(ingredient);
  const expiry = expiryStatus(ingredient.expiry_date, warningDays);
  if (stock === 'low' || expiry.kind === 'expired') return 'critical';
  if (expiry.kind === 'expiring') return 'warning';
  return 'ok';
}
