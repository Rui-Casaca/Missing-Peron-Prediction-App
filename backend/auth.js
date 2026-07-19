const express = require('express');
const fs = require('fs');
const path = require('path');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');

const router = express.Router();

const USERS_FILE = path.join(__dirname, 'users.json');
const DEFAULT_DEV_JWT_SECRET = 'CHANGE_ME_LOCALLY';
const JWT_SECRET = process.env.JWT_SECRET || DEFAULT_DEV_JWT_SECRET;
const TOKEN_EXPIRES_IN = '8h';

if (!process.env.JWT_SECRET && process.env.NODE_ENV === 'production') {
  throw new Error('JWT_SECRET é obrigatório em produção');
}

if (!process.env.JWT_SECRET) {
  console.warn('JWT_SECRET não definido; a usar segredo local de desenvolvimento. Defina JWT_SECRET no .env antes de usar em produção.');
}

function loadUsers() {
  try {
    if (!fs.existsSync(USERS_FILE)) return [];
    const raw = fs.readFileSync(USERS_FILE, 'utf8');
    return JSON.parse(raw || '[]');
  } catch (e) {
    console.error('Erro a carregar users.json', e);
    return [];
  }
}

function findUserByUsername(username) {
  const users = loadUsers();
  return users.find(u => u.username === username);
}

function saveUsers(users) {
  fs.writeFileSync(USERS_FILE, JSON.stringify(users, null, 2), 'utf8');
}

function validatePasswordStrength(pw) {
  if (!pw || typeof pw !== 'string') return { ok: false, reason: 'password inválida' };
  if (pw.length < 8) return { ok: false, reason: 'A password deve ter pelo menos 8 caracteres' };
  // exigir pelo menos uma letra e um número
  if (!/[A-Za-z]/.test(pw) || !/[0-9]/.test(pw)) return { ok: false, reason: 'A password deve conter letras e números' };
  return { ok: true };
}

// POST /api/auth/login
router.post('/login', async (req, res) => {
  try {
    const { username, password } = req.body || {};
    if (!username || !password) return res.status(400).json({ success: false, error: 'username e password obrigatórios' });

    const user = findUserByUsername(username);
    if (!user) return res.status(401).json({ success: false, error: 'credenciais inválidas' });

    const match = await bcrypt.compare(password, user.passwordHash);
    if (!match) return res.status(401).json({ success: false, error: 'credenciais inválidas' });

  const payload = { id: user.id, username: user.username, displayName: user.displayName || user.username, role: user.role || 'user' };
    const token = jwt.sign(payload, JWT_SECRET, { expiresIn: TOKEN_EXPIRES_IN });

    return res.json({ success: true, token, user: payload });
  } catch (error) {
    console.error('Erro /auth/login', error);
    return res.status(500).json({ success: false, error: 'erro interno' });
  }
});

// Middleware de autenticação simples
function authenticateToken(req, res, next) {
  const auth = req.headers['authorization'] || req.headers['Authorization'];
  if (!auth) {
    console.debug('authenticateToken: Authorization header missing for request', { path: req.originalUrl, method: req.method });
    return res.status(401).json({ success: false, error: 'Token em falta' });
  }
  const parts = auth.split(' ');
  const token = parts.length === 2 && parts[0] === 'Bearer' ? parts[1] : auth;
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    req.user = decoded;
    next();
  } catch (e) {
    // Log debug info to help diagnose invalid token issues (do not log token value in production)
    console.debug('authenticateToken: token verification failed', { path: req.originalUrl, method: req.method, err: e && e.message });
    return res.status(401).json({ success: false, error: 'Token inválido' });
  }
}

// Middleware helper: require admin role
function requireAdmin(req, res, next) {
  if (!req.user) return res.status(401).json({ success: false, error: 'Não autenticado' });
  if (req.user.role !== 'admin' && req.user.role !== 'superadmin') return res.status(403).json({ success: false, error: 'Acesso reservado a administradores' });
  next();
}

// Middleware helper: require superadmin (apenas UEPS.CSTE)
function requireSuperAdmin(req, res, next) {
  if (!req.user) return res.status(401).json({ success: false, error: 'Não autenticado' });
  // allow by explicit username or role
  if (req.user.username !== 'UEPS.CSTE' && req.user.role !== 'superadmin') return res.status(403).json({ success: false, error: 'Acesso reservado ao superadmin' });
  next();
}

// GET /api/auth/me
router.get('/me', authenticateToken, (req, res) => {
  if (!req.user) return res.status(401).json({ success: false, error: 'Não autenticado' });
  res.json({ success: true, user: req.user });
});

// POST /api/auth/register - criar novo utilizador (apenas admin)
router.post('/register', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const { username, password, displayName, role } = req.body || {};
    if (!username || !password) return res.status(400).json({ success: false, error: 'username e password obrigatórios' });

    const users = loadUsers();
    if (users.find(u => u.username === username)) return res.status(400).json({ success: false, error: 'username já existe' });

    const saltRounds = 10;
    const hash = await bcrypt.hash(password, saltRounds);
    const newUser = {
      id: (users.length > 0 ? Math.max(...users.map(u => u.id || 0)) + 1 : 1),
      username,
      displayName: displayName || username,
      role: role === 'admin' ? 'admin' : 'user',
      passwordHash: hash,
      createdAt: new Date().toISOString()
    };
    users.push(newUser);
    fs.writeFileSync(USERS_FILE, JSON.stringify(users, null, 2), 'utf8');
    return res.json({ success: true, user: { id: newUser.id, username: newUser.username, displayName: newUser.displayName, role: newUser.role } });
  } catch (err) {
    console.error('Erro /auth/register', err);
    return res.status(500).json({ success: false, error: 'erro interno' });
  }
});

