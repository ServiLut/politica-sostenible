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
  ChevronLeft,
  RotateCcw
} from 'lucide-react';
import { cn } from '@/components/ui/utils';
import { SearchableSelect } from '@/components/ui/SearchableSelect';

export default function WarRoomPage() {
  const queryClient = useQueryClient();
  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isDetailModalOpen, setIsDetailModalOpen] = useState(false);
  const [selectedStationForDetail, setSelectedStationForDetail] = useState<any>(null);
  const [isManualEntry, setIsManualEntry] = useState(false);

  // URL Params logic
  const deptFilter = searchParams.get('dept') || '';
  const muniFilter = searchParams.get('muni') || '';
  const nameFilter = searchParams.get('nombre') || '';
  const activeTab = (searchParams.get('tab') || 'all') as 'all' | 'pending' | 'completed';
  const currentStationPage = Number(searchParams.get('page')) || 1;
  const stationsPerPage = 10;

  const updateParams = (updates: { dept?: string; muni?: string; nombre?: string; tab?: string; page?: number; clear?: boolean }) => {
    const params = new URLSearchParams(searchParams.toString());

    if (updates.clear) {
      params.delete('dept');
      params.delete('muni');
      params.delete('nombre');
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
      if (updates.nombre !== undefined) {
        if (updates.nombre) {
          params.set('nombre', updates.nombre);
        } else {
          params.delete('nombre');
        }
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
  const [reportError, setReportError] = useState<string | null>(null);
  const [newReport, setNewReport] = useState({
    tableNumber: '',
    votesCandidate: '0',
    votesBlank: '0',
    votesOpponent: '0'
  });

  const { data: stationsData, isLoading: loadingStations } = useQuery({
    queryKey: ['war-room-stations', deptFilter, muniFilter, nameFilter, currentStationPage],
    queryFn: async () => {
      const url = new URL('/api/logistics/voting-places', window.location.origin);
      url.searchParams.append('page', currentStationPage.toString());
      url.searchParams.append('limit', stationsPerPage.toString());
      if (deptFilter) url.searchParams.append('departamento', deptFilter.toUpperCase());
      if (muniFilter) url.searchParams.append('municipio', muniFilter.toUpperCase());
      if (nameFilter) url.searchParams.append('nombre', nameFilter);

      const res = await fetch(url.toString());
      if (!res.ok) throw new Error('Error en SIT: ' + res.statusText);
      return res.json();
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
    mutationFn: async (data: { stationId: string; mesaNumero: number; votosCandidato: number; votosBlanco: number; votosTotales: number }) => {
      const res = await fetch(`/api/logistics/voting-places/${data.stationId}/tables`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          mesaNumero: data.mesaNumero,
          votosCandidato: data.votosCandidato,
          votosBlanco: data.votosBlanco,
          votosTotales: data.votosTotales
        })
      });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['war-room-stations'] });
      setIsModalOpen(false);
      setNewReport({ tableNumber: '', votesCandidate: '0', votesBlank: '0', votesOpponent: '0' });
    }
  });

  const completeMutation = useMutation({
    mutationFn: async (data: { stationId: string; isComplete: boolean }) => {
      const res = await fetch(`/api/logistics/voting-places/${data.stationId}/complete`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ isComplete: data.isComplete })
      });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['war-room-stations'] });
    }
  });

  const handleReport = (e: React.FormEvent) => {
    e.preventDefault();
    setReportError(null);

    const tableNum = parseInt(newReport.tableNumber, 10);
    const vCandidate = parseInt(newReport.votesCandidate, 10);
    const vBlank = parseInt(newReport.votesBlank, 10);
    const vOpponent = parseInt(newReport.votesOpponent, 10);

    if (isNaN(tableNum)) {
      setReportError('El número de mesa no es válido.');
      return;
    }

    if (isNaN(vCandidate) || isNaN(vBlank) || isNaN(vOpponent)) {
      setReportError('Los votos deben ser números.');
      return;
    }

    if (vCandidate < 0 || vBlank < 0 || vOpponent < 0) {
      setReportError('Los votos no pueden ser negativos.');
      return;
    }

    reportMutation.mutate({
      stationId: selectedStation,
      mesaNumero: tableNum,
      votosCandidato: vCandidate,
      votosBlanco: vBlank,
      votosTotales: vCandidate + vBlank + vOpponent
    }, {
      onError: (error: any) => {
        setReportError(error.message || 'Error al guardar el reporte');
      }
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

  const myVotes = pollingStations.reduce((acc: number, s: any) => acc + (s.totalVotosCandidato || 0), 0);
  const totalVotesMesa = pollingStations.reduce((acc: number, s: any) => acc + (s.totalVotosMesa || 0), 0);
  const blankVotesTotal = pollingStations.reduce((acc: number, s: any) => acc + (s.totalVotosBlanco || 0), 0);
  const opponentVotes = totalVotesMesa - myVotes - blankVotesTotal;

  // Solo contamos mesas que tengan votos reales registrados
  const tablesReported = pollingStations.reduce((acc: number, s: any) => {
    const validTables = s.tables?.filter((t: any) => (t.votosTotales || 0) > 0).length || 0;
    return acc + validTables;
  }, 0);

  const totalTables = pollingStations.reduce((acc: number, s: any) => acc + (s.totalMesas || 0), 0) || 1;

  const reportedPercentage = Math.round((tablesReported / totalTables) * 100);
  const totalVotesCounted = myVotes + opponentVotes + blankVotesTotal;
  const myWinPercentage = totalVotesCounted > 0 ? Math.round((myVotes / totalVotesCounted) * 100) : 0;
  const opponentWinPercentage = totalVotesCounted > 0 ? Math.round((opponentVotes / totalVotesCounted) * 100) : 0;
  const blankPercentage = totalVotesCounted > 0 ? 100 - myWinPercentage - opponentWinPercentage : 0;
  const lead = myVotes - opponentVotes;

  const filteredStations = useMemo(() => {
    return pollingStations
      .filter((s: any) => {
        const isComplete = s.isComplete || false;
        if (activeTab === 'pending') return !isComplete;
        if (activeTab === 'completed') return isComplete;
        return true;
      })
      .sort((a: any, b: any) => (b.totalMesas || 0) - (a.totalMesas || 0));
  }, [pollingStations, activeTab]);

  return (
    <div className="max-w-full overflow-x-hidden space-y-6 md:space-y-8 pb-20 animate-in fade-in duration-700">

      {/* HEADER ESTRATÉGICO */}
      <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center gap-5 md:gap-6">
        <div className="space-y-1.5 md:space-y-2">
          <div className="flex items-center gap-2 md:gap-3 mb-1">
            <div className="flex items-center gap-1 px-2 md:px-3 py-1 bg-rose-600 text-white text-[9px] md:text-[10px] font-black uppercase tracking-[0.2em] rounded-lg shadow-lg shadow-rose-200 animate-pulse">
              <Activity size={10} className="md:size-3" /> Live
            </div>
            <span className="px-2 md:px-3 py-1 bg-slate-900 text-teal-400 text-[9px] md:text-[10px] font-black uppercase tracking-[0.2em] rounded-lg border border-slate-800">
              Elecciones 2026
            </span>
          </div>
          <h1 className="text-3xl sm:text-4xl md:text-5xl font-black text-slate-900 tracking-tighter uppercase leading-none italic">
            War<span className="text-teal-600">Room</span>.SIT
          </h1>
          <p className="text-slate-400 font-bold uppercase text-[9px] md:text-[10px] tracking-[0.3em] md:tracking-[0.4em] flex items-center gap-2">
            <Target size={12} className="text-teal-500" /> Operaciones Tácticas
          </p>
        </div>

        <div className="flex justify-end w-full lg:w-auto">
           <div className="bg-teal-600 p-3 md:p-4 px-4 md:px-6 rounded-2xl shadow-xl shadow-teal-100 flex flex-col justify-center min-w-[140px] md:min-w-[180px]">
              <p className="text-[8px] md:text-[9px] font-black text-teal-100/60 uppercase tracking-widest mb-0.5 md:mb-1 text-center">Avance Nacional</p>
              <p className="text-lg md:text-2xl font-black text-white leading-none text-center">{reportedPercentage}%</p>
           </div>
        </div>
      </div>

      {/* QUICK STATS SUMMARY */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 md:gap-6">
         <div className="bg-white p-6 rounded-[1.5rem] md:rounded-[2rem] border-2 border-slate-100 shadow-sm flex items-center gap-4 md:gap-5 group hover:border-blue-500/30 transition-all">
            <div className="w-12 h-12 md:w-14 md:h-14 bg-blue-50 text-blue-600 rounded-xl md:rounded-2xl flex items-center justify-center shrink-0 border border-blue-100 shadow-sm group-hover:bg-blue-600 group-hover:text-white transition-all"><Inbox size={20} className="md:size-6" /></div>
            <div>
               <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Mesas Procesadas</p>
               <h4 className="text-lg md:text-xl font-black text-slate-900 leading-tight">
                 {tablesReported} <span className="text-[10px] text-slate-400">/ {totalTables}</span>
               </h4>
            </div>
         </div>
         <div className="bg-white p-6 rounded-[1.5rem] md:rounded-[2rem] border-2 border-slate-100 shadow-sm flex items-center gap-4 md:gap-5 group hover:border-teal-500/30 transition-all">
            <div className="w-12 h-12 md:w-14 md:h-14 bg-teal-50 text-teal-600 rounded-xl md:rounded-2xl flex items-center justify-center shrink-0 border border-teal-100 shadow-sm group-hover:bg-teal-600 group-hover:text-white transition-all"><Trophy size={20} className="md:size-6" /></div>
            <div>
               <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Tendencia</p>
               <h4 className="text-lg md:text-xl font-black text-slate-900 leading-tight uppercase">{lead > 0 ? 'Ganando' : lead < 0 ? 'Perdiendo' : 'Empate'}</h4>
            </div>
         </div>
         <div className="bg-white p-6 rounded-[1.5rem] md:rounded-[2rem] border-2 border-slate-100 shadow-sm flex items-center gap-4 md:gap-5 group hover:border-rose-500/30 transition-all">
            <div className="w-12 h-12 md:w-14 md:h-14 bg-rose-50 text-rose-600 rounded-xl md:rounded-2xl flex items-center justify-center shrink-0 border border-rose-100 shadow-sm group-hover:bg-rose-600 group-hover:text-white transition-all"><ArrowRightLeft size={20} className="md:size-6" /></div>
            <div>
               <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Diferencia</p>
               <h4 className={cn("text-lg md:text-xl font-black leading-tight", lead >= 0 ? "text-emerald-600" : "text-rose-600")}>
                 {lead >= 0 ? '+' : ''}{lead.toLocaleString()}
               </h4>
            </div>
         </div>
         <div className="bg-white p-6 rounded-[1.5rem] md:rounded-[2rem] border-2 border-slate-100 shadow-sm flex items-center gap-4 md:gap-5 group hover:border-amber-500/30 transition-all">
            <div className="w-12 h-12 md:w-14 md:h-14 bg-amber-50 text-amber-600 rounded-xl md:rounded-2xl flex items-center justify-center shrink-0 border border-amber-100 shadow-sm group-hover:bg-amber-600 group-hover:text-white transition-all"><BarChart3 size={20} className="md:size-6" /></div>
            <div>
               <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Escrutado</p>
               <h4 className="text-lg md:text-xl font-black text-slate-900 leading-tight">{reportedPercentage}% <span className="text-[10px] text-slate-400">Mesas</span></h4>
            </div>
         </div>
         <div className="bg-white p-6 rounded-[1.5rem] md:rounded-[2rem] border-2 border-slate-100 shadow-sm flex items-center gap-4 md:gap-5 group hover:border-indigo-500/30 transition-all">
            <div className="w-12 h-12 md:w-14 md:h-14 bg-indigo-50 text-indigo-600 rounded-xl md:rounded-2xl flex items-center justify-center shrink-0 border border-indigo-100 shadow-sm group-hover:bg-indigo-600 group-hover:text-white transition-all"><Zap size={20} className="md:size-6" /></div>
            <div>
               <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Votos Blanco</p>
               <h4 className="text-lg md:text-xl font-black text-slate-900 leading-tight">{blankVotesTotal.toLocaleString()}</h4>
            </div>
         </div>
         <div className="bg-white p-6 rounded-[1.5rem] md:rounded-[2rem] border-2 border-slate-100 shadow-sm flex items-center gap-4 md:gap-5 group hover:border-slate-500/30 transition-all">
            <div className="w-12 h-12 md:w-14 md:h-14 bg-slate-50 text-slate-600 rounded-xl md:rounded-2xl flex items-center justify-center shrink-0 border border-slate-100 shadow-sm group-hover:bg-slate-600 group-hover:text-white transition-all"><Activity size={20} className="md:size-6" /></div>
            <div>
               <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Total Votos</p>
               <h4 className="text-lg md:text-xl font-black text-slate-900 leading-tight">{totalVotesCounted.toLocaleString()}</h4>
            </div>
         </div>
      </div>

      {/* TACTICAL SCOREBOARD */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 md:gap-8">
        <div className="lg:col-span-9 bg-white rounded-[2.5rem] md:rounded-[3.5rem] p-6 sm:p-10 md:p-16 border-2 border-slate-100 shadow-2xl relative overflow-hidden flex flex-col justify-center">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-8 md:gap-16 relative z-10">
            <div className="space-y-3 md:space-y-6">
              <div className="flex items-center gap-2.5 md:gap-3">
                <div className="w-10 h-10 md:w-12 md:h-12 bg-teal-600 text-white rounded-xl md:rounded-2xl flex items-center justify-center shadow-xl shadow-teal-200"><TrendingUp size={20} className="md:size-6" /></div>
                <div>
                   <p className="text-[10px] md:text-xs font-black uppercase tracking-[0.2em] md:tracking-[0.3em] text-teal-600">Candidato SIT</p>
                   <p className="text-[8px] md:text-[10px] font-bold text-slate-400 uppercase tracking-widest">Alianza Sostenible</p>
                </div>
              </div>
              <h2 className="text-6xl sm:text-7xl md:text-8xl lg:text-[10rem] font-black tracking-tighter text-slate-900 tabular-nums leading-none">
                {myVotes.toLocaleString()}
              </h2>
              <div className="flex items-center gap-3 md:gap-4">
                <div className="px-4 md:px-6 py-1.5 md:py-2 bg-teal-50 text-teal-700 rounded-xl md:rounded-2xl text-lg md:text-xl font-black border-2 border-teal-100 shadow-inner">
                  {myWinPercentage}%
                </div>
                <div className="h-px flex-1 bg-slate-100" />
              </div>
            </div>

            <div className="space-y-3 md:space-y-6 md:text-right flex flex-col md:items-end">
              <div className="flex items-center gap-2.5 md:gap-3 md:flex-row-reverse">
                <div className="w-10 h-10 md:w-12 md:h-12 bg-rose-50 text-rose-600 rounded-xl md:rounded-2xl flex items-center justify-center border-2 border-rose-100 shadow-sm"><Users size={20} className="md:size-6" /></div>
                <div>
                   <p className="text-[10px] md:text-xs font-black uppercase tracking-[0.2em] md:tracking-[0.3em] text-rose-500">Opositor</p>
                   <p className="text-[8px] md:text-[10px] font-bold text-slate-400 uppercase tracking-widest">Bloque Tradicional</p>
                </div>
              </div>
              <h2 className="text-6xl sm:text-7xl md:text-8xl lg:text-[10rem] font-black tracking-tighter text-slate-200 tabular-nums leading-none">
                {opponentVotes.toLocaleString()}
              </h2>
              <div className="flex items-center gap-3 md:gap-4 md:flex-row-reverse w-full">
                <div className="px-4 md:px-6 py-1.5 md:py-2 bg-rose-50 text-rose-700 rounded-xl md:rounded-2xl text-lg md:text-xl font-black border-2 border-rose-100 shadow-inner">
                  {opponentWinPercentage}%
                </div>
                <div className="h-px flex-1 bg-slate-100" />
              </div>
            </div>
          </div>

          <div className="mt-10 md:mt-20 space-y-4 md:space-y-6 relative z-10">
             <div className="flex justify-between items-center px-1 md:px-2">
                <div className="flex items-center gap-2">
                   <div className="w-1.5 h-1.5 md:w-2 md:h-2 rounded-full bg-teal-500 animate-ping" />
                   <p className="text-[8px] md:text-[10px] font-black uppercase tracking-[0.2em] md:tracking-[0.4em] text-teal-600">Tendencia</p>
                </div>
                <div className="px-3 md:px-5 py-1 md:py-2 bg-slate-900 text-white rounded-full text-[9px] md:text-xs font-black uppercase tracking-widest shadow-2xl">
                  {lead >= 0 ? '+' : ''}{lead.toLocaleString()}
                </div>
                <p className="text-[8px] md:text-[10px] font-black uppercase tracking-[0.2em] md:tracking-[0.4em] text-rose-400 text-right">Contención</p>
             </div>
             <div className="h-7 md:h-10 w-full flex rounded-full overflow-hidden shadow-2xl p-0.5 md:p-1 bg-white border-2 border-slate-100">
                <div className="h-full bg-teal-500 transition-all duration-1000 rounded-l-full relative" style={{ width: `${myWinPercentage}%` }}>
                   <div className="absolute inset-0 bg-gradient-to-r from-white/20 to-transparent" />
                </div>
                <div className="h-full bg-slate-300 transition-all duration-1000 relative" style={{ width: `${blankPercentage}%` }}>
                   <div className="absolute inset-0 bg-gradient-to-r from-white/10 to-transparent" />
                </div>
                <div className="h-full bg-rose-500 transition-all duration-1000 rounded-r-full relative" style={{ width: `${opponentWinPercentage}%` }}>
                   <div className="absolute inset-0 bg-gradient-to-l from-white/20 to-transparent" />
                </div>
             </div>
          </div>

          <div className="absolute top-0 right-0 w-[500px] h-[500px] bg-teal-50/20 rounded-full -translate-y-1/2 translate-x-1/2 blur-[100px]" />
          <div className="absolute bottom-0 left-0 w-[400px] h-[400px] bg-rose-50/10 rounded-full translate-y-1/2 -translate-x-1/2 blur-[100px]" />
        </div>

        <div className="lg:col-span-3">
           <div className="bg-slate-900 rounded-[2rem] md:rounded-[2.5rem] p-8 text-white h-full relative overflow-hidden flex flex-col justify-between group">
              <div className="relative z-10">
                 <p className="text-xs font-black uppercase tracking-[0.4em] text-teal-400 mb-8">Escrutinio Total</p>
                 <div className="relative w-36 h-36 md:w-40 md:h-40 mx-auto mb-8">
                    <svg className="w-full h-full transform -rotate-90">
                      <circle cx="72" cy="72" r="66" stroke="currentColor" strokeWidth="6" fill="transparent" className="text-white/5 md:hidden" />
                      <circle cx="80" cy="80" r="72" stroke="currentColor" strokeWidth="6" fill="transparent" className="text-white/5 hidden md:block" />
                      <circle cx="72" cy="72" r="66" stroke="currentColor" strokeWidth="10" fill="transparent" strokeDasharray={414.7} strokeDashoffset={414.7 - (414.7 * reportedPercentage) / 100} strokeLinecap="round" className="text-teal-500 transition-all duration-1000 md:hidden" />
                      <circle cx="80" cy="80" r="72" stroke="currentColor" strokeWidth="10" fill="transparent" strokeDasharray={452.4} strokeDashoffset={452.4 - (452.4 * reportedPercentage) / 100} strokeLinecap="round" className="text-teal-500 transition-all duration-1000 hidden md:block" />
                    </svg>
                    <div className="absolute inset-0 flex flex-col items-center justify-center">
                      <span className="text-3xl md:text-4xl font-black tracking-tighter">{reportedPercentage}%</span>
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
        <div className="bg-white p-6 md:p-8 rounded-[2rem] md:rounded-[3rem] border-2 border-slate-100 shadow-sm flex flex-col gap-6 md:gap-8">
          {/* FILA 1: TÍTULO */}
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 md:w-14 md:h-14 bg-teal-50 text-teal-600 rounded-xl md:rounded-2xl flex items-center justify-center border border-teal-100 shadow-inner shrink-0"><LayoutGrid size={20} className="md:size-6" /></div>
            <div className="min-w-0">
              <h3 className="text-xl md:text-2xl font-black text-slate-900 tracking-tighter uppercase leading-none mb-1">Puestos de Votación</h3>
              <p className="text-[9px] md:text-[10px] font-black text-slate-400 uppercase tracking-[0.3em]">Gestión de Actas E-14</p>
            </div>
          </div>

          {/* FILA 2: CONTROLES Y FILTROS */}
          <div className="flex flex-col xl:flex-row justify-between items-center gap-6">
            <div className="flex bg-slate-100 p-1.5 rounded-2xl md:rounded-[1.25rem] border border-slate-200 shadow-inner overflow-x-auto w-full xl:w-fit no-scrollbar">
               {[
                 { id: 'all', label: 'Todos' },
                 { id: 'pending', label: 'Pendientes' },
                 { id: 'completed', label: 'Completados' }
               ].map(tab => (
                 <button
                  key={tab.id}
                  onClick={() => updateParams({ tab: tab.id })}
                  className={cn(
                    "flex-1 md:flex-none px-4 md:px-6 py-2 rounded-xl text-[9px] md:text-[10px] font-black uppercase tracking-widest transition-all whitespace-nowrap",
                    activeTab === tab.id
                      ? "bg-white text-slate-900 shadow-lg"
                      : "text-slate-500 hover:text-slate-700"
                  )}
                 >
                   {tab.label}
                 </button>
               ))}
            </div>

            <div className="flex flex-col md:flex-row flex-wrap items-center justify-center xl:justify-end gap-3 w-full xl:flex-1">
              <div className="w-full md:w-48 lg:w-60 relative group">
                <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 group-focus-within:text-teal-500 transition-colors" size={16} />
                <input
                  type="text"
                  placeholder="Buscar..."
                  value={nameFilter}
                  onChange={(e) => updateParams({ nombre: e.target.value })}
                  className="w-full pl-12 pr-4 py-3 bg-slate-50 border-2 border-slate-100 rounded-2xl text-xs font-bold text-slate-900 focus:border-teal-500 focus:bg-white outline-none transition-all shadow-inner"
                />
              </div>

              <div className="w-full md:w-40 lg:w-44">
                <SearchableSelect
                  options={departmentsList}
                  value={deptFilter}
                  onChange={(val) => updateParams({ dept: val })}
                  placeholder="Depto..."
                />
              </div>

              <div className="w-full md:w-40 lg:w-44">
                <SearchableSelect
                  options={municipalitiesList}
                  value={muniFilter}
                  onChange={(val) => updateParams({ muni: val })}
                  placeholder="Municipio..."
                  disabled={!deptFilter}
                />
              </div>

              <button
                onClick={() => updateParams({ clear: true })}
                className="p-3 text-slate-400 hover:text-rose-500 hover:bg-rose-50 rounded-2xl transition-all flex items-center justify-center group shrink-0 border-2 border-transparent hover:border-rose-100"
                title="Limpiar filtros"
              >
                <RotateCcw size={18} className="group-hover:rotate-[-45deg] transition-transform duration-500" />
              </button>
            </div>
          </div>
        </div>

        {/* LISTADO DE PUESTOS */}
        <div className="grid grid-cols-1 gap-5 md:gap-8">
          {loadingStations ? (
            <div className="py-16 md:py-20 flex flex-col items-center justify-center text-teal-600">
              <div className="w-8 h-8 border-4 border-teal-600 border-t-transparent rounded-full animate-spin mb-4"></div>
              <p className="text-[10px] font-black uppercase tracking-widest">Consultando SIT...</p>
            </div>
          ) : (stationsData as any)?.error ? (
            <div className="py-16 md:py-20 flex flex-col items-center justify-center text-rose-500 bg-white rounded-[2rem] md:rounded-[3.5rem] border-2 border-slate-100 shadow-sm">
              <AlertCircle size={40} className="opacity-20 mb-4" />
              <p className="text-[10px] md:text-xs font-black uppercase tracking-widest text-center px-6">
                Error: {(stationsData as any).error.message || "Fallo conexión"}
              </p>
            </div>
          ) : filteredStations.length === 0 ? (
            <div className="bg-white rounded-[2rem] md:rounded-[3.5rem] p-12 md:p-24 text-center border-2 border-dashed border-slate-200">
              <div className="w-16 h-16 md:w-24 md:h-24 bg-slate-50 rounded-[1.5rem] md:rounded-[2.5rem] flex items-center justify-center mx-auto mb-6 md:mb-8 border border-slate-100">
                <Search size={32} className="md:size-10 text-slate-200" />
              </div>
              <h4 className="text-base md:text-xl font-black text-slate-900 uppercase tracking-tighter">Sin resultados operacionales</h4>
            </div>
          ) : (
            filteredStations.map((station: any) => {
              const isComplete = station.isComplete || false;
              const stationValidTables = (station.tables || []).filter((t: any) => Number(t.votosTotales || 0) > 0).length || 0;
              const actualTotalTables = Math.max(Number(station.totalMesas || 0), (station.tables || []).length);
              const percentage = actualTotalTables > 0 ? Math.round((stationValidTables / actualTotalTables) * 100) : 0;

              const stationMyVotes = Number(station.totalVotosCandidato || 0);
              const stationBlankVotes = Number(station.totalVotosBlanco || station.votosBlanco || 0);
              const stationTotal = Number(station.totalVotosMesa || 0);
              const stationOpponentVotes = Math.max(0, stationTotal - stationMyVotes - stationBlankVotes);
              const stationDiff = stationMyVotes - stationOpponentVotes;

              return (
                <div key={station.id} className={cn(
                  "bg-white rounded-[2rem] md:rounded-[3.5rem] border-2 shadow-sm overflow-hidden group transition-all duration-500",
                  isComplete ? "border-emerald-500/30" : "border-slate-100 hover:border-teal-500/20"
                )}>
                  <div className="flex flex-col lg:grid lg:grid-cols-12 items-stretch">
                    <div className="lg:col-span-3 p-6 sm:p-8 md:p-10 flex flex-col justify-center bg-slate-50/30 border-b lg:border-b-0 lg:border-r border-slate-100 min-h-[220px] md:min-h-[260px]">
                       <div className="flex-1 flex flex-col justify-center mb-6 md:mb-8">
                          <h4 className="text-lg md:text-2xl font-black text-slate-900 tracking-tight uppercase group-hover:text-teal-600 transition-colors leading-tight line-clamp-3">
                             {station.nombre || station.puesto}
                          </h4>
                          <div className="flex flex-wrap items-center gap-2 mt-3">
                            <span className="px-2 py-0.5 bg-slate-200 text-slate-600 text-[8px] font-black uppercase rounded-md tracking-widest">
                              {station.municipio}
                            </span>
                            <p className="text-[8px] md:text-[9px] font-bold text-slate-400 uppercase tracking-widest truncate">{station.departamento}</p>
                          </div>
                       </div>
                       <div className="space-y-4 md:space-y-5 shrink-0">
                          <div className="flex items-center justify-between text-[9px] md:text-[10px] font-black uppercase tracking-widest text-slate-400 px-1">
                             <div className="flex items-center gap-2"><ShieldCheck size={14} className="text-teal-600" /> Sincronizado</div>
                             <span className="text-slate-900">{stationValidTables} / {station.totalMesas}</span>
                          </div>
                          
                          <div className="space-y-2">
                            <div className="flex items-center justify-between text-[9px] md:text-[10px] font-black uppercase tracking-widest text-slate-400 px-1">
                               <div className="flex items-center gap-2"><LayoutGrid size={14} className="text-teal-600" /> Progreso Mesas</div>
                               <span className={cn(
                                 "text-[10px] font-black px-2 py-0.5 rounded-full",
                                 isComplete ? "bg-emerald-100 text-emerald-700" : "bg-teal-50 text-teal-700"
                               )}>
                                 {percentage}%
                               </span>
                            </div>
                            <div className="h-1.5 w-full bg-slate-200 rounded-full overflow-hidden">
                               <div 
                                 className={cn("h-full transition-all duration-1000", isComplete ? "bg-emerald-500" : "bg-teal-500")} 
                                 style={{ width: `${percentage}%` }} 
                               />
                            </div>
                          </div>
                       </div>
                    </div>

                    <div className="lg:col-span-3 p-6 sm:p-8 md:p-10 flex flex-col justify-center border-b lg:border-b-0 lg:border-r border-slate-100 space-y-4 md:space-y-6">
                       <div className="flex justify-between items-end mb-1 md:mb-2 px-1">
                          <p className="text-[8px] md:text-[9px] font-black uppercase tracking-[0.2em] text-slate-400">Local</p>
                          <span className={cn(
                            "px-2 py-0.5 md:py-1 rounded-lg text-[8px] md:text-[9px] font-black uppercase tracking-widest flex items-center gap-1.5",
                            stationDiff >= 0 ? "bg-emerald-50 text-emerald-700" : "bg-rose-50 text-rose-700"
                          )}>
                            {stationDiff >= 0 ? <Trophy size={10} /> : <AlertCircle size={10} />}
                            {Math.abs(stationDiff).toLocaleString()}
                          </span>
                       </div>
                       <div className="grid grid-cols-3 gap-2">
                          <div className="bg-teal-50/50 p-2 md:p-3 rounded-xl border border-teal-100/50">
                             <p className="text-[7px] md:text-[8px] font-black text-teal-600 uppercase mb-0.5">SIT</p>
                             <p className="text-sm md:text-lg font-black text-teal-900 leading-none">{stationMyVotes.toLocaleString()}</p>
                          </div>
                          <div className="bg-slate-50/50 p-2 md:p-3 rounded-xl border border-slate-100/50 text-center">
                             <p className="text-[7px] md:text-[8px] font-black text-slate-500 uppercase mb-0.5">BLN</p>
                             <p className="text-sm md:text-lg font-black text-slate-900 leading-none">{stationBlankVotes.toLocaleString()}</p>
                          </div>
                          <div className="bg-rose-50/30 p-2 md:p-3 rounded-xl border border-rose-100/50 text-right">
                             <p className="text-[7px] md:text-[8px] font-black text-rose-500 uppercase mb-0.5">OPO</p>
                             <p className="text-sm md:text-lg font-black text-rose-900 leading-none">{stationOpponentVotes.toLocaleString()}</p>
                          </div>
                       </div>
                       <div className="h-1.5 md:h-2 w-full bg-slate-100 rounded-full overflow-hidden flex">
                          <div className="h-full bg-teal-500" style={{ width: `${stationTotal > 0 ? (stationMyVotes / stationTotal) * 100 : 0}%` }} />
                          <div className="h-full bg-slate-300" style={{ width: `${stationTotal > 0 ? (stationBlankVotes / stationTotal) * 100 : 0}%` }} />
                          <div className="h-full bg-rose-500" style={{ width: `${stationTotal > 0 ? (stationOpponentVotes / stationTotal) * 100 : 0}%` }} />
                       </div>
                    </div>

                    <div className="lg:col-span-6 p-6 sm:p-8 md:p-10 flex flex-col min-w-0">
                       <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-4 md:mb-6 gap-4">
                          <div className="flex items-center gap-2 text-teal-600">
                             <Inbox size={16} />
                             <p className="text-[9px] md:text-[10px] font-black uppercase tracking-[0.2em]">Mesas E-14</p>
                          </div>

                          <button
                            onClick={() => completeMutation.mutate({ stationId: station.id, isComplete: !isComplete })}
                            disabled={completeMutation.isPending}
                            className={cn(
                              "w-full sm:w-auto px-4 md:px-6 py-2 rounded-xl text-[9px] md:text-[10px] font-black uppercase tracking-widest transition-all flex items-center justify-center gap-2 shadow-sm border-2",
                              isComplete ? "bg-emerald-50 text-emerald-600 border-emerald-100" : "bg-slate-900 text-white border-slate-900"
                            )}
                          >
                            {isComplete ? <><X size={12} /> Reabrir</> : <><CheckCircle2 size={12} /> Finalizar</>}
                          </button>
                       </div>
                       <div className="flex-1">
                          <div className="grid grid-cols-10 gap-1 sm:gap-1.5 md:gap-2">
                            {station.totalMesas === 0 && (!station.tables || station.tables.length === 0) ? (
                              <div className="col-span-10 flex flex-col items-center justify-center py-4 bg-slate-50 rounded-2xl border-2 border-dashed border-slate-200">
                                <p className="text-[9px] font-black text-slate-400 uppercase mb-2">Sin configuración</p>
                                <button
                                                                    onClick={() => {
                                                                      setSelectedStation(station.id);
                                                                      setNewReport({
                                                                        tableNumber: '1',
                                                                        votesCandidate: '0',
                                                                        votesBlank: '0',
                                                                        votesOpponent: '0'
                                                                      });
                                                                      setIsManualEntry(true);
                                                                      setIsModalOpen(true);
                                                                    }}
                                                                    className="px-3 py-1.5 bg-white border border-slate-200 rounded-lg text-[9px] font-black uppercase text-teal-600"
                                                                  >
                                                                    Configurar
                                                                  </button>
                                                                </div>
                                                              ) : (
                                                                <>
                                                                  {Array.from({ length: Math.max(station.totalMesas || 0, station.tables?.length || 0) }).slice(0, 10).map((_, i) => {
                                                                    // Si totalMesas es 0 pero hay tablas, usamos los números de las tablas reportadas
                                                                                                      const tableNum = station.totalMesas > 0 ? i + 1 : (station.tables[i]?.mesaNumero || i + 1);
                                                                                                      const existingTable = station.tables?.find((t: any) => t.mesaNumero === tableNum);
                                                                                                      const isReported = !!existingTable;
                                                                                                      const hasVotes = isReported && (existingTable.votosTotales || 0) > 0;
                                                                                                      return (
                                                                                                        <button
                                                                                                          key={tableNum}
                                                                                                          onClick={() => {
                                                                                                            setSelectedStation(station.id);
                                                                                                            setNewReport({
                                                                                                              tableNumber: tableNum.toString(),
                                                                                                              votesCandidate: (existingTable?.votosCandidato || 0).toString(),
                                                                                                              votesBlank: (existingTable?.votosBlanco || 0).toString(),
                                                                                                              votesOpponent: ((existingTable?.votosTotales || 0) - (existingTable?.votosCandidato || 0) - (existingTable?.votosBlanco || 0)).toString()
                                                                                                            });
                                                                                                            setIsManualEntry(false);
                                                                                                            setIsModalOpen(true);
                                                                                                          }}
                                                                                                          className={cn(                                                                          "aspect-square rounded-md md:rounded-lg flex items-center justify-center transition-all border shrink-0 relative",
                                                                          hasVotes ? "bg-slate-900 text-white border-slate-900 shadow-md" :
                                                                          isReported ? "bg-slate-100 text-slate-500 border-slate-200" : "bg-white text-slate-400 border-slate-100"
                                                                        )}
                                                                      >
                                                                        <span className="text-[9px] md:text-[10px] font-black">{tableNum}</span>
                                                                        {hasVotes && <CheckCircle2 size={6} className="absolute bottom-0.5 right-0.5 text-teal-400" />}
                                                                      </button>
                                                                    );
                                                                  })}                              </>
                            )}
                          </div>
                       </div>
                       <div className="mt-4 md:mt-6 pt-4 md:pt-6 border-t border-slate-50 flex justify-between items-center">
                          <button
                            onClick={() => {
                              setSelectedStation(station.id);
                              // Calcular automáticamente el siguiente número de mesa
                              const maxMesa = station.tables?.reduce((max: number, t: any) => Math.max(max, t.mesaNumero), 0) || 0;
                              setNewReport({
                                tableNumber: (maxMesa + 1).toString(),
                                votesCandidate: '0',
                                votesBlank: '0',
                                votesOpponent: '0'
                              });
                              setIsManualEntry(true);
                              setIsModalOpen(true);
                              setReportError(null);
                            }}
                            className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-900 text-white rounded-lg text-[9px] md:text-[10px] font-black uppercase tracking-widest hover:bg-teal-600 transition-all shadow-md"
                          >
                             <Zap size={12} className="text-teal-400" /> Registrar
                          </button>

                          <button
                            onClick={() => {
                              setSelectedStationForDetail(station);
                              setIsDetailModalOpen(true);
                            }}
                            className="flex items-center gap-1.5 text-[9px] md:text-[10px] font-black uppercase tracking-[0.2em] text-slate-400 hover:text-teal-600 transition-colors"
                          >
                             Detalles <ChevronRight size={12} />
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
          <div className="flex flex-col sm:flex-row items-center justify-between bg-white p-6 md:p-8 rounded-[2rem] md:rounded-[3rem] border-2 border-slate-100 shadow-sm mt-8 gap-4">
            <div className="flex items-center gap-3">
              <p className="text-[9px] md:text-[10px] font-black text-slate-400 uppercase tracking-widest">
                Página
              </p>
              <input
                key={currentStationPage}
                type="number"
                min="1"
                max={stationsTotalPages}
                defaultValue={currentStationPage}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    const val = parseInt((e.target as HTMLInputElement).value);
                    if (val >= 1 && val <= stationsTotalPages) {
                      updateParams({ page: val });
                    }
                  }
                }}
                className="w-12 h-8 bg-slate-50 border-2 border-slate-100 rounded-lg text-center text-xs font-black text-teal-600 focus:border-teal-500 outline-none transition-all"
              />
              <p className="text-[9px] md:text-[10px] font-black text-slate-400 uppercase tracking-widest">
                de {stationsTotalPages}
              </p>
            </div>
            <div className="flex gap-3 w-full sm:w-auto">
              <button disabled={currentStationPage === 1} onClick={() => updateParams({ page: currentStationPage - 1 })} className="flex-1 sm:flex-none p-3 md:p-4 bg-slate-50 border-2 border-slate-100 rounded-xl md:rounded-2xl text-slate-400 hover:text-teal-600 disabled:opacity-30 transition-all shadow-sm">
                <ChevronLeft size={18} className="md:size-5 mx-auto" />
              </button>
              <button disabled={currentStationPage === stationsTotalPages} onClick={() => updateParams({ page: currentStationPage + 1 })} className="flex-1 sm:flex-none p-3 md:p-4 bg-slate-50 border-2 border-slate-100 rounded-xl md:rounded-2xl text-slate-400 hover:text-teal-600 disabled:opacity-30 transition-all shadow-sm">
                <ChevronRight size={18} className="md:size-5 mx-auto" />
              </button>
            </div>
          </div>
        )}
      </div>

      {/* MODAL DE INGRESO E-14 */}
      {isModalOpen && (
        <div
          className="fixed inset-0 bg-slate-900/80 backdrop-blur-md z-[400] flex items-center justify-center p-4 transition-all"
          onClick={(e) => e.target === e.currentTarget && setIsModalOpen(false)}
        >
          <div className="bg-white w-full max-w-md rounded-[2rem] shadow-2xl overflow-hidden border-2 border-slate-100 animate-in zoom-in-95 duration-200">
            <div className="p-6 md:p-8 flex justify-between items-start border-b border-slate-50">
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                   <div className="px-2 py-0.5 bg-slate-900 text-white text-[8px] font-black uppercase rounded-md tracking-widest">E-14</div>
                   <span className="text-[10px] font-black text-teal-600 uppercase tracking-widest">SIT Auditor</span>
                </div>
                <h3 className="text-2xl font-black text-slate-900 tracking-tighter uppercase italic">Registro <span className="text-teal-600">Votos</span></h3>
              </div>
              <button
                onClick={() => setIsModalOpen(false)}
                className="p-2 bg-slate-50 text-slate-400 hover:text-rose-600 rounded-xl transition-all"
              >
                <X size={20} />
              </button>
            </div>

            <form onSubmit={handleReport} className="p-6 md:p-8 space-y-6">
              {reportError && (
                <div className="p-3 bg-rose-50 border-2 border-rose-100 rounded-xl flex items-center gap-3 text-rose-600 animate-in slide-in-from-top-2">
                  <AlertCircle size={16} className="shrink-0" />
                  <p className="text-[10px] font-black uppercase tracking-tight">{reportError}</p>
                </div>
              )}

              <div className="space-y-4">
                <div className="bg-slate-50 p-4 rounded-2xl border-2 border-slate-100 flex items-center gap-4">
                  {isManualEntry ? (
                    <div className="flex-1 space-y-1.5">
                      <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest px-1">Número de Mesa</label>
                      <input
                        required
                        type="number"
                        className="w-full px-4 py-3 bg-white border-2 border-slate-200 rounded-xl text-lg font-black text-slate-900 focus:border-teal-500 outline-none transition-all"
                        placeholder="Mesa #"
                        value={newReport.tableNumber}
                        onChange={e => {
                          setNewReport({...newReport, tableNumber: e.target.value});
                          setReportError(null);
                        }}
                      />
                    </div>
                  ) : (
                    <div className="w-12 h-12 bg-white rounded-xl flex items-center justify-center text-slate-900 border-2 border-slate-200 shadow-sm font-black text-xl italic shrink-0">{newReport.tableNumber}</div>
                  )}
                  <div className="min-w-0 flex-1">
                    <p className="text-[8px] font-black text-slate-400 uppercase mb-0.5">Estación</p>
                    <h4 className="text-sm font-black text-slate-900 uppercase truncate">
                      {pollingStations.find((s: any) => s.id === selectedStation)?.nombre}
                    </h4>
                  </div>
                </div>

                <div className="grid grid-cols-3 gap-3">
                  <div className="space-y-1.5">
                    <label className="text-[8px] font-black uppercase text-teal-600 px-1 text-center block">SIT</label>
                    <input
                      required
                      type="text"
                      inputMode="numeric"
                      pattern="[0-9]*"
                      className="w-full px-2 py-4 bg-teal-50/50 border-2 border-teal-100 rounded-xl text-xl font-black text-teal-900 focus:border-teal-500 focus:bg-white outline-none transition-all text-center"
                      value={newReport.votesCandidate}
                      onFocus={(e) => e.target.select()}
                      onChange={e => {
                        const val = e.target.value.replace(/[^0-9]/g, '');
                        setNewReport({...newReport, votesCandidate: val || '0'});
                      }}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-[8px] font-black uppercase text-slate-400 px-1 text-center block">Blanco</label>
                    <input
                      required
                      type="text"
                      inputMode="numeric"
                      pattern="[0-9]*"
                      className="w-full px-2 py-4 bg-slate-50 border-2 border-slate-100 rounded-xl text-xl font-black text-slate-900 focus:border-slate-500 focus:bg-white outline-none transition-all text-center"
                      value={newReport.votesBlank}
                      onFocus={(e) => e.target.select()}
                      onChange={e => {
                        const val = e.target.value.replace(/[^0-9]/g, '');
                        setNewReport({...newReport, votesBlank: val || '0'});
                      }}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-[8px] font-black uppercase text-rose-500 px-1 text-center block">Opo</label>
                    <input
                      required
                      type="text"
                      inputMode="numeric"
                      pattern="[0-9]*"
                      className="w-full px-2 py-4 bg-rose-50/30 border-2 border-rose-100 rounded-xl text-xl font-black text-rose-900 focus:border-rose-500 focus:bg-white outline-none transition-all text-center"
                      value={newReport.votesOpponent}
                      onFocus={(e) => e.target.select()}
                      onChange={e => {
                        const val = e.target.value.replace(/[^0-9]/g, '');
                        setNewReport({...newReport, votesOpponent: val || '0'});
                      }}
                    />
                  </div>
                </div>
              </div>

              <button
                type="submit"
                disabled={reportMutation.isPending}
                className="w-full py-4 bg-slate-900 text-white rounded-2xl text-xs font-black uppercase tracking-widest shadow-xl hover:bg-teal-600 disabled:opacity-50 transition-all flex items-center justify-center gap-3"
              >
                {reportMutation.isPending ? (
                  <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                ) : (
                  <>
                    <ShieldCheck size={16} className="text-teal-400" />
                    Confirmar Registro
                  </>
                )}
              </button>
            </form>
          </div>
        </div>
      )}

      {/* MODAL DETALLE PUESTO */}
      {isDetailModalOpen && selectedStationForDetail && (
        <div
          className="fixed inset-0 bg-slate-900/80 backdrop-blur-md z-[300] flex items-center justify-center p-4"
          onClick={(e) => e.target === e.currentTarget && setIsDetailModalOpen(false)}
        >
          <div className="bg-white w-full max-w-2xl rounded-[2rem] shadow-2xl overflow-hidden border-2 border-slate-100 flex flex-col max-h-[85vh] animate-in zoom-in-95 duration-200">
            <div className="p-6 md:p-8 flex justify-between items-start border-b border-slate-50 shrink-0">
              <div className="space-y-1">
                <h3 className="text-2xl font-black text-slate-900 tracking-tighter uppercase italic leading-none">Control de <span className="text-teal-600">Mesas</span></h3>
                <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest truncate max-w-xs">{selectedStationForDetail.nombre}</p>
              </div>
              <button
                onClick={() => setIsDetailModalOpen(false)}
                className="p-2 bg-slate-50 text-slate-400 hover:text-rose-600 rounded-xl transition-all"
              >
                <X size={20} />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-6 md:p-8 custom-scrollbar">
              <div className="grid grid-cols-5 sm:grid-cols-6 md:grid-cols-8 gap-3">
                {Array.from({ length: Math.max(selectedStationForDetail.totalMesas || 0, selectedStationForDetail.tables?.length || 0) }).map((_, i) => {
                                    const tableNum = selectedStationForDetail.totalMesas > 0 ? i + 1 : (selectedStationForDetail.tables[i]?.mesaNumero || i + 1);
                                    const existingTable = selectedStationForDetail.tables?.find((t: any) => t.mesaNumero === tableNum);
                                    const isReported = !!existingTable;
                                    const hasVotes = isReported && (existingTable.votosTotales || 0) > 0;
                                    return (
                                      <button
                                        key={tableNum}
                                        onClick={() => {
                                          setSelectedStation(selectedStationForDetail.id);
                                          setNewReport({
                                            tableNumber: tableNum.toString(),
                                            votesCandidate: (existingTable?.votosCandidato || 0).toString(),
                                            votesBlank: (existingTable?.votosBlanco || 0).toString(),
                                            votesOpponent: ((existingTable?.votosTotales || 0) - (existingTable?.votosCandidato || 0) - (existingTable?.votosBlanco || 0)).toString()
                                          });
                                          setIsManualEntry(false);
                                          setIsModalOpen(true);
                                          setReportError(null);
                                        }}
                                        className={cn(
                                          "aspect-square rounded-xl flex flex-col items-center justify-center transition-all border-2 relative group",
                                          hasVotes ? "bg-slate-900 text-white border-slate-900 shadow-md" :
                                          isReported ? "bg-slate-100 text-slate-500 border-slate-200" : "bg-white text-slate-400 border-slate-100 hover:border-teal-500/30"
                                        )}
                                      >
                                        <span className="text-xs font-black">{tableNum}</span>
                                        {hasVotes && (
                                          <div className="mt-0.5 flex flex-col items-center">
                                            <span className="text-[8px] font-black text-teal-400 leading-none">{existingTable.votosCandidato}</span>
                                          </div>
                                        )}
                                      </button>
                                    );
                                  })}              </div>
            </div>

            <div className="p-6 md:p-8 bg-slate-50 border-t border-slate-100 shrink-0 space-y-4">
              {(() => {
                const zeroVoteTables = selectedStationForDetail.tables
                  ?.filter((t: any) => (t.votosTotales || 0) === 0)
                  .map((t: any) => t.mesaNumero)
                  .sort((a: number, b: number) => a - b) || [];

                if (zeroVoteTables.length === 0) return null;

                return (
                  <div className="bg-rose-50 p-3 rounded-xl border border-rose-100">
                    <p className="text-[8px] font-black text-rose-600 uppercase tracking-widest mb-1">Mesas registradas con 0 votos:</p>
                    <div className="flex flex-wrap gap-1.5">
                      {zeroVoteTables.map((num: number) => (
                        <span key={num} className="px-2 py-0.5 bg-white border border-rose-200 rounded text-[10px] font-bold text-rose-700">
                          Mesa {num}
                        </span>
                      ))}
                    </div>
                  </div>
                );
              })()}

              <div className="flex justify-between items-center">
                <div className="flex gap-6">
                  <div className="text-center sm:text-left">
                    <p className="text-[8px] font-black text-slate-400 uppercase tracking-widest mb-0.5">Informadas</p>
                    <p className="text-base font-black text-slate-900">{selectedStationForDetail.totalMesasRegistradas} <span className="text-[10px] text-slate-300">/ {selectedStationForDetail.totalMesas}</span></p>
                  </div>
                  <div className="text-center sm:text-left">
                    <p className="text-[8px] font-black text-slate-400 uppercase tracking-widest mb-0.5">Votos SIT</p>
                    <p className="text-base font-black text-teal-600">{selectedStationForDetail.totalVotosCandidato?.toLocaleString() || 0}</p>
                  </div>
                  <div className="text-center sm:text-left">
                    <p className="text-[8px] font-black text-slate-400 uppercase tracking-widest mb-0.5">Blanco</p>
                    <p className="text-base font-black text-slate-500">{selectedStationForDetail.totalVotosBlanco?.toLocaleString() || 0}</p>
                  </div>
                  <div className="text-center sm:text-left">
                    <p className="text-[8px] font-black text-slate-400 uppercase tracking-widest mb-0.5">Total</p>
                    <p className="text-base font-black text-slate-900">{selectedStationForDetail.totalVotosMesa?.toLocaleString() || 0}</p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
