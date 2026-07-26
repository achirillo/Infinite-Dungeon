/**
 * Client-side authentication state manager.
 *
 * Keeps the current user in `Auth._state` and exposes methods for login,
 * register, logout, and status checks.  On each page load, call `Auth.fetch()`
 * to check the JWT cookie against `/api/auth/me`.
 *
 * @module auth
 */

/** Global authentication state. */
const Auth = {
  /** @type {{ id: number, email: string, username: string, role: string } | null} */
  _state: null,

  /**
   * Check the current session by calling GET /api/auth/me.
   * Sets internal state to the user object or null.
   * @returns {Promise<object|null>}
   */
  async fetch() {
    try {
      const res = await fetch('/api/auth/me');
      const data = await res.json();
      this._state = data.user;
    } catch (_err) {
      this._state = null;
    }
    return this._state;
  },

  /**
   * Get the currently authenticated user (null if guest).
   * @returns {object|null}
   */
  getUser() {
    return this._state;
  },

  /**
   * Whether the user is logged in.
   * @returns {boolean}
   */
  isLoggedIn() {
    return this._state !== null;
  },

  /**
   * Whether the current user has the Admin role.
   * @returns {boolean}
   */
  isAdmin() {
    return this._state !== null && this._state.role === 'Admin';
  },

  /**
   * Log in with email and password. Sets the JWT cookie and updates state.
   * @param {string} email
   * @param {string} password
   * @returns {Promise<object>} The user object.
   * @throws If login fails.
   */
  async login(email, password) {
    const res = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Login failed');
    this._state = data.user;
    return data.user;
  },

  /**
   * Register a new account. Sets the JWT cookie and updates state.
   * @param {string} email
   * @param {string} password
   * @param {string} username
   * @returns {Promise<object>} The new user object.
   * @throws If registration fails.
   */
  async register(email, password, username) {
    const res = await fetch('/api/auth/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password, username }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Registration failed');
    this._state = data.user;
    return data.user;
  },

  /**
   * Log out – calls the server to clear the JWT cookie and resets local state.
   * @returns {Promise<void>}
   */
  async logout() {
    await fetch('/api/auth/logout', { method: 'POST' });
    this._state = null;
  },
};
