import React, { useState, useEffect, useRef, useCallback } from 'react';
import { showModal } from './modalHelper';
import FoundModal from './FoundModal';
import apiFetch from './api';
import { Document, Packer, Paragraph, Table, TableRow, TableCell, WidthType, TextRun } from 'docx';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import '@geoman-io/leaflet-geoman-free';
import '@geoman-io/leaflet-geoman-free/dist/leaflet-geoman.css';
// Fix leaflet default marker icons when bundlers change asset paths
import markerIcon2x from 'leaflet/dist/images/marker-icon-2x.png';
import markerIcon from 'leaflet/dist/images/marker-icon.png';
import markerShadow from 'leaflet/dist/images/marker-shadow.png';
L.Icon.Default.mergeOptions({ iconRetinaUrl: markerIcon2x, iconUrl: markerIcon, shadowUrl: markerShadow });

// helper to download blob as file
function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

function formatCoords(lat, lon) {
  if (!lat || !lon) return 'N/D';
  // Formatar em DD com 6 decimais
  return `${Number(lat).toFixed(6)}, ${Number(lon).toFixed(6)}`;
}

function calcularDistanciaKm(lat1, lon1, lat2, lon2) {
  // Haversine em km
  if (!lat1 || !lon1 || !lat2 || !lon2) return null;
  const toRad = x => x * Math.PI / 180;
  const R = 6371; // km
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a = Math.sin(dLat/2) * Math.sin(dLat/2) + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon/2) * Math.sin(dLon/2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
  return R * c;
}

function formatEventType(type) {
  const labels = {
    case_created: 'Caso registado',
    case_updated: 'Caso atualizado',
    risk_assessed: 'Risco avaliado',
    person_found: 'Pessoa encontrada',
    clue_added: 'Pista registada',
    task_created: 'Tarefa criada',
    task_completed: 'Tarefa concluída',
    task_status_changed: 'Tarefa atualizada',
    search_area_created: 'Área de busca criada',
    search_area_completed: 'Área de busca pesquisada',
    search_area_status_changed: 'Área de busca atualizada',
    search_area_geometry_updated: 'Geometria da área atualizada',
    search_area_deleted: 'Área de busca apagada',
    pdf_exported: 'PDF exportado',
    csv_exported: 'CSV exportado',
    llm_analysis_requested: 'Análise IA',
    sync_applied: 'Sincronização aplicada',
    sync_conflict: 'Conflito de sincronização'
  };
  return labels[type] || String(type || 'Evento');
}

function formatEventDate(value) {
  if (!value) return 'N/D';
  try {
    return new Date(value).toLocaleString('pt-PT');
  } catch (e) {
    return String(value);
  }
}

function formatClueType(type) {
  const labels = {
    observation: 'Observação',
    sighting: 'Avistamento',
    object: 'Objeto encontrado',
    witness: 'Testemunho',
    phone: 'Telemóvel/comunicações',
    vehicle: 'Veículo',
    other: 'Outra'
  };
  return labels[type] || String(type || 'Pista');
}

function formatReliability(value) {
  const labels = {
    unknown: 'Por avaliar',
    low: 'Baixa',
    medium: 'Média',
    high: 'Alta',
    confirmed: 'Confirmada'
  };
  return labels[value] || String(value || 'Por avaliar');
}

function formatTaskStatus(value) {
  const labels = {
    pending: 'Pendente',
    assigned: 'Atribuída',
    in_progress: 'Em curso',
    completed: 'Concluída',
    cancelled: 'Cancelada'
  };
  return labels[value] || String(value || 'Pendente');
}

function formatTaskPriority(value) {
  const labels = {
    routine: 'Rotina',
    urgent: 'Urgente',
    very_urgent: 'Muito urgente'
  };
  return labels[value] || String(value || 'Rotina');
}

function formatTeamType(value) {
  const labels = {
    ground: 'Apeada',
    patrol: 'Patrulha',
    drone: 'Drone',
    k9: 'Cinotécnica',
    medical: 'Médica',
    command: 'Comando',
    other: 'Outra'
  };
  return labels[value] || String(value || 'Equipa');
}

function formatTeamStatus(value) {
  const labels = {
    available: 'Disponível',
    assigned: 'Atribuída',
    active: 'Ativa',
    resting: 'Descanso',
    unavailable: 'Indisponível'
  };
  return labels[value] || String(value || 'Disponível');
}

function formatAreaStatus(value) {
  const labels = {
    planned: 'Planeada',
    assigned: 'Atribuída',
    in_progress: 'Em curso',
    searched: 'Pesquisada',
    cancelled: 'Cancelada'
  };
  return labels[value] || String(value || 'Planeada');
}

function formatCaseStatus(value) {
  const labels = {
    new: 'Novo',
    triage: 'Triagem',
    mobilization: 'Mobilização',
    active_search: 'Busca ativa',
    suspended: 'Suspenso',
    found_alive: 'Encontrado com vida',
    found_deceased: 'Encontrado sem vida',
    closed: 'Encerrado'
  };
  return labels[value] || String(value || 'Novo');
}

const CASE_STATUS_OPTIONS = [
  ['new', 'Novo'],
  ['triage', 'Triagem'],
  ['mobilization', 'Mobilização'],
  ['active_search', 'Busca ativa'],
  ['suspended', 'Suspenso'],
  ['found_alive', 'Encontrado com vida'],
  ['found_deceased', 'Encontrado sem vida'],
  ['closed', 'Encerrado']
];

function parseMapCoordinate(value) {
  if (value === null || value === undefined || value === '') return null;
  const parsed = Number(String(value).replace(',', '.'));
  return Number.isFinite(parsed) ? parsed : null;
}

function hasMapPoint(item) {
  return parseMapCoordinate(item?.latitude) !== null && parseMapCoordinate(item?.longitude) !== null;
}

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function buildPopupHtml(title, rows) {
  const renderedRows = rows
    .filter(([, value]) => value !== null && value !== undefined && value !== '')
    .map(([label, value]) => `<div><strong>${escapeHtml(label)}:</strong> ${escapeHtml(value)}</div>`)
    .join('');
  return `<div class="operational-popup"><h4>${escapeHtml(title)}</h4>${renderedRows}</div>`;
}

function getPriorityColor(priority) {
  if (priority === 'very_urgent') return '#c62828';
  if (priority === 'urgent') return '#ef6c00';
  return '#2e7d32';
}

function getReliabilityColor(reliability) {
  if (reliability === 'confirmed') return '#1565c0';
  if (reliability === 'high') return '#2e7d32';
  if (reliability === 'medium') return '#ef6c00';
  if (reliability === 'low') return '#6d4c41';
  return '#607d8b';
}

function getAreaStyle(area) {
  const statusColors = {
    planned: '#2e7d32',
    assigned: '#1565c0',
    in_progress: '#ef6c00',
    searched: '#455a64',
    cancelled: '#9e9e9e'
  };
  const color = statusColors[area?.status] || getPriorityColor(area?.priority);
  return {
    color,
    weight: area?.priority === 'very_urgent' ? 4 : 3,
    opacity: area?.status === 'cancelled' ? 0.55 : 0.9,
    fillColor: color,
    fillOpacity: area?.status === 'searched' ? 0.14 : 0.22,
    dashArray: area?.status === 'planned' ? '6 4' : null
  };
}

function normalizeAreaGeometryForApi(geojson) {
  if (!geojson || typeof geojson !== 'object') return null;
  let geometry = geojson;
  if (geometry.type === 'Feature') geometry = geometry.geometry;
  if (geometry.type === 'FeatureCollection') {
    const geometries = (geometry.features || [])
      .map(feature => feature && feature.geometry)
      .filter(featureGeometry => featureGeometry && ['Polygon', 'MultiPolygon'].includes(featureGeometry.type));
    if (geometries.length === 1) return geometries[0];
    if (geometries.length > 1) return { type: 'GeometryCollection', geometries };
    return null;
  }
  if (['Polygon', 'MultiPolygon', 'GeometryCollection'].includes(geometry.type)) return geometry;
  return null;
}

function getLayerAreaGeometry(layer) {
  if (!layer || typeof layer.toGeoJSON !== 'function') return null;
  try {
    const geojson = layer.toGeoJSON();
    return normalizeAreaGeometryForApi(geojson);
  } catch (error) {
    return null;
  }
}

function getLayerLineGeometry(layer) {
  if (!layer || typeof layer.toGeoJSON !== 'function') return null;
  try {
    const geojson = layer.toGeoJSON();
    const geometry = geojson.type === 'Feature' ? geojson.geometry : geojson;
    if (geometry && geometry.type === 'LineString' && Array.isArray(geometry.coordinates) && geometry.coordinates.length >= 2) return geometry;
    return null;
  } catch (error) {
    return null;
  }
}

function formatAreaGeometryType(geometry) {
  if (!geometry) return 'N/D';
  const labels = {
    Polygon: 'Polígono',
    MultiPolygon: 'Multipolígono',
    GeometryCollection: 'Conjunto de polígonos'
  };
  return labels[geometry.type] || geometry.type || 'N/D';
}

function getFilenameFromDisposition(header, fallback) {
  const match = String(header || '').match(/filename="?([^";]+)"?/i);
  return match && match[1] ? match[1] : fallback;
}

