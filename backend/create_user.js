#!/usr/bin/env node
const fs = require('fs');
const path = require('path');
const bcrypt = require('bcrypt');

const USERS_FILE = path.join(__dirname, 'users.json');

async function createUser(username, password, displayName) {
  if (!username || !password) throw new Error('username e password obrigatórios');

  const users = fs.existsSync(USERS_FILE) ? JSON.parse(fs.readFileSync(USERS_FILE,'utf8')||'[]') : [];

  if (users.find(u => u.username === username)) throw new Error('username já existe');

  const saltRounds = 10;
  const hash = await bcrypt.hash(password, saltRounds);

  const newUser = {
    id: (users.length > 0 ? Math.max(...users.map(u => u.id || 0)) + 1 : 1),
    username,
    displayName: displayName || username,
    role: 'user',
    passwordHash: hash,
    createdAt: new Date().toISOString()
  };

  users.push(newUser);
  fs.writeFileSync(USERS_FILE, JSON.stringify(users, null, 2), 'utf8');
  return newUser;
}

// CLI
async function main() {
  const argv = require('yargs/yargs')(process.argv.slice(2)).argv;
  const username = argv.username || argv.u;
  const password = argv.password || argv.p;
  const displayName = argv.displayName || argv.d;
  const role = (argv.role || argv.r || 'user').toLowerCase();

  if (!username || !password) {
    console.log('Uso: node create_user.js --username <user> --password <pass> [--displayName "Nome"] [--role admin|user]');
    process.exit(1);
  }

  try {
    const u = await createUser(username, password, displayName);
    // garantir que role é aplicada se for admin
    if (role === 'admin') {
      const users = fs.existsSync(USERS_FILE) ? JSON.parse(fs.readFileSync(USERS_FILE,'utf8')||'[]') : [];
      const found = users.find(x => x.username === username);
      if (found) {
        found.role = 'admin';
        fs.writeFileSync(USERS_FILE, JSON.stringify(users, null, 2), 'utf8');
      }
    }
    console.log('Utilizador criado com sucesso:', { id: u.id, username: u.username, role: role === 'admin' ? 'admin' : 'user' });
  } catch (e) {
    console.error('Erro ao criar utilizador:', e.message || e);
    process.exit(1);
  }
}

if (require.main === module) main();
