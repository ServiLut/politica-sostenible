"use client";

import React, { createContext, useContext, useState, useEffect, useCallback, useMemo } from 'react';
import { MEDELLIN_ZONES } from '../data/medellin-geo';

export type ContactRole = 'Simpatizante' | 'Líder' | 'Testigo' | 'Voluntario' | 'Donante';
export type PipelineStage = 'Prospecto' | 'Contactado' | 'Simpatizante' | 'Firme' | 'Votó';

export interface Contact {
  id: string;
  name: string;
  cedula: string;
  phone: string;
  address: string;
  neighborhood: string;
  role: ContactRole;
  stage: PipelineStage;
  createdAt: string;
  status: 'active' | 'archived';
}

export interface TerritoryZone {
  id: string;
  name: string;
  target: number;
  current: number;
  leader: string;
  lat?: number;
  lng?: number;
}

export type FinanceStatus = 'PENDING' | 'APPROVED' | 'REJECTED' | 'REPORTED_CNE';
export type CneCode = 
  | 'PUBLICIDAD_VALLAS' 
  | 'TRANSPORTE' 
  | 'SEDE_CAMPANA' 
  | 'ACTOS_PUBLICOS' 
  | 'MATERIAL_POP' 
  | 'INVERSION_ESTADISTICA' 
  | 'GASTOS_FINANCIEROS' 
  | 'OTROS';

export interface FinanceTransaction {
  id: string;
  concept: string;
  amount: number;
  type: 'Ingreso' | 'Gasto';
  category: string;
  date: string;
  status: FinanceStatus;
  cneCode?: CneCode;
  vendorTaxId?: string; // NIT o Cédula (Legal)
  providerId?: string; // Legacy support
  evidenceUrl?: string;
  relatedEntityId?: string; // Conexión con Eventos o Inventario
}

export interface CampaignEvent { 
  id: string; 
  title: string; 
  date: string; 
  location: string; 
  type: 'Reunión' | 'Marcha' | 'Capacitación' | 'Otro'; 
  attendeesCount: number; 
  estimatedCost?: number;
  description?: string;
  priority?: 'Baja' | 'Media' | 'Alta';
  targetAttendees?: number;
}
export interface E14Report { id: string; stationId: string; tableNumber: string; votesCandidate: number; votesOpponent: number; imageUrl?: string; timestamp: string; }
export interface Broadcast { id: string; name: string; channel: 'WhatsApp' | 'SMS' | 'Email'; status: 'Procesando' | 'Enviado' | 'Error'; sentCount: number; deliveredCount: number; segment: string; message: string; date: string; activeStatus: 'active' | 'archived'; }
export interface CampaignTask { id: string; title: string; type: 'Puerta a Puerta' | 'Llamadas' | 'Logística' | 'Pegar Publicidad'; assignedTo: string; status: 'Pendiente' | 'En Progreso' | 'Completada'; deadline: string; progress: number; description: string; }
export interface TeamMember { id: string; name: string; role: string; territory: string; performance: number; email: string; status: 'active' | 'suspended'; }
export interface ComplianceObligation { 
  id: string; 
  title: string; 
  deadline: string; 
  status: 'Pendiente' | 'En Revisión' | 'Cumplido' | 'Vencido'; 
  priority: 'Alta' | 'Media' | 'Baja'; 
  type: 'Cuentas Claras' | 'Registro Libros' | 'Publicidad Exterior' | 'Laboral / Contratos' | 'Otros'; 
  evidence?: string; 
  evidenceData?: string; 
  lastValidated?: string; // Fecha en que se subió/validó
  validityDays?: number; // Cuánto tiempo es válido el documento (ej. 30 días para certificados)
  periodicity?: 'Única' | 'Semanal' | 'Quincenal' | 'Mensual'; // Para reportes recurrentes
}
export interface AuditLog { id: string; actor: string; action: string; timestamp: string; module: string; severity: 'Info' | 'Warning' | 'Critical'; ip: string; }

