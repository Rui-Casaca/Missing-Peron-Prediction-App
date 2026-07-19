#!/usr/bin/env node
const fs = require('fs');
const path = require('path');
const { withClient, closePool } = require('./index');

const migrationsDir = path.join(__dirname, 'migrations');

async function ensureMigrationsTable(client) {
  await client.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      id text PRIMARY KEY,
      applied_at timestamptz NOT NULL DEFAULT now()
    )
  `);
}

async function getAppliedMigrations(client) {
  const result = await client.query('SELECT id FROM schema_migrations');
  return new Set(result.rows.map(row => row.id));
}

async function runMigrations() {
  if (!fs.existsSync(migrationsDir)) {
    throw new Error(`Diretório de migrations não encontrado: ${migrationsDir}`);
  }

  const files = fs.readdirSync(migrationsDir)
    .filter(file => file.endsWith('.sql'))
    .sort();

  return withClient(async (client) => {
    await ensureMigrationsTable(client);
    const applied = await getAppliedMigrations(client);
    const executed = [];

    for (const file of files) {
      if (applied.has(file)) continue;

      const sql = fs.readFileSync(path.join(migrationsDir, file), 'utf8');
      await client.query(sql);
      await client.query('INSERT INTO schema_migrations (id) VALUES ($1)', [file]);
      executed.push(file);
    }

    return executed;
  });
}

if (require.main === module) {
  runMigrations()
    .then((executed) => {
      if (executed.length === 0) console.log('Sem migrations pendentes.');
      else console.log('Migrations aplicadas:', executed.join(', '));
    })
    .catch((error) => {
      console.error('Erro ao aplicar migrations:', error.message || error);
      process.exitCode = 1;
    })
    .finally(() => closePool());
}

module.exports = { runMigrations };
