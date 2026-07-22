const sceneHistory = document.getElementById('sceneHistory');
const currentScene = document.getElementById('currentScene');
const optionsList = document.getElementById('optionsList');
const loadingIndicator = document.getElementById('loadingIndicator');
const errorMessage = document.getElementById('errorMessage');
const depthCounter = document.getElementById('depthCounter');

const SETTINGS = {
  get fontSize() { return localStorage.getItem('fontSize') || '16'; },
  get textSpeed() { return parseInt(localStorage.getItem('textSpeed') || '15', 10); },
};
let lastSceneId = null;

function applyStoredFontSize() {
  document.body.style.fontSize = SETTINGS.fontSize + 'px';
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
    btn.className = 'option-btn';
    btn.textContent = `> ${opt.option_text}`;
    btn.addEventListener('click', () => chooseOption(opt));
    optionsList.appendChild(btn);
  });
}

function disableOptions() {
  optionsList.querySelectorAll('button').forEach(b => b.disabled = true);
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
    depthCounter.textContent = data.scene.depth;
  } catch (err) {
    setLoading(false);
    showError(err.message);
    enableOptions();
  }
}

function enableOptions() {
  optionsList.querySelectorAll('button').forEach(b => b.disabled = false);
}

async function loadRootScene() {
  try {
    const data = await API.getRootScene();
    lastSceneId = data.scene.id;
    renderCurrentScene(data.scene);
    renderOptions(data.options);
  } catch (err) {
    showError(err.message);
  }
}

applyStoredFontSize();
loadRootScene();
