/**
 * Main game UI logic.
 *
 * Handles loading/rendering scenes, the typewriter text effect, option
 * selection, save/load progress (server-side for logged-in users,
 * localStorage for guests), and the collapsible history sidebar.
 *
 * @module game
 */

/** DOM references. */
const sceneHistory = document.getElementById('sceneHistory');
const historySidebar = document.getElementById('historySidebar');
const historyToggle = document.getElementById('historyToggle');
const currentScene = document.getElementById('currentScene');
const optionsList = document.getElementById('optionsList');
const loadingIndicator = document.getElementById('loadingIndicator');
const errorMessage = document.getElementById('errorMessage');
const userIndicator = document.getElementById('userIndicator');
const depthCounter = document.getElementById('depthCounter');
const btnReturnStart = document.getElementById('btnReturnStart');

/** localStorage key for guest saves. */
const SAVE_KEY = 'dungeon_save';
const DEFAULTS = { fontSize: '16', textSpeed: 15 };

/** The ID of the scene the player is currently viewing. */
let lastSceneId = null;
/** Timeout ID for the typewriter effect. */
let typewriterQueue = null;
/** Array of timeout IDs for staggered option reveals. */
let optionsQueue = [];
/** Current text speed in ms per character. */
let currentSpeed = DEFAULTS.textSpeed;
/** Content of the currently displayed scene (used for the history entry). */
let currentSceneContent = '';

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
    } catch (_err) { /* fall through */ }
  }
  const raw = parseInt(localStorage.getItem('textSpeed'), 10);
  return {
    fontSize: localStorage.getItem('fontSize') || DEFAULTS.fontSize,
    textSpeed: isNaN(raw) ? DEFAULTS.textSpeed : raw,
  };
}

/**
 * Display an error message banner.
 * @param {string} msg
 */
function showError(msg) {
  errorMessage.textContent = '> ERROR: ' + msg;
  errorMessage.classList.remove('hidden');
}

/** Hide the error banner. */
function hideError() {
  errorMessage.classList.add('hidden');
}

/**
 * Show or hide the "Generating next scene..." indicator.
 * @param {boolean} loading
 */
function setLoading(loading) {
  if (loading) {
    loadingIndicator.classList.remove('hidden');
  } else {
    loadingIndicator.classList.add('hidden');
  }
}

/**
 * Create a history-scene DOM element for the sidebar.
 * @param {{ content: string }} scene
 * @param {string} [optionChosen] - The choice that led to this scene.
 * @returns {HTMLElement}
 */
function createSceneElement(scene, optionChosen) {
  const div = document.createElement('div');
  div.className = 'history-scene';
  if (optionChosen) {
    div.innerHTML = `<span class="history-choice">&gt; ${escapeHtml(optionChosen)}</span>`;
  }
  div.innerHTML += `<div>${escapeHtml(scene.content)}</div>`;
  return div;
}

/**
 * Escape HTML special characters to prevent XSS.
 * @param {string} text
 * @returns {string}
 */
function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

/**
 * Animate text appearing character-by-character (typewriter effect).
 * @param {HTMLElement} el - The container element.
 * @param {string} text - Full text to display.
 * @param {number} delay - Milliseconds per character (0 = instant).
 * @param {Function} [callback] - Called when animation finishes.
 */
function typewriteText(el, text, delay, callback) {
  if (typewriterQueue) clearTimeout(typewriterQueue);
  const cursor = el.querySelector('.cursor-blink');
  /** Remove existing text nodes, keep the cursor. */
  while (el.firstChild && el.firstChild !== cursor) {
    el.removeChild(el.firstChild);
  }
  let i = 0;
  function tick() {
    if (i < text.length) {
      el.insertBefore(document.createTextNode(text[i]), cursor);
      i++;
      if (delay > 0) {
        typewriterQueue = setTimeout(tick, delay);
      } else {
        tick();
      }
    } else if (callback) {
      callback();
    }
  }
  tick();
}

/**
 * Render the current scene text (with typewriter) and options.
 * @param {{ content: string, depth: number }} scene
 * @param {number} speed - Text speed in ms/char.
 * @param {Array} options
 */
function renderCurrentScene(scene, speed, options) {
  currentSceneContent = scene.content;
  currentScene.innerHTML = '';
  const sceneTextDiv = document.createElement('div');
  sceneTextDiv.className = 'scene-text';
  const cursor = document.createElement('span');
  cursor.className = 'cursor-blink';
  cursor.innerHTML = '&#x2588;';
  sceneTextDiv.appendChild(cursor);
  currentScene.appendChild(sceneTextDiv);
  depthCounter.textContent = scene.depth;

  if (speed <= 0) {
    sceneTextDiv.insertBefore(document.createTextNode(scene.content), cursor);
    renderOptions(options);
  } else {
    typewriteText(sceneTextDiv, scene.content, speed, () => renderOptions(options));
  }
}

/**
 * Render the clickable option buttons below the current scene.
 * Options appear with a staggered delay based on the text speed setting.
 * @param {Array<{ id: number, option_text: string, target_scene_id: number|null }>} options
 */
function renderOptions(options) {
  hideError();
  optionsQueue.forEach(clearTimeout);
  optionsQueue = [];
  optionsList.innerHTML = '';

  options.forEach((opt, idx) => {
    const btn = document.createElement('button');
    btn.className = 'option-btn' + (opt.target_scene_id === null ? ' ungenerated' : '') + ' option-hidden';
    btn.textContent = `> ${opt.option_text}`;
    btn.addEventListener('click', () => chooseOption(opt));
    optionsList.appendChild(btn);

    if (currentSpeed <= 0) {
      btn.classList.remove('option-hidden');
    } else {
      optionsQueue.push(setTimeout(() => {
        btn.classList.remove('option-hidden');
      }, 400 + idx * currentSpeed * 30));
    }
  });
}

