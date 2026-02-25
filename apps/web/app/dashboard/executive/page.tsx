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
  UserPlus,
  Activity,
  Clock,
  DollarSign
} from "lucide-react";
import { useCRM } from "@/context/CRMContext";
import { useToast } from "@/context/ToastContext";
import { cn } from "@/components/ui/utils";
import { Card, CardContent } from "@/components/ui/card";
import { Loader2, FileDown } from "lucide-react";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";

export default function ExecutivePage() {
  const { getExecutiveKPIs, logAction, territory, team, auditLogs } = useCRM();
  const { success, info, error } = useToast();
  const [mounted, setMounted] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);
  
  const kpis = getExecutiveKPIs();
  
  const daysLeft = React.useMemo(() => {
    if (!mounted) return 0;
    const targetDate = new Date(2026, 2, 8); // March 8, 2026
    const now = new Date();
    const diff = targetDate.getTime() - now.getTime();
    const days = Math.ceil(diff / (1000 * 60 * 60 * 24));
    return days > 0 ? days : 0;
  }, [mounted]);
  
  const formatNum = (num: number) => {
    if (!mounted) return num.toString();
    return num.toLocaleString();
  };

  const getTimeAgo = (timestamp: string) => {
    const now = new Date();
    const then = new Date(timestamp);
    const diffInSeconds = Math.floor((now.getTime() - then.getTime()) / 1000);
    
    if (diffInSeconds < 60) return "Hace un momento";
    if (diffInSeconds < 3600) return `Hace ${Math.floor(diffInSeconds / 60)}m`;
    if (diffInSeconds < 86400) return `Hace ${Math.floor(diffInSeconds / 3600)}h`;
    return then.toLocaleDateString();
  };

  const getLogIcon = (module: string) => {
    switch (module) {
      case 'Votantes': return <UserPlus size={16} />;
      case 'Eventos': return <Calendar size={16} />;
      case 'Finanzas': return <DollarSign size={16} />;
      case 'Compliance': return <ShieldCheck size={16} />;
      case 'Estrategia': return <Target size={16} />;
      default: return <Activity size={16} />;
    }
  };

  const getLogColor = (module: string) => {
    switch (module) {
      case 'Votantes': return 'text-teal-600 bg-teal-50 border-teal-100';
      case 'Eventos': return 'text-blue-600 bg-blue-50 border-blue-100';
      case 'Finanzas': return 'text-emerald-600 bg-emerald-50 border-emerald-100';
      case 'Compliance': return 'text-amber-600 bg-amber-50 border-amber-100';
      case 'Estrategia': return 'text-rose-600 bg-rose-50 border-rose-100';
      default: return 'text-slate-600 bg-slate-50 border-slate-100';
    }
  };

  const handleGenerateReport = async () => {
    try {
      setIsGenerating(true);
      info("Generando reporte estratégico detallado...");
      
      // Simular delay para realismo
      await new Promise(resolve => setTimeout(resolve, 1500));
      
      const doc = new jsPDF();
      
      // Título y Estilo
      doc.setFontSize(22);
      doc.setTextColor(13, 148, 136); // Teal 600
      doc.text("REPORTE ESTRATÉGICO DE CAMPAÑA", 20, 20);
      
      doc.setFontSize(10);
      doc.setTextColor(100, 116, 139); // Slate 500
      doc.text(`Fecha de generación: ${new Date().toLocaleString()}`, 20, 30);
      doc.text("Estrategia Victoria Electoral 2026", 20, 35);
      
      // Resumen Ejecutivo
      doc.setFontSize(16);
      doc.setTextColor(15, 23, 42); // Slate 900
      doc.text("1. Resumen Ejecutivo", 20, 50);
      
      const summaryData = [
        ["Métrica", "Valor"],
        ["Censo Electoral CRM", kpis.totalContacts.toString()],
        ["Votos Fidelizados (Firme/Votó)", kpis.firmVotes.toString()],
        ["Meta Global de Campaña", kpis.campaignGoal.toLocaleString()],
        ["Progreso de Meta", `${kpis.progressPercentage.toFixed(2)}%`],
        ["Cobertura de Barrios", kpis.coverageNeighborhoods.toString()]
      ];
      
      autoTable(doc, {
        startY: 55,
        head: [summaryData[0]],
        body: summaryData.slice(1),
        theme: 'grid',
        headStyles: { fillColor: [13, 148, 136] }
      });
      
      // Análisis Territorial
      // @ts-expect-error: jspdf-autotable adds lastAutoTable to the jsPDF instance
      const lastY = doc.lastAutoTable?.finalY || 100;
      doc.text("2. Desglose Territorial (Top Nodos)", 20, lastY + 15);
      
      const zoneData = territory
        .sort((a, b) => b.current - a.current)
        .slice(0, 10)
        .map(z => [z.name, z.leader || "Sin Líder", z.target.toString(), z.current.toString(), `${((z.current / (z.target || 1)) * 100).toFixed(1)}%`]);
      
      autoTable(doc, {
        startY: lastY + 20,
        head: [["Zona/Nodo", "Líder Asignado", "Meta Local", "Actual", "% Avance"]],
        body: zoneData,
        theme: 'striped',
        headStyles: { fillColor: [15, 23, 42] }
      });
      
      // Pie de página
      const pageCount = doc.getNumberOfPages();
      for (let i = 1; i <= pageCount; i++) {
        doc.setPage(i);
        doc.setFontSize(8);
        doc.text("Confidencial - Solo para uso estratégico de campaña", 105, 285, { align: "center" });
      }
      
      doc.save(`Reporte_Ejecutivo_${new Date().toISOString().split('T')[0]}.pdf`);
      
      logAction("Usuario Ejecutivo", "Generación de Reporte PDF: Completo", "Estrategia", "Info");
      success("Reporte generado y descargado correctamente.");
    } catch (err) {
      console.error(err);
      error("Error al generar el reporte PDF.");
    } finally {
      setIsGenerating(false);
    }
  };

  return (
    <div className="max-w-7xl mx-auto space-y-6 md:space-y-10 py-6 animate-in fade-in slide-in-from-bottom-4 duration-1000 px-4 md:px-0">
      {/* Header Section */}
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-6 px-0 md:px-2 pt-4 md:pt-0">
        <div className="space-y-2">
          <div className="flex items-center gap-2 mb-1">
            <span className="px-3 py-1 bg-teal-50 text-teal-600 text-[10px] font-black uppercase tracking-widest rounded-full border border-teal-100">
              Panel Estratégico
            </span>
          </div>
          <h1 className="text-4xl md:text-5xl font-black text-black tracking-tight leading-none">
            Dash<span className="text-teal-600">board</span>
          </h1>
          <p className="text-slate-600 text-sm md:text-base font-medium max-w-md">
            Visión estratégica y analítica en tiempo real para la victoria electoral 2026.
          </p>
        </div>
        
        <div className="flex items-center gap-3 bg-white p-1.5 pr-6 rounded-full border border-slate-200 shadow-sm transition-all hover:shadow-md self-start md:self-auto">
          <div className="h-10 w-10 bg-teal-600 text-white rounded-full flex items-center justify-center shadow-lg shadow-teal-200">
            <Calendar size={18} />
          </div>
          <div>
            <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest leading-none">Cuenta Regresiva</p>
            <p className="text-sm font-black text-black">
              {mounted ? `${daysLeft} Días para la Victoria` : "... Días para la Victoria"}
            </p>
          </div>
        </div>
      </div>

      {/* KPI Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 md:gap-6">
        {/* Total CRM */}
        <div className="group relative overflow-hidden bg-white p-6 md:p-8 rounded-[2rem] md:rounded-[2.5rem] border border-slate-100 shadow-sm transition-all hover:-translate-y-1 hover:shadow-2xl hover:shadow-teal-500/5">
          <div className="h-12 w-12 md:h-14 md:w-14 bg-teal-50 text-teal-600 rounded-xl md:rounded-2xl flex items-center justify-center mb-4 md:mb-6 border border-teal-100 transition-all duration-300 shadow-sm">
            <Users size={24} className="md:w-7 md:h-7" />
          </div>
          <div className="space-y-1">
            <p className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em]">Censo Electoral Total</p>
            <h3 className="text-3xl md:text-4xl font-black text-black tracking-tighter" suppressHydrationWarning>
              {formatNum(kpis.totalContacts)}
            </h3>
            <div className="flex items-center gap-2 pt-2">
              <span className="flex items-center text-[10px] font-bold text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-100">
                <ArrowUpRight size={10} className="mr-0.5" /> +12%
              </span>
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Este mes</p>
            </div>
          </div>
        </div>

        {/* Votos Firmes */}
        <div className="group relative overflow-hidden bg-white p-6 md:p-8 rounded-[2rem] md:rounded-[2.5rem] border border-slate-100 shadow-sm transition-all hover:-translate-y-1 hover:shadow-2xl hover:shadow-emerald-500/5">
          <div className="h-12 w-12 md:h-14 md:w-14 bg-emerald-50 text-emerald-600 rounded-xl md:rounded-2xl flex items-center justify-center mb-4 md:mb-6 border border-emerald-100 transition-all duration-300 shadow-sm">
            <Target size={24} className="md:w-7 md:h-7" />
          </div>
          <div className="space-y-1">
            <p className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em]">Votos Fidelizados</p>
            <h3 className="text-3xl md:text-4xl font-black text-black tracking-tighter" suppressHydrationWarning>
              {formatNum(kpis.firmVotes)}
            </h3>
            <div className="flex items-center gap-2 pt-2">
              <span className="flex items-center text-[10px] font-bold text-teal-600 bg-teal-50 px-2 py-0.5 rounded-full border border-teal-100">
                {(kpis.firmVotes / (kpis.totalContacts || 1) * 100).toFixed(1)}%
              </span>
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Efectividad de Conversión</p>
            </div>
          </div>
        </div>

        {/* Avance de Meta Real */}
        <div className="group relative overflow-hidden bg-white p-6 md:p-8 rounded-[2rem] md:rounded-[2.5rem] border border-slate-100 shadow-sm transition-all hover:-translate-y-1 hover:shadow-2xl hover:shadow-amber-500/5">
          <div className="flex justify-between items-start mb-4 md:mb-6">
            <div className="h-12 w-12 md:h-14 md:w-14 bg-amber-50 text-amber-600 rounded-xl md:rounded-2xl flex items-center justify-center shadow-sm border border-amber-100 transition-all">
              <TrendingUp size={24} className="md:w-7 md:h-7" />
            </div>
            <div className="text-right">
              <span className="text-[10px] font-black bg-slate-900 text-white px-2.5 py-1 rounded-full uppercase tracking-tighter border border-slate-800">
                Meta: {formatNum(kpis.campaignGoal)}
              </span>
            </div>
          </div>
          <div className="space-y-1">
            <p className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em]">Progreso de Objetivo</p>
            <h3 className="text-3xl md:text-4xl font-black tracking-tighter text-black">{kpis.progressPercentage.toFixed(1)}%</h3>
            <div className="mt-4 space-y-2">
              <div className="h-2 w-full bg-slate-100 rounded-full overflow-hidden">
                 <div 
                  className="h-full bg-teal-600 transition-all duration-1000 relative"
                  style={{ width: `${Math.min(kpis.progressPercentage, 100)}%` }}
                 />
              </div>
              <p className="text-[9px] font-black text-slate-400 text-right uppercase tracking-[0.1em]">
                {formatNum(Math.max(0, kpis.campaignGoal - kpis.firmVotes))} votos faltantes
              </p>
            </div>
          </div>
        </div>

        {/* Cobertura Territorial */}
        <div className="group relative overflow-hidden bg-white p-6 md:p-8 rounded-[2rem] md:rounded-[2.5rem] border border-slate-100 shadow-sm transition-all hover:-translate-y-1 hover:shadow-2xl hover:shadow-indigo-500/5">
          <div className="h-12 w-12 md:h-14 md:w-14 bg-indigo-50 text-indigo-600 rounded-xl md:rounded-2xl flex items-center justify-center mb-4 md:mb-6 border border-indigo-100 transition-all duration-300 shadow-sm">
            <MapPin size={24} className="md:w-7 md:h-7" />
          </div>
          <div className="space-y-1">
            <p className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em]">Cobertura Territorial</p>
            <h3 className="text-3xl md:text-4xl font-black text-black tracking-tighter" suppressHydrationWarning>
              {formatNum(kpis.coverageNeighborhoods)}
            </h3>
            <div className="flex items-center gap-2 pt-2">
              <p className="text-[10px] font-bold text-indigo-600 bg-indigo-50 px-2 py-0.5 rounded-full uppercase tracking-widest border border-indigo-100">Nodos Activos</p>
            </div>
          </div>
        </div>
      </div>

      {/* Main Content Area */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Recent Activity Monitor */}
        <Card className="lg:col-span-2 border border-slate-100 shadow-sm rounded-[2rem] md:rounded-[2.5rem] overflow-hidden bg-white">
          <CardContent className="p-0">
            <div className="p-5 md:p-10 border-b border-slate-50 flex items-center justify-between gap-4">
              <div className="flex items-center gap-3 md:gap-4 min-w-0">
                <div className="h-10 w-10 md:h-12 md:w-12 bg-teal-50 text-teal-600 rounded-xl md:rounded-2xl flex items-center justify-center border border-teal-100 shrink-0">
                  <Activity size={20} className="md:w-6 md:h-6" />
                </div>
                <div className="min-w-0">
                  <h3 className="text-base md:text-xl font-black text-black tracking-tight truncate">Bitácora de Operaciones</h3>
                  <p className="text-[8px] md:text-[10px] font-bold text-slate-400 uppercase tracking-[0.2em] truncate">Actividad en Tiempo Real</p>
                </div>
              </div>
              <div className="flex items-center gap-2 px-3 py-1.5 bg-slate-50 rounded-full border border-slate-100">
                <div className="w-1.5 h-1.5 rounded-full bg-teal-500 animate-pulse" />
                <span className="text-[9px] font-black text-slate-500 uppercase tracking-widest">En Vivo</span>
              </div>
            </div>
            
            <div className="p-4 md:p-8">
              <div className="space-y-4">
                {(auditLogs && auditLogs.length > 0) ? (
                  auditLogs.slice(0, 6).map((log) => (
                    <div 
                      key={log.id} 
                      className="flex items-center justify-between p-4 transition-all hover:bg-slate-50/80 rounded-2xl group border border-transparent hover:border-slate-100 gap-4"
                    >
                      <div className="flex items-center gap-4 min-w-0 flex-1">
                        <div className={cn(
                          "h-12 w-12 rounded-2xl flex items-center justify-center border shadow-sm shrink-0 transition-transform group-hover:scale-110",
                          getLogColor(log.module)
                        )}>
                          {getLogIcon(log.module)}
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2 mb-0.5">
                            <span className="text-[8px] font-black uppercase tracking-widest text-slate-400">{log.module}</span>
                            <span className="text-slate-300">•</span>
                            <span className="text-[8px] font-black uppercase tracking-widest text-teal-600">{log.actor}</span>
                          </div>
                          <p className="text-sm font-bold text-slate-900 leading-tight">
                            {log.action}
                          </p>
                        </div>
                      </div>
                      
                      <div className="flex flex-col items-end gap-1 shrink-0">
                        <div className="flex items-center gap-1.5 text-slate-400">
                          <Clock size={10} />
                          <span className="text-[9px] font-black uppercase tracking-tighter">
                            {getTimeAgo(log.timestamp)}
                          </span>
                        </div>
                        {log.severity === 'Warning' && (
                          <span className="text-[7px] font-black bg-amber-50 text-amber-600 px-1.5 py-0.5 rounded border border-amber-100 uppercase">Prioridad</span>
                        )}
                      </div>
                    </div>
                  ))
                ) : (
                  <div className="flex flex-col items-center justify-center py-20 text-slate-200 space-y-4">
                    <Activity size={48} className="opacity-20" />
                    <p className="font-bold uppercase tracking-widest text-[10px]">Esperando actividad del sistema...</p>
                  </div>
                )}
              </div>
              
              {auditLogs.length > 0 && (
                <div className="mt-8 pt-6 border-t border-slate-50">
                  <Link 
                    href="/dashboard/security" 
                    className="flex items-center justify-center gap-2 w-full py-4 bg-slate-50 hover:bg-slate-100 text-slate-600 rounded-2xl text-[10px] font-black uppercase tracking-[0.2em] transition-all"
                  >
                    Ver Historial Completo <ChevronRight size={14} />
                  </Link>
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Secondary Info Column */}
        <div className="space-y-8">
          {/* Strategic Action Card */}
          <div className="bg-white p-6 md:p-10 rounded-[2rem] md:rounded-[2.5rem] border border-slate-100 shadow-sm relative overflow-hidden group">
            <div className="absolute -right-4 -bottom-4 opacity-5 group-hover:scale-110 transition-transform duration-700">
              <Target size={180} className="text-teal-600" />
            </div>
            <div className="relative z-10">
              <div className="h-10 w-10 md:h-12 md:w-12 bg-teal-50 text-teal-600 rounded-xl md:rounded-2xl flex items-center justify-center mb-4 md:mb-6">
                <Target size={20} className="md:w-6 md:h-6" />
              </div>
              <h4 className="text-lg md:text-xl font-black text-slate-900 mb-2 leading-tight">Acción Sugerida</h4>
              <p className="text-slate-500 text-xs md:text-sm mb-6 md:mb-8 font-medium leading-relaxed">
                Detectamos un crecimiento del 15% en la zona norte. Se recomienda reforzar con líderes locales.
              </p>
              <button 
                onClick={handleGenerateReport}
                disabled={isGenerating}
                className={cn(
                  "w-full py-4 rounded-2xl font-black text-[10px] uppercase tracking-widest transition-all shadow-xl flex items-center justify-center gap-2",
                  isGenerating 
                    ? "bg-slate-100 text-slate-400 cursor-not-allowed shadow-none" 
                    : "bg-teal-600 text-white hover:bg-teal-700 shadow-teal-100"
                )}
              >
                {isGenerating ? (
                  <>
                    <Loader2 size={16} className="animate-spin" />
                    Generando...
                  </>
                ) : (
                  <>
                    <FileDown size={16} />
                    Generar Reporte de Zona
                  </>
                )}
              </button>
            </div>
          </div>

          {/* Performance Card */}
          <div className="bg-teal-50 p-6 md:p-8 rounded-[2rem] md:rounded-[2.5rem] border border-teal-100 shadow-sm space-y-6 hover:-translate-y-1 transition-all duration-300 group">
            <h4 className="text-[10px] font-black text-teal-600 uppercase tracking-[0.3em] border-b border-teal-200/50 pb-4">Desempeño Operativo</h4>
            <div className="space-y-5">
              <div className="flex justify-between items-center">
                <span className="text-xs font-bold text-slate-400 uppercase tracking-widest">Nuevos Líderes</span>
                <span className="text-lg font-black text-slate-900">{team.filter(m => m.role.includes('Líder')).length.toString().padStart(2, '0')}</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-xs font-bold text-slate-400 uppercase tracking-widest">Eventos de Campaña</span>
                <span className="text-lg font-black text-slate-900">{kpis.eventsCount || 0}</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-xs font-bold text-slate-400 uppercase tracking-widest">Conversión</span>
                <span className="text-lg font-black text-emerald-600">{(kpis.firmVotes / (kpis.totalContacts || 1) * 100).toFixed(1)}%</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
