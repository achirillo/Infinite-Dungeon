const initSqlJs = require('sql.js');
const path = require('path');
const fs = require('fs');

const DB_PATH = path.join(__dirname, '..', 'data', 'dungeon.db');

let db;

function saveToFile() {
  const data = db.export();
  const buffer = Buffer.from(data);
  fs.writeFileSync(DB_PATH, buffer);
}

function columnExists(table, column) {
  const result = db.exec(`PRAGMA table_info(${table})`);
  if (result.length === 0) return false;
  const columns = result[0].values.map(row => row[1]);
  return columns.includes(column);
}

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

function getScene(id) {
  const result = db.exec('SELECT * FROM scenes WHERE id = ?', [id]);
  if (result.length === 0 || result[0].values.length === 0) return null;
  return rowToScene(result[0].values[0]);
}

function getRootScene() {
  const result = db.exec('SELECT * FROM scenes WHERE parent_id IS NULL');
  if (result.length === 0 || result[0].values.length === 0) return null;
  return rowToScene(result[0].values[0]);
}

function getOptions(sceneId) {
  const result = db.exec('SELECT * FROM options WHERE scene_id = ? ORDER BY sort_order', [sceneId]);
  if (result.length === 0) return [];
  const cols = result[0].columns;
  return result[0].values.map(row => rowToObject(cols, row));
}

function getOption(id) {
  const result = db.exec('SELECT * FROM options WHERE id = ?', [id]);
  if (result.length === 0 || result[0].values.length === 0) return null;
  return rowToObject(result[0].columns, result[0].values[0]);
}

function getAncestorChain(sceneId) {
  const chain = [];
  let current = getScene(sceneId);
  while (current) {
    chain.unshift(current);
    current = current.parent_id ? getScene(current.parent_id) : null;
  }
  return chain;
}

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

function setOptionTarget(optionId, targetSceneId) {
  db.run('UPDATE options SET target_scene_id = ? WHERE id = ?', [targetSceneId, optionId]);
  saveToFile();
}

function getStats() {
  const sceneCount = db.exec('SELECT COUNT(*) AS c FROM scenes')[0].values[0][0];
  const optionCount = db.exec('SELECT COUNT(*) AS c FROM options')[0].values[0][0];
  const maxDepth = db.exec('SELECT MAX(depth) AS m FROM scenes')[0].values[0][0] || 0;
  return { sceneCount, optionCount, maxDepth };
}

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

function getUserByEmail(email) {
  const result = db.exec('SELECT id, email, password_hash, username, role FROM users WHERE email = ?', [email.toLowerCase()]);
  if (result.length === 0 || result[0].values.length === 0) return null;
  return rowToObject(['id', 'email', 'password_hash', 'username', 'role'], result[0].values[0]);
}

function getUserById(id) {
  const result = db.exec('SELECT id, email, username, role FROM users WHERE id = ?', [id]);
  if (result.length === 0 || result[0].values.length === 0) return null;
  return rowToObject(result[0].columns, result[0].values[0]);
}

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
};
