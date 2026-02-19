"use client";

import React, { useState, useMemo, useEffect } from 'react';
import { useCRM, CampaignEvent } from '@/context/CRMContext';
import { useAuth } from '@/context/auth';
import { useToast } from '@/context/ToastContext';
import { AlertDialog } from '@/components/ui/AlertDialog';
import { Calendar, MapPin, Users, Plus, X, Tag, Pencil, Trash2, AlertTriangle, Globe, Map, Filter, Search, ChevronDown } from 'lucide-react';
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

  const filteredEventsForMap = useMemo(() => {
    return events.filter(event => {
      // 1. Tipo (Lógica Inclusiva con Normalización)
      const filterType = mapFilterType.trim().toLowerCase();
      const eventType = event.type.trim().toLowerCase();
      
      // Short-circuit: Si es "all", incluir todo por defecto en esta categoría
      let matchesType = filterType === "all";
      
      if (!matchesType) {
        // Comparación normalizada para tipos específicos
        // Manejamos "otro" y "otros" como equivalentes para máxima compatibilidad
        if (filterType === "otro" || filterType === "otros") {
          matchesType = eventType === "otro" || eventType === "otros";
        } else {
          matchesType = eventType === filterType;
        }
      }
      
      // 2. Rango de Fechas Estricto (Respetado incluso en "Todos los tipos")
      const eventDateStr = event.date.includes('T') ? event.date.split('T')[0] : event.date;
      const afterStart = !mapFilterStartDate || eventDateStr >= mapFilterStartDate;
      const beforeEnd = !mapFilterEndDate || eventDateStr <= mapFilterEndDate;
      const matchesDate = afterStart && beforeEnd;
      
      // 3. Búsqueda por Texto (Opcional/Acumulativa)
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
    
    // 1. Coincidencia con Lista Predefinida (Prioridad)
    const isFromList = MEDELLIN_LOCATIONS.some(
      opt => opt.name.toLowerCase() === cleanText
    );
    if (isFromList) return true;

    // 2. Palabras Clave Geográficas e Indicadores Locales
    const geoKeywords = /\b(comuna|barrio|sector|calle|carrera|cra|cll|avenida|diagonal|belencito|corazon|poblado|laureles|belen|itagu|envigado|bello|sabaneta|estrella|caldas|copacabana|girardota|barbosa|santa|santo|san|pilarica|boston|prado|centro)\b/i;
    const hasGeoKeyword = geoKeywords.test(cleanText);

    // 3. Filtros de Calidad (Anti-Basura)
    const hasLetters = /[a-z]/i.test(cleanText);
    const isRepetitive = /(.)\1{4,}/.test(cleanText); // e.g., "aaaaa"
    const isRandomSequence = /asdf|qwerty|zxcv|jklm|dfgh|hjkl/i.test(cleanText); // e.g., "asdfgh"

    // Si tiene palabras clave geográficas, es válido si tiene letras y no es basura evidente
    if (hasGeoKeyword && hasLetters && !isRepetitive && !isRandomSequence) {
      return true;
    }

    // 4. Si es una dirección manual sin keywords, debe ser suficientemente descriptiva
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

  return (
    <div className="space-y-8">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-black text-slate-900 tracking-tighter">Agenda de Campaña</h1>
          <p className="text-slate-500">Planificación de marchas, reuniones y eventos masivos.</p>
        </div>
        <div className="flex gap-3">
          <button 
            onClick={() => setIsGlobalMapOpen(true)}
            className="bg-white text-blue-600 border-2 border-blue-50 px-6 py-3 rounded-2xl font-black text-sm shadow-md hover:bg-blue-50 transition-all flex items-center gap-2"
          >
            <Map size={18} /> Mapa de Eventos
          </button>
          <button 
            onClick={() => setIsModalOpen(true)}
            className="bg-blue-600 text-white px-6 py-3 rounded-2xl font-black text-sm shadow-lg hover:bg-blue-700 transition-all flex items-center gap-2"
          >
            <Plus size={18} /> Nuevo Evento
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {events.map((event) => {
          const eventDate = new Date(event.date);
          const day = eventDate.getDate() + 1; // Basic correction for UTC dates in input
          const month = eventDate.toLocaleString('es', { month: 'short' }).toUpperCase();

          return (
            <div key={event.id} className="bg-white rounded-[2.5rem] border border-slate-100 shadow-sm overflow-hidden hover:shadow-xl transition-all group">
              <div className="p-8">
                <div className="flex items-start justify-between mb-6">
                  <div className="bg-blue-50 text-blue-600 w-16 h-16 rounded-2xl flex flex-col items-center justify-center border border-blue-100 group-hover:bg-blue-600 group-hover:text-white transition-colors duration-300">
                    <span className="text-2xl font-black leading-none">{day || '??'}</span>
                    <span className="text-[10px] font-black uppercase tracking-widest">{month || '---'}</span>
                  </div>
                  <div className="flex gap-2">
                    <span className={cn(
                      "text-[8px] font-black uppercase tracking-widest px-3 py-1 rounded-full border flex items-center h-fit",
                      event.type === 'Marcha' ? 'bg-red-50 text-red-600 border-red-100' :
                      event.type === 'Reunión' ? 'bg-emerald-50 text-emerald-600 border-emerald-100' :
                      'bg-slate-50 text-slate-600 border-slate-100'
                    )}>
                      {event.type}
                    </span>
                    {isAdmin && (
                      <div className="flex gap-1">
                        <button 
                          onClick={() => handleEdit(event)}
                          className="p-1.5 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-all"
                        >
                          <Pencil size={14} />
                        </button>
                        <button 
                          onClick={() => handleDelete(event.id)}
                          className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-all"
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                    )}
                  </div>
                </div>

                <h3 className="text-xl font-black text-slate-900 mb-4">{event.title}</h3>
                
                <div className="space-y-2 mb-8">
                  <button 
                    onClick={() => handleMapClick(event.location)}
                    className="flex items-center gap-2 text-slate-500 text-xs font-bold hover:text-blue-600 transition-colors group/loc"
                  >
                    <MapPin size={14} className="text-blue-500 group-hover/loc:scale-110 transition-transform" /> 
                    <span className="underline decoration-slate-200 underline-offset-4 group-hover/loc:decoration-blue-400">
                      {event.location}
                    </span>
                  </button>
                  <div className="flex items-center gap-2 text-slate-500 text-xs font-bold">
                    <Users size={14} className="text-emerald-500" /> {event.attendeesCount} Confirmados
                  </div>
                </div>

                <button 
                  onClick={() => rsvpEvent(event.id)}
                  className="w-full py-4 bg-slate-900 text-white rounded-2xl font-black text-xs uppercase tracking-widest hover:bg-blue-600 transition-colors"
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
          className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm z-50 flex items-center justify-center p-4"
          onClick={closeModal}
        >
          <div 
            className="bg-white w-full max-w-lg rounded-[3rem] shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="px-8 py-8 border-b border-slate-100 flex justify-between items-center bg-slate-50/50">
              <div>
                <h3 className="text-2xl font-black text-slate-900 tracking-tighter">
                  {editingEvent ? 'Editar Evento' : 'Crear Evento'}
                </h3>
                <p className="text-xs font-bold text-slate-400 uppercase tracking-widest mt-1">Gestión Territorial</p>
              </div>
              <button onClick={closeModal} className="text-slate-400 hover:text-slate-600 bg-white p-2 rounded-full shadow-sm"><X /></button>
            </div>
            <form onSubmit={handleSubmit} className="p-10 space-y-6">
              <div>
                <label className="text-[10px] font-black uppercase text-slate-400 tracking-widest block mb-2">Título</label>
                <input required placeholder="Ej: Gran Marcha por la Victoria" className="w-full px-5 py-3 border-2 border-slate-100 rounded-2xl text-sm font-bold focus:border-blue-500 outline-none transition-all" value={newEvent.title} onChange={e => setNewEvent({...newEvent, title: e.target.value})} />
              </div>
              <div>
                <label className="text-[10px] font-black uppercase text-slate-400 tracking-widest block mb-2">Fecha</label>
                <input required type="date" className="w-full px-5 py-3 border-2 border-slate-100 rounded-2xl text-sm font-bold focus:border-blue-500 outline-none transition-all" value={newEvent.date} onChange={e => setNewEvent({...newEvent, date: e.target.value})} />
              </div>
              <div>
                <label className="text-[10px] font-black uppercase text-slate-400 tracking-widest block mb-2">Lugar</label>
                <LocationSelector 
                  required
                  value={newEvent.location} 
                  onChange={val => setNewEvent({...newEvent, location: val})} 
                  onManualSubmit={validateLocation}
                  placeholder="Ej. El Poblado, Envigado..."
                />
              </div>
              <div>
                <label className="text-[10px] font-black uppercase text-slate-400 tracking-widest block mb-2">Tipo</label>
                <select className="w-full px-5 py-3 border-2 border-slate-100 rounded-2xl text-sm font-bold focus:border-blue-500 outline-none transition-all" value={newEvent.type} onChange={e => setNewEvent({...newEvent, type: e.target.value as any})}>
                  <option value="Reunión">Reunión</option>
                  <option value="Marcha">Marcha</option>
                  <option value="Capacitación">Capacitación</option>
                  <option value="Otro">Otro</option>
                </select>
              </div>
              <div className="pt-4 flex gap-4">
                <button type="button" onClick={closeModal} className="flex-1 px-4 py-4 border-2 border-slate-100 rounded-2xl text-xs font-black uppercase text-slate-600 hover:bg-slate-50 transition-all">Cancelar</button>
                <button type="submit" className="flex-1 px-4 py-4 bg-blue-600 rounded-2xl text-xs font-black uppercase text-white shadow-xl hover:bg-blue-700 transition-all flex items-center justify-center gap-2">
                  {editingEvent ? 'Guardar Cambios' : 'Crear Evento'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal del Mapa */}
      {isMapModalOpen && selectedLocation && (
        <div 
          className="fixed inset-0 bg-slate-900/70 backdrop-blur-md z-[100] flex items-center justify-center p-6 animate-in fade-in duration-300"
          onClick={() => setIsMapModalOpen(false)}
        >
          <div 
            className="bg-white w-full max-w-5xl rounded-[2.5rem] shadow-2xl overflow-hidden flex flex-col relative animate-in zoom-in-95 slide-in-from-bottom-8 duration-500 max-h-[95vh]"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header Mejorado */}
            <div className="px-10 py-8 border-b border-slate-100 bg-white flex justify-between items-center">
              <div>
                <div className="flex items-center gap-2 mb-1">
                  <div className="w-2 h-2 rounded-full bg-blue-600 animate-pulse" />
                  <span className="text-[10px] font-black uppercase text-blue-600 tracking-[0.25em]">Localización del Evento</span>
                </div>
                <h3 className="text-3xl font-black text-slate-900 tracking-tight">
                  {selectedLocation}
                </h3>
              </div>
              <button 
                onClick={() => setIsMapModalOpen(false)}
                className="p-4 bg-slate-50 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-2xl transition-all duration-300 group"
              >
                <X size={24} className="group-hover:rotate-90 transition-transform" />
              </button>
            </div>
            
            {/* Contenedor Panorámico (Aspect 16:9) */}
            <div className="w-full aspect-video bg-slate-100 relative">
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

            {/* Footer Moderno */}
            <div className="px-10 py-6 border-t border-slate-100 bg-slate-50/50 flex justify-between items-center">
              <div className="flex items-center gap-3">
                <div className="h-8 w-8 rounded-full bg-blue-100 flex items-center justify-center text-blue-600">
                  <Globe size={16} />
                </div>
                <p className="text-[11px] text-slate-500 font-bold">
                  Utilice los controles del mapa para explorar la zona del evento.
                </p>
              </div>
              <button 
                onClick={() => setIsMapModalOpen(false)}
                className="px-10 py-4 bg-blue-600 text-white rounded-2xl font-black text-xs uppercase tracking-widest hover:bg-blue-700 shadow-xl shadow-blue-200 transition-all transform hover:-translate-y-1 active:translate-y-0"
              >
                Cerrar Vista de Mapa
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal Mapa de Territorio (Global) */}
      {isGlobalMapOpen && (
        <div 
          className="fixed inset-0 bg-slate-900/80 backdrop-blur-xl z-[150] flex items-center justify-center p-6 animate-in fade-in duration-300"
          onClick={() => setIsGlobalMapOpen(false)}
        >
          <div 
            className="bg-[#0F172A] w-full max-w-6xl rounded-[3rem] shadow-2xl overflow-hidden flex flex-col relative animate-in zoom-in-95 duration-500 border border-white/10 h-[85vh]"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="absolute top-8 right-8 z-20">
              <button 
                onClick={() => setIsGlobalMapOpen(false)}
                className="bg-white/10 backdrop-blur-md p-4 rounded-2xl text-white hover:bg-white/20 transition-all border border-white/10"
              >
                <X size={24} />
              </button>
            </div>

            <div className="p-10 border-b border-white/5 bg-white/5">
              <div className="flex flex-col md:flex-row md:items-end justify-between gap-6">
                <div>
                  <div className="flex items-center gap-3 mb-2">
                    <div className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
                    <span className="text-[10px] font-black uppercase text-emerald-400 tracking-[0.3em]">Territory Intelligence System</span>
                  </div>
                  <h3 className="text-3xl font-black text-white tracking-tight">Mapa Estratégico de Campaña</h3>
                  <p className="text-slate-400 text-sm mt-2">Visualización global de eventos y despliegue territorial.</p>
                </div>

                {/* Filtros Dinámicos */}
                <div className="flex flex-wrap items-center gap-4 bg-white/5 p-4 rounded-[2rem] border border-white/10">
                  <div className="flex items-center gap-2 px-4 py-2 bg-white/5 rounded-xl border border-white/10 focus-within:border-blue-500 transition-all">
                    <Search size={16} className="text-slate-400" />
                    <input 
                      type="text" 
                      placeholder="Buscar evento o lugar..." 
                      className="bg-transparent border-none outline-none text-xs text-white placeholder:text-slate-500 min-w-[150px]"
                      value={mapSearch}
                      onChange={(e) => setMapSearch(e.target.value)}
                    />
                  </div>

                  <div className="flex items-center gap-2">
                    <Filter size={14} className="text-slate-500" />
                    <select 
                      className="bg-transparent text-xs text-slate-300 font-bold outline-none cursor-pointer"
                      value={mapFilterType}
                      onChange={(e) => setMapFilterType(e.target.value)}
                    >
                      <option value="all" className="bg-[#0F172A]">Todos los tipos</option>
                      <option value="Reunión" className="bg-[#0F172A]">Reuniones</option>
                      <option value="Marcha" className="bg-[#0F172A]">Marchas</option>
                      <option value="Capacitación" className="bg-[#0F172A]">Capacitaciones</option>
                      <option value="Otro" className="bg-[#0F172A]">Otros</option>
                    </select>
                  </div>

                  <div className="h-4 w-[1px] bg-white/10" />

                  {/* Selector de Rango Único (Popover) */}
                  <div className="relative">
                    <button 
                      onClick={() => setIsRangePickerOpen(!isRangePickerOpen)}
                      className={cn(
                        "flex items-center gap-3 bg-white/5 px-5 py-2.5 rounded-[1.2rem] border transition-all group",
                        isRangePickerOpen ? "border-blue-500 bg-white/10" : "border-white/10 hover:border-white/20"
                      )}
                    >
                      <Calendar size={16} className={cn("transition-colors", isRangePickerOpen ? "text-blue-400" : "text-slate-500")} />
                      <div className="flex flex-col items-start">
                        <span className="text-[6px] font-black text-slate-500 uppercase tracking-[0.2em]">Rango de Fechas</span>
                        <span className="text-[10px] text-slate-200 font-bold">
                          {mapFilterStartDate ? `${mapFilterStartDate} → ${mapFilterEndDate || '...'}` : 'Seleccionar Rango'}
                        </span>
                      </div>
                      <ChevronDown size={14} className={cn("text-slate-600 transition-transform", isRangePickerOpen && "rotate-180")} />
                    </button>

                    {isRangePickerOpen && (
                      <div className="absolute top-full left-0 mt-3 p-4 bg-[#1E293B] border border-white/10 rounded-2xl shadow-2xl z-[200] flex gap-4 animate-in fade-in slide-in-from-top-2 duration-200">
                        <div className="flex flex-col gap-1">
                          <label className="text-[8px] font-black text-slate-400 uppercase tracking-widest">Inicio</label>
                          <input 
                            type="date" 
                            className="bg-white/5 border border-white/10 rounded-lg p-2 text-xs text-white outline-none focus:border-blue-500 [color-scheme:dark]"
                            value={mapFilterStartDate}
                            onChange={(e) => setMapFilterStartDate(e.target.value)}
                          />
                        </div>
                        <div className="flex flex-col gap-1">
                          <label className="text-[8px] font-black text-slate-400 uppercase tracking-widest">Fin</label>
                          <input 
                            type="date" 
                            className="bg-white/5 border border-white/10 rounded-lg p-2 text-xs text-white outline-none focus:border-blue-500 [color-scheme:dark]"
                            value={mapFilterEndDate}
                            onChange={(e) => setMapFilterEndDate(e.target.value)}
                          />
                        </div>
                      </div>
                    )}
                  </div>

                  {(mapFilterType !== "all" || mapFilterStartDate || mapFilterEndDate || mapSearch) && (
                    <>
                      <div className="h-4 w-[1px] bg-white/10" />
                      <button 
                        onClick={clearMapFilters}
                        className="flex items-center gap-2 px-3 py-1.5 bg-red-500/10 text-red-500 rounded-xl text-[10px] font-black uppercase tracking-widest hover:bg-red-500 hover:text-white transition-all"
                      >
                        <X size={12} /> Limpiar Filtros
                      </button>
                    </>
                  )}
                </div>
              </div>
            </div>

            <div className="flex-1 relative bg-[#0F172A] overflow-hidden">
              {/* Grid Background */}
              <div className="absolute inset-0 opacity-20 pointer-events-none z-10" style={{ 
                backgroundImage: `radial-gradient(#334155 1px, transparent 1px)`, 
                backgroundSize: '40px 40px' 
              }} />

              {/* Mapa de Cartografía Real */}
              <div className="absolute inset-0 z-0">
                <StrategicMap events={filteredEventsForMap} />
                
                {filteredEventsForMap.length === 0 && (
                  <div className="absolute inset-0 flex items-center justify-center bg-[#0F172A]/40 backdrop-blur-sm z-10 pointer-events-none">
                    <div className="bg-white/5 border border-white/10 px-8 py-4 rounded-[2rem] text-center">
                      <div className="text-slate-400 font-black text-[9px] uppercase tracking-[0.3em] mb-1">Territory Intelligence Status</div>
                      <p className="text-white text-xs font-bold">No hay eventos detectados en este rango temporal</p>
                    </div>
                  </div>
                )}
              </div>

              {/* Overlay Leyenda */}
              <div className="absolute bottom-10 left-10 flex flex-col gap-3 z-20">
                <div className="flex items-center gap-3 bg-white/5 backdrop-blur-md border border-white/10 px-4 py-2 rounded-xl">
                  <div className="h-2 w-2 rounded-full bg-red-500" />
                  <span className="text-[10px] font-black text-white/60 uppercase tracking-widest">Marchas</span>
                </div>
                <div className="flex items-center gap-3 bg-white/5 backdrop-blur-md border border-white/10 px-4 py-2 rounded-xl">
                  <div className="h-2 w-2 rounded-full bg-blue-500" />
                  <span className="text-[10px] font-black text-white/60 uppercase tracking-widest">Reuniones</span>
                </div>
                <div className="flex items-center gap-3 bg-white/5 backdrop-blur-md border border-white/10 px-4 py-2 rounded-xl">
                  <div className="h-2 w-2 rounded-full bg-emerald-500" />
                  <span className="text-[10px] font-black text-white/60 uppercase tracking-widest">Capacitaciones</span>
                </div>
                <div className="flex items-center gap-3 bg-white/5 backdrop-blur-md border border-white/10 px-4 py-2 rounded-xl">
                  <div className="h-2 w-2 rounded-full bg-orange-500" />
                  <span className="text-[10px] font-black text-white/60 uppercase tracking-widest">Otros</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Modal de Error de Localización */}
      {isErrorModalOpen && (
        <div 
          className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-[200] flex items-center justify-center p-4 animate-in fade-in duration-200"
          onClick={() => setIsErrorModalOpen(false)}
        >
          <div 
            className="bg-white w-full max-w-sm rounded-[2.5rem] shadow-2xl p-8 flex flex-col items-center text-center animate-in zoom-in-95 duration-300"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="w-16 h-16 bg-red-50 text-red-500 rounded-2xl flex items-center justify-center mb-6">
              <AlertTriangle size={32} />
            </div>
            <h3 className="text-xl font-black text-slate-900 mb-2">Ubicación no encontrada</h3>
            <p className="text-sm text-slate-500 font-bold leading-relaxed mb-8">
              {errorMessage}
            </p>
            <button 
              onClick={() => setIsErrorModalOpen(false)}
              className="w-full py-4 bg-slate-900 text-white rounded-2xl font-black text-xs uppercase tracking-widest hover:bg-blue-600 transition-colors"
            >
              Entendido
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
