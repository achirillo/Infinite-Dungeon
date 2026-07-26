/**
 * Homepage UI logic.
 *
 * Manages the auth bar (login/logout button, admin link), the settings panel
 * (font size / text speed), and the "Enter the Dungeon" call-to-action.
 *
 * @module homepage
 */

/** DOM references. */
const authBarText = document.getElementById('authBarText');
const authBarBtn = document.getElementById('authBarBtn');
const adminBarLink = document.getElementById('adminBarLink');
const fontSizeSelect = document.getElementById('fontSize');
const textSpeedSelect = document.getElementById('textSpeed');

/** Default display settings. */
const DEFAULTS = { fontSize: '16', textSpeed: 10 };

/**
 * Load display settings from the server (logged-in users) or localStorage (guests).
 * @returns {Promise<{ fontSize: string, textSpeed: number }>}
 */
async function loadSettings() {
  if (Auth.isLoggedIn()) {
    try {
      const res = await fetch(API_BASE + '/api/settings');
      const data = await res.json();
      return { fontSize: data.fontSize || DEFAULTS.fontSize, textSpeed: data.textSpeed ?? DEFAULTS.textSpeed };
    } catch (_err) { /* fall through to localStorage */ }
  }
  const raw = parseInt(localStorage.getItem('textSpeed'), 10);
  return {
    fontSize: localStorage.getItem('fontSize') || DEFAULTS.fontSize,
    textSpeed: isNaN(raw) ? DEFAULTS.textSpeed : raw,
  };
}

/**
 * Persist display settings to the server (logged in) and/or localStorage.
 * @param {string} fontSize
 * @param {number} textSpeed
 */
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

/**
 * Apply the selected font size to the document body.
 * @param {string} fontSize - CSS font-size value in px.
 */
function applyFontSize(fontSize) {
  document.body.style.fontSize = fontSize + 'px';
}

/**
 * Handler for when either settings dropdown changes.
 * Applies the new value immediately and persists it.
 */
async function onSettingChange() {
  const fontSize = fontSizeSelect.value;
  const textSpeed = parseInt(textSpeedSelect.value, 10);
  applyFontSize(fontSize);
  await saveSettings(fontSize, textSpeed);
}

/**
 * Update the top auth bar to reflect the current login state.
 * Shows username + logout for logged-in users, "Login" link for guests.
 * Shows the Admin link if the user has the Admin role.
 */
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

/**
 * Initialise the homepage: check auth, load settings, set up event listeners.
 */
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
