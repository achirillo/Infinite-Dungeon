/**
 * Client-side API helper.
 *
 * Provides a thin wrapper around fetch() for the game's REST endpoints.
 * The backend base URL is read from the global `window.API_BASE` variable
 * that is injected into each HTML page (either at build time or hard-coded).
 *
 * @module api
 */

/** @type {string} Base URL for the backend API. */
const API_BASE = (typeof window !== 'undefined' && window.API_BASE) || '';

/**
 * Perform a GET request to the API and return the parsed JSON response.
 * Throws on non-2xx responses.
 * @param {string} path - API path (e.g. '/api/scenes/root').
 * @returns {Promise<any>}
 */
async function apiGet(path) {
  const res = await fetch(API_BASE + path);
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(err.error || 'Request failed');
  }
  return res.json();
}

/**
 * Perform a POST request to the API (no body) and return the parsed JSON.
 * @param {string} path - API path.
 * @returns {Promise<any>}
 */
async function apiPost(path) {
  const res = await fetch(API_BASE + path, { method: 'POST' });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(err.error || 'Request failed');
  }
  return res.json();
}

/**
 * Namespace for the game's primary API calls.
 */
const API = {
  /** Fetch the root scene (dungeon entrance). */
  getRootScene: () => apiGet('/api/scenes/root'),
  /** Fetch a specific scene by ID. */
  getScene: (id) => apiGet(`/api/scenes/${id}`),
  /** Choose an option, triggering scene generation if needed. */
  chooseOption: (sceneId, optionId) => apiPost(`/api/scenes/${sceneId}/options/${optionId}/choose`),
};
