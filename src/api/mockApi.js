// Mock implementation of the data API.
//
// Wraps the path-based mockBackend in the same function shape that
// supabaseApi.js exposes, so db.js can dispatch between them without the
// rest of the app caring which one is running.

import { mockBackend } from './mockBackend.js';
import {
  clearToken,
  decodeToken,
  getStoredToken,
  isTokenValid,
  storeToken,
} from '../auth/jwt.js';

const AUTH_CHANGE_EVENT = 'auth:change';

function authHeaders() {
  const token = getStoredToken();
  return token ? { Authorization: `Bearer ${token}` } : {};
}

async function call(path, options = {}) {
  const headers = {
    'Content-Type': 'application/json',
    ...authHeaders(),
    ...(options.headers || {}),
  };
  try {
    return await mockBackend(path, { ...options, headers });
  } catch (err) {
    if (err?.status === 401) {
      clearToken();
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent(AUTH_CHANGE_EVENT));
      }
    }
    throw err;
  }
}

const json = (body) => ({ body: JSON.stringify(body) });

function tokenToSession(token) {
  if (!token || !isTokenValid(token)) return null;
  const payload = decodeToken(token);
  if (!payload) return null;
  return {
    token,
    user: { id: 'mock-operator', email: 'operator (mock)' },
    role: payload.role ?? null,
    expiresAt: payload.exp ? payload.exp * 1000 : null,
  };
}

// ---- Auth ----------------------------------------------------------

export async function login(password) {
  const result = await call('/auth/login', { method: 'POST', ...json({ password }) });
  storeToken(result.token);
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent(AUTH_CHANGE_EVENT));
  }
  return tokenToSession(result.token);
}

export async function logout() {
  clearToken();
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent(AUTH_CHANGE_EVENT));
  }
}

export async function getCurrentSession() {
  return tokenToSession(getStoredToken());
}

export function subscribeAuthChanges(handler) {
  const onChange = () => handler(tokenToSession(getStoredToken()));
  window.addEventListener(AUTH_CHANGE_EVENT, onChange);
  // Legacy event fired by 401 paths in earlier code — keep listening so
  // AuthContext stays in sync no matter which event triggers.
  window.addEventListener('auth:logout', onChange);
  return () => {
    window.removeEventListener(AUTH_CHANGE_EVENT, onChange);
    window.removeEventListener('auth:logout', onChange);
  };
}

// ---- Ingredients ---------------------------------------------------

export const getIngredients = () => call('/ingredients');
export const getIngredient = (id) => call(`/ingredients/${id}`);
export const createIngredient = (data) =>
  call('/ingredients', { method: 'POST', ...json(data) });
export const updateIngredient = (id, data) =>
  call(`/ingredients/${id}`, { method: 'PUT', ...json(data) });
export const restockIngredient = (id, data) =>
  call(`/ingredients/${id}/restock`, { method: 'POST', ...json(data) });
export const deleteIngredient = (id) =>
  call(`/ingredients/${id}`, { method: 'DELETE' });

// ---- Flavors -------------------------------------------------------

export const getFlavors = () => call('/flavors');
export const getFlavor = (id) => call(`/flavors/${id}`);
export const createFlavor = (data) =>
  call('/flavors', { method: 'POST', ...json(data) });
export const updateFlavor = (id, data) =>
  call(`/flavors/${id}`, { method: 'PUT', ...json(data) });

// ---- Concentrate types --------------------------------------------

export const getConcentrateTypes = () => call('/concentrate-types');
export const getConcentrateType = (id) => call(`/concentrate-types/${id}`);
export const updateConcentrateType = (id, data) =>
  call(`/concentrate-types/${id}`, { method: 'PUT', ...json(data) });

// ---- Recipe variants ----------------------------------------------

export const getRecipeVariants = (filters = {}) => {
  const qs = new URLSearchParams(
    Object.entries(filters).filter(([, v]) => v !== undefined && v !== '')
  ).toString();
  return call(`/recipe-variants${qs ? `?${qs}` : ''}`);
};
export const getRecipeVariant = (id) => call(`/recipe-variants/${id}`);
export const createRecipeVariant = (data) =>
  call('/recipe-variants', { method: 'POST', ...json(data) });
export const updateRecipeVariant = (id, data) =>
  call(`/recipe-variants/${id}`, { method: 'PUT', ...json(data) });

// ---- Batches -------------------------------------------------------

export const getBatches = (filters = {}) => {
  const qs = new URLSearchParams(
    Object.entries(filters).filter(([, v]) => v !== undefined && v !== '')
  ).toString();
  return call(`/batches${qs ? `?${qs}` : ''}`);
};
export const getBatch = (id) => call(`/batches/${id}`);
export const createBatch = (data) =>
  call('/batches', { method: 'POST', ...json(data) });
export const cancelBatch = (id) =>
  call(`/batches/${id}/cancel`, { method: 'POST' });

// ---- Settings ------------------------------------------------------
// Mock backend stores settings as a flat object internally. Expose the same
// flat-map shape Supabase mode returns so screens stay identical.

export const getSettings = () => call('/settings');

export async function getSetting(key, fallback, parser) {
  const all = await getSettings();
  if (!(key in all)) return fallback;
  return parser ? parser(all[key]) : all[key];
}

export const updateSettings = (data) =>
  call('/settings', { method: 'PUT', ...json(data) });

// ---- Connectivity --------------------------------------------------

export const ping = () => call('/ping');
