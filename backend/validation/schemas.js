const { z } = require('zod');

const CASE_STATUSES = ['new', 'triage', 'mobilization', 'active_search', 'suspended', 'found_alive', 'found_deceased', 'closed'];
const PRIORITIES = ['routine', 'urgent', 'very_urgent'];
const RISK_LEVELS = ['normal', 'moderate', 'high'];
const TASK_STATUSES = ['pending', 'assigned', 'in_progress', 'completed', 'cancelled'];
const AREA_STATUSES = ['planned', 'assigned', 'in_progress', 'searched', 'cancelled'];
const TEAM_STATUSES = ['available', 'assigned', 'active', 'resting', 'unavailable'];
const TEAM_TYPES = ['ground', 'patrol', 'drone', 'k9', 'medical', 'command', 'other'];
const CLUE_RELIABILITIES = ['unknown', 'low', 'medium', 'high', 'confirmed'];
const GIS_EXPORT_FORMATS = ['geojson', 'json', 'kml', 'gpx'];

const optionalText = z.preprocess(value => {
  if (value === undefined || value === null) return null;
  const text = String(value).trim();
  return text === '' ? null : text;
}, z.string().nullable());

const requiredText = z.preprocess(value => typeof value === 'string' ? value.trim() : value, z.string().min(1));

function optionalNumber(min, max) {
  return z.preprocess(value => {
    if (value === undefined || value === null || value === '') return null;
    return value;
  }, z.coerce.number().min(min).max(max).nullable());
}

const optionalLatitude = optionalNumber(-90, 90);
const optionalLongitude = optionalNumber(-180, 180);
const optionalPositiveNumber = z.preprocess(value => {
  if (value === undefined || value === null || value === '') return null;
  return value;
}, z.coerce.number().positive().nullable());

const caseStatusSchema = z.enum(CASE_STATUSES);
const prioritySchema = z.enum(PRIORITIES);
const riskLevelSchema = z.enum(RISK_LEVELS);
const taskStatusSchema = z.enum(TASK_STATUSES);
const areaStatusSchema = z.enum(AREA_STATUSES);
const teamStatusSchema = z.enum(TEAM_STATUSES);
const teamTypeSchema = z.enum(TEAM_TYPES);
const clueReliabilitySchema = z.enum(CLUE_RELIABILITIES);
const gisExportFormatSchema = z.enum(GIS_EXPORT_FORMATS);

const quickCaseBodySchema = z.object({
  person_name: requiredText.optional(),
  personName: requiredText.optional(),
  nome: requiredText.optional(),
  Nome_Completo: requiredText.optional(),
  approximate_age: optionalNumber(0, 130).optional(),
  idade: optionalNumber(0, 130).optional(),
  Idade_Exacta: optionalNumber(0, 130).optional(),
  person_sex: optionalText.optional(),
  sexo: optionalText.optional(),
  Sexo: optionalText.optional(),
  reporter_name: optionalText.optional(),
  denunciante: optionalText.optional(),
  Denunciante_Nome: optionalText.optional(),
  reporter_contact: optionalText.optional(),
  contacto: optionalText.optional(),
  Denunciante_Contacto: optionalText.optional(),
  last_seen_location: optionalText.optional(),
  local: optionalText.optional(),
  Local_Ultimo_Avistamento: optionalText.optional(),
  last_seen_at: optionalText.optional(),
  data_hora: optionalText.optional(),
  latitude: optionalLatitude.optional(),
  lat: optionalLatitude.optional(),
  longitude: optionalLongitude.optional(),
  lon: optionalLongitude.optional(),
  risk_level: riskLevelSchema.optional(),
  risco: riskLevelSchema.optional(),
  priority: prioritySchema.optional(),
  prioridade: prioritySchema.optional(),
  notes: optionalText.optional(),
  observacoes: optionalText.optional()
}).passthrough().refine(value => Boolean(value.person_name || value.personName || value.nome || value.Nome_Completo), {
  message: 'Nome/descrição da pessoa é obrigatório'
});

const caseStatusBodySchema = z.object({
  status: caseStatusSchema.optional(),
  estado: caseStatusSchema.optional(),
  justification: requiredText.optional(),
  justificacao: requiredText.optional()
}).passthrough()
  .refine(value => Boolean(value.status || value.estado), { message: 'Estado operacional é obrigatório' })
  .refine(value => Boolean(value.justification || value.justificacao), { message: 'Justificação é obrigatória' });

const clueBodySchema = z.object({
  clue_type: optionalText.optional(),
  tipo: optionalText.optional(),
  description: requiredText.optional(),
  descricao: requiredText.optional(),
  reliability: clueReliabilitySchema.optional(),
  fiabilidade: clueReliabilitySchema.optional(),
  latitude: optionalLatitude.optional(),
  lat: optionalLatitude.optional(),
  longitude: optionalLongitude.optional(),
  lon: optionalLongitude.optional(),
  observed_at: optionalText.optional(),
  observado_em: optionalText.optional(),
  reported_by: optionalText.optional(),
  reportado_por: optionalText.optional()
}).passthrough().refine(value => Boolean(value.description || value.descricao), { message: 'Descrição da pista é obrigatória' });

