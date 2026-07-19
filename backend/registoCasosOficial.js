const express = require('express');
const fs = require('fs');
const path = require('path');
const csv = require('csv-parser');
const createCsvWriter = require('csv-writer').createObjectCsvWriter;
const cors = require('cors');
const { calcularRiscoOficial, determinarPrioridadeOficial, gerarRelatorioRisco } = require('./riskAssessment');
const { DebugLogger } = require('./debugLogger');
const fetch = require('node-fetch');
const { withClient, withTransaction } = require('./db');
const { buildPointWkt } = require('./db/caseMapper');
const { recordCaseEvent } = require('./db/caseEventRepository');
const { getCaseStatistics, listOfficialPayloadCases, upsertOfficialCase } = require('./db/caseRepository');

const router = express.Router();
const debugLogger = new DebugLogger();

// Importar middleware authenticateToken se disponível (fallback para passar sem autenticação)
let authenticateToken = null;
try {
  const authMod = require('./auth');
  authenticateToken = authMod.authenticateToken || null;
} catch (e) {
  // auth opcional — se não existir, as rotas continuarão a permitir requests
}

// Middleware CORS
router.use(cors({
  origin: '*',
  methods: ['GET', 'POST', 'PUT', 'DELETE'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));

// Caminho para o ficheiro CSV oficial conforme PDGNR M 1-04-02
const csvOficialPath = path.join(__dirname, '../historico_casos_pdgnr_oficial.csv');

function shouldReadOfficialFromDb() {
  return String(process.env.DATA_SOURCE || 'csv').toLowerCase() === 'db';
}

function shouldDualWriteToDb() {
  const dataSource = String(process.env.DATA_SOURCE || 'csv').toLowerCase();
  const dualWrite = String(process.env.DB_DUAL_WRITE || '').toLowerCase();
  return dataSource === 'db' || dualWrite === 'true' || dualWrite === '1' || dualWrite === 'yes';
}

async function syncOfficialCaseToDb(record, event) {
  if (!shouldDualWriteToDb()) {
    return { enabled: false };
  }

  try {
    const result = await withTransaction(async (client) => {
      const dbCase = await upsertOfficialCase(client, record);
      let dbEvent = null;
      if (event) {
        dbEvent = await recordCaseEvent(client, { ...event, caseId: dbCase.id });
      }
      return { dbCase, dbEvent };
    });

    return {
      enabled: true,
      success: true,
      caseId: result.dbCase.id,
      eventId: result.dbEvent ? result.dbEvent.id : null
    };
  } catch (error) {
    debugLogger.warn('Falha na escrita paralela em PostGIS', error.message || error);
    return {
      enabled: true,
      success: false,
      error: error.message || String(error)
    };
  }
}

// Headers CSV conforme Manual PDGNR M 1-04-02 - ESTRUTURA COMPLETA
const csvHeadersOficial = [
  { id: 'ID_Caso', title: 'ID_Caso' },
  { id: 'Data_Registo', title: 'Data_Registo' },
  { id: 'Hora_Registo', title: 'Hora_Registo' },
  
  // 1. DADOS DO DENUNCIANTE
  { id: 'Denunciante_Nome', title: 'Denunciante_Nome' },
  { id: 'Denunciante_Relacao', title: 'Denunciante_Relacao' },
  { id: 'Denunciante_Contacto', title: 'Denunciante_Contacto' },
  { id: 'Denunciante_Contacto_Alternativo', title: 'Denunciante_Contacto_Alternativo' },
  { id: 'Denunciante_Endereco', title: 'Denunciante_Endereco' },
  { id: 'Denunciante_Email', title: 'Denunciante_Email' },
  { id: 'Data_Denuncia', title: 'Data_Denuncia' },
  { id: 'Hora_Denuncia', title: 'Hora_Denuncia' },
  { id: 'Denunciante_Disponibilidade', title: 'Denunciante_Disponibilidade' },
  
  // 2. IDENTIFICAÇÃO PESSOAL
  { id: 'Nome_Completo', title: 'Nome_Completo' },
  { id: 'Idade_Exacta', title: 'Idade_Exacta' },
  { id: 'Data_Nascimento', title: 'Data_Nascimento' },
  { id: 'Sexo', title: 'Sexo' },
  { id: 'Nacionalidade', title: 'Nacionalidade' },
  { id: 'Estado_Civil', title: 'Estado_Civil' },
  { id: 'Possui_Filhos', title: 'Possui_Filhos' },
  { id: 'Linguas_Faladas', title: 'Linguas_Faladas' },
  
  // 3. LOCAL E CIRCUNSTÂNCIAS
  { id: 'Data_Desaparecimento', title: 'Data_Desaparecimento' },
  { id: 'Hora_Desaparecimento', title: 'Hora_Desaparecimento' },
  { id: 'Local_Ultimo_Avistamento', title: 'Local_Ultimo_Avistamento' },
  { id: 'Concelho', title: 'Concelho' },
  { id: 'Freguesia', title: 'Freguesia' },
  { id: 'Morada_Exacta_Coordenadas', title: 'Morada_Exacta_Coordenadas' },
  { id: 'Tipo_Local', title: 'Tipo_Local' },
  { id: 'Endereco_Domicilio_Habitual', title: 'Endereco_Domicilio_Habitual' },

  // GEO e METEOROLOGIA (calculados/obtidos)
  { id: 'Latitude', title: 'Latitude' },
  { id: 'Longitude', title: 'Longitude' },
  { id: 'Meteorologia_Descricao', title: 'Meteorologia_Descricao' },
  { id: 'Temperatura_C', title: 'Temperatura_C' },
  { id: 'Humidade_percent', title: 'Humidade_percent' },
  { id: 'Precipitacao_mm', title: 'Precipitacao_mm' },
  { id: 'Vento_kmh', title: 'Vento_kmh' },
  
  // 4. DESCRIÇÃO FÍSICA
  { id: 'Altura', title: 'Altura' },
  { id: 'Peso', title: 'Peso' },
  { id: 'Compleicao_Fisica', title: 'Compleicao_Fisica' },
  { id: 'Cor_Cabelos', title: 'Cor_Cabelos' },
  { id: 'Comprimento_Cabelos', title: 'Comprimento_Cabelos' },
  { id: 'Cor_Olhos', title: 'Cor_Olhos' },
  { id: 'Cor_Pele', title: 'Cor_Pele' },
  { id: 'Barba_Bigode', title: 'Barba_Bigode' },
  { id: 'Tamanho_Calcado', title: 'Tamanho_Calcado' },
  { id: 'Elementos_Distintivos', title: 'Elementos_Distintivos' },
  
  // 5. VESTUÁRIO E ACESSÓRIOS
  { id: 'Roupa_Superior', title: 'Roupa_Superior' },
  { id: 'Roupa_Inferior', title: 'Roupa_Inferior' },
  { id: 'Calcado', title: 'Calcado' },
  { id: 'Casaco_Agasalho', title: 'Casaco_Agasalho' },
  { id: 'Acessorios', title: 'Acessorios' },
  { id: 'Fotografia_Recente', title: 'Fotografia_Recente' },
  
  // 6. ESTADO DE SAÚDE E VULNERABILIDADES
  { id: 'Possui_Incapacidade_Cognitiva', title: 'Possui_Incapacidade_Cognitiva' },
  { id: 'Especificar_Incapacidade', title: 'Especificar_Incapacidade' },
  { id: 'Possui_Anomalia_Psiquica', title: 'Possui_Anomalia_Psiquica' },
  { id: 'Especificar_Anomalia', title: 'Especificar_Anomalia' },
  { id: 'Possui_Perturbacoes_Mentais', title: 'Possui_Perturbacoes_Mentais' },
  { id: 'Especificar_Perturbacoes', title: 'Especificar_Perturbacoes' },
  { id: 'Possui_Doencas_Neurodegenerativas', title: 'Possui_Doencas_Neurodegenerativas' },
  { id: 'Especificar_Neurodegenerativas', title: 'Especificar_Neurodegenerativas' },
  { id: 'Possui_Doencas_Cronicas', title: 'Possui_Doencas_Cronicas' },
  { id: 'Especificar_Cronicas', title: 'Especificar_Cronicas' },
  { id: 'Falta_Autonomia', title: 'Falta_Autonomia' },
  { id: 'Motivo_Falta_Autonomia', title: 'Motivo_Falta_Autonomia' },
  { id: 'Segue_Tratamento_Medico', title: 'Segue_Tratamento_Medico' },
  { id: 'Medicamentos_Vitais_Necessarios', title: 'Medicamentos_Vitais_Necessarios' },
  { id: 'Especificar_Medicamentos', title: 'Especificar_Medicamentos' },
  { id: 'Transporta_Medicamentos', title: 'Transporta_Medicamentos' },
  { id: 'Condicao_Fisica_Geral', title: 'Condicao_Fisica_Geral' },
  
  // 7. CONTACTOS E COMUNICAÇÕES
  { id: 'Telefone_Principal', title: 'Telefone_Principal' },
  { id: 'Telemovel_Principal', title: 'Telemovel_Principal' },
  { id: 'Operador_Rede', title: 'Operador_Rede' },
  { id: 'Outros_Contactos', title: 'Outros_Contactos' },
  { id: 'Contas_Email', title: 'Contas_Email' },
  { id: 'Perfis_Redes_Sociais', title: 'Perfis_Redes_Sociais' },
  
  // 8. VEÍCULOS E MEIOS DE TRANSPORTE
  { id: 'Utilizou_Veiculo', title: 'Utilizou_Veiculo' },
  { id: 'Tipo_Veiculo', title: 'Tipo_Veiculo' },
  { id: 'Marca_Veiculo', title: 'Marca_Veiculo' },
  { id: 'Modelo_Veiculo', title: 'Modelo_Veiculo' },
  { id: 'Cor_Veiculo', title: 'Cor_Veiculo' },
  { id: 'Matricula_Veiculo', title: 'Matricula_Veiculo' },
  { id: 'Pais_Matricula', title: 'Pais_Matricula' },
  { id: 'Via_Verde', title: 'Via_Verde' },
  { id: 'Caracteristicas_Veiculo', title: 'Caracteristicas_Veiculo' },
  { id: 'Acesso_Outros_Transportes', title: 'Acesso_Outros_Transportes' },
  
  // 9. AVALIAÇÃO DE RISCO - INDICADORES
  { id: 'Pessoa_Menor_Idade', title: 'Pessoa_Menor_Idade' },
  { id: 'Pessoa_Idosa', title: 'Pessoa_Idosa' },
  { id: 'Indicios_Crime', title: 'Indicios_Crime' },
  { id: 'Risco_Iminente_Vida', title: 'Risco_Iminente_Vida' },
  { id: 'Risco_Integridade_Fisica', title: 'Risco_Integridade_Fisica' },
  { id: 'Ausencia_Contradiz_Comportamento', title: 'Ausencia_Contradiz_Comportamento' },
  { id: 'Ausencia_Sem_Explicacao', title: 'Ausencia_Sem_Explicacao' },
  { id: 'Nao_Chegou_Destino', title: 'Nao_Chegou_Destino' },
  { id: 'Nao_Levou_Pertences', title: 'Nao_Levou_Pertences' },
  { id: 'Abandonou_Veiculo', title: 'Abandonou_Veiculo' },
  { id: 'Perigo_Para_Terceiros', title: 'Perigo_Para_Terceiros' },
  { id: 'Vitima_Violencia_Domestica', title: 'Vitima_Violencia_Domestica' },
  
  // 10. DEPENDÊNCIAS E VÍCIOS
  { id: 'Consome_Alcool', title: 'Consome_Alcool' },
  { id: 'Frequencia_Alcool', title: 'Frequencia_Alcool' },
  { id: 'Consome_Drogas', title: 'Consome_Drogas' },
  { id: 'Tipo_Drogas', title: 'Tipo_Drogas' },
  { id: 'Vicio_Jogo', title: 'Vicio_Jogo' },
  
  // 11. ANTECEDENTES
  { id: 'Reincidente_Desaparecimentos', title: 'Reincidente_Desaparecimentos' },
  { id: 'Quantas_Vezes_Anterior', title: 'Quantas_Vezes_Anterior' },
  { id: 'Locais_Encontrado_Anterior', title: 'Locais_Encontrado_Anterior' },
  { id: 'Antecedentes_Policiais', title: 'Antecedentes_Policiais' },
  { id: 'Processos_Judiciais', title: 'Processos_Judiciais' },
  
  // 17. INDÍCIOS DE VOLUNTARIEDADE/INVOLUNTARIEDADE
  { id: 'Manifestou_Intencao_Partir', title: 'Manifestou_Intencao_Partir' },
  { id: 'Detalhes_Intencao_Partir', title: 'Detalhes_Intencao_Partir' },
  { id: 'Recolha_Documentacao_Comportamento', title: 'Recolha_Documentacao_Comportamento' },
  { id: 'Recolha_Vestuario_Comportamento', title: 'Recolha_Vestuario_Comportamento' },
  { id: 'Recolha_Objectos_Comportamento', title: 'Recolha_Objectos_Comportamento' },
  { id: 'Outros_Comportamentos', title: 'Outros_Comportamentos' },
  { id: 'Deixou_Nota_Despedida', title: 'Deixou_Nota_Despedida' },
  { id: 'Verbalizou_Intencao_Suicidio', title: 'Verbalizou_Intencao_Suicidio' },
  { id: 'Tentou_Suicidio_Anteriormente', title: 'Tentou_Suicidio_Anteriormente' },
  
  // 18. CIRCUNSTÂNCIAS ESPECIAIS - MENORES
  { id: 'Fugiu_Centro_Educativo', title: 'Fugiu_Centro_Educativo' },
  { id: 'Nome_Morada_Instituicao', title: 'Nome_Morada_Instituicao' },
  { id: 'Problemas_Escola_Bullying', title: 'Problemas_Escola_Bullying' },
  { id: 'Conflitos_Entre_Pais', title: 'Conflitos_Entre_Pais' },
  { id: 'Sujeito_Planos_Protecao', title: 'Sujeito_Planos_Protecao' },
  
  // 19. CIRCUNSTÂNCIAS ESPECIAIS - MAIORES
  { id: 'Processo_Separacao_Rutura', title: 'Processo_Separacao_Rutura' },
  { id: 'Abandonou_Menores_Cargo', title: 'Abandonou_Menores_Cargo' },
  { id: 'Levou_Menores_Cargo', title: 'Levou_Menores_Cargo' },
  
  // 21. TIPO DE DESAPARECIMENTO
  { id: 'Tipo_Desaparecimento', title: 'Tipo_Desaparecimento' },
  { id: 'Subtipo_Desaparecimento', title: 'Subtipo_Desaparecimento' },
  
  // 22. PRIORIDADE DA BUSCA
  { id: 'Avaliacao_Prioridade', title: 'Avaliacao_Prioridade' },
  
  // 24. OBSERVAÇÕES ADICIONAIS
  { id: 'Observacoes_Adicionais', title: 'Observacoes_Adicionais' },
  
  // 25. DADOS OPERACIONAIS
  { id: 'Data_Preenchimento', title: 'Data_Preenchimento' },
  { id: 'GNR_Nome_Elemento', title: 'GNR_Nome_Elemento' },
  { id: 'GNR_NIM_Elemento', title: 'GNR_NIM_Elemento' },
  { id: 'GNR_Posto_Elemento', title: 'GNR_Posto_Elemento' },
  { id: 'GNR_Unidade_Elemento', title: 'GNR_Unidade_Elemento' },
  { id: 'GNR_Assinatura_Elemento', title: 'GNR_Assinatura_Elemento' },
  { id: 'GNR_Nome_Comandante', title: 'GNR_Nome_Comandante' },
  { id: 'GNR_NIM_Comandante', title: 'GNR_NIM_Comandante' },
  { id: 'GNR_Posto_Comandante', title: 'GNR_Posto_Comandante' },
  { id: 'GNR_Unidade_Comandante', title: 'GNR_Unidade_Comandante' },
  { id: 'GNR_Assinatura_Comandante', title: 'GNR_Assinatura_Comandante' },
  
  // CAMPOS CALCULADOS AUTOMATICAMENTE
  { id: 'Risco_Calculado', title: 'Risco_Calculado' },
  { id: 'Indicadores_Risco_Activos', title: 'Indicadores_Risco_Activos' }
];

// Campos adicionais para marcação de 'encontrado' (serão adicionados quando existirem)
const encontradoFields = [
  { id: 'Data_Encontrado', title: 'Data_Encontrado' },
  { id: 'Hora_Encontrado', title: 'Hora_Encontrado' },
  { id: 'Local_Encontrado', title: 'Local_Encontrado' },
  { id: 'Freguesia_Encontrado', title: 'Freguesia_Encontrado' },
  { id: 'Concelho_Encontrado', title: 'Concelho_Encontrado' },
  { id: 'Latitude_Encontrado', title: 'Latitude_Encontrado' },
  { id: 'Longitude_Encontrado', title: 'Longitude_Encontrado' },
  { id: 'Estado_Pessoa_Encontrado', title: 'Estado_Pessoa_Encontrado' },
  { id: 'Meios_Accionados', title: 'Meios_Accionados' },
  { id: 'Quem_Encontrou', title: 'Quem_Encontrou' },
  { id: 'Nome_Quem_Encontrou', title: 'Nome_Quem_Encontrou' },
  { id: 'Contacto_Quem_Encontrou', title: 'Contacto_Quem_Encontrou' },
  { id: 'Distancia_km_Encontrado', title: 'Distancia_km_Encontrado' }
];

// Campos de audit trail
const auditFields = [
  { id: 'Encontrado_Marcador', title: 'Encontrado_Marcador' },
  { id: 'Encontrado_DataHora_Marcacao', title: 'Encontrado_DataHora_Marcacao' }
];

// Simple file-backed cache para geocoding e meteorologia
const cacheDir = path.join(__dirname, '.cache');
if (!fs.existsSync(cacheDir)) fs.mkdirSync(cacheDir, { recursive: true });
const geocodeCachePath = path.join(cacheDir, 'geocode_cache.json');
const weatherCachePath = path.join(cacheDir, 'weather_cache.json');
let geocodeCache = {};
let weatherCache = {};
try { geocodeCache = fs.existsSync(geocodeCachePath) ? JSON.parse(fs.readFileSync(geocodeCachePath, 'utf8') || '{}') : {}; } catch(e){ geocodeCache = {}; }
try { weatherCache = fs.existsSync(weatherCachePath) ? JSON.parse(fs.readFileSync(weatherCachePath, 'utf8') || '{}') : {}; } catch(e){ weatherCache = {}; }

// Simple write locks para evitar concorrência de escrita ao gravar caches
let geocodeCacheWriting = false;
let weatherCacheWriting = false;
function atomicWriteFileSync(filePath, dataStr) {
  const tmp = filePath + '.tmp';
  fs.writeFileSync(tmp, dataStr, 'utf8');
  try { fs.renameSync(tmp, filePath); } catch (e) {
    // Em alguns sistemas, rename pode falhar se o destino existir; fallback para write
    fs.writeFileSync(filePath, dataStr, 'utf8');
  }
}
function saveGeocodeCache() {
  try {
    if (geocodeCacheWriting) return; // evitar reentrância
    geocodeCacheWriting = true;
    atomicWriteFileSync(geocodeCachePath, JSON.stringify(geocodeCache, null, 2));
  } catch(e) { debugLogger.warn('Falha a gravar geocode cache', e.message); }
  finally { geocodeCacheWriting = false; }
}
function saveWeatherCache() {
  try {
    if (weatherCacheWriting) return;
    weatherCacheWriting = true;
    // Antes de gravar, executar prune para manter cache sob controlo
    try { pruneWeatherCache(); } catch (e) { debugLogger.warn('Prune weather cache falhou', e.message); }
    atomicWriteFileSync(weatherCachePath, JSON.stringify(weatherCache, null, 2));
  } catch(e) { debugLogger.warn('Falha a gravar weather cache', e.message); }
  finally { weatherCacheWriting = false; }
}

// Política de cache: TTL e limite de entradas
const WEATHER_CACHE_TTL_MS = 1000 * 60 * 60 * 24 * 30; // 30 dias
const WEATHER_CACHE_MAX_ENTRIES = 2000; // limite máximo de entradas

function pruneWeatherCache() {
  const now = Date.now();
  // Estrutura esperada: weatherCache[key] = { createdAt, lastAccess, value }
  for (const k of Object.keys(weatherCache)) {
    const item = weatherCache[k];
    if (!item || !item.createdAt) { delete weatherCache[k]; continue; }
    if ((now - item.createdAt) > WEATHER_CACHE_TTL_MS) { delete weatherCache[k]; }
  }

  const keys = Object.keys(weatherCache);
  if (keys.length <= WEATHER_CACHE_MAX_ENTRIES) return;
  // Ordenar por lastAccess asc (remover os menos recentemente usados)
  const sorted = keys.map(k => ({ k, last: (weatherCache[k] && weatherCache[k].lastAccess) || 0 }))
    .sort((a,b) => a.last - b.last);
  const removeCount = keys.length - WEATHER_CACHE_MAX_ENTRIES;
  const toRemove = sorted.slice(0, removeCount);
  for (const r of toRemove) delete weatherCache[r.k];
}

// Rate-limiting / backoff helpers para Nominatim
let nominatimLastCall = 0;
const NOMINATIM_MIN_INTERVAL = 1100; // ms (respeitar politicas: ~1 req/sec)
const NOMINATIM_MAX_RETRIES = 3;
function sleep(ms) { return new Promise(resolve => setTimeout(resolve, ms)); }

/**
 * GERAR ID SEQUENCIAL PARA CASO (1,2,3...)
 * Lê o CSV oficial atual (se existir) e calcula o próximo ID numérico.
 */
function gerarIdSequencial() {
  try {
    const { parseCsvFile } = require('./csvUtil');
    const records = parseCsvFile(csvOficialPath, { columns: true });
    if (!records || records.length === 0) return '1';
    const ids = records.map(r => {
      const v = r.ID_Caso || r.ID || r.id || '';
      const n = parseInt(String(v).replace(/[^0-9]/g, ''), 10);
      return isNaN(n) ? 0 : n;
    });
    const maxId = Math.max(...ids, 0);
    return String(maxId + 1);
  } catch (e) {
    debugLogger.warn('Erro ao gerar ID sequencial, fallback para 1', e.message);
    return '1';
  }
}

// Obter coordenadas (latitude, longitude) a partir de local/freguesia/concelho via Nominatim (OpenStreetMap)
async function obterCoordenadas({ local, freguesia, concelho }) {
  try {
    const clean = (s) => (s || '').toString().trim();
    const L = clean(local);
    const F = clean(freguesia);
    const C = clean(concelho);

    // Construir candidates da query do mais completo para o mais genérico
    const candidates = [];
    if (L && F && C) candidates.push(`${L}, ${F}, ${C}`);
    if (L && C) candidates.push(`${L}, ${C}`);
    if (L && F) candidates.push(`${L}, ${F}`);
    if (L) candidates.push(L);
    if (F && C) candidates.push(`${F}, ${C}`);
    if (C) candidates.push(C);
    // tentar adicionar country para ambiguidades
    if (L && !/portugal/i.test(L)) candidates.push(`${L}, Portugal`);
    if (F && !/portugal/i.test(F)) candidates.push(`${F}, Portugal`);

    const normalizeKey = (s) => String(s || '').toLowerCase().replace(/\s+/g, ' ').trim();

    // helper: determinar se resultado é suficientemente preciso (rua/house/amenity/local)
    const isPreciseResult = (resObj) => {
      try {
        if (!resObj || !resObj.address) return false;
        const addr = resObj.address;
        // campos que indicam precisão de rua/local
        const streetFields = ['road', 'pedestrian', 'house_number', 'residential', 'suburb', 'neighbourhood', 'villa', 'village', 'hamlet', 'quarter', 'locality'];
        for (const f of streetFields) {
          if (addr[f]) return true;
        }
        // tipagens comuns que também são aceitáveis
        const goodTypes = ['house', 'residential', 'building', 'road', 'residence', 'village', 'hamlet', 'locality', 'commercial', 'industrial', 'amenity'];
        if (goodTypes.includes(resObj.type)) return true;
        return false;
      } catch (e) {
        return false;
      }
    };

    // helper: obter centróide administrativo (freguesia/concelho) via Nominatim
    async function obterCentroidAdministrativo(name, concelhoName) {
      try {
        if (!name) return null;
        const queries = [];
        if (name && concelhoName) queries.push(`${name}, ${concelhoName}, Portugal`);
        if (name) queries.push(`${name}, Portugal`);
        // também tentar sem Portugal se for muito específico
        if (name && !/portugal/i.test(name)) queries.push(name);

        for (const q of queries) {
          const norm = normalizeKey(q);
          if (geocodeCache[`admin:${norm}`]) return geocodeCache[`admin:${norm}`];

          const url = `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(q)}&limit=1&addressdetails=1`;
          const now = Date.now();
          const since = now - nominatimLastCall;
          if (since < NOMINATIM_MIN_INTERVAL) await sleep(NOMINATIM_MIN_INTERVAL - since);

          let attempt = 0;
          while (attempt < NOMINATIM_MAX_RETRIES) {
            try {
              nominatimLastCall = Date.now();
              const res = await fetch(url, { headers: { 'User-Agent': `SAR-Sistema/1.0 (contact: ${process.env.NOMINATIM_CONTACT_EMAIL || 'contact@example.com'})` }, timeout: 10000 });
              if (!res.ok) throw new Error(`HTTP ${res.status}`);
              const data = await res.json();
              if (!data || data.length === 0) break;
              const first = data[0];
              // Preferir tipos administrativos (boundary/administrative)
              const adminTypes = ['administrative', 'boundary', 'political', 'municipality', 'county', 'city', 'town', 'village', 'parish'];
              // Se for administrativo, aceitar como centróide - Nominatim devolve lat/lon representativos
              if (first && (adminTypes.includes(first.type) || first.class === 'boundary' || first.class === 'place' || first.class === 'administrative')) {
                const result = { lat: parseFloat(first.lat), lon: parseFloat(first.lon), display_name: first.display_name };
                geocodeCache[`admin:${norm}`] = result;
                saveGeocodeCache();
                return result;
              }
              // Caso não seja explicitamente administrativo, ainda assim pode representar a freguesia; aceitar como último recurso
              const fallback = { lat: parseFloat(first.lat), lon: parseFloat(first.lon), display_name: first.display_name };
              geocodeCache[`admin:${norm}`] = fallback;
              saveGeocodeCache();
              return fallback;
            } catch (e) {
              attempt += 1;
              await sleep(500 * Math.pow(2, attempt));
            }
          }
        }
        return null;
      } catch (e) {
        return null;
      }
    }

    // Primeiro, tentar candidatos detalhados procurando por resultados de rua/local precisos
    for (const q of candidates) {
      if (!q) continue;
      const norm = normalizeKey(q);
      // verificar cache com chave original e normalizada
      if (geocodeCache[q]) return geocodeCache[q];
      if (geocodeCache[norm]) return geocodeCache[norm];

      const url = `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(q)}&limit=1&addressdetails=1`;
      // garantir intervalo mínimo entre chamadas
      const now = Date.now();
      const since = now - nominatimLastCall;
      if (since < NOMINATIM_MIN_INTERVAL) {
        await sleep(NOMINATIM_MIN_INTERVAL - since);
      }

      let attempt = 0;
      let lastErr = null;
      while (attempt < NOMINATIM_MAX_RETRIES) {
        try {
          nominatimLastCall = Date.now();
          const res = await fetch(url, { headers: { 'User-Agent': `SAR-Sistema/1.0 (contact: ${process.env.NOMINATIM_CONTACT_EMAIL || 'contact@example.com'})` }, timeout: 10000 });
          if (!res.ok) throw new Error(`HTTP ${res.status}`);
          const data = await res.json();
          if (!data || data.length === 0) {
            break; // tentar próxima candidate
          }
          const first = data[0];
          // Se o resultado for preciso (rua/local), retornar imediatamente com nível
          if (isPreciseResult(first)) {
            const result = { lat: parseFloat(first.lat), lon: parseFloat(first.lon), display_name: first.display_name, level: 'precise' };
            geocodeCache[norm] = result;
            saveGeocodeCache();
            return result;
          }
          // Caso não seja preciso, guardar temporariamente mas continuar procurando
          lastErr = first;
          // guardar no cache como fallback (sem level) para uso posterior
          geocodeCache[norm] = { lat: parseFloat(first.lat), lon: parseFloat(first.lon), display_name: first.display_name, level: 'generic' };
          saveGeocodeCache();
          break; // não repetir a mesma candidate várias vezes
        } catch (e) {
          lastErr = e;
          debugLogger.warn(`Nominatim attempt ${attempt + 1} falhou para query='${q}': ${e.message}`);
          attempt += 1;
          await sleep(500 * Math.pow(2, attempt));
        }
      }
      if (lastErr && lastErr.lat === undefined) debugLogger.log('Nominatim não retornou resultado para candidate', { query: q, error: lastErr.message || lastErr });
      // prossiga para o próximo candidate
    }

    // Se não encontramos um resultado preciso, tentar obter centróide da freguesia (se fornecida)
    if (F) {
      const cent = await obterCentroidAdministrativo(F, C);
      if (cent) return { lat: cent.lat, lon: cent.lon, display_name: cent.display_name, level: 'freguesia_centroid' };
    }

    // Se não houver freguesia ou não obtivemos centróide, tentar retornar o primeiro cache ou candidate genérico se existir
    // procurar cache por keys normalizadas de candidates
    for (const q of candidates) {
      if (!q) continue;
      const norm = normalizeKey(q);
      if (geocodeCache[norm]) return geocodeCache[norm];
      if (geocodeCache[q]) return geocodeCache[q];
    }

    debugLogger.warn('Nenhuma candidate de geocoding obteve resultado');
    return null;
  } catch (e) {
    debugLogger.warn('Falha ao obter coordenadas', e.message);
    return null;
  }
}

// Endpoint público para geocoding (usado pelo cliente quando pedir geocodificação)
router.get('/geocode', async (req, res) => {
  try {
    const { local, freguesia, concelho, q } = req.query;
    const queryLocal = q || local || '';
    if (!queryLocal && !freguesia && !concelho) return res.status(400).json({ success: false, error: 'Parâmetros necessários: q ou local/freguesia/concelho' });
    const result = await obterCoordenadas({ local: queryLocal || undefined, freguesia, concelho });
    if (!result) return res.status(404).json({ success: false, error: 'Não foi possível geocodificar o local' });
    // Envolver resultado com metadados: lat/lon/display_name/level
    const payload = {
      lat: result.lat,
      lon: result.lon,
      display_name: result.display_name || '',
      level: result.level || 'generic'
    };
    res.json({ success: true, geocode: payload });
  } catch (error) {
    debugLogger.error('Erro no endpoint /geocode', error.message);
    res.status(500).json({ success: false, error: 'Erro interno ao geocodificar' });
  }
});

// Endpoint para reverse geocoding: a partir de lat & lon obter freguesia e concelho
router.get('/reverse-geocode', async (req, res) => {
  try {
    const { lat, lon } = req.query;
    if (!lat || !lon) return res.status(400).json({ success: false, error: 'Parâmetros necessários: lat e lon' });
    const key = `reverse:${lat},${lon}`;
    if (geocodeCache[key]) {
      return res.json({ success: true, reverse: geocodeCache[key] });
    }

    const url = `https://nominatim.openstreetmap.org/reverse?format=json&lat=${encodeURIComponent(lat)}&lon=${encodeURIComponent(lon)}&zoom=18&addressdetails=1`;
    const now = Date.now();
    const since = now - nominatimLastCall;
    if (since < NOMINATIM_MIN_INTERVAL) await sleep(NOMINATIM_MIN_INTERVAL - since);
    nominatimLastCall = Date.now();
    const resp = await fetch(url, { headers: { 'User-Agent': `SAR-Sistema/1.0 (contact: ${process.env.NOMINATIM_CONTACT_EMAIL || 'contact@example.com'})` }, timeout: 10000 });
    if (!resp.ok) return res.status(502).json({ success: false, error: `Nominatim HTTP ${resp.status}` });
    const body = await resp.json();
  const addr = body && body.address ? body.address : {};
  // Heurísticas aprimoradas:
  // - Freguesia: pode aparecer em vários campos dependendo da granularidade da base OSM
  //   (suburb, parish, neighbourhood, village, hamlet, quarter, locality)
  const freguesia = (addr.parish && String(addr.parish).trim()) || (addr.suburb && String(addr.suburb).trim()) || (addr.neighbourhood && String(addr.neighbourhood).trim()) || (addr.quarter && String(addr.quarter).trim()) || (addr.village && String(addr.village).trim()) || (addr.hamlet && String(addr.hamlet).trim()) || (addr.locality && String(addr.locality).trim()) || '';
  // - Concelho: preferir municipality/city/town em vez de county (county muitas vezes devolve distrito)
  const concelho = (addr.municipality && String(addr.municipality).trim()) || (addr.city && String(addr.city).trim()) || (addr.town && String(addr.town).trim()) || (addr.county && String(addr.county).trim()) || '';
    const display_name = body.display_name || '';
  const result = { lat: Number(lat), lon: Number(lon), display_name, freguesia: freguesia || '', concelho: concelho || '', raw: body };
    geocodeCache[key] = result;
    saveGeocodeCache();
    return res.json({ success: true, reverse: result });
  } catch (e) {
    debugLogger.error('Erro no endpoint /reverse-geocode', e.message);
    return res.status(500).json({ success: false, error: 'Erro interno no reverse geocode' });
  }
});

// Obter meteorologia histórica aproximada via Open-Meteo (horário) com base em lat/lon e data/hora
async function obterMeteorologia({ lat, lon, data, hora }) {
  try {
    if (!lat || !lon || !data) return null;
  // Normalizar chave de cache por lat/lon/data/hora
  const key = `${lat},${lon},${data},${hora || ''}`;
  if (weatherCache[key]) return weatherCache[key];
    // Open-Meteo API para dados horários (incluir humidade) - converte data para YYYY-MM-DD
    const date = data;
    // hourly params: temperature, precipitation, wind speed and relative humidity
    const url = `https://archive-api.open-meteo.com/v1/archive?latitude=${lat}&longitude=${lon}&start_date=${date}&end_date=${date}&hourly=temperature_2m,precipitation,windspeed_10m,relativehumidity_2m`;
    const res = await fetch(url);
    const json = await res.json();
    if (!json || !json.hourly) return null;
    // Determinar hora desejada e procurar valor válido
    const hour = hora ? String(hora).split(':')[0].padStart(2, '0') : null;
    const times = json.hourly.time || [];
    let idx = -1;
    if (hour !== null) {
      idx = times.findIndex(t => t.startsWith(date + 'T' + hour));
    }

    // Função auxiliar para verificar se um índice tem dados úteis
    const hasDataAt = (i) => {
      if (i < 0 || i >= times.length) return false;
      const tArr = json.hourly.temperature_2m || [];
      const pArr = json.hourly.precipitation || [];
      const wArr = json.hourly.windspeed_10m || [];
      const hArr = json.hourly.relativehumidity_2m || [];
      const any = (arr) => Array.isArray(arr) && arr[i] !== null && arr[i] !== undefined;
      return any(tArr) || any(pArr) || any(wArr) || any(hArr);
    };

    // Se index não encontrado ou valores nesse index forem nulos, procurar o índice mais próximo no mesmo dia
    if (idx === -1 || !hasDataAt(idx)) {
      // procurar lateralmente por distância mínima (0..23)
      let found = -1;
      for (let d = 0; d < times.length; d++) {
        // tentar hora+/-d
        const hourNum = hour !== null ? parseInt(hour, 10) : 0;
        const candPlus = hourNum + d;
        const candMinus = hourNum - d;
        const candIdxPlus = times.findIndex(t => t.startsWith(date + 'T' + String(candPlus).padStart(2, '0')));
        const candIdxMinus = times.findIndex(t => t.startsWith(date + 'T' + String(candMinus).padStart(2, '0')));
        if (candIdxPlus !== -1 && hasDataAt(candIdxPlus)) { found = candIdxPlus; break; }
        if (candIdxMinus !== -1 && hasDataAt(candIdxMinus)) { found = candIdxMinus; break; }
      }
      idx = found;
    }

    // Se ainda não foi encontrado, tentar dias adjacentes (-1, +1)
    if (idx === -1) {
      const tryDate = async (offsetDays) => {
        const dt = new Date(date);
        dt.setDate(dt.getDate() + offsetDays);
        const dstr = dt.toISOString().split('T')[0];
        const url2 = `https://archive-api.open-meteo.com/v1/archive?latitude=${lat}&longitude=${lon}&start_date=${dstr}&end_date=${dstr}&hourly=temperature_2m,precipitation,windspeed_10m,relativehumidity_2m`;
        try {
          const r2 = await fetch(url2);
          const j2 = await r2.json();
          const times2 = j2.hourly && j2.hourly.time ? j2.hourly.time : [];
          for (let i = 0; i < times2.length; i++) {
            const any = (arr) => Array.isArray(arr) && arr[i] !== null && arr[i] !== undefined;
            if (any(j2.hourly.temperature_2m) || any(j2.hourly.precipitation) || any(j2.hourly.windspeed_10m) || any(j2.hourly.relativehumidity_2m)) {
              // adotar este dia/hora
              // copiar json para uso abaixo
              json.hourly = j2.hourly;
              return i;
            }
          }
        } catch (e) {
          // ignore
        }
        return -1;
      };

      // tentar -1 dia e +1 dia
      const prevIdx = await tryDate(-1);
      if (prevIdx !== -1) idx = prevIdx;
      else {
        const nextIdx = await tryDate(1);
        if (nextIdx !== -1) idx = nextIdx;
      }
    }

    // Se ainda -1, fallback para 0
    if (idx === -1) idx = 0;

    const temp = json.hourly.temperature_2m && json.hourly.temperature_2m[idx] !== undefined ? json.hourly.temperature_2m[idx] : null;
    const precip = json.hourly.precipitation && json.hourly.precipitation[idx] !== undefined ? json.hourly.precipitation[idx] : 0;
    const wind_ms = (json.hourly.windspeed_10m && json.hourly.windspeed_10m[idx] !== undefined) ? json.hourly.windspeed_10m[idx] : null;
    const humidity = (json.hourly.relativehumidity_2m && json.hourly.relativehumidity_2m[idx] !== undefined) ? json.hourly.relativehumidity_2m[idx] : null;
    // converter vento para km/h
    const wind_kmh = wind_ms !== null ? Number((wind_ms * 3.6).toFixed(2)) : null;
    const desc = `Temp ${temp ?? 'N/D'}°C, Hum ${humidity ?? 'N/D'}%, Precip ${precip ?? 0}mm, Vento ${wind_kmh ?? 'N/D'} km/h`;
    const ret = { description: desc, temperature_c: temp, precipitation_mm: precip, wind_kmh: wind_kmh, humidity_percent: humidity };
    // Armazenar com metadados para LRU/TTL
    weatherCache[key] = { createdAt: Date.now(), lastAccess: Date.now(), value: ret };
    saveWeatherCache();
    return ret;
  } catch (e) {
    debugLogger.warn('Falha ao obter meteorologia', e.message);
    return null;
  }
}

// Helper: calcular distância (Haversine) em km entre duas coordenadas
function calcularDistanciaKm(lat1, lon1, lat2, lon2) {
  if (lat1 === null || lon1 === null || lat2 === null || lon2 === null) return null;
  const toRad = x => x * Math.PI / 180;
  const R = 6371; // km
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a = Math.sin(dLat/2) * Math.sin(dLat/2) + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon/2) * Math.sin(dLon/2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
  return R * c;
}

// Helper: tentar extrair coords (lat,lon) de uma string livre (ex: "38.7, -9.1" ou "(38.7 -9.1)")
function parseCoordsFromString(s) {
  if (!s || typeof s !== 'string') return null;
  const m = s.match(/([+-]?[0-9]{1,3}[.,]?[0-9]*)[^0-9+-]*([+-]?[0-9]{1,3}[.,]?[0-9]*)/);
  if (!m) return null;
  const a = m[1].replace(/,/g, '.');
  const b = m[2].replace(/,/g, '.');
  const lat = Number(a);
  const lon = Number(b);
  if (isNaN(lat) || isNaN(lon)) return null;
  return { lat, lon };
}

// Helper: normalizar coordenadas de entrada (string) para número (DD), remover letras e trocar vírgula por ponto
function normalizarCoordenada(valor) {
  if (valor === undefined || valor === null) return null;
  if (typeof valor === 'number') return Number(valor);
  let s = String(valor).trim();
  if (!s) return null;
  s = s.replace(/,/g, '.');
  // manter apenas caracteres relevantes: digits, + - .
  // Capturar o primeiro padrão numérico plausível (suporta sinais e decimais)
  const m = s.match(/[+-]?[0-9]*\.?[0-9]+/);
  if (!m) return null;
  const n = Number(m[0]);
  return isNaN(n) ? null : n;
}

/**
 * normalizarCamposCoordenadas
 * Dado um objeto de caso (linha de CSV ou payload), retorna um objeto com as
 * coordenadas canônicas: { latOrig, lonOrig, latEncontrado, lonEncontrado }
 * Faz fallback através de várias variantes comuns de nomes de campos.
 */
function normalizarCamposCoordenadas(obj) {
  if (!obj || typeof obj !== 'object') return { latOrig: null, lonOrig: null, latEncontrado: null, lonEncontrado: null };

  const getAny = (keys) => {
    for (const k of keys) {
      if (Object.prototype.hasOwnProperty.call(obj, k) && obj[k] !== undefined && obj[k] !== null && String(obj[k]).trim() !== '') {
        return obj[k];
      }
    }
    return undefined;
  };

  // Possíveis variantes para coordenadas de origem (no ficheiro histórico)
  const latOrigRaw = getAny(['Latitude', 'Lat', 'latitude', 'lat', 'Latitude_Origem', 'Lat_Orig', 'Lat_Original']);
  const lonOrigRaw = getAny(['Longitude', 'Lon', 'longitude', 'lon', 'Longitude_Origem', 'Lon_Orig', 'Lon_Original']);

  // Possíveis variantes para coordenadas de 'encontrado'
  const latEncRaw = getAny(['Latitude_Encontrado', 'LatitudeEncontrado', 'LatitudeEncontrado', 'Latitude_Encontrado', 'LatitudeEncontrado', 'Latitude_encontrado', 'LatitudeEncontrado']);
  const lonEncRaw = getAny(['Longitude_Encontrado', 'LongitudeEncontrado', 'Longitude_encontrado', 'LongitudeEncontrado', 'LongitudeEncontrado']);

  // Também aceitar valores enviados no payload com nomes curtos
  const latEncAlt = getAny(['Latitude_Encontrado', 'Latitude', 'lat', 'latitude']);
  const lonEncAlt = getAny(['Longitude_Encontrado', 'Longitude', 'lon', 'longitude']);

  const latOrig = normalizarCoordenada(latOrigRaw);
  const lonOrig = normalizarCoordenada(lonOrigRaw);
  // Preferir campos explícitos de encontrado; se não existirem, usar alternativas
  const latEncontrado = normalizarCoordenada(latEncRaw !== undefined ? latEncRaw : latEncAlt);
  const lonEncontrado = normalizarCoordenada(lonEncRaw !== undefined ? lonEncRaw : lonEncAlt);

  return { latOrig, lonOrig, latEncontrado, lonEncontrado };
}

/**
 * DETECTAR AUTOMATICAMENTE INDICADORES BASEADOS NOS DADOS
 */
function detectarIndicadoresAutomaticos(dados) {
  const indicadores = { ...dados };
  
  // Detectar automaticamente pessoa menor de idade
  if (dados.Idade_Exacta && parseInt(dados.Idade_Exacta) < 18) {
    indicadores.Pessoa_Menor_Idade = 'Sim';
  }
  
  // Detectar automaticamente pessoa idosa
  if (dados.Idade_Exacta && parseInt(dados.Idade_Exacta) > 75) {
    indicadores.Pessoa_Idosa = 'Sim';
  }
  
  return indicadores;
}

/**
 * PREPARAR DADOS PARA GRAVAÇÃO NO CSV
 */
async function prepararDadosOficiais(dadosFormulario) {
  const agora = new Date();
  const dataAtual = agora.toISOString().split('T')[0];
  const horaAtual = agora.toTimeString().split(' ')[0];
  
  // Detectar indicadores automáticos
  const dadosComIndicadores = detectarIndicadoresAutomaticos(dadosFormulario);
  
  // Calcular avaliação de risco usando o módulo oficial
  const avaliacaoRisco = calcularRiscoOficial(dadosComIndicadores);
  const prioridade = determinarPrioridadeOficial(avaliacaoRisco.nivel, dadosComIndicadores);
  
  // Gerar relatório de risco
  const relatorioRisco = gerarRelatorioRisco(avaliacaoRisco, prioridade);
  
  // Debug: Log da avaliação
  debugLogger.section('AVALIAÇÃO DE RISCO OFICIAL');
  debugLogger.log('Dados recebidos', {
    nome: dadosFormulario.Nome_Completo,
    idade: dadosFormulario.Idade_Exacta,
    total_campos: Object.keys(dadosFormulario).length
  });
  debugLogger.log('Avaliação de risco', avaliacaoRisco);
  debugLogger.log('Prioridade determinada', prioridade);
  debugLogger.log('Indicadores ativos', avaliacaoRisco.indicadores.map(i => i.descricao));
  
  // Obter coordenadas e meteorologia (tentativa; não falhar o registo se estas falharem)
  let lat = '';
  let lon = '';
  let metDesc = '';
  let metTemp = '';
  let metPrecip = '';
  let metVento = '';
  const warnings = [];
  try {
    // Tentar geocodificar SEMPRE primeiro com Local/Freguesia/Concelho (requisito: coordenadas obtidas dinamicamente)
    const geoPreferido = await obterCoordenadas({ local: dadosFormulario.Local_Ultimo_Avistamento, freguesia: dadosFormulario.Freguesia, concelho: dadosFormulario.Concelho });
    if (geoPreferido && geoPreferido.lat !== undefined && geoPreferido.lon !== undefined) {
      lat = geoPreferido.lat;
      lon = geoPreferido.lon;
      // Anotar nível se disponível
      if (geoPreferido.level) warnings.push(`Coordenadas obtidas via geocoding (nível: ${geoPreferido.level})`);
    } else {
      // Se o geocoding não tiver sucesso, só então usar coordenadas enviadas pelo frontend (se existirem)
      const formLat = normalizarCoordenada(dadosFormulario.Latitude || dadosFormulario.lat || dadosFormulario.latitude);
      const formLon = normalizarCoordenada(dadosFormulario.Longitude || dadosFormulario.lon || dadosFormulario.longitude);
      if (formLat !== null && formLon !== null) {
        lat = formLat; lon = formLon;
        // validar formato numérico
        if (typeof dadosFormulario.Latitude === 'string' && !/^[+\-]?[0-9]+(?:[.,][0-9]+)?$/.test(String(dadosFormulario.Latitude).trim())) {
          warnings.push('Latitude fornecida não tem formato numérico padrão');
        }
        if (typeof dadosFormulario.Longitude === 'string' && !/^[+\-]?[0-9]+(?:[.,][0-9]+)?$/.test(String(dadosFormulario.Longitude).trim())) {
          warnings.push('Longitude fornecida não tem formato numérico padrão');
        }
        warnings.push('Coordenadas: usadas as fornecidas pelo frontend como fallback (geocoding falhou)');
      }
    }
    // Se Morada_Exacta_Coordenadas contiver lat/lon, comparar e avisar se divergirem
    const moradaCoords = parseCoordsFromString(dadosFormulario.Morada_Exacta_Coordenadas || '');
    if (moradaCoords && lat !== '' && lon !== '') {
      const dist = calcularDistanciaKm(Number(lat), Number(lon), moradaCoords.lat, moradaCoords.lon);
      // threshold de 0.5 km
      if (dist !== null && dist > 0.5) {
        warnings.push(`Coordenadas fornecidas não coincidem com Morada_Exacta_Coordenadas (distância ${dist.toFixed(2)} km)`);
      }
    }
    // Solicitar meteorologia se tivermos coords válidos
    let met = null;
    if (lat !== '' && lon !== '') {
      met = await obterMeteorologia({ lat, lon, data: dadosFormulario.Data_Desaparecimento, hora: dadosFormulario.Hora_Desaparecimento });
    }
    if (met) {
      metDesc = met.description;
      metTemp = met.temperature_c;
      metPrecip = met.precipitation_mm;
      metVento = met.wind_kmh || met.wind_ms || '';
      // humidade em percent
      var metHum = met.humidity_percent !== undefined ? met.humidity_percent : null;
    }
  } catch (e) {
    debugLogger.warn('Erro ao obter geo/meteorologia', e.message);
  }

  return {
    // IDs e timestamps (sequencial)
    ID_Caso: gerarIdSequencial(),
    Data_Registo: dadosFormulario.Data_Registo || dataAtual,
    Hora_Registo: dadosFormulario.Hora_Registo || horaAtual,
    
    // 1. DENUNCIANTE
    Denunciante_Nome: dadosFormulario.Denunciante_Nome || '',
    Denunciante_Relacao: dadosFormulario.Denunciante_Relacao || '',
    Denunciante_Contacto: dadosFormulario.Denunciante_Contacto || '',
    Denunciante_Contacto_Alternativo: dadosFormulario.Denunciante_Contacto_Alternativo || '',
    Denunciante_Endereco: dadosFormulario.Denunciante_Endereco || '',
    Denunciante_Email: dadosFormulario.Denunciante_Email || '',
    Data_Denuncia: dataAtual,
    Hora_Denuncia: horaAtual,
    Denunciante_Disponibilidade: dadosFormulario.Denunciante_Disponibilidade || '',
    
    // 2. IDENTIFICAÇÃO
    Nome_Completo: dadosFormulario.Nome_Completo || '',
    Idade_Exacta: dadosFormulario.Idade_Exacta || '',
    Data_Nascimento: dadosFormulario.Data_Nascimento || '',
    Sexo: dadosFormulario.Sexo || '',
    Nacionalidade: dadosFormulario.Nacionalidade || 'Portuguesa',
    Estado_Civil: dadosFormulario.Estado_Civil || '',
    Possui_Filhos: dadosFormulario.Possui_Filhos || '',
    Linguas_Faladas: dadosFormulario.Linguas_Faladas || 'Português',
    
    // 3. CIRCUNSTÂNCIAS
    Data_Desaparecimento: dadosFormulario.Data_Desaparecimento || '',
    Hora_Desaparecimento: dadosFormulario.Hora_Desaparecimento || '',
    Local_Ultimo_Avistamento: dadosFormulario.Local_Ultimo_Avistamento || '',
  Concelho: dadosFormulario.Concelho || '',
  Freguesia: dadosFormulario.Freguesia || '',
    Morada_Exacta_Coordenadas: dadosFormulario.Morada_Exacta_Coordenadas || '',
    Tipo_Local: dadosFormulario.Tipo_Local || '',
    Endereco_Domicilio_Habitual: dadosFormulario.Endereco_Domicilio_Habitual || '',
  Latitude: lat !== '' && lat !== null ? String(lat) : '',
  Longitude: lon !== '' && lon !== null ? String(lon) : '',
  Meteorologia_Descricao: metDesc || '',
  Temperatura_C: metTemp || '',
  Humidade_percent: metHum !== undefined && metHum !== null ? String(metHum) : '',
  Precipitacao_mm: metPrecip || '',
  Vento_kmh: metVento || '',
  _warnings: warnings.join('; '),
    
    // 4-25. TODOS OS OUTROS CAMPOS...
    // (Mapear todos os campos do formulário para a estrutura CSV)
    
    // 25. DADOS
    Data_Preenchimento: dataAtual,
    GNR_Nome_Elemento: dadosFormulario.GNR_Nome_Elemento || '',
    GNR_NIM_Elemento: dadosFormulario.GNR_NIM_Elemento || '',
    GNR_Posto_Elemento: dadosFormulario.GNR_Posto_Elemento || '',
    GNR_Unidade_Elemento: dadosFormulario.GNR_Unidade_Elemento || '',
    GNR_Assinatura_Elemento: dadosFormulario.GNR_Assinatura_Elemento || '',
    GNR_Nome_Comandante: dadosFormulario.GNR_Nome_Comandante || '',
    GNR_NIM_Comandante: dadosFormulario.GNR_NIM_Comandante || '',
    GNR_Posto_Comandante: dadosFormulario.GNR_Posto_Comandante || '',
    GNR_Unidade_Comandante: dadosFormulario.GNR_Unidade_Comandante || '',
    GNR_Assinatura_Comandante: dadosFormulario.GNR_Assinatura_Comandante || '',
    
    // AVALIAÇÃO DE RISCO
    Indicios_Crime: dadosComIndicadores.Indicios_Crime || 'Não',
    Risco_Iminente_Vida: dadosComIndicadores.Risco_Iminente_Vida || 'Não',
    Verbalizou_Intencao_Suicidio: dadosComIndicadores.Verbalizou_Intencao_Suicidio || 'Não',
    Vitima_Violencia_Domestica: dadosComIndicadores.Vitima_Violencia_Domestica || 'Não',
    Abandonou_Menores_Cargo: dadosComIndicadores.Abandonou_Menores_Cargo || 'Não',
    Pessoa_Menor_Idade: dadosComIndicadores.Pessoa_Menor_Idade || 'Não',
    Pessoa_Idosa: dadosComIndicadores.Pessoa_Idosa || 'Não',
    Fugiu_Centro_Educativo: dadosComIndicadores.Fugiu_Centro_Educativo || 'Não',
    
    // CLASSIFICAÇÃO E PRIORIDADE
    Tipo_Desaparecimento: determinarTipoDesaparecimento(dadosComIndicadores, avaliacaoRisco),
    Avaliacao_Prioridade: prioridade,
    
    // OBSERVAÇÕES
    Observacoes_Adicionais: dadosFormulario.Observacoes_Adicionais || '',
    
    // CAMPOS CALCULADOS
    Risco_Calculado: avaliacaoRisco.nivel,
    Indicadores_Risco_Activos: avaliacaoRisco.indicadores.map(i => i.descricao).join('; ')
  };
}

/**
 * DETERMINAR TIPO DE DESAPARECIMENTO BASEADO NA AVALIAÇÃO
 */
function determinarTipoDesaparecimento(dados, avaliacaoRisco) {
  // Forçado - se há indícios de crime
  if (dados.Indicios_Crime === 'Sim') {
    return 'Forçado';
  }
  
  // Voluntário - se há manifestações de intenção
  if (dados.Manifestou_Intencao_Partir === 'Sim' || 
      dados.Verbalizou_Intencao_Suicidio === 'Sim' ||
      dados.Deixou_Nota_Despedida === 'Sim') {
    return 'Voluntário';
  }
  
  // Involuntário - casos médicos, desorientação, etc.
  if (dados.Possui_Doencas_Neurodegenerativas === 'Sim' ||
      dados.Possui_Anomalia_Psiquica === 'Sim' ||
      dados.Falta_Autonomia === 'Sim') {
    return 'Involuntário';
  }
  
  // Default baseado na idade
  if (dados.Idade_Exacta && parseInt(dados.Idade_Exacta) < 18) {
    return 'Voluntário'; // Menores tendem a ser fugas
  }
  
  return 'Involuntário'; // Default para casos incertos
}

// ========== ENDPOINTS API ==========

/**
 * POST /api/casos-oficial - Registar novo caso
 */
router.post('/casos-oficial', authenticateToken ? authenticateToken : (req, res, next) => next(), async (req, res) => {
  try {
    debugLogger.section('REGISTO DE NOVO CASO OFICIAL');
    debugLogger.log('Dados recebidos do frontend', {
      campos_total: Object.keys(req.body).length,
      nome: req.body.Nome_Completo,
      idade: req.body.Idade_Exacta
    });
    
    const dadosFormulario = req.body;
    
    // Validação dos campos obrigatórios
    const camposObrigatorios = [
      'Denunciante_Nome', 'Denunciante_Relacao', 'Denunciante_Contacto',
      'Nome_Completo', 'Idade_Exacta', 'Sexo', 'Data_Nascimento',
      'Data_Desaparecimento', 'Hora_Desaparecimento', 'Local_Ultimo_Avistamento',
      'GNR_Nome_Elemento', 'GNR_Posto_Elemento', 'GNR_Unidade_Elemento'
    ];
    
    const camposFalta = camposObrigatorios.filter(campo => 
      !dadosFormulario[campo] || dadosFormulario[campo].toString().trim() === ''
    );
    
    if (camposFalta.length > 0) {
      debugLogger.error('Campos obrigatórios em falta', camposFalta);
      return res.status(400).json({
        success: false,
        error: `Campos obrigatórios em falta: ${camposFalta.join(', ')}`
      });
    }
    
  // Preparar dados conforme estrutura oficial (agora async -> obtém geo/meteorologia)
  const dadosOficiais = await prepararDadosOficiais(dadosFormulario);
    
    debugLogger.log('Dados processados para CSV', {
      id_caso: dadosOficiais.ID_Caso,
      risco: dadosOficiais.Risco_Calculado,
      prioridade: dadosOficiais.Avaliacao_Prioridade,
      indicadores_ativos: dadosOficiais.Indicadores_Risco_Activos
    });
    
    // Verificar se ficheiro CSV existe
    const ficheiroCsvExiste = fs.existsSync(csvOficialPath);
    
    // Criar writer CSV
    // If CSV exists but is missing new headers (e.g. Humidade_percent), rewrite it with full headers
    async function ensureCsvHasAllHeaders() {
      if (!fs.existsSync(csvOficialPath)) return;
      try {
        const existing = fs.readFileSync(csvOficialPath, 'utf8');
        const firstLine = existing.split(/\r?\n/)[0] || '';
        const existingHeaders = firstLine.split(',').map(h => h.trim()).filter(Boolean);
        const desiredHeaders = csvHeadersOficial.map(h => h.id);
        const missing = desiredHeaders.filter(h => !existingHeaders.includes(h));
        if (missing.length === 0) return; // already contains all

        // Parse existing records using csv-parser
        const records = [];
        await new Promise((resolve, reject) => {
          const stream = fs.createReadStream(csvOficialPath)
            .pipe(csv())
            .on('data', (data) => records.push(data))
            .on('end', resolve)
            .on('error', reject);
        });

        // Build new headers (desiredHeaders) and rewrite file with empty values for missing fields
        const csvWriterRewrite = createCsvWriter({ path: csvOficialPath, header: desiredHeaders.map(h => ({ id: h, title: h })), append: false });
        const normalized = records.map(r => {
          const obj = {};
          desiredHeaders.forEach(h => { obj[h] = r[h] !== undefined ? r[h] : ''; });
          return obj;
        });
        await csvWriterRewrite.writeRecords(normalized);
        debugLogger.log('CSV oficial reescrito para incluir novos cabeçalhos', { added: missing });
      } catch (e) {
        debugLogger.warn('Falha ao garantir cabeçalhos no CSV oficial', e.message);
      }
    }

    await ensureCsvHasAllHeaders();

    const csvWriter = createCsvWriter({
      path: csvOficialPath,
      header: csvHeadersOficial,
      append: fs.existsSync(csvOficialPath)
    });
    
    if (!ficheiroCsvExiste) {
      debugLogger.log('Criando novo ficheiro CSV oficial');
    }
    
    // Gravar no CSV
    // Construir objecto apenas com os campos canónicos definidos em csvHeadersOficial.
    // Isto garante que campos efémeros vindos do frontend (ex: Geocode_Level, Map_Zoom_Suggestion)
    // não são gravados no ficheiro CSV oficial.
    const canonicalFieldIds = csvHeadersOficial.map(h => h.id);
    const recordForCsv = {};
    canonicalFieldIds.forEach(fid => {
      // garantir string vazia ao invés de undefined
      recordForCsv[fid] = (dadosOficiais[fid] !== undefined && dadosOficiais[fid] !== null) ? dadosOficiais[fid] : '';
    });
    await csvWriter.writeRecords([recordForCsv]);

    const dbSync = await syncOfficialCaseToDb(recordForCsv, {
      eventType: 'case_created',
      summary: `Caso oficial registado: ${dadosOficiais.Nome_Completo || dadosOficiais.ID_Caso}`,
      payload: {
        ID_Caso: dadosOficiais.ID_Caso,
        Nome_Completo: dadosOficiais.Nome_Completo,
        Risco_Calculado: dadosOficiais.Risco_Calculado,
        Avaliacao_Prioridade: dadosOficiais.Avaliacao_Prioridade,
        Indicadores_Risco_Activos: dadosOficiais.Indicadores_Risco_Activos
      },
      eventPointWkt: buildPointWkt(
        normalizarCoordenada(dadosOficiais.Latitude),
        normalizarCoordenada(dadosOficiais.Longitude)
      )
    });

    // Enviar CSV do registo por email para destinatário operacional (em background, não bloquear resposta)
    try {
      const { sendEmailWithAttachments } = require('./emailSender');
      // Construir CSV em memória apenas com os headers oficiais e o registro atual
      const csvFieldIds = csvHeadersOficial.map(h => h.id);
      const escapeCsv = (v) => {
        if (v === null || v === undefined) return '';
        const s = String(v);
        if (s.includes(',') || s.includes('"') || s.includes('\n')) {
          return '"' + s.replace(/"/g, '""') + '"';
        }
        return s;
      };
      const headerLine = csvFieldIds.join(',');
      const rowLine = csvFieldIds.map(k => escapeCsv(dadosOficiais[k] || '')).join(',');
      const csvContent = headerLine + '\n' + rowLine + '\n';

      // Enviar em background para não atrasar a resposta ao cliente
      setImmediate(async () => {
        try {
          const attachments = [
            {
              filename: `registro_caso_${dadosOficiais.ID_Caso || 'unknown'}.csv`,
              content: Buffer.from(csvContent, 'utf8'),
              contentType: 'text/csv'
            }
          ];
          // Endereço de destino configurável via EMAIL_DESTINATARIOS
          const destinatario = process.env.EMAIL_DESTINATARIOS
            ? process.env.EMAIL_DESTINATARIOS.split(',')
            : ['destinatario.exemplo@example.com'];
          await sendEmailWithAttachments(destinatario, attachments, { subject: `Registro Caso ID ${dadosOficiais.ID_Caso}` });
          debugLogger.log('Envio de CSV do registo concluído (background)', { id: dadosOficiais.ID_Caso });
        } catch (emailErr) {
          debugLogger.warn('Falha ao enviar CSV do registo por email (background)', emailErr.message);
        }
      });
    } catch (e) {
      debugLogger.warn('Erro ao disparar envio de email do registo', e.message);
    }
    
    debugLogger.success('Caso registado com sucesso', {
      id: dadosOficiais.ID_Caso,
      nome: dadosOficiais.Nome_Completo,
      risco: dadosOficiais.Risco_Calculado,
      prioridade: dadosOficiais.Avaliacao_Prioridade
    });
    
    // Resposta de sucesso
    // Comparação de campos: quais campos do CSV oficial não estão no objeto gravado e vice-versa
    const csvFieldIds = csvHeadersOficial.map(h => h.id);
    const dadosKeys = Object.keys(dadosOficiais || {});
    const missingInDados = csvFieldIds.filter(f => !dadosKeys.includes(f));
    const extraInDados = dadosKeys.filter(k => !csvFieldIds.includes(k) && !['ID_Caso'].includes(k));
    const warnings = [dadosOficiais._warnings || ''];
    if (dbSync.enabled && !dbSync.success) warnings.push(`PostGIS: ${dbSync.error}`);

    res.status(201).json({
      success: true,
      message: 'Caso registado com sucesso!',
      caso: {
        id: dadosOficiais.ID_Caso,
        nome: dadosOficiais.Nome_Completo,
        risco: dadosOficiais.Risco_Calculado,
        prioridade: dadosOficiais.Avaliacao_Prioridade,
        data_registo: dadosOficiais.Data_Registo,
        indicadores_ativos: dadosOficiais.Indicadores_Risco_Activos
      },
      verificacao_campos: {
        faltam_no_objeto: missingInDados,
        extras_no_objeto: extraInDados
      },
      db_sync: dbSync,
      warnings: warnings.filter(Boolean).join('; ')
    });
    
  } catch (error) {
    debugLogger.error('Erro ao registar caso oficial', error);
    res.status(500).json({
      success: false,
      error: 'Erro interno ao processar registo oficial'
    });
  }
});

/**
 * GET /api/casos-oficial - Listar casos oficiais
 */
router.get('/casos-oficial', async (req, res) => {
  try {
    if (shouldReadOfficialFromDb()) {
      const headers = csvHeadersOficial.map(h => h.id);
      const limit = req.query.limit ? Number(req.query.limit) : 500;
      const offset = req.query.offset ? Number(req.query.offset) : 0;
      const casos = await withClient(client => listOfficialPayloadCases(client, headers, { limit, offset }));
      return res.json({
        success: true,
        source: 'db',
        total: casos.length,
        casos
      });
    }

    const casos = [];
    
    if (!fs.existsSync(csvOficialPath)) {
      return res.json({
        success: true,
        total: 0,
        casos: []
      });
    }
    
    fs.createReadStream(csvOficialPath)
      .pipe(csv())
      .on('data', (data) => casos.push(data))
      .on('end', () => {
        res.json({
          success: true,
          source: 'csv',
          total: casos.length,
          casos: casos
        });
      })
      .on('error', (error) => {
        debugLogger.error('Erro ao ler CSV oficial', error);
        res.status(500).json({
          success: false,
          error: 'Erro ao carregar casos oficiais'
        });
      });
      
  } catch (error) {
    debugLogger.error('Erro geral ao listar casos', error);
    res.status(500).json({
      success: false,
      error: 'Erro interno do servidor'
    });
  }
});

/**
 * GET /api/casos-oficial/headers - Retorna a lista canónica de headers do CSV oficial
 */
router.get('/casos-oficial/headers', (req, res) => {
  try {
    const headers = csvHeadersOficial.map(h => h.id);
    res.json({ success: true, headers });
  } catch (e) {
    debugLogger.error('Erro ao obter headers oficiais', e.message);
    res.status(500).json({ success: false, error: 'Erro interno ao obter headers' });
  }
});

/**
 * GET /api/estatisticas-oficial - Estatísticas dos casos oficiais
 */
router.get('/estatisticas-oficial', async (req, res) => {
  try {
    if (shouldReadOfficialFromDb()) {
      const estatisticas = await withClient(client => getCaseStatistics(client));
      return res.json({ success: true, source: 'db', estatisticas });
    }

    const casos = [];
    
    if (!fs.existsSync(csvOficialPath)) {
      return res.json({
        success: true,
        estatisticas: {
          total: 0,
          por_risco: { Normal: 0, Moderado: 0, Elevado: 0 },
          por_prioridade: { 'Rotina': 0, 'Urgente': 0, 'Muito Urgente': 0 },
          ultimos_30_dias: 0
        }
      });
    }
    
    fs.createReadStream(csvOficialPath)
      .pipe(csv())
      .on('data', (data) => casos.push(data))
      .on('end', () => {
        const estatisticas = {
          total: casos.length,
          por_tipo: {},
          por_risco: {
            Normal: casos.filter(c => c.Risco_Calculado === 'Normal').length,
            Moderado: casos.filter(c => c.Risco_Calculado === 'Moderado').length,
            Elevado: casos.filter(c => c.Risco_Calculado === 'Elevado').length
          },
          por_prioridade: {
            'Rotina': casos.filter(c => c.Avaliacao_Prioridade === 'Rotina').length,
            'Urgente': casos.filter(c => c.Avaliacao_Prioridade === 'Urgente').length,
            'Muito Urgente': casos.filter(c => c.Avaliacao_Prioridade === 'Muito Urgente').length
          },
          ultimos_30_dias: casos.filter(c => {
            if (!c.Data_Registo) return false;
            const dataCaso = new Date(c.Data_Registo);
            const agora = new Date();
            const diferenca = (agora - dataCaso) / (1000 * 60 * 60 * 24);
            return diferenca <= 30;
          }).length
        };
        // Calcular contagens por Tipo_Desaparecimento (normalizar texto)
        try {
          const tipos = {};
          casos.forEach(caso => {
            const tipo = (caso.Tipo_Desaparecimento || caso.Tipo_Desaparecimento_Oficial || 'Desconhecido').toString().trim() || 'Desconhecido';
            tipos[tipo] = (tipos[tipo] || 0) + 1;
          });
          estatisticas.por_tipo = tipos;
        } catch (e) {
          estatisticas.por_tipo = {};
        }
        
        res.json({
          success: true,
          source: 'csv',
          estatisticas: estatisticas
        });
      })
      .on('error', (error) => {
        debugLogger.error('Erro ao calcular estatísticas', error);
        res.status(500).json({
          success: false,
          error: 'Erro ao calcular estatísticas oficiais'
        });
      });
      
  } catch (error) {
    debugLogger.error('Erro geral nas estatísticas', error);
    res.status(500).json({
      success: false,
      error: 'Erro interno do servidor'
    });
  }
});


/**
 * POST /api/casos-oficial/encontrado - marcar um caso como encontrado, gravando dados de localização e meios
 * payload: { ID_Caso: string, encontrado: { Data_Encontrado, Hora_Encontrado, Local_Encontrado, Freguesia_Encontrado, Concelho_Encontrado, Latitude_Encontrado, Longitude_Encontrado, Estado_Pessoa, Meios_Accionados, Quem_Encontrou, Nome_Quem_Encontrou, Contacto_Quem_Encontrou, Distancia_km } }
 */
router.post('/casos-oficial/encontrado', authenticateToken ? authenticateToken : (req, res, next) => next(), async (req, res) => {
  try {
    const { ID_Caso, encontrado } = req.body || {};
    if (!ID_Caso || !encontrado) {
      return res.status(400).json({ success: false, error: 'Payload inválido. Espera-se ID_Caso e objeto encontrado.' });
    }

    // Ler todos os casos, localizar o caso pelo ID e atualizá-lo
    if (!fs.existsSync(csvOficialPath)) {
      return res.status(404).json({ success: false, error: 'Ficheiro de casos não encontrado' });
    }

    const casos = [];
    await new Promise((resolve, reject) => {
      fs.createReadStream(csvOficialPath)
        .pipe(csv())
        .on('data', (data) => casos.push(data))
        .on('end', resolve)
        .on('error', reject);
    });

    const idx = casos.findIndex(c => String(c.ID_Caso) === String(ID_Caso) || String(c.ID) === String(ID_Caso));
    if (idx === -1) return res.status(404).json({ success: false, error: 'Caso não encontrado' });

    const casoOriginal = casos[idx];

  // Normalizar coordenadas recebidas (se existirem) usando helper que cobre variantes
  const normalizedPayload = normalizarCamposCoordenadas(encontrado || {});
  let latEncontrado = normalizedPayload.latEncontrado;
  let lonEncontrado = normalizedPayload.lonEncontrado;

    // Priorizar geocodificação com Local/Freguesia/Concelho mesmo que coordenadas tenham sido fornecidas
    let geocoded = null;
    if (encontrado.Local_Encontrado || encontrado.Freguesia_Encontrado || encontrado.Concelho_Encontrado) {
      try {
        geocoded = await obterCoordenadas({ local: encontrado.Local_Encontrado || casoOriginal.Local_Ultimo_Avistamento, freguesia: encontrado.Freguesia_Encontrado || casoOriginal.Freguesia, concelho: encontrado.Concelho_Encontrado || casoOriginal.Concelho });
      } catch (e) {
        debugLogger.warn('Geocoding falhou no endpoint encontrado', e.message);
      }
    }

    // Se geocoding tiver produzido resultado, preferi-lo. Caso contrário, usar coordenadas fornecidas se existirem.
    const latF = (geocoded && geocoded.lat !== undefined) ? geocoded.lat : (latEncontrado !== null ? latEncontrado : '');
    const lonF = (geocoded && geocoded.lon !== undefined) ? geocoded.lon : (lonEncontrado !== null ? lonEncontrado : '');
    if (geocoded && geocoded.level) debugLogger.log('Geocoding (encontrado) devolveu nível', { level: geocoded.level, id: ID_Caso });

    // Calcular distância haversine se tivermos coordenadas originais e encontradas
    let distancia_km = '';
    try {
      // Normalizar coordenadas de origem (caso original) usando helper que verifica variantes de nomes
      const normalizedOriginal = normalizarCamposCoordenadas(casoOriginal || {});
      const latOrig = normalizedOriginal.latOrig;
      const lonOrig = normalizedOriginal.lonOrig;
      if (latOrig !== null && lonOrig !== null && latF !== '' && lonF !== '') {
        const toRad = x => x * Math.PI / 180;
        const R = 6371;
        const dLat = toRad(Number(latF) - Number(latOrig));
        const dLon = toRad(Number(lonF) - Number(lonOrig));
        const a = Math.sin(dLat/2) * Math.sin(dLat/2) + Math.cos(toRad(latOrig)) * Math.cos(toRad(Number(latF))) * Math.sin(dLon/2) * Math.sin(dLon/2);
        const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
        distancia_km = (R * c).toFixed(3);
      }
    } catch (e) {
      distancia_km = '';
    }

    // Atualizar o objeto do caso com campos de 'encontrado' e audit trail
    const atualizado = { ...casoOriginal };
    atualizado.Data_Encontrado = encontrado.Data_Encontrado || '';
    atualizado.Hora_Encontrado = encontrado.Hora_Encontrado || '';
    atualizado.Local_Encontrado = encontrado.Local_Encontrado || '';
    atualizado.Freguesia_Encontrado = encontrado.Freguesia_Encontrado || '';
    atualizado.Concelho_Encontrado = encontrado.Concelho_Encontrado || '';
    atualizado.Latitude_Encontrado = latF !== '' ? String(latF) : '';
    atualizado.Longitude_Encontrado = lonF !== '' ? String(lonF) : '';
    atualizado.Estado_Pessoa_Encontrado = encontrado.Estado_Pessoa || encontrado.Estado_Pessoa_Encontrado || '';
    atualizado.Meios_Accionados = encontrado.Meios_Accionados || '';
    atualizado.Quem_Encontrou = encontrado.Quem_Encontrou || '';
    atualizado.Nome_Quem_Encontrou = encontrado.Nome_Quem_Encontrou || '';
    atualizado.Contacto_Quem_Encontrou = encontrado.Contacto_Quem_Encontrou || '';
    atualizado.Distancia_km_Encontrado = encontrado.Distancia_km !== undefined && encontrado.Distancia_km !== null ? String(encontrado.Distancia_km) : distancia_km;

    // Audit trail: quem marcou + timestamp
    atualizado.Encontrado_Marcador = encontrado.Encontrado_Marcador || encontrado.Quem_Registrou || '';
    atualizado.Encontrado_DataHora_Marcacao = encontrado.Encontrado_DataHora_Marcacao || new Date().toISOString();

    // sobrescrever o caso no array
    casos[idx] = atualizado;

    // Reescrever o CSV completo (mantendo headers originais + encontradoFields e auditFields se necessário)
    const finalHeaders = [...csvHeadersOficial.map(h => h.id)];
    encontradoFields.forEach(f => { if (!finalHeaders.includes(f.id)) finalHeaders.push(f.id); });
    auditFields.forEach(f => { if (!finalHeaders.includes(f.id)) finalHeaders.push(f.id); });

    // Construir csvWriter com headers dinâmicos
    const csvWriter = createCsvWriter({ path: csvOficialPath, header: finalHeaders.map(h => ({ id: h, title: h })), append: false });

    // Garantir que cada caso tem as chaves de todos os headers
    const registros = casos.map(c => {
      const r = {};
      finalHeaders.forEach(h => { r[h] = c[h] !== undefined ? c[h] : ''; });
      return r;
    });

    await csvWriter.writeRecords(registros);

    const dbSync = await syncOfficialCaseToDb(atualizado, {
      eventType: 'person_found',
      summary: `Pessoa encontrada no caso ${ID_Caso}`,
      payload: {
        ID_Caso,
        Data_Encontrado: atualizado.Data_Encontrado,
        Hora_Encontrado: atualizado.Hora_Encontrado,
        Local_Encontrado: atualizado.Local_Encontrado,
        Freguesia_Encontrado: atualizado.Freguesia_Encontrado,
        Concelho_Encontrado: atualizado.Concelho_Encontrado,
        Latitude_Encontrado: atualizado.Latitude_Encontrado,
        Longitude_Encontrado: atualizado.Longitude_Encontrado,
        Estado_Pessoa_Encontrado: atualizado.Estado_Pessoa_Encontrado,
        Distancia_km_Encontrado: atualizado.Distancia_km_Encontrado
      },
      eventPointWkt: buildPointWkt(
        normalizarCoordenada(atualizado.Latitude_Encontrado),
        normalizarCoordenada(atualizado.Longitude_Encontrado)
      )
    });

    debugLogger.success('Caso marcado como encontrado e CSV atualizado', { id: ID_Caso });

    res.json({
      success: true,
      message: 'Caso atualizado com dados de encontrado',
      caso: atualizado,
      db_sync: dbSync,
      warnings: dbSync.enabled && !dbSync.success ? `PostGIS: ${dbSync.error}` : ''
    });

  } catch (error) {
    debugLogger.error('Erro ao marcar caso como encontrado', error);
    res.status(500).json({ success: false, error: 'Erro interno ao marcar caso como encontrado' });
  }
});

// Exportar router como o export padrão para compatibilidade com código existente,
// e anexar `csvHeadersOficial` como propriedade para ferramentas de auditoria.
// Exportar router como padrão e também utilitários para testes
module.exports = router;
module.exports.csvHeadersOficial = csvHeadersOficial;
// Exportar helper de geocoding para testes e uso em scripts
module.exports.obterCoordenadas = obterCoordenadas;