import React, { useState } from 'react';
import { showModal } from './modalHelper';
import { apiFetch } from './api';

// Small helper component: calls backend /api/geocode?q=... and returns lat/lon via onResult(lat, lon)
function GeocodeButton({ local, concelho, freguesia, onResult }) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const handleClick = async () => {
    if (!local || local.trim() === '') return;
    setLoading(true);
    setError(null);
    try {
      const qs = new URLSearchParams();
      qs.set('q', local);
      if (concelho) qs.set('concelho', concelho);
      if (freguesia) qs.set('freguesia', freguesia);
      const res = await fetch(`/api/geocode?${qs.toString()}`);
      if (!res.ok) {
        const text = await res.text();
        throw new Error(text || `Geocode falhou: ${res.status}`);
      }
      const data = await res.json();
      if (data && data.lat && data.lon) {
        onResult(data.lat, data.lon);
      } else {
        throw new Error('Resposta inválida do geocode');
      }
    } catch (err) {
      console.error('Geocode error', err);
      setError(err.message || 'Erro ao geocodificar');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{display: 'flex', flexDirection: 'column', alignItems: 'flex-end'}}>
      <button
        type="button"
        onClick={handleClick}
        disabled={loading || !local || local.trim() === ''}
        className="btn-secondary"
        title="Geocodificar Local"
      >
        {loading ? 'A geocodificar...' : 'Geocodificar'}
      </button>
      {error ? <small style={{color: 'red'}}>{error}</small> : null}
    </div>
  );
}

