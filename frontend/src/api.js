// Pequeno wrapper para fetch que injeta Authorization: Bearer <token> quando existe
export async function apiFetch(path, opts = {}) {
  const token = localStorage.getItem('auth_token');
  const headers = new Headers(opts.headers || {});
  if (token) headers.set('Authorization', `Bearer ${token}`);
  // default Content-Type para JSON quando body fornecido e header não definido
  if (opts.body && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }

  const finalOpts = { ...opts, headers };
  const res = await fetch(path, finalOpts);
  // Se receber 401, limpar token local (auto-logout) para forçar re-login
  if (res.status === 401) {
    try {
      localStorage.removeItem('auth_token');
      window.dispatchEvent(new Event('auth-token-invalid'));
    } catch (e) {}
  }
  return res;
}

export default apiFetch;

export function logout() {
  try {
    localStorage.removeItem('auth_token');
    localStorage.removeItem('auth_last_activity');
    window.dispatchEvent(new Event('auth-token-invalid'));
  } catch (e) {}
}
