"use client";

import React, { useState, useMemo } from 'react';
import { useCRM, PipelineStage, Contact } from '@/context/CRMContext';
import { 
  ChevronRight, 
  ChevronLeft, 
  MapPin, 
  Phone, 
  Search, 
  Filter, 
  User, 
  MessageCircle, 
  PhoneCall, 
  TrendingUp, 
  Target,
  ArrowRight,
  MoreHorizontal
} from 'lucide-react';
import { cn } from '@/components/ui/utils';

const STAGES: PipelineStage[] = ['Prospecto', 'Contactado', 'Simpatizante', 'Firme', 'Votó'];

const STAGE_COLORS = {
  'Prospecto': 'bg-slate-50 border-slate-200',
  'Contactado': 'bg-blue-50/50 border-blue-100',
  'Simpatizante': 'bg-purple-50/50 border-purple-100',
  'Firme': 'bg-emerald-50/50 border-emerald-100',
  'Votó': 'bg-amber-50/50 border-amber-100'
};

const STAGE_HEADER_COLORS = {
  'Prospecto': 'bg-slate-200 text-slate-700',
  'Contactado': 'bg-blue-600 text-white',
  'Simpatizante': 'bg-purple-600 text-white',
  'Firme': 'bg-emerald-600 text-white',
  'Votó': 'bg-amber-600 text-white'
};

