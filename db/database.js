/**
 * SQLite database layer for Infinite Dungeon.
 *
 * Manages the in-browser SQLite database via sql.js – the database is loaded
 * into memory from a file on startup and persisted back to disk after every
 * write.  Schema covers:
 *   - scenes      (the dungeon tree)
 *   - options     (choices at each scene)
 *   - users       (accounts)
 *   - saves       (per-user progress save)
 *   - user_settings (font size / text speed preferences)
 *
 * @module db/database
 */

const initSqlJs = require('sql.js');
const path = require('path');
const fs = require('fs');

const DB_PATH = process.env.DATABASE_PATH || path.join(__dirname, '..', 'data', 'dungeon.db');

let db;

/**
 * Persist the in-memory SQLite database back to the `.db` file on disk.
 */
function saveToFile() {
  const data = db.export();
  const buffer = Buffer.from(data);
  fs.writeFileSync(DB_PATH, buffer);
}

/**
 * Check whether a column exists in a table.
 * @param {string} table - Table name.
 * @param {string} column - Column name.
 * @returns {boolean}
 */
function columnExists(table, column) {
  const result = db.exec(`PRAGMA table_info(${table})`);
  if (result.length === 0) return false;
  const columns = result[0].values.map(row => row[1]);
  return columns.includes(column);
}

/**
 * Initialise the database: create the data directory, open/create the .db
 * file, ensure all tables exist, run migrations (e.g. adding the `plan`
 * column), and seed the root scene if the database is empty.
 */
async function initDatabase() {
  const SQL = await initSqlJs();

  const dataDir = path.join(__dirname, '..', 'data');
  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir);
  }

  if (fs.existsSync(DB_PATH)) {
    const fileBuffer = fs.readFileSync(DB_PATH);
    db = new SQL.Database(fileBuffer);
  } else {
    db = new SQL.Database();
  }

  db.run('PRAGMA foreign_keys = ON');

  db.run(`
    CREATE TABLE IF NOT EXISTS scenes (
      id            INTEGER PRIMARY KEY AUTOINCREMENT,
      parent_id     INTEGER REFERENCES scenes(id),
      option_chosen TEXT,
      content       TEXT NOT NULL,
      depth         INTEGER DEFAULT 0,
      created_at    TEXT DEFAULT (datetime('now'))
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS options (
      id              INTEGER PRIMARY KEY AUTOINCREMENT,
      scene_id        INTEGER NOT NULL REFERENCES scenes(id),
      option_text     TEXT NOT NULL,
      target_scene_id INTEGER REFERENCES scenes(id),
      sort_order      INTEGER DEFAULT 0
    )
  `);

  /** Migration: add the `plan` column if it doesn't exist yet (older databases). */
  if (!columnExists('options', 'plan')) {
    db.run('ALTER TABLE options ADD COLUMN plan TEXT');
  }

  db.run(`
    CREATE TABLE IF NOT EXISTS users (
      id            INTEGER PRIMARY KEY AUTOINCREMENT,
      email         TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      username      TEXT UNIQUE NOT NULL,
      role          TEXT NOT NULL DEFAULT 'User',
      created_at    TEXT DEFAULT (datetime('now'))
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS saves (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id    INTEGER UNIQUE NOT NULL REFERENCES users(id),
      scene_id   INTEGER NOT NULL REFERENCES scenes(id),
      updated_at TEXT DEFAULT (datetime('now'))
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS user_settings (
      user_id    INTEGER PRIMARY KEY REFERENCES users(id),
      font_size  TEXT DEFAULT '16',
      text_speed INTEGER DEFAULT 15
    )
  `);

  /** Seed the root scene if the database is empty. */
  const rootResult = db.exec('SELECT id FROM scenes WHERE parent_id IS NULL');
  if (rootResult.length === 0 || rootResult[0].values.length === 0) {
    db.run(
      'INSERT INTO scenes (parent_id, option_chosen, content, depth) VALUES (NULL, NULL, ?, 0)',
      ['You stand before the entrance of the INFINITE DUNGEON, a place of infinite possibility, reward, and danger.  A staircase leads down to a set of large double doors.  Absolutely anything could be beyond those doors, if you wish to enter...']
    );

    const rootRes = db.exec('SELECT id FROM scenes WHERE parent_id IS NULL');
    const rootId = rootRes[0].values[0][0];

    db.run('INSERT INTO options (scene_id, option_text, plan, sort_order) VALUES (?, ?, ?, ?)',
      [rootId, 'Enter the dungeon', 'You enter into a large room with three passageways', 0]);
    db.run('INSERT INTO options (scene_id, option_text, plan, sort_order) VALUES (?, ?, ?, ?)',
      [rootId, 'Actually, nevermind', 'Head back towards a local village', 1]);
  }

  saveToFile();
  console.log('Database initialized.');
}

