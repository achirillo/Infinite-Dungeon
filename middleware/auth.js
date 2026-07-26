/**
 * Express middleware for authentication and authorisation.
 *
 * Provides three middleware functions that can be applied to routes:
 *   - attachUser – decodes the JWT cookie (if present) and sets req.user
 *   - requireAuth – rejects the request if req.user is not set
 *   - requireAdmin – rejects unless req.user.role === 'Admin'
 *
 * @module middleware/auth
 */

const { verifyToken } = require('../services/auth');
const db = require('../db/database');

/**
 * Reads the JWT from the `token` cookie, verifies it, and looks up the user.
 * Sets `req.user` to the user object or `null`.  Never rejects – always
 * calls `next()` so unauthenticated visitors can still reach public routes.
 */
function attachUser(req, _res, next) {
  const token = req.cookies?.token;
  if (token) {
    try {
      const payload = verifyToken(token);
      const user = db.getUserById(payload.id);
      req.user = user || null;
    } catch (_err) {
      req.user = null;
    }
  } else {
    req.user = null;
  }
  next();
}

/**
 * Middleware that returns 401 if no user is attached to the request.
 */
function requireAuth(req, res, next) {
  if (!req.user) {
    return res.status(401).json({ error: 'Authentication required' });
  }
  next();
}

/**
 * Middleware that returns 403 if the user is not an Admin.
 */
function requireAdmin(req, res, next) {
  if (!req.user || req.user.role !== 'Admin') {
    return res.status(403).json({ error: 'Admin access required' });
  }
  next();
}

module.exports = { attachUser, requireAuth, requireAdmin };