function CaseRegistration({ onCaseRegistered }) {
  const [currentSection, setCurrentSection] = useState(0);
  const [formData, setFormData] = useState({});
  const [processing, setProcessing] = useState(false);
  const [riskLevel, setRiskLevel] = useState('Normal');

  const sections = [
    'Denunciante', 'Identificação', 'Local & Circunstâncias', 
    'Descrição Física', 'Estado Saúde', 'Avaliação Risco', 
    'Dados Complementares'
  ];

  // Debounce helper
  const debounce = (fn, wait) => {
    let t = null;
    return (...args) => {
      if (t) clearTimeout(t);
      t = setTimeout(() => fn(...args), wait);
    };
  };

  const handleInputChange = (field, value) => {
    const newFormData = { ...formData, [field]: value };
    setFormData(newFormData);
    // Calcular risco automaticamente
    calculateRisk(newFormData);

    // Se o utilizador atualizou local/freguesia/concelho, disparar geocode automático após 900ms
    if (['Local_Ultimo_Avistamento', 'Freguesia', 'Concelho'].includes(field)) {
      debouncedAttemptAutoGeocode(newFormData);
    }
  };

  // Função que tenta geocodificar se tivermos pelo menos Local + (Freguesia ou Concelho)
  const attemptAutoGeocode = async (data) => {
    try {
      const local = (data.Local_Ultimo_Avistamento || '').trim();
      const freguesia = (data.Freguesia || '').trim();
      const concelho = (data.Concelho || '').trim();
      if (!local) return;
      // Só geocodificar se latitude/longitude não estiverem já preenchidos
      if (data.Latitude && data.Longitude) return;
      const qs = new URLSearchParams();
      qs.set('q', local);
      if (concelho) qs.set('concelho', concelho);
      if (freguesia) qs.set('freguesia', freguesia);
      const res = await fetch('/api/geocode?' + qs.toString());
      if (!res.ok) return;
      const payload = await res.json();
      // Backend /api/geocode retorna { success: true, geocode: { lat, lon } }
      const geo = payload && (payload.geocode || payload);
      if (geo && (geo.lat || geo.lon)) {
        handleInputChange('Latitude', String(geo.lat));
        handleInputChange('Longitude', String(geo.lon));
      }
    } catch (e) {
      // Fail silently - geocoding é enriquecimento não bloqueante
      console.debug('Auto-geocode falhou', e.message);
    }
  };

  const debouncedAttemptAutoGeocode = debounce(attemptAutoGeocode, 900);

  const calculateRisk = (data) => {
    let riskScore = 0;
    
    // ========== INDICADORES CRÍTICOS DE SUICÍDIO (PRIORIDADE MÁXIMA) ==========
    const motivacao = data.Motivacao_Provavel?.toLowerCase() || '';
    const observacoes = data.Observacoes?.toLowerCase() || '';
    const estadoMental = data.Estado_Mental?.toLowerCase() || '';
    
    // Detectar casos de suicídio com múltiplos indicadores
    const indicadoresSuicidio = [
      motivacao.includes('suicid'),
      motivacao.includes('suici'),
      observacoes.includes('suicid'),
      observacoes.includes('despedida'),
      observacoes.includes('mensagem'),
      observacoes.includes('carta'),
      observacoes.includes('acabar com tudo'),
      observacoes.includes('não aguenta mais'),
      estadoMental.includes('depress') && (motivacao.includes('suicid') || observacoes.includes('despedida'))
    ];
    
    const isCasoSuicidio = indicadoresSuicidio.some(indicador => indicador);
    
    // Se for caso de suicídio, classificação automática como ELEVADO
    if (isCasoSuicidio) {
      setRiskLevel('Elevado');
      return; // Sair imediatamente, sem calcular outros fatores
    }
    
    // ========== AVALIAÇÃO PADRÃO PARA OUTROS CASOS ==========
    
    // Idade
    if (data.Idade && (parseInt(data.Idade) < 18 || parseInt(data.Idade) > 65)) {
      riskScore += 2;
    }
    
    // Estado Mental
    if (data.Estado_Mental && data.Estado_Mental !== 'Normal') {
      riskScore += 1;
    }
    
    // Capacidade Locomoção
    if (data.Capacidade_Locomocao === 'Limitada') riskScore += 1;
    if (data.Capacidade_Locomocao === 'Muito limitada') riskScore += 2;
    
    // Medicamentos
    if (data.Medicamentos_Vitais && data.Medicamentos_Vitais !== 'Nenhum' && data.Transporta_Medicacao === 'Não') {
      riskScore += 2;
    }
    
    // Tipo Desaparecimento
    if (data.Tipo_Desaparecimento === 'Forçado') riskScore += 3;
    
    // Estados mentais graves (adicional)
    if (estadoMental.includes('psicot') || estadoMental.includes('bipolar') || 
        estadoMental.includes('esquizofrenia') || estadoMental.includes('demencia')) {
      riskScore += 2;
    }
    
    // Determinar nível para casos não-suicidas
    let level = 'Normal';
    if (riskScore >= 4) level = 'Elevado';
    else if (riskScore >= 2) level = 'Moderado';
    
    setRiskLevel(level);
  };

  const validateCurrentSection = () => {
    const requiredFields = {
      0: ['Denunciante_Nome', 'Denunciante_Relacao', 'Denunciante_Contacto'],
      1: ['Nome', 'Idade', 'Sexo'],
      2: ['Data_Desaparecimento', 'Hora_Desaparecimento', 'Local_Ultimo_Avistamento']
    };

    const required = requiredFields[currentSection] || [];
    return required.every(field => formData[field] && formData[field].trim() !== '');
  };

  const nextSection = async () => {
    if (validateCurrentSection() && currentSection < sections.length - 1) {
      setCurrentSection(currentSection + 1);
    } else if (!validateCurrentSection()) {
      await showModal('Validação', 'Por favor, preencha todos os campos obrigatórios.', { confirmText: 'OK' });
    }
  };

  const prevSection = () => {
    if (currentSection > 0) {
      setCurrentSection(currentSection - 1);
    }
  };

  const submitCase = async () => {
    if (!validateCurrentSection()) {
      await showModal('Validação', 'Por favor, preencha todos os campos obrigatórios antes de submeter.', { confirmText: 'OK' });
      return;
    }

    setProcessing(true);
    
    try {
      const result = await apiFetch('/api/casos', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData)
      });
      
      if (result.success) {
        await showModal('Sucesso', `Caso registado com sucesso! ID: ${result.caso.id}`, { confirmText: 'OK' });
        setFormData({});
        setCurrentSection(0);
        if (onCaseRegistered) {
          onCaseRegistered(result.caso);
        }
      } else {
        throw new Error(result.error);
      }
    } catch (error) {
      console.error('Erro ao registar caso:', error);
      await showModal('Erro', `Erro: ${error.message}`, { confirmText: 'OK' });
    } finally {
      setProcessing(false);
    }
  };

  const renderSection = () => {
    switch (currentSection) {
      case 0: // Denunciante
        return (
          <div className="form-section">
            <h3>Dados do Denunciante</h3>
            <div className="form-group">
              <label>Nome Completo *</label>
              <input 
                type="text"
                value={formData.Denunciante_Nome || ''}
                onChange={(e) => handleInputChange('Denunciante_Nome', e.target.value)}
                required
              />
            </div>
            <div className="form-group">
              <label>Relação com a Pessoa Desaparecida *</label>
              <select 
                value={formData.Denunciante_Relacao || ''}
                onChange={(e) => handleInputChange('Denunciante_Relacao', e.target.value)}
                required
              >
                <option value="">Selecione...</option>
                <option value="Cônjuge">Cônjuge</option>
                <option value="Filho/a">Filho/a</option>
                <option value="Pai/Mãe">Pai/Mãe</option>
                <option value="Irmão/Irmã">Irmão/Irmã</option>
                <option value="Familiar">Outro Familiar</option>
                <option value="Amigo/a">Amigo/a</option>
                <option value="Vizinho/a">Vizinho/a</option>
                <option value="Outro">Outro</option>
              </select>
            </div>
            <div className="form-group">
              <label>Contacto Telefónico *</label>
              <input 
                type="tel"
                value={formData.Denunciante_Contacto || ''}
                onChange={(e) => handleInputChange('Denunciante_Contacto', e.target.value)}
                required
              />
            </div>
          </div>
        );

      case 1: // Identificação
        return (
          <div className="form-section">
            <h3>Identificação da Pessoa Desaparecida</h3>
            <div className="form-group">
              <label>Nome Completo *</label>
              <input 
                type="text"
                value={formData.Nome || ''}
                onChange={(e) => handleInputChange('Nome', e.target.value)}
                required
              />
            </div>
            <div className="form-row">
              <div className="form-group">
                <label>Idade *</label>
                <input 
                  type="number"
                  value={formData.Idade || ''}
                  onChange={(e) => handleInputChange('Idade', e.target.value)}
                  min="0" max="120"
                  required
                />
              </div>
              <div className="form-group">
                <label>Sexo *</label>
                <select 
                  value={formData.Sexo || ''}
                  onChange={(e) => handleInputChange('Sexo', e.target.value)}
                  required
                >
                  <option value="">Selecione...</option>
                  <option value="M">Masculino</option>
                  <option value="F">Feminino</option>
                </select>
              </div>
            </div>
          </div>
        );

      case 2: // Local & Circunstâncias
        return (
          <div className="form-section">
            <h3>Local e Circunstâncias do Desaparecimento</h3>
            <div className="form-row">
              <div className="form-group">
                <label>Data do Desaparecimento *</label>
                <input 
                  type="date"
                  value={formData.Data_Desaparecimento || ''}
                  onChange={(e) => handleInputChange('Data_Desaparecimento', e.target.value)}
                  required
                />
              </div>
              <div className="form-group">
                <label>Hora do Desaparecimento *</label>
                <input 
                  type="time"
                  value={formData.Hora_Desaparecimento || ''}
                  onChange={(e) => handleInputChange('Hora_Desaparecimento', e.target.value)}
                  required
                />
              </div>
            </div>
            <div className="form-group">
              <label>Local do Último Avistamento *</label>
              <div style={{display: 'flex', gap: '8px', alignItems: 'center'}}>
                <input 
                  type="text"
                  value={formData.Local_Ultimo_Avistamento || ''}
                  onChange={(e) => handleInputChange('Local_Ultimo_Avistamento', e.target.value)}
                  required
                  style={{flex: 1}}
                />
                <GeocodeButton
                  local={formData.Local_Ultimo_Avistamento}
                  concelho={formData.Concelho}
                  freguesia={formData.Freguesia}
                  onResult={(lat, lon) => { handleInputChange('Latitude', lat); handleInputChange('Longitude', lon); }}
                />
              </div>

              {/* Mostrar coordenadas visíveis ao utilizador antes de submeter */}
              <div style={{display: 'flex', gap: 8, marginTop: 8}}>
                <div style={{display: 'flex', flexDirection: 'column'}}>
                  <label style={{fontSize: 12}}>Latitude (DD)</label>
                  <input
                    type="text"
                    value={formData.Latitude || ''}
                    onChange={(e) => handleInputChange('Latitude', e.target.value)}
                    placeholder="38.700000"
                    style={{width: 160}}
                  />
                </div>
                <div style={{display: 'flex', flexDirection: 'column'}}>
                  <label style={{fontSize: 12}}>Longitude (DD)</label>
                  <input
                    type="text"
                    value={formData.Longitude || ''}
                    onChange={(e) => handleInputChange('Longitude', e.target.value)}
                    placeholder="-9.150000"
                    style={{width: 160}}
                  />
                </div>
                <div style={{alignSelf: 'flex-end', marginLeft: 8}}>
                  <small style={{color: '#666'}}>Coordenadas obtidas com o botão Geocodificar</small>
                </div>
              </div>
            </div>
            <div className="form-row">
              <div className="form-group">
                <label>Concelho</label>
                <input 
                  type="text"
                  value={formData.Concelho || ''}
                  onChange={(e) => handleInputChange('Concelho', e.target.value)}
                />
              </div>
              <div className="form-group">
                <label>Freguesia</label>
                <input 
                  type="text"
                  value={formData.Freguesia || ''}
                  onChange={(e) => handleInputChange('Freguesia', e.target.value)}
                />
              </div>
            </div>
          </div>
        );

      case 3: // Descrição Física
        return (
          <div className="form-section">
            <h3>👤 Características Físicas</h3>
            <div className="form-row">
              <div className="form-group">
                <label>Altura (cm)</label>
                <input 
                  type="number"
                  value={formData.Altura_cm || ''}
                  onChange={(e) => handleInputChange('Altura_cm', e.target.value)}
                />
              </div>
              <div className="form-group">
                <label>Peso (kg)</label>
                <input 
                  type="number"
                  value={formData.Peso_kg || ''}
                  onChange={(e) => handleInputChange('Peso_kg', e.target.value)}
                />
              </div>
            </div>
            <div className="form-group">
              <label>Vestuário no Momento do Desaparecimento</label>
              <textarea 
                value={formData.Vestuario || ''}
                onChange={(e) => handleInputChange('Vestuario', e.target.value)}
                rows="3"
              />
            </div>
          </div>
        );

      case 4: // Estado Saúde
        return (
          <div className="form-section">
            <h3>⚕️ Estado de Saúde</h3>
            <div className="form-row">
              <div className="form-group">
                <label>Estado Mental</label>
                <select 
                  value={formData.Estado_Mental || 'Normal'}
                  onChange={(e) => handleInputChange('Estado_Mental', e.target.value)}
                >
                  <option value="Normal">Normal</option>
                  <option value="Alterado">Alterado</option>
                  <option value="Confuso">Confuso</option>
                  <option value="Ansioso/Depressivo">Ansioso/Depressivo</option>
                </select>
              </div>
              <div className="form-group">
                <label>Capacidade de Locomoção</label>
                <select 
                  value={formData.Capacidade_Locomocao || 'Normal'}
                  onChange={(e) => handleInputChange('Capacidade_Locomocao', e.target.value)}
                >
                  <option value="Normal">Normal</option>
                  <option value="Limitada">Limitada</option>
                  <option value="Muito limitada">Muito limitada</option>
                </select>
              </div>
            </div>
            <div className="form-group">
              <label>Doenças Crónicas</label>
              <input 
                type="text"
                value={formData.Doencas_Cronicas || ''}
                onChange={(e) => handleInputChange('Doencas_Cronicas', e.target.value)}
                placeholder="Diabetes, hipertensão, etc."
              />
            </div>
            <div className="form-group">
              <label>Medicamentos Vitais</label>
              <input 
                type="text"
                value={formData.Medicamentos_Vitais || ''}
                onChange={(e) => handleInputChange('Medicamentos_Vitais', e.target.value)}
                placeholder="Nomes dos medicamentos essenciais"
              />
            </div>
            <div className="form-group">
              <label>Transporta Medicação?</label>
              <select 
                value={formData.Transporta_Medicacao || 'N/D'}
                onChange={(e) => handleInputChange('Transporta_Medicacao', e.target.value)}
              >
                <option value="N/D">Não se sabe</option>
                <option value="Sim">Sim</option>
                <option value="Não">Não</option>
              </select>
            </div>
          </div>
        );

      case 5: // Avaliação Risco
        return (
          <div className="form-section">
            <h3>Avaliação de Risco</h3>
            <div className="form-group">
              <label>Tipo de Desaparecimento</label>
              <select 
                value={formData.Tipo_Desaparecimento || 'Involuntário'}
                onChange={(e) => handleInputChange('Tipo_Desaparecimento', e.target.value)}
              >
                <option value="Involuntário">Involuntário</option>
                <option value="Voluntário">Voluntário</option>
                <option value="Forçado">Forçado</option>
              </select>
            </div>
            <div className="risk-display">
              <h4>Nível de Risco Calculado: <span style={{color: riskLevel === 'Elevado' ? 'red' : riskLevel === 'Moderado' ? 'orange' : 'green'}}>{riskLevel}</span></h4>
              <p>Baseado nos dados inseridos</p>
            </div>
          </div>
        );

      case 6: // Dados Complementares
        return (
          <div className="form-section">
            <h3>Dados Complementares</h3>
            <div className="form-row">
              <div className="form-group">
                <label>Levou Telemóvel?</label>
                <select 
                  value={formData.Levou_Telemovel || 'N/D'}
                  onChange={(e) => handleInputChange('Levou_Telemovel', e.target.value)}
                >
                  <option value="N/D">Não se sabe</option>
                  <option value="Sim">Sim</option>
                  <option value="Não">Não</option>
                </select>
              </div>
              <div className="form-group">
                <label>Levou Documentos?</label>
                <select 
                  value={formData.Levou_Documentos || 'N/D'}
                  onChange={(e) => handleInputChange('Levou_Documentos', e.target.value)}
                >
                  <option value="N/D">Não se sabe</option>
                  <option value="Sim">Sim</option>
                  <option value="Não">Não</option>
                </select>
              </div>
            </div>
            <div className="form-group">
              <label>Motivação Provável</label>
              <input 
                type="text"
                value={formData.Motivacao_Provavel || ''}
                onChange={(e) => handleInputChange('Motivacao_Provavel', e.target.value)}
                placeholder="ex: Compras rotineiras, visita a familiar, etc."
              />
            </div>
            <div className="form-group">
              <label>Observações Adicionais</label>
              <textarea 
                value={formData.Observacoes || ''}
                onChange={(e) => handleInputChange('Observacoes', e.target.value)}
                rows="4"
                placeholder="Qualquer informação adicional relevante para a busca..."
              />
            </div>
          </div>
        );

      default:
        return <div>Seção não encontrada</div>;
    }
  };

  return (
    <div className="case-registration">
      <div className="section-header">
        <h2>Registo de Novo Caso - {sections[currentSection]}</h2>
        <div className="progress-bar">
          <div className="progress-fill" style={{width: `${((currentSection + 1) / sections.length) * 100}%`}}></div>
        </div>
        <p>{Math.round(((currentSection + 1) / sections.length) * 100)}% completo</p>
      </div>

      {renderSection()}

      <div className="navigation-buttons">
        <button 
          onClick={prevSection} 
          disabled={currentSection === 0}
          className="btn-secondary"
        >
          ← Anterior
        </button>

        {currentSection < sections.length - 1 ? (
          <button 
            onClick={nextSection}
            className="btn-primary"
            disabled={!validateCurrentSection()}
          >
            Seguinte →
          </button>
        ) : (
          <button 
            onClick={submitCase}
            className="btn-success"
            disabled={processing || !validateCurrentSection()}
          >
            {processing ? 'A Registar...' : 'Registar Caso'}
          </button>
        )}
      </div>
    </div>
  );
}

export default CaseRegistration;