/**
 * Fetch a single scene by ID.
 * @param {number} id
 * @returns {{ id: number, parent_id: number|null, option_chosen: string|null,
 *             content: string, depth: number, created_at: string } | null}
 */
function getScene(id) {
  const result = db.exec('SELECT * FROM scenes WHERE id = ?', [id]);
  if (result.length === 0 || result[0].values.length === 0) return null;
  return rowToScene(result[0].values[0]);
}

/**
 * Fetch the root scene (the one with a NULL parent_id).
 * @returns {{ id: number, parent_id: null, option_chosen: null,
 *             content: string, depth: 0, created_at: string } | null}
 */
function getRootScene() {
  const result = db.exec('SELECT * FROM scenes WHERE parent_id IS NULL');
  if (result.length === 0 || result[0].values.length === 0) return null;
  return rowToScene(result[0].values[0]);
}

/**
 * Fetch all options for a given scene, ordered by sort_order.
 * @param {number} sceneId
 * @returns {Array<{ id: number, scene_id: number, option_text: string,
 *                    target_scene_id: number|null, plan: string|null, sort_order: number }>}
 */
function getOptions(sceneId) {
  const result = db.exec('SELECT * FROM options WHERE scene_id = ? ORDER BY sort_order', [sceneId]);
  if (result.length === 0) return [];
  const cols = result[0].columns;
  return result[0].values.map(row => rowToObject(cols, row));
}

/**
 * Fetch a single option by ID.
 * @param {number} id
 * @returns {object|null}
 */
function getOption(id) {
  const result = db.exec('SELECT * FROM options WHERE id = ?', [id]);
  if (result.length === 0 || result[0].values.length === 0) return null;
  return rowToObject(result[0].columns, result[0].values[0]);
}

/**
 * Walk up the scene tree from a given scene ID to the root, returning the
 * full ancestor chain (oldest first → newest last).
 * @param {number} sceneId
 * @returns {Array<object>}
 */
function getAncestorChain(sceneId) {
  const chain = [];
  let current = getScene(sceneId);
  while (current) {
    chain.unshift(current);
    current = current.parent_id ? getScene(current.parent_id) : null;
  }
  return chain;
}

/**
 * Insert a new scene into the dungeon tree.
 * @param {number|null} parentId - Parent scene ID, or null for root.
 * @param {string|null} optionChosen - The option text the player selected.
 * @param {string} content - The generated scene content.
 * @param {number} depth - Depth in the tree (parent depth + 1).
 * @returns {number} The new scene's auto-generated ID.
 */
function insertScene(parentId, optionChosen, content, depth) {
  db.run(
    'INSERT INTO scenes (parent_id, option_chosen, content, depth) VALUES (?, ?, ?, ?)',
    [parentId, optionChosen, content, depth]
  );
  const res = db.exec('SELECT last_insert_rowid() AS id');
  const newId = res[0].values[0][0];
  saveToFile();
  return newId;
}

/**
 * Bulk-insert options for a scene.
 * @param {number} sceneId - The scene these options belong to.
 * @param {Array<{ text: string, plan: string|null }>} optionsData
 */
function insertOptions(sceneId, optionsData) {
  for (let i = 0; i < optionsData.length; i++) {
    const opt = optionsData[i];
    db.run(
      'INSERT INTO options (scene_id, option_text, plan, sort_order) VALUES (?, ?, ?, ?)',
      [sceneId, opt.text, opt.plan || null, i]
    );
  }
  saveToFile();
}

/**
 * Update an option to point at a specific target scene (used after generation).
 * @param {number} optionId
 * @param {number} targetSceneId
 */
function setOptionTarget(optionId, targetSceneId) {
  db.run('UPDATE options SET target_scene_id = ? WHERE id = ?', [targetSceneId, optionId]);
  saveToFile();
}

/**
 * Return aggregate stats for the admin panel.
 * @returns {{ sceneCount: number, optionCount: number, maxDepth: number }}
 */
function getStats() {
  const sceneCount = db.exec('SELECT COUNT(*) AS c FROM scenes')[0].values[0][0];
  const optionCount = db.exec('SELECT COUNT(*) AS c FROM options')[0].values[0][0];
  const maxDepth = db.exec('SELECT MAX(depth) AS m FROM scenes')[0].values[0][0] || 0;
  return { sceneCount, optionCount, maxDepth };
}

