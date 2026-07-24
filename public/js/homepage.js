const authBarText = document.getElementById('authBarText');
const authBarBtn = document.getElementById('authBarBtn');
const adminBarLink = document.getElementById('adminBarLink');

function applySettings() {
  const fontSize = localStorage.getItem('fontSize') || '16';
  document.body.style.fontSize = fontSize + 'px';
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
    authBarBtn.href = './login';
    authBarBtn.onclick = null;
    adminBarLink.classList.add('hidden');
  }
}

applySettings();
Auth.fetch().then(updateAuthBar);
