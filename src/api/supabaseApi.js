// Supabase implementation of the data API.
//
// The mirrored mock implementation lives in mockApi.js. Both are dispatched
// from db.js based on the VITE_USE_MOCK_API flag, so screens never know
// which one is running.

import { getSupabase } from './supabase.js';

const OPERATOR_EMAIL =
  import.meta.env.VITE_OPERATOR_EMAIL || 'operator@concentrates.local';

function rethrow(error, fallbackStatus = 500) {
  const err = new Error(error.message || 'Supabase error');
  err.status = error.status || fallbackStatus;
  err.cause = error;
  throw err;
}

function sessionToShape(session) {
  if (!session) return null;
  return {
    token: session.access_token,
    user: { id: session.user.id, email: session.user.email },
    role: session.user?.app_metadata?.role ?? null,
    expiresAt: session.expires_at ? session.expires_at * 1000 : null,
  };
}

// ---- Auth ----------------------------------------------------------

export async function login(password) {
  const { data, error } = await getSupabase().auth.signInWithPassword({
    email: OPERATOR_EMAIL,
    password,
  });
  if (error) {
    // Supabase returns 400 for bad credentials; surface as 401 so the login
    // screen treats it as "wrong password" instead of a generic error.
    const status = /invalid login credentials|invalid password/i.test(error.message)
      ? 401
      : error.status || 500;
    const err = new Error(error.message);
    err.status = status;
    throw err;
  }
  return sessionToShape(data.session);
}

export async function logout() {
  const { error } = await getSupabase().auth.signOut();
  if (error) rethrow(error);
}

export async function getCurrentSession() {
  const { data, error } = await getSupabase().auth.getSession();
  if (error) return null;
  return sessionToShape(data.session);
}

export function subscribeAuthChanges(handler) {
  const {
    data: { subscription },
  } = getSupabase().auth.onAuthStateChange((_event, session) => {
    handler(sessionToShape(session));
  });
  return () => subscription.unsubscribe();
}

// ---- Ingredients ---------------------------------------------------

export async function getIngredients() {
  const { data, error } = await getSupabase()
    .from('ingredients')
    .select('*')
    .order('name_ru', { ascending: true });
  if (error) rethrow(error);
  return data;
}

export async function getIngredient(id) {
  const { data, error } = await getSupabase()
    .from('ingredients')
    .select('*')
    .eq('id', id)
    .single();
  if (error) rethrow(error, error.code === 'PGRST116' ? 404 : 500);
  return data;
}

export async function createIngredient(payload) {
  const { data, error } = await getSupabase()
    .from('ingredients')
    .insert(payload)
    .select()
    .single();
  if (error) rethrow(error);
  return data;
}

export async function updateIngredient(id, patch) {
  const { data, error } = await getSupabase()
    .from('ingredients')
    .update(patch)
    .eq('id', id)
    .select()
    .single();
  if (error) rethrow(error);
  return data;
}

// Non-atomic restock (read-modify-write). Acceptable while a single operator
// works one device at a time. Convert to a Postgres function when concurrent
// stock writes become a real concern.
export async function restockIngredient(id, { amount, lot_number, expiry_date }) {
  const sb = getSupabase();
  const { data: cur, error: readErr } = await sb
    .from('ingredients')
    .select('current_stock')
    .eq('id', id)
    .single();
  if (readErr) rethrow(readErr, readErr.code === 'PGRST116' ? 404 : 500);

  const patch = {
    current_stock: Number(cur.current_stock || 0) + Number(amount || 0),
  };
  if (lot_number) patch.lot_number = lot_number;
  if (expiry_date) patch.expiry_date = expiry_date;

  const { data, error } = await sb
    .from('ingredients')
    .update(patch)
    .eq('id', id)
    .select()
    .single();
  if (error) rethrow(error);
  return data;
}

export async function deleteIngredient(id) {
  const { data, error } = await getSupabase()
    .from('ingredients')
    .delete()
    .eq('id', id)
    .select()
    .single();
  if (error) rethrow(error);
  return data;
}