interface CRMContextType {
  contacts: Contact[];
  territory: TerritoryZone[];
  finance: FinanceTransaction[];
  witnesses: any[];
  events: CampaignEvent[];
  e14Reports: E14Report[];
  broadcasts: Broadcast[];
  tasks: CampaignTask[];
  team: TeamMember[];
  compliance: ComplianceObligation[];
  auditLogs: AuditLog[];
  campaignGoal: number;
  TOPE_LEGAL_CNE: number;
  addContact: (contact: Omit<Contact, 'id' | 'createdAt' | 'status'>) => void;
  updateContact: (id: string, contact: Partial<Contact>) => void;
  toggleContactStatus: (id: string) => void;
  moveContactStage: (id: string, newStage: PipelineStage) => void;
  addTerritoryZone: (zone: Omit<TerritoryZone, 'id' | 'current'>) => void;
  updateTerritoryZone: (id: string, zone: Partial<TerritoryZone>) => void;
  deleteTerritoryZone: (id: string) => void;
  addFinanceTransaction: (transaction: Omit<FinanceTransaction, 'id'>) => void;
  updateFinanceTransaction: (id: string, transaction: Partial<FinanceTransaction>) => void;
  deleteFinanceTransaction: (id: string) => void;
  updateCampaignGoal: (goal: number) => void;
  addEvent: (event: Omit<CampaignEvent, 'id'>) => void;
  updateEvent: (id: string, event: Partial<CampaignEvent>) => void;
  deleteEvent: (id: string) => void;
  rsvpEvent: (id: string) => void;
  reportE14: (report: Omit<E14Report, 'id' | 'timestamp'>) => void;
  sendBroadcast: (broadcast: Omit<Broadcast, 'id' | 'status' | 'sentCount' | 'deliveredCount' | 'date' | 'activeStatus'>) => void;
  updateBroadcast: (id: string, broadcast: Partial<Broadcast>) => void;
  toggleBroadcastStatus: (id: string) => void;
  addTask: (task: Omit<CampaignTask, 'id' | 'status' | 'progress'>) => void;
  completeTask: (id: string) => void;
  inviteMember: (member: Omit<TeamMember, 'id' | 'performance' | 'status'>) => void;
  updateMember: (id: string, member: Partial<TeamMember>) => void;
  toggleMemberStatus: (id: string) => void;
  addComplianceObligation: (obligation: Omit<ComplianceObligation, 'id' | 'status' | 'evidence'>) => void;
  uploadEvidence: (id: string, fileName: string, fileData?: string) => void;
  removeEvidence: (id: string) => void;
  logAction: (actor: string, action: string, module: string, severity?: AuditLog['severity']) => void;
  getExecutiveKPIs: () => any;
  getTerritoryStats: () => TerritoryZone[];
  getFinanceSummary: () => any;
  getProjectedCompliance: () => any;
  getElectionResults: () => any;
  getTeamStats: () => any;
  getComplianceScore: () => number;
}

const CRMContext = createContext<CRMContextType | undefined>(undefined);

const DEFAULT_COMPLIANCE: ComplianceObligation[] = [
  { id: 'cne-1', title: 'Apertura de Cuenta Única Bancaria', deadline: '2025-11-01', status: 'Cumplido', priority: 'Alta', type: 'Cuentas Claras', evidence: 'cert_bancaria_bbva.pdf', validityDays: 365, periodicity: 'Única' },
  { id: 'cne-2', title: 'Registro de Libros ante el CNE', deadline: '2025-11-15', status: 'Cumplido', priority: 'Alta', type: 'Cuentas Claras', evidence: 'resolucion_libros_001.pdf', periodicity: 'Única' },
  { id: 'cne-3', title: 'Designación de Gerente y Contador', deadline: '2025-12-01', status: 'Cumplido', priority: 'Alta', type: 'Cuentas Claras', evidence: 'acta_nombramiento.pdf', periodicity: 'Única' },
  { id: 'cne-4', title: 'Registro de Propaganda Electoral (Vallas)', deadline: '2026-01-15', status: 'Cumplido', priority: 'Alta', type: 'Publicidad Exterior', evidence: 'resolucion_vallas_medellin.pdf', validityDays: 60, periodicity: 'Única' },
  { id: 'cne-5', title: 'Reporte Semanal de Ingresos y Gastos #10', deadline: '2026-03-01', status: 'Pendiente', priority: 'Alta', type: 'Cuentas Claras', validityDays: 7, periodicity: 'Semanal' },
  { id: 'cne-6', title: 'Contrato de Arrendamiento Sede Campaña', deadline: '2025-12-10', status: 'Cumplido', priority: 'Media', type: 'Laboral / Contratos', evidence: 'contrato_sede.pdf', validityDays: 180, periodicity: 'Única' },
  { id: 'cne-7', title: 'Permiso de Publicidad Móvil (Perifoneo)', deadline: '2026-03-05', status: 'Pendiente', priority: 'Media', type: 'Publicidad Exterior', validityDays: 15, periodicity: 'Quincenal' },
  { id: 'cne-8', title: 'Certificación de No Superación de Topes Individuales', deadline: '2026-03-10', status: 'Pendiente', priority: 'Alta', type: 'Cuentas Claras', periodicity: 'Única' },
  { id: 'cne-9', title: 'Contrato Equipo de Logística (Día D)', deadline: '2026-03-05', status: 'Pendiente', priority: 'Media', type: 'Laboral / Contratos', periodicity: 'Única' },
];

