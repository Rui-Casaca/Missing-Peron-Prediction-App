CREATE EXTENSION IF NOT EXISTS postgis;
CREATE EXTENSION IF NOT EXISTS pgcrypto;

BEGIN;

CREATE TABLE IF NOT EXISTS app_users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  username text NOT NULL UNIQUE,
  display_name text NOT NULL,
  role text NOT NULL DEFAULT 'operator' CHECK (role IN ('operator', 'team_leader', 'coordinator', 'analyst', 'admin', 'superadmin')),
  password_hash text,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS operational_units (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  code text UNIQUE,
  parent_id uuid REFERENCES operational_units(id),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS cases (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  official_case_number text UNIQUE,
  legacy_csv_id text,
  status text NOT NULL DEFAULT 'new' CHECK (status IN ('new', 'triage', 'mobilization', 'active_search', 'suspended', 'found_alive', 'found_deceased', 'closed')),
  priority text NOT NULL DEFAULT 'routine' CHECK (priority IN ('routine', 'urgent', 'very_urgent')),
  risk_level text NOT NULL DEFAULT 'normal' CHECK (risk_level IN ('normal', 'moderate', 'high')),
  person_name text NOT NULL,
  person_age integer,
  person_sex text,
  disappearance_type text,
  last_seen_at timestamptz,
  last_seen_location text,
  freguesia text,
  concelho text,
  last_seen_point geometry(Point, 4326),
  found_at timestamptz,
  found_location text,
  found_point geometry(Point, 4326),
  official_payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_by uuid REFERENCES app_users(id),
  assigned_unit_id uuid REFERENCES operational_units(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  synced_at timestamptz
);

CREATE INDEX IF NOT EXISTS idx_cases_status ON cases(status);
CREATE INDEX IF NOT EXISTS idx_cases_priority ON cases(priority);
CREATE INDEX IF NOT EXISTS idx_cases_risk_level ON cases(risk_level);
CREATE INDEX IF NOT EXISTS idx_cases_last_seen_at ON cases(last_seen_at);
CREATE INDEX IF NOT EXISTS idx_cases_concelho ON cases(concelho);
CREATE INDEX IF NOT EXISTS idx_cases_last_seen_point ON cases USING gist(last_seen_point);
CREATE INDEX IF NOT EXISTS idx_cases_found_point ON cases USING gist(found_point);

CREATE TABLE IF NOT EXISTS risk_assessments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  case_id uuid NOT NULL REFERENCES cases(id) ON DELETE CASCADE,
  person_risk text NOT NULL DEFAULT 'normal',
  temporal_urgency text NOT NULL DEFAULT 'routine',
  search_complexity text NOT NULL DEFAULT 'unknown',
  team_risk text NOT NULL DEFAULT 'unknown',
  operational_priority text NOT NULL DEFAULT 'routine',
  active_indicators jsonb NOT NULL DEFAULT '[]'::jsonb,
  score integer NOT NULL DEFAULT 0,
  source text NOT NULL DEFAULT 'system',
  created_by uuid REFERENCES app_users(id),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_risk_assessments_case_id ON risk_assessments(case_id);

CREATE TABLE IF NOT EXISTS case_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  case_id uuid NOT NULL REFERENCES cases(id) ON DELETE CASCADE,
  event_type text NOT NULL,
  summary text NOT NULL,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  event_point geometry(Point, 4326),
  event_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES app_users(id),
  source_device_id text,
  offline_operation_id uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_case_events_case_id ON case_events(case_id);
CREATE INDEX IF NOT EXISTS idx_case_events_event_at ON case_events(event_at);
CREATE INDEX IF NOT EXISTS idx_case_events_event_point ON case_events USING gist(event_point);

CREATE TABLE IF NOT EXISTS search_teams (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  team_type text NOT NULL DEFAULT 'ground',
  contact text,
  unit_id uuid REFERENCES operational_units(id),
  status text NOT NULL DEFAULT 'available' CHECK (status IN ('available', 'assigned', 'active', 'resting', 'unavailable')),
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS search_tasks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  case_id uuid NOT NULL REFERENCES cases(id) ON DELETE CASCADE,
  team_id uuid REFERENCES search_teams(id),
  title text NOT NULL,
  description text,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'assigned', 'in_progress', 'completed', 'cancelled')),
  priority text NOT NULL DEFAULT 'routine' CHECK (priority IN ('routine', 'urgent', 'very_urgent')),
  due_at timestamptz,
  task_point geometry(Point, 4326),
  result text,
  created_by uuid REFERENCES app_users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_search_tasks_case_id ON search_tasks(case_id);
CREATE INDEX IF NOT EXISTS idx_search_tasks_team_id ON search_tasks(team_id);
CREATE INDEX IF NOT EXISTS idx_search_tasks_status ON search_tasks(status);
CREATE INDEX IF NOT EXISTS idx_search_tasks_task_point ON search_tasks USING gist(task_point);

CREATE TABLE IF NOT EXISTS clues (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  case_id uuid NOT NULL REFERENCES cases(id) ON DELETE CASCADE,
  clue_type text NOT NULL DEFAULT 'observation',
  description text NOT NULL,
  reliability text NOT NULL DEFAULT 'unknown' CHECK (reliability IN ('unknown', 'low', 'medium', 'high', 'confirmed')),
  clue_point geometry(Point, 4326),
  observed_at timestamptz,
  reported_by text,
  created_by uuid REFERENCES app_users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_clues_case_id ON clues(case_id);
CREATE INDEX IF NOT EXISTS idx_clues_reliability ON clues(reliability);
CREATE INDEX IF NOT EXISTS idx_clues_clue_point ON clues USING gist(clue_point);

CREATE TABLE IF NOT EXISTS search_areas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  case_id uuid NOT NULL REFERENCES cases(id) ON DELETE CASCADE,
  team_id uuid REFERENCES search_teams(id),
  name text NOT NULL,
  status text NOT NULL DEFAULT 'planned' CHECK (status IN ('planned', 'assigned', 'in_progress', 'searched', 'cancelled')),
  priority text NOT NULL DEFAULT 'routine' CHECK (priority IN ('routine', 'urgent', 'very_urgent')),
  area geometry(MultiPolygon, 4326) NOT NULL,
  notes text,
  created_by uuid REFERENCES app_users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_search_areas_case_id ON search_areas(case_id);
CREATE INDEX IF NOT EXISTS idx_search_areas_team_id ON search_areas(team_id);
CREATE INDEX IF NOT EXISTS idx_search_areas_area ON search_areas USING gist(area);

CREATE TABLE IF NOT EXISTS search_tracks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  case_id uuid NOT NULL REFERENCES cases(id) ON DELETE CASCADE,
  team_id uuid REFERENCES search_teams(id),
  source text NOT NULL DEFAULT 'manual',
  track geometry(LineString, 4326) NOT NULL,
  started_at timestamptz,
  ended_at timestamptz,
  distance_meters numeric,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_search_tracks_case_id ON search_tracks(case_id);
CREATE INDEX IF NOT EXISTS idx_search_tracks_team_id ON search_tracks(team_id);
CREATE INDEX IF NOT EXISTS idx_search_tracks_track ON search_tracks USING gist(track);

CREATE TABLE IF NOT EXISTS attachments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  case_id uuid REFERENCES cases(id) ON DELETE CASCADE,
  event_id uuid REFERENCES case_events(id) ON DELETE SET NULL,
  clue_id uuid REFERENCES clues(id) ON DELETE SET NULL,
  file_name text NOT NULL,
  content_type text,
  storage_path text NOT NULL,
  sha256 text,
  size_bytes bigint,
  created_by uuid REFERENCES app_users(id),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_attachments_case_id ON attachments(case_id);

CREATE TABLE IF NOT EXISTS llm_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  case_id uuid REFERENCES cases(id) ON DELETE CASCADE,
  provider text NOT NULL,
  model text NOT NULL,
  prompt_version text NOT NULL DEFAULT 'unversioned',
  prompt text NOT NULL,
  response text,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'success', 'failed')),
  error text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_by uuid REFERENCES app_users(id),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_llm_runs_case_id ON llm_runs(case_id);

CREATE TABLE IF NOT EXISTS exports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  case_id uuid REFERENCES cases(id) ON DELETE CASCADE,
  export_type text NOT NULL,
  file_name text NOT NULL,
  storage_path text NOT NULL,
  data_version timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES app_users(id),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_exports_case_id ON exports(case_id);

CREATE TABLE IF NOT EXISTS sync_operations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_operation_id uuid NOT NULL UNIQUE,
  source_device_id text NOT NULL,
  entity_type text NOT NULL,
  entity_id uuid,
  operation_type text NOT NULL CHECK (operation_type IN ('create', 'update', 'delete', 'attach')),
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'applied', 'conflict', 'failed')),
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  conflict_payload jsonb,
  error text,
  created_by uuid REFERENCES app_users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  applied_at timestamptz
);

CREATE INDEX IF NOT EXISTS idx_sync_operations_status ON sync_operations(status);
CREATE INDEX IF NOT EXISTS idx_sync_operations_device ON sync_operations(source_device_id);
CREATE INDEX IF NOT EXISTS idx_sync_operations_entity ON sync_operations(entity_type, entity_id);

COMMIT;
