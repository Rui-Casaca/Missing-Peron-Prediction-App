#!/usr/bin/env node
/**
 * Cria (ou reinicia a password de) um utilizador admin de demonstração para
 * avaliação local do projeto. Não usar em produção.
 */
const fs = require('fs');
const path = require('path');
const bcrypt = require('bcrypt');

const USERS_FILE = path.join(__dirname, '..', 'users.json');
const DEMO_USERNAME = 'demo';
const DEMO_PASSWORD = 'Demo@12345';
const DEMO_DISPLAY_NAME = 'Utilizador de Demonstração';

async function seedDemoAdmin() {
  const users = fs.existsSync(USERS_FILE) ? JSON.parse(fs.readFileSync(USERS_FILE, 'utf8') || '[]') : [];
  const passwordHash = await bcrypt.hash(DEMO_PASSWORD, 10);
  const existing = users.find(u => u.username === DEMO_USERNAME);

  if (existing) {
    existing.passwordHash = passwordHash;
    existing.role = 'admin';
    existing.displayName = DEMO_DISPLAY_NAME;
  } else {
    users.push({
      id: users.length > 0 ? Math.max(...users.map(u => u.id || 0)) + 1 : 1,
      username: DEMO_USERNAME,
      displayName: DEMO_DISPLAY_NAME,
      role: 'admin',
      passwordHash,
      createdAt: new Date().toISOString()
    });
  }

  fs.writeFileSync(USERS_FILE, JSON.stringify(users, null, 2), 'utf8');
  console.log(`Utilizador de demonstração pronto -> username: ${DEMO_USERNAME} | password: ${DEMO_PASSWORD}`);
  console.log('Este utilizador é apenas para avaliação local e não deve ser usado em produção.');
}

seedDemoAdmin().catch((error) => {
  console.error('Erro ao criar utilizador de demonstração:', error.message || error);
  process.exit(1);
});
