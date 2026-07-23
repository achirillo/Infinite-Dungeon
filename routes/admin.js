const express = require('express');
const path = require('path');
const fs = require('fs');
const { requireAdmin } = require('../middleware/auth');

const BACKUPS_DIR = path.join(__dirname, '..', 'backups');
const DB_PATH = path.join(__dirname, '..', 'data', 'dungeon.db');
const router = express.Router();

router.use(requireAdmin);

function ensureBackupsDir() {
  if (!fs.existsSync(BACKUPS_DIR)) {
    fs.mkdirSync(BACKUPS_DIR, { recursive: true });
  }
}

function getDbStats() {
  const db = require('../db/database');
  const stats = db.getStats();
  const dbSize = fs.existsSync(DB_PATH) ? fs.statSync(DB_PATH).size : 0;
  return { ...stats, dbSize };
}

function listBackups() {
  ensureBackupsDir();
  return fs.readdirSync(BACKUPS_DIR)
    .filter(f => f.endsWith('.db'))
    .map(f => {
      const filePath = path.join(BACKUPS_DIR, f);
      const stat = fs.statSync(filePath);
      return {
        name: f,
        size: stat.size,
        created: stat.birthtime.toISOString(),
      };
    })
    .sort((a, b) => b.created.localeCompare(a.created));
}

router.get('/admin/stats', (_req, res) => {
  try {
    res.json(getDbStats());
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/admin/backup', (_req, res) => {
  try {
    ensureBackupsDir();
    if (!fs.existsSync(DB_PATH)) {
      return res.status(400).json({ error: 'No database to back up' });
    }
    const ts = new Date().toISOString().replace(/[:.]/g, '-');
    const backupName = `dungeon-${ts}.db`;
    fs.copyFileSync(DB_PATH, path.join(BACKUPS_DIR, backupName));
    res.json({ name: backupName, message: 'Backup created' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/admin/backups', (_req, res) => {
  try {
    res.json(listBackups());
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/admin/restore', (req, res) => {
  try {
    const { name } = req.body;
    if (!name) return res.status(400).json({ error: 'Backup name required' });
    const src = path.join(BACKUPS_DIR, name);
    if (!fs.existsSync(src)) return res.status(404).json({ error: 'Backup not found' });

    if (fs.existsSync(DB_PATH)) {
      const ts = new Date().toISOString().replace(/[:.]/g, '-');
      fs.copyFileSync(DB_PATH, path.join(BACKUPS_DIR, `pre-restore-${ts}.db`));
    }

    fs.copyFileSync(src, DB_PATH);
    res.json({ message: `Restored from ${name}` });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/admin/reset', (_req, res) => {
  try {
    if (fs.existsSync(DB_PATH)) {
      ensureBackupsDir();
      const ts = new Date().toISOString().replace(/[:.]/g, '-');
      fs.copyFileSync(DB_PATH, path.join(BACKUPS_DIR, `auto-${ts}.db`));
      fs.unlinkSync(DB_PATH);
    }
    const db = require('../db/database');
    db.initDatabase();
    res.json({ message: 'Database reset. Auto-backup saved.' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.delete('/admin/backups/:name', (req, res) => {
  try {
    const filePath = path.join(BACKUPS_DIR, req.params.name);
    if (!fs.existsSync(filePath)) return res.status(404).json({ error: 'Backup not found' });
    fs.unlinkSync(filePath);
    res.json({ message: 'Backup deleted' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
