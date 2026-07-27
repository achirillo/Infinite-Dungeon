/**
 * Admin routes – database stats, backup/restore/reset.
 *
 * All routes require Admin role (enforced by `requireAdmin` middleware).
 * Mounted under `/api/admin`.
 *
 * @module routes/admin
 */

const express = require('express');
const path = require('path');
const fs = require('fs');
const { requireAdmin } = require('../middleware/auth');

const BACKUPS_DIR = path.join(__dirname, '..', 'backups');
const DB_PATH = path.join(__dirname, '..', 'data', 'dungeon.db');
const router = express.Router();

/** All admin routes require Admin role. */
router.use(requireAdmin);

/**
 * Ensure the backups directory exists, creating it if necessary.
 */
function ensureBackupsDir() {
  if (!fs.existsSync(BACKUPS_DIR)) {
    fs.mkdirSync(BACKUPS_DIR, { recursive: true });
  }
}

/**
 * Collect database statistics: scene count, option count, max depth, and
 * the on-disk file size of the SQLite database.
 * @returns {{ sceneCount: number, optionCount: number, maxDepth: number, dbSize: number }}
 */
function getDbStats() {
  const db = require('../db/database');
  const stats = db.getStats();
  const dbSize = fs.existsSync(DB_PATH) ? fs.statSync(DB_PATH).size : 0;
  return { ...stats, dbSize };
}

/**
 * List all `.db` backup files in the backups directory, sorted newest-first.
 * @returns {Array<{ name: string, size: number, created: string }>}
 */
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

/**
 * GET /api/admin/stats
 * Returns database statistics (scenes, options, max depth, file size).
 */
router.get('/admin/stats', (_req, res) => {
  try {
    res.json(getDbStats());
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * Clean up stale WAL and SHM sidecar files left from a previous database
 * connection so they cannot interfere with a freshly opened connection.
 */
function removeWalFiles() {
  const wal = DB_PATH + '-wal';
  const shm = DB_PATH + '-shm';
  if (fs.existsSync(wal)) fs.unlinkSync(wal);
  if (fs.existsSync(shm)) fs.unlinkSync(shm);
}

/**
 * POST /api/admin/backup
 * Creates a timestamped backup of the current database file.
 * Forces a WAL checkpoint first so the backup is self-contained.
 */
router.post('/admin/backup', (_req, res) => {
  try {
    ensureBackupsDir();
    if (!fs.existsSync(DB_PATH)) {
      return res.status(400).json({ error: 'No database to back up' });
    }
    const db = require('../db/database');
    db.checkpoint();
    const ts = new Date().toISOString().replace(/[:.]/g, '-');
    const backupName = `dungeon-${ts}.db`;
    fs.copyFileSync(DB_PATH, path.join(BACKUPS_DIR, backupName));
    res.json({ name: backupName, message: 'Backup created' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * GET /api/admin/backups
 * Lists all available database backups.
 */
router.get('/admin/backups', (_req, res) => {
  try {
    res.json(listBackups());
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * POST /api/admin/restore
 * Restore a specific backup. The current database is automatically backed up
 * before the restore takes place.  The live database connection is closed and
 * re-opened so the restored data is immediately visible.
 */
router.post('/admin/restore', (req, res) => {
  try {
    const { name } = req.body;
    if (!name) return res.status(400).json({ error: 'Backup name required' });
    const src = path.join(BACKUPS_DIR, name);
    if (!fs.existsSync(src)) return res.status(404).json({ error: 'Backup not found' });

    /** Auto-backup the current DB before replacing it. */
    if (fs.existsSync(DB_PATH)) {
      const db = require('../db/database');
      db.checkpoint();
      const ts = new Date().toISOString().replace(/[:.]/g, '-');
      fs.copyFileSync(DB_PATH, path.join(BACKUPS_DIR, `pre-restore-${ts}.db`));
    }

    removeWalFiles();
    fs.copyFileSync(src, DB_PATH);
    const db = require('../db/database');
    db.initDatabase();
    res.json({ message: `Restored from ${name}` });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * POST /api/admin/reset
 * Resets the database by deleting the current file and reinitialising it.
 * An automatic backup is saved before the reset.
 */
router.post('/admin/reset', (_req, res) => {
  try {
    const db = require('../db/database');
    if (fs.existsSync(DB_PATH)) {
      ensureBackupsDir();
      db.checkpoint();
      const ts = new Date().toISOString().replace(/[:.]/g, '-');
      fs.copyFileSync(DB_PATH, path.join(BACKUPS_DIR, `auto-${ts}.db`));
      removeWalFiles();
      fs.unlinkSync(DB_PATH);
    }
    db.initDatabase();
    res.json({ message: 'Database reset. Auto-backup saved.' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * DELETE /api/admin/backups/:name
 * Deletes a specific backup file.
 */
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