// GET /api/auth/users - listar utilizadores (apenas admin)
router.get('/users', authenticateToken, requireAdmin, (req, res) => {
  try {
    // Debug: log incoming auth and user for troubleshooting (safe - no token contents)
    console.debug('GET /api/auth/users called', { requester: req.user && { username: req.user.username, role: req.user.role }, path: req.originalUrl });
    const users = loadUsers().map(u => ({ id: u.id, username: u.username, displayName: u.displayName, role: u.role, createdAt: u.createdAt }));
    return res.json({ success: true, users });
  } catch (err) {
    console.error('Erro /auth/users', err);
    return res.status(500).json({ success: false, error: 'erro interno' });
  }
});

// PUT /api/auth/users/:id/role - alterar role de um utilizador (apenas superadmin)
router.put('/users/:id/role', authenticateToken, requireSuperAdmin, (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    const { role } = req.body || {};
    if (!role) return res.status(400).json({ success: false, error: 'role é obrigatório' });

    const users = loadUsers();
    const idx = users.findIndex(u => u.id === id);
    if (idx === -1) return res.status(404).json({ success: false, error: 'utilizador não encontrado' });

    // Não permitir alterar o role do superadmin
    if (users[idx].username === 'UEPS.CSTE') return res.status(403).json({ success: false, error: 'Não é permitido alterar o role do superadmin' });

    users[idx].role = role === 'admin' ? 'admin' : 'user';
    fs.writeFileSync(USERS_FILE, JSON.stringify(users, null, 2), 'utf8');
    return res.json({ success: true, user: { id: users[idx].id, username: users[idx].username, role: users[idx].role } });
  } catch (err) {
    console.error('Erro PUT /auth/users/:id/role', err);
    return res.status(500).json({ success: false, error: 'erro interno' });
  }
});

// POST /api/auth/change-password - alterar password fornecendo username + currentPassword + newPassword
router.post('/change-password', async (req, res) => {
  try {
    const { username, currentPassword, newPassword } = req.body || {};
    if (!username || !currentPassword || !newPassword) return res.status(400).json({ success: false, error: 'username, currentPassword e newPassword são obrigatórios' });

    const users = loadUsers();
    const idx = users.findIndex(u => u.username === username);
    if (idx === -1) return res.status(404).json({ success: false, error: 'utilizador não encontrado' });

    const user = users[idx];
    const match = await bcrypt.compare(currentPassword, user.passwordHash);
    if (!match) return res.status(401).json({ success: false, error: 'credenciais inválidas' });

    const v = validatePasswordStrength(newPassword);
    if (!v.ok) return res.status(400).json({ success: false, error: v.reason });

    const saltRounds = 10;
    const hash = await bcrypt.hash(newPassword, saltRounds);
    users[idx].passwordHash = hash;
    users[idx].updatedAt = new Date().toISOString();
    saveUsers(users);

    // sucesso, não devolver dados sensíveis
    return res.json({ success: true, message: 'Password atualizada com sucesso' });
  } catch (err) {
    console.error('Erro /auth/change-password', err);
    return res.status(500).json({ success: false, error: 'erro interno' });
  }
});

// PUT /api/auth/me/password - alterar password para utilizador autenticado (verifica currentPassword)
router.put('/me/password', authenticateToken, async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body || {};
    if (!currentPassword || !newPassword) return res.status(400).json({ success: false, error: 'currentPassword e newPassword são obrigatórios' });

    const username = req.user && req.user.username;
    const users = loadUsers();
    const idx = users.findIndex(u => u.username === username);
    if (idx === -1) return res.status(404).json({ success: false, error: 'utilizador não encontrado' });

    const match = await bcrypt.compare(currentPassword, users[idx].passwordHash);
    if (!match) return res.status(401).json({ success: false, error: 'credenciais inválidas' });

    const v = validatePasswordStrength(newPassword);
    if (!v.ok) return res.status(400).json({ success: false, error: v.reason });

    const saltRounds = 10;
    const hash = await bcrypt.hash(newPassword, saltRounds);
    users[idx].passwordHash = hash;
    users[idx].updatedAt = new Date().toISOString();
    saveUsers(users);

    return res.json({ success: true, message: 'Password atualizada com sucesso' });
  } catch (err) {
    console.error('Erro PUT /auth/me/password', err);
    return res.status(500).json({ success: false, error: 'erro interno' });
  }
});

// DELETE /api/auth/users/:id - eliminar utilizador (apenas superadmin)
router.delete('/users/:id', authenticateToken, requireSuperAdmin, (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    const users = loadUsers();
    const idx = users.findIndex(u => u.id === id);
    if (idx === -1) return res.status(404).json({ success: false, error: 'utilizador não encontrado' });

    // Não permitir eliminar o superadmin
    if (users[idx].username === 'UEPS.CSTE') return res.status(403).json({ success: false, error: 'Não é permitido eliminar o superadmin' });

    const removed = users.splice(idx, 1)[0];
    fs.writeFileSync(USERS_FILE, JSON.stringify(users, null, 2), 'utf8');
    return res.json({ success: true, removed: { id: removed.id, username: removed.username } });
  } catch (err) {
    console.error('Erro DELETE /auth/users/:id', err);
    return res.status(500).json({ success: false, error: 'erro interno' });
  }
});

// Export router e o middleware para uso noutras partes da aplicação
module.exports = router;
module.exports.authenticateToken = authenticateToken;
