# Autenticação e Segurança

O backend inclui autenticação local com bcrypt e JWT. Esta camada é suficiente para desenvolvimento e demonstração controlada, mas deve ser endurecida antes de qualquer piloto real.

## Ficheiros

- `auth.js`: router Express com login, sessão atual e middleware.
- `create_user.js`: CLI para criar utilizadores locais.
- `users.json`: armazenamento local de utilizadores e hashes bcrypt.

## Variáveis Obrigatórias

```powershell
$env:JWT_SECRET='valor_longo_aleatorio'
```

Em produção, `JWT_SECRET` deve ser obrigatório, longo e guardado fora do repositório. Em desenvolvimento existe fallback com aviso no arranque.

Também deve configurar:

```text
CORS_ORIGIN=https://origem-autorizada.example
```

## Criar Utilizador

```powershell
Set-Location backend
node create_user.js --username admin --password "SenhaForte" --displayName "Administrador" --role admin
```

## Endpoints

- `POST /api/auth/login`: autentica e devolve JWT.
- `GET /api/auth/me`: devolve utilizador autenticado.

Header esperado nas chamadas autenticadas:

```text
Authorization: Bearer <token>
```

## Papéis Atuais

O frontend já distingue `admin` e `superadmin` para gestão de utilizadores. A proteção fina dos endpoints operacionais DB ainda deve ser reforçada antes de uso real.

Recomendação para a próxima fase de segurança:

- `superadmin`: administração total.
- `commander`: gestão operacional de casos, equipas, estados e exports.
- `operator`: criação de pistas, tarefas, áreas e relatórios.
- `field_team`: registos de campo, tracks e atualizações atribuídas.
- `viewer`: consulta.

## Hardening Já Aplicado

- Headers defensivos básicos no servidor:
  - `X-Content-Type-Options: nosniff`
  - `X-Frame-Options: DENY`
  - `Referrer-Policy: no-referrer`
  - `Permissions-Policy`
- `CORS_ORIGIN` configurável.
- `/api/health` para validar API, DB, PostGIS, pgcrypto, CSV e frontend build.
- `JWT_SECRET` em produção deve ser definido explicitamente.

## Recomendações Antes de Produção

- Migrar `users.json` para `app_users` em Postgres.
- Aplicar middleware de permissões aos endpoints `/api/db` e `/api/sync`.
- Guardar `created_by`, `source_device_id` e `offline_operation_id` em todos os eventos críticos.
- Adicionar rate limiting e logging estruturado append-only.
- Rever dependências com `npm audit` e atualizar pacotes vulneráveis.
- Guardar `.env`, `users.json`, documentos e exports fora de controlo de versões.
