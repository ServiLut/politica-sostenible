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
  Calendar,
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
  Clock,
  X
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
  const [expandedObligationId, setExpandedObligationId] = useState<string | null>(null);
  const [newObligation, setNewObligation] = useState({ title: '', deadline: '', priority: 'Media' as const, type: 'Cuentas Claras' as const });

  // Modal Dropdown States
  const [isModalPriorityOpen, setIsModalPriorityOpen] = useState(false);
  const [isModalTypeOpen, setIsModalTypeOpen] = useState(false);
  const [isModalCalendarOpen, setIsModalCalendarOpen] = useState(false);
  const [viewDate, setViewDate] = useState(new Date());

  const daysInMonth = (year: number, month: number) => new Date(year, month + 1, 0).getDate();
  const firstDayOfMonth = (year: number, month: number) => new Date(year, month, 1).getDay();
  const monthNames = ["Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio", "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"];

  const renderCalendarUI = (currentDate: string, onSelect: (date: string) => void) => {
    const year = viewDate.getFullYear();
    const month = viewDate.getMonth();
    const days = [];
    const totalDays = daysInMonth(year, month);
    const startDay = firstDayOfMonth(year, month);

    for (let i = 0; i < startDay; i++) {
      days.push(<div key={`empty-${i}`} className="h-8 w-8" />);
    }

    for (let i = 1; i <= totalDays; i++) {
      const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(i).padStart(2, '0')}`;
      const isSelected = currentDate === dateStr;
      
      days.push(
        <button
          key={i}
          type="button"
          onClick={() => {
            onSelect(dateStr);
            setIsModalCalendarOpen(false);
          }}
          className={cn(
            "h-8 w-8 rounded-full text-[10px] font-black transition-all flex items-center justify-center",
            isSelected ? "bg-teal-600 text-white shadow-lg shadow-teal-200" : "hover:bg-teal-50 text-slate-600"
          )}
        >
          {i}
        </button>
      );
    }
    return days;
  };

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
      { name: 'EJECUCIÓN REAL', monto: actualExpenses, fill: '#0d9488' },
      { name: 'PROYECCIÓN FINAL', monto: actualExpenses + projectedEventsCost, fill: '#14b8a6' },
      { name: 'LÍMITE LEGAL CNE', monto: TOPE_LEGAL_CNE, fill: '#0f172a' }
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

  const COLORS = ['#0f172a', '#0d9488', '#10b981', '#f59e0b', '#ef4444', '#64748b'];

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
    <div className="space-y-6 md:space-y-8 pb-20 animate-in fade-in duration-500">
      <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center gap-6">
        <div>
          <h1 className="text-3xl md:text-4xl font-black text-slate-900 tracking-tighter uppercase">Módulo de Compliance</h1>
          <p className="text-sm md:text-base text-slate-500 font-medium">Control legal, topes de campaña y reportes CNE.</p>
        </div>
        <button 
          onClick={handleGenerateReport}
          className="w-full lg:w-auto bg-teal-600 text-white px-8 py-4 rounded-2xl font-black text-[10px] md:text-xs tracking-widest uppercase shadow-xl shadow-teal-100 hover:bg-teal-700 transition-all flex items-center justify-center gap-2"
        >
          <Download size={18} /> Descargar Reporte Consolidado
        </button>
      </div>

      {/* MONITOR DE BLINDAJE LEGAL (REDESIGN) */}
      <div className={cn(
        "p-6 md:p-10 rounded-[2.5rem] md:rounded-[4rem] border-4 flex flex-col lg:flex-row items-center gap-8 md:gap-10 transition-all duration-700 shadow-2xl relative overflow-hidden",
        alertStatus.bg, alertStatus.border, alertStatus.color
      )}>
        {/* Decorative background element */}
        <div className="absolute top-0 right-0 w-64 h-64 opacity-5 rotate-12 -translate-y-20 translate-x-20 hidden md:block">
          <ShieldCheck size={256} />
        </div>

        <div className="w-20 h-20 md:w-28 md:h-28 rounded-2xl md:rounded-[2.5rem] bg-white flex items-center justify-center shadow-xl border-4 border-white/50 animate-in zoom-in duration-500 shrink-0">
          <div className="scale-75 md:scale-100">{alertStatus.icon}</div>
        </div>
        
        <div className="flex-1 text-center lg:text-left">
          <div className="flex items-center justify-center lg:justify-start gap-3 mb-2">
            <span className={cn("px-3 md:px-4 py-1 rounded-full text-[8px] md:text-[10px] font-black uppercase tracking-[0.3em] border", alertStatus.border, "bg-white")}>
              {alertStatus.status}
            </span>
            <span className="text-[8px] md:text-[10px] font-black uppercase tracking-[0.2em] opacity-40">Sistema SIT</span>
          </div>
          <h3 className="text-xl md:text-3xl font-black tracking-tighter leading-tight mb-3">{alertStatus.msg}</h3>
          <p className="text-xs md:text-sm font-bold opacity-70 max-w-xl leading-relaxed">
            {alertStatus.description}
          </p>
        </div>

        <div className="grid grid-cols-2 gap-6 md:gap-8 px-0 lg:px-10 border-t lg:border-t-0 lg:border-l border-white/30 pt-6 lg:pt-0 w-full lg:w-auto">
          <div className="text-center">
             <p className="text-[8px] md:text-[9px] font-black uppercase tracking-widest opacity-60 mb-1">Tope Ejecutado</p>
             <h3 className="text-3xl md:text-5xl font-black tabular-nums">{realExecPercent.toFixed(1)}%</h3>
             <p className="text-[7px] md:text-[8px] font-bold opacity-50 mt-1">Disp/Día: {formatCOP(dailyRunway)}</p>
          </div>
          <div className="text-center">
             <p className="text-[8px] md:text-[9px] font-black uppercase tracking-widest opacity-60 mb-1">Puntaje Hitos</p>
             <h3 className="text-3xl md:text-5xl font-black tabular-nums">{Math.round(weightedScore)}%</h3>
             <p className="text-[7px] md:text-[8px] font-bold opacity-50 mt-1">{daysUntilElection} d para D-Día</p>
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
                <BarChart data={barData} margin={{ top: 20, right: 30, left: 20, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="8 8" vertical={false} stroke="#e2e8f0" />
                  <XAxis 
                    dataKey="name" 
                    axisLine={false} 
                    tickLine={false} 
                    tick={{ fontSize: 9, fontWeight: 900, fill: '#334155' }} 
                    dy={10}
                  />
                  <YAxis hide domain={[0, TOPE_LEGAL_CNE * 1.1]} />
                  <Tooltip 
                    cursor={{ fill: '#f8fafc' }}
                    content={({ active, payload }) => {
                      if (active && payload && payload.length) {
                        return (
                          <div className="bg-slate-900 px-4 py-3 rounded-2xl shadow-2xl border border-slate-800 animate-in fade-in zoom-in-95 duration-200">
                            <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">{payload[0].payload.name}</p>
                            <p className="text-sm font-black text-white">{formatCOP(payload[0].value as number)}</p>
                          </div>
                        );
                      }
                      return null;
                    }}
                  />
                  <Bar dataKey="monto" radius={[12, 12, 0, 0]} barSize={60}>
                    {barData.map((entry: any, index: number) => (
                      <Cell 
                        key={`cell-${index}`} 
                        fill={realExecPercent > 95 && entry.name !== 'LÍMITE LEGAL CNE' ? '#ef4444' : entry.fill}
                        className="transition-all duration-500 hover:opacity-80"
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
        <div className="lg:col-span-2 bg-white border-2 border-slate-100 rounded-[2rem] md:rounded-[3rem] overflow-hidden shadow-sm flex flex-col">
          <div className="px-6 md:px-10 py-6 md:py-8 border-b border-slate-50 bg-slate-50/50 flex flex-col xl:flex-row justify-between items-start xl:items-center gap-6">
            <div>
              <h3 className="font-black text-slate-900 flex items-center gap-2 uppercase text-xs md:text-sm tracking-tighter">
                <Scale size={20} className="text-teal-600" /> Matriz de Obligaciones Normativas
              </h3>
              <p className="text-[9px] md:text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-1">Control de Blindaje Electoral CNE</p>
            </div>
            
            <div className="flex flex-col sm:flex-row flex-wrap items-stretch sm:items-center gap-3 w-full xl:w-auto">
              {/* Search obligations */}
              <div className="relative group">
                <Search size={14} className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 group-focus-within:text-teal-600 transition-colors" />
                <input 
                  type="text" 
                  placeholder="Buscar hito legal..." 
                  className="w-full pl-10 pr-4 py-3 bg-white border border-slate-200 rounded-xl text-[9px] md:text-[10px] font-black uppercase tracking-widest focus:border-teal-500 focus:ring-4 focus:ring-teal-500/5 outline-none transition-all"
                  value={obligationSearch}
                  onChange={(e) => setObligationSearch(e.target.value)}
                />
              </div>

              <div className="flex gap-3">
                {/* Status filter */}
                <div className="relative flex-1 sm:flex-none">
                  <button 
                    onClick={() => { setIsStatusDropdownOpen(!isStatusDropdownOpen); setIsTypeDropdownOpen(false); }}
                    className="w-full px-4 py-3 bg-white border border-slate-200 rounded-xl flex items-center justify-between sm:justify-start gap-3 hover:bg-slate-50 transition-all group"
                  >
                    <div className="flex items-center gap-2">
                      <Filter size={14} className="text-teal-600" />
                      <span className="text-[9px] font-black uppercase tracking-widest text-slate-600 truncate max-w-[60px]">{filterStatus === 'all' ? 'Estado' : filterStatus}</span>
                    </div>
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
                <div className="relative flex-1 sm:flex-none">
                  <button 
                    onClick={() => { setIsTypeDropdownOpen(!isTypeDropdownOpen); setIsStatusDropdownOpen(false); }}
                    className="w-full px-4 py-3 bg-white border border-slate-200 rounded-xl flex items-center justify-between sm:justify-start gap-3 hover:bg-slate-50 transition-all group"
                  >
                    <div className="flex items-center gap-2">
                      <Scale size={14} className="text-teal-600" />
                      <span className="text-[9px] font-black uppercase tracking-widest text-slate-600 truncate max-w-[80px]">{filterType === 'all' ? 'Categoría' : filterType}</span>
                    </div>
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
              </div>

              <div className="flex items-center justify-between sm:justify-end gap-3 w-full sm:w-auto pt-2 sm:pt-0">
                <span className="bg-teal-50 text-teal-600 px-4 py-2 rounded-full text-[9px] md:text-[10px] font-black uppercase tracking-widest border border-teal-100 shadow-inner">
                  Score: {Math.round(score)}%
                </span>
                <button 
                  onClick={() => setIsNewObligationModalOpen(true)}
                  className="flex-1 sm:flex-none bg-slate-900 text-white px-5 py-3 rounded-xl text-[9px] md:text-[10px] font-black uppercase tracking-widest hover:bg-teal-600 transition-all shadow-xl shadow-slate-200 flex items-center justify-center gap-2 group"
                >
                  <Plus size={16} className="group-hover:rotate-90 transition-transform" /> <span>Hito</span>
                </button>
              </div>
            </div>
          </div>

          {/* Mobile View: Cards */}
          <div className="md:hidden divide-y divide-slate-100">
            {paginatedObligations.length > 0 ? (
              paginatedObligations.map((o) => {
                const daysDiff = Math.ceil((new Date(o.deadline).getTime() - new Date().getTime()) / (1000 * 3600 * 24));
                const isUrgent = daysDiff >= 0 && daysDiff <= 3 && o.status !== 'Cumplido';
                const isOverdue = daysDiff < 0 && o.status !== 'Cumplido';

                return (
                  <div key={o.id} className={cn(
                    "p-6 space-y-4",
                    isOverdue ? "bg-red-50/20" : isUrgent ? "bg-amber-50/20" : "bg-white"
                  )}>
                    <div className="flex justify-between items-start gap-4">
                      <div className="space-y-2 flex-1 min-w-0">
                        <p className="text-sm font-black text-slate-900 uppercase leading-tight truncate">{o.title}</p>
                        <div className="flex flex-wrap gap-2">
                          <span className="text-[7px] font-black text-teal-600 uppercase tracking-widest bg-teal-50 px-1.5 py-0.5 rounded border border-teal-100/50">{o.type}</span>
                          <span className={cn(
                            "text-[7px] font-black uppercase tracking-widest px-1.5 py-0.5 rounded border",
                            o.priority === 'Alta' ? "bg-rose-50 text-rose-600 border-rose-100" : "bg-slate-50 text-slate-400 border-slate-100"
                          )}>
                            {o.priority}
                          </span>
                        </div>
                      </div>
                      <button 
                        onClick={() => setExpandedObligationId(expandedObligationId === o.id ? null : o.id)}
                        className="p-2 bg-slate-50 rounded-xl text-slate-400 border border-slate-100"
                      >
                        <ChevronDown size={16} className={cn("transition-transform duration-200", expandedObligationId === o.id && "rotate-180")} />
                      </button>
                    </div>

                    <div className="flex items-center justify-between">
                      <span className={cn(
                        "px-3 py-1 rounded-full text-[8px] font-black uppercase tracking-widest border shadow-sm",
                        o.status === 'Cumplido' ? "bg-emerald-600 text-white border-emerald-500" : 
                        isOverdue ? "bg-red-600 text-white border-red-500" :
                        isUrgent ? "bg-amber-500 text-white border-amber-400" : "bg-white text-slate-400 border-slate-200"
                      )}>
                        {o.status}
                      </span>
                      <div className="flex items-center gap-1.5">
                        <Clock size={12} className={cn(isUrgent ? "text-amber-500" : isOverdue ? "text-red-500" : "text-slate-300")} />
                        <span className="text-[9px] font-black text-slate-700 uppercase">{o.deadline}</span>
                      </div>
                    </div>

                    {expandedObligationId === o.id && (
                      <div className="pt-2 space-y-4 animate-in fade-in slide-in-from-top-1 duration-200">
                        <div className="bg-slate-50 p-4 rounded-2xl border border-slate-100">
                          <p className="text-[8px] font-black text-slate-400 uppercase tracking-widest mb-1 text-center">Status de Tiempo</p>
                          <p className={cn("text-[9px] font-black uppercase text-center", 
                            o.status === 'Cumplido' ? "text-emerald-500" :
                            isOverdue ? "text-red-600" : 
                            isUrgent ? "text-amber-600" : "text-slate-400")}>
                            {o.status === 'Cumplido' ? '✓ DOCUMENTACIÓN VALIDADA' : 
                             isOverdue ? `⚠ VENCIDO HACE ${Math.abs(daysDiff)} DÍAS` : 
                             isUrgent ? `🔥 VENCE EN ${daysDiff} DÍAS` : `${daysDiff} DÍAS RESTANTES`}
                          </p>
                        </div>
                        <button 
                          onClick={() => { setSelectedId(o.id); setIsModalOpen(true); }}
                          className="w-full py-3.5 bg-slate-900 text-white rounded-2xl font-black text-[9px] uppercase tracking-widest flex items-center justify-center gap-2 shadow-lg"
                        >
                          <Upload size={14} /> {o.status === 'Cumplido' ? 'Reemplazar Soportes' : 'Subir Soporte Legal'}
                        </button>
                      </div>
                    )}
                  </div>
                );
              })
            ) : (
              <div className="py-20 text-center opacity-20">
                <Scale size={40} className="mx-auto mb-3" />
                <p className="text-[10px] font-black uppercase tracking-widest">Sin hitos</p>
              </div>
            )}
          </div>

          {/* Desktop Table View */}
          <div className="overflow-x-auto flex-1 min-h-[400px] hidden md:block">
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
            <div className="px-6 md:px-10 py-6 border-t border-slate-50 bg-slate-50/30 flex flex-col sm:flex-row items-center justify-between gap-4">
               <div className="flex items-center gap-2 md:gap-4 overflow-x-auto w-full sm:w-auto no-scrollbar justify-center">
                  <button 
                    onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                    disabled={currentPage === 1}
                    className="h-9 w-9 md:h-10 md:w-10 bg-white border border-slate-200 rounded-xl flex items-center justify-center text-slate-600 hover:bg-teal-50 hover:border-teal-200 hover:text-teal-600 disabled:opacity-20 transition-all shadow-sm shrink-0"
                  >
                    <ChevronLeft size={16} />
                  </button>
                  <div className="flex items-center gap-1.5">
                    {[...Array(totalPages)].map((_, i) => (
                      <button 
                        key={i} 
                        onClick={() => setCurrentPage(i + 1)}
                        className={cn("h-9 w-9 md:h-10 md:w-10 rounded-xl text-[9px] md:text-[10px] font-black transition-all shrink-0", 
                          currentPage === i + 1 ? "bg-slate-900 text-white shadow-lg" : "bg-white border border-slate-100 text-slate-400 hover:bg-slate-50")}
                      >
                        {i + 1}
                      </button>
                    ))}
                  </div>
                  <button 
                    onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                    disabled={currentPage === totalPages}
                    className="h-9 w-9 md:h-10 md:w-10 bg-white border border-slate-200 rounded-xl flex items-center justify-center text-slate-600 hover:bg-teal-50 hover:border-teal-200 hover:text-teal-600 disabled:opacity-20 transition-all shadow-sm shrink-0"
                  >
                    <ChevronRight size={16} />
                  </button>
               </div>
               <p className="text-[9px] md:text-[10px] font-black text-slate-400 uppercase tracking-widest text-center sm:text-right">
                  Pág {currentPage} de {totalPages} <span className="mx-1 opacity-30">•</span> {filteredObligations.length} Hitos
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
             {auditLogs.slice(0, 12).map((log) => (
                <div key={log.id} className="p-4 bg-teal-50/30 rounded-2xl border border-teal-100/50 hover:bg-white hover:border-teal-500 transition-all group/log">
                   <div className="flex justify-between items-start mb-2 gap-4">
                      <span className="text-[10px] font-black text-slate-900 uppercase truncate flex-1">{log.actor}</span>
                      <span className="text-[8px] font-bold text-slate-400 whitespace-nowrap">{new Date(log.timestamp).toLocaleTimeString()}</span>
                   </div>
                   <p className="text-[10px] text-slate-600 leading-relaxed mb-3 font-medium break-words whitespace-normal">
                      {log.action}
                   </p>
                   <div className="flex items-center gap-1.5">
                      <div className={cn("w-1.5 h-1.5 rounded-full", log.severity === 'Critical' ? "bg-red-500 animate-pulse" : "bg-teal-500")} />
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
        <div 
          className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-[200] flex items-center justify-center p-4 animate-in fade-in duration-300"
          onClick={() => setIsNewObligationModalOpen(false)}
        >
          <div 
            className="bg-white w-full max-w-lg rounded-[3rem] shadow-2xl overflow-visible animate-in zoom-in-95 duration-300 relative"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              onClick={() => setIsNewObligationModalOpen(false)}
              className="absolute top-8 right-8 z-10 p-2.5 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-2xl transition-all group"
            >
              <X size={20} className="group-hover:rotate-90 transition-transform" />
            </button>

            <div className="px-10 py-10 border-b border-slate-100 bg-slate-50/50 rounded-t-[3rem]">
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
                    className="w-full px-6 py-4 bg-teal-50/30 border-2 border-slate-200 rounded-[1.5rem] text-sm font-bold focus:border-teal-500 focus:bg-white outline-none transition-all" 
                    value={newObligation.title} 
                    onChange={e => setNewObligation({...newObligation, title: e.target.value})} 
                  />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="text-[10px] font-black uppercase text-slate-400 tracking-widest block mb-2 px-1">Fecha Límite</label>
                    <div className="relative">
                      <button
                        type="button"
                        onClick={() => {
                          setIsModalCalendarOpen(!isModalCalendarOpen);
                          setIsModalPriorityOpen(false);
                          setIsModalTypeOpen(false);
                        }}
                        className="w-full flex items-center gap-4 px-5 py-4 border-2 border-slate-200 bg-teal-50/30 rounded-[1.5rem] text-sm font-bold text-slate-700 hover:border-teal-500 transition-all outline-none"
                      >
                        <Calendar size={18} className="text-teal-600" />
                        <span className="truncate">{newObligation.deadline || "Seleccionar..."}</span>
                      </button>
                      
                      {isModalCalendarOpen && (
                        <div className="absolute top-full left-0 mt-2 p-4 bg-white border-2 border-slate-100 rounded-[2rem] shadow-2xl z-[220] animate-in fade-in zoom-in-95 duration-200 min-w-[280px]">
                          <div className="flex items-center justify-between mb-4">
                            <button 
                              type="button" 
                              onClick={(e) => { e.stopPropagation(); setViewDate(new Date(viewDate.getFullYear(), viewDate.getMonth() - 1)); }}
                              className="p-1.5 hover:bg-slate-50 rounded-lg text-slate-400 hover:text-teal-600 transition-all"
                            >
                              <ChevronLeft size={14} />
                            </button>
                            <span className="text-[10px] font-black uppercase tracking-widest text-slate-900">
                              {monthNames[viewDate.getMonth()]} {viewDate.getFullYear()}
                            </span>
                            <button 
                              type="button" 
                              onClick={(e) => { e.stopPropagation(); setViewDate(new Date(viewDate.getFullYear(), viewDate.getMonth() + 1)); }}
                              className="p-1.5 hover:bg-slate-50 rounded-lg text-slate-400 hover:text-teal-600 transition-all"
                            >
                              <ChevronRight size={14} />
                            </button>
                          </div>
                          <div className="grid grid-cols-7 gap-1 mb-1">
                            {['D', 'L', 'M', 'M', 'J', 'V', 'S'].map((d, i) => (
                              <div key={`${d}-${i}`} className="h-7 w-7 flex items-center justify-center text-[8px] font-black text-slate-300 uppercase">{d}</div>
                            ))}
                          </div>
                          <div className="grid grid-cols-7 gap-1">
                            {renderCalendarUI(newObligation.deadline, (d) => setNewObligation({...newObligation, deadline: d}))}
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                  <div>
                    <label className="text-[10px] font-black uppercase text-slate-400 tracking-widest block mb-2 px-1">Prioridad</label>
                    <div className="relative">
                      <button
                        type="button"
                        onClick={() => {
                          setIsModalPriorityOpen(!isModalPriorityOpen);
                          setIsModalTypeOpen(false);
                        }}
                        className="w-full flex items-center justify-between px-6 py-4 bg-teal-50/30 border-2 border-slate-200 rounded-[1.5rem] text-sm font-bold text-slate-700 hover:border-teal-500 transition-all outline-none"
                      >
                        {newObligation.priority}
                        <ChevronDown className={cn("text-slate-400 transition-transform", isModalPriorityOpen && "rotate-180")} size={18} />
                      </button>

                      {isModalPriorityOpen && (
                        <div className="absolute top-full left-0 right-0 mt-2 bg-white border-2 border-slate-100 rounded-[1.5rem] shadow-2xl z-[210] overflow-hidden animate-in fade-in zoom-in-95 duration-200">
                          {['Alta', 'Media', 'Baja'].map(p => (
                            <div
                              key={p}
                              onClick={() => {
                                setNewObligation({...newObligation, priority: p as any});
                                setIsModalPriorityOpen(false);
                              }}
                              className={cn(
                                "px-6 py-3 hover:bg-teal-50 text-[11px] font-black uppercase cursor-pointer transition-colors border-b border-slate-50 last:border-none flex justify-between items-center",
                                newObligation.priority === p ? "text-teal-600 bg-teal-50/30" : "text-slate-600"
                              )}
                            >
                              {p}
                              {newObligation.priority === p && <Check size={14} className="text-teal-600" />}
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
                <div>
                  <label className="text-[10px] font-black uppercase text-slate-400 tracking-widest block mb-2 px-1">Tipo de Obligación</label>
                  <div className="relative">
                    <button
                      type="button"
                      onClick={() => {
                        setIsModalTypeOpen(!isModalTypeOpen);
                        setIsModalPriorityOpen(false);
                      }}
                      className="w-full flex items-center justify-between px-6 py-4 bg-teal-50/30 border-2 border-slate-200 rounded-[1.5rem] text-sm font-bold text-slate-700 hover:border-teal-500 transition-all outline-none"
                    >
                      {newObligation.type}
                      <ChevronDown className={cn("text-slate-400 transition-transform", isModalTypeOpen && "rotate-180")} size={18} />
                    </button>

                    {isModalTypeOpen && (
                      <div className="absolute top-full left-0 right-0 mt-2 bg-white border-2 border-slate-100 rounded-[1.5rem] shadow-2xl z-[210] overflow-hidden animate-in fade-in zoom-in-95 duration-200">
                        {OBLIGATION_TYPES.map(t => (
                          <div
                            key={t}
                            onClick={() => {
                              setNewObligation({...newObligation, type: t as any});
                              setIsModalTypeOpen(false);
                            }}
                            className={cn(
                              "px-6 py-3 hover:bg-teal-50 text-[11px] font-black uppercase cursor-pointer transition-colors border-b border-slate-50 last:border-none flex justify-between items-center",
                              newObligation.type === t ? "text-teal-600 bg-teal-50/30" : "text-slate-600"
                            )}
                          >
                            {t}
                            {newObligation.type === t && <Check size={14} className="text-teal-600" />}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
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
