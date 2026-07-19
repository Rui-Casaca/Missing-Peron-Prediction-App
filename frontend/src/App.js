import React, { useState, useEffect, useRef, useCallback } from 'react';
import ModalRoot, { showModal } from './modalHelper';
import { Packer, Document, Paragraph, HeadingLevel, TextRun, Table, TableRow, TableCell, WidthType } from 'docx';
import './App.css';
import Dashboard from './Dashboard';
import CaseRegistrationOfficial from './CaseRegistrationOfficial';
import CaseDetail from './CaseDetail';
import QuickCaseRegistration from './QuickCaseRegistration';
import Login from './Login';
import UserManagement from './UserManagement';
import apiFetch from './api';
import { flushOutbox, getPendingCount } from './offlineStore';

function App() {
  const [activeTab, setActiveTab] = useState('dashboard');
  const [stats, setStats] = useState({
    total: '-',
    ultimos30: '-',
    riscoNormal: '-',
    riscoModerado: '-',
    riscoElevado: '-'
  });
  const [systemStatus, setSystemStatus] = useState({
    llm: 'A verificar...',
    email: 'Configurado',
    csv: 'Ativo'
  });
  const [ultimoCaso, setUltimoCaso] = useState('A carregar...');
  const [casos, setCasos] = useState([]);
  const [analysisResult, setAnalysisResult] = useState('');
  const [fullAnalysis, setFullAnalysis] = useState('');
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [modalLoading, setModalLoading] = useState(false);
  const [modalCaseId, setModalCaseId] = useState(null);
  const [modalCaseName, setModalCaseName] = useState('');
  const [detailCaseId, setDetailCaseId] = useState(null);
  const [online, setOnline] = useState(typeof navigator === 'undefined' ? true : navigator.onLine);
  const [pendingSyncCount, setPendingSyncCount] = useState(getPendingCount());
  const [syncing, setSyncing] = useState(false);

  // Carregar dados iniciais
  useEffect(() => {
    // Verificar autenticação local
    const checkAuth = async () => {
      const token = localStorage.getItem('auth_token');
      if (!token) return;
      try {
        const res = await apiFetch('/api/auth/me');
        const data = await res.json();
        if (data && data.success && data.user) {
          // user authenticated - guardar no estado para mostrar role/admin
          setCurrentUser(data.user);
          setIsAuthenticated(true);
        } else {
          localStorage.removeItem('auth_token');
          setCurrentUser(null);
          setIsAuthenticated(false);
        }
      } catch (e) {
        localStorage.removeItem('auth_token');
        setCurrentUser(null);
        setIsAuthenticated(false);
      }
    };
    checkAuth();
    const carregarDados = async () => {
      // Carregar estatísticas do sistema oficial 
  try {
        const response = await apiFetch('/api/estatisticas-oficial');
        const data = await response.json();
        
        console.log('Dados recebidos da API oficial:', data); // Debug
        
        if (data.success && data.estatisticas) {
          const est = data.estatisticas;
          setStats({
            total: est.total || 0,
            ultimos30: est.ultimos_30_dias || 0,
            riscoNormal: est.por_risco?.Normal || 0,
            riscoModerado: est.por_risco?.Moderado || 0,
            riscoElevado: est.por_risco?.Elevado || 0
          });
        }
      } catch (error) {
        console.error('Erro ao carregar estatísticas oficiais:', error);
        setStats({
          total: 'Erro',
          ultimos30: 'Erro',
          riscoNormal: 'Erro',
          riscoModerado: 'Erro',
          riscoElevado: 'Erro'
        });
      }

      // Testar conexões
      try {
        const response = await fetch('/api/status');
        const data = await response.json();
        
        setSystemStatus(prev => ({
          ...prev,
          llm: data.llm ? 'Conectado' : 'Erro',
        }));
      } catch (error) {
        console.error('Erro ao testar conexões:', error);
        setSystemStatus(prev => ({
          ...prev,
          llm: 'Erro'
        }));
      }

      // Carregar casos oficiais e último caso
      try {
        const response = await apiFetch('/api/casos-oficial');
        const data = await response.json();
        
        if (data.success && data.casos) {
          setCasos(data.casos);
          
          if (data.casos.length > 0) {
            const ultimoCasoData = data.casos[data.casos.length - 1];
            setUltimoCaso(`${ultimoCasoData.Nome_Completo || 'N/D'} - ${ultimoCasoData.Data_Registo || 'N/D'} (${ultimoCasoData.Risco_Calculado || 'N/D'})`);
          } else {
            setUltimoCaso('Nenhum caso registado');
          }
        }
      } catch (error) {
        console.error('Erro ao carregar casos oficiais:', error);
        setUltimoCaso('Erro ao carregar');
      }
    };
    
    carregarDados();
  }, []);

  const [isAuthenticated, setIsAuthenticated] = useState(!!localStorage.getItem('auth_token'));
  const [currentUser, setCurrentUser] = useState(null);
  const inactivityTimerRef = useRef(null);
  const resetInactivityTimerRef = useRef(() => {});
  const INACTIVITY_TIMEOUT_MS = 1000 * 60 * 30; // 30 minutos

  useEffect(() => {
    const refreshOutbox = () => setPendingSyncCount(getPendingCount());
    const handleOnline = async () => {
      setOnline(true);
      refreshOutbox();
    };
    const handleOffline = () => setOnline(false);
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    window.addEventListener('sar-outbox-changed', refreshOutbox);
    refreshOutbox();
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
      window.removeEventListener('sar-outbox-changed', refreshOutbox);
    };
  }, []);

  const handleFlushOutbox = async () => {
    if (syncing || getPendingCount() === 0) return;
    setSyncing(true);
    try {
      await flushOutbox();
      setPendingSyncCount(getPendingCount());
      await carregarCasos();
      await carregarEstatisticas();
    } catch (error) {
      console.warn('Sincronização offline falhou:', error);
      setPendingSyncCount(getPendingCount());
    } finally {
      setSyncing(false);
    }
  };

  const handleLoginSuccess = (user, token) => {
    setIsAuthenticated(true);
    setCurrentUser(user || null);
    // token already saved by Login component
  };

  // Logout helper
  const doLogout = useCallback(() => {
    try {
      localStorage.removeItem('auth_token');
      localStorage.removeItem('auth_last_activity');
      if (inactivityTimerRef.current) clearTimeout(inactivityTimerRef.current);
    } catch (e) {}

    setCurrentUser(null);
    setDetailCaseId(null);
    setModalOpen(false);
    setModalLoading(false);
    setModalCaseId(null);
    setModalCaseName('');
    setAnalysisResult('');
    setFullAnalysis('');
    setActiveTab('dashboard');
    setIsAuthenticated(false);

    try { window.history.replaceState(null, '', '/app/'); } catch (e) {}
  }, []);

  useEffect(() => {
    const handleInvalidToken = () => doLogout();
    window.addEventListener('auth-token-invalid', handleInvalidToken);
    return () => window.removeEventListener('auth-token-invalid', handleInvalidToken);
  }, [doLogout]);

  // Inactivity handling: reset timer em atividades de utilizador
  const resetInactivityTimer = () => {
    if (inactivityTimerRef.current) {
      clearTimeout(inactivityTimerRef.current);
    }
    // registar última atividade para acompanhamento
    try { localStorage.setItem('auth_last_activity', Date.now().toString()); } catch (e) {}

    inactivityTimerRef.current = setTimeout(() => {
      // automatic logout after inactivity
      doLogout();
      // opcional: mostrar notificação
      try { alert('Sessão terminada por inatividade (30 minutos).'); } catch (e) {}
    }, INACTIVITY_TIMEOUT_MS);
  };
  // manter uma referência estável para evitar warnings do hook
  resetInactivityTimerRef.current = resetInactivityTimer;

  useEffect(() => {
    // ligar listeners apenas quando autenticado
    if (!isAuthenticated) return;
    const events = ['mousemove', 'keydown', 'click', 'touchstart'];
    const handler = () => resetInactivityTimerRef.current();
    events.forEach(ev => window.addEventListener(ev, handler));
    // iniciar timer
    resetInactivityTimerRef.current();
    return () => {
      events.forEach(ev => window.removeEventListener(ev, handler));
      if (inactivityTimerRef.current) clearTimeout(inactivityTimerRef.current);
    };
  }, [isAuthenticated]);

  const carregarEstatisticas = async () => {
    try {
      const response = await apiFetch('/api/estatisticas-oficial');
      const data = await response.json();
      
      console.log('Dados recebidos da API oficial:', data); // Debug
      
      if (data.success && data.estatisticas) {
        const est = data.estatisticas;
        setStats({
          total: est.total || 0,
          ultimos30: est.ultimos_30_dias || 0,
          riscoNormal: est.por_risco?.Normal || 0,
          riscoModerado: est.por_risco?.Moderado || 0,
          riscoElevado: est.por_risco?.Elevado || 0
        });
      }
    } catch (error) {
      console.error('Erro ao carregar estatísticas oficiais:', error);
      setStats({
        total: 'Erro',
        ultimos30: 'Erro',
        riscoNormal: 'Erro',
        riscoModerado: 'Erro',
        riscoElevado: 'Erro'
      });
    }
  };

  const carregarCasos = async () => {
    try {
      const response = await apiFetch('/api/casos-oficial');
      const data = await response.json();
      
      if (data.success && data.casos) {
        setCasos(data.casos);
        
        // Atualizar último caso
        if (data.casos.length > 0) {
          const ultimoCasoData = data.casos[data.casos.length - 1];
          setUltimoCaso(`${ultimoCasoData.Nome_Completo || 'N/D'} - ${ultimoCasoData.Data_Registo || 'N/D'} (${ultimoCasoData.Risco_Calculado || 'N/D'})`);
        } else {
          setUltimoCaso('Nenhum caso registado');
        }
      }
    } catch (error) {
      console.error('Erro ao carregar casos oficiais:', error);
      setUltimoCaso('Erro ao carregar');
    }
  };

  const testarConexoes = async () => {
    try {
      const response = await fetch('/api/status');
      const data = await response.json();
      
      setSystemStatus(prev => ({
        ...prev,
        llm: data.llm ? 'Conectado' : 'Erro',
      }));
    } catch (error) {
      console.error('Erro ao testar conexões:', error);
      setSystemStatus(prev => ({
        ...prev,
        llm: 'Erro'
      }));
    }
  };

  const testarLLM = async () => {
    setIsAnalyzing(true);
    setAnalysisResult('Testando conexão com LLM...');
    
    try {
      const response = await apiFetch('/api/testar-llm');
      const data = await response.json();
      
      if (data.sucesso) {
        setAnalysisResult(`✅ LLM Conectado!\nModelo: ${data.modelo}\nResposta: ${data.resposta || 'Teste bem-sucedido'}`);
        
        // Atualizar status no dashboard
        setSystemStatus(prev => ({
          ...prev,
          llm: 'Conectado'
        }));
      } else {
        setAnalysisResult(`❌ Erro no LLM:\n${data.erro || 'Erro desconhecido'}`);
        setSystemStatus(prev => ({
          ...prev,
          llm: 'Erro'
        }));
      }
    } catch (error) {
      setAnalysisResult('❌ Erro ao testar LLM: ' + error.message);
      setSystemStatus(prev => ({
        ...prev,
        llm: 'Erro de Conexão'
      }));
    } finally {
      setIsAnalyzing(false);
    }
  };

  const gerarAnaliseUltimoCaso = async () => {
    setIsAnalyzing(true);
    setAnalysisResult('A analisar último caso com GPT-o1...');
    
    try {
      const response = await apiFetch('/api/gerar-analise-ultimo');
      const data = await response.json();
      
      if (data.success) {
        // Garantir que apenas o texto da análise é renderizado
        let analysisText = typeof data.analise === 'string' 
          ? data.analise 
          : (data.analise?.response || JSON.stringify(data.analise, null, 2));
        
        // Limpar formatação markdown para melhor visualização
        analysisText = limparFormatacaoMarkdown(analysisText);
        
  // Guardar análise completa mas apresentar apenas sumário acionável
  setFullAnalysis(analysisText);
  const resumo = extrairPrioridadesEAcaoImediata(analysisText);
  setAnalysisResult(resumo);
        
        // Log dos metadados se existirem
        if (data.metadata) {
          console.log('📊 Metadados da análise:', data.metadata);
          console.log('📄 PDF será gerado automaticamente e guardado nos Documentos');
          console.log('📧 Email será enviado automaticamente para os destinatários configurados');
        }
      } else {
        setAnalysisResult('❌ Erro: ' + (data.error || 'Erro desconhecido na análise'));
      }
    } catch (error) {
      setAnalysisResult('❌ Erro ao gerar análise: ' + error.message);
    } finally {
      setIsAnalyzing(false);
    }
  };

  // Heurística para extrair prioridades e ação imediata do texto completo
  const extrairPrioridadesEAcaoImediata = (textoCompleto) => {
    if (!textoCompleto) return '';

    const texto = limparFormatacaoMarkdown(textoCompleto);

    // Procurar linhas que contenham palavras-chave de prioridade
    const linhas = texto.split(/\r?\n/).map(l => l.trim()).filter(Boolean);

    const prioridades = linhas.filter(l => /prioridade|muito urgente|urgente|rotina|nível de risco/i.test(l));

    // Procurar secções indicadas por títulos comuns
    const conclusoes = [];
    const conclusaoKeywords = [/conclus[oõ]es?/i, /recomenda[cç][oões]?/i, /o que fazer/i, /a fazer/i, /aço(?:es)? imediatas?/i];

    for (let i = 0; i < linhas.length; i++) {
      const l = linhas[i];
      if (conclusaoKeywords.some(rx => rx.test(l))) {
        // coletar as próximas 4 linhas não-vazias como resumo
        for (let j = 1; j <= 4 && i + j < linhas.length; j++) {
          if (linhas[i + j]) conclusoes.push(linhas[i + j]);
        }
        break;
      }
    }

    // Se não encontrou uma secção clara, pegar frases imperativas iniciais
    if (conclusoes.length === 0) {
  const frases = texto.split(/[.\n]/).map(s => s.trim()).filter(Boolean);
      // pegar as primeiras 3 frases com verbo no imperativo heurístico (começam por verbo em maiúscula?)
      conclusoes.push(...frases.slice(0, 3));
    }

    const partes = [];
    if (prioridades.length) {
      partes.push('Prioridades:');
      partes.push(...prioridades.slice(0, 5));
    }
    if (conclusoes.length) {
      partes.push('O que fazer imediatamente:');
      partes.push(...conclusoes.slice(0, 5));
    }

    return partes.join('\n');
  };

  // Função para limpar formatação markdown
  const limparFormatacaoMarkdown = (texto) => {
    if (!texto) return '';
    
    return texto
      // Remover headers markdown (### ## #)
      .replace(/^#{1,6}\s+/gm, '')
      // Remover **bold** e __bold__
      .replace(/\*\*(.*?)\*\*/g, '$1')
      .replace(/__(.*?)__/g, '$1')
      // Remover *italic* e _italic_
      .replace(/\*(.*?)\*/g, '$1')
      .replace(/_(.*?)_/g, '$1')
      // Remover links markdown [texto](url)
      .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
      // Remover código inline `code`
      .replace(/`([^`]+)`/g, '$1')
      // Remover blocos de código ```
      .replace(/```[\s\S]*?```/g, '')
      // Remover linhas separadoras ---
      .replace(/^---+$/gm, '')
      // Remover > blockquotes
      .replace(/^>\s*/gm, '')
      // Limpar múltiplas linhas vazias
      .replace(/\n\n\n+/g, '\n\n')
      .trim();
  };

  // Extrai a parte de ação sem notas e as notas rápidas de um bloco de 'O que fazer imediatamente'
  const parseAcaoENotas = (acaoText) => {
    let notasRapidasLocal = [];
    let acaoTextSemNotasLocal = acaoText || '';
    if (acaoText) {
      const linhasAcao = acaoText.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
      const resto = [];
      let inNotas = false;
      for (const l of linhasAcao) {
        if (/^Notas rápidas:?/i.test(l)) {
          inNotas = true;
          const after = l.replace(/^Notas rápidas:?\s*/i, '').trim();
          if (after) notasRapidasLocal.push(after.replace(/\s+N\/D\s*$/i, '').trim());
          continue;
        }
        if (inNotas) {
          if (/^[-•]\s+/.test(l) || /^[A-Z].{10,}/.test(l)) {
            notasRapidasLocal.push(l.replace(/^[-•]\s+/, '').replace(/\s+N\/D\s*$/i, '').trim());
            continue;
          } else {
            inNotas = false;
          }
        }
        resto.push(l);
      }
      acaoTextSemNotasLocal = resto.join('\n');
    }
    return { acaoTextSemNotasLocal, notasRapidasLocal };
  };

  // (escapeHtml removido: usamos geração .docx via biblioteca 'docx')

  // Gerar um .docx real usando a biblioteca 'docx'
  const gerarDocx = async ({ title = 'Análise', content = '' } = {}) => {
    try {
      const texto = content || '';
      const prioridadesMatch = texto.match(/Prioridades:\s*([\s\S]*?)(?:\n\s*O que fazer imediatamente:|$)/i);
      const acaoMatch = texto.match(/O que fazer imediatamente:\s*([\s\S]*)/i);

      const prioridadesText = prioridadesMatch ? prioridadesMatch[1].trim() : '';
      const acaoText = acaoMatch ? acaoMatch[1].trim() : '';

      const { acaoTextSemNotasLocal, notasRapidasLocal } = parseAcaoENotas(acaoText);

      const sectionChildren = [];
      sectionChildren.push(new Paragraph({ text: title, heading: HeadingLevel.TITLE }));

      if (prioridadesText) {
        sectionChildren.push(new Paragraph({ text: 'Prioridades', heading: HeadingLevel.HEADING_2 }));
        const lines = prioridadesText.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
        lines.forEach(l => sectionChildren.push(new Paragraph({ children: [ new TextRun({ text: '• ' + l, size: 24 }) ] })));
      }

      if (acaoText) {
        sectionChildren.push(new Paragraph({ text: 'O que fazer imediatamente', heading: HeadingLevel.HEADING_2 }));

        if (/\|/.test(acaoTextSemNotasLocal)) {
          const lines = acaoTextSemNotasLocal.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
          if (lines.length > 0) {
            let headerLineIndex = lines.findIndex(l => /\|/.test(l));
            if (headerLineIndex === -1) headerLineIndex = 0;
            const headerLine = lines[headerLineIndex] || '';
            let dataStart = headerLineIndex + 1;
            if (dataStart < lines.length && /^\|?\s*[-:]+\s*(\|\s*[-:]+\s*)+$/i.test(lines[dataStart])) dataStart++;

            const rawHeaders = headerLine.split('|').map(h => h.trim());
            if (rawHeaders.length > 0 && rawHeaders[0] === '') rawHeaders.shift();
            if (rawHeaders.length > 0 && rawHeaders[rawHeaders.length - 1] === '') rawHeaders.pop();
            const headers = rawHeaders.map(h => h || 'N/D');

            const tableRows = [];
            tableRows.push(new TableRow({ children: headers.map(h => new TableCell({ children: [ new Paragraph({ children: [ new TextRun({ text: h, bold: true }) ] }) ] })) }));

            for (let i = dataStart; i < lines.length; i++) {
              let rowLine = lines[i];
              let cells = rowLine.split('|').map(c => c.trim());
              if (cells.length > 0 && cells[0] === '') cells.shift();
              if (cells.length > 0 && cells[cells.length - 1] === '') cells.pop();
              while (cells.length < headers.length) cells.push('');
              if (cells.length > headers.length) {
                const fixed = cells.slice(0, headers.length - 1);
                const last = cells.slice(headers.length - 1).join(' | ');
                cells = fixed.concat([last]);
              }
              const aligned = headers.map((_, idx) => (cells[idx] !== undefined && cells[idx] !== '' ? cells[idx] : 'N/D'));
              tableRows.push(new TableRow({ children: aligned.map(cellText => new TableCell({ children: [ new Paragraph({ children: [ new TextRun({ text: cellText }) ] }) ] })) }));
            }

            sectionChildren.push(new Table({ rows: tableRows, width: { size: 100, type: WidthType.PERCENTAGE } }));
          }
        } else {
          const lines = acaoTextSemNotasLocal.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
          lines.forEach(l => sectionChildren.push(new Paragraph({ children: [ new TextRun({ text: l, size: 22 }) ] })));
        }

        if (notasRapidasLocal && notasRapidasLocal.length > 0) {
          sectionChildren.push(new Paragraph({ text: 'Notas rápidas', heading: HeadingLevel.HEADING_3 }));
          notasRapidasLocal.forEach(n => sectionChildren.push(new Paragraph({ children: [ new TextRun({ text: '• ' + n }) ] })));
        }
      }

      if (sectionChildren.length === 1) sectionChildren.push(new Paragraph({ text: content }));

      const doc = new Document({ sections: [{ properties: {}, children: sectionChildren }] });

      let generated;
      try { generated = await Packer.toBlob(doc); } catch (errBlob) {
        try { generated = await Packer.toBuffer(doc); } catch (errBuffer) { throw new Error('Packer API não disponível no runtime'); }
      }

      let blob;
      if (typeof Blob !== 'undefined' && generated instanceof Blob) blob = generated;
      else if (generated instanceof ArrayBuffer) blob = new Blob([generated], { type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' });
      else if (ArrayBuffer.isView(generated)) blob = new Blob([generated.buffer || generated], { type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' });
      else if (generated && generated.buffer) { const uint8 = new Uint8Array(generated); blob = new Blob([uint8.buffer], { type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' }); }
      else blob = new Blob([generated], { type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' });

      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      const safeTitle = (title || 'analise').replace(/[^a-z0-9_\-.]/ig, '_');
      a.download = `${safeTitle}_${modalCaseId || 'caso'}.docx`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);
    } catch (err) {
      console.error('Erro gerarDocx:', err);
      await showModal('Erro', 'Erro ao gerar .docx: ' + (err.message || err), { confirmText: 'OK' });
    }
  };

  // Renderiza a análise com formatação profissional: títulos, listas e tabelas
  const renderAnalysisDisplay = (texto) => {
    if (!texto) return <div>Sem resultado</div>;
    // Limpar duplicações e espaços extra
    let t = texto.replace(/\r/g, '').trim();
    // Remover duplicados consecutivos de títulos como "Prioridades:\nPrioridades:" -> "Prioridades:"
    t = t.replace(/(Prioridades:\s*){2,}/gi, 'Prioridades:\n');
    t = t.replace(/(O que fazer imediatamente:\s*){2,}/gi, 'O que fazer imediatamente:\n');

    // Separar em secções Principais: Prioridades e O que fazer imediatamente
    const prioridadesMatch = t.match(/Prioridades:\s*([\s\S]*?)(?:\n\s*O que fazer imediatamente:|$)/i);
    const acaoMatch = t.match(/O que fazer imediatamente:\s*([\s\S]*)/i);

    const prioridadesText = prioridadesMatch ? prioridadesMatch[1].trim() : '';
    const acaoText = acaoMatch ? acaoMatch[1].trim() : '';
  // Extrair ação sem notas e notas rápidas para uso no JSX
  const { acaoTextSemNotasLocal, notasRapidasLocal } = parseAcaoENotas(acaoText);

    // Helper: converter um bloco de texto com linhas numeradas em <ol>
    const renderPrioridades = (txt) => {
      if (!txt) return null;
      const lines = txt.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
      return (
        <ol>
          {lines.map((l, i) => <li key={i} style={{ marginBottom: 6 }}>{l.replace(/^\d+\.\s*/,'')}</li>)}
        </ol>
      );
    };

    // Converter uma tabela Markdown (com pipes) em HTML
    const renderMarkdownTable = (block) => {
      if (!/\|/.test(block)) return null;
      const lines = block.split(/\n/).map(l => l.trim()).filter(Boolean);
      if (lines.length === 0) return null;

      // Cabeçalho (primeira linha). Não removemos automaticamente células vazias:
      // em vez disso normalizamos removendo pipes vazios nas extremidades para
      // manter alinhamento entre header e rows.
      const headerLine = lines[0] || '';
      const rawHeaders = headerLine.split('|').map(h => h.trim());
      // remover células vazias criadas por pipes nas extremidades
      if (rawHeaders.length > 0 && rawHeaders[0] === '') rawHeaders.shift();
      if (rawHeaders.length > 0 && rawHeaders[rawHeaders.length - 1] === '') rawHeaders.pop();
      const headers = rawHeaders.map(h => h || 'N/D');

      let dataLines = lines.slice(1);
      // remover linha separadora tipo |---|---|
      if (dataLines.length > 0 && /^\|?\s*[-\s|:]+$/.test(dataLines[0])) {
        dataLines = dataLines.slice(1);
      }

      return (
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr>
              {headers.map((h, i) => (
                <th key={i} style={{ textAlign: 'left', borderBottom: '1px solid #ddd', padding: '6px 8px', background:'#fafafa' }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {dataLines.map((dl, ri) => {
              let cells = dl.split('|').map(c => c.trim());
              // remover células vazias nas extremidades geradas por leading/trailing pipes
              if (cells.length > 0 && cells[0] === '') cells.shift();
              if (cells.length > 0 && cells[cells.length - 1] === '') cells.pop();

              // Se houver menos células que headers, pad com vazios
              while (cells.length < headers.length) cells.push('');

              // Se houver mais células que headers, juntar as extras na última coluna
              if (cells.length > headers.length) {
                const fixed = cells.slice(0, headers.length - 1);
                const last = cells.slice(headers.length - 1).join(' | ');
                cells = fixed.concat([last]);
              }

              const cleaned = cells.map(c => (c === '' ? 'N/D' : c));
              return (
                <tr key={ri}>
                  {cleaned.slice(0, headers.length).map((cell, ci) => (
                    <td key={ci} style={{ padding: '8px', borderBottom: '1px solid #f0f0f0' }}>{cell}</td>
                  ))}
                </tr>
              );
            })}
          </tbody>
        </table>
      );
    };

    return (
      <div>
        {prioridadesText ? (
          <div style={{ marginBottom: 12 }}>
            <h4 style={{ margin: '8px 0' }}>Prioridades</h4>
            {renderPrioridades(prioridadesText) || <pre style={{ whiteSpace: 'pre-wrap' }}>{prioridadesText}</pre>}
          </div>
        ) : null}

        {acaoText ? (
          <div>
            <h4 style={{ margin: '8px 0' }}>O que fazer imediatamente</h4>
            {/* Tentar renderizar como tabela Markdown; se não, mostrar texto formatado */}
            {renderMarkdownTable(acaoTextSemNotasLocal) || <pre style={{ whiteSpace: 'pre-wrap' }}>{acaoTextSemNotasLocal}</pre>}
            {/* Renderizar Notas rápidas fora da tabela */}
            {notasRapidasLocal && notasRapidasLocal.length > 0 && (
              <div style={{ marginTop: 12, background: '#fffef6', padding: 10, borderRadius: 6 }}>
                <h5>Notas rápidas</h5>
                {notasRapidasLocal.map((n, i) => <p key={i} style={{ margin: '6px 0' }}>{n}</p>)}
              </div>
            )}
          </div>
        ) : null}

        {/* Se não encontrou secções específicas, renderizar o texto inteiro de forma limpa */}
        {!prioridadesText && !acaoText && (
          <div style={{ whiteSpace: 'pre-wrap' }}>{t}</div>
        )}
      </div>
    );
  };

  const isAdminUser = Boolean(currentUser && (currentUser.role === 'admin' || currentUser.role === 'superadmin'));

  const canAccessTab = useCallback((tabName) => {
    if (!isAuthenticated) return false;
    if (tabName === 'user-management') return isAdminUser;
    if (tabName === 'previsao') return isAdminUser;
    if (tabName === 'caso-detalhe') return Boolean(detailCaseId);
    return ['dashboard', 'novo-caso', 'registo-rapido', 'casos'].includes(tabName);
  }, [detailCaseId, isAdminUser, isAuthenticated]);

  const showTab = (tabName) => {
    if (!canAccessTab(tabName)) {
      setActiveTab('dashboard');
      return;
    }
    setActiveTab(tabName);
  };

  useEffect(() => {
    if (isAuthenticated && !canAccessTab(activeTab)) setActiveTab('dashboard');
  }, [activeTab, canAccessTab, isAuthenticated]);


  // Handler para submissão de novo caso e navegação automática
  const onCaseSubmitted = async () => {
    // Recarregar dados após novo caso
    try {
      await carregarEstatisticas();
      await carregarCasos();
      await testarConexoes();
      setActiveTab('dashboard');
    } catch (error) {
      console.error('Erro ao recarregar dados:', error);
    }
  };

  const onQuickCaseSubmitted = async (caso) => {
    try {
      await carregarEstatisticas();
      await carregarCasos();
      setDetailCaseId(caso?.id || caso?.legacy_csv_id || caso?.official_case_number || null);
      setActiveTab(caso?.id ? 'caso-detalhe' : 'casos');
    } catch (error) {
      console.error('Erro ao recarregar dados após registo rápido:', error);
      setActiveTab('casos');
    }
  };

  // Listener para navegação automática após registo
  useEffect(() => {
    const goToDashboard = () => setActiveTab('dashboard');
    window.addEventListener('goToDashboard', goToDashboard);
    return () => window.removeEventListener('goToDashboard', goToDashboard);
  }, []);

  if (!isAuthenticated) {
    return (
      <div className="container">
        <Login onLoginSuccess={handleLoginSuccess} />
      </div>
    );
  }

  return (
    <div className="container">
      <header className="header">
        <div className="header-left">
          <img src="/logo.png" alt="SARIA Logo" className="logo-img" onError={(e)=>{e.currentTarget.style.display='none'}} />
          <div className="logo">
            <h1>SARIA</h1>
            <p>Sistema de Análise e Previsão - Pessoas Desaparecidas</p>
          </div>
        </div>
        <div className="header-right" style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div className="sync-status" title="Estado de ligação e sincronização offline">
            <span className={online ? 'sync-dot online' : 'sync-dot offline'} />
            <span>{online ? 'Online' : 'Offline'}</span>
            {pendingSyncCount > 0 ? <button className="btn-outline" onClick={handleFlushOutbox} disabled={!online || syncing}>{syncing ? 'A sincronizar...' : `${pendingSyncCount} pendente(s)`}</button> : null}
          </div>
          {currentUser ? <div style={{ fontSize: 14 }}>Olá, {currentUser.displayName || currentUser.username}</div> : null}
          <button className="btn-secondary" onClick={() => doLogout()}>Logout</button>
        </div>
        {/* status oculto conforme pedido */}
      </header>

      <nav className="nav-tabs">
        <button 
          className={`tab-button ${activeTab === 'dashboard' ? 'active' : ''}`}
          onClick={() => showTab('dashboard')}
        >
          Dashboard
        </button>
        <button 
          className={`tab-button ${activeTab === 'novo-caso' ? 'active' : ''}`}
          onClick={() => showTab('novo-caso')}
        >
          Novo Caso
        </button>
        <button
          className={`tab-button ${activeTab === 'registo-rapido' ? 'active' : ''}`}
          onClick={() => showTab('registo-rapido')}
        >
          Registo Rápido SAR
        </button>
        <button 
          className={`tab-button ${activeTab === 'casos' ? 'active' : ''}`}
          onClick={() => showTab('casos')}
        >
          Casos
        </button>
        {isAdminUser && (
          <button
            className={`tab-button ${activeTab === 'user-management' ? 'active' : ''}`}
            onClick={() => showTab('user-management')}
          >
            Gestão Utilizadores
          </button>
        )}
        {/* 'Análise e Previsão' oculto no UI */}
      </nav>

      {/* TAB 1: DASHBOARD */}
      {activeTab === 'dashboard' && (
        <div className="tab-content">
          <Dashboard 
            stats={stats}
            systemStatus={systemStatus}
            ultimoCaso={ultimoCaso}
            casos={casos}
            onRefresh={async () => {
              await carregarEstatisticas();
              await carregarCasos();
              await testarConexoes();
            }}
          />
        </div>
      )}

      {/* TAB 2: NOVO CASO */}
      {activeTab === 'novo-caso' && (
        <div className="tab-content">
          <CaseRegistrationOfficial onCaseSubmitted={onCaseSubmitted} />
        </div>
      )}

      {activeTab === 'registo-rapido' && (
        <div className="tab-content">
          <QuickCaseRegistration onCaseSubmitted={onQuickCaseSubmitted} />
        </div>
      )}

      {/* TAB 3: CASOS */}
      {activeTab === 'casos' && (
        <div className="tab-content">
          <div className="table-container">
            <h2>Lista de Casos Registados</h2>
            {casos.length === 0 ? (
              <p>Nenhum caso encontrado.</p>
            ) : (
              <div className="casos-table">
                <table>
                  <thead>
                    <tr>
                      <th>Nome</th>
                      <th>Idade</th>
                      <th>Data Desaparecimento</th>
                      <th>Local</th>
                      <th>Nível de Risco</th>
                    </tr>
                  </thead>
                  <tbody>
                    {casos.map((caso, index) => (
                      <tr key={index}>
                        <td>{caso.Nome_Completo}</td>
                        <td>{caso.Idade_Exacta}</td>
                        <td>{caso.Data_Desaparecimento}</td>
                        <td>{caso.Local_Ultimo_Avistamento}</td>
                        <td className={`risk-${caso.Risco_Calculado?.toLowerCase()}`}>
                          {caso.Risco_Calculado}
                        </td>
                          <td>
                            <button className="btn-secondary" onClick={() => {
                              // abrir a ficha detalhada na mesma aplicação
                              setDetailCaseId(caso.ID_Caso || caso.id || caso.ID);
                              setActiveTab('caso-detalhe');
                            }}>Ver ficha</button>
                            <button
                              className="btn-secondary"
                              style={{ marginLeft: 8 }}
                              onClick={async () => {
                                // Abrir modal e iniciar análise para este caso
                                setModalOpen(true);
                                setModalLoading(true);
                                setModalCaseId(caso.ID_Caso || caso.ID_Caso || caso.id || caso.ID || '');
                                setModalCaseName(caso.Nome_Completo || caso.Nome || caso.Nome_Completo || 'N/D');
                                try {
                                  const res = await apiFetch('/api/gerar-analise-caso', {
                                    method: 'POST',
                                    headers: { 'Content-Type': 'application/json' },
                                    body: JSON.stringify({ id: caso.ID_Caso || caso.id || caso.ID })
                                  });
                                  const data = await res.json();
                                  if (data.success) {
                                    const analysisText = typeof data.analise === 'string' ? data.analise : (data.analise?.response || JSON.stringify(data.analise, null, 2));
                                    const clean = limparFormatacaoMarkdown(analysisText);
                                    setFullAnalysis(clean);
                                    setAnalysisResult(extrairPrioridadesEAcaoImediata(clean));
                                  } else {
                                    setFullAnalysis('Erro: ' + (data.error || 'Falha na análise'));
                                    setAnalysisResult('Erro na análise');
                                  }
                                } catch (err) {
                                  setFullAnalysis('Erro: ' + err.message);
                                  setAnalysisResult('Erro na análise');
                                } finally {
                                  setModalLoading(false);
                                }
                              }}
                            >
                              Analisar
                            </button>
                          </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {activeTab === 'user-management' && isAdminUser && (
        <div className="tab-content">
          <UserManagement currentUser={currentUser} />
        </div>
      )}

      {/* TAB 4: ANÁLISE E PREVISÃO */}
      {activeTab === 'previsao' && (
        <div className="tab-content">
          <div className="prediction-container">
            <h2>Análise e Previsão</h2>
            
            <div className="prediction-controls">
              <button 
                className="btn-secondary" 
                onClick={testarLLM}
                disabled={isAnalyzing}
              >
                Testar LLM
              </button>
              <button 
                className="btn-primary" 
                onClick={gerarAnaliseUltimoCaso}
                disabled={isAnalyzing}
              >
                Gerar Análise do Último Caso
              </button>
            </div>

            {isAnalyzing && (
              <div className="loading">
                <p>A analisar com GPT-o1... Aguarde...</p>
              </div>
            )}

            {analysisResult && !isAnalyzing && (
              <div className="result-container">
                <h3>Resultado da Análise</h3>
                <div className="analysis-content">
                  <pre>{analysisResult}</pre>
                </div>
                <button
                  className="btn-primary"
                  style={{ marginTop: '20px' }}
                  onClick={async () => {
                    try {
                      // Chamar endpoint para gerar PDF (retorna PDF como attachment)
                      const res = await apiFetch('/api/exportar-pdf-download', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ respostaLLM: fullAnalysis || analysisResult, filename: 'relatorio_analise' })
                      });

                      if (!res.ok) {
                        const err = await res.json().catch(() => ({}));
                        throw new Error(err.error || 'Erro ao exportar PDF');
                      }

                      const blob = await res.blob();

                      // Preferir File System Access API quando disponível (permite 'Save as' nativo)
                      if (window.showSaveFilePicker) {
                          try {
                          const opts = {
                            suggestedName: 'relatorio_analise.pdf',
                            types: [{ description: 'PDF', accept: { 'application/pdf': ['.pdf'] } }]
                          };
                          const handle = await window.showSaveFilePicker(opts);
                          const writable = await handle.createWritable();
                          await writable.write(blob);
                          await writable.close();
                          await showModal('Sucesso', 'PDF guardado com sucesso.', { confirmText: 'OK' });
                          return;
                          } catch (fsErr) {
                          console.warn('File System API falhou, fallback para download:', fsErr);
                          // fallback para download normal
                        }
                      }

                      // Fallback: criar link para download e forçar 'Save as'
                      const url = window.URL.createObjectURL(blob);
                      const a = document.createElement('a');
                      a.href = url;
                      // tentar extrair filename do header Content-Disposition
                      const cd = res.headers.get('Content-Disposition');
                      let filename = 'relatorio.pdf';
                      if (cd) {
                        const match = /filename="?([^";]+)"?/.exec(cd);
                        if (match && match[1]) filename = match[1];
                      }
                      a.download = filename;
                      document.body.appendChild(a);
                      a.click();
                      a.remove();
                      window.URL.revokeObjectURL(url);

                    } catch (err) {
                      await showModal('Erro', 'Erro ao exportar PDF: ' + (err.message || err), { confirmText: 'OK' });
                    }
                  }}
                >
                  Exportar PDF
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Página de detalhe do caso */}
      {activeTab === 'caso-detalhe' && (
        <div className="tab-content">
          <CaseDetail casoId={detailCaseId} onBack={async () => { setActiveTab('casos'); await carregarCasos(); }} />
        </div>
      )}

      {/* Modal para exibir análise de caso específico */}
      {modalOpen && (
        <div className="modal-overlay" style={{ position: 'fixed', top:0, left:0, right:0, bottom:0, background:'rgba(0,0,0,0.5)', display:'flex', alignItems:'center', justifyContent:'center' }}>
          <div className="modal" style={{ background:'#fff', padding:20, maxWidth:800, width:'90%', borderRadius:8 }}>
            <h3>Análise do Caso de {modalCaseName || modalCaseId || ''}</h3>
            {modalLoading ? (
              <p>A analisar... Aguarde.</p>
            ) : (
              <>
                <div style={{ maxHeight: '60vh', overflow: 'auto', background:'#f8f8f8', padding:16, borderRadius:6 }}>
                  {renderAnalysisDisplay(fullAnalysis || analysisResult)}
                </div>
                <div style={{ marginTop: 12 }}>
                  <button className="btn-primary" onClick={async () => {
                    try {
                      const res = await apiFetch('/api/exportar-pdf-download', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ respostaLLM: fullAnalysis || analysisResult, filename: `relatorio_caso_${modalCaseId || 'caso'}` })
                      });
                      if (!res.ok) {
                        const err = await res.json().catch(()=>({}));
                        throw new Error(err.error || 'Erro ao exportar PDF');
                      }
                      const blob = await res.blob();
                      const url = window.URL.createObjectURL(blob);
                      const a = document.createElement('a');
                      a.href = url;
                      a.download = `relatorio_caso_${modalCaseId || 'caso'}.pdf`;
                      document.body.appendChild(a);
                      a.click();
                      a.remove();
                      window.URL.revokeObjectURL(url);
                    } catch (err) {
                      await showModal('Erro', 'Erro ao exportar PDF: ' + (err.message || err), { confirmText: 'OK' });
                    }
                  }}>Exportar PDF</button>
                  <button className="btn-secondary" style={{ marginLeft: 8 }} onClick={async () => {
                    // Copiar texto apresentado para a área de transferência
                    try {
                      const textToCopy = (fullAnalysis || analysisResult) || '';
                      if (!textToCopy) { await showModal('Aviso', 'Sem texto para copiar', { confirmText: 'OK' }); return; }
                      await navigator.clipboard.writeText(textToCopy);
                      await showModal('Sucesso', 'Texto copiado para a área de transferência', { confirmText: 'OK' });
                    } catch (err) {
                      // Fallback: selecionar e execCommand
                      const ta = document.createElement('textarea');
                      ta.value = (fullAnalysis || analysisResult) || '';
                      document.body.appendChild(ta);
                      ta.select();
                      try { document.execCommand('copy'); await showModal('Sucesso', 'Texto copiado (fallback)', { confirmText: 'OK' }); } catch(e) { await showModal('Erro', 'Falha ao copiar: ' + e.message, { confirmText: 'OK' }); }
                      ta.remove();
                    }
                  }}>Copiar</button>

                  <button className="btn-secondary" style={{ marginLeft: 8 }} onClick={async () => {
                    // Gerar .docx real via docx
                    await gerarDocx({ title: `Analise_Caso_${modalCaseId || 'caso'}`, content: (fullAnalysis || analysisResult) || '' });
                  }}>Descarregar (Word)</button>
                  <button className="btn-secondary" style={{ marginLeft: 8 }} onClick={() => { setModalOpen(false); setAnalysisResult(''); setFullAnalysis(''); setModalCaseName(''); setModalCaseId(null); }}>Fechar</button>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      <footer className="footer">
        <p>&copy; 2025 SARIA - Sistema de Análise e Previsão Inteligente</p>
        <p>Desenvolvido para UEPS - CSTE</p>
      </footer>
      <ModalRoot />
    </div>
  );
}

export default App;
