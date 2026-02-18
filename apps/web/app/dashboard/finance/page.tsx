"use client";

import React, { useState, useRef, useEffect } from 'react';
import { useCRM, FinanceTransaction } from '@/context/CRMContext';
import { useToast } from '@/context/ToastContext';
import { 
  Wallet, 
  TrendingUp, 
  TrendingDown, 
  Receipt, 
  FileText, 
  FileSpreadsheet, 
  ChevronDown,
  Download
} from 'lucide-react';
import * as XLSX from 'xlsx';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { cn } from '@/components/ui/utils';

// Datos de prueba para asegurar visibilidad en los reportes
const MOCK_FINANCE_DATA: Omit<FinanceTransaction, 'id'>[] = [
  { concept: 'Aporte Persona Natural - Juan Pérez', amount: 5000000, type: 'Ingreso', category: 'Donaciones', date: '2026-02-01' },
  { concept: 'Alquiler Sede Campaña', amount: 1200000, type: 'Gasto', category: 'Logística', date: '2026-02-05' },
  { concept: 'Impresión de Vallas Publicitarias', amount: 2500000, type: 'Gasto', category: 'Publicidad', date: '2026-02-10' },
  { concept: 'Aporte Crédito Bancario', amount: 15000000, type: 'Ingreso', category: 'Créditos', date: '2026-02-12' },
  { concept: 'Honorarios Agencia Digital', amount: 3000000, type: 'Gasto', category: 'Comunicación', date: '2026-02-15' },
];

