import React, { useState, useEffect, useRef } from 'react';
import 'leaflet/dist/leaflet.css';
import apiFetch from './api';

// Nota: usamos leaflet diretamente; certifique-se de ter 'leaflet' como dependência no frontend/package.json ou instale via npm.
import L from 'leaflet';

/**
 * COMPONENTE OFICIAL CONFORME MANUAL
 * Formulário completo de registo de pessoas desaparecidas
 * SARIA - Sistema Oficial
 */
function CaseRegistrationOfficial({ onCaseRegistered }) {
  const [currentStep, setCurrentStep] = useState(0);
  const [formData, setFormData] = useState({});
  const [processing, setProcessing] = useState(false);
  const [riskAssessment, setRiskAssessment] = useState({ nivel: 'Normal', indicadores: [], pontuacao: 0 });
  const [validationErrors, setValidationErrors] = useState({});
  const [canonicalHeaders, setCanonicalHeaders] = useState([]);
  const [showOfficialFields, setShowOfficialFields] = useState(false);
  const [collapsedOfficialSections, setCollapsedOfficialSections] = useState({});

  // Estrutura de etapas conforme manual oficial
  const steps = [
    { id: 0, title: 'Denunciante', subtitle: 'Dados da pessoa que faz a denúncia', icon: '👤' },
    { id: 1, title: 'Identificação', subtitle: 'Dados pessoais da pessoa desaparecida', icon: '📋' },
    { id: 2, title: 'Circunstâncias', subtitle: 'Local e circunstâncias do desaparecimento', icon: '📍' },
    { id: 3, title: 'Descrição Física', subtitle: 'Características físicas e vestuário', icon: '👥' },
    { id: 4, title: 'Estado de Saúde', subtitle: 'Condições médicas e vulnerabilidades', icon: '⚕️' },
    { id: 5, title: 'Contactos', subtitle: 'Números e meios de comunicação', icon: '📞' },
    { id: 6, title: 'Veículos', subtitle: 'Meios de transporte utilizados', icon: '🚗' },
    { id: 7, title: 'Avaliação de Risco', subtitle: 'Indicadores de risco elevado', icon: '⚠️' },
    { id: 8, title: 'Antecedentes', subtitle: 'Histórico e dependências', icon: '📊' },
    { id: 9, title: 'Últimos Movimentos', subtitle: 'Contactos e locais frequentados', icon: '🗺️' },
    { id: 10, title: 'Ambiente Social', subtitle: 'Familiares e amigos próximos', icon: '👨‍👩‍👧‍👦' },
    { id: 11, title: 'Situação Pessoal', subtitle: 'Problemas e motivações', icon: '💭' },
    { id: 12, title: 'Objectos', subtitle: 'Documentos e pertences levados', icon: '🎒' },
    { id: 13, title: 'Recursos', subtitle: 'Acesso a dinheiro e recursos', icon: '💰' },
    { id: 14, title: 'Voluntariedade', subtitle: 'Indícios de partida voluntária', icon: '🚪' },
    { id: 15, title: 'Menores', subtitle: 'Circunstâncias específicas para menores', icon: '🧒' },
    { id: 16, title: 'Maiores', subtitle: 'Circunstâncias específicas para maiores', icon: '🧑‍🦳' },
    { id: 17, title: 'Diligências', subtitle: 'Ações já realizadas', icon: '🔍' },
    { id: 18, title: 'Classificação', subtitle: 'Tipo de desaparecimento', icon: '📝' },
    { id: 19, title: 'Contacto Futuro', subtitle: 'Ponto de contacto para comunicações', icon: '📧' },
    { id: 20, title: 'Observações', subtitle: 'Informações adicionais', icon: '📄' },
    { id: 21, title: 'Dados SARIA', subtitle: 'Elementos operacionais responsáveis', icon: '👮‍♂️' }
  ];

  // Campos obrigatórios por etapa
  const requiredFields = {
    0: ['Denunciante_Nome', 'Denunciante_Relacao', 'Denunciante_Contacto'],
    1: ['Nome_Completo', 'Idade_Exacta', 'Sexo', 'Data_Nascimento'],
    2: ['Data_Desaparecimento', 'Hora_Desaparecimento', 'Local_Ultimo_Avistamento'],
    3: [], // Descrição física - campos opcionais
    4: [], // Estado de saúde - campos opcionais
    5: [], // Contactos - campos opcionais
    6: [], // Veículos - campos opcionais
    7: [], // Avaliação de risco - campos opcionais
    8: [], // Antecedentes - campos opcionais
    9: [], // Últimos movimentos - campos opcionais
    10: [], // Ambiente social - campos opcionais
    11: [], // Situação pessoal - campos opcionais
    12: [], // Objectos - campos opcionais
    13: [], // Recursos - campos opcionais
    14: [], // Voluntariedade - campos opcionais
    15: [], // Menores - campos opcionais
    16: [], // Maiores - campos opcionais
    17: [], // Diligências - campos opcionais
    18: [], // Classificação - campos opcionais
    19: [], // Contacto futuro - campos opcionais
    20: [], // Observações - campos opcionais
    21: ['GNR_Nome_Elemento', 'GNR_Posto_Elemento', 'GNR_Unidade_Elemento']
  };

  // Handle input changes
  const handleInputChange = (field, value) => {
    let v = value;
    const newFormData = { ...formData };

    // Sanitizar números de telefone: manter apenas dígitos e limitar a 9
    const phoneFields = [
      'Denunciante_Contacto', 'Denunciante_Contacto_Alternativo', 'Contacto_Telemovel',
      'Contacto_Telefone_Fixo', 'Telefone_Contacto_Futuro', 'GNR_Contacto_Elemento'
    ];
    if (phoneFields.includes(field)) {
      const digits = String(value || '').replace(/\D+/g, '');
      // limitar a 9 dígitos (se o utilizador digitar mais, cortamos)
      v = digits.slice(0, 9);
      newFormData[field] = v;
      setFormData(newFormData);

      // Validar: se não vazio e diferente de 9 dígitos, marcar erro
      if (v !== '' && v.length !== 9) {
        setValidationErrors(prev => ({ ...prev, [field]: 'Telefone inválido — deve ter 9 dígitos' }));
      } else {
        setValidationErrors(prev => { const n = { ...prev }; delete n[field]; return n; });
      }
    } else if (field.toLowerCase().includes('email')) {
      // Validar email simples
      newFormData[field] = v;
      setFormData(newFormData);
      if (v && v.trim() !== '') {
        if (!validateEmail(v)) {
          setValidationErrors(prev => ({ ...prev, [field]: 'Email inválido' }));
        } else {
          setValidationErrors(prev => { const n = { ...prev }; delete n[field]; return n; });
        }
      } else {
        setValidationErrors(prev => { const n = { ...prev }; delete n[field]; return n; });
      }
    } else {
      newFormData[field] = v;
      setFormData(newFormData);

      // Limpar erro de validação se campo foi preenchido
      if (validationErrors[field] && value && value.trim() !== '') {
        const newErrors = { ...validationErrors };
        delete newErrors[field];
        setValidationErrors(newErrors);
      }
    }
    
    // Calcular risco em tempo real se estivermos na etapa de avaliação ou campos relevantes
    if (currentStep >= 7 || isRiskRelevantField(field)) {
      calculateRiskRealTime(newFormData);
    }
    // If user updates location/freguesia/concelho, attempt auto geocode (debounced)
    if (['Local_Ultimo_Avistamento', 'Freguesia', 'Concelho'].includes(field)) {
      debouncedAttemptAutoGeocode(newFormData);
    }
  };

  // Validação simples de email
  function validateEmail(email) {
    if (!email || typeof email !== 'string') return false;
    // Regex simples e suficiente para validação cliente (não exaustiva)
    const re = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return re.test(email.trim());
  }

  // Validação telefone -- exactamente 9 dígitos
  function validatePhoneNumber(v) {
    if (!v) return false;
    const s = String(v).replace(/\D+/g, '');
    return s.length === 9;
  }

  // Modal simples (interno) - promise based
  function SimpleModal({ open, title, message, onClose, confirmText = 'Confirmar', cancelText = 'Cancelar' }) {
    if (!open) return null;
    return (
      <div className="modal-backdrop">
        <div className="modal-box">
          <h4>{title}</h4>
          <div style={{ whiteSpace: 'pre-wrap' }}>{message}</div>
          <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 12 }}>
            <button className="btn-secondary" onClick={() => onClose(false)}>{cancelText}</button>
            <button className="btn-primary" style={{ marginLeft: 8 }} onClick={() => onClose(true)}>{confirmText}</button>
          </div>
        </div>
      </div>
    );
  }

  // Promise-based showModal helper
  function showModal(title, message, options = {}) {
    return new Promise((resolve) => {
      // Render modal into state-driven area
      const handler = (result) => {
        setModalState({ open: false, title: '', message: '', resolve: null });
        resolve(result);
      };
      setModalState({ open: true, title, message, resolve: handler, options });
    });
  }

  const [modalState, setModalState] = useState({ open: false, title: '', message: '', resolve: null, options: {} });

  // Debounce helper
  function debounce(fn, wait) {
    let t;
    return (...args) => {
      clearTimeout(t);
      t = setTimeout(() => fn(...args), wait);
    };
  }

  // Helper: tentar extrair coords (lat,lon) de uma string livre (ex: "38.7, -9.1")
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

  function isNumericCoord(v) {
    if (v === undefined || v === null) return false;
    const s = String(v).trim();
    // evitar warning ESLint 'no-useless-escape' ao usar string literal com regex
    const re = /^[+-]?[0-9]+(?:[.,][0-9]+)?$/;
    return re.test(s);
  }

  // Attempt to auto-geocode when location fields change and latitude/longitude are empty
  const attemptAutoGeocode = async (data) => {
    try {
      if ((!data.Local_Ultimo_Avistamento || data.Local_Ultimo_Avistamento.trim() === '') && (!data.Freguesia || !data.Concelho)) return;
      // don't overwrite user-provided coords
      if (data.Latitude && data.Longitude) return;

      const params = new URLSearchParams();
      if (data.Local_Ultimo_Avistamento) params.append('local', data.Local_Ultimo_Avistamento);
      if (data.Freguesia) params.append('freguesia', data.Freguesia);
      if (data.Concelho) params.append('concelho', data.Concelho);

      const res = await fetch('/api/geocode?' + params.toString());
      if (!res.ok) return;
      const payload = await res.json();
      const geo = payload && (payload.geocode || payload);
      if (geo && geo.lat && geo.lon) {
        const lat = Number(geo.lat);
        const lon = Number(geo.lon);
        const coordStr = `${lat.toFixed(6)}, ${lon.toFixed(6)}`;
        // sugerir zoom: se nível for freguesia_centroid, usar zoom mais afastado
        const level = geo.level || 'precise';
        const suggestedZoom = level === 'freguesia_centroid' ? 12 : 15; // valores sugestivos; pdfGenerator ajustará conforme
        setFormData(prev => ({ ...prev, Latitude: String(lat), Longitude: String(lon), Morada_Exacta_Coordenadas: coordStr, Geocode_Level: level, Map_Zoom_Suggestion: suggestedZoom }));
      }
    } catch (e) {
      console.debug('Auto-geocode falhou', e.message);
    }
  };

  const debouncedAttemptAutoGeocode = debounce(attemptAutoGeocode, 800);

  // Obter headers canónicos do backend para permitir sincronia com o CSV oficial
  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const res = await apiFetch('/api/casos-oficial/headers');
        if (!res.ok) return;
        const payload = await res.json();
        if (mounted && payload && Array.isArray(payload.headers)) {
          setCanonicalHeaders(payload.headers);
        }
      } catch (e) {
        console.debug('Não foi possível obter headers oficiais', e.message);
      }
    })();
    return () => { mounted = false; };
  }, []);

  // Agrupar headers oficiais por secção semântica para facilitar edição
  function groupHeadersBySection(headers) {
    if (!headers || !Array.isArray(headers)) return {};
    // Mapear prefixos comuns para secções
    const sectionMap = {
      'Denunciante_': 'Denunciante',
      'GNR_': 'Dados GNR',
      'Morada_': 'Local',
      'Local_': 'Local',
      'Concelho': 'Local',
      'Freguesia': 'Local',
      'Data_': 'Datas',
      'Hora_': 'Datas',
      'Nome_': 'Identificação',
      'Nome': 'Identificação',
      'Idade': 'Identificação',
      'Sexo': 'Identificação',
      'Altura': 'Descrição Física',
      'Peso': 'Descrição Física',
      'Cor_': 'Descrição Física',
      'Transporta_': 'Saúde',
      'Medicamentos': 'Saúde',
      'Observacoes': 'Observações',
      'Observacoes_': 'Observações',
      'Endereco': 'Endereços',
      'Endereco_': 'Endereços',
      'Tipo_Desaparecimento': 'Classificação',
      'Avaliacao_Prioridade': 'Classificação'
    };

    const groups = {};
    headers.forEach(h => {
      // descobrir secção por prefixo
      let assigned = false;
      for (const prefix in sectionMap) {
        if (h.startsWith(prefix) || h.includes(prefix)) {
          const sec = sectionMap[prefix];
          groups[sec] = groups[sec] || [];
          groups[sec].push(h);
          assigned = true;
          break;
        }
      }
      if (!assigned) {
        groups['Outros'] = groups['Outros'] || [];
        groups['Outros'].push(h);
      }
    });
    return groups;
  }

  const groupedOfficialFields = groupHeadersBySection(canonicalHeaders);

  // Campos a excluir da renderização dinâmica (calculados, técnicos ou obsoletos)
  const officialFieldsExclude = new Set([
    'ID_Caso', 'Data_Registo', 'Hora_Registo', 'Risco_Calculado', 'Indicadores_Risco_Activos',
    'Map_Zoom_Suggestion', 'Geocode_Level', 'Morada_Exacta_Coordenadas', 'Latitude', 'Longitude'
  ]);

  // Mapeamento de id de campo para label amigável
  const officialFieldLabels = {
    'Denunciante_Nome': 'Nome do Denunciante',
    'Denunciante_Relacao': 'Relação',
    'Denunciante_Contacto': 'Contacto do Denunciante',
    'Nome_Completo': 'Nome da Pessoa Desaparecida',
    'Idade_Exacta': 'Idade (anos)',
    'Sexo': 'Sexo',
    'Data_Desaparecimento': 'Data do Desaparecimento',
    'Hora_Desaparecimento': 'Hora do Desaparecimento',
    'Local_Ultimo_Avistamento': 'Local do Último Avistamento',
    'Concelho': 'Concelho',
    'Freguesia': 'Freguesia'
    // adicionar mais mapeamentos conforme necessário
  };

  // Helper para renderizar inputs simples para campos canónicos extra por etapa
  function renderOfficialFieldsForStep(stepId) {
    // Mapa de secções para etapas (simplificado)
    const stepSectionMap = {
      0: ['Denunciante'],
      1: ['Identificação'],
      2: ['Local', 'Endereços', 'Datas']
    };
    const sections = stepSectionMap[stepId] || [];
    const fields = [];
    sections.forEach(sec => {
      const list = groupedOfficialFields[sec] || [];
      list.forEach(f => {
        // filtrar campos excluídos e evitar duplicar inputs que já existem no formulário
        if (officialFieldsExclude.has(f)) return;
        // evitar campos técnicos que começam com '_' ou 'Calc_'
        if (f.startsWith('_') || f.startsWith('Calc_')) return;
        if (formData[f] !== undefined) return; // já tem input no formulário
        fields.push(f);
      });
    });
    if (!fields.length) return null;

    return (
      <div style={{ marginTop: 12 }}>
        <h4>Campos oficiais adicionais</h4>
        <div className="form-grid">
          {fields.map((field) => {
            const label = officialFieldLabels[field] || field.replace(/_/g, ' ');
            return (
              <div className="form-group" key={field}>
                <label>{label}</label>
                <input
                  type="text"
                  value={formData[field] || ''}
                  onChange={(e) => handleInputChange(field, e.target.value)}
                  placeholder={`Preencha ${label}`}
                />
              </div>
            );
          })}
        </div>
      </div>
    );
  }

  // Map picker: cria um mapa Leaflet e permite ao utilizador clicar para marcar coordenadas
  function MapPicker({ lat, lon, onSelect }) {
    const mapRef = useRef(null);
    const markerRef = useRef(null);
    const [lastPicked, setLastPicked] = useState(null);

    useEffect(() => {
      // Inicializar mapa apenas uma vez
      if (!mapRef.current) {
        try {
          mapRef.current = L.map('mappicker', { center: [38.7223, -9.1393], zoom: 12 });
          L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
            attribution: '© OpenStreetMap contributors'
          }).addTo(mapRef.current);

            mapRef.current.on('click', async function(e) {
              const { lat: clat, lng: clon } = e.latlng;
              // atualizar marcador
              if (markerRef.current) markerRef.current.setLatLng([clat, clon]);
              else markerRef.current = L.marker([clat, clon]).addTo(mapRef.current);
              // centrar e sugerir zoom mais próximo para um pick manual
              try { mapRef.current.setView([clat, clon], 16); } catch(_) {}
              setLastPicked({ lat: clat, lon: clon });
              if (onSelect) onSelect(clat, clon, { manual: true, suggestedZoom: 16, markerRef });
            });
        } catch (e) {
          console.error('Erro ao inicializar mapa', e);
        }
      }

  // Atualizar posição do marcador se lat/lon mudarem externamente
  if (mapRef.current && lat && lon) {
        try {
          const l = Number(lat);
          const o = Number(lon);
          if (!isNaN(l) && !isNaN(o)) {
            mapRef.current.setView([l, o], 15);
            if (markerRef.current) markerRef.current.setLatLng([l, o]);
            else markerRef.current = L.marker([l, o]).addTo(mapRef.current);
          }
        } catch (e) { /* ignore */ }
      }

      return () => {
        // Não destruímos o mapa para evitar problemas com re-mount durante navegação
      };
    }, [lat, lon, onSelect]);

    return (
      <div>
        <div id="mappicker" style={{ height: 300, width: '100%', border: '1px solid #ccc', borderRadius: 4 }} />
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 6 }}>
          <div style={{ fontSize: 12 }}>
            <em>Clique no mapa para selecionar o local exato. O sistema tentará preencher automaticamente Freguesia e Concelho via reverse-geocode.</em>
            {lastPicked && (
              <div style={{ marginTop: 6, color: '#333' }}><strong>Coordenadas selecionadas:</strong> {Number(lastPicked.lat).toFixed(6)}, {Number(lastPicked.lon).toFixed(6)}</div>
            )}
          </div>
          <div>
            <button type="button" className="btn-secondary" style={{ marginRight: 8 }} onClick={() => {
              // remover marcador do mapa e limpar coord no estado
              try { if (markerRef.current && mapRef.current) { mapRef.current.removeLayer(markerRef.current); markerRef.current = null; } } catch(_) {}
              if (onSelect) onSelect(null, null, { cleared: true, markerRef });
            }}>Limpar marcador</button>
          </div>
        </div>
      </div>
    );
  }

  // Verificar se campo é relevante para cálculo de risco
  const isRiskRelevantField = (field) => {
    const riskFields = [
      'Idade_Exacta', 'Indicios_Crime', 'Risco_Iminente_Vida', 'Verbalizou_Intencao_Suicidio',
      'Vitima_Violencia_Domestica', 'Abandonou_Menores_Cargo', 'Fugiu_Centro_Educativo'
    ];
    return riskFields.includes(field);
  };

  // Calcular risco em tempo real
  const calculateRiskRealTime = (data) => {
    let pontuacao = 0;
    const indicadores = [];

    // Implementar lógica simplificada para feedback em tempo real
    if (data.Idade_Exacta && parseInt(data.Idade_Exacta) < 18) {
      indicadores.push('Menor de idade');
      pontuacao += 3;
    }
    if (data.Indicios_Crime === 'Sim') {
      indicadores.push('Indícios de crime');
      pontuacao += 5;
    }
    if (data.Verbalizou_Intencao_Suicidio === 'Sim') {
      indicadores.push('Risco de suicídio');
      pontuacao += 5;
    }

    let nivel = 'Normal';
    if (pontuacao >= 5) nivel = 'Elevado';
    else if (pontuacao >= 3) nivel = 'Moderado';

    setRiskAssessment({ nivel, indicadores, pontuacao });
  };

  // Validar etapa atual
  const validateCurrentStep = () => {
    const required = requiredFields[currentStep] || [];
    const errors = {};
    let isValid = true;

    required.forEach(field => {
      if (!formData[field] || formData[field].toString().trim() === '') {
        errors[field] = 'Campo obrigatório';
        isValid = false;
      }
    });

    setValidationErrors(errors);
    return isValid;
  };

  // Navegar para próxima etapa
  const nextStep = async () => {
    if (validateCurrentStep()) {
      if (currentStep < steps.length - 1) {
        setCurrentStep(currentStep + 1);
      }
    } else {
      // Use modal for better UX
      try { await showModal('Validação', 'Por favor, preencha todos os campos obrigatórios marcados com *', { confirmText: 'OK' }); } catch(e) { /* ignore */ }
    }
  };

  // Navegar para etapa anterior
  const prevStep = () => {
    if (currentStep > 0) {
      setCurrentStep(currentStep - 1);
    }
  };

  // Submeter formulário
  const submitForm = async () => {
    if (!validateCurrentStep()) {
      await showModal('Validação', 'Por favor, preencha todos os campos obrigatórios antes de submeter.', { confirmText: 'OK' });
      return;
    }

    setProcessing(true);

    try {
      // Validação adicional client-side para telefones: bloquear se existirem números inválidos
      const phoneChecks = [
        'Denunciante_Contacto', 'Denunciante_Contacto_Alternativo', 'Contacto_Telemovel',
        'Contacto_Telefone_Fixo', 'Telefone_Contacto_Futuro', 'GNR_Contacto_Elemento'
      ];
      const invalidPhones = phoneChecks.filter(f => {
        const v = formData[f];
        if (!v) return false; // vazio -> não validamos aqui (outro passo pode obrigar)
        return !validatePhoneNumber(v);
      });
      if (invalidPhones.length) {
        await showModal('Telefones inválidos', `Os seguintes campos têm números inválidos (devem ter 9 dígitos):\n\n${invalidPhones.join('\n')}`, { confirmText: 'Corrigir', cancelText: 'Cancelar' });
        setProcessing(false);
        return;
      }

      // Validação adicional client-side para Latitude/Longitude
      const latRaw = formData.Latitude || formData.lat || formData.latitude;
      const lonRaw = formData.Longitude || formData.lon || formData.longitude;
      if ((latRaw && !isNumericCoord(latRaw)) || (lonRaw && !isNumericCoord(lonRaw))) {
        const proceed = await showModal('Validação Coordenadas', 'Latitude ou Longitude fornecidas não parecem numéricas. Deseja prosseguir?', { confirmText: 'Prosseguir', cancelText: 'Rever' });
        if (!proceed) { setProcessing(false); return; }
      }
      // Se existir Morada_Exacta_Coordenadas, comparar
      const morada = formData.Morada_Exacta_Coordenadas || formData.Morada_Exacta || '';
      const moradaCoords = parseCoordsFromString(morada);
      if (moradaCoords && latRaw && lonRaw && isNumericCoord(latRaw) && isNumericCoord(lonRaw)) {
        const latN = Number(String(latRaw).replace(',', '.'));
        const lonN = Number(String(lonRaw).replace(',', '.'));
        const dist = calcularDistanciaKm(latN, lonN, moradaCoords.lat, moradaCoords.lon);
        if (dist !== null && dist > 0.5) {
          const cont = await showModal('Discrepância de Coordenadas', `As coordenadas fornecidas distam ${dist.toFixed(2)} km da Morada_Exacta_Coordenadas. Deseja prosseguir?`, { confirmText: 'Prosseguir', cancelText: 'Rever' });
          if (!cont) { setProcessing(false); return; }
        }
      }
      // Antes de submeter, obter cabeçalhos oficiais do CSV e confirmar correspondência
      try {
        const resHead = await apiFetch('/api/casos-oficial');
        if (resHead.ok) {
          const dataHead = await resHead.json();
          if (dataHead.success && Array.isArray(dataHead.casos) && dataHead.casos.length > 0) {
            const officialKeys = Object.keys(dataHead.casos[0]);
            const formKeys = Object.keys(formData);
            const missingInCsv = formKeys.filter(k => !officialKeys.includes(k));
            const missingInForm = officialKeys.filter(k => !formKeys.includes(k));

            let summary = 'Confirme os campos antes de submeter:\n\nCampos no formulário que NÃO existem no CSV oficial:\n';
            summary += missingInCsv.length ? missingInCsv.join(', ') : 'Nenhum';
            summary += '\n\nCampos obrigatórios do CSV que estão ausentes no formulário (poderão ser gravados vazios):\n';
            // mostrar só os primeiros 30 para não sobrecarregar
            summary += missingInForm.length ? missingInForm.slice(0,30).join(', ') + (missingInForm.length > 30 ? '... (mais)' : '') : 'Nenhum';
            summary += '\n\nDeseja prosseguir com o registo?';

            const ok = await showModal('Confirme os campos', summary, { confirmText: 'Prosseguir', cancelText: 'Rever' });
            if (!ok) {
              setProcessing(false);
              return;
            }
          }
        }
      } catch (e) {
        console.debug('Falha a obter cabeçalhos do CSV oficial, prosseguindo sem confirmação extra', e.message);
      }

      const response = await apiFetch('/api/casos-oficial', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify((() => {
          // Segurança: não enviar campos efémeros que são apenas para UI/ajuda
          const forbidden = ['Geocode_Level', 'Map_Zoom_Suggestion'];
          const payload = {};
          Object.keys(formData || {}).forEach(k => { if (!forbidden.includes(k)) payload[k] = formData[k]; });
          payload.Data_Registo = new Date().toISOString().split('T')[0];
          payload.Hora_Registo = new Date().toTimeString().split(' ')[0];
          return payload;
        })())
      });

      const result = await response.json();

      if (result.success) {
        let msg = `Caso registado com sucesso!\n\nID: ${result.caso.id}\nRisco: ${result.caso.risco}\nPrioridade: ${result.caso.prioridade}`;
        if (result.warnings && result.warnings.length) {
          msg += `\n\nAvisos: ${result.warnings}`;
        }
        if (result.verificacao_campos) {
          const faltam = result.verificacao_campos.faltam_no_objeto || [];
          const extras = result.verificacao_campos.extras_no_objeto || [];
          if (faltam.length || extras.length) {
            msg += `\n\nVerificação de campos:\nFaltam: ${faltam.join(', ') || 'Nenhum'}\nExtras: ${extras.join(', ') || 'Nenhum'}`;
          }
        }
  await showModal('Caso registado', msg, { confirmText: 'OK' });
        // Reset form
        setFormData({});
        setCurrentStep(0);
        setRiskAssessment({ nivel: 'Normal', indicadores: [], pontuacao: 0 });
        // Redirecionar para dashboard e acionar atualização
        if (typeof window !== 'undefined') {
          setTimeout(() => {
            if (onCaseRegistered) onCaseRegistered(result.caso);
            if (window && window.dispatchEvent) {
              window.dispatchEvent(new CustomEvent('goToDashboard'));
            }
          }, 300);
        }
      } else {
        throw new Error(result.error || 'Erro desconhecido');
      }
    } catch (error) {
      console.error('Erro ao registar caso:', error);
  await showModal('Erro ao registar caso', `Erro ao registar caso: ${error.message}`, { confirmText: 'OK' });
    } finally {
      setProcessing(false);
    }
  };

  // Renderizar etapa atual
  const renderCurrentStep = () => {
    switch (currentStep) {
      // 11. Ambiente Social
      case 10:
        return (
          <div className="step-content">
            <h3>11. AMBIENTE SOCIAL</h3>
            <div className="form-grid">
              <div className="form-group">
                <label>Familiares Próximos</label>
                <input
                  type="text"
                  value={formData.Ambiente_Familiares_Proximos || ''}
                  onChange={(e) => handleInputChange('Ambiente_Familiares_Proximos', e.target.value)}
                  placeholder="Nome, relação, contacto"
                />
              </div>
              <div className="form-group">
                <label>Amigos Próximos</label>
                <input
                  type="text"
                  value={formData.Ambiente_Amigos_Proximos || ''}
                  onChange={(e) => handleInputChange('Ambiente_Amigos_Proximos', e.target.value)}
                  placeholder="Nome, contacto"
                />
              </div>
              <div className="form-group">
                <label>Rede de Apoio</label>
                <input
                  type="text"
                  value={formData.Ambiente_Rede_Apoio || ''}
                  onChange={(e) => handleInputChange('Ambiente_Rede_Apoio', e.target.value)}
                  placeholder="Instituições, vizinhos, etc."
                />
              </div>
              <div className="form-group">
                <label>Conflitos Familiares</label>
                <select
                  value={formData.Ambiente_Conflitos_Familiares || ''}
                  onChange={(e) => handleInputChange('Ambiente_Conflitos_Familiares', e.target.value)}
                >
                  <option value="">Selecione...</option>
                  <option value="Sim">Sim</option>
                  <option value="Não">Não</option>
                  <option value="Desconhecido">Desconhecido</option>
                </select>
              </div>
              <div className="form-group full-width">
                <label>Observações</label>
                <textarea
                  value={formData.Ambiente_Observacoes || ''}
                  onChange={(e) => handleInputChange('Ambiente_Observacoes', e.target.value)}
                  rows="2"
                  placeholder="Informações relevantes sobre o ambiente social"
                />
              </div>
            </div>
          </div>
        );
      // 12. Situação Pessoal
      case 11:
        return (
          <div className="step-content">
            <h3>12. SITUAÇÃO PESSOAL</h3>
            <div className="form-grid">
              <div className="form-group">
                <label>Problemas Recentes</label>
                <input
                  type="text"
                  value={formData.Situacao_Problemas_Recentes || ''}
                  onChange={(e) => handleInputChange('Situacao_Problemas_Recentes', e.target.value)}
                  placeholder="Problemas familiares, financeiros, etc."
                />
              </div>
              <div className="form-group">
                <label>Motivações Possíveis</label>
                <input
                  type="text"
                  value={formData.Situacao_Motivacoes_Possiveis || ''}
                  onChange={(e) => handleInputChange('Situacao_Motivacoes_Possiveis', e.target.value)}
                  placeholder="Motivos para o desaparecimento"
                />
              </div>
              <div className="form-group">
                <label>Eventos Marcantes</label>
                <input
                  type="text"
                  value={formData.Situacao_Eventos_Marcantes || ''}
                  onChange={(e) => handleInputChange('Situacao_Eventos_Marcantes', e.target.value)}
                  placeholder="Falecimento, separação, etc."
                />
              </div>
              <div className="form-group">
                <label>Estado Emocional</label>
                <select
                  value={formData.Situacao_Estado_Emocional || ''}
                  onChange={(e) => handleInputChange('Situacao_Estado_Emocional', e.target.value)}
                >
                  <option value="">Selecione...</option>
                  <option value="Estável">Estável</option>
                  <option value="Ansioso">Ansioso</option>
                  <option value="Depressivo">Depressivo</option>
                  <option value="Agressivo">Agressivo</option>
                  <option value="Outro">Outro</option>
                  <option value="Desconhecido">Desconhecido</option>
                </select>
              </div>
              <div className="form-group full-width">
                <label>Observações</label>
                <textarea
                  value={formData.Situacao_Observacoes || ''}
                  onChange={(e) => handleInputChange('Situacao_Observacoes', e.target.value)}
                  rows="2"
                  placeholder="Informações relevantes sobre a situação pessoal"
                />
              </div>
            </div>
          </div>
        );
      // 13. Objectos
      case 12:
        return (
          <div className="step-content">
            <h3>13. OBJECTOS</h3>
            <div className="form-grid">
              <div className="form-group">
                <label>Documentos Levados</label>
                <input
                  type="text"
                  value={formData.Objectos_Documentos_Levados || ''}
                  onChange={(e) => handleInputChange('Objectos_Documentos_Levados', e.target.value)}
                  placeholder="Cartão de cidadão, passaporte, etc."
                />
              </div>
              <div className="form-group">
                <label>Objetos Pessoais</label>
                <input
                  type="text"
                  value={formData.Objectos_Pessoais || ''}
                  onChange={(e) => handleInputChange('Objectos_Pessoais', e.target.value)}
                  placeholder="Mala, mochila, etc."
                />
              </div>
              <div className="form-group">
                <label>Telemóvel</label>
                <select
                  value={formData.Objectos_Telemovel || ''}
                  onChange={(e) => handleInputChange('Objectos_Telemovel', e.target.value)}
                >
                  <option value="">Selecione...</option>
                  <option value="Sim">Sim</option>
                  <option value="Não">Não</option>
                  <option value="Desconhecido">Desconhecido</option>
                </select>
              </div>
              <div className="form-group">
                <label>Dinheiro</label>
                <input
                  type="text"
                  value={formData.Objectos_Dinheiro || ''}
                  onChange={(e) => handleInputChange('Objectos_Dinheiro', e.target.value)}
                  placeholder="Montante aproximado, se conhecido"
                />
              </div>
              <div className="form-group">
                <label>Outros Pertences</label>
                <input
                  type="text"
                  value={formData.Objectos_Outros || ''}
                  onChange={(e) => handleInputChange('Objectos_Outros', e.target.value)}
                  placeholder="Ex: medicamentos, chaves, etc."
                />
              </div>
              <div className="form-group full-width">
                <label>Observações</label>
                <textarea
                  value={formData.Objectos_Observacoes || ''}
                  onChange={(e) => handleInputChange('Objectos_Observacoes', e.target.value)}
                  rows="2"
                  placeholder="Informações relevantes sobre objectos e pertences"
                />
              </div>
            </div>
          </div>
        );
      // 14. Recursos
      case 13:
        return (
          <div className="step-content">
            <h3>14. RECURSOS</h3>
            <div className="form-grid">
              <div className="form-group">
                <label>Acesso a Dinheiro</label>
                <select
                  value={formData.Recursos_Acesso_Dinheiro || ''}
                  onChange={(e) => handleInputChange('Recursos_Acesso_Dinheiro', e.target.value)}
                >
                  <option value="">Selecione...</option>
                  <option value="Sim">Sim</option>
                  <option value="Não">Não</option>
                  <option value="Desconhecido">Desconhecido</option>
                </select>
              </div>
              <div className="form-group">
                <label>Cartões Bancários</label>
                <input
                  type="text"
                  value={formData.Recursos_Cartoes_Bancarios || ''}
                  onChange={(e) => handleInputChange('Recursos_Cartoes_Bancarios', e.target.value)}
                  placeholder="Tipo, banco, etc."
                />
              </div>
              <div className="form-group">
                <label>Meios de Transporte Disponíveis</label>
                <input
                  type="text"
                  value={formData.Recursos_Transportes || ''}
                  onChange={(e) => handleInputChange('Recursos_Transportes', e.target.value)}
                  placeholder="Ex: automóvel, passe, etc."
                />
              </div>
              <div className="form-group">
                <label>Recursos Financeiros</label>
                <input
                  type="text"
                  value={formData.Recursos_Financeiros || ''}
                  onChange={(e) => handleInputChange('Recursos_Financeiros', e.target.value)}
                  placeholder="Descrição geral dos recursos"
                />
              </div>
              <div className="form-group full-width">
                <label>Observações</label>
                <textarea
                  value={formData.Recursos_Observacoes || ''}
                  onChange={(e) => handleInputChange('Recursos_Observacoes', e.target.value)}
                  rows="2"
                  placeholder="Informações relevantes sobre recursos disponíveis"
                />
              </div>
            </div>
          </div>
        );
      // 15. Voluntariedade
      case 14:
        return (
          <div className="step-content">
            <h3>15. VOLUNTARIEDADE</h3>
            <div className="form-grid">
              <div className="form-group">
                <label>Indícios de Partida Voluntária</label>
                <select
                  value={formData.Voluntariedade_Indicios || ''}
                  onChange={(e) => handleInputChange('Voluntariedade_Indicios', e.target.value)}
                >
                  <option value="">Selecione...</option>
                  <option value="Sim">Sim</option>
                  <option value="Não">Não</option>
                  <option value="Desconhecido">Desconhecido</option>
                </select>
              </div>
              <div className="form-group">
                <label>Despedidas</label>
                <input
                  type="text"
                  value={formData.Voluntariedade_Despedidas || ''}
                  onChange={(e) => handleInputChange('Voluntariedade_Despedidas', e.target.value)}
                  placeholder="Ex: avisou alguém, deixou carta, etc."
                />
              </div>
              <div className="form-group">
                <label>Mensagens Deixadas</label>
                <input
                  type="text"
                  value={formData.Voluntariedade_Mensagens || ''}
                  onChange={(e) => handleInputChange('Voluntariedade_Mensagens', e.target.value)}
                  placeholder="SMS, email, carta, etc."
                />
              </div>
              <div className="form-group">
                <label>Planeamento Prévio</label>
                <select
                  value={formData.Voluntariedade_Planeamento || ''}
                  onChange={(e) => handleInputChange('Voluntariedade_Planeamento', e.target.value)}
                >
                  <option value="">Selecione...</option>
                  <option value="Sim">Sim</option>
                  <option value="Não">Não</option>
                  <option value="Desconhecido">Desconhecido</option>
                </select>
              </div>
              <div className="form-group full-width">
                <label>Observações</label>
                <textarea
                  value={formData.Voluntariedade_Observacoes || ''}
                  onChange={(e) => handleInputChange('Voluntariedade_Observacoes', e.target.value)}
                  rows="2"
                  placeholder="Informações relevantes sobre indícios de voluntariedade"
                />
              </div>
            </div>
          </div>
        );
      // 6. Contactos
      case 5:
        return (
          <div className="step-content">
            <h3>6. CONTACTOS</h3>
            <div className="form-grid">
              <div className="form-group">
                <label>Telemóvel Principal</label>
                <input
                  type="tel"
                  value={formData.Contacto_Telemovel || ''}
                  onChange={(e) => handleInputChange('Contacto_Telemovel', e.target.value)}
                  placeholder="9XXXXXXXXX"
                />
              </div>
              <div className="form-group">
                <label>Telefone Fixo</label>
                <input
                  type="tel"
                  value={formData.Contacto_Telefone_Fixo || ''}
                  onChange={(e) => handleInputChange('Contacto_Telefone_Fixo', e.target.value)}
                  placeholder="2XXXXXXXX"
                />
              </div>
              <div className="form-group">
                <label>Email</label>
                <input
                  type="email"
                  value={formData.Contacto_Email || ''}
                  onChange={(e) => handleInputChange('Contacto_Email', e.target.value)}
                  placeholder="email@exemplo.com"
                />
              </div>
              <div className="form-group">
                <label>Redes Sociais</label>
                <input
                  type="text"
                  value={formData.Contacto_Redes_Sociais || ''}
                  onChange={(e) => handleInputChange('Contacto_Redes_Sociais', e.target.value)}
                  placeholder="Facebook, Instagram, WhatsApp, etc."
                />
              </div>
              <div className="form-group full-width">
                <label>Outros Meios de Contacto</label>
                <input
                  type="text"
                  value={formData.Contacto_Outros || ''}
                  onChange={(e) => handleInputChange('Contacto_Outros', e.target.value)}
                  placeholder="Skype, Telegram, etc."
                />
              </div>
            </div>
          </div>
        );
      // 7. Veículos
      case 6:
        return (
          <div className="step-content">
            <h3>7. VEÍCULOS</h3>
            <div className="form-grid">
              <div className="form-group">
                <label>Utilizou Veículo?</label>
                <select
                  value={formData.Utilizou_Veiculo || ''}
                  onChange={(e) => handleInputChange('Utilizou_Veiculo', e.target.value)}
                >
                  <option value="">Selecione...</option>
                  <option value="Sim">Sim</option>
                  <option value="Não">Não</option>
                </select>
              </div>
              <div className="form-group">
                <label>Tipo de Veículo</label>
                <select
                  value={formData.Veiculo_Tipo || ''}
                  onChange={(e) => handleInputChange('Veiculo_Tipo', e.target.value)}
                  disabled={formData.Utilizou_Veiculo === 'Não'}
                >
                  <option value="">Selecione...</option>
                  <option value="Automóvel">Automóvel</option>
                  <option value="Motociclo">Motociclo</option>
                  <option value="Bicicleta">Bicicleta</option>
                  <option value="Transporte Público">Transporte Público</option>
                  <option value="Outro">Outro</option>
                  <option value="Nenhum">Nenhum</option>
                </select>
              </div>
              <div className="form-group">
                <label>Marca</label>
                <input
                  type="text"
                  value={formData.Veiculo_Marca || ''}
                  onChange={(e) => handleInputChange('Veiculo_Marca', e.target.value)}
                  placeholder="ex: Renault, Yamaha, etc."
                  disabled={formData.Utilizou_Veiculo === 'Não'}
                />
              </div>
              <div className="form-group">
                <label>Modelo</label>
                <input
                  type="text"
                  value={formData.Veiculo_Modelo || ''}
                  onChange={(e) => handleInputChange('Veiculo_Modelo', e.target.value)}
                  placeholder="ex: Clio, XJ6, etc."
                  disabled={formData.Utilizou_Veiculo === 'Não'}
                />
              </div>
              <div className="form-group">
                <label>Matrícula</label>
                <input
                  type="text"
                  value={formData.Veiculo_Matricula || ''}
                  onChange={(e) => handleInputChange('Veiculo_Matricula', e.target.value)}
                  placeholder="AA-00-XX"
                  disabled={formData.Utilizou_Veiculo === 'Não'}
                />
              </div>
              <div className="form-group">
                <label>Cor</label>
                <input
                  type="text"
                  value={formData.Veiculo_Cor || ''}
                  onChange={(e) => handleInputChange('Veiculo_Cor', e.target.value)}
                  placeholder="ex: Preto, Azul, etc."
                  disabled={formData.Utilizou_Veiculo === 'Não'}
                />
              </div>
              <div className="form-group full-width">
                <label>Observações sobre o Veículo</label>
                <textarea
                  value={formData.Veiculo_Observacoes || ''}
                  onChange={(e) => handleInputChange('Veiculo_Observacoes', e.target.value)}
                  rows="2"
                  placeholder="Informações adicionais, ex: danos, autocolantes, etc."
                  disabled={formData.Utilizou_Veiculo === 'Não'}
                />
              </div>
            </div>
          </div>
        );
      // 9. Antecedentes
      case 8:
        return (
          <div className="step-content">
            <h3>9. ANTECEDENTES</h3>
            <div className="form-grid">
              <div className="form-group">
                <label>Histórico Criminal</label>
                <select
                  value={formData.Antecedentes_Criminais || ''}
                  onChange={(e) => handleInputChange('Antecedentes_Criminais', e.target.value)}
                >
                  <option value="">Selecione...</option>
                  <option value="Sim">Sim</option>
                  <option value="Não">Não</option>
                  <option value="Desconhecido">Desconhecido</option>
                </select>
              </div>
              <div className="form-group">
                <label>Dependências (álcool, drogas, etc.)</label>
                <input
                  type="text"
                  value={formData.Antecedentes_Dependencias || ''}
                  onChange={(e) => handleInputChange('Antecedentes_Dependencias', e.target.value)}
                  placeholder="Descreva se aplicável"
                  disabled={formData.Antecedentes_Criminais === 'Não'}
                />
              </div>
              <div className="form-group">
                <label>Ocorrências Anteriores</label>
                <input
                  type="text"
                  value={formData.Antecedentes_Ocorrencias || ''}
                  onChange={(e) => handleInputChange('Antecedentes_Ocorrencias', e.target.value)}
                  placeholder="Desaparecimentos prévios, fugas, etc."
                  disabled={formData.Antecedentes_Criminais === 'Não'}
                />
              </div>
              <div className="form-group full-width">
                <label>Observações</label>
                <textarea
                  value={formData.Antecedentes_Observacoes || ''}
                  onChange={(e) => handleInputChange('Antecedentes_Observacoes', e.target.value)}
                  rows="2"
                  placeholder="Informações relevantes sobre antecedentes"
                />
              </div>
            </div>
          </div>
        );
      // 10. Últimos Movimentos
      case 9:
        return (
          <div className="step-content">
            <h3>10. ÚLTIMOS MOVIMENTOS</h3>
            <div className="form-grid">
              <div className="form-group">
                <label>Contactos Recentes</label>
                <input
                  type="text"
                  value={formData.Ultimos_Contactos_Recentes || ''}
                  onChange={(e) => handleInputChange('Ultimos_Contactos_Recentes', e.target.value)}
                  placeholder="Pessoas com quem falou recentemente"
                />
              </div>
              <div className="form-group">
                <label>Locais Frequentados</label>
                <input
                  type="text"
                  value={formData.Ultimos_Locais_Frequentados || ''}
                  onChange={(e) => handleInputChange('Ultimos_Locais_Frequentados', e.target.value)}
                  placeholder="Ex: cafés, ginásio, casa de amigos, etc."
                />
              </div>
              <div className="form-group">
                <label>Rotinas e Hábitos</label>
                <input
                  type="text"
                  value={formData.Ultimos_Rotinas || ''}
                  onChange={(e) => handleInputChange('Ultimos_Rotinas', e.target.value)}
                  placeholder="Ex: horários, percursos habituais, etc."
                />
              </div>
              <div className="form-group full-width">
                <label>Observações</label>
                <textarea
                  value={formData.Ultimos_Observacoes || ''}
                  onChange={(e) => handleInputChange('Ultimos_Observacoes', e.target.value)}
                  rows="2"
                  placeholder="Informações relevantes sobre os últimos movimentos"
                />
              </div>
            </div>
          </div>
        );
      case 0: // Denunciante
        return (
          <div className="step-content">
            <h3>1. DADOS DO DENUNCIANTE</h3>
            <div className="form-grid">
              <div className="form-group full-width">
                <label>Nome Completo *</label>
                <input
                  type="text"
                  value={formData.Denunciante_Nome || ''}
                  onChange={(e) => handleInputChange('Denunciante_Nome', e.target.value)}
                  className={validationErrors.Denunciante_Nome ? 'error' : ''}
                  placeholder="Nome completo de quem faz a denúncia"
                />
                {validationErrors.Denunciante_Nome && <span className="error-message">{validationErrors.Denunciante_Nome}</span>}
              </div>
              
              <div className="form-group">
                <label>Relação com a Pessoa Desaparecida *</label>
                <select
                  value={formData.Denunciante_Relacao || ''}
                  onChange={(e) => handleInputChange('Denunciante_Relacao', e.target.value)}
                  className={validationErrors.Denunciante_Relacao ? 'error' : ''}
                >
                  <option value="">Selecione...</option>
                  <option value="Cônjuge">Cônjuge</option>
                  <option value="Filho/a">Filho/a</option>
                  <option value="Pai/Mãe">Pai/Mãe</option>
                  <option value="Irmão/Irmã">Irmão/Irmã</option>
                  <option value="Avô/Avó">Avô/Avó</option>
                  <option value="Tio/Tia">Tio/Tia</option>
                  <option value="Primo/Prima">Primo/Prima</option>
                  <option value="Amigo/a">Amigo/a</option>
                  <option value="Vizinho/a">Vizinho/a</option>
                  <option value="Colega trabalho">Colega de trabalho</option>
                  <option value="Professor/a">Professor/a</option>
                  <option value="Funcionário instituição">Funcionário de instituição</option>
                  <option value="Outro">Outro</option>
                </select>
              </div>
              
              <div className="form-group">
                <label>Contacto Telefónico *</label>
                <input
                  type="tel"
                  value={formData.Denunciante_Contacto || ''}
                  onChange={(e) => handleInputChange('Denunciante_Contacto', e.target.value)}
                  className={validationErrors.Denunciante_Contacto ? 'error' : ''}
                  placeholder="9XXXXXXXXX"
                />
              </div>
              
              <div className="form-group">
                <label>Contacto Alternativo</label>
                <input
                  type="tel"
                  value={formData.Denunciante_Contacto_Alternativo || ''}
                  onChange={(e) => handleInputChange('Denunciante_Contacto_Alternativo', e.target.value)}
                />
              </div>
              
              <div className="form-group full-width">
                <label>Endereço Completo</label>
                <input
                  type="text"
                  value={formData.Denunciante_Endereco || ''}
                  onChange={(e) => handleInputChange('Denunciante_Endereco', e.target.value)}
                  placeholder="Rua, nº, código postal, localidade"
                />
              </div>
              
              <div className="form-group">
                <label>Email</label>
                <input
                  type="email"
                  value={formData.Denunciante_Email || ''}
                  onChange={(e) => handleInputChange('Denunciante_Email', e.target.value)}
                />
              </div>
              
              <div className="form-group">
                <label>Disponibilidade Horária</label>
                <input
                  type="text"
                  value={formData.Denunciante_Disponibilidade || ''}
                  onChange={(e) => handleInputChange('Denunciante_Disponibilidade', e.target.value)}
                  placeholder="ex: 9h-18h, sempre disponível"
                />
              </div>
            </div>
            {renderOfficialFieldsForStep(0)}
          </div>
        );

      case 1: // Identificação
        return (
          <div className="step-content">
            <h3>2. IDENTIFICAÇÃO PESSOAL</h3>
            <div className="form-grid">
              <div className="form-group">
                <label>Nome Completo *</label>
                <input
                  type="text"
                  value={formData.Nome_Completo || ''}
                  onChange={(e) => handleInputChange('Nome_Completo', e.target.value)}
                  className={validationErrors.Nome_Completo ? 'error' : ''}
                  placeholder="Nome completo da pessoa desaparecida"
                />
              </div>
              
              <div className="form-group">
                <label>Idade Exacta *</label>
                <input
                  type="number"
                  value={formData.Idade_Exacta || ''}
                  onChange={(e) => handleInputChange('Idade_Exacta', e.target.value)}
                  className={validationErrors.Idade_Exacta ? 'error' : ''}
                  placeholder="Anos completos"
                  min="0"
                  max="120"
                />
              </div>
              
              <div className="form-group">
                <label>Data de Nascimento *</label>
                <input
                  type="date"
                  value={formData.Data_Nascimento || ''}
                  onChange={(e) => handleInputChange('Data_Nascimento', e.target.value)}
                  className={validationErrors.Data_Nascimento ? 'error' : ''}
                />
              </div>
              
              <div className="form-group">
                <label>Sexo *</label>
                <select
                  value={formData.Sexo || ''}
                  onChange={(e) => handleInputChange('Sexo', e.target.value)}
                  className={validationErrors.Sexo ? 'error' : ''}
                >
                  <option value="">Selecione...</option>
                  <option value="M">Masculino</option>
                  <option value="F">Feminino</option>
                </select>
              </div>
              
              <div className="form-group">
                <label>Nacionalidade</label>
                <input
                  type="text"
                  value={formData.Nacionalidade || ''}
                  onChange={(e) => handleInputChange('Nacionalidade', e.target.value)}
                  placeholder="ex: Portuguesa, Brasileira"
                />
              </div>
              
              <div className="form-group">
                <label>Estado Civil</label>
                <select
                  value={formData.Estado_Civil || ''}
                  onChange={(e) => handleInputChange('Estado_Civil', e.target.value)}
                >
                  <option value="">Selecione...</option>
                  <option value="Solteiro/a">Solteiro/a</option>
                  <option value="Casado/a">Casado/a</option>
                  <option value="Divorciado/a">Divorciado/a</option>
                  <option value="Viúvo/a">Viúvo/a</option>
                  <option value="União de facto">União de facto</option>
                </select>
              </div>
              
              <div className="form-group">
                <label>Possui Filhos</label>
                <select
                  value={formData.Possui_Filhos || ''}
                  onChange={(e) => handleInputChange('Possui_Filhos', e.target.value)}
                >
                  <option value="">Selecione...</option>
                  <option value="Sim">Sim</option>
                  <option value="Não">Não</option>
                  <option value="Desconhecido">Desconhecido</option>
                </select>
              </div>
              
              <div className="form-group">
                <label>Línguas Faladas</label>
                <input
                  type="text"
                  value={formData.Linguas_Faladas || ''}
                  onChange={(e) => handleInputChange('Linguas_Faladas', e.target.value)}
                  placeholder="ex: Português, Inglês, Francês"
                />
              </div>
            </div>
            {renderOfficialFieldsForStep(1)}
          </div>
        );

      case 2: // Circunstâncias
        return (
          <div className="step-content">
            <h3>3. LOCAL E CIRCUNSTÂNCIAS</h3>
            <div className="form-grid">
              <div className="form-group">
                <label>Data do Desaparecimento *</label>
                <input
                  type="date"
                  value={formData.Data_Desaparecimento || ''}
                  onChange={(e) => handleInputChange('Data_Desaparecimento', e.target.value)}
                  className={validationErrors.Data_Desaparecimento ? 'error' : ''}
                />
              </div>
              
              <div className="form-group">
                <label>Hora do Desaparecimento *</label>
                <input
                  type="time"
                  value={formData.Hora_Desaparecimento || ''}
                  onChange={(e) => handleInputChange('Hora_Desaparecimento', e.target.value)}
                  className={validationErrors.Hora_Desaparecimento ? 'error' : ''}
                />
              </div>
              
              <div className="form-group full-width">
                <label>Local do Último Avistamento *</label>
                <input
                  type="text"
                  value={formData.Local_Ultimo_Avistamento || ''}
                  onChange={(e) => handleInputChange('Local_Ultimo_Avistamento', e.target.value)}
                  className={validationErrors.Local_Ultimo_Avistamento ? 'error' : ''}
                  placeholder="Descrição detalhada do local"
                />
              </div>
              <div className="form-group">
                <label>Concelho</label>
                <input
                  type="text"
                  value={formData.Concelho || ''}
                  onChange={(e) => handleInputChange('Concelho', e.target.value)}
                  placeholder="Concelho"
                />
              </div>

              <div className="form-group">
                <label>Freguesia</label>
                <input
                  type="text"
                  value={formData.Freguesia || ''}
                  onChange={(e) => handleInputChange('Freguesia', e.target.value)}
                  placeholder="Freguesia"
                />
              </div>

              <div className="form-group">
                <label>Coordenadas (se disponível)</label>
                <input
                  type="text"
                  value={formData.Morada_Exacta_Coordenadas || ''}
                  onChange={(e) => handleInputChange('Morada_Exacta_Coordenadas', e.target.value)}
                  placeholder="ex: 40.123456, -8.654321"
                />
              </div>

              <div className="form-group">
                <label>Latitude</label>
                <input
                  type="text"
                  value={formData.Latitude || ''}
                  onChange={(e) => handleInputChange('Latitude', e.target.value)}
                  placeholder="Latitude (ex: 40.123456)"
                />
              </div>

              <div className="form-group">
                <label>Longitude</label>
                <input
                  type="text"
                  value={formData.Longitude || ''}
                  onChange={(e) => handleInputChange('Longitude', e.target.value)}
                  placeholder="Longitude (ex: -8.654321)"
                />
              </div>

              {/* Map picker: permite selecionar coordenadas com clique */}
              <div className="form-group full-width">
                <label>Selecionar no Mapa</label>
                <MapPicker
                  lat={formData.Latitude}
                  lon={formData.Longitude}
                  onSelect={async (lat, lon, meta = {}) => {
                    // meta: { manual: true, suggestedZoom: number } or { cleared: true }
                    if (meta.cleared) {
                      // remover coordenadas e metadados relacionados
                      setFormData(prev => {
                        const copy = { ...prev };
                        delete copy.Latitude; delete copy.Longitude; delete copy.Morada_Exacta_Coordenadas;
                        delete copy.Geocode_Level; delete copy.Map_Zoom_Suggestion; delete copy.Freguesia; delete copy.Concelho;
                        return copy;
                      });
                      return;
                    }

                    if (lat == null || lon == null) return;

                    // Atualizar campos de coordenadas e Morada_Exacta_Coordenadas
                    const coordStr = `${Number(lat).toFixed(6)}, ${Number(lon).toFixed(6)}`;
                    const suggestedZoom = (meta && meta.suggestedZoom) ? meta.suggestedZoom : 16;
                    setFormData(prev => ({ ...prev, Latitude: String(lat), Longitude: String(lon), Morada_Exacta_Coordenadas: coordStr, Geocode_Level: 'manual_map', Map_Zoom_Suggestion: suggestedZoom }));

                    // Chamar reverse geocode para obter freguesia/concelho
                    try {
                      const qs = new URLSearchParams({ lat: String(lat), lon: String(lon) });
                      const resp = await fetch('/api/reverse-geocode?' + qs.toString());
                      if (resp.ok) {
                        const payload = await resp.json();
                        if (payload && payload.success && payload.reverse) {
                          const rev = payload.reverse;
                          setFormData(prev => ({ ...prev, Freguesia: rev.freguesia || prev.Freguesia || '', Concelho: rev.concelho || prev.Concelho || '' }));
                        }
                      }
                    } catch (e) {
                      console.debug('Reverse geocode falhou', e.message);
                    }
                  }}
                />
              </div>

              <div className="form-group" style={{display: 'flex', alignItems: 'center', gap: '8px'}}>
                <button type="button" className="btn-secondary" onClick={() => attemptAutoGeocode(formData)}>Geocodificar</button>
                <small style={{color: '#666'}}>Se o geocode automático falhar, introduza coordenadas manualmente.</small>
              </div>

              {/* Mostrar nível do geocode se disponível */}
              {formData.Geocode_Level && (
                <div className="form-group full-width" style={{marginTop: 8}}>
                  <label>Coordenadas obtidas automaticamente — Nível: <strong>{formData.Geocode_Level}</strong></label>
                  <div style={{display: 'flex', gap: 8, alignItems: 'center'}}>
                    <input type="text" readOnly value={formData.Morada_Exacta_Coordenadas || ''} style={{flex: 1}} />
                    <button type="button" className="btn-primary" onClick={() => {
                      // Adotar coordenadas automáticas: parse das coordenadas automáticas e escrever em Latitude/Longitude
                      const parsed = parseCoordsFromString(formData.Morada_Exacta_Coordenadas || `${formData.Latitude || ''}, ${formData.Longitude || ''}`);
                      if (!parsed) {
                        showModal('Coordenadas inválidas', 'Não foram encontradas coordenadas automáticas válidas para adotar.', { confirmText: 'OK' });
                        return;
                      }
                      if (formData.Latitude && formData.Longitude) {
                        showModal('Adotar Coordenadas Automáticas', 'Já existem coordenadas preenchidas. Deseja substituir pelas coordenadas automáticas obtidas?', { confirmText: 'Substituir', cancelText: 'Cancelar' })
                          .then(ok => { if (ok) setFormData(prev => ({ ...prev, Latitude: String(parsed.lat), Longitude: String(parsed.lon) })); })
                          .catch(() => {});
                      } else {
                        setFormData(prev => ({ ...prev, Latitude: String(parsed.lat), Longitude: String(parsed.lon) }));
                      }
                    }}>Adotar coordenadas automáticas</button>
                    <small style={{color: '#666'}}>Sugestão zoom mapa: {formData.Map_Zoom_Suggestion || 'padrão'}</small>
                  </div>
                </div>
              )}

              <div className="form-group">
                <label>Tipo de Local</label>
                <select
                  value={formData.Tipo_Local || ''}
                  onChange={(e) => handleInputChange('Tipo_Local', e.target.value)}
                >
                  <option value="">Selecione...</option>
                  <option value="Residencial">Residencial</option>
                  <option value="Comercial">Comercial</option>
                  <option value="Escola">Escola</option>
                  <option value="Hospital">Hospital</option>
                  <option value="Parque">Parque</option>
                  <option value="Centro comercial">Centro comercial</option>
                  <option value="Transporte público">Transporte público</option>
                  <option value="Via pública">Via pública</option>
                  <option value="Floresta">Floresta</option>
                  <option value="Praia">Praia</option>
                  <option value="Montanha">Montanha</option>
                  <option value="Outro">Outro</option>
                </select>
              </div>
              
              <div className="form-group full-width">
                <label>Endereço do Domicílio Habitual</label>
                <input
                  type="text"
                  value={formData.Endereco_Domicilio_Habitual || ''}
                  onChange={(e) => handleInputChange('Endereco_Domicilio_Habitual', e.target.value)}
                  placeholder="Rua, nº, código postal, localidade"
                />
              </div>
            </div>
            {renderOfficialFieldsForStep(2)}
          </div>
        );

      case 3: // Descrição Física
        return (
          <div className="step-content">
            <h3>4. DESCRIÇÃO FÍSICA</h3>
            <div className="form-grid">
              <div className="form-group">
                <label>Altura (cm)</label>
                <input
                  type="number"
                  value={formData.Altura || ''}
                  onChange={(e) => handleInputChange('Altura', e.target.value)}
                  placeholder="em centímetros"
                  min="50"
                  max="250"
                />
              </div>
              
              <div className="form-group">
                <label>Peso (kg)</label>
                <input
                  type="number"
                  value={formData.Peso || ''}
                  onChange={(e) => handleInputChange('Peso', e.target.value)}
                  placeholder="em quilogramas"
                  min="10"
                  max="300"
                />
              </div>
              
              <div className="form-group">
                <label>Compleição Física</label>
                <select
                  value={formData.Compleicao_Fisica || ''}
                  onChange={(e) => handleInputChange('Compleicao_Fisica', e.target.value)}
                >
                  <option value="">Selecione...</option>
                  <option value="Magra">Magra</option>
                  <option value="Normal">Normal</option>
                  <option value="Robusta">Robusta</option>
                  <option value="Obesa">Obesa</option>
                </select>
              </div>
              
              <div className="form-group">
                <label>Cor dos Cabelos</label>
                <select
                  value={formData.Cor_Cabelos || ''}
                  onChange={(e) => handleInputChange('Cor_Cabelos', e.target.value)}
                >
                  <option value="">Selecione...</option>
                  <option value="Preto">Preto</option>
                  <option value="Castanho escuro">Castanho escuro</option>
                  <option value="Castanho claro">Castanho claro</option>
                  <option value="Louro escuro">Louro escuro</option>
                  <option value="Louro claro">Louro claro</option>
                  <option value="Ruivo">Ruivo</option>
                  <option value="Grisalho">Grisalho</option>
                  <option value="Branco">Branco</option>
                  <option value="Careca">Careca</option>
                  <option value="Pintado">Pintado</option>
                </select>
              </div>
              
              <div className="form-group">
                <label>Comprimento dos Cabelos</label>
                <select
                  value={formData.Comprimento_Cabelos || ''}
                  onChange={(e) => handleInputChange('Comprimento_Cabelos', e.target.value)}
                >
                  <option value="">Selecione...</option>
                  <option value="Careca">Careca</option>
                  <option value="Rapado">Rapado</option>
                  <option value="Curto">Curto</option>
                  <option value="Médio">Médio</option>
                  <option value="Comprido">Comprido</option>
                  <option value="Muito comprido">Muito comprido</option>
                </select>
              </div>
              
              <div className="form-group">
                <label>Cor dos Olhos</label>
                <select
                  value={formData.Cor_Olhos || ''}
                  onChange={(e) => handleInputChange('Cor_Olhos', e.target.value)}
                >
                  <option value="">Selecione...</option>
                  <option value="Pretos">Pretos</option>
                  <option value="Castanhos">Castanhos</option>
                  <option value="Verdes">Verdes</option>
                  <option value="Azuis">Azuis</option>
                  <option value="Cinzentos">Cinzentos</option>
                  <option value="Castanho-esverdeados">Castanho-esverdeados</option>
                </select>
              </div>
              
              <div className="form-group">
                <label>Cor da Pele</label>
                <select
                  value={formData.Cor_Pele || ''}
                  onChange={(e) => handleInputChange('Cor_Pele', e.target.value)}
                >
                  <option value="">Selecione...</option>
                  <option value="Muito clara">Muito clara</option>
                  <option value="Clara">Clara</option>
                  <option value="Morena clara">Morena clara</option>
                  <option value="Morena">Morena</option>
                  <option value="Morena escura">Morena escura</option>
                  <option value="Escura">Escura</option>
                </select>
              </div>
              
              <div className="form-group">
                <label>Barba/Bigode</label>
                <select
                  value={formData.Barba_Bigode || ''}
                  onChange={(e) => handleInputChange('Barba_Bigode', e.target.value)}
                >
                  <option value="">Selecione...</option>
                  <option value="Não tem">Não tem</option>
                  <option value="Bigode">Bigode</option>
                  <option value="Barba">Barba</option>
                  <option value="Barba e bigode">Barba e bigode</option>
                  <option value="Por fazer">Por fazer</option>
                </select>
              </div>
              
              <div className="form-group">
                <label>Tamanho do Calçado</label>
                <input
                  type="number"
                  value={formData.Tamanho_Calcado || ''}
                  onChange={(e) => handleInputChange('Tamanho_Calcado', e.target.value)}
                  placeholder="ex: 42"
                  min="20"
                  max="55"
                />
              </div>
              
              <div className="form-group full-width">
                <label>Elementos Distintivos</label>
                <textarea
                  value={formData.Elementos_Distintivos || ''}
                  onChange={(e) => handleInputChange('Elementos_Distintivos', e.target.value)}
                  rows="3"
                  placeholder="Cicatrizes, tatuagens, piercings, óculos, próteses, etc."
                />
              </div>
            </div>
          </div>
        );

      case 4: // Estado de Saúde
        return (
          <div className="step-content">
            <h3>5. ESTADO DE SAÚDE</h3>
            <div className="form-grid">
              <div className="form-group">
                <label>Estado Mental</label>
                <select
                  value={formData.Estado_Mental || ''}
                  onChange={(e) => handleInputChange('Estado_Mental', e.target.value)}
                >
                  <option value="">Selecione...</option>
                  <option value="Normal">Normal</option>
                  <option value="Depressivo">Depressivo</option>
                  <option value="Ansioso">Ansioso</option>
                  <option value="Confuso">Confuso</option>
                  <option value="Agressivo">Agressivo</option>
                  <option value="Perturbado">Perturbado</option>
                </select>
              </div>
              
              <div className="form-group">
                <label>Condição Física</label>
                <select
                  value={formData.Condicao_Fisica || ''}
                  onChange={(e) => handleInputChange('Condicao_Fisica', e.target.value)}
                >
                  <option value="">Selecione...</option>
                  <option value="Boa">Boa</option>
                  <option value="Regular">Regular</option>
                  <option value="Má">Má</option>
                  <option value="Debilitada">Debilitada</option>
                </select>
              </div>
              
              <div className="form-group">
                <label>Capacidade de Locomoção</label>
                <select
                  value={formData.Capacidade_Locomocao || ''}
                  onChange={(e) => handleInputChange('Capacidade_Locomocao', e.target.value)}
                >
                  <option value="">Selecione...</option>
                  <option value="Normal">Normal</option>
                  <option value="Limitada">Limitada</option>
                  <option value="Cadeira de rodas">Cadeira de rodas</option>
                  <option value="Bengala">Bengala</option>
                  <option value="Andarilho">Andarilho</option>
                  <option value="Acamado">Acamado</option>
                </select>
              </div>
              
              <div className="form-group">
                <label>Possui Incapacidade Cognitiva</label>
                <select
                  value={formData.Possui_Incapacidade_Cognitiva || ''}
                  onChange={(e) => handleInputChange('Possui_Incapacidade_Cognitiva', e.target.value)}
                >
                  <option value="">Selecione...</option>
                  <option value="Não">Não</option>
                  <option value="Sim - Ligeira">Sim - Ligeira</option>
                  <option value="Sim - Moderada">Sim - Moderada</option>
                  <option value="Sim - Grave">Sim - Grave</option>
                  <option value="Desconhecido">Desconhecido</option>
                </select>
              </div>
              
              <div className="form-group full-width">
                <label>Doenças Crónicas</label>
                <textarea
                  value={formData.Doencas_Cronicas || ''}
                  onChange={(e) => handleInputChange('Doencas_Cronicas', e.target.value)}
                  rows="2"
                  placeholder="ex: Diabetes, Hipertensão, Alzheimer, Depressão"
                />
              </div>
              
              <div className="form-group full-width">
                <label>Medicamentos Vitais Necessários</label>
                <textarea
                  value={formData.Medicamentos_Vitais_Necessarios || ''}
                  onChange={(e) => handleInputChange('Medicamentos_Vitais_Necessarios', e.target.value)}
                  rows="2"
                  placeholder="ex: Insulina, Antidepressivos, Anticoagulantes"
                />
              </div>
              
              <div className="form-group">
                <label>Transporta Medicamentos</label>
                <select
                  value={formData.Transporta_Medicamentos || ''}
                  onChange={(e) => handleInputChange('Transporta_Medicamentos', e.target.value)}
                >
                  <option value="">Selecione...</option>
                  <option value="Sim">Sim</option>
                  <option value="Não">Não</option>
                  <option value="Desconhecido">Desconhecido</option>
                </select>
              </div>
              
              <div className="form-group full-width">
                <label>Alergias Conhecidas</label>
                <input
                  type="text"
                  value={formData.Alergias || ''}
                  onChange={(e) => handleInputChange('Alergias', e.target.value)}
                  placeholder="ex: Penicilina, Frutos secos, Latex"
                />
              </div>
            </div>
          </div>
        );

      case 7: // Avaliação de Risco
        return (
          <div className="step-content">
            <h3>8. AVALIAÇÃO DE RISCO</h3>
            <div className="risk-assessment-section">
              <div className="risk-indicator">
                <h4>Nível de Risco Atual: <span className={`risk-${riskAssessment.nivel.toLowerCase()}`}>{riskAssessment.nivel}</span></h4>
                <p>Pontuação: {riskAssessment.pontuacao}</p>
                {riskAssessment.indicadores.length > 0 && (
                  <div className="active-indicators">
                    <strong>Indicadores Ativos:</strong>
                    <ul>
                      {riskAssessment.indicadores.map((indicador, index) => (
                        <li key={index}>{indicador}</li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            </div>
            
            <div className="form-grid">
              <div className="form-group">
                <label>Indícios de Crime</label>
                <select
                  value={formData.Indicios_Crime || ''}
                  onChange={(e) => handleInputChange('Indicios_Crime', e.target.value)}
                >
                  <option value="">Selecione...</option>
                  <option value="Não">Não</option>
                  <option value="Sim">Sim</option>
                  <option value="Suspeita">Suspeita</option>
                </select>
              </div>
              
              <div className="form-group">
                <label>Risco Iminente de Vida</label>
                <select
                  value={formData.Risco_Iminente_Vida || ''}
                  onChange={(e) => handleInputChange('Risco_Iminente_Vida', e.target.value)}
                >
                  <option value="">Selecione...</option>
                  <option value="Não">Não</option>
                  <option value="Sim">Sim</option>
                  <option value="Possível">Possível</option>
                </select>
              </div>
              
              <div className="form-group">
                <label>Verbalizou Intenção Suicida</label>
                <select
                  value={formData.Verbalizou_Intencao_Suicidio || ''}
                  onChange={(e) => handleInputChange('Verbalizou_Intencao_Suicidio', e.target.value)}
                >
                  <option value="">Selecione...</option>
                  <option value="Não">Não</option>
                  <option value="Sim">Sim</option>
                  <option value="Indícios">Indícios</option>
                </select>
              </div>
              
              <div className="form-group">
                <label>Vítima de Violência Doméstica</label>
                <select
                  value={formData.Vitima_Violencia_Domestica || ''}
                  onChange={(e) => handleInputChange('Vitima_Violencia_Domestica', e.target.value)}
                >
                  <option value="">Selecione...</option>
                  <option value="Não">Não</option>
                  <option value="Sim">Sim</option>
                  <option value="Suspeita">Suspeita</option>
                </select>
              </div>
              
              <div className="form-group">
                <label>Abandonou Menores a seu Cargo</label>
                <select
                  value={formData.Abandonou_Menores_Cargo || ''}
                  onChange={(e) => handleInputChange('Abandonou_Menores_Cargo', e.target.value)}
                >
                  <option value="">Selecione...</option>
                  <option value="Não">Não</option>
                  <option value="Sim">Sim</option>
                  <option value="N/A">N/A</option>
                </select>
              </div>
              
              <div className="form-group">
                <label>Fugiu de Centro Educativo</label>
                <select
                  value={formData.Fugiu_Centro_Educativo || ''}
                  onChange={(e) => handleInputChange('Fugiu_Centro_Educativo', e.target.value)}
                >
                  <option value="">Selecione...</option>
                  <option value="Não">Não</option>
                  <option value="Sim">Sim</option>
                  <option value="N/A">N/A</option>
                </select>
              </div>
              
              <div className="form-group full-width">
                <label>Outros Factores de Risco</label>
                <textarea
                  value={formData.Outros_Factores_Risco || ''}
                  onChange={(e) => handleInputChange('Outros_Factores_Risco', e.target.value)}
                  rows="3"
                  placeholder="Descreva outros factores que possam aumentar o risco"
                />
              </div>
            </div>
          </div>
        );

      case 20: // Observações
        return (
          <div className="step-content">
            <h3>21. OBSERVAÇÕES GERAIS</h3>
            <div className="form-grid">
              <div className="form-group full-width">
                <label>Informações Complementares</label>
                <textarea
                  value={formData.Observacoes_Adicionais || ''}
                  onChange={(e) => handleInputChange('Observacoes_Adicionais', e.target.value)}
                  rows="6"
                  placeholder="Todas as informações relevantes que não foram incluídas nas secções anteriores..."
                />
              </div>
              
              <div className="form-group full-width">
                <label>Circunstâncias Especiais</label>
                <textarea
                  value={formData.Circunstancias_Especiais || ''}
                  onChange={(e) => handleInputChange('Circunstancias_Especiais', e.target.value)}
                  rows="4"
                  placeholder="Situações particulares, contexto familiar, social, etc."
                />
              </div>
            </div>
          </div>
        );

      case 21: // Dados
        return (
          <div className="step-content">
            <h3>22. DADOS FORÇAS DE SEGURANÇA</h3>
            <div className="form-grid">
              <div className="form-group">
                <label>Nome do Elemento *</label>
                <input
                  type="text"
                  value={formData.GNR_Nome_Elemento || ''}
                  onChange={(e) => handleInputChange('GNR_Nome_Elemento', e.target.value)}
                  className={validationErrors.GNR_Nome_Elemento ? 'error' : ''}
                  placeholder="Nome completo do responsável"
                />
              </div>
              
              <div className="form-group">
                <label>Posto *</label>
                <select
                  value={formData.GNR_Posto_Elemento || ''}
                  onChange={(e) => handleInputChange('GNR_Posto_Elemento', e.target.value)}
                  className={validationErrors.GNR_Posto_Elemento ? 'error' : ''}
                >
                  <option value="">Selecione...</option>
                  <option value="Guarda">Guarda</option>
                  <option value="Cabo">Cabo</option>
                  <option value="Cabo-Adjunto">Cabo-Adjunto</option>
                  <option value="Cabo-Chefe">Cabo-Chefe</option>
                  <option value="Sargento">Sargento</option>
                  <option value="Sargento-Adjunto">Sargento-Adjunto</option>
                  <option value="Sargento-Chefe">Sargento-Chefe</option>
                  <option value="Sargento-Mor">Sargento-Mor</option>
                  <option value="Alferes">Alferes</option>
                  <option value="Tenente">Tenente</option>
                  <option value="Capitão">Capitão</option>
                  <option value="Major">Major</option>
                  <option value="Tenente-Coronel">Tenente-Coronel</option>
                  <option value="Coronel">Coronel</option>
                </select>
              </div>
              
              <div className="form-group">
                <label>Unidade/Destacamento *</label>
                <input
                  type="text"
                  value={formData.GNR_Unidade_Elemento || ''}
                  onChange={(e) => handleInputChange('GNR_Unidade_Elemento', e.target.value)}
                  className={validationErrors.GNR_Unidade_Elemento ? 'error' : ''}
                  placeholder="ex: Destacamento de Coimbra"
                />
              </div>
              
              <div className="form-group">
                <label>NIM</label>
                <input
                  type="text"
                  value={formData.GNR_NIM_Elemento || ''}
                  onChange={(e) => handleInputChange('GNR_NIM_Elemento', e.target.value)}
                  placeholder="Número de Identificação Militar"
                />
              </div>
              
              <div className="form-group">
                <label>Contacto Direto</label>
                <input
                  type="tel"
                  value={formData.GNR_Contacto_Elemento || ''}
                  onChange={(e) => handleInputChange('GNR_Contacto_Elemento', e.target.value)}
                  placeholder="Telefone do militar responsável"
                />
              </div>
              
              <div className="form-group">
                <label>Email Institucional</label>
                <input
                  type="email"
                  value={formData.GNR_Email_Elemento || ''}
                  onChange={(e) => handleInputChange('GNR_Email_Elemento', e.target.value)}
                  placeholder="email@email.pt"
                />
              </div>
            </div>
          </div>
        );

      case 15: // Menores
        // Mostrar ou bloquear a secção Menores dependendo da idade
        if (formData.Idade_Exacta && Number(formData.Idade_Exacta) >= 18) {
          return (
            <div className="step-content">
              <h3>16. MENORES - Não se aplica</h3>
              <p>Esta secção aplica-se apenas a menores de 18 anos.</p>
            </div>
          );
        }
        return (
          <div className="step-content">
            <h3>16. MENORES - Circunstâncias Específicas</h3>
            <div className="form-grid">
              <div className="form-group">
                <label>Guarda Legal</label>
                <input type="text" value={formData.Guarda_Legal || ''} onChange={e => handleInputChange('Guarda_Legal', e.target.value)} />
              </div>
              <div className="form-group">
                <label>Responsável Escolar</label>
                <input type="text" value={formData.Responsavel_Escolar || ''} onChange={e => handleInputChange('Responsavel_Escolar', e.target.value)} />
              </div>
              <div className="form-group">
                <label>Histórico de Fugas</label>
                <select value={formData.Historico_Fugas || ''} onChange={e => handleInputChange('Historico_Fugas', e.target.value)}>
                  <option value="">Selecione</option>
                  <option value="Sim">Sim</option>
                  <option value="Não">Não</option>
                </select>
              </div>
              <div className="form-group">
                <label>Ambiente Familiar</label>
                <input type="text" value={formData.Ambiente_Familiar || ''} onChange={e => handleInputChange('Ambiente_Familiar', e.target.value)} />
              </div>
              <div className="form-group">
                <label>Referência a Maus Tratos</label>
                <select value={formData.Maus_Tratos || ''} onChange={e => handleInputChange('Maus_Tratos', e.target.value)}>
                  <option value="">Selecione</option>
                  <option value="Sim">Sim</option>
                  <option value="Não">Não</option>
                </select>
              </div>
              <div className="form-group">
                <label>Referência a Abuso Sexual</label>
                <select value={formData.Abuso_Sexual || ''} onChange={e => handleInputChange('Abuso_Sexual', e.target.value)}>
                  <option value="">Selecione</option>
                  <option value="Sim">Sim</option>
                  <option value="Não">Não</option>
                </select>
              </div>
            </div>
          </div>
        );
      case 16: // Maiores
        // Mostrar ou bloquear a secção Maiores dependendo da idade
        if (formData.Idade_Exacta && Number(formData.Idade_Exacta) < 18) {
          return (
            <div className="step-content">
              <h3>17. MAIORES - Não se aplica</h3>
              <p>Esta secção aplica-se apenas a maiores de 18 anos.</p>
            </div>
          );
        }
        return (
          <div className="step-content">
            <h3>17. MAIORES - Circunstâncias Específicas</h3>
            <div className="form-grid">
              <div className="form-group">
                <label>Residência Habitual</label>
                <input type="text" value={formData.Residencia_Habitual || ''} onChange={e => handleInputChange('Residencia_Habitual', e.target.value)} />
              </div>
              <div className="form-group">
                <label>Rede de Apoio</label>
                <input type="text" value={formData.Rede_Apoio || ''} onChange={e => handleInputChange('Rede_Apoio', e.target.value)} />
              </div>
              <div className="form-group">
                <label>Autonomia</label>
                <select value={formData.Autonomia || ''} onChange={e => handleInputChange('Autonomia', e.target.value)}>
                  <option value="">Selecione</option>
                  <option value="Total">Total</option>
                  <option value="Parcial">Parcial</option>
                  <option value="Nula">Nula</option>
                </select>
              </div>
              <div className="form-group">
                <label>Referência a Maus Tratos</label>
                <select value={formData.Maus_Tratos_Maior || ''} onChange={e => handleInputChange('Maus_Tratos_Maior', e.target.value)}>
                  <option value="">Selecione</option>
                  <option value="Sim">Sim</option>
                  <option value="Não">Não</option>
                </select>
              </div>
              <div className="form-group">
                <label>Referência a Abuso Financeiro</label>
                <select value={formData.Abuso_Financeiro || ''} onChange={e => handleInputChange('Abuso_Financeiro', e.target.value)}>
                  <option value="">Selecione</option>
                  <option value="Sim">Sim</option>
                  <option value="Não">Não</option>
                </select>
              </div>
            </div>
          </div>
        );
      case 17: // Diligências
        return (
          <div className="step-content">
            <h3>18. DILIGÊNCIAS - Ações já realizadas</h3>
            <div className="form-grid">
              <div className="form-group full-width">
                <input
                  type="number"
                  min="1"
                  step="1"
                  value={formData.GNR_NIM_Elemento || ''}
                  onChange={(e) => {
                    // Only allow positive integers or empty
                    const v = e.target.value;
                    if (v === '') return handleInputChange('GNR_NIM_Elemento', '');
                    const iv = parseInt(v);
                    if (!isNaN(iv) && iv > 0) handleInputChange('GNR_NIM_Elemento', String(iv));
                  }}
                  placeholder="Número de Identificação Militar"
                />
              </div>
              <div className="form-group full-width">
                <label>Outras Ações</label>
                <textarea value={formData.Outras_Acoes || ''} onChange={e => handleInputChange('Outras_Acoes', e.target.value)} rows={2} />
              </div>
            </div>
          </div>
        );
      case 18: // Classificação
        return (
          <div className="step-content">
            <h3>19. CLASSIFICAÇÃO - Tipo de Desaparecimento</h3>
            <div className="form-grid">
              <div className="form-group">
                <label>Tipo de Desaparecimento</label>
                <select value={formData.Tipo_Desaparecimento_Oficial || ''} onChange={e => handleInputChange('Tipo_Desaparecimento_Oficial', e.target.value)}>
                  <option value="">Selecione</option>
                  <option value="Voluntário">Voluntário</option>
                  <option value="Involuntário">Involuntário</option>
                  <option value="Forçado">Forçado</option>
                  <option value="Desconhecido">Desconhecido</option>
                </select>
              </div>
              <div className="form-group">
                <label>Classificação Específica</label>
                <input type="text" value={formData.Classificacao_Especifica || ''} onChange={e => handleInputChange('Classificacao_Especifica', e.target.value)} />
              </div>
              <div className="form-group">
                <label>Motivo Provável</label>
                <input type="text" value={formData.Motivo_Provavel_Oficial || ''} onChange={e => handleInputChange('Motivo_Provavel_Oficial', e.target.value)} />
              </div>
            </div>
          </div>
        );
      case 19: // Contacto Futuro
        return (
          <div className="step-content">
            <h3>20. CONTACTO FUTURO - Ponto de contacto para comunicações</h3>
            <div className="form-grid">
              <div className="form-group">
                <label>Nome do Contacto Futuro</label>
                <input type="text" value={formData.Nome_Contacto_Futuro || ''} onChange={e => handleInputChange('Nome_Contacto_Futuro', e.target.value)} />
              </div>
              <div className="form-group">
                <label>Telefone</label>
                <input type="text" value={formData.Telefone_Contacto_Futuro || ''} onChange={e => handleInputChange('Telefone_Contacto_Futuro', e.target.value)} />
              </div>
              <div className="form-group">
                <label>Email</label>
                <input type="email" value={formData.Email_Contacto_Futuro || ''} onChange={e => handleInputChange('Email_Contacto_Futuro', e.target.value)} />
              </div>
              <div className="form-group full-width">
                <label>Observações</label>
                <textarea value={formData.Observacoes_Contacto_Futuro || ''} onChange={e => handleInputChange('Observacoes_Contacto_Futuro', e.target.value)} rows={2} />
              </div>
            </div>
          </div>
        );
      default:
        return (
          <div className="step-content">
            <h3>Etapa em Desenvolvimento</h3>
            <p>Esta etapa está a ser implementada conforme o manual PDGNR M 1-04-02.</p>
            <div className="form-grid">
              <div className="form-group full-width">
                <label>Observações Temporárias</label>
                <textarea
                  value={formData[`temp_step_${currentStep}`] || ''}
                  onChange={(e) => handleInputChange(`temp_step_${currentStep}`, e.target.value)}
                  rows="4"
                  placeholder="Informações relevantes para esta secção..."
                />
              </div>
            </div>
          </div>
        );
    }
  };

  return (
    <div className="case-registration-official">
      {/* Header */}
      <div className="header-section">
        <div className="gnr-logo">
          <h1>SISTEMA SARIA</h1>
          <h2>Sistema de Registo de Pessoas Desaparecidas</h2>
          <p className="manual-ref">Conforme Manual</p>
        </div>
      </div>

      {/* Progress */}
      <div className="progress-section">
        <div className="step-indicator">
          <div className="step-info">
            <span className="step-number">{currentStep + 1}/{steps.length}</span>
            <span className="step-title">{steps[currentStep].title}</span>
          </div>
          <div className="progress-bar">
            <div 
              className="progress-fill" 
              style={{width: `${((currentStep + 1) / steps.length) * 100}%`}}
            ></div>
          </div>
          <span className="progress-percentage">{Math.round(((currentStep + 1) / steps.length) * 100)}%</span>
        </div>
      </div>

      {/* Current Step */}
      <div className="main-content">
        <div className="step-header">
          <span className="step-icon">{steps[currentStep].icon}</span>
          <div className="step-description">
            <h2>{steps[currentStep].title}</h2>
            <p>{steps[currentStep].subtitle}</p>
          </div>
        </div>

        {renderCurrentStep()}

        {/* Se o utilizador desejar, mostrar todos os campos canónicos do CSV (exceto os calculados) */}
        <div style={{ marginTop: 18, borderTop: '1px dashed #ddd', paddingTop: 12 }}>
          <button type="button" className="btn-secondary" onClick={() => setShowOfficialFields(s => !s)}>
            {showOfficialFields ? 'Esconder Campos Oficiais' : 'Mostrar Campos Oficiais (todos)'}
          </button>

          {showOfficialFields && (
            <div style={{ marginTop: 12 }}>
              <p style={{ fontSize: 13, color: '#444' }}>A lista abaixo contém os campos CANÓNICOS do CSV oficial. Campos calculados/obtidos automaticamente foram omitidos.</p>
              <div style={{ marginTop: 8 }}>
                {Object.keys(groupedOfficialFields || {}).length === 0 ? (
                  <div>Nenhum header oficial disponível.</div>
                ) : (
                  Object.entries(groupedOfficialFields).map(([section, fields]) => {
                    // Filtrar campos calculados/obtidos
                    const visibleFields = fields.filter(h => ![
                      'Latitude','Longitude','Meteorologia_Descricao','Temperatura_C','Humidade_percent','Precipitacao_mm','Vento_kmh',
                      'Risco_Calculado','Indicadores_Risco_Activos','ID_Caso','Data_Registo','Hora_Registo','Data_Preenchimento'
                    ].includes(h));

                    if (visibleFields.length === 0) return null;

                    const collapsed = collapsedOfficialSections[section] === true;

                    return (
                      <div key={section} style={{ border: '1px solid #eee', marginBottom: 8, borderRadius: 6, padding: 8 }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                          <strong>{section} ({visibleFields.length})</strong>
                          <div>
                            <button type="button" className="btn-secondary" onClick={() => setCollapsedOfficialSections(prev => ({ ...prev, [section]: !prev[section] }))}>
                              {collapsed ? 'Expandir' : 'Colapsar'}
                            </button>
                          </div>
                        </div>
                        {!collapsed && (
                          <div className="form-grid" style={{ marginTop: 8 }}>
                            {visibleFields.map(h => {
                              const val = formData[h] || '';
                              const isTextarea = /Observacoes|Descricao|Detalhes|Caracteristicas|Outros|Motivo|Antecedentes|Objectos|Observacoes_Contacto_Futuro/i.test(h) || String(val).length > 120;
                              return (
                                <div key={h} className={isTextarea ? 'form-group full-width' : 'form-group'}>
                                  <label style={{ fontSize: 12 }}>{h}</label>
                                  {isTextarea ? (
                                    <textarea rows={3} value={val} onChange={(e) => handleInputChange(h, e.target.value)} />
                                  ) : (
                                    <input type="text" value={val} onChange={(e) => handleInputChange(h, e.target.value)} />
                                  )}
                                </div>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Navigation */}
      <div className="navigation-section">
        <button 
          className="btn-secondary"
          onClick={prevStep}
          disabled={currentStep === 0}
        >
          ← Anterior
        </button>

        <div className="step-dots">
          {steps.map((step, index) => (
            <div
              key={index}
              className={`step-dot ${index === currentStep ? 'active' : ''} ${index < currentStep ? 'completed' : ''}`}
              onClick={() => setCurrentStep(index)}
            ></div>
          ))}
        </div>

        {currentStep < steps.length - 1 ? (
          <button 
            className="btn-primary"
            onClick={nextStep}
          >
            Seguinte →
          </button>
        ) : (
          <button 
            className="btn-success"
            onClick={submitForm}
            disabled={processing}
          >
            {processing ? 'A Registar...' : 'Registar Caso'}
          </button>
        )}
      </div>

      {/* Modal mount point */}
      <SimpleModal
        open={modalState.open}
        title={modalState.title}
        message={modalState.message}
        confirmText={modalState.options && modalState.options.confirmText}
        cancelText={modalState.options && modalState.options.cancelText}
        onClose={(res) => {
          try {
            if (modalState.resolve) modalState.resolve(res);
          } finally {
            setModalState({ open: false, title: '', message: '', resolve: null, options: {} });
          }
        }}
      />
    </div>
  );
}

export default CaseRegistrationOfficial;