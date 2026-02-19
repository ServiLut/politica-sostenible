"use client";

import React, { useState } from 'react';
import { useCRM, Broadcast } from '@/context/CRMContext';
import { useToast } from '@/context/ToastContext';
import { AlertDialog } from '@/components/ui/AlertDialog';
import { 
  Send, 
  MessageSquare, 
  Phone, 
  Mail, 
  Plus, 
  X, 
  ShieldCheck, 
  Loader2,
  Pencil,
  Trash2,
  RotateCcw,
  Ban
} from 'lucide-react';
import { cn } from '@/components/ui/utils';

export default function MessagingPage() {
  const { broadcasts, sendBroadcast, updateBroadcast, toggleBroadcastStatus } = useCRM();
  const { success: toastSuccess } = useToast();
  
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isStatusModalOpen, setIsStatusModalOpen] = useState(false);
  const [editingBroadcast, setEditingBroadcast] = useState<Broadcast | null>(null);
  const [broadcastToToggle, setBroadcastToToggle] = useState<Broadcast | null>(null);
  
  const [newCampaign, setNewCampaign] = useState<{
    name: string;
    channel: 'WhatsApp' | 'SMS' | 'Email';
    segment: string;
    message: string;
  }>({
    name: '',
    channel: 'WhatsApp',
    segment: 'Todos',
    message: ''
  });
  
  const [notification, setNotification] = useState<string | null>(null);

  const handleOpenModal = (broadcast?: Broadcast) => {
    if (broadcast) {
      setEditingBroadcast(broadcast);
      setNewCampaign({
        name: broadcast.name,
        channel: broadcast.channel,
        segment: broadcast.segment,
        message: broadcast.message
      });
    } else {
      setEditingBroadcast(null);
      setNewCampaign({ name: '', channel: 'WhatsApp', segment: 'Todos', message: '' });
    }
    setIsModalOpen(true);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (editingBroadcast) {
      updateBroadcast(editingBroadcast.id, newCampaign);
      toastSuccess("Campaña actualizada correctamente");
    } else {
      sendBroadcast(newCampaign);
      setNotification(`Enviando campaña a segment: ${newCampaign.segment}...`);
      setTimeout(() => setNotification(null), 4000);
    }
    closeModal();
  };

  const handleToggleStatusClick = (broadcast: Broadcast) => {
    if (broadcast.activeStatus === 'archived') {
      toggleBroadcastStatus(broadcast.id);
      toastSuccess("Campaña restaurada correctamente");
    } else {
      setBroadcastToToggle(broadcast);
      setIsStatusModalOpen(true);
    }
  };

  const confirmToggleStatus = () => {
    if (broadcastToToggle) {
      toggleBroadcastStatus(broadcastToToggle.id);
      toastSuccess("Campaña archivada correctamente");
      setBroadcastToToggle(null);
    }
  };

  const closeModal = () => {
    setIsModalOpen(false);
    setEditingBroadcast(null);
    setNewCampaign({ name: '', channel: 'WhatsApp', segment: 'Todos', message: '' });
  };

  return (
    <div className="space-y-8">
      {/* Toast Notification */}
      {notification && (
        <div className="fixed top-4 right-4 bg-[#111827] text-white px-6 py-4 rounded-2xl shadow-2xl z-50 animate-in slide-in-from-right duration-300 flex items-center gap-3">
          <Loader2 className="animate-spin text-blue-400" size={20} />
          <span className="font-black text-xs uppercase tracking-widest">{notification}</span>
        </div>
      )}

      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-black text-slate-900 tracking-tighter uppercase">Mensajería Masiva</h1>
          <p className="text-slate-500 font-medium">Comunicaciones segmentadas y control de envíos.</p>
        </div>
        <button 
          onClick={() => handleOpenModal()}
          className="bg-blue-600 text-white px-8 py-4 rounded-2xl font-black text-sm shadow-xl hover:bg-blue-700 transition-all flex items-center gap-2 uppercase tracking-widest"
        >
          <Plus size={20} /> Nueva Campaña
        </button>
      </div>

      <div className="bg-white border-2 border-slate-100 rounded-[2.5rem] overflow-hidden shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead className="bg-slate-50 border-b border-slate-100">
              <tr>
                <th className="px-8 py-6 text-[10px] font-black uppercase text-slate-400 tracking-widest">Campaña / Canal</th>
                <th className="px-8 py-6 text-[10px] font-black uppercase text-slate-400 tracking-widest">Segmento</th>
                <th className="px-8 py-6 text-[10px] font-black uppercase text-slate-400 tracking-widest">Estado</th>
                <th className="px-8 py-6 text-[10px] font-black uppercase text-slate-400 tracking-widest">Alcance</th>
                <th className="px-8 py-6 text-[10px] font-black uppercase text-slate-400 tracking-widest text-right">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {broadcasts.map((b) => (
                <tr key={b.id} className={cn(
                  "hover:bg-slate-50/50 transition-colors group",
                  b.activeStatus === 'archived' && "opacity-50 grayscale bg-slate-50"
                )}>
                  <td className="px-8 py-6">
                    <div className="flex items-center gap-2 mb-1">
                      <p className="text-sm font-black text-slate-900">{b.name}</p>
                      {b.activeStatus === 'archived' && (
                        <span className="bg-amber-100 text-amber-700 text-[8px] font-black px-1.5 py-0.5 rounded-md tracking-widest uppercase">
                          Archivada
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-1.5 text-[10px] font-bold text-slate-400 uppercase">
                      {b.channel === 'WhatsApp' && <MessageSquare size={12} className="text-emerald-500" />}
                      {b.channel === 'SMS' && <Phone size={12} className="text-blue-500" />}
                      {b.channel === 'Email' && <Mail size={12} className="text-amber-500" />}
                      {b.channel}
                    </div>
                  </td>
                  <td className="px-8 py-6">
                    <span className="text-[10px] font-black text-slate-600 bg-slate-100 px-3 py-1 rounded-full uppercase tracking-tighter">
                      {b.segment}
                    </span>
                  </td>
                  <td className="px-8 py-6">
                    <div className="flex items-center gap-2">
                      <div className={cn(
                        "h-2 w-2 rounded-full",
                        b.status === 'Enviado' ? 'bg-emerald-500' : 'bg-amber-500 animate-pulse'
                      )}></div>
                      <span className={cn(
                        "text-[10px] font-black uppercase tracking-widest",
                        b.status === 'Enviado' ? 'text-emerald-600' : 'text-amber-600'
                      )}>
                        {b.status}
                      </span>
                    </div>
                  </td>
                  <td className="px-8 py-6">
                    <p className="text-xs font-black text-slate-900">{b.sentCount.toLocaleString()} <span className="text-[10px] font-bold text-slate-400 uppercase">Enviados</span></p>
                    <p className="text-[10px] font-bold text-emerald-600">{b.deliveredCount.toLocaleString()} Entregados</p>
                  </td>
                  <td className="px-8 py-6 text-right">
                    <div className="flex justify-end gap-2">
                      <button 
                        onClick={() => handleOpenModal(b)}
                        className="p-2 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-xl transition-all"
                      >
                        <Pencil size={16} />
                      </button>
                      <button 
                        onClick={() => handleToggleStatusClick(b)}
                        className={cn(
                          "p-2 rounded-xl transition-all",
                          b.activeStatus === 'active' ? "text-slate-400 hover:text-amber-600 hover:bg-amber-50" : "text-emerald-400 hover:text-emerald-600 hover:bg-emerald-50"
                        )}
                      >
                        {b.activeStatus === 'active' ? <Ban size={16} /> : <RotateCcw size={16} />}
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Modal Nueva/Editar Campaña */}
      {isModalOpen && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white w-full max-w-lg rounded-[3rem] shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200">
            <div className="px-8 py-8 border-b border-slate-100 flex justify-between items-center bg-slate-50/50">
              <div>
                <h3 className="text-2xl font-black text-slate-900 tracking-tighter">
                  {editingBroadcast ? 'Editar Campaña' : 'Lanzar Comunicación'}
                </h3>
                <p className="text-xs font-bold text-slate-400 uppercase tracking-widest mt-1">Configuración de Envío Masivo</p>
              </div>
              <button onClick={closeModal} className="text-slate-400 hover:text-slate-600 bg-white p-2 rounded-full shadow-sm"><X /></button>
            </div>
            <form onSubmit={handleSubmit} className="p-10 space-y-6">
              <div className="grid grid-cols-2 gap-6">
                <div className="col-span-2">
                  <label className="text-[10px] font-black uppercase text-slate-400 tracking-widest block mb-2">Nombre de la Campaña</label>
                  <input required placeholder="Ej: Invitación Votación Domingo" className="w-full px-5 py-3 border-2 border-slate-100 rounded-2xl text-sm font-bold focus:border-blue-500 outline-none transition-all" value={newCampaign.name} onChange={e => setNewCampaign({...newCampaign, name: e.target.value})} />
                </div>
                <div>
                  <label className="text-[10px] font-black uppercase text-slate-400 tracking-widest block mb-2">Canal</label>
                  <select className="w-full px-5 py-3 border-2 border-slate-100 rounded-2xl text-sm font-bold focus:border-blue-500 outline-none" value={newCampaign.channel} onChange={e => setNewCampaign({...newCampaign, channel: e.target.value as any})}>
                    <option value="WhatsApp">WhatsApp</option>
                    <option value="SMS">SMS</option>
                    <option value="Email">Email</option>
                  </select>
                </div>
                <div>
                  <label className="text-[10px] font-black uppercase text-slate-400 tracking-widest block mb-2">Segmento</label>
                  <select className="w-full px-5 py-3 border-2 border-slate-100 rounded-2xl text-sm font-bold focus:border-blue-500 outline-none" value={newCampaign.segment} onChange={e => setNewCampaign({...newCampaign, segment: e.target.value})}>
                    <option value="Todos">Todos</option>
                    <option value="Líderes">Líderes</option>
                    <option value="Testigos">Testigos</option>
                    <option value="Simpatizantes">Simpatizantes</option>
                  </select>
                </div>
                <div className="col-span-2">
                  <label className="text-[10px] font-black uppercase text-slate-400 tracking-widest block mb-2">Mensaje</label>
                  <textarea required rows={4} placeholder="Escribe el contenido del mensaje aquí..." className="w-full px-5 py-3 border-2 border-slate-100 rounded-2xl text-sm font-medium focus:border-blue-500 outline-none" value={newCampaign.message} onChange={e => setNewCampaign({...newCampaign, message: e.target.value})} />
                </div>
              </div>
              <div className="pt-4 flex gap-4">
                <button type="button" onClick={closeModal} className="flex-1 px-4 py-4 border-2 border-slate-100 rounded-2xl text-xs font-black uppercase text-slate-600 hover:bg-slate-50 transition-all">Cancelar</button>
                <button type="submit" className="flex-1 px-4 py-4 bg-blue-600 rounded-2xl text-xs font-black uppercase text-white shadow-xl hover:bg-blue-700 transition-all flex items-center justify-center gap-2">
                  <Send size={16} /> {editingBroadcast ? 'Guardar Cambios' : 'Lanzar Campaña'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      <AlertDialog 
        isOpen={isStatusModalOpen}
        onClose={() => { setIsStatusModalOpen(false); setBroadcastToToggle(null); }}
        onConfirm={confirmToggleStatus}
        title={broadcastToToggle?.activeStatus === 'active' ? "¿Suspender campaña?" : "¿Reactivar campaña?"}
        description={
          broadcastToToggle?.activeStatus === 'active' 
            ? "La campaña se archivará y dejará de ser visible en los reportes operativos, pero sus métricas se conservarán."
            : "La campaña volverá a ser visible en el panel de mensajería activa de inmediato."
        }
        confirmText={broadcastToToggle?.activeStatus === 'active' ? "Suspender Campaña" : "Reactivar Campaña"}
        variant={broadcastToToggle?.activeStatus === 'active' ? "warning" : "info"}
      />
    </div>
  );
}
