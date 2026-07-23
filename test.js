const assert = require('assert');
const path = require('path');
const fs = require('fs');

const db = require('./db/database');

async function run() {
  process.env.OPENAI_API_KEY = 'test-key';
  process.env.JWT_SECRET = 'test-secret';

  const dbPath = path.join(__dirname, 'data', 'dungeon.db');
  if (fs.existsSync(dbPath)) fs.unlinkSync(dbPath);

  try {
    await db.initDatabase();

    const root = db.getRootScene();
    assert.ok(root, 'Root scene should exist');
    assert.strictEqual(root.depth, 0);
    assert.ok(root.content.length > 0);

    const options = db.getOptions(root.id);
    assert.ok(options.length >= 2);
    assert.ok('plan' in options[0]);
    assert.ok('option_text' in options[0]);
    assert.ok('target_scene_id' in options[0]);

    const chain = db.getAncestorChain(root.id);
    assert.ok(chain.length > 0);

    const routes = require('./routes/api');
    assert.ok(typeof routes === 'function');

    const authRoutes = require('./routes/auth');
    assert.ok(typeof authRoutes === 'function');

    const adminRoutes = require('./routes/admin');
    assert.ok(typeof adminRoutes === 'function');

    const { hashPassword, verifyPassword, signToken, verifyToken } = require('./services/auth');
    const hash = hashPassword('test123');
    assert.ok(hash, 'hashPassword should return a hash');
    assert.ok(verifyPassword('test123', hash), 'verifyPassword should match');
    assert.ok(!verifyPassword('wrong', hash), 'verifyPassword should reject wrong password');

    const token = signToken({ id: 1, username: 'test', role: 'User' });
    assert.ok(token, 'signToken should return a token');
    const payload = verifyToken(token);
    assert.strictEqual(payload.username, 'test');
    assert.strictEqual(payload.role, 'User');

    const { attachUser, requireAuth, requireAdmin } = require('./middleware/auth');
    assert.ok(typeof attachUser === 'function');
    assert.ok(typeof requireAuth === 'function');
    assert.ok(typeof requireAdmin === 'function');

    const user = db.createUser('test@example.com', hashPassword('test123'), 'TestUser');
    assert.ok(user, 'createUser should return a user');
    assert.strictEqual(user.username, 'TestUser');
    assert.strictEqual(user.role, 'User');

    const found = db.getUserByEmail('test@example.com');
    assert.ok(found, 'getUserByEmail should find user');
    assert.strictEqual(found.username, 'TestUser');

    const byId = db.getUserById(user.id);
    assert.ok(byId, 'getUserById should find user');

    console.log('All tests passed.');
    process.exit(0);
  } catch (err) {
    console.error('TEST FAILED:', err.message);
    process.exit(1);
  }
}

run();
