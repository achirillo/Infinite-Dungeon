const Auth = {
  _state: null,

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

  getUser() {
    return this._state;
  },

  isLoggedIn() {
    return this._state !== null;
  },

  isAdmin() {
    return this._state !== null && this._state.role === 'Admin';
  },

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

  async logout() {
    await fetch('/api/auth/logout', { method: 'POST' });
    this._state = null;
  },
};
