const express = require('express');
const fs = require('fs');
const path = require('path');
const csv = require('csv-parser');
const createCsvWriter = require('csv-writer').createObjectCsvWriter;
const cors = require('cors');

const router = express.Router();

// Middleware CORS para aceitar requests do frontend
router.use(cors({
  origin: '*',
  methods: ['GET', 'POST', 'PUT', 'DELETE'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));

// Caminho para o ficheiro CSV
const csvFilePath = path.join(__dirname, '../historico_casos.csv');

// Headers do CSV baseados no formulário
const csvHeaders = [
  { id: 'id', title: 'ID' },
  { id: 'data_registo', title: 'Data_Registo' },
  { id: 'denunciante_nome', title: 'Denunciante_Nome' },
  { id: 'denunciante_relacao', title: 'Denunciante_Relacao' },
  { id: 'denunciante_contacto', title: 'Denunciante_Contacto' },
  { id: 'Nome', title: 'Nome' },
  { id: 'Idade', title: 'Idade' },
  { id: 'Sexo', title: 'Sexo' },
  { id: 'Data_Desaparecimento', title: 'Data_Desaparecimento' },
  { id: 'Hora_Desaparecimento', title: 'Hora_Desaparecimento' },
  { id: 'Local_Ultimo_Avistamento', title: 'Local_Ultimo_Avistamento' },
  { id: 'Tipo_Local', title: 'Tipo_Local' },
  { id: 'Concelho', title: 'Concelho' },
  { id: 'Freguesia', title: 'Freguesia' },
  { id: 'Tipo_Terreno', title: 'Tipo_Terreno' },
  { id: 'Condicoes_Meteorologicas', title: 'Condicoes_Meteorologicas' },
  { id: 'Altura_cm', title: 'Altura_cm' },
  { id: 'Peso_kg', title: 'Peso_kg' },
  { id: 'Cor_Cabelos', title: 'Cor_Cabelos' },
  { id: 'Cor_Olhos', title: 'Cor_Olhos' },
  { id: 'Sinais_Distintivos', title: 'Sinais_Distintivos' },
  { id: 'Vestuario', title: 'Vestuario' },
  { id: 'Estado_Mental', title: 'Estado_Mental' },
  { id: 'Condicao_Fisica', title: 'Condicao_Fisica' },
  { id: 'Capacidade_Locomocao', title: 'Capacidade_Locomocao' },
  { id: 'Doencas_Cronicas', title: 'Doencas_Cronicas' },
  { id: 'Medicamentos_Vitais', title: 'Medicamentos_Vitais' },
  { id: 'Transporta_Medicacao', title: 'Transporta_Medicacao' },
  { id: 'Levou_Telemovel', title: 'Levou_Telemovel' },
  { id: 'Levou_Documentos', title: 'Levou_Documentos' },
  { id: 'Levou_Dinheiro', title: 'Levou_Dinheiro' },
  { id: 'Tipo_Desaparecimento', title: 'Tipo_Desaparecimento' },
  { id: 'Risco', title: 'Risco' },
  { id: 'Prioridade_Busca', title: 'Prioridade_Busca' },
  { id: 'Motivacao_Provavel', title: 'Motivacao_Provavel' },
  { id: 'Contactos_Pessoa', title: 'Contactos_Pessoa' },
  { id: 'Observacoes', title: 'Observacoes' }
];

// GET - Listar todos os casos
router.get('/casos', (req, res) => {
  try {
    const casos = [];
    
    if (!fs.existsSync(csvFilePath)) {
      return res.json([]);
    }

    fs.createReadStream(csvFilePath)
      .pipe(csv())
      .on('data', (data) => casos.push(data))
      .on('end', () => {
        res.json({
          success: true,
          total: casos.length,
          casos: casos
        });
      })
      .on('error', (error) => {
        console.error('Erro ao ler CSV:', error);
        res.status(500).json({
          success: false,
          error: 'Erro ao carregar casos'
        });
      });
  } catch (error) {
    console.error('Erro geral:', error);
    res.status(500).json({
      success: false,
      error: 'Erro interno do servidor'
    });
  }
});

// Importar middleware authenticateToken se disponível (fallback permissivo)
let authenticateToken = null;
try {
  const authMod = require('./auth');
  authenticateToken = authMod.authenticateToken || null;
} catch (e) {
  // auth opcional — se não existir, as rotas continuarão a permitir requests
}

// POST - Registar novo caso
router.post('/casos', authenticateToken ? authenticateToken : (req, res, next) => next(), async (req, res) => {
  try {
    console.log('📝 Novo registo de caso recebido');
    
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

    // Gerar ID único
    const novoId = Date.now().toString();
    
    // Calcular nível de risco baseado nos indicadores
    const nivelRisco = calcularNivelRisco(dadosFormulario);
    
    // Determinar prioridade da busca
    const prioridadeBusca = determinarPrioridade(nivelRisco, dadosFormulario);

    // Preparar dados para o CSV
    const novoCaso = {
      id: novoId,
      data_registo: new Date().toISOString().split('T')[0],
      denunciante_nome: dadosFormulario.denunciante_nome || '',
      denunciante_relacao: dadosFormulario.denunciante_relacao || '',
      denunciante_contacto: dadosFormulario.denunciante_contacto || '',
      Nome: dadosFormulario.Nome,
      Idade: dadosFormulario.Idade,
      Sexo: dadosFormulario.Sexo,
      Data_Desaparecimento: dadosFormulario.Data_Desaparecimento,
      Hora_Desaparecimento: dadosFormulario.Hora_Desaparecimento,
      Local_Ultimo_Avistamento: dadosFormulario.Local_Ultimo_Avistamento,
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
      Observacoes: dadosFormulario.Observacoes || ''
    };

    // Verificar se o ficheiro CSV já existe
    const ficheiroCsvExiste = fs.existsSync(csvFilePath);
    
    // Criar CSV writer
    const csvWriter = createCsvWriter({
      path: csvFilePath,
      header: csvHeaders,
      append: ficheiroCsvExiste // Se existe, append; se não, criar novo
    });

    // Se não existe, criar cabeçalhos primeiro
    if (!ficheiroCsvExiste) {
      console.log('📁 Criando novo ficheiro CSV...');
    }

    // Escrever dados no CSV
    await csvWriter.writeRecords([novoCaso]);
    
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
        data_registo: novoCaso.data_registo
      }
    });

    // Notificar sistema de monitorização (se estiver a correr)
    console.log('🔔 Sistema de análise preditiva será ativado automaticamente');

  } catch (error) {
    console.error('❌ Erro ao registar caso:', error);
    res.status(500).json({
      success: false,
      error: 'Erro interno ao registar caso'
    });
  }
});