const DEFAULT_FINANCE: FinanceTransaction[] = [
  { id: 'tx-1', concept: 'Aporte Partido Político - Anticipo', amount: 150000000, type: 'Ingreso', category: 'Aportes', date: '2025-12-05', status: 'REPORTED_CNE', vendorTaxId: '800.123.456-1' },
  { id: 'tx-2', concept: 'Arrendamiento Sede Principal Medellín', amount: 12000000, type: 'Gasto', category: 'Administración', date: '2026-01-05', status: 'REPORTED_CNE', cneCode: 'SEDE_CAMPANA', vendorTaxId: '900.555.444-2' },
  { id: 'tx-3', concept: 'Producción de 20 Vallas Publicitarias', amount: 45000000, type: 'Gasto', category: 'Publicidad', date: '2026-01-15', status: 'REPORTED_CNE', cneCode: 'PUBLICIDAD_VALLAS', vendorTaxId: '860.000.111-9' },
  { id: 'tx-4', concept: 'Kit de Volanteo y Material P.O.P.', amount: 18000000, type: 'Gasto', category: 'Publicidad', date: '2026-02-01', status: 'APPROVED', cneCode: 'MATERIAL_POP', vendorTaxId: '700.111.222-3' },
  { id: 'tx-5', concept: 'Asesoría Estratégica y Encuestas', amount: 35000000, type: 'Gasto', category: 'Estrategia', date: '2026-02-10', status: 'APPROVED', cneCode: 'INVERSION_ESTADISTICA', vendorTaxId: '901.222.333-5' },
  { id: 'tx-6', concept: 'Transporte Giras Municipales (Antioquia)', amount: 8500000, type: 'Gasto', category: 'Logística', date: '2026-02-15', status: 'PENDING', cneCode: 'TRANSPORTE', vendorTaxId: '800.999.888-0' },
  { id: 'tx-7', concept: 'Evento Gran Lanzamiento (Plaza Mayor)', amount: 55000000, type: 'Gasto', category: 'Eventos', date: '2026-02-20', status: 'PENDING', cneCode: 'ACTOS_PUBLICOS', vendorTaxId: '890.333.444-1' },
];

