// Client-side JWT helpers.
//
// We *decode* the payload here (just base64) to read the role and expiry —
// signature verification is the server's job. In mock mode the mock backend
// hands out a token with the same shape; in production a Vercel Function
// signs it with `jose`.

const STORAGE_KEY = 'concentrate-auth-token';

export function getStoredToken() {
  try {
    return localStorage.getItem(STORAGE_KEY);
  } catch {
    return null;
  }
}

export function storeToken(token) {
  localStorage.setItem(STORAGE_KEY, token);
}

export function clearToken() {
  localStorage.removeItem(STORAGE_KEY);
}

function base64UrlDecode(str) {
  const pad = '='.repeat((4 - (str.length % 4)) % 4);
  const b64 = (str + pad).replace(/-/g, '+').replace(/_/g, '/');
  const bin = atob(b64);
  // Decode UTF-8 from the binary string.
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i += 1) bytes[i] = bin.charCodeAt(i);
  return new TextDecoder().decode(bytes);
}

export function decodeToken(token) {
  if (!token || typeof token !== 'string') return null;
  const parts = token.split('.');
  if (parts.length !== 3) return null;
  try {
    return JSON.parse(base64UrlDecode(parts[1]));
  } catch {
    return null;
  }
}

export function isTokenValid(token) {
  const payload = decodeToken(token);
  if (!payload) return false;
  if (typeof payload.exp !== 'number') return true;
  return payload.exp * 1000 > Date.now();
}
