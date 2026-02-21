"use client";

import React, { useState, useMemo, useEffect } from "react";
import { 
  Search, 
  UserPlus, 
  Download, 
  Trash2,
  Edit2,
  ChevronRight,
  Filter,
  Inbox,
  X,
  IdCard
} from "lucide-react";
import { cn } from "@/components/ui/utils";
import { useCampaign, VoterStatus } from "@/context/CampaignContext";
import { useToast } from "@/context/ToastContext";

export default function VotantesPage() {
  const { voters, addVoter, deleteVoter } = useCampaign();
  const { success, info } = useToast();
  const [searchTerm, setSearchTerm] = useState("");
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);
  
  const [formData, setFormData] = useState({
    nombres: "",
    cedula: "",
    celular: "",
    puesto_votacion: "Unicentro",
    mesa: "",
    referido_por: "",
    barrio: "",
    estado: "Indeciso" as VoterStatus
  });

  const filteredVotantes = useMemo(() => {
    return voters.filter(v => 
      v.nombres.toLowerCase().includes(searchTerm.toLowerCase()) || 
      v.cedula.includes(searchTerm)
    );
  }, [voters, searchTerm]);

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.nombres || !formData.cedula) return;
    addVoter(formData);
    success(`Simpatizante vinculado correctamente`);
    setFormData({ nombres: "", cedula: "", celular: "", puesto_votacion: "Unicentro", mesa: "", referido_por: "", barrio: "", estado: "Indeciso" });
    setIsModalOpen(false);
  };

  const StatusBadge = ({ status }: { status: string }) => {
    const colors = {
      "Firme": "bg-emerald-50 text-emerald-700 border-emerald-100",
      "Indeciso": "bg-amber-50 text-amber-700 border-amber-100",
      "Ya Votó": "bg-teal-50 text-teal-700 border-teal-100",
      "Contrario": "bg-rose-50 text-rose-700 border-rose-100",
    };
    return (
      <span className={cn("px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-widest border flex items-center gap-1.5 w-fit", colors[status as keyof typeof colors])}>
        <div className={cn("h-1.5 w-1.5 rounded-full", 
          status === "Firme" ? "bg-emerald-500" : 
          status === "Indeciso" ? "bg-amber-500" :
          status === "Ya Votó" ? "bg-teal-500" : "bg-rose-500")} />
        {status}
      </span>
    );
  };

  if (!mounted) return null;

  return (
    <div className="space-y-8 animate-in fade-in duration-700">
      <header className="flex flex-col md:flex-row md:items-center justify-between gap-6">
        <div>
          <h1 className="text-4xl font-black text-slate-900 tracking-tighter uppercase">Censo Electoral</h1>
          <p className="text-slate-500 font-medium">Administración estratégica de la base de datos de simpatizantes.</p>
        </div>
        <div className="flex gap-3">
          <button className="bg-white border border-slate-200 text-slate-600 px-6 py-4 rounded-2xl flex items-center gap-3 font-black text-[10px] uppercase tracking-widest hover:bg-slate-50 transition-all shadow-sm">
            <Download size={16} /> Exportar CSV
          </button>
          <button 
            onClick={() => setIsModalOpen(true)}
            className="bg-teal-600 text-white px-8 py-4 rounded-2xl flex items-center gap-3 font-black text-[10px] uppercase tracking-widest shadow-xl shadow-teal-100 hover:bg-teal-700 transition-all"
          >
            <UserPlus size={16} /> Vincular Nuevo
          </button>
        </div>
      </header>

      {voters.length === 0 ? (
        <div className="bg-white rounded-[3rem] border border-slate-100 p-20 text-center space-y-6 shadow-sm">
           <div className="h-24 w-24 bg-teal-50 rounded-full flex items-center justify-center mx-auto">
              <Inbox className="h-10 w-10 text-teal-200" />
           </div>
           <p className="text-[10px] font-black uppercase text-slate-400 tracking-[0.2em]">Sin registros tácticos</p>
        </div>
      ) : (
        <div className="bg-white rounded-[2.5rem] border border-slate-100 shadow-sm overflow-hidden">
          <div className="p-8 border-b border-slate-50 flex flex-col md:flex-row items-center justify-between gap-6 bg-slate-50/30">
            <div className="relative w-full md:w-[28rem]">
              <Search className="absolute left-5 top-1/2 -translate-y-1/2 h-5 w-5 text-teal-500" />
              <input 
                type="text" 
                placeholder="Buscar por nombre o cédula..." 
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pl-14 pr-6 py-4 bg-white border border-slate-200 rounded-2xl text-sm font-medium focus:ring-4 focus:ring-teal-500/5 focus:border-teal-500 transition-all outline-none"
              />
            </div>
            <button className="flex items-center gap-2 px-6 py-3 bg-white border border-slate-200 rounded-2xl text-[10px] font-black uppercase tracking-widest text-slate-400 hover:text-teal-600 transition-all">
               <Filter size={14} /> Filtros Avanzados
            </button>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead>
                <tr className="bg-slate-50/50 border-b border-slate-50">
                  <th className="px-10 py-6 text-[10px] font-black text-slate-400 uppercase tracking-[0.2em]">Identidad</th>
                  <th className="px-10 py-6 text-[10px] font-black text-slate-400 uppercase tracking-[0.2em]">Puesto / Mesa</th>
                  <th className="px-10 py-6 text-[10px] font-black text-slate-400 uppercase tracking-[0.2em]">Liderazgo</th>
                  <th className="px-10 py-6 text-[10px] font-black text-slate-400 uppercase tracking-[0.2em]">Estado</th>
                  <th className="px-10 py-6 text-right"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {filteredVotantes.map((v) => (
                  <tr key={v.id} className="group hover:bg-teal-50/30 transition-all">
                    <td className="px-10 py-7">
                      <div className="flex items-center gap-4">
                        <div className="w-10 h-10 bg-teal-50 text-teal-600 border border-teal-100 rounded-xl flex items-center justify-center font-black text-xs shrink-0 shadow-sm transition-all group-hover:bg-teal-600 group-hover:text-white group-hover:border-teal-600">
                          {v.nombres.charAt(0)}
                        </div>
                        <div>
                          <p className="text-sm font-black text-slate-900 uppercase">{v.nombres}</p>
                          <div className="flex items-center gap-2 text-[10px] font-bold text-slate-400 font-mono">
                            <IdCard size={10} className="text-teal-500" /> {v.cedula}
                          </div>
                        </div>
                      </div>
                    </td>
                    <td className="px-10 py-7 text-[11px] font-black text-slate-600 uppercase tracking-tight">{v.puesto_votacion} <span className="text-teal-500 ml-1">Mesa {v.mesa || "N/A"}</span></td>
                    <td className="px-10 py-7 text-[10px] font-bold text-slate-400 uppercase">{v.referido_por || 'Registro Directo'}</td>
                    <td className="px-10 py-7"><StatusBadge status={v.estado} /></td>
                    <td className="px-10 py-7 text-right">
                      <div className="flex justify-end gap-2 opacity-0 group-hover:opacity-100 transition-all">
                        <button className="p-2 text-slate-400 hover:text-teal-600 hover:bg-white rounded-xl transition-all shadow-sm"><Edit2 size={16} /></button>
                        <button onClick={() => { deleteVoter(v.id); info("Registro eliminado"); }} className="p-2 text-slate-400 hover:text-rose-500 hover:bg-white rounded-xl transition-all shadow-sm"><Trash2 size={16} /></button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {isModalOpen && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm z-[60] flex items-center justify-center p-6">
          <div className="bg-white w-full max-w-2xl rounded-[3rem] p-12 shadow-2xl animate-in zoom-in-95 duration-300 relative">
            <button onClick={() => setIsModalOpen(false)} className="absolute top-10 right-10 p-3 hover:bg-slate-50 rounded-2xl transition-all text-slate-400 hover:text-rose-500"><X size={24} /></button>
            <div className="mb-10 text-center">
              <h2 className="text-4xl font-black text-slate-900 tracking-tighter uppercase">Vinculación de Base</h2>
              <p className="text-slate-500 font-medium mt-2">Diligencia los datos para el censo de campaña.</p>
            </div>
            <form onSubmit={handleSave} className="space-y-8">
              <div className="grid grid-cols-2 gap-6">
                <div className="space-y-2">
                  <label className="text-[10px] font-black uppercase text-slate-400 tracking-widest ml-2">Nombres Completos</label>
                  <input type="text" required value={formData.nombres} onChange={e => setFormData({...formData, nombres: e.target.value})} className="w-full bg-slate-50 border-2 border-transparent focus:border-teal-500 focus:bg-white rounded-2xl p-5 text-sm font-bold transition-all outline-none" placeholder="Andrés Morales" />
                </div>
                <div className="space-y-2">
                  <label className="text-[10px] font-black uppercase text-slate-400 tracking-widest ml-2">Identificación (CC)</label>
                  <input type="text" required value={formData.cedula} onChange={e => setFormData({...formData, cedula: e.target.value})} className="w-full bg-slate-50 border-2 border-transparent focus:border-teal-500 focus:bg-white rounded-2xl p-5 text-sm font-bold transition-all outline-none" placeholder="Sólo números" />
                </div>
                <div className="space-y-2">
                  <label className="text-[10px] font-black uppercase text-slate-400 tracking-widest ml-2">Celular</label>
                  <input type="tel" value={formData.celular} onChange={e => setFormData({...formData, celular: e.target.value})} className="w-full bg-slate-50 border-2 border-transparent focus:border-teal-500 focus:bg-white rounded-2xl p-5 text-sm font-bold transition-all outline-none" placeholder="3xx xxx xxxx" />
                </div>
                <div className="space-y-2">
                  <label className="text-[10px] font-black uppercase text-slate-400 tracking-widest ml-2">Puesto de Votación</label>
                  <select value={formData.puesto_votacion} onChange={e => setFormData({...formData, puesto_votacion: e.target.value})} className="w-full bg-slate-50 border-2 border-transparent focus:border-teal-500 focus:bg-white rounded-2xl p-5 text-sm font-bold transition-all appearance-none outline-none cursor-pointer"><option value="Unicentro">Unicentro</option><option value="Col. San José">Col. San José</option><option value="Parque Estadio">Parque Estadio</option><option value="Col. Mayor">Col. Mayor</option></select>
                </div>
              </div>
              <button type="submit" className="w-full py-6 bg-teal-600 text-white rounded-[2rem] font-black text-[10px] uppercase tracking-[0.2em] shadow-xl shadow-teal-100 hover:bg-teal-700 transition-all flex items-center justify-center gap-4">Confirmar Registro <ChevronRight size={18} /></button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
