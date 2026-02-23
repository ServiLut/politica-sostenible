"use client";

import React, { useState, useMemo, useEffect, useRef } from 'react';
import { useCRM, CampaignEvent } from '@/context/CRMContext';
import { useAuth } from '@/context/auth';
import { useToast } from '@/context/ToastContext';
import { AlertDialog } from '@/components/ui/AlertDialog';
import { Calendar, MapPin, Users, Plus, X, Pencil, Trash2, AlertTriangle, Globe, Map, Filter, Search, ChevronDown, Check, TrendingUp, FileDown, Loader2, ChevronLeft, ChevronRight } from 'lucide-react';
import { cn } from '@/components/ui/utils';
import { Input } from '@/components/ui/input';
import { LocationSelector } from '@/components/ui/LocationSelector';
import { MEDELLIN_LOCATIONS } from '@/data/medellin-locations';
import dynamic from 'next/dynamic';
import jsPDF from "jspdf";
import { getCoordsForLocation, Coordinate } from '@/utils/geo';

const StrategicMap = dynamic(() => import('@/components/layout/StrategicMap'), {
  ssr: false,
  loading: () => <div className="w-full h-full flex items-center justify-center text-slate-500 font-black animate-pulse">CARGANDO INTELIGENCIA TERRITORIAL...</div>
});

const EVENT_TYPES = ["Reunión", "Marcha", "Capacitación", "Otro"];
const PRIORITIES = ["Baja", "Media", "Alta"];

