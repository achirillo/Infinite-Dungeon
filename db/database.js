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

  const rootResult = db.exec('SELECT id FROM scenes WHERE parent_id IS NULL');
  if (rootResult.length === 0 || rootResult[0].values.length === 0) {
    db.run(
      'INSERT INTO scenes (parent_id, option_chosen, content, depth) VALUES (NULL, NULL, ?, 0)',
      ['You awaken in a darkened room. The air is cold and damp. A faint light flickers from a crack in the stone wall ahead. The floor is rough beneath your hands. Somewhere in the distance, water drips slowly into a pool, each drop echoing through the silence.']
    );

    const rootRes = db.exec('SELECT id FROM scenes WHERE parent_id IS NULL');
    const rootId = rootRes[0].values[0][0];

    db.run('INSERT INTO options (scene_id, option_text, sort_order) VALUES (?, ?, ?)', [rootId, 'Examine the crack in the wall', 0]);
    db.run('INSERT INTO options (scene_id, option_text, sort_order) VALUES (?, ?, ?)', [rootId, 'Feel around the room in the dark', 1]);
    db.run('INSERT INTO options (scene_id, option_text, sort_order) VALUES (?, ?, ?)', [rootId, 'Call out into the darkness', 2]);
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

function insertOptions(sceneId, optionTexts) {
  for (let i = 0; i < optionTexts.length; i++) {
    db.run(
      'INSERT INTO options (scene_id, option_text, sort_order) VALUES (?, ?, ?)',
      [sceneId, optionTexts[i], i]
    );
  }
  saveToFile();
}

function setOptionTarget(optionId, targetSceneId) {
  db.run('UPDATE options SET target_scene_id = ? WHERE id = ?', [targetSceneId, optionId]);
  saveToFile();
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
};
