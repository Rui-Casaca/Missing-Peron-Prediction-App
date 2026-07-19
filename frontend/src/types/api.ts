export type ApiFailure = {
  success: false;
  error: string;
  details?: unknown;
};

export type ApiSuccess<T> = {
  success: true;
} & T;

export type ApiResponse<T> = ApiSuccess<T> | ApiFailure;

export type CaseStatus =
  | 'new'
  | 'triage'
  | 'mobilization'
  | 'active_search'
  | 'suspended'
  | 'found_alive'
  | 'found_deceased'
  | 'closed';

export type Priority = 'routine' | 'urgent' | 'very_urgent';
export type RiskLevel = 'normal' | 'moderate' | 'high';

export interface AuthUser {
  id: string | number;
  username: string;
  displayName?: string;
  role: 'user' | 'admin' | 'superadmin' | string;
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
  latitude?: number | null;
  longitude?: number | null;
  official_payload?: Record<string, unknown>;
}

export interface CaseEvent {
  id: string;
  case_id: string;
  event_type: string;
  summary: string;
  payload?: Record<string, unknown>;
  latitude?: number | null;
  longitude?: number | null;
  event_at: string;
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

export interface AiValidationResult {
  status: 'passed' | 'warning' | 'failed';
  errors: string[];
  guardrail_flags: Array<Record<string, unknown>>;
}
