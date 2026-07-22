function getSettings() {
  return {
    fontSize: localStorage.getItem('fontSize') || '16',
    textSpeed: parseInt(localStorage.getItem('textSpeed') || '15', 10),
  };
}

function saveSetting(key, value) {
  localStorage.setItem(key, value);
}

function applySettings() {
  const { fontSize } = getSettings();
  document.body.style.fontSize = fontSize + 'px';
}
