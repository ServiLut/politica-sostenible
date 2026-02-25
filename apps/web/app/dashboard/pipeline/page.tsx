"use client";

import React, { useState, useMemo } from 'react';
import { useCRM, PipelineStage, Contact } from '@/context/CRMContext';
import { useToast } from '@/context/ToastContext';
import { 
  Search, 
  MapPin, 
  PhoneCall, 
  MessageCircle, 
  Target, 
  ChevronRight, 
  ChevronLeft,
  ChevronDown,
  Users,
  Filter,
  UserCheck,
  IdCard,
  ExternalLink,
  ShieldAlert,
  BrainCircuit,
  X,
  TrendingUp,
  MessageSquareQuote,
  CheckCircle2,
  Loader2
} from 'lucide-react';
import { cn } from '@/components/ui/utils';

const STAGES: PipelineStage[] = ['Prospecto', 'Contactado', 'Simpatizante', 'Firme', 'Votó'];

export default function PipelinePage() {
  const { contacts, team, campaignGoal, moveContactStage } = useCRM();
  const { info, success } = useToast();
  const [activeStage, setActiveStage] = useState<PipelineStage>('Prospecto');
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedLeader, setSelectedLeader] = useState('all');
  const [selectedContactId, setSelectedContactId] = useState<string | null>(null);
  const [isDetailViewMobile, setIsDetailViewMobile] = useState(false);
  const [showTerritoryDropdown, setShowTerritoryDropdown] = useState(false);
  const [visibleCount, setVisibleCount] = useState(50);
  
  // AI Analysis States
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [analysisResult, setAnalysisResult] = useState<any>(null);

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

  // --- MOTOR DE INTELIGENCIA LOCAL (SOBERANÍA DEL DATO) ---
  const KNOWLEDGE_BASE: Record<string, { issues: string[], tone: string, proposal: string }> = {
    'Popular': { issues: ['Acceso a Agua Potable', 'Rutas de Transporte', 'Oportunidades Juveniles'], tone: 'Solidario y Directo', proposal: 'Inversión social prioritaria' },
    'Santa Cruz': { issues: ['Espacio Público', 'Seguridad Barrial', 'Apoyo a Madres Cabeza de Familia'], tone: 'Cercano y Comprometido', proposal: 'Red de cuidado barrial' },
    'Manrique': { issues: ['Movilidad (Metroplús)', 'Cultura y Arte', 'Desempleo'], tone: 'Enérgico y Cultural', proposal: 'Distrito creativo y empleo' },
    'Aranjuez': { issues: ['Patrimonio Cultural', 'Seguridad en Parques', 'Comercio Local'], tone: 'Respetuoso e Histórico', proposal: 'Protección al comerciante' },
    'Castilla': { issues: ['Seguridad y Convivencia', 'Mantenimiento Vial', 'Zonas Deportivas'], tone: 'Firme y Propositivo', proposal: 'Seguridad integral' },
    'Doce de Octubre': { issues: ['Conectividad Internet', 'Servicios de Salud', 'Vivienda Digna'], tone: 'Servicial y Atento', proposal: 'Salud a tu alcance' },
    'Robledo': { issues: ['Transporte Universitario', 'Seguridad', 'Centros de Salud'], tone: 'Académico y Serio', proposal: 'Corredor universitario seguro' },
    'Villa Hermosa': { issues: ['Riesgo Geológico', 'Transporte Informal', 'Escuelas'], tone: 'Protector y Urgente', proposal: 'Gestión del riesgo real' },
    'Buenos Aires': { issues: ['Tranvía y Movilidad', 'Seguridad', 'Comercio Informal'], tone: 'Moderno y Dinámico', proposal: 'Integración modal justa' },
    'La Candelaria': { issues: ['Habitante de Calle', 'Seguridad (Centro)', 'Recuperación Espacio Público', 'Ruido'], tone: 'Urgente y Ordenado', proposal: 'Plan de choque centro' },
    'Laureles': { issues: ['Ruido Nocturno', 'Parqueo Indebido', 'Seguridad Residencial'], tone: 'Formal y Tranquilo', proposal: 'Control urbano estricto' },
    'La América': { issues: ['Seguridad', 'Cuidado Adulto Mayor', 'Parques'], tone: 'Familiar y Tradicional', proposal: 'Bienestar para el mayor' },
    'San Javier': { issues: ['Turismo Responsable', 'Extorsión/Vacunas', 'Arte Urbano'], tone: 'Valiente y Artístico', proposal: 'Turismo con beneficio local' },
    'Poblado': { issues: ['Movilidad y Tacos', 'Valorización/Impuestos', 'Seguridad Tecnológica', 'Ruido'], tone: 'Ejecutivo y Profesional', proposal: 'Gerencia técnica eficiente' },
    'Guayabal': { issues: ['Contaminación Auditiva', 'Industria vs Vivienda', 'Vías'], tone: 'Industrial y Práctico', proposal: 'Convivencia mixta regulada' },
    'Belén': { issues: ['Movilidad (80)', 'Seguridad en Parques', 'Metroplús'], tone: 'Vecinal y Activo', proposal: 'Movilidad inteligente ya' },
    'San Antonio': { issues: ['Vías Terciarias', 'Transporte Veredal', 'Agroindustria'], tone: 'Rural y Campesino', proposal: 'El campo es prioridad' },
    'Default': { issues: ['Seguridad', 'Empleo', 'Costo de Vida'], tone: 'Empático', proposal: 'Mejoramiento de calidad de vida' }
  };

  const ARCHETYPES = [
    { name: 'Líder Comunitario', traits: ['Influyente', 'Preocupado por el barrio'], trigger: 'Participación' },
    { name: 'Comerciante', traits: ['Pragmático', 'Busca seguridad'], trigger: 'Economía' },
    { name: 'Estudiante', traits: ['Idealista', 'Busca oportunidades'], trigger: 'Futuro' },
    { name: 'Ama de Casa', traits: ['Protectora', 'Busca bienestar familia'], trigger: 'Seguridad' },
    { name: 'Pensionado', traits: ['Experimentado', 'Busca tranquilidad'], trigger: 'Salud' },
    { name: 'Profesional', traits: ['Analítico', 'Busca eficiencia'], trigger: 'Gestión' }
  ];

  // Pseudo-random determinista basado en string
  const getDeterministicRandom = (seed: string) => {
    let hash = 0;
    for (let i = 0; i < seed.length; i++) {
      hash = ((hash << 5) - hash) + seed.charCodeAt(i);
      hash |= 0;
    }
    const x = Math.sin(hash) * 10000;
    return x - Math.floor(x);
  };

  const handleAiAnalysis = async (contact: Contact) => {
    setIsAnalyzing(true);
    info(`Iniciando motor de inteligencia táctica para ${contact.name}...`);
    
    // Simular delay de "pensamiento profundo"
    await new Promise(resolve => setTimeout(resolve, 1800));
    
    // 1. Detección de Contexto Geográfico
    const zoneKey = Object.keys(KNOWLEDGE_BASE).find(k => contact.neighborhood.includes(k) || contact.address.includes(k)) || 'Default';
    const zoneData = KNOWLEDGE_BASE[zoneKey];
    
    // 2. Generación de Arquetipo Determinista
    const seed = contact.id + contact.name;
    const rand = getDeterministicRandom(seed);
    const archetypeIndex = Math.floor(rand * ARCHETYPES.length);
    const archetype = ARCHETYPES[archetypeIndex];

    // 3. Cálculo de Probabilidad (Base Stage + Factor Random Determinista)
    const stageBase = { 'Prospecto': 15, 'Contactado': 40, 'Simpatizante': 70, 'Firme': 95, 'Votó': 100 };
    const baseProb = stageBase[contact.stage] || 10;
    const variance = (rand * 20) - 10; // +/- 10%
    let probability = Math.round(Math.min(100, Math.max(0, baseProb + variance)));
    
    // Si ya votó, siempre es 100%
    if (contact.stage === 'Votó') probability = 100;

    // 4. Construcción del Script Cognitivo
    const issue = zoneData.issues[Math.floor(rand * zoneData.issues.length)];
    const script = `Hola ${contact.name.split(' ')[0]}, como ${archetype.name.toLowerCase()} en ${zoneKey}, sabemos que la ${issue.toLowerCase()} te afecta. Nuestra propuesta de ${zoneData.proposal.toLowerCase()} está diseñada para ti.`;

    setAnalysisResult({
      contact,
      probability,
      sentiment: probability > 80 ? 'Lealtad Alta' : probability > 50 ? 'Persuadible' : 'Resistente',
      topConcerns: zoneData.issues,
      strategicAction: probability > 70 ? 'Activar como multiplicador (Referidos)' : 'Visita presencial de líder zonal',
      riskLevel: probability < 40 ? 'Crítico' : probability < 70 ? 'Medio' : 'Bajo',
      archetype: archetype.name,
      tone: zoneData.tone,
      script: script
    });
    
    setIsAnalyzing(false);
    success("Perfilado estratégico generado con éxito.");
  };

  return (
    <div className="h-[calc(100vh-4rem)] flex flex-col -m-8 bg-slate-50/50 overflow-hidden text-slate-900 font-sans">
      
      {/* AI ANALYSIS MODAL OVERLAY */}
      {analysisResult && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 md:p-8 bg-slate-900/60 backdrop-blur-sm animate-in fade-in duration-300">
          <div className="bg-white w-full max-w-2xl rounded-[3rem] shadow-2xl overflow-hidden animate-in zoom-in-95 slide-in-from-bottom-4 duration-500">
            {/* Modal Header */}
            <div className="bg-slate-900 p-8 text-white flex justify-between items-center">
              <div className="flex items-center gap-4">
                <div className="h-12 w-12 bg-teal-600 rounded-2xl flex items-center justify-center shadow-lg shadow-teal-500/20">
                  <BrainCircuit size={24} />
                </div>
                <div>
                  <h4 className="text-xl font-black uppercase tracking-tighter">Perfilado Cognitivo</h4>
                  <p className="text-[10px] text-teal-400 font-black uppercase tracking-[0.2em]">Soberanía del Dato • Engine Local v2.0</p>
                </div>
              </div>
              <button 
                onClick={() => setAnalysisResult(null)}
                className="h-10 w-10 bg-white/10 rounded-xl flex items-center justify-center hover:bg-rose-500 transition-all group"
              >
                <X size={20} className="group-hover:rotate-90 transition-transform" />
              </button>
            </div>

            <div className="p-10 space-y-8 overflow-y-auto max-h-[70vh]">
              {/* Score and Sentiment */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                <div className="bg-slate-50 p-8 rounded-[2rem] border border-slate-100 flex flex-col items-center justify-center text-center">
                  <p className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] mb-4">Probabilidad de Voto</p>
                  <div className="relative">
                    <svg className="w-32 h-32 transform -rotate-90">
                      <circle cx="64" cy="64" r="58" stroke="currentColor" strokeWidth="8" fill="transparent" className="text-slate-100" />
                      <circle cx="64" cy="64" r="58" stroke="currentColor" strokeWidth="8" fill="transparent" 
                        strokeDasharray={364.4} strokeDashoffset={364.4 - (364.4 * analysisResult.probability) / 100}
                        className={cn(
                          "transition-all duration-1000 ease-out",
                          analysisResult.probability > 75 ? "text-emerald-500" : analysisResult.probability > 40 ? "text-teal-500" : "text-rose-500"
                        )}
                      />
                    </svg>
                    <div className="absolute inset-0 flex items-center justify-center">
                      <span className="text-3xl font-black text-slate-900 tracking-tighter">{analysisResult.probability}%</span>
                    </div>
                  </div>
                </div>

                <div className="space-y-4">
                  <div className="p-6 bg-slate-50 rounded-[1.5rem] border border-slate-100">
                    <p className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] mb-1">Arquetipo Identificado</p>
                    <p className="text-lg font-black text-slate-900 uppercase tracking-tight flex items-center gap-2">
                       <Users size={18} className="text-teal-600" />
                       {analysisResult.archetype}
                    </p>
                  </div>
                  <div className="p-6 bg-slate-50 rounded-[1.5rem] border border-slate-100">
                    <p className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] mb-1">Tono Sugerido</p>
                    <div className="flex items-center gap-2">
                      <div className="w-2 h-2 rounded-full bg-indigo-500" />
                      <p className="text-lg font-black text-slate-900 uppercase tracking-tight">{analysisResult.tone}</p>
                    </div>
                  </div>
                </div>
              </div>

              {/* Inquietudes */}
              <div className="space-y-4">
                <h5 className="text-[11px] font-black text-slate-900 uppercase tracking-[0.2em] flex items-center gap-2">
                  <ShieldAlert size={14} className="text-teal-600" /> Micro-Targeting: {analysisResult.contact.neighborhood}
                </h5>
                <div className="flex flex-wrap gap-3">
                  {analysisResult.topConcerns.map((issue: string) => (
                    <span key={issue} className="px-4 py-2 bg-teal-50 text-teal-700 rounded-xl text-[10px] font-black uppercase tracking-widest border border-teal-100">
                      {issue}
                    </span>
                  ))}
                </div>
              </div>

              {/* Recomendación */}
              <div className="p-8 bg-slate-900 rounded-[2.5rem] text-white relative overflow-hidden group">
                <TrendingUp className="absolute -right-4 -bottom-4 w-32 h-32 text-white/5 group-hover:scale-110 transition-transform duration-700" />
                <div className="relative z-10">
                  <p className="text-[10px] font-black text-teal-400 uppercase tracking-[0.3em] mb-4">Script de Conversión Personalizado</p>
                  <div className="flex gap-4">
                    <MessageSquareQuote size={24} className="text-teal-500 shrink-0 mt-1" />
                    <p className="text-sm font-medium leading-relaxed text-slate-300 italic">
                      "{analysisResult.script}"
                    </p>
                  </div>
                  <div className="mt-8 pt-6 border-t border-white/10 flex items-center justify-between">
                    <div>
                      <p className="text-[9px] font-black text-slate-500 uppercase">Siguiente Paso Táctico</p>
                      <p className="text-xs font-black uppercase text-white">{analysisResult.strategicAction}</p>
                    </div>
                    <CheckCircle2 size={24} className="text-emerald-500" />
                  </div>
                </div>
              </div>
            </div>

            {/* Footer */}
            <div className="p-8 bg-slate-50 border-t border-slate-100 flex justify-end">
              <button 
                onClick={() => setAnalysisResult(null)}
                className="px-8 py-4 bg-slate-900 text-white rounded-2xl font-black uppercase tracking-widest text-[10px] hover:bg-teal-600 transition-all shadow-xl"
              >
                Cerrar Análisis
              </button>
            </div>
          </div>
        </div>
      )}

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
      <div className="px-4 md:px-8 py-4 bg-white border-b border-slate-100 flex flex-col md:flex-row items-center gap-4 md:gap-6 shrink-0 z-10 shadow-sm">
        <div className="relative w-full md:flex-1 md:max-w-xl">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-teal-500" size={18} />
          <input 
            value={searchTerm}
            onChange={(e) => { setSearchTerm(e.target.value); setIsDetailViewMobile(false); }}
            placeholder="Buscar por nombre, documento o teléfono..." 
            className="w-full pl-12 pr-4 py-3 bg-slate-50 border border-slate-200 rounded-2xl text-xs md:text-sm font-medium focus:ring-4 focus:ring-teal-500/5 focus:border-teal-500 outline-none transition-all"
          />
        </div>
        <div className="hidden md:block h-8 w-px bg-slate-100 shrink-0" />
        <div className="relative w-full md:w-auto">
          <button 
            onClick={() => setShowTerritoryDropdown(!showTerritoryDropdown)}
            onBlur={() => setTimeout(() => setShowTerritoryDropdown(false), 200)}
            className="flex items-center gap-3 px-5 py-3 bg-slate-50 border border-slate-200 rounded-2xl transition-all hover:bg-white hover:border-teal-500/30 hover:shadow-sm group w-full md:min-w-[180px] justify-between"
          >
            <div className="flex items-center gap-2">
              <Filter size={16} className="text-teal-500 transition-transform group-hover:scale-110" />
              <span className="text-[10px] font-black uppercase tracking-[0.1em] text-slate-700 truncate max-w-[200px] md:max-w-[120px]">
                {selectedLeader === 'all' ? 'Todo el Territorio' : selectedLeader}
              </span>
            </div>
            <ChevronDown size={14} className={cn("text-slate-400 transition-transform duration-200", showTerritoryDropdown && "rotate-180")} />
          </button>

          {showTerritoryDropdown && (
            <div className="absolute top-full right-0 mt-2 w-full min-w-[200px] bg-white rounded-[1.5rem] border border-slate-100 shadow-2xl overflow-hidden animate-in fade-in slide-in-from-top-2 duration-200 p-1.5 z-50">
              <div className="max-h-60 overflow-y-auto custom-scrollbar">
                <button
                  onClick={() => {
                    setSelectedLeader('all');
                    setShowTerritoryDropdown(false);
                  }}
                  className={cn(
                    "w-full px-4 py-2.5 text-left text-[10px] font-black uppercase tracking-widest rounded-xl transition-all",
                    selectedLeader === 'all' ? "bg-teal-50 text-teal-600" : "hover:bg-slate-50 text-slate-500 hover:text-slate-900"
                  )}
                >
                  Todo el Territorio
                </button>
                {Array.from(new Set(team.map(m => m.territory))).filter(Boolean).sort().map(territory => (
                  <button
                    key={territory}
                    onClick={() => {
                      setSelectedLeader(territory);
                      setShowTerritoryDropdown(false);
                    }}
                    className={cn(
                      "w-full px-4 py-2.5 text-left text-[10px] font-black uppercase tracking-widest rounded-xl transition-all",
                      selectedLeader === territory ? "bg-teal-50 text-teal-600" : "hover:bg-slate-50 text-slate-500 hover:text-slate-900"
                    )}
                  >
                    {territory}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* 3. MAIN AREA (Master-Detail) */}
      <div className="flex-1 flex overflow-hidden relative">
        
        {/* LEFT: LIST */}
        <div className={cn(
          "w-full md:w-[400px] border-r border-slate-100 flex flex-col overflow-hidden bg-white shrink-0 absolute inset-0 md:relative z-10 transition-transform duration-300 md:translate-x-0",
          isDetailViewMobile ? "-translate-x-full md:flex" : "translate-x-0 md:flex"
        )}>
          <div 
            className="flex-1 overflow-y-auto custom-scrollbar"
            onScroll={handleScroll}
          >
            {displayedContacts.map((contact) => (
              <button
                key={contact.id}
                onClick={() => {
                  setSelectedContactId(contact.id);
                  setIsDetailViewMobile(true);
                }}
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
        <div className={cn(
          "flex-1 bg-white flex flex-col overflow-hidden absolute inset-0 md:relative z-20 transition-transform duration-300 md:translate-x-0",
          isDetailViewMobile ? "translate-x-0 md:flex" : "translate-x-full md:flex"
        )}>
          {selectedContact ? (
            <div className="flex-1 flex flex-col overflow-hidden">
              {/* Mobile Back Button */}
              <div className="md:hidden p-4 border-b border-slate-100 bg-white sticky top-0 z-30">
                <button 
                  onClick={() => setIsDetailViewMobile(false)}
                  className="flex items-center gap-2 text-slate-500 font-black uppercase text-[10px] tracking-widest"
                >
                  <ChevronLeft size={16} className="text-teal-600" /> Volver al Listado
                </button>
              </div>

              <div className="flex-1 flex flex-col p-6 md:p-16 overflow-y-auto custom-scrollbar">
                <div className="max-w-4xl mx-auto w-full space-y-10">
                  
                  {/* Profile Header */}
                  <div className="relative">
                    <div className="flex flex-col md:flex-row justify-between items-start gap-6 md:gap-8 mb-8 md:mb-12">
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2 mb-4">
                          <span className="px-3 py-1 bg-teal-50 text-teal-700 text-[9px] font-black uppercase tracking-widest rounded-lg border border-teal-100 shadow-sm">Expediente de Campaña</span>
                        </div>
                        <h3 className="text-3xl md:text-5xl font-black text-slate-900 tracking-tighter uppercase break-words leading-tight md:leading-[0.85] mb-4 md:mb-6">
                          {selectedContact.name}
                        </h3>
                        <div className="flex flex-col md:flex-row flex-wrap items-start md:items-center gap-4 md:gap-8 text-slate-400">
                          <div className="flex items-center gap-2 text-xs md:text-sm font-bold uppercase tracking-tight">
                            <IdCard size={18} className="text-teal-500" /> {selectedContact.cedula}
                          </div>
                          <div className="flex items-center gap-2 text-xs md:text-sm font-bold uppercase tracking-tight">
                            <MapPin size={18} className="text-teal-500" /> {selectedContact.neighborhood}
                          </div>
                        </div>
                      </div>
                      <div className="bg-slate-900 text-white px-6 md:px-8 py-3 md:py-4 rounded-xl md:rounded-[1.5rem] text-[10px] md:text-xs font-black uppercase tracking-[0.3em] shrink-0 shadow-2xl">
                        {selectedContact.stage}
                      </div>
                    </div>

                    {/* Operational Actions */}
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-3 md:gap-5">
                      <button onClick={() => window.open(`tel:${selectedContact.phone}`)} className="flex flex-col items-center justify-center p-4 md:p-6 bg-slate-50 text-slate-600 rounded-2xl md:rounded-[2rem] hover:bg-teal-600 hover:text-white transition-all transform hover:-translate-y-1 border border-slate-100 shadow-sm group">
                        <PhoneCall size={20} className="md:size-6 mb-2 md:mb-3 group-hover:scale-110 transition-transform" />
                        <span className="text-[9px] md:text-[10px] font-black uppercase tracking-widest text-center">Llamada</span>
                      </button>
                      <button onClick={() => window.open(`https://wa.me/${selectedContact.phone}`)} className="flex flex-col items-center justify-center p-4 md:p-6 bg-emerald-50 text-emerald-700 rounded-2xl md:rounded-[2rem] hover:bg-emerald-600 hover:text-white transition-all transform hover:-translate-y-1 border border-emerald-100 shadow-sm group">
                        <MessageCircle size={20} className="md:size-6 mb-2 md:mb-3 group-hover:scale-110 transition-transform" />
                        <span className="text-[9px] md:text-[10px] font-black uppercase tracking-widest text-center">WhatsApp</span>
                      </button>
                      <button 
                        onClick={() => moveContactStage(selectedContact.id, STAGES[STAGES.indexOf(selectedContact.stage) - 1])}
                        disabled={STAGES.indexOf(selectedContact.stage) === 0}
                        className="flex flex-col items-center justify-center p-4 md:p-6 bg-slate-50 text-slate-400 rounded-2xl md:rounded-[2rem] hover:bg-rose-500 hover:text-white disabled:opacity-30 transition-all border border-slate-100 group"
                      >
                        <ChevronLeft size={20} className="md:size-6 mb-2 md:mb-3" />
                        <span className="text-[9px] md:text-[10px] font-black uppercase tracking-widest text-center">Retroceder</span>
                      </button>
                      <button 
                        onClick={() => moveContactStage(selectedContact.id, STAGES[STAGES.indexOf(selectedContact.stage) + 1])}
                        disabled={STAGES.indexOf(selectedContact.stage) === STAGES.length - 1}
                        className="flex flex-col items-center justify-center p-4 md:p-6 bg-teal-600 text-white rounded-2xl md:rounded-[2rem] hover:bg-teal-700 transition-all shadow-xl shadow-teal-100 transform hover:-translate-y-1 group"
                      >
                        <ChevronRight size={20} className="md:size-6 mb-2 md:mb-3 group-hover:translate-x-1 transition-transform" />
                        <span className="text-[9px] md:text-[10px] font-black uppercase tracking-widest text-center">Avanzar</span>
                      </button>
                    </div>
                  </div>

                  {/* Grid Info */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6 md:gap-10">
                    <div className="bg-slate-50/50 p-8 md:p-10 rounded-3xl md:rounded-[2.5rem] border border-slate-100 space-y-6 md:space-y-8">
                      <h4 className="text-[11px] md:text-[12px] font-black text-slate-400 uppercase tracking-[0.3em] flex items-center gap-3">
                        <div className="w-2 h-2 rounded-full bg-teal-500" /> Localización
                      </h4>
                      <div className="space-y-4 md:space-y-6">
                        <div>
                          <p className="text-[10px] font-black text-slate-300 uppercase tracking-widest mb-1 md:mb-2">Dirección</p>
                          <p className="text-sm md:text-md font-bold text-slate-700 uppercase leading-tight">{selectedContact.address || 'No registrada'}</p>
                        </div>
                        <div>
                          <p className="text-[10px] font-black text-slate-300 uppercase tracking-widest mb-1 md:mb-2">Zona Electoral</p>
                          <p className="text-sm md:text-md font-bold text-slate-700 uppercase leading-tight">{selectedContact.neighborhood}</p>
                        </div>
                      </div>
                    </div>

                    <div className="bg-slate-50/50 p-8 md:p-10 rounded-3xl md:rounded-[2.5rem] border border-slate-100 space-y-6 md:space-y-8">
                      <h4 className="text-[11px] md:text-[12px] font-black text-slate-400 uppercase tracking-[0.3em] flex items-center gap-3">
                        <div className="w-2 h-2 rounded-full bg-teal-500" /> Trazabilidad
                      </h4>
                      <div className="space-y-4 md:space-y-6">
                        <div>
                          <p className="text-[10px] font-black text-slate-300 uppercase tracking-widest mb-1 md:mb-2">Vinculación</p>
                          <p className="text-sm md:text-md font-bold text-slate-700 font-mono">{new Date(selectedContact.createdAt).toLocaleDateString('es-CO', { year: 'numeric', month: 'long', day: 'numeric' })}</p>
                        </div>
                        <div>
                          <p className="text-[10px] font-black text-slate-300 uppercase tracking-widest mb-1 md:mb-2">Legalidad</p>
                          <div className="flex items-center gap-2 bg-emerald-100/50 w-fit px-3 md:px-4 py-1.5 md:py-2 rounded-xl md:rounded-2xl border border-emerald-200">
                            <UserCheck size={14} className="text-emerald-600" />
                            <p className="text-[9px] md:text-[10px] font-black text-emerald-700 uppercase tracking-widest">Habeas Data OK</p>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Bottom Analytics Strip */}
                  <div className="bg-teal-50 p-6 md:p-8 rounded-3xl md:rounded-[2.5rem] flex flex-col md:flex-row items-start md:items-center justify-between gap-6 border border-teal-100 relative overflow-hidden group shadow-sm">
                     <div className="absolute inset-0 bg-gradient-to-r from-teal-600/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
                     <div className="flex items-center gap-4 md:gap-6 relative z-10">
                        <div className="w-12 h-12 md:w-14 md:h-14 bg-white rounded-2xl flex items-center justify-center text-teal-600 border border-teal-100 shadow-sm shrink-0">
                          {isAnalyzing ? <Loader2 size={24} className="animate-spin" /> : <Target size={28} className="md:size-8" />}
                        </div>
                        <div className="min-w-0">
                           <p className="text-sm md:text-md font-black text-slate-900 uppercase tracking-tight truncate">Análisis de Intención de Voto</p>
                           <p className="text-[10px] md:text-[11px] text-teal-600 font-bold uppercase tracking-[0.2em] truncate">
                             {isAnalyzing ? "IA Procesando Perfil Cognitivo..." : "Prioridad de contacto: Máxima Inmediata"}
                           </p>
                        </div>
                     </div>
                     <button 
                      onClick={() => handleAiAnalysis(selectedContact)}
                      disabled={isAnalyzing}
                      className="bg-teal-600 hover:bg-teal-700 text-white w-full md:w-14 h-12 md:h-14 rounded-xl md:rounded-2xl transition-all shadow-lg shadow-teal-100 flex items-center justify-center relative z-10 hover:rotate-6 transform disabled:opacity-50 disabled:cursor-not-allowed shrink-0"
                     >
                        {isAnalyzing ? <Loader2 size={20} className="animate-spin" /> : <ExternalLink size={20} className="md:size-6" />}
                        <span className="md:hidden ml-2 text-[10px] font-black uppercase tracking-widest">Generar Perfilado IA</span>
                     </button>
                  </div>

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
