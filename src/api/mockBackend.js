// Mock backend used when VITE_USE_MOCK_API=true.
//
// Path-based router that mockApi.js wraps. Data is persisted in localStorage
// so reloads keep state; call _resetMockDb() from devtools to wipe and
// reseed.
//
// Auth: every request except /auth/login and /ping requires
// `Authorization: Bearer <token>`. The mock issues tokens shaped like real
// JWTs (`header.payload.signature`) so client-side decoding works against
// either backend.
//
// Note: when VITE_USE_MOCK_API=false, the app talks to Supabase directly via
// supabaseApi.js — this file is then dead code (tree-shaken in prod builds).

import { seedData } from './seedData.js';

// Bumped each time the on-disk shape changes incompatibly. Old data under
// previous keys is silently abandoned and the seed is loaded fresh.
const STORAGE_KEY = 'concentrate-mock-db-v2';
const LATENCY_MS = 180;

const MOCK_PASSWORD = import.meta.env.VITE_MOCK_PASSWORD || 'test123';
const TOKEN_TTL_SECONDS = 60 * 60 * 24 * 30; // 30 days

function loadDb() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return JSON.parse(raw);
  } catch (err) {
    console.warn('[mock] DB read failed, reseeding', err);
  }
  const fresh = structuredClone(seedData);
  localStorage.setItem(STORAGE_KEY, JSON.stringify(fresh));
  return fresh;
}

function saveDb(db) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(db));
}

function uuid() {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID();
  return 'id-' + Math.random().toString(36).slice(2, 10);
}

function nowIso() {
  return new Date().toISOString();
}

function delay(ms = LATENCY_MS) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// Generates a human-readable batch_id like
//   concentrate_a-lemon-20260505-01    (with flavor)
//   concentrate_b-20260505-01          (flavor-agnostic)
// flavorId is optional — falsy means the batch isn't flavor-bound.
function makeBatchId({ concentrateTypeId, flavorId, dateIso, sequence }) {
  const ymd = dateIso.slice(0, 10).replaceAll('-', '');
  const seq = String(sequence).padStart(2, '0');
  return flavorId
    ? `${concentrateTypeId}-${flavorId}-${ymd}-${seq}`
    : `${concentrateTypeId}-${ymd}-${seq}`;
}

function fail(message, status) {
  const err = new Error(message);
  err.status = status;
  throw err;
}

function notFound(entity, id) {
  fail(`${entity} ${id} not found`, 404);
}

function methodNotAllowed(method, path) {
  fail(`Mock: no handler for ${method} ${path}`, 405);
}

