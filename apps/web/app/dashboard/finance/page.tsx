"use client";

import React, { useState, useRef, useEffect, useMemo } from 'react';
import { useCRM, FinanceTransaction, CneCode, Contact } from '@/context/CRMContext';
import { useToast } from '@/context/ToastContext';
import { 
  Wallet, 
  TrendingUp, 
  TrendingDown, 
  Receipt, 
  FileText, 
  ChevronDown,
  Download,
  AlertCircle,
  ShieldCheck,
  Ban,
  FileCheck,
  Plus,
  Trash2,
  ExternalLink,
  Info,
  Search,
  UserCheck,
  Calendar
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
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { cn } from '@/components/ui/utils';

export default function FinancePage() {
  const { 
    finance, 
    addFinanceTransaction, 
    updateFinanceTransaction, 
    deleteFinanceTransaction, 
    logAction, 
    contacts, 
    getProjectedCompliance,
    TOPE_LEGAL_CNE
  } = useCRM();
  const { success: toastSuccess, error: toastError } = useToast();
  
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

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

  const [donorSearch, setDonorSearch] = useState('');
  const [showDonorResults, setShowDonorResults] = useState(false);
  
  const filteredDonors = useMemo(() => {
    if (!donorSearch) return [];
    return contacts.filter(c => 
      c.name.toLowerCase().includes(donorSearch.toLowerCase()) || 
      c.cedula.includes(donorSearch)
    ).slice(0, 5);
  }, [contacts, donorSearch]);

  const selectDonor = (donor: Contact) => {
    setFormData({
      ...formData,
      vendorTaxId: donor.cedula,
      concept: `Donación - ${donor.name}`,
      providerId: donor.id
    });
    setDonorSearch(donor.name);
    setShowDonorResults(false);
  };

  const complianceData = useMemo(() => {
    const projected = getProjectedCompliance();
    const expensesByCne = finance
      .filter(f => f.type === 'Gasto')
      .reduce((acc: Record<string, number>, curr) => {
        const code = curr.cneCode || 'OTROS';
        acc[code] = (acc[code] || 0) + curr.amount;
        return acc;
      }, {});

    const pieData = Object.entries(expensesByCne).map(([name, value]) => ({ name, value }));
    const weeks: Record<string, { name: string, ingresos: number, gastos: number }> = {};
    
    finance.forEach(t => {
      const date = new Date(t.date);
      const weekKey = `${date.getFullYear()}-W${Math.ceil(date.getDate() / 7)}`;
      if (!weeks[weekKey]) weeks[weekKey] = { name: `Sem ${Math.ceil(date.getDate() / 7)}`, ingresos: 0, gastos: 0 };
      if (t.type === 'Ingreso') weeks[weekKey].ingresos += t.amount;
      else weeks[weekKey].gastos += t.amount;
    });

    return {
      totalIncome: finance.filter(f => f.type === 'Ingreso').reduce((a, b) => a + b.amount, 0),
      totalExpenses: finance.filter(f => f.type === 'Gasto').reduce((a, b) => a + b.amount, 0),
      approvedExpenses: projected.actualExpenses,
      balance: finance.filter(f => f.type === 'Ingreso').reduce((a, b) => a + b.amount, 0) - finance.filter(f => f.type === 'Gasto').reduce((a, b) => a + b.amount, 0),
      executionPercentage: projected.executionPercentage,
      projectedEventsCost: projected.projectedEventsCost,
      pieData,
      weeklyData: Object.values(weeks).sort((a, b) => a.name.localeCompare(b.name))
    };
  }, [finance, getProjectedCompliance]);

  const { totalIncome, totalExpenses, approvedExpenses, balance, executionPercentage, pieData, weeklyData, projectedEventsCost } = complianceData;

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

  const COLORS = ['#0d9488', '#10b981', '#f59e0b', '#f43f5e', '#8b5cf6'];

  return (
    <div className="space-y-8 pb-20 animate-in fade-in duration-700">
      <div className="flex justify-between items-end">
        <div>
          <h1 className="text-4xl font-black text-slate-900 tracking-tighter uppercase">Gestión Financiera</h1>
          <p className="text-slate-500 font-medium">Control de ingresos, gastos y cumplimiento Cuentas Claras.</p>
        </div>
        <button onClick={() => setIsModalOpen(true)} className="bg-teal-600 text-white px-8 py-4 rounded-2xl font-black text-[10px] uppercase tracking-widest shadow-xl shadow-teal-100 hover:bg-teal-700 transition-all flex items-center gap-2">
          <Plus size={20} /> Nuevo Movimiento
        </button>
      </div>

      <div className={cn("p-8 rounded-[2.5rem] border flex items-center gap-8 shadow-sm transition-all", alertStatus.bg, alertStatus.border, alertStatus.color)}>
        <div className="w-16 h-16 rounded-2xl bg-white flex items-center justify-center shadow-sm text-2xl">{alertStatus.icon}</div>
        <div className="flex-1">
          <p className="text-[10px] font-black uppercase tracking-widest opacity-60">Monitor Legal CNE</p>
          <h3 className="text-xl font-black tracking-tight">{alertStatus.msg}</h3>
        </div>
        <div className="text-right">
          <p className="text-[10px] font-black uppercase tracking-widest opacity-60">Ejecución</p>
          <h3 className="text-4xl font-black">{executionPercentage.toFixed(1)}%</h3>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        <div className="bg-white p-10 rounded-[2.5rem] border border-slate-100 shadow-sm relative overflow-hidden group">
          <div className="absolute -right-4 -bottom-4 opacity-5 group-hover:scale-110 transition-transform duration-700"><Wallet size={120} className="text-teal-600" /></div>
          <Wallet className="text-teal-600 mb-4" size={32} />
          <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Caja Disponible</p>
          <h3 className="text-3xl font-black text-slate-900 tracking-tighter">{formatCOP(balance)}</h3>
        </div>
        <div className="bg-white p-10 rounded-[2.5rem] border border-slate-100 shadow-sm">
          <TrendingUp className="text-emerald-500 mb-4" size={32} />
          <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Ingresos Registrados</p>
          <h3 className="text-3xl font-black text-slate-900 tracking-tighter">{formatCOP(totalIncome)}</h3>
        </div>
        <div className="bg-white p-10 rounded-[2.5rem] border border-slate-100 shadow-sm">
          <TrendingDown className="text-rose-500 mb-4" size={32} />
          <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Egresos Reportables</p>
          <h3 className="text-3xl font-black text-slate-900 tracking-tighter">{formatCOP(totalExpenses)}</h3>
        </div>
      </div>

      <div className="bg-white border border-slate-200 rounded-[3rem] overflow-hidden shadow-sm">
        <div className="px-10 py-8 border-b border-slate-100 bg-slate-50/50 flex justify-between items-center">
          <h3 className="font-black text-slate-900 flex items-center gap-2 uppercase text-sm tracking-tighter">
            <Receipt size={20} className="text-teal-600" /> Libro de Movimientos Legales
          </h3>
          <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">{finance.length} Registros</span>
        </div>
        <div className="overflow-x-auto">
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
      </div>
    </div>
  );
}
