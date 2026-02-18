"use client";

import React, { useState } from 'react';
import { useCRM, CampaignEvent } from '@/context/CRMContext';
import { useAuth } from '@/context/auth';
import { useToast } from '@/context/ToastContext';
import { AlertDialog } from '@/components/ui/AlertDialog';
import { Calendar, MapPin, Users, Plus, X, Tag, Pencil, Trash2 } from 'lucide-react';
import { cn } from '@/components/ui/utils';

export default function EventsPage() {
  const { events, addEvent, updateEvent, deleteEvent, rsvpEvent } = useCRM();
  const { user } = useAuth();
  const { success: toastSuccess } = useToast();
  
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [eventToDelete, setEventToDelete] = useState<string | null>(null);
  const [editingEvent, setEditingEvent] = useState<CampaignEvent | null>(null);
  
  const [newEvent, setNewEvent] = useState<Omit<CampaignEvent, 'id' | 'attendeesCount'>>({
    title: '',
    date: '',
    location: '',
    type: 'Reunión'
  });

  const isAdmin = ["SuperAdmin", "AdminCampana"].includes(user?.role || "");

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

  return (
    <div className="space-y-8">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-black text-slate-900 tracking-tighter">Agenda de Campaña</h1>
          <p className="text-slate-500">Planificación de marchas, reuniones y eventos masivos.</p>
        </div>
        <button 
          onClick={() => setIsModalOpen(true)}
          className="bg-blue-600 text-white px-6 py-3 rounded-2xl font-black text-sm shadow-lg hover:bg-blue-700 transition-all flex items-center gap-2"
        >
          <Plus size={18} /> Nuevo Evento
        </button>
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
                  <div className="flex items-center gap-2 text-slate-500 text-xs font-bold">
                    <MapPin size={14} className="text-blue-500" /> {event.location}
                  </div>
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
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white w-full max-w-md rounded-[2.5rem] shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200">
            <div className="px-8 py-6 border-b border-slate-100 flex justify-between items-center bg-slate-50/50">
              <h3 className="text-xl font-black text-slate-900">
                {editingEvent ? 'Editar Evento' : 'Crear Evento'}
              </h3>
              <button onClick={closeModal} className="text-slate-400 hover:text-slate-600"><X /></button>
            </div>
            <form onSubmit={handleSubmit} className="p-8 space-y-4">
              <div>
                <label className="text-[10px] font-black uppercase text-slate-400 tracking-widest block mb-1">Título</label>
                <input required className="w-full px-4 py-2 border rounded-xl text-sm" value={newEvent.title} onChange={e => setNewEvent({...newEvent, title: e.target.value})} />
              </div>
              <div>
                <label className="text-[10px] font-black uppercase text-slate-400 tracking-widest block mb-1">Fecha</label>
                <input required type="date" className="w-full px-4 py-2 border rounded-xl text-sm" value={newEvent.date} onChange={e => setNewEvent({...newEvent, date: e.target.value})} />
              </div>
              <div>
                <label className="text-[10px] font-black uppercase text-slate-400 tracking-widest block mb-1">Lugar</label>
                <input required className="w-full px-4 py-2 border rounded-xl text-sm" value={newEvent.location} onChange={e => setNewEvent({...newEvent, location: e.target.value})} />
              </div>
              <div>
                <label className="text-[10px] font-black uppercase text-slate-400 tracking-widest block mb-1">Tipo</label>
                <select className="w-full px-4 py-2 border rounded-xl text-sm" value={newEvent.type} onChange={e => setNewEvent({...newEvent, type: e.target.value as any})}>
                  <option value="Reunión">Reunión</option>
                  <option value="Marcha">Marcha</option>
                  <option value="Capacitación">Capacitación</option>
                  <option value="Otro">Otro</option>
                </select>
              </div>
              <div className="pt-6 flex gap-3">
                <button type="button" onClick={closeModal} className="flex-1 px-4 py-3 border rounded-xl text-sm font-bold text-slate-600">Cancelar</button>
                <button type="submit" className="flex-1 px-4 py-3 bg-blue-600 rounded-xl text-sm font-bold text-white shadow-lg">
                  {editingEvent ? 'Guardar Cambios' : 'Crear Evento'}
                </button>
              </div>
            </form>
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
