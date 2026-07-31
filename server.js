/**
 * Infinite Dungeon - Main server entry point.
 *
 * Sets up an Express web server that serves the static front-end and provides
 * REST API routes for the procedural text-adventure game.  On startup the
 * SQLite database is initialised (or opened if it already exists).
 *
 * @module server
 */

/** Load environment variables from .env into process.env. */
require('dotenv').config();
const express = require('express');
const path = require('path');
const cookieParser = require('cookie-parser');
const { initDatabase } = require('./db/database');
const { attachUser } = require('./middleware/auth');
const apiRoutes = require('./routes/api');
const adminRoutes = require('./routes/admin');
const authRoutes = require('./routes/auth');

const app = express();
const PORT = process.env.PORT || 3000;

/**
 * Allowed cross-origin request origins (comma-separated). When set, only
 * these exact origins may make credentialed requests. When unset, any origin
 * is permitted, but the request's Origin header is always echoed back (never
 * `*`) so credentialed cross-origin requests work correctly.
 */
const ALLOWED_ORIGINS = (process.env.CORS_ORIGIN || '')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean);

/**
 * CORS middleware.
 *
 * With `Access-Control-Allow-Credentials: true` the browser rejects a
 * wildcard `Access-Control-Allow-Origin: *`, so the allowed origin must be
 * the exact, matching `Origin` request header. We echo the request origin
 * back when it is permitted instead of sending a wildcard.
 */
app.use((req, res, next) => {
  const origin = req.headers && req.headers.origin;
  const originAllowed = ALLOWED_ORIGINS.length === 0 || ALLOWED_ORIGINS.includes(origin);

  if (origin && originAllowed) {
    res.header('Access-Control-Allow-Origin', origin);
    res.header('Vary', 'Origin');
    res.header('Access-Control-Allow-Credentials', 'true');
    res.header('Access-Control-Allow-Headers', 'Content-Type');
    res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  }

  if (req.method === 'OPTIONS') return res.sendStatus(204);
  next();
});

app.use(express.json());
app.use(cookieParser());
app.use(express.static(path.join(__dirname, 'public')));

/** Attach the authenticated user (if any) to every request. */
app.use(attachUser);

/** Health-check endpoint. */
app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', uptime: process.uptime() });
});

app.use('/api', authRoutes);
app.use('/api', apiRoutes);
app.use('/api', adminRoutes);

/** Serve the game page. */
app.get('/game', (_req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'game.html'));
});

/** Serve the login/registration page. */
app.get('/login', (_req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'login.html'));
});

/** Serve the about page. */
app.get('/about', (_req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'about.html'));
});

/** Serve the admin panel (admin-only). */
app.get('/admin', (req, res) => {
  if (!req.user || req.user.role !== 'Admin') {
    return res.status(403).send('Admin access required');
  }
  res.sendFile(path.join(__dirname, 'public', 'admin.html'));
});

/** Catch-all route – serves the homepage for the root path or index.html. */
app.get('/:page', (req, res, next) => {
  const page = req.params.page;
  if (page === 'index.html' || page === '') {
    return res.sendFile(path.join(__dirname, 'public', 'index.html'));
  }
  next();
});

/** Bootstrap: initialise the database, then start listening. */
(async () => {
  await initDatabase();
  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Infinite Dungeon running on port ${PORT}`);
  });
})();
