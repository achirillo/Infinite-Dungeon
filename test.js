const assert = require('assert');
const path = require('path');
const fs = require('fs');

const db = require('./db/database');

async function run() {
  process.env.OPENAI_API_KEY = 'test-key';

  const testDbPath = path.join(__dirname, 'data', 'test-dungeon.db');
  if (fs.existsSync(testDbPath)) fs.unlinkSync(testDbPath);

  try {
    await db.initDatabase();

    const root = db.getRootScene();
    assert.ok(root, 'Root scene should exist');
    assert.strictEqual(root.depth, 0, 'Root scene depth should be 0');
    assert.ok(root.content.length > 0, 'Root scene content should not be empty');

    const options = db.getOptions(root.id);
    assert.ok(options.length >= 3, 'Root scene should have at least 3 options');
    assert.ok('plan' in options[0], 'Options should have plan field');
    assert.ok('option_text' in options[0], 'Options should have option_text field');
    assert.ok('target_scene_id' in options[0], 'Options should have target_scene_id field');

    const chain = db.getAncestorChain(root.id);
    assert.ok(chain.length > 0, 'Ancestor chain should not be empty');

    const routes = require('./routes/api');
    assert.ok(typeof routes === 'function', 'API routes should export a router function');

    console.log('All tests passed.');
    process.exit(0);
  } catch (err) {
    console.error('TEST FAILED:', err.message);
    process.exit(1);
  }
}

run();
