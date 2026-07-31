const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

const DB_PATH = process.env.DATABASE_PATH || path.join(__dirname, '..', 'data', 'dungeon.db');

let _db;

function getDb() {
  if (!_db) throw new Error('Database not initialised — call initDatabase() first');
  return _db;
}

function initDatabase() {
  if (_db) {
    _db.close();
    _db = null;
  }

  const dataDir = path.join(__dirname, '..', 'data');
  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
  }

  _db = new Database(DB_PATH);
  _db.pragma('journal_mode = WAL');
  _db.pragma('foreign_keys = ON');

  _db.exec(`
    CREATE TABLE IF NOT EXISTS scenes (
      id            INTEGER PRIMARY KEY AUTOINCREMENT,
      parent_id     INTEGER REFERENCES scenes(id),
      option_chosen TEXT,
      content       TEXT NOT NULL,
      depth         INTEGER DEFAULT 0,
      created_at    TEXT DEFAULT (datetime('now'))
    )
  `);

  _db.exec(`
    CREATE TABLE IF NOT EXISTS options (
      id              INTEGER PRIMARY KEY AUTOINCREMENT,
      scene_id        INTEGER NOT NULL REFERENCES scenes(id),
      option_text     TEXT NOT NULL,
      target_scene_id INTEGER REFERENCES scenes(id),
      sort_order      INTEGER DEFAULT 0
    )
  `);

  if (!columnExists('options', 'plan')) {
    _db.exec('ALTER TABLE options ADD COLUMN plan TEXT');
  }

  _db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id            INTEGER PRIMARY KEY AUTOINCREMENT,
      email         TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      username      TEXT UNIQUE NOT NULL,
      role          TEXT NOT NULL DEFAULT 'User',
      created_at    TEXT DEFAULT (datetime('now'))
    )
  `);

  _db.exec(`
    CREATE TABLE IF NOT EXISTS saves (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id    INTEGER UNIQUE NOT NULL REFERENCES users(id),
      scene_id   INTEGER NOT NULL REFERENCES scenes(id),
      updated_at TEXT DEFAULT (datetime('now'))
    )
  `);

  _db.exec(`
    CREATE TABLE IF NOT EXISTS user_settings (
      user_id    INTEGER PRIMARY KEY REFERENCES users(id),
      font_size  TEXT DEFAULT '16',
      text_speed INTEGER DEFAULT 15
    )
  `);

  const rootExists = _db.prepare('SELECT id FROM scenes WHERE parent_id IS NULL').get();
  if (!rootExists) {
    _db.prepare(
      'INSERT INTO scenes (parent_id, option_chosen, content, depth) VALUES (NULL, NULL, ?, 0)'
    ).run('You stand before the entrance of the INFINITE DUNGEON, a place of infinite possibility, reward, and danger.  A staircase leads down to a set of large double doors.  Absolutely anything could be beyond those doors, if you wish to enter...');

    const rootId = _db.prepare('SELECT id FROM scenes WHERE parent_id IS NULL').get().id;

    _db.prepare('INSERT INTO options (scene_id, option_text, plan, sort_order) VALUES (?, ?, ?, ?)')
      .run(rootId, 'Enter the dungeon', 'You enter into a large room with three passageways', 0);
    _db.prepare('INSERT INTO options (scene_id, option_text, plan, sort_order) VALUES (?, ?, ?, ?)')
      .run(rootId, 'Actually, nevermind', 'Head back towards a local village', 1);
  }

  console.log('Database initialised.');
}

function columnExists(table, column) {
  const rows = getDb().pragma(`table_info(${table})`);
  return rows.some(r => r.name === column);
}

function getScene(id) {
  return getDb().prepare('SELECT * FROM scenes WHERE id = ?').get(id) || null;
}

function getRootScene() {
  return getDb().prepare('SELECT * FROM scenes WHERE parent_id IS NULL').get() || null;
}

function getOptions(sceneId) {
  return getDb().prepare('SELECT * FROM options WHERE scene_id = ? ORDER BY sort_order').all(sceneId);
}

function getOption(id) {
  return getDb().prepare('SELECT * FROM options WHERE id = ?').get(id) || null;
}

function getAncestorChain(sceneId) {
  return getDb().prepare(`
    WITH RECURSIVE ancestors AS (
      SELECT * FROM scenes WHERE id = ?
      UNION ALL
      SELECT s.* FROM scenes s JOIN ancestors a ON s.id = a.parent_id
    )
    SELECT * FROM ancestors ORDER BY depth ASC
  `).all(sceneId);
}

function insertScene(parentId, optionChosen, content, depth) {
  const info = getDb().prepare(
    'INSERT INTO scenes (parent_id, option_chosen, content, depth) VALUES (?, ?, ?, ?)'
  ).run(parentId, optionChosen, content, depth);
  return Number(info.lastInsertRowid);
}

function insertOptions(sceneId, optionsData) {
  const stmt = getDb().prepare(
    'INSERT INTO options (scene_id, option_text, plan, sort_order) VALUES (?, ?, ?, ?)'
  );
  for (let i = 0; i < optionsData.length; i++) {
    const opt = optionsData[i];
    stmt.run(sceneId, opt.text, opt.plan || null, i);
  }
}

function setOptionTarget(optionId, targetSceneId) {
  getDb().prepare('UPDATE options SET target_scene_id = ? WHERE id = ?').run(targetSceneId, optionId);
}

function checkpoint() {
  const db = getDb();
  db.pragma('wal_checkpoint(TRUNCATE)');
}

function getStats() {
  const db = getDb();
  const sceneCount = db.prepare('SELECT COUNT(*) AS c FROM scenes').get().c;
  const optionCount = db.prepare('SELECT COUNT(*) AS c FROM options').get().c;
  const maxDepth = db.prepare('SELECT MAX(depth) AS m FROM scenes').get().m || 0;
  return { sceneCount, optionCount, maxDepth };
}

function createUser(email, passwordHash, username) {
  const adminUsernames = (process.env.ADMIN_USERNAMES || '').split(',').map(s => s.trim().toLowerCase());
  const role = adminUsernames.includes(username.toLowerCase()) ? 'Admin' : 'User';
  const info = getDb().prepare(
    'INSERT INTO users (email, password_hash, username, role) VALUES (?, ?, ?, ?)'
  ).run(email.toLowerCase(), passwordHash, username, role);
  return { id: Number(info.lastInsertRowid), email: email.toLowerCase(), username, role };
}

function getUserByEmail(email) {
  return getDb().prepare(
    'SELECT id, email, password_hash, username, role FROM users WHERE email = ?'
  ).get(email.toLowerCase()) || null;
}

function getUserById(id) {
  return getDb().prepare(
    'SELECT id, email, username, role FROM users WHERE id = ?'
  ).get(id) || null;
}

function saveProgress(userId, sceneId) {
  getDb().prepare(
    `INSERT INTO saves (user_id, scene_id) VALUES (?, ?)
     ON CONFLICT(user_id) DO UPDATE SET scene_id = ?, updated_at = datetime('now')`
  ).run(userId, sceneId, sceneId);
}

function getSavedSceneId(userId) {
  const row = getDb().prepare('SELECT scene_id FROM saves WHERE user_id = ?').get(userId);
  return row ? row.scene_id : null;
}

function clearSave(userId) {
  getDb().prepare('DELETE FROM saves WHERE user_id = ?').run(userId);
}

function getUserSettings(userId) {
  const row = getDb().prepare(
    'SELECT font_size, text_speed FROM user_settings WHERE user_id = ?'
  ).get(userId);
  return row ? { fontSize: row.font_size, textSpeed: row.text_speed } : null;
}

function saveUserSettings(userId, fontSize, textSpeed) {
  getDb().prepare(
    `INSERT INTO user_settings (user_id, font_size, text_speed) VALUES (?, ?, ?)
     ON CONFLICT(user_id) DO UPDATE SET font_size = ?, text_speed = ?`
  ).run(userId, fontSize, textSpeed, fontSize, textSpeed);
}

module.exports = {
  initDatabase,
  checkpoint,
  getScene,
  getRootScene,
  getOptions,
  getOption,
  getAncestorChain,
  insertScene,
  insertOptions,
  setOptionTarget,
  getStats,
  createUser,
  getUserByEmail,
  getUserById,
  saveProgress,
  getSavedSceneId,
  clearSave,
  getUserSettings,
  saveUserSettings,
};
