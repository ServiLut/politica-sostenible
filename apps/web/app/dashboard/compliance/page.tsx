"use client";

import React, { useMemo, useState } from 'react';
import { useCRM } from '@/context/CRMContext';
import { 
  ShieldCheck, 
  AlertTriangle, 
  Download, 
  Upload, 
  CheckCircle, 
  ShieldAlert, 
  History, 
  Info, 
  Lock, 
  BarChart3, 
  PieChart as PieIcon,
  Scale
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

const TOPE_LEGAL_CNE = 50000000; // 50.000.000 COP

export default function CompliancePage() {
  const { compliance, finance, getComplianceScore, uploadEvidence, logAction, auditLogs } = useCRM();
  const score = getComplianceScore();
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  // LÓGICA DE CÁLCULO DE TOPES (REAL)
  const complianceStats = useMemo(() => {
    // Sumar todos los registros de Gasto (OUT) que estén APPROVED o REPORTED_CNE
    const approvedExpenses = finance
      .filter(f => f.type === 'Gasto' && (f.status === 'APPROVED' || f.status === 'REPORTED_CNE'))
      .reduce((a, b) => a + b.amount, 0);

    const executionPercentage = (approvedExpenses / TOPE_LEGAL_CNE) * 100;

    // Agrupar por Código CNE para Gráfico de Torta
    const expensesByCne = finance
      .filter(f => f.type === 'Gasto')
      .reduce((acc: Record<string, number>, curr) => {
        const code = curr.cneCode || 'OTROS';
        acc[code] = (acc[code] || 0) + curr.amount;
        return acc;
      }, {});

    const pieData = Object.entries(expensesByCne).map(([name, value]) => ({ name, value }));

    // Gráfico de Barras: Presupuesto vs Real
    const barData = [
      { name: 'Presupuesto Legal', monto: TOPE_LEGAL_CNE },
      { name: 'Gasto Real', monto: approvedExpenses }
    ];

    return {
      executionPercentage,
      pieData,
      barData
    };
  }, [finance]);

  const { executionPercentage, pieData, barData } = complianceStats;

  // SISTEMA DE ALERTA "SEMÁFORO"
  const alertStatus = useMemo(() => {
    if (executionPercentage > 90) return { color: 'text-red-600', bg: 'bg-red-50', border: 'border-red-200', msg: '¡PELIGRO! Riesgo de sanción administrativa por superar topes', icon: <ShieldAlert className="animate-pulse" size={32} />, critical: true };
    if (executionPercentage >= 70) return { color: 'text-amber-600', bg: 'bg-amber-50', border: 'border-amber-200', msg: 'Atención: Se acerca al límite legal', icon: <AlertTriangle size={32} />, critical: false };
    return { color: 'text-emerald-600', bg: 'bg-emerald-50', border: 'border-emerald-200', msg: 'Estado Seguro: Operación dentro de límites legales', icon: <ShieldCheck size={32} />, critical: false };
  }, [executionPercentage]);

  const formatCOP = (val: number) => 
    new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 }).format(val);

  const COLORS = ['#2563eb', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6'];

  const handleGenerateReport = () => {
    const doc = new jsPDF();
    doc.setFontSize(20);
    doc.text("INFORME DE COMPLIANCE - CUENTAS CLARAS", 14, 22);
    doc.setFontSize(10);
    doc.text(`Fecha: ${new Date().toLocaleDateString()}`, 14, 30);
    doc.text(`Porcentaje de Ejecución: ${executionPercentage.toFixed(2)}%`, 14, 35);

    autoTable(doc, {
      startY: 45,
      head: [['Categoría CNE', 'Total Gastado']],
      body: pieData.map(d => [d.name, formatCOP(d.value as number)]),
      headStyles: { fillColor: [15, 23, 42] }
    });

    autoTable(doc, {
      startY: (doc as jsPDF & { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 10,
      head: [['Obligación', 'Estado', 'Vencimiento']],
      body: compliance.map(o => [o.title, o.status, o.deadline]),
      headStyles: { fillColor: [37, 99, 235] }
    });

    doc.save(`reporte_compliance_${Date.now()}.pdf`);
    logAction('Admin', 'Generó reporte consolidado de Compliance', 'Compliance', 'Info');
  };

  return (
    <div className="space-y-8 pb-20">
      <div className="flex justify-between items-start">
        <div>
          <h1 className="text-4xl font-black text-slate-900 tracking-tighter uppercase">Módulo de Compliance</h1>
          <p className="text-slate-500 font-medium">Control legal, topes de campaña y reportes CNE.</p>
        </div>
        <button 
          onClick={handleGenerateReport}
          className="bg-slate-900 text-white px-8 py-4 rounded-2xl font-black text-xs tracking-widest uppercase shadow-xl hover:bg-blue-600 transition-all flex items-center gap-2"
        >
          <Download size={18} /> Descargar Reporte Consolidado
        </button>
      </div>

      {/* SISTEMA DE ALERTA "SEMÁFORO" */}
      <div className={cn(
        "p-8 rounded-[3rem] border-2 flex items-center gap-8 transition-all shadow-lg",
        alertStatus.bg, alertStatus.border, alertStatus.color
      )}>
        <div className="w-20 h-20 rounded-3xl bg-white flex items-center justify-center shadow-sm">
          {alertStatus.icon}
        </div>
        <div className="flex-1">
          <p className="text-[10px] font-black uppercase tracking-[0.2em] opacity-60">Estado de Blindaje Legal</p>
          <h3 className="text-2xl font-black tracking-tighter">{alertStatus.msg}</h3>
        </div>
        <div className="text-right">
          <p className="text-[10px] font-black uppercase tracking-[0.2em] opacity-60">Tope Ejecutado</p>
          <h3 className="text-4xl font-black">{executionPercentage.toFixed(1)}%</h3>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        {/* GRÁFICO DE BARRAS: PRESUPUESTO VS REAL */}
        <div className="bg-white p-10 rounded-[3rem] border border-slate-100 shadow-sm">
          <div className="flex items-center gap-2 mb-8">
            <BarChart3 className="text-blue-600" size={20} />
            <h3 className="text-xs font-black uppercase text-slate-400 tracking-[0.2em]">Presupuesto Inicial vs Gasto Real</h3>
          </div>
          <div className="h-[300px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={barData}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{fontSize: 10, fontWeight: 'bold'}} />
                <YAxis hide />
                <Tooltip formatter={(val: any) => formatCOP(Number(val))} contentStyle={{borderRadius: '16px', border: 'none', boxShadow: '0 10px 15px -3px rgba(0,0,0,0.1)'}} />
                <Bar dataKey="monto" radius={[10, 10, 0, 0]}>
                  {barData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={index === 0 ? '#f1f5f9' : (executionPercentage > 90 ? '#ef4444' : '#2563eb')} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* GRÁFICO DE TORTA: GASTOS POR CÓDIGO CNE */}
        <div className="bg-white p-10 rounded-[3rem] border border-slate-100 shadow-sm">
          <div className="flex items-center gap-2 mb-8">
            <PieIcon className="text-emerald-500" size={20} />
            <h3 className="text-xs font-black uppercase text-slate-400 tracking-[0.2em]">Gastos por Categoría Legal (CNE)</h3>
          </div>
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
                <Tooltip formatter={(val: any) => formatCOP(Number(val))} />
                <Legend verticalAlign="bottom" height={36} wrapperStyle={{fontSize: '10px', fontWeight: 'bold'}} />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* MATRIZ DE OBLIGACIONES */}
        <div className="lg:col-span-2 bg-white border border-slate-100 rounded-[3rem] overflow-hidden shadow-sm">
          <div className="px-10 py-8 border-b border-slate-50 bg-slate-50/50 flex justify-between items-center">
            <h3 className="font-black text-slate-900 flex items-center gap-2 uppercase text-sm tracking-tighter">
              <Scale size={20} className="text-blue-600" /> Matriz de Obligaciones Normativas
            </h3>
            <span className="bg-blue-50 text-blue-600 px-4 py-1 rounded-full text-[10px] font-black uppercase tracking-widest">
              Puntaje: {Math.round(score)}%
            </span>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead className="bg-slate-50 text-[10px] font-black uppercase text-slate-400 tracking-widest">
                <tr>
                  <th className="px-10 py-4">Requisito Legal</th>
                  <th className="px-10 py-4">Estado</th>
                  <th className="px-10 py-4 text-right">Acción</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {compliance.map((o) => (
                  <tr key={o.id} className="hover:bg-slate-50/50 transition-colors">
                    <td className="px-10 py-6">
                      <p className="text-sm font-black text-slate-900 mb-1">{o.title}</p>
                      <p className="text-[10px] font-bold text-slate-400 uppercase">{o.type} • Vence: {o.deadline}</p>
                    </td>
                    <td className="px-10 py-6">
                      <span className={cn(
                        "px-3 py-1 rounded-full text-[8px] font-black uppercase tracking-widest border",
                        o.status === 'Cumplido' ? "bg-emerald-50 text-emerald-600 border-emerald-100" : "bg-amber-50 text-amber-600 border-amber-100"
                      )}>
                        {o.status}
                      </span>
                    </td>
                    <td className="px-10 py-6 text-right">
                      {o.status !== 'Cumplido' ? (
                        <button 
                          onClick={() => { setSelectedId(o.id); setIsModalOpen(true); }}
                          className="p-3 bg-blue-50 text-blue-600 rounded-2xl hover:bg-blue-600 hover:text-white transition-all shadow-sm"
                        >
                          <Upload size={16} />
                        </button>
                      ) : (
                        <CheckCircle className="text-emerald-500 ml-auto" size={24} />
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* LOGS DE AUDITORÍA */}
        <div className="bg-white border border-slate-100 rounded-[3rem] shadow-sm flex flex-col">
          <div className="px-8 py-8 border-b border-slate-50 flex items-center gap-3">
             <History className="text-slate-400" size={20} />
             <h3 className="font-black text-sm uppercase tracking-tighter">Bitácora Forense</h3>
          </div>
          <div className="flex-1 overflow-y-auto max-h-[500px] p-6 space-y-4">
             {auditLogs.slice(0, 8).map((log) => (
                <div key={log.id} className="p-4 bg-slate-50 rounded-2xl border border-slate-100">
                   <div className="flex justify-between items-start mb-1">
                      <span className="text-[10px] font-black text-slate-900 uppercase">{log.actor}</span>
                      <span className="text-[8px] font-bold text-slate-400">{new Date(log.timestamp).toLocaleTimeString()}</span>
                   </div>
                   <p className="text-[10px] text-slate-600 leading-tight mb-2 font-medium">{log.action}</p>
                   <div className="flex items-center gap-1.5">
                      <div className={cn("w-1.5 h-1.5 rounded-full", log.severity === 'Critical' ? "bg-red-500" : "bg-blue-500")} />
                      <span className="text-[8px] font-black uppercase text-slate-400">{log.module}</span>
                   </div>
                </div>
             ))}
             {auditLogs.length === 0 && (
                <div className="text-center py-20 text-slate-300">
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
              <div className="w-24 h-24 bg-blue-50 text-blue-600 rounded-[2rem] flex items-center justify-center mx-auto mb-6">
                <Lock size={40} />
              </div>
              <h3 className="text-2xl font-black text-slate-900 tracking-tighter mb-4">Cargar Soporte Legal</h3>
              <p className="text-slate-500 text-sm mb-8">
                El archivo debe ser una factura o documento oficial que respalde el cumplimiento ante el CNE.
              </p>
              
              <div className="border-2 border-dashed border-slate-100 p-12 rounded-[2.5rem] bg-slate-50 mb-8 flex flex-col items-center">
                <Upload size={32} className="text-slate-300 mb-2" />
                <p className="text-[9px] font-black uppercase text-slate-400 tracking-widest">Arrastra el archivo PDF aquí</p>
              </div>

              <div className="flex gap-4">
                <button onClick={() => setIsModalOpen(false)} className="flex-1 py-4 text-[10px] font-black uppercase text-slate-400">Cancelar</button>
                <button 
                  onClick={() => {
                    if (selectedId) uploadEvidence(selectedId, 'soporte_cargado.pdf');
                    logAction('Admin', `Cargó evidencia para hito: ${selectedId}`, 'Compliance', 'Info');
                    setIsModalOpen(false);
                  }}
                  className="flex-1 bg-slate-900 text-white rounded-2xl py-4 font-black uppercase text-xs shadow-xl hover:bg-emerald-600 transition-all"
                >
                  Subir Soporte
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
