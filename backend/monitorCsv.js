const chokidar = require('chokidar');
const fs = require('fs');
const path = require('path');
const { buildPrompt } = require('./promptBuilder');
const { generatePdf } = require('./pdfGenerator');
const { sendEmail } = require('./emailSender');
const llmService = require('./llmService');
require('dotenv').config();

const CSV_FILE_OFFICIAL = path.join(__dirname, '../historico_casos_pdgnr_oficial.csv');
const CSV_FILE_LEGACY = path.join(__dirname, '../historico_casos.csv');

function chooseCsvFile() {
  try {
    if (fs.existsSync(CSV_FILE_OFFICIAL)) {
      const raw = fs.readFileSync(CSV_FILE_OFFICIAL, 'utf8');
      if (raw && raw.toString().trim().length > 5) {
        return CSV_FILE_OFFICIAL;
      }
    }
  } catch (e) {
    // silent fallback
  }
  if (fs.existsSync(CSV_FILE_LEGACY)) return CSV_FILE_LEGACY;
  return CSV_FILE_OFFICIAL;
}

const CSV_FILE = chooseCsvFile();

// Configurar emails de destino
const EMAIL_DESTINATARIOS = process.env.EMAIL_DESTINATARIOS 
  ? process.env.EMAIL_DESTINATARIOS.split(',')
  : ['destinatario.exemplo@example.com'];

console.log('🔍 A iniciar Sistema Inteligente SARIA...');
console.log('📁 Ficheiro CSV:', CSV_FILE);
console.log('📧 Destinatários:', EMAIL_DESTINATARIOS);

// Testar conexão com LLM
async function testarSistema() {
  console.log('\n🧪 A testar conexão com LLM...');
  const teste = await llmService.testarConexao();
  
  if (teste.success) {
    console.log(`✅ LLM conectada: ${teste.debug?.model || 'modelo configurado'}`);
  } else {
    console.log(`⚠️ LLM indisponível: ${teste.message || teste.error || 'erro desconhecido'}`);
    console.log('📋 Sistema funcionará com fallback');
  }
}


// Processar alteração no CSV
async function processarAlteracaoCSV() {
  try {
    console.log('\n🚨 NOVA OCORRÊNCIA DETECTADA!');
    console.log('⏰', new Date().toLocaleString('pt-PT'));
    
    // Verificar se o ficheiro existe
    if (!fs.existsSync(CSV_FILE)) {
      console.log('❌ Ficheiro CSV não encontrado');
      return;
    }

    // 1. Ler dados do CSV
    const csvData = fs.readFileSync(CSV_FILE, 'utf-8');
    console.log('✅ Dados do CSV processados');

    // 2. Construir prompt
    const prompt = buildPrompt(csvData);
    console.log('✅ Prompt estruturado');

    // 3. Obter previsão da LLM (GPT-o1 reasoning)
    console.log('🧠 Iniciando análise de reasoning com GPT-o1...');
    const analise = await llmService.gerarPredicao(prompt);
    if (!analise || !analise.success || !analise.response) {
      throw new Error(analise?.error || 'Análise LLM não retornou resposta válida');
    }
    const predicaoLLM = analise.response;
    console.log('✅ Análise de previsão concluída');

    // 4. Gerar PDF
    console.log('📄 A gerar relatório PDF...');
    const pdfBuffer = await generatePdf(csvData, prompt, predicaoLLM);
    console.log('✅ PDF gerado');

    // 5. Enviar email
    console.log('📧 Enviando para equipas operacionais...');
    await sendEmail(EMAIL_DESTINATARIOS, pdfBuffer);
    console.log('✅ Email enviado com sucesso!');

    console.log('\n🎯 PROCESSAMENTO COMPLETO - Sistema pronto para próxima ocorrência');

  } catch (error) {
    console.error('❌ Erro no processamento:', error);
    console.error('📞 Contacte o administrador do sistema');
  }
}

// Configurar monitorização do ficheiro
const watcher = chokidar.watch(CSV_FILE, {
  ignored: /^\./, 
  persistent: true,
  usePolling: true,
  interval: 2000
});

watcher
  .on('change', path => {
    console.log(`📝 Alteração detectada: ${path}`);
    processarAlteracaoCSV();
  })
  .on('add', path => {
    console.log(`➕ Ficheiro adicionado: ${path}`);
    processarAlteracaoCSV();
  })
  .on('error', error => {
    console.error('❌ Erro no monitor:', error);
  });

// Inicializar sistema
async function iniciarSistema() {
  await testarSistema();
  console.log('\n👀 SISTEMA ATIVO - Monitorizando as ocorrências...');
  console.log('🛑 Pressione Ctrl+C para parar\n');
}

iniciarSistema();

// Graceful shutdown
process.on('SIGINT', () => {
  console.log('\n🛑 A parar o sistema...');
  watcher.close();
  process.exit(0);
});