export function CRMProvider({ children }: { children: React.ReactNode }) {
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [territory, setTerritory] = useState<TerritoryZone[]>([]);
  const [finance, setFinance] = useState<FinanceTransaction[]>([]);
  const [witnesses, setWitnesses] = useState<any[]>([]);
  const [events, setEvents] = useState<CampaignEvent[]>([]);
  const [e14Reports, setE14Reports] = useState<E14Report[]>([]);
  const [broadcasts, setBroadcasts] = useState<Broadcast[]>([]);
  const [tasks, setTasks] = useState<CampaignTask[]>([]);
  const [team, setTeam] = useState<TeamMember[]>([]);
  const [compliance, setCompliance] = useState<ComplianceObligation[]>([]);
  const [auditLogs, setAuditLogs] = useState<AuditLog[]>([]);
  const [campaignGoal, setCampaignGoal] = useState<number>(50000);
  const [isLoaded, setIsLoaded] = useState(false);

  // CARGA INICIAL (Solo una vez)
  useEffect(() => {
    const parse = (key: string, def: any) => {
      if (typeof window === 'undefined') return def;
      const saved = localStorage.getItem(key);
      if (!saved) return def;
      try {
        const parsed = JSON.parse(saved);
        // Si es un array vacío en localStorage, usamos el default
        // para asegurar que las obligaciones base aparezcan la primera vez
        return Array.isArray(parsed) && parsed.length === 0 ? def : parsed;
      } catch {
        return def;
      }
    };

    // Helper to ensure unique IDs across legacy data
    const fixIds = (data: any[], prefix: string) => {
      const seen = new Set();
      return data.map((item, index) => {
        if (!item.id || seen.has(item.id)) {
          const newId = `${prefix}-${Date.now()}-${index}-${Math.random().toString(36).substring(2, 9)}`;
          seen.add(newId);
          return { ...item, id: newId };
        }
        seen.add(item.id);
        return item;
      });
    };

    const loadedContacts = fixIds(parse('crm_contacts', []), 'contact');
    const loadedGoal = parse('crm_campaign_goal', 50000);
    const loadedFinance = fixIds(parse('crm_finance', DEFAULT_FINANCE), 'tx');
    const loadedWitnesses = parse('crm_witnesses', []);
    const loadedEvents = fixIds(parse('crm_events', []), 'e');
    const loadedReports = fixIds(parse('crm_reports', []), 'rep');
    const loadedBroadcasts = fixIds(parse('crm_broadcasts', []), 'br');
    const loadedTasks = fixIds(parse('crm_tasks', []), 'tk');
    const loadedTeam = fixIds(parse('crm_team', []), 'u');
    const loadedCompliance = fixIds(parse('crm_compliance', DEFAULT_COMPLIANCE), 'req').map((o: any) => ({
      ...o,
      periodicity: o.periodicity || 'Única',
      validityDays: o.validityDays || (o.periodicity === 'Semanal' ? 7 : o.periodicity === 'Quincenal' ? 15 : o.periodicity === 'Mensual' ? 30 : 365)
    }));
    const loadedAudit = fixIds(parse('crm_audit', []), 'log');

    // Mezclar Territorio
    const savedTerritory = fixIds(parse('crm_territory', []), 'tz');
    const mergedMap = new Map();
    MEDELLIN_ZONES.forEach(z => mergedMap.set(z.name.toLowerCase(), { ...z }));
    
    savedTerritory.forEach((z: TerritoryZone) => {
      const normalizedInput = z.name.toLowerCase();
      let foundKey = null;
      for (const officialName of mergedMap.keys()) {
        if (officialName === normalizedInput || officialName.includes(normalizedInput) || normalizedInput.includes(officialName)) {
          foundKey = officialName;
          break;
        }
      }
      if (foundKey) {
        const existing = mergedMap.get(foundKey);
        mergedMap.set(foundKey, { ...existing, target: z.target || existing.target, leader: z.leader || existing.leader });
      } else {
        mergedMap.set(normalizedInput, z);
      }
    });

     
    setContacts(loadedContacts);
    setCampaignGoal(loadedGoal);
    setFinance(loadedFinance);
    setWitnesses(loadedWitnesses);
    setEvents(loadedEvents);
    setE14Reports(loadedReports);
    setBroadcasts(loadedBroadcasts);
    setTasks(loadedTasks);
    setTeam(loadedTeam);
    setCompliance(loadedCompliance);
    setAuditLogs(loadedAudit);
    setTerritory(Array.from(mergedMap.values()));
    
    setIsLoaded(true);
  }, []);

  // PERSISTENCIA
  useEffect(() => {
    if (!isLoaded) return;
    const save = (key: string, val: any) => localStorage.setItem(key, JSON.stringify(val));
    save('crm_contacts', contacts);
    save('crm_campaign_goal', campaignGoal);
    save('crm_territory', territory);
    save('crm_finance', finance);
    save('crm_witnesses', witnesses);
    save('crm_events', events);
    save('crm_reports', e14Reports);
    save('crm_broadcasts', broadcasts);
    save('crm_tasks', tasks);
    save('crm_team', team);
    save('crm_compliance', compliance);
    save('crm_audit', auditLogs);
  }, [isLoaded, contacts, territory, finance, witnesses, events, e14Reports, broadcasts, tasks, team, compliance, auditLogs, campaignGoal]);

  // FUNCIONES
  const logAction = useCallback((actor: string, action: string, module: string, severity: AuditLog['severity'] = 'Info') => {
    const log: AuditLog = { id: `log-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`, actor, action, timestamp: new Date().toISOString(), module, severity, ip: '127.0.0.1' };
    setAuditLogs(prev => [log, ...prev]);
  }, []);

  const addContact = useCallback((c: Omit<Contact, 'id' | 'createdAt' | 'status'>) => {
    setContacts(prev => [{ ...c, id: `contact-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`, createdAt: new Date().toISOString(), status: 'active' } as Contact, ...prev]);
    logAction('Sistema', `Nuevo registro: ${c.name} (${c.neighborhood})`, 'Votantes', 'Info');
  }, [logAction]);

  const updateContact = useCallback((id: string, f: Partial<Contact>) => {
    setContacts(prev => prev.map(c => c.id === id ? { ...c, ...f } : c));
  }, []);

  const toggleContactStatus = useCallback((id: string) => { 
    setContacts(prev => prev.map(c => c.id === id ? { ...c, status: c.status === 'active' ? 'archived' : 'active' } : c)); 
  }, []);

  const moveContactStage = useCallback((id: string, s: PipelineStage) => {
    setContacts(prev => prev.map(c => c.id === id ? { ...c, stage: s } : c));
    logAction('Sistema', `Cambio de fase: ${contacts.find(c => c.id === id)?.name} -> ${s}`, 'Votantes', 'Info');
  }, [contacts, logAction]);
  
  const addTerritoryZone = useCallback((z: Omit<TerritoryZone, 'id' | 'current'>) => {
    setTerritory(prev => [...prev, { ...z, id: `tz-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`, current: 0 }]);
  }, []);

  const updateTerritoryZone = useCallback((id: string, z: Partial<TerritoryZone>) => {
    setTerritory(prev => prev.map(item => item.id === id ? { ...item, ...z } : item));
  }, []);

  const deleteTerritoryZone = useCallback((id: string) => {
    setTerritory(prev => prev.filter(z => z.id !== id));
  }, []);

  const addFinanceTransaction = useCallback((t: Omit<FinanceTransaction, 'id'>) => {
    setFinance(prev => [{ ...t, id: `tx-${Date.now()}-${Math.random().toString(36).substring(2, 9)}` }, ...prev]);
    logAction('Tesorero', `${t.type}: ${t.concept} - $${t.amount.toLocaleString()}`, 'Finanzas', 'Info');
  }, [logAction]);

  const updateFinanceTransaction = useCallback((id: string, t: Partial<FinanceTransaction>) => {
    setFinance(prev => prev.map(item => {
      if (item.id === id) {
        // Regla de inmutabilidad: No se puede editar si ya fue reportado al CNE
        if (item.status === 'REPORTED_CNE') return item;
        return { ...item, ...t };
      }
      return item;
    }));
  }, []);

  const deleteFinanceTransaction = useCallback((id: string) => {
    setFinance(prev => prev.filter(t => {
      // Regla de inmutabilidad: No se puede borrar si ya fue reportado al CNE
      if (t.id === id && t.status === 'REPORTED_CNE') return true;
      return t.id !== id;
    }));
  }, []);

  const updateCampaignGoal = useCallback((goal: number) => {
    setCampaignGoal(goal);
  }, []);

  const addEvent = useCallback((e: Omit<CampaignEvent, 'id'>) => { 
    setEvents(prev => [{...e, id: `e-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`}, ...prev]); 
    logAction('Operaciones', `Evento creado: ${e.title}`, 'Eventos', 'Info');
  }, [logAction]);
  const updateEvent = useCallback((id: string, f: Partial<CampaignEvent>) => { setEvents(prev => prev.map(e => e.id === id ? { ...e, ...f } : e)); }, []);
  const deleteEvent = useCallback((id: string) => { setEvents(prev => prev.filter(e => e.id !== id)); }, []);
  const rsvpEvent = useCallback((id: string) => { setEvents(prev => prev.map(e => e.id === id ? { ...e, attendeesCount: e.attendeesCount + 1 } : e)); }, []);
  const reportE14 = useCallback((r: Omit<E14Report, 'id' | 'timestamp'>) => { 
    setE14Reports(prev => {
      const existingIndex = prev.findIndex(rep => rep.stationId === r.stationId && rep.tableNumber === r.tableNumber);
      if (existingIndex >= 0) {
        const updated = [...prev];
        updated[existingIndex] = { ...updated[existingIndex], ...r, timestamp: new Date().toISOString() };
        return updated;
      }
      return [...prev, {...r, id: `rep-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`, timestamp: new Date().toISOString()}];
    });
  }, []);
  const sendBroadcast = useCallback((d: Omit<Broadcast, 'id' | 'status' | 'sentCount' | 'deliveredCount' | 'date' | 'activeStatus'>) => {
    const id = `br-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
    setBroadcasts(prev => [{...d, id, status: 'Procesando', sentCount: 0, deliveredCount: 0, date: new Date().toISOString().split('T')[0], activeStatus: 'active'} as Broadcast, ...prev]);
    setTimeout(() => setBroadcasts(prev => prev.map(b => b.id === id ? {...b, status: 'Enviado', sentCount: 100, deliveredCount: 98} : b)), 2000);
  }, []);
  const updateBroadcast = useCallback((id: string, d: Partial<Broadcast>) => { setBroadcasts(prev => prev.map(b => b.id === id ? { ...b, ...d } : b)); }, []);
  const toggleBroadcastStatus = useCallback((id: string) => { setBroadcasts(prev => prev.map(b => b.id === id ? { ...b, activeStatus: b.activeStatus === 'active' ? 'archived' : 'active' } : b)); }, []);
  const addTask = useCallback((t: Omit<CampaignTask, 'id' | 'status' | 'progress'>) => { setTasks(prev => [{...t, id: `tk-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`, status: 'Pendiente', progress: 0}, ...prev]); }, []);
  const completeTask = useCallback((id: string) => { 
    setTasks(prev => prev.map(x => x.id === id ? {...x, status: 'Completada', progress: 100} : x));
  }, []);
  const inviteMember = useCallback((m: Omit<TeamMember, 'id' | 'performance' | 'status'>) => { setTeam(prev => [{...m, id: `u-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`, performance: 0, status: 'active'}, ...prev]); }, []);
  const updateMember = useCallback((id: string, m: Partial<TeamMember>) => { setTeam(prev => prev.map(member => member.id === id ? { ...member, ...m } : member)); }, []);
  const toggleMemberStatus = useCallback((id: string) => { setTeam(prev => prev.map(member => member.id === id ? { ...member, status: member.status === 'active' ? 'suspended' : 'active' } : member)); }, []);
  const addComplianceObligation = useCallback((o: Omit<ComplianceObligation, 'id' | 'status' | 'evidence'>) => {
    setCompliance(prev => [{...o, id: `req-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`, status: 'Pendiente'}, ...prev]);
    logAction('Admin', `Nueva obligación creada: ${o.title}`, 'Compliance', 'Warning');
  }, [logAction]);
  const uploadEvidence = useCallback((id: string, fileName: string, fileData?: string) => {
    setCompliance(prev => {
      const newCompliance = [...prev];
      const index = newCompliance.findIndex(o => o.id === id);
      
      if (index === -1) return prev;
      
      const o = { ...newCompliance[index] };
      const now = new Date();
      // Generar string YYYY-MM-DD local
      const getLocalDateStr = (d: Date) => {
        const y = d.getFullYear();
        const m = String(d.getMonth() + 1).padStart(2, '0');
        const day = String(d.getDate()).padStart(2, '0');
        return `${y}-${m}-${day}`;
      };
      
      const todayStr = getLocalDateStr(now);
      
      // 2. Detección forzada de periodicidad (Mejorada para Cuentas Claras)
      let p = o.periodicity;
      const t = o.title.toLowerCase();
      if (!p || p === 'Única') {
        if (t.includes('semanal') || t.includes('ingresos') || t.includes('gastos') || o.type === 'Cuentas Claras') p = 'Semanal';
        else if (t.includes('quincenal') || t.includes('permiso')) p = 'Quincenal';
        else if (t.includes('mensual') || t.includes('contrato') || t.includes('valla')) p = 'Mensual';
        else p = 'Única';
      }

      // 3. Lógica de Salto de Fecha (Bulletproof)
      if (p !== 'Única') {
        // Usar T12:00:00 para evitar errores de zona horaria al parsear
        let dateObj = new Date(o.deadline + 'T12:00:00');
        if (isNaN(dateObj.getTime())) dateObj = new Date();

        const advance = (d: Date) => {
          const res = new Date(d.getTime());
          if (p === 'Semanal') res.setDate(res.getDate() + 7);
          else if (p === 'Quincenal') res.setDate(res.getDate() + 15);
          else if (p === 'Mensual') res.setMonth(res.getMonth() + 1);
          return res;
        };

        // Salto inicial obligatorio: estamos cumpliendo el hito de ESTA fecha
        dateObj = advance(dateObj);

        // Si la nueva fecha aún está en el pasado o es hoy, seguimos saltando hasta el futuro
        let limit = 0;
        while (getLocalDateStr(dateObj) <= todayStr && limit < 52) {
          dateObj = advance(dateObj);
          limit++;
        }
        
        o.deadline = getLocalDateStr(dateObj);
      }

      // 4. REEMPLAZO SEGURO Y TOTAL
      // Limpiamos explícitamente cualquier rastro del archivo anterior
      o.evidence = undefined;
      o.evidenceData = undefined;

      o.status = 'Cumplido';
      o.evidence = fileName;
      o.evidenceData = fileData;
      o.lastValidated = now.toISOString();
      o.periodicity = p;
      // Validez según periodicidad para el semáforo
      o.validityDays = o.validityDays || (p === 'Semanal' ? 7 : p === 'Quincenal' ? 15 : p === 'Mensual' ? 30 : 365);
      
      newCompliance[index] = o;
      return newCompliance;
    });
    
    logAction('Sistema', 'Soporte legal reemplazado y archivo anterior eliminado permanentemente.', 'Compliance', 'Info');
  }, [logAction]);

  const removeEvidence = useCallback((id: string) => {
    setCompliance(prev => prev.map(o => o.id === id ? { ...o, status: 'Pendiente', evidence: undefined, evidenceData: undefined } : o));
    logAction('Sistema', `Evidencia eliminada para hito: ${id}`, 'Compliance', 'Warning');
  }, [logAction]);

  // ENRIQUECIMIENTO (Reactivo a contacts)
  const enrichedTerritory = useMemo(() => {
    return territory.map(zone => {
      const zoneNameLow = zone.name.toLowerCase();
      const current = contacts.filter(c => {
        const contactNeighborLow = c.neighborhood.toLowerCase();
        return zoneNameLow === contactNeighborLow || 
               zoneNameLow.includes(contactNeighborLow) || 
               contactNeighborLow.includes(zoneNameLow);
      }).length;
      return { ...zone, current };
    });
  }, [territory, contacts]);

  const getExecutiveKPIs = () => ({ 
    totalContacts: contacts.length, 
    firmVotes: contacts.filter(c => c.stage === 'Firme' || c.stage === 'Votó').length, 
    coverageNeighborhoods: new Set(contacts.map(c => c.neighborhood)).size, 
    progressPercentage: (contacts.filter(c => c.stage === 'Firme' || c.stage === 'Votó').length / (campaignGoal || 1)) * 100,
    campaignGoal,
    eventsCount: events.length
  });
  const getTerritoryStats = () => enrichedTerritory;
  const getFinanceSummary = () => ({ 
    totalIncome: finance.filter(f => f.type === 'Ingreso').reduce((a, b) => a + Number(b.amount || 0), 0), 
    totalExpenses: finance.filter(f => f.type === 'Gasto').reduce((a, b) => a + Number(b.amount || 0), 0), 
    balance: finance.filter(f => f.type === 'Ingreso').reduce((a, b) => a + Number(b.amount || 0), 0) - finance.filter(f => f.type === 'Gasto').reduce((a, b) => a + Number(b.amount || 0), 0) 
  });
  const getElectionResults = () => ({ 
    myVotes: e14Reports.reduce((a, b) => a + Number(b.votesCandidate || 0), 0), 
    opponentVotes: e14Reports.reduce((a, b) => a + Number(b.votesOpponent || 0), 0), 
    tablesReported: e14Reports.length, 
    totalTables: 0 // Se gestionará desde el API
  });
  const getTeamStats = () => ({ totalTasks: tasks.length, completedTasks: tasks.filter(t => t.status === 'Completada').length, teamEfficiency: tasks.length > 0 ? (tasks.filter(t => t.status === 'Completada').length / tasks.length) * 100 : 0 });
  const getComplianceScore = () => compliance.length > 0 ? (compliance.filter(o => o.status === 'Cumplido').length / compliance.length) * 100 : 0;
  
  const TOPE_LEGAL_CNE = 850000000;

  const getProjectedCompliance = useCallback(() => {
      // 1. Gastos Reales (Aprobados y Reportados)
      const actualExpenses = finance
        .filter(f => f.type === 'Gasto' && (f.status === 'APPROVED' || f.status === 'REPORTED_CNE'))
        .reduce((a, b) => a + Number(b.amount || 0), 0);

      // 2. Gastos en Proceso (Pendientes)
      const pendingExpenses = finance
        .filter(f => f.type === 'Gasto' && f.status === 'PENDING')
        .reduce((a, b) => a + Number(b.amount || 0), 0);

      // 3. Gastos Proyectados (Eventos sin transacción vinculada)
      const projectedEventsCost = events.reduce((acc, event) => {
         const hasTransaction = finance.some(f => f.relatedEntityId === event.id);
         if (hasTransaction) return acc;
         
         const estimated = Number(event.estimatedCost || 0) || (Number(event.attendeesCount || 0) * 8000); // 8000 COP por persona (ajuste logística)
         return acc + (isNaN(estimated) ? 0 : estimated);
      }, 0);

      const totalProjected = actualExpenses + pendingExpenses + projectedEventsCost;
      
      return {
          actualExpenses,
          pendingExpenses,
          projectedEventsCost,
          totalProjected,
          topeLegal: TOPE_LEGAL_CNE,
          executionPercentage: (totalProjected / TOPE_LEGAL_CNE) * 100,
          isAtRisk: (totalProjected / TOPE_LEGAL_CNE) > 0.85
      };
  }, [finance, events, TOPE_LEGAL_CNE]);

  return (
    <CRMContext.Provider value={{ 
      contacts, territory: enrichedTerritory, finance, witnesses, events, e14Reports, broadcasts, tasks, team, compliance, auditLogs, campaignGoal, TOPE_LEGAL_CNE,
      addContact, updateContact, toggleContactStatus, moveContactStage, addTerritoryZone, updateTerritoryZone, deleteTerritoryZone, addFinanceTransaction, updateFinanceTransaction, deleteFinanceTransaction, updateCampaignGoal, addEvent, updateEvent, deleteEvent, rsvpEvent, reportE14, sendBroadcast, updateBroadcast, toggleBroadcastStatus, addTask, completeTask, inviteMember, updateMember, toggleMemberStatus, addComplianceObligation, uploadEvidence, removeEvidence, logAction,
      getExecutiveKPIs, getTerritoryStats, getFinanceSummary, getProjectedCompliance, getElectionResults, getTeamStats, getComplianceScore
    }}>
      {children}
    </CRMContext.Provider>
  );
}

export const useCRM = () => {
  const context = useContext(CRMContext);
  if (context === undefined) throw new Error('useCRM must be used within a CRMProvider');
  return context;
};
