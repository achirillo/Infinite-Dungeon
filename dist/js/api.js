const API_BASE = (typeof window !== 'undefined' && window.API_BASE) || '';

async function apiGet(path) {
  const res = await fetch(API_BASE + path);
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(err.error || 'Request failed');
  }
  return res.json();
}

async function apiPost(path) {
  const res = await fetch(API_BASE + path, { method: 'POST' });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(err.error || 'Request failed');
  }
  return res.json();
}

const API = {
  getRootScene: () => apiGet('/api/scenes/root'),
  getScene: (id) => apiGet(`/api/scenes/${id}`),
  chooseOption: (sceneId, optionId) => apiPost(`/api/scenes/${sceneId}/options/${optionId}/choose`),
};
