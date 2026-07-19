const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { buildPrompt } = require('./promptBuilder');
const { generatePdf } = require('./pdfGenerator');
const { sendEmail, sendEmailWithAttachments } = require('./emailSender');
const multer = require('multer');
const llmService = require('./llmService');
const { DebugLogger } = require('./debugLogger');
const csv = require('csv-parse/sync'); // <-- Importação padronizada
const { parseCsvSafe, parseCsvFile } = require('./csvUtil');

// Importar rotas do sistema oficial
const registoCasosOficial = require('./registoCasosOficial');
let dbRouter = null;
try {
  dbRouter = require('./dbRoutes');
} catch (e) {
  console.log('db router não encontrado/configurado:', e.message);
}
let syncRouter = null;
try {
  syncRouter = require('./syncRoutes');
} catch (e) {
  console.log('sync router não encontrado/configurado:', e.message);
}
// Router de autenticação local
let authRouter = null;
try {
  authRouter = require('./auth');
} catch (e) {
  // não crítico se não existir
  console.log('auth router não encontrado (ignore se estiver a criar auth):', e.message);
}
const authenticateTokenGlobal = authRouter && authRouter.authenticateToken ? authRouter.authenticateToken : null;

// Criar instância do debugLogger
const debugLogger = new DebugLogger();

const app = express();
const PORT = process.env.PORT || 4000;
const HOST = process.env.HOST || '0.0.0.0';
const CORS_ORIGIN = process.env.CORS_ORIGIN || '*';

// Caminhos padrão para ficheiros CSV e documentos
const CSV_FILE_OFFICIAL = path.join(__dirname, '../historico_casos_pdgnr_oficial.csv');
const CSV_FILE_LEGACY = path.join(__dirname, '../historico_casos.csv');

// Escolher ficheiro CSV: preferir o oficial apenas se existir e contiver conteúdo válido.
function chooseCsvFile() {
  try {
    if (fs.existsSync(CSV_FILE_OFFICIAL)) {
      const raw = fs.readFileSync(CSV_FILE_OFFICIAL, 'utf8');
      if (raw && raw.toString().trim().length > 5) {
        return CSV_FILE_OFFICIAL;
      } else {
        // Ficheiro oficial existe mas parece vazio/sem conteúdo -> fallback
        debugLogger.warn('CSV oficial existe mas vazio/insuficiente, a usar fallback para legacy CSV', { path: CSV_FILE_OFFICIAL });
      }
    }
  } catch (e) {
    debugLogger.warn('Erro ao ler CSV oficial, a usar fallback para legacy CSV', e && e.message ? e.message : e);
  }

  if (fs.existsSync(CSV_FILE_LEGACY)) return CSV_FILE_LEGACY;
  // fallback para caminho oficial (mesmo que não exista) para manter compatibilidade
  return CSV_FILE_OFFICIAL;
}

const CSV_FILE = chooseCsvFile();

// Pasta para guardar PDFs/documentos gerados
const DOCUMENTOS_PATH = path.join(__dirname, 'documentos');
if (!fs.existsSync(DOCUMENTOS_PATH)) {
  fs.mkdirSync(DOCUMENTOS_PATH, { recursive: true });
}

// === MIDDLEWARE ===
app.set('trust proxy', 1);
app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'no-referrer');
  res.setHeader('Permissions-Policy', 'geolocation=(self), camera=(), microphone=()');
  next();
});

