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

const SAVE_KEY = 'dungeon_save';
const DEFAULTS = { fontSize: '16', textSpeed: 15 };
let lastSceneId = null;
let typewriterQueue = null;
let optionsQueue = [];
let currentSpeed = DEFAULTS.textSpeed;

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

function showError(msg) {
  errorMessage.textContent = '> ERROR: ' + msg;
  errorMessage.classList.remove('hidden');
}

function hideError() {
  errorMessage.classList.add('hidden');
}

function setLoading(loading) {
  if (loading) {
    loadingIndicator.classList.remove('hidden');
  } else {
    loadingIndicator.classList.add('hidden');
  }
}

function createSceneElement(scene, optionChosen) {
  const div = document.createElement('div');
  div.className = 'history-scene';
  if (optionChosen) {
    div.innerHTML = `<span class="history-choice">&gt; ${escapeHtml(optionChosen)}</span>`;
  }
  div.innerHTML += `<div>${escapeHtml(scene.content)}</div>`;
  return div;
}

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

function typewriteText(el, text, delay, callback) {
  if (typewriterQueue) clearTimeout(typewriterQueue);
  const cursor = el.querySelector('.cursor-blink');
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

function renderCurrentScene(scene, speed, options) {
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

function disableOptions() {
  optionsList.querySelectorAll('button').forEach(b => b.disabled = true);
}

function enableOptions() {
  optionsList.querySelectorAll('button').forEach(b => b.disabled = false);
}

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

async function clearSave() {
  if (Auth.isLoggedIn()) {
    try {
      await fetch(API_BASE + '/api/saves', { method: 'DELETE' });
    } catch (_err) { /* silent */ }
  } else {
    localStorage.removeItem(SAVE_KEY);
  }
}

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

async function loadScene(sceneId, speed) {
  const data = await API.getScene(sceneId);
  lastSceneId = data.scene.id;
  renderCurrentScene(data.scene, speed, data.options);
  await saveProgress();
}

async function chooseOption(option) {
  hideError();
  disableOptions();
  setLoading(true);

  try {
    const data = await API.chooseOption(lastSceneId, option.id);
    setLoading(false);

    sceneHistory.appendChild(createSceneElement(
      { content: currentScene.querySelector('.scene-text').textContent },
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

historyToggle.addEventListener('click', () => {
  historySidebar.classList.toggle('collapsed');
  historyToggle.textContent = historySidebar.classList.contains('collapsed')
    ? '\u00AB History'
    : '\u00BB';
});

btnReturnStart.addEventListener('click', () => {
  returnToStart(currentSpeed);
});

initGame();
