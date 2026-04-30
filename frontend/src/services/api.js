const API_BASE = '/api';

function getToken() { return localStorage.getItem('mvd_token'); }

async function request(path, options = {}) {
  const headers = { 'Content-Type': 'application/json', ...(options.headers || {}) };
  const token = getToken();
  if (token) headers.Authorization = `Bearer ${token}`;

  const res = await fetch(API_BASE + path, { ...options, headers });
  let data;
  try { data = await res.json(); } catch { data = null; }

  if (!res.ok) {
    const message = (data && data.error) || `Request failed (${res.status})`;
    const err = new Error(message);
    err.status = res.status;
    throw err;
  }
  return data;
}

export const api = {
  get:  (p)        => request(p),
  post: (p, body)  => request(p, { method: 'POST', body: JSON.stringify(body || {}) }),
  put:  (p, body)  => request(p, { method: 'PUT',  body: JSON.stringify(body || {}) }),
  del:  (p)        => request(p, { method: 'DELETE' }),
};