app.use(cors({
  origin: CORS_ORIGIN === '*' ? '*' : CORS_ORIGIN.split(',').map(origin => origin.trim()).filter(Boolean),
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));

app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// Configuração de upload
const upload = multer({ 
  dest: 'uploads/',
  limits: {
    fileSize: 10 * 1024 * 1024 // 10MB
  }
});

// Função auxiliar para guardar PDF nos documentos
async function guardarPDF(pdfBuffer, nomeArquivo) {
  try {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const fileName = `${nomeArquivo}_${timestamp}.pdf`;
    const filePath = path.join(DOCUMENTOS_PATH, fileName);
    
    fs.writeFileSync(filePath, pdfBuffer);
    debugLogger.success('PDF guardado', { 
      caminho: filePath, 
      tamanho: pdfBuffer.length 
    });
    
    return filePath;
  } catch (error) {
    debugLogger.error('Erro ao guardar PDF', error);
    throw error;
  }
}

// === SERVIR APLICAÇÃO FRONTEND ===
const FRONTEND_ROOT = path.join(__dirname, '../frontend');
const FRONTEND_BUILD = path.join(FRONTEND_ROOT, 'build');
const FRONTEND_STATIC_PATH = fs.existsSync(path.join(FRONTEND_BUILD, 'index.html')) ? FRONTEND_BUILD : FRONTEND_ROOT;
const FRONTEND_PUBLIC_PATH = path.join(FRONTEND_ROOT, 'public');
function sendFrontendAsset(res, assetName, fallbackPath = null) {
  const candidates = [
    path.join(FRONTEND_STATIC_PATH, assetName),
    path.join(FRONTEND_PUBLIC_PATH, assetName)
  ];
  if (fallbackPath) candidates.push(fallbackPath);
  const found = candidates.find(candidate => fs.existsSync(candidate));
  if (!found) return res.status(404).json({ success: false, error: 'Asset não encontrado' });
  return res.sendFile(found);
}
app.get('/app', (req, res, next) => {
  if (req.originalUrl === '/app' || req.originalUrl.startsWith('/app?')) return res.redirect('/app/');
  return next();
});
app.get('/logo.png', (req, res) => sendFrontendAsset(res, 'logo.png'));
app.get('/logo_capa.png', (req, res) => sendFrontendAsset(res, 'logo_capa.png', path.join(__dirname, '../logo_capa.png')));
app.get('/manifest.json', (req, res) => sendFrontendAsset(res, 'manifest.json'));
app.get('/service-worker.js', (req, res) => sendFrontendAsset(res, 'service-worker.js'));
app.use('/app', express.static(FRONTEND_STATIC_PATH));
app.use('/frontend', express.static(FRONTEND_STATIC_PATH));
app.get('/app/*', (req, res, next) => {
  const indexPath = path.join(FRONTEND_STATIC_PATH, 'index.html');
  if (!fs.existsSync(indexPath)) return next();
  return res.sendFile(indexPath);
});

function isPublicApiPath(pathname) {
  const publicPrefixes = ['/auth', '/status', '/health', '/geocode', '/reverse-geocode'];
  return publicPrefixes.some(prefix => pathname === prefix || pathname.startsWith(`${prefix}/`));
}

function protectSensitiveApi(req, res, next) {
  if (isPublicApiPath(req.path)) return next();
  if (!authenticateTokenGlobal) {
    return res.status(503).json({ success: false, error: 'Autenticação indisponível' });
  }
  return authenticateTokenGlobal(req, res, next);
}

app.use('/api', protectSensitiveApi);

// Montar routers adicionais (API oficial/legacy)
try {
  if (registoCasosOficial) {
    app.use('/api', registoCasosOficial);
    debugLogger.log('Router registoCasosOficial montado em /api');
  }
} catch (e) {
  debugLogger.warn('Falha ao montar router registoCasosOficial', e && e.message ? e.message : e);
}

// Montar router paralelo DB/PostGIS (não substitui CSV ainda)
try {
  if (dbRouter) {
    app.use('/api/db', dbRouter);
    debugLogger.log('Router db montado em /api/db');
  }
} catch (e) {
  debugLogger.warn('Falha ao montar router db', e && e.message ? e.message : e);
}

try {
  if (syncRouter) {
    app.use('/api/sync', syncRouter);
    debugLogger.log('Router sync montado em /api/sync');
  }
} catch (e) {
  debugLogger.warn('Falha ao montar router sync', e && e.message ? e.message : e);
}

// Montar router de auth se disponível
try {
  if (authRouter) {
    app.use('/api/auth', authRouter);
    debugLogger.log('Router auth montado em /api/auth');
  }
} catch (e) {
  debugLogger.warn('Falha ao montar router auth', e && e.message ? e.message : e);
}

// Rota principal - redirecionar para app
app.get('/', (req, res) => {
  res.redirect('/app');
});

// === APIS EXISTENTES (MANTIDAS) ===

// Endpoint para verificar se o servidor está ativo
app.get('/api/status', async (req, res) => {
  try {
    // Testar conexão LLM
    let llmStatus = false;
    try {
      const testeConexao = await llmService.testarConexao();
      llmStatus = testeConexao.sucesso || false;
    } catch (error) {
      llmStatus = false;
    }
    
    res.json({ 
      status: 'ativo', 
      timestamp: new Date().toISOString(),
      version: '1.0.0',
      service: 'SARIA - Sistema Pessoas Desaparecidas',
      llm: llmStatus,
      email: true, // Email sempre configurado
      csv: fs.existsSync(CSV_FILE)
    });
  } catch (error) {
    res.status(500).json({
      status: 'erro',
      timestamp: new Date().toISOString(),
      error: error.message,
      llm: false,
      email: true,
      csv: fs.existsSync(CSV_FILE)
    });
  }
});

app.get('/api/health', async (req, res) => {
  const health = {
    status: 'ok',
    timestamp: new Date().toISOString(),
    checks: {
      api: true,
      db: false,
      postgis: false,
      pgcrypto: false,
      csv: fs.existsSync(CSV_FILE),
      frontend_build: fs.existsSync(path.join(FRONTEND_BUILD, 'index.html'))
    }
  };

  try {
    const { withClient } = require('./db');
    const db = await withClient(async (client) => {
      const dbResult = await client.query('SELECT 1 AS ok');
      const extResult = await client.query("SELECT extname FROM pg_extension WHERE extname IN ('postgis', 'pgcrypto')");
      return { ok: dbResult.rows[0]?.ok === 1, extensions: extResult.rows.map(row => row.extname) };
    });
    health.checks.db = db.ok;
    health.checks.postgis = db.extensions.includes('postgis');
    health.checks.pgcrypto = db.extensions.includes('pgcrypto');
  } catch (error) {
    health.status = 'degraded';
    health.error = error.message;
  }

  const httpStatus = health.checks.db && health.checks.postgis ? 200 : 503;
  res.status(httpStatus).json(health);
});

// Endpoint para obter o prompt atual
app.get('/api/prompt', (req, res) => {
  try {
    if (!fs.existsSync(CSV_FILE)) {
      return res.status(404).json({ error: 'Ficheiro CSV não encontrado' });
    }
    
    const data = fs.readFileSync(CSV_FILE, 'utf-8');
    const prompt = buildPrompt(data);
    res.json({ 
      prompt,
      timestamp: new Date().toISOString(),
      arquivo: 'historico_casos.csv'
    });
  } catch (error) {
    console.error('Erro ao gerar prompt:', error);
    res.status(500).json({ error: 'Erro ao processar dados do CSV' });
  }
});

// Endpoint para obter dados do caso atual (último registo)
app.get('/api/caso-atual', (req, res) => {
  try {
    if (!fs.existsSync(CSV_FILE)) {
      return res.status(404).json({ error: 'Ficheiro CSV não encontrado' });
    }

  const csvData = fs.readFileSync(CSV_FILE, 'utf-8');
  const records = parseCsvSafe(csvData, { columns: true, skip_empty_lines: true });
    
    if (records.length === 0) {
      return res.status(404).json({ error: 'Nenhum caso encontrado no CSV' });
    }

    const casoAtual = records[records.length - 1];
    res.json({ 
      caso: casoAtual, 
      totalCasos: records.length,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('Erro ao obter caso atual:', error);
    res.status(500).json({ error: 'Erro ao processar caso atual' });
  }
});

// Endpoint para processar resposta LLM e gerar PDF
app.post('/api/processar', async (req, res) => {
  try {
    const { respostaLLM, emailsDestino } = req.body;
    
    if (!respostaLLM) {
      return res.status(400).json({ error: 'Resposta da LLM é obrigatória' });
    }

    const csvData = fs.readFileSync(CSV_FILE, 'utf-8');
    const prompt = buildPrompt(csvData);
    
    // Gerar PDF
    console.log('📄 A gerar PDF...');
    const pdfBuffer = await generatePdf(csvData, prompt, respostaLLM);
    
    // Enviar email se endereços foram fornecidos
    if (emailsDestino && emailsDestino.length > 0) {
      console.log('📧 A enviar email para:', emailsDestino);
      await sendEmail(emailsDestino, pdfBuffer);
    }

    res.json({ 
      status: 'sucesso',
      mensagem: 'PDF gerado e email enviado com sucesso',
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('Erro ao processar:', error);
    res.status(500).json({ 
      error: 'Erro interno do servidor',
      detalhes: error.message 
    });
  }
});

// Endpoint para gerar PDF e devolver como attachment (force download no browser)
app.post('/api/exportar-pdf-download', async (req, res) => {
  try {
    const { respostaLLM, filename } = req.body;

    if (!respostaLLM) {
      return res.status(400).json({ error: 'Resposta da LLM é obrigatória' });
    }

    const csvData = fs.readFileSync(CSV_FILE, 'utf-8');
    const prompt = buildPrompt(csvData);

    // Gerar PDF em memória
    const pdfBuffer = await generatePdf(csvData, prompt, respostaLLM);

    // Nome seguro para o ficheiro
    const safeNameBase = filename ? filename.replace(/[^a-zA-Z0-9_\-\.]/g, '_') : `relatorio_${Date.now()}`;
    const safeName = safeNameBase.endsWith('.pdf') ? safeNameBase : `${safeNameBase}.pdf`;

    // Enviar como attachment para que o browser apresente "Save as"
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${safeName}"`);
    return res.send(pdfBuffer);
  } catch (error) {
    console.error('Erro ao exportar PDF (download):', error);
    return res.status(500).json({ error: 'Erro ao gerar PDF para download', detalhes: error.message });
  }
});

// Endpoint para testar LLM
app.get('/api/testar-llm', async (req, res) => {
  try {
    const resultado = await llmService.testarConexao();
    res.json(resultado);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Endpoint para gerar previsão manual
app.post('/api/previsao', async (req, res) => {
  try {
    if (!req.user || !['admin', 'superadmin'].includes(req.user.role)) {
      return res.status(403).json({ success: false, error: 'Prompt livre reservado a administradores' });
    }
    const { prompt } = req.body;
    if (!prompt) {
      return res.status(400).json({ error: 'Prompt é obrigatório' });
    }
    
    const predicao = await llmService.gerarPredicao(prompt);
    res.json({ predicao, timestamp: new Date().toISOString() });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Endpoint para gerar análise do último caso
app.get('/api/gerar-analise-ultimo', async (req, res) => {
  try {
    console.log('🔍 Iniciando análise do último caso...');
    debugLogger.section('ANÁLISE DO ÚLTIMO CASO');
    
    // Ler dados do CSV
    if (!fs.existsSync(CSV_FILE)) {
      debugLogger.warn('CSV não encontrado para análise');
      return res.status(404).json({
        success: false,
        error: 'Nenhum caso encontrado para análise'
      });
    }

    const csvData = fs.readFileSync(CSV_FILE, 'utf8');
    debugLogger.log('CSV carregado para análise', { tamanho: csvData.length });
    
    // Gerar prompt com base nos dados históricos
    const prompt = buildPrompt(csvData);
    debugLogger.log('Prompt construído para análise');
    
    // Gerar análise com LLM
    const analise = await llmService.gerarPredicao(prompt);
    debugLogger.log('Análise LLM concluída', {
      success: analise?.success,
      responseLength: analise?.response?.length,
      tokensUsed: analise?.tokensUsed
    });
    
    // Verificar se a análise foi bem-sucedida e extrair apenas o texto da resposta
    if (analise?.success && analise?.response) {
      // Responder imediatamente com a análise
      res.json({
        success: true,
        analise: analise.response, // Enviar apenas o texto da resposta
        analysis: analise.analysis || null,
        validation: analise.validation || null,
        metadata: {
          tokensUsed: analise.tokensUsed,
          responseTime: analise.responseTime,
          model: analise.model,
          promptVersion: analise.promptVersion,
          promptHash: analise.promptHash
        },
        timestamp: new Date().toISOString()
      });

      // Executar workflow completo (PDF + Email) em background
      setImmediate(async () => {
        try {
          debugLogger.section('WORKFLOW COMPLETO - PDF E EMAIL');
          
          // Gerar PDF
          debugLogger.log('Iniciando geração de PDF...');
          const pdfBuffer = await generatePdf(csvData, prompt, analise.response);
          debugLogger.success('PDF gerado', { tamanho: pdfBuffer.length });
          
          // Obter dados do último caso para nome do arquivo
          const records = parseCsvSafe(csvData, { columns: true, skip_empty_lines: true });
          const ultimoCaso = records[records.length - 1];
          const nomeArquivo = `Relatorio_${ultimoCaso.Nome?.replace(/\s+/g, '_') || 'Caso'}_${ultimoCaso.ID_Caso}`;
          
          // Guardar PDF nos documentos
          const caminhoArquivo = await guardarPDF(pdfBuffer, nomeArquivo);
          console.log(`📄 PDF guardado em: ${caminhoArquivo}`);
          
          // Enviar email com PDF
          try {
            const emailsDestino = process.env.EMAIL_DESTINATARIOS 
              ? process.env.EMAIL_DESTINATARIOS.split(',')
              : ['destinatario.exemplo@example.com'];
            
            await sendEmail(emailsDestino, pdfBuffer);
            debugLogger.success('Email enviado', { destinatarios: emailsDestino });
            console.log('📧 Email enviado com sucesso para:', emailsDestino.join(', '));
          } catch (emailError) {
            debugLogger.warn('Erro ao enviar email (não crítico)', emailError);
            console.log('⚠️ Erro ao enviar email:', emailError.message);
          }
          // Enviar CSV do último registo como anexo (background)
          try {
            const destinatariosCsv = process.env.EMAIL_DESTINATARIOS ? process.env.EMAIL_DESTINATARIOS.split(',') : ['destinatario.exemplo@example.com'];
            const csvFieldIds = (registoCasosOficial && registoCasosOficial.csvHeadersOficial)
              ? registoCasosOficial.csvHeadersOficial.map(h => h.id)
              : Object.keys(ultimoCaso || {});

            const escapeCsvLocal = (v) => {
              if (v === null || v === undefined) return '';
              const s = String(v);
              if (s.includes(',') || s.includes('"') || s.includes('\n')) {
                return '"' + s.replace(/"/g, '""') + '"';
              }
              return s;
            };

            const headerLineLocal = csvFieldIds.join(',');
            const rowLineLocal = csvFieldIds.map(k => escapeCsvLocal(ultimoCaso[k] || '')).join(',');
            const csvContentLocal = headerLineLocal + '\n' + rowLineLocal + '\n';
            const attachments = [{ filename: `registro_caso_${ultimoCaso.ID_Caso || 'unknown'}.csv`, content: Buffer.from(csvContentLocal, 'utf8'), contentType: 'text/csv' }];
            const resp = await sendEmailWithAttachments(destinatariosCsv, attachments, { subject: `Registro Caso ID ${ultimoCaso.ID_Caso || 'unknown'}` });
            debugLogger.log('Envio de CSV do último registo concluído (background)', { id: ultimoCaso.ID_Caso, emailResult: resp });
          } catch (csvErr) {
            debugLogger.warn('Falha ao enviar CSV do último registo', csvErr && csvErr.message ? csvErr.message : csvErr);
          }
          
        } catch (workflowError) {
          debugLogger.error('Erro no workflow de PDF/Email', workflowError);
          console.log('⚠️ Erro no workflow:', workflowError.message);
        }
      });

    } else {
      debugLogger.error('Análise LLM falhou', analise);
      res.status(500).json({
        success: false,
        error: 'Falha na análise do LLM'
      });
    }

  } catch (error) {
    console.error('❌ Erro ao gerar análise:', error);
    res.status(500).json({
      success: false,
      error: 'Erro ao gerar análise: ' + error.message
    });
  }
});

// Endpoint para gerar análise de um caso específico (escolhido pelo utilizador)
app.post('/api/gerar-analise-caso', async (req, res) => {
  try {
    const { id } = req.body;

    if (!id) return res.status(400).json({ success: false, error: 'ID do caso é obrigatório' });

    if (!fs.existsSync(CSV_FILE)) {
      return res.status(404).json({ success: false, error: 'Ficheiro CSV não encontrado' });
    }

    const csvData = fs.readFileSync(CSV_FILE, 'utf8');
    const records = parseCsvSafe(csvData, { columns: true, skip_empty_lines: true, trim: true });

    // Tentar localizar pelo campo ID_Caso ou id
    const idx = records.findIndex(r => (r.ID_Caso && r.ID_Caso.toString() === id.toString()) || (r.id && r.id.toString() === id.toString()));
    if (idx === -1) {
      return res.status(404).json({ success: false, error: 'Caso não encontrado' });
    }

    // Reordenar registros para colocar o caso alvo no final (mantendo histórico)
    const target = records.splice(idx, 1)[0];
    records.push(target);

    // Reconstruir CSV textual a partir dos registros (cabecalhos a partir da primeira linha)
    const headers = Object.keys(records[0] || {});
    const escapeCsv = (v) => {
      if (v === null || v === undefined) return '';
      const s = v.toString();
      if (s.includes(',') || s.includes('"') || s.includes('\n')) {
        return '"' + s.replace(/"/g, '""') + '"';
      }
      return s;
    };

    const rebuilt = [headers.join(',')]
      .concat(records.map(r => headers.map(h => escapeCsv(r[h] || '')).join(',')))
      .join('\n');

    // Construir prompt e pedir previsão à LLM
    const prompt = buildPrompt(rebuilt);
    const analise = await llmService.gerarPredicao(prompt);

    if (analise?.success && analise?.response) {
      // Responder imediatamente com a análise
      res.json({
        success: true,
        analise: analise.response,
        analysis: analise.analysis || null,
        validation: analise.validation || null,
        metadata: {
          tokensUsed: analise.tokensUsed,
          responseTime: analise.responseTime,
          model: analise.model,
          promptVersion: analise.promptVersion,
          promptHash: analise.promptHash
        },
        timestamp: new Date().toISOString()
      });

      // Workflow background: gerar PDF e enviar email usando o CSV reconstituído
      setImmediate(async () => {
        try {
          debugLogger.section('WORKFLOW CASO ESPECÍFICO - PDF E EMAIL');
          debugLogger.log('Gerando PDF para caso selecionado');

          const pdfBuffer = await generatePdf(rebuilt, prompt, analise.response);
          debugLogger.success('PDF gerado (caso específico)', { tamanho: pdfBuffer.length });

          // Guardar PDF
          const nomeArquivo = `Relatorio_Caso_${target.Nome || target.Nome_Completo || target.ID_Caso || 'Caso'}`.replace(/\s+/g, '_');
          const caminhoArquivo = await guardarPDF(pdfBuffer, nomeArquivo);
          console.log(`📄 PDF guardado em: ${caminhoArquivo}`);

          // Enviar email
          try {
            const emailsDestino = process.env.EMAIL_DESTINATARIOS ? process.env.EMAIL_DESTINATARIOS.split(',') : ['destinatario.exemplo@example.com'];
            await sendEmail(emailsDestino, pdfBuffer);
            debugLogger.success('Email enviado (caso específico)', { destinatarios: emailsDestino });
            console.log('📧 Email enviado com sucesso para:', emailsDestino.join(', '));
          } catch (emailError) {
            debugLogger.warn('Erro ao enviar email (caso específico)', emailError);
            console.log('⚠️ Erro ao enviar email:', emailError.message);
          }
          // Enviar CSV do caso específico como anexo (background)
          try {
            const destinatariosCsv = process.env.EMAIL_DESTINATARIOS ? process.env.EMAIL_DESTINATARIOS.split(',') : ['destinatario.exemplo@example.com'];
            const csvFieldIds = (registoCasosOficial && registoCasosOficial.csvHeadersOficial)
              ? registoCasosOficial.csvHeadersOficial.map(h => h.id)
              : Object.keys(target || {});

            const escapeCsvLocal = (v) => {
              if (v === null || v === undefined) return '';
              const s = String(v);
              if (s.includes(',') || s.includes('"') || s.includes('\n')) {
                return '"' + s.replace(/"/g, '""') + '"';
              }
              return s;
            };

            const headerLineLocal = csvFieldIds.join(',');
            const rowLineLocal = csvFieldIds.map(k => escapeCsvLocal(target[k] || '')).join(',');
            const csvContentLocal = headerLineLocal + '\n' + rowLineLocal + '\n';
            const attachments = [{ filename: `registro_caso_${target.ID_Caso || 'unknown'}.csv`, content: Buffer.from(csvContentLocal, 'utf8'), contentType: 'text/csv' }];
            const resp = await sendEmailWithAttachments(destinatariosCsv, attachments, { subject: `Registro Caso ID ${target.ID_Caso || 'unknown'}` });
            debugLogger.log('Envio de CSV do caso específico concluído (background)', { id: target.ID_Caso, emailResult: resp });
          } catch (csvErr) {
            debugLogger.warn('Falha ao enviar CSV do caso específico', csvErr && csvErr.message ? csvErr.message : csvErr);
          }
        } catch (workflowError) {
          debugLogger.error('Erro no workflow (caso específico)', workflowError);
          console.log('⚠️ Erro no workflow:', workflowError.message);
        }
      });

    } else {
      debugLogger.error('Análise LLM falhou (caso específico)', analise);
      res.status(500).json({ success: false, error: 'Falha na análise do LLM' });
    }

  } catch (error) {
    console.error('❌ Erro ao gerar análise por caso:', error);
    res.status(500).json({ success: false, error: 'Erro ao gerar análise: ' + error.message });
  }
});

// === NOVAS APIS PARA REGISTO DE CASOS ===

// Headers do CSV baseados no formulário
const csvHeaders = [
  'ID_Caso', 'Nome', 'Idade', 'Sexo', 'Data_Desaparecimento', 'Hora_Desaparecimento',
  'Local_Ultimo_Avistamento', 'Tipo_Local', 'Concelho', 'Freguesia', 'Tipo_Terreno',
  'Condicoes_Meteorologicas', 'Altura_cm', 'Peso_kg', 'Cor_Cabelos', 'Cor_Olhos',
  'Sinais_Distintivos', 'Vestuario', 'Estado_Mental', 'Condicao_Fisica',
  'Capacidade_Locomocao', 'Doencas_Cronicas', 'Medicamentos_Vitais', 'Transporta_Medicacao',
  'Levou_Telemovel', 'Levou_Documentos', 'Levou_Dinheiro', 'Tipo_Desaparecimento',
  'Risco', 'Prioridade_Busca', 'Motivacao_Provavel', 'Contactos_Pessoa', 'Observacoes',
  'Denunciante_Nome', 'Denunciante_Relacao', 'Denunciante_Contacto', 'Data_Registo'
];

// Função auxiliar para limpeza de BOM UTF-8
function removerBOM(str) {
  return str.replace(/^\uFEFF/, '');
}

// GET - Listar todos os casos
app.get('/api/casos', (req, res) => {
  try {
    debugLogger.log('=== INICIO GET /api/casos ===');
    
    if (!fs.existsSync(CSV_FILE)) {
      debugLogger.warn('Arquivo CSV não existe: ' + CSV_FILE);
      return res.json({
        success: true,
        total: 0,
        casos: []
      });
    }

    debugLogger.log('Carregando arquivo CSV: ' + CSV_FILE);
  let csvData = fs.readFileSync(CSV_FILE, { encoding: 'utf8' });
    
    // Remover BOM se existir
    csvData = removerBOM(csvData);
    
    debugLogger.log('Dados CSV carregados. Tamanho: ' + csvData.length + ' caracteres');
    
    const records = parseCsvSafe(csvData, { columns: true, skip_empty_lines: true, trim: true });
    
    debugLogger.log('Parse concluído. Total de registros: ' + records.length);
    
    // Garantir que todos os registos têm ID_Caso limpo e aplicar reclassificação automática
    const casosLimpos = records.map(record => {
      const caseLimpo = {};
      Object.keys(record).forEach(key => {
        const keyLimpa = key.trim().replace(/[^\w_]/g, '') === 'IDCaso' ? 'ID_Caso' : key.trim();
        caseLimpo[keyLimpa] = record[key];
      });

      // Reclassificar automaticamente casos de suicídio
      const motivacao = caseLimpo.Motivacao_Provavel?.toLowerCase() || '';
      const observacoes = caseLimpo.Observacoes?.toLowerCase() || '';
      const estadoMental = caseLimpo.Estado_Mental?.toLowerCase() || '';
      
      // Detectar casos de suicídio
      const indicadoresSuicidio = [
        motivacao.includes('suicid'),
        motivacao.includes('suici'),
        observacoes.includes('suicid'),
        observacoes.includes('despedida'),
        observacoes.includes('mensagem'),
        observacoes.includes('carta'),
        estadoMental.includes('depress') && (motivacao.includes('suicid') || observacoes.includes('despedida'))
      ];
      
      const isCasoSuicidio = indicadoresSuicidio.some(indicador => indicador);
      
      // Se for caso de suicídio, forçar risco elevado
      if (isCasoSuicidio) {
        caseLimpo.Risco = 'Elevado';
        caseLimpo.Prioridade_Busca = 'Muito Urgente';
      }

      return caseLimpo;
    });
    
    res.json({
      success: true,
      total: casosLimpos.length,
      casos: casosLimpos
    });
  } catch (error) {
    debugLogger.error('Erro ao carregar casos:', error);
    console.error('Erro ao carregar casos:', error);
    res.status(500).json({
      success: false,
      error: 'Erro ao carregar casos'
    });
  }
});

// POST - Registar novo caso
// Protegido por token se o middleware estiver disponível
app.post('/api/casos', authenticateTokenGlobal ? authenticateTokenGlobal : (req, res, next) => next(), async (req, res) => {
  try {
    console.log('📝 Novo registo de caso recebido');
    console.log('Dados recebidos:', JSON.stringify(req.body, null, 2));
    
    const dadosFormulario = req.body;
    
    // Validação básica dos campos obrigatórios
    const camposObrigatorios = ['Nome', 'Idade', 'Sexo', 'Data_Desaparecimento', 'Hora_Desaparecimento', 'Local_Ultimo_Avistamento'];
    const camposFalta = camposObrigatorios.filter(campo => !dadosFormulario[campo]);
    
    if (camposFalta.length > 0) {
      return res.status(400).json({
        success: false,
        error: `Campos obrigatórios em falta: ${camposFalta.join(', ')}`
      });
    }

    // Gerar próximo ID sequencial
    let proximoId = 1;
    
    // Se o arquivo CSV já existe, obter o último ID para continuar a sequência
    if (fs.existsSync(CSV_FILE)) {
      const csvExistente = fs.readFileSync(CSV_FILE, 'utf8');
      if (csvExistente.trim().length > 0) {
        try {
          const registosExistentes = parseCsvSafe(csvExistente, { columns: true, skip_empty_lines: true });
          if (registosExistentes.length > 0) {
            // Obter o maior ID existente e incrementar
            const ids = registosExistentes.map(r => parseInt(r.ID_Caso) || 0);
            proximoId = Math.max(...ids) + 1;
          }
        } catch (error) {
          console.log('Erro ao analisar IDs existentes, usando ID 1:', error.message);
        }
      }
    }
    
    const novoId = proximoId.toString();
    
    // Calcular nível de risco baseado nos indicadores
    const nivelRisco = calcularNivelRisco(dadosFormulario);
    
    // Determinar prioridade da busca
    const prioridadeBusca = determinarPrioridade(nivelRisco, dadosFormulario);

    // Preparar dados para o CSV
    const novoCaso = {
      ID_Caso: novoId,
      Nome: dadosFormulario.Nome || '',
      Idade: dadosFormulario.Idade || '',
      Sexo: dadosFormulario.Sexo || '',
      Data_Desaparecimento: dadosFormulario.Data_Desaparecimento || '',
      Hora_Desaparecimento: dadosFormulario.Hora_Desaparecimento || '',
      Local_Ultimo_Avistamento: dadosFormulario.Local_Ultimo_Avistamento || '',
      Tipo_Local: dadosFormulario.Tipo_Local || '',
      Concelho: dadosFormulario.Concelho || '',
      Freguesia: dadosFormulario.Freguesia || '',
      Tipo_Terreno: dadosFormulario.Tipo_Terreno || 'Urbano',
      Condicoes_Meteorologicas: dadosFormulario.Condicoes_Meteorologicas || '',
      Altura_cm: dadosFormulario.Altura_cm || '',
      Peso_kg: dadosFormulario.Peso_kg || '',
      Cor_Cabelos: dadosFormulario.Cor_Cabelos || '',
      Cor_Olhos: dadosFormulario.Cor_Olhos || '',
      Sinais_Distintivos: dadosFormulario.Sinais_Distintivos || '',
      Vestuario: dadosFormulario.Vestuario || '',
      Estado_Mental: dadosFormulario.Estado_Mental || 'Normal',
      Condicao_Fisica: dadosFormulario.Condicao_Fisica || 'Regular',
      Capacidade_Locomocao: dadosFormulario.Capacidade_Locomocao || 'Normal',
      Doencas_Cronicas: dadosFormulario.Doencas_Cronicas || 'Nenhuma',
      Medicamentos_Vitais: dadosFormulario.Medicamentos_Vitais || 'Nenhum',
      Transporta_Medicacao: dadosFormulario.Transporta_Medicacao || 'N/D',
      Levou_Telemovel: dadosFormulario.Levou_Telemovel || 'N/D',
      Levou_Documentos: dadosFormulario.Levou_Documentos || 'N/D',
      Levou_Dinheiro: dadosFormulario.Levou_Dinheiro || 'N/D',
      Tipo_Desaparecimento: dadosFormulario.Tipo_Desaparecimento || 'Involuntário',
      Risco: nivelRisco,
      Prioridade_Busca: prioridadeBusca,
      Motivacao_Provavel: dadosFormulario.Motivacao_Provavel || '',
      Contactos_Pessoa: dadosFormulario.Contactos_Pessoa || '',
      Observacoes: dadosFormulario.Observacoes || '',
      Denunciante_Nome: dadosFormulario.Denunciante_Nome || '',
      Denunciante_Relacao: dadosFormulario.Denunciante_Relacao || '',
      Denunciante_Contacto: dadosFormulario.Denunciante_Contacto || '',
      Data_Registo: new Date().toISOString().split('T')[0]
    };

    // Preparar linha CSV
    const csvLine = csvHeaders.map(header => {
      const value = novoCaso[header] || '';
      // Escapar aspas duplas e campos com vírgulas
      if (value.toString().includes(',') || value.toString().includes('"') || value.toString().includes('\n')) {
        return `"${value.toString().replace(/"/g, '""')}"`;
      }
      return value.toString();
    }).join(',');

    // Verificar se o ficheiro CSV já existe
    const ficheiroCsvExiste = fs.existsSync(CSV_FILE);
    
    // Se não existe, criar cabeçalhos primeiro
    if (!ficheiroCsvExiste) {
      console.log('📁 Criando novo ficheiro CSV...');
      fs.writeFileSync(CSV_FILE, csvHeaders.join(',') + '\n');
    }

    // Adicionar nova linha ao CSV
    fs.appendFileSync(CSV_FILE, csvLine + '\n');
    
    console.log(`✅ Caso registado com ID: ${novoId}`);
    console.log(`🎯 Nível de risco: ${nivelRisco}`);
    console.log(`⚡ Prioridade: ${prioridadeBusca}`);

    // Resposta de sucesso
    res.status(201).json({
      success: true,
      message: 'Caso registado com sucesso',
      caso: {
        id: novoId,
        nome: novoCaso.Nome,
        risco: nivelRisco,
        prioridade: prioridadeBusca,
        data_registo: novoCaso.Data_Registo
      }
    });

    // Fazer análise preditiva automaticamente em background (não bloquear resposta)
    setImmediate(async () => {
      try {
        console.log('🔔 Iniciando análise preditiva automática...');
        const csvData = fs.readFileSync(CSV_FILE, 'utf8');
        const prompt = buildPrompt(csvData);
        const analise = await llmService.gerarPredicao(prompt);
        console.log('✅ Análise preditiva concluída automaticamente');
        
        // Verificar se a análise foi bem-sucedida
        if (analise && analise.success && analise.response) {
          console.log('📊 Resultado:', analise.response.substring(0, 200) + '...');
          
          // Continuar workflow: gerar PDF e enviar email
          try {
            console.log('📄 A gerar PDF...');
            const pdfBuffer = await generatePdf(csvData, prompt, analise.response);
            console.log('✅ PDF gerado com sucesso');
            
            // Guardar PDF nos documentos
            try {
              const nomeArquivo = `Relatorio_${novoCaso.Nome?.replace(/\s+/g, '_') || 'Caso'}_${novoId}`;
              const caminhoArquivo = await guardarPDF(pdfBuffer, nomeArquivo);
              console.log(`📄 PDF guardado em: ${caminhoArquivo}`);
            } catch (saveError) {
              console.error('⚠️ Erro ao guardar PDF (não crítico):', saveError.message);
            }
            
            // Enviar email (se configurado)
            try {
              const emailsDestino = process.env.EMAIL_DESTINATARIOS 
                ? process.env.EMAIL_DESTINATARIOS.split(',')
                : ['destinatario.exemplo@example.com'];
              await sendEmail(emailsDestino, pdfBuffer);
              console.log('📧 Email enviado com sucesso para:', emailsDestino.join(', '));
            } catch (emailError) {
              console.error('⚠️ Erro ao enviar email (não crítico):', emailError.message);
            }
          } catch (pdfError) {
            console.error('⚠️ Erro ao gerar PDF (não crítico):', pdfError.message);
          }
        } else {
          console.error('⚠️ Análise LLM não retornou resposta válida');
        }
      } catch (error) {
        console.error('⚠️ Erro na análise automática (não crítico):', error.message);
      }
    });

  } catch (error) {
    console.error('❌ Erro ao registar caso:', error);
    res.status(500).json({
      success: false,
      error: 'Erro interno ao registar caso'
    });
  }
});

// GET - Estatísticas dos casos
app.get('/api/estatisticas', (req, res) => {
  try {
    if (!fs.existsSync(CSV_FILE)) {
      return res.json({
        success: true,
        estatisticas: {
          total: 0,
          por_risco: { Normal: 0, Moderado: 0, Elevado: 0 },
          por_prioridade: { Rotina: 0, Urgente: 0, 'Muito Urgente': 0 },
          ultimos_30_dias: 0
        }
      });
    }

  let csvData = fs.readFileSync(CSV_FILE, { encoding: 'utf8' });
    
  // Remover BOM se existir
  csvData = removerBOM(csvData);

  // Usar parser seguro para evitar falhas em CSVs irregulares
  const records = parseCsvSafe(csvData, { columns: true, skip_empty_lines: true, trim: true });

    // Reclassificar automaticamente casos de suicídio
    const recordsCorrigidos = records.map(caso => {
      const motivacao = caso.Motivacao_Provavel?.toLowerCase() || '';
      const observacoes = caso.Observacoes?.toLowerCase() || '';
      const estadoMental = caso.Estado_Mental?.toLowerCase() || '';
      
      // Detectar casos de suicídio
      const indicadoresSuicidio = [
        motivacao.includes('suicid'),
        motivacao.includes('suici'),
        observacoes.includes('suicid'),
        observacoes.includes('despedida'),
        observacoes.includes('mensagem'),
        observacoes.includes('carta'),
        estadoMental.includes('depress') && (motivacao.includes('suicid') || observacoes.includes('despedida'))
      ];
      
      const isCasoSuicidio = indicadoresSuicidio.some(indicador => indicador);
      
      // Se for caso de suicídio, forçar risco elevado
      if (isCasoSuicidio) {
        return { ...caso, Risco: 'Elevado', Prioridade_Busca: 'Muito Urgente' };
      }
      
      return caso;
    });

    const estatisticas = {
      total: recordsCorrigidos.length,
      por_risco: {
        Normal: recordsCorrigidos.filter(c => c.Risco === 'Normal').length,
        Moderado: recordsCorrigidos.filter(c => c.Risco === 'Moderado').length,
        Elevado: recordsCorrigidos.filter(c => c.Risco === 'Elevado').length
      },
      por_prioridade: {
        Rotina: recordsCorrigidos.filter(c => c.Prioridade_Busca === 'Rotina').length,
        Urgente: recordsCorrigidos.filter(c => c.Prioridade_Busca === 'Urgente').length,
        'Muito Urgente': recordsCorrigidos.filter(c => c.Prioridade_Busca === 'Muito Urgente').length
      },
      ultimos_30_dias: recordsCorrigidos.filter(c => {
        if (!c.Data_Registo) return false;
        const dataCaso = new Date(c.Data_Registo);
        const agora = new Date();
        const diferenca = (agora - dataCaso) / (1000 * 60 * 60 * 24);
        return diferenca <= 30;
      }).length
    };
    
    res.json({
      success: true,
      estatisticas: estatisticas
    });
  } catch (error) {
    console.error('Erro ao calcular estatísticas:', error);
    res.status(500).json({
      success: false,
      error: 'Erro ao calcular estatísticas'
    });
  }
});

// === FUNÇÕES AUXILIARES ===

// Função para calcular nível de risco
function calcularNivelRisco(dados) {
  let pontuacaoRisco = 0;
  
  // Indicadores de risco elevado (baseado no manual)
  if (dados.Idade && (parseInt(dados.Idade) < 18 || parseInt(dados.Idade) > 65)) {
    pontuacaoRisco += 2; // Menor ou idoso
  }
  
  if (dados.indicadores_risco && Array.isArray(dados.indicadores_risco)) {
    pontuacaoRisco += dados.indicadores_risco.length; // Cada indicador soma 1 ponto
  }
  
  if (dados.Estado_Mental && dados.Estado_Mental !== 'Normal') {
    pontuacaoRisco += 1;
  }
  
  if (dados.Capacidade_Locomocao && dados.Capacidade_Locomocao === 'Limitada') {
    pontuacaoRisco += 1;
  }
  
  if (dados.Capacidade_Locomocao && dados.Capacidade_Locomocao === 'Muito limitada') {
    pontuacaoRisco += 2;
  }
  
  if (dados.Medicamentos_Vitais && dados.Medicamentos_Vitais !== 'Nenhum' && dados.Transporta_Medicacao === 'Não') {
    pontuacaoRisco += 2;
  }
  
  if (dados.Tipo_Desaparecimento === 'Forçado') {
    pontuacaoRisco += 3;
  }
  
  // Determinar nível baseado na pontuação
  if (pontuacaoRisco >= 4) {
    return 'Elevado';
  } else if (pontuacaoRisco >= 2) {
    return 'Moderado';
  } else {
    return 'Normal';
  }
}

// Função para determinar prioridade da busca
function determinarPrioridade(nivelRisco, dados) {
  // Baseado no manual - secção 2.16-2.22
  if (nivelRisco === 'Elevado') {
    return 'Muito Urgente'; // 0 minutos - resposta imediata
  }
  
  if (dados.Tipo_Desaparecimento === 'Forçado') {
    return 'Muito Urgente';
  }
  
  if (dados.Idade && (parseInt(dados.Idade) < 18 || parseInt(dados.Idade) > 75)) {
    return 'Muito Urgente';
  }
  
  if (nivelRisco === 'Moderado') {
    return 'Urgente'; // até 120 minutos
  }
  
  return 'Rotina'; // resposta mediante disponibilidade
}

// === MIDDLEWARE DE ERRO ===
app.use((error, req, res, next) => {
  console.error('❌ Erro na aplicação:', error);
  res.status(500).json({
    success: false,
    error: 'Erro interno do servidor',
    message: error.message
  });
});

// === ROTA 404 ===
app.use('*', (req, res) => {
  res.status(404).json({
    success: false,
    error: 'Endpoint não encontrado',
    availableEndpoints: [
      'GET /',
      'GET /app',
      'GET /api/status',
      'GET /api/casos',
      'POST /api/casos',
      'GET /api/estatisticas',
      'GET /api/prompt',
      'GET /api/caso-atual',
      'POST /api/processar',
      'GET /api/testar-llm',
      'POST /api/previsao'
    ]
  });
});

// === INICIAR SERVIDOR ===
app.listen(PORT, HOST, () => {
  console.log(`\n🚔 === SISTEMA SARIA - PESSOAS DESAPARECIDAS ===`);
  console.log(`📱 Aplicação Web: http://${HOST}:${PORT}/app`);
  console.log(`🔧 API Endpoints: http://${HOST}:${PORT}/api`);
  console.log(`📊 Status: http://${HOST}:${PORT}/api/status`);
  console.log(`📋 Casos: http://${HOST}:${PORT}/api/casos`);
  console.log(`📄 CSV monitorado: ${CSV_FILE}`);
  console.log(`💚 Servidor ativo em ${HOST}:${PORT}\n`);
  
  // Verificar se os ficheiros essenciais existem
  const ficheirosEssenciais = [
    './promptBuilder.js',
    './pdfGenerator.js', 
    './emailSender.js',
    './llmService.js'
  ];
  
  ficheirosEssenciais.forEach(ficheiro => {
    if (fs.existsSync(path.join(__dirname, ficheiro))) {
      console.log(`✅ ${ficheiro} encontrado`);
    } else {
      console.log(`⚠️ ${ficheiro} não encontrado`);
    }
  });
  
  console.log(`\n🎯 Sistema pronto para receber registos!`);
});

module.exports = app;
