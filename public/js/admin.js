const statsScenes = document.getElementById('statScenes');
const statsOptions = document.getElementById('statOptions');
const statsDepth = document.getElementById('statDepth');
const statsSize = document.getElementById('statSize');
const backupList = document.getElementById('backupList');
const feedback = document.getElementById('feedback');

function formatSize(bytes) {
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1048576) return (bytes / 1024).toFixed(1) + ' KB';
  return (bytes / 1048576).toFixed(1) + ' MB';
}

function showFeedback(msg, isError) {
  feedback.textContent = msg;
  feedback.className = 'admin-feedback' + (isError ? ' error' : ' success');
  setTimeout(() => feedback.classList.add('hidden'), 3000);
}

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

async function refresh() {
  await Promise.all([loadStats(), loadBackups()]);
}

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

document.getElementById('btnBackup').addEventListener('click', createBackup);
document.getElementById('btnReset').addEventListener('click', resetDatabase);

refresh();
setInterval(refresh, 10000);
