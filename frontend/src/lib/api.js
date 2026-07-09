// Cliente HTTP central. Guarda o access token em memória e renova
// automaticamente via /auth/refresh (cookie httpOnly) quando expira.

const API_URL = (import.meta.env.VITE_API_URL || 'http://localhost:3001').replace(/\/$/, '');

let accessToken = null;
let onUnauthorized = null; // callback quando o refresh falha (logout global)

export function setAccessToken(token) {
  accessToken = token;
}
export function getAccessToken() {
  return accessToken;
}
export function setOnUnauthorized(fn) {
  onUnauthorized = fn;
}

let refreshing = null;

async function doRefresh() {
  if (!refreshing) {
    refreshing = fetch(`${API_URL}/auth/refresh`, {
      method: 'POST',
      credentials: 'include',
    })
      .then(async (r) => {
        if (!r.ok) throw new Error('refresh falhou');
        const data = await r.json();
        accessToken = data.token;
        return data;
      })
      .finally(() => {
        refreshing = null;
      });
  }
  return refreshing;
}

async function request(method, path, { body, headers = {}, _retry } = {}) {
  const opts = {
    method,
    credentials: 'include',
    headers: { ...headers },
  };
  if (body !== undefined) {
    opts.headers['Content-Type'] = 'application/json';
    opts.body = JSON.stringify(body);
  }
  if (accessToken) {
    opts.headers.Authorization = `Bearer ${accessToken}`;
  }

  let resp;
  try {
    resp = await fetch(`${API_URL}${path}`, opts);
  } catch (err) {
    throw new ApiError('Falha de conexão com o servidor', 0);
  }

  // Token expirado -> tenta renovar uma vez
  if (resp.status === 401 && !_retry && path !== '/auth/login' && path !== '/auth/refresh') {
    try {
      await doRefresh();
      return request(method, path, { body, headers, _retry: true });
    } catch (e) {
      if (onUnauthorized) onUnauthorized();
      throw new ApiError('Sessão expirada', 401);
    }
  }

  let data = null;
  const text = await resp.text();
  if (text) {
    try {
      data = JSON.parse(text);
    } catch {
      data = { raw: text };
    }
  }

  if (!resp.ok) {
    throw new ApiError(data?.error || `Erro ${resp.status}`, resp.status, data);
  }
  return data;
}

export class ApiError extends Error {
  constructor(message, status, data) {
    super(message);
    this.status = status;
    this.data = data;
  }
}

export const api = {
  url: API_URL,
  get: (path, opts) => request('GET', path, opts),
  post: (path, body, opts) => request('POST', path, { ...opts, body }),
  patch: (path, body, opts) => request('PATCH', path, { ...opts, body }),
  del: (path, opts) => request('DELETE', path, opts),
  refresh: doRefresh,
};
