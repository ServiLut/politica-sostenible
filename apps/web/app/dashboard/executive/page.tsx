"use client";

import React, { useState, useEffect } from "react";
import { 
  Users, 
  Target, 
  Calendar,
  ShieldCheck,
  MapPin,
  TrendingUp,
  ChevronRight
} from "lucide-react";
import { useCRM } from "@/context/CRMContext";
import { cn } from "@/components/ui/utils";

export default function ExecutivePage() {
  const { getExecutiveKPIs, contacts } = useCRM();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setMounted(true);
  }, []);
  
  const kpis = getExecutiveKPIs();
  
  const formatNum = (num: number) => {
    if (!mounted) return num.toString();
    return num.toLocaleString();
  };

  return (
    <div className="space-y-8 animate-in fade-in duration-700">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
        <div>
          <h1 className="text-4xl font-black text-[#111827] tracking-tighter">Centro de Mando</h1>
          <p className="text-zinc-500 font-medium italic">Inteligencia Electoral Colombia 2026.</p>
        </div>
        
        <div className="bg-white px-6 py-4 rounded-3xl border border-zinc-100 shadow-sm flex items-center gap-4">
          <Calendar className="text-[#0047AB]" size={20} />
          <div>
            <p className="text-[10px] font-black text-zinc-400 uppercase tracking-widest">Días para la Victoria</p>
            <p className="text-sm font-black text-[#111827]">45 Días</p>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        {/* Total CRM */}
        <div className="bg-white p-8 rounded-[2.5rem] border border-zinc-100 shadow-sm hover:shadow-xl transition-all group">
          <div className="h-14 w-14 bg-blue-50 text-blue-600 rounded-2xl flex items-center justify-center mb-6 group-hover:bg-[#0047AB] group-hover:text-white transition-colors shadow-inner">
            <Users size={28} />
          </div>
          <p className="text-[10px] font-black text-zinc-400 uppercase tracking-[0.2em] mb-1">Base de Datos Total</p>
          <h3 className="text-4xl font-black text-[#111827] tracking-tighter" suppressHydrationWarning>
            {formatNum(kpis.totalContacts)}
          </h3>
          <p className="text-xs font-bold text-zinc-400 mt-2">Ciudadanos registrados</p>
        </div>

        {/* Simpatizantes Firmes */}
        <div className="bg-white p-8 rounded-[2.5rem] border border-zinc-100 shadow-sm hover:shadow-xl transition-all group">
          <div className="h-14 w-14 bg-emerald-50 text-emerald-600 rounded-2xl flex items-center justify-center mb-6 shadow-inner">
            <Target size={28} />
          </div>
          <p className="text-[10px] font-black text-zinc-400 uppercase tracking-[0.2em] mb-1">Simpatizantes Firmes</p>
          <h3 className="text-4xl font-black text-[#111827] tracking-tighter" suppressHydrationWarning>
            {formatNum(kpis.firmVotes)}
          </h3>
          <p className="text-xs font-bold text-emerald-600 mt-2 flex items-center gap-1">
            <TrendingUp size={12} /> {(kpis.firmVotes / (kpis.totalContacts || 1) * 100).toFixed(1)}% del CRM
          </p>
        </div>

        {/* Avance de Meta Real */}
        <div className="bg-[#111827] text-white p-8 rounded-[2.5rem] shadow-2xl transition-all group">
          <div className="flex justify-between items-start mb-6">
            <div className="h-14 w-14 bg-white/10 rounded-2xl flex items-center justify-center shadow-inner">
              <TrendingUp size={28} className="text-amber-400" />
            </div>
            <span className="text-[10px] font-black bg-white/20 px-2 py-1 rounded">META: 50.000</span>
          </div>
          <p className="text-[10px] font-black opacity-60 uppercase tracking-[0.2em] mb-1">Avance hacia Objetivo</p>
          <h3 className="text-4xl font-black tracking-tighter">{kpis.progressPercentage.toFixed(2)}%</h3>
          <div className="mt-4 h-2 w-full bg-white/10 rounded-full overflow-hidden">
             <div 
              className="h-full bg-amber-400 transition-all duration-1000"
              style={{ width: `${Math.min(kpis.progressPercentage, 100)}%` }}
             />
          </div>
        </div>

        {/* Cobertura Territorial */}
        <div className="bg-white p-8 rounded-[2.5rem] border border-zinc-100 shadow-sm hover:shadow-xl transition-all group">
          <div className="h-14 w-14 bg-indigo-50 text-indigo-600 rounded-2xl flex items-center justify-center mb-6 shadow-inner">
            <MapPin size={28} />
          </div>
          <p className="text-[10px] font-black text-zinc-400 uppercase tracking-[0.2em] mb-1">Cobertura Territorial</p>
          <h3 className="text-4xl font-black text-[#111827] tracking-tighter" suppressHydrationWarning>
            {formatNum(kpis.coverageNeighborhoods)}
          </h3>
          <p className="text-xs font-bold text-zinc-400 mt-2">Barrios con presencia</p>
        </div>
      </div>

      {/* Monitor de Actividad Reciente */}
      <div className="bg-white rounded-[2.5rem] border border-zinc-100 p-10">
          <div className="flex items-center justify-between mb-8">
            <h3 className="text-xl font-black text-[#111827] tracking-tight flex items-center gap-3">
              <ShieldCheck className="text-[#0047AB]" />
              Últimos Ingresos al CRM
            </h3>
            <button className="text-[10px] font-black text-[#0047AB] uppercase tracking-widest hover:underline flex items-center gap-1">
              Ver Todo el Directorio <ChevronRight size={14} />
            </button>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {contacts.slice(0, 6).map((c) => (
              <div key={c.id} className="flex items-center justify-between p-4 bg-zinc-50 rounded-2xl border border-transparent hover:border-zinc-200 transition-all">
                <div className="flex items-center gap-4">
                  <div className="h-10 w-10 bg-[#111827] text-white rounded-xl flex items-center justify-center font-black text-xs shadow-md">
                    {c.name.charAt(0)}
                  </div>
                  <div>
                    <p className="text-sm font-black text-[#111827]">{c.name}</p>
                    <p className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest leading-none mt-1">{c.neighborhood}</p>
                  </div>
                </div>
                <div className={cn(
                  "px-3 py-1 rounded-full text-[8px] font-black uppercase tracking-widest border",
                  c.stage === 'Firme' || c.stage === 'Votó' ? "bg-emerald-50 text-emerald-600 border-emerald-100" : 
                  c.stage === 'Contactado' || c.stage === 'Simpatizante' ? "bg-blue-50 text-blue-600 border-blue-100" :
                  "bg-amber-50 text-amber-600 border-amber-100"
                )}>
                  {c.stage}
                </div>
              </div>
            ))}
            {contacts.length === 0 && <p className="col-span-2 text-center text-zinc-400 py-4">No hay contactos registrados aún.</p>}
          </div>
        </div>
    </div>
  );
}