// ---- Flavors -------------------------------------------------------

export async function getFlavors() {
  const { data, error } = await getSupabase()
    .from('flavors')
    .select('*')
    .order('name_ru', { ascending: true });
  if (error) rethrow(error);
  return data;
}

export async function getFlavor(id) {
  const { data, error } = await getSupabase()
    .from('flavors')
    .select('*')
    .eq('id', id)
    .single();
  if (error) rethrow(error, error.code === 'PGRST116' ? 404 : 500);
  return data;
}

export async function createFlavor(payload) {
  const { data, error } = await getSupabase()
    .from('flavors')
    .insert(payload)
    .select()
    .single();
  if (error) rethrow(error);
  return data;
}

export async function updateFlavor(id, patch) {
  const { data, error } = await getSupabase()
    .from('flavors')
    .update(patch)
    .eq('id', id)
    .select()
    .single();
  if (error) rethrow(error);
  return data;
}

// ---- Concentrate types --------------------------------------------

export async function getConcentrateTypes() {
  const { data, error } = await getSupabase()
    .from('concentrate_types')
    .select('*')
    .order('name_ru', { ascending: true });
  if (error) rethrow(error);
  return data;
}

export async function getConcentrateType(id) {
  const { data, error } = await getSupabase()
    .from('concentrate_types')
    .select('*')
    .eq('id', id)
    .single();
  if (error) rethrow(error, error.code === 'PGRST116' ? 404 : 500);
  return data;
}

export async function updateConcentrateType(id, patch) {
  const { data, error } = await getSupabase()
    .from('concentrate_types')
    .update(patch)
    .eq('id', id)
    .select()
    .single();
  if (error) rethrow(error);
  return data;
}

// ---- Recipe variants ----------------------------------------------

export async function getRecipeVariants(filters = {}) {
  let query = getSupabase().from('recipe_variants').select('*');
  if (filters.concentrate_type_id) {
    query = query.eq('concentrate_type_id', filters.concentrate_type_id);
  }
  if (filters.flavor_id) {
    query = query.eq('flavor_id', filters.flavor_id);
  }
  const { data, error } = await query;
  if (error) rethrow(error);
  return data;
}

export async function getRecipeVariant(id) {
  const { data, error } = await getSupabase()
    .from('recipe_variants')
    .select('*')
    .eq('id', id)
    .single();
  if (error) rethrow(error, error.code === 'PGRST116' ? 404 : 500);
  return data;
}

export async function createRecipeVariant(payload) {
  const { data, error } = await getSupabase()
    .from('recipe_variants')
    .insert(payload)
    .select()
    .single();
  if (error) rethrow(error);
  return data;
}

export async function updateRecipeVariant(id, patch) {
  const { data, error } = await getSupabase()
    .from('recipe_variants')
    .update(patch)
    .eq('id', id)
    .select()
    .single();
  if (error) rethrow(error);
  return data;
}

// ---- Batches -------------------------------------------------------

export async function getBatches(filters = {}) {
  let query = getSupabase()
    .from('batches')
    .select('*')
    .order('produced_at', { ascending: false });
  if (filters.concentrate_type_id) query = query.eq('concentrate_type_id', filters.concentrate_type_id);
  if (filters.flavor_id) query = query.eq('flavor_id', filters.flavor_id);
  if (filters.operator) query = query.eq('produced_by', filters.operator);
  if (filters.from) query = query.gte('produced_at', filters.from);
  if (filters.to) query = query.lte('produced_at', filters.to);
  if (filters.shift_id) query = query.eq('shift_id', filters.shift_id);
  const { data, error } = await query;
  if (error) rethrow(error);
  return data;
}

export async function getBatch(batchId) {
  const { data, error } = await getSupabase()
    .from('batches')
    .select('*')
    .eq('batch_id', batchId)
    .single();
  if (error) rethrow(error, error.code === 'PGRST116' ? 404 : 500);
  return data;
}

