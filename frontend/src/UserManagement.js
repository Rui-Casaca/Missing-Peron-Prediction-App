import React, { useEffect, useState, useCallback } from 'react';
import apiFetch from './api';

export default function UserManagement({ currentUser }) {
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(false);
  const [form, setForm] = useState({ username: '', password: '', displayName: '', role: 'user' });
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  // reloadUsers é exposto para que handlers (criar/alterar/eliminar) possam recarregar a lista
  const reloadUsers = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      if (!currentUser) {
        console.debug('reloadUsers: currentUser não definido ainda, adiando carregamento');
        setLoading(false);
        return;
      }

      const res = await apiFetch('/api/auth/users');
      if (!res.ok) {
        let body = null;
        try { body = await res.text(); } catch (e) { body = '<não foi possível ler corpo>'; }
        console.error('reloadUsers: resposta não OK', { status: res.status, statusText: res.statusText, body });
        throw new Error('Falha ao listar utilizadores');
      }
      const data = await res.json();
      if (data.success && data.users) setUsers(data.users);
      else setUsers([]);
    } catch (err) {
      console.error('Erro reloadUsers', err);
      setError('Erro a carregar utilizadores');
    } finally {
      setLoading(false);
    }
  }, [currentUser]);
  // Props: currentUser { username, role, displayName }

  useEffect(() => {
    // chamar reloadUsers quando currentUser mudar
    reloadUsers();
  }, [currentUser, reloadUsers]);

  const handleChange = (e) => setForm({ ...form, [e.target.name]: e.target.value });

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setSuccess('');
    if (!form.username || !form.password) { setError('username e password obrigatórios'); return; }
    try {
      const res = await apiFetch('/api/auth/register', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(form) });
      const data = await res.json();
          if (data.success) {
            setSuccess('Utilizador criado com sucesso');
            setForm({ username: '', password: '', displayName: '', role: 'user' });
            await reloadUsers();
      } else {
        setError(data.error || 'Erro ao criar utilizador');
      }
    } catch (err) {
      console.error('Erro register', err);
      setError('Erro ao criar utilizador');
    }
  };

  return (
    <div className="user-management-card">
      <div className="user-management-header">
        <h2>Gestão de Utilizadores</h2>
        <p className="muted">Criar e listar utilizadores do sistema. Apenas administradores têm acesso a esta página.</p>
      </div>

      <div className="user-management-body">
        <section className="user-list">
          <h3>Utilizadores</h3>
          {loading ? (
            <p>Carregando utilizadores...</p>
          ) : (
            <div className="table-responsive">
              <table className="user-table">
                <thead>
                  <tr>
                    <th>Utilizador</th>
                    <th>Nome</th>
                    <th>Função</th>
                    <th style={{ width: 180 }}>Ações</th>
                    <th>Criado</th>
                  </tr>
                </thead>
                <tbody>
                  {users.length === 0 && (
                    <tr><td colSpan={4} style={{ textAlign: 'center', padding: 12 }}>Nenhum utilizador encontrado</td></tr>
                  )}
                  {users.map(u => (
                    <tr key={u.id}>
                      <td className="mono">{u.username}</td>
                      <td>{u.displayName || '-'}</td>
                      <td><span className={`role-badge role-${u.role}`}>{u.role}</span></td>
                      <td>
                        {/* Ações visíveis apenas para superadmin */}
                        {((currentUser && (currentUser.username === 'UEPS.CSTE' || currentUser.role === 'superadmin')) || false) ? (
                          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                            {/* Alterar role rápido */}
                            <select
                              value={u.role}
                              onChange={async (e) => {
                                const novo = e.target.value;
                                // Proteções locais: não permitir alterar superadmin
                                if (u.username === 'UEPS.CSTE') { alert('Não é permitido alterar o role do superadmin'); return; }
                                try {
                                  const res = await apiFetch(`/api/auth/users/${u.id}/role`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ role: novo }) });
                                  const data = await res.json();
                                  if (data.success) {
                                    await reloadUsers();
                                  } else {
                                    alert(data.error || 'Erro ao alterar role');
                                    await reloadUsers();
                                  }
                                } catch (err) {
                                  console.error('Erro change role', err);
                                  alert('Erro ao alterar role');
                                }
                              }}
                            >
                              <option value="user">user</option>
                              <option value="admin">admin</option>
                            </select>

                            {/* Eliminar utilizador */}
                            <button
                              className="btn-secondary"
                              onClick={async () => {
                                if (!window.confirm(`Eliminar utilizador ${u.username}? Esta ação é irreversível.`)) return;
                                if (u.username === 'UEPS.CSTE') { alert('Não é permitido eliminar o superadmin'); return; }
                                try {
                                  const res = await apiFetch(`/api/auth/users/${u.id}`, { method: 'DELETE' });
                                  const data = await res.json();
                                  if (data.success) {
                                    await reloadUsers();
                                  } else {
                                    alert(data.error || 'Erro ao eliminar utilizador');
                                  }
                                } catch (err) {
                                  console.error('Erro delete user', err);
                                  alert('Erro ao eliminar utilizador');
                                }
                              }}
                            >Eliminar</button>
                          </div>
                        ) : (
                          <span style={{ color: '#666' }}>—</span>
                        )}
                      </td>
                      <td>{new Date(u.createdAt).toLocaleString()}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

        <section className="user-form">
          <h3 style={{ marginTop: 8 }}>Criar novo utilizador</h3>
          <form onSubmit={handleSubmit} className="form-grid" aria-label="Criar novo utilizador">
            <label className="form-row">
              <span>Utilizador (username)</span>
              <input name="username" placeholder="username" value={form.username} onChange={handleChange} aria-required="true" />
            </label>

            <label className="form-row">
              <span>Nome a mostrar</span>
              <input name="displayName" placeholder="Nome a mostrar" value={form.displayName} onChange={handleChange} />
            </label>

            <label className="form-row">
              <span>Palavra-passe</span>
              <input name="password" placeholder="password" type="password" value={form.password} onChange={handleChange} aria-required="true" />
            </label>

            <label className="form-row">
              <span>Função</span>
              <select name="role" value={form.role} onChange={handleChange}>
                <option value="user">User</option>
                <option value="admin">Admin</option>
              </select>
            </label>

            <div className="form-actions">
              <button className="btn-primary" type="submit">Criar utilizador</button>
              <button type="button" className="btn-secondary" onClick={() => { setForm({ username: '', password: '', displayName: '', role: 'user' }); setError(''); setSuccess(''); }}>Limpar</button>
            </div>

            <div className="form-messages">
              {error && <div className="form-error" role="alert">{error}</div>}
              {success && <div className="form-success" role="status">{success}</div>}
            </div>
          </form>
        </section>
      </div>
    </div>
  );
}
