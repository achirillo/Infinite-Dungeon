/**
 * Authentication helpers – password hashing and JWT management.
 *
 * Uses bcryptjs for hash/compare and jsonwebtoken for sign/verify.
 * Environment variables:
 *   JWT_SECRET – signing secret (defaults to a dev-only string)
 *
 * @module services/auth
 */

const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

const JWT_SECRET = process.env.JWT_SECRET || 'infinite-dungeon-dev-secret';
const JWT_EXPIRY = '7d';

/**
 * Hash a plain-text password with bcrypt (12 salt rounds).
 * @param {string} password - The plain-text password.
 * @returns {string} The bcrypt hash.
 */
function hashPassword(password) {
  return bcrypt.hashSync(password, 12);
}

/**
 * Compare a plain-text password against a bcrypt hash.
 * @param {string} password - The plain-text password.
 * @param {string} hash - The bcrypt hash.
 * @returns {boolean} Whether they match.
 */
function verifyPassword(password, hash) {
  return bcrypt.compareSync(password, hash);
}

/**
 * Sign a JWT for the given user object.
 * @param {{ id: number, username: string, role: string }} user
 * @returns {string} Signed JWT token.
 */
function signToken(user) {
  return jwt.sign(
    { id: user.id, username: user.username, role: user.role },
    JWT_SECRET,
    { expiresIn: JWT_EXPIRY }
  );
}

/**
 * Verify and decode a JWT token.
 * @param {string} token - The JWT token.
 * @returns {{ id: number, username: string, role: string }} Decoded payload.
 */
function verifyToken(token) {
  return jwt.verify(token, JWT_SECRET);
}

module.exports = { hashPassword, verifyPassword, signToken, verifyToken };
