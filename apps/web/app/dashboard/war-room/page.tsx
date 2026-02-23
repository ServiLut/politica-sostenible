"use client";

import React, { useState, useMemo } from 'react';
import { useCRM } from '@/context/CRMContext';
import { 
  X, 
  Inbox, 
  Search, 
  TrendingUp, 
  Zap, 
  Users,
  ShieldCheck,
  Filter,
  BarChart3,
  CheckCircle2,
  Trophy,
  ArrowRightLeft
} from 'lucide-react';
import { cn } from '@/components/ui/utils';

export default function WarRoomPage() {
  const { pollingStations, e14Reports, reportE14, getElectionResults } = useCRM();
  const { myVotes, opponentVotes, tablesReported, totalTables } = getElectionResults();
  
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [activeTab, setActiveTab] = useState<'all' | 'pending' | 'completed'>('all');
  const [selectedStation, setSelectedStation] = useState<string>('');
  const [newReport, setNewReport] = useState({
    tableNumber: '',
    votesCandidate: 0,
    votesOpponent: 0
  });

  const handleReport = (e: React.FormEvent) => {
    e.preventDefault();
    reportE14({
      stationId: selectedStation,
      tableNumber: newReport.tableNumber,
      votesCandidate: Number(newReport.votesCandidate),
      votesOpponent: Number(newReport.votesOpponent)
    });
    setIsModalOpen(false);
    setNewReport({ tableNumber: '', votesCandidate: 0, votesOpponent: 0 });
  };

  const reportedPercentage = totalTables > 0 ? Math.round((tablesReported / totalTables) * 100) : 0;
  
  // Calcular porcentaje de victoria
  const totalVotesCounted = myVotes + opponentVotes;
  const myWinPercentage = totalVotesCounted > 0 ? Math.round((myVotes / totalVotesCounted) * 100) : 0;
  const opponentWinPercentage = totalVotesCounted > 0 ? 100 - myWinPercentage : 0;

  const filteredStations = useMemo(() => {
    return pollingStations
      .filter(s => {
        const matchesSearch = s.name.toLowerCase().includes(searchTerm.toLowerCase());
        const isComplete = s.reportedTables === s.totalTables && s.totalTables > 0;
        
        if (activeTab === 'pending') return matchesSearch && !isComplete;
        if (activeTab === 'completed') return matchesSearch && isComplete;
        return matchesSearch;
      })
      .sort((a, b) => b.totalTables - a.totalTables); // Sort by size
  }, [pollingStations, searchTerm, activeTab]);

  const lead = myVotes - opponentVotes;

  return (
    <div className="space-y-8 pb-20 animate-in fade-in duration-700">
      
      {/* HEADER ESTRATÉGICO */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-end gap-4">
        <div className="space-y-1">
          <div className="flex items-center gap-2 mb-1">
            <span className="flex items-center gap-1.5 px-3 py-1 bg-rose-500 text-white text-[10px] font-black uppercase tracking-[0.2em] rounded-full animate-pulse shadow-lg shadow-rose-200">
              <Zap size={10} fill="currentColor" /> Transmisión en Vivo
            </span>
            <span className="px-3 py-1 bg-slate-100 text-slate-500 text-[10px] font-black uppercase tracking-[0.2em] rounded-full border border-slate-200">
              Día D - Elecciones 2026
            </span>
          </div>
          <h1 className="text-5xl font-black text-slate-900 tracking-tighter uppercase leading-none">Command <span className="text-teal-600">Center</span></h1>
          <p className="text-slate-500 font-bold uppercase text-[10px] tracking-[0.3em]">Monitoreo de Escrutinio en Tiempo Real</p>
        </div>

        <div className="flex items-center gap-2 bg-white p-1.5 rounded-2xl border-2 border-slate-100 shadow-sm">
           <div className="flex -space-x-2">
              {[...Array(3)].map((_, i) => (
                <div key={i} className="w-8 h-8 rounded-full border-2 border-white bg-slate-200 flex items-center justify-center overflow-hidden">
                   <div className="w-full h-full bg-gradient-to-br from-slate-300 to-slate-400 animate-pulse" />
                </div>
              ))}
           </div>
           <div className="px-4 border-l-2 border-slate-100">
              <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-0.5">Analistas Activos</p>
              <p className="text-xs font-black text-slate-900">12 Coordinadores</p>
           </div>
        </div>
      </div>

      {/* QUICK STATS SUMMARY */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
         <div className="bg-white p-6 rounded-[2rem] border-2 border-slate-100 shadow-sm flex items-center gap-5">
            <div className="w-14 h-14 bg-teal-50 text-teal-600 rounded-2xl flex items-center justify-center shrink-0 border border-teal-100 shadow-sm"><Trophy size={24} /></div>
            <div>
               <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Tendencia</p>
               <h4 className="text-xl font-black text-slate-900 leading-tight uppercase">{lead > 0 ? 'Ganando' : lead < 0 ? 'Perdiendo' : 'Empate'}</h4>
            </div>
         </div>
         <div className="bg-white p-6 rounded-[2rem] border-2 border-slate-100 shadow-sm flex items-center gap-5">
            <div className="w-14 h-14 bg-rose-50 text-rose-600 rounded-2xl flex items-center justify-center shrink-0 border border-rose-100 shadow-sm"><ArrowRightLeft size={24} /></div>
            <div>
               <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Diferencia</p>
               <h4 className={cn("text-xl font-black leading-tight", lead >= 0 ? "text-emerald-600" : "text-rose-600")}>
                 {lead >= 0 ? '+' : ''}{lead.toLocaleString()}
               </h4>
            </div>
         </div>
         <div className="bg-white p-6 rounded-[2rem] border-2 border-slate-100 shadow-sm flex items-center gap-5">
            <div className="w-14 h-14 bg-amber-50 text-amber-600 rounded-2xl flex items-center justify-center shrink-0 border border-amber-100 shadow-sm"><BarChart3 size={24} /></div>
            <div>
               <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Escrutado</p>
               <h4 className="text-xl font-black text-slate-900 leading-tight">{reportedPercentage}% <span className="text-xs text-slate-400">Mesas</span></h4>
            </div>
         </div>
         <div className="bg-white p-6 rounded-[2rem] border-2 border-slate-100 shadow-sm flex items-center gap-5">
            <div className="w-14 h-14 bg-indigo-50 text-indigo-600 rounded-2xl flex items-center justify-center shrink-0 border border-indigo-100 shadow-sm"><Zap size={24} /></div>
            <div>
               <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Total Votos</p>
               <h4 className="text-xl font-black text-slate-900 leading-tight">{(myVotes + opponentVotes).toLocaleString()}</h4>
            </div>
         </div>
      </div>

      {/* DASHBOARD PRINCIPAL (SCOREBOARD) */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
        
        {/* Marcador de Votos */}
        <div className="lg:col-span-8 bg-white rounded-[3.5rem] p-10 md:p-14 border-2 border-slate-100 shadow-2xl relative overflow-hidden flex flex-col justify-center">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-12 relative z-10">
            {/* Nosotros */}
            <div className="space-y-4 group">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-teal-600 text-white rounded-xl flex items-center justify-center shadow-lg shadow-teal-200"><TrendingUp size={20} /></div>
                <p className="text-xs font-black uppercase tracking-[0.3em] text-teal-600">Nuestra Candidatura</p>
              </div>
              <h2 className="text-7xl md:text-9xl font-black tracking-tighter text-slate-900 group-hover:scale-105 transition-transform duration-500 tabular-nums">
                {myVotes.toLocaleString()}
              </h2>
              <div className="flex items-center gap-3">
                <div className="px-4 py-1.5 bg-teal-50 text-teal-700 rounded-full text-sm font-black border border-teal-100">
                  {myWinPercentage}%
                </div>
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest leading-tight">Votos Consolidados</p>
              </div>
            </div>

            {/* Oponente */}
            <div className="space-y-4 md:text-right flex flex-col md:items-end">
              <div className="flex items-center gap-3 md:flex-row-reverse">
                <div className="w-10 h-10 bg-rose-100 text-rose-600 rounded-xl flex items-center justify-center border border-rose-200"><Users size={20} /></div>
                <p className="text-xs font-black uppercase tracking-[0.3em] text-rose-500">Oposición</p>
              </div>
              <h2 className="text-7xl md:text-9xl font-black tracking-tighter text-slate-300 tabular-nums">
                {opponentVotes.toLocaleString()}
              </h2>
              <div className="flex items-center gap-3 md:flex-row-reverse">
                <div className="px-4 py-1.5 bg-rose-50 text-rose-700 rounded-full text-sm font-black border border-rose-100">
                  {opponentWinPercentage}%
                </div>
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest leading-tight md:text-right">Votos del Oponente</p>
              </div>
            </div>
          </div>

          {/* Barra de Diferencia Visual (High Impact) */}
          <div className="mt-16 space-y-4 relative z-10">
             <div className="flex justify-between items-end mb-2">
                <p className="text-[9px] font-black uppercase tracking-[0.4em] text-teal-600">Dominio Territorial</p>
                <div className="text-[10px] font-black uppercase tracking-widest px-3 py-1 bg-slate-900 text-white rounded-lg">
                  Brecha: {(myVotes - opponentVotes).toLocaleString()} Votos
                </div>
                <p className="text-[9px] font-black uppercase tracking-[0.4em] text-rose-400 text-right">Oposición</p>
             </div>
             <div className="h-6 w-full flex rounded-2xl overflow-hidden shadow-inner bg-slate-50 border-4 border-white ring-1 ring-slate-100">
                <div className="h-full bg-teal-500 transition-all duration-1000 relative group" style={{ width: `${myWinPercentage}%` }}>
                   <div className="absolute inset-0 bg-gradient-to-r from-teal-400/20 to-transparent" />
                </div>
                <div className="h-full bg-rose-500 transition-all duration-1000 relative" style={{ width: `${opponentWinPercentage}%` }}>
                   <div className="absolute inset-0 bg-gradient-to-l from-rose-400/20 to-transparent" />
                </div>
             </div>
          </div>

          {/* Fondo Decorativo */}
          <div className="absolute top-0 right-0 w-96 h-96 bg-teal-50/30 rounded-full -translate-y-1/2 translate-x-1/2 blur-3xl" />
          <div className="absolute bottom-0 left-0 w-64 h-64 bg-rose-50/20 rounded-full translate-y-1/2 -translate-x-1/2 blur-3xl" />
        </div>

        {/* Métrica de Avance Global (Circular) */}
        <div className="lg:col-span-4 bg-slate-900 rounded-[3.5rem] p-10 flex flex-col items-center justify-center text-center text-white shadow-2xl relative overflow-hidden group">
           <div className="relative z-10 space-y-6">
              <p className="text-xs font-black uppercase tracking-[0.4em] text-teal-400 mb-2">Escrutinio Total</p>
              <div className="relative w-48 h-48 mx-auto">
                <svg className="w-full h-full transform -rotate-90">
                  <circle cx="96" cy="96" r="88" stroke="currentColor" strokeWidth="8" fill="transparent" className="text-white/5" />
                  <circle cx="96" cy="96" r="88" stroke="currentColor" strokeWidth="12" fill="transparent" 
                    strokeDasharray={552.9} strokeDashoffset={552.9 - (552.9 * reportedPercentage) / 100}
                    strokeLinecap="round"
                    className="text-teal-500 transition-all duration-1000 shadow-lg" 
                  />
                </svg>
                <div className="absolute inset-0 flex flex-col items-center justify-center">
                  <span className="text-5xl font-black tracking-tighter">{reportedPercentage}%</span>
                  <span className="text-[10px] font-black text-teal-400 uppercase tracking-widest mt-1">Avance</span>
                </div>
              </div>
              <div className="space-y-2">
                <p className="text-sm font-bold text-slate-400">{tablesReported} de {totalTables} mesas</p>
              </div>
           </div>
           <div className="absolute inset-0 opacity-10 bg-[url('https://www.transparenttextures.com/patterns/carbon-fibre.png')]" />
        </div>
      </div>

      {/* SECCIÓN DE MONITOREO POR PUESTO */}
      <div className="space-y-6">
        <div className="flex flex-col xl:flex-row justify-between items-center gap-6">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 bg-white rounded-2xl flex items-center justify-center border-2 border-slate-100 shadow-sm"><Inbox className="text-teal-600" /></div>
            <div>
              <h3 className="text-2xl font-black text-slate-900 tracking-tighter uppercase">Monitor Territorial</h3>
              <p className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em]">Listado Detallado de Escrutinio</p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-4 w-full xl:w-auto">
            {/* TABS DE ESTADO */}
            <div className="flex bg-slate-100 p-1.5 rounded-2xl border border-slate-200 shadow-inner">
               <button 
                onClick={() => setActiveTab('all')}
                className={cn("px-6 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all", activeTab === 'all' ? "bg-white text-slate-900 shadow-md" : "text-slate-500 hover:text-slate-700")}
               >
                 Todos ({pollingStations.length})
               </button>
               <button 
                onClick={() => setActiveTab('pending')}
                className={cn("px-6 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all", activeTab === 'pending' ? "bg-white text-amber-600 shadow-md" : "text-slate-500 hover:text-slate-700")}
               >
                 Pendientes
               </button>
               <button 
                onClick={() => setActiveTab('completed')}
                className={cn("px-6 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all", activeTab === 'completed' ? "bg-white text-emerald-600 shadow-md" : "text-slate-500 hover:text-slate-700")}
               >
                 Completados
               </button>
            </div>

            <div className="relative flex-1 md:w-80 min-w-[250px]">
              <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
              <input 
                type="text" 
                placeholder="Filtrar por nombre del puesto..." 
                className="w-full pl-12 pr-4 py-3.5 bg-white border-2 border-slate-100 rounded-2xl text-xs font-bold focus:border-teal-500 focus:bg-white outline-none transition-all shadow-sm"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />
            </div>
            <button className="p-3.5 bg-white border-2 border-slate-100 rounded-2xl text-slate-400 hover:text-teal-600 transition-all shadow-sm">
              <Filter size={20} />
            </button>
          </div>
        </div>

        {/* LISTADO DE PUESTOS */}
        <div className="grid grid-cols-1 gap-6">
          {filteredStations.length === 0 ? (
            <div className="bg-white rounded-[2.5rem] p-20 text-center border-2 border-dashed border-slate-200">
              <div className="w-20 h-20 bg-slate-50 rounded-full flex items-center justify-center mx-auto mb-6">
                <Search size={32} className="text-slate-200" />
              </div>
              <h4 className="text-lg font-black text-slate-900 uppercase tracking-tighter">Sin coincidencias tácticas</h4>
              <p className="text-sm font-medium text-slate-400 mt-1">Ajusta los filtros o carga nuevos puestos oficiales.</p>
            </div>
          ) : (
            filteredStations.map((station) => {
              const isComplete = station.reportedTables === station.totalTables && station.totalTables > 0;
              const percentage = station.totalTables > 0 ? Math.round((station.reportedTables / station.totalTables) * 100) : 0;
              
              // Calcular resultados por puesto
              const stationReports = e14Reports.filter(r => r.stationId === station.id);
              const stationMyVotes = stationReports.reduce((acc, curr) => acc + curr.votesCandidate, 0);
              const stationOpponentVotes = stationReports.reduce((acc, curr) => acc + curr.votesOpponent, 0);
              const stationTotal = stationMyVotes + stationOpponentVotes;
              const stationDiff = stationMyVotes - stationOpponentVotes;

              return (
                <div key={station.id} className="bg-white rounded-[3rem] border-2 border-slate-100 shadow-sm overflow-hidden group hover:border-teal-500/20 transition-all">
                  <div className="p-8 md:p-10 flex flex-col xl:flex-row items-stretch xl:items-center gap-10">
                    
                    {/* INFO PUESTO - LEFT COLUMN */}
                    <div className="flex items-center gap-6 min-w-[320px] shrink-0">
                      <div className={cn(
                        "w-20 h-20 rounded-[2rem] flex flex-col items-center justify-center shrink-0 border-4 transition-all shadow-inner",
                        isComplete ? "bg-emerald-50 text-emerald-600 border-emerald-100" : 
                        percentage > 0 ? "bg-amber-50 text-amber-600 border-amber-100" : "bg-slate-50 text-slate-300 border-slate-100"
                      )}>
                        <span className="text-xl font-black leading-none">{percentage}%</span>
                        <span className="text-[8px] font-black uppercase tracking-tighter opacity-60">Status</span>
                      </div>
                      <div className="space-y-2">
                        <h4 className="text-2xl font-black text-slate-900 tracking-tight uppercase group-hover:text-teal-600 transition-colors leading-none">{station.name}</h4>
                        <div className="flex flex-wrap items-center gap-3">
                           <div className="flex items-center gap-1.5 px-3 py-1 bg-slate-50 rounded-full border border-slate-100">
                              <ShieldCheck size={12} className="text-teal-600" />
                              <span className="text-[9px] font-black text-slate-500 uppercase tracking-widest">{station.witnessesCount} Testigos</span>
                           </div>
                           <div className="flex items-center gap-1.5 px-3 py-1 bg-slate-50 rounded-full border border-slate-100">
                              <span className="text-[9px] font-black text-slate-500 uppercase tracking-widest">Mesas: {station.reportedTables}/{station.totalTables}</span>
                           </div>
                        </div>
                      </div>
                    </div>

                    {/* RESULTADOS PUESTO - MIDDLE COLUMN */}
                    <div className="flex-1 min-w-[250px] bg-slate-50/50 p-6 rounded-[2rem] border border-slate-100 space-y-4">
                       <div className="flex justify-between items-center px-2">
                          <p className="text-[9px] font-black uppercase tracking-widest text-slate-400">Resultado Local</p>
                          <span className={cn("text-[10px] font-black uppercase px-2 py-0.5 rounded-md", stationDiff >= 0 ? "bg-emerald-100 text-emerald-700" : "bg-rose-100 text-rose-700")}>
                            {stationDiff >= 0 ? 'Liderando' : 'Debajo'} por {Math.abs(stationDiff).toLocaleString()}
                          </span>
                       </div>
                       <div className="space-y-2">
                          <div className="flex justify-between text-xs font-black uppercase">
                             <span className="text-teal-600">Nosotros: {stationMyVotes.toLocaleString()}</span>
                             <span className="text-rose-500">Oponente: {stationOpponentVotes.toLocaleString()}</span>
                          </div>
                          <div className="h-2 w-full bg-slate-200 rounded-full overflow-hidden flex">
                             <div className="h-full bg-teal-500" style={{ width: `${stationTotal > 0 ? (stationMyVotes / stationTotal) * 100 : 50}%` }} />
                             <div className="h-full bg-rose-500" style={{ width: `${stationTotal > 0 ? (stationOpponentVotes / stationTotal) * 100 : 50}%` }} />
                          </div>
                       </div>
                    </div>

                    {/* GRILLA DE MESAS - RIGHT COLUMN */}
                    <div className="flex-1 w-full border-t xl:border-t-0 xl:border-l border-slate-100 pt-8 xl:pt-0 xl:pl-10">
                      <div className="flex justify-between items-center mb-4 px-1">
                         <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Control de Actas E-14</p>
                         <div className="flex gap-2">
                            <div className="flex items-center gap-1.5"><div className="w-2 h-2 rounded-full bg-teal-500" /><span className="text-[8px] font-black text-slate-400 uppercase">Lista</span></div>
                            <div className="flex items-center gap-1.5"><div className="w-2 h-2 rounded-full bg-slate-200" /><span className="text-[8px] font-black text-slate-400 uppercase">Falta</span></div>
                         </div>
                      </div>
                      <div className="flex flex-wrap gap-2.5 max-h-[150px] overflow-y-auto pr-4 custom-scrollbar">
                        {Array.from({ length: station.totalTables }).map((_, i) => {
                          const tableNum = (i + 1).toString();
                          const report = e14Reports.find(r => r.stationId === station.id && r.tableNumber === tableNum);
                          const isReported = !!report;
                          
                          return (
                            <button 
                              key={tableNum}
                              onClick={() => {
                                setSelectedStation(station.id);
                                setNewReport({
                                  tableNumber: tableNum,
                                  votesCandidate: report ? report.votesCandidate : 0,
                                  votesOpponent: report ? report.votesOpponent : 0
                                });
                                setIsModalOpen(true);
                              }}
                              className={cn(
                                "w-11 h-11 rounded-xl flex items-center justify-center transition-all border-2 relative overflow-hidden group/mesa shrink-0",
                                isReported 
                                  ? "bg-teal-600 text-white border-teal-500 shadow-md hover:scale-110 z-10" 
                                  : "bg-white text-slate-400 border-slate-100 hover:border-teal-500 hover:text-teal-600"
                              )}
                            >
                              <span className="text-[10px] font-black relative z-10">{tableNum}</span>
                              {isReported && (
                                <CheckCircle2 size={10} className="absolute top-1 right-1 text-teal-200" />
                              )}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>

      {/* MODAL DE INGRESO E-14 (POLISHED) */}
      {isModalOpen && (
        <div className="fixed inset-0 bg-slate-900/80 backdrop-blur-md z-[200] flex items-center justify-center p-4">
          <div className="bg-white w-full max-w-xl rounded-[3.5rem] shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200 border-[6px] border-white ring-1 ring-slate-200">
            
            <div className="p-10 pb-6 flex justify-between items-start">
              <div className="space-y-1">
                <div className="flex items-center gap-2 mb-2">
                   <span className="px-2 py-0.5 bg-slate-900 text-white text-[8px] font-black uppercase tracking-widest rounded-md">Formulario E-14</span>
                   <span className="text-[10px] font-black text-teal-600 uppercase tracking-widest">Validación Oficial</span>
                </div>
                <h3 className="text-4xl font-black text-slate-900 tracking-tight leading-none uppercase">Registro de Votos</h3>
                <p className="text-slate-500 font-bold uppercase text-[9px] tracking-widest">Transcripción Forense de Datos por Mesa</p>
              </div>
              <button onClick={() => setIsModalOpen(false)} className="p-4 bg-slate-100 text-slate-400 hover:text-rose-500 hover:bg-rose-50 rounded-full transition-all group">
                <X size={24} className="group-hover:rotate-90 transition-transform" />
              </button>
            </div>

            <form onSubmit={handleReport} className="p-10 pt-4 space-y-10">
              
              <div className="flex items-center gap-4 bg-slate-50 p-6 rounded-3xl border-2 border-slate-100">
                <div className="w-14 h-14 bg-white rounded-2xl flex items-center justify-center text-slate-900 border border-slate-200 shadow-sm font-black text-xl">
                  {newReport.tableNumber}
                </div>
                <div>
                  <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-0.5">Mesa en proceso</p>
                  <h4 className="text-sm font-black text-slate-900 uppercase truncate max-w-[250px]">{pollingStations.find(s => s.id === selectedStation)?.name}</h4>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {/* Candidato */}
                <div className="space-y-4">
                  <div className="flex items-center justify-between px-2">
                    <label className="text-[10px] font-black uppercase text-teal-600 tracking-widest">Nuestra Votación</label>
                    <TrendingUp size={14} className="text-teal-500" />
                  </div>
                  <div className="relative group">
                    <input 
                      required 
                      type="number" 
                      min="0"
                      autoFocus
                      className="w-full px-8 py-10 bg-teal-50/50 border-4 border-teal-100 rounded-[2.5rem] text-6xl font-black text-teal-900 focus:border-teal-500 focus:bg-white outline-none transition-all text-center tabular-nums shadow-inner" 
                      value={newReport.votesCandidate || ''} 
                      onChange={e => setNewReport({...newReport, votesCandidate: Number(e.target.value)})} 
                    />
                    <div className="absolute top-4 right-8 text-[9px] font-black text-teal-400 uppercase">Votos</div>
                  </div>
                </div>

                {/* Oponente */}
                <div className="space-y-4">
                  <div className="flex items-center justify-between px-2">
                    <label className="text-[10px] font-black uppercase text-rose-500 tracking-widest">Oponente (2º)</label>
                    <Users size={14} className="text-rose-400" />
                  </div>
                  <div className="relative group">
                    <input 
                      required 
                      type="number" 
                      min="0"
                      className="w-full px-8 py-10 bg-rose-50/30 border-4 border-rose-100 rounded-[2.5rem] text-6xl font-black text-rose-900 focus:border-rose-500 focus:bg-white outline-none transition-all text-center tabular-nums shadow-inner" 
                      value={newReport.votesOpponent || ''} 
                      onChange={e => setNewReport({...newReport, votesOpponent: Number(e.target.value)})} 
                    />
                    <div className="absolute top-4 right-8 text-[9px] font-black text-rose-300 uppercase">Votos</div>
                  </div>
                </div>
              </div>

              {/* Botones de Acción */}
              <div className="flex flex-col sm:flex-row gap-4 pt-4">
                <button 
                  type="button" 
                  onClick={() => setIsModalOpen(false)} 
                  className="flex-1 px-8 py-6 bg-slate-50 text-slate-400 rounded-3xl text-xs font-black uppercase tracking-widest hover:bg-slate-100 transition-all border-2 border-transparent"
                >
                  Cancelar
                </button>
                <button 
                  type="submit" 
                  className="flex-[2] px-8 py-6 bg-slate-900 text-white rounded-3xl text-xs font-black uppercase tracking-[0.2em] shadow-2xl shadow-slate-300 hover:bg-teal-600 transition-all flex items-center justify-center gap-3 group"
                >
                  <ShieldCheck size={18} className="group-hover:scale-110 transition-transform" /> Guardar Acta E-14
                </button>
              </div>

            </form>
          </div>
        </div>
      )}
    </div>
  );
}
