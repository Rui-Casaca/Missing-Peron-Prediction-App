export const CASE_STATUSES = [
  'new',
  'triage',
  'mobilization',
  'active_search',
  'suspended',
  'found_alive',
  'found_deceased',
  'closed'
] as const;

export const PRIORITIES = ['routine', 'urgent', 'very_urgent'] as const;
export const RISK_LEVELS = ['normal', 'moderate', 'high'] as const;
export const TASK_STATUSES = ['pending', 'assigned', 'in_progress', 'completed', 'cancelled'] as const;
export const AREA_STATUSES = ['planned', 'assigned', 'in_progress', 'searched', 'cancelled'] as const;
export const TEAM_STATUSES = ['available', 'assigned', 'active', 'resting', 'unavailable'] as const;
export const TEAM_TYPES = ['ground', 'patrol', 'drone', 'k9', 'medical', 'command', 'other'] as const;
export const CLUE_RELIABILITIES = ['unknown', 'low', 'medium', 'high', 'confirmed'] as const;
export const GIS_EXPORT_FORMATS = ['geojson', 'json', 'kml', 'gpx'] as const;

export type CaseStatus = typeof CASE_STATUSES[number];
export type Priority = typeof PRIORITIES[number];
export type RiskLevel = typeof RISK_LEVELS[number];
export type TaskStatus = typeof TASK_STATUSES[number];
export type SearchAreaStatus = typeof AREA_STATUSES[number];
export type TeamStatus = typeof TEAM_STATUSES[number];
export type TeamType = typeof TEAM_TYPES[number];
export type ClueReliability = typeof CLUE_RELIABILITIES[number];
export type GisExportFormat = typeof GIS_EXPORT_FORMATS[number];

export type ApiSuccess<T> = { success: true } & T;
export type ApiFailure = { success: false; error: string; details?: unknown };
export type ApiResponse<T> = ApiSuccess<T> | ApiFailure;

export interface Coordinates {
  latitude: number;
  longitude: number;
}

export interface OfficialCsvRow {
  ID_Caso?: string;
  Nome_Completo?: string;
  Nome?: string;
  Idade_Exacta?: string;
  Sexo?: string;
  Risco_Calculado?: string;
  Avaliacao_Prioridade?: string;
  Local_Ultimo_Avistamento?: string;
  Latitude?: string;
  Longitude?: string;
  [field: string]: string | undefined;
}

export interface OperationalCase {
  id: string;
  official_case_number?: string | null;
  legacy_csv_id?: string | null;
  status: CaseStatus;
  priority: Priority;
  risk_level: RiskLevel;
  person_name: string;
  person_age?: number | null;
  person_sex?: string | null;
  last_seen_at?: string | null;
  last_seen_location?: string | null;
  freguesia?: string | null;
  concelho?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  found_at?: string | null;
  found_location?: string | null;
  found_latitude?: number | null;
  found_longitude?: number | null;
  official_payload: Record<string, unknown>;
  created_at?: string | null;
  updated_at?: string | null;
}

export interface CaseEvent {
  id: string;
  case_id: string;
  event_type: string;
  summary: string;
  payload: Record<string, unknown>;
  latitude?: number | null;
  longitude?: number | null;
  event_at: string;
}

export interface AuthUser {
  id: string | number;
  username: string;
  displayName: string;
  role: 'user' | 'admin' | 'superadmin' | string;
}

export interface SyncOperation<TPayload = Record<string, unknown>> {
  client_operation_id: string;
  source_device_id: string;
  entity_type: string;
  operation_type: 'create' | 'update' | 'delete' | 'attach';
  payload: TPayload;
}

export interface EvidenceEntry {
  id: string;
  label: string;
  value: unknown;
  source: string;
  trusted: boolean;
  untrusted_text: boolean;
}

export interface AiAnalysisItem {
  title: string;
  description: string;
  evidence_ids: string[];
  confidence: 'baixa' | 'media' | 'alta';
  rationale: string;
  not_decision: true;
  human_review_required: true;
}

export interface AiAnalysis {
  summary: string;
  priorities: AiAnalysisItem[];
  immediate_actions: AiAnalysisItem[];
  hypotheses: AiAnalysisItem[];
  missing_information: string[];
  safety_warnings: string[];
  limitations: string[];
  guardrail_flags: Array<Record<string, unknown>>;
}