export default function CaseDetail({ casoId, onBack }) {
  const [caso, setCaso] = useState(null);
  const [operationalCase, setOperationalCase] = useState(null);
  const [loading, setLoading] = useState(true);
  const [encontradoData, setEncontradoData] = useState({
    Data_Encontrado: '',
    Hora_Encontrado: '',
    Local_Encontrado: '',
    Concelho_Encontrado: '',
    Freguesia_Encontrado: '',
    Latitude_Encontrado: '',
    Longitude_Encontrado: '',
    Estado_Pessoa: 'Em bom estado',
    Meios_Accionados: '',
    Quem_Encontrou: 'Populares',
    Nome_Quem_Encontrou: '',
    Contacto_Quem_Encontrou: ''
  });
  const [saving, setSaving] = useState(false);
  const [resultSummary, setResultSummary] = useState(null);
  const [geoLoading, setGeoLoading] = useState(false);
  const [geoError, setGeoError] = useState('');
  // reverse-geocode loading and transient badges are handled inline where needed
  const [toast, setToast] = useState(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [timelineEvents, setTimelineEvents] = useState([]);
  const [timelineLoading, setTimelineLoading] = useState(false);
  const [timelineError, setTimelineError] = useState('');
  const [caseStatusForm, setCaseStatusForm] = useState({ status: '', justification: '' });
  const [caseStatusUpdating, setCaseStatusUpdating] = useState(false);
  const [clues, setClues] = useState([]);
  const [cluesLoading, setCluesLoading] = useState(false);
  const [cluesError, setCluesError] = useState('');
  const [clueSaving, setClueSaving] = useState(false);
  const [clueForm, setClueForm] = useState({
    clue_type: 'observation',
    description: '',
    reliability: 'unknown',
    latitude: '',
    longitude: '',
    observed_at: '',
    reported_by: ''
  });
  const [tasks, setTasks] = useState([]);
  const [tasksLoading, setTasksLoading] = useState(false);
  const [tracks, setTracks] = useState([]);
  const [tracksLoading, setTracksLoading] = useState(false);
  const [tracksError, setTracksError] = useState('');
  const [trackSaving, setTrackSaving] = useState(false);
  const [drawnTrackGeometry, setDrawnTrackGeometry] = useState(null);
  const [drawnTrackMessage, setDrawnTrackMessage] = useState('');
  const [trackForm, setTrackForm] = useState({
    name: '',
    team_id: '',
    notes: ''
  });
    const carregarTracks = useCallback(async (id = casoId) => {
      if (!id) return;
      setTracksLoading(true);
      setTracksError('');
      try {
        const res = await apiFetch(`/api/db/casos-oficial/${encodeURIComponent(id)}/tracks`);
        if (res.status === 404) {
          setTracks([]);
          return;
        }
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();
        if (data.success && Array.isArray(data.tracks)) setTracks(data.tracks);
        else setTracks([]);
      } catch (e) {
        setTracks([]);
        setTracksError('Trilhos indisponíveis');
      } finally {
        setTracksLoading(false);
      }
    }, [casoId]);
  const [tasksError, setTasksError] = useState('');
  const [taskSaving, setTaskSaving] = useState(false);
  const [taskUpdatingId, setTaskUpdatingId] = useState(null);
  const [taskForm, setTaskForm] = useState({
    source_clue_id: '',
    title: '',
    description: '',
    priority: 'routine',
    due_at: '',
    latitude: '',
    longitude: ''
  });
  const [teams, setTeams] = useState([]);
  const [teamsLoading, setTeamsLoading] = useState(false);
  const [teamsError, setTeamsError] = useState('');
  const [teamSaving, setTeamSaving] = useState(false);
  const [teamAssigningTaskId, setTeamAssigningTaskId] = useState(null);
  const [teamForm, setTeamForm] = useState({
    name: '',
    team_type: 'ground',
    contact: ''
  });
  const [areas, setAreas] = useState([]);
  const [areasLoading, setAreasLoading] = useState(false);
  const [areasError, setAreasError] = useState('');
  const [areaSaving, setAreaSaving] = useState(false);
  const [areaUpdatingId, setAreaUpdatingId] = useState(null);
  const [areaGeometrySaving, setAreaGeometrySaving] = useState(false);
  const [gisImporting, setGisImporting] = useState(false);
  const [drawnAreaGeometry, setDrawnAreaGeometry] = useState(null);
  const [drawnAreaMessage, setDrawnAreaMessage] = useState('');
  const [editingAreaId, setEditingAreaId] = useState(null);
  const [areaForm, setAreaForm] = useState({
    name: '',
    priority: 'routine',
    team_id: '',
    latitude: '',
    longitude: '',
    radius_meters: '500',
    notes: ''
  });
  const mapRef = useRef(null);
  const markerRef = useRef(null);
  const mapInitRef = useRef(null);
  const operationalMapContainerRef = useRef(null);
  const operationalMapRef = useRef(null);
  const operationalLayerRef = useRef(null);
  const drawnAreaLayerRef = useRef(null);
  const editableAreaLayerRef = useRef(null);
  const drawnTrackLayerRef = useRef(null);
  const gisImportInputRef = useRef(null);
  const openButtonRef = useRef(null); // referência para retornar foco
  const firstFieldRef = useRef(null); // foco inicial no modal
  // modalRef was used for focus trapping but FoundModal now handles trapping

  // Valores seguros para latitude/longitude do caso (evitar acessar propriedades quando caso for null)
  const casoLatKey = caso ? (caso.Latitude || caso.Lat || caso.lat || caso.latitude || '') : '';
  const casoLonKey = caso ? (caso.Longitude || caso.Lon || caso.lon || caso.longitude || '') : '';

  const carregarTimeline = useCallback(async (id = casoId) => {
    if (!id) return;
    setTimelineLoading(true);
    setTimelineError('');
    try {
      const res = await apiFetch(`/api/db/casos-oficial/${encodeURIComponent(id)}/timeline`);
      if (res.status === 404) {
        setTimelineEvents([]);
        return;
      }
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      if (data.success && Array.isArray(data.eventos)) {
        if (data.caso) {
          setOperationalCase(data.caso);
          setCaseStatusForm(prev => ({ ...prev, status: prev.status || data.caso.status || 'new' }));
        }
        setTimelineEvents(data.eventos);
      } else {
        setTimelineEvents([]);
      }
    } catch (e) {
      setTimelineEvents([]);
      setTimelineError('Timeline operacional indisponível');
    } finally {
      setTimelineLoading(false);
    }
  }, [casoId]);

  const carregarPistas = useCallback(async (id = casoId) => {
    if (!id) return;
    setCluesLoading(true);
    setCluesError('');
    try {
      const res = await apiFetch(`/api/db/casos-oficial/${encodeURIComponent(id)}/clues`);
      if (res.status === 404) {
        setClues([]);
        return;
      }
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      if (data.success && Array.isArray(data.pistas)) {
        setClues(data.pistas);
      } else {
        setClues([]);
      }
    } catch (e) {
      setClues([]);
      setCluesError('Pistas indisponíveis');
    } finally {
      setCluesLoading(false);
    }
  }, [casoId]);

  const carregarTarefas = useCallback(async (id = casoId) => {
    if (!id) return;
    setTasksLoading(true);
    setTasksError('');
    try {
      const res = await apiFetch(`/api/db/casos-oficial/${encodeURIComponent(id)}/tasks`);
      if (res.status === 404) {
        setTasks([]);
        return;
      }
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      if (data.success && Array.isArray(data.tarefas)) {
        setTasks(data.tarefas);
      } else {
        setTasks([]);
      }
    } catch (e) {
      setTasks([]);
      setTasksError('Tarefas indisponíveis');
    } finally {
      setTasksLoading(false);
    }
  }, [casoId]);

  const carregarEquipas = useCallback(async () => {
    setTeamsLoading(true);
    setTeamsError('');
    try {
      const res = await apiFetch('/api/db/teams');
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      if (data.success && Array.isArray(data.teams)) setTeams(data.teams);
      else setTeams([]);
    } catch (e) {
      setTeams([]);
      setTeamsError('Equipas indisponíveis');
    } finally {
      setTeamsLoading(false);
    }
  }, []);

  const carregarAreas = useCallback(async (id = casoId) => {
    if (!id) return;
    setAreasLoading(true);
    setAreasError('');
    try {
      const res = await apiFetch(`/api/db/casos-oficial/${encodeURIComponent(id)}/search-areas`);
      if (res.status === 404) {
        setAreas([]);
        return;
      }
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      if (data.success && Array.isArray(data.areas)) setAreas(data.areas);
      else setAreas([]);
    } catch (e) {
      setAreas([]);
      setAreasError('Áreas de busca indisponíveis');
    } finally {
      setAreasLoading(false);
    }
  }, [casoId]);

  useEffect(() => {
    const fetchCaso = async () => {
      setLoading(true);
      try {
        const res = await apiFetch('/api/casos-oficial');
        const data = await res.json();
        if (data.success && data.casos) {
          const found = data.casos.find(c => String(c.ID_Caso) === String(casoId) || String(c.ID) === String(casoId));
          setCaso(found || null);
        }
      } catch (e) {
        console.error('Erro ao obter caso', e);
      } finally {
        setLoading(false);
      }
    };
    if (casoId) fetchCaso();
  }, [casoId]);

  useEffect(() => {
    if (casoId) carregarTimeline(casoId);
  }, [casoId, carregarTimeline]);

  useEffect(() => {
    if (casoId) carregarPistas(casoId);
  }, [casoId, carregarPistas]);

  useEffect(() => {
    if (casoId) carregarTarefas(casoId);
  }, [casoId, carregarTarefas]);

  useEffect(() => {
    carregarEquipas();
  }, [carregarEquipas]);

  useEffect(() => {
    if (casoId) carregarAreas(casoId);
  }, [casoId, carregarAreas]);

  useEffect(() => {
    if (casoId) carregarTracks(casoId);
  }, [casoId, carregarTracks]);

  const handleChange = (e) => {
    const { name, value } = e.target;
    setEncontradoData(prev => ({ ...prev, [name]: value }));
  };

  const handleClueFormChange = (e) => {
    const { name, value } = e.target;
    setClueForm(prev => ({ ...prev, [name]: value }));
  };

  const handleCaseStatusFormChange = (e) => {
    const { name, value } = e.target;
    setCaseStatusForm(prev => ({ ...prev, [name]: value }));
  };

  const handleTaskFormChange = (e) => {
    const { name, value } = e.target;
    setTaskForm(prev => ({ ...prev, [name]: value }));
  };

  const handleTeamFormChange = (e) => {
    const { name, value } = e.target;
    setTeamForm(prev => ({ ...prev, [name]: value }));
  };

  const handleAreaFormChange = (e) => {
    const { name, value } = e.target;
    setAreaForm(prev => ({ ...prev, [name]: value }));
  };

  const handleUpdateCaseStatus = async (e) => {
    e.preventDefault();
    if (!caseStatusForm.status) {
      await showModal('Validação', 'Escolha o estado operacional.', { confirmText: 'OK' });
      return;
    }
    if (!caseStatusForm.justification || caseStatusForm.justification.trim() === '') {
      await showModal('Validação', 'Indique a justificação da alteração de estado.', { confirmText: 'OK' });
      return;
    }

    setCaseStatusUpdating(true);
    try {
      const caseKey = caso.ID_Caso || caso.ID || caso.id || casoId;
      const res = await apiFetch(`/api/db/casos-oficial/${encodeURIComponent(caseKey)}/status`, {
        method: 'PATCH',
        body: JSON.stringify({ status: caseStatusForm.status, justification: caseStatusForm.justification.trim() })
      });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.error || `HTTP ${res.status}`);
      setOperationalCase(data.caso || null);
      setCaseStatusForm({ status: data.caso?.status || caseStatusForm.status, justification: '' });
      await carregarTimeline(caseKey);
      try { setToast({ type: 'success', text: 'Estado operacional atualizado' }); setTimeout(() => setToast(null), 3000); } catch (toastError) {}
    } catch (error) {
      await showModal('Erro', 'Erro ao atualizar estado: ' + (error.message || error), { confirmText: 'OK' });
    } finally {
      setCaseStatusUpdating(false);
    }
  };

  const handleTrackFormChange = (e) => {
    const { name, value } = e.target;
    setTrackForm(prev => ({ ...prev, [name]: value }));
  };

  const handleAddClue = async (e) => {
    e.preventDefault();
    if (!clueForm.description || clueForm.description.trim() === '') {
      await showModal('Validação', 'Descreva a pista antes de guardar.', { confirmText: 'OK' });
      return;
    }

    setClueSaving(true);
    try {
      const payload = {
        clue_type: clueForm.clue_type,
        description: clueForm.description.trim(),
        reliability: clueForm.reliability,
        latitude: clueForm.latitude || undefined,
        longitude: clueForm.longitude || undefined,
        observed_at: clueForm.observed_at || undefined,
        reported_by: clueForm.reported_by || undefined
      };
      const res = await apiFetch(`/api/db/casos-oficial/${encodeURIComponent(caso.ID_Caso || caso.ID || caso.id || casoId)}/clues`, {
        method: 'POST',
        body: JSON.stringify(payload)
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || `HTTP ${res.status}`);
      }

      setClueForm({
        clue_type: 'observation',
        description: '',
        reliability: 'unknown',
        latitude: '',
        longitude: '',
        observed_at: '',
        reported_by: ''
      });
      await carregarPistas(caso.ID_Caso || caso.ID || caso.id || casoId);
      await carregarTimeline(caso.ID_Caso || caso.ID || caso.id || casoId);
      try { setToast({ type: 'success', text: 'Pista registada' }); setTimeout(() => setToast(null), 3000); } catch (toastError) {}
    } catch (error) {
      await showModal('Erro', 'Erro ao registar pista: ' + (error.message || error), { confirmText: 'OK' });
    } finally {
      setClueSaving(false);
    }
  };

  const handleAddTask = async (e) => {
    e.preventDefault();
    if (!taskForm.title || taskForm.title.trim() === '') {
      await showModal('Validação', 'Indique o título da tarefa antes de guardar.', { confirmText: 'OK' });
      return;
    }

    setTaskSaving(true);
    try {
      const payload = {
        source_clue_id: taskForm.source_clue_id || undefined,
        title: taskForm.title.trim(),
        description: taskForm.description || undefined,
        priority: taskForm.priority,
        due_at: taskForm.due_at || undefined,
        latitude: taskForm.latitude || undefined,
        longitude: taskForm.longitude || undefined
      };
      const res = await apiFetch(`/api/db/casos-oficial/${encodeURIComponent(caso.ID_Caso || caso.ID || caso.id || casoId)}/tasks`, {
        method: 'POST',
        body: JSON.stringify(payload)
      });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.error || `HTTP ${res.status}`);

      setTaskForm({ source_clue_id: '', title: '', description: '', priority: 'routine', due_at: '', latitude: '', longitude: '' });
      await carregarTarefas(caso.ID_Caso || caso.ID || caso.id || casoId);
      await carregarTimeline(caso.ID_Caso || caso.ID || caso.id || casoId);
      try { setToast({ type: 'success', text: 'Tarefa criada' }); setTimeout(() => setToast(null), 3000); } catch (toastError) {}
    } catch (error) {
      await showModal('Erro', 'Erro ao criar tarefa: ' + (error.message || error), { confirmText: 'OK' });
    } finally {
      setTaskSaving(false);
    }
  };

  const handleAddTeam = async (e) => {
    e.preventDefault();
    if (!teamForm.name || teamForm.name.trim() === '') {
      await showModal('Validação', 'Indique o nome da equipa antes de guardar.', { confirmText: 'OK' });
      return;
    }

    setTeamSaving(true);
    try {
      const res = await apiFetch('/api/db/teams', {
        method: 'POST',
        body: JSON.stringify({
          name: teamForm.name.trim(),
          team_type: teamForm.team_type,
          contact: teamForm.contact || undefined
        })
      });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.error || `HTTP ${res.status}`);
      setTeamForm({ name: '', team_type: 'ground', contact: '' });
      await carregarEquipas();
      try { setToast({ type: 'success', text: 'Equipa criada' }); setTimeout(() => setToast(null), 3000); } catch (toastError) {}
    } catch (error) {
      await showModal('Erro', 'Erro ao criar equipa: ' + (error.message || error), { confirmText: 'OK' });
    } finally {
      setTeamSaving(false);
    }
  };

  const handleAssignTaskTeam = async (taskId, teamId) => {
    if (!teamId) return;
    setTeamAssigningTaskId(taskId);
    try {
      const res = await apiFetch(`/api/db/tasks/${encodeURIComponent(taskId)}/team`, {
        method: 'PATCH',
        body: JSON.stringify({ team_id: teamId })
      });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.error || `HTTP ${res.status}`);
      await carregarTarefas(caso.ID_Caso || caso.ID || caso.id || casoId);
      await carregarTimeline(caso.ID_Caso || caso.ID || caso.id || casoId);
    } catch (error) {
      await showModal('Erro', 'Erro ao atribuir equipa: ' + (error.message || error), { confirmText: 'OK' });
    } finally {
      setTeamAssigningTaskId(null);
    }
  };

  const handleAddArea = async (e) => {
    e.preventDefault();
    if (!areaForm.name || areaForm.name.trim() === '') {
      await showModal('Validação', 'Indique o nome da área/setor antes de guardar.', { confirmText: 'OK' });
      return;
    }
    if (!areaForm.latitude || !areaForm.longitude || !areaForm.radius_meters) {
      await showModal('Validação', 'Indique centro e raio da área.', { confirmText: 'OK' });
      return;
    }

    setAreaSaving(true);
    try {
      const res = await apiFetch(`/api/db/casos-oficial/${encodeURIComponent(caso.ID_Caso || caso.ID || caso.id || casoId)}/search-areas`, {
        method: 'POST',
        body: JSON.stringify({
          name: areaForm.name.trim(),
          priority: areaForm.priority,
          team_id: areaForm.team_id || undefined,
          latitude: areaForm.latitude,
          longitude: areaForm.longitude,
          radius_meters: areaForm.radius_meters,
          notes: areaForm.notes || undefined
        })
      });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.error || `HTTP ${res.status}`);
      setAreaForm({ name: '', priority: 'routine', team_id: '', latitude: '', longitude: '', radius_meters: '500', notes: '' });
      await carregarAreas(caso.ID_Caso || caso.ID || caso.id || casoId);
      await carregarTimeline(caso.ID_Caso || caso.ID || caso.id || casoId);
      try { setToast({ type: 'success', text: 'Área de busca criada' }); setTimeout(() => setToast(null), 3000); } catch (toastError) {}
    } catch (error) {
      await showModal('Erro', 'Erro ao criar área de busca: ' + (error.message || error), { confirmText: 'OK' });
    } finally {
      setAreaSaving(false);
    }
  };

  const handleAreaStatusChange = async (areaId, status) => {
    setAreaUpdatingId(areaId);
    try {
      const res = await apiFetch(`/api/db/search-areas/${encodeURIComponent(areaId)}/status`, {
        method: 'PATCH',
        body: JSON.stringify({ status })
      });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.error || `HTTP ${res.status}`);
      await carregarAreas(caso.ID_Caso || caso.ID || caso.id || casoId);
      await carregarTimeline(caso.ID_Caso || caso.ID || caso.id || casoId);
    } catch (error) {
      await showModal('Erro', 'Erro ao atualizar área de busca: ' + (error.message || error), { confirmText: 'OK' });
    } finally {
      setAreaUpdatingId(null);
    }
  };

  const handleTaskStatusChange = async (taskId, status) => {
    setTaskUpdatingId(taskId);
    try {
      const res = await apiFetch(`/api/db/tasks/${encodeURIComponent(taskId)}/status`, {
        method: 'PATCH',
        body: JSON.stringify({ status })
      });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.error || `HTTP ${res.status}`);
      await carregarTarefas(caso.ID_Caso || caso.ID || caso.id || casoId);
      await carregarTimeline(caso.ID_Caso || caso.ID || caso.id || casoId);
    } catch (error) {
      await showModal('Erro', 'Erro ao atualizar tarefa: ' + (error.message || error), { confirmText: 'OK' });
    } finally {
      setTaskUpdatingId(null);
    }
  };

  const handleCreateTaskFromClue = (clue) => {
    const clueType = formatClueType(clue.clue_type);
    const description = clue.description || '';
    setTaskForm({
      source_clue_id: clue.id,
      title: `Verificar pista: ${description.slice(0, 70)}`,
      description: `Origem: ${clueType}\nFiabilidade: ${formatReliability(clue.reliability)}\n${description}`,
      priority: clue.reliability === 'confirmed' || clue.reliability === 'high' ? 'urgent' : 'routine',
      due_at: '',
      latitude: clue.latitude ? String(clue.latitude) : '',
      longitude: clue.longitude ? String(clue.longitude) : ''
    });
    try { setToast({ type: 'success', text: 'Tarefa preparada a partir da pista' }); setTimeout(() => setToast(null), 3000); } catch (toastError) {}
  };

  const handleMarkFound = async () => {
    if (!caso) return;
    setSaving(true);
    try {
      // Normalizar coordenadas no cliente (trocar vírgula por ponto, remover texto)
      const normalizeClient = (v) => {
        if (v === undefined || v === null) return '';
        if (typeof v === 'number') return String(v);
        let s = String(v).trim();
        if (!s) return '';
        s = s.replace(/,/g, '.');
        const m = s.match(/[+-]?[0-9]*\.?[0-9]+/);
        return m ? m[0] : '';
      };

      const latFStr = normalizeClient(encontradoData.Latitude_Encontrado);
      const lonFStr = normalizeClient(encontradoData.Longitude_Encontrado);
      // Calcular distância aproximada se tivermos coordenadas
      const latOrig = parseFloat(caso.Latitude || caso.Latitude || caso.Lat || caso.latitude);
      const lonOrig = parseFloat(caso.Longitude || caso.Longitude || caso.Lon || caso.lon);
      const latF = parseFloat(encontradoData.Latitude_Encontrado) || null;
      const lonF = parseFloat(encontradoData.Longitude_Encontrado) || null;
      let distancia_km = null;
      if (!isNaN(latOrig) && !isNaN(lonOrig) && !isNaN(latF) && !isNaN(lonF)) {
        distancia_km = calcularDistanciaKm(latOrig, lonOrig, latF, lonF);
      }

      const payload = {
        ID_Caso: caso.ID_Caso || caso.ID || caso.id,
        encontrado: {
          ...encontradoData,
          Latitude_Encontrado: latFStr || undefined,
          Longitude_Encontrado: lonFStr || undefined,
          Distancia_km: distancia_km !== null ? Number(distancia_km.toFixed(3)) : '',
          // Audit trail: quem marcou e timestamp
          Encontrado_Marcador: encontradoData.Nome_Quem_Encontrou || encontradoData.Quem_Encontrou || 'UI',
          Encontrado_DataHora_Marcacao: new Date().toISOString()
        }
      };

      const res = await apiFetch('/api/casos-oficial/encontrado', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      const data = await res.json();
      if (data.success) {
        // Mostrar resumo visual (distância e estado)
        setResultSummary({
          distancia_km: payload.encontrado.Distancia_km || data.caso.Distancia_km_Encontrado || data.caso.Distancia_km || '',
          estado: payload.encontrado.Estado_Pessoa || payload.encontrado.Estado_Pessoa_Encontrado || data.caso.Estado_Pessoa_Encontrado || ''
        });
        await carregarTimeline(caso.ID_Caso || caso.ID || caso.id || casoId);
      } else {
        await showModal('Erro', 'Falha ao marcar como encontrado: ' + (data.error || 'Erro desconhecido'), { confirmText: 'OK' });
      }
    } catch (e) {
  console.error('Erro ao marcar encontrado', e);
  await showModal('Erro', 'Erro ao marcar encontrado: ' + e.message, { confirmText: 'OK' });
    } finally {
      setSaving(false);
    }
  };

  const handleGeocode = async () => {
    setGeoError('');
    const query = encontradoData.Local_Encontrado || caso.Local_Ultimo_Avistamento || '';
    if (!query) { setGeoError('Forneça um local para geocodificar'); return; }
    setGeoLoading(true);
    try {
      const params = new URLSearchParams({ q: query });
      const res = await fetch('/api/geocode?' + params.toString());
      const data = await res.json();
      if (data.success && data.geocode) {
        setEncontradoData(prev => ({ ...prev, Latitude_Encontrado: String(data.geocode.lat), Longitude_Encontrado: String(data.geocode.lon), Freguesia_Encontrado: prev.Freguesia_Encontrado || '', Concelho_Encontrado: prev.Concelho_Encontrado || '' }));
        setGeoError('Geocodificação concluída');
      } else {
        setGeoError(data.error || 'Não foi possível geocodificar');
      }
    } catch (e) {
      setGeoError('Erro ao geocodificar: ' + e.message);
    } finally {
      setGeoLoading(false);
    }
  };

  const handleFitOperationalMap = () => {
    const map = operationalMapRef.current;
    const layer = operationalLayerRef.current;
    if (!map || !layer || layer.getLayers().length === 0) return;
    try {
      const bounds = layer.getBounds();
      if (bounds.isValid()) map.fitBounds(bounds.pad(0.18), { maxZoom: 15 });
    } catch (e) {
      console.warn('Não foi possível ajustar o mapa operacional', e);
    }
  };

  const clearDrawnAreaLayer = useCallback(() => {
    try {
      if (drawnAreaLayerRef.current) {
        drawnAreaLayerRef.current.remove();
        drawnAreaLayerRef.current = null;
      }
    } catch (error) {}
    setDrawnAreaGeometry(null);
    setDrawnAreaMessage('');
  }, []);

  const clearDrawnTrackLayer = useCallback(() => {
    try {
      if (drawnTrackLayerRef.current) {
        drawnTrackLayerRef.current.remove();
        drawnTrackLayerRef.current = null;
      }
    } catch (error) {}
    setDrawnTrackGeometry(null);
    setDrawnTrackMessage('');
  }, []);

  const clearEditableAreaLayer = useCallback(() => {
    try {
      if (editableAreaLayerRef.current) {
        editableAreaLayerRef.current.eachLayer?.((layer) => {
          try { if (layer.pm) layer.pm.disable(); } catch (error) {}
        });
        editableAreaLayerRef.current.remove();
        editableAreaLayerRef.current = null;
      }
    } catch (error) {}
    setEditingAreaId(null);
  }, []);

  const handleDrawnAreaLayer = useCallback((layer) => {
    const geometry = getLayerAreaGeometry(layer);
    if (!geometry) {
      try { layer && layer.remove(); } catch (error) {}
      setDrawnAreaMessage('Desenho inválido: use polígono ou retângulo.');
      return;
    }

    clearEditableAreaLayer();
    clearDrawnAreaLayer();
    try {
      layer.setStyle?.({ color: '#1565c0', fillColor: '#1565c0', fillOpacity: 0.22, weight: 3 });
      drawnAreaLayerRef.current = layer;
      if (operationalMapRef.current && !operationalMapRef.current.hasLayer(layer)) layer.addTo(operationalMapRef.current);
    } catch (error) {}
    setDrawnAreaGeometry(geometry);
    setDrawnAreaMessage(`${formatAreaGeometryType(geometry)} pronto para guardar.`);
    setAreaForm(prev => ({ ...prev, name: prev.name || 'Setor desenhado' }));
  }, [clearDrawnAreaLayer, clearEditableAreaLayer]);

  const handleStartAreaDraw = (shape) => {
    const map = operationalMapRef.current;
    if (!map || !map.pm) return;
    clearEditableAreaLayer();
    try {
      map.pm.disableDraw();
      map.pm.enableDraw(shape, {
        allowSelfIntersection: false,
        snappable: true,
        templineStyle: { color: '#1565c0' },
        hintlineStyle: { color: '#1565c0', dashArray: [5, 5] },
        pathOptions: { color: '#1565c0', fillColor: '#1565c0', fillOpacity: 0.22, weight: 3 }
      });
    } catch (error) {
      console.warn('Não foi possível iniciar desenho', error);
    }
  };

  const handleDrawnTrackLayer = useCallback((layer) => {
    const geometry = getLayerLineGeometry(layer);
    if (!geometry) {
      try { layer && layer.remove(); } catch (error) {}
      setDrawnTrackMessage('Trilho inválido: desenhe uma linha com pelo menos 2 pontos.');
      return;
    }
    clearEditableAreaLayer();
    clearDrawnTrackLayer();
    try {
      layer.setStyle?.({ color: '#6a1b9a', weight: 4, opacity: 0.95 });
      drawnTrackLayerRef.current = layer;
      if (operationalMapRef.current && !operationalMapRef.current.hasLayer(layer)) layer.addTo(operationalMapRef.current);
    } catch (error) {}
    setDrawnTrackGeometry(geometry);
    setDrawnTrackMessage(`Trilho com ${geometry.coordinates.length} pontos pronto para guardar.`);
    setTrackForm(prev => ({ ...prev, name: prev.name || 'Trilho desenhado' }));
  }, [clearDrawnTrackLayer, clearEditableAreaLayer]);

  const handleStartTrackDraw = () => {
    const map = operationalMapRef.current;
    if (!map || !map.pm) return;
    clearEditableAreaLayer();
    clearDrawnAreaLayer();
    try {
      map.pm.disableDraw();
      map.pm.enableDraw('Line', {
        snappable: true,
        templineStyle: { color: '#6a1b9a' },
        hintlineStyle: { color: '#6a1b9a', dashArray: [5, 5] },
        pathOptions: { color: '#6a1b9a', weight: 4, opacity: 0.95 }
      });
    } catch (error) {
      console.warn('Não foi possível iniciar desenho de trilho', error);
    }
  };

  const handleSaveDrawnTrack = async () => {
    if (!drawnTrackGeometry) {
      await showModal('Validação', 'Desenhe um trilho no mapa antes de guardar.', { confirmText: 'OK' });
      return;
    }
    setTrackSaving(true);
    try {
      const res = await apiFetch(`/api/db/casos-oficial/${encodeURIComponent(caso.ID_Caso || caso.ID || caso.id || casoId)}/tracks`, {
        method: 'POST',
        body: JSON.stringify({
          source: 'manual_map',
          name: trackForm.name || 'Trilho desenhado',
          team_id: trackForm.team_id || undefined,
          notes: trackForm.notes || undefined,
          geometry: drawnTrackGeometry
        })
      });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.error || `HTTP ${res.status}`);
      clearDrawnTrackLayer();
      setTrackForm({ name: '', team_id: '', notes: '' });
      await carregarTracks(caso.ID_Caso || caso.ID || caso.id || casoId);
      await carregarTimeline(caso.ID_Caso || caso.ID || caso.id || casoId);
      try { setToast({ type: 'success', text: 'Trilho guardado' }); setTimeout(() => setToast(null), 3000); } catch (toastError) {}
    } catch (error) {
      await showModal('Erro', 'Erro ao guardar trilho: ' + (error.message || error), { confirmText: 'OK' });
    } finally {
      setTrackSaving(false);
    }
  };

  const handleSaveDrawnArea = async () => {
    if (!drawnAreaGeometry) {
      await showModal('Validação', 'Desenhe uma área no mapa antes de guardar.', { confirmText: 'OK' });
      return;
    }
    if (!areaForm.name || areaForm.name.trim() === '') {
      await showModal('Validação', 'Indique o nome da área/setor antes de guardar.', { confirmText: 'OK' });
      return;
    }

    setAreaGeometrySaving(true);
    try {
      const res = await apiFetch(`/api/db/casos-oficial/${encodeURIComponent(caso.ID_Caso || caso.ID || caso.id || casoId)}/search-areas`, {
        method: 'POST',
        body: JSON.stringify({
          name: areaForm.name.trim(),
          priority: areaForm.priority,
          team_id: areaForm.team_id || undefined,
          geometry: drawnAreaGeometry,
          notes: areaForm.notes || undefined
        })
      });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.error || `HTTP ${res.status}`);
      clearDrawnAreaLayer();
      setAreaForm({ name: '', priority: 'routine', team_id: '', latitude: '', longitude: '', radius_meters: '500', notes: '' });
      await carregarAreas(caso.ID_Caso || caso.ID || caso.id || casoId);
      await carregarTimeline(caso.ID_Caso || caso.ID || caso.id || casoId);
      try { setToast({ type: 'success', text: 'Área desenhada guardada' }); setTimeout(() => setToast(null), 3000); } catch (toastError) {}
    } catch (error) {
      await showModal('Erro', 'Erro ao guardar área desenhada: ' + (error.message || error), { confirmText: 'OK' });
    } finally {
      setAreaGeometrySaving(false);
    }
  };

  const handleEditAreaGeometry = (area) => {
    const map = operationalMapRef.current;
    if (!map || !area || !area.geojson) return;
    clearDrawnAreaLayer();
    clearEditableAreaLayer();
    try {
      const editLayer = L.geoJSON(area.geojson, { style: () => ({ ...getAreaStyle(area), color: '#1565c0', fillColor: '#1565c0' }) }).addTo(map);
      editLayer.eachLayer((layer) => {
        try {
          if (layer.pm) layer.pm.enable({ allowSelfIntersection: false, snappable: true });
        } catch (error) {}
      });
      editableAreaLayerRef.current = editLayer;
      setEditingAreaId(area.id);
      const bounds = editLayer.getBounds();
      if (bounds.isValid()) map.fitBounds(bounds.pad(0.18), { maxZoom: 16 });
    } catch (error) {
      console.warn('Não foi possível editar área no mapa', error);
    }
  };

  const handleSaveEditedAreaGeometry = async () => {
    if (!editingAreaId || !editableAreaLayerRef.current) return;
    const geometry = getLayerAreaGeometry(editableAreaLayerRef.current);
    if (!geometry) {
      await showModal('Validação', 'A geometria editada não é válida.', { confirmText: 'OK' });
      return;
    }

    setAreaGeometrySaving(true);
    try {
      const res = await apiFetch(`/api/db/search-areas/${encodeURIComponent(editingAreaId)}/geometry`, {
        method: 'PATCH',
        body: JSON.stringify({ geometry })
      });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.error || `HTTP ${res.status}`);
      clearEditableAreaLayer();
      await carregarAreas(caso.ID_Caso || caso.ID || caso.id || casoId);
      await carregarTimeline(caso.ID_Caso || caso.ID || caso.id || casoId);
      try { setToast({ type: 'success', text: 'Geometria atualizada' }); setTimeout(() => setToast(null), 3000); } catch (toastError) {}
    } catch (error) {
      await showModal('Erro', 'Erro ao atualizar geometria: ' + (error.message || error), { confirmText: 'OK' });
    } finally {
      setAreaGeometrySaving(false);
    }
  };

  const handleDeleteArea = async (area) => {
    if (!area) return;
    const confirmed = await showModal('Apagar área de busca', `Apagar a área "${area.name}"? Esta ação fica registada na timeline.`, { confirmText: 'Apagar', cancelText: 'Cancelar' });
    if (!confirmed) return;

    setAreaUpdatingId(area.id);
    try {
      const res = await apiFetch(`/api/db/search-areas/${encodeURIComponent(area.id)}`, { method: 'DELETE' });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.error || `HTTP ${res.status}`);
      if (editingAreaId === area.id) clearEditableAreaLayer();
      await carregarAreas(caso.ID_Caso || caso.ID || caso.id || casoId);
      await carregarTimeline(caso.ID_Caso || caso.ID || caso.id || casoId);
      try { setToast({ type: 'success', text: 'Área apagada' }); setTimeout(() => setToast(null), 3000); } catch (toastError) {}
    } catch (error) {
      await showModal('Erro', 'Erro ao apagar área: ' + (error.message || error), { confirmText: 'OK' });
    } finally {
      setAreaUpdatingId(null);
    }
  };

  const handleExportGis = async (format) => {
    try {
      const caseKey = caso.ID_Caso || caso.ID || caso.id || casoId;
      const res = await apiFetch(`/api/db/casos-oficial/${encodeURIComponent(caseKey)}/gis/export?format=${encodeURIComponent(format)}`);
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || `HTTP ${res.status}`);
      }
      const blob = await res.blob();
      const extension = format === 'geojson' ? 'geojson' : format;
      const filename = getFilenameFromDisposition(res.headers.get('Content-Disposition'), `caso_${caseKey}.${extension}`);
      downloadBlob(blob, filename);
    } catch (error) {
      await showModal('Erro', 'Erro ao exportar GIS: ' + (error.message || error), { confirmText: 'OK' });
    }
  };

  const handleImportGisFile = async (event) => {
    const file = event.target.files && event.target.files[0];
    if (!file) return;
    setGisImporting(true);
    try {
      const text = await file.text();
      const geojson = JSON.parse(text);
      const res = await apiFetch(`/api/db/casos-oficial/${encodeURIComponent(caso.ID_Caso || caso.ID || caso.id || casoId)}/gis/import`, {
        method: 'POST',
        body: JSON.stringify({ format: 'geojson', geojson })
      });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.error || `HTTP ${res.status}`);
      await carregarAreas(caso.ID_Caso || caso.ID || caso.id || casoId);
      await carregarTimeline(caso.ID_Caso || caso.ID || caso.id || casoId);
      try { setToast({ type: 'success', text: `${data.total || 0} área(s) importada(s)` }); setTimeout(() => setToast(null), 3000); } catch (toastError) {}
    } catch (error) {
      await showModal('Erro', 'Erro ao importar GeoJSON: ' + (error.message || error), { confirmText: 'OK' });
    } finally {
      setGisImporting(false);
      try { event.target.value = ''; } catch (error) {}
    }
  };

  useEffect(() => {
    if (!caso || !operationalMapContainerRef.current || operationalMapRef.current) return;

    const lat = parseMapCoordinate(casoLatKey) ?? 39.5;
    const lon = parseMapCoordinate(casoLonKey) ?? -8.0;
    const hasCasePoint = parseMapCoordinate(casoLatKey) !== null && parseMapCoordinate(casoLonKey) !== null;

    try {
      const map = L.map(operationalMapContainerRef.current, {
        center: [lat, lon],
        zoom: hasCasePoint ? 12 : 7,
        scrollWheelZoom: false
      });
      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '&copy; OpenStreetMap contributors'
      }).addTo(map);
      if (map.pm) {
        map.pm.setGlobalOptions({ allowSelfIntersection: false, snappable: true });
        map.pm.addControls({
          position: 'topleft',
          drawMarker: false,
          drawCircle: false,
          drawCircleMarker: false,
          drawPolyline: false,
          drawText: false,
          editMode: false,
          dragMode: false,
          cutPolygon: false,
          removalMode: false,
          rotateMode: false
        });
        map.on('pm:create', (event) => {
          if (getLayerLineGeometry(event.layer)) return handleDrawnTrackLayer(event.layer);
          return handleDrawnAreaLayer(event.layer);
        });
      }
      operationalLayerRef.current = L.featureGroup().addTo(map);
      operationalMapRef.current = map;
      setTimeout(() => { try { map.invalidateSize(); } catch (e) {} }, 100);
    } catch (e) {
      console.error('Erro ao inicializar mapa operacional', e);
    }

    return () => {
      try {
        if (operationalMapRef.current) operationalMapRef.current.remove();
      } catch (e) {}
      operationalMapRef.current = null;
      operationalLayerRef.current = null;
      drawnAreaLayerRef.current = null;
      editableAreaLayerRef.current = null;
      drawnTrackLayerRef.current = null;
    };
  }, [caso, casoLatKey, casoLonKey, handleDrawnAreaLayer, handleDrawnTrackLayer]);

  useEffect(() => {
    const map = operationalMapRef.current;
    const layer = operationalLayerRef.current;
    if (!map || !layer || !caso) return;

    layer.clearLayers();

    const caseLat = parseMapCoordinate(casoLatKey);
    const caseLon = parseMapCoordinate(casoLonKey);
    if (caseLat !== null && caseLon !== null) {
      L.circleMarker([caseLat, caseLon], {
        radius: 8,
        color: '#1b5e20',
        weight: 3,
        fillColor: '#ffffff',
        fillOpacity: 1
      })
        .bindTooltip('Último avistamento', { direction: 'top' })
        .bindPopup(buildPopupHtml('Último avistamento', [
          ['Local', caso.Local_Ultimo_Avistamento || 'N/D'],
          ['Coordenadas', formatCoords(caseLat, caseLon)]
        ]))
        .addTo(layer);
    }

    const foundLat = parseMapCoordinate(caso.Latitude_Encontrado || caso.latitude_encontrado);
    const foundLon = parseMapCoordinate(caso.Longitude_Encontrado || caso.longitude_encontrado);
    if (foundLat !== null && foundLon !== null) {
      L.circleMarker([foundLat, foundLon], {
        radius: 8,
        color: '#4e342e',
        weight: 3,
        fillColor: '#ffecb3',
        fillOpacity: 0.95
      })
        .bindTooltip('Pessoa encontrada', { direction: 'top' })
        .bindPopup(buildPopupHtml('Pessoa encontrada', [
          ['Local', caso.Local_Encontrado || 'N/D'],
          ['Estado', caso.Estado_Pessoa || caso.Estado_Pessoa_Encontrado || 'N/D'],
          ['Coordenadas', formatCoords(foundLat, foundLon)]
        ]))
        .addTo(layer);
    }

    areas.forEach((area) => {
      if (!area.geojson) return;
      try {
        const areaLayer = L.geoJSON(area.geojson, {
          style: () => getAreaStyle(area),
          onEachFeature: (_feature, featureLayer) => {
            featureLayer.bindTooltip(area.name || 'Área de busca', { sticky: true });
            featureLayer.bindPopup(buildPopupHtml(area.name || 'Área de busca', [
              ['Estado', formatAreaStatus(area.status)],
              ['Prioridade', formatTaskPriority(area.priority)],
              ['Equipa', area.team_name || 'Sem equipa'],
              ['Área', area.area_m2 ? `${(Number(area.area_m2) / 10000).toFixed(2)} ha` : 'N/D'],
              ['Notas', area.notes || '']
            ]));
          }
        });
        areaLayer.addTo(layer);
      } catch (e) {
        console.warn('Área de busca com GeoJSON inválido', area.id, e);
      }
    });

    clues.filter(hasMapPoint).forEach((clue) => {
      const lat = parseMapCoordinate(clue.latitude);
      const lon = parseMapCoordinate(clue.longitude);
      const color = getReliabilityColor(clue.reliability);
      L.circleMarker([lat, lon], {
        radius: 7,
        color,
        weight: 2,
        fillColor: color,
        fillOpacity: 0.82
      })
        .bindTooltip(`Pista: ${formatClueType(clue.clue_type)}`, { direction: 'top' })
        .bindPopup(buildPopupHtml('Pista operacional', [
          ['Tipo', formatClueType(clue.clue_type)],
          ['Fiabilidade', formatReliability(clue.reliability)],
          ['Descrição', clue.description || 'N/D'],
          ['Reportada por', clue.reported_by || ''],
          ['Observada em', clue.observed_at ? formatEventDate(clue.observed_at) : ''],
          ['Coordenadas', formatCoords(lat, lon)]
        ]))
        .addTo(layer);
    });

    tasks.filter(hasMapPoint).forEach((task) => {
      const lat = parseMapCoordinate(task.latitude);
      const lon = parseMapCoordinate(task.longitude);
      const color = getPriorityColor(task.priority);
      L.circleMarker([lat, lon], {
        radius: 7,
        color,
        weight: 3,
        fillColor: '#ffffff',
        fillOpacity: 0.95,
        dashArray: task.status === 'completed' ? null : '3 3'
      })
        .bindTooltip(`Tarefa: ${task.title || 'sem título'}`, { direction: 'top' })
        .bindPopup(buildPopupHtml('Tarefa operacional', [
          ['Título', task.title || 'N/D'],
          ['Estado', formatTaskStatus(task.status)],
          ['Prioridade', formatTaskPriority(task.priority)],
          ['Equipa', task.team_name || 'Sem equipa'],
          ['Prazo', task.due_at ? formatEventDate(task.due_at) : ''],
          ['Descrição', task.description || ''],
          ['Coordenadas', formatCoords(lat, lon)]
        ]))
        .addTo(layer);
    });

    tracks.forEach((track) => {
      if (!track.geojson) return;
      try {
        L.geoJSON(track.geojson, {
          style: () => ({ color: '#6a1b9a', weight: 4, opacity: 0.9 }),
          onEachFeature: (_feature, featureLayer) => {
            const name = track.metadata?.name || 'Trilho operacional';
            featureLayer.bindTooltip(name, { sticky: true });
            featureLayer.bindPopup(buildPopupHtml(name, [
              ['Equipa', track.team_name || 'Sem equipa'],
              ['Fonte', track.source || 'manual'],
              ['Distância', track.distance_meters ? `${Number(track.distance_meters).toFixed(0)} m` : 'N/D'],
              ['Notas', track.metadata?.notes || '']
            ]));
          }
        }).addTo(layer);
      } catch (error) {
        console.warn('Trilho com GeoJSON inválido', track.id, error);
      }
    });

    try {
      if (layer.getLayers().length > 0) {
        const bounds = layer.getBounds();
        if (bounds.isValid()) map.fitBounds(bounds.pad(0.18), { maxZoom: 15 });
      }
      setTimeout(() => { try { map.invalidateSize(); } catch (e) {} }, 80);
    } catch (e) {
      console.warn('Não foi possível ajustar camadas operacionais', e);
    }
  }, [areas, clues, tasks, tracks, caso, casoLatKey, casoLonKey]);

  // Inicializar mapa do modal quando for aberto
  // Inicializar mapa modal quando for aberto. Dependências explícitas para evitar warnings do linter.
  useEffect(() => {
    let map;
    if (!modalOpen) return;
    // definir centro inicial a partir do caso ou Portugal centro
    const lat0 = parseFloat(casoLatKey) || 39.5;
    const lon0 = parseFloat(casoLonKey) || -8.0;

    // extractable init function so it can be called from ResizeObserver or from onEntered
    const initMap = () => {
      if (mapRef.current) return; // already initialized
      try {
        map = L.map('foundMap', { center: [lat0, lon0], zoom: 10 });
        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
          attribution: '&copy; OpenStreetMap contributors'
        }).addTo(map);

        // se já houver coordenadas preenchidas, colocar marcador
        const latExist = parseFloat(encontradoData.Latitude_Encontrado);
        const lonExist = parseFloat(encontradoData.Longitude_Encontrado);
        if (!isNaN(latExist) && !isNaN(lonExist)) {
          markerRef.current = L.marker([latExist, lonExist]).addTo(map);
          map.setView([latExist, lonExist], 14);
        }

        map.on('click', async (ev) => {
          const { lat, lng } = ev.latlng;
          // atualizar estado com coordenadas
          setEncontradoData(prev => ({ ...prev, Latitude_Encontrado: String(Number(lat).toFixed(6)), Longitude_Encontrado: String(Number(lng).toFixed(6)) }));
          if (markerRef.current) {
            markerRef.current.setLatLng([lat, lng]);
          } else {
            markerRef.current = L.marker([lat, lng]).addTo(map);
          }

          // reverse-geocode para obter rua/local, freguesia e concelho
          try {
            const qs = new URLSearchParams({ lat: String(lat), lon: String(lng) });
            const resp = await fetch('/api/reverse-geocode?' + qs.toString());
            const payload = await resp.json();
            if (payload && payload.success && payload.reverse) {
              const rev = payload.reverse;
              const addr = (rev.raw && rev.raw.address) ? rev.raw.address : {};
              // tentar extrair rua/house_number
              const road = addr.road || addr.pedestrian || addr.footway || addr.residential || addr.street || '';
              const house = addr.house_number ? String(addr.house_number).trim() : '';
              const street = (road ? (road + (house ? ' ' + house : '')) : (rev.display_name || '')).trim();
              // Preferir valores explícitos retornados pelo backend (rev),
              // mas ter heurísticas locais mais alinhadas com OSM:
              const freg = rev.freguesia || addr.parish || addr.suburb || addr.neighbourhood || addr.quarter || addr.village || addr.hamlet || addr.locality || '';
              const conc = rev.concelho || addr.municipality || addr.city || addr.town || addr.county || '';
              setEncontradoData(prev => ({ ...prev, Local_Encontrado: street || prev.Local_Encontrado || '', Freguesia_Encontrado: freg || prev.Freguesia_Encontrado || '', Concelho_Encontrado: conc || prev.Concelho_Encontrado || '' }));
              setGeoError('Geocodificação inversa concluída');
              try { setToast({ type: 'success', text: 'Local identificado com sucesso' }); setTimeout(() => setToast(null), 3000); } catch (e) {}
            }
          } catch (e) {
            console.warn('reverse-geocode falhou', e);
          }
        });

        mapRef.current = map;
      } catch (e) {
        console.error('Erro ao inicializar mapa', e);
      }
  };

  // expose initMap so onEntered can trigger it after animation
  try { mapInitRef.current = initMap; } catch (e) {}

    try {
      // only initialize if the container exists
      const mapContainer = document.getElementById('foundMap');
      if (!mapContainer) {
        console.warn('foundMap container not found when opening modal');
      } else {
        // if container has size already, init immediately
        const rect = mapContainer.getBoundingClientRect();
        if (rect.width > 0 && rect.height > 0) {
          initMap();
          // ensure correct sizing after animations
          setTimeout(() => { try { mapRef.current && mapRef.current.invalidateSize(); } catch (e) {} }, 300);
        } else if (window.ResizeObserver) {
          // wait until the container is visible/has size
          const ro = new ResizeObserver(entries => {
            for (let entry of entries) {
              const cr = entry.contentRect || entry.target.getBoundingClientRect();
              if (cr.width > 0 && cr.height > 0) {
                try { initMap(); } catch (e) { console.error('Erro inicializar mapa após resize', e); }
                // small timeout to let styles settle
                setTimeout(() => { try { mapRef.current && mapRef.current.invalidateSize(); } catch (e) {} }, 80);
                try { ro.disconnect(); } catch (e) {}
                break;
              }
            }
          });
          try { ro.observe(mapContainer); } catch (e) { console.warn('ResizeObserver observe falhou', e); }
        } else {
          // fallback: try init after a longer timeout
          setTimeout(() => { try { initMap(); mapRef.current && mapRef.current.invalidateSize(); } catch (e) { console.warn('Fallback init map falhou', e); } }, 500);
        }
      }
    } catch (err) {
      console.error('Erro a inicializar mapa modal', err);
    }

    return () => {
      try {
        if (mapRef.current) {
          mapRef.current.remove();
          mapRef.current = null;
        }
        markerRef.current = null;
      } catch (e) { /* ignore */ }
    };
  }, [modalOpen, casoLatKey, casoLonKey, encontradoData.Latitude_Encontrado, encontradoData.Longitude_Encontrado]);

  // called by FoundModal when enter animation finishes
  const handleModalEntered = () => {
    try {
      // If we have an init function, call it to guarantee the map exists after animation
      if (mapInitRef.current && typeof mapInitRef.current === 'function') {
        try { mapInitRef.current(); } catch (e) { /* ignore */ }
      }
      // always request a resize/invalidate after a short delay
      setTimeout(() => { try { if (mapRef.current) { mapRef.current.invalidateSize(); } else { window.dispatchEvent(new Event('resize')); } } catch (e) {} }, 120);
    } catch (e) {
      // swallow
    }
  };

  // Delegamos focagem inicial e trap focus para FoundModal.
  // Aqui só cuidamos de devolver o foco ao botão que abriu quando o modal fecha.
  useEffect(() => {
    if (!modalOpen) {
      try { if (openButtonRef.current && typeof openButtonRef.current.focus === 'function') openButtonRef.current.focus(); } catch (e) {}
    }
  }, [modalOpen]);

  const exportEncontradoDocx = async () => {
    try {
      const children = [];
      children.push(new Paragraph({ text: `Ficha - Pessoa Encontrada`, heading: 'Heading1' }));
      children.push(new Paragraph({ text: `Caso ID: ${caso.ID_Caso || caso.ID || 'N/D'}`, spacing: { after: 200 } }));
      const rows = [];
      rows.push(new TableRow({ children: [new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: 'Campo', bold: true })] })] }), new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: 'Valor', bold: true })] })] })] }));
      Object.entries(encontradoData).forEach(([k, v]) => {
        rows.push(new TableRow({ children: [new TableCell({ children: [new Paragraph(String(k))] }), new TableCell({ children: [new Paragraph(String(v || ''))] })] }));
      });
      const table = new Table({ rows, width: { size: 100, type: WidthType.PERCENTAGE } });
      children.push(table);
      const doc = new Document({ sections: [{ children }] });
      const packer = new Packer();
      const blob = await packer.toBlob(doc);
      const filename = `caso_${caso.ID_Caso || caso.ID || 'unknown'}_encontrado.docx`;
      downloadBlob(blob, filename);
    } catch (err) {
      console.error('Erro ao exportar .docx (encontrado)', err);
      await showModal('Erro', 'Falha ao exportar .docx: ' + err.message, { confirmText: 'OK' });
    }
  };

  const handleSaveFound = async () => {
    await handleMarkFound();
    setModalOpen(false);
  };

  if (loading) return <div>Carregando ficha do caso...</div>;
  if (!caso) return <div>Caso não encontrado.</div>;

  const handleExportDocx = async () => {
    try {
      const children = [];
      // Cabeçalho simples com identificação
      children.push(new Paragraph({ text: `GSARIA - Registo Oficial`, heading: 'Heading1' }));
      children.push(new Paragraph({ text: `Caso ID: ${caso.ID_Caso || caso.ID || 'N/D'}`, spacing: { after: 200 } }));

      // Construir tabela dinamicamente a partir de todas as chaves do objeto 'caso'
      const keys = Object.keys(caso || {});
      const rows = [];
      // Cabeçalho estilizado (cores oficiais)
      const headerCell = (text) => new TableCell({ children: [new Paragraph({ children: [new TextRun({ text, bold: true, color: 'FFFFFF' })] })], shading: { fill: '2E7D32' } });
      rows.push(new TableRow({ children: [headerCell('Campo'), headerCell('Valor')] }));

      keys.forEach(k => {
        let v = caso[k];
        if (v && typeof v === 'object') {
          // Linha de título do objeto
          rows.push(new TableRow({ children: [new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: String(k), bold: true, color: '2E7D32' })] })] }), new TableCell({ children: [new Paragraph('')] })] }));
          Object.entries(v).forEach(([subk, subv]) => {
            rows.push(new TableRow({ children: [new TableCell({ children: [new Paragraph('  ' + String(subk))] }), new TableCell({ children: [new Paragraph(String(subv || ''))] })] }));
          });
        } else {
          rows.push(new TableRow({ children: [new TableCell({ children: [new Paragraph(String(k || ''))] }), new TableCell({ children: [new Paragraph(String(v || ''))] })] }));
        }
      });

      const table = new Table({ rows, width: { size: 100, type: WidthType.PERCENTAGE } });
      children.push(table);

      const doc = new Document({ sections: [{ children }] });
      const packer = new Packer();
      const blob = await packer.toBlob(doc);
      const filename = `caso_${caso.ID_Caso || caso.ID || 'unknown'}_registro.docx`;
      downloadBlob(blob, filename);
    } catch (err) {
      console.error('Erro ao exportar .docx', err);
      await showModal('Erro', 'Falha ao exportar .docx: ' + err.message, { confirmText: 'OK' });
    }
  };

  const mappedAreasCount = areas.filter(area => area.geojson).length;
  const mappedCluesCount = clues.filter(hasMapPoint).length;
  const mappedTasksCount = tasks.filter(hasMapPoint).length;
  const mappedTracksCount = tracks.filter(track => track.geojson).length;

  return (
    <div className="case-detail">
      <div className="case-detail-main">
        <div style={{display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8}}>
          <div>
            <button className="btn-secondary" onClick={() => onBack && onBack()}>Voltar à lista</button>
            <button className="btn-outline" style={{ marginLeft: 8 }} onClick={() => handleExportDocx()}>Exportar caso (.docx)</button>
          </div>
          
        </div>

        <h2>Ficha do Caso: {caso.Nome_Completo || caso.Nome}</h2>

        <section className="panel">
          <h3>Identificação</h3>
          <div><strong>ID:</strong> {caso.ID_Caso}</div>
          <div><strong>Nome:</strong> {caso.Nome_Completo || caso.Nome}</div>
          <div><strong>Idade:</strong> {caso.Idade_Exacta || caso.Idade}</div>
          <div><strong>Sexo:</strong> {caso.Sexo}</div>
        </section>

        <section className="panel">
          <h3>Local e circunstâncias</h3>
          <div><strong>Data desaparecimento:</strong> {caso.Data_Desaparecimento} {caso.Hora_Desaparecimento}</div>
          <div><strong>Local último avistamento:</strong> {caso.Local_Ultimo_Avistamento}</div>
          <div><strong>Freguesia / Concelho:</strong> {caso.Freguesia || 'N/D'} / {caso.Concelho || 'N/D'}</div>
          <div><strong>Coordenadas (origem):</strong> {formatCoords(caso.Latitude, caso.Longitude)}</div>
          <div><strong>Meteorologia:</strong> {caso.Meteorologia_Descricao || 'N/D'}</div>
        </section>

        <section className="panel operational-map-panel">
          <div className="operational-map-header">
            <div>
              <h3>Mapa operacional</h3>
              <p>Áreas de busca, pistas e tarefas com coordenadas.</p>
            </div>
            <button type="button" className="btn-outline" onClick={handleFitOperationalMap}>Ajustar camadas</button>
          </div>
          <div className="operational-map-summary" aria-label="Resumo das camadas do mapa operacional">
            <span><strong>{mappedAreasCount}</strong> áreas</span>
            <span><strong>{mappedCluesCount}</strong> pistas</span>
            <span><strong>{mappedTasksCount}</strong> tarefas</span>
            <span><strong>{mappedTracksCount}</strong> trilhos</span>
          </div>
          <div className="operational-map-actions">
            <button type="button" className="btn-secondary" onClick={() => handleStartAreaDraw('Polygon')}>Desenhar polígono</button>
            <button type="button" className="btn-secondary" onClick={() => handleStartAreaDraw('Rectangle')}>Desenhar retângulo</button>
            <button type="button" className="btn-secondary" onClick={handleStartTrackDraw}>Desenhar trilho</button>
            <button type="button" className="btn-outline" onClick={clearDrawnAreaLayer} disabled={!drawnAreaGeometry}>Limpar desenho</button>
          </div>
          {drawnTrackGeometry ? (
            <div className="operational-map-drawing-card track-drawing-card">
              <div><strong>{drawnTrackMessage}</strong></div>
              <div className="operational-map-drawing-form track-drawing-form">
                <input name="name" value={trackForm.name} onChange={handleTrackFormChange} placeholder="Nome do trilho" />
                <select name="team_id" value={trackForm.team_id} onChange={handleTrackFormChange}>
                  <option value="">Sem equipa</option>
                  {teams.map((team) => <option key={team.id} value={team.id}>{team.name}</option>)}
                </select>
                <input name="notes" value={trackForm.notes} onChange={handleTrackFormChange} placeholder="Notas" />
                <button type="button" className="btn-primary" onClick={handleSaveDrawnTrack} disabled={trackSaving}>{trackSaving ? 'A guardar...' : 'Guardar trilho'}</button>
                <button type="button" className="btn-outline" onClick={clearDrawnTrackLayer} disabled={trackSaving}>Cancelar</button>
              </div>
            </div>
          ) : null}
          <div className="operational-map-actions gis-actions">
            <button type="button" className="btn-outline" onClick={() => handleExportGis('geojson')}>Exportar GeoJSON</button>
            <button type="button" className="btn-outline" onClick={() => handleExportGis('kml')}>Exportar KML</button>
            <button type="button" className="btn-outline" onClick={() => handleExportGis('gpx')}>Exportar GPX</button>
            <button type="button" className="btn-secondary" onClick={() => gisImportInputRef.current && gisImportInputRef.current.click()} disabled={gisImporting}>{gisImporting ? 'A importar...' : 'Importar GeoJSON'}</button>
            <input ref={gisImportInputRef} type="file" accept=".geojson,.json,application/geo+json,application/json" onChange={handleImportGisFile} style={{ display: 'none' }} />
          </div>
          {drawnAreaGeometry ? (
            <div className="operational-map-drawing-card">
              <div><strong>{drawnAreaMessage}</strong></div>
              <div className="operational-map-drawing-form">
                <input name="name" value={areaForm.name} onChange={handleAreaFormChange} placeholder="Nome / setor" />
                <select name="priority" value={areaForm.priority} onChange={handleAreaFormChange}>
                  <option value="routine">Rotina</option>
                  <option value="urgent">Urgente</option>
                  <option value="very_urgent">Muito urgente</option>
                </select>
                <select name="team_id" value={areaForm.team_id} onChange={handleAreaFormChange}>
                  <option value="">Sem equipa</option>
                  {teams.map((team) => <option key={team.id} value={team.id}>{team.name}</option>)}
                </select>
                <input name="notes" value={areaForm.notes} onChange={handleAreaFormChange} placeholder="Notas" />
                <button type="button" className="btn-primary" onClick={handleSaveDrawnArea} disabled={areaGeometrySaving}>{areaGeometrySaving ? 'A guardar...' : 'Guardar desenho'}</button>
              </div>
            </div>
          ) : null}
          {editingAreaId ? (
            <div className="operational-map-edit-card">
              <span>Área em edição no mapa.</span>
              <button type="button" className="btn-primary" onClick={handleSaveEditedAreaGeometry} disabled={areaGeometrySaving}>{areaGeometrySaving ? 'A guardar...' : 'Guardar edição'}</button>
              <button type="button" className="btn-outline" onClick={clearEditableAreaLayer} disabled={areaGeometrySaving}>Cancelar</button>
            </div>
          ) : null}
          <div className="operational-map-box">
            <div ref={operationalMapContainerRef} className="operational-map" role="application" aria-label="Mapa operacional do caso" />
            {(areasLoading || cluesLoading || tasksLoading || tracksLoading) ? <div className="operational-map-loading">A atualizar camadas...</div> : null}
          </div>
          <div className="operational-map-legend" aria-label="Legenda do mapa operacional">
            <span><i className="legend-dot origin" /> Último avistamento</span>
            <span><i className="legend-dot found" /> Encontrada</span>
            <span><i className="legend-dot clue" /> Pista</span>
            <span><i className="legend-dot task" /> Tarefa</span>
            <span><i className="legend-area" /> Área de busca</span>
            <span><i className="legend-line" /> Trilho</span>
          </div>
          {tracksLoading ? <p>A carregar trilhos...</p> : tracksError ? <div className="alert-error">{tracksError}</div> : null}
        </section>

        <section className="panel">
          <h3>Estado e observações</h3>
          <div className="case-status-strip">
            <span>Estado SAR</span>
            <strong>{formatCaseStatus(operationalCase?.status || caseStatusForm.status || 'new')}</strong>
          </div>
          <form className="case-status-form" onSubmit={handleUpdateCaseStatus}>
            <select name="status" value={caseStatusForm.status || operationalCase?.status || 'new'} onChange={handleCaseStatusFormChange}>
              {CASE_STATUS_OPTIONS.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
            </select>
            <textarea name="justification" value={caseStatusForm.justification} onChange={handleCaseStatusFormChange} rows="3" placeholder="Justificação operacional obrigatória" />
            <button type="submit" className="btn-primary" disabled={caseStatusUpdating}>{caseStatusUpdating ? 'A atualizar...' : 'Atualizar estado'}</button>
          </form>
          <div><strong>Risco calculado:</strong> {caso.Risco_Calculado || 'N/D'}</div>
          <div><strong>Indicadores ativos:</strong> {caso.Indicadores_Risco_Activos || 'N/D'}</div>
          <div style={{ whiteSpace: 'pre-wrap' }}><strong>Observações:</strong> {caso.Observacoes_Adicionais || caso.Observacoes || 'N/D'}</div>
        </section>

        <section className="panel">
          <h3>Timeline operacional</h3>
          {timelineLoading ? (
            <p>A carregar eventos...</p>
          ) : timelineError ? (
            <div className="alert-error">{timelineError}</div>
          ) : timelineEvents.length === 0 ? (
            <p style={{ color: '#666', fontStyle: 'italic' }}>Sem eventos operacionais registados.</p>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {timelineEvents.map((event) => (
                <div key={event.id} style={{ borderLeft: '4px solid #2E7D32', paddingLeft: 10, background: '#fafafa', borderRadius: 4, paddingTop: 8, paddingBottom: 8 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'baseline' }}>
                    <strong>{formatEventType(event.event_type)}</strong>
                    <span style={{ color: '#666', fontSize: 12 }}>{formatEventDate(event.event_at)}</span>
                  </div>
                  <div style={{ marginTop: 4 }}>{event.summary || 'Sem resumo'}</div>
                  {(event.latitude && event.longitude) ? (
                    <div style={{ marginTop: 4, color: '#555', fontSize: 13 }}>Coordenadas: {formatCoords(event.latitude, event.longitude)}</div>
                  ) : null}
                </div>
              ))}
            </div>
          )}
        </section>
      </div>

      <aside className="case-detail-aside">
        <section className="panel">
          <h3>Marcar como encontrada</h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <div>O formulário de marcação não é exibido aqui para evitar alterações acidentais. Clique no botão em baixo.</div>
            <button ref={openButtonRef} className="btn-primary" onClick={() => setModalOpen(true)} aria-haspopup="dialog" aria-controls="found-modal">{saving ? 'A processar...' : 'Registar: Pessoa encontrada'}</button>
            
          </div>

          {resultSummary && (
            <div className="found-summary" style={{ marginTop: 12, padding: 12, border: '1px solid #ddd', background: '#f9f9f9' }}>
              <strong>Resumo do registo:</strong>
              <div>Distância: {resultSummary.distancia_km ? `${Number(resultSummary.distancia_km).toFixed(3)} km` : 'N/D'}</div>
              <div>Estado da pessoa: {resultSummary.estado || 'N/D'}</div>
            </div>
          )}
        </section>

        <section className="panel">
          <h3>Pistas operacionais</h3>
          <form onSubmit={handleAddClue} style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 12 }}>
            <div className="form-group">
              <label>Tipo</label>
              <select name="clue_type" value={clueForm.clue_type} onChange={handleClueFormChange}>
                <option value="observation">Observação</option>
                <option value="sighting">Avistamento</option>
                <option value="object">Objeto encontrado</option>
                <option value="witness">Testemunho</option>
                <option value="phone">Telemóvel/comunicações</option>
                <option value="vehicle">Veículo</option>
                <option value="other">Outra</option>
              </select>
            </div>
            <div className="form-group">
              <label>Descrição</label>
              <textarea name="description" value={clueForm.description} onChange={handleClueFormChange} rows="3" placeholder="Ex.: testemunha viu pessoa junto ao rio" />
            </div>
            <div className="form-group">
              <label>Fiabilidade</label>
              <select name="reliability" value={clueForm.reliability} onChange={handleClueFormChange}>
                <option value="unknown">Por avaliar</option>
                <option value="low">Baixa</option>
                <option value="medium">Média</option>
                <option value="high">Alta</option>
                <option value="confirmed">Confirmada</option>
              </select>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
              <div className="form-group">
                <label>Latitude</label>
                <input name="latitude" value={clueForm.latitude} onChange={handleClueFormChange} placeholder="Opcional" />
              </div>
              <div className="form-group">
                <label>Longitude</label>
                <input name="longitude" value={clueForm.longitude} onChange={handleClueFormChange} placeholder="Opcional" />
              </div>
            </div>
            <div className="form-group">
              <label>Data/hora observada</label>
              <input name="observed_at" type="datetime-local" value={clueForm.observed_at} onChange={handleClueFormChange} />
            </div>
            <div className="form-group">
              <label>Reportada por</label>
              <input name="reported_by" value={clueForm.reported_by} onChange={handleClueFormChange} placeholder="Testemunha, equipa, popular..." />
            </div>
            <button className="btn-primary" type="submit" disabled={clueSaving}>{clueSaving ? 'A guardar...' : 'Registar pista'}</button>
          </form>

          {cluesLoading ? (
            <p>A carregar pistas...</p>
          ) : cluesError ? (
            <div className="alert-error">{cluesError}</div>
          ) : clues.length === 0 ? (
            <p style={{ color: '#666', fontStyle: 'italic' }}>Sem pistas registadas.</p>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {clues.map((clue) => (
                <div key={clue.id} style={{ border: '1px solid #e0e0e0', borderRadius: 4, padding: 8, background: '#fafafa' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
                    <strong>{formatClueType(clue.clue_type)}</strong>
                    <span style={{ fontSize: 12, color: '#666' }}>{formatReliability(clue.reliability)}</span>
                  </div>
                  <div style={{ marginTop: 4 }}>{clue.description}</div>
                  {clue.reported_by ? <div style={{ marginTop: 4, fontSize: 13, color: '#555' }}>Reportada por: {clue.reported_by}</div> : null}
                  {(clue.latitude && clue.longitude) ? <div style={{ marginTop: 4, fontSize: 13, color: '#555' }}>Coordenadas: {formatCoords(clue.latitude, clue.longitude)}</div> : null}
                  <button type="button" className="btn-secondary" style={{ marginTop: 8 }} onClick={() => handleCreateTaskFromClue(clue)}>Criar tarefa</button>
                </div>
              ))}
            </div>
          )}
        </section>

        <section className="panel">
          <h3>Equipas operacionais</h3>
          <form onSubmit={handleAddTeam} style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 12 }}>
            <div className="form-group">
              <label>Nome</label>
              <input name="name" value={teamForm.name} onChange={handleTeamFormChange} placeholder="Ex.: Equipa Alfa" />
            </div>
            <div className="form-group">
              <label>Tipo</label>
              <select name="team_type" value={teamForm.team_type} onChange={handleTeamFormChange}>
                <option value="ground">Apeada</option>
                <option value="patrol">Patrulha</option>
                <option value="drone">Drone</option>
                <option value="k9">Cinotécnica</option>
                <option value="medical">Médica</option>
                <option value="command">Comando</option>
                <option value="other">Outra</option>
              </select>
            </div>
            <div className="form-group">
              <label>Contacto</label>
              <input name="contact" value={teamForm.contact} onChange={handleTeamFormChange} placeholder="Opcional" />
            </div>
            <button className="btn-primary" type="submit" disabled={teamSaving}>{teamSaving ? 'A criar...' : 'Criar equipa'}</button>
          </form>

          {teamsLoading ? (
            <p>A carregar equipas...</p>
          ) : teamsError ? (
            <div className="alert-error">{teamsError}</div>
          ) : teams.length === 0 ? (
            <p style={{ color: '#666', fontStyle: 'italic' }}>Sem equipas registadas.</p>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {teams.map((team) => (
                <div key={team.id} style={{ border: '1px solid #e0e0e0', borderRadius: 4, padding: 8, background: '#fafafa' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
                    <strong>{team.name}</strong>
                    <span style={{ fontSize: 12, color: '#666' }}>{formatTeamStatus(team.status)}</span>
                  </div>
                  <div style={{ marginTop: 4, fontSize: 13, color: '#555' }}>{formatTeamType(team.team_type)}{team.contact ? ` · ${team.contact}` : ''}</div>
                </div>
              ))}
            </div>
          )}
        </section>

        <section className="panel">
          <h3>Áreas de busca</h3>
          <form onSubmit={handleAddArea} style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 12 }}>
            <div className="form-group">
              <label>Nome / setor</label>
              <input name="name" value={areaForm.name} onChange={handleAreaFormChange} placeholder="Ex.: Setor A - margem do rio" />
            </div>
            <div className="form-group">
              <label>Prioridade</label>
              <select name="priority" value={areaForm.priority} onChange={handleAreaFormChange}>
                <option value="routine">Rotina</option>
                <option value="urgent">Urgente</option>
                <option value="very_urgent">Muito urgente</option>
              </select>
            </div>
            <div className="form-group">
              <label>Equipa</label>
              <select name="team_id" value={areaForm.team_id} onChange={handleAreaFormChange}>
                <option value="">Sem equipa atribuída</option>
                {teams.map((team) => <option key={team.id} value={team.id}>{team.name}</option>)}
              </select>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
              <div className="form-group">
                <label>Latitude centro</label>
                <input name="latitude" value={areaForm.latitude} onChange={handleAreaFormChange} placeholder="Ex.: 40.123" />
              </div>
              <div className="form-group">
                <label>Longitude centro</label>
                <input name="longitude" value={areaForm.longitude} onChange={handleAreaFormChange} placeholder="Ex.: -8.123" />
              </div>
            </div>
            <div className="form-group">
              <label>Raio (metros)</label>
              <input name="radius_meters" value={areaForm.radius_meters} onChange={handleAreaFormChange} placeholder="500" />
            </div>
            <div className="form-group">
              <label>Notas</label>
              <textarea name="notes" value={areaForm.notes} onChange={handleAreaFormChange} rows="2" placeholder="Cobertura, terreno, perigos, instruções" />
            </div>
            <button className="btn-primary" type="submit" disabled={areaSaving}>{areaSaving ? 'A criar...' : 'Criar área'}</button>
          </form>

          {areasLoading ? (
            <p>A carregar áreas...</p>
          ) : areasError ? (
            <div className="alert-error">{areasError}</div>
          ) : areas.length === 0 ? (
            <p style={{ color: '#666', fontStyle: 'italic' }}>Sem áreas de busca registadas.</p>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {areas.map((area) => (
                <div key={area.id} style={{ border: '1px solid #e0e0e0', borderRadius: 4, padding: 8, background: '#fafafa' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
                    <strong>{area.name}</strong>
                    <span style={{ fontSize: 12, color: '#666' }}>{formatTaskPriority(area.priority)}</span>
                  </div>
                  {area.team_name ? <div style={{ marginTop: 4, fontSize: 13, color: '#555' }}>Equipa: {area.team_name}</div> : null}
                  {area.area_m2 ? <div style={{ marginTop: 4, fontSize: 13, color: '#555' }}>Área aproximada: {(area.area_m2 / 10000).toFixed(2)} ha</div> : null}
                  {(area.centroid_latitude && area.centroid_longitude) ? <div style={{ marginTop: 4, fontSize: 13, color: '#555' }}>Centro: {formatCoords(area.centroid_latitude, area.centroid_longitude)}</div> : null}
                  {area.notes ? <div style={{ marginTop: 4 }}>{area.notes}</div> : null}
                  <div style={{ marginTop: 6, display: 'flex', alignItems: 'center', gap: 8 }}>
                    <label style={{ fontSize: 13 }}>Estado</label>
                    <select value={area.status} disabled={areaUpdatingId === area.id} onChange={(e) => handleAreaStatusChange(area.id, e.target.value)}>
                      <option value="planned">Planeada</option>
                      <option value="assigned">Atribuída</option>
                      <option value="in_progress">Em curso</option>
                      <option value="searched">Pesquisada</option>
                      <option value="cancelled">Cancelada</option>
                    </select>
                    <span style={{ fontSize: 12, color: '#666' }}>{formatAreaStatus(area.status)}</span>
                  </div>
                  <div style={{ marginTop: 8, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                    <button type="button" className="btn-secondary" onClick={() => handleEditAreaGeometry(area)} disabled={!area.geojson || areaGeometrySaving}>Editar no mapa</button>
                    <button type="button" className="btn-outline" onClick={() => handleDeleteArea(area)} disabled={areaUpdatingId === area.id || areaGeometrySaving}>Apagar</button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>

        <section className="panel">
          <h3>Tarefas operacionais</h3>
          <form onSubmit={handleAddTask} style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 12 }}>
            <div className="form-group">
              <label>Título</label>
              <input name="title" value={taskForm.title} onChange={handleTaskFormChange} placeholder="Ex.: verificar margem do rio" />
            </div>
            {taskForm.source_clue_id ? (
              <div style={{ fontSize: 13, color: '#2E7D32', background: '#eef7ef', border: '1px solid #d7ead9', padding: 8, borderRadius: 4 }}>
                Tarefa associada a uma pista operacional.
              </div>
            ) : null}
            <div className="form-group">
              <label>Descrição</label>
              <textarea name="description" value={taskForm.description} onChange={handleTaskFormChange} rows="2" placeholder="Detalhes operacionais" />
            </div>
            <div className="form-group">
              <label>Prioridade</label>
              <select name="priority" value={taskForm.priority} onChange={handleTaskFormChange}>
                <option value="routine">Rotina</option>
                <option value="urgent">Urgente</option>
                <option value="very_urgent">Muito urgente</option>
              </select>
            </div>
            <div className="form-group">
              <label>Prazo</label>
              <input name="due_at" type="datetime-local" value={taskForm.due_at} onChange={handleTaskFormChange} />
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
              <div className="form-group">
                <label>Latitude</label>
                <input name="latitude" value={taskForm.latitude} onChange={handleTaskFormChange} placeholder="Opcional" />
              </div>
              <div className="form-group">
                <label>Longitude</label>
                <input name="longitude" value={taskForm.longitude} onChange={handleTaskFormChange} placeholder="Opcional" />
              </div>
            </div>
            <button className="btn-primary" type="submit" disabled={taskSaving}>{taskSaving ? 'A criar...' : 'Criar tarefa'}</button>
          </form>

          {tasksLoading ? (
            <p>A carregar tarefas...</p>
          ) : tasksError ? (
            <div className="alert-error">{tasksError}</div>
          ) : tasks.length === 0 ? (
            <p style={{ color: '#666', fontStyle: 'italic' }}>Sem tarefas registadas.</p>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {tasks.map((task) => (
                <div key={task.id} style={{ border: '1px solid #e0e0e0', borderRadius: 4, padding: 8, background: '#fafafa' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
                    <strong>{task.title}</strong>
                    <span style={{ fontSize: 12, color: '#666' }}>{formatTaskPriority(task.priority)}</span>
                  </div>
                  {task.source_clue_id ? <div style={{ marginTop: 4, fontSize: 12, color: '#2E7D32' }}>Origem: pista operacional</div> : null}
                  {task.description ? <div style={{ marginTop: 4 }}>{task.description}</div> : null}
                  <div style={{ marginTop: 6, display: 'flex', alignItems: 'center', gap: 8 }}>
                    <label style={{ fontSize: 13 }}>Estado</label>
                    <select value={task.status} disabled={taskUpdatingId === task.id} onChange={(e) => handleTaskStatusChange(task.id, e.target.value)}>
                      <option value="pending">Pendente</option>
                      <option value="assigned">Atribuída</option>
                      <option value="in_progress">Em curso</option>
                      <option value="completed">Concluída</option>
                      <option value="cancelled">Cancelada</option>
                    </select>
                    <span style={{ fontSize: 12, color: '#666' }}>{formatTaskStatus(task.status)}</span>
                  </div>
                  <div style={{ marginTop: 6, display: 'flex', alignItems: 'center', gap: 8 }}>
                    <label style={{ fontSize: 13 }}>Equipa</label>
                    <select value={task.team_id || ''} disabled={teamAssigningTaskId === task.id || teams.length === 0} onChange={(e) => handleAssignTaskTeam(task.id, e.target.value)}>
                      <option value="">Sem equipa</option>
                      {teams.map((team) => <option key={team.id} value={team.id}>{team.name}</option>)}
                    </select>
                  </div>
                  {task.team_name ? <div style={{ marginTop: 4, fontSize: 13, color: '#555' }}>Atribuída a: {task.team_name}</div> : null}
                  {task.due_at ? <div style={{ marginTop: 4, fontSize: 13, color: '#555' }}>Prazo: {formatEventDate(task.due_at)}</div> : null}
                  {(task.latitude && task.longitude) ? <div style={{ marginTop: 4, fontSize: 13, color: '#555' }}>Coordenadas: {formatCoords(task.latitude, task.longitude)}</div> : null}
                </div>
              ))}
            </div>
          )}
        </section>

        {/* Modal para marcação da pessoa encontrada (usando FoundModal para igualar 'Analisar') */}
        <FoundModal
          className="found-modal"
          open={modalOpen}
          onClose={() => setModalOpen(false)}
          title={`Registar Pessoa Encontrada`}
          id="found-modal"
          initialFocusRef={firstFieldRef}
          onEntered={handleModalEntered}
          footer={(
            <>
              <button className="btn-secondary" onClick={() => setModalOpen(false)}>Cancelar</button>
              <button className="btn-outline" onClick={() => exportEncontradoDocx()}>Exportar dados encontrados</button>
              <button className="btn-primary" onClick={() => { handleSaveFound(); }} disabled={saving || !(encontradoData.Latitude_Encontrado && encontradoData.Longitude_Encontrado)}>{saving ? 'A processar...' : 'Guardar registo'}</button>
            </>
          )}
        >
          <div className="modal-content found-modal-content" style={{ display: 'grid', gridTemplateColumns: '1fr 420px', gap: 16, alignItems: 'start' }}>
            <div>
              <div className="found-form">
                <div className="form-grid">
                  <div className="form-group">
                    <label>Data</label>
                    <input ref={firstFieldRef} name="Data_Encontrado" value={encontradoData.Data_Encontrado} onChange={handleChange} type="date" aria-label="Data em que a pessoa foi encontrada" />
                  </div>
                  <div className="form-group">
                    <label>Hora</label>
                    <input name="Hora_Encontrado" value={encontradoData.Hora_Encontrado} onChange={handleChange} type="time" />
                  </div>

                  <div className="form-group full-width">
                    <label>Local (rua)</label>
                    <input name="Local_Encontrado" value={encontradoData.Local_Encontrado} onChange={handleChange} readOnly aria-readonly="true" title="Preenchido automaticamente ao selecionar no mapa" />
                  </div>

                  <div className="form-group">
                    <label>Freguesia</label>
                    <input name="Freguesia_Encontrado" value={encontradoData.Freguesia_Encontrado} onChange={handleChange} readOnly aria-readonly="true" title="Preenchido automaticamente ao selecionar no mapa" />
                  </div>

                  <div className="form-group">
                    <label>Concelho</label>
                    <input name="Concelho_Encontrado" value={encontradoData.Concelho_Encontrado} onChange={handleChange} readOnly aria-readonly="true" title="Preenchido automaticamente ao selecionar no mapa" />
                  </div>

                  <div className="form-group">
                    <label>Estado da pessoa</label>
                    <select name="Estado_Pessoa" value={encontradoData.Estado_Pessoa} onChange={handleChange}>
                      <option>Em bom estado</option>
                      <option>Estado razoável</option>
                      <option>Ferida</option>
                      <option>Ferida Gravemente</option>
                      <option>Sem Vida</option>
                    </select>
                  </div>

                  <div className="form-group full-width">
                    <label>Meios accionados</label>
                    <input name="Meios_Accionados" value={encontradoData.Meios_Accionados} onChange={handleChange} placeholder="Bombeiros; GNR; Ambulância" />
                  </div>

                  <div className="form-group">
                    <label>Quem encontrou</label>
                    <select name="Quem_Encontrou" value={encontradoData.Quem_Encontrou} onChange={handleChange}>
                      <option>Populares</option>
                      <option>Bombeiros</option>
                      <option>GNR</option>
                      <option>PSP</option>
                      <option>UEPS</option>
                      <option>GIC (cães)</option>
                      <option>UEPS - Drones</option>
                      <option>Outros</option>
                    </select>
                  </div>

                  <div className="form-group">
                    <label>Nome de quem encontrou (opcional)</label>
                    <input name="Nome_Quem_Encontrou" value={encontradoData.Nome_Quem_Encontrou} onChange={handleChange} />
                  </div>

                  <div className="form-group">
                    <label>Contacto de quem encontrou (opcional)</label>
                    <input name="Contacto_Quem_Encontrou" value={encontradoData.Contacto_Quem_Encontrou} onChange={handleChange} />
                  </div>
                </div>
              </div>
            </div>

            <div>
              <div style={{ marginBottom: 6, fontWeight: 600 }}>Selecionar local no mapa</div>
              <div className="map-box" style={{ height: '360px' }}>
                <div id="foundMap" role="application" aria-label="Mapa para selecionar o local onde a pessoa foi encontrada" style={{ height: '100%' }} />
              </div>
              <div className="map-actions" style={{ marginTop: 8, display: 'flex', gap: 8 }}>
                <button type="button" className="btn-secondary" onClick={handleGeocode} disabled={geoLoading}>{geoLoading ? 'A localizar...' : 'Geocodificar'}</button>
                <button type="button" className="btn-outline" onClick={() => {
                  // limpar marcador
                  if (markerRef.current) { markerRef.current.remove(); markerRef.current = null; }
                  setEncontradoData(prev => ({ ...prev, Latitude_Encontrado: '', Longitude_Encontrado: '' }));
                }}>Limpar marcador</button>
                <button type="button" className="btn-secondary" onClick={() => {
                  if (mapRef.current) mapRef.current.setView([casoLatKey || 39.5, casoLonKey || -8.0], 12);
                }}>Centralizar</button>
              </div>

              <div className="form-grid" style={{ marginTop: 10 }}>
                <div className="form-group">
                  <label>Latitude</label>
                  <div style={{ position: 'relative' }}>
                    <input name="Latitude_Encontrado" value={encontradoData.Latitude_Encontrado} onChange={handleChange} placeholder="Latitude" />
                    {(toast && toast.type === 'success') && <div className="coord-badge success">✓</div>}
                  </div>
                </div>
                <div className="form-group">
                  <label>Longitude</label>
                  <div style={{ position: 'relative' }}>
                    <input name="Longitude_Encontrado" value={encontradoData.Longitude_Encontrado} onChange={handleChange} placeholder="Longitude" />
                    {(toast && toast.type === 'success') && <div className="coord-badge success">✓</div>}
                  </div>
                </div>
              </div>

              {geoError && <div style={{ marginTop: 8 }} className={geoError === 'Geocodificação concluída' ? 'alert-success' : 'alert-error'}>{geoError}</div>}

              <div className="detected-address">{encontradoData.Freguesia_Encontrado || encontradoData.Concelho_Encontrado ? `${encontradoData.Freguesia_Encontrado || ''}${encontradoData.Freguesia_Encontrado && encontradoData.Concelho_Encontrado ? ' — ' : ''}${encontradoData.Concelho_Encontrado || ''}` : 'Endereço não detectado'}</div>
              {geoLoading && <div className="map-loading">A carregar localização...</div>}
            </div>
          </div>
        </FoundModal>
        {/* toast portal */}
        {toast ? React.createElement('div', { className: `mini-toast ${toast.type || ''}`, role: 'status', 'aria-live': 'polite' }, toast.text) : null}
      </aside>
    </div>
  );
}
