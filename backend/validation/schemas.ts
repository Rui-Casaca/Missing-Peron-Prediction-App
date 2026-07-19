import { z } from 'zod';
import {
  AREA_STATUSES,
  CASE_STATUSES,
  CLUE_RELIABILITIES,
  GIS_EXPORT_FORMATS,
  PRIORITIES,
  RISK_LEVELS,
  TASK_STATUSES,
  TEAM_STATUSES,
  TEAM_TYPES
} from '../types/domain';

const optionalText = z.string().trim().optional().nullable();
const requiredText = z.string().trim().min(1);

export const coordinatesSchema = z.object({
  latitude: z.coerce.number().min(-90).max(90),
  longitude: z.coerce.number().min(-180).max(180)
});

export const caseStatusSchema = z.enum(CASE_STATUSES);
export const prioritySchema = z.enum(PRIORITIES);
export const riskLevelSchema = z.enum(RISK_LEVELS);
export const taskStatusSchema = z.enum(TASK_STATUSES);
export const areaStatusSchema = z.enum(AREA_STATUSES);
export const teamStatusSchema = z.enum(TEAM_STATUSES);
export const teamTypeSchema = z.enum(TEAM_TYPES);
export const clueReliabilitySchema = z.enum(CLUE_RELIABILITIES);
export const gisExportFormatSchema = z.enum(GIS_EXPORT_FORMATS);

export const quickCaseBodySchema = z.object({
  person_name: requiredText.optional(),
  personName: requiredText.optional(),
  nome: requiredText.optional(),
  Nome_Completo: requiredText.optional(),
  approximate_age: z.coerce.number().int().min(0).max(130).optional().nullable(),
  idade: z.coerce.number().int().min(0).max(130).optional().nullable(),
  person_sex: optionalText,
  sexo: optionalText,
  reporter_name: optionalText,
  denunciante: optionalText,
  reporter_contact: optionalText,
  contacto: optionalText,
  last_seen_location: optionalText,
  local: optionalText,
  last_seen_at: optionalText,
  latitude: z.union([z.coerce.number().min(-90).max(90), z.literal(''), z.null()]).optional(),
  lat: z.union([z.coerce.number().min(-90).max(90), z.literal(''), z.null()]).optional(),
  longitude: z.union([z.coerce.number().min(-180).max(180), z.literal(''), z.null()]).optional(),
  lon: z.union([z.coerce.number().min(-180).max(180), z.literal(''), z.null()]).optional(),
  risk_level: riskLevelSchema.optional(),
  risco: optionalText,
  priority: prioritySchema.optional(),
  prioridade: optionalText,
  notes: optionalText,
  observacoes: optionalText
}).refine(value => Boolean(value.person_name || value.personName || value.nome || value.Nome_Completo), {
  message: 'Nome/descrição da pessoa é obrigatório'
});

export const caseStatusBodySchema = z.object({
  status: caseStatusSchema.optional(),
  estado: caseStatusSchema.optional(),
  justification: requiredText.optional(),
  justificacao: requiredText.optional()
}).refine(value => Boolean(value.status || value.estado), { message: 'Estado operacional é obrigatório' })
  .refine(value => Boolean(value.justification || value.justificacao), { message: 'Justificação é obrigatória' });

export const clueBodySchema = z.object({
  clue_type: optionalText,
  tipo: optionalText,
  description: requiredText.optional(),
  descricao: requiredText.optional(),
  reliability: clueReliabilitySchema.optional(),
  fiabilidade: optionalText,
  latitude: z.union([z.coerce.number().min(-90).max(90), z.literal(''), z.null()]).optional(),
  lat: z.union([z.coerce.number().min(-90).max(90), z.literal(''), z.null()]).optional(),
  longitude: z.union([z.coerce.number().min(-180).max(180), z.literal(''), z.null()]).optional(),
  lon: z.union([z.coerce.number().min(-180).max(180), z.literal(''), z.null()]).optional(),
  observed_at: optionalText,
  observado_em: optionalText,
  reported_by: optionalText,
  reportado_por: optionalText
}).refine(value => Boolean(value.description || value.descricao), { message: 'Descrição da pista é obrigatória' });

export const taskBodySchema = z.object({
  source_clue_id: optionalText,
  clue_id: optionalText,
  title: requiredText.optional(),
  titulo: requiredText.optional(),
  description: optionalText,
  descricao: optionalText,
  status: taskStatusSchema.optional(),
  priority: prioritySchema.optional(),
  prioridade: optionalText,
  due_at: optionalText,
  prazo: optionalText,
  latitude: z.union([z.coerce.number().min(-90).max(90), z.literal(''), z.null()]).optional(),
  lat: z.union([z.coerce.number().min(-90).max(90), z.literal(''), z.null()]).optional(),
  longitude: z.union([z.coerce.number().min(-180).max(180), z.literal(''), z.null()]).optional(),
  lon: z.union([z.coerce.number().min(-180).max(180), z.literal(''), z.null()]).optional()
}).refine(value => Boolean(value.title || value.titulo), { message: 'Título da tarefa é obrigatório' });

export const teamBodySchema = z.object({
  name: requiredText,
  team_type: teamTypeSchema.optional(),
  tipo: optionalText,
  contact: optionalText,
  contacto: optionalText,
  status: teamStatusSchema.optional()
});

export const syncOperationSchema = z.object({
  client_operation_id: z.string().uuid(),
  source_device_id: requiredText,
  entity_type: requiredText,
  operation_type: z.enum(['create', 'update', 'delete', 'attach']),
  payload: z.record(z.unknown()).default({})
});

export const syncPushBodySchema = z.object({
  operations: z.array(syncOperationSchema).min(1)
});

export type QuickCaseBody = z.infer<typeof quickCaseBodySchema>;
export type CaseStatusBody = z.infer<typeof caseStatusBodySchema>;
export type ClueBody = z.infer<typeof clueBodySchema>;
export type TaskBody = z.infer<typeof taskBodySchema>;
export type TeamBody = z.infer<typeof teamBodySchema>;
export type SyncPushBody = z.infer<typeof syncPushBodySchema>;
