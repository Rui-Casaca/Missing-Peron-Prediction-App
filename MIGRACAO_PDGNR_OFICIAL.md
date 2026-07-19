# Migração PDGNR Oficial para Núcleo Operacional SAR

Este documento descreve o estado atual da migração: o formulário e CSV oficial PDGNR M 1-04-02 continuam preservados, mas a aplicação evoluiu para uma plataforma operacional SAR com PostgreSQL/PostGIS como fonte de trabalho.

## Objetivo da Migração

- Manter compatibilidade com o ficheiro `historico_casos_pdgnr_oficial.csv`.
- Usar PostGIS para consulta, mapa, timeline, pistas, tarefas, equipas, áreas, tracks e sincronização.
- Permitir transição gradual com `DATA_SOURCE=csv|db`.
- Guardar o payload oficial original em `cases.official_payload`.

## Componentes Migrados

- `backend/registoCasosOficial.js`: endpoints oficiais continuam disponíveis e podem ler da DB.
- `backend/db/caseMapper.js`: mapeia CSV oficial para registo operacional e reconstrói linhas oficiais.
- `backend/db/caseRepository.js`: casos, estatísticas, workflow e registo rápido.
- `backend/db/caseEventRepository.js`: timeline auditável.
- `backend/db/clueRepository.js`: pistas.
- `backend/db/taskRepository.js`: tarefas.
- `backend/db/teamRepository.js`: equipas.
- `backend/db/searchAreaRepository.js`: áreas circulares e GeoJSON.
- `backend/db/trackRepository.js`: trilhos LineString.
- `backend/gisService.js`: export GeoJSON/KML/GPX e import GeoJSON.
- `backend/syncRoutes.js`: sincronização offline idempotente.

## Base de Dados

Migrations principais:

- `backend/db/init/001_extensions.sql`: ativa `postgis` e `pgcrypto`.
- `backend/db/migrations/001_initial_operational_schema.sql`: cria tabelas operacionais.
- `backend/db/migrations/002_task_source_clue.sql`: liga tarefas à pista de origem.

Tabelas operacionais relevantes:

- `cases`
- `case_events`
- `risk_assessments`
- `operational_units`
- `search_teams`
- `search_tasks`
- `clues`
- `search_areas`
- `search_tracks`
- `attachments`
- `llm_runs`
- `exports`
- `sync_operations`

## Estratégia CSV/DB

Variáveis:

```text
DATA_SOURCE=csv|db
DB_DUAL_WRITE=false|true
```

Regras:

- `DATA_SOURCE=csv`: endpoints oficiais leem do CSV.
- `DATA_SOURCE=db`: endpoints oficiais leem casos reconstruídos a partir da DB.
- `DB_DUAL_WRITE=true`: criação oficial e marcação como encontrado escrevem também na DB.
- `official_payload` preserva a forma oficial para exportação e compatibilidade.

## Workflow SAR

Estados suportados:

```text
new
triage
mobilization
active_search
suspended
found_alive
found_deceased
closed
```

Endpoint:

```text
PATCH /api/db/casos-oficial/:id/status
```

Requer:

- `status`
- `justification`

Cada alteração gera evento `case_status_changed`.

## Registo Rápido SAR

Endpoint:

```text
POST /api/db/quick-cases
```

Cria um caso parcial em `triage`, com payload oficial mínimo e evento `quick_case_created`. O formulário oficial pode ser completado depois.

## Mapa Operacional

O detalhe do caso (`frontend/src/CaseDetail.js`) mostra:

- último avistamento;
- ponto encontrado;
- pistas com coordenadas;
- tarefas com coordenadas;
- áreas de busca;
- trilhos.

O desenho e edição usam Leaflet + Geoman. As geometrias são guardadas em PostGIS e devolvidas como GeoJSON.

## Interoperabilidade GIS

Export:

```text
GET /api/db/casos-oficial/:id/gis/export?format=geojson
GET /api/db/casos-oficial/:id/gis/export?format=kml
GET /api/db/casos-oficial/:id/gis/export?format=gpx
```

Import:

```text
POST /api/db/casos-oficial/:id/gis/import
```

O import atual suporta GeoJSON com polígonos/multipolígonos para áreas de busca.

## Offline e Sync

Frontend:

- `frontend/public/manifest.json`
- `frontend/public/service-worker.js`
- `frontend/src/offlineStore.js`
- indicador online/offline no header.

Backend:

- `POST /api/sync/push`
- `GET /api/sync/pull`
- `GET /api/sync/status`

O fluxo implementado cobre registo rápido offline com idempotência por `client_operation_id`.

## Procedimento de Migração

1. Subir PostGIS:

```powershell
docker compose up -d
```

2. Instalar backend:

```powershell
Set-Location backend
npm install
```

3. Executar migrations:

```powershell
npm run db:migrate
```

4. Importar CSV oficial:

```powershell
npm run db:import-csv
```

5. Validar status:

```text
GET /api/db/status
GET /api/health
```

6. Passar leitura operacional para DB:

```powershell
$env:DATA_SOURCE='db'
node backend/server.js
```

## Validação

Última validação executada:

- Backend `npm test`: 55/55 testes passaram.
- Frontend `npm run build`: passou.
- Smoke HTTP real:
  - `/api/health` OK;
  - registo rápido criado;
  - workflow mudou para `active_search`;
  - sync offline aplicou operação e repetição foi idempotente;
  - limpeza DB terminou com 0 casos/eventos/sync residuais.

## Notas de Produção

- Definir `JWT_SECRET` forte.
- Definir `CORS_ORIGIN` com origens explícitas.
- Rever permissões por endpoint antes de piloto real.
- Agendar backups `pg_dump` e testar restore.
- Rever vulnerabilidades npm e dependências legadas.
