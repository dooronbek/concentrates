// Shift mode state persisted to localStorage so an interrupted shift can be
// resumed (e.g. operator closes tablet, opens it again later).
//
// Shape — kept JSON-serializable on purpose (no Sets, no Maps):
//   {
//     shiftId,           string             generated at start of step 2
//     startedAt,         ISO timestamp
//     step,              1..5
//     planned: [
//       { key, concentrate_type_id, flavor_id, multiplier }
//     ],
//     distribution: {
//       index,           current ingredient pointer in step 3
//       cells: {         per (plannedKey, ingredientId) cell
//         "<plannedKey>__<ingredientId>": { checked, actualAmount? }
//       }
//     },
//     protocols: {       per planned key → array of completed step indices
//       "<plannedKey>": [0, 1, 2]
//     },
//     saves: {           per planned key → result of step-5 attempt
//       "<plannedKey>": { status: 'pending'|'saved'|'failed', batchId?, error? }
//     }
//   }

const KEY = 'concentrate-active-shift';

export function loadShift() {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return null;
    return parsed;
  } catch {
    return null;
  }
}

export function saveShift(state) {
  if (!state) {
    clearShift();
    return;
  }
  try {
    localStorage.setItem(KEY, JSON.stringify(state));
  } catch {
    // Quota or privacy mode — silently ignore. The active session keeps
    // working from in-memory state; only resume after reload would be lost.
  }
}

export function clearShift() {
  localStorage.removeItem(KEY);
}

export function makeShiftId(date = new Date()) {
  const pad = (n) => String(n).padStart(2, '0');
  const d =
    date.getFullYear().toString() +
    pad(date.getMonth() + 1) +
    pad(date.getDate());
  const t =
    pad(date.getHours()) +
    pad(date.getMinutes()) +
    pad(date.getSeconds());
  return `shift-${d}-${t}`;
}
