"use client";

import React, { useState, useEffect } from "react";
import { 
  Plus, 
  Receipt, 
  AlertCircle,
  BarChart3,
  Calendar,
  Wallet,
  TrendingUp,
  ArrowUpRight,
  ArrowDownRight,
  Inbox
} from "lucide-react";
import { useCampaign, TransactionType } from "@/context/CampaignContext";
import { cn } from "@/components/ui/utils";
import { useToast } from "@/context/ToastContext";

const CNE_CATEGORIES = ["Propaganda Electoral", "Transporte", "Sede", "Actos Públicos", "Logística", "Donaciones"] as const;

export default function FinanzasPage() {
  const { transactions, addTransaction, getBudgetStats } = useCampaign();
  const { success } = useToast();
  const [mounted, setMounted] = useState(false);
  
  const [formData, setFormData] = useState({
    tipo: "Gasto" as TransactionType,
    concept: "",
    amount: "",
    category: "Propaganda Electoral"
  });

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setMounted(true);
  }, []);

  const budget = getBudgetStats();

  const formatCOP = (amount: number) => {
    if (!mounted) return "$ 0";
    return new Intl.NumberFormat('es-CO', {
      style: 'currency',
      currency: 'COP',
      maximumFractionDigits: 0
    }).format(amount);
  };

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    const monto = parseFloat(formData.amount);
    if (!formData.concept || isNaN(monto)) return;

    addTransaction({
      tipo: formData.tipo,
      categoria_cne: formData.category,
      monto: monto,
      concept: formData.concept
    });
    
    success(`Movimiento por ${formatCOP(monto)} registrado`);
    setFormData({ ...formData, concept: "", amount: "" });
  };

  const isCritical = budget.porcentajeEjecucionTope > 90;

  if (!mounted) return null;

  return (
    <div className="space-y-8 animate-in fade-in duration-500">
      <header>
        <h1 className="text-4xl font-black text-[#111827] tracking-tighter">Finanzas & CNE</h1>
        <p className="text-zinc-500 font-medium italic text-sm">Control estricto de topes legales y reporte de gastos.</p>
      </header>

      {/* Resumen y Topes */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        <div className="lg:col-span-2 bg-white rounded-[2.5rem] border border-zinc-100 p-10 space-y-8 shadow-sm">
           <div className="flex items-center justify-between">
              <div className="flex items-center gap-4">
                 <div className="h-12 w-12 bg-blue-50 text-[#0047AB] rounded-2xl flex items-center justify-center shadow-inner">
                    <BarChart3 size={24} />
                 </div>
                 <h3 className="text-xl font-black text-[#111827] tracking-tight">Estado de Tope Legal</h3>
              </div>
              <span className="text-[10px] font-black text-zinc-400 uppercase tracking-widest">Límite: 2.500 Millones</span>
           </div>

           <div className="space-y-4">
              <div className="flex justify-between items-end">
                 <div className="flex flex-col">
                    <span className="text-xs font-black text-zinc-400 uppercase tracking-widest mb-1">Ejecución Presupuestal</span>
                    <span className={cn(
                      "text-4xl font-black tracking-tighter",
                      isCritical ? "text-red-500" : "text-[#111827]"
                    )}>
                      {budget.porcentajeEjecucionTope.toFixed(1)}%
                    </span>
                 </div>
                 <div className="text-right">
                    <p className="text-xs font-bold text-zinc-400 uppercase tracking-tight">Total Gastos</p>
                    <p className="text-lg font-black text-[#111827]">{formatCOP(budget.totalGastos)}</p>
                 </div>
              </div>
              <div className="h-4 w-full bg-zinc-100 rounded-full overflow-hidden p-1 shadow-inner relative">
                 <div 
                    className={cn(
                      "h-full rounded-full transition-all duration-1000 shadow-md",
                      isCritical ? "bg-red-500" : budget.porcentajeEjecucionTope > 70 ? "bg-amber-500" : "bg-emerald-500"
                    )} 
                    style={{ width: `${Math.min(budget.porcentajeEjecucionTope, 100)}%` }}
                 />
              </div>
           </div>
        </div>

        <div className="bg-[#111827] rounded-[2.5rem] p-10 text-white space-y-6 shadow-2xl shadow-zinc-300 relative overflow-hidden group">
           <form onSubmit={handleSave} className="space-y-4 relative z-10">
              <div className="flex gap-2">
                <button 
                  type="button" 
                  onClick={() => setFormData({...formData, tipo: "Gasto"})}
                  className={cn(
                    "flex-1 py-3 rounded-xl text-[10px] font-black uppercase tracking-widest border transition-all",
                    formData.tipo === "Gasto" ? "bg-red-500 text-white border-red-500" : "bg-white/5 text-zinc-500 border-white/10 hover:bg-white/10"
                  )}
                >
                  Gasto
                </button>
                <button 
                  type="button" 
                  onClick={() => setFormData({...formData, tipo: "Ingreso"})}
                  className={cn(
                    "flex-1 py-3 rounded-xl text-[10px] font-black uppercase tracking-widest border transition-all",
                    formData.tipo === "Ingreso" ? "bg-emerald-500 text-white border-emerald-500" : "bg-white/5 text-zinc-500 border-white/10 hover:bg-white/10"
                  )}
                >
                  Ingreso
                </button>
              </div>
              <input 
                type="text" required
                value={formData.concept}
                onChange={e => setFormData({...formData, concept: e.target.value})}
                placeholder="Concepto (ej: Vallas Publicitarias)"
                className="w-full bg-white/5 border border-white/10 rounded-2xl p-4 text-sm font-bold placeholder:text-zinc-500 focus:bg-white/10 transition-all outline-none"
              />
              <input 
                type="number" required
                value={formData.amount}
                onChange={e => setFormData({...formData, amount: e.target.value})}
                placeholder="Monto ($)"
                className="w-full bg-white/5 border border-white/10 rounded-2xl p-4 text-sm font-bold placeholder:text-zinc-500 focus:bg-white/10 transition-all outline-none"
              />
              <select 
                value={formData.category}
                onChange={e => setFormData({...formData, category: e.target.value as any})}
                className="w-full bg-white/5 border border-white/10 rounded-2xl p-4 text-sm font-bold text-zinc-400 focus:bg-white/10 transition-all outline-none appearance-none"
              >
                {CNE_CATEGORIES.map(c => <option key={c} value={c} className="text-black">{c}</option>)}
              </select>
              <button className="w-full bg-amber-400 text-[#111827] py-5 rounded-2xl font-black text-xs uppercase tracking-widest hover:bg-amber-300 transition-all flex items-center justify-center gap-2">
                 <Plus size={18} />
                 Registrar Movimiento
              </button>
           </form>
        </div>
      </div>

      {transactions.length === 0 ? (
        <div className="bg-white rounded-[3rem] border-2 border-dashed border-zinc-100 p-20 text-center space-y-6">
           <Inbox className="h-12 w-12 text-zinc-200 mx-auto" />
           <p className="text-xs font-black text-zinc-400 uppercase tracking-widest">Sin transacciones registradas</p>
        </div>
      ) : (
        <div className="bg-white rounded-[2.5rem] border border-zinc-100 shadow-sm overflow-hidden">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-zinc-50">
                <th className="px-10 py-5 text-[10px] font-black text-zinc-300 uppercase tracking-widest">Concepto / Categoría</th>
                <th className="px-10 py-5 text-[10px] font-black text-zinc-300 uppercase tracking-widest">Fecha</th>
                <th className="px-10 py-5 text-[10px] font-black text-zinc-300 uppercase tracking-widest">Tipo</th>
                <th className="px-10 py-5 text-right text-[10px] font-black text-zinc-300 uppercase tracking-widest">Monto</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-50">
              {transactions.map((t) => (
                <tr key={t.id} className="group hover:bg-zinc-50 transition-all">
                  <td className="px-10 py-6">
                    <div className="flex flex-col">
                      <span className="text-sm font-black text-[#111827]">{t.concept || t.categoria_cne}</span>
                      <span className="text-[10px] font-bold text-zinc-400 uppercase tracking-tighter">{t.categoria_cne}</span>
                    </div>
                  </td>
                  <td className="px-10 py-6">
                    <div className="flex items-center gap-2 text-zinc-400">
                       <Calendar size={14} />
                       <span className="text-[10px] font-bold">{t.fecha}</span>
                    </div>
                  </td>
                  <td className="px-10 py-6">
                    <div className={cn(
                      "flex items-center gap-1.5 px-3 py-1 rounded-full text-[8px] font-black uppercase tracking-widest border w-fit",
                      t.tipo === "Ingreso" ? "bg-emerald-50 text-emerald-600 border-emerald-100" : "bg-red-50 text-red-600 border-red-100"
                    )}>
                      {t.tipo}
                    </div>
                  </td>
                  <td className="px-10 py-6 text-right">
                    <span className={cn(
                      "text-sm font-black",
                      t.tipo === "Ingreso" ? "text-emerald-500" : "text-red-500"
                    )}>
                      {t.tipo === "Ingreso" ? "+" : "-"}{formatCOP(t.monto)}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
