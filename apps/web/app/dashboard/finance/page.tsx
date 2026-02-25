"use client";

import React, { useState, useMemo } from 'react';
import { useCRM, FinanceTransaction } from '@/context/CRMContext';
import { useToast } from '@/context/ToastContext';
import { 
  Wallet, 
  TrendingUp, 
  TrendingDown, 
  Receipt, 
  AlertCircle,
  ShieldCheck,
  X,
  ChevronDown,
  Check,
  Calendar,
  ChevronLeft,
  ChevronRight
} from 'lucide-react';
import { cn } from '@/components/ui/utils';

export default function FinancePage() {
  const { 
    finance, 
    addFinanceTransaction, 
    logAction, 
    getProjectedCompliance
  } = useCRM();
  const { success: toastSuccess } = useToast();
  
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isTypeDropdownOpen, setIsTypeDropdownOpen] = useState(false);
  const [isCneDropdownOpen, setIsCneDropdownOpen] = useState(false);
  const [isCalendarOpen, setIsCalendarOpen] = useState(false);
  const [expandedTransactionId, setExpandedTransactionId] = useState<string | null>(null);
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
            setIsCalendarOpen(false);
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

  const [formData, setFormData] = useState<Omit<FinanceTransaction, 'id'>>({
    concept: '',
    amount: 0,
    type: 'Gasto',
    category: 'Logística',
    date: new Date().toISOString().split('T')[0],
    status: 'PENDING',
    cneCode: 'OTROS',
    vendorTaxId: '',
    evidenceUrl: ''
  });
  
  const complianceData = useMemo(() => {
    const projected = getProjectedCompliance();
    
    return {
      totalIncome: finance.filter(f => f.type === 'Ingreso').reduce((a, b) => a + b.amount, 0),
      totalExpenses: finance.filter(f => f.type === 'Gasto').reduce((a, b) => a + b.amount, 0),
      balance: finance.filter(f => f.type === 'Ingreso').reduce((a, b) => a + b.amount, 0) - finance.filter(f => f.type === 'Gasto').reduce((a, b) => a + b.amount, 0),
      executionPercentage: projected.executionPercentage,
    };
  }, [finance, getProjectedCompliance]);

  const { totalIncome, totalExpenses, balance, executionPercentage } = complianceData;

  const alertStatus = useMemo(() => {
    if (executionPercentage > 90) return { color: 'text-rose-600', bg: 'bg-rose-50', border: 'border-rose-100', msg: '¡PELIGRO! Riesgo de sanción administrativa', icon: <AlertCircle className="animate-pulse" /> };
    if (executionPercentage >= 70) return { color: 'text-amber-600', bg: 'bg-amber-50', border: 'border-amber-100', msg: 'Atención: Cerca del límite legal', icon: <AlertCircle /> };
    return { color: 'text-teal-600', bg: 'bg-teal-50', border: 'border-teal-100', msg: 'Estado Seguro: Dentro de los límites', icon: <ShieldCheck /> };
  }, [executionPercentage]);

  const formatCOP = (val: number) => new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 }).format(val);

  const handleAddTransaction = (e: React.FormEvent) => {
    e.preventDefault();
    addFinanceTransaction(formData);
    logAction('Tesorero', `Agregó ${formData.type} legal: ${formData.concept}`, 'Finanzas');
    toastSuccess("Movimiento registrado");
    setIsModalOpen(false);
    setFormData({ concept: '', amount: 0, type: 'Gasto', category: 'Logística', date: new Date().toISOString().split('T')[0], status: 'PENDING', cneCode: 'OTROS', vendorTaxId: '', evidenceUrl: '' });
  };

  return (
    <div className="space-y-8 pb-20 animate-in fade-in duration-700">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-end gap-6 md:gap-4">
        <div>
          <h1 className="text-3xl md:text-4xl font-black text-slate-900 tracking-tighter uppercase">Gestión Financiera</h1>
          <p className="text-sm md:text-base text-slate-500 font-medium">Control de ingresos, gastos y cumplimiento Cuentas Claras.</p>
        </div>
        <button 
          onClick={() => setIsModalOpen(true)}
          className="w-full md:w-auto flex items-center justify-center gap-2 px-8 py-4 bg-teal-600 text-white rounded-2xl font-black uppercase tracking-widest text-[10px] md:text-xs hover:bg-teal-700 transition-all shadow-xl shadow-teal-100 hover:-translate-y-1 duration-300"
        >
          <Receipt size={18} />
          Nuevo Registro
        </button>
      </div>

      <div className={cn("p-6 md:p-8 rounded-[2rem] md:rounded-[2.5rem] border flex flex-col md:flex-row items-start md:items-center gap-6 md:gap-8 shadow-sm transition-all", alertStatus.bg, alertStatus.border, alertStatus.color)}>
        <div className="w-14 h-14 md:w-16 md:h-16 rounded-2xl bg-white flex items-center justify-center shadow-sm text-xl md:text-2xl shrink-0">{alertStatus.icon}</div>
        <div className="flex-1">
          <p className="text-[10px] font-black uppercase tracking-widest opacity-60">Monitor Legal CNE</p>
          <h3 className="text-lg md:text-xl font-black tracking-tight leading-tight">{alertStatus.msg}</h3>
        </div>
        <div className="w-full md:w-auto flex md:flex-col justify-between md:text-right border-t md:border-t-0 border-current/10 pt-4 md:pt-0">
          <p className="text-[10px] font-black uppercase tracking-widest opacity-60">Ejecución</p>
          <h3 className="text-3xl md:text-4xl font-black">{executionPercentage.toFixed(1)}%</h3>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 md:gap-8">
        <div className="bg-white p-8 md:p-10 rounded-[2rem] md:rounded-[2.5rem] border border-slate-100 shadow-sm relative overflow-hidden group">
          <div className="absolute -right-4 -bottom-4 opacity-5 group-hover:scale-110 transition-transform duration-700"><Wallet size={120} className="text-teal-600" /></div>
          <Wallet className="text-teal-600 mb-4" size={28} />
          <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Caja Disponible</p>
          <h3 className="text-2xl md:text-3xl font-black text-slate-900 tracking-tighter">{formatCOP(balance)}</h3>
        </div>
        <div className="bg-white p-8 md:p-10 rounded-[2rem] md:rounded-[2.5rem] border border-slate-100 shadow-sm">
          <TrendingUp className="text-emerald-500 mb-4" size={28} />
          <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Ingresos Registrados</p>
          <h3 className="text-2xl md:text-3xl font-black text-slate-900 tracking-tighter">{formatCOP(totalIncome)}</h3>
        </div>
        <div className="bg-white p-8 md:p-10 rounded-[2rem] md:rounded-[2.5rem] border border-slate-100 shadow-sm">
          <TrendingDown className="text-rose-500 mb-4" size={28} />
          <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Egresos Reportables</p>
          <h3 className="text-2xl md:text-3xl font-black text-slate-900 tracking-tighter">{formatCOP(totalExpenses)}</h3>
        </div>
      </div>

      <div className="bg-white border border-slate-200 rounded-[2rem] md:rounded-[3rem] overflow-hidden shadow-sm">
        <div className="px-6 md:px-10 py-6 md:py-8 border-b border-slate-100 bg-slate-50/50 flex justify-between items-center">
          <h3 className="font-black text-slate-900 flex items-center gap-2 uppercase text-xs md:text-sm tracking-tighter">
            <Receipt size={20} className="text-teal-600" /> Libro de Movimientos Legales
          </h3>
          <span className="text-[9px] md:text-[10px] font-black text-slate-400 uppercase tracking-widest">{finance.length} Registros</span>
        </div>
        
        {finance.length === 0 ? (
          <div className="p-12 md:p-16 flex flex-col items-center justify-center text-center">
            <div className="w-16 h-16 md:w-20 md:h-20 bg-slate-50 rounded-full flex items-center justify-center mb-6 border-4 border-white shadow-sm">
              <Receipt size={28} className="text-slate-300" />
            </div>
            <h3 className="text-lg md:text-xl font-black text-slate-900 mb-2">No hay movimientos registrados</h3>
            <p className="text-xs md:text-sm text-slate-500 font-medium max-w-sm mb-6">
              Comienza a registrar los ingresos y gastos de la campaña para mantener el control legal y presupuestal.
            </p>
            <button 
              onClick={() => setIsModalOpen(true)}
              className="px-6 py-3 bg-teal-50 text-teal-700 font-black uppercase text-[10px] tracking-widest rounded-xl hover:bg-teal-600 hover:text-white transition-colors"
            >
              Crear primer registro
            </button>
          </div>
        ) : (
          <>
            {/* Mobile Card View */}
            <div className="md:hidden divide-y divide-slate-100">
              {finance.map((t) => (
                <div key={t.id} className="p-6 space-y-4">
                  <div className="flex justify-between items-start gap-4">
                    <div className="space-y-1 min-w-0">
                      <p className="text-sm font-black text-slate-900 uppercase truncate">{t.concept}</p>
                      <div className="flex gap-2">
                        <span className={cn(
                          "text-[7px] font-black px-1.5 py-0.5 rounded border uppercase", 
                          t.type === 'Ingreso' ? 'bg-emerald-50 text-emerald-600 border-emerald-100' : 'bg-rose-50 text-rose-600 border-rose-100'
                        )}>
                          {t.type}
                        </span>
                        <span className="text-[8px] font-bold text-slate-400 uppercase">{t.date}</span>
                      </div>
                    </div>
                    <div className="text-right shrink-0">
                      <p className={cn("text-sm font-black", t.type === 'Ingreso' ? 'text-emerald-600' : 'text-slate-900')}>
                        {t.type === 'Gasto' ? '-' : '+'}{formatCOP(t.amount)}
                      </p>
                    </div>
                  </div>

                  {expandedTransactionId === t.id && (
                    <div className="grid grid-cols-2 gap-4 pt-2 animate-in fade-in slide-in-from-top-1 duration-200">
                      <div className="space-y-1">
                        <p className="text-[8px] font-black text-slate-400 uppercase tracking-widest">Identificación</p>
                        <p className="text-[10px] font-bold text-slate-600">{t.vendorTaxId || 'N/A'}</p>
                      </div>
                      <div className="space-y-1">
                        <p className="text-[8px] font-black text-slate-400 uppercase tracking-widest">Estado CNE</p>
                        <span className={cn(
                          "px-2 py-0.5 rounded-lg text-[8px] font-black uppercase tracking-widest border inline-block", 
                          t.status === 'REPORTED_CNE' ? 'bg-slate-900 text-white' : 'bg-white text-slate-600 border-slate-200'
                        )}>
                          {t.status}
                        </span>
                      </div>
                      {t.cneCode && t.cneCode !== 'OTROS' && (
                        <div className="col-span-2 space-y-1">
                          <p className="text-[8px] font-black text-slate-400 uppercase tracking-widest">Código CNE</p>
                          <p className="text-[9px] font-bold text-slate-500 uppercase">{t.cneCode}</p>
                        </div>
                      )}
                    </div>
                  )}

                  <button 
                    onClick={() => setExpandedTransactionId(expandedTransactionId === t.id ? null : t.id)}
                    className="w-full py-2 bg-slate-50 hover:bg-slate-100 rounded-xl text-[8px] font-black uppercase tracking-widest text-slate-500 transition-all flex items-center justify-center gap-1.5 border border-slate-100"
                  >
                    {expandedTransactionId === t.id ? 'Ocultar detalles' : 'Ver más detalles'}
                    <ChevronDown size={12} className={cn("transition-transform duration-200", expandedTransactionId === t.id && "rotate-180")} />
                  </button>
                </div>
              ))}
            </div>

            {/* Desktop Table View */}
            <div className="overflow-x-auto hidden md:block">
              <table className="w-full text-left">
                <thead className="bg-slate-50 text-[10px] font-black uppercase text-slate-400 tracking-[0.2em]">
                  <tr>
                    <th className="px-10 py-6">Detalle</th>
                    <th className="px-10 py-6">Identificación</th>
                    <th className="px-10 py-6">Estado CNE</th>
                    <th className="px-10 py-6 text-right">Monto</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                  {finance.map((t) => (
                    <tr key={t.id} className="hover:bg-slate-50/50 transition-all group">
                      <td className="px-10 py-6">
                        <p className="text-sm font-black text-slate-900 uppercase mb-1">{t.concept}</p>
                        <div className="flex gap-2">
                          <span className={cn("text-[8px] font-black px-2 py-0.5 rounded-md border uppercase", t.type === 'Ingreso' ? 'bg-emerald-50 text-emerald-600 border-emerald-100' : 'bg-rose-50 text-rose-600 border-rose-100')}>{t.type}</span>
                          <span className="text-[9px] font-bold text-slate-400 uppercase">{t.date}</span>
                        </div>
                      </td>
                      <td className="px-10 py-6 text-[11px] font-bold text-slate-500 uppercase">{t.vendorTaxId || 'N/A'}</td>
                      <td className="px-10 py-6">
                        <span className={cn("px-3 py-1 rounded-xl text-[9px] font-black uppercase tracking-widest border", t.status === 'REPORTED_CNE' ? 'bg-slate-900 text-white' : 'bg-white text-slate-600 border-slate-200')}>{t.status}</span>
                      </td>
                      <td className={cn("px-10 py-6 text-right font-black text-sm", t.type === 'Ingreso' ? 'text-emerald-600' : 'text-slate-900')}>
                        {t.type === 'Gasto' ? '-' : '+'}{formatCOP(t.amount)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>
      
      {/* Modal Nuevo Movimiento */}
      {isModalOpen && (
        <div 
          className="fixed inset-0 bg-slate-900/60 backdrop-blur-md z-[200] flex items-center justify-center p-4 animate-in fade-in duration-300"
          onClick={() => setIsModalOpen(false)}
        >
          <div 
            className="bg-white w-full max-w-lg rounded-[3rem] shadow-2xl overflow-visible animate-in zoom-in-95 duration-300 relative"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              onClick={() => setIsModalOpen(false)}
              className="absolute top-8 right-8 z-10 p-2.5 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-2xl transition-all group"
            >
              <X size={20} className="group-hover:rotate-90 transition-transform" />
            </button>

            <div className="px-10 py-10 border-b border-slate-100 bg-slate-50/50 rounded-t-[3rem]">
              <h3 className="text-2xl font-black text-slate-900 tracking-tighter uppercase">Nuevo Registro</h3>
              <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mt-1">Crea un nuevo registro</p>
            </div>
            <form onSubmit={handleAddTransaction} className="p-10 space-y-6">
              <div className="space-y-4">
                <div>
                  <label className="text-[10px] font-black uppercase text-slate-400 tracking-widest block mb-2 px-1">Concepto</label>
                  <input 
                    required 
                    placeholder="Ej: Donación de simpatizante" 
                    className="w-full px-6 py-4 bg-teal-50/30 border-2 border-slate-200 rounded-[1.5rem] text-sm font-bold focus:border-teal-500 focus:bg-white outline-none transition-all" 
                    value={formData.concept} 
                    onChange={e => setFormData({...formData, concept: e.target.value})} 
                  />
                </div>
                
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="text-[10px] font-black uppercase text-slate-400 tracking-widest block mb-2 px-1">Fecha</label>
                    <div className="relative">
                      <button
                        type="button"
                        onClick={() => {
                          setIsCalendarOpen(!isCalendarOpen);
                          setIsTypeDropdownOpen(false);
                          setIsCneDropdownOpen(false);
                        }}
                        className="w-full flex items-center gap-4 px-5 py-4 border-2 border-slate-200 bg-teal-50/30 rounded-[1.5rem] text-sm font-bold text-slate-700 hover:border-teal-500 transition-all outline-none"
                      >
                        <Calendar size={18} className="text-teal-600" />
                        <span className="truncate">{formData.date || "Seleccionar..."}</span>
                      </button>
                      
                      {isCalendarOpen && (
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
                            {renderCalendarUI(formData.date, (d) => setFormData({...formData, date: d}))}
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                  <div>
                    <label className="text-[10px] font-black uppercase text-slate-400 tracking-widest block mb-2 px-1">Monto</label>
                    <input 
                      required 
                      type="number" 
                      className="w-full px-6 py-4 bg-teal-50/30 border-2 border-slate-200 rounded-[1.5rem] text-sm font-bold focus:border-teal-500 focus:bg-white outline-none transition-all" 
                      value={formData.amount} 
                      onChange={e => setFormData({...formData, amount: Number(e.target.value)})} 
                    />
                  </div>
                </div>

                <div>
                  <label className="text-[10px] font-black uppercase text-slate-400 tracking-widest block mb-2 px-1">Tipo de Movimiento</label>
                  <div className="relative">
                    <button
                      type="button"
                      onClick={() => {
                        setIsTypeDropdownOpen(!isTypeDropdownOpen);
                        setIsCneDropdownOpen(false);
                        setIsCalendarOpen(false);
                      }}
                      className="w-full flex items-center justify-between px-6 py-4 bg-teal-50/30 border-2 border-slate-200 rounded-[1.5rem] text-sm font-bold text-slate-700 hover:border-teal-500 transition-all outline-none"
                    >
                      {formData.type}
                      <ChevronDown className={cn("text-slate-400 transition-transform", isTypeDropdownOpen && "rotate-180")} size={18} />
                    </button>

                    {isTypeDropdownOpen && (
                      <div className="absolute top-full left-0 right-0 mt-2 bg-white border-2 border-slate-100 rounded-[1.5rem] shadow-2xl z-[210] overflow-hidden animate-in fade-in zoom-in-95 duration-200">
                        {['Gasto', 'Ingreso'].map(t => (
                          <div
                            key={t}
                            onClick={() => {
                              setFormData({...formData, type: t as any});
                              setIsTypeDropdownOpen(false);
                            }}
                            className={cn(
                              "px-6 py-3 hover:bg-teal-50 text-[11px] font-black uppercase cursor-pointer transition-colors border-b border-slate-50 last:border-none flex justify-between items-center",
                              formData.type === t ? "text-teal-600 bg-teal-50/30" : "text-slate-600"
                            )}
                          >
                            {t}
                            {formData.type === t && <Check size={14} className="text-teal-600" />}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>

                {formData.type === 'Gasto' && (
                  <div>
                    <label className="text-[10px] font-black uppercase text-slate-400 tracking-widest block mb-2 px-1">Código Legal CNE</label>
                    <div className="relative">
                      <button
                        type="button"
                        onClick={() => {
                          setIsCneDropdownOpen(!isCneDropdownOpen);
                          setIsTypeDropdownOpen(false);
                          setIsCalendarOpen(false);
                        }}
                        className="w-full flex items-center justify-between px-6 py-4 bg-teal-50/30 border-2 border-slate-200 rounded-[1.5rem] text-sm font-bold text-slate-700 hover:border-teal-500 transition-all outline-none"
                      >
                        <span className="truncate">
                          {formData.cneCode === 'OTROS' ? '199 - Otros Gastos / Operativos' :
                           formData.cneCode === 'PUBLICIDAD_VALLAS' ? '108 - Publicidad en Vallas / Exterior' :
                           formData.cneCode === 'TRANSPORTE' ? '110 - Transporte y Movilidad' :
                           formData.cneCode === 'SEDE_CAMPANA' ? '102 - Arrendamiento de Sede' :
                           formData.cneCode === 'ACTOS_PUBLICOS' ? '105 - Actos Públicos y Eventos' : formData.cneCode}
                        </span>
                        <ChevronDown className={cn("text-slate-400 transition-transform", isCneDropdownOpen && "rotate-180")} size={18} />
                      </button>

                      {isCneDropdownOpen && (
                        <div className="absolute top-full left-0 right-0 mt-2 bg-white border-2 border-slate-100 rounded-[1.5rem] shadow-2xl z-[210] overflow-hidden animate-in fade-in zoom-in-95 duration-200">
                          {[
                            { value: 'OTROS', label: '199 - Otros Gastos / Operativos' },
                            { value: 'PUBLICIDAD_VALLAS', label: '108 - Publicidad en Vallas / Exterior' },
                            { value: 'TRANSPORTE', label: '110 - Transporte y Movilidad' },
                            { value: 'SEDE_CAMPANA', label: '102 - Arrendamiento de Sede' },
                            { value: 'ACTOS_PUBLICOS', label: '105 - Actos Públicos y Eventos' }
                          ].map(item => (
                            <div
                              key={item.value}
                              onClick={() => {
                                setFormData({...formData, cneCode: item.value as any});
                                setIsCneDropdownOpen(false);
                              }}
                              className={cn(
                                "px-6 py-3 hover:bg-teal-50 text-[11px] font-black uppercase cursor-pointer transition-colors border-b border-slate-50 last:border-none flex justify-between items-center",
                                formData.cneCode === item.value ? "text-teal-600 bg-teal-50/30" : "text-slate-600"
                              )}
                            >
                              <span className="truncate mr-4">{item.label}</span>
                              {formData.cneCode === item.value && <Check size={14} className="text-teal-600" />}
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>
              
              <div className="pt-6 flex gap-4">
                <button 
                  type="button" 
                  onClick={() => setIsModalOpen(false)} 
                  className="flex-1 py-4 bg-slate-100 rounded-[1.5rem] text-[10px] font-black uppercase text-slate-500 hover:bg-slate-200 transition-colors"
                >
                  Cancelar
                </button>
                <button 
                  type="submit" 
                  className="flex-1 py-4 bg-teal-600 text-white rounded-[1.5rem] font-black text-[10px] uppercase shadow-xl shadow-teal-100 hover:bg-teal-700 transition-all"
                >
                  Registrar Movimiento
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
