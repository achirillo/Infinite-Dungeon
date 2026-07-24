const loginForm = document.getElementById('loginForm');
const registerForm = document.getElementById('registerForm');
const loginError = document.getElementById('loginError');
const registerError = document.getElementById('registerError');

function showForm(tabName) {
  document.querySelectorAll('.auth-tab').forEach(t => t.classList.remove('active'));
  document.querySelector(`[data-tab="${tabName}"]`).classList.add('active');
  if (tabName === 'register') {
    loginForm.classList.add('hidden');
    registerForm.classList.remove('hidden');
  } else {
    registerForm.classList.add('hidden');
    loginForm.classList.remove('hidden');
  }
}

document.querySelectorAll('.auth-tab').forEach(tab => {
  tab.addEventListener('click', () => showForm(tab.dataset.tab));
});

loginForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  loginError.classList.add('hidden');
  const email = loginForm.email.value.trim();
  const password = loginForm.password.value;
  try {
    await Auth.login(email, password);
    window.location.href = '/';
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
    window.location.href = '/';
  } catch (err) {
    registerError.textContent = err.message;
    registerError.classList.remove('hidden');
  }
});
