import React, { useState } from 'react';
import apiFetch from './api';

function PasswordResetModal({ open, onClose, prefillUsername }) {
  const [username, setUsername] = useState(prefillUsername || '');
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  const validateLocal = () => {
    setError('');
    if (!username) { setError('username é obrigatório'); return false; }
    if (!currentPassword) { setError('senha atual é obrigatória'); return false; }
    if (!newPassword) { setError('nova password é obrigatória'); return false; }
    if (newPassword.length < 8) { setError('A password deve ter pelo menos 8 caracteres'); return false; }
    if (!(/[A-Za-z]/.test(newPassword) && /[0-9]/.test(newPassword))) { setError('A password deve conter letras e números'); return false; }
    if (newPassword !== confirmPassword) { setError('As passwords não coincidem'); return false; }
    return true;
  };

  const submitChange = async () => {
    if (!validateLocal()) return;
    setLoading(true); setMessage(''); setError('');
    try {
      // Se existir token, preferir trocar via endpoint autenticado
      const token = localStorage.getItem('auth_token');
      let res;
      if (token) {
        res = await apiFetch('/api/auth/me/password', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ currentPassword, newPassword }) });
      } else {
        res = await fetch('/api/auth/change-password', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username, currentPassword, newPassword }) });
      }
      const data = await res.json();
      if (data && data.success) {
        setMessage('Password alterada com sucesso. Faça login com a nova password.');
        setCurrentPassword(''); setNewPassword(''); setConfirmPassword('');
      } else {
        setError(data && data.error ? data.error : 'Erro ao alterar password');
      }
    } catch (err) {
      setError(err.message || 'Erro de rede');
    } finally { setLoading(false); }
  };

  if (!open) return null;
  return (
    <div className="modal-overlay">
      <div className="modal-dialog" role="dialog" aria-modal="true">
        <h3>Redefinir password</h3>
        <p className="muted">Insira o seu utilizador, senha atual e uma nova senha forte (mínimo 8 caracteres, letras e números).</p>
        <div style={{ marginBottom: 8 }}>
          <label>Utilizador</label>
          <input type="text" value={username} onChange={e => setUsername(e.target.value)} style={{ width: '100%', padding: 8 }} />
        </div>
        <div style={{ marginBottom: 8 }}>
          <label>Senha atual</label>
          <input type="password" value={currentPassword} onChange={e => setCurrentPassword(e.target.value)} style={{ width: '100%', padding: 8 }} />
        </div>
        <div style={{ marginBottom: 8 }}>
          <label>Nova senha</label>
          <input type="password" value={newPassword} onChange={e => setNewPassword(e.target.value)} style={{ width: '100%', padding: 8 }} />
        </div>
        <div style={{ marginBottom: 8 }}>
          <label>Confirmar nova senha</label>
          <input type="password" value={confirmPassword} onChange={e => setConfirmPassword(e.target.value)} style={{ width: '100%', padding: 8 }} />
        </div>
        {error && <div style={{ color: 'crimson', marginBottom: 8 }}>{error}</div>}
        {message && <div style={{ color: 'green', marginBottom: 8 }}>{message}</div>}
        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
          <button className="btn-primary" onClick={submitChange} disabled={loading}>{loading ? 'A processar...' : 'Alterar password'}</button>
          <button className="btn-secondary" onClick={onClose}>Fechar</button>
        </div>
      </div>
    </div>
  );
}

export default function Login({ onLoginSuccess }) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [showReset, setShowReset] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password })
      });
      const data = await res.json();
      if (data && data.success && data.token) {
        localStorage.setItem('auth_token', data.token);
        // registar timestamp de última atividade para mecanismo de inatividade
        try { localStorage.setItem('auth_last_activity', Date.now().toString()); } catch (e) {}
        if (onLoginSuccess) onLoginSuccess(data.user, data.token);
      } else {
        setError(data.error || 'Falha no login');
      }
    } catch (err) {
      setError(err.message || 'Erro de rede');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="login-wrapper">
      <div className="login-card" role="main" aria-labelledby="app-title">
        <div className="login-brand">
          <img className="app-logo" src="/logo_capa.png" alt="logo" onError={(e) => { e.target.onerror = null; e.target.src = '/logo.png'; }} />
          <div className="app-title" id="app-title">
            <h1>Sistema Pessoas Desaparecidas</h1>
            <p className="muted">Ferramenta interna de registo e análise</p>
          </div>
        </div>

        <form onSubmit={submit} className="login-form" aria-label="Formulário de autenticação">
          <label className="form-group">
            <span className="label-text">Utilizador</span>
            <input type="text" value={username} onChange={e => setUsername(e.target.value)} className="input-field" />
          </label>

          <label className="form-group">
            <span className="label-text">Senha</span>
            <input type="password" value={password} onChange={e => setPassword(e.target.value)} className="input-field" />
          </label>

          {error && <div className="form-error" role="alert">{error}</div>}

          <div className="login-actions">
            <button className="btn-primary" type="submit" disabled={loading}>{loading ? 'A entrar...' : 'Entrar'}</button>
            <button type="button" className="btn-link" onClick={() => setShowReset(true)}>Redefinir password</button>
          </div>
        </form>

        <PasswordResetModal open={showReset} onClose={() => setShowReset(false)} prefillUsername={username} />
      </div>
    </div>
  );
}
