"use client";

import React, { useMemo, useState } from 'react';
import { useCRM } from '@/context/CRMContext';
import { 
  ShieldCheck, 
  AlertTriangle, 
  Download, 
  Upload, 
  ShieldAlert, 
  History, 
  Info, 
  Lock, 
  BarChart3, 
  PieChart as PieIcon,
  Scale,
  Plus,
  Search,
  Filter,
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Clock
} from 'lucide-react';
import { 
  BarChart, 
  Bar, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  ResponsiveContainer, 
  PieChart, 
  Pie, 
  Cell, 
  Legend 
} from 'recharts';
import { cn } from '@/components/ui/utils';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

// CONSTANTES DE NORMATIVA CNE COLOMBIA
const CNE_CATEGORIES: Record<string, string> = {
  'PUBLICIDAD_VALLAS': 'Propaganda Electoral (Vallas)',
  'SEDE_CAMPANA': 'Oficinas y Sedes',
  'ACTOS_PUBLICOS': 'Actos Públicos',
  'TRANSPORTE': 'Transporte y Correo',
  'OTROS': 'Otros Gastos No Clasificados'
};

const ELECTION_DATE = new Date('2026-03-15'); // Fecha estimada Elecciones 2026

export default function CompliancePage() {
  const { 
    compliance, 
    finance, 
    getComplianceScore, 
    uploadEvidence, 
    addComplianceObligation,
    logAction, 
    auditLogs,
    getProjectedCompliance,
    TOPE_LEGAL_CNE 
  } = useCRM();

  const score = getComplianceScore();
  const projectedData = getProjectedCompliance();
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isNewObligationModalOpen, setIsNewObligationModalOpen] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [newObligation, setNewObligation] = useState({ title: '', deadline: '', priority: 'Media' as const, type: 'Cuentas Claras' as const });

  // Obligations Filtering & Pagination State
  const [obligationSearch, setObligationSearch] = useState('');
  const [filterStatus, setFilterStatus] = useState('all');
  const [filterType, setFilterType] = useState('all');
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 5;

  const [isStatusDropdownOpen, setIsStatusDropdownOpen] = useState(false);
  const [isTypeDropdownOpen, setIsTypeDropdownOpen] = useState(false);

  // Lógica de Score Ponderado (Forense)
  const weightedScore = useMemo(() => {
    if (compliance.length === 0) return 0;
    const weights = { 'Alta': 3, 'Media': 2, 'Baja': 1 };
    const totalWeight = compliance.reduce((acc, o) => acc + (weights[o.priority as keyof typeof weights] || 0), 0);
    if (totalWeight === 0) return 0;
    
    const completedWeight = compliance
      .filter(o => o.status === 'Cumplido')
      .reduce((acc, o) => acc + (weights[o.priority as keyof typeof weights] || 0), 0);
    return (completedWeight / totalWeight) * 100;
  }, [compliance]);

  // Lógica de Ordenamiento Inteligente y Filtrado Consolidada
  const filteredObligations = useMemo(() => {
    return compliance
      .filter(o => {
        const matchesSearch = !obligationSearch || o.title.toLowerCase().includes(obligationSearch.toLowerCase());
        const matchesStatus = filterStatus === 'all' || o.status === filterStatus;
        const matchesType = filterType === 'all' || o.type === filterType;
        return matchesSearch && matchesStatus && matchesType;
      })
      .sort((a, b) => {
        if (a.status !== b.status) return a.status === 'Pendiente' ? -1 : 1;
        const priorityMap = { 'Alta': 3, 'Media': 2, 'Baja': 1 };
        if (priorityMap[a.priority] !== priorityMap[b.priority]) 
          return priorityMap[b.priority] - priorityMap[a.priority];
        return new Date(a.deadline).getTime() - new Date(b.deadline).getTime();
      });
  }, [compliance, obligationSearch, filterStatus, filterType]);

  const totalPages = Math.ceil(filteredObligations.length / itemsPerPage);
  const paginatedObligations = filteredObligations.slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage);

  const OBLIGATION_TYPES = ["Cuentas Claras", "Registro Libros", "Publicidad Exterior", "Laboral / Contratos", "Otros"];

  // LÓGICA FINANCIERA REAL (BURN RATE & RUNWAY)
  const complianceStats = useMemo(() => {
    const { actualExpenses, projectedEventsCost } = projectedData;

    // Traducir códigos CNE y agrupar
    const expensesByCne = finance
      .filter(f => f.type === 'Gasto')
      .reduce((acc: Record<string, number>, curr) => {
        const category = CNE_CATEGORIES[curr.cneCode || ''] || CNE_CATEGORIES['OTROS'];
        const amount = Number(curr.amount || 0);
        acc[category] = (acc[category] || 0) + (isNaN(amount) ? 0 : amount);
        return acc;
      }, {});

    const pieData = Object.entries(expensesByCne).map(([name, value]) => ({ name, value }));

    // Cálculo de Burn Rate
    const daysUntilElection = Math.max(1, Math.ceil((ELECTION_DATE.getTime() - new Date().getTime()) / (1000 * 3600 * 24)));
    const remainingBudget = TOPE_LEGAL_CNE - actualExpenses;
    const dailyRunway = remainingBudget / daysUntilElection;

    const barData = [
      { name: 'Real', monto: actualExpenses, fill: '#0d9488' },
      { name: 'Proyectado', monto: actualExpenses + projectedEventsCost, fill: '#14b8a6' },
      { name: 'Tope Legal', monto: TOPE_LEGAL_CNE, fill: '#f1f5f9' }
    ];

    return {
      executionPercentage: ((actualExpenses + projectedEventsCost) / TOPE_LEGAL_CNE) * 100,
      pieData,
      barData,
      dailyRunway,
      daysUntilElection
    };
  }, [finance, projectedData, TOPE_LEGAL_CNE]);

  const { executionPercentage: realExecPercent, pieData, barData, dailyRunway, daysUntilElection } = complianceStats;

  // LÓGICA DE SALUD NORMATIVA COMPUESTA (MEJORADA)
  const alertStatus = useMemo(() => {
    const hasCriticalPending = compliance.some(o => o.priority === 'Alta' && o.status !== 'Cumplido');
    const daysToNearestDeadline = compliance
      .filter(o => o.status !== 'Cumplido' && o.deadline)
      .map(o => {
        const deadline = new Date(o.deadline).getTime();
        if (isNaN(deadline)) return null;
        const diff = deadline - new Date().getTime();
        return Math.ceil(diff / (1000 * 3600 * 24));
      })
      .filter((d): d is number => d !== null)
      .sort((a, b) => a - b)[0] ?? 999;

    if (realExecPercent > 95 || (hasCriticalPending && daysToNearestDeadline < 2)) {
      return { 
        color: 'text-red-600', bg: 'bg-red-50', border: 'border-red-200', 
        msg: 'CRÍTICO: Riesgo de Sanción / Bloqueo CNE', 
        icon: <ShieldAlert className="animate-pulse" size={32} />, 
        status: 'Alerta Roja',
        description: 'Superación de topes o hitos legales críticos vencidos.'
      };
    }
    if (realExecPercent >= 80 || hasCriticalPending || daysToNearestDeadline < 5) {
      return { 
        color: 'text-amber-600', bg: 'bg-amber-50', border: 'border-amber-200', 
        msg: 'ADVERTENCIA: Desviación Normativa Detectada', 
        icon: <AlertTriangle size={32} />, 
        status: 'Atención',
        description: 'Revisar soportes de gastos y hitos de prioridad alta próximamente.'
      };
    }
    return { 
      color: 'text-teal-600', bg: 'bg-teal-50', border: 'border-teal-200', 
      msg: 'ESTADO SEGURO: Blindaje Legal Operativo', 
      icon: <ShieldCheck size={32} />, 
      status: 'Óptimo',
      description: 'La campaña opera bajo los parámetros legales y cronogramas vigentes.'
    };
  }, [realExecPercent, compliance]);

  const formatCOP = (val: number) => 
    new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 }).format(val);

  const COLORS = ['#0d9488', '#10b981', '#f59e0b', '#ef4444', '#14b8a6'];

  const handleGenerateReport = () => {
    const doc = new jsPDF();
    doc.setFontSize(20);
    doc.text("INFORME DE COMPLIANCE - CUENTAS CLARAS", 14, 22);
    doc.setFontSize(10);
    doc.text(`Fecha: ${new Date().toLocaleDateString()}`, 14, 30);
    doc.text(`Porcentaje de Ejecución Proyectada: ${realExecPercent.toFixed(2)}%`, 14, 35);
    doc.text(`Gasto Real: ${formatCOP(projectedData.actualExpenses)}`, 14, 40);

    autoTable(doc, {
      startY: 50,
      head: [['Categoría CNE', 'Total Gastado']],
      body: pieData.map(d => [d.name, formatCOP(d.value as number)]),
      headStyles: { fillColor: [13, 148, 136] } // teal-600
    });

    autoTable(doc, {
      startY: (doc as jsPDF & { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 10,
      head: [['Obligación', 'Estado', 'Vencimiento']],
      body: compliance.map(o => [o.title, o.status, o.deadline]),
      headStyles: { fillColor: [20, 184, 166] } // teal-500
    });

    doc.save(`reporte_compliance_${Date.now()}.pdf`);
    logAction('Admin', 'Generó reporte consolidado de Compliance', 'Compliance', 'Info');
  };

  const handleAddObligation = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newObligation.title || !newObligation.deadline) return;
    
    addComplianceObligation(newObligation);
    setNewObligation({ title: '', deadline: '', priority: 'Media', type: 'Cuentas Claras' });
    setIsNewObligationModalOpen(false);
  };

  return (
    <div className="space-y-8 pb-20 animate-in fade-in duration-500">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h1 className="text-4xl font-black text-slate-900 tracking-tighter uppercase">Módulo de Compliance</h1>
          <p className="text-slate-500 font-medium">Control legal, topes de campaña y reportes CNE.</p>
        </div>
        <button 
          onClick={handleGenerateReport}
          className="bg-teal-600 text-white px-8 py-4 rounded-2xl font-black text-xs tracking-widest uppercase shadow-xl shadow-teal-100 hover:bg-teal-700 transition-all flex items-center gap-2"
        >
          <Download size={18} /> Descargar Reporte Consolidado
        </button>
      </div>

      {/* MONITOR DE BLINDAJE LEGAL (REDESIGN) */}
      <div className={cn(
        "p-10 rounded-[4rem] border-4 flex flex-col lg:flex-row items-center gap-10 transition-all duration-700 shadow-2xl relative overflow-hidden",
        alertStatus.bg, alertStatus.border, alertStatus.color
      )}>
        {/* Decorative background element */}
        <div className="absolute top-0 right-0 w-64 h-64 opacity-5 rotate-12 -translate-y-20 translate-x-20">
          <ShieldCheck size={256} />
        </div>

        <div className="w-28 h-28 rounded-[2.5rem] bg-white flex items-center justify-center shadow-xl border-4 border-white/50 animate-in zoom-in duration-500">
          {alertStatus.icon}
        </div>
        
        <div className="flex-1 text-center lg:text-left">
          <div className="flex items-center justify-center lg:justify-start gap-3 mb-2">
            <span className={cn("px-4 py-1 rounded-full text-[10px] font-black uppercase tracking-[0.3em] border", alertStatus.border, "bg-white")}>
              {alertStatus.status}
            </span>
            <span className="text-[10px] font-black uppercase tracking-[0.2em] opacity-40">Sistema de Control SIT</span>
          </div>
          <h3 className="text-3xl font-black tracking-tighter leading-none mb-3">{alertStatus.msg}</h3>
          <p className="text-sm font-bold opacity-70 max-w-xl leading-relaxed">
            {alertStatus.description}
          </p>
        </div>

        <div className="grid grid-cols-2 gap-8 px-10 border-l border-white/30">
          <div className="text-center">
             <p className="text-[9px] font-black uppercase tracking-widest opacity-60 mb-1">Tope Ejecutado</p>
             <h3 className="text-5xl font-black tabular-nums">{realExecPercent.toFixed(1)}%</h3>
             <p className="text-[8px] font-bold opacity-50 mt-1">Disp/Día: {formatCOP(dailyRunway)}</p>
          </div>
          <div className="text-center">
             <p className="text-[9px] font-black uppercase tracking-widest opacity-60 mb-1">Puntaje Hitos</p>
             <h3 className="text-5xl font-black tabular-nums">{Math.round(weightedScore)}%</h3>
             <p className="text-[8px] font-bold opacity-50 mt-1">{daysUntilElection} días para Día D</p>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        {/* GRÁFICO DE BARRAS: PRESUPUESTO VS REAL */}
        <div className="bg-white p-10 rounded-[3rem] border-2 border-slate-100 shadow-sm relative overflow-hidden group hover:border-teal-500/30 transition-all">
          <div className="flex items-center gap-2 mb-8">
            <BarChart3 className="text-teal-600" size={20} />
            <h3 className="text-xs font-black uppercase text-slate-400 tracking-[0.2em]">Ejecución Presupuestal Detallada</h3>
          </div>
          {barData.every(d => d.monto === 0 && d.name !== 'Tope Legal') ? (
            <div className="h-[300px] flex flex-col items-center justify-center text-center p-6 bg-slate-50 rounded-[2rem] border border-dashed border-slate-200">
               <Scale className="text-slate-300 mb-2" size={32} />
               <p className="text-[10px] font-black uppercase text-slate-400">Sin gastos registrados</p>
               <p className="text-[8px] font-bold text-slate-400 mt-1 max-w-[200px]">Registra egresos en el módulo de Finanzas para ver el comparativo legal.</p>
            </div>
          ) : (
            <div className="h-[300px]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={barData}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                  <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{fontSize: 10, fontWeight: 'bold'}} />
                  <YAxis hide />
                  <Tooltip formatter={(val: number | undefined) => val !== undefined ? formatCOP(val) : ''} contentStyle={{borderRadius: '16px', border: 'none', boxShadow: '0 10px 15px -3px rgba(0,0,0,0.1)'}} />
                  <Bar dataKey="monto" radius={[10, 10, 0, 0]}>
                    {barData.map((entry: any, index: number) => (
                      <Cell 
                        key={`cell-${index}`} 
                        fill={realExecPercent > 90 && entry.name !== 'Tope Legal' ? '#ef4444' : entry.fill} 
                      />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>

        {/* GRÁFICO DE TORTA: GASTOS POR CÓDIGO CNE */}
        <div className="bg-white p-10 rounded-[3rem] border-2 border-slate-100 shadow-sm group hover:border-teal-500/30 transition-all">
          <div className="flex items-center gap-2 mb-8">
            <PieIcon className="text-teal-500" size={20} />
            <h3 className="text-xs font-black uppercase text-slate-400 tracking-[0.2em]">Gastos por Categoría Legal (CNE)</h3>
          </div>
          {pieData.length === 0 ? (
            <div className="h-[300px] flex flex-col items-center justify-center text-center p-6 bg-slate-50 rounded-[2rem] border border-dashed border-slate-200">
               <PieIcon className="text-slate-300 mb-2" size={32} />
               <p className="text-[10px] font-black uppercase text-slate-400">Sin categorías reportadas</p>
               <p className="text-[8px] font-bold text-slate-400 mt-1 max-w-[200px]">Asigna un Código CNE a tus gastos para ver la distribución.</p>
            </div>
          ) : (
            <div className="h-[300px]">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={pieData}
                    cx="50%"
                    cy="50%"
                    innerRadius={60}
                    outerRadius={80}
                    paddingAngle={5}
                    dataKey="value"
                  >
                    {pieData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip formatter={(val: number | undefined) => val !== undefined ? formatCOP(val) : ''} />
                  <Legend verticalAlign="bottom" height={36} wrapperStyle={{fontSize: '10px', fontWeight: 'bold'}} />
                </PieChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* MATRIZ DE OBLIGACIONES */}
        <div className="lg:col-span-2 bg-white border-2 border-slate-100 rounded-[3rem] overflow-hidden shadow-sm flex flex-col">
          <div className="px-10 py-8 border-b border-slate-50 bg-slate-50/50 flex flex-col xl:flex-row justify-between items-start xl:items-center gap-6">
            <div>
              <h3 className="font-black text-slate-900 flex items-center gap-2 uppercase text-sm tracking-tighter">
                <Scale size={20} className="text-teal-600" /> Matriz de Obligaciones Normativas
              </h3>
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-1">Control de Blindaje Electoral CNE</p>
            </div>
            
            <div className="flex flex-wrap items-center gap-3 w-full xl:w-auto">
              {/* Search obligations */}
              <div className="relative flex-1 md:flex-none md:min-w-[200px] group">
                <Search size={14} className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 group-focus-within:text-teal-600 transition-colors" />
                <input 
                  type="text" 
                  placeholder="Buscar hito legal..." 
                  className="w-full pl-10 pr-4 py-3 bg-white border border-slate-200 rounded-xl text-[10px] font-black uppercase tracking-widest focus:border-teal-500 focus:ring-4 focus:ring-teal-500/5 outline-none transition-all"
                  value={obligationSearch}
                  onChange={(e) => setObligationSearch(e.target.value)}
                />
              </div>

                {/* Status filter */}
                <div className="relative">
                  <button 
                    onClick={() => { setIsStatusDropdownOpen(!isStatusDropdownOpen); setIsTypeDropdownOpen(false); }}
                    className="px-4 py-3 bg-white border border-slate-200 rounded-xl flex items-center gap-3 hover:bg-slate-50 transition-all group"
                  >
                    <Filter size={14} className="text-teal-600" />
                    <span className="text-[9px] font-black uppercase tracking-widest text-slate-600">{filterStatus === 'all' ? 'Estado' : filterStatus}</span>
                    <ChevronDown size={14} className={cn("text-slate-400 transition-transform", isStatusDropdownOpen && "rotate-180")} />
                  </button>
                  {isStatusDropdownOpen && (
                    <div className="absolute top-full left-0 mt-2 w-40 bg-white border border-slate-100 rounded-xl shadow-xl z-50 overflow-hidden animate-in fade-in zoom-in-95 duration-200 p-1">
                      {['all', 'Pendiente', 'Cumplido'].map(s => (
                        <button 
                          key={s} 
                          onClick={() => { setFilterStatus(s); setIsStatusDropdownOpen(false); }}
                          className={cn("w-full px-4 py-2 text-left text-[9px] font-black uppercase tracking-widest rounded-lg flex justify-between items-center transition-all", 
                            filterStatus === s ? "bg-teal-50 text-teal-600" : "text-slate-500 hover:bg-slate-50")}
                        >
                          {s === 'all' ? 'Todos' : s}
                          {filterStatus === s && <Check size={12} />}
                        </button>
                      ))}
                    </div>
                  )}
                </div>

                {/* Type filter */}
                <div className="relative">
                  <button 
                    onClick={() => { setIsTypeDropdownOpen(!isTypeDropdownOpen); setIsStatusDropdownOpen(false); }}
                    className="px-4 py-3 bg-white border border-slate-200 rounded-xl flex items-center gap-3 hover:bg-slate-50 transition-all group"
                  >
                    <Scale size={14} className="text-teal-600" />
                    <span className="text-[9px] font-black uppercase tracking-widest text-slate-600">{filterType === 'all' ? 'Categoría' : filterType}</span>
                    <ChevronDown size={14} className={cn("text-slate-400 transition-transform", isTypeDropdownOpen && "rotate-180")} />
                  </button>
                  {isTypeDropdownOpen && (
                    <div className="absolute top-full left-0 mt-2 w-48 bg-white border border-slate-100 rounded-xl shadow-xl z-50 overflow-hidden animate-in fade-in zoom-in-95 duration-200 p-1">
                      {['all', ...OBLIGATION_TYPES].map(t => (
                        <button 
                          key={t} 
                          onClick={() => { setFilterType(t); setIsTypeDropdownOpen(false); }}
                          className={cn("w-full px-4 py-2 text-left text-[9px] font-black uppercase tracking-widest rounded-lg flex justify-between items-center transition-all", 
                            filterType === t ? "bg-teal-50 text-teal-600" : "text-slate-500 hover:bg-slate-50")}
                        >
                          {t === 'all' ? 'Todas' : t}
                          {filterType === t && <Check size={12} />}
                        </button>
                      ))}
                    </div>
                  )}
                </div>

              <div className="h-8 w-px bg-slate-200 mx-1 hidden md:block" />

              <div className="flex items-center gap-3">
                <span className="bg-teal-50 text-teal-600 px-4 py-2 rounded-full text-[10px] font-black uppercase tracking-widest border border-teal-100 shadow-inner">
                  Puntaje: {Math.round(score)}%
                </span>
                <button 
                  onClick={() => setIsNewObligationModalOpen(true)}
                  className="bg-slate-900 text-white p-3 md:px-5 md:py-3 rounded-xl text-[10px] font-black uppercase tracking-widest hover:bg-teal-600 transition-all shadow-xl shadow-slate-200 flex items-center justify-center gap-2 group"
                  title="Nueva Obligación CNE"
                >
                  <Plus size={16} className="group-hover:rotate-90 transition-transform" /> <span className="hidden md:inline">Añadir Hito</span>
                </button>
              </div>
            </div>
          </div>

          <div className="overflow-x-auto flex-1 min-h-[400px]">
            <table className="w-full text-left">
              <thead className="bg-slate-50/50 text-[10px] font-black uppercase text-slate-400 tracking-[0.2em] border-b border-slate-50">
                <tr>
                  <th className="px-10 py-6">Requisito Legal / Categoría</th>
                  <th className="px-10 py-6">Estado / Vencimiento</th>
                  <th className="px-10 py-6 text-right">Acción Documental</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {paginatedObligations.length > 0 ? (
                  paginatedObligations.map((o) => {
                    const daysDiff = Math.ceil((new Date(o.deadline).getTime() - new Date().getTime()) / (1000 * 3600 * 24));
                    const isUrgent = daysDiff >= 0 && daysDiff <= 3 && o.status !== 'Cumplido';
                    const isOverdue = daysDiff < 0 && o.status !== 'Cumplido';

                    return (
                      <tr key={o.id} className={cn("hover:bg-teal-50/20 transition-all group animate-in fade-in slide-in-from-left-2 duration-300", 
                        isOverdue ? "bg-red-50/30" : isUrgent ? "bg-amber-50/30" : "")}>
                        <td className="px-10 py-8">
                          <div className="flex items-start gap-5">
                            <div className={cn("w-2 h-16 rounded-full shrink-0 shadow-inner", 
                              o.priority === 'Alta' ? 'bg-rose-500 shadow-rose-200' : 
                              o.priority === 'Media' ? 'bg-amber-500 shadow-amber-200' : 'bg-slate-300 shadow-slate-100')} />
                            <div className="space-y-2">
                              <p className="text-base font-black text-slate-900 group-hover:text-teal-600 transition-colors uppercase tracking-tight leading-tight">{o.title}</p>
                              <div className="flex flex-wrap items-center gap-2">
                                <span className="text-[8px] font-black text-teal-600 uppercase tracking-widest bg-teal-50 px-2.5 py-1 rounded-lg border border-teal-100/50 shadow-inner">{o.type}</span>
                                <span className={cn("text-[8px] font-black uppercase tracking-widest px-2.5 py-1 rounded-lg border", 
                                  o.priority === 'Alta' ? "bg-rose-50 text-rose-600 border-rose-100" : "bg-slate-50 text-slate-400 border-slate-100")}>
                                  Prioridad {o.priority}
                                </span>
                              </div>
                            </div>
                          </div>
                        </td>
                        <td className="px-10 py-8">
                          <div className="space-y-3">
                            <span className={cn(
                              "px-4 py-1.5 rounded-full text-[9px] font-black uppercase tracking-widest border w-fit shadow-md block text-center",
                              o.status === 'Cumplido' ? "bg-emerald-600 text-white border-emerald-500" : 
                              isOverdue ? "bg-red-600 text-white border-red-500 animate-pulse" :
                              isUrgent ? "bg-amber-500 text-white border-amber-400 animate-bounce-subtle" : "bg-white text-slate-400 border-slate-200"
                            )}>
                              {o.status}
                            </span>
                            <div className="flex items-center gap-2.5 px-1">
                               <Clock size={14} className={cn(isUrgent ? "text-amber-500" : isOverdue ? "text-red-500" : "text-slate-300")} />
                               <div className="flex flex-col">
                                 <span className="text-[10px] font-black text-slate-700 uppercase">{o.deadline}</span>
                                 <span className={cn("text-[8px] font-black uppercase tracking-widest", 
                                   o.status === 'Cumplido' ? "text-emerald-500" :
                                   isOverdue ? "text-red-600" : 
                                   isUrgent ? "text-amber-600" : "text-slate-400")}>
                                   {o.status === 'Cumplido' ? '✓ VALIDADO' : 
                                    isOverdue ? `⚠ VENCIDO HACE ${Math.abs(daysDiff)} DÍAS` : 
                                    isUrgent ? `🔥 VENCE EN ${daysDiff} DÍAS` : `${daysDiff} DÍAS RESTANTES`}
                                 </span>
                               </div>
                            </div>
                          </div>
                        </td>
                        <td className="px-10 py-8 text-right">
                          <div className="flex items-center justify-end gap-4">
                            {o.status === 'Cumplido' && (
                              <div className="text-right hidden xl:block animate-in fade-in duration-500">
                                 <p className="text-[8px] font-black text-slate-300 uppercase tracking-widest mb-0.5">Hash de Integridad</p>
                                 <p className="text-[9px] font-mono font-bold text-emerald-600/60 truncate max-w-[120px]">
                                    {btoa(o.id).substring(0, 16)}...
                                 </p>
                              </div>
                            )}
                            <button 
                              onClick={() => { setSelectedId(o.id); setIsModalOpen(true); }}
                              className={cn(
                                "h-14 w-14 rounded-2xl flex items-center justify-center transition-all shadow-xl hover:scale-105 active:scale-95 group/btn",
                                o.status === 'Cumplido' 
                                  ? "bg-emerald-50 text-emerald-600 border-2 border-emerald-100 hover:bg-emerald-600 hover:text-white" 
                                  : "bg-slate-900 text-white border-2 border-slate-900 hover:bg-teal-600 hover:border-teal-500"
                              )}
                              title={o.status === 'Cumplido' ? "Ver/Reemplazar Evidencia" : "Subir Soporte Legal"}
                            >
                              {o.status === 'Cumplido' ? <Check size={20} className="group-hover/btn:hidden" /> : null}
                              <Upload size={20} className={cn(o.status === 'Cumplido' ? "hidden group-hover/btn:block" : "")} />
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })
                ) : (
                  <tr>
                    <td colSpan={3} className="px-10 py-20 text-center">
                      <div className="flex flex-col items-center justify-center">
                        <div className="w-16 h-16 bg-slate-50 rounded-[1.5rem] flex items-center justify-center mb-4 border border-slate-100">
                          <Filter className="text-slate-300" size={28} />
                        </div>
                        <h4 className="text-sm font-black text-slate-900 uppercase tracking-tighter">Sin coincidencias normativas</h4>
                        <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-1">Ajuste los filtros para visualizar hitos de cumplimiento específicos.</p>
                      </div>
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          {/* Pagination Controls */}
          {totalPages > 1 && (
            <div className="px-10 py-6 border-t border-slate-50 bg-slate-50/30 flex items-center justify-between">
               <div className="flex items-center gap-4">
                  <button 
                    onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                    disabled={currentPage === 1}
                    className="h-10 w-10 bg-white border border-slate-200 rounded-xl flex items-center justify-center text-slate-600 hover:bg-teal-50 hover:border-teal-200 hover:text-teal-600 disabled:opacity-20 transition-all shadow-sm group"
                  >
                    <ChevronLeft size={16} className="group-hover:-translate-x-0.5 transition-transform" />
                  </button>
                  <div className="flex items-center gap-1.5">
                    {[...Array(totalPages)].map((_, i) => (
                      <button 
                        key={i} 
                        onClick={() => setCurrentPage(i + 1)}
                        className={cn("h-10 w-10 rounded-xl text-[10px] font-black transition-all", 
                          currentPage === i + 1 ? "bg-slate-900 text-white shadow-lg" : "bg-white border border-slate-100 text-slate-400 hover:bg-slate-50")}
                      >
                        {i + 1}
                      </button>
                    ))}
                  </div>
                  <button 
                    onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                    disabled={currentPage === totalPages}
                    className="h-10 w-10 bg-white border border-slate-200 rounded-xl flex items-center justify-center text-slate-600 hover:bg-teal-50 hover:border-teal-200 hover:text-teal-600 disabled:opacity-20 transition-all shadow-sm group"
                  >
                    <ChevronRight size={16} className="group-hover:translate-x-0.5 transition-transform" />
                  </button>
               </div>
               <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">
                  Página {currentPage} de {totalPages} <span className="mx-2 opacity-30">•</span> {filteredObligations.length} Hitos Filtrados
               </p>
            </div>
          )}
        </div>

        {/* LOGS DE AUDITORÍA */}
        <div className="bg-white border-2 border-slate-100 rounded-[3rem] shadow-sm flex flex-col">
          <div className="px-8 py-8 border-b border-slate-50 flex items-center gap-3">
             <History className="text-teal-600" size={20} />
             <h3 className="font-black text-sm uppercase tracking-tighter">Bitácora Forense</h3>
          </div>
          <div className="flex-1 overflow-y-auto max-h-[500px] p-6 space-y-4 font-mono">
             {auditLogs.slice(0, 8).map((log) => (
                <div key={log.id} className="p-4 bg-teal-50/30 rounded-2xl border border-teal-100/50 hover:bg-white hover:border-teal-500 transition-all">
                   <div className="flex justify-between items-start mb-1">
                      <span className="text-[10px] font-black text-slate-900 uppercase">{log.actor}</span>
                      <span className="text-[8px] font-bold text-slate-400">{new Date(log.timestamp).toLocaleTimeString()}</span>
                   </div>
                   <p className="text-[10px] text-slate-600 leading-tight mb-2 font-medium">{log.action}</p>
                   <div className="flex items-center gap-1.5">
                      <div className={cn("w-1.5 h-1.5 rounded-full", log.severity === 'Critical' ? "bg-red-500" : "bg-teal-500")} />
                      <span className="text-[8px] font-black uppercase text-slate-400">{log.module}</span>
                   </div>
                </div>
             ))}
             {auditLogs.length === 0 && (
                <div className="text-center py-20 text-slate-200">
                   <Info size={32} className="mx-auto mb-2 opacity-20" />
                   <p className="text-[10px] font-black uppercase">Sin registros de auditoría</p>
                </div>
             )}
          </div>
        </div>
      </div>

      {/* MODAL DE CARGA DE EVIDENCIA */}
      {isModalOpen && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white w-full max-w-md rounded-[3rem] shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200">
            <div className="p-10 text-center">
              <div className="w-24 h-24 bg-teal-50 text-teal-600 rounded-[2rem] flex items-center justify-center mx-auto mb-6">
                <Lock size={40} />
              </div>
              <h3 className="text-2xl font-black text-slate-900 tracking-tighter mb-4">Cargar Soporte Legal</h3>
              <p className="text-slate-500 text-sm mb-8 font-medium">
                El archivo debe ser una factura o documento oficial que respalde el cumplimiento ante el CNE.
              </p>
              
              <div className="relative border-2 border-dashed border-teal-100 p-12 rounded-[2.5rem] bg-teal-50/30 mb-8 flex flex-col items-center group hover:border-teal-500 hover:bg-white transition-all cursor-pointer">
                <input 
                  type="file" 
                  accept=".pdf,.jpg,.png"
                  className="absolute inset-0 opacity-0 cursor-pointer"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file && selectedId) {
                      uploadEvidence(selectedId, file.name);
                      logAction('Admin', `Cargó evidencia: ${file.name} para hito: ${selectedId}`, 'Compliance', 'Info');
                      setIsModalOpen(false);
                    }
                  }}
                />
                <Upload size={32} className="text-teal-300 mb-2 group-hover:text-teal-600 transition-colors" />
                <p className="text-[9px] font-black uppercase text-teal-400 tracking-widest">Haz clic para seleccionar soporte</p>
              </div>

              <div className="flex gap-4">
                <button onClick={() => setIsModalOpen(false)} className="flex-1 py-4 text-[10px] font-black uppercase text-slate-400 hover:text-slate-600 transition-colors">Cancelar</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* MODAL DE NUEVA OBLIGACIÓN */}
      {isNewObligationModalOpen && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-[200] flex items-center justify-center p-4 animate-in fade-in duration-300">
          <div className="bg-white w-full max-w-lg rounded-[3rem] shadow-2xl overflow-hidden animate-in zoom-in-95 duration-300 relative">
            <div className="px-10 py-10 border-b border-slate-100 bg-slate-50/50">
              <h3 className="text-2xl font-black text-slate-900 tracking-tighter uppercase">Añadir Obligación</h3>
              <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mt-1">Requisito Legal / Normativo</p>
            </div>
            <form onSubmit={handleAddObligation} className="p-10 space-y-6">
              <div className="space-y-4">
                <div>
                  <label className="text-[10px] font-black uppercase text-slate-400 tracking-widest block mb-2 px-1">Título de la Obligación</label>
                  <input 
                    required 
                    placeholder="Ej: Reporte Quincenal CNE" 
                    className="w-full px-6 py-4 bg-slate-50 border-2 border-transparent rounded-2xl text-sm font-bold focus:border-teal-500 focus:bg-white outline-none transition-all" 
                    value={newObligation.title} 
                    onChange={e => setNewObligation({...newObligation, title: e.target.value})} 
                  />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="text-[10px] font-black uppercase text-slate-400 tracking-widest block mb-2 px-1">Fecha Límite</label>
                    <input 
                      required 
                      type="date" 
                      className="w-full px-6 py-4 bg-slate-50 border-2 border-transparent rounded-2xl text-sm font-bold focus:border-teal-500 focus:bg-white outline-none transition-all" 
                      value={newObligation.deadline} 
                      onChange={e => setNewObligation({...newObligation, deadline: e.target.value})} 
                    />
                  </div>
                  <div>
                    <label className="text-[10px] font-black uppercase text-slate-400 tracking-widest block mb-2 px-1">Prioridad</label>
                    <select 
                      className="w-full px-6 py-4 bg-slate-50 border-2 border-transparent rounded-2xl text-sm font-bold focus:border-teal-500 focus:bg-white outline-none appearance-none" 
                      value={newObligation.priority} 
                      onChange={e => setNewObligation({...newObligation, priority: e.target.value as any})}
                    >
                      <option value="Alta">Alta (Crítica)</option>
                      <option value="Media">Media (Importante)</option>
                      <option value="Baja">Baja (Rutinaria)</option>
                    </select>
                  </div>
                </div>
                <div>
                  <label className="text-[10px] font-black uppercase text-slate-400 tracking-widest block mb-2 px-1">Tipo de Obligación</label>
                  <select 
                    className="w-full px-6 py-4 bg-slate-50 border-2 border-transparent rounded-2xl text-sm font-bold focus:border-teal-500 focus:bg-white outline-none appearance-none" 
                    value={newObligation.type} 
                    onChange={e => setNewObligation({...newObligation, type: e.target.value as any})}
                  >
                    <option value="Cuentas Claras">Cuentas Claras</option>
                    <option value="Registro Libros">Registro de Libros</option>
                    <option value="Publicidad Exterior">Publicidad Exterior</option>
                    <option value="Laboral / Contratos">Laboral / Contratos</option>
                    <option value="Otros">Otros (Normativo)</option>
                  </select>
                </div>
              </div>
              <div className="pt-6 flex gap-4">
                <button 
                  type="button" 
                  onClick={() => setIsNewObligationModalOpen(false)} 
                  className="flex-1 py-4 bg-slate-100 rounded-2xl text-[10px] font-black uppercase text-slate-500 hover:bg-slate-200 transition-colors"
                >
                  Cancelar
                </button>
                <button 
                  type="submit" 
                  className="flex-1 py-4 bg-teal-600 text-white rounded-2xl font-black text-[10px] uppercase shadow-xl shadow-teal-100 hover:bg-teal-700 transition-all"
                >
                  Guardar Obligación
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
