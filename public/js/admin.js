/**
 * Admin panel UI logic.
 *
 * Displays database statistics, a backup list, and actions for creating
 * backups, restoring from a backup, deleting backups, and resetting the
 * database.  Stats and backup list auto-refresh every 10 seconds.
 *
 * @module admin
 */

/** DOM references. */
const statsScenes = document.getElementById('statScenes');
const statsOptions = document.getElementById('statOptions');
const statsDepth = document.getElementById('statDepth');
const statsSize = document.getElementById('statSize');
const backupList = document.getElementById('backupList');
const feedback = document.getElementById('feedback');

/**
 * Format a byte count into a human-readable string (B / KB / MB).
 * @param {number} bytes
 * @returns {string}
 */
function formatSize(bytes) {
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1048576) return (bytes / 1024).toFixed(1) + ' KB';
  return (bytes / 1048576).toFixed(1) + ' MB';
}

/**
 * Show a temporary feedback toast at the bottom-right of the page.
 * @param {string} msg - The message to display.
 * @param {boolean} isError - Whether to style as an error.
 */
function showFeedback(msg, isError) {
  feedback.textContent = msg;
  feedback.className = 'admin-feedback' + (isError ? ' error' : ' success');
  setTimeout(() => feedback.classList.add('hidden'), 3000);
}

/**
 * Fetch and render database statistics (scenes, options, max depth, DB size).
 */
async function loadStats() {
  try {
    const data = await (await fetch('/api/admin/stats')).json();
    statsScenes.textContent = data.sceneCount;
    statsOptions.textContent = data.optionCount;
    statsDepth.textContent = data.maxDepth;
    statsSize.textContent = formatSize(data.dbSize);
  } catch (err) {
    showFeedback('Failed to load stats', true);
  }
}

/**
 * Fetch and render the list of database backup files.
 */
async function loadBackups() {
  try {
    const data = await (await fetch('/api/admin/backups')).json();
    if (data.length === 0) {
      backupList.innerHTML = '<span class="text-dim">No backups</span>';
      return;
    }
    backupList.innerHTML = data.map(b => `
      <div class="backup-item">
        <span class="backup-name">${escapeHtml(b.name)}</span>
        <span class="backup-meta">${formatSize(b.size)} &mdash; ${new Date(b.created).toLocaleString()}</span>
        <div class="backup-actions">
          <button class="btn small" onclick="restoreBackup('${escapeHtml(b.name)}')">Restore</button>
          <button class="btn small danger-btn" onclick="deleteBackup('${escapeHtml(b.name)}')">Delete</button>
        </div>
      </div>
    `).join('');
  } catch (err) {
    backupList.innerHTML = '<span class="text-dim error">Failed to load backups</span>';
  }
}

/**
 * Create a new manual backup of the database.
 */
async function createBackup() {
  try {
    const res = await fetch('/api/admin/backup', { method: 'POST' });
    const data = await res.json();
    showFeedback(data.message || data.error, !res.ok);
    await refresh();
  } catch (err) {
    showFeedback('Backup failed', true);
  }
}

/**
 * Restore the database from a named backup file.
 * Confirms with the user before proceeding.
 * @param {string} name - The backup filename.
 */
async function restoreBackup(name) {
  if (!confirm('Restore from ' + name + '? Current database will be auto-backed up.')) return;
  try {
    const res = await fetch('/api/admin/restore', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name }),
    });
    const data = await res.json();
    showFeedback(data.message || data.error, !res.ok);
  } catch (err) {
    showFeedback('Restore failed', true);
  }
}

/**
 * Delete a named backup file. Confirms with the user first.
 * @param {string} name - The backup filename.
 */
async function deleteBackup(name) {
  if (!confirm('Delete backup ' + name + '?')) return;
  try {
    const res = await fetch('/api/admin/backups/' + encodeURIComponent(name), { method: 'DELETE' });
    const data = await res.json();
    showFeedback(data.message || data.error, !res.ok);
    await loadBackups();
  } catch (err) {
    showFeedback('Delete failed', true);
  }
}

/**
 * Reset the entire database (auto-backup is saved server-side first).
 * Confirms with the user before proceeding.
 */
async function resetDatabase() {
  if (!confirm('Reset database? All scenes will be lost. An auto-backup will be saved.')) return;
  try {
    const res = await fetch('/api/admin/reset', { method: 'POST' });
    const data = await res.json();
    showFeedback(data.message || data.error, !res.ok);
    await refresh();
  } catch (err) {
    showFeedback('Reset failed', true);
  }
}

/**
 * Refresh both stats and backup list.
 */
async function refresh() {
  await Promise.all([loadStats(), loadBackups()]);
}

/**
 * Escape HTML special characters for safe insertion into the DOM.
 * @param {string} text
 * @returns {string}
 */
function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

/** Button event listeners. */
document.getElementById('btnBackup').addEventListener('click', createBackup);
document.getElementById('btnReset').addEventListener('click', resetDatabase);

/** Initial load + 10-second auto-refresh. */
refresh();
setInterval(refresh, 10000);
