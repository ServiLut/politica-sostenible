"use client";

import React, { useState, useMemo } from 'react';
import { useSearchParams, useRouter, usePathname } from 'next/navigation';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { 
  X, 
  Inbox, 
  Search, 
  TrendingUp, 
  Zap, 
  Users,
  ShieldCheck,
  BarChart3,
  CheckCircle2,
  Trophy,
  ArrowRightLeft,
  Target,
  LayoutGrid,
  Activity,
  AlertCircle,
  ChevronRight,
  ChevronLeft
} from 'lucide-react';
import { cn } from '@/components/ui/utils';
import { SearchableSelect } from '@/components/ui/SearchableSelect';

export default function WarRoomPage() {
  const queryClient = useQueryClient();
  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();

  const [isModalOpen, setIsModalOpen] = useState(false);
  
  // URL Params logic
  const deptFilter = searchParams.get('dept') || '';
  const muniFilter = searchParams.get('muni') || '';
  const activeTab = (searchParams.get('tab') || 'all') as 'all' | 'pending' | 'completed';
  const currentStationPage = Number(searchParams.get('page')) || 1;
  const stationsPerPage = 10;

  const updateParams = (updates: { dept?: string; muni?: string; tab?: string; page?: number; clear?: boolean }) => {
    const params = new URLSearchParams(searchParams.toString());
    
    if (updates.clear) {
      params.delete('dept');
      params.delete('muni');
      params.delete('tab');
      params.set('page', '1');
    } else {
      if (updates.dept !== undefined) {
        params.set('dept', updates.dept);
        params.delete('muni');
        params.set('page', '1');
      }
      if (updates.muni !== undefined) {
        params.set('muni', updates.muni);
        params.set('page', '1');
      }
      if (updates.tab !== undefined) {
        params.set('tab', updates.tab);
        params.set('page', '1');
      }
      if (updates.page !== undefined) {
        params.set('page', updates.page.toString());
      }
    }
    
    router.push(`${pathname}?${params.toString()}`, { scroll: false });
  };

  const [selectedStation, setSelectedStation] = useState<string>('');
  const [newReport, setNewReport] = useState({
    tableNumber: '',
    votesCandidate: 0,
    votesOpponent: 0
  });

  const { data: stationsData, isLoading: loadingStations } = useQuery({
    queryKey: ['war-room-stations', deptFilter, muniFilter, currentStationPage],
    queryFn: async () => {
      const url = new URL('/api/logistics/voting-places', window.location.origin);
      url.searchParams.append('page', currentStationPage.toString());
      url.searchParams.append('limit', stationsPerPage.toString());
      if (deptFilter) url.searchParams.append('departamento', deptFilter.toUpperCase());
      if (muniFilter) url.searchParams.append('municipio', muniFilter.toUpperCase());
      
      console.log('WarRoom Fetching from:', url.toString());
      
      const res = await fetch(url.toString());
      if (!res.ok) throw new Error('Error en SIT: ' + res.statusText);
      const json = await res.json();
      return json;
    }
  });

  const { data: deptsData } = useQuery({
    queryKey: ['voting-departments'],
    queryFn: async () => {
      const res = await fetch('/api/logistics/voting-places/departments');
      if (!res.ok) return { data: [] };
      return res.json();
    }
  });

  const { data: munisData } = useQuery({
    queryKey: ['voting-municipalities', deptFilter],
    queryFn: async () => {
      if (!deptFilter) return { data: [] };
      const res = await fetch(`/api/logistics/voting-places/municipalities?departamento=${deptFilter}`);
      if (!res.ok) return { data: [] };
      return res.json();
    },
    enabled: !!deptFilter
  });

  const departmentsList = deptsData?.data || deptsData || [];
  const municipalitiesList = munisData?.data || munisData || [];

  const reportMutation = useMutation({
    mutationFn: async (data: { stationId: string; mesaNumero: number; votosCandidato: number; votosTotales: number }) => {
      const res = await fetch(`/api/logistics/voting-places/${data.stationId}/tables`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          mesaNumero: data.mesaNumero,
          votosCandidato: data.votosCandidato,
          votosTotales: data.votosTotales
        })
      });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['war-room-stations'] });
      setIsModalOpen(false);
      setNewReport({ tableNumber: '', votesCandidate: 0, votesOpponent: 0 });
    }
  });

  const handleReport = (e: React.FormEvent) => {
    e.preventDefault();
    reportMutation.mutate({
      stationId: selectedStation,
      mesaNumero: parseInt(newReport.tableNumber, 10),
      votosCandidato: newReport.votesCandidate,
      votosTotales: newReport.votesCandidate + newReport.votesOpponent
    });
  };

  const getStationsList = () => {
    if (!stationsData) return [];
    if (stationsData.data?.items) return stationsData.data.items;
    if (stationsData.items) return stationsData.items;
    if (Array.isArray(stationsData.data)) return stationsData.data;
    if (Array.isArray(stationsData)) return stationsData;
    return [];
  };

  const pollingStations = getStationsList();
  const stationsTotalPages = stationsData?.data?.totalPages ?? stationsData?.totalPages ?? 1;
  
  // Totales Globales del API
  const myVotes = pollingStations.reduce((acc: number, s: any) => acc + (s.totalVotosCandidato || 0), 0);
  const totalVotesMesa = pollingStations.reduce((acc: number, s: any) => acc + (s.totalVotosMesa || 0), 0);
  const opponentVotes = totalVotesMesa - myVotes;
  const tablesReported = pollingStations.reduce((acc: number, s: any) => acc + (s.totalMesasRegistradas || 0), 0);
  const totalTables = pollingStations.reduce((acc: number, s: any) => acc + (s.totalMesas || 0), 0) || 1;

  const reportedPercentage = Math.round((tablesReported / totalTables) * 100);
  const totalVotesCounted = myVotes + opponentVotes;
  const myWinPercentage = totalVotesCounted > 0 ? Math.round((myVotes / totalVotesCounted) * 100) : 0;
  const opponentWinPercentage = totalVotesCounted > 0 ? 100 - myWinPercentage : 0;
  const lead = myVotes - opponentVotes;

  const filteredStations = useMemo(() => {
    return pollingStations
      .filter((s: any) => {
        const totalMesasNum = s.totalMesas || 0;
        const registradasNum = s.totalMesasRegistradas || 0;
        const isComplete = registradasNum >= totalMesasNum && totalMesasNum > 0;
        if (activeTab === 'pending') return !isComplete;
        if (activeTab === 'completed') return isComplete;
        return true;
      })
      .sort((a: any, b: any) => (b.totalMesas || 0) - (a.totalMesas || 0));
  }, [pollingStations, activeTab]);

  return (
    <div className="space-y-8 pb-20 animate-in fade-in duration-700">
      
      {/* HEADER ESTRATÉGICO */}
      <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center gap-6">
        <div className="space-y-2">
          <div className="flex items-center gap-3 mb-1">
            <div className="flex items-center gap-1.5 px-3 py-1 bg-rose-600 text-white text-[10px] font-black uppercase tracking-[0.2em] rounded-lg shadow-lg shadow-rose-200 animate-pulse">
              <Activity size={12} /> Live
            </div>
            <span className="px-3 py-1 bg-slate-900 text-teal-400 text-[10px] font-black uppercase tracking-[0.2em] rounded-lg border border-slate-800">
              Elecciones Colombia 2026
            </span>
          </div>
          <h1 className="text-5xl font-black text-slate-900 tracking-tighter uppercase leading-none italic">
            War<span className="text-teal-600">Room</span>.SIT
          </h1>
          <p className="text-slate-400 font-bold uppercase text-[10px] tracking-[0.4em] flex items-center gap-2">
            <Target size={12} className="text-teal-500" /> Centro de Operaciones Tácticas
          </p>
        </div>

        <div className="grid grid-cols-2 gap-4 w-full lg:w-auto">
           <div className="bg-white p-4 px-6 rounded-[1.5rem] border-2 border-slate-100 shadow-sm flex flex-col justify-center">
              <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-1">Mesas Procesadas</p>
              <div className="flex items-end gap-2">
                 <span className="text-2xl font-black text-slate-900 leading-none">{tablesReported}</span>
                 <span className="text-xs font-bold text-slate-300 mb-0.5">/ {totalTables}</span>
              </div>
           </div>
           <div className="bg-teal-600 p-4 px-6 rounded-[1.5rem] shadow-xl shadow-teal-100 flex flex-col justify-center">
              <p className="text-[9px] font-black text-teal-100/60 uppercase tracking-widest mb-1 text-center">Avance Nacional</p>
              <p className="text-2xl font-black text-white leading-none text-center">{reportedPercentage}%</p>
           </div>
        </div>
      </div>

      {/* QUICK STATS SUMMARY */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
         <div className="bg-white p-6 rounded-[2rem] border-2 border-slate-100 shadow-sm flex items-center gap-5 group hover:border-teal-500/30 transition-all">
            <div className="w-14 h-14 bg-teal-50 text-teal-600 rounded-2xl flex items-center justify-center shrink-0 border border-teal-100 shadow-sm group-hover:bg-teal-600 group-hover:text-white transition-all"><Trophy size={24} /></div>
            <div>
               <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Tendencia</p>
               <h4 className="text-xl font-black text-slate-900 leading-tight uppercase">{lead > 0 ? 'Ganando' : lead < 0 ? 'Perdiendo' : 'Empate'}</h4>
            </div>
         </div>
         <div className="bg-white p-6 rounded-[2rem] border-2 border-slate-100 shadow-sm flex items-center gap-5 group hover:border-rose-500/30 transition-all">
            <div className="w-14 h-14 bg-rose-50 text-rose-600 rounded-2xl flex items-center justify-center shrink-0 border border-rose-100 shadow-sm group-hover:bg-rose-600 group-hover:text-white transition-all"><ArrowRightLeft size={24} /></div>
            <div>
               <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Diferencia</p>
               <h4 className={cn("text-xl font-black leading-tight", lead >= 0 ? "text-emerald-600" : "text-rose-600")}>
                 {lead >= 0 ? '+' : ''}{lead.toLocaleString()}
               </h4>
            </div>
         </div>
         <div className="bg-white p-6 rounded-[2rem] border-2 border-slate-100 shadow-sm flex items-center gap-5 group hover:border-amber-500/30 transition-all">
            <div className="w-14 h-14 bg-amber-50 text-amber-600 rounded-2xl flex items-center justify-center shrink-0 border border-amber-100 shadow-sm group-hover:bg-amber-600 group-hover:text-white transition-all"><BarChart3 size={24} /></div>
            <div>
               <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Escrutado</p>
               <h4 className="text-xl font-black text-slate-900 leading-tight">{reportedPercentage}% <span className="text-xs text-slate-400">Mesas</span></h4>
            </div>
         </div>
         <div className="bg-white p-6 rounded-[2rem] border-2 border-slate-100 shadow-sm flex items-center gap-5 group hover:border-indigo-500/30 transition-all">
            <div className="w-14 h-14 bg-indigo-50 text-indigo-600 rounded-2xl flex items-center justify-center shrink-0 border border-indigo-100 shadow-sm group-hover:bg-indigo-600 group-hover:text-white transition-all"><Zap size={24} /></div>
            <div>
               <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Total Votos</p>
               <h4 className="text-xl font-black text-slate-900 leading-tight">{(myVotes + opponentVotes).toLocaleString()}</h4>
            </div>
         </div>
      </div>

      {/* TACTICAL SCOREBOARD */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
        <div className="lg:col-span-9 bg-white rounded-[3.5rem] p-10 md:p-16 border-2 border-slate-100 shadow-2xl relative overflow-hidden flex flex-col justify-center">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-16 relative z-10">
            {/* Nosotros */}
            <div className="space-y-6">
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 bg-teal-600 text-white rounded-2xl flex items-center justify-center shadow-xl shadow-teal-200"><TrendingUp size={24} /></div>
                <div>
                   <p className="text-xs font-black uppercase tracking-[0.3em] text-teal-600">Candidato SIT</p>
                   <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Alianza Sostenible</p>
                </div>
              </div>
              <h2 className="text-8xl md:text-[10rem] font-black tracking-tighter text-slate-900 tabular-nums leading-none">
                {myVotes.toLocaleString()}
              </h2>
              <div className="flex items-center gap-4">
                <div className="px-6 py-2 bg-teal-50 text-teal-700 rounded-2xl text-xl font-black border-2 border-teal-100 shadow-inner">
                  {myWinPercentage}%
                </div>
                <div className="h-px flex-1 bg-slate-100" />
              </div>
            </div>

            {/* Oponente */}
            <div className="space-y-6 md:text-right flex flex-col md:items-end">
              <div className="flex items-center gap-3 md:flex-row-reverse">
                <div className="w-12 h-12 bg-rose-50 text-rose-600 rounded-2xl flex items-center justify-center border-2 border-rose-100 shadow-sm"><Users size={24} /></div>
                <div>
                   <p className="text-xs font-black uppercase tracking-[0.3em] text-rose-500">Opositor Principal</p>
                   <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Bloque Tradicional</p>
                </div>
              </div>
              <h2 className="text-8xl md:text-[10rem] font-black tracking-tighter text-slate-200 tabular-nums leading-none">
                {opponentVotes.toLocaleString()}
              </h2>
              <div className="flex items-center gap-4 md:flex-row-reverse w-full">
                <div className="px-6 py-2 bg-rose-50 text-rose-700 rounded-2xl text-xl font-black border-2 border-rose-100 shadow-inner">
                  {opponentWinPercentage}%
                </div>
                <div className="h-px flex-1 bg-slate-100" />
              </div>
            </div>
          </div>

          <div className="mt-20 space-y-6 relative z-10">
             <div className="flex justify-between items-center px-2">
                <div className="flex items-center gap-2">
                   <div className="w-2 h-2 rounded-full bg-teal-500 animate-ping" />
                   <p className="text-[10px] font-black uppercase tracking-[0.4em] text-teal-600">Ventaja Competitiva</p>
                </div>
                <div className="px-5 py-2 bg-slate-900 text-white rounded-full text-xs font-black uppercase tracking-widest shadow-2xl">
                  Lead: {lead >= 0 ? '+' : ''}{lead.toLocaleString()} Votos
                </div>
                <p className="text-[10px] font-black uppercase tracking-[0.4em] text-rose-400 text-right">Contención</p>
             </div>
             <div className="h-10 w-full flex rounded-[1.5rem] overflow-hidden shadow-2xl p-1 bg-white border-2 border-slate-100">
                <div className="h-full bg-teal-500 transition-all duration-1000 rounded-l-[1rem] relative" style={{ width: `${myWinPercentage}%` }}>
                   <div className="absolute inset-0 bg-gradient-to-r from-white/20 to-transparent" />
                </div>
                <div className="h-full bg-rose-500 transition-all duration-1000 rounded-r-[1rem] relative" style={{ width: `${opponentWinPercentage}%` }}>
                   <div className="absolute inset-0 bg-gradient-to-l from-white/20 to-transparent" />
                </div>
             </div>
          </div>

          <div className="absolute top-0 right-0 w-[500px] h-[500px] bg-teal-50/20 rounded-full -translate-y-1/2 translate-x-1/2 blur-[100px]" />
          <div className="absolute bottom-0 left-0 w-[400px] h-[400px] bg-rose-50/10 rounded-full translate-y-1/2 -translate-x-1/2 blur-[100px]" />
        </div>

        <div className="lg:col-span-3 space-y-6">
           <div className="bg-slate-900 rounded-[2.5rem] p-8 text-white h-full relative overflow-hidden flex flex-col justify-between group">
              <div className="relative z-10">
                 <p className="text-xs font-black uppercase tracking-[0.4em] text-teal-400 mb-8">Escrutinio Total</p>
                 <div className="relative w-40 h-40 mx-auto mb-8">
                    <svg className="w-full h-full transform -rotate-90">
                      <circle cx="80" cy="80" r="72" stroke="currentColor" strokeWidth="6" fill="transparent" className="text-white/5" />
                      <circle cx="80" cy="80" r="72" stroke="currentColor" strokeWidth="10" fill="transparent" 
                        strokeDasharray={452.4} strokeDashoffset={452.4 - (452.4 * reportedPercentage) / 100}
                        strokeLinecap="round"
                        className="text-teal-500 transition-all duration-1000" 
                      />
                    </svg>
                    <div className="absolute inset-0 flex flex-col items-center justify-center">
                      <span className="text-4xl font-black tracking-tighter">{reportedPercentage}%</span>
                      <span className="text-[8px] font-black text-teal-400 uppercase tracking-widest mt-1">Avance</span>
                    </div>
                 </div>
                 <div className="space-y-4">
                    <div className="flex justify-between items-center border-b border-white/10 pb-3">
                       <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Informadas</span>
                       <span className="text-sm font-black text-white">{tablesReported}</span>
                    </div>
                    <div className="flex justify-between items-center border-b border-white/10 pb-3">
                       <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Pendientes</span>
                       <span className="text-sm font-black text-slate-500">{totalTables - tablesReported}</span>
                    </div>
                 </div>
              </div>
              <div className="absolute inset-0 opacity-10 bg-[url('https://www.transparenttextures.com/patterns/carbon-fibre.png')]" />
           </div>
        </div>
      </div>

      {/* DASHBOARD DE CONTROL POR PUESTO */}
      <div className="pt-8 space-y-8">
        <div className="bg-white p-8 rounded-[3rem] border-2 border-slate-100 shadow-sm flex flex-col xl:flex-row justify-between items-center gap-8">
          <div className="flex items-center gap-4">
            <div className="w-14 h-14 bg-teal-50 text-teal-600 rounded-2xl flex items-center justify-center border border-teal-100 shadow-inner"><LayoutGrid size={24} /></div>
            <div>
              <h3 className="text-2xl font-black text-slate-900 tracking-tighter uppercase leading-none mb-1">Puestos de Votación</h3>
              <p className="text-[10px] font-black text-slate-400 uppercase tracking-[0.3em]">Gestión de Actas E-14 por Puesto</p>
            </div>
          </div>

          <div className="flex flex-wrap items-center justify-center gap-4 w-full xl:w-auto">
            <div className="flex bg-slate-100 p-1.5 rounded-[1.25rem] border border-slate-200 shadow-inner overflow-hidden">
               {[
                 { id: 'all', label: 'Todos' },
                 { id: 'pending', label: 'Pendientes' },
                 { id: 'completed', label: 'Completados' }
               ].map(tab => (
                 <button 
                  key={tab.id}
                  onClick={() => updateParams({ tab: tab.id })}
                  className={cn(
                    "px-6 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all",
                    activeTab === tab.id 
                      ? "bg-white text-slate-900 shadow-lg" 
                      : "text-slate-500 hover:text-slate-700"
                  )}
                 >
                   {tab.label}
                 </button>
               ))}
            </div>

            <div className="flex flex-col md:flex-row items-center gap-3">
              {/* Filtro Departamento */}
              <div className="w-full md:w-56">
                <SearchableSelect
                  options={departmentsList}
                  value={deptFilter}
                  onChange={(val) => updateParams({ dept: val })}
                  placeholder="Departamento..."
                />
              </div>

              {/* Filtro Municipio */}
              <div className="w-full md:w-56">
                <SearchableSelect
                  options={municipalitiesList}
                  value={muniFilter}
                  onChange={(val) => updateParams({ muni: val })}
                  placeholder="Municipio..."
                  disabled={!deptFilter}
                />
              </div>
            </div>
          </div>
        </div>

        {/* LISTADO DE PUESTOS */}
        <div className="grid grid-cols-1 gap-8">
          {loadingStations ? (
            <div className="py-20 flex flex-col items-center justify-center text-teal-600">
              <div className="w-8 h-8 border-4 border-teal-600 border-t-transparent rounded-full animate-spin mb-4"></div>
              <p className="text-[10px] font-black uppercase tracking-widest">Consultando SIT...</p>
            </div>
          ) : (stationsData as any)?.error ? (
            <div className="py-20 flex flex-col items-center justify-center text-rose-500 bg-white rounded-[3.5rem] border-2 border-slate-100 shadow-sm">
              <AlertCircle size={48} className="opacity-20 mb-4" />
              <p className="text-xs font-black uppercase tracking-widest text-center px-10">
                Error del Sistema: {(stationsData as any).error.message || "No se pudo conectar con el servidor"}
              </p>
            </div>
          ) : filteredStations.length === 0 ? (
            <div className="bg-white rounded-[3.5rem] p-24 text-center border-2 border-dashed border-slate-200">
              <div className="w-24 h-24 bg-slate-50 rounded-[2.5rem] flex items-center justify-center mx-auto mb-8 border border-slate-100">
                <Search size={40} className="text-slate-200" />
              </div>
              <h4 className="text-xl font-black text-slate-900 uppercase tracking-tighter">Sin resultados operacionales</h4>
            </div>
          ) : (
            filteredStations.map((station: any) => {
              const isComplete = station.totalMesasRegistradas >= station.totalMesas && station.totalMesas > 0;
              const percentage = station.totalMesas > 0 ? Math.round((station.totalMesasRegistradas / station.totalMesas) * 100) : 0;
              const stationMyVotes = station.totalVotosCandidato || 0;
              const stationTotal = station.totalVotosMesa || 0;
              const stationOpponentVotes = stationTotal - stationMyVotes;
              const stationDiff = stationMyVotes - stationOpponentVotes;

              return (
                <div key={station.id} className="bg-white rounded-[3.5rem] border-2 border-slate-100 shadow-sm overflow-hidden group hover:border-teal-500/20 transition-all duration-500">
                  <div className="flex flex-col lg:grid lg:grid-cols-12 items-stretch">
                    <div className="lg:col-span-3 p-10 flex flex-col justify-center bg-slate-50/30 border-b lg:border-b-0 lg:border-r border-slate-100">
                       <div className="flex items-center gap-5 mb-6">
                          <div className={cn(
                            "w-20 h-20 rounded-[2.25rem] flex flex-col items-center justify-center shrink-0 border-4 transition-all shadow-xl",
                            isComplete ? "bg-emerald-600 text-white border-emerald-400" : 
                            percentage > 0 ? "bg-amber-50 text-white border-amber-300" : "bg-white text-slate-300 border-slate-100"
                          )}>
                            <span className="text-2xl font-black leading-none">{percentage}%</span>
                            <span className="text-[8px] font-black uppercase tracking-tighter opacity-80">Sync</span>
                          </div>
                          <div>
                             <h4 className="text-2xl font-black text-slate-900 tracking-tight uppercase group-hover:text-teal-600 transition-colors leading-tight">
                               {station.nombre || station.puesto}
                             </h4>
                             <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest">{station.municipio}, {station.departamento}</p>
                          </div>
                       </div>
                       <div className="space-y-3">
                          <div className="flex items-center justify-between text-[10px] font-black uppercase tracking-widest text-slate-400 px-1">
                             <div className="flex items-center gap-2"><ShieldCheck size={14} className="text-teal-600" /> Registradas</div>
                             <span className="text-slate-900">{station.totalMesasRegistradas}</span>
                          </div>
                          <div className="flex items-center justify-between text-[10px] font-black uppercase tracking-widest text-slate-400 px-1">
                             <div className="flex items-center gap-2"><LayoutGrid size={14} className="text-teal-600" /> Total Mesas</div>
                             <span className="text-slate-900">{station.totalMesas}</span>
                          </div>
                       </div>
                    </div>

                    <div className="lg:col-span-4 p-10 flex flex-col justify-center border-b lg:border-b-0 lg:border-r border-slate-100 space-y-6">
                       <div className="flex justify-between items-end mb-2 px-2">
                          <p className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400">Escenario Local</p>
                          <span className={cn(
                            "px-3 py-1 rounded-lg text-[10px] font-black uppercase tracking-widest flex items-center gap-2",
                            stationDiff >= 0 ? "bg-emerald-50 text-emerald-700" : "bg-rose-50 text-rose-700"
                          )}>
                            {stationDiff >= 0 ? <Trophy size={12} /> : <AlertCircle size={12} />}
                            {Math.abs(stationDiff).toLocaleString()}
                          </span>
                       </div>
                       <div className="grid grid-cols-2 gap-4">
                          <div className="bg-teal-50/50 p-4 rounded-2xl border border-teal-100/50">
                             <p className="text-[9px] font-black text-teal-600 uppercase mb-1">SIT</p>
                             <p className="text-2xl font-black text-teal-900 leading-none">{stationMyVotes.toLocaleString()}</p>
                          </div>
                          <div className="bg-rose-50/30 p-4 rounded-2xl border border-rose-100/50">
                             <p className="text-[9px] font-black text-rose-500 uppercase mb-1">Opo</p>
                             <p className="text-2xl font-black text-rose-900 leading-none">{stationOpponentVotes.toLocaleString()}</p>
                          </div>
                       </div>
                       <div className="h-2 w-full bg-slate-100 rounded-full overflow-hidden flex">
                          <div className="h-full bg-teal-500" style={{ width: `${stationTotal > 0 ? (stationMyVotes / stationTotal) * 100 : 50}%` }} />
                          <div className="h-full bg-rose-500" style={{ width: `${stationTotal > 0 ? (stationOpponentVotes / stationTotal) * 100 : 50}%` }} />
                       </div>
                    </div>

                    <div className="lg:col-span-5 p-10 flex flex-col">
                       <div className="flex justify-between items-center mb-6 px-2">
                          <div className="flex items-center gap-2 text-teal-600">
                             <Inbox size={16} />
                             <p className="text-[10px] font-black uppercase tracking-[0.2em]">Control E-14</p>
                          </div>
                       </div>
                       <div className="flex-1 overflow-y-auto pr-4 custom-scrollbar max-h-[200px]">
                          <div className="flex flex-wrap gap-2.5">
                            {Array.from({ length: station.totalMesas || 0 }).map((_, i) => {
                              const tableNum = i + 1;
                              // El API no devuelve el detalle de qué mesas están registradas en el listado, 
                              // pero podemos inferir o cargar bajo demanda. 
                              // Para el prototipo, asumimos las primeras X mesas están registradas según station.totalMesasRegistradas
                              const isReported = tableNum <= station.totalMesasRegistradas;
                              return (
                                <button 
                                  key={tableNum}
                                  onClick={() => {
                                    setSelectedStation(station.id);
                                    setNewReport({
                                      tableNumber: tableNum.toString(),
                                      votesCandidate: 0, // En un sistema real cargaríamos el resultado actual
                                      votesOpponent: 0
                                    });
                                    setIsModalOpen(true);
                                  }}
                                  className={cn(
                                    "w-12 h-12 rounded-[1rem] flex items-center justify-center transition-all border-2 shrink-0 relative",
                                    isReported 
                                      ? "bg-slate-900 text-white border-slate-900 shadow-xl" 
                                      : "bg-white text-slate-400 border-slate-100 hover:border-teal-500 hover:text-teal-600"
                                  )}
                                >
                                  <span className="text-[11px] font-black">{tableNum}</span>
                                  {isReported && <CheckCircle2 size={10} className="absolute bottom-1 right-1 text-teal-400" />}
                                </button>
                              );
                            })}
                          </div>
                       </div>
                       <div className="mt-6 pt-6 border-t border-slate-50 flex justify-end">
                          <button className="flex items-center gap-2 text-[10px] font-black uppercase tracking-[0.2em] text-slate-400 hover:text-teal-600 transition-colors">
                             Ver Detalles <ChevronRight size={14} />
                          </button>
                       </div>
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* PAGINACIÓN */}
        {!loadingStations && stationsTotalPages > 1 && (
          <div className="flex items-center justify-between bg-white p-8 rounded-[3rem] border-2 border-slate-100 shadow-sm mt-8">
            <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">
              Página <span className="text-teal-600">{currentStationPage}</span> de {stationsTotalPages}
            </p>
            <div className="flex gap-3">
              <button
                disabled={currentStationPage === 1}
                onClick={() => updateParams({ page: currentStationPage - 1 })}
                className="p-4 bg-slate-50 border-2 border-slate-100 rounded-2xl text-slate-400 hover:text-teal-600 disabled:opacity-30 transition-all hover:bg-white hover:border-teal-500 shadow-sm"
              >
                <ChevronLeft size={20} />
              </button>
              <button
                disabled={currentStationPage === stationsTotalPages}
                onClick={() => updateParams({ page: currentStationPage + 1 })}
                className="p-4 bg-slate-50 border-2 border-slate-100 rounded-2xl text-slate-400 hover:text-teal-600 disabled:opacity-30 transition-all hover:bg-white hover:border-teal-500 shadow-sm"
              >
                <ChevronRight size={20} />
              </button>
            </div>
          </div>
        )}
      </div>

      {/* MODAL DE INGRESO E-14 */}
      {isModalOpen && (
        <div className="fixed inset-0 bg-slate-900/90 backdrop-blur-xl z-[200] flex items-center justify-center p-4">
          <div className="bg-white w-full max-w-2xl rounded-[4rem] shadow-2xl overflow-hidden border-[8px] border-white ring-1 ring-slate-200">
            <div className="p-12 pb-8 flex justify-between items-start">
              <div className="space-y-2">
                <div className="flex items-center gap-3 mb-2">
                   <div className="px-3 py-1 bg-slate-900 text-white text-[9px] font-black uppercase rounded-lg">E-14</div>
                   <span className="text-xs font-black text-teal-600 uppercase">Auditoría SIT</span>
                </div>
                <h3 className="text-5xl font-black text-slate-900 tracking-tighter leading-none uppercase italic">Votos <span className="text-teal-600">Mesa</span></h3>
              </div>
              <button onClick={() => setIsModalOpen(false)} className="p-5 bg-slate-100 text-slate-400 hover:text-rose-600 rounded-full transition-all group"><X size={28} /></button>
            </div>
            <form onSubmit={handleReport} className="p-12 pt-0 space-y-12">
              <div className="flex items-center gap-6 bg-slate-50 p-8 rounded-[2.5rem] border-2 border-slate-100">
                <div className="w-20 h-20 bg-white rounded-[1.75rem] flex items-center justify-center text-slate-900 border-2 border-slate-200 shadow-xl font-black text-3xl italic">{newReport.tableNumber}</div>
                <div>
                  <p className="text-[10px] font-black text-slate-400 uppercase mb-1">Estación</p>
                  <h4 className="text-2xl font-black text-slate-900 uppercase">
                    {pollingStations.find((s: any) => s.id === selectedStation)?.nombre}
                  </h4>
                </div>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                <div className="space-y-5">
                  <label className="text-[11px] font-black uppercase text-teal-600 px-4">Candidato SIT</label>
                  <input required type="number" min="0" autoFocus className="w-full px-8 py-12 bg-teal-50/50 border-[6px] border-teal-100 rounded-[3.5rem] text-7xl font-black text-teal-900 focus:border-teal-500 focus:bg-white outline-none transition-all text-center" value={newReport.votesCandidate || ''} onChange={e => setNewReport({...newReport, votesCandidate: Number(e.target.value)})} />
                </div>
                <div className="space-y-5">
                  <label className="text-[11px] font-black uppercase text-rose-500 px-4">Oposición</label>
                  <input required type="number" min="0" className="w-full px-8 py-12 bg-rose-50/30 border-[6px] border-rose-100 rounded-[3.5rem] text-7xl font-black text-rose-900 focus:border-rose-500 focus:bg-white outline-none transition-all text-center" value={newReport.votesOpponent || ''} onChange={e => setNewReport({...newReport, votesOpponent: Number(e.target.value)})} />
                </div>
              </div>
              <div className="flex flex-col sm:flex-row gap-6 pt-4">
                <button type="button" onClick={() => setIsModalOpen(false)} className="flex-1 px-10 py-8 bg-slate-50 text-slate-400 rounded-[2rem] text-xs font-black uppercase hover:bg-slate-100 transition-all">Descartar</button>
                <button type="submit" disabled={reportMutation.isPending} className="flex-[2] px-10 py-8 bg-slate-900 text-white rounded-[2rem] text-sm font-black uppercase shadow-2xl hover:bg-teal-600 transition-all flex items-center justify-center gap-4">
                  {reportMutation.isPending ? <div className="w-6 h-6 border-4 border-white border-t-transparent rounded-full animate-spin" /> : <ShieldCheck size={24} className="text-teal-400" />}
                  Confirmar
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
