"use client";

import React, { createContext, useContext, useState, useEffect, useMemo, useCallback } from 'react';
import { 
  Users, 
  Target, 
  DollarSign, 
  Calendar, 
  TrendingUp, 
  ShieldAlert, 
  Bell, 
  Menu, 
  X, 
  UserCheck,
  Activity,
  MapPin,
  Search,
  Filter,
  Trash2,
  Edit,
  Phone,
  MessageSquare,
  CheckCircle2,
  Plus,
  ArrowUpRight,
  ArrowDownRight,
  Download,
  FileText,
  AlertTriangle,
  ExternalLink,
  Flag,
  Zap,
  Camera,
  Lock
} from 'lucide-react';
import { 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  ResponsiveContainer, 
  AreaChart, 
  Area,
  PieChart as RePieChart,
  Pie,
  Cell,
  Legend,
  BarChart,
  Bar
} from 'recharts';
import * as XLSX from 'xlsx';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

// --- CONSTANTS ---
const LIMITE_GASTOS_CNE = 50000000;
const BARRIOS = ["Usaquén", "Chapinero", "Santa Fe", "San Cristóbal", "Usme", "Tunjuelito", "Bosa", "Kennedy", "Fontibón", "Engativá"];

// --- TYPES & INTERFACES ---

type Role = 'SuperAdmin' | 'Gerente' | 'Contador' | 'LiderZonal' | 'Testigo';
type MissionStatus = 'Pendiente' | 'En Proceso' | 'Validación' | 'Completada';
type TransactionStatus = 'Borrador' | 'Pendiente de Soporte' | 'Legalizado';

interface Interaction {
  date: string;
  type: string;
  note: string;
}

interface Voter {
  id: number;
  cedula: string;
  name: string;
  phone: string;
  gender: 'M' | 'F' | 'O';
  barrio: string;
  puesto: string;
  mesa: number;
  intencion: number;
  interacciones: Interaction[];
  liderId: number;
}

interface Mission {
  id: number;
  voterId: number;
  title: string;
  status: MissionStatus;
  evidence?: string;
  assignedTo: number; // userId
  createdAt: string;
}

interface Campaign {
  id: number;
  name: string;
  segment: {
    barrios: string[];
    intenciones: number[];
  };
  audienceCount: number;
  status: 'Sent' | 'Draft';
  sentAt?: string;
  message: string;
}

interface Transaction {
  id: number;
  date: string;
  concept: string;
  amount: number;
  type: 'Ingreso' | 'Gasto';
  category: string;
  categoryCode: string;
  providerNit?: string;
  invoiceNumber?: string;
  status: TransactionStatus;
  createdBy: string;
  supportUrl: string;
}

interface E14Report {
  id: number;
  puesto: string;
  mesa: number;
  votosCandidato: number;
  votosOpositor: number;
  fotoUrl: string;
  timestamp: string;
  testigoId: number;
}

interface Alert {
  id: number;
  msg: string;
  time: string;
  type: 'fraud' | 'system' | 'operational';
  severity: 'high' | 'medium' | 'low';
}

interface User {
  id: number;
  name: string;
  role: Role;
  zona: string;
}

interface AppState {
  users: User[];
  voters: Voter[];
  missions: Mission[];
  messages: Campaign[];
  transactions: Transaction[];
  reports: E14Report[];
  alerts: Alert[];
  currentUser: User;
  budget: {
    meta: number;
    actual: number;
  };
  logs: { id: number; msg: string; time: string; type: 'info' | 'warning' | 'error' }[];
}

// --- CONTEXT SETUP ---

const AppContext = createContext<{
  state: AppState;
  setCurrentUser: (user: User) => void;
  setRole: (role: Role) => void;
  deleteVoter: (id: number) => void;
  addVoter: (voter: Omit<Voter, 'id'>) => void;
  updateVoter: (id: number, voter: Partial<Voter>) => void;
  addInteraction: (voterId: number, interaction: Interaction) => void;
  addTransaction: (tx: Omit<Transaction, 'id' | 'createdBy' | 'date'>) => void;
  addReport: (report: Omit<E14Report, 'id' | 'timestamp' | 'testigoId'>) => void;
  massImport: () => void;
  updateMissionStatus: (id: number, status: MissionStatus, evidence?: string) => void;
  createCampaign: (campaign: Omit<Campaign, 'id' | 'status'>) => void;
} | null>(null);

export const useApp = () => {
  const context = useContext(AppContext);
  if (!context) throw new Error("useApp must be used within AppProvider");
  return context;
};

// --- MOCK DATA GENERATOR ---

const generateInitialData = (): AppState => {
  const users: User[] = Array.from({ length: 50 }).map((_, i) => ({
    id: i + 1,
    name: i === 0 ? "Admin Principal" : i === 49 ? "Testigo Mesa 10" : `Usuario ${i + 1}`,
    role: i === 0 ? 'SuperAdmin' : i === 1 ? 'Contador' : i === 49 ? 'Testigo' : ['Gerente', 'LiderZonal'][i % 2] as Role,
    zona: BARRIOS[i % 10]
  }));

  const voters: Voter[] = Array.from({ length: 200 }).map((_, i) => ({
    id: i + 1,
    cedula: `1010${1000 + i}`,
    name: i % 2 === 0 ? `Votante ${i + 1} (F)` : `Votante ${i + 1} (M)`,
    phone: `300${1000000 + i}`,
    gender: i % 2 === 0 ? 'F' : 'M',
    barrio: BARRIOS[Math.floor(Math.random() * BARRIOS.length)],
    puesto: i % 5 === 0 ? "" : `Colegio ${BARRIOS[i % 10]}`,
    mesa: (i % 20) + 1,
    intencion: Math.floor(Math.random() * 5) + 1,
    interacciones: [
      { date: '2026-01-10', type: 'Llamada', note: 'Interesado en propuestas' },
      { date: '2026-02-05', type: 'Visita', note: 'Voto asegurado' }
    ],
    liderId: users.find(u => u.role === 'LiderZonal' && u.zona === BARRIOS[i % 10])?.id || 1
  }));

  const transactions: Transaction[] = [
    { 
      id: 1, 
      date: '2026-02-01', 
      concept: 'Donación Empresarial', 
      amount: 15000000, 
      type: 'Ingreso', 
      category: 'Donación', 
      categoryCode: '201', 
      status: 'Legalizado',
      createdBy: 'Admin Principal',
      supportUrl: '#' 
    },
    { 
      id: 2, 
      date: '2026-02-05', 
      concept: 'Pauta Facebook Ads', 
      amount: 5000000, 
      type: 'Gasto', 
      category: 'Propaganda electoral', 
      categoryCode: '105', 
      providerNit: '900.123.456-1',
      invoiceNumber: 'FE-889',
      status: 'Pendiente de Soporte',
      createdBy: 'Admin Principal',
      supportUrl: '#' 
    },
  ];

  const reports: E14Report[] = [
    { id: 1, puesto: 'Colegio Kennedy', mesa: 1, votosCandidato: 145, votosOpositor: 32, fotoUrl: '#', timestamp: '16:05', testigoId: 50 },
    { id: 2, puesto: 'Colegio Kennedy', mesa: 2, votosCandidato: 98, votosOpositor: 110, fotoUrl: '#', timestamp: '16:15', testigoId: 50 },
  ];

  const alerts: Alert[] = [
    { id: 1, msg: "Anomalía reportada en Mesa 5: 0 votos registrados", time: "16:10", type: 'fraud', severity: 'high' },
    { id: 2, msg: "Testigo Mesa 12 no ha reportado asistencia", time: "08:00", type: 'operational', severity: 'medium' },
  ];

  return {
    users,
    voters,
    missions: [],
    messages: [],
    transactions,
    reports,
    alerts,
    currentUser: users[0],
    budget: { meta: 1200000000, actual: 840000000 },
    logs: [
      { id: 1, msg: "Sistema de War Room activado", time: "1 min", type: "info" },
    ]
  };
};

// --- SUB-VIEWS ---