/** Disable all option buttons (during generation). */
function disableOptions() {
  optionsList.querySelectorAll('button').forEach(b => b.disabled = true);
}

/** Re-enable all option buttons after an error. */
function enableOptions() {
  optionsList.querySelectorAll('button').forEach(b => b.disabled = false);
}

/**
 * Persist the player's current scene position.
 * Logged-in users save to the server; guests use localStorage.
 */
async function saveProgress() {
  if (Auth.isLoggedIn()) {
    try {
      await fetch(API_BASE + '/api/saves', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sceneId: lastSceneId }),
      });
    } catch (_err) { /* silent */ }
  } else {
    localStorage.setItem(SAVE_KEY, lastSceneId);
  }
}

/**
 * Clear the player's saved progress.
 */
async function clearSave() {
  if (Auth.isLoggedIn()) {
    try {
      await fetch(API_BASE + '/api/saves', { method: 'DELETE' });
    } catch (_err) { /* silent */ }
  } else {
    localStorage.removeItem(SAVE_KEY);
  }
}

/**
 * Get the last saved scene ID for the current player (server or localStorage).
 * @returns {Promise<number|null>}
 */
async function loadSavedSceneId() {
  if (Auth.isLoggedIn()) {
    try {
      const res = await fetch(API_BASE + '/api/saves/current');
      const data = await res.json();
      return data.sceneId || null;
    } catch (_err) { return null; }
  }
  const saved = localStorage.getItem(SAVE_KEY);
  return saved ? parseInt(saved, 10) : null;
}

/**
 * Load a scene by ID (e.g. from a save), walk up the chain to build the
 * history sidebar, and render the current scene.
 * @param {number} sceneId
 * @param {number} speed - Text speed for the typewriter.
 */
async function loadScene(sceneId, speed) {
  const data = await API.getScene(sceneId);

  /** Walk up the parent chain to reconstruct the full history. */
  const chain = [data.scene];
  let current = data.scene;
  while (current && current.parent_id) {
    const parent = await API.getScene(current.parent_id);
    chain.unshift(parent.scene);
    current = parent.scene;
  }

  sceneHistory.replaceChildren();
  for (let i = 0; i < chain.length - 1; i++) {
    sceneHistory.appendChild(createSceneElement(
      { content: chain[i].content },
      chain[i + 1].option_chosen
    ));
  }
  sceneHistory.scrollTop = sceneHistory.scrollHeight;

  lastSceneId = data.scene.id;
  renderCurrentScene(data.scene, speed, data.options);
  await saveProgress();
}

/**
 * Called when the player clicks an option button.
 * Disables inputs, shows loading, calls the API, then renders the result.
 * @param {{ id: number, option_text: string }} option
 */
async function chooseOption(option) {
  hideError();
  disableOptions();
  setLoading(true);

  try {
    const data = await API.chooseOption(lastSceneId, option.id);
    setLoading(false);

    /** Append the scene we're leaving to the history sidebar. */
    sceneHistory.appendChild(createSceneElement(
      { content: currentSceneContent },
      option.option_text
    ));
    sceneHistory.scrollTop = sceneHistory.scrollHeight;

    renderCurrentScene(data.scene, currentSpeed, data.options);
    lastSceneId = data.scene.id;
    await saveProgress();
  } catch (err) {
    setLoading(false);
    showError(err.message);
    enableOptions();
  }
}

/**
 * Return to the dungeon entrance (root scene).
 * Clears the save and resets the UI.
 * @param {number} speed
 */
async function returnToStart(speed) {
  sceneHistory.replaceChildren();
  hideError();
  setLoading(false);
  await clearSave();
  const data = await API.getRootScene();
  lastSceneId = data.scene.id;
  renderCurrentScene(data.scene, speed, data.options);
  await saveProgress();
  sceneHistory.scrollTop = 0;
}

/**
 * Initialise the game page: check auth, load settings, restore the last
 * saved scene (if any), otherwise show the root scene.
 */
async function initGame() {
  await Auth.fetch();
  const user = Auth.getUser();
  userIndicator.textContent = user ? user.username : 'Guest';

  const settings = await loadSettings();
  document.body.style.fontSize = settings.fontSize + 'px';
  currentSpeed = settings.textSpeed;

  const savedSceneId = await loadSavedSceneId();

  if (savedSceneId) {
    try {
      await loadScene(savedSceneId, settings.textSpeed);
      return;
    } catch (_err) {
      await clearSave();
    }
  }

  const data = await API.getRootScene();
  lastSceneId = data.scene.id;
  sceneHistory.replaceChildren();
  renderCurrentScene(data.scene, settings.textSpeed, data.options);
  await saveProgress();
}

/** Toggle the history sidebar open/closed. */
historyToggle.addEventListener('click', () => {
  historySidebar.classList.toggle('collapsed');
  historyToggle.textContent = historySidebar.classList.contains('collapsed')
    ? '\u00AB History'
    : '\u00BB';
});

/** "Return to Start" button handler. */
btnReturnStart.addEventListener('click', () => {
  returnToStart(currentSpeed);
});

/** Kick everything off. */
initGame();
