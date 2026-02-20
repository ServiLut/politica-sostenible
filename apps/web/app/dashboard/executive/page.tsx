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
import { useToast } from "@/context/ToastContext";
import { cn } from "@/components/ui/utils";
import { Card, CardContent } from "@/components/ui/card";
import { Loader2, FileDown } from "lucide-react";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";

export default function ExecutivePage() {
  const { getExecutiveKPIs, contacts, logAction, territory } = useCRM();
  const { success, info, error } = useToast();
  const [mounted, setMounted] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);
  
  const kpis = getExecutiveKPIs();
  
  const formatNum = (num: number) => {
    if (!mounted) return num.toString();
    return num.toLocaleString();
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
    <div className="max-w-7xl mx-auto space-y-10 py-6 animate-in fade-in slide-in-from-bottom-4 duration-1000">
      {/* Header Section */}
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-6 px-2">
        <div className="space-y-2">
          <div className="flex items-center gap-2 mb-1">
            <span className="px-3 py-1 bg-teal-50 text-teal-600 text-[10px] font-black uppercase tracking-widest rounded-full border border-teal-100">
              Panel Estratégico
            </span>
          </div>
          <h1 className="text-5xl font-black text-slate-900 tracking-tight leading-none">
            Centro de <span className="text-teal-600">Mando</span>
          </h1>
          <p className="text-slate-500 font-medium max-w-md">
            Visión estratégica y analítica en tiempo real para la victoria electoral 2026.
          </p>
        </div>
        
        <div className="flex items-center gap-3 bg-white p-1.5 pr-6 rounded-full border border-slate-200 shadow-sm transition-all hover:shadow-md">
          <div className="h-10 w-10 bg-teal-600 text-white rounded-full flex items-center justify-center shadow-lg shadow-teal-200">
            <Calendar size={18} />
          </div>
          <div>
            <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest leading-none">Cuenta Regresiva</p>
            <p className="text-sm font-black text-slate-900">45 Días para la Victoria</p>
          </div>
        </div>
      </div>

      {/* KPI Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        {/* Total CRM */}
        <div className="group relative overflow-hidden bg-white p-8 rounded-[2.5rem] border border-slate-100 shadow-sm transition-all hover:-translate-y-1 hover:shadow-2xl hover:shadow-teal-500/5">
          <div className="h-14 w-14 bg-teal-50 text-teal-600 rounded-2xl flex items-center justify-center mb-6 group-hover:bg-teal-600 group-hover:text-white transition-all duration-300 shadow-sm">
            <Users size={28} />
          </div>
          <div className="space-y-1">
            <p className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em]">Censo Electoral Total</p>
            <h3 className="text-4xl font-black text-slate-900 tracking-tighter" suppressHydrationWarning>
              {formatNum(kpis.totalContacts)}
            </h3>
            <div className="flex items-center gap-2 pt-2">
              <span className="flex items-center text-[10px] font-bold text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-full">
                <ArrowUpRight size={10} className="mr-0.5" /> +12%
              </span>
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Este mes</p>
            </div>
          </div>
        </div>

        {/* Votos Firmes */}
        <div className="group relative overflow-hidden bg-white p-8 rounded-[2.5rem] border border-slate-100 shadow-sm transition-all hover:-translate-y-1 hover:shadow-2xl hover:shadow-emerald-500/5">
          <div className="h-14 w-14 bg-emerald-50 text-emerald-600 rounded-2xl flex items-center justify-center mb-6 group-hover:bg-emerald-600 group-hover:text-white transition-all duration-300 shadow-sm">
            <Target size={28} />
          </div>
          <div className="space-y-1">
            <p className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em]">Votos Fidelizados</p>
            <h3 className="text-4xl font-black text-slate-900 tracking-tighter" suppressHydrationWarning>
              {formatNum(kpis.firmVotes)}
            </h3>
            <div className="flex items-center gap-2 pt-2">
              <span className="flex items-center text-[10px] font-bold text-teal-600 bg-teal-50 px-2 py-0.5 rounded-full">
                {(kpis.firmVotes / (kpis.totalContacts || 1) * 100).toFixed(1)}%
              </span>
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Efectividad de Conversión</p>
            </div>
          </div>
        </div>

        {/* Avance de Meta Real */}
        <div className="group relative overflow-hidden bg-white p-8 rounded-[2.5rem] border border-slate-100 shadow-sm transition-all hover:-translate-y-1 hover:shadow-2xl hover:shadow-amber-500/5">
          <div className="flex justify-between items-start mb-6">
            <div className="h-14 w-14 bg-amber-50 text-amber-600 rounded-2xl flex items-center justify-center shadow-sm group-hover:bg-amber-500 group-hover:text-white transition-all">
              <TrendingUp size={28} />
            </div>
            <div className="text-right">
              <span className="text-[10px] font-black bg-slate-900 text-white px-2.5 py-1 rounded-full uppercase tracking-tighter">
                Meta: {formatNum(kpis.campaignGoal)}
              </span>
            </div>
          </div>
          <div className="space-y-1">
            <p className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em]">Progreso de Objetivo</p>
            <h3 className="text-4xl font-black tracking-tighter text-slate-900">{kpis.progressPercentage.toFixed(1)}%</h3>
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
        <div className="group relative overflow-hidden bg-white p-8 rounded-[2.5rem] border border-slate-100 shadow-sm transition-all hover:-translate-y-1 hover:shadow-2xl hover:shadow-indigo-500/5">
          <div className="h-14 w-14 bg-indigo-50 text-indigo-600 rounded-2xl flex items-center justify-center mb-6 group-hover:bg-indigo-600 group-hover:text-white transition-all duration-300 shadow-sm">
            <MapPin size={28} />
          </div>
          <div className="space-y-1">
            <p className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em]">Cobertura Territorial</p>
            <h3 className="text-4xl font-black text-slate-900 tracking-tighter" suppressHydrationWarning>
              {formatNum(kpis.coverageNeighborhoods)}
            </h3>
            <div className="flex items-center gap-2 pt-2">
              <p className="text-[10px] font-bold text-indigo-600 bg-indigo-50 px-2 py-0.5 rounded-full uppercase tracking-widest">Nodos Activos</p>
            </div>
          </div>
        </div>
      </div>

      {/* Main Content Area */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Recent Activity Monitor */}
        <Card className="lg:col-span-2 border border-slate-100 shadow-sm rounded-[2.5rem] overflow-hidden bg-white">
          <CardContent className="p-0">
            <div className="p-10 border-b border-slate-50 flex items-center justify-between">
              <div className="flex items-center gap-4">
                <div className="h-12 w-12 bg-teal-50 text-teal-600 rounded-2xl flex items-center justify-center border border-teal-100">
                  <ShieldCheck size={24} />
                </div>
                <div>
                  <h3 className="text-xl font-black text-slate-900 tracking-tight">Actividad en Tiempo Real</h3>
                  <p className="text-[10px] font-bold text-slate-400 uppercase tracking-[0.2em]">Monitor de Ingresos al CRM</p>
                </div>
              </div>
              <Link 
                href="/dashboard/directory"
                className="group flex items-center gap-2 px-5 py-2.5 bg-teal-600 text-white rounded-2xl text-[10px] font-black uppercase tracking-widest transition-all hover:bg-teal-700 shadow-lg shadow-teal-200"
              >
                Ver Todo <ChevronRight size={14} className="group-hover:translate-x-1 transition-transform" />
              </Link>
            </div>
            
            <div className="p-8">
              <div className="divide-y divide-slate-50">
                {contacts.slice(0, 6).map((c, idx) => (
                  <div 
                    key={c.id} 
                    className="flex flex-col sm:flex-row items-start sm:items-center justify-between p-5 transition-all hover:bg-slate-50/80 rounded-2xl group border border-transparent hover:border-slate-100 gap-4"
                  >
                    <div className="flex items-center gap-5 min-w-0 flex-1">
                      <div className={cn(
                        "h-12 w-12 rounded-2xl flex items-center justify-center font-black text-base shadow-sm group-hover:scale-110 transition-all shrink-0",
                        idx % 3 === 0 ? "bg-teal-100 text-teal-700" : 
                        idx % 3 === 1 ? "bg-slate-100 text-slate-600" : 
                        "bg-indigo-50 text-indigo-600"
                      )}>
                        {c.name.charAt(0)}
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <p className="text-base font-black text-slate-900 uppercase truncate">{c.name}</p>
                          {idx === 0 && (
                            <span className="shrink-0 text-[8px] font-black bg-teal-600 text-white px-1.5 py-0.5 rounded uppercase tracking-tighter shadow-sm shadow-teal-200">En Vivo</span>
                          )}
                        </div>
                        <div className="flex items-center gap-1.5 text-slate-400 mt-0.5">
                          <MapPin size={10} className="text-teal-500 shrink-0" />
                          <p className="text-[10px] font-bold uppercase tracking-widest truncate">{c.neighborhood}</p>
                        </div>
                      </div>
                    </div>
                    
                    <div className="mt-4 sm:mt-0 flex items-center gap-3 w-full sm:w-auto justify-between sm:justify-end shrink-0">
                      <div className={cn(
                        "px-4 py-1.5 rounded-xl text-[9px] font-black uppercase tracking-widest border shadow-sm",
                        c.stage === 'Firme' || c.stage === 'Votó' ? "bg-emerald-50 text-emerald-700 border-emerald-100" : 
                        c.stage === 'Contactado' || c.stage === 'Simpatizante' ? "bg-teal-50 text-teal-700 border-teal-100" :
                        "bg-slate-50 text-slate-600 border-slate-100"
                      )}>
                        {c.stage}
                      </div>
                      <button className="p-2 text-slate-300 hover:text-teal-600 hover:bg-teal-50 rounded-xl transition-all">
                        <ChevronRight size={18} />
                      </button>
                    </div>
                  </div>
                ))}
                
                {contacts.length === 0 && (
                  <div className="flex flex-col items-center justify-center py-20 text-slate-200 space-y-4">
                    <UserPlus size={48} className="opacity-20" />
                    <p className="font-bold uppercase tracking-widest text-[10px]">Sin registros recientes</p>
                  </div>
                )}
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Secondary Info Column */}
        <div className="space-y-8">
          {/* Strategic Action Card */}
          <div className="bg-white p-10 rounded-[2.5rem] border border-slate-100 shadow-sm relative overflow-hidden group">
            <div className="absolute -right-4 -bottom-4 opacity-5 group-hover:scale-110 transition-transform duration-700">
              <Target size={180} className="text-teal-600" />
            </div>
            <div className="relative z-10">
              <div className="h-12 w-12 bg-teal-50 text-teal-600 rounded-2xl flex items-center justify-center mb-6">
                <Target size={24} />
              </div>
              <h4 className="text-xl font-black text-slate-900 mb-2 leading-tight">Acción Sugerida</h4>
              <p className="text-slate-500 text-sm mb-8 font-medium leading-relaxed">
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
          <div className="bg-teal-50 p-8 rounded-[2.5rem] border border-teal-100 shadow-sm space-y-6 hover:-translate-y-1 transition-all duration-300 group">
            <h4 className="text-[10px] font-black text-teal-600 uppercase tracking-[0.3em] border-b border-teal-200/50 pb-4">Desempeño Operativo</h4>
            <div className="space-y-5">
              <div className="flex justify-between items-center">
                <span className="text-xs font-bold text-slate-400 uppercase tracking-widest">Nuevos Líderes</span>
                <span className="text-lg font-black text-slate-900">12</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-xs font-bold text-slate-400 uppercase tracking-widest">Eventos Hoy</span>
                <span className="text-lg font-black text-slate-900">04</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-xs font-bold text-slate-400 uppercase tracking-widest">Conversión</span>
                <span className="text-lg font-black text-emerald-600">8.4%</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