/**
 * Create a new user. If the username appears in the ADMIN_USERNAMES env var,
 * the user is granted the Admin role.
 * @param {string} email
 * @param {string} passwordHash - Pre-hashed password.
 * @param {string} username
 * @returns {{ id: number, email: string, username: string, role: string }}
 */
function createUser(email, passwordHash, username) {
  const adminUsernames = (process.env.ADMIN_USERNAMES || '').split(',').map(s => s.trim().toLowerCase());
  const role = adminUsernames.includes(username.toLowerCase()) ? 'Admin' : 'User';
  db.run(
    'INSERT INTO users (email, password_hash, username, role) VALUES (?, ?, ?, ?)',
    [email.toLowerCase(), passwordHash, username, role]
  );
  const res = db.exec('SELECT last_insert_rowid() AS id');
  saveToFile();
  return { id: res[0].values[0][0], email: email.toLowerCase(), username, role };
}

/**
 * Look up a user by email address (case-insensitive).
 * @param {string} email
 * @returns {{ id: number, email: string, password_hash: string, username: string, role: string } | null}
 */
function getUserByEmail(email) {
  const result = db.exec('SELECT id, email, password_hash, username, role FROM users WHERE email = ?', [email.toLowerCase()]);
  if (result.length === 0 || result[0].values.length === 0) return null;
  return rowToObject(['id', 'email', 'password_hash', 'username', 'role'], result[0].values[0]);
}

/**
 * Look up a user by ID. Does NOT return the password_hash.
 * @param {number} id
 * @returns {{ id: number, email: string, username: string, role: string } | null}
 */
function getUserById(id) {
  const result = db.exec('SELECT id, email, username, role FROM users WHERE id = ?', [id]);
  if (result.length === 0 || result[0].values.length === 0) return null;
  return rowToObject(result[0].columns, result[0].values[0]);
}

/**
 * Save (or update) a user's current scene position.
 * @param {number} userId
 * @param {number} sceneId
 */
function saveProgress(userId, sceneId) {
  db.run(
    'INSERT INTO saves (user_id, scene_id) VALUES (?, ?) ON CONFLICT(user_id) DO UPDATE SET scene_id = ?, updated_at = datetime(\'now\')',
    [userId, sceneId, sceneId]
  );
  saveToFile();
}

/**
 * Get the saved scene ID for a user, or null if they have no save.
 * @param {number} userId
 * @returns {number|null}
 */
function getSavedSceneId(userId) {
  const result = db.exec('SELECT scene_id FROM saves WHERE user_id = ?', [userId]);
  if (result.length === 0 || result[0].values.length === 0) return null;
  return result[0].values[0][0];
}

/**
 * Delete a user's saved progress.
 * @param {number} userId
 */
function clearSave(userId) {
  db.run('DELETE FROM saves WHERE user_id = ?', [userId]);
  saveToFile();
}

/**
 * Get a user's display settings (font size, text speed).
 * @param {number} userId
 * @returns {{ fontSize: string, textSpeed: number } | null}
 */
function getUserSettings(userId) {
  const result = db.exec('SELECT font_size, text_speed FROM user_settings WHERE user_id = ?', [userId]);
  if (result.length === 0 || result[0].values.length === 0) return null;
  return { fontSize: result[0].values[0][0], textSpeed: result[0].values[0][1] };
}

/**
 * Save (or update) a user's display settings.
 * @param {number} userId
 * @param {string} fontSize
 * @param {number} textSpeed
 */
function saveUserSettings(userId, fontSize, textSpeed) {
  db.run(
    'INSERT INTO user_settings (user_id, font_size, text_speed) VALUES (?, ?, ?) ON CONFLICT(user_id) DO UPDATE SET font_size = ?, text_speed = ?',
    [userId, fontSize, textSpeed, fontSize, textSpeed]
  );
  saveToFile();
}

/**
 * Convert a scenes table row (array of values) to a named object.
 * @param {Array} row - Row values in column order: id, parent_id, option_chosen, content, depth, created_at.
 * @returns {{ id: number, parent_id: number|null, option_chosen: string|null,
 *             content: string, depth: number, created_at: string }}
 */
function rowToScene(row) {
  return {
    id: row[0],
    parent_id: row[1],
    option_chosen: row[2],
    content: row[3],
    depth: row[4],
    created_at: row[5],
  };
}

/**
 * Convert a column-name array and value array into a plain object.
 * @param {string[]} columns
 * @param {any[]} values
 * @returns {object}
 */
function rowToObject(columns, values) {
  const obj = {};
  for (let i = 0; i < columns.length; i++) {
    obj[columns[i]] = values[i];
  }
  return obj;
}

module.exports = {
  initDatabase,
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
