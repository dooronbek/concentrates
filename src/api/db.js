// Public data API. Dispatches between the localStorage mock and the live
// Supabase implementation based on VITE_USE_MOCK_API. Both implementations
// expose the same function shape, so screens import from this file and
// don't need to know which backend is running.
//
// The flag is statically replaced by Vite at build time, so the unused
// implementation tree-shakes out of the production bundle.

import * as mockApi from './mockApi.js';
import * as supabaseApi from './supabaseApi.js';

// Default OFF — production safety. An unset env var (e.g., a Vercel deploy
// where someone forgets to configure this) lands on real Supabase, not on
// the in-browser mock. Local mock-mode work requires explicitly opting in
// with VITE_USE_MOCK_API=true in .env.local.
const USE_MOCK = import.meta.env.VITE_USE_MOCK_API === 'true';
const impl = USE_MOCK ? mockApi : supabaseApi;

export const isMockMode = () => USE_MOCK;

// Auth
export const login = (...args) => impl.login(...args);
export const logout = (...args) => impl.logout(...args);
export const getCurrentSession = (...args) => impl.getCurrentSession(...args);
export const subscribeAuthChanges = (...args) => impl.subscribeAuthChanges(...args);

// Ingredients
export const getIngredients = (...args) => impl.getIngredients(...args);
export const getIngredient = (...args) => impl.getIngredient(...args);
export const createIngredient = (...args) => impl.createIngredient(...args);
export const updateIngredient = (...args) => impl.updateIngredient(...args);
export const restockIngredient = (...args) => impl.restockIngredient(...args);
export const deleteIngredient = (...args) => impl.deleteIngredient(...args);

// Flavors
export const getFlavors = (...args) => impl.getFlavors(...args);
export const getFlavor = (...args) => impl.getFlavor(...args);
export const createFlavor = (...args) => impl.createFlavor(...args);
export const updateFlavor = (...args) => impl.updateFlavor(...args);

// Concentrate types
export const getConcentrateTypes = (...args) => impl.getConcentrateTypes(...args);
export const getConcentrateType = (...args) => impl.getConcentrateType(...args);
export const updateConcentrateType = (...args) => impl.updateConcentrateType(...args);

// Recipe variants
export const getRecipeVariants = (...args) => impl.getRecipeVariants(...args);
export const getRecipeVariant = (...args) => impl.getRecipeVariant(...args);
export const createRecipeVariant = (...args) => impl.createRecipeVariant(...args);
export const updateRecipeVariant = (...args) => impl.updateRecipeVariant(...args);

// Batches
export const getBatches = (...args) => impl.getBatches(...args);
export const getBatch = (...args) => impl.getBatch(...args);
export const createBatch = (...args) => impl.createBatch(...args);
export const cancelBatch = (...args) => impl.cancelBatch(...args);

// Settings
export const getSettings = (...args) => impl.getSettings(...args);
export const getSetting = (...args) => impl.getSetting(...args);
export const updateSettings = (...args) => impl.updateSettings(...args);

// Connectivity
export const ping = (...args) => impl.ping(...args);