export default function FinancePage() {
  const { finance, getFinanceSummary } = useCRM();
  const { success: toastSuccess } = useToast();
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Usar datos del contexto o mock data si está vacío
  const displayData = finance.length > 0 ? finance : MOCK_FINANCE_DATA.map((d, i) => ({ ...d, id: `mock-${i}` }));
  
  // Recalcular resumen si usamos mock data
  const summary = finance.length > 0 ? getFinanceSummary() : {
    totalIncome: MOCK_FINANCE_DATA.filter(f => f.type === 'Ingreso').reduce((a, b) => a + b.amount, 0),
    totalExpenses: MOCK_FINANCE_DATA.filter(f => f.type === 'Gasto').reduce((a, b) => a + b.amount, 0),
    balance: MOCK_FINANCE_DATA.filter(f => f.type === 'Ingreso').reduce((a, b) => a + b.amount, 0) - MOCK_FINANCE_DATA.filter(f => f.type === 'Gasto').reduce((a, b) => a + b.amount, 0)
  };

  const { totalIncome, totalExpenses, balance } = summary;

  const formatCOP = (val: number) => 
    new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 }).format(val);

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

  const exportToExcel = () => {
    const dataToExport = displayData.map(t => ({
      "Concepto": t.concept,
      "Categoría": t.category,
      "Tipo": t.type,
      "Fecha": t.date,
      "Monto": t.amount
    }));

    const ws = XLSX.utils.json_to_sheet(dataToExport);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Movimientos");
    XLSX.writeFile(wb, `reporte_financiero_${new Date().toISOString().split('T')[0]}.xlsx`);
    
    toastSuccess("Reporte Excel descargado correctamente");
    setIsDropdownOpen(false);
  };

  const exportToPDF = () => {
    const doc = new jsPDF();
    const date = new Date().toLocaleDateString();

    // Título y Estilos
    doc.setFontSize(20);
    doc.text("Reporte Financiero - Politica Sostenible CRM", 14, 22);
    doc.setFontSize(10);
    doc.setTextColor(100);
    doc.text(`Fecha de generación: ${date}`, 14, 30);
    doc.text(`Balance General: ${formatCOP(balance)}`, 14, 35);

    // Tabla
    autoTable(doc, {
      startY: 45,
      head: [['Concepto', 'Categoría', 'Tipo', 'Fecha', 'Monto']],
      body: displayData.map(t => [
        t.concept, 
        t.category, 
        t.type, 
        t.date, 
        formatCOP(t.amount)
      ]),
      headStyles: { fillColor: [37, 99, 235] }, // Blue-600
      alternateRowStyles: { fillColor: [248, 250, 252] },
    });

    doc.save(`reporte_financiero_${new Date().toISOString().split('T')[0]}.pdf`);
    
    toastSuccess("Reporte PDF generado correctamente");
    setIsDropdownOpen(false);
  };

  return (
    <div className="space-y-8">
      <div className="flex justify-between items-end">
        <div>
          <h1 className="text-3xl font-black text-slate-900 tracking-tighter uppercase">Finanzas de Campaña</h1>
          <p className="text-slate-500 font-medium">Control de ingresos, gastos y presupuesto Cuentas Claras.</p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="bg-[#111827] text-white p-8 rounded-[2.5rem] shadow-xl relative overflow-hidden group">
          <div className="absolute -right-4 -bottom-4 opacity-10 group-hover:scale-110 transition-transform duration-500">
            <Wallet size={120} />
          </div>
          <Wallet className="text-blue-400 mb-4" size={32} />
          <p className="text-[10px] font-black opacity-60 uppercase tracking-[0.2em] mb-1">Presupuesto Disponible</p>
          <h3 className="text-3xl font-black tracking-tighter">{formatCOP(balance)}</h3>
        </div>
        
        <div className="bg-white p-8 rounded-[2.5rem] border border-slate-100 shadow-sm hover:shadow-md transition-all">
          <TrendingUp className="text-emerald-500 mb-4" size={32} />
          <p className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] mb-1">Total Ingresos</p>
          <h3 className="text-3xl font-black text-slate-900 tracking-tighter">{formatCOP(totalIncome)}</h3>
        </div>

        <div className="bg-white p-8 rounded-[2.5rem] border border-slate-100 shadow-sm hover:shadow-md transition-all">
          <TrendingDown className="text-red-500 mb-4" size={32} />
          <p className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] mb-1">Total Gastos</p>
          <h3 className="text-3xl font-black text-slate-900 tracking-tighter">{formatCOP(totalExpenses)}</h3>
        </div>
      </div>

      <div className="bg-white border border-slate-200 rounded-[2.5rem] overflow-hidden shadow-sm">
        <div className="px-8 py-6 border-b border-slate-100 bg-slate-50/50 flex justify-between items-center">
          <h3 className="font-black text-slate-900 flex items-center gap-2">
            <Receipt size={20} className="text-blue-600" /> Movimientos Recientes
          </h3>
          
          <div className="relative" ref={dropdownRef}>
            <button 
              onClick={() => setIsDropdownOpen(!isDropdownOpen)}
              className="text-[10px] font-black text-blue-600 uppercase tracking-widest flex items-center gap-2 hover:bg-blue-50 px-4 py-2 rounded-xl transition-all"
            >
              <Download size={14} /> Descargar Reporte <ChevronDown size={14} className={cn("transition-transform", isDropdownOpen && "rotate-180")} />
            </button>

            {isDropdownOpen && (
              <div className="absolute right-0 mt-2 w-48 bg-white rounded-2xl shadow-2xl border border-slate-100 py-2 z-10 animate-in fade-in zoom-in-95 duration-200">
                <button 
                  onClick={exportToPDF}
                  className="w-full px-4 py-3 text-left text-xs font-bold text-slate-700 hover:bg-slate-50 flex items-center gap-3 transition-colors"
                >
                  <div className="w-8 h-8 rounded-lg bg-red-50 flex items-center justify-center">
                    <FileText size={16} className="text-red-500" />
                  </div>
                  Exportar a PDF
                </button>
                <button 
                  onClick={exportToExcel}
                  className="w-full px-4 py-3 text-left text-xs font-bold text-slate-700 hover:bg-slate-50 flex items-center gap-3 transition-colors"
                >
                  <div className="w-8 h-8 rounded-lg bg-emerald-50 flex items-center justify-center">
                    <FileSpreadsheet size={16} className="text-emerald-500" />
                  </div>
                  Exportar a Excel
                </button>
              </div>
            )}
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead className="bg-slate-50 text-[10px] font-black uppercase text-slate-400 tracking-widest">
              <tr>
                <th className="px-8 py-4">Concepto</th>
                <th className="px-8 py-4">Categoría</th>
                <th className="px-8 py-4">Fecha</th>
                <th className="px-8 py-4 text-right">Monto</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {displayData.map((t) => (
                <tr key={t.id} className="hover:bg-slate-50/50 transition-colors group">
                  <td className="px-8 py-4">
                    <p className="text-sm font-black text-slate-900 mb-1">{t.concept}</p>
                    <span className={cn(
                      "text-[8px] font-black uppercase px-2 py-0.5 rounded-full border",
                      t.type === 'Ingreso' ? 'bg-emerald-50 text-emerald-600 border-emerald-100' : 'bg-red-50 text-red-600 border-red-100'
                    )}>
                      {t.type}
                    </span>
                  </td>
                  <td className="px-8 py-4 text-xs font-bold text-slate-500">{t.category}</td>
                  <td className="px-8 py-4 text-xs text-slate-400 font-medium">{t.date}</td>
                  <td className={cn(
                    "px-8 py-4 text-right font-black text-sm",
                    t.type === 'Ingreso' ? 'text-emerald-600' : 'text-slate-900'
                  )}>
                    {t.type === 'Gasto' ? '-' : '+'}{formatCOP(t.amount)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
