"use client";

import React, { useState, useEffect, useRef } from 'react';
import { useCRM, Broadcast } from '@/context/CRMContext';
import { useToast } from '@/context/ToastContext';
import { 
  Send, 
  MessageSquare, 
  Plus, 
  X, 
  Loader2,
  Pencil,
  Ban,
  RotateCcw,
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight
} from 'lucide-react';
import { cn } from '@/components/ui/utils';
import { Input } from '@/components/ui/input';

export default function MessagingPage() {
  const { broadcasts, sendBroadcast, updateBroadcast, toggleBroadcastStatus } = useCRM();
  const { success: toastSuccess } = useToast();
  
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 10;
  
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingBroadcast, setEditingBroadcast] = useState<Broadcast | null>(null);
  
  // Custom Dropdown States
  const [isChannelOpen, setIsChannelOpen] = useState(false);
  const [isSegmentOpen, setIsSegmentOpen] = useState(false);
  
  // Refs for outside click
  const channelRef = useRef<HTMLDivElement>(null);
  const segmentRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (channelRef.current && !channelRef.current.contains(event.target as Node)) setIsChannelOpen(false);
      if (segmentRef.current && !segmentRef.current.contains(event.target as Node)) setIsSegmentOpen(false);
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);
  
  const [newCampaign, setNewCampaign] = useState<{ name: string; channel: 'WhatsApp' | 'SMS' | 'Email'; segment: string; message: string; }>({ name: '', channel: 'WhatsApp', segment: 'Todos', message: '' });
  
  const [notification, setNotification] = useState<string | null>(null);

  const totalPages = Math.ceil(broadcasts.length / itemsPerPage);
  const paginatedBroadcasts = broadcasts.slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage);

  const handleOpenModal = (broadcast?: Broadcast) => {
    if (broadcast) {
      setEditingBroadcast(broadcast);
      setNewCampaign({ name: broadcast.name, channel: broadcast.channel, segment: broadcast.segment, message: broadcast.message });
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
      toastSuccess("Campaña actualizada");
    } else {
      sendBroadcast(newCampaign);
      setNotification(`Enviando a ${newCampaign.segment}...`);
      setTimeout(() => setNotification(null), 4000);
    }
    setIsModalOpen(false);
  };

  return (
    <div className="space-y-8 animate-in fade-in duration-700">
      {notification && (
        <div className="fixed top-8 right-8 bg-white border border-teal-100 px-8 py-5 rounded-[2rem] shadow-2xl z-50 animate-in slide-in-from-right duration-300 flex items-center gap-4">
          <Loader2 className="animate-spin text-teal-600" size={24} />
          <span className="font-black text-[10px] text-teal-700 uppercase tracking-widest">{notification}</span>
        </div>
      )}

      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-black text-slate-900 tracking-tighter uppercase">Mensajería Masiva</h1>
          <p className="text-slate-500 font-medium">Comunicaciones segmentadas y control táctico de envíos.</p>
        </div>
        <button onClick={() => handleOpenModal()} className="bg-teal-600 text-white px-8 py-4 rounded-2xl font-black text-[10px] uppercase tracking-widest shadow-xl shadow-teal-100 hover:bg-teal-700 transition-all flex items-center gap-2"><Plus size={20} /> Nueva Campaña</button>
      </div>

      <div className="bg-white border border-slate-100 rounded-[2.5rem] overflow-hidden shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead className="bg-slate-50/50 border-b border-slate-100">
              <tr>
                <th className="px-8 py-6 text-[10px] font-black uppercase text-slate-400 tracking-widest">Campaña / Canal</th>
                <th className="px-8 py-6 text-[10px] font-black uppercase text-slate-400 tracking-widest">Segmento</th>
                <th className="px-8 py-6 text-[10px] font-black uppercase text-slate-400 tracking-widest">Estado</th>
                <th className="px-8 py-6 text-[10px] font-black uppercase text-slate-400 tracking-widest">Alcance</th>
                <th className="px-8 py-6 text-[10px] font-black uppercase text-slate-400 tracking-widest text-right"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {paginatedBroadcasts.map((b) => (
                <tr key={b.id} className={cn("hover:bg-teal-50/30 transition-colors group", b.activeStatus === 'archived' && "opacity-50 grayscale")}>
                  <td className="px-8 py-6">
                    <p className="text-sm font-black text-slate-900 uppercase mb-1">{b.name}</p>
                    <div className="flex items-center gap-1.5 text-[9px] font-black text-teal-600 uppercase">
                      {b.channel === 'WhatsApp' && <MessageSquare size={12} className="text-emerald-500" />}
                      {b.channel}
                    </div>
                  </td>
                  <td className="px-8 py-6"><span className="text-[10px] font-black text-slate-500 bg-slate-100 px-3 py-1 rounded-full uppercase">{b.segment}</span></td>
                  <td className="px-8 py-6"><div className="flex items-center gap-2"><div className={cn("h-1.5 w-1.5 rounded-full", b.status === 'Enviado' ? 'bg-emerald-500' : 'bg-amber-500 animate-pulse')}></div><span className={cn("text-[10px] font-black uppercase tracking-widest", b.status === 'Enviado' ? 'text-emerald-600' : 'text-amber-600')}>{b.status}</span></div></td>
                  <td className="px-8 py-6"><p className="text-xs font-black text-slate-900">{b.sentCount.toLocaleString()} <span className="text-[9px] text-slate-400 uppercase">Enviados</span></p></td>
                  <td className="px-8 py-6 text-right">
                    <div className="flex justify-end gap-2 opacity-0 group-hover:opacity-100 transition-all">
                      <button onClick={() => handleOpenModal(b)} className="p-2 text-slate-400 hover:text-teal-600 hover:bg-white rounded-xl transition-all shadow-sm"><Pencil size={16} /></button>
                      <button onClick={() => toggleBroadcastStatus(b.id)} className="p-2 text-slate-400 hover:text-rose-500 hover:bg-white rounded-xl transition-all shadow-sm">
                        {b.activeStatus === 'active' ? <Ban size={16} /> : <RotateCcw size={16} />}
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Pagination Controls */}
        {totalPages > 1 && (
          <div className="px-8 py-6 border-t border-slate-50 bg-slate-50/30 flex flex-col md:flex-row items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">
                Página
              </p>
              <input
                key={currentPage}
                type="number"
                min="1"
                max={totalPages}
                defaultValue={currentPage}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    const val = parseInt((e.target as HTMLInputElement).value);
                    if (val >= 1 && val <= totalPages) {
                      setCurrentPage(val);
                    }
                  }
                }}
                className="w-12 h-8 bg-white border-2 border-slate-100 rounded-lg text-center text-xs font-black text-teal-600 focus:border-teal-500 outline-none transition-all"
              />
              <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">
                de {totalPages}
              </p>
            </div>
            <div className="flex gap-2">
              <button
                disabled={currentPage === 1}
                onClick={() => setCurrentPage(p => p - 1)}
                className="p-2.5 rounded-xl bg-white border border-slate-200 text-slate-400 hover:text-teal-600 disabled:opacity-30 transition-all shadow-sm"
              >
                <ChevronLeft size={18} />
              </button>
              <button
                disabled={currentPage === totalPages}
                onClick={() => setCurrentPage(p => p + 1)}
                className="p-2.5 rounded-xl bg-white border border-slate-200 text-slate-400 hover:text-teal-600 disabled:opacity-30 transition-all shadow-sm"
              >
                <ChevronRight size={18} />
              </button>
            </div>
          </div>
        )}
      </div>

      {isModalOpen && (
        <div 
          className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm z-50 flex items-center justify-center p-4 animate-in fade-in duration-300"
          onClick={() => setIsModalOpen(false)}
        >
          <div 
            className="bg-white w-full max-w-lg rounded-[3rem] shadow-2xl overflow-visible animate-in zoom-in-95 duration-300 relative"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="px-10 py-10 border-b border-slate-100 flex justify-between items-center rounded-t-[3rem] bg-slate-50/50">
              <div><h3 className="text-2xl font-black text-slate-900 tracking-tighter uppercase">Nueva Campaña</h3><p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mt-1">Mensajería de Alto Alcance</p></div>
              <button onClick={() => setIsModalOpen(false)} className="text-slate-400 hover:text-rose-500 bg-slate-50 p-3 rounded-2xl transition-all"><X size={20} /></button>
            </div>
            <form onSubmit={handleSubmit} className="p-10 space-y-6">
              <div className="space-y-5">
                <div>
                  <label className="text-[10px] font-black uppercase text-slate-400 tracking-widest block mb-2 px-1">Nombre de Campaña</label>
                  <Input 
                    required 
                    placeholder="Ej: Invitación Domingo" 
                    className="rounded-[1.5rem] bg-teal-50/30 border-slate-200 font-bold focus-visible:border-teal-500 focus-visible:ring-teal-500/10" 
                    value={newCampaign.name} 
                    onChange={e => setNewCampaign({...newCampaign, name: e.target.value})} 
                  />
                </div>
                <div className="grid grid-cols-2 gap-5">
                  <div>
                    <label className="text-[10px] font-black uppercase text-slate-400 tracking-widest block mb-2 px-1">Canal</label>
                    <div className="relative" ref={channelRef}>
                      <button
                        type="button"
                        onClick={() => {
                          setIsChannelOpen(!isChannelOpen);
                          setIsSegmentOpen(false);
                        }}
                        className="w-full flex items-center justify-between px-5 py-3.5 border-2 border-slate-200 bg-teal-50/30 rounded-[1.5rem] text-sm font-bold text-slate-700 hover:border-teal-500 transition-all outline-none"
                      >
                        {newCampaign.channel}
                        <ChevronDown size={16} className={cn("text-slate-400 transition-transform", isChannelOpen && "rotate-180")} />
                      </button>
                      {isChannelOpen && (
                        <div className="absolute top-full left-0 right-0 mt-2 bg-white border border-slate-100 rounded-[1.5rem] shadow-2xl z-[100] overflow-hidden animate-in fade-in zoom-in-95 duration-200">
                          {['WhatsApp', 'SMS', 'Email'].map(channel => (
                            <div 
                              key={channel}
                              onClick={() => {
                                setNewCampaign({...newCampaign, channel: channel as any});
                                setIsChannelOpen(false);
                              }}
                              className={cn(
                                "px-5 py-3 hover:bg-teal-50 text-[10px] font-black uppercase tracking-widest cursor-pointer transition-colors border-b border-slate-50 last:border-none flex justify-between items-center",
                                newCampaign.channel === channel ? "text-teal-600 bg-teal-50/30" : "text-slate-600"
                              )}
                            >
                              {channel}
                              {newCampaign.channel === channel && <Check size={14} className="text-teal-600" />}
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                  <div>
                    <label className="text-[10px] font-black uppercase text-slate-400 tracking-widest block mb-2 px-1">Segmento</label>
                    <div className="relative" ref={segmentRef}>
                      <button
                        type="button"
                        onClick={() => {
                          setIsSegmentOpen(!isSegmentOpen);
                          setIsChannelOpen(false);
                        }}
                        className="w-full flex items-center justify-between px-5 py-3.5 border-2 border-slate-200 bg-teal-50/30 rounded-[1.5rem] text-sm font-bold text-slate-700 hover:border-teal-500 transition-all outline-none"
                      >
                        {newCampaign.segment}
                        <ChevronDown size={16} className={cn("text-slate-400 transition-transform", isSegmentOpen && "rotate-180")} />
                      </button>
                      {isSegmentOpen && (
                        <div className="absolute top-full left-0 right-0 mt-2 bg-white border border-slate-100 rounded-[1.5rem] shadow-2xl z-[100] overflow-hidden animate-in fade-in zoom-in-95 duration-200">
                          {['Todos', 'Líderes', 'Testigos'].map(segment => (
                            <div 
                              key={segment}
                              onClick={() => {
                                setNewCampaign({...newCampaign, segment: segment});
                                setIsSegmentOpen(false);
                              }}
                              className={cn(
                                "px-5 py-3 hover:bg-teal-50 text-[10px] font-black uppercase tracking-widest cursor-pointer transition-colors border-b border-slate-50 last:border-none flex justify-between items-center",
                                newCampaign.segment === segment ? "text-teal-600 bg-teal-50/30" : "text-slate-600"
                              )}
                            >
                              {segment}
                              {newCampaign.segment === segment && <Check size={14} className="text-teal-600" />}
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
                <div>
                  <label className="text-[10px] font-black uppercase text-slate-400 tracking-widest block mb-2 px-1">Mensaje Táctico</label>
                  <textarea 
                    required 
                    rows={4} 
                    placeholder="Contenido del mensaje..." 
                    className="w-full px-5 py-4 border-2 border-slate-200 bg-teal-50/30 rounded-[1.5rem] text-sm font-medium focus:border-teal-500 focus:ring-2 focus:ring-teal-500/10 outline-none transition-all placeholder:text-slate-400" 
                    value={newCampaign.message} 
                    onChange={e => setNewCampaign({...newCampaign, message: e.target.value})} 
                  />
                </div>
              </div>
              <div className="pt-6 flex gap-4">
                <button type="button" onClick={() => setIsModalOpen(false)} className="flex-1 py-4 bg-slate-100 rounded-2xl text-[10px] font-black uppercase text-slate-500 hover:bg-slate-200 transition-colors">Cancelar</button>
                <button type="submit" className="flex-1 py-4 bg-teal-600 text-white rounded-2xl font-black text-[10px] uppercase shadow-xl shadow-teal-100 hover:bg-teal-700 transition-all flex items-center justify-center gap-2">
                  <Send size={16} /> Lanzar Campaña
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