// Função para calcular nível de risco
function calcularNivelRisco(dados) {
  let pontuacaoRisco = 0;
  
  // Indicadores de risco elevado (baseado no manual GNR)
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

// GET - Estatísticas dos casos
router.get('/estatisticas', (req, res) => {
  try {
    const casos = [];
    
    if (!fs.existsSync(csvFilePath)) {
      return res.json({
        total: 0,
        por_risco: { Normal: 0, Moderado: 0, Elevado: 0 },
        por_prioridade: { Rotina: 0, Urgente: 0, 'Muito Urgente': 0 }
      });
    }

    fs.createReadStream(csvFilePath)
      .pipe(csv())
      .on('data', (data) => casos.push(data))
      .on('end', () => {
        const estatisticas = {
          total: casos.length,
          por_risco: {
            Normal: casos.filter(c => c.Risco === 'Normal').length,
            Moderado: casos.filter(c => c.Risco === 'Moderado').length,
            Elevado: casos.filter(c => c.Risco === 'Elevado').length
          },
          por_prioridade: {
            Rotina: casos.filter(c => c.Prioridade_Busca === 'Rotina').length,
            Urgente: casos.filter(c => c.Prioridade_Busca === 'Urgente').length,
            'Muito Urgente': casos.filter(c => c.Prioridade_Busca === 'Muito Urgente').length
          },
          ultimos_30_dias: casos.filter(c => {
            const dataCaso = new Date(c.data_registo);
            const agora = new Date();
            const diferenca = (agora - dataCaso) / (1000 * 60 * 60 * 24);
            return diferenca <= 30;
          }).length
        };
        
        res.json({
          success: true,
          estatisticas: estatisticas
        });
      });
  } catch (error) {
    console.error('Erro ao calcular estatísticas:', error);
    res.status(500).json({
      success: false,
      error: 'Erro ao calcular estatísticas'
    });
  }
});

module.exports = router;
