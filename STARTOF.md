# STARTOF - Guia de Arranque Inicial

Autor: Rui Casaca

Este guia explica como configurar a aplicação pela primeira vez, preparar a base de dados PostGIS, instalar dependências, importar os casos oficiais e colocar o sistema a correr em modo operacional.

## 1. Pré-requisitos

Antes de iniciar, confirme que tem instalado:

- Windows com PowerShell.
- Node.js LTS e npm.
- Docker Desktop ativo.
- VS Code ou outro editor.
- Acesso à pasta do projeto: `Sistema_Pessoas_Desaparecidas-main`.

Verificações rápidas:

```powershell
node --version
npm --version
docker --version
docker compose version
```

## 2. Entrar na Pasta do Projeto

```powershell
Set-Location "C:\Users\rm-casaca\Projects\Sistema_Pessoas_Desaparecidas-main"
```

## 3. Criar Configuração Local

Copie o ficheiro de exemplo:

```powershell
Copy-Item .env.example .env
```

Abra o `.env` e confirme pelo menos estes valores para desenvolvimento:

```text
NODE_ENV=development
HOST=0.0.0.0
PORT=4000
CORS_ORIGIN=*
DATABASE_URL=postgres://sar_app:change_me_dev_password@localhost:5432/sar_desaparecidos
DATA_SOURCE=db
DB_DUAL_WRITE=true
JWT_SECRET=trocar_por_um_valor_longo_e_aleatorio
```

Notas:

- `DATA_SOURCE=db` faz a aplicação ler os casos oficiais a partir da base PostGIS.
- `DB_DUAL_WRITE=true` mantém escrita paralela entre CSV e DB nos fluxos oficiais suportados.
- `JWT_SECRET` deve ser forte. Não use o valor de exemplo em ambiente real.
- `GROQ_API_KEY` é opcional; sem chave, a IA fica indisponível de forma controlada.

## 4. Subir PostgreSQL/PostGIS

Na raiz do projeto:

```powershell
docker compose up -d
```

Confirmar se o container está ativo:

```powershell
docker ps
```

O container principal esperado é `sar-postgis`.

## 5. Instalar Dependências do Backend

```powershell
Set-Location backend
npm install
```

Executar migrations:

```powershell
npm run db:migrate
```

Importar o CSV oficial para PostGIS:

```powershell
npm run db:import-csv
```

Opcional: testar primeiro sem escrever:

```powershell
npm run db:import-csv:dry-run
```

Validação TypeScript incremental do backend:

```powershell
npm run typecheck
```

## 6. Instalar Dependências do Frontend

```powershell
Set-Location ..\frontend
npm install
```

Gerar build de produção usado pelo backend integrado:

```powershell
npm run typecheck
npm run build
```

## 7. Criar Utilizador de Acesso

Volte ao backend:

```powershell
Set-Location ..\backend
```

Crie um utilizador local:

```powershell
node create_user.js --username admin --password "SenhaForte" --displayName "Administrador" --role admin
```

Guarde a password em local seguro. O ficheiro `users.json` contém hashes bcrypt e não deve ser partilhado publicamente.

## 8. Arrancar a Aplicação Integrada

A partir da raiz do projeto:

```powershell
Set-Location "C:\Users\rm-casaca\Projects\Sistema_Pessoas_Desaparecidas-main"
$env:DATA_SOURCE='db'
$env:DB_DUAL_WRITE='true'
node backend/server.js
```

Abrir no browser:

```text
http://localhost:4000/app
```

Endpoints úteis:

```text
http://localhost:4000/api/health
http://localhost:4000/api/db/status
http://localhost:4000/api/status
```

## 9. Arranque em Modo Desenvolvimento Separado

Terminal 1 - backend:

```powershell
Set-Location "C:\Users\rm-casaca\Projects\Sistema_Pessoas_Desaparecidas-main\backend"
$env:DATA_SOURCE='db'
$env:DB_DUAL_WRITE='true'
npm start
```

Terminal 2 - frontend React:

```powershell
Set-Location "C:\Users\rm-casaca\Projects\Sistema_Pessoas_Desaparecidas-main\frontend"
npm start
```

Neste modo, o frontend CRA abre normalmente em:

```text
http://localhost:3000
```

## 10. Fluxo de Verificação Funcional

Depois de entrar na aplicação:

1. Fazer login com o utilizador criado.
2. Abrir `Registo Rápido SAR` e criar um caso mínimo.
3. Abrir a ficha do caso.
4. Alterar o estado SAR com justificação.
5. Criar uma pista.
6. Criar uma tarefa.
7. Desenhar uma área de busca no mapa.
8. Desenhar um trilho.
9. Exportar GIS em GeoJSON, KML ou GPX.
10. Confirmar eventos na timeline operacional.

## 11. Validação Técnica

Backend:

```powershell
Set-Location "C:\Users\rm-casaca\Projects\Sistema_Pessoas_Desaparecidas-main\backend"
npm run typecheck
npm test
node --check server.js
node --check dbRoutes.js
node --check syncRoutes.js
```

Frontend:

```powershell
Set-Location "C:\Users\rm-casaca\Projects\Sistema_Pessoas_Desaparecidas-main\frontend"
npm run typecheck
npm run build
```

Health check:

```powershell
Invoke-RestMethod -Uri "http://localhost:4000/api/health" -Method GET
```

## 12. Problemas Comuns

Docker não está ativo:

```text
Erro de ligação à DB ou container não encontrado.
```

Solução: abrir Docker Desktop e repetir `docker compose up -d`.

DB sem tabelas:

```text
relation does not exist
```

Solução:

```powershell
Set-Location backend
npm run db:migrate
```

Sem casos na aplicação:

```powershell
Set-Location backend
npm run db:import-csv
```

IA indisponível:

```text
GROQ_API_KEY ausente
```

Solução: configurar `GROQ_API_KEY` no `.env` se quiser usar IA.

Aviso de `JWT_SECRET`:

```text
JWT_SECRET não definido; a usar segredo local de desenvolvimento.
```

Solução: definir `JWT_SECRET` no `.env` ou no terminal antes de arrancar.

## 13. Comandos de Manutenção

Exportar CSV oficial a partir da DB:

```powershell
Set-Location backend
npm run db:export-csv
```

Backfill de eventos de criação:

```powershell
npm run db:backfill-events
```

Ver contagens diretamente no PostGIS:

```powershell
docker exec sar-postgis psql -U sar_app -d sar_desaparecidos -c "SELECT count(*) FROM cases;"
```

## 14. Notas de Produção

Antes de usar fora de ambiente local:

- Trocar `JWT_SECRET` por um valor forte.
- Trocar `CORS_ORIGIN=*` por origens explícitas.
- Rever permissões dos endpoints `/api/db` e `/api/sync`.
- Manter `npm run typecheck`, `npm test` e `npm run build` verdes antes de qualquer entrega.
- Fazer backup regular da base PostGIS.
- Rever vulnerabilidades npm com `npm audit`.
- Não partilhar `.env`, `users.json`, exports, documentos gerados ou dados reais.