export default function EventsPage() {
  const { events, addEvent, updateEvent, deleteEvent, rsvpEvent, logAction } = useCRM();
  const { user } = useAuth();
  const { success: toastSuccess, info: toastInfo } = useToast();

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [isMapModalOpen, setIsMapModalOpen] = useState(false);
  const [isGlobalMapOpen, setIsGlobalMapOpen] = useState(false);
  const [isErrorModalOpen, setIsErrorModalOpen] = useState(false);
  const [selectedLocation, setSelectedLocation] = useState<string | null>(null);
  const [selectedCoords, setSelectedCoords] = useState<Coordinate | null>(null);
  const [errorMessage, setErrorMessage] = useState("");
  const [eventToDelete, setEventToDelete] = useState<string | null>(null);
  const [editingEvent, setEditingEvent] = useState<CampaignEvent | null>(null);
  const [isGeneratingPoster, setIsGeneratingPoster] = useState<string | null>(null);

  // Map Filters State
  const [mapFilterType, setMapFilterType] = useState<string>("all");
  const [mapFilterStartDate, setMapFilterStartDate] = useState<string>("");
  const [mapFilterEndDate, setMapFilterEndDate] = useState<string>("");
  const [mapSearch, setMapSearch] = useState<string>("");
  const [isRangePickerOpen, setIsRangePickerOpen] = useState(false);
  const [isTypeDropdownOpen, setIsTypeDropdownOpen] = useState(false);
  const [isModalTypeOpen, setIsModalTypeOpen] = useState(false);
  const [isModalPriorityOpen, setIsModalPriorityOpen] = useState(false);
  const [isModalCalendarOpen, setIsModalCalendarOpen] = useState(false);
  const [viewDate, setViewDate] = useState(new Date());

  // Refs for closing dropdowns on outside click
  const typeRef = useRef<HTMLDivElement>(null);
  const priorityRef = useRef<HTMLDivElement>(null);
  const calendarRef = useRef<HTMLDivElement>(null);
  const mapTypeRef = useRef<HTMLDivElement>(null);

  const daysInMonth = (year: number, month: number) => new Date(year, month + 1, 0).getDate();
  const firstDayOfMonth = (year: number, month: number) => new Date(year, month, 1).getDay();
  const monthNames = ["Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio", "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"];

  const renderCalendar = (currentDate: string, onSelect: (date: string) => void) => {
    const year = viewDate.getFullYear();
    const month = viewDate.getMonth();
    const days = [];
    const totalDays = daysInMonth(year, month);
    const startDay = firstDayOfMonth(year, month);

    for (let i = 0; i < startDay; i++) {
      days.push(<div key={`empty-${i}`} className="h-8 w-8" />);
    }

    for (let i = 1; i <= totalDays; i++) {
      const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(i).padStart(2, '0')}`;
      const isSelected = currentDate === dateStr;
      
      days.push(
        <button
          key={i}
          type="button"
          onClick={() => {
            onSelect(dateStr);
            setIsModalCalendarOpen(false);
          }}
          className={cn(
            "h-8 w-8 rounded-full text-[10px] font-black transition-all flex items-center justify-center",
            isSelected ? "bg-teal-600 text-white shadow-lg shadow-teal-200" : "hover:bg-teal-50 text-slate-600"
          )}
        >
          {i}
        </button>
      );
    }
    return days;
  };

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (typeRef.current && !typeRef.current.contains(event.target as Node)) setIsModalTypeOpen(false);
      if (priorityRef.current && !priorityRef.current.contains(event.target as Node)) setIsModalPriorityOpen(false);
      if (calendarRef.current && !calendarRef.current.contains(event.target as Node)) setIsModalCalendarOpen(false);
      if (mapTypeRef.current && !mapTypeRef.current.contains(event.target as Node)) setIsTypeDropdownOpen(false);
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

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



  const [newEvent, setNewEvent] = useState<Omit<CampaignEvent, 'id' | 'attendeesCount'>>({
    title: '',
    date: '',
    location: '',
    type: 'Reunión',
    description: '',
    priority: 'Media',
    targetAttendees: 100
  });

  const isAdmin = ["SuperAdmin", "AdminCampana"].includes(user?.role || "");

  const handleGeneratePoster = async (event: CampaignEvent) => {
    setIsGeneratingPoster(event.id);
    toastInfo(`Generando convocatoria oficial: ${event.title}`);

    await new Promise(r => setTimeout(r, 1500));

    const doc = new jsPDF();
    const pageWidth = doc.internal.pageSize.getWidth();
    const pageHeight = doc.internal.pageSize.getHeight();

    // --- Colors ---
    const slate900 = "#0F172A";
    const slate700 = "#334155";
    const slate500 = "#64748B";
    const slate100 = "#F1F5F9";
    const teal600 = "#0D9488";
    const white = "#FFFFFF";

    // --- Layout properties ---
    const margin = 15;
    const sidebarWidth = 65;
    const contentX = sidebarWidth + margin;
    const contentWidth = pageWidth - sidebarWidth - margin * 2;

    // --- Sidebar ---
    doc.setFillColor(slate900);
    doc.rect(0, 0, sidebarWidth, pageHeight, 'F');

    // Sidebar Title
    doc.setFont("helvetica", "bold");
    doc.setFontSize(16);
    doc.setTextColor(white);
    doc.text("CONVOCATORIA", sidebarWidth / 2, margin + 5, { align: "center" });

    doc.setDrawColor(teal600);
    doc.setLineWidth(1);
    doc.line(margin, margin + 12, sidebarWidth - margin, margin + 12);

    // Sidebar Info Blocks
    let y = margin + 40;
    const drawSidebarInfo = (label: string, value: string) => {
      doc.setFont("helvetica", "bold");
      doc.setFontSize(9);
      doc.setTextColor(teal600);
      doc.text(label.toUpperCase(), sidebarWidth / 2, y, { align: 'center' });

      doc.setFont("helvetica", "normal");
      doc.setFontSize(11);
      doc.setTextColor(white);
      const valueLines = doc.splitTextToSize(value, sidebarWidth - margin*2);
      doc.text(valueLines, sidebarWidth / 2, y + 5, { align: 'center' });

      y += 25;
    };

    drawSidebarInfo("Tipo de Evento", event.type);
    drawSidebarInfo("Prioridad", event.priority || 'Media');
    drawSidebarInfo("Meta Asistentes", `${event.targetAttendees || 100} asistentes`);

    // --- Main Content ---
    let contentY = margin + 5;
    // Date Box
    doc.setFillColor(slate100);
    doc.roundedRect(contentX, contentY, contentWidth, 20, 3, 3, "F");

    doc.setFont("helvetica", "bold");
    doc.setFontSize(12);
    doc.setTextColor(slate700);
    doc.text("FECHA DEL EVENTO:", contentX + 8, contentY + 13);

    doc.setFont("helvetica", "bold");
    doc.setFontSize(12);
    doc.setTextColor(teal600);
    doc.text(event.date, contentX + 50, contentY + 13);

    // Main Title
    contentY += 45;
    doc.setFont("helvetica", "bold");
    doc.setFontSize(28);
    doc.setTextColor(slate900);
    const titleLines = doc.splitTextToSize(event.title.toUpperCase(), contentWidth);
    doc.text(titleLines, contentX, contentY);

    // Location
    contentY += (titleLines.length * 10) + 5;
    doc.setFont("helvetica", "normal");
    doc.setFontSize(11);
    doc.setTextColor(slate500);
    doc.text("LUGAR:", contentX, contentY);

    doc.setFont("helvetica", "bold");
    doc.setFontSize(12);
    doc.setTextColor(slate700);
    const locationLines = doc.splitTextToSize(event.location, contentWidth);
    doc.text(locationLines, contentX, contentY + 6);
    contentY += (locationLines.length * 6) + 10;

    // Separator
    doc.setDrawColor(slate100);
    doc.setLineWidth(0.5);
    doc.line(contentX, contentY, contentX + contentWidth, contentY);
    contentY += 15;

    // Description
    doc.setFont("helvetica", "bold");
    doc.setFontSize(10);
    doc.setTextColor(slate900);
    doc.text("DESCRIPCIÓN ESTRATÉGICA", contentX, contentY);
    contentY += 8;

    doc.setFont("helvetica", "normal");
    doc.setFontSize(11);
    doc.setTextColor(slate700);
    const descLines = doc.splitTextToSize(event.description || "Sin descripción estratégica proporcionada.", contentWidth);
    doc.text(descLines, contentX, contentY);


    // --- Footer ---
    const footerY = pageHeight - 15;
    doc.setDrawColor(slate100);
    doc.setLineWidth(0.5);
    doc.line(margin, footerY, pageWidth - margin, footerY);

    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    doc.setTextColor(slate500);
    doc.text("SISTEMA DE INTELIGENCIA TERRITORIAL (SIT)", margin, footerY + 7);
    doc.text("Puesto de Mando Unificado - Colombia 2026", pageWidth - margin, footerY + 7, { align: 'right' });

    doc.save(`Convocatoria_${event.title.replace(/\s+/g, '_')}.pdf`);
    logAction("Usuario", `Convocatoria Generada: ${event.title}`, "Eventos", "Info");

    setIsGeneratingPoster(null);
    toastSuccess("Poster de convocatoria descargado.");
  };

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
    const coords = getCoordsForLocation(location);
    setSelectedLocation(location);
    setSelectedCoords(coords);
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
      type: event.type,
      description: event.description || '',
      priority: event.priority || 'Media',
      targetAttendees: event.targetAttendees || 100
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
    setNewEvent({ title: '', date: '', location: '', type: 'Reunión', description: '', priority: 'Media', targetAttendees: 100 });
    setIsModalTypeOpen(false);
    setIsModalPriorityOpen(false);
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
    <div className="space-y-10 py-4 animate-in fade-in slide-in-from-bottom-4 duration-700">
      {/* Tactical Header */}
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-6">
        <div className="space-y-2">
          <div className="flex items-center gap-2 mb-1">
            <span className="px-3 py-1 bg-teal-50 text-teal-600 text-[10px] font-black uppercase tracking-widest rounded-full border border-teal-100">
              Operativa de Campo
            </span>
          </div>
          <h1 className="text-5xl font-black text-slate-900 tracking-tighter uppercase leading-none">
            Agenda de <span className="text-teal-600">Mando</span>
          </h1>
          <p className="text-slate-500 font-medium max-w-md">
            Planificación estratégica de movilización, capacitación y eventos masivos.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={() => setIsGlobalMapOpen(true)}
            className="group h-14 px-8 bg-white text-slate-900 border border-slate-200 rounded-2xl font-black text-[10px] uppercase tracking-widest shadow-sm hover:border-teal-500 hover:bg-teal-50 transition-all flex items-center gap-3"
          >
            <Map size={18} className="text-teal-600 group-hover:scale-110 transition-transform" /> Mapa Táctico
          </button>
          <button
            onClick={() => setIsModalOpen(true)}
            className="h-14 px-8 bg-slate-900 text-white rounded-2xl font-black text-[10px] uppercase tracking-widest shadow-xl shadow-slate-200 hover:bg-teal-600 hover:shadow-teal-100 transition-all flex items-center gap-3 group"
          >
            <Plus size={18} className="group-hover:rotate-90 transition-transform" /> Crear Evento
          </button>
        </div>
      </div>

      {/* Strategic Metrics Dashboard */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
        <div className="bg-white p-6 rounded-[2rem] border border-slate-100 shadow-sm">
          <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-1">Total Eventos</p>
          <div className="flex items-end justify-between">
            <h4 className="text-3xl font-black text-slate-900">{events.length}</h4>
            <div className="h-8 w-8 bg-teal-50 text-teal-600 rounded-lg flex items-center justify-center">
              <Calendar size={18} />
            </div>
          </div>
        </div>
        <div className="bg-white p-6 rounded-[2rem] border border-slate-100 shadow-sm">
          <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-1">Convocatoria Total</p>
          <div className="flex items-end justify-between">
            <h4 className="text-3xl font-black text-slate-900">{events.reduce((acc, curr) => acc + curr.attendeesCount, 0)}</h4>
            <div className="h-8 w-8 bg-emerald-50 text-emerald-600 rounded-lg flex items-center justify-center">
              <Users size={18} />
            </div>
          </div>
        </div>
        <div className="bg-white p-6 rounded-[2rem] border border-slate-100 shadow-sm">
          <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-1">Efectividad Meta</p>
          <div className="flex items-end justify-between">
            <h4 className="text-3xl font-black text-slate-900">
              {events.length > 0
                ? Math.round((events.reduce((a, c) => a + c.attendeesCount, 0) / events.reduce((a, c) => a + (c.targetAttendees || 100), 0)) * 100)
                : 0}%
            </h4>
            <div className="h-8 w-8 bg-amber-50 text-amber-600 rounded-lg flex items-center justify-center">
              <TrendingUp size={18} />
            </div>
          </div>
        </div>
        <div className="bg-white p-6 rounded-[2rem] border border-slate-100 shadow-sm">
          <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-1">Nivel de Alerta</p>
          <div className="flex items-center gap-2 mt-2">
            <div className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
            <span className="text-[10px] font-black text-slate-900 uppercase">Operación Normal</span>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
        {events.map((event) => {
          const eventDate = new Date(event.date);
          const day = eventDate.getUTCDate();
          const month = eventDate.toLocaleString('es', { month: 'short' }).toUpperCase();
          const target = event.targetAttendees || 100;
          const progress = Math.min((event.attendeesCount / target) * 100, 100);

          return (
            <div key={event.id} className="bg-white rounded-[3rem] border border-slate-100 shadow-sm overflow-hidden hover:shadow-2xl transition-all group relative">
              <div className="absolute top-8 right-8 z-10">
                <div className={cn(
                  "px-3 py-1 rounded-full text-[8px] font-black uppercase tracking-widest border shadow-sm",
                  event.priority === 'Alta' ? 'bg-rose-50 text-rose-600 border-rose-100' :
                  event.priority === 'Media' ? 'bg-amber-50 text-amber-600 border-amber-100' :
                  'bg-slate-50 text-slate-500 border-slate-100'
                )}>
                  Prioridad {event.priority || 'Media'}
                </div>
              </div>

              <div className="p-10">
                <div className="flex items-center gap-6 mb-8">
                  <div className="bg-slate-50 text-slate-900 w-20 h-20 rounded-[1.5rem] flex flex-col items-center justify-center border border-slate-100 group-hover:bg-teal-600 group-hover:text-white group-hover:border-teal-500 transition-all duration-500 shadow-inner shrink-0">
                    <span className="text-3xl font-black leading-none">{day || '??'}</span>
                    <span className="text-[10px] font-black uppercase tracking-widest">{month || '---'}</span>
                  </div>
                  <div className="min-w-0">
                    <span className={cn(
                      "text-[9px] font-black uppercase tracking-widest mb-1 block",
                      event.type === 'Marcha' ? 'text-rose-600' :
                      event.type === 'Reunión' ? 'text-emerald-600' :
                      'text-teal-600'
                    )}>
                      {event.type}
                    </span>
                    <h3 className="text-2xl font-black text-slate-900 uppercase tracking-tighter leading-[0.9] truncate">{event.title}</h3>
                  </div>
                </div>

                <div className="space-y-6 mb-10">
                  <button
                    onClick={() => handleMapClick(event.location)}
                    className="flex items-center gap-3 text-slate-400 text-[11px] font-bold uppercase hover:text-teal-600 transition-colors w-full group/loc"
                  >
                    <div className="h-8 w-8 rounded-xl bg-slate-50 flex items-center justify-center group-hover/loc:bg-teal-50 transition-colors">
                      <MapPin size={16} className="text-teal-500" />
                    </div>
                    <span className="truncate border-b border-transparent group-hover/loc:border-teal-200">
                      {event.location}
                    </span>
                  </button>

                  <div className="space-y-3">
                    <div className="flex justify-between items-end">
                      <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Convocatoria ({event.attendeesCount}/{target})</p>
                      <p className="text-[10px] font-black text-slate-900 uppercase">{progress.toFixed(0)}%</p>
                    </div>
                    <div className="h-2 w-full bg-slate-100 rounded-full overflow-hidden">
                      <div
                        className={cn(
                          "h-full transition-all duration-1000",
                          progress > 80 ? "bg-emerald-500" : progress > 40 ? "bg-teal-500" : "bg-amber-500"
                        )}
                        style={{ width: `${progress}%` }}
                      />
                    </div>
                  </div>
                </div>

                <div className="flex gap-3">
                  <button
                    onClick={() => rsvpEvent(event.id)}
                    className="flex-1 py-4 bg-slate-900 text-white rounded-2xl font-black text-[10px] uppercase tracking-[0.2em] hover:bg-teal-600 shadow-xl shadow-slate-100 hover:shadow-teal-100 transition-all flex items-center justify-center gap-2"
                  >
                    <Users size={16} /> Confirmar Asistencia
                  </button>
                  <div className="relative group/more">
                    <button
                      onClick={() => handleGeneratePoster(event)}
                      disabled={isGeneratingPoster === event.id}
                      className="h-14 w-14 flex items-center justify-center bg-slate-50 text-slate-600 rounded-2xl border border-slate-100 hover:bg-white hover:border-teal-200 hover:text-teal-600 transition-all disabled:opacity-50"
                      title="Generar Convocatoria PDF"
                    >
                      {isGeneratingPoster === event.id ? <Loader2 size={20} className="animate-spin" /> : <FileDown size={20} />}
                    </button>
                  </div>
                </div>

                {isAdmin && (
                  <div className="mt-6 pt-6 border-t border-slate-50 flex justify-end gap-2">
                    <button
                      onClick={() => handleEdit(event)}
                      className="p-3 text-slate-300 hover:text-teal-600 hover:bg-teal-50 rounded-xl transition-all"
                    >
                      <Pencil size={16} />
                    </button>
                    <button
                      onClick={() => handleDelete(event.id)}
                      className="p-3 text-slate-300 hover:text-rose-500 hover:bg-rose-50 rounded-xl transition-all"
                    >
                      <Trash2 size={16} />
                    </button>
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Modal Nuevo Evento - Rediseñado */}
      {isModalOpen && (
        <div
          className="fixed inset-0 bg-slate-900/60 backdrop-blur-md z-[200] flex items-center justify-center p-4 animate-in fade-in duration-300"
          onClick={closeModal}
        >
          <div
            className="bg-white w-full max-w-2xl rounded-[3rem] shadow-2xl overflow-visible animate-in zoom-in-95 duration-300 relative"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              onClick={closeModal}
              className="absolute top-8 right-8 z-10 p-2.5 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-2xl transition-all group"
            >
              <X size={20} className="group-hover:rotate-90 transition-transform" />
            </button>

            <div className="px-6 md:px-10 py-8 md:py-10 border-b border-slate-100 bg-slate-50/50 rounded-t-[2.5rem] md:rounded-t-[3rem]">
              <div className="flex items-center gap-3 mb-2">
                <div className="w-2 h-2 rounded-full bg-teal-600 animate-pulse" />
                <span className="text-[10px] font-black uppercase text-teal-600 tracking-[0.3em]">Planificación de Mando</span>
              </div>
              <h3 className="text-3xl font-black text-slate-900 tracking-tighter uppercase">
                {editingEvent ? 'Editar Operación' : 'Nueva Operación'}
              </h3>
            </div>

            <form onSubmit={handleSubmit} className="flex flex-col max-h-[85vh]">
              <div className="flex-1 p-6 md:p-10 space-y-6 overflow-y-auto custom-scrollbar">
                <div className="grid grid-cols-1 gap-6">
                  <div>
                    <label className="text-[10px] font-black uppercase text-slate-400 tracking-widest block mb-2 px-1">Título de la Operación</label>
                    <Input 
                      required 
                      placeholder="Ej: Gran Marcha por la Victoria" 
                      className="rounded-[1.5rem] bg-teal-50/30 border-slate-200 font-bold focus-visible:border-teal-500 focus-visible:ring-teal-500/10" 
                      value={newEvent.title} 
                      onChange={e => setNewEvent({...newEvent, title: e.target.value})} 
                    />
                  </div>

                  <div>
                    <label className="text-[10px] font-black uppercase text-slate-400 tracking-widest block mb-2 px-1">Descripción Estratégica</label>
                    <textarea 
                      rows={3} 
                      placeholder="Objetivos y detalles clave..." 
                      className="w-full px-6 py-4 border-2 border-slate-200 bg-teal-50/30 rounded-[1.5rem] text-sm font-bold focus:border-teal-500 focus:ring-2 focus:ring-teal-500/10 outline-none transition-all resize-none placeholder:text-slate-400" 
                      value={newEvent.description} 
                      onChange={e => setNewEvent({...newEvent, description: e.target.value})} 
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="text-[10px] font-black uppercase text-slate-400 tracking-widest block mb-2 px-1">Fecha</label>
                      <div className="relative" ref={calendarRef}>
                        <button
                          type="button"
                          onClick={() => {
                            setIsModalCalendarOpen(!isModalCalendarOpen);
                            setIsModalTypeOpen(false);
                            setIsModalPriorityOpen(false);
                          }}
                          className="w-full flex items-center gap-4 px-5 py-3.5 border-2 border-slate-200 bg-teal-50/30 rounded-[1.5rem] text-sm font-bold text-slate-700 hover:border-teal-500 transition-all outline-none"
                        >
                          <Calendar size={18} className="text-teal-600" />
                          <span className="truncate">{newEvent.date || "Seleccionar..."}</span>
                        </button>
                        {isModalCalendarOpen && (
                          <div className="absolute top-full left-0 mt-2 p-4 bg-white border border-slate-100 rounded-[2rem] shadow-2xl z-[100] animate-in fade-in zoom-in-95 duration-200 min-w-[280px]">
                            <div className="flex items-center justify-between mb-4">
                              <button 
                                type="button" 
                                onClick={(e) => { e.stopPropagation(); setViewDate(new Date(viewDate.getFullYear(), viewDate.getMonth() - 1)); }}
                                className="p-1.5 hover:bg-slate-50 rounded-lg text-slate-400 hover:text-teal-600 transition-all"
                              >
                                <ChevronLeft size={14} />
                              </button>
                              <span className="text-[10px] font-black uppercase tracking-widest text-slate-900">
                                {monthNames[viewDate.getMonth()]} {viewDate.getFullYear()}
                              </span>
                              <button 
                                type="button" 
                                onClick={(e) => { e.stopPropagation(); setViewDate(new Date(viewDate.getFullYear(), viewDate.getMonth() + 1)); }}
                                className="p-1.5 hover:bg-slate-50 rounded-lg text-slate-400 hover:text-teal-600 transition-all"
                              >
                                <ChevronRight size={14} />
                              </button>
                            </div>
                            <div className="grid grid-cols-7 gap-1 mb-1">
                              {['D', 'L', 'M', 'M', 'J', 'V', 'S'].map((d, i) => (
                                <div key={`${d}-${i}`} className="h-7 w-7 flex items-center justify-center text-[8px] font-black text-slate-300 uppercase">{d}</div>
                              ))}
                            </div>
                            <div className="grid grid-cols-7 gap-1">
                              {renderCalendar(newEvent.date, (d) => setNewEvent({...newEvent, date: d}))}
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                    <div>
                      <label className="text-[10px] font-black uppercase text-slate-400 tracking-widest block mb-2 px-1">Tipo de Evento</label>
                      <div className="relative" ref={typeRef}>
                        <button
                          type="button"
                          onClick={() => {
                            setIsModalTypeOpen(!isModalTypeOpen);
                            setIsModalPriorityOpen(false);
                            setIsModalCalendarOpen(false);
                          }}
                          className="w-full flex items-center justify-between px-5 py-3.5 border-2 border-slate-200 bg-teal-50/30 rounded-[1.5rem] text-[10px] font-black uppercase text-slate-900 hover:border-teal-500 transition-all outline-none"
                        >
                          {newEvent.type}
                          <ChevronDown className={cn("text-slate-400 transition-transform", isModalTypeOpen && "rotate-180")} size={16} />
                        </button>

                        {isModalTypeOpen && (
                          <div className="absolute top-full left-0 right-0 mt-2 bg-white border border-slate-100 rounded-[1.5rem] shadow-2xl z-[100] overflow-hidden animate-in fade-in zoom-in-95 duration-200">
                            {EVENT_TYPES.map(type => (
                              <div
                                key={type}
                                onClick={() => {
                                  setNewEvent({...newEvent, type: type as any});
                                  setIsModalTypeOpen(false);
                                }}
                                className={cn(
                                  "px-6 py-3 hover:bg-teal-50 text-[10px] font-black uppercase cursor-pointer transition-colors border-b border-slate-50 last:border-none flex justify-between items-center",
                                  newEvent.type === type ? "text-teal-600 bg-teal-50/30" : "text-slate-600"
                                )}
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

                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="text-[10px] font-black uppercase text-slate-400 tracking-widest block mb-2 px-1">Prioridad</label>
                      <div className="relative" ref={priorityRef}>
                        <button
                          type="button"
                          onClick={() => {
                            setIsModalPriorityOpen(!isModalPriorityOpen);
                            setIsModalTypeOpen(false);
                            setIsModalCalendarOpen(false);
                          }}
                          className="w-full flex items-center justify-between px-6 py-3.5 border-2 border-slate-200 bg-teal-50/30 rounded-[1.5rem] text-[10px] font-black uppercase hover:border-teal-500 transition-all outline-none"
                        >
                          <span className={cn(
                            newEvent.priority === 'Alta' ? 'text-rose-600' :
                            newEvent.priority === 'Media' ? 'text-amber-600' : 'text-slate-600'
                          )}>{newEvent.priority}</span>
                          <ChevronDown className={cn("text-slate-400 transition-transform", isModalPriorityOpen && "rotate-180")} size={16} />
                        </button>

                        {isModalPriorityOpen && (
                          <div className="absolute top-full left-0 right-0 mt-2 bg-white border border-slate-100 rounded-[1.5rem] shadow-2xl z-[100] overflow-hidden animate-in fade-in zoom-in-95 duration-200">
                            {PRIORITIES.map(p => (
                              <div
                                key={p}
                                onClick={() => {
                                  setNewEvent({...newEvent, priority: p as any});
                                  setIsModalPriorityOpen(false);
                                }}
                                className={cn(
                                  "px-6 py-3 hover:bg-teal-50 text-[10px] font-black uppercase cursor-pointer transition-colors border-b border-slate-50 last:border-none flex justify-between items-center",
                                  newEvent.priority === p ? "text-teal-600 bg-teal-50/30" : "text-slate-600"
                                )}
                              >
                                {p}
                                {newEvent.priority === p && <Check size={14} className="text-teal-600" />}
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                    <div>
                      <label className="text-[10px] font-black uppercase text-slate-400 tracking-widest block mb-2 px-1">Meta Asistentes</label>
                      <Input 
                        type="number" 
                        required 
                        className="rounded-[1.5rem] bg-teal-50/30 border-slate-200 font-bold focus-visible:border-teal-500 focus-visible:ring-teal-500/10" 
                        value={newEvent.targetAttendees} 
                        onChange={e => setNewEvent({...newEvent, targetAttendees: Number(e.target.value)})} 
                      />
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
              </div>

              <div className="p-6 md:p-10 pt-4 md:pt-6 border-t border-slate-100 flex gap-4 bg-white shrink-0 rounded-b-[3rem]">
                <button type="button" onClick={closeModal} className="flex-1 px-4 py-4 border-2 border-slate-100 rounded-2xl text-[10px] font-black uppercase tracking-widest text-slate-600 hover:bg-slate-50 transition-all">Cancelar</button>
                <button type="submit" className="flex-2 px-8 py-4 bg-slate-900 text-white rounded-2xl text-[10px] font-black uppercase tracking-widest shadow-xl shadow-slate-200 hover:bg-teal-600 transition-all flex items-center justify-center gap-2">
                  {editingEvent ? 'Guardar Cambios' : 'Generar Operación'}
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
              className="absolute top-6 md:top-8 right-6 md:right-8 z-30 p-2.5 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-2xl transition-all group"
            >
              <X size={20} className="group-hover:rotate-90 transition-transform" />
            </button>

            <div className="px-6 md:px-10 py-8 md:py-10 border-b border-slate-100 bg-white">
              <div className="flex items-center gap-3 mb-2">
                <div className="w-2 h-2 rounded-full bg-teal-600 animate-pulse" />
                <span className="text-[10px] font-black uppercase text-teal-600 tracking-[0.25em]">Geolocalización Territorial</span>
              </div>
              <h3 className="text-xl md:text-3xl font-black text-slate-900 tracking-tight uppercase truncate pr-10">
                {selectedLocation}
              </h3>
            </div>
            <div className="flex-1 bg-slate-100 relative min-h-[500px]">
              <iframe
                width="100%"
                height="100%"
                frameBorder="0"
                style={{ border: 0 }}
                src={`https://maps.google.com/maps?q=${selectedCoords ? `${selectedCoords.lat},${selectedCoords.lng}` : encodeURIComponent(selectedLocation + ", Medellin, Antioquia, Colombia")}&t=&z=15&ie=UTF8&iwloc=B&output=embed`}
                allowFullScreen
                className="grayscale-[0.05] contrast-[1.05]"
              />
            </div>

            <div className="px-6 md:px-10 py-6 md:py-8 bg-slate-50 flex flex-col sm:flex-row justify-between items-center gap-4 border-t border-slate-100">
              <div className="flex items-center gap-4 text-slate-500">
                <div className="h-10 w-10 rounded-2xl bg-teal-50 flex items-center justify-center text-teal-600 shrink-0 shadow-inner border border-teal-100">
                  <Globe size={18} />
                </div>
                <p className="text-[10px] md:text-[11px] font-bold uppercase tracking-widest leading-relaxed">
                  Utilice los controles del mapa para explorar el área estratégica.
                </p>
              </div>
              <button
                onClick={() => setIsMapModalOpen(false)}
                className="w-full sm:w-auto px-12 py-4 md:py-5 bg-slate-900 text-white rounded-[1.25rem] md:rounded-[1.5rem] font-black text-[10px] uppercase tracking-[0.2em] hover:bg-teal-600 transition-all shadow-xl shadow-slate-200"
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
          className="fixed inset-0 bg-slate-900/60 backdrop-blur-md z-[150] flex items-center justify-center p-4 md:p-8 animate-in fade-in duration-300"
          onClick={() => setIsGlobalMapOpen(false)}
        >
          <div
            className="bg-white w-full max-w-7xl rounded-[3rem] md:rounded-[4rem] shadow-2xl overflow-hidden flex flex-col relative animate-in zoom-in-95 duration-500 border-[3px] border-teal-600 h-[90vh]"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              onClick={() => setIsGlobalMapOpen(false)}
              className="absolute top-6 left-6 md:left-10 z-[60] p-3 bg-white hover:bg-rose-50 text-slate-400 hover:text-rose-500 rounded-2xl border-2 border-slate-100 shadow-sm transition-all group"
            >
              <X size={20} className="group-hover:-rotate-90 transition-transform" />
            </button>

            <div className="pt-16 pb-8 px-6 md:px-12 md:pl-28 border-b-2 border-teal-50 bg-slate-50/50 relative z-20">
              <div className="flex flex-col xl:flex-row items-start xl:items-center justify-between gap-6">
                <div>
                  <div className="flex items-center gap-3 mb-1">
                    <div className="h-2 w-2 rounded-full bg-teal-500 animate-pulse" />
                    <span className="text-[10px] font-black uppercase text-teal-600 tracking-[0.3em]">Inteligencia Territorial SIT</span>
                  </div>
                  <h3 className="text-3xl font-black text-slate-900 tracking-tighter uppercase leading-none">Mapa Táctico de Operaciones</h3>
                </div>

                {/* BARRA DE FILTROS UNIFICADA CON HOVER Y BORDES REFINADOS */}
                <div className="flex items-center bg-white p-1 rounded-[2rem] border-2 border-teal-600/30 shadow-xl relative w-full xl:w-auto overflow-hidden">
                  <div className="flex items-center gap-3 px-5 py-2.5 flex-1 xl:flex-none xl:min-w-[200px] hover:bg-teal-50/50 transition-colors group/search">
                    <Search size={16} className="text-teal-500 group-hover/search:scale-110 transition-transform" />
                    <input
                      type="text"
                      placeholder="Buscar en el mapa..."
                      className="bg-transparent border-none outline-none text-xs font-bold text-slate-700 placeholder:text-slate-400 w-full"
                      value={mapSearch}
                      onChange={(e) => setMapSearch(e.target.value)}
                    />
                  </div>

                  <div className="h-8 w-px bg-teal-600/10 mx-1" />

                  <div className="relative" ref={mapTypeRef}>
                    <button
                      onClick={() => {
                        setIsTypeDropdownOpen(!isTypeDropdownOpen);
                        setIsRangePickerOpen(false);
                      }}
                      className="flex items-center gap-3 px-4 py-2.5 hover:bg-teal-50 rounded-xl transition-all cursor-pointer min-w-[140px]"
                    >
                      <Filter size={14} className="text-teal-600" />
                      <span className="text-[10px] text-slate-600 font-black uppercase tracking-widest truncate max-w-[80px]">{mapFilterType === 'all' ? 'Tipos' : mapFilterType}</span>
                      <ChevronDown className={cn("text-slate-400 transition-transform ml-auto", isTypeDropdownOpen && "rotate-180")} size={12} />
                    </button>

                    {isTypeDropdownOpen && (
                      <div className="absolute top-full right-0 mt-3 w-48 bg-white border-2 border-teal-600/10 rounded-[1.5rem] shadow-2xl z-[300] overflow-hidden animate-in fade-in slide-in-from-top-2 duration-200 p-1.5">
                        <div className="max-h-48 overflow-y-auto custom-scrollbar">
                          {["all", ...EVENT_TYPES].map(type => (
                            <button
                              key={type}
                              onClick={() => {
                                setMapFilterType(type);
                                setIsTypeDropdownOpen(false);
                              }}
                              className={cn(
                                "w-full px-4 py-2 text-left text-[10px] font-black rounded-lg transition-all flex items-center justify-between group uppercase tracking-widest",
                                mapFilterType === type ? "bg-teal-50 text-teal-600" : "hover:bg-slate-50 text-slate-500 hover:text-slate-900"
                              )}
                            >
                              {type === 'all' ? 'Todos' : type}
                              {mapFilterType === type && <Check size={12} className="text-teal-600" />}
                            </button>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>

                  <div className="h-8 w-px bg-teal-600/10 mx-1" />

                  <div className="relative">
                    <button
                      onClick={() => {
                        setIsRangePickerOpen(!isRangePickerOpen);
                        setIsTypeDropdownOpen(false);
                      }}
                      className={cn(
                        "flex items-center gap-3 px-4 py-2.5 rounded-xl transition-all group min-w-[150px]",
                        isRangePickerOpen ? "bg-teal-600 text-white shadow-lg shadow-teal-200" : "hover:bg-teal-50 text-slate-600"
                      )}
                    >
                      <Calendar size={14} className={cn("transition-colors", isRangePickerOpen ? "text-white" : "text-teal-600")} />
                      <span className="text-[10px] font-black uppercase tracking-widest">
                        {mapFilterStartDate ? `${mapFilterStartDate.split('-')[2]}/${mapFilterStartDate.split('-')[1]}` : 'Fecha'}
                      </span>
                      <ChevronDown size={12} className={cn("transition-transform ml-auto", isRangePickerOpen ? "text-white" : "text-slate-400", isRangePickerOpen && "rotate-180")} />
                    </button>

                    {isRangePickerOpen && (
                      <div className="absolute top-full right-0 mt-3 p-5 bg-white border-2 border-teal-600/10 rounded-[2rem] shadow-2xl z-[300] flex flex-col gap-4 animate-in fade-in zoom-in-95 duration-200 min-w-[300px]">
                        <div className="flex items-center justify-between mb-1">
                          <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Definir Período</span>
                          <button onClick={() => setIsRangePickerOpen(false)} className="text-slate-400 hover:text-rose-500"><X size={14} /></button>
                        </div>
                        
                        <div className="flex items-center justify-between mb-2">
                          <button 
                            type="button" 
                            onClick={(e) => { e.stopPropagation(); setViewDate(new Date(viewDate.getFullYear(), viewDate.getMonth() - 1)); }}
                            className="p-1.5 hover:bg-slate-50 rounded-lg text-slate-400 hover:text-teal-600 transition-all"
                          >
                            <ChevronLeft size={14} />
                          </button>
                          <span className="text-[10px] font-black uppercase tracking-widest text-slate-900">
                            {monthNames[viewDate.getMonth()]} {viewDate.getFullYear()}
                          </span>
                          <button 
                            type="button" 
                            onClick={(e) => { e.stopPropagation(); setViewDate(new Date(viewDate.getFullYear(), viewDate.getMonth() + 1)); }}
                            className="p-1.5 hover:bg-slate-50 rounded-lg text-slate-400 hover:text-teal-600 transition-all"
                          >
                            <ChevronRight size={14} />
                          </button>
                        </div>

                        <div className="grid grid-cols-7 gap-1 mb-1">
                          {['D', 'L', 'M', 'M', 'J', 'V', 'S'].map((d, i) => (
                            <div key={`${d}-${i}`} className="h-7 w-7 flex items-center justify-center text-[8px] font-black text-slate-300 uppercase">{d}</div>
                          ))}
                        </div>
                        <div className="grid grid-cols-7 gap-1">
                          {renderCalendar(mapFilterStartDate, (d) => setMapFilterStartDate(d))}
                        </div>

                        <div className="mt-4 pt-4 border-t border-slate-100 flex items-center justify-between">
                          <button 
                            onClick={() => { setMapFilterStartDate(""); setMapFilterEndDate(""); }}
                            className="text-[9px] font-black uppercase text-slate-400 hover:text-rose-500"
                          >
                            Limpiar
                          </button>
                          <button
                            onClick={() => setIsRangePickerOpen(false)}
                            className="px-6 py-2 bg-teal-600 text-white rounded-xl text-[10px] font-black uppercase tracking-widest hover:bg-teal-700 transition-all shadow-lg shadow-teal-100"
                          >
                            Aplicar
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>

            <div className="flex-1 relative bg-slate-50 overflow-hidden">
              <div className="absolute inset-0 z-0">
                <StrategicMap 
                  events={filteredEventsForMap} 
                  isAdmin={isAdmin}
                  onEdit={handleEdit}
                  onDelete={handleDelete}
                />
                {filteredEventsForMap.length === 0 && (
                  <div className="absolute inset-0 flex items-center justify-center bg-white/40 backdrop-blur-[2px] z-10 pointer-events-none">
                    <div className="bg-white border-4 border-teal-600/20 px-10 py-8 rounded-[3rem] text-center shadow-2xl shadow-teal-900/10 mx-4 max-w-xs border-b-8">
                      <div className="w-16 h-16 bg-teal-50 rounded-2xl flex items-center justify-center mx-auto mb-4 border-2 border-teal-100 shadow-inner">
                        <Map size={32} className="text-teal-600" />
                      </div>
                      <div className="text-teal-600 font-black text-[10px] uppercase tracking-[0.3em] mb-2">Sin Operaciones Activas</div>
                      <p className="text-slate-500 text-[11px] font-bold uppercase tracking-widest leading-relaxed">No hay eventos que coincidan con los filtros aplicados.</p>
                    </div>
                  </div>
                )}
              </div>

              {/* Leyenda Absoluta Rediseñada */}
              <div className="absolute bottom-8 left-8 right-8 md:right-auto flex flex-wrap items-center gap-3 z-20">
                {[
                  { label: 'Marchas', color: 'bg-rose-500', shadow: 'shadow-rose-200' },
                  { label: 'Reuniones', color: 'bg-teal-500', shadow: 'shadow-teal-200' },
                  { label: 'Capacitación', color: 'bg-emerald-500', shadow: 'shadow-emerald-200' },
                  { label: 'Otros', color: 'bg-orange-500', shadow: 'shadow-orange-200' }
                ].map(item => (
                  <div key={item.label} className="flex items-center gap-3 bg-white/90 backdrop-blur-md border border-slate-100 px-4 py-2.5 rounded-2xl shadow-xl shadow-slate-200/50">
                    <div className={cn("h-2.5 w-2.5 rounded-full shadow-lg", item.color, item.shadow)} />
                    <span className="text-[9px] font-black text-slate-700 uppercase tracking-widest">{item.label}</span>
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
