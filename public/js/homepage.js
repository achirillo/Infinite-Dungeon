const authBarText = document.getElementById('authBarText');
const authBarBtn = document.getElementById('authBarBtn');
const adminBarLink = document.getElementById('adminBarLink');
const fontSizeSelect = document.getElementById('fontSize');
const textSpeedSelect = document.getElementById('textSpeed');

const DEFAULTS = { fontSize: '16', textSpeed: 15 };

async function loadSettings() {
  if (Auth.isLoggedIn()) {
    try {
      const res = await fetch(API_BASE + '/api/settings');
      const data = await res.json();
      return { fontSize: data.fontSize || DEFAULTS.fontSize, textSpeed: data.textSpeed ?? DEFAULTS.textSpeed };
    } catch (_err) { /* fall through to localStorage */ }
  }
  return {
    fontSize: localStorage.getItem('fontSize') || DEFAULTS.fontSize,
    textSpeed: parseInt(localStorage.getItem('textSpeed'), 10) || DEFAULTS.textSpeed,
  };
}

async function saveSettings(fontSize, textSpeed) {
  if (Auth.isLoggedIn()) {
    try {
      await fetch(API_BASE + '/api/settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fontSize, textSpeed }),
      });
    } catch (_err) { /* silent */ }
  }
  localStorage.setItem('fontSize', fontSize);
  localStorage.setItem('textSpeed', textSpeed);
}

function applyFontSize(fontSize) {
  document.body.style.fontSize = fontSize + 'px';
}

async function onSettingChange() {
  const fontSize = fontSizeSelect.value;
  const textSpeed = parseInt(textSpeedSelect.value, 10);
  applyFontSize(fontSize);
  await saveSettings(fontSize, textSpeed);
}

function updateAuthBar() {
  const user = Auth.getUser();
  if (user) {
    authBarText.textContent = `Logged in as ${user.username}`;
    authBarBtn.textContent = 'Logout';
    authBarBtn.href = '#';
    authBarBtn.removeAttribute('href');
    authBarBtn.onclick = async (e) => {
      e.preventDefault();
      await Auth.logout();
      updateAuthBar();
    };
    if (user.role === 'Admin') {
      adminBarLink.classList.remove('hidden');
    }
  } else {
    authBarText.textContent = 'Playing as Guest';
    authBarBtn.textContent = 'Login';
    authBarBtn.href = 'login';
    authBarBtn.onclick = null;
    adminBarLink.classList.add('hidden');
  }
}

async function init() {
  await Auth.fetch();

  const settings = await loadSettings();
  fontSizeSelect.value = settings.fontSize;
  textSpeedSelect.value = settings.textSpeed;
  applyFontSize(settings.fontSize);

  updateAuthBar();

  fontSizeSelect.addEventListener('change', onSettingChange);
  textSpeedSelect.addEventListener('change', onSettingChange);
}

init();
