"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import { 
  Users, 
  Target, 
  Calendar,
  ShieldCheck,
  MapPin,
  TrendingUp,
  ChevronRight,
  ArrowUpRight,
  UserPlus
} from "lucide-react";
import { useCRM } from "@/context/CRMContext";
import { cn } from "@/components/ui/utils";
import { Card, CardContent } from "@/components/ui/card";

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
    <div className="max-w-7xl mx-auto space-y-10 py-6 animate-in fade-in slide-in-from-bottom-4 duration-1000">
      {/* Header Section */}
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-6 px-2">
        <div className="space-y-2">
          <div className="flex items-center gap-2 mb-1">
            <span className="px-3 py-1 bg-[#0047AB]/10 text-[#0047AB] text-[10px] font-black uppercase tracking-widest rounded-full">
              Panel Ejecutivo
            </span>
          </div>
          <h1 className="text-5xl font-black text-zinc-900 tracking-tight leading-none">
            Centro de <span className="text-[#0047AB]">Mando</span>
          </h1>
          <p className="text-zinc-500 font-medium max-w-md">
            Visión estratégica y analítica en tiempo real para la victoria electoral 2026.
          </p>
        </div>
        
        <div className="flex items-center gap-3 bg-white/50 backdrop-blur-sm p-1.5 pr-6 rounded-full border border-zinc-200 shadow-sm transition-all hover:shadow-md">
          <div className="h-10 w-10 bg-[#0047AB] text-white rounded-full flex items-center justify-center shadow-lg">
            <Calendar size={18} />
          </div>
          <div>
            <p className="text-[10px] font-black text-zinc-400 uppercase tracking-widest leading-none">Cuenta Regresiva</p>
            <p className="text-sm font-black text-zinc-900">45 Días para la Victoria</p>
          </div>
        </div>
      </div>

      {/* KPI Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        {/* Total CRM */}
        <div className="group relative overflow-hidden bg-white p-8 rounded-[2.5rem] border border-zinc-100 shadow-sm transition-all hover:-translate-y-1 hover:shadow-2xl hover:shadow-blue-500/10 active:scale-[0.98]">
          <div className="absolute top-0 right-0 p-6 opacity-5 group-hover:opacity-10 transition-opacity">
            <Users size={80} />
          </div>
          <div className="h-14 w-14 bg-blue-50 text-[#0047AB] rounded-2xl flex items-center justify-center mb-6 group-hover:bg-[#0047AB] group-hover:text-white transition-all duration-300 shadow-sm">
            <Users size={28} />
          </div>
          <div className="space-y-1">
            <p className="text-[10px] font-black text-zinc-400 uppercase tracking-[0.2em]">Base de Datos Total</p>
            <h3 className="text-4xl font-black text-zinc-900 tracking-tighter" suppressHydrationWarning>
              {formatNum(kpis.totalContacts)}
            </h3>
            <div className="flex items-center gap-2 pt-2">
              <span className="flex items-center text-[10px] font-bold text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-full">
                <ArrowUpRight size={10} className="mr-0.5" /> +12%
              </span>
              <p className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest">Este mes</p>
            </div>
          </div>
        </div>

        {/* Simpatizantes Firmes */}
        <div className="group relative overflow-hidden bg-white p-8 rounded-[2.5rem] border border-zinc-100 shadow-sm transition-all hover:-translate-y-1 hover:shadow-2xl hover:shadow-emerald-500/10 active:scale-[0.98]">
          <div className="absolute top-0 right-0 p-6 opacity-5 group-hover:opacity-10 transition-opacity">
            <Target size={80} />
          </div>
          <div className="h-14 w-14 bg-emerald-50 text-emerald-600 rounded-2xl flex items-center justify-center mb-6 group-hover:bg-emerald-600 group-hover:text-white transition-all duration-300 shadow-sm">
            <Target size={28} />
          </div>
          <div className="space-y-1">
            <p className="text-[10px] font-black text-zinc-400 uppercase tracking-[0.2em]">Votos Firmes</p>
            <h3 className="text-4xl font-black text-zinc-900 tracking-tighter" suppressHydrationWarning>
              {formatNum(kpis.firmVotes)}
            </h3>
            <div className="flex items-center gap-2 pt-2">
              <span className="flex items-center text-[10px] font-bold text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-full">
                {(kpis.firmVotes / (kpis.totalContacts || 1) * 100).toFixed(1)}%
              </span>
              <p className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest">Efectividad CRM</p>
            </div>
          </div>
        </div>

        {/* Avance de Meta Real */}
        <div className="group relative overflow-hidden bg-[#111827] text-white p-8 rounded-[2.5rem] shadow-xl transition-all hover:-translate-y-1 hover:shadow-2xl hover:shadow-[#111827]/30 active:scale-[0.98]">
          <div className="flex justify-between items-start mb-6">
            <div className="h-14 w-14 bg-white/10 text-amber-400 rounded-2xl flex items-center justify-center shadow-inner group-hover:scale-110 transition-transform">
              <TrendingUp size={28} />
            </div>
            <div className="text-right">
              <span className="text-[10px] font-black bg-white/20 px-2.5 py-1 rounded-full uppercase tracking-tighter">
                Meta: 50K
              </span>
            </div>
          </div>
          <div className="space-y-1">
            <p className="text-[10px] font-black text-zinc-400 uppercase tracking-[0.2em]">Progreso Objetivo</p>
            <h3 className="text-4xl font-black tracking-tighter text-white">{kpis.progressPercentage.toFixed(1)}%</h3>
            <div className="mt-4 space-y-2">
              <div className="h-2.5 w-full bg-white/10 rounded-full overflow-hidden">
                 <div 
                  className="h-full bg-gradient-to-r from-amber-500 to-amber-300 transition-all duration-1000 relative overflow-hidden"
                  style={{ width: `${Math.min(kpis.progressPercentage, 100)}%` }}
                 >
                   <div className="absolute inset-0 bg-white/20 animate-pulse" />
                 </div>
              </div>
              <p className="text-[9px] font-medium text-zinc-400 text-right uppercase tracking-[0.1em]">
                {formatNum(50000 - kpis.firmVotes)} votos restantes
              </p>
            </div>
          </div>
        </div>

        {/* Cobertura Territorial */}
        <div className="group relative overflow-hidden bg-white p-8 rounded-[2.5rem] border border-zinc-100 shadow-sm transition-all hover:-translate-y-1 hover:shadow-2xl hover:shadow-indigo-500/10 active:scale-[0.98]">
          <div className="absolute top-0 right-0 p-6 opacity-5 group-hover:opacity-10 transition-opacity">
            <MapPin size={80} />
          </div>
          <div className="h-14 w-14 bg-indigo-50 text-indigo-600 rounded-2xl flex items-center justify-center mb-6 group-hover:bg-indigo-600 group-hover:text-white transition-all duration-300 shadow-sm">
            <MapPin size={28} />
          </div>
          <div className="space-y-1">
            <p className="text-[10px] font-black text-zinc-400 uppercase tracking-[0.2em]">Cobertura Barrios</p>
            <h3 className="text-4xl font-black text-zinc-900 tracking-tighter" suppressHydrationWarning>
              {formatNum(kpis.coverageNeighborhoods)}
            </h3>
            <div className="flex items-center gap-2 pt-2">
              <p className="text-[10px] font-bold text-indigo-600 bg-indigo-50 px-2 py-0.5 rounded-full uppercase tracking-widest">Presencia Activa</p>
            </div>
          </div>
        </div>
      </div>

      {/* Main Content Area */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Recent Activity Monitor */}
        <Card className="lg:col-span-2 border-none shadow-xl shadow-zinc-200/50 rounded-[2.5rem] overflow-hidden bg-white">
          <CardContent className="p-0">
            <div className="p-10 border-b border-zinc-50 flex items-center justify-between bg-gradient-to-r from-zinc-50/50 to-transparent">
              <div className="flex items-center gap-4">
                <div className="h-12 w-12 bg-[#0047AB]/10 text-[#0047AB] rounded-2xl flex items-center justify-center">
                  <ShieldCheck size={24} />
                </div>
                <div>
                  <h3 className="text-xl font-black text-zinc-900 tracking-tight">Actividad Reciente</h3>
                  <p className="text-[10px] font-bold text-zinc-400 uppercase tracking-[0.2em]">Monitor de Ingresos CRM</p>
                </div>
              </div>
              <Link 
                href="/dashboard/directory"
                className="group flex items-center gap-2 px-4 py-2 bg-zinc-900 text-white rounded-2xl text-[10px] font-black uppercase tracking-widest transition-all hover:bg-[#0047AB] hover:shadow-lg hover:shadow-blue-500/20"
              >
                Ver Directorio <ChevronRight size={14} className="group-hover:translate-x-1 transition-transform" />
              </Link>
            </div>
            
            <div className="p-4 sm:p-8">
              <div className="divide-y divide-zinc-50">
                {contacts.slice(0, 6).map((c, idx) => (
                  <div 
                    key={c.id} 
                    className={cn(
                      "flex flex-col sm:flex-row items-start sm:items-center justify-between p-5 transition-all hover:bg-zinc-50/80 rounded-2xl group border border-transparent hover:border-zinc-100",
                      idx === 0 && "bg-blue-50/30 border-blue-50/50"
                    )}
                  >
                    <div className="flex items-center gap-5">
                      <div className={cn(
                        "h-12 w-12 rounded-2xl flex items-center justify-center font-black text-base shadow-sm group-hover:scale-110 transition-all",
                        idx % 3 === 0 ? "bg-[#0047AB] text-white" : 
                        idx % 3 === 1 ? "bg-zinc-900 text-white" : 
                        "bg-zinc-200 text-zinc-600"
                      )}>
                        {c.name.charAt(0)}
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <p className="text-base font-black text-zinc-900">{c.name}</p>
                          {idx === 0 && (
                            <span className="text-[8px] font-black bg-blue-600 text-white px-1.5 py-0.5 rounded uppercase tracking-tighter">Nuevo</span>
                          )}
                        </div>
                        <div className="flex items-center gap-1.5 text-zinc-400 mt-0.5">
                          <MapPin size={10} className="text-[#0047AB]" />
                          <p className="text-[10px] font-bold uppercase tracking-widest">{c.neighborhood}</p>
                        </div>
                      </div>
                    </div>
                    
                    <div className="mt-4 sm:mt-0 flex items-center gap-3 w-full sm:w-auto justify-between sm:justify-end">
                      <div className={cn(
                        "px-4 py-1.5 rounded-xl text-[9px] font-black uppercase tracking-widest border shadow-sm",
                        c.stage === 'Firme' || c.stage === 'Votó' ? "bg-emerald-50 text-emerald-700 border-emerald-100" : 
                        c.stage === 'Contactado' || c.stage === 'Simpatizante' ? "bg-blue-50 text-blue-700 border-blue-100" :
                        "bg-amber-50 text-amber-700 border-amber-100"
                      )}>
                        {c.stage}
                      </div>
                      <button className="p-2 text-zinc-300 hover:text-zinc-900 hover:bg-zinc-100 rounded-xl transition-colors">
                        <ChevronRight size={18} />
                      </button>
                    </div>
                  </div>
                ))}
                
                {contacts.length === 0 && (
                  <div className="flex flex-col items-center justify-center py-20 text-zinc-300 space-y-4">
                    <UserPlus size={48} className="opacity-20" />
                    <p className="font-bold uppercase tracking-widest text-[10px]">No hay contactos registrados aún</p>
                  </div>
                )}
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Secondary Info Column */}
        <div className="space-y-8">
          {/* Quick Action Card */}
          <div className="bg-gradient-to-br from-[#0047AB] to-[#003380] p-8 rounded-[2.5rem] text-white shadow-xl shadow-blue-900/20 relative overflow-hidden group">
            <div className="absolute -right-4 -bottom-4 opacity-10 group-hover:scale-110 transition-transform duration-700">
              <Target size={180} />
            </div>
            <div className="relative z-10">
              <h4 className="text-xl font-black mb-2 leading-tight">Acción Estratégica Sugerida</h4>
              <p className="text-white/70 text-sm mb-6 font-medium">
                Detectamos un crecimiento del 15% en la Comuna 14. Se recomienda reforzar con líderes locales.
              </p>
              <button className="w-full bg-white text-[#0047AB] py-4 rounded-2xl font-black text-xs uppercase tracking-widest hover:bg-amber-400 hover:text-zinc-900 transition-all shadow-lg">
                Generar Reporte de Zona
              </button>
            </div>
          </div>

          {/* Mini Stats Card */}
          <div className="bg-white p-8 rounded-[2.5rem] border border-zinc-100 shadow-sm space-y-6">
            <h4 className="text-xs font-black text-zinc-900 uppercase tracking-[0.2em] border-b border-zinc-50 pb-4">Desempeño Diario</h4>
            <div className="space-y-4">
              <div className="flex justify-between items-center">
                <span className="text-sm font-medium text-zinc-500">Nuevos Líderes</span>
                <span className="text-sm font-black text-zinc-900">12</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-sm font-medium text-zinc-500">Eventos Programados</span>
                <span className="text-sm font-black text-zinc-900">4</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-sm font-medium text-zinc-500">Tasa de Conversión</span>
                <span className="text-sm font-black text-emerald-600">8.4%</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

