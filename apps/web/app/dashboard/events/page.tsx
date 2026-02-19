"use client";

import React, { useState, useMemo, useEffect } from 'react';
import { useCRM, CampaignEvent } from '@/context/CRMContext';
import { useAuth } from '@/context/auth';
import { useToast } from '@/context/ToastContext';
import { AlertDialog } from '@/components/ui/AlertDialog';
import { Calendar, MapPin, Users, Plus, X, Tag, Pencil, Trash2, AlertTriangle, Globe, Map, Filter, Search, ChevronDown, Check } from 'lucide-react';
import { cn } from '@/components/ui/utils';
import { LocationSelector } from '@/components/ui/LocationSelector';
import { MEDELLIN_LOCATIONS } from '@/data/medellin-locations';
import { MEDELLIN_ZONES } from '@/data/medellin-geo';
import dynamic from 'next/dynamic';

const StrategicMap = dynamic(() => import('@/components/layout/StrategicMap'), { 
  ssr: false,
  loading: () => <div className="w-full h-full flex items-center justify-center text-slate-500 font-black animate-pulse">CARGANDO INTELIGENCIA TERRITORIAL...</div>
});

export default function EventsPage() {
  const { events, addEvent, updateEvent, deleteEvent, rsvpEvent } = useCRM();
  const { user } = useAuth();
  const { success: toastSuccess } = useToast();
  
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [isMapModalOpen, setIsMapModalOpen] = useState(false);
  const [isGlobalMapOpen, setIsGlobalMapOpen] = useState(false);
  const [isErrorModalOpen, setIsErrorModalOpen] = useState(false);
  const [selectedLocation, setSelectedLocation] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState("");
  const [eventToDelete, setEventToDelete] = useState<string | null>(null);
  const [editingEvent, setEditingEvent] = useState<CampaignEvent | null>(null);

  // Map Filters State
  const [mapFilterType, setMapFilterType] = useState<string>("all");
  const [mapFilterStartDate, setMapFilterStartDate] = useState<string>("");
  const [mapFilterEndDate, setMapFilterEndDate] = useState<string>("");
  const [mapSearch, setMapSearch] = useState<string>("");
  const [isRangePickerOpen, setIsRangePickerOpen] = useState(false);
  const [isTypeDropdownOpen, setIsTypeDropdownOpen] = useState(false);
  const [isModalTypeOpen, setIsModalTypeOpen] = useState(false);

  const filteredEventsForMap = useMemo(() => {
    return events.filter(event => {
      const filterType = mapFilterType.trim().toLowerCase();
      const eventType = event.type.trim().toLowerCase();
      
      let matchesType = filterType === "all";
      if (!matchesType) {
        if (filterType === "otro" || filterType === "otros") {
          matchesType = eventType === "otro" || eventType === "otros";
        } else {
          matchesType = eventType === filterType;
        }
      }
      
      const eventDateStr = event.date.includes('T') ? event.date.split('T')[0] : event.date;
      const afterStart = !mapFilterStartDate || eventDateStr >= mapFilterStartDate;
      const beforeEnd = !mapFilterEndDate || eventDateStr <= mapFilterEndDate;
      const matchesDate = afterStart && beforeEnd;
      
      const search = mapSearch.trim().toLowerCase();
      const matchesSearch = !search || 
        event.title.toLowerCase().includes(search) ||
        event.location.toLowerCase().includes(search);
      
      return matchesType && matchesDate && matchesSearch;
    });
  }, [events, mapFilterType, mapFilterStartDate, mapFilterEndDate, mapSearch]);

  const clearMapFilters = () => {
    setMapFilterType("all");
    setMapFilterStartDate("");
    setMapFilterEndDate("");
    setMapSearch("");
    setIsRangePickerOpen(false);
    setIsTypeDropdownOpen(false);
  };
  
  const [newEvent, setNewEvent] = useState<Omit<CampaignEvent, 'id' | 'attendeesCount'>>({
    title: '',
    date: '',
    location: '',
    type: 'Reunión'
  });

  const isAdmin = ["SuperAdmin", "AdminCampana"].includes(user?.role || "");

  const isLocationValid = (text: string): boolean => {
    const cleanText = text.trim().toLowerCase();
    const isFromList = MEDELLIN_LOCATIONS.some(opt => opt.name.toLowerCase() === cleanText);
    if (isFromList) return true;

    const geoKeywords = /\b(comuna|barrio|sector|calle|carrera|cra|cll|avenida|diagonal|belencito|corazon|poblado|laureles|belen|itagu|envigado|bello|sabaneta|estrella|caldas|copacabana|girardota|barbosa|santa|santo|san|pilarica|boston|prado|centro)\b/i;
    const hasGeoKeyword = geoKeywords.test(cleanText);
    const hasLetters = /[a-z]/i.test(cleanText);
    const isRepetitive = /(.)\1{4,}/.test(cleanText);
    const isRandomSequence = /asdf|qwerty|zxcv|jklm|dfgh|hjkl/i.test(cleanText);

    if (hasGeoKeyword && hasLetters && !isRepetitive && !isRandomSequence) return true;
    return cleanText.length > 6 && hasLetters && !isRepetitive && !isRandomSequence;
  };

  const validateLocation = (query: string) => {
    if (isLocationValid(query)) {
      setNewEvent({ ...newEvent, location: query });
      handleOpenMap(query);
    } else {
      setErrorMessage("Ubicación no encontrada. El lugar ingresado no parece ser una dirección válida. Por favor, intenta de nuevo.");
      setIsErrorModalOpen(true);
    }
  };

  const handleMapClick = (location: string) => {
    if (isLocationValid(location)) {
      handleOpenMap(location);
    } else {
      setErrorMessage("Ubicación no encontrada. El lugar ingresado no parece ser una dirección válida. Por favor, intenta de nuevo.");
      setIsErrorModalOpen(true);
    }
  };

  const handleOpenMap = (location: string) => {
    setSelectedLocation(location);
    setIsMapModalOpen(true);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (editingEvent) {
      updateEvent(editingEvent.id, newEvent);
      toastSuccess("Evento actualizado correctamente");
    } else {
      addEvent({ ...newEvent, attendeesCount: 0 });
      toastSuccess("Evento creado correctamente");
    }
    closeModal();
  };

  const handleEdit = (event: CampaignEvent) => {
    setEditingEvent(event);
    setNewEvent({
      title: event.title,
      date: event.date,
      location: event.location,
      type: event.type
    });
    setIsModalOpen(true);
  };

  const handleDelete = (id: string) => {
    setEventToDelete(id);
    setIsDeleteModalOpen(true);
  };

  const handleConfirmDelete = () => {
    if (eventToDelete) {
      deleteEvent(eventToDelete);
      toastSuccess("Evento eliminado correctamente");
      setEventToDelete(null);
    }
  };

  const closeModal = () => {
    setIsModalOpen(false);
    setEditingEvent(null);
    setNewEvent({ title: '', date: '', location: '', type: 'Reunión' });
    setIsModalTypeOpen(false);
  };

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (isErrorModalOpen) setIsErrorModalOpen(false);
        else if (isMapModalOpen) setIsMapModalOpen(false);
        else if (isGlobalMapOpen) setIsGlobalMapOpen(false);
        else if (isModalOpen) closeModal();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isModalOpen, isMapModalOpen, isGlobalMapOpen, isErrorModalOpen]);

  const EVENT_TYPES = ["Reunión", "Marcha", "Capacitación", "Otro"];

  return (
    <div className="space-y-8">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-black text-slate-900 tracking-tighter uppercase">Agenda de Campaña</h1>
          <p className="text-slate-500 font-medium">Planificación de marchas, reuniones y eventos masivos.</p>
        </div>
        <div className="flex gap-3">
          <button 
            onClick={() => setIsGlobalMapOpen(true)}
            className="bg-white text-teal-600 border-2 border-slate-100 px-6 py-3 rounded-2xl font-black text-sm shadow-sm hover:border-teal-500 hover:bg-teal-50 transition-all flex items-center gap-2"
          >
            <Map size={18} /> Mapa Estratégico
          </button>
          <button 
            onClick={() => setIsModalOpen(true)}
            className="bg-teal-600 text-white px-6 py-3 rounded-2xl font-black text-sm shadow-xl shadow-teal-200 hover:bg-teal-700 transition-all flex items-center gap-2"
          >
            <Plus size={18} /> Nuevo Evento
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {events.map((event) => {
          const eventDate = new Date(event.date);
          const day = eventDate.getUTCDate();
          const month = eventDate.toLocaleString('es', { month: 'short' }).toUpperCase();

          return (
            <div key={event.id} className="bg-white rounded-[2.5rem] border border-slate-100 shadow-sm overflow-hidden hover:shadow-xl transition-all group">
              <div className="p-8">
                <div className="flex items-start justify-between mb-6">
                  <div className="bg-teal-50 text-teal-600 w-16 h-16 rounded-2xl flex flex-col items-center justify-center border border-teal-100 group-hover:bg-teal-600 group-hover:text-white group-hover:border-teal-500 transition-all duration-300 shadow-inner">
                    <span className="text-2xl font-black leading-none">{day || '??'}</span>
                    <span className="text-[10px] font-black uppercase tracking-widest">{month || '---'}</span>
                  </div>
                  <div className="flex gap-2">
                    <span className={cn(
                      "text-[8px] font-black uppercase tracking-widest px-4 py-1.5 rounded-full border shadow-sm",
                      event.type === 'Marcha' ? 'bg-red-50 text-red-600 border-red-100' :
                      event.type === 'Reunión' ? 'bg-emerald-50 text-emerald-600 border-emerald-100' :
                      'bg-teal-50 text-teal-600 border-teal-100'
                    )}>
                      {event.type}
                    </span>
                    {isAdmin && (
                      <div className="flex gap-1">
                        <button 
                          onClick={() => handleEdit(event)}
                          className="p-2 text-slate-400 hover:text-teal-600 hover:bg-teal-50 rounded-xl transition-all"
                        >
                          <Pencil size={14} />
                        </button>
                        <button 
                          onClick={() => handleDelete(event.id)}
                          className="p-2 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-xl transition-all"
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                    )}
                  </div>
                </div>

                <h3 className="text-xl font-black text-slate-900 mb-4 uppercase tracking-tight leading-tight">{event.title}</h3>
                
                <div className="space-y-3 mb-8">
                  <button 
                    onClick={() => handleMapClick(event.location)}
                    className="flex items-center gap-2 text-slate-500 text-[11px] font-black uppercase hover:text-teal-600 transition-colors group/loc"
                  >
                    <MapPin size={14} className="text-teal-500 group-hover/loc:scale-110 transition-transform" /> 
                    <span className="truncate border-b-2 border-slate-50 group-hover/loc:border-teal-100">
                      {event.location}
                    </span>
                  </button>
                  <div className="flex items-center gap-2 text-slate-400 text-[10px] font-black uppercase tracking-widest">
                    <Users size={14} className="text-emerald-500" /> {event.attendeesCount} Confirmados
                  </div>
                </div>

                <button 
                  onClick={() => rsvpEvent(event.id)}
                  className="w-full py-4 bg-teal-600 text-white rounded-2xl font-black text-[10px] uppercase tracking-[0.2em] hover:bg-teal-700 shadow-lg shadow-teal-200 hover:shadow-teal-300 transition-all active:scale-[0.98]"
                >
                  Registrar Asistencia (+1)
                </button>
              </div>
            </div>
          );
        })}
      </div>

      {/* Modal Nueva Evento */}
      {isModalOpen && (
        <div 
          className="fixed inset-0 bg-slate-900/60 backdrop-blur-md z-50 flex items-center justify-center p-4 animate-in fade-in duration-300"
          onClick={closeModal}
        >
          <div 
            className="bg-white w-full max-w-lg rounded-[3rem] shadow-2xl overflow-visible animate-in zoom-in-95 duration-300 relative"
            onClick={(e) => e.stopPropagation()}
          >
            <button 
              onClick={closeModal} 
              className="absolute top-8 right-8 z-10 p-2.5 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-2xl transition-all group"
            >
              <X size={20} className="group-hover:rotate-90 transition-transform" />
            </button>

            <div className="px-10 py-10 border-b border-slate-100 bg-slate-50/50 rounded-t-[3rem]">
              <div className="flex items-center gap-3 mb-2">
                <div className="w-2 h-2 rounded-full bg-teal-600 animate-pulse" />
                <span className="text-[10px] font-black uppercase text-teal-600 tracking-[0.3em]">Operativa de Eventos</span>
              </div>
              <h3 className="text-3xl font-black text-slate-900 tracking-tighter">
                {editingEvent ? 'Editar Evento' : 'Crear Evento'}
              </h3>
            </div>

            <form onSubmit={handleSubmit} className="p-10 space-y-6">
              <div className="grid grid-cols-1 gap-6">
                <div>
                  <label className="text-[10px] font-black uppercase text-slate-400 tracking-widest block mb-2 px-1">Título del Evento</label>
                  <input required placeholder="Ej: Gran Marcha por la Victoria" className="w-full px-6 py-4 bg-slate-50 border-2 border-transparent rounded-[1.5rem] text-sm font-bold focus:border-teal-500 focus:bg-white outline-none transition-all" value={newEvent.title} onChange={e => setNewEvent({...newEvent, title: e.target.value})} />
                </div>
                
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="text-[10px] font-black uppercase text-slate-400 tracking-widest block mb-2 px-1">Fecha</label>
                    <input required type="date" className="w-full px-6 py-4 bg-slate-50 border-2 border-transparent rounded-[1.5rem] text-sm font-bold focus:border-teal-500 focus:bg-white outline-none transition-all [color-scheme:light]" value={newEvent.date} onChange={e => setNewEvent({...newEvent, date: e.target.value})} />
                  </div>
                  <div>
                    <label className="text-[10px] font-black uppercase text-slate-400 tracking-widest block mb-2 px-1">Tipo de Evento</label>
                    <div className="relative">
                      <div 
                        onClick={() => setIsModalTypeOpen(!isModalTypeOpen)}
                        className="w-full px-6 py-4 bg-slate-50 border-2 border-transparent rounded-[1.5rem] text-sm font-bold focus-within:border-teal-500 cursor-pointer flex justify-between items-center transition-all"
                      >
                        <span className="text-slate-900">{newEvent.type}</span>
                        <ChevronDown className={cn("text-slate-400 transition-transform", isModalTypeOpen && "rotate-180")} size={16} />
                      </div>
                      
                      {isModalTypeOpen && (
                        <div className="absolute top-full left-0 right-0 mt-2 bg-white border border-slate-100 rounded-[1.5rem] shadow-xl z-50 overflow-hidden animate-in fade-in zoom-in-95 duration-200">
                          {EVENT_TYPES.map(type => (
                            <div 
                              key={type}
                              onClick={() => {
                                setNewEvent({...newEvent, type: type as any});
                                setIsModalTypeOpen(false);
                              }}
                              className="px-6 py-3 hover:bg-teal-50 text-xs font-bold text-slate-600 hover:text-teal-600 cursor-pointer transition-colors border-b border-slate-50 last:border-none flex justify-between items-center"
                            >
                              {type}
                              {newEvent.type === type && <Check size={14} className="text-teal-600" />}
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                </div>

                <div>
                  <label className="text-[10px] font-black uppercase text-slate-400 tracking-widest block mb-2 px-1">Localización Estratégica</label>
                  <LocationSelector 
                    required
                    value={newEvent.location} 
                    onChange={val => setNewEvent({...newEvent, location: val})} 
                    onManualSubmit={validateLocation}
                    placeholder="Ej. El Poblado, Envigado..."
                  />
                </div>
              </div>

              <div className="pt-6 flex gap-4">
                <button type="button" onClick={closeModal} className="flex-1 px-4 py-4 border-2 border-slate-100 rounded-2xl text-[10px] font-black uppercase tracking-widest text-slate-600 hover:bg-slate-50 transition-all">Cancelar</button>
                <button type="submit" className="flex-2 px-8 py-4 bg-teal-600 rounded-2xl text-[10px] font-black uppercase tracking-widest text-white shadow-xl shadow-teal-200 hover:bg-teal-700 transition-all flex items-center justify-center gap-2">
                  {editingEvent ? 'Guardar Cambios' : 'Generar Evento'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal del Mapa (Vista Detalle) */}
      {isMapModalOpen && selectedLocation && (
        <div 
          className="fixed inset-0 bg-slate-900/70 backdrop-blur-md z-[100] flex items-center justify-center p-6 animate-in fade-in duration-300"
          onClick={() => setIsMapModalOpen(false)}
        >
          <div 
            className="bg-white w-full max-w-5xl rounded-[3rem] shadow-2xl overflow-hidden flex flex-col relative animate-in zoom-in-95 slide-in-from-bottom-8 duration-500 max-h-[90vh]"
            onClick={(e) => e.stopPropagation()}
          >
            <button 
              onClick={() => setIsMapModalOpen(false)}
              className="absolute top-8 right-8 z-30 p-2.5 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-2xl transition-all group"
            >
              <X size={20} className="group-hover:rotate-90 transition-transform" />
            </button>

            <div className="px-10 py-10 border-b border-slate-100 bg-white">
              <div className="flex items-center gap-3 mb-2">
                <div className="w-2 h-2 rounded-full bg-teal-600 animate-pulse" />
                <span className="text-[10px] font-black uppercase text-teal-600 tracking-[0.25em]">Geolocalización Territorial</span>
              </div>
              <h3 className="text-3xl font-black text-slate-900 tracking-tight uppercase">
                {selectedLocation}
              </h3>
            </div>
            
            <div className="flex-1 bg-slate-100 relative min-h-[500px]">
              <iframe 
                width="100%" 
                height="100%" 
                frameBorder="0" 
                style={{ border: 0 }}
                src={`https://maps.google.com/maps?q=${encodeURIComponent(selectedLocation + ", Medellin, Antioquia, Colombia")}&t=&z=15&ie=UTF8&iwloc=B&output=embed`}
                allowFullScreen
                className="grayscale-[0.05] contrast-[1.05]"
              />
            </div>

            <div className="px-10 py-8 bg-slate-50 flex justify-between items-center border-t border-slate-100">
              <div className="flex items-center gap-4 text-slate-500">
                <div className="h-10 w-10 rounded-2xl bg-teal-100 flex items-center justify-center text-teal-600 shrink-0 shadow-inner">
                  <Globe size={18} />
                </div>
                <p className="text-[11px] font-bold uppercase tracking-widest leading-relaxed">
                  Utilice los controles del mapa para explorar el área estratégica del evento.
                </p>
              </div>
              <button 
                onClick={() => setIsMapModalOpen(false)}
                className="px-12 py-5 bg-slate-900 text-white rounded-[1.5rem] font-black text-[10px] uppercase tracking-[0.2em] hover:bg-teal-600 transition-all shadow-xl shadow-slate-200"
              >
                Cerrar Vista
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal Mapa Global (Strategic Map) */}
      {isGlobalMapOpen && (
        <div 
          className="fixed inset-0 bg-slate-900/80 backdrop-blur-xl z-[150] flex items-center justify-center p-6 animate-in fade-in duration-300"
          onClick={() => setIsGlobalMapOpen(false)}
        >
          <div 
            className="bg-[#0F172A] w-full max-w-6xl rounded-[3.5rem] shadow-2xl overflow-hidden flex flex-col relative animate-in zoom-in-95 duration-500 border border-white/10 h-[85vh]"
            onClick={(e) => e.stopPropagation()}
          >
            <button 
              onClick={() => setIsGlobalMapOpen(false)}
              className="absolute top-8 left-8 z-[60] p-3 bg-white/5 hover:bg-red-500/20 text-slate-400 hover:text-red-500 rounded-2xl border border-white/10 hover:border-red-500/30 transition-all group"
            >
              <X size={20} className="group-hover:-rotate-90 transition-transform" />
            </button>

            <div className="p-10 border-b border-white/5 bg-white/5 relative z-20 pl-24">
              <div className="flex flex-row items-center justify-between gap-8">
                <div>
                  <div className="flex items-center gap-3 mb-1">
                    <div className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
                    <span className="text-[10px] font-black uppercase text-emerald-400 tracking-[0.3em]">Territory Intelligence System</span>
                  </div>
                  <h3 className="text-3xl font-black text-white tracking-tighter uppercase leading-none">Mapa Estratégico</h3>
                </div>

                {/* BARRA DE FILTROS DEL MAPA */}
                <div className="flex items-center gap-4 bg-white/5 p-2 rounded-[2rem] border border-white/10 backdrop-blur-md relative">
                  <div className="flex items-center gap-3 px-5 py-3 bg-white/5 rounded-2xl border border-white/10 focus-within:border-teal-500 transition-all">
                    <Search size={16} className="text-slate-500" />
                    <input 
                      type="text" 
                      placeholder="Buscar..." 
                      className="bg-transparent border-none outline-none text-[11px] font-bold text-white placeholder:text-slate-600 min-w-[120px]"
                      value={mapSearch}
                      onChange={(e) => setMapSearch(e.target.value)}
                    />
                  </div>

                  <div className="relative">
                    <div 
                      onClick={() => {
                        setIsTypeDropdownOpen(!isTypeDropdownOpen);
                        setIsRangePickerOpen(false);
                      }}
                      className="flex items-center gap-3 px-5 py-3 bg-white/5 rounded-2xl border border-white/10 hover:border-white/20 transition-all cursor-pointer min-w-[140px]"
                    >
                      <Filter size={14} className="text-slate-500" />
                      <span className="text-[11px] text-slate-300 font-black uppercase tracking-widest">{mapFilterType === 'all' ? 'Todos' : mapFilterType}</span>
                      <ChevronDown className={cn("text-slate-600 transition-transform ml-auto", isTypeDropdownOpen && "rotate-180")} size={12} />
                    </div>

                    {isTypeDropdownOpen && (
                      <div className="absolute top-full left-0 mt-3 w-48 bg-[#1E293B] border border-white/10 rounded-2xl shadow-2xl z-[300] overflow-hidden animate-in fade-in slide-in-from-top-2 duration-200">
                        {["all", ...EVENT_TYPES].map(type => (
                          <div 
                            key={type}
                            onClick={() => {
                              setMapFilterType(type);
                              setIsTypeDropdownOpen(false);
                            }}
                            className="px-5 py-3 hover:bg-white/5 text-[10px] font-black text-slate-400 hover:text-white uppercase tracking-widest cursor-pointer transition-colors border-b border-white/5 last:border-none flex justify-between items-center"
                          >
                            {type === 'all' ? 'Todos' : type}
                            {mapFilterType === type && <Check size={12} className="text-teal-400" />}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  <div className="h-6 w-[1px] bg-white/10" />

                  <div className="relative">
                    <button 
                      onClick={() => {
                        setIsRangePickerOpen(!isRangePickerOpen);
                        setIsTypeDropdownOpen(false);
                      }}
                      className={cn(
                        "flex items-center gap-3 bg-white/5 px-5 py-3 rounded-2xl border transition-all group",
                        isRangePickerOpen ? "border-teal-500 bg-white/10 shadow-lg shadow-teal-500/10" : "border-white/10 hover:border-white/20"
                      )}
                    >
                      <Calendar size={16} className={cn("transition-colors", isRangePickerOpen ? "text-teal-400" : "text-slate-500")} />
                      <div className="flex flex-col items-start leading-none gap-1">
                        <span className="text-[7px] font-black text-slate-500 uppercase tracking-widest">Rango Temporal</span>
                        <span className="text-[10px] text-slate-200 font-black uppercase">
                          {mapFilterStartDate ? `${mapFilterStartDate} → ${mapFilterEndDate || '...'}` : 'Seleccionar'}
                        </span>
                      </div>
                      <ChevronDown size={14} className={cn("text-slate-600 transition-transform", isRangePickerOpen && "rotate-180")} />
                    </button>

                    {isRangePickerOpen && (
                      <div className="absolute top-full right-0 mt-4 p-6 bg-[#1E293B] border border-white/10 rounded-[2rem] shadow-2xl z-[300] flex flex-col gap-4 animate-in fade-in zoom-in-95 duration-200 min-w-[300px]">
                        <div className="flex items-center justify-between mb-2">
                          <span className="text-[10px] font-black text-white uppercase tracking-widest">Definir Período</span>
                          <button onClick={() => setIsRangePickerOpen(false)} className="text-slate-500 hover:text-white"><X size={14} /></button>
                        </div>
                        <div className="grid grid-cols-2 gap-4">
                          <div className="flex flex-col gap-2">
                            <label className="text-[8px] font-black text-slate-500 uppercase tracking-widest px-1">Fecha Inicio</label>
                            <input 
                              type="date" 
                              className="bg-white/5 border border-white/10 rounded-xl p-3 text-[10px] font-bold text-white outline-none focus:border-teal-500 [color-scheme:dark] w-full"
                              value={mapFilterStartDate}
                              onChange={(e) => setMapFilterStartDate(e.target.value)}
                            />
                          </div>
                          <div className="flex flex-col gap-2">
                            <label className="text-[8px] font-black text-slate-500 uppercase tracking-widest px-1">Fecha Fin</label>
                            <input 
                              type="date" 
                              className="bg-white/5 border border-white/10 rounded-xl p-3 text-[10px] font-bold text-white outline-none focus:border-teal-500 [color-scheme:dark] w-full"
                              value={mapFilterEndDate}
                              onChange={(e) => setMapFilterEndDate(e.target.value)}
                            />
                          </div>
                        </div>
                        <button 
                          onClick={() => setIsRangePickerOpen(false)}
                          className="w-full py-4 bg-teal-600 text-white rounded-xl text-[10px] font-black uppercase tracking-widest hover:bg-teal-700 transition-all mt-2 shadow-lg shadow-teal-500/20"
                        >
                          Aplicar Rango
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>

            <div className="flex-1 relative bg-[#0F172A] overflow-hidden">
              <div className="absolute inset-0 opacity-10 pointer-events-none z-10" style={{ 
                backgroundImage: `radial-gradient(#334155 1px, transparent 1px)`, 
                backgroundSize: '40px 40px' 
              }} />

              <div className="absolute inset-0 z-0">
                <StrategicMap events={filteredEventsForMap} />
                
                {filteredEventsForMap.length === 0 && (
                  <div className="absolute inset-0 flex items-center justify-center bg-[#0F172A]/40 backdrop-blur-sm z-10 pointer-events-none">
                    <div className="bg-white/5 border border-white/10 px-8 py-5 rounded-[2.5rem] text-center shadow-2xl">
                      <div className="text-slate-500 font-black text-[9px] uppercase tracking-[0.4em] mb-2">System Status: Idle</div>
                      <p className="text-white text-xs font-bold uppercase tracking-widest">No se detectan eventos estratégicos</p>
                    </div>
                  </div>
                )}
              </div>

              {/* Leyenda Absoluta */}
              <div className="absolute bottom-10 left-10 flex flex-wrap gap-4 z-20 max-w-[500px]">
                {[
                  { label: 'Marchas', color: 'bg-red-500' },
                  { label: 'Reuniones', color: 'bg-teal-500' },
                  { label: 'Capacitación', color: 'bg-emerald-500' },
                  { label: 'Otros', color: 'bg-orange-500' }
                ].map(item => (
                  <div key={item.label} className="flex items-center gap-3 bg-slate-900/60 backdrop-blur-md border border-white/10 px-4 py-2 rounded-2xl">
                    <div className={cn("h-2 w-2 rounded-full", item.color)} />
                    <span className="text-[9px] font-black text-white/70 uppercase tracking-widest">{item.label}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Error Modal */}
      {isErrorModalOpen && (
        <div 
          className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-[250] flex items-center justify-center p-4 animate-in fade-in duration-200"
          onClick={() => setIsErrorModalOpen(false)}
        >
          <div 
            className="bg-white w-full max-w-sm rounded-[3rem] shadow-2xl p-10 flex flex-col items-center text-center animate-in zoom-in-95 duration-300"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="w-20 h-20 bg-red-50 text-red-500 rounded-[2rem] flex items-center justify-center mb-8 shadow-inner">
              <AlertTriangle size={36} />
            </div>
            <h3 className="text-2xl font-black text-slate-900 mb-2 tracking-tighter">ERROR GEOGRÁFICO</h3>
            <p className="text-sm text-slate-500 font-bold leading-relaxed mb-8">
              {errorMessage}
            </p>
            <button 
              onClick={() => setIsErrorModalOpen(false)}
              className="w-full py-4 bg-slate-900 text-white rounded-2xl font-black text-[11px] uppercase tracking-widest hover:bg-red-600 transition-all shadow-xl shadow-slate-200"
            >
              Corregir Ubicación
            </button>
          </div>
        </div>
      )}

      <AlertDialog 
        isOpen={isDeleteModalOpen}
        onClose={() => setIsDeleteModalOpen(false)}
        onConfirm={handleConfirmDelete}
        title="¿Cancelar este evento?"
        description="Esta acción eliminará el evento de la agenda de forma permanente. Las asistencias registradas se perderán."
        confirmText="Confirmar Eliminación"
        variant="danger"
      />
    </div>
  );
}