const taskBodySchema = z.object({
  source_clue_id: optionalText.optional(),
  clue_id: optionalText.optional(),
  title: requiredText.optional(),
  titulo: requiredText.optional(),
  description: optionalText.optional(),
  descricao: optionalText.optional(),
  status: taskStatusSchema.optional(),
  priority: prioritySchema.optional(),
  prioridade: prioritySchema.optional(),
  due_at: optionalText.optional(),
  prazo: optionalText.optional(),
  latitude: optionalLatitude.optional(),
  lat: optionalLatitude.optional(),
  longitude: optionalLongitude.optional(),
  lon: optionalLongitude.optional()
}).passthrough().refine(value => Boolean(value.title || value.titulo), { message: 'Título da tarefa é obrigatório' });

const taskStatusBodySchema = z.object({
  status: taskStatusSchema.optional(),
  estado: taskStatusSchema.optional(),
  result: optionalText.optional(),
  resultado: optionalText.optional()
}).passthrough().refine(value => Boolean(value.status || value.estado), { message: 'Estado da tarefa é obrigatório' });

const taskTeamBodySchema = z.object({
  team_id: requiredText.optional(),
  teamId: requiredText.optional()
}).passthrough().refine(value => Boolean(value.team_id || value.teamId), { message: 'ID da equipa é obrigatório' });

const teamBodySchema = z.object({
  name: requiredText,
  team_type: teamTypeSchema.optional(),
  tipo: teamTypeSchema.optional(),
  contact: optionalText.optional(),
  contacto: optionalText.optional(),
  status: teamStatusSchema.optional()
}).passthrough();

const teamStatusBodySchema = z.object({
  status: teamStatusSchema
}).passthrough();

const searchAreaBodySchema = z.object({
  name: requiredText.optional(),
  nome: requiredText.optional(),
  team_id: optionalText.optional(),
  teamId: optionalText.optional(),
  geometry: z.unknown().optional(),
  geojson: z.unknown().optional(),
  area_geojson: z.unknown().optional(),
  latitude: optionalLatitude.optional(),
  lat: optionalLatitude.optional(),
  longitude: optionalLongitude.optional(),
  lon: optionalLongitude.optional(),
  radius_meters: optionalPositiveNumber.optional(),
  radiusMeters: optionalPositiveNumber.optional(),
  raio_metros: optionalPositiveNumber.optional(),
  status: areaStatusSchema.optional(),
  priority: prioritySchema.optional(),
  prioridade: prioritySchema.optional(),
  notes: optionalText.optional(),
  notas: optionalText.optional()
}).passthrough().refine(value => Boolean(value.name || value.nome), { message: 'Nome da área é obrigatório' });

const searchAreaStatusBodySchema = z.object({
  status: areaStatusSchema.optional(),
  estado: areaStatusSchema.optional()
}).passthrough().refine(value => Boolean(value.status || value.estado), { message: 'Estado da área é obrigatório' });

const searchAreaGeometryBodySchema = z.object({
  geometry: z.unknown().optional(),
  geojson: z.unknown().optional(),
  area_geojson: z.unknown().optional()
}).passthrough().refine(value => Boolean(value.geometry || value.geojson || value.area_geojson), { message: 'Geometry GeoJSON é obrigatório' });

const syncOperationSchema = z.object({
  client_operation_id: requiredText.optional(),
  clientOperationId: requiredText.optional(),
  id: requiredText.optional(),
  source_device_id: requiredText.optional(),
  sourceDeviceId: requiredText.optional(),
  device_id: requiredText.optional(),
  entity_type: requiredText.optional(),
  entityType: requiredText.optional(),
  operation_type: z.enum(['create', 'update', 'delete', 'attach']).optional(),
  operationType: z.enum(['create', 'update', 'delete', 'attach']).optional(),
  payload: z.record(z.unknown()).default({})
}).passthrough()
  .refine(value => Boolean(value.client_operation_id || value.clientOperationId || value.id), { message: 'client_operation_id é obrigatório' })
  .refine(value => Boolean(value.entity_type || value.entityType), { message: 'entity_type é obrigatório' });

const syncPushBodySchema = z.object({
  operations: z.array(syncOperationSchema).min(1, 'operations é obrigatório')
});

module.exports = {
  CASE_STATUSES,
  PRIORITIES,
  RISK_LEVELS,
  TASK_STATUSES,
  AREA_STATUSES,
  TEAM_STATUSES,
  TEAM_TYPES,
  CLUE_RELIABILITIES,
  GIS_EXPORT_FORMATS,
  caseStatusSchema,
  prioritySchema,
  riskLevelSchema,
  taskStatusSchema,
  areaStatusSchema,
  teamStatusSchema,
  teamTypeSchema,
  clueReliabilitySchema,
  gisExportFormatSchema,
  quickCaseBodySchema,
  caseStatusBodySchema,
  clueBodySchema,
  taskBodySchema,
  taskStatusBodySchema,
  taskTeamBodySchema,
  teamBodySchema,
  teamStatusBodySchema,
  searchAreaBodySchema,
  searchAreaStatusBodySchema,
  searchAreaGeometryBodySchema,
  syncOperationSchema,
  syncPushBodySchema
};
