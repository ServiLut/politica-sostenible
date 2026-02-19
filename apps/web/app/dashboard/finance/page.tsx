"use client";

import React, { useState, useRef, useEffect, useMemo } from 'react';
import { useCRM, FinanceTransaction, CneCode, FinanceStatus } from '@/context/CRMContext';
import { useToast } from '@/context/ToastContext';
import { 
  Wallet, 
  TrendingUp, 
  TrendingDown, 
  Receipt, 
  FileText, 
  FileSpreadsheet, 
  ChevronDown,
  Download,
  AlertCircle,
  ShieldCheck,
  Ban,
  FileCheck,
  Plus,
  Trash2,
  ExternalLink,
  Info
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
import * as XLSX from 'xlsx';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { cn } from '@/components/ui/utils';

const TOPE_LEGAL_CNE = 50000000; // 50 millones COP

export default function FinancePage() {
  const { finance, addFinanceTransaction, updateFinanceTransaction, deleteFinanceTransaction, logAction } = useCRM();
  const { success: toastSuccess, error: toastError } = useToast();
  
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Form State
  const [formData, setFormData] = useState<Omit<FinanceTransaction, 'id'>>({
    concept: '',
    amount: 0,
    type: 'Gasto',
    category: 'Logística',
    date: new Date().toISOString().split('T')[0],
    status: 'PENDING',
    cneCode: 'OTROS',
    providerId: '',
    evidenceUrl: ''
  });

  // Cálculos de Compliance con useMemo
  const complianceData = useMemo(() => {
    const totalIncome = finance.filter(f => f.type === 'Ingreso').reduce((a, b) => a + b.amount, 0);
    const totalExpenses = finance.filter(f => f.type === 'Gasto').reduce((a, b) => a + b.amount, 0);
    
    // Sumar gastos APPROVED o REPORTED_CNE para el tope legal (solo GASTOS cuentan contra el tope)
    const approvedExpenses = finance
      .filter(f => f.type === 'Gasto' && (f.status === 'APPROVED' || f.status === 'REPORTED_CNE'))
      .reduce((a, b) => a + b.amount, 0);
    
    const executionPercentage = (approvedExpenses / TOPE_LEGAL_CNE) * 100;
    
    // Agrupar por Código CNE para el gráfico de torta
    const expensesByCne = finance
      .filter(f => f.type === 'Gasto')
      .reduce((acc: Record<string, number>, curr) => {
        const code = curr.cneCode || 'OTROS';
        acc[code] = (acc[code] || 0) + curr.amount;
        return acc;
      }, {});

    const pieData = Object.entries(expensesByCne).map(([name, value]) => ({ name, value }));
    
    // Datos para gráfico de barras
    const barData = [
      { name: 'Tope Legal', monto: TOPE_LEGAL_CNE },
      { name: 'Gasto Ejecutado', monto: approvedExpenses }
    ];

    return {
      totalIncome,
      totalExpenses,
      approvedExpenses,
      balance: totalIncome - totalExpenses,
      executionPercentage,
      pieData,
      barData
    };
  }, [finance]);

  const { totalIncome, totalExpenses, approvedExpenses, balance, executionPercentage, pieData, barData } = complianceData;

  // Sistema de Alerta "Semáforo"
  const alertStatus = useMemo(() => {
    if (executionPercentage > 90) {
      return { 
        color: 'text-red-600', 
        bg: 'bg-red-50', 
        border: 'border-red-200', 
        msg: '¡PELIGRO! Riesgo de sanción administrativa por superar topes', 
        icon: <AlertCircle className="animate-pulse" />, 
        critical: true 
      };
    }
    if (executionPercentage >= 70) {
      return { 
        color: 'text-amber-600', 
        bg: 'bg-amber-50', 
        border: 'border-amber-200', 
        msg: 'Atención: Se acerca al límite legal', 
        icon: <AlertCircle />, 
        critical: false 
      };
    }
    return { 
      color: 'text-emerald-600', 
      bg: 'bg-emerald-50', 
      border: 'border-emerald-200', 
      msg: 'Estado Seguro: Dentro de los límites legales', 
      icon: <ShieldCheck />, 
      critical: false 
    };
  }, [executionPercentage]);

  const formatCOP = (val: number) => 
    new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 }).format(val);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setIsModalOpen(false);
    };
    if (isModalOpen) window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isModalOpen]);

  // Cerrar dropdown al hacer click fuera
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsDropdownOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const handleAddTransaction = (e: React.FormEvent) => {
    e.preventDefault();
    if (formData.type === 'Gasto' && (!formData.providerId || !formData.cneCode)) {
      toastError("Para gastos, el NIT y el Código CNE son obligatorios");
      return;
    }
    
    addFinanceTransaction(formData);
    logAction('Tesorero', `Agregó ${formData.type}: ${formData.concept}`, 'Finanzas');
    toastSuccess(`${formData.type} registrado correctamente`);
    setIsModalOpen(false);
    setFormData({
      concept: '',
      amount: 0,
      type: 'Gasto',
      category: 'Logística',
      date: new Date().toISOString().split('T')[0],
      status: 'PENDING',
      cneCode: 'OTROS',
      providerId: '',
      evidenceUrl: ''
    });
  };

  const handleReportToCne = (id: string) => {
    updateFinanceTransaction(id, { status: 'REPORTED_CNE' });
    logAction('Tesorero', `Reportó transacción al CNE ID: ${id}`, 'Finanzas', 'Critical');
    toastSuccess("Transacción reportada y bloqueada para edición");
  };

  const COLORS = ['#2563eb', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6'];

  const exportToPDF = () => {
    const doc = new jsPDF();
    const date = new Date().toLocaleDateString();

    doc.setFontSize(18);
    doc.text("REPORTE CUENTAS CLARAS - CNE", 14, 20);
    doc.setFontSize(10);
    doc.text(`Generado el: ${date}`, 14, 28);
    
    // Resumen Compliance
    doc.setFont("helvetica", "bold");
    doc.text(`Total Ejecución Legal: ${formatCOP(approvedExpenses)}`, 14, 38);
    doc.text(`Tope Permitido: ${formatCOP(TOPE_LEGAL_CNE)}`, 14, 44);
    doc.text(`% Ejecución: ${executionPercentage.toFixed(2)}%`, 14, 50);

    // Tabla por Código CNE
    const cneSummary = pieData.map(d => [d.name, formatCOP(d.value as number)]);
    
    autoTable(doc, {
      startY: 60,
      head: [['Código CNE / Categoría', 'Total Gastado']],
      body: cneSummary,
      theme: 'grid',
      headStyles: { fillColor: [15, 23, 42] }
    });

    // Detalle de Movimientos
    autoTable(doc, {
      startY: (doc as any).lastAutoTable.finalY + 10,
      head: [['Fecha', 'Concepto', 'Proveedor/NIT', 'Código CNE', 'Monto', 'Estado']],
      body: finance.map(t => [
        t.date,
        t.concept,
        t.providerId || 'N/A',
        t.cneCode || 'N/A',
        formatCOP(t.amount),
        t.status
      ]),
      headStyles: { fillColor: [37, 99, 235] }
    });

    doc.save(`reporte_cne_${new Date().getTime()}.pdf`);
    setIsDropdownOpen(false);
    toastSuccess("Reporte PDF generado");
  };

  return (
    <div className="space-y-8 pb-20">
      <div className="flex justify-between items-end">
        <div>
          <h1 className="text-4xl font-black text-slate-900 tracking-tighter uppercase">Compliance Financiero</h1>
          <p className="text-slate-500 font-medium">Sistema de control "Cuentas Claras" bajo normativa CNE.</p>
        </div>
        <button 
          onClick={() => setIsModalOpen(true)}
          className="bg-blue-600 text-white px-6 py-4 rounded-2xl font-black text-sm shadow-xl hover:bg-slate-900 transition-all flex items-center gap-2"
        >
          <Plus size={20} /> Registrar Movimiento
        </button>
      </div>

      {/* Alerta Semáforo */}
      <div className={cn(
        "p-6 rounded-[2rem] border-2 flex items-center gap-6 transition-all",
        alertStatus.bg, alertStatus.border, alertStatus.color
      )}>
        <div className="w-16 h-16 rounded-2xl bg-white flex items-center justify-center shadow-sm">
          {alertStatus.icon}
        </div>
        <div className="flex-1">
          <p className="text-[10px] font-black uppercase tracking-widest opacity-60">Control de Riesgo CNE</p>
          <h3 className="text-lg font-black tracking-tight">{alertStatus.msg}</h3>
        </div>
        <div className="text-right">
          <p className="text-[10px] font-black uppercase tracking-widest opacity-60">Tope Ejecutado</p>
          <h3 className="text-2xl font-black">{executionPercentage.toFixed(1)}%</h3>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="bg-[#111827] text-white p-8 rounded-[2.5rem] shadow-xl relative overflow-hidden group">
          <Wallet className="text-blue-400 mb-4" size={32} />
          <p className="text-[10px] font-black opacity-60 uppercase tracking-[0.2em] mb-1">Balance General</p>
          <h3 className="text-3xl font-black tracking-tighter">{formatCOP(balance)}</h3>
        </div>
        
        <div className="bg-white p-8 rounded-[2.5rem] border border-slate-100 shadow-sm">
          <TrendingUp className="text-emerald-500 mb-4" size={32} />
          <p className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] mb-1">Ingresos Totales</p>
          <h3 className="text-3xl font-black text-slate-900 tracking-tighter">{formatCOP(totalIncome)}</h3>
        </div>

        <div className="bg-white p-8 rounded-[2.5rem] border border-slate-100 shadow-sm">
          <TrendingDown className="text-red-500 mb-4" size={32} />
          <p className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] mb-1">Gastos Reportables</p>
          <h3 className="text-3xl font-black text-slate-900 tracking-tighter">{formatCOP(approvedExpenses)}</h3>
        </div>
      </div>

      {/* Visualización Analítica */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        <div className="bg-white p-10 rounded-[3rem] border border-slate-100 shadow-sm h-[400px]">
          <h3 className="text-xs font-black uppercase text-slate-400 tracking-[0.2em] mb-8">Gasto vs Tope Legal</h3>
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={barData}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
              <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{fontSize: 10, fontWeight: 'bold'}} />
              <YAxis hide />
              <Tooltip 
                contentStyle={{borderRadius: '16px', border: 'none', boxShadow: '0 20px 25px -5px rgb(0 0 0 / 0.1)'}}
                formatter={(value: any) => [formatCOP(Number(value)), 'Monto']}
              />
              <Bar dataKey="monto" radius={[10, 10, 0, 0]}>
                {barData.map((entry, index) => (
                  <Cell key={`cell-${index}`} fill={index === 0 ? '#f1f5f9' : (executionPercentage > 90 ? '#ef4444' : '#2563eb')} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>

        <div className="bg-white p-10 rounded-[3rem] border border-slate-100 shadow-sm h-[400px]">
          <h3 className="text-xs font-black uppercase text-slate-400 tracking-[0.2em] mb-8">Segregación por Código CNE</h3>
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
              <Tooltip formatter={(value: any) => formatCOP(Number(value))} />
              <Legend verticalAlign="bottom" height={36} wrapperStyle={{fontSize: '10px', fontWeight: 'bold'}} />
            </PieChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Listado de Transacciones */}
      <div className="bg-white border border-slate-200 rounded-[2.5rem] overflow-hidden shadow-sm">
        <div className="px-8 py-6 border-b border-slate-100 bg-slate-50/50 flex justify-between items-center">
          <h3 className="font-black text-slate-900 flex items-center gap-2">
            <Receipt size={20} className="text-blue-600" /> Libro Auxiliar de Bancos
          </h3>
          
          <div className="relative" ref={dropdownRef}>
            <button 
              onClick={() => setIsDropdownOpen(!isDropdownOpen)}
              className="text-[10px] font-black text-blue-600 uppercase tracking-widest flex items-center gap-2 hover:bg-blue-50 px-4 py-2 rounded-xl transition-all"
            >
              <Download size={14} /> Reporte Oficial CNE <ChevronDown size={14} className={cn("transition-transform", isDropdownOpen && "rotate-180")} />
            </button>

            {isDropdownOpen && (
              <div className="absolute right-0 mt-2 w-48 bg-white rounded-2xl shadow-2xl border border-slate-100 py-2 z-10">
                <button onClick={exportToPDF} className="w-full px-4 py-3 text-left text-xs font-bold text-slate-700 hover:bg-slate-50 flex items-center gap-3">
                  <FileText size={16} className="text-red-500" /> Exportar PDF
                </button>
              </div>
            )}
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead className="bg-slate-50 text-[10px] font-black uppercase text-slate-400 tracking-widest">
              <tr>
                <th className="px-8 py-4">Información del Movimiento</th>
                <th className="px-8 py-4">Tercero / CNE</th>
                <th className="px-8 py-4">Estado Compliance</th>
                <th className="px-8 py-4 text-right">Monto</th>
                <th className="px-8 py-4 text-right">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {finance.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-8 py-20 text-center">
                    <Info className="mx-auto text-slate-300 mb-4" size={40} />
                    <p className="text-slate-400 font-bold uppercase text-[10px] tracking-widest">No hay transacciones registradas</p>
                  </td>
                </tr>
              ) : (
                finance.map((t) => (
                  <tr key={t.id} className="hover:bg-slate-50/50 transition-colors group">
                    <td className="px-8 py-4">
                      <p className="text-sm font-black text-slate-900 mb-1">{t.concept}</p>
                      <div className="flex gap-2">
                        <span className={cn(
                          "text-[8px] font-black uppercase px-2 py-0.5 rounded-full border",
                          t.type === 'Ingreso' ? 'bg-emerald-50 text-emerald-600 border-emerald-100' : 'bg-red-50 text-red-600 border-red-100'
                        )}>
                          {t.type}
                        </span>
                        <span className="text-[8px] font-bold text-slate-400">{t.date}</span>
                      </div>
                    </td>
                    <td className="px-8 py-4">
                      <p className="text-xs font-bold text-slate-700">{t.providerId || 'Sin tercero'}</p>
                      <p className="text-[9px] font-black text-blue-600 uppercase mt-1">{t.cneCode || t.category}</p>
                    </td>
                    <td className="px-8 py-4">
                      <div className="flex items-center gap-2">
                        {t.status === 'REPORTED_CNE' ? (
                          <span className="bg-blue-900 text-white text-[8px] font-black uppercase px-3 py-1 rounded-lg flex items-center gap-1">
                            <FileCheck size={10} /> Reportado CNE
                          </span>
                        ) : t.status === 'APPROVED' ? (
                          <span className="bg-emerald-50 text-emerald-600 border border-emerald-100 text-[8px] font-black uppercase px-3 py-1 rounded-lg">
                            Aprobado
                          </span>
                        ) : (
                          <span className="bg-amber-50 text-amber-600 border border-amber-100 text-[8px] font-black uppercase px-3 py-1 rounded-lg">
                            Pendiente
                          </span>
                        )}
                        {t.evidenceUrl && (
                          <a href={t.evidenceUrl} target="_blank" className="p-1 hover:bg-slate-100 rounded text-blue-600">
                            <ExternalLink size={12} />
                          </a>
                        )}
                      </div>
                    </td>
                    <td className={cn(
                      "px-8 py-4 text-right font-black text-sm",
                      t.type === 'Ingreso' ? 'text-emerald-600' : 'text-slate-900'
                    )}>
                      {t.type === 'Gasto' ? '-' : '+'}{formatCOP(t.amount)}
                    </td>
                    <td className="px-8 py-4 text-right">
                      <div className="flex justify-end gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                        {t.status !== 'REPORTED_CNE' ? (
                          <>
                            <button 
                              onClick={() => handleReportToCne(t.id)}
                              className="p-2 bg-blue-50 text-blue-600 rounded-lg hover:bg-blue-600 hover:text-white"
                              title="Reportar al CNE"
                            >
                              <FileCheck size={14} />
                            </button>
                            <button 
                              onClick={() => deleteFinanceTransaction(t.id)}
                              className="p-2 bg-red-50 text-red-600 rounded-lg hover:bg-red-600 hover:text-white"
                            >
                              <Trash2 size={14} />
                            </button>
                          </>
                        ) : (
                          <Ban size={16} className="text-slate-300" />
                        )}
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Modal Registro */}
      {isModalOpen && (
        <div 
          className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4"
          onClick={() => setIsModalOpen(false)}
        >
          <div 
            className="bg-white w-full max-w-2xl rounded-[2.5rem] shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="p-10">
              <h3 className="text-3xl font-black text-slate-900 tracking-tighter mb-8 flex items-center gap-3">
                <Receipt size={28} className="text-blue-600" /> Nuevo Registro Contable
              </h3>
              
              <form onSubmit={handleAddTransaction} className="space-y-6">
                <div className="grid grid-cols-2 gap-6">
                  <div>
                    <label className="text-[10px] font-black uppercase text-slate-400 tracking-widest mb-2 block">Tipo de Movimiento</label>
                    <select 
                      className="w-full bg-slate-50 border-none rounded-2xl px-5 py-4 font-bold text-slate-700"
                      value={formData.type}
                      onChange={(e) => setFormData({...formData, type: e.target.value as any})}
                    >
                      <option value="Ingreso">Ingreso (Aporte/Donación)</option>
                      <option value="Gasto">Gasto (Inversión Campaña)</option>
                    </select>
                  </div>
                  <div>
                    <label className="text-[10px] font-black uppercase text-slate-400 tracking-widest mb-2 block">Monto (COP)</label>
                    <input 
                      type="number" 
                      placeholder="0"
                      required
                      className="w-full bg-slate-50 border-none rounded-2xl px-5 py-4 font-bold text-slate-700"
                      onChange={(e) => setFormData({...formData, amount: Number(e.target.value)})}
                    />
                  </div>
                </div>

                <div>
                  <label className="text-[10px] font-black uppercase text-slate-400 tracking-widest mb-2 block">Concepto / Descripción</label>
                  <input 
                    type="text" 
                    placeholder="Ej: Alquiler de sonido para acto público"
                    required
                    className="w-full bg-slate-50 border-none rounded-2xl px-5 py-4 font-bold text-slate-700"
                    onChange={(e) => setFormData({...formData, concept: e.target.value})}
                  />
                </div>

                {formData.type === 'Gasto' && (
                  <div className="grid grid-cols-2 gap-6 p-6 bg-blue-50/50 rounded-3xl border border-blue-100">
                    <div>
                      <label className="text-[10px] font-black uppercase text-blue-600 tracking-widest mb-2 block">NIT / Cédula Proveedor</label>
                      <input 
                        type="text" 
                        placeholder="Obligatorio para CNE"
                        className="w-full bg-white border-none rounded-xl px-5 py-3 font-bold text-slate-700"
                        onChange={(e) => setFormData({...formData, providerId: e.target.value})}
                      />
                    </div>
                    <div>
                      <label className="text-[10px] font-black uppercase text-blue-600 tracking-widest mb-2 block">Código CNE</label>
                      <select 
                        className="w-full bg-white border-none rounded-xl px-5 py-3 font-bold text-slate-700"
                        onChange={(e) => setFormData({...formData, cneCode: e.target.value as CneCode})}
                      >
                        <option value="OTROS">Seleccione Código...</option>
                        <option value="PUBLICIDAD_VALLAS">108 - Publicidad y Vallas</option>
                        <option value="TRANSPORTE">110 - Transporte</option>
                        <option value="SEDE_CAMPANA">102 - Sede de Campaña</option>
                        <option value="ACTOS_PUBLICOS">105 - Actos Públicos</option>
                        <option value="OTROS">Otros Gastos</option>
                      </select>
                    </div>
                    <div className="col-span-2">
                      <label className="text-[10px] font-black uppercase text-blue-600 tracking-widest mb-2 block">Link Soporte / Factura PDF</label>
                      <input 
                        type="url" 
                        placeholder="https://storage.supabase.com/..."
                        className="w-full bg-white border-none rounded-xl px-5 py-3 font-bold text-slate-700"
                        onChange={(e) => setFormData({...formData, evidenceUrl: e.target.value})}
                      />
                    </div>
                  </div>
                )}

                <div className="flex gap-4 pt-4">
                  <button type="button" onClick={() => setIsModalOpen(false)} className="flex-1 py-4 font-black uppercase text-slate-400 text-xs tracking-widest">Cancelar</button>
                  <button type="submit" className="flex-1 bg-slate-900 text-white rounded-2xl py-4 font-black uppercase text-xs tracking-widest shadow-xl hover:bg-blue-600 transition-all">
                    Guardar Movimiento
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