// Generates a human-readable batch_id like
//   concentrate_a-lemon-20260505-01    (with flavor)
//   concentrate_b-20260505-01          (flavor-agnostic)
// flavorId is optional — falsy means the batch isn't flavor-bound.
export function makeBatchId({ concentrateTypeId, flavorId, producedAtIso, sequence }) {
  const ymd = producedAtIso.slice(0, 10).replaceAll('-', '');
  const seq = String(sequence).padStart(2, '0');
  return flavorId
    ? `${concentrateTypeId}-${flavorId}-${ymd}-${seq}`
    : `${concentrateTypeId}-${ymd}-${seq}`;
}

// Atomic batch creation — calls the create_batch() Postgres function added
// in migration 0002_flavors.sql. The RPC inserts the batch row and deducts
// stock in a single transaction; if any ingredient is missing or short, the
// transaction rolls back and the batch is never written.
//
// Sequence is computed client-side (existing same-day batches for the same
// type+flavor) before the call. Acceptable race window for a single-
// operator deployment; tighten if multi-operator concurrency arrives.
export async function createBatch(payload) {
  const sb = getSupabase();
  const producedAt = payload.produced_at || new Date().toISOString();
  const ymd = producedAt.slice(0, 10);

  let countQuery = sb
    .from('batches')
    .select('*', { count: 'exact', head: true })
    .eq('concentrate_type_id', payload.concentrate_type_id)
    .gte('produced_at', `${ymd}T00:00:00.000Z`)
    .lt('produced_at', `${ymd}T23:59:59.999Z`);
  countQuery = payload.flavor_id
    ? countQuery.eq('flavor_id', payload.flavor_id)
    : countQuery.is('flavor_id', null);
  const { count, error: countErr } = await countQuery;
  if (countErr) rethrow(countErr);

  const batchId = makeBatchId({
    concentrateTypeId: payload.concentrate_type_id,
    flavorId: payload.flavor_id,
    producedAtIso: producedAt,
    sequence: (count ?? 0) + 1,
  });

  const { data, error } = await sb.rpc('create_batch', {
    p_batch_id: batchId,
    p_concentrate_type_id: payload.concentrate_type_id,
    p_flavor_id: payload.flavor_id ?? null,
    p_produced_at: producedAt,
    p_produced_by: payload.produced_by,
    p_quantity: payload.quantity,
    p_ingredients_used: payload.ingredients_used ?? [],
    p_notes: payload.notes ?? '',
    p_shift_id: payload.shift_id ?? null,
  });
  if (error) rethrow(error);
  return data;
}

export async function cancelBatch(batchId) {
  const { data, error } = await getSupabase()
    .from('batches')
    .update({ status: 'cancelled' })
    .eq('batch_id', batchId)
    .select()
    .single();
  if (error) rethrow(error);
  return data;
}

// ---- Settings (key-value rows) -------------------------------------

export async function getSettings() {
  const { data, error } = await getSupabase().from('settings').select('key, value');
  if (error) rethrow(error);
  const map = {};
  for (const row of data) map[row.key] = row.value;
  return map;
}

export async function getSetting(key, fallback, parser) {
  const { data, error } = await getSupabase()
    .from('settings')
    .select('value')
    .eq('key', key)
    .maybeSingle();
  if (error) rethrow(error);
  if (!data) return fallback;
  return parser ? parser(data.value) : data.value;
}

export async function updateSettings(patch) {
  const rows = Object.entries(patch).map(([key, value]) => ({ key, value }));
  if (rows.length === 0) return getSettings();
  const { error } = await getSupabase()
    .from('settings')
    .upsert(rows, { onConflict: 'key' });
  if (error) rethrow(error);
  return getSettings();
}

// ---- Connectivity --------------------------------------------------

export async function ping() {
  const { error } = await getSupabase().from('settings').select('key').limit(1);
  if (error) rethrow(error);
  return { ok: true, mock: false, timestamp: new Date().toISOString() };
}
