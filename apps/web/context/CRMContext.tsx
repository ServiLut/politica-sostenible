"use client";

import React, { createContext, useContext, useState, useEffect, useCallback, useMemo } from 'react';
import { MEDELLIN_ZONES } from '../data/medellin-geo';
import { AUTH_TOKEN_KEY } from '@/lib/auth-token';

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
export interface OperationalAlert {
  id: string;
  severity: 'Critical' | 'Warning' | 'Info';
  module: 'Votantes' | 'Finanzas' | 'Territorio' | 'Compliance' | 'Operaciones';
  title: string;
  description: string;
  metric: string;
  actionLabel: string;
  actionHref: string;
}
export type OnboardingRole = 'Candidato' | 'Coordinador' | 'Tesorero';
export interface OnboardingStep {
  id: string;
  title: string;
  description: string;
  actionHref: string;
  completed: boolean;
}
export interface CampaignOnboarding {
  role: OnboardingRole;
  startedAt: string;
  completedAt?: string;
  steps: OnboardingStep[];
}
export interface OperationalIntelligence {
  generatedAt: string;
  alerts: Array<{
    id: string;
    severity: 'Critical' | 'Warning' | 'Info';
    module: string;
    title: string;
    description: string;
    metric: string;
    actionHref: string;
  }>;
  adoption: {
    activeUsers7d: number;
    events7d: number;
    modulesUsed7d: number;
    moduleBreakdown: Array<{ module: string; events: number; lastEventAt: string | null }>;
    topActors: Array<{ userId: string; name: string; email: string; events: number }>;
  };
  health: {
    voters: number;
    financeEntries: number;
    tasksPending: number;
    tasksOverdue: number;
    complianceOverdue: number;
    expenseExecutionPercentage: number;
  };
}

const ONBOARDING_BLUEPRINT: Record<OnboardingRole, Omit<OnboardingStep, 'completed'>[]> = {
  Candidato: [
    { id: 'cand-1', title: 'Definir meta de votos', description: 'Ajusta el objetivo global de la campaña.', actionHref: '/dashboard/executive' },
    { id: 'cand-2', title: 'Validar cobertura territorial', description: 'Revisa zonas rezagadas y prioridades.', actionHref: '/dashboard/territory' },
    { id: 'cand-3', title: 'Revisar tablero ejecutivo', description: 'Confirma alertas y ruta semanal.', actionHref: '/dashboard/executive' },
  ],
  Coordinador: [
    { id: 'coord-1', title: 'Cargar primer bloque de votantes', description: 'Registra al menos 20 contactos base.', actionHref: '/dashboard/pipeline' },
    { id: 'coord-2', title: 'Crear tareas operativas', description: 'Asigna tareas con fecha y responsable.', actionHref: '/dashboard/tasks' },
    { id: 'coord-3', title: 'Programar evento territorial', description: 'Registra el primer evento con objetivo.', actionHref: '/dashboard/events' },
  ],
  Tesorero: [
    { id: 'tre-1', title: 'Registrar ingreso inicial', description: 'Carga la primera transacción de ingreso.', actionHref: '/dashboard/finance' },
    { id: 'tre-2', title: 'Registrar gasto con soporte', description: 'Asegura evidencia para cumplimiento.', actionHref: '/dashboard/finance' },
    { id: 'tre-3', title: 'Verificar tope CNE proyectado', description: 'Confirma riesgo financiero actual.', actionHref: '/dashboard/finance' },
  ],
};

function createOnboarding(role: OnboardingRole): CampaignOnboarding {
  const now = new Date().toISOString();
  return {
    role,
    startedAt: now,
    steps: ONBOARDING_BLUEPRINT[role].map((step) => ({
      ...step,
      completed: false,
    })),
  };
}

function normalizeOnboarding(data: unknown): CampaignOnboarding {
  if (!data || typeof data !== 'object' || Array.isArray(data)) {
    return createOnboarding('Coordinador');
  }

  const source = data as Record<string, unknown>;
  const role = (source.role === 'Candidato' || source.role === 'Coordinador' || source.role === 'Tesorero')
    ? source.role
    : 'Coordinador';
  const base = createOnboarding(role);

  const steps = Array.isArray(source.steps)
    ? source.steps.map((step, index) => {
      const fallback = base.steps[index] ?? base.steps[base.steps.length - 1];
      if (!step || typeof step !== 'object' || Array.isArray(step)) return fallback;
      const raw = step as Record<string, unknown>;
      return {
        id: typeof raw.id === 'string' ? raw.id : fallback.id,
        title: typeof raw.title === 'string' ? raw.title : fallback.title,
        description: typeof raw.description === 'string' ? raw.description : fallback.description,
        actionHref: typeof raw.actionHref === 'string' ? raw.actionHref : fallback.actionHref,
        completed: Boolean(raw.completed),
      };
    })
    : base.steps;

  const completedAt = typeof source.completedAt === 'string' ? source.completedAt : undefined;
  const startedAt = typeof source.startedAt === 'string' ? source.startedAt : base.startedAt;
  return { role, startedAt, completedAt, steps };
}

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
  onboarding: CampaignOnboarding;
  operationalIntelligence: OperationalIntelligence | null;
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
  uploadEvidence: (id: string, fileName: string, fileData?: string) => Promise<void>;
  removeEvidence: (id: string) => void;
  logAction: (actor: string, action: string, module: string, severity?: AuditLog['severity']) => void;
  getExecutiveKPIs: () => any;
  getTerritoryStats: () => TerritoryZone[];
  getFinanceSummary: () => any;
  getProjectedCompliance: () => any;
  getElectionResults: () => any;
  getTeamStats: () => any;
  getComplianceScore: () => number;
  getOperationalAlerts: () => OperationalAlert[];
  getOperationalIntelligence: () => OperationalIntelligence | null;
  setOnboardingRole: (role: OnboardingRole) => void;
  toggleOnboardingStep: (stepId: string) => void;
  getOnboardingProgress: () => { completed: number; total: number; percentage: number };
}

