"use client";

import React, { useState, useMemo } from 'react';
import { useCRM, PipelineStage } from '@/context/CRMContext';
import { 
  Search, 
  MapPin, 
  PhoneCall, 
  MessageCircle, 
  Target, 
  ChevronRight, 
  ChevronLeft,
  Users,
  Filter,
  UserCheck,
  IdCard,
  History,
  Info,
  ExternalLink
} from 'lucide-react';
import { cn } from '@/components/ui/utils';

const STAGES: PipelineStage[] = ['Prospecto', 'Contactado', 'Simpatizante', 'Firme', 'Votó'];

export default function PipelinePage() {
  const { contacts, team, campaignGoal, moveContactStage } = useCRM();
  const [activeStage, setActiveStage] = useState<PipelineStage>('Prospecto');
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedLeader, setSelectedLeader] = useState('all');
  const [selectedContactId, setSelectedContactId] = useState<string | null>(null);
  const [visibleCount, setVisibleCount] = useState(50);

  const filteredContacts = useMemo(() => {
    return contacts.filter(c => {
      const matchesStage = c.stage === activeStage;
      const matchesSearch = c.name.toLowerCase().includes(searchTerm.toLowerCase()) || 
                           c.cedula.includes(searchTerm);
      const matchesLeader = selectedLeader === 'all' || c.neighborhood.includes(selectedLeader);
      return matchesStage && matchesSearch && matchesLeader;
    });
  }, [contacts, activeStage, searchTerm, selectedLeader]);

  const displayedContacts = useMemo(() => {
    return filteredContacts.slice(0, visibleCount);
  }, [filteredContacts, visibleCount]);

  const handleScroll = (e: React.UIEvent<HTMLDivElement>) => {
    const { scrollTop, scrollHeight, clientHeight } = e.currentTarget;
    if (scrollHeight - scrollTop <= clientHeight * 1.5) {
      if (visibleCount < filteredContacts.length) {
        setVisibleCount(prev => prev + 50);
      }
    }
  };

  const selectedContact = useMemo(() => 
    contacts.find(c => c.id === selectedContactId) || filteredContacts[0], 
    [contacts, selectedContactId, filteredContacts]
  );

  const funnelStats = useMemo(() => {
    return STAGES.map((s, i) => {
      const count = contacts.filter(c => c.stage === s).length;
      const nextCount = contacts.filter(c => c.stage === STAGES[i+1]).length;
      const dropRate = count > 0 ? Math.round(((count - nextCount) / count) * 100) : 0;
      return { stage: s, count, dropRate };
    });
  }, [contacts]);

  const confirmedVotes = contacts.filter(c => c.stage === 'Firme' || c.stage === 'Votó').length;

  return (
    <div className="h-[calc(100vh-4rem)] flex flex-col -m-8 bg-slate-50/50 overflow-hidden text-slate-900 font-sans">
      
      {/* 1. TACTICAL FUNNEL STRIP (Clean & Professional) */}
      <div className="bg-white text-slate-500 shrink-0 border-b border-slate-200 shadow-sm z-20">
        <div className="flex divide-x divide-slate-100 overflow-x-auto scrollbar-hide">
          {funnelStats.map((stat, i) => (
            <button
              key={stat.stage}
              onClick={() => { setActiveStage(stat.stage as PipelineStage); setVisibleCount(50); }}
              className={cn(
                "flex-1 px-6 py-5 transition-all hover:bg-slate-50 text-left relative overflow-hidden group min-w-[140px]",
                activeStage === stat.stage ? "bg-teal-50/30" : "bg-transparent"
              )}
            >
              <div className="flex justify-between items-start mb-1 gap-2">
                <span className={cn(
                  "text-[10px] font-black uppercase tracking-[0.2em] truncate",
                  activeStage === stat.stage ? "text-teal-600" : "text-slate-400"
                )}>{stat.stage}</span>
                {i < STAGES.length - 1 && (
                  <span className="text-[8px] font-bold text-slate-300">
                    Fuga: {stat.dropRate}%
                  </span>
                )}
              </div>
              <div className="flex items-baseline gap-1">
                <span className={cn(
                  "text-2xl font-black tabular-nums tracking-tighter",
                  activeStage === stat.stage ? "text-slate-900" : "text-slate-600"
                )}>{stat.count.toLocaleString()}</span>
                <span className="text-[9px] font-bold text-slate-400 uppercase">Pax</span>
              </div>
              {activeStage === stat.stage && (
                <div className="absolute bottom-0 left-0 h-1 w-full bg-teal-600 shadow-[0_0_15px_rgba(13,148,136,0.2)]" />
              )}
            </button>
          ))}
          <div className="px-8 py-4 bg-teal-600 flex flex-col justify-center min-w-[180px] shrink-0 overflow-hidden relative shadow-inner">
            <div className="absolute top-0 right-0 p-1 opacity-10"><Target size={48} className="text-white" /></div>
            <span className="text-[10px] font-black uppercase tracking-widest text-teal-50 truncate relative z-10">Meta de Victoria</span>
            <div className="flex items-baseline gap-1 relative z-10">
              <span className="text-2xl font-black text-white tracking-tighter">{confirmedVotes.toLocaleString()}</span>
              <span className="text-[11px] font-bold text-teal-100/60 uppercase">/ {campaignGoal.toLocaleString()}</span>
            </div>
          </div>
        </div>
      </div>

      {/* 2. COMMAND BAR (Filters) */}
      <div className="px-8 py-4 bg-white border-b border-slate-100 flex items-center gap-6 shrink-0 z-10 shadow-sm">
        <div className="relative flex-1 max-w-xl">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-teal-500" size={18} />
          <input 
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Buscar por nombre, documento o teléfono..." 
            className="w-full pl-12 pr-4 py-3 bg-slate-50 border border-slate-200 rounded-2xl text-sm font-medium focus:ring-4 focus:ring-teal-500/5 focus:border-teal-500 outline-none transition-all"
          />
        </div>
        <div className="h-8 w-px bg-slate-100 shrink-0" />
        <div className="flex items-center gap-3">
          <div className="p-2 bg-teal-50 rounded-xl text-teal-600 border border-teal-100"><Filter size={16} /></div>
          <select 
            value={selectedLeader}
            onChange={(e) => setSelectedLeader(e.target.value)}
            className="bg-transparent text-[11px] font-black uppercase tracking-widest text-slate-500 focus:outline-none cursor-pointer truncate max-w-[200px]"
          >
            <option value="all">Todo el Territorio</option>
            {team.map(m => (
              <option key={m.id} value={m.territory}>{m.territory}</option>
            ))}
          </select>
        </div>
      </div>

      {/* 3. MAIN AREA (Master-Detail) */}
      <div className="flex-1 flex overflow-hidden">
        
        {/* LEFT: LIST */}
        <div className="w-80 md:w-[400px] border-r border-slate-100 flex flex-col overflow-hidden bg-white shrink-0">
          <div 
            className="flex-1 overflow-y-auto custom-scrollbar"
            onScroll={handleScroll}
          >
            {displayedContacts.map((contact) => (
              <button
                key={contact.id}
                onClick={() => setSelectedContactId(contact.id)}
                className={cn(
                  "w-full text-left px-8 py-6 border-b border-slate-50 transition-all flex items-center gap-5 group relative",
                  selectedContact?.id === contact.id ? "bg-teal-50/40" : "hover:bg-slate-50/80"
                )}
              >
                {selectedContact?.id === contact.id && (
                  <div className="absolute left-0 top-0 bottom-0 w-1 bg-teal-600" />
                )}
                <div className={cn(
                  "w-12 h-12 rounded-2xl flex items-center justify-center font-black text-xs shrink-0 transition-all",
                  selectedContact?.id === contact.id ? "bg-teal-600 text-white shadow-lg" : "bg-slate-100 text-slate-400 group-hover:bg-teal-100 group-hover:text-teal-600"
                )}>
                  {contact.name.charAt(0)}
                </div>
                <div className="flex-1 min-w-0">
                  <p className={cn(
                    "text-[12px] font-black uppercase truncate mb-1.5",
                    selectedContact?.id === contact.id ? "text-slate-900" : "text-slate-600"
                  )}>{contact.name}</p>
                  <div className="flex items-center gap-3 overflow-hidden">
                    <span className="text-[10px] font-bold text-slate-400 font-mono shrink-0">{contact.cedula}</span>
                    <span className="w-1 h-1 rounded-full bg-slate-200 shrink-0" />
                    <span className="text-[10px] font-black text-teal-600/60 uppercase truncate">{contact.neighborhood}</span>
                  </div>
                </div>
                <ChevronRight size={16} className={cn(
                  "transition-transform",
                  selectedContact?.id === contact.id ? "text-teal-600 translate-x-1" : "text-slate-200"
                )} />
              </button>
            ))}
            
            {filteredContacts.length > displayedContacts.length && (
              <div className="p-8 text-center bg-slate-50/20">
                 <div className="w-6 h-6 border-2 border-teal-600 border-t-transparent rounded-full animate-spin mx-auto" />
                 <p className="text-[10px] font-black text-slate-400 uppercase mt-4 tracking-widest">Cargando registros tácticos...</p>
              </div>
            )}

            {filteredContacts.length === 0 && (
              <div className="p-20 text-center">
                <Users size={48} className="text-slate-100 mx-auto mb-4" />
                <p className="text-[11px] font-black uppercase text-slate-300 tracking-[0.2em]">Sin resultados operativos</p>
              </div>
            )}
          </div>
          <div className="p-5 bg-slate-50/50 border-t border-slate-100 flex justify-between items-center text-[10px] font-black text-slate-400 uppercase tracking-widest shrink-0">
            <span>{filteredContacts.length.toLocaleString()} Pax Registrados</span>
            <span className="text-teal-600">Sync Online</span>
          </div>
        </div>

        {/* RIGHT: DETAIL */}
        <div className="flex-1 bg-white flex flex-col overflow-hidden">
          {selectedContact ? (
            <div className="flex-1 flex flex-col p-10 md:p-16 overflow-y-auto custom-scrollbar">
              <div className="max-w-4xl mx-auto w-full space-y-10">
                
                {/* Profile Header */}
                <div className="relative">
                  <div className="flex flex-col md:flex-row justify-between items-start gap-8 mb-12">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 mb-4">
                        <span className="px-3 py-1 bg-teal-50 text-teal-700 text-[9px] font-black uppercase tracking-widest rounded-lg border border-teal-100 shadow-sm">Expediente de Campaña</span>
                      </div>
                      <h3 className="text-5xl font-black text-slate-900 tracking-tighter uppercase break-words leading-[0.85] mb-6">
                        {selectedContact.name}
                      </h3>
                      <div className="flex flex-wrap items-center gap-8 text-slate-400">
                        <div className="flex items-center gap-2 text-sm font-bold uppercase tracking-tight">
                          <IdCard size={18} className="text-teal-500" /> {selectedContact.cedula}
                        </div>
                        <div className="flex items-center gap-2 text-sm font-bold uppercase tracking-tight">
                          <MapPin size={18} className="text-teal-500" /> {selectedContact.neighborhood}
                        </div>
                      </div>
                    </div>
                    <div className="bg-slate-900 text-white px-8 py-4 rounded-[1.5rem] text-xs font-black uppercase tracking-[0.3em] shrink-0 shadow-2xl">
                      {selectedContact.stage}
                    </div>
                  </div>

                  {/* Operational Actions */}
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-5">
                    <button onClick={() => window.open(`tel:${selectedContact.phone}`)} className="flex flex-col items-center justify-center p-6 bg-slate-50 text-slate-600 rounded-[2rem] hover:bg-teal-600 hover:text-white transition-all transform hover:-translate-y-1 border border-slate-100 shadow-sm group">
                      <PhoneCall size={24} className="mb-3 group-hover:scale-110 transition-transform" />
                      <span className="text-[10px] font-black uppercase tracking-widest">Llamada</span>
                    </button>
                    <button onClick={() => window.open(`https://wa.me/${selectedContact.phone}`)} className="flex flex-col items-center justify-center p-6 bg-emerald-50 text-emerald-700 rounded-[2rem] hover:bg-emerald-600 hover:text-white transition-all transform hover:-translate-y-1 border border-emerald-100 shadow-sm group">
                      <MessageCircle size={24} className="mb-3 group-hover:scale-110 transition-transform" />
                      <span className="text-[10px] font-black uppercase tracking-widest">WhatsApp</span>
                    </button>
                    <button 
                      onClick={() => moveContactStage(selectedContact.id, STAGES[STAGES.indexOf(selectedContact.stage) - 1])}
                      disabled={STAGES.indexOf(selectedContact.stage) === 0}
                      className="flex flex-col items-center justify-center p-6 bg-slate-50 text-slate-400 rounded-[2rem] hover:bg-rose-500 hover:text-white disabled:opacity-30 transition-all border border-slate-100 group"
                    >
                      <ChevronLeft size={24} className="mb-3" />
                      <span className="text-[10px] font-black uppercase tracking-widest">Retroceder</span>
                    </button>
                    <button 
                      onClick={() => moveContactStage(selectedContact.id, STAGES[STAGES.indexOf(selectedContact.stage) + 1])}
                      disabled={STAGES.indexOf(selectedContact.stage) === STAGES.length - 1}
                      className="flex flex-col items-center justify-center p-6 bg-teal-600 text-white rounded-[2rem] hover:bg-teal-700 transition-all shadow-xl shadow-teal-100 transform hover:-translate-y-1 group"
                    >
                      <ChevronRight size={24} className="mb-3 group-hover:translate-x-1 transition-transform" />
                      <span className="text-[10px] font-black uppercase tracking-widest">Avanzar</span>
                    </button>
                  </div>
                </div>

                {/* Grid Info */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-10">
                  <div className="bg-slate-50/50 p-10 rounded-[2.5rem] border border-slate-100 space-y-8">
                    <h4 className="text-[12px] font-black text-slate-400 uppercase tracking-[0.3em] flex items-center gap-3">
                      <div className="w-2 h-2 rounded-full bg-teal-500" /> Localización
                    </h4>
                    <div className="space-y-6">
                      <div>
                        <p className="text-[10px] font-black text-slate-300 uppercase tracking-widest mb-2">Dirección</p>
                        <p className="text-md font-bold text-slate-700 uppercase leading-tight">{selectedContact.address || 'No registrada'}</p>
                      </div>
                      <div>
                        <p className="text-[10px] font-black text-slate-300 uppercase tracking-widest mb-2">Zona Electoral</p>
                        <p className="text-md font-bold text-slate-700 uppercase leading-tight">{selectedContact.neighborhood}</p>
                      </div>
                    </div>
                  </div>

                  <div className="bg-slate-50/50 p-10 rounded-[2.5rem] border border-slate-100 space-y-8">
                    <h4 className="text-[12px] font-black text-slate-400 uppercase tracking-[0.3em] flex items-center gap-3">
                      <div className="w-2 h-2 rounded-full bg-teal-500" /> Trazabilidad
                    </h4>
                    <div className="space-y-6">
                      <div>
                        <p className="text-[10px] font-black text-slate-300 uppercase tracking-widest mb-2">Vinculación</p>
                        <p className="text-md font-bold text-slate-700 font-mono">{new Date(selectedContact.createdAt).toLocaleDateString('es-CO', { year: 'numeric', month: 'long', day: 'numeric' })}</p>
                      </div>
                      <div>
                        <p className="text-[10px] font-black text-slate-300 uppercase tracking-widest mb-2">Legalidad</p>
                        <div className="flex items-center gap-2 bg-emerald-100/50 w-fit px-4 py-2 rounded-2xl border border-emerald-200">
                          <UserCheck size={14} className="text-emerald-600" />
                          <p className="text-[10px] font-black text-emerald-700 uppercase tracking-widest">Habeas Data OK</p>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Bottom Analytics Strip */}
                <div className="bg-teal-50 p-8 rounded-[2.5rem] flex items-center justify-between border border-teal-100 relative overflow-hidden group shadow-sm">
                   <div className="absolute inset-0 bg-gradient-to-r from-teal-600/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
                   <div className="flex items-center gap-6 relative z-10">
                      <div className="w-14 h-14 bg-white rounded-2xl flex items-center justify-center text-teal-600 border border-teal-100 shadow-sm">
                        <Target size={32} />
                      </div>
                      <div>
                         <p className="text-md font-black text-slate-900 uppercase tracking-tight">Análisis de Intención de Voto</p>
                         <p className="text-[11px] text-teal-600 font-bold uppercase tracking-[0.2em]">Prioridad de contacto: Máxima Inmediata</p>
                      </div>
                   </div>
                   <button className="bg-teal-600 hover:bg-teal-700 text-white w-14 h-14 rounded-2xl transition-all shadow-lg shadow-teal-100 flex items-center justify-center relative z-10 hover:rotate-12 transform">
                      <ExternalLink size={24} />
                   </button>
                </div>

              </div>
            </div>
          ) : (
            <div className="flex-1 flex flex-col items-center justify-center">
               <div className="w-32 h-34 bg-slate-50 rounded-[3rem] flex items-center justify-center mb-8 border border-slate-100 shadow-inner">
                 <Users size={64} className="text-slate-200" />
               </div>
               <p className="text-xs font-black uppercase tracking-[0.5em] text-slate-300 animate-pulse">Seleccione un ciudadano para mando táctico</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
