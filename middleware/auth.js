const { verifyToken } = require('../services/auth');
const db = require('../db/database');

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

function requireAuth(req, res, next) {
  if (!req.user) {
    return res.status(401).json({ error: 'Authentication required' });
  }
  next();
}

function requireAdmin(req, res, next) {
  if (!req.user || req.user.role !== 'Admin') {
    return res.status(403).json({ error: 'Admin access required' });
  }
  next();
}

module.exports = { attachUser, requireAuth, requireAdmin };