const DashboardView = () => {
  const { state } = useApp();
  const { currentUser, voters, budget, logs } = state;

  const filteredVoters = useMemo(() => {
    if (currentUser.role === 'SuperAdmin' || currentUser.role === 'Gerente') return voters;
    if (currentUser.role === 'LiderZonal') return voters.filter(v => v.barrio === currentUser.zona);
    return [];
  }, [currentUser, voters]);

  const totalVotosSeguros = filteredVoters.filter(v => v.intencion >= 4).length;
  const pendingMissions = state.missions.filter(m => m.status !== 'Completada').length;
  const metaDia = Math.round(filteredVoters.length * 0.15);
  const budgetPercent = Math.round((budget.actual / budget.meta) * 100);
  const diasRestantes = 45;

  const chartData = [
    { name: 'Sem 1', votos: 400 },
    { name: 'Sem 2', votos: 800 },
    { name: 'Sem 3', votos: 1200 },
    { name: 'Sem 4', votos: 1850 },
    { name: 'Sem 5', votos: totalVotosSeguros },
  ];

  return (
    <div className="space-y-6 animate-in fade-in duration-700">
      <div className="flex justify-between items-end">
        <div>
          <h2 className="text-3xl font-bold text-slate-900 dark:text-white">Centro de Comando</h2>
          <p className="text-slate-500">Vista consolidada para: <span className="font-semibold text-blue-600">{currentUser.role === 'SuperAdmin' ? 'Nivel Nacional' : `Zona ${currentUser.zona}`}</span></p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
        {[
          { label: 'Votos Fidelizados', val: totalVotosSeguros, icon: UserCheck, color: 'text-blue-600', bg: 'bg-blue-50' },
          { label: 'Misiones Activas', val: pendingMissions, icon: Activity, color: 'text-red-600', bg: 'bg-red-50' },
          { label: 'Meta de Hoy', val: metaDia, icon: Target, color: 'text-purple-600', bg: 'bg-purple-50' },
          { label: 'Presupuesto', val: `${budgetPercent}%`, icon: DollarSign, color: 'text-emerald-600', bg: 'bg-emerald-50' },
          { label: 'Días Restantes', val: diasRestantes, icon: Calendar, color: 'text-orange-600', bg: 'bg-orange-50' },
        ].map((kpi, idx) => (
          <div key={idx} className="bg-white dark:bg-slate-800 p-6 rounded-2xl shadow-sm border border-slate-100 dark:border-slate-700">
            <div className="flex justify-between items-start">
              <div>
                <p className="text-sm font-medium text-slate-500">{kpi.label}</p>
                <h4 className="text-2xl font-bold mt-1">{kpi.val}</h4>
              </div>
              <div className={`${kpi.bg} p-2 rounded-xl`}>
                <kpi.icon className={`h-6 w-6 ${kpi.color}`} />
              </div>
            </div>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 bg-white dark:bg-slate-800 p-6 rounded-2xl shadow-sm border border-slate-100 dark:border-slate-700">
          <h3 className="font-bold text-lg mb-6">Crecimiento de Votos vs. Tiempo</h3>
          <div className="h-[300px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={chartData}>
                <defs>
                  <linearGradient id="colorVotos" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#2563eb" stopOpacity={0.1}/>
                    <stop offset="95%" stopColor="#2563eb" stopOpacity={0}/>
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{fontSize: 12, fill: '#64748b'}} dy={10} />
                <YAxis axisLine={false} tickLine={false} tick={{fontSize: 12, fill: '#64748b'}} />
                <Tooltip contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)' }} />
                <Area type="monotone" dataKey="votos" stroke="#2563eb" strokeWidth={3} fillOpacity={1} fill="url(#colorVotos)" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="bg-white dark:bg-slate-800 p-6 rounded-2xl shadow-sm border border-slate-100 dark:border-slate-700">
          <h3 className="font-bold text-lg mb-4 flex items-center gap-2">
            <Bell className="h-5 w-5 text-blue-600" /> Novedades del Equipo
          </h3>
          <div className="space-y-4">
            {logs.map((log) => (
              <div key={log.id} className="flex gap-3 pb-4 border-b border-slate-50 dark:border-slate-700 last:border-0">
                <div className={`mt-1 h-2 w-2 rounded-full flex-shrink-0 ${
                  log.type === 'error' ? 'bg-red-500' : log.type === 'warning' ? 'bg-yellow-500' : 'bg-blue-500'
                }`} />
                <div>
                  <p className="text-sm font-medium text-slate-800 dark:text-slate-200 leading-tight">{log.msg}</p>
                  <p className="text-[10px] text-slate-400 mt-1 uppercase font-bold tracking-tighter">{log.time} hace</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};

const MissionsView = () => {
  const { state, updateMissionStatus } = useApp();
  const { missions, voters, users } = state;
  const [evidenceText, setEvidenceText] = useState("");
  const [selectedMission, setSelectedMission] = useState<number | null>(null);

  const leaderPerformance = useMemo(() => {
    return users.filter(u => u.role === 'LiderZonal').map(u => {
      const leaderMissions = missions.filter(m => m.assignedTo === u.id);
      const completed = leaderMissions.filter(m => m.status === 'Completada').length;
      return {
        name: u.name,
        total: leaderMissions.length,
        completed,
        rate: leaderMissions.length > 0 ? (completed / leaderMissions.length) * 100 : 0
      };
    }).sort((a, b) => b.rate - a.rate);
  }, [missions, users]);

  const getStatusColor = (status: MissionStatus) => {
    switch (status) {
      case 'Pendiente': return 'bg-slate-100 text-slate-600';
      case 'En Proceso': return 'bg-blue-100 text-blue-600';
      case 'Validación': return 'bg-purple-100 text-purple-600';
      case 'Completada': return 'bg-emerald-100 text-emerald-600';
    }
  };

  return (
    <div className="space-y-8">
      <div className="flex justify-between items-end">
        <div>
          <h2 className="text-3xl font-bold">Motor de Misiones</h2>
          <p className="text-slate-500">Automatización de tareas por reglas de fidelización</p>
        </div>
      </div>

      {/* Leader Dashboard */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="md:col-span-2 bg-white dark:bg-slate-800 p-6 rounded-2xl border">
          <h3 className="font-bold mb-4 flex items-center gap-2"><TrendingUp className="h-5 w-5 text-blue-600" /> Ranking de Cumplimiento</h3>
          <div className="space-y-4">
            {leaderPerformance.slice(0, 5).map((l, i) => (
              <div key={i} className="flex items-center gap-4">
                <div className="w-32 truncate text-sm font-medium">{l.name}</div>
                <div className="flex-1 h-2 bg-slate-100 rounded-full overflow-hidden">
                  <div className="h-full bg-blue-600" style={{ width: `${l.rate}%` }} />
                </div>
                <div className="w-12 text-right text-xs font-bold">{l.rate.toFixed(0)}%</div>
              </div>
            ))}
          </div>
        </div>
        <div className="bg-blue-600 p-6 rounded-2xl text-white">
          <h3 className="font-bold mb-2">Total Misiones</h3>
          <div className="text-5xl font-black">{missions.length}</div>
          <div className="mt-4 flex justify-between text-xs opacity-80 uppercase font-bold tracking-widest">
            <span>Pendientes: {missions.filter(m => m.status === 'Pendiente').length}</span>
            <span>Completas: {missions.filter(m => m.status === 'Completada').length}</span>
          </div>
        </div>
      </div>

      {/* Mission List */}
      <div className="bg-white dark:bg-slate-800 rounded-2xl border overflow-hidden">
        <table className="w-full text-left">
          <thead className="bg-slate-50 text-[10px] font-black uppercase text-slate-500">
            <tr>
              <th className="p-4">Votante</th>
              <th className="p-4">Misión</th>
              <th className="p-4">Líder</th>
              <th className="p-4">Estado</th>
              <th className="p-4">Acción</th>
            </tr>
          </thead>
          <tbody className="divide-y text-sm">
            {missions.slice(0, 50).map(m => {
              const voter = voters.find(v => v.id === m.voterId);
              const leader = users.find(u => u.id === m.assignedTo);
              return (
                <tr key={m.id} className="hover:bg-slate-50">
                  <td className="p-4">
                    <p className="font-bold">{voter?.name}</p>
                    <p className="text-xs text-slate-500">{voter?.barrio}</p>
                  </td>
                  <td className="p-4">
                    <p className="font-medium">{m.title}</p>
                    <p className="text-[10px] text-slate-400">{new Date(m.createdAt).toLocaleDateString()}</p>
                  </td>
                  <td className="p-4">
                    <p className="font-medium">{leader?.name}</p>
                  </td>
                  <td className="p-4">
                    <span className={`px-2 py-1 rounded-full text-[10px] font-bold ${getStatusColor(m.status)}`}>
                      {m.status}
                    </span>
                  </td>
                  <td className="p-4">
                    <div className="flex gap-2">
                      {m.status === 'Pendiente' && (
                        <button 
                          onClick={() => updateMissionStatus(m.id, 'En Proceso')}
                          className="bg-blue-600 text-white px-3 py-1 rounded-lg text-xs font-bold hover:bg-blue-700"
                        >
                          Iniciar
                        </button>
                      )}
                      {m.status === 'En Proceso' && (
                        <button 
                          onClick={() => setSelectedMission(m.id)}
                          className="bg-purple-600 text-white px-3 py-1 rounded-lg text-xs font-bold hover:bg-purple-700"
                        >
                          Finalizar
                        </button>
                      )}
                      {m.status === 'Validación' && (
                        <button 
                          onClick={() => updateMissionStatus(m.id, 'Completada')}
                          className="bg-emerald-600 text-white px-3 py-1 rounded-lg text-xs font-bold hover:bg-emerald-700"
                        >
                          Validar
                        </button>
                      )}
                      {m.status === 'Completada' && (
                        <CheckCircle2 className="h-5 w-5 text-emerald-500" />
                      )}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Evidence Modal */}
      {selectedMission && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white dark:bg-slate-900 w-full max-w-md rounded-3xl p-8 shadow-2xl">
            <h3 className="text-2xl font-black mb-4">Evidencia de Gestión</h3>
            <p className="text-slate-500 text-sm mb-6">Obligatorio: Describe qué sucedió durante la misión para poder pasar a validación.</p>
            <textarea 
              className="w-full bg-slate-50 dark:bg-slate-800 border-none rounded-2xl p-4 text-sm h-32 focus:ring-2 focus:ring-blue-600"
              placeholder="Ej: Se habló con el votante, confirma que votará en el Colegio Kennedy..."
              value={evidenceText}
              onChange={(e) => setEvidenceText(e.target.value)}
            />
            <div className="flex gap-4 mt-6">
              <button 
                onClick={() => setSelectedMission(null)}
                className="flex-1 py-3 text-slate-500 font-bold"
              >
                Cancelar
              </button>
              <button 
                disabled={!evidenceText}
                onClick={() => {
                  updateMissionStatus(selectedMission, 'Validación', evidenceText);
                  setSelectedMission(null);
                  setEvidenceText("");
                }}
                className="flex-1 bg-blue-600 text-white py-3 rounded-xl font-bold disabled:opacity-50"
              >
                Enviar a Validación
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

const MessagingView = () => {
  const { state, createCampaign } = useApp();
  const { voters, messages } = state;
  const [selectedBarrios, setSelectedBarrios] = useState<string[]>([]);
  const [selectedIntenciones, setSelectedIntenciones] = useState<number[]>([]);
  const [messageText, setMessageText] = useState("");
  const [campaignName, setCampaignName] = useState("");

  const audience = useMemo(() => {
    return voters.filter(v => {
      const barrioMatch = selectedBarrios.length === 0 || selectedBarrios.includes(v.barrio);
      const intencionMatch = selectedIntenciones.length === 0 || selectedIntenciones.includes(v.intencion);
      return barrioMatch && intencionMatch;
    });
  }, [voters, selectedBarrios, selectedIntenciones]);

  return (
    <div className="space-y-8">
      <div className="flex justify-between items-end">
        <div>
          <h2 className="text-3xl font-bold">Segmentación Dinámica</h2>
          <p className="text-slate-500">Comunicaciones masivas personalizadas por zona e intención</p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Filters */}
        <div className="lg:col-span-1 space-y-6">
          <div className="bg-white dark:bg-slate-800 p-6 rounded-2xl border space-y-4">
            <h4 className="font-black text-xs uppercase text-slate-400 tracking-widest">Paso 1: Definir Audiencia</h4>
            
            <div className="space-y-2">
              <p className="text-xs font-bold">Barrios / Zonas</p>
              <div className="grid grid-cols-2 gap-2">
                {BARRIOS.map(b => (
                  <label key={b} className="flex items-center gap-2 text-xs cursor-pointer">
                    <input 
                      type="checkbox" 
                      className="rounded text-blue-600"
                      checked={selectedBarrios.includes(b)}
                      onChange={(e) => {
                        if (e.target.checked) setSelectedBarrios([...selectedBarrios, b]);
                        else setSelectedBarrios(selectedBarrios.filter(x => x !== b));
                      }}
                    /> {b}
                  </label>
                ))}
              </div>
            </div>

            <div className="space-y-2 pt-4 border-t">
              <p className="text-xs font-bold">Nivel de Intención</p>
              <div className="flex gap-2">
                {[1, 2, 3, 4, 5].map(i => (
                  <button 
                    key={i}
                    onClick={() => {
                      if (selectedIntenciones.includes(i)) setSelectedIntenciones(selectedIntenciones.filter(x => x !== i));
                      else setSelectedIntenciones([...selectedIntenciones, i]);
                    }}
                    className={`h-8 w-8 rounded-lg font-bold text-xs ${selectedIntenciones.includes(i) ? 'bg-blue-600 text-white' : 'bg-slate-100 text-slate-500'}`}
                  >
                    {i}
                  </button>
                ))}
              </div>
            </div>

            <div className="pt-6 border-t">
              <div className="bg-blue-50 p-4 rounded-xl text-center">
                <p className="text-[10px] font-black text-blue-600 uppercase tracking-widest">Audiencia Alcanzada</p>
                <div className="text-4xl font-black text-blue-900">{audience.length}</div>
                <p className="text-xs text-blue-600 mt-1">personas recibirán el mensaje</p>
              </div>
            </div>
          </div>
        </div>

        {/* Compose */}
        <div className="lg:col-span-2 space-y-6">
          <div className="bg-white dark:bg-slate-800 p-8 rounded-3xl border shadow-sm space-y-6">
            <h4 className="font-black text-xs uppercase text-slate-400 tracking-widest">Paso 2: Redactar Mensaje</h4>
            <div className="space-y-4">
              <input 
                type="text"
                placeholder="Nombre de la Campaña (ej: Recordatorio Votación Usaquén)"
                className="w-full bg-slate-50 border-none rounded-xl p-4 font-bold focus:ring-2 focus:ring-blue-600"
                value={campaignName}
                onChange={(e) => setCampaignName(e.target.value)}
              />
              <textarea 
                className="w-full bg-slate-50 border-none rounded-2xl p-6 text-sm h-48 focus:ring-2 focus:ring-blue-600"
                placeholder="Escribe aquí tu mensaje masivo..."
                value={messageText}
                onChange={(e) => setMessageText(e.target.value)}
              />
              <div className="flex justify-between items-center bg-slate-50 p-4 rounded-2xl">
                <div className="flex gap-4">
                  <button className="text-xs font-bold flex items-center gap-1 text-slate-500"><Phone className="h-4 w-4" /> WhatsApp</button>
                  <button className="text-xs font-bold flex items-center gap-1 text-slate-500"><MessageSquare className="h-4 w-4" /> SMS</button>
                </div>
                <button 
                  disabled={!campaignName || !messageText || audience.length === 0}
                  onClick={() => {
                    createCampaign({
                      name: campaignName,
                      message: messageText,
                      audienceCount: audience.length,
                      segment: { barrios: selectedBarrios, intenciones: selectedIntenciones }
                    });
                    setCampaignName("");
                    setMessageText("");
                  }}
                  className="bg-blue-600 text-white px-8 py-3 rounded-xl font-black uppercase tracking-widest hover:bg-blue-700 disabled:opacity-50 transition-all shadow-lg shadow-blue-200"
                >
                  Enviar Ahora
                </button>
              </div>
            </div>
          </div>

          {/* History */}
          <div className="bg-white dark:bg-slate-800 p-6 rounded-2xl border">
            <h4 className="font-black text-xs uppercase text-slate-400 tracking-widest mb-4">Historial de Envíos</h4>
            <div className="space-y-3">
              {messages.map(m => (
                <div key={m.id} className="flex justify-between items-center p-3 hover:bg-slate-50 rounded-xl border border-transparent hover:border-slate-100 transition-all">
                  <div>
                    <p className="font-bold text-sm">{m.name}</p>
                    <p className="text-[10px] text-slate-500">{new Date(m.sentAt!).toLocaleString()}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-xs font-black text-blue-600">{m.audienceCount} ENVÍOS</p>
                    <p className="text-[10px] text-emerald-500 font-bold">ENTREGADO 100%</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

const VoterDirectory = () => {
  const { state, deleteVoter, updateVoter, massImport } = useApp();
  const { currentUser, voters } = state;
  const [searchTerm, setSearchTerm] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 15;

  const [filters, setFilters] = useState<{ barrio: string[]; intencion: number[]; gender: string[] }>({
    barrio: [],
    intencion: [],
    gender: []
  });

  const filteredVoters = useMemo(() => {
    let result = voters;
    if (currentUser.role === 'LiderZonal') result = result.filter(v => v.barrio === currentUser.zona);
    if (searchTerm) {
      const lowerSearch = searchTerm.toLowerCase();
      result = result.filter(v => v.name.toLowerCase().includes(lowerSearch) || v.cedula.includes(searchTerm) || v.phone.includes(searchTerm));
    }
    if (filters.barrio.length > 0) result = result.filter(v => filters.barrio.includes(v.barrio));
    if (filters.intencion.length > 0) result = result.filter(v => filters.intencion.includes(v.intencion));
    if (filters.gender.length > 0) result = result.filter(v => filters.gender.includes(v.gender));
    return result;
  }, [voters, searchTerm, filters, currentUser]);

  if (['Contador', 'Testigo'].includes(currentUser.role)) return (
    <div className="h-full flex flex-col items-center justify-center space-y-4">
      <ShieldAlert className="h-16 w-16 text-red-500" />
      <h2 className="text-2xl font-bold">Acceso Denegado</h2>
      <p className="text-slate-500">Su rol no tiene permisos para ver el censo electoral.</p>
    </div>
  );

  const totalPages = Math.ceil(filteredVoters.length / itemsPerPage);
  const paginatedVoters = filteredVoters.slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage);

  const handleIntentionChange = (voterId: number, newIntention: number) => {
    updateVoter(voterId, { intencion: newIntention });
  };

  return (
    <div className="h-full flex flex-col space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-3xl font-bold">Censo Electoral</h2>
          <p className="text-sm text-slate-500">Mostrando {filteredVoters.length.toLocaleString()} registros totales</p>
        </div>
        <div className="flex gap-3">
          <button 
            onClick={() => massImport()}
            className="bg-emerald-600 text-white px-4 py-2 rounded-xl flex items-center gap-2 hover:bg-emerald-700 transition-all font-semibold shadow-lg shadow-emerald-100"
          >
            <Download className="h-5 w-5" /> Importar BD (1,000)
          </button>
          <button className="bg-blue-600 text-white px-4 py-2 rounded-xl flex items-center gap-2 hover:bg-blue-700 transition-all font-semibold shadow-lg shadow-blue-100">
            <Plus className="h-5 w-5" /> Nuevo Votante
          </button>
        </div>
      </div>

      <div className="flex flex-1 overflow-hidden gap-6">
        <aside className="w-64 bg-white dark:bg-slate-800 p-6 rounded-2xl border hidden xl:block overflow-y-auto">
          <div className="space-y-6">
             <div>
                <h4 className="font-bold text-sm mb-4 flex items-center gap-2"><Filter className="h-4 w-4" /> Búsqueda</h4>
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                  <input 
                    type="text" 
                    placeholder="Cédula o Nombre..."
                    className="w-full bg-slate-50 border-none rounded-xl pl-10 pr-4 py-2 text-sm focus:ring-2 focus:ring-blue-600"
                    value={searchTerm}
                    onChange={(e) => { setSearchTerm(e.target.value); setCurrentPage(1); }}
                  />
                </div>
             </div>

             <div className="space-y-2">
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Intención de Voto</p>
                {[5, 4, 3, 2, 1].map(lvl => (
                  <label key={lvl} className="flex items-center gap-2 text-sm cursor-pointer hover:text-blue-600 group">
                    <input 
                      type="checkbox" 
                      className="rounded text-blue-600" 
                      onChange={(e) => {
                        const newInt = e.target.checked ? [...filters.intencion, lvl] : filters.intencion.filter(x => x !== lvl);
                        setFilters({ ...filters, intencion: newInt });
                        setCurrentPage(1);
                      }} 
                    /> 
                    <span className={`h-2 w-2 rounded-full ${lvl >= 4 ? 'bg-green-500' : lvl === 3 ? 'bg-yellow-500' : 'bg-red-500'}`} />
                    {lvl === 5 ? 'Voto Duro (A+)' : lvl === 4 ? 'Simpatizante' : lvl === 3 ? 'Indeciso' : 'Opositor'}
                  </label>
                ))}
             </div>

             <div className="space-y-2 pt-4 border-t">
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Zonificación (Barrios)</p>
                <div className="space-y-1 max-h-48 overflow-y-auto pr-2">
                  {BARRIOS.map(b => (
                    <label key={b} className="flex items-center gap-2 text-xs cursor-pointer hover:text-blue-600">
                      <input 
                        type="checkbox" 
                        className="rounded text-blue-600"
                        onChange={(e) => {
                          const newBarrio = e.target.checked ? [...filters.barrio, b] : filters.barrio.filter(x => x !== b);
                          setFilters({ ...filters, barrio: newBarrio });
                          setCurrentPage(1);
                        }}
                      /> {b}
                    </label>
                  ))}
                </div>
             </div>
          </div>
        </aside>

        <div className="flex-1 flex flex-col bg-white dark:bg-slate-800 rounded-2xl shadow-sm border overflow-hidden">
          <div className="flex-1 overflow-y-auto">
            <table className="w-full text-left text-sm border-collapse">
              <thead className="sticky top-0 bg-slate-50 dark:bg-slate-900 font-bold text-slate-400 uppercase text-[10px] z-10">
                <tr>
                  <th className="p-4 border-b">Estatus</th>
                  <th className="p-4 border-b">Información Básica</th>
                  <th className="p-4 border-b">Ubicación</th>
                  <th className="p-4 border-b text-center">Acciones</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {paginatedVoters.map(v => (
                  <tr key={v.id} className="hover:bg-slate-50/80 transition-colors group">
                    <td className="p-4">
                      <select 
                        className={`text-[10px] font-bold rounded-full px-2 py-1 border-none focus:ring-0 cursor-pointer ${
                          v.intencion >= 4 ? 'bg-green-100 text-green-700' : 
                          v.intencion === 3 ? 'bg-yellow-100 text-yellow-700' : 
                          'bg-red-100 text-red-700'
                        }`}
                        value={v.intencion}
                        onChange={(e) => handleIntentionChange(v.id, Number(e.target.value))}
                      >
                        <option value={5}>Voto Duro</option>
                        <option value={4}>Simpatizante</option>
                        <option value={3}>Indeciso</option>
                        <option value={2}>Opositor Leve</option>
                        <option value={1}>Opositor</option>
                      </select>
                    </td>
                    <td className="p-4">
                      <p className="font-black text-slate-900">{v.name}</p>
                      <div className="flex gap-2 text-[10px] text-slate-500 font-bold">
                        <span>CC {v.cedula}</span>
                        <span>•</span>
                        <span>{v.phone}</span>
                      </div>
                    </td>
                    <td className="p-4">
                      <p className="font-medium">{v.barrio}</p>
                      <p className="text-[10px] text-slate-400 flex items-center gap-1">
                        <MapPin className="h-3 w-3" /> {v.puesto || 'PUESTO NO ASIGNADO'}
                      </p>
                    </td>
                    <td className="p-4">
                      <div className="flex justify-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                        <button className="p-2 hover:bg-blue-50 text-blue-600 rounded-lg transition-colors"><Edit className="h-4 w-4" /></button>
                        <button 
                          onClick={() => deleteVoter(v.id)}
                          className="p-2 hover:bg-red-50 text-red-600 rounded-lg transition-colors"
                        ><Trash2 className="h-4 w-4" /></button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="p-4 border-t bg-slate-50 flex justify-between items-center">
            <p className="text-xs text-slate-500 font-bold">
              Página {currentPage} de {totalPages}
            </p>
            <div className="flex gap-2">
              <button 
                disabled={currentPage === 1}
                onClick={() => setCurrentPage(prev => prev - 1)}
                className="px-3 py-1 bg-white border rounded-lg text-xs font-bold disabled:opacity-50 hover:bg-slate-50"
              >
                Anterior
              </button>
              <button 
                disabled={currentPage === totalPages}
                onClick={() => setCurrentPage(prev => prev + 1)}
                className="px-3 py-1 bg-white border rounded-lg text-xs font-bold disabled:opacity-50 hover:bg-slate-50"
              >
                Siguiente
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};


const CNE_CATEGORIES = [
  { code: '101', name: 'Gastos de administración' },
  { code: '102', name: 'Actos públicos' },
  { code: '105', name: 'Propaganda electoral' },
  { code: '108', name: 'Transporte y correo' },
];

const FinanceModule = () => {
  const { state, addTransaction } = useApp();
  const { currentUser, transactions } = state;
  const [showForm, setShowForm] = useState(false);
  const [formData, setFormData] = useState({
    concept: '',
    amount: 0,
    type: 'Gasto' as 'Ingreso' | 'Gasto',
    category: 'Gastos de administración',
    categoryCode: '101',
    providerNit: '',
    invoiceNumber: '',
    status: 'Borrador' as TransactionStatus,
    supportUrl: '#'
  });

  if (['LiderZonal', 'Testigo'].includes(currentUser.role)) return (
    <div className="h-full flex flex-col items-center justify-center space-y-4">
      <ShieldAlert className="h-16 w-16 text-red-500" />
      <h2 className="text-2xl font-bold">Módulo Restringido</h2>
      <p className="text-slate-500">Solo personal administrativo puede ver las finanzas.</p>
    </div>
  );

  const totalIncome = transactions.filter(t => t.type === 'Ingreso').reduce((acc, curr) => acc + curr.amount, 0);
  const totalExpenses = transactions.filter(t => t.type === 'Gasto').reduce((acc, curr) => acc + curr.amount, 0);
  const balance = totalIncome - totalExpenses;
  const budgetExecution = (totalExpenses / LIMITE_GASTOS_CNE) * 100;

  const getAlertColor = (percent: number) => {
    if (percent > 90) return 'bg-red-600 animate-pulse';
    if (percent > 70) return 'bg-orange-500';
    return 'bg-emerald-500';
  };

  const barData = [
    { name: 'Sem 1', ingresos: 5000000, gastos: 2000000 },
    { name: 'Sem 2', ingresos: 3000000, gastos: 4500000 },
    { name: 'Sem 3', ingresos: 7000000, gastos: 3000000 },
    { name: 'Sem 4', ingresos: totalIncome - 15000000, gastos: totalExpenses - 9500000 },
  ];

  const pieData = [
    { name: 'Admin', value: transactions.filter(t => t.categoryCode === '101').reduce((a, b) => a + b.amount, 0) },
    { name: 'Actos', value: transactions.filter(t => t.categoryCode === '102').reduce((a, b) => a + b.amount, 0) },
    { name: 'Propaganda', value: transactions.filter(t => t.categoryCode === '105').reduce((a, b) => a + b.amount, 0) },
    { name: 'Transporte', value: transactions.filter(t => t.categoryCode === '108').reduce((a, b) => a + b.amount, 0) },
  ].filter(d => d.value > 0);

  const COLORS = ['#0088FE', '#00C49F', '#FFBB28', '#FF8042'];

  const exportToExcel = () => {
    const ws = XLSX.utils.json_to_sheet(transactions.map(t => ({
      Fecha: t.date,
      Concepto: t.concept,
      Tipo: t.type,
      Monto: t.amount,
      Categoría: t.category,
      Código: t.categoryCode,
      NIT: t.providerNit || 'N/A',
      Factura: t.invoiceNumber || 'N/A',
      Estado: t.status,
      RegistradoPor: t.createdBy
    })));
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Finanzas");
    XLSX.writeFile(wb, "Reporte_Financiero_CNE.xlsx");
  };

  const exportToPDF = () => {
    const doc = new jsPDF();
    doc.setFontSize(20);
    doc.text("POLITICA 2026 - Reporte Cuentas Claras", 14, 22);
    doc.setFontSize(10);
    doc.text(`Responsable: ${currentUser.name}`, 14, 30);
    doc.text(`Fecha de Reporte: ${new Date().toLocaleDateString()}`, 14, 35);
    
    autoTable(doc, {
      startY: 45,
      head: [['Fecha', 'Concepto', 'Cod', 'Monto', 'Estado']],
      body: transactions.map(t => [t.date, t.concept, t.categoryCode, `$${t.amount.toLocaleString()}`, t.status]),
    });
    doc.save("Reporte_CNE.pdf");
  };

  return (
    <div className="space-y-6">
       <div className="flex justify-between items-center">
          <h2 className="text-3xl font-bold">Gestión Financiera Compliance</h2>
          <div className="flex gap-2">
             <button onClick={exportToPDF} className="flex items-center gap-2 px-4 py-2 bg-slate-100 hover:bg-slate-200 rounded-xl text-sm font-bold"><FileText className="h-4 w-4" /> PDF</button>
             <button onClick={exportToExcel} className="flex items-center gap-2 px-4 py-2 bg-slate-100 hover:bg-slate-200 rounded-xl text-sm font-bold"><Download className="h-4 w-4" /> Excel</button>
             <button onClick={() => setShowForm(true)} className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-sm font-bold"><Plus className="h-4 w-4" /> Nuevo Movimiento</button>
          </div>
       </div>

       {/* Topes CNE */}
       <div className="bg-white dark:bg-slate-800 p-6 rounded-3xl shadow-sm border border-slate-100">
          <div className="flex justify-between items-end mb-2">
             <div>
                <p className="text-[10px] font-black text-slate-500 uppercase">Ejecución de Presupuesto (Tope CNE)</p>
                <h4 className="text-xl font-black">${totalExpenses.toLocaleString()} / <span className="text-slate-400">${LIMITE_GASTOS_CNE.toLocaleString()}</span></h4>
             </div>
             <span className={`text-xs font-black px-2 py-1 rounded-lg ${budgetExecution > 90 ? 'bg-red-100 text-red-600' : 'bg-emerald-100 text-emerald-600'}`}>
                {budgetExecution.toFixed(1)}% utilizado
             </span>
          </div>
          <div className="w-full h-4 bg-slate-100 rounded-full overflow-hidden">
             <div 
                className={`h-full transition-all duration-1000 ${getAlertColor(budgetExecution)}`} 
                style={{ width: `${Math.min(budgetExecution, 100)}%` }} 
             />
          </div>
          {budgetExecution > 90 && (
             <div className="mt-3 flex items-center gap-2 text-red-600 animate-pulse">
                <AlertTriangle className="h-4 w-4" />
                <span className="text-xs font-black uppercase">Riesgo de Sanción Legal: Tope casi alcanzado</span>
             </div>
          )}
       </div>

       <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
         <div className="bg-emerald-600 text-white p-6 rounded-3xl shadow-lg">
           <p className="text-emerald-100 text-xs font-bold uppercase">Ingresos Totales</p>
           <h4 className="text-3xl font-black mt-1">${totalIncome.toLocaleString()}</h4>
           <div className="mt-4 flex items-center gap-1 text-[10px] bg-emerald-700 w-fit px-2 py-1 rounded-full">
              <ArrowUpRight className="h-3 w-3" /> +12% este mes
           </div>
         </div>
         <div className="bg-white dark:bg-slate-800 p-6 rounded-3xl shadow-sm border border-slate-100">
           <p className="text-slate-500 text-xs font-bold uppercase">Gastos Ejecutados</p>
           <h4 className="text-3xl font-black mt-1">${totalExpenses.toLocaleString()}</h4>
           <div className="mt-4 flex items-center gap-1 text-[10px] bg-red-50 text-red-600 w-fit px-2 py-1 rounded-full">
              <ArrowDownRight className="h-3 w-3" /> -5% vs semana anterior
           </div>
         </div>
         <div className="bg-white dark:bg-slate-800 p-6 rounded-3xl shadow-sm border border-slate-100">
           <p className="text-slate-500 text-xs font-bold uppercase">Balance Campaña</p>
           <h4 className={`text-3xl font-black mt-1 ${balance >= 0 ? 'text-blue-600' : 'text-red-600'}`}>
              ${balance.toLocaleString()}
           </h4>
           <div className="mt-4 flex items-center gap-1 text-[10px] bg-slate-100 text-slate-500 w-fit px-2 py-1 rounded-full">
              <Activity className="h-3 w-3" /> Auditoría en tiempo real
           </div>
         </div>
       </div>

       <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="bg-white p-6 rounded-3xl border border-slate-100 shadow-sm">
             <h3 className="text-sm font-black text-slate-400 uppercase mb-6">Ingresos vs Gastos (Semanal)</h3>
             <div className="h-[250px]">
                <ResponsiveContainer width="100%" height="100%">
                   <BarChart data={barData}>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} />
                      <XAxis dataKey="name" axisLine={false} tickLine={false} fontSize={12} />
                      <YAxis hide />
                      <Tooltip cursor={{fill: '#f8fafc'}} contentStyle={{borderRadius: '16px', border: 'none', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)'}} />
                      <Bar dataKey="ingresos" fill="#10b981" radius={[4, 4, 0, 0]} barSize={20} />
                      <Bar dataKey="gastos" fill="#ef4444" radius={[4, 4, 0, 0]} barSize={20} />
                   </BarChart>
                </ResponsiveContainer>
             </div>
          </div>
          <div className="bg-white p-6 rounded-3xl border border-slate-100 shadow-sm">
             <h3 className="text-sm font-black text-slate-400 uppercase mb-6">Distribución por Código CNE</h3>
             <div className="h-[250px] flex items-center justify-center">
                <ResponsiveContainer width="100%" height="100%">
                   <RePieChart>
                      <Pie
                        data={pieData}
                        innerRadius={60}
                        outerRadius={80}
                        paddingAngle={5}
                        dataKey="value"
                      >
                        {pieData.map((entry, index) => (
                          <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                        ))}
                      </Pie>
                      <Tooltip />
                      <Legend verticalAlign="bottom" align="center" />
                   </RePieChart>
                </ResponsiveContainer>
             </div>
          </div>
       </div>

       {/* Transacciones Recientes */}
       <div className="bg-white rounded-3xl border border-slate-100 shadow-sm overflow-hidden">
          <div className="p-6 border-b border-slate-50 flex justify-between items-center">
             <h3 className="font-black uppercase tracking-tighter text-slate-900">Libro Diario de Campaña</h3>
             <Search className="h-4 w-4 text-slate-400" />
          </div>
          <div className="overflow-x-auto">
             <table className="w-full text-left border-collapse">
                <thead>
                   <tr className="bg-slate-50 text-[10px] font-black text-slate-500 uppercase">
                      <th className="p-4">Fecha</th>
                      <th className="p-4">Concepto / Categoría</th>
                      <th className="p-4">Monto</th>
                      <th className="p-4">CNE Cod</th>
                      <th className="p-4">Estado</th>
                      <th className="p-4">Acciones</th>
                   </tr>
                </thead>
                <tbody>
                   {transactions.slice().reverse().map(t => (
                      <tr key={t.id} className="border-b border-slate-50 hover:bg-slate-50 transition-colors">
                         <td className="p-4 text-xs font-bold text-slate-500">{t.date}</td>
                         <td className="p-4">
                            <p className="font-black text-slate-900 text-sm">{t.concept}</p>
                            <p className="text-[10px] text-slate-400 font-bold uppercase">{t.category}</p>
                         </td>
                         <td className={`p-4 font-black ${t.type === 'Ingreso' ? 'text-emerald-600' : 'text-slate-900'}`}>
                            {t.type === 'Ingreso' ? '+' : '-'}${t.amount.toLocaleString()}
                         </td>
                         <td className="p-4">
                            <span className="bg-slate-100 px-2 py-1 rounded text-[10px] font-black text-slate-600">{t.categoryCode}</span>
                         </td>
                         <td className="p-4">
                            <span className={`px-2 py-1 rounded-full text-[10px] font-black ${
                               t.status === 'Legalizado' ? 'bg-blue-100 text-blue-700' : 
                               t.status === 'Pendiente de Soporte' ? 'bg-yellow-100 text-yellow-700' : 
                               'bg-slate-100 text-slate-700'
                            }`}>
                               {t.status.toUpperCase()}
                            </span>
                         </td>
                         <td className="p-4">
                            {t.status !== 'Legalizado' ? (
                               <div className="flex gap-1">
                                  <button className="p-2 hover:bg-blue-50 text-blue-600 rounded-lg"><Edit className="h-4 w-4" /></button>
                                  <button className="p-2 hover:bg-red-50 text-red-600 rounded-lg"><Trash2 className="h-4 w-4" /></button>
                               </div>
                            ) : (
                               <Lock className="h-4 w-4 text-slate-300" />
                            )}
                         </td>
                      </tr>
                   ))}
                </tbody>
             </table>
          </div>
       </div>

       {/* Formulario Modal */}
       {showForm && (
          <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
             <div className="bg-white rounded-[32px] w-full max-w-lg shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200">
                <div className="p-8 border-b border-slate-100 flex justify-between items-center">
                   <h3 className="text-2xl font-black tracking-tighter">Registrar Movimiento</h3>
                   <button onClick={() => setShowForm(false)} className="p-2 hover:bg-slate-100 rounded-full"><X /></button>
                </div>
                <div className="p-8 space-y-4">
                   <div className="grid grid-cols-2 gap-4">
                      <button 
                         onClick={() => setFormData({...formData, type: 'Gasto'})}
                         className={`p-4 rounded-2xl border-2 font-black transition-all ${formData.type === 'Gasto' ? 'border-red-600 bg-red-50 text-red-600' : 'border-slate-100 text-slate-400'}`}
                      >Gasto</button>
                      <button 
                         onClick={() => setFormData({...formData, type: 'Ingreso'})}
                         className={`p-4 rounded-2xl border-2 font-black transition-all ${formData.type === 'Ingreso' ? 'border-emerald-600 bg-emerald-50 text-emerald-600' : 'border-slate-100 text-slate-400'}`}
                      >Ingreso</button>
                   </div>
                   
                   <div className="space-y-1">
                      <label className="text-[10px] font-black text-slate-400 uppercase px-1">Concepto del Movimiento</label>
                      <input 
                         type="text" 
                         className="w-full bg-slate-50 border-none rounded-2xl p-4 text-sm font-bold focus:ring-2 focus:ring-blue-600" 
                         placeholder="Ej: Alquiler de sonido para mitin"
                         value={formData.concept}
                         onChange={(e) => setFormData({...formData, concept: e.target.value})}
                      />
                   </div>

                   <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-1">
                         <label className="text-[10px] font-black text-slate-400 uppercase px-1">Valor (COP)</label>
                         <input 
                            type="number" 
                            className="w-full bg-slate-50 border-none rounded-2xl p-4 text-sm font-bold focus:ring-2 focus:ring-blue-600" 
                            placeholder="0"
                            value={formData.amount}
                            onChange={(e) => setFormData({...formData, amount: Number(e.target.value)})}
                         />
                      </div>
                      <div className="space-y-1">
                         <label className="text-[10px] font-black text-slate-400 uppercase px-1">Categoría CNE</label>
                         <select 
                            className="w-full bg-slate-50 border-none rounded-2xl p-4 text-sm font-bold focus:ring-2 focus:ring-blue-600"
                            value={formData.categoryCode}
                            onChange={(e) => {
                               const cat = CNE_CATEGORIES.find(c => c.code === e.target.value);
                               setFormData({...formData, categoryCode: e.target.value, category: cat?.name || ''});
                            }}
                         >
                            {CNE_CATEGORIES.map(c => <option key={c.code} value={c.code}>{c.code} - {c.name}</option>)}
                            <option value="201">201 - Donaciones</option>
                         </select>
                      </div>
                   </div>

                   <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-1">
                         <label className="text-[10px] font-black text-slate-400 uppercase px-1">NIT Proveedor</label>
                         <input 
                            type="text" 
                            className="w-full bg-slate-50 border-none rounded-2xl p-4 text-sm font-bold focus:ring-2 focus:ring-blue-600" 
                            placeholder="900.xxx.xxx-x"
                            value={formData.providerNit}
                            onChange={(e) => setFormData({...formData, providerNit: e.target.value})}
                         />
                      </div>
                      <div className="space-y-1">
                         <label className="text-[10px] font-black text-slate-400 uppercase px-1">N° Factura</label>
                         <input 
                            type="text" 
                            className="w-full bg-slate-50 border-none rounded-2xl p-4 text-sm font-bold focus:ring-2 focus:ring-blue-600" 
                            placeholder="FE-000"
                            value={formData.invoiceNumber}
                            onChange={(e) => setFormData({...formData, invoiceNumber: e.target.value})}
                         />
                      </div>
                   </div>

                   <div className="pt-4 flex gap-4">
                      <button 
                         onClick={() => {
                            addTransaction(formData);
                            setShowForm(false);
                         }}
                         className="flex-1 bg-slate-900 text-white font-black py-4 rounded-2xl hover:bg-slate-800 transition-all shadow-lg"
                      >GUARDAR BORRADOR</button>
                      <button 
                         onClick={() => {
                            addTransaction({...formData, status: 'Legalizado'});
                            setShowForm(false);
                         }}
                         className="flex-1 bg-blue-600 text-white font-black py-4 rounded-2xl hover:bg-blue-700 transition-all shadow-lg"
                      >LEGALIZAR AHORA</button>
                   </div>
                </div>
             </div>
          </div>
       )}
    </div>
  );
};

const TerritoryModule = () => {
  const { state } = useApp();
  const { voters } = state;

  const barrioStats = useMemo(() => {
    return BARRIOS.map(barrio => {
      const votersInBarrio = voters.filter(v => v.barrio === barrio);
      const duroCount = votersInBarrio.filter(v => v.intencion >= 4).length;
      const percentage = votersInBarrio.length > 0 ? (duroCount / votersInBarrio.length) * 100 : 0;
      const color = percentage >= 70 ? 'bg-emerald-500' : percentage >= 40 ? 'bg-yellow-500' : 'bg-red-500';
      return { name: barrio, total: votersInBarrio.length, percentage, color };
    });
  }, [voters]);

  return (
    <div className="space-y-6">
       <h2 className="text-3xl font-bold">Análisis Territorial</h2>
       <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
          {barrioStats.map((b, i) => (
            <div key={i} className={`${b.color} p-6 rounded-2xl text-white shadow-lg flex flex-col items-center justify-center text-center`}>
              <span className="font-bold text-xs uppercase">{b.name}</span>
              <span className="text-2xl font-black">{b.percentage.toFixed(0)}%</span>
              <span className="text-[10px] opacity-75">{b.total} registrados</span>
            </div>
          ))}
       </div>
    </div>
  );
};

const ElectionDayModule = () => {
  const { state, addReport } = useApp();
  const { reports, alerts, currentUser } = state;
  const [timeLeft, setTimeLeft] = useState('04:00:00');
  const [showForm, setShowForm] = useState(currentUser.role === 'Testigo');
  const [formData, setFormData] = useState({ puesto: 'Colegio Kennedy', mesa: 1, votosCandidato: 0, votosOpositor: 0 });

  // Real-time Countdown simulator
  useEffect(() => {
    const timer = setInterval(() => {
      const now = new Date();
      const end = new Date();
      end.setHours(16, 0, 0, 0);
      const diff = end.getTime() - now.getTime();
      if (diff <= 0) {
        setTimeLeft('00:00:00');
        clearInterval(timer);
      } else {
        const h = Math.floor(diff / 3600000).toString().padStart(2, '0');
        const m = Math.floor((diff % 3600000) / 60000).toString().padStart(2, '0');
        const s = Math.floor((diff % 60000) / 1000).toString().padStart(2, '0');
        setTimeLeft(`${h}:${m}:${s}`);
      }
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  const totalVotes = useMemo(() => reports.reduce((acc, curr) => acc + curr.votosCandidato, 0), [reports]);
  const isWitness = currentUser.role === 'Testigo';

  if (currentUser.role === 'Contador') return <div className="p-10 text-center">Sin acceso al War Room electoral.</div>;

  return (
    <div className="min-h-screen bg-slate-950 text-white p-8 space-y-8 font-mono border-4 border-red-900/20 rounded-3xl animate-in zoom-in-95 duration-500">
       
       {/* WAR ROOM HEADER */}
       <div className="flex flex-col md:flex-row justify-between items-center gap-6 border-b border-red-900/30 pb-8">
          <div className="flex items-center gap-4">
             <div className="h-12 w-12 bg-red-600 rounded-lg flex items-center justify-center animate-pulse">
                <ShieldAlert className="h-8 w-8 text-white" />
             </div>
             <div>
                <h2 className="text-4xl font-black tracking-tighter text-red-500 uppercase">War Room E-14</h2>
                <p className="text-xs text-red-900 font-bold uppercase tracking-[0.2em]">Live Operation: Colombia 2026</p>
             </div>
          </div>

          <div className="flex gap-8">
             <div className="text-center">
                <p className="text-[10px] text-slate-500 uppercase font-bold mb-1">Cierre Urnas</p>
                <div className="text-4xl font-black bg-red-900/20 px-4 py-2 rounded-xl border border-red-900/40 tabular-nums">
                   {timeLeft}
                </div>
             </div>
             <div className="text-center">
                <p className="text-[10px] text-slate-500 uppercase font-bold mb-1">Total Consolidado</p>
                <div className="text-4xl font-black text-blue-500 bg-blue-900/20 px-4 py-2 rounded-xl border border-blue-900/40 tabular-nums">
                   {totalVotes.toLocaleString()}
                </div>
             </div>
          </div>
       </div>

       <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          
          {/* Witness Form or List of Reports */}
          <div className="lg:col-span-2 space-y-8">
             {isWitness || showForm ? (
               <div className="bg-slate-900/50 p-8 rounded-3xl border border-red-900/30 backdrop-blur-md">
                  <h3 className="text-xl font-bold mb-6 flex items-center gap-2"><Camera className="h-5 w-5 text-red-500" /> Ingreso de Datos Mesa</h3>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                     <div className="space-y-4">
                        <div>
                           <label className="text-[10px] font-bold text-slate-500 uppercase">Puesto de Votación</label>
                           <select className="w-full bg-slate-800 border-none rounded-xl p-4 mt-1 text-sm font-bold focus:ring-2 focus:ring-red-600">
                              <option>Colegio Kennedy</option>
                              <option>Escuela Fontibón</option>
                           </select>
                        </div>
                        <div>
                           <label className="text-[10px] font-bold text-slate-500 uppercase">Número de Mesa</label>
                           <input 
                              type="number" 
                              className="w-full bg-slate-800 border-none rounded-xl p-4 mt-1 text-sm font-bold" 
                              placeholder="0"
                              onChange={(e) => setFormData(prev => ({ ...prev, mesa: Number(e.target.value) }))}
                           />
                        </div>
                     </div>
                     <div className="space-y-4">
                        <div className="bg-blue-900/10 p-4 rounded-2xl border border-blue-900/20">
                           <label className="text-[10px] font-bold text-blue-400 uppercase">Votos Candidato (NOSOTROS)</label>
                           <input 
                              type="number" 
                              className="w-full bg-transparent border-none p-0 text-4xl font-black text-blue-500 focus:ring-0" 
                              placeholder="0"
                              onChange={(e) => setFormData(prev => ({ ...prev, votosCandidato: Number(e.target.value) }))}
                           />
                        </div>
                        <div className="bg-red-900/10 p-4 rounded-2xl border border-red-900/20">
                           <label className="text-[10px] font-bold text-red-400 uppercase">Votos Oposición</label>
                           <input 
                              type="number" 
                              className="w-full bg-transparent border-none p-0 text-4xl font-black text-red-500 focus:ring-0" 
                              placeholder="0"
                              onChange={(e) => setFormData(prev => ({ ...prev, votosOpositor: Number(e.target.value) }))}
                           />
                        </div>
                     </div>
                  </div>

                  <div className="mt-8 flex flex-col md:flex-row gap-4">
                     <div className="flex-1 border-2 border-dashed border-slate-700 rounded-2xl p-6 flex flex-col items-center justify-center hover:bg-slate-800 cursor-pointer transition-all">
                        <Camera className="h-8 w-8 text-slate-500 mb-2" />
                        <span className="text-xs font-bold text-slate-400">SUBIR FOTO E-14</span>
                     </div>
                     <button 
                        onClick={() => {
                           addReport({ ...formData, fotoUrl: '#' });
                           if (!isWitness) setShowForm(false);
                        }}
                        className="flex-1 bg-red-600 hover:bg-red-700 text-white font-black text-xl py-6 rounded-2xl shadow-xl shadow-red-900/20 transition-all uppercase flex items-center justify-center gap-3"
                     >
                        <Zap className="h-6 w-6" /> Transmitir Reporte
                     </button>
                  </div>
               </div>
             ) : (
               <div className="bg-slate-900/30 rounded-3xl border border-slate-800 p-6 overflow-hidden">
                  <div className="flex justify-between items-center mb-6">
                     <h3 className="text-xl font-bold uppercase tracking-tighter">Últimos E-14 Consolidados</h3>
                     <button onClick={() => setShowForm(true)} className="text-xs bg-red-600 px-3 py-1 rounded-full font-bold">Nuevo</button>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                     {reports.slice().reverse().map((r) => (
                       <div key={r.id} className="p-4 bg-slate-900 rounded-2xl border border-slate-800 flex justify-between items-center group hover:border-blue-500 transition-all">
                          <div>
                             <p className="text-[10px] font-bold text-slate-500 uppercase">{r.puesto} • MESA {r.mesa}</p>
                             <div className="flex gap-4 mt-1">
                                <span className="text-xl font-black text-blue-500">{r.votosCandidato}</span>
                                <span className="text-xl font-black text-slate-700">vs</span>
                                <span className="text-xl font-black text-red-500">{r.votosOpositor}</span>
                             </div>
                          </div>
                          <div className="h-10 w-10 bg-slate-800 rounded-lg flex items-center justify-center opacity-0 group-hover:opacity-100 transition-all">
                             <ExternalLink className="h-4 w-4" />
                          </div>
                       </div>
                     ))}
                  </div>
               </div>
             )}

             {/* Live Charts */}
             <div className="bg-slate-900/30 p-8 rounded-3xl border border-slate-800">
                <h3 className="text-sm font-bold text-slate-400 uppercase mb-6">Tendencia de Escrutinio</h3>
                <div className="h-[200px] w-full">
                   <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={reports.slice(-5)}>
                         <XAxis dataKey="mesa" stroke="#475569" fontSize={10} />
                         <Tooltip cursor={{fill: '#1e293b'}} contentStyle={{backgroundColor: '#0f172a', border: 'none'}} />
                         <Bar dataKey="votosCandidato" fill="#3b82f6" radius={[4, 4, 0, 0]} />
                         <Bar dataKey="votosOpositor" fill="#ef4444" radius={[4, 4, 0, 0]} />
                      </BarChart>
                   </ResponsiveContainer>
                </div>
             </div>
          </div>

          {/* SIDERBAR: ALERTS & STATS */}
          <div className="space-y-6">
             <div className="bg-red-950/20 p-6 rounded-3xl border border-red-900/30">
                <h3 className="text-sm font-bold text-red-500 uppercase mb-6 flex items-center gap-2">
                   <AlertTriangle className="h-4 w-4" /> Alertas de Seguridad
                </h3>
                <div className="space-y-4">
                   {alerts.map(alert => (
                     <div key={alert.id} className={`p-4 rounded-2xl border ${alert.severity === 'high' ? 'bg-red-900/20 border-red-900/40 animate-pulse' : 'bg-slate-900 border-slate-800'}`}>
                        <div className="flex justify-between items-start mb-2">
                           <span className="text-[10px] font-black text-red-500 uppercase">{alert.type} alert</span>
                           <span className="text-[10px] text-slate-500">{alert.time}</span>
                        </div>
                        <p className="text-xs font-bold leading-relaxed">{alert.msg}</p>
                     </div>
                   ))}
                </div>
                <button className="w-full mt-6 py-3 border border-red-900/40 text-[10px] font-black uppercase text-red-500 rounded-xl hover:bg-red-900/20 transition-all">
                   Activar Protocolo de Respuesta
                </button>
             </div>

             <div className="bg-slate-900/50 p-6 rounded-3xl border border-slate-800 space-y-4">
                <h3 className="text-[10px] font-black text-slate-500 uppercase">Estado de Testigos</h3>
                <div className="flex items-end gap-1 h-32">
                   {BARRIOS.map((_, i) => (
                     <div key={i} className="flex-1 bg-blue-600/20 rounded-t hover:bg-blue-600 transition-all" style={{ height: `${30 + (i * 7) % 70}%` }} />
                   ))}
                </div>
                <div className="flex justify-between text-[10px] font-bold">
                   <span className="text-blue-500">92% REPORTANDO</span>
                   <span className="text-slate-500">450/489 TESTIGOS</span>
                </div>
             </div>
          </div>
       </div>
    </div>
  );
};

// --- MAIN PROVIDER & WRAPPER ---

export default function SaaSArchitectureApp() {
  const [state, setState] = useState<AppState>(() => generateInitialData());
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  const [currentView, setCurrentView] = useState<'dashboard' | 'directory' | 'missions' | 'messaging' | 'finances' | 'territory' | 'day-d'>('dashboard');

  const triggerRules = (voter: Voter, currentMissions: Mission[]): Mission[] => {
    const newMissions: Mission[] = [];
    const existingForVoter = currentMissions.filter(m => m.voterId === voter.id);

    // Rule 1: Indeciso (2-3) -> Llamada de Persuasión
    if (voter.intencion >= 2 && voter.intencion <= 3) {
      if (!existingForVoter.find(m => m.title === "Llamada de Persuasión")) {
        newMissions.push({
          id: Date.now() + Math.random(),
          voterId: voter.id,
          title: "Llamada de Persuasión",
          status: 'Pendiente',
          assignedTo: voter.liderId,
          createdAt: new Date().toISOString()
        });
      }
    }

    // Rule 2: Voto Duro (4-5) & no puesto -> Localización de Puesto
    if (voter.intencion >= 4 && (!voter.puesto || voter.puesto === "")) {
      if (!existingForVoter.find(m => m.title === "Localización de Puesto")) {
        newMissions.push({
          id: Date.now() + Math.random(),
          voterId: voter.id,
          title: "Localización de Puesto",
          status: 'Pendiente',
          assignedTo: voter.liderId,
          createdAt: new Date().toISOString()
        });
      }
    }

    return newMissions;
  };

  const setRole = useCallback((role: Role) => {
    const newUser = state.users.find(u => u.role === role) || state.users[0];
    setState(prev => ({ ...prev, currentUser: { ...newUser, role } }));
    if (role === 'Testigo') setCurrentView('day-d');
  }, [state.users]);

  const deleteVoter = useCallback((id: number) => {
    setState(prev => ({
      ...prev,
      voters: prev.voters.filter(v => v.id !== id),
      missions: prev.missions.filter(m => m.voterId !== id),
      logs: [{ id: Date.now(), msg: `Votante ID ${id} eliminado`, time: "0 min", type: 'warning' }, ...prev.logs]
    }));
  }, []);

  const addVoter = useCallback((voterData: Omit<Voter, 'id'>) => {
    const newVoter = { ...voterData, id: Date.now() };
    setState(prev => {
      const newMissions = triggerRules(newVoter, prev.missions);
      return {
        ...prev,
        voters: [newVoter, ...prev.voters],
        missions: [...newMissions, ...prev.missions],
        logs: [{ id: Date.now(), msg: `Votante ${newVoter.name} agregado`, time: "0 min", type: 'info' }, ...prev.logs]
      };
    });
  }, []);

  const updateVoter = useCallback((id: number, voterData: Partial<Voter>) => {
    setState(prev => {
      const updatedVoters = prev.voters.map(v => v.id === id ? { ...v, ...voterData } : v);
      const updatedVoter = updatedVoters.find(v => v.id === id);
      if (updatedVoter) {
        const newMissions = triggerRules(updatedVoter, prev.missions);
        return {
          ...prev,
          voters: updatedVoters,
          missions: [...newMissions, ...prev.missions],
          logs: [{ id: Date.now(), msg: `Votante ${updatedVoter.name} actualizado`, time: "0 min", type: 'info' }, ...prev.logs]
        };
      }
      return prev;
    });
  }, []);

  const massImport = useCallback(() => {
    setState(prev => {
      const newVoters: Voter[] = Array.from({ length: 1000 }).map((_, i) => {
        const barrio = BARRIOS[Math.floor(Math.random() * BARRIOS.length)];
        const id = prev.voters.length + i + 5000;
        const lider = prev.users.find(u => u.role === 'LiderZonal' && u.zona === barrio) || prev.users[0];
        return {
          id,
          cedula: `80${100000 + i}`,
          name: `Importado ${i + 1}`,
          phone: `310${2000000 + i}`,
          gender: Math.random() > 0.5 ? 'M' : 'F',
          barrio,
          puesto: Math.random() > 0.2 ? `Colegio ${barrio}` : "",
          mesa: Math.floor(Math.random() * 20) + 1,
          intencion: Math.floor(Math.random() * 5) + 1,
          interacciones: [],
          liderId: lider.id
        };
      });

      let allNewMissions: Mission[] = [];
      newVoters.forEach(v => {
        allNewMissions = [...allNewMissions, ...triggerRules(v, [])];
      });
      return {
        ...prev,
        voters: [...newVoters, ...prev.voters],
        missions: [...allNewMissions, ...prev.missions],
        logs: [{ id: Date.now(), msg: `Importación masiva: 1,000 registros cargados`, time: "0 min", type: 'info' }, ...prev.logs]
      };
    });
  }, []);

  const updateMissionStatus = useCallback((id: number, status: MissionStatus, evidence?: string) => {
    setState(prev => ({
      ...prev,
      missions: prev.missions.map(m => {
        if (m.id === id) {
          // Flow: Pendiente -> En Proceso -> Validación -> Completada
          return { ...m, status, evidence: evidence || m.evidence };
        }
        return m;
      }),
      logs: [{ id: Date.now(), msg: `Misión ${id} actualizada a ${status}`, time: "0 min", type: 'info' }, ...prev.logs]
    }));
  }, []);

  const createCampaign = useCallback((campaign: Omit<Campaign, 'id' | 'status'>) => {
    const newCampaign: Campaign = {
      ...campaign,
      id: Date.now(),
      status: 'Sent',
      sentAt: new Date().toISOString()
    };
    setState(prev => ({
      ...prev,
      messages: [newCampaign, ...prev.messages],
      logs: [{ id: Date.now(), msg: `Campaña "${campaign.name}" enviada a ${campaign.audienceCount} personas`, time: "0 min", type: 'info' }, ...prev.logs]
    }));
  }, []);

  const addInteraction = useCallback((voterId: number, interaction: Interaction) => {
    setState(prev => ({
      ...prev,
      voters: prev.voters.map(v => v.id === voterId ? { ...v, interacciones: [interaction, ...v.interacciones] } : v)
    }));
  }, []);

  const addTransaction = useCallback((tx: Omit<Transaction, 'id' | 'createdBy' | 'date'>) => {
    setState(prev => {
      const totalGastos = prev.transactions
        .filter(t => t.type === 'Gasto')
        .reduce((acc, curr) => acc + curr.amount, 0);
      
      if (tx.type === 'Gasto' && (totalGastos + tx.amount) > LIMITE_GASTOS_CNE) {
        if (!window.confirm("RIESGO DE SANCIÓN LEGAL: Este gasto supera el tope permitido por el CNE. ¿Desea proceder bajo su responsabilidad?")) {
          return prev;
        }
      }

      const newTx: Transaction = { 
        ...tx, 
        id: Date.now(), 
        date: new Date().toISOString().split('T')[0],
        createdBy: prev.currentUser.name
      };

      return {
        ...prev,
        transactions: [...prev.transactions, newTx],
        logs: [{ id: Date.now(), msg: `Movimiento registrado (${tx.status}): ${tx.concept}`, time: "0 min", type: tx.type === 'Gasto' ? 'warning' : 'info' }, ...prev.logs]
      };
    });
  }, []);

  const addReport = useCallback((report: Omit<E14Report, 'id' | 'timestamp' | 'testigoId'>) => {
    setState(prev => {
      const newReport: E14Report = {
        ...report,
        id: Date.now(),
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        testigoId: prev.currentUser.id
      };

      const newAlerts = [...prev.alerts];
      if (report.votosCandidato === 0 && report.votosOpositor > 10) {
        newAlerts.unshift({
          id: Date.now(),
          msg: `FRAUDE POTENCIAL: Mesa ${report.mesa} reportó 0 votos para candidato.`,
          time: newReport.timestamp,
          type: 'fraud',
          severity: 'high'
        });
      }

      return {
        ...prev,
        reports: [...prev.reports, newReport],
        alerts: newAlerts,
        logs: [{ id: Date.now(), msg: `Reporte recibido Mesa ${report.mesa}`, time: "0 min", type: 'info' }, ...prev.logs]
      };
    });
  }, []);

  const contextValue = useMemo(() => ({
    state,
    setCurrentUser: (user: User) => setState(prev => ({ ...prev, currentUser: user })),
    setRole,
    deleteVoter,
    addVoter,
    updateVoter,
    addInteraction,
    addTransaction,
    addReport,
    massImport,
    updateMissionStatus,
    createCampaign
  }), [state, setRole, deleteVoter, addVoter, updateVoter, addInteraction, addTransaction, addReport, massImport, updateMissionStatus, createCampaign]);

  const navigationItems = [
    { id: 'dashboard', label: 'Dashboard', icon: TrendingUp },
    { id: 'directory', label: 'Censo Electoral', icon: Users },
    { id: 'missions', label: 'Misiones / Tareas', icon: Activity },
    { id: 'messaging', label: 'Mensajería', icon: MessageSquare },
    { id: 'territory', label: 'Territorio', icon: MapPin },
    { id: 'finances', label: 'Finanzas', icon: DollarSign },
    { id: 'day-d', label: 'War Room / Día D', icon: Flag },
  ].filter(item => {
    if (state.currentUser.role === 'Testigo') return item.id === 'day-d';
    if (state.currentUser.role === 'Contador') return ['dashboard', 'finances'].includes(item.id);
    if (state.currentUser.role === 'LiderZonal') return item.id !== 'finances';
    return true;
  });

  return (
    <AppContext.Provider value={contextValue}>
      <div className={`flex h-screen overflow-hidden font-sans ${currentView === 'day-d' ? 'bg-slate-950' : 'bg-slate-50'}`}>
        
        {/* Sidebar */}
        <aside className={`${isSidebarOpen ? 'w-72' : 'w-20'} bg-slate-900 transition-all duration-300 flex flex-col z-30 shadow-2xl`}>
          <div className="p-6 flex items-center justify-between border-b border-slate-800">
            {isSidebarOpen && <h1 className="text-xl font-black text-white tracking-tighter italic">POLITICA<span className="text-red-600">2026</span></h1>}
            <button onClick={() => setIsSidebarOpen(!isSidebarOpen)} className="text-slate-400 hover:text-white">
              {isSidebarOpen ? <X /> : <Menu />}
            </button>
          </div>

          <nav className="flex-1 px-4 py-6 space-y-2 overflow-y-auto">
            {navigationItems.map((item) => (
              <div 
                key={item.id} 
                onClick={() => setCurrentView(item.id as 'dashboard' | 'directory' | 'missions' | 'messaging' | 'finances' | 'territory' | 'day-d')}
                className={`flex items-center gap-4 p-3 rounded-xl cursor-pointer transition-all ${
                  currentView === item.id 
                  ? (item.id === 'day-d' ? 'bg-red-600 text-white' : 'bg-blue-600 text-white') 
                  : 'text-slate-400 hover:bg-slate-800'
                }`}
              >
                <item.icon className="h-5 w-5" />
                {isSidebarOpen && <span className="font-bold text-sm uppercase tracking-tighter">{item.label}</span>}
              </div>
            ))}
          </nav>

          <div className="p-4 border-t border-slate-800">
            {isSidebarOpen && <p className="text-[10px] font-black text-slate-500 uppercase mb-2 px-2">Simulador de Rol (RBAC)</p>}
            <select 
              className="w-full bg-slate-800 text-white text-sm rounded-lg p-2 border-none focus:ring-2 focus:ring-red-600 font-bold"
              value={state.currentUser.role}
              onChange={(e) => setRole(e.target.value as Role)}
            >
              <option value="SuperAdmin">SuperAdmin</option>
              <option value="Gerente">Gerente</option>
              <option value="LiderZonal">Líder Zonal</option>
              <option value="Contador">Contador</option>
              <option value="Testigo">Testigo</option>
            </select>
          </div>
        </aside>

        {/* Main Content Area */}
        <main className="flex-1 flex flex-col overflow-hidden">
          <header className={`h-16 flex items-center justify-between px-8 z-20 shadow-sm ${currentView === 'day-d' ? 'bg-slate-900 border-b border-red-900/30' : 'bg-white border-b border-slate-200'}`}>
            <div className="flex items-center gap-4">
               <div className={`h-2 w-2 rounded-full animate-pulse ${currentView === 'day-d' ? 'bg-red-500' : 'bg-green-500'}`} />
               <span className={`text-[10px] font-black uppercase tracking-widest ${currentView === 'day-d' ? 'text-red-500' : 'text-slate-500'}`}>
                  {currentView === 'day-d' ? 'SECURE_CHANNEL_ACTIVE' : 'Colombia-Central-1'}
               </span>
            </div>
            <div className="flex items-center gap-4">
              <div className="text-right">
                <p className={`text-sm font-black leading-none ${currentView === 'day-d' ? 'text-white' : 'text-slate-900'}`}>{state.currentUser.name}</p>
                <p className={`text-[10px] font-bold uppercase tracking-tighter ${currentView === 'day-d' ? 'text-red-500' : 'text-blue-600'}`}>{state.currentUser.role}</p>
              </div>
              <div className={`h-10 w-10 rounded-full flex items-center justify-center font-black ${currentView === 'day-d' ? 'bg-red-600 text-white' : 'bg-slate-200 text-slate-600'}`}>
                {state.currentUser.name[0]}
              </div>
            </div>
          </header>

          <div className={`flex-1 overflow-y-auto p-4 md:p-8 ${currentView === 'day-d' ? 'bg-black' : 'bg-slate-50'}`}>
            {currentView === 'dashboard' ? <DashboardView /> : 
             currentView === 'directory' ? <VoterDirectory /> : 
             currentView === 'missions' ? <MissionsView /> :
             currentView === 'messaging' ? <MessagingView /> :
             currentView === 'finances' ? <FinanceModule /> : 
             currentView === 'territory' ? <TerritoryModule /> :
             <ElectionDayModule />}
          </div>
        </main>
      </div>
    </AppContext.Provider>
  );
}
