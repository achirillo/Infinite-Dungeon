const authLoggedOut = document.getElementById('authLoggedOut');
const authLoggedIn = document.getElementById('authLoggedIn');
const authUsername = document.getElementById('authUsername');
const authRole = document.getElementById('authRole');
const adminLink = document.getElementById('adminLink');
const loginForm = document.getElementById('loginForm');
const registerForm = document.getElementById('registerForm');
const loginError = document.getElementById('loginError');
const registerError = document.getElementById('registerError');

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

function updateAuthUI() {
  const user = Auth.getUser();
  if (user) {
    authLoggedOut.classList.add('hidden');
    authLoggedIn.classList.remove('hidden');
    authUsername.textContent = user.username;
    authRole.textContent = user.role === 'Admin' ? '[Admin]' : '';
    if (user.role === 'Admin') {
      adminLink.classList.remove('hidden');
    }
  } else {
    authLoggedOut.classList.remove('hidden');
    authLoggedIn.classList.add('hidden');
    adminLink.classList.add('hidden');
  }
}

function showForm(tabName) {
  if (tabName === 'register') {
    loginForm.classList.add('hidden');
    registerForm.classList.remove('hidden');
  } else {
    registerForm.classList.add('hidden');
    loginForm.classList.remove('hidden');
  }
}

document.querySelectorAll('.auth-tab').forEach(tab => {
  tab.addEventListener('click', () => {
    document.querySelectorAll('.auth-tab').forEach(t => t.classList.remove('active'));
    tab.classList.add('active');
    showForm(tab.dataset.tab);
  });
});

loginForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  loginError.classList.add('hidden');
  const email = loginForm.email.value.trim();
  const password = loginForm.password.value;
  try {
    await Auth.login(email, password);
    loginForm.reset();
    updateAuthUI();
  } catch (err) {
    loginError.textContent = err.message;
    loginError.classList.remove('hidden');
  }
});

registerForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  registerError.classList.add('hidden');
  const email = registerForm.email.value.trim();
  const username = registerForm.username.value.trim();
  const password = registerForm.password.value;
  try {
    await Auth.register(email, password, username);
    registerForm.reset();
    updateAuthUI();
  } catch (err) {
    registerError.textContent = err.message;
    registerError.classList.remove('hidden');
  }
});

document.getElementById('btnLogout').addEventListener('click', async () => {
  await Auth.logout();
  updateAuthUI();
});

applySettings();
Auth.fetch().then(updateAuthUI);
