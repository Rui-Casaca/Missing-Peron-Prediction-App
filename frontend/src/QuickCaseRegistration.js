import React, { useState } from 'react';
import apiFetch from './api';
import { showModal } from './modalHelper';
import { enqueueOperation } from './offlineStore';

const initialForm = {
  person_name: '',
  approximate_age: '',
  person_sex: '',
  reporter_name: '',
  reporter_contact: '',
  last_seen_at: '',
  last_seen_location: '',
  latitude: '',
  longitude: '',
  risk_level: 'normal',
  priority: 'urgent',
  notes: ''
};

export default function QuickCaseRegistration({ onCaseSubmitted }) {
  const [form, setForm] = useState(initialForm);
  const [saving, setSaving] = useState(false);

  const handleChange = (event) => {
    const { name, value } = event.target;
    setForm(prev => ({ ...prev, [name]: value }));
  };

  const handleUseCurrentLocation = () => {
    if (!navigator.geolocation) {
      showModal('Localização', 'O browser não disponibiliza geolocalização.', { confirmText: 'OK' });
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (position) => {
        setForm(prev => ({
          ...prev,
          latitude: Number(position.coords.latitude).toFixed(6),
          longitude: Number(position.coords.longitude).toFixed(6)
        }));
      },
      () => showModal('Localização', 'Não foi possível obter a localização atual.', { confirmText: 'OK' }),
      { enableHighAccuracy: true, timeout: 12000, maximumAge: 30000 }
    );
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    if (!form.person_name.trim()) {
      await showModal('Validação', 'Indique nome, alcunha ou descrição da pessoa.', { confirmText: 'OK' });
      return;
    }
    if (!form.last_seen_location.trim() && (!form.latitude || !form.longitude)) {
      await showModal('Validação', 'Indique local do último avistamento ou coordenadas.', { confirmText: 'OK' });
      return;
    }

    setSaving(true);
    try {
      const res = await apiFetch('/api/db/quick-cases', {
        method: 'POST',
        body: JSON.stringify(form)
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        const error = new Error(data.error || `HTTP ${res.status}`);
        error.isHttp = true;
        throw error;
      }
      setForm(initialForm);
      await showModal('Registo rápido criado', 'O caso ficou em triagem e foi registado na timeline operacional.', { confirmText: 'OK' });
      if (onCaseSubmitted) await onCaseSubmitted(data.caso);
    } catch (error) {
      if (!error.isHttp || !navigator.onLine) {
        enqueueOperation({ entityType: 'quick_case', operationType: 'create', payload: form });
        setForm(initialForm);
        await showModal('Registo guardado offline', 'O caso rápido ficou na fila local e será sincronizado quando houver ligação.', { confirmText: 'OK' });
        if (onCaseSubmitted) await onCaseSubmitted(null);
        return;
      }
      await showModal('Erro', 'Erro ao criar registo rápido: ' + (error.message || error), { confirmText: 'OK' });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="quick-case-shell">
      <div className="quick-case-header">
        <h2>Registo Rápido SAR</h2>
        <p>Criação operacional mínima para triagem, mobilização e atualização posterior pelo formulário oficial.</p>
      </div>

      <form className="quick-case-form" onSubmit={handleSubmit}>
        <div className="quick-case-grid">
          <label>
            Pessoa / descrição
            <input name="person_name" value={form.person_name} onChange={handleChange} placeholder="Nome, alcunha ou descrição" />
          </label>
          <label>
            Idade aproximada
            <input name="approximate_age" value={form.approximate_age} onChange={handleChange} type="number" min="0" max="120" />
          </label>
          <label>
            Sexo
            <select name="person_sex" value={form.person_sex} onChange={handleChange}>
              <option value="">N/D</option>
              <option value="Masculino">Masculino</option>
              <option value="Feminino">Feminino</option>
              <option value="Outro/Desconhecido">Outro/Desconhecido</option>
            </select>
          </label>
          <label>
            Data/hora último avistamento
            <input name="last_seen_at" value={form.last_seen_at} onChange={handleChange} type="datetime-local" />
          </label>
          <label>
            Denunciante
            <input name="reporter_name" value={form.reporter_name} onChange={handleChange} placeholder="Nome" />
          </label>
          <label>
            Contacto denunciante
            <input name="reporter_contact" value={form.reporter_contact} onChange={handleChange} placeholder="Telefone/email" />
          </label>
          <label className="quick-case-wide">
            Local do último avistamento
            <input name="last_seen_location" value={form.last_seen_location} onChange={handleChange} placeholder="Local, ponto de referência ou setor" />
          </label>
          <label>
            Latitude
            <input name="latitude" value={form.latitude} onChange={handleChange} placeholder="39.000000" />
          </label>
          <label>
            Longitude
            <input name="longitude" value={form.longitude} onChange={handleChange} placeholder="-8.000000" />
          </label>
          <label>
            Risco inicial
            <select name="risk_level" value={form.risk_level} onChange={handleChange}>
              <option value="normal">Normal</option>
              <option value="moderate">Moderado</option>
              <option value="high">Elevado</option>
            </select>
          </label>
          <label>
            Prioridade
            <select name="priority" value={form.priority} onChange={handleChange}>
              <option value="routine">Rotina</option>
              <option value="urgent">Urgente</option>
              <option value="very_urgent">Muito urgente</option>
            </select>
          </label>
          <label className="quick-case-wide">
            Observações iniciais
            <textarea name="notes" value={form.notes} onChange={handleChange} rows="4" placeholder="Risco imediato, roupa, contexto, necessidades médicas, meios já acionados" />
          </label>
        </div>

        <div className="quick-case-actions">
          <button type="button" className="btn-outline" onClick={handleUseCurrentLocation}>Usar localização atual</button>
          <button type="submit" className="btn-primary" disabled={saving}>{saving ? 'A criar...' : 'Criar caso em triagem'}</button>
        </div>
      </form>
    </div>
  );
}