function base64UrlEncode(input) {
  const utf8 = typeof input === 'string' ? new TextEncoder().encode(input) : input;
  let bin = '';
  for (let i = 0; i < utf8.length; i += 1) bin += String.fromCharCode(utf8[i]);
  return btoa(bin).replace(/=+$/, '').replace(/\+/g, '-').replace(/\//g, '_');
}

function base64UrlDecode(str) {
  const pad = '='.repeat((4 - (str.length % 4)) % 4);
  const b64 = (str + pad).replace(/-/g, '+').replace(/_/g, '/');
  return atob(b64);
}

function makeMockJwt(payload) {
  const header = { alg: 'mock', typ: 'JWT' };
  const h = base64UrlEncode(JSON.stringify(header));
  const p = base64UrlEncode(JSON.stringify(payload));
  return `${h}.${p}.mock-signature`;
}

function verifyToken(headers) {
  const auth = headers?.Authorization || headers?.authorization;
  if (!auth || typeof auth !== 'string') fail('Unauthorized', 401);
  const token = auth.replace(/^Bearer\s+/i, '');
  const parts = token.split('.');
  if (parts.length !== 3) fail('Unauthorized', 401);
  let payload;
  try {
    payload = JSON.parse(base64UrlDecode(parts[1]));
  } catch {
    fail('Unauthorized', 401);
  }
  if (typeof payload.exp === 'number' && payload.exp * 1000 < Date.now()) {
    fail('Unauthorized', 401);
  }
  return payload;
}

export async function mockBackend(path, options = {}) {
  await delay();
  const method = (options.method || 'GET').toUpperCase();
  const body = options.body ? JSON.parse(options.body) : null;

  const [pathname, query = ''] = path.split('?');
  const segments = pathname.replace(/^\//, '').split('/').filter(Boolean);
  const [resource, id, sub] = segments;
  const params = new URLSearchParams(query);

  // ── Auth — public endpoint ─────────────────────────────────────
  if (resource === 'auth') {
    if (id === 'login' && method === 'POST') {
      if (!body || typeof body.password !== 'string') {
        fail('Пароль обязателен', 400);
      }
      if (body.password !== MOCK_PASSWORD) {
        fail('Неверный пароль', 401);
      }
      const now = Math.floor(Date.now() / 1000);
      const tokenPayload = { role: 'operator', iat: now, exp: now + TOKEN_TTL_SECONDS };
      return { token: makeMockJwt(tokenPayload), expires_in: TOKEN_TTL_SECONDS };
    }
    methodNotAllowed(method, path);
  }

  // ── Ping — public connectivity check ─────────────────────────
  if (resource === 'ping') {
    return { ok: true, mock: true, timestamp: nowIso() };
  }

  // ── Everything below requires a valid token ────────────────────
  verifyToken(options.headers);

  const db = loadDb();

  // ── Ingredients ────────────────────────────────────────────────
  if (resource === 'ingredients') {
    if (!id) {
      if (method === 'GET') return [...db.ingredients];
      if (method === 'POST') {
        const item = {
          id: uuid(),
          notes: '',
          ...body,
          updated_at: nowIso(),
        };
        db.ingredients.push(item);
        saveDb(db);
        return item;
      }
    } else {
      const idx = db.ingredients.findIndex((x) => x.id === id);
      if (idx === -1) notFound('Ingredient', id);
      if (method === 'GET') return db.ingredients[idx];
      if (method === 'PUT') {
        db.ingredients[idx] = {
          ...db.ingredients[idx],
          ...body,
          id: db.ingredients[idx].id,
          updated_at: nowIso(),
        };
        saveDb(db);
        return db.ingredients[idx];
      }
      if (method === 'DELETE') {
        // Mirror the SQL BEFORE DELETE trigger from migration 0003 — block
        // deletion if the ingredient is referenced anywhere, with a Russian
        // error listing the categories of usage.
        const ing = db.ingredients[idx];
        const inBaseRecipes = db.concentrate_types.some((ct) =>
          (ct.base_composition || []).some((c) => c.ingredient_id === ing.id)
        );
        const inVariants = db.recipe_variants.some((rv) => {
          const o = rv.overrides || {};
          return (
            (o.add || []).some((c) => c.ingredient_id === ing.id) ||
            (o.modify || []).some((c) => c.ingredient_id === ing.id) ||
            (o.remove || []).includes(ing.id)
          );
        });
        const inBatches = db.batches.some(
          (b) =>
            (b.ingredients_used || []).some((u) => u.ingredient_id === ing.id) ||
            (b.actual_ingredients_used || []).some(
              (u) => u.ingredient_id === ing.id
            )
        );
        const parts = [];
        if (inBaseRecipes) parts.push('базовых рецептах');
        if (inVariants) parts.push('вариантах рецептов');
        if (inBatches) parts.push('исторических партиях');
        if (parts.length > 0) {
          fail(
            `Ингредиент "${ing.name_ru}" используется в ${parts.join(', ')} — нельзя удалить`,
            409
          );
        }
        const removed = db.ingredients.splice(idx, 1)[0];
        saveDb(db);
        return removed;
      }
      if (sub === 'restock' && method === 'POST') {
        const cur = db.ingredients[idx];
        cur.current_stock = Number(cur.current_stock || 0) + Number(body.amount || 0);
        if (body.lot_number) cur.lot_number = body.lot_number;
        if (body.expiry_date) cur.expiry_date = body.expiry_date;
        cur.updated_at = nowIso();
        saveDb(db);
        return cur;
      }
    }
    methodNotAllowed(method, path);
  }

  // ── Flavors ────────────────────────────────────────────────────
  if (resource === 'flavors') {
    if (!id) {
      if (method === 'GET') return [...db.flavors];
      if (method === 'POST') {
        const item = { active: true, notes: '', ...body, created_at: nowIso(), updated_at: nowIso() };
        db.flavors.push(item);
        // Mirror the SQL AFTER INSERT trigger from migration 0003 — auto-
        // create empty recipe_variants for every flavor-specific concentrate
        // type so the operator can fill in overrides without a second click.
        for (const ct of db.concentrate_types) {
          if (!ct.is_flavor_specific) continue;
          const variantId = `${ct.id}__${item.id}`;
          if (db.recipe_variants.some((rv) => rv.id === variantId)) continue;
          db.recipe_variants.push({
            id: variantId,
            concentrate_type_id: ct.id,
            flavor_id: item.id,
            overrides: { add: [], modify: [], remove: [] },
            protocol_addendum: [],
            notes: '',
            created_at: nowIso(),
            updated_at: nowIso(),
          });
        }
        saveDb(db);
        return item;
      }
    } else {
      const idx = db.flavors.findIndex((x) => x.id === id);
      if (idx === -1) notFound('Flavor', id);
      if (method === 'GET') return db.flavors[idx];
      if (method === 'PUT') {
        db.flavors[idx] = {
          ...db.flavors[idx],
          ...body,
          id: db.flavors[idx].id,
          updated_at: nowIso(),
        };
        saveDb(db);
        return db.flavors[idx];
      }
    }
    methodNotAllowed(method, path);
  }

  // ── Concentrate types ──────────────────────────────────────────
  if (resource === 'concentrate-types') {
    if (!id) {
      if (method === 'GET') return [...db.concentrate_types];
    } else {
      const idx = db.concentrate_types.findIndex((x) => x.id === id);
      if (idx === -1) notFound('ConcentrateType', id);
      if (method === 'GET') return db.concentrate_types[idx];
      if (method === 'PUT') {
        db.concentrate_types[idx] = {
          ...db.concentrate_types[idx],
          ...body,
          id: db.concentrate_types[idx].id,
          updated_at: nowIso(),
        };
        saveDb(db);
        return db.concentrate_types[idx];
      }
    }
    methodNotAllowed(method, path);
  }

  // ── Recipe variants ────────────────────────────────────────────
  if (resource === 'recipe-variants') {
    if (!id) {
      if (method === 'GET') {
        let result = [...db.recipe_variants];
        const ctId = params.get('concentrate_type_id');
        const fId = params.get('flavor_id');
        if (ctId) result = result.filter((v) => v.concentrate_type_id === ctId);
        if (fId) result = result.filter((v) => v.flavor_id === fId);
        return result;
      }
      if (method === 'POST') {
        // Mirror the SQL trigger: refuse variants on flavor-agnostic types.
        const ct = db.concentrate_types.find((c) => c.id === body.concentrate_type_id);
        if (!ct) fail(`Концентрат с id ${body.concentrate_type_id} не существует`, 400);
        if (!ct.is_flavor_specific) {
          fail(
            `Концентрат "${ct.name_ru}" не может иметь вариантов по вкусам — это общий рецепт`,
            400
          );
        }
        const item = { ...body, created_at: nowIso(), updated_at: nowIso() };
        db.recipe_variants.push(item);
        saveDb(db);
        return item;
      }
    } else {
      const idx = db.recipe_variants.findIndex((x) => x.id === id);
      if (idx === -1) notFound('RecipeVariant', id);
      if (method === 'GET') return db.recipe_variants[idx];
      if (method === 'PUT') {
        db.recipe_variants[idx] = {
          ...db.recipe_variants[idx],
          ...body,
          id: db.recipe_variants[idx].id,
          updated_at: nowIso(),
        };
        saveDb(db);
        return db.recipe_variants[idx];
      }
    }
    methodNotAllowed(method, path);
  }

  // ── Batches ────────────────────────────────────────────────────
  if (resource === 'batches') {
    if (!id) {
      if (method === 'GET') {
        let result = [...db.batches];
        const ctId = params.get('concentrate_type_id');
        const fId = params.get('flavor_id');
        const operator = params.get('operator');
        const from = params.get('from');
        const to = params.get('to');
        const shiftId = params.get('shift_id');
        if (ctId) result = result.filter((b) => b.concentrate_type_id === ctId);
        if (fId) result = result.filter((b) => b.flavor_id === fId);
        if (operator) result = result.filter((b) => b.produced_by === operator);
        if (from) result = result.filter((b) => b.produced_at >= from);
        if (to) result = result.filter((b) => b.produced_at <= to);
        if (shiftId) result = result.filter((b) => b.shift_id === shiftId);
        result.sort((a, b) => b.produced_at.localeCompare(a.produced_at));
        return result;
      }
      if (method === 'POST') {
        const ct = db.concentrate_types.find((c) => c.id === body.concentrate_type_id);
        if (!ct) fail(`Концентрат с id ${body.concentrate_type_id} не найден`, 400);

        let flavor = null;
        if (body.flavor_id) {
          flavor = db.flavors.find((f) => f.id === body.flavor_id);
          if (!flavor) fail(`Вкус с id ${body.flavor_id} не найден`, 400);
        }

        const producedAt = body.produced_at || nowIso();
        const ymd = producedAt.slice(0, 10);
        const sameDayCount = db.batches.filter(
          (b) =>
            b.concentrate_type_id === body.concentrate_type_id &&
            (b.flavor_id ?? null) === (body.flavor_id ?? null) &&
            b.produced_at.slice(0, 10) === ymd
        ).length;
        const seq = sameDayCount + 1;

        // Mirror the Postgres RPC's stock check semantics: validate every
        // ingredient first, then deduct. A missing or short ingredient
        // aborts the whole batch (no partial deduction).
        const used = Array.isArray(body.ingredients_used) ? body.ingredients_used : [];
        for (const u of used) {
          const ing = db.ingredients.find((x) => x.id === u.ingredient_id);
          if (!ing) fail(`Ингредиент с id ${u.ingredient_id} не найден`, 400);
          const cur = Number(ing.current_stock || 0);
          if (cur < Number(u.amount || 0)) {
            fail(
              `Недостаточно ингредиента ${u.ingredient_id} для производства партии`,
              400
            );
          }
        }

        const batch = {
          status: 'completed',
          notes: '',
          shift_id: null,
          ...body,
          flavor_id: body.flavor_id ?? null,
          flavor_name_ru: flavor?.name_ru ?? null,
          concentrate_type_id: ct.id,
          concentrate_type_name_ru: ct.name_ru,
          produced_at: producedAt,
          batch_id: makeBatchId({
            concentrateTypeId: ct.id,
            flavorId: body.flavor_id,
            dateIso: producedAt,
            sequence: seq,
          }),
        };

        // Validation passed — deduct now.
        for (const u of used) {
          const ing = db.ingredients.find((x) => x.id === u.ingredient_id);
          ing.current_stock = Math.max(
            0,
            Number(ing.current_stock || 0) - Number(u.amount || 0)
          );
          ing.updated_at = nowIso();
        }
        db.batches.push(batch);
        saveDb(db);
        return batch;
      }
    } else {
      const idx = db.batches.findIndex((x) => x.batch_id === id);
      if (idx === -1) notFound('Batch', id);
      if (method === 'GET') return db.batches[idx];
      if (sub === 'cancel' && method === 'POST') {
        db.batches[idx].status = 'cancelled';
        saveDb(db);
        return db.batches[idx];
      }
    }
    methodNotAllowed(method, path);
  }

  // ── Settings (flat-map shape, in-memory) ───────────────────────
  if (resource === 'settings') {
    if (method === 'GET') return { ...db.settings };
    if (method === 'PUT') {
      db.settings = { ...db.settings, ...body };
      saveDb(db);
      return { ...db.settings };
    }
    methodNotAllowed(method, path);
  }

  methodNotAllowed(method, path);
}

export function _resetMockDb() {
  localStorage.removeItem(STORAGE_KEY);
}

if (typeof window !== 'undefined') {
  window.__mockDb = { reset: _resetMockDb, load: loadDb };
}
