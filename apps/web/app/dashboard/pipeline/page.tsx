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
  'Prospecto': 'border-slate-200 bg-slate-50',
  'Contactado': 'border-blue-200 bg-blue-50/30',
  'Simpatizante': 'border-purple-200 bg-purple-50/30',
  'Firme': 'border-emerald-200 bg-emerald-50/30',
  'Votó': 'border-amber-200 bg-amber-50/30'
};

const STAGE_TEXT_COLORS = {
  'Prospecto': 'text-slate-600',
  'Contactado': 'text-blue-600',
  'Simpatizante': 'text-purple-600',
  'Firme': 'text-emerald-600',
  'Votó': 'text-amber-600'
};

const STAGE_BADGE_COLORS = {
  'Prospecto': 'bg-slate-200 text-slate-700',
  'Contactado': 'bg-blue-200 text-blue-700',
  'Simpatizante': 'bg-purple-200 text-purple-700',
  'Firme': 'bg-emerald-200 text-emerald-700',
  'Votó': 'bg-amber-200 text-amber-700'
};

export default function PipelinePage() {
  const { contacts, team, campaignGoal, moveContactStage } = useCRM();
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedLeader, setSelectedLeader] = useState('all');

  const filteredContacts = useMemo(() => {
    return contacts.filter(c => {
      const matchesSearch = c.name.toLowerCase().includes(searchTerm.toLowerCase()) || 
                           c.cedula.includes(searchTerm);
      // Nota: En el contexto actual, los contactos tienen 'neighborhood', 
      // vincularemos el filtro de líder a los contactos que pertenecen a la zona del líder o similar
      // Por ahora, asumiremos que si hay una asignación, se filtra.
      const matchesLeader = selectedLeader === 'all' || c.neighborhood.includes(selectedLeader);
      return matchesSearch && matchesLeader;
    });
  }, [contacts, searchTerm, selectedLeader]);

  // Cálculos de Estrategia
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
    <div className="h-[calc(100vh-12rem)] flex flex-col space-y-6 animate-in fade-in duration-500">
      {/* HEADER DE RENDIMIENTO ESTRATÉGICO */}
      <div className="bg-[#111827] text-white p-8 rounded-[3rem] shadow-2xl flex flex-col md:flex-row justify-between items-center gap-8 border-b-4 border-blue-600">
        <div className="flex-1 space-y-2">
          <div className="flex items-center gap-3">
            <Target className="text-blue-500" size={24} />
            <h2 className="text-2xl font-black tracking-tighter uppercase">Avance Hacia la Victoria</h2>
          </div>
          <p className="text-slate-400 text-xs font-bold uppercase tracking-widest">Votos Asegurados (Firme + Votó)</p>
          <div className="flex items-end gap-3">
            <span className="text-5xl font-black tracking-tighter text-blue-500">{confirmedVotes.toLocaleString()}</span>
            <span className="text-slate-500 font-bold mb-2">/ {targetVotes.toLocaleString()} META</span>
          </div>
        </div>
        
        <div className="flex-1 w-full max-w-md space-y-4">
          <div className="flex justify-between text-[10px] font-black uppercase tracking-widest text-slate-400">
            <span>Progreso Electoral</span>
            <span>{progressPercent.toFixed(2)}%</span>
          </div>
          <div className="h-4 w-full bg-white/10 rounded-full overflow-hidden p-1 shadow-inner">
            <div 
              className="h-full bg-gradient-to-r from-blue-600 to-emerald-500 rounded-full transition-all duration-1000 shadow-[0_0_15px_rgba(37,99,235,0.5)]"
              style={{ width: `${Math.min(progressPercent, 100)}%` }}
            />
          </div>
        </div>
      </div>

      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h1 className="text-3xl font-black text-slate-900 tracking-tighter uppercase">Gestión de Conversión</h1>
          <p className="text-slate-500 font-medium">Mueve a los ciudadanos hacia el voto seguro.</p>
        </div>
        <div className="flex gap-3 w-full md:w-auto">
          <select 
            value={selectedLeader}
            onChange={(e) => setSelectedLeader(e.target.value)}
            className="px-6 py-3 bg-white border-2 border-slate-100 rounded-2xl text-xs font-black uppercase tracking-widest focus:outline-none focus:border-blue-500 transition-all shadow-sm"
          >
            <option value="all">Todos los Líderes</option>
            {team.map(m => (
              <option key={m.id} value={m.territory}>{m.name} ({m.territory})</option>
            ))}
          </select>
          <div className="relative">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
            <input 
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Buscar por nombre o cédula..." 
              className="pl-12 pr-6 py-3 bg-white border-2 border-slate-100 rounded-2xl text-xs font-bold focus:outline-none focus:border-blue-500 transition-all w-64 shadow-sm"
            />
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-x-auto pb-6 -mx-6 px-6 scrollbar-hide">
        <div className="flex gap-6 h-full min-w-max">
          {STAGES.map((stage, index) => {
            const stageContacts = filteredContacts.filter(c => c.stage === stage);
            const nextStage = STAGES[index + 1];
            const nextStageCount = filteredContacts.filter(c => c.stage === nextStage).length;
            
            // Tasa de conversión simulada
            const convRate = stageContacts.length > 0 
              ? Math.round((nextStageCount / (stageContacts.length + nextStageCount)) * 100) 
              : 0;

            return (
              <React.Fragment key={stage}>
                <div 
                  className={cn(
                    "w-80 flex flex-col rounded-[3rem] border-2 shadow-sm transition-all",
                    STAGE_COLORS[stage]
                  )}
                >
                  {/* Column Header */}
                  <div className="px-8 py-6 flex justify-between items-center border-b border-white/50 bg-white/40 backdrop-blur-sm">
                    <h3 className={cn("font-black text-[10px] uppercase tracking-[0.2em]", STAGE_TEXT_COLORS[stage])}>
                      {stage}
                    </h3>
                    <span className={cn(
                      "px-3 py-1 rounded-full text-[10px] font-black shadow-inner",
                      STAGE_BADGE_COLORS[stage]
                    )}>
                      {stageContacts.length}
                    </span>
                  </div>

                  {/* Column Content */}
                  <div className="flex-1 overflow-y-auto p-5 space-y-4 custom-scrollbar">
                    {stageContacts.map((contact) => (
                      <div 
                        key={contact.id}
                        className="bg-white p-6 rounded-[2rem] shadow-sm border border-slate-100 group hover:shadow-2xl hover:-translate-y-1 transition-all animate-in fade-in zoom-in-95 duration-300"
                      >
                        <div className="flex justify-between items-start mb-4">
                          <div className="w-10 h-10 bg-slate-50 rounded-2xl flex items-center justify-center font-black text-sm text-slate-500 border border-slate-100 shadow-inner">
                            {contact.name.charAt(0)}
                          </div>
                          <div className="flex gap-1">
                            <button 
                              onClick={() => handleMove(contact.id, stage, 'prev')}
                              disabled={STAGES.indexOf(stage) === 0}
                              className="p-2 text-slate-300 hover:text-blue-600 hover:bg-blue-50 rounded-xl disabled:opacity-0 transition-all"
                            >
                              <ChevronLeft size={18} />
                            </button>
                            <button 
                              onClick={() => handleMove(contact.id, stage, 'next')}
                              disabled={STAGES.indexOf(stage) === STAGES.length - 1}
                              className="p-2 text-slate-300 hover:text-emerald-600 hover:bg-emerald-50 rounded-xl disabled:opacity-0 transition-all"
                            >
                              <ChevronRight size={18} />
                            </button>
                          </div>
                        </div>

                        <h4 className="text-sm font-black text-slate-900 mb-4 tracking-tight leading-tight uppercase">{contact.name}</h4>
                        
                        <div className="space-y-2 pt-4 border-t border-slate-50">
                          <div className="flex items-center gap-2 text-[9px] font-black uppercase text-slate-400">
                            <MapPin size={10} className="text-blue-500" /> {contact.neighborhood}
                          </div>
                        </div>

                        <div className="grid grid-cols-2 gap-2 mt-4">
                          <button 
                            className="flex items-center justify-center gap-2 py-2 bg-blue-50 text-blue-600 rounded-xl text-[9px] font-black uppercase tracking-widest hover:bg-blue-600 hover:text-white transition-all"
                            onClick={() => window.open(`tel:${contact.phone}`)}
                          >
                            <PhoneCall size={12} /> Llamar
                          </button>
                          <button 
                            className="flex items-center justify-center gap-2 py-2 bg-emerald-50 text-emerald-600 rounded-xl text-[9px] font-black uppercase tracking-widest hover:bg-emerald-600 hover:text-white transition-all"
                            onClick={() => window.open(`https://wa.me/${contact.phone}`)}
                          >
                            <MessageCircle size={12} /> WhatsApp
                          </button>
                        </div>
                      </div>
                    ))}

                    {stageContacts.length === 0 && (
                      <div className="h-40 border-2 border-dashed border-slate-200/50 rounded-[2.5rem] flex flex-col items-center justify-center bg-white/20">
                        <User size={24} className="text-slate-200 mb-2" />
                        <p className="text-[10px] font-black text-slate-300 uppercase tracking-widest text-center px-6">
                          Sin actividad
                        </p>
                      </div>
                    )}
                  </div>
                </div>

                {/* CONVERSION RATE INDICATOR */}
                {index < STAGES.length - 1 && (
                  <div className="flex flex-col justify-center items-center gap-2 group">
                    <div className="h-px w-8 bg-slate-200 group-hover:bg-blue-400 transition-all" />
                    <div className="bg-white border border-slate-100 px-2 py-1 rounded-full shadow-sm">
                      <span className="text-[8px] font-black text-blue-600">{convRate}%</span>
                    </div>
                    <ArrowRight size={14} className="text-slate-300 group-hover:text-blue-500 transition-all" />
                    <div className="h-px w-8 bg-slate-200 group-hover:bg-blue-400 transition-all" />
                  </div>
                )}
              </React.Fragment>
            );
          })}
        </div>
      </div>
    </div>
  );
}
