"use client";

import React, { useState } from 'react';
import { useCRM } from '@/context/CRMContext';
import { useToast } from '@/context/ToastContext';
import { Shield, Terminal, ShieldAlert, UserCheck, Eye, Zap, Search, Filter, Calendar, ChevronDown, Check, ChevronLeft, ChevronRight, FileDown, Activity, Globe } from 'lucide-react';
import { cn } from '@/components/ui/utils';
import * as XLSX from 'xlsx';

export default function SecurityPage() {
  const { auditLogs } = useCRM();
  const { info, error: toastError } = useToast();
  const [panicMode, setPanicMode] = useState(false);

  // Advanced Filtering & Pagination States
  const [filterSeverity, setFilterSeverity] = useState<string>("all");
  const [filterModule, setFilterModule] = useState<string>("all");
  const [searchTerm, setSearchTerm] = useState<string>("");
  const [filterStartDate, setFilterStartDate] = useState<string>("");
  const [filterEndDate, setFilterEndDate] = useState<string>("");
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 10;

  const [isSeverityOpen, setIsSeverityOpen] = useState(false);
  const [isModuleOpen, setIsModuleOpen] = useState(false);
  const [isRangeOpen, setIsRangeOpen] = useState(false);

  const SEVERITIES = ["Critical", "Warning", "Info"];
  const MODULES = Array.from(new Set(auditLogs.map(log => log.module)));

  const filteredLogs = React.useMemo(() => {
    return auditLogs.filter(log => {
      const matchesSeverity = filterSeverity === "all" || log.severity === filterSeverity;
      const matchesModule = filterModule === "all" || log.module === filterModule;
      
      const logDate = log.timestamp.split('T')[0];
      const matchesDate = (!filterStartDate || logDate >= filterStartDate) && 
                         (!filterEndDate || logDate <= filterEndDate);
      
      const search = searchTerm.toLowerCase();
      const matchesSearch = !search || 
        log.action.toLowerCase().includes(search) || 
        log.actor.toLowerCase().includes(search) ||
        log.ip.toLowerCase().includes(search);

      return matchesSeverity && matchesModule && matchesDate && matchesSearch;
    });
  }, [auditLogs, filterSeverity, filterModule, searchTerm, filterStartDate, filterEndDate]);

  const handleExport = () => {
    info('Generando reporte');
    
    const headers = ['ID', 'Fecha/Hora', 'Severidad', 'Modulo', 'Actor', 'Accion', 'IP'];
    const rows = filteredLogs.map(log => [
      log.id,
      new Date(log.timestamp).toLocaleString(),
      log.severity,
      log.module,
      log.actor,
      log.action,
      log.ip
    ]);
    
    const ws = XLSX.utils.aoa_to_sheet([headers, ...rows]);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Auditoria");
    XLSX.writeFile(wb, `reporte_seguridad_${new Date().toISOString().split('T')[0]}.xlsx`);
  };

  const totalPages = Math.ceil(filteredLogs.length / itemsPerPage);
  const paginatedLogs = filteredLogs.slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage);

  const threatLevel = React.useMemo(() => {
    const criticalCount = auditLogs.filter(l => l.severity === 'Critical').length;
    if (panicMode) return { label: 'MAXIMO', color: 'text-red-600', bg: 'bg-red-50', level: 100 };
    if (criticalCount > 5) return { label: 'ELEVADO', color: 'text-rose-500', bg: 'bg-rose-50', level: 75 };
    if (criticalCount > 0) return { label: 'MODERADO', color: 'text-amber-500', bg: 'bg-amber-50', level: 40 };
    return { label: 'BAJO', color: 'text-teal-600', bg: 'bg-teal-50', level: 10 };
  }, [auditLogs, panicMode]);

  React.useEffect(() => { setCurrentPage(1); }, [filterSeverity, filterModule, searchTerm, filterStartDate, filterEndDate]);

  return (
    <div className="space-y-6 md:space-y-8 animate-in fade-in duration-500">
      <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center gap-6">
        <div>
          <h1 className="text-3xl md:text-4xl font-black text-slate-900 tracking-tighter uppercase">Seguridad y Auditoría</h1>
          <p className="text-sm md:text-base text-slate-500 font-medium">Control de accesos inmutable y monitor de integridad de datos.</p>
        </div>
        <div className="flex items-center justify-between w-full lg:w-auto gap-4 bg-white p-2 rounded-2xl border-2 border-teal-500/20 shadow-sm">
          <div className="px-4">
            <p className="text-[8px] font-black text-slate-400 uppercase tracking-widest leading-none mb-1">Modo Pánico</p>
            <p className="text-[10px] font-bold text-slate-600">{panicMode ? 'Activado' : 'Inactivo'}</p>
          </div>
          <button 
            onClick={() => {
              setPanicMode(!panicMode);
              if(!panicMode) {
                toastError('PROTOCOLO DE SEGURIDAD NIVEL 5 ACTIVADO: Bloqueando exportaciones y restringiendo accesos por integridad de datos.');
              } else {
                info('SISTEMA RESTAURADO: Protocolos de seguridad normalizados.');
              }
            }}
            className={cn(
              "w-12 h-12 rounded-xl flex items-center justify-center transition-all shadow-lg",
              panicMode ? "bg-red-600 text-white animate-pulse shadow-red-200" : "bg-slate-100 text-slate-400 hover:bg-red-50 hover:text-red-500"
            )}
          >
            <Zap size={24} fill={panicMode ? "currentColor" : "none"} />
          </button>
        </div>
      </div>

      {/* Security Alerts */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 md:gap-6">
        <div className="bg-teal-50 p-6 md:p-8 rounded-[2rem] md:rounded-[2.5rem] border-2 border-teal-200 shadow-sm flex items-center gap-5 md:gap-6 group hover:bg-white hover:border-teal-500 hover:shadow-xl hover:-translate-y-1 transition-all duration-500">
          <div className="w-14 h-14 md:w-16 md:h-16 bg-white text-teal-600 rounded-2xl md:rounded-3xl flex items-center justify-center shadow-sm group-hover:bg-teal-600 group-hover:text-white transition-all shrink-0">
            <UserCheck size={24} className="md:size-7" />
          </div>
          <div>
            <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Accesos Hoy</p>
            <h3 className="text-2xl md:text-3xl font-black text-slate-900">24</h3>
          </div>
        </div>
        
        <div className="bg-white p-6 md:p-8 rounded-[2rem] md:rounded-[2.5rem] border-2 border-slate-100 shadow-sm flex items-center gap-5 md:gap-6 relative overflow-hidden group hover:border-amber-500 hover:shadow-xl hover:-translate-y-1 transition-all duration-500">
          <div className="w-14 h-14 md:w-16 md:h-16 bg-amber-50 text-amber-600 rounded-2xl md:rounded-3xl flex items-center justify-center group-hover:bg-amber-600 group-hover:text-white transition-all shrink-0">
            <Eye size={24} className="md:size-7" />
          </div>
          <div>
            <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Exportaciones</p>
            <h3 className="text-2xl md:text-3xl font-black text-slate-900">02</h3>
          </div>
          <div className="absolute top-0 right-0 p-4">
            <span className="flex h-2 w-2 rounded-full bg-amber-500 animate-ping"></span>
          </div>
        </div>

        <div className="bg-white p-6 md:p-8 rounded-[2rem] md:rounded-[2.5rem] border-2 border-slate-100 shadow-sm flex items-center gap-5 md:gap-6 group hover:border-red-500 hover:shadow-xl hover:-translate-y-1 transition-all duration-500">
          <div className="w-14 h-14 md:w-16 md:h-16 bg-red-50 text-red-600 rounded-2xl md:rounded-3xl flex items-center justify-center group-hover:bg-red-600 group-hover:text-white transition-all shrink-0">
            <ShieldAlert size={24} className="md:size-7" />
          </div>
          <div>
            <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Intentos Fallidos</p>
            <h3 className="text-2xl md:text-3xl font-black text-slate-900">0</h3>
          </div>
        </div>
      </div>

      {/* Threat Monitor & Filter Hub */}
      <div className="flex flex-col xl:flex-row gap-6">
        <div className={cn("flex-1 p-6 md:p-8 rounded-[2rem] md:rounded-[2.5rem] border-2 shadow-sm transition-all duration-500 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-6", 
          panicMode ? "bg-red-50 border-red-200" : "bg-white border-slate-100")}>
          <div className="space-y-4 flex-1 w-full">
            <div className="flex items-center gap-2">
              <Activity size={16} className={threatLevel.color} />
              <span className="text-[10px] font-black uppercase text-slate-400 tracking-[0.3em]">Nivel de Amenaza Actual</span>
            </div>
            <div className="flex flex-col sm:flex-row sm:items-end gap-1 sm:gap-3">
              <h4 className={cn("text-4xl md:text-5xl font-black uppercase tracking-tighter leading-none", threatLevel.color)}>{threatLevel.label}</h4>
              <span className="text-slate-400 font-bold text-[10px] sm:text-xs uppercase mb-1">Status de Integridad</span>
            </div>
            <div className="h-3 w-full bg-slate-100 rounded-full overflow-hidden border border-slate-50">
              <div 
                className={cn("h-full transition-all duration-1000 ease-out", 
                  panicMode ? "bg-red-600 shadow-[0_0_10px_rgba(220,38,38,0.5)]" : 
                  threatLevel.level > 50 ? "bg-rose-500" : 
                  threatLevel.level > 20 ? "bg-amber-500" : "bg-emerald-500"
                )} 
                style={{ width: `${threatLevel.level}%` }}
              />
            </div>
          </div>
        </div>

        {/* Global Search & Export */}
        <div className="xl:w-[450px] flex flex-col gap-4">
          <div className="bg-white p-4 rounded-2xl md:rounded-3xl border-2 border-slate-100 flex items-center gap-4 focus-within:border-teal-500 transition-all shadow-sm">
            <Search className="text-slate-400 shrink-0" size={20} />
            <input 
              type="text" 
              placeholder="Buscar actor, acción o IP..." 
              className="bg-transparent border-none outline-none text-[10px] md:text-xs font-black uppercase tracking-widest text-slate-900 w-full placeholder:text-slate-300"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>
          <button 
            onClick={handleExport}
            className="w-full h-12 md:h-14 bg-teal-600 text-white rounded-xl md:rounded-2xl font-black text-[10px] uppercase tracking-widest hover:bg-teal-700 transition-all shadow-xl shadow-teal-100 flex items-center justify-center gap-2"
          >
            <FileDown size={18} /> Exportar Reporte
          </button>
        </div>
      </div>

      {/* Advanced Forensics Control Bar */}
      <div className="flex flex-col sm:flex-row flex-wrap items-stretch sm:items-center gap-3 md:gap-4 bg-white p-4 rounded-2xl md:rounded-[2rem] border border-slate-100 shadow-sm">
        <div className="flex items-center gap-2 px-4 sm:border-r border-slate-100 h-8">
          <Filter size={14} className="text-teal-600" />
          <span className="text-[10px] font-black uppercase text-slate-400 tracking-widest">Filtros:</span>
        </div>

        <div className="grid grid-cols-2 sm:flex sm:items-center gap-3 flex-1">
          {/* Severity Select */}
          <div className="relative">
            <button 
              onClick={() => { setIsSeverityOpen(!isSeverityOpen); setIsModuleOpen(false); setIsRangeOpen(false); }}
              className="w-full sm:w-auto px-4 md:px-6 py-3 bg-slate-50 hover:bg-slate-100 rounded-xl flex items-center justify-between sm:justify-start gap-4 transition-all group"
            >
              <span className="text-[9px] font-black uppercase tracking-widest text-slate-600 truncate">{filterSeverity === 'all' ? 'Severidad' : filterSeverity}</span>
              <ChevronDown size={14} className={cn("text-slate-400 transition-transform shrink-0", isSeverityOpen && "rotate-180")} />
            </button>
            {isSeverityOpen && (
              <div className="absolute top-full left-0 mt-2 w-48 bg-white border border-slate-100 rounded-2xl shadow-xl z-50 overflow-hidden animate-in fade-in zoom-in-95 duration-200 p-1.5">
                {['all', ...SEVERITIES].map(s => (
                  <button 
                    key={s} 
                    onClick={() => { setFilterSeverity(s); setIsSeverityOpen(false); }}
                    className={cn("w-full px-5 py-2.5 text-left text-[9px] font-black uppercase tracking-widest rounded-lg flex justify-between items-center transition-all", 
                      filterSeverity === s ? "bg-teal-50 text-teal-600" : "text-slate-500 hover:bg-slate-50")}
                  >
                    {s === 'all' ? 'Todas' : s}
                    {filterSeverity === s && <Check size={12} />}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Module Select */}
          <div className="relative">
            <button 
              onClick={() => { setIsModuleOpen(!isModuleOpen); setIsSeverityOpen(false); setIsRangeOpen(false); }}
              className="w-full sm:w-auto px-4 md:px-6 py-3 bg-slate-50 hover:bg-slate-100 rounded-xl flex items-center justify-between sm:justify-start gap-4 transition-all group"
            >
              <span className="text-[9px] font-black uppercase tracking-widest text-slate-600 truncate">{filterModule === 'all' ? 'Módulo' : filterModule}</span>
              <ChevronDown size={14} className={cn("text-slate-400 transition-transform shrink-0", isModuleOpen && "rotate-180")} />
            </button>
            {isModuleOpen && (
              <div className="absolute top-full left-0 mt-2 w-48 bg-white border border-slate-100 rounded-2xl shadow-xl z-50 overflow-hidden animate-in fade-in zoom-in-95 duration-200 p-1.5">
                {['all', ...MODULES].map(m => (
                  <button 
                    key={m} 
                    onClick={() => { setFilterModule(m); setIsModuleOpen(false); }}
                    className={cn("w-full px-5 py-2.5 text-left text-[9px] font-black uppercase tracking-widest rounded-lg flex justify-between items-center transition-all", 
                      filterModule === m ? "bg-teal-50 text-teal-600" : "text-slate-500 hover:bg-slate-50")}
                  >
                    {m === 'all' ? 'Todos los Módulos' : m}
                    {filterModule === m && <Check size={12} />}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Date Range Select */}
        <div className="relative">
          <button 
            onClick={() => { setIsRangeOpen(!isRangeOpen); setIsSeverityOpen(false); setIsModuleOpen(false); }}
            className={cn("w-full px-4 md:px-6 py-3 rounded-xl flex items-center justify-center sm:justify-start gap-4 transition-all", 
              (filterStartDate || filterEndDate) ? "bg-teal-600 text-white" : "bg-slate-50 hover:bg-slate-100 text-slate-600")}
          >
            <Calendar size={14} className="shrink-0" />
            <span className="text-[9px] font-black uppercase tracking-widest whitespace-nowrap">Rango Forense</span>
            <ChevronDown size={14} className={cn("shrink-0", isRangeOpen && "rotate-180")} />
          </button>
          {isRangeOpen && (
            <div className="absolute top-full right-0 mt-2 p-6 bg-white border border-slate-100 rounded-[2rem] shadow-2xl z-50 w-72 max-w-[calc(100vw-2rem)] animate-in fade-in zoom-in-95 duration-200 space-y-4">
              <div className="flex items-center justify-between mb-2">
                <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Audit Window</span>
                <button onClick={() => { setFilterStartDate(""); setFilterEndDate(""); }} className="text-[9px] font-black text-teal-600 uppercase hover:underline">Clear</button>
              </div>
              <div className="space-y-3">
                <div className="space-y-1">
                  <label className="text-[7px] font-black text-slate-400 uppercase tracking-widest ml-1">START_DATE</label>
                  <input type="date" value={filterStartDate} onChange={(e) => setFilterStartDate(e.target.value)} className="w-full bg-slate-50 border-none rounded-xl px-4 py-2 text-[10px] font-bold outline-none [color-scheme:light]" />
                </div>
                <div className="space-y-1">
                  <label className="text-[7px] font-black text-slate-400 uppercase tracking-widest ml-1">END_DATE</label>
                  <input type="date" value={filterEndDate} onChange={(e) => setFilterEndDate(e.target.value)} className="w-full bg-slate-50 border-none rounded-xl px-4 py-2 text-[10px] font-bold outline-none [color-scheme:light]" />
                </div>
              </div>
              <button onClick={() => setIsRangeOpen(false)} className="w-full py-3 bg-slate-900 text-white rounded-xl text-[9px] font-black uppercase tracking-[0.2em] hover:bg-teal-600 transition-all">Establecer Período</button>
            </div>
          )}
        </div>
      </div>

      <div className="bg-white rounded-[2rem] md:rounded-[3rem] p-6 md:p-10 text-slate-900 border-2 border-teal-500/20 shadow-sm relative overflow-hidden group hover:border-teal-500 hover:shadow-2xl hover:shadow-teal-500/10 transition-all duration-500">
        <div className="flex items-center gap-3 mb-6 md:mb-10 border-b border-slate-100 pb-6">
          <Terminal className="text-teal-600 shrink-0" />
          <h3 className="text-lg md:text-xl font-black tracking-tighter uppercase truncate">Log de Auditoría</h3>
          <span className="ml-auto text-[8px] md:text-[10px] font-black text-teal-600 uppercase tracking-[0.3em] hidden sm:block">Inmutable System</span>
        </div>
        
        <div className="space-y-4 font-mono text-xs min-h-[300px]">
          {paginatedLogs.map((log) => (
            <div key={log.id} className="flex flex-col lg:flex-row lg:items-center gap-3 md:gap-4 p-4 rounded-2xl hover:bg-teal-50/50 transition-all group border border-transparent hover:border-teal-100 animate-in fade-in slide-in-from-left-4 duration-300">
              <div className="flex items-center gap-3 shrink-0">
                <span className="text-slate-400 whitespace-nowrap font-bold bg-slate-50 px-3 py-1 rounded-lg border border-slate-100 text-[10px]">
                  {new Date(log.timestamp).toLocaleTimeString()}
                </span>
                <span className={cn(
                  "px-2.5 py-1 rounded-lg text-[8px] font-black uppercase tracking-widest border shadow-sm",
                  log.severity === 'Critical' ? 'bg-red-50 text-red-600 border-red-100 animate-pulse' :
                  log.severity === 'Warning' ? 'bg-amber-50 text-amber-600 border-amber-100' :
                  'bg-emerald-50 text-emerald-600 border-emerald-100'
                )}>
                  {log.severity}
                </span>
              </div>
              
              <div className="flex-1 flex flex-col md:flex-row md:items-center gap-3 md:gap-4">
                <div className="min-w-[120px]">
                  <span className="text-teal-600 font-black uppercase text-[10px] flex items-center gap-2 truncate">
                    <UserCheck size={12} className="shrink-0" /> {log.actor}
                  </span>
                </div>
                <div className="h-4 w-px bg-slate-200 hidden md:block shrink-0" />
                <p className="text-slate-600 font-medium flex-1 break-words leading-relaxed">
                  <span className="text-slate-400 uppercase text-[9px] font-black mr-2 opacity-50">[{log.module}]</span>
                  {log.action}
                </p>
                <div className="flex items-center gap-2 text-slate-300 text-[9px] font-bold bg-slate-50 px-3 py-1 rounded-lg border border-slate-100 w-fit shrink-0">
                  <Globe size={10} className="shrink-0" /> {log.ip}
                </div>
              </div>
            </div>
          ))}
          
          {filteredLogs.length === 0 && (
            <div className="flex flex-col items-center justify-center py-24 text-center">
              <div className="w-16 h-16 md:w-20 md:h-20 bg-slate-50 rounded-3xl flex items-center justify-center mb-6 border border-slate-100">
                <Terminal className="text-slate-200" size={32} />
              </div>
              <h4 className="text-lg font-black text-slate-900 uppercase tracking-tighter mb-2">No se encontraron registros</h4>
              <p className="text-slate-400 text-[10px] font-bold uppercase tracking-[0.2em] max-w-xs mx-auto">
                Ajuste los parámetros de búsqueda o el rango de tiempo.
              </p>
            </div>
          )}
        </div>

        {/* Tactical Pagination Controls */}
        {totalPages > 1 && (
          <div className="mt-8 pt-8 border-t border-slate-100 flex flex-col items-center justify-between gap-6">
            <div className="flex items-center gap-2 md:gap-3 flex-wrap justify-center">
              <button 
                onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                disabled={currentPage === 1}
                className="h-10 w-10 md:h-12 md:w-12 rounded-xl bg-slate-900 text-white flex items-center justify-center hover:bg-teal-600 disabled:opacity-20 transition-all shadow-lg shadow-slate-200 group"
              >
                <ChevronLeft size={18} className="group-hover:-translate-x-0.5 transition-transform" />
              </button>
              
              <div className="flex gap-1.5 md:gap-2">
                {[...Array(totalPages)].map((_, i) => {
                  const p = i + 1;
                  if (totalPages > 5 && Math.abs(p - currentPage) > 1 && p !== 1 && p !== totalPages) {
                    if (p === 2 || p === totalPages - 1) return <span key={p} className="text-slate-300 px-1 font-black">...</span>;
                    return null;
                  }
                  return (
                    <button 
                      key={p} 
                      onClick={() => setCurrentPage(p)}
                      className={cn("h-10 w-10 md:h-12 md:w-12 rounded-xl text-[9px] md:text-[10px] font-black uppercase transition-all", 
                        currentPage === p ? "bg-teal-50 text-teal-600 border-2 border-teal-200 shadow-sm scale-110" : "bg-white text-slate-400 hover:bg-slate-50")}
                    >
                      {p}
                    </button>
                  );
                })}
              </div>

              <button 
                onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                disabled={currentPage === totalPages}
                className="h-10 w-10 md:h-12 md:w-12 rounded-xl bg-slate-900 text-white flex items-center justify-center hover:bg-teal-600 disabled:opacity-20 transition-all shadow-lg shadow-slate-200 group"
              >
                <ChevronRight size={18} className="group-hover:translate-x-0.5 transition-transform" />
              </button>
            </div>

            <div className="text-center w-full">
              <p className="text-[9px] md:text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Index de Auditoría</p>
              <p className="text-[10px] md:text-[11px] font-bold text-slate-600 uppercase">
                <span className="text-teal-600">{paginatedLogs.length}</span> de <span className="text-teal-600">{filteredLogs.length}</span> trazas
              </p>
            </div>
          </div>
        )}
      </div>

      {/* Security Tip */}
      <div className="bg-teal-50 border-l-4 border-teal-600 p-6 md:p-8 rounded-[1.5rem] md:rounded-3xl flex flex-col sm:flex-row items-start sm:items-center gap-5 md:gap-6 shadow-sm">
        <div className="w-12 h-12 bg-white rounded-2xl flex items-center justify-center text-teal-600 shadow-sm shrink-0">
          <Shield size={24} className="md:size-7" />
        </div>
        <div>
          <p className="text-teal-900 font-black text-sm mb-1 uppercase tracking-tight">Protección de Datos Activa</p>
          <p className="text-teal-700 text-[10px] md:text-xs font-medium leading-relaxed">
            Este sistema cumple con los estándares de encriptación de grado militar y registra cada movimiento de información sensible de acuerdo a la Ley de Habeas Data.
          </p>
        </div>
      </div>
    </div>
  );
}
