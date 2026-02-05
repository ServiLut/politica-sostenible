'use client';

import React, { useEffect, useState } from 'react';
import { DollarSign, Plus, AlertCircle, Eye, FileText, User, ArrowRight, ShieldCheck } from 'lucide-react';
import Link from 'next/link';

export default function FinancePage() {
  const [expenses, setExpenses] = useState<any[]>([]);
  const [stats, setStats] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
        try {
            const [expRes, statRes] = await Promise.all([
                fetch('/api/finance/list'),
                fetch('/api/dashboard/stats')
            ]);
            if (expRes.ok) setExpenses(await expRes.json());
            if (statRes.ok) setStats(await statRes.json());
        } catch(e) { console.error(e); }
        setLoading(false);
    };
    load();
  }, []);

  const budgetParts = typeof stats?.budget === 'string' ? stats.budget.split(' / ') : ['0', '0'];
  const executed = parseFloat(budgetParts[0].replace(/[^0-9.-]+/g, '')) || 0;
  const total = parseFloat(budgetParts[1].replace(/[^0-9.-]+/g, '')) || 1;
  const percentage = total > 0 ? Math.min(100, Math.round((executed / total) * 100)) : 0;
  
  const chartColor = percentage > 80 ? 'text-amber-500' : 'text-brand-green-600';

  return (
    <div className="space-y-8 animate-in fade-in duration-500 pb-12">
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-6">
        <div>
          <h1 className="text-3xl font-black text-brand-black tracking-tight">Finanzas & Transparencia</h1>
          <p className="text-brand-gray-500 font-bold uppercase text-xs tracking-widest mt-1">Control de gastos y reporte CNE</p>
        </div>
        <Link href="/dashboard/finance/new" className="btn-primary-friendly shadow-xl shadow-brand-black/10">
            <Plus className="w-5 h-5" />
            Registrar Gasto
        </Link>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-12 gap-8">
        <div className="md:col-span-4 lg:col-span-3">
            <div className="card-friendly p-8 flex flex-col items-center text-center group">
                <div className="relative w-36 h-36 flex items-center justify-center mb-6">
                    <svg viewBox="0 0 36 36" className="w-full h-full transform -rotate-90">
                        <path className="text-brand-gray-100" d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831" fill="none" stroke="currentColor" strokeWidth="3" />
                        <path className={`${chartColor} transition-all duration-1000 ease-out`} strokeDasharray={`${percentage}, 100`} d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
                    </svg>
                    <div className="absolute flex flex-col items-center">
                        <span className="text-3xl font-black text-brand-black">{percentage}%</span>
                        <span className="text-[10px] font-black text-brand-gray-400 uppercase tracking-tighter">Ejecutado</span>
                    </div>
                </div>
                <h3 className="text-[10px] font-black text-brand-gray-400 uppercase tracking-[0.2em] mb-2">Meta Presupuestal</h3>
                <div className="text-2xl font-black text-brand-black tracking-tight">${executed.toLocaleString()}</div>
                <div className="mt-2 text-xs font-bold text-brand-gray-500 uppercase tracking-widest border-t border-brand-gray-100 pt-2 w-full">Total: ${total.toLocaleString()}</div>
            </div>
        </div>
        
        <div className="md:col-span-8 lg:col-span-9">
            <div className="bg-brand-green-100/30 p-8 rounded-3xl border border-brand-green-100 flex flex-col md:flex-row items-center gap-8 h-full">
                <div className="bg-brand-green-600 p-5 rounded-[2rem] text-white shadow-xl shadow-brand-green-600/20">
                    <ShieldCheck className="w-10 h-10" />
                </div>
                <div className="flex-1 text-center md:text-left">
                    <h4 className="font-black text-brand-green-800 uppercase text-xs tracking-widest mb-2">Cumplimiento Normativo Ley 1475</h4>
                    <p className="text-brand-green-700 text-sm font-medium leading-relaxed">
                        Todo gasto debe estar respaldado por evidencia fotográfica. Los rubros se asignan automáticamente a las categorías oficiales del CNE para facilitar la auditoría final.
                    </p>
                    {percentage > 80 && (
                        <div className="mt-4 flex items-center justify-center md:justify-start gap-2 text-amber-700 font-black uppercase text-[10px] tracking-widest animate-pulse">
                            <AlertCircle className="w-4 h-4" /> Alerta de Techo Presupuestal
                        </div>
                    )}
                </div>
            </div>
        </div>
      </div>

      <div className="card-friendly overflow-hidden">
        <div className="p-6 bg-brand-gray-50 border-b border-brand-gray-100 flex justify-between items-center">
            <h3 className="font-black text-brand-black text-[10px] uppercase tracking-[0.2em]">Historial de Movimientos</h3>
            <span className="bg-white px-3 py-1 rounded-full text-[10px] font-black text-brand-gray-500 border border-brand-gray-100 uppercase tracking-tighter">Últimas 50 transacciones</span>
        </div>
        <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-brand-gray-100">
                <thead className="bg-brand-gray-50">
                    <tr>
                        <th className="px-6 py-4 text-left text-[10px] font-black text-brand-gray-400 uppercase tracking-widest">Concepto / Fecha</th>
                        <th className="px-6 py-4 text-left text-[10px] font-black text-brand-gray-400 uppercase tracking-widest">Rubro CNE</th>
                        <th className="px-6 py-4 text-left text-[10px] font-black text-brand-gray-400 uppercase tracking-widest">Responsable</th>
                        <th className="px-6 py-4 text-right text-[10px] font-black text-brand-gray-400 uppercase tracking-widest">Monto</th>
                        <th className="px-6 py-4 text-center text-[10px] font-black text-brand-gray-400 uppercase tracking-widest">Soporte</th>
                    </tr>
                </thead>
                <tbody className="divide-y divide-brand-gray-50 bg-white">
                    {loading ? (
                        <tr><td colSpan={5} className="p-20 text-center text-brand-gray-400 font-bold uppercase text-xs tracking-widest animate-pulse italic">Auditoría financiera en proceso...</td></tr>
                    ) : expenses.length > 0 ? (
                        expenses.map(e => (
                            <tr key={e.id} className="hover:bg-brand-green-50/20 transition-colors group">
                                <td className="px-6 py-5">
                                    <div className="font-black text-brand-black text-sm uppercase tracking-tight group-hover:text-brand-green-700 transition-colors">{e.uxCategory}</div>
                                    <div className="text-[10px] text-brand-gray-400 font-bold flex items-center gap-1.5 mt-1 uppercase">
                                        <FileText className="w-3 h-3" />
                                        {new Date(e.createdAt).toLocaleDateString()}
                                    </div>
                                </td>
                                <td className="px-6 py-5">
                                    <span className="px-3 py-1 bg-brand-gray-100 text-brand-gray-600 rounded-lg text-[9px] font-black border border-brand-gray-200 uppercase tracking-tighter">
                                        {e.cneCategoryId || 'PENDIENTE'}
                                    </span>
                                </td>
                                <td className="px-6 py-5">
                                    <div className="flex items-center gap-3">
                                        <div className="w-8 h-8 bg-brand-black text-white rounded-xl flex items-center justify-center text-[10px] font-black shadow-lg">
                                            {e.responsibleUser?.fullName?.charAt(0) || '?'}
                                        </div>
                                        <span className="text-xs font-bold text-brand-gray-700">{e.responsibleUser?.fullName}</span>
                                    </div>
                                </td>
                                <td className="px-6 py-5 text-right">
                                    <span className="font-black text-brand-black text-lg tracking-tighter group-hover:text-red-600 transition-colors">-${Number(e.amount).toLocaleString()}</span>
                                </td>
                                <td className="px-6 py-5 text-center">
                                    {e.evidencePhotoUrl ? (
                                        <button 
                                            className="w-10 h-10 bg-brand-green-100 text-brand-green-700 rounded-xl flex items-center justify-center hover:bg-brand-green-200 transition-all shadow-sm group-active:scale-90 mx-auto"
                                            title="Ver Comprobante"
                                            onClick={async () => {
                                                if (e.evidencePhotoUrl.startsWith('http')) {
                                                    window.open(e.evidencePhotoUrl, '_blank');
                                                } else {
                                                    const res = await fetch(`/api/finance/signed-url?path=${e.evidencePhotoUrl}`);
                                                    const data = await res.json();
                                                    if (data.signedUrl) window.open(data.signedUrl, '_blank');
                                                    else alert('Error al obtener firma digital del recibo.');
                                                }
                                            }}
                                        >
                                            <Eye className="w-5 h-5" />
                                        </button>
                                    ) : (
                                        <span className="text-brand-gray-300 font-black text-[9px] uppercase italic">Sin Recibo</span>
                                    )}
                                </td>
                            </tr>
                        ))
                    ) : (
                        <tr><td colSpan={5} className="p-20 text-center text-brand-gray-300 font-bold italic italic">No hay registros financieros en esta campaña.</td></tr>
                    )}
                </tbody>
            </table>
        </div>
      </div>
    </div>
  );
}