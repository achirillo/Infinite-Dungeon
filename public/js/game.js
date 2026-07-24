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
let lastSceneId = null;

function applyStoredFontSize() {
  document.body.style.fontSize = (localStorage.getItem('fontSize') || '16') + 'px';
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

function renderCurrentScene(scene) {
  currentScene.innerHTML = `<div class="scene-text">${escapeHtml(scene.content)}</div><span class="cursor-blink">&#x2588;</span>`;
  depthCounter.textContent = scene.depth;
}

function renderOptions(options) {
  hideError();
  optionsList.innerHTML = '';
  options.forEach(opt => {
    const btn = document.createElement('button');
    btn.className = 'option-btn' + (opt.target_scene_id === null ? ' ungenerated' : '');
    btn.textContent = `> ${opt.option_text}`;
    btn.addEventListener('click', () => chooseOption(opt));
    optionsList.appendChild(btn);
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

async function loadScene(sceneId) {
  const data = await API.getScene(sceneId);
  lastSceneId = data.scene.id;
  renderCurrentScene(data.scene);
  renderOptions(data.options);
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

    renderCurrentScene(data.scene);
    renderOptions(data.options);
    lastSceneId = data.scene.id;
    await saveProgress();
  } catch (err) {
    setLoading(false);
    showError(err.message);
    enableOptions();
  }
}

async function returnToStart() {
  sceneHistory.innerHTML = '';
  sceneHistory.querySelectorAll('*').forEach(e => e.remove());
  sceneHistory.replaceChildren();
  hideError();
  setLoading(false);
  await clearSave();
  const data = await API.getRootScene();
  lastSceneId = data.scene.id;
  renderCurrentScene(data.scene);
  renderOptions(data.options);
  await saveProgress();
  sceneHistory.scrollTop = 0;
}

async function initGame() {
  applyStoredFontSize();
  await Auth.fetch();
  const user = Auth.getUser();
  userIndicator.textContent = user ? user.username : 'Guest';

  const savedSceneId = await loadSavedSceneId();

  if (savedSceneId) {
    try {
      await loadScene(savedSceneId);
      return;
    } catch (_err) {
      await clearSave();
    }
  }

  const data = await API.getRootScene();
  lastSceneId = data.scene.id;
  sceneHistory.innerHTML = '';
  sceneHistory.replaceChildren();
  renderCurrentScene(data.scene);
  renderOptions(data.options);
  await saveProgress();
}

historyToggle.addEventListener('click', () => {
  historySidebar.classList.toggle('collapsed');
  historyToggle.textContent = historySidebar.classList.contains('collapsed')
    ? '\u00AB History'
    : '\u00BB';
});

btnReturnStart.addEventListener('click', returnToStart);

initGame();