export default function PipelinePage() {
  const { contacts, team, campaignGoal, moveContactStage } = useCRM();
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedLeader, setSelectedLeader] = useState('all');

  const filteredContacts = useMemo(() => {
    return contacts.filter(c => {
      const matchesSearch = c.name.toLowerCase().includes(searchTerm.toLowerCase()) || 
                           c.cedula.includes(searchTerm);
      const matchesLeader = selectedLeader === 'all' || c.neighborhood.includes(selectedLeader);
      return matchesSearch && matchesLeader;
    });
  }, [contacts, searchTerm, selectedLeader]);

  const confirmedVotes = contacts.filter(c => c.stage === 'Firme' || c.stage === 'Votó').length;
  const targetVotes = campaignGoal; 
  const progressPercent = targetVotes > 0 ? (confirmedVotes / targetVotes) * 100 : 0;

  const handleMove = (id: string, currentStage: PipelineStage, direction: 'next' | 'prev') => {
    const currentIndex = STAGES.indexOf(currentStage);
    const nextIndex = direction === 'next' ? currentIndex + 1 : currentIndex - 1;
    
    if (nextIndex >= 0 && nextIndex < STAGES.length) {
      moveContactStage(id, STAGES[nextIndex]);
    }
  };

  return (
    <div className="min-h-screen flex flex-col space-y-8 animate-in fade-in duration-500 pb-12">
      {/* HEADER ESTRATÉGICO */}
      <div className="bg-[#111827] text-white p-10 rounded-[3.5rem] shadow-2xl flex flex-col lg:flex-row justify-between items-center gap-10 border-b-8 border-blue-600 shrink-0">
        <div className="flex-1 space-y-4">
          <div className="flex items-center gap-4">
            <div className="p-3 bg-blue-600/20 rounded-2xl">
              <Target className="text-blue-500" size={32} />
            </div>
            <div>
              <h2 className="text-3xl font-black tracking-tighter uppercase leading-none">Centro de Comando</h2>
              <p className="text-slate-400 text-xs font-bold uppercase tracking-[0.2em] mt-1">Avance Hacia la Victoria</p>
            </div>
          </div>
          <div className="flex items-end gap-4 mt-6">
            <span className="text-6xl font-black tracking-tighter text-blue-500 leading-none">{confirmedVotes.toLocaleString()}</span>
            <div className="mb-1">
              <p className="text-slate-500 text-[10px] font-black uppercase tracking-widest leading-none mb-1">Meta de Campaña</p>
              <span className="text-white/40 font-bold text-lg leading-none">{targetVotes.toLocaleString()}</span>
            </div>
          </div>
        </div>
        
        <div className="flex-1 w-full max-w-lg space-y-6 bg-white/5 p-8 rounded-[2.5rem] border border-white/10">
          <div className="flex justify-between items-center">
            <span className="text-[10px] font-black uppercase tracking-[0.2em] text-blue-400">Progreso de Conversión</span>
            <span className="text-2xl font-black text-white">{progressPercent.toFixed(1)}%</span>
          </div>
          <div className="h-6 w-full bg-white/10 rounded-full overflow-hidden p-1.5 shadow-inner">
            <div 
              className="h-full bg-gradient-to-r from-blue-600 via-blue-400 to-emerald-500 rounded-full transition-all duration-1000 shadow-[0_0_20px_rgba(37,99,235,0.4)] relative"
              style={{ width: `${Math.min(progressPercent, 100)}%` }}
            >
              <div className="absolute inset-0 bg-white/20 animate-pulse" />
            </div>
          </div>
        </div>
      </div>

      {/* BARRA DE FILTROS */}
      <div className="flex flex-col md:flex-row justify-between items-center gap-6 bg-white p-6 rounded-[2.5rem] shadow-sm border border-slate-100 shrink-0">
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 bg-blue-600 rounded-2xl flex items-center justify-center text-white shadow-lg shadow-blue-200 shrink-0">
            <Filter size={20} />
          </div>
          <div>
            <h1 className="text-xl font-black text-slate-900 tracking-tight uppercase">Pipeline Estratégico</h1>
            <p className="text-slate-500 text-xs font-medium">Gestiona y organiza tu base de votantes por etapas.</p>
          </div>
        </div>
        <div className="flex gap-3 w-full md:w-auto">
          <select 
            value={selectedLeader}
            onChange={(e) => setSelectedLeader(e.target.value)}
            className="flex-1 md:w-64 px-6 py-4 bg-slate-50 border-2 border-transparent focus:border-blue-500 focus:bg-white rounded-2xl text-xs font-black uppercase tracking-widest transition-all outline-none"
          >
            <option value="all">Todos los Líderes</option>
            {team.map(m => (
              <option key={m.id} value={m.territory}>{m.name} ({m.territory})</option>
            ))}
          </select>
          <div className="relative flex-1 md:w-80">
            <Search className="absolute left-5 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
            <input 
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Buscar por nombre o cédula..." 
              className="w-full pl-14 pr-6 py-4 bg-slate-50 border-2 border-transparent focus:border-blue-500 focus:bg-white rounded-2xl text-xs font-bold transition-all outline-none"
            />
          </div>
        </div>
      </div>

      {/* PIPELINE GRID */}
      <div className="grid grid-cols-1 xl:grid-cols-2 2xl:grid-cols-3 gap-8 pb-10 min-h-0">
        {STAGES.map((stage, index) => {
          const stageContacts = filteredContacts.filter(c => c.stage === stage);
          const nextStage = STAGES[index + 1];
          const nextStageCount = filteredContacts.filter(c => c.stage === nextStage).length;
          const convRate = stageContacts.length > 0 
            ? Math.round((nextStageCount / (stageContacts.length + nextStageCount)) * 100) 
            : 0;

          return (
            <div 
              key={stage}
              className={cn(
                "flex flex-col rounded-[3.5rem] border-2 shadow-sm transition-all hover:shadow-xl hover:border-blue-200 group overflow-hidden relative",
                STAGE_COLORS[stage]
              )}
            >
              {/* Encabezado del Panel */}
              <div className="px-8 py-6 flex justify-between items-center bg-white/80 backdrop-blur-md border-b border-slate-100 shrink-0 z-10">
                <div className="flex items-center gap-4">
                  <div className={cn("px-4 py-1.5 rounded-xl font-black text-[10px] uppercase tracking-[0.2em] shadow-sm", STAGE_HEADER_COLORS[stage])}>
                    {stage}
                  </div>
                  <div className="flex flex-col">
                    <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest leading-none mb-1">Conversión</span>
                    <span className="text-blue-600 font-black text-xs leading-none">{convRate}%</span>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                   <span className="text-2xl font-black text-slate-900 leading-none">{stageContacts.length}</span>
                   <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest mt-1">Registros</span>
                </div>
              </div>

              {/* Contenedor de Contactos con Scroll Blindado */}
              <div className="flex-1 max-h-[600px] overflow-y-auto p-6 pr-4 custom-scrollbar relative">
                {stageContacts.length > 0 ? (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    {stageContacts.map((contact) => (
                      <div 
                        key={contact.id}
                        className="bg-white p-5 rounded-[2.5rem] shadow-sm border border-slate-100 hover:border-blue-300 transition-all flex flex-col gap-4 group/card min-w-0 overflow-hidden"
                      >
                        <div className="flex justify-between items-start gap-3">
                          <div className="w-10 h-10 bg-slate-50 rounded-2xl flex items-center justify-center font-black text-sm text-slate-400 border border-slate-100 shrink-0 group-hover/card:bg-blue-600 group-hover/card:text-white transition-colors">
                            {contact.name.charAt(0)}
                          </div>
                          <div className="flex gap-1 shrink-0">
                            <button 
                              onClick={() => handleMove(contact.id, stage, 'prev')}
                              disabled={STAGES.indexOf(stage) === 0}
                              className="p-1.5 text-slate-200 hover:text-blue-600 hover:bg-blue-50 rounded-lg disabled:opacity-0 transition-all"
                            >
                              <ChevronLeft size={16} />
                            </button>
                            <button 
                              onClick={() => handleMove(contact.id, stage, 'next')}
                              disabled={STAGES.indexOf(stage) === STAGES.length - 1}
                              className="p-1.5 text-slate-200 hover:text-emerald-600 hover:bg-emerald-50 rounded-lg disabled:opacity-0 transition-all"
                            >
                              <ChevronRight size={16} />
                            </button>
                          </div>
                        </div>

                        <div className="space-y-1 min-w-0">
                          {/* NOMBRE CON CONTROL DE DESBORDAMIENTO */}
                          <h4 className="text-[12px] font-black text-slate-900 leading-tight uppercase line-clamp-2 break-words h-[2.5rem] flex items-center">
                            {contact.name}
                          </h4>
                          <div className="flex items-center gap-2 text-[8px] font-black uppercase text-slate-400">
                            <MapPin size={10} className="text-blue-500 shrink-0" /> 
                            <span className="truncate flex-1">{contact.neighborhood}</span>
                          </div>
                        </div>

                        <div className="grid grid-cols-2 gap-2 pt-3 border-t border-slate-50 shrink-0">
                          <button 
                            className="flex items-center justify-center gap-2 py-2 bg-blue-50 text-blue-600 rounded-xl text-[8px] font-black uppercase tracking-widest hover:bg-blue-600 hover:text-white transition-all shadow-sm"
                            onClick={() => window.open(`tel:${contact.phone}`)}
                          >
                            <PhoneCall size={10} />
                          </button>
                          <button 
                            className="flex items-center justify-center gap-2 py-2 bg-emerald-50 text-emerald-600 rounded-xl text-[8px] font-black uppercase tracking-widest hover:bg-emerald-600 hover:text-white transition-all shadow-sm"
                            onClick={() => window.open(`https://wa.me/${contact.phone}`)}
                          >
                            <MessageCircle size={10} />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="h-40 flex flex-col items-center justify-center bg-white/40 rounded-[2.5rem] border-2 border-dashed border-slate-200/50">
                    <User size={32} className="text-slate-200 mb-3" />
                    <p className="text-[10px] font-black text-slate-300 uppercase tracking-[0.2em]">Sin actividad</p>
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