const CRMContext = createContext<CRMContextType | undefined>(undefined);

export function CRMProvider({ children }: { children: React.ReactNode }) {
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [territory, setTerritory] = useState<TerritoryZone[]>([]);
  const [finance, setFinance] = useState<FinanceTransaction[]>([]);
  const [witnesses] = useState<any[]>([]);
  const [events, setEvents] = useState<CampaignEvent[]>([]);
  const [e14Reports, setE14Reports] = useState<E14Report[]>([]);
  const [broadcasts, setBroadcasts] = useState<Broadcast[]>([]);
  const [tasks, setTasks] = useState<CampaignTask[]>([]);
  const [team, setTeam] = useState<TeamMember[]>([]);
  const [compliance, setCompliance] = useState<ComplianceObligation[]>([]);
  const [auditLogs, setAuditLogs] = useState<AuditLog[]>([]);
  const [campaignGoal, setCampaignGoal] = useState<number>(50000);
  const [onboarding, setOnboarding] = useState<CampaignOnboarding>(() =>
    createOnboarding('Coordinador'),
  );
  const [operationalIntelligence, setOperationalIntelligence] = useState<OperationalIntelligence | null>(null);
  const [, setIsLoaded] = useState(false);

  const normalizeCneCode = useCallback((code?: string) => {
    const supported = new Set([
      'PUBLICIDAD_VALLAS',
      'TRANSPORTE',
      'SEDE_CAMPANA',
      'ACTOS_PUBLICOS',
      'OTROS',
    ]);
    return supported.has(code || '') ? (code as CneCode) : 'OTROS';
  }, []);

  const getAuthContext = useCallback(async () => {
    const token = localStorage.getItem(AUTH_TOKEN_KEY);
    if (!token) return null;

    const meRes = await fetch('/api/auth/me', {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });

    if (!meRes.ok) return null;

    const mePayload = await meRes.json();
    const meData = mePayload?.data ?? mePayload;
    const meUser = meData?.user;
    const meTenant = meData?.tenant;

    if (!meUser?.id || !meTenant?.id) return null;

    return {
      token,
      tenantId: meTenant.id as string,
      userId: meUser.id as string,
    };
  }, []);

  const saveOperationsState = useCallback(
    async (payload: {
      events?: CampaignEvent[];
      tasks?: CampaignTask[];
      team?: TeamMember[];
      broadcasts?: Broadcast[];
      compliance?: ComplianceObligation[];
      territory?: TerritoryZone[];
      e14Reports?: E14Report[];
      campaignGoal?: number;
      onboarding?: CampaignOnboarding;
    }) => {
      const auth = await getAuthContext();
      if (!auth) return;

      await fetch('/api/operations/state', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${auth.token}`,
        },
        body: JSON.stringify(payload),
      });
    },
    [getAuthContext],
  );

  // FETCH REAL DATA FROM API (NestJS)
  const fetchAllData = useCallback(async () => {
    try {
      const auth = await getAuthContext();
      if (!auth) {
        setContacts([]);
        setFinance([]);
        setTeam([]);
        setEvents([]);
        setTerritory(MEDELLIN_ZONES);
        setOnboarding(createOnboarding('Coordinador'));
        setOperationalIntelligence(null);
        setIsLoaded(true);
        return;
      }

      const [votersRes, financeRes, operationsRes, intelligenceRes] = await Promise.all([
        fetch('/api/voters', {
          headers: {
            Authorization: `Bearer ${auth.token}`,
          },
        }),
        fetch('/api/finance', {
          headers: {
            Authorization: `Bearer ${auth.token}`,
          },
        }),
        fetch('/api/operations/state', {
          headers: {
            Authorization: `Bearer ${auth.token}`,
          },
        }),
        fetch('/api/operations/intelligence', {
          headers: {
            Authorization: `Bearer ${auth.token}`,
          },
        }),
      ]);

      const votersPayload = votersRes.ok ? await votersRes.json() : { data: [] };
      const votersData = votersPayload?.data ?? votersPayload ?? [];

      if (Array.isArray(votersData)) {
        setContacts(votersData.map((v: any) => ({
          id: v.id,
          name: `${v.firstName ?? ''} ${v.lastName ?? ''}`.trim(),
          cedula: v.documentId,
          phone: v.phone || '',
          address: '',
          neighborhood: 'Sin Puesto',
          role: (v.psychographicData?.role || 'Simpatizante') as ContactRole,
          stage: (v.psychographicData?.stage || 'Prospecto') as PipelineStage,
          createdAt: v.createdAt ?? new Date().toISOString(),
          status: 'active'
        })));
      }

      const financePayload = financeRes.ok ? await financeRes.json() : { data: [] };
      const financeData = financePayload?.data ?? financePayload ?? [];
      if (Array.isArray(financeData)) {
        setFinance(financeData.map((f: any) => ({
          id: f.id,
          concept: f.description,
          amount: Number(f.amount),
          type: f.type === 'INCOME' ? 'Ingreso' : 'Gasto',
          category: f.cneCode || 'OTROS',
          date: f.date,
          status: f.status,
          cneCode: normalizeCneCode(f.cneCode),
          vendorTaxId: f.vendorTaxId,
          evidenceUrl: f.evidenceUrl
        })));
      }

      const operationsPayload = operationsRes.ok ? await operationsRes.json() : { data: {} };
      const operationsData = operationsPayload?.data ?? operationsPayload ?? {};
      const intelligencePayload = intelligenceRes.ok ? await intelligenceRes.json() : { data: null };
      const intelligenceData = intelligencePayload?.data ?? intelligencePayload ?? null;
      setTeam(Array.isArray(operationsData.team) ? operationsData.team : []);
      setEvents(Array.isArray(operationsData.events) ? operationsData.events : []);
      setTasks(Array.isArray(operationsData.tasks) ? operationsData.tasks : []);
      setBroadcasts(Array.isArray(operationsData.broadcasts) ? operationsData.broadcasts : []);
      setCompliance(Array.isArray(operationsData.compliance) ? operationsData.compliance : []);
      setE14Reports(Array.isArray(operationsData.e14Reports) ? operationsData.e14Reports : []);
      setCampaignGoal(typeof operationsData.campaignGoal === 'number' ? operationsData.campaignGoal : 50000);
      setOnboarding(normalizeOnboarding(operationsData.onboarding));
      setOperationalIntelligence(intelligenceData);

      // Merge Territory with Real Data
      const votersByZone = votersData?.reduce((acc: any, _v: any) => {
        const zone = 'Sin Puesto';
        acc[zone] = (acc[zone] || 0) + 1;
        return acc;
      }, {}) || {};

      const mergedTerritory = MEDELLIN_ZONES.map(z => {
        // Encontrar si hay registros reales para esta comuna/zona
        const realCount = Object.entries(votersByZone).find(([name]) => 
          name.toLowerCase().includes(z.name.toLowerCase()) || 
          z.name.toLowerCase().includes(name.toLowerCase())
        )?.[1] as number || 0;

        return {
          ...z,
          current: realCount,
          target: z.target || 2500 // Default target if not set
        };
      });

      setTerritory(
        Array.isArray(operationsData.territory) && operationsData.territory.length > 0
          ? operationsData.territory
          : mergedTerritory,
      );
      setIsLoaded(true);
    } catch (error) {
      console.error('Error fetching CRM data:', error);
    }
  }, [getAuthContext, normalizeCneCode]);

  useEffect(() => {
    fetchAllData();
  }, [fetchAllData]);

  // FUNCIONES CON PERSISTENCIA EN SUPABASE
  const logAction = useCallback(async (actor: string, action: string, module: string, severity: AuditLog['severity'] = 'Info') => {
    const log: AuditLog = { 
      id: `log-${Date.now()}`, 
      actor, 
      action, 
      timestamp: new Date().toISOString(), 
      module, 
      severity, 
      ip: 'N/A' 
    };
    setAuditLogs(prev => [log, ...prev]);

    try {
      const auth = await getAuthContext();
      if (!auth) return;

      await fetch('/api/files/audit-logs', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${auth.token}`,
        },
        body: JSON.stringify({
          actor,
          action,
          module,
          severity,
        }),
      });
    } catch {
      // keep local log if remote audit fails
    }
  }, [getAuthContext]);

  const addContact = useCallback(async (c: Omit<Contact, 'id' | 'createdAt' | 'status'>) => {
    try {
      const names = c.name.split(' ');
      const firstName = names[0];
      const lastName = names.slice(1).join(' ');
      const auth = await getAuthContext();
      if (!auth) return;

      const res = await fetch('/api/voters', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${auth.token}`,
        },
        body: JSON.stringify({
          documentId: c.cedula,
          firstName,
          lastName: lastName || '.',
          phone: c.phone || undefined,
          psychographicData: {
            stage: c.stage,
            role: c.role,
          },
        }),
      });
      const payload = await res.json();
      const data = payload?.data ?? payload;

      if (res.ok && data) {
        const newContact: Contact = {
          ...c,
          id: data.id,
          createdAt: data.createdAt ?? new Date().toISOString(),
          status: 'active'
        };
        setContacts(prev => [newContact, ...prev]);
        logAction('Sistema', `Nuevo registro: ${c.name}`, 'Votantes', 'Info');
      }
    } catch (error) {
      console.error('Error adding contact:', error);
    }
  }, [getAuthContext, logAction]);

  const updateContact = useCallback(async (id: string, f: Partial<Contact>) => {
    try {
      const auth = await getAuthContext();
      if (!auth) return;
      const names = (f.name || '').trim().split(' ').filter(Boolean);
      const firstName = names[0];
      const lastName = names.slice(1).join(' ');

      await fetch(`/api/voters/${id}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${auth.token}`,
        },
        body: JSON.stringify({
          ...(f.cedula ? { documentId: f.cedula } : {}),
          ...(firstName ? { firstName } : {}),
          ...(lastName ? { lastName } : {}),
          ...(f.phone !== undefined ? { phone: f.phone } : {}),
          ...((f.stage || f.role) ? {
            psychographicData: {
              ...(f.stage ? { stage: f.stage } : {}),
              ...(f.role ? { role: f.role } : {}),
            },
          } : {}),
        }),
      });
    } catch {
      // optimistic update fallback
    } finally {
      setContacts(prev => prev.map(c => c.id === id ? { ...c, ...f } : c));
    }
  }, [getAuthContext]);

  const toggleContactStatus = useCallback((id: string) => { 
    setContacts(prev => prev.map(c => c.id === id ? { ...c, status: c.status === 'active' ? 'archived' : 'active' } : c)); 
  }, []);

  const moveContactStage = useCallback(async (id: string, s: PipelineStage) => {
    const contact = contacts.find(c => c.id === id);
    if (!contact) return;
    await updateContact(id, { stage: s });
    setContacts(prev => prev.map(c => c.id === id ? { ...c, stage: s } : c));
    logAction('Sistema', `Cambio de fase: ${contact.name} -> ${s}`, 'Votantes', 'Info');
  }, [contacts, logAction, updateContact]);
  
  const addTerritoryZone = useCallback((z: Omit<TerritoryZone, 'id' | 'current'>) => {
    setTerritory(prev => {
      const next = [...prev, { ...z, id: `tz-${Date.now()}`, current: 0 }];
      void saveOperationsState({ territory: next });
      return next;
    });
  }, [saveOperationsState]);

  const updateTerritoryZone = useCallback((id: string, z: Partial<TerritoryZone>) => {
    setTerritory(prev => {
      const next = prev.map(item => item.id === id ? { ...item, ...z } : item);
      void saveOperationsState({ territory: next });
      return next;
    });
  }, [saveOperationsState]);

  const deleteTerritoryZone = useCallback((id: string) => {
    setTerritory(prev => {
      const next = prev.filter(z => z.id !== id);
      void saveOperationsState({ territory: next });
      return next;
    });
  }, [saveOperationsState]);

  const addFinanceTransaction = useCallback(async (t: Omit<FinanceTransaction, 'id'>) => {
    try {
      const auth = await getAuthContext();
      if (!auth) return;
      const res = await fetch('/api/finance', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${auth.token}`,
        },
        body: JSON.stringify({
          type: t.type === 'Ingreso' ? 'INCOME' : 'EXPENSE',
          amount: t.amount,
          date: t.date,
          cneCode: normalizeCneCode(t.cneCode),
          description: t.concept,
          vendorName: 'No especificado',
          vendorTaxId: t.vendorTaxId || '0',
          evidenceUrl: t.evidenceUrl,
        }),
      });
      const payload = await res.json();
      const data = payload?.data ?? payload;

      if (res.ok && data) {
        setFinance(prev => [{ ...t, id: data.id }, ...prev]);
        logAction('Tesorero', `${t.type}: ${t.concept}`, 'Finanzas', 'Info');
      }
    } catch (error) {
      console.error('Error adding finance transaction:', error);
    }
  }, [getAuthContext, logAction, normalizeCneCode]);

  const updateFinanceTransaction = useCallback((id: string, t: Partial<FinanceTransaction>) => {
    void (async () => {
      try {
        const auth = await getAuthContext();
        if (!auth) return;
        await fetch(`/api/finance/${id}`, {
          method: 'PATCH',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${auth.token}`,
          },
          body: JSON.stringify({
            ...(t.amount !== undefined ? { amount: t.amount } : {}),
            ...(t.date ? { date: t.date } : {}),
            ...(t.cneCode ? { cneCode: normalizeCneCode(t.cneCode) } : {}),
            ...(t.concept ? { description: t.concept } : {}),
            ...(t.vendorTaxId !== undefined ? { vendorTaxId: t.vendorTaxId } : {}),
            ...(t.evidenceUrl !== undefined ? { evidenceUrl: t.evidenceUrl } : {}),
            ...(t.status ? { status: t.status } : {}),
          }),
        });
      } catch {
        // optimistic local update preserved
      } finally {
        setFinance(prev => prev.map(item => {
          if (item.id === id) {
            if (item.status === 'REPORTED_CNE') return item;
            return { ...item, ...t };
          }
          return item;
        }));
      }
    })();
  }, [getAuthContext, normalizeCneCode]);

  const deleteFinanceTransaction = useCallback((id: string) => {
    void (async () => {
      try {
        const auth = await getAuthContext();
        if (!auth) return;
        await fetch(`/api/finance/${id}`, {
          method: 'DELETE',
          headers: {
            Authorization: `Bearer ${auth.token}`,
          },
        });
      } catch {
        // optimistic local update preserved
      } finally {
        setFinance(prev => prev.filter(t => {
          if (t.id === id && t.status === 'REPORTED_CNE') return true;
          return t.id !== id;
        }));
      }
    })();
  }, [getAuthContext]);

  const updateCampaignGoal = useCallback((goal: number) => {
    setCampaignGoal(goal);
    void saveOperationsState({ campaignGoal: goal });
  }, [saveOperationsState]);

  const addEvent = useCallback((e: Omit<CampaignEvent, 'id'>) => { 
    setEvents(prev => {
      const next = [{...e, id: `e-${Date.now()}`}, ...prev];
      void saveOperationsState({ events: next });
      return next;
    }); 
    logAction('Operaciones', `Evento creado: ${e.title}`, 'Eventos', 'Info');
  }, [logAction, saveOperationsState]);
  const updateEvent = useCallback((id: string, f: Partial<CampaignEvent>) => {
    setEvents(prev => {
      const next = prev.map(e => e.id === id ? { ...e, ...f } : e);
      void saveOperationsState({ events: next });
      return next;
    });
  }, [saveOperationsState]);
  const deleteEvent = useCallback((id: string) => {
    setEvents(prev => {
      const next = prev.filter(e => e.id !== id);
      void saveOperationsState({ events: next });
      return next;
    });
  }, [saveOperationsState]);
  const rsvpEvent = useCallback((id: string) => {
    setEvents(prev => {
      const next = prev.map(e => e.id === id ? { ...e, attendeesCount: e.attendeesCount + 1 } : e);
      void saveOperationsState({ events: next });
      return next;
    });
  }, [saveOperationsState]);
  const reportE14 = useCallback((r: Omit<E14Report, 'id' | 'timestamp'>) => { 
    setE14Reports(prev => {
      const existingIndex = prev.findIndex(rep => rep.stationId === r.stationId && rep.tableNumber === r.tableNumber);
      if (existingIndex >= 0) {
        const updated = [...prev];
        updated[existingIndex] = { ...updated[existingIndex], ...r, timestamp: new Date().toISOString() };
        void saveOperationsState({ e14Reports: updated });
        return updated;
      }
      const next = [...prev, {...r, id: `rep-${Date.now()}`, timestamp: new Date().toISOString()}];
      void saveOperationsState({ e14Reports: next });
      return next;
    });
  }, [saveOperationsState]);
  const sendBroadcast = useCallback((d: Omit<Broadcast, 'id' | 'status' | 'sentCount' | 'deliveredCount' | 'date' | 'activeStatus'>) => {
    const id = `br-${Date.now()}`;
    setBroadcasts(prev => {
      const next: Broadcast[] = [{...d, id, status: 'Procesando', sentCount: 0, deliveredCount: 0, date: new Date().toISOString().split('T')[0], activeStatus: 'active'}, ...prev];
      void saveOperationsState({ broadcasts: next });
      return next;
    });
    setTimeout(() => setBroadcasts(prev => {
      const next: Broadcast[] = prev.map(b => b.id === id ? {...b, status: 'Enviado', sentCount: 100, deliveredCount: 98} : b);
      void saveOperationsState({ broadcasts: next });
      return next;
    }), 2000);
  }, [saveOperationsState]);
  const updateBroadcast = useCallback((id: string, d: Partial<Broadcast>) => {
    setBroadcasts(prev => {
      const next: Broadcast[] = prev.map(b => b.id === id ? { ...b, ...d } : b);
      void saveOperationsState({ broadcasts: next });
      return next;
    });
  }, [saveOperationsState]);
  const toggleBroadcastStatus = useCallback((id: string) => {
    setBroadcasts(prev => {
      const next: Broadcast[] = prev.map(b => b.id === id ? { ...b, activeStatus: b.activeStatus === 'active' ? 'archived' : 'active' } : b);
      void saveOperationsState({ broadcasts: next });
      return next;
    });
  }, [saveOperationsState]);
  const addTask = useCallback((t: Omit<CampaignTask, 'id' | 'status' | 'progress'>) => {
    setTasks(prev => {
      const next: CampaignTask[] = [{...t, id: `tk-${Date.now()}`, status: 'Pendiente', progress: 0}, ...prev];
      void saveOperationsState({ tasks: next });
      return next;
    });
  }, [saveOperationsState]);
  const completeTask = useCallback((id: string) => { 
    setTasks(prev => {
      const next: CampaignTask[] = prev.map(x => x.id === id ? {...x, status: 'Completada', progress: 100} : x);
      void saveOperationsState({ tasks: next });
      return next;
    });
  }, [saveOperationsState]);
  const inviteMember = useCallback((m: Omit<TeamMember, 'id' | 'performance' | 'status'>) => {
    setTeam(prev => {
      const next: TeamMember[] = [{...m, id: `u-${Date.now()}`, performance: 0, status: 'active'}, ...prev];
      void saveOperationsState({ team: next });
      return next;
    });
  }, [saveOperationsState]);
  const updateMember = useCallback((id: string, m: Partial<TeamMember>) => {
    setTeam(prev => {
      const next: TeamMember[] = prev.map(member => member.id === id ? { ...member, ...m } : member);
      void saveOperationsState({ team: next });
      return next;
    });
  }, [saveOperationsState]);
  const toggleMemberStatus = useCallback((id: string) => {
    setTeam(prev => {
      const next: TeamMember[] = prev.map(member => member.id === id ? { ...member, status: member.status === 'active' ? 'suspended' : 'active' } : member);
      void saveOperationsState({ team: next });
      return next;
    });
  }, [saveOperationsState]);
  const addComplianceObligation = useCallback((o: Omit<ComplianceObligation, 'id' | 'status' | 'evidence'>) => {
    setCompliance(prev => {
      const next: ComplianceObligation[] = [{...o, id: `req-${Date.now()}`, status: 'Pendiente'}, ...prev];
      void saveOperationsState({ compliance: next });
      return next;
    });
    logAction('Admin', `Nueva obligación creada: ${o.title}`, 'Compliance', 'Warning');
  }, [logAction, saveOperationsState]);
  const uploadEvidence = useCallback(async (id: string, fileName: string, fileData?: string) => {
    if (!fileData) return;
    let finalUrl = fileData;
    if (fileData.startsWith('data:')) {
      try {
        const auth = await getAuthContext();
        if (!auth) return;

        const dataUrlRes = await fetch(fileData);
        const blob = await dataUrlRes.blob();

        const uploadUrlRes = await fetch('/api/files/upload-url', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${auth.token}`,
          },
          body: JSON.stringify({
            module: 'compliance',
            fileName,
            contentType: blob.type || 'application/octet-stream',
          }),
        });

        if (!uploadUrlRes.ok) {
          throw new Error('No se pudo generar URL firmada');
        }

        const uploadUrlPayload = await uploadUrlRes.json();
        const uploadUrlData = uploadUrlPayload?.data ?? uploadUrlPayload;
        const signedUrl = uploadUrlData?.signedUrl as string | undefined;
        const path = uploadUrlData?.path as string | undefined;
        if (!signedUrl || !path) {
          throw new Error('Respuesta de URL firmada inválida');
        }

        const uploadRes = await fetch(signedUrl, {
          method: 'PUT',
          headers: {
            'Content-Type': blob.type || 'application/octet-stream',
            'x-upsert': 'false',
          },
          body: blob,
        });

        if (!uploadRes.ok) {
          throw new Error('Falló la subida directa al storage');
        }

        const confirmRes = await fetch('/api/files/confirm-upload', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${auth.token}`,
          },
          body: JSON.stringify({
            module: 'compliance',
            path,
            fileName,
            mimeType: blob.type || 'application/octet-stream',
          }),
        });

        if (!confirmRes.ok) {
          throw new Error('Falló la confirmación de archivo');
        }

        const confirmPayload = await confirmRes.json();
        const confirmData = confirmPayload?.data ?? confirmPayload;
        finalUrl = confirmData?.publicUrl || finalUrl;
      } catch (err) {
        console.error('Error uploading with signed URL flow:', err);
        return;
      }
    }

    setCompliance(prev => {
      const newCompliance = [...prev];
      const index = newCompliance.findIndex(o => o.id === id);
      if (index === -1) return prev;
      const o = { ...newCompliance[index] };
      const now = new Date();
      const getLocalDateStr = (d: Date) => {
        const y = d.getFullYear();
        const m = String(d.getMonth() + 1).padStart(2, '0');
        const day = String(d.getDate()).padStart(2, '0');
        return `${y}-${m}-${day}`;
      };
      const todayStr = getLocalDateStr(now);
      let p = o.periodicity;
      const t = o.title.toLowerCase();
      if (!p || p === 'Única') {
        if (t.includes('semanal') || t.includes('ingresos') || t.includes('gastos') || o.type === 'Cuentas Claras') p = 'Semanal';
        else if (t.includes('quincenal') || t.includes('permiso')) p = 'Quincenal';
        else if (t.includes('mensual') || t.includes('contrato') || t.includes('valla')) p = 'Mensual';
        else p = 'Única';
      }
      if (p !== 'Única') {
        let dateObj = new Date(o.deadline + 'T12:00:00');
        if (isNaN(dateObj.getTime())) dateObj = new Date();
        const advance = (d: Date) => {
          const res = new Date(d.getTime());
          if (p === 'Semanal') res.setDate(res.getDate() + 7);
          else if (p === 'Quincenal') res.setDate(res.getDate() + 15);
          else if (p === 'Mensual') res.setMonth(res.getMonth() + 1);
          return res;
        };
        dateObj = advance(dateObj);
        let limit = 0;
        while (getLocalDateStr(dateObj) <= todayStr && limit < 52) {
          dateObj = advance(dateObj);
          limit++;
        }
        o.deadline = getLocalDateStr(dateObj);
      }
      o.evidence = fileName;
      o.evidenceData = finalUrl; 
      o.status = 'Cumplido';
      o.lastValidated = now.toISOString();
      o.periodicity = p;
      o.validityDays = o.validityDays || (p === 'Semanal' ? 7 : p === 'Quincenal' ? 15 : p === 'Mensual' ? 30 : 365);
      newCompliance[index] = o;
      void saveOperationsState({ compliance: newCompliance });
      return newCompliance;
    });
    logAction('Sistema', 'Soporte legal cargado y vinculado correctamente.', 'Compliance', 'Info');
  }, [getAuthContext, logAction, saveOperationsState]);

  const removeEvidence = useCallback((id: string) => {
    setCompliance(prev => {
      const next: ComplianceObligation[] = prev.map(o => o.id === id ? { ...o, status: 'Pendiente', evidence: undefined, evidenceData: undefined } : o);
      void saveOperationsState({ compliance: next });
      return next;
    });
    logAction('Sistema', `Evidencia eliminada para hito: ${id}`, 'Compliance', 'Warning');
  }, [logAction, saveOperationsState]);

  const setOnboardingRole = useCallback((role: OnboardingRole) => {
    const next = createOnboarding(role);
    setOnboarding(next);
    void saveOperationsState({ onboarding: next });
  }, [saveOperationsState]);

  const toggleOnboardingStep = useCallback((stepId: string) => {
    setOnboarding((prev) => {
      const nextSteps = prev.steps.map((step) =>
        step.id === stepId ? { ...step, completed: !step.completed } : step,
      );
      const isCompleted = nextSteps.every((step) => step.completed);
      const next: CampaignOnboarding = {
        ...prev,
        steps: nextSteps,
        completedAt: isCompleted ? prev.completedAt || new Date().toISOString() : undefined,
      };
      void saveOperationsState({ onboarding: next });
      return next;
    });
  }, [saveOperationsState]);

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

  const getExecutiveKPIs = useCallback(() => ({ 
    totalContacts: contacts.length, 
    firmVotes: contacts.filter(c => c.stage === 'Firme' || c.stage === 'Votó').length, 
    coverageNeighborhoods: new Set(contacts.map(c => c.neighborhood)).size, 
    progressPercentage: (contacts.filter(c => c.stage === 'Firme' || c.stage === 'Votó').length / (campaignGoal || 1)) * 100,
    campaignGoal,
    eventsCount: events.length
  }), [campaignGoal, contacts, events.length]);
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
  const getOperationalIntelligence = () => operationalIntelligence;
  const getOnboardingProgress = () => {
    const total = onboarding.steps.length;
    const completed = onboarding.steps.filter((step) => step.completed).length;
    return {
      completed,
      total,
      percentage: total > 0 ? (completed / total) * 100 : 0,
    };
  };
  const getOperationalAlerts = useCallback((): OperationalAlert[] => {
    const alerts: OperationalAlert[] = [];
    const kpis = getExecutiveKPIs();
    const topeLegal = 850000000;
    const actualExpenses = finance
      .filter(f => f.type === 'Gasto' && (f.status === 'APPROVED' || f.status === 'REPORTED_CNE'))
      .reduce((a, b) => a + Number(b.amount || 0), 0);
    const pendingExpenses = finance
      .filter(f => f.type === 'Gasto' && f.status === 'PENDING')
      .reduce((a, b) => a + Number(b.amount || 0), 0);
    const projectedEventsCost = events.reduce((acc, event) => {
      const hasTransaction = finance.some(f => f.relatedEntityId === event.id);
      if (hasTransaction) return acc;
      const estimated = Number(event.estimatedCost || 0) || (Number(event.attendeesCount || 0) * 8000);
      return acc + (isNaN(estimated) ? 0 : estimated);
    }, 0);
    const executionPercentage = ((actualExpenses + pendingExpenses + projectedEventsCost) / topeLegal) * 100;
    const today = new Date();

    if (kpis.totalContacts < 200) {
      alerts.push({
        id: 'contacts-low',
        severity: 'Critical',
        module: 'Votantes',
        title: 'Base electoral insuficiente',
        description: 'El volumen actual de contactos es bajo para sostener la meta de campaña.',
        metric: `${kpis.totalContacts} contactos`,
        actionLabel: 'Cargar votantes',
        actionHref: '/dashboard/pipeline',
      });
    }

    if (kpis.progressPercentage < 35) {
      alerts.push({
        id: 'goal-progress-low',
        severity: 'Warning',
        module: 'Votantes',
        title: 'Conversión por debajo del objetivo',
        description: 'La proporción de votos firmes frente a la meta global está rezagada.',
        metric: `${kpis.progressPercentage.toFixed(1)}% de meta`,
        actionLabel: 'Ver embudo',
        actionHref: '/dashboard/pipeline',
      });
    }

    if (executionPercentage >= 90) {
      alerts.push({
        id: 'finance-overrun',
        severity: 'Critical',
        module: 'Finanzas',
        title: 'Riesgo alto de tope CNE',
        description: 'La proyección de ejecución financiera está demasiado cerca del límite legal.',
        metric: `${executionPercentage.toFixed(1)}% del tope`,
        actionLabel: 'Revisar finanzas',
        actionHref: '/dashboard/finance',
      });
    } else if (executionPercentage >= 80) {
      alerts.push({
        id: 'finance-near-limit',
        severity: 'Warning',
        module: 'Finanzas',
        title: 'Ejecución financiera en zona de cuidado',
        description: 'Se recomienda validar rubros pendientes y ajustar proyección de eventos.',
        metric: `${executionPercentage.toFixed(1)}% del tope`,
        actionLabel: 'Auditar rubros',
        actionHref: '/dashboard/finance',
      });
    }

    const overdueTasks = tasks.filter(
      (task) =>
        task.status !== 'Completada' &&
        task.deadline &&
        !Number.isNaN(new Date(task.deadline).getTime()) &&
        new Date(task.deadline) < today,
    ).length;

    if (overdueTasks > 0) {
      alerts.push({
        id: 'tasks-overdue',
        severity: overdueTasks > 5 ? 'Critical' : 'Warning',
        module: 'Operaciones',
        title: 'Tareas vencidas sin completar',
        description: 'Hay compromisos operativos atrasados que afectan ejecución territorial.',
        metric: `${overdueTasks} tareas vencidas`,
        actionLabel: 'Ver tareas',
        actionHref: '/dashboard/tasks',
      });
    }

    const overdueCompliance = compliance.filter((item) => item.status === 'Vencido').length;
    if (overdueCompliance > 0) {
      alerts.push({
        id: 'compliance-overdue',
        severity: 'Critical',
        module: 'Compliance',
        title: 'Obligaciones legales vencidas',
        description: 'Existen obligaciones sin soportes vigentes o fuera de plazo.',
        metric: `${overdueCompliance} vencidas`,
        actionLabel: 'Ir a compliance',
        actionHref: '/dashboard/compliance',
      });
    }

    const weakZones = enrichedTerritory.filter((zone) => {
      if (!zone.target || zone.target <= 0) return false;
      const ratio = zone.current / zone.target;
      return ratio < 0.5;
    }).length;

    if (weakZones > 0) {
      alerts.push({
        id: 'territory-coverage-low',
        severity: weakZones > 3 ? 'Warning' : 'Info',
        module: 'Territorio',
        title: 'Cobertura territorial desigual',
        description: 'Varias zonas clave están por debajo del 50% de su meta local.',
        metric: `${weakZones} zonas rezagadas`,
        actionLabel: 'Ver territorio',
        actionHref: '/dashboard/territory',
      });
    }

    if (alerts.length === 0) {
      alerts.push({
        id: 'system-healthy',
        severity: 'Info',
        module: 'Operaciones',
        title: 'Operación estable',
        description: 'No se detectan riesgos críticos inmediatos en los principales indicadores.',
        metric: 'Sin alertas críticas',
        actionLabel: 'Ver tablero',
        actionHref: '/dashboard',
      });
    }

    const weight: Record<OperationalAlert['severity'], number> = {
      Critical: 0,
      Warning: 1,
      Info: 2,
    };

    return alerts.sort((a, b) => weight[a.severity] - weight[b.severity]).slice(0, 6);
  }, [compliance, enrichedTerritory, events, finance, getExecutiveKPIs, tasks]);
  
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
      contacts, territory: enrichedTerritory, finance, witnesses, events, e14Reports, broadcasts, tasks, team, compliance, auditLogs, campaignGoal, onboarding, operationalIntelligence, TOPE_LEGAL_CNE,
      addContact, updateContact, toggleContactStatus, moveContactStage, addTerritoryZone, updateTerritoryZone, deleteTerritoryZone, addFinanceTransaction, updateFinanceTransaction, deleteFinanceTransaction, updateCampaignGoal, addEvent, updateEvent, deleteEvent, rsvpEvent, reportE14, sendBroadcast, updateBroadcast, toggleBroadcastStatus, addTask, completeTask, inviteMember, updateMember, toggleMemberStatus, addComplianceObligation, uploadEvidence, removeEvidence, logAction,
      setOnboardingRole, toggleOnboardingStep,
      getExecutiveKPIs, getTerritoryStats, getFinanceSummary, getProjectedCompliance, getElectionResults, getTeamStats, getComplianceScore, getOperationalAlerts, getOperationalIntelligence, getOnboardingProgress
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
