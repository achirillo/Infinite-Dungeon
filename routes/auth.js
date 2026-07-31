/**
 * Authentication routes – login, register, logout, and session info.
 *
 * Mounted under `/api/auth`.
 *
 * @module routes/auth
 */

const express = require('express');
const db = require('../db/database');
const { hashPassword, verifyPassword, signToken } = require('../services/auth');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();

/**
 * Standard cookie options for the JWT token cookie.
 * - httpOnly: prevents client-side JS access (XSS mitigation)
 * - maxAge: 7 days
 * - sameSite: lax (allows links from other sites)
 * - secure: only sent over HTTPS in production
 */
const COOKIE_OPTS = {
  httpOnly: true,
  maxAge: 7 * 24 * 60 * 60 * 1000,
  // In production the frontend (GitHub Pages) and backend (Render) are on
  // different sites, so the cookie must be explicitly sent on cross-origin
  // fetch requests (requires `sameSite: 'none'` + `secure` over HTTPS).
  sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'lax',
  secure: process.env.NODE_ENV === 'production',
};

/**
 * POST /api/auth/register
 * Creates a new user account. Validates input, hashes the password,
 * and returns a signed JWT cookie.
 */
router.post('/auth/register', (req, res) => {
  try {
    const { email, password, username } = req.body;

    if (!email || !password || !username) {
      return res.status(400).json({ error: 'Email, password, and username are required' });
    }
    if (typeof email !== 'string' || !email.includes('@')) {
      return res.status(400).json({ error: 'Invalid email' });
    }
    if (typeof password !== 'string' || password.length < 6) {
      return res.status(400).json({ error: 'Password must be at least 6 characters' });
    }
    if (typeof username !== 'string' || username.trim().length < 2) {
      return res.status(400).json({ error: 'Username must be at least 2 characters' });
    }

    const existing = db.getUserByEmail(email);
    if (existing) {
      return res.status(409).json({ error: 'Email already registered' });
    }

    const passwordHash = hashPassword(password);
    const user = db.createUser(email, passwordHash, username.trim());

    const token = signToken(user);
    res.cookie('token', token, COOKIE_OPTS);
    res.json({ user: { id: user.id, email: user.email, username: user.username, role: user.role } });
  } catch (err) {
    if (err.message && err.message.includes('UNIQUE constraint')) {
      return res.status(409).json({ error: 'Username already taken' });
    }
    console.error(err);
    res.status(500).json({ error: 'Registration failed' });
  }
});

/**
 * POST /api/auth/login
 * Authenticates a user with email + password.
 * On success, sets the JWT cookie and returns user info.
 */
router.post('/auth/login', (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password are required' });
    }

    const user = db.getUserByEmail(email);
    if (!user || !verifyPassword(password, user.password_hash)) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    const token = signToken(user);
    res.cookie('token', token, COOKIE_OPTS);
    res.json({ user: { id: user.id, email: user.email, username: user.username, role: user.role } });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Login failed' });
  }
});

/**
 * POST /api/auth/logout
 * Clears the JWT cookie to log the user out.
 */
router.post('/auth/logout', (_req, res) => {
  res.clearCookie('token', COOKIE_OPTS);
  res.json({ message: 'Logged out' });
});

/**
 * GET /api/auth/me
 * Returns the currently authenticated user (from the JWT cookie), or null.
 */
router.get('/auth/me', (req, res) => {
  res.json({ user: req.user || null });
});

module.exports = router;
