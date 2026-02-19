"use client";

import React, { useState, useMemo, useEffect } from "react";
import { 
  Search, 
  UserPlus, 
  Download, 
  Phone,
  Check,
  X,
  Trash2,
  Edit2,
  ChevronRight,
  Filter,
  AlertCircle,
  Ghost,
  Inbox
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
    // eslint-disable-next-line react-hooks/set-state-in-effect
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
    success(`Simpatizante ${formData.nombres} vinculado correctamente`);
    
    setFormData({ 
      nombres: "", 
      cedula: "", 
      celular: "", 
      puesto_votacion: "Unicentro", 
      mesa: "", 
      referido_por: "", 
      barrio: "", 
      estado: "Indeciso" 
    });
    setIsModalOpen(false);
  };

  const maskCedula = (cedula: string) => {
    if (cedula.length < 5) return cedula;
    const first = cedula.substring(0, 3);
    const last = cedula.substring(cedula.length - 3);
    return `${first}.***.${last}`;
  };

  const StatusBadge = ({ status }: { status: string }) => {
    const colors = {
      "Firme": "bg-emerald-50 text-emerald-600 border-emerald-100",
      "Indeciso": "bg-amber-50 text-amber-600 border-amber-100",
      "Ya Votó": "bg-blue-50 text-blue-600 border-blue-100",
      "Contrario": "bg-red-50 text-red-600 border-red-100",
    };
    return (
      <span className={cn("px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-widest border flex items-center gap-1.5 w-fit", colors[status as keyof typeof colors])}>
        <div className={cn("h-1 w-1 rounded-full", 
          status === "Firme" ? "bg-emerald-500" : 
          status === "Indeciso" ? "bg-amber-500" :
          status === "Ya Votó" ? "bg-blue-500" : "bg-red-500")} />
        {status}
      </span>
    );
  };

  if (!mounted) return null;

  return (
    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500 relative">
      <header className="flex flex-col md:flex-row md:items-center justify-between gap-6">
        <div>
          <h1 className="text-4xl font-black text-[#111827] tracking-tighter">Censo Electoral</h1>
          <p className="text-zinc-500 font-medium italic text-sm">Administración directa de la base de datos de simpatizantes.</p>
        </div>
        <div className="flex gap-3">
          <button className="bg-white border-2 border-zinc-100 text-zinc-600 px-6 py-4 rounded-2xl flex items-center gap-3 font-black text-xs uppercase tracking-widest hover:bg-zinc-50 transition-all shadow-sm">
            <Download className="h-4 w-4" />
            Exportar CSV
          </button>
          <button 
            onClick={() => setIsModalOpen(true)}
            className="bg-[#0047AB] text-white px-8 py-4 rounded-2xl flex items-center gap-3 font-black text-xs uppercase tracking-widest hover:bg-blue-700 transition-all shadow-xl shadow-blue-200"
          >
            <UserPlus className="h-5 w-5" />
            Vincular Nuevo
          </button>
        </div>
      </header>

      {voters.length === 0 ? (
        <div className="bg-white rounded-[3rem] border-2 border-dashed border-zinc-100 p-20 text-center space-y-6">
           <div className="h-24 w-24 bg-zinc-50 rounded-full flex items-center justify-center mx-auto">
              <Inbox className="h-10 w-10 text-zinc-200" />
           </div>
           <div>
              <h3 className="text-xl font-black text-[#111827] tracking-tight">Sin simpatizantes registrados</h3>
              <p className="text-zinc-400 text-sm italic">Comienza a poblar tu base de datos para ver la analítica territorial.</p>
           </div>
           <button 
            onClick={() => setIsModalOpen(true)}
            className="inline-flex items-center gap-2 bg-[#111827] text-white px-8 py-4 rounded-2xl font-black text-xs uppercase tracking-widest hover:bg-[#0047AB] transition-all"
           >
              Crear el Primer Registro
           </button>
        </div>
      ) : (
        <div className="bg-white rounded-[3rem] border border-zinc-100 shadow-sm overflow-hidden">
          <div className="p-8 border-b border-zinc-100 flex flex-col md:flex-row items-center justify-between gap-6 bg-zinc-50/30">
            <div className="relative w-full md:w-[28rem]">
              <Search className="absolute left-5 top-1/2 -translate-y-1/2 h-5 w-5 text-zinc-300" />
              <input 
                type="text" 
                placeholder="Buscar por nombre o cédula..." 
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pl-14 pr-6 py-4 bg-white border border-zinc-100 rounded-[1.5rem] text-sm font-bold focus:ring-4 focus:ring-blue-50 transition-all shadow-sm outline-none"
              />
            </div>
            <button className="flex items-center gap-2 px-6 py-3 border border-zinc-200 rounded-2xl text-[10px] font-black uppercase tracking-widest text-zinc-400 hover:bg-white transition-all">
               <Filter size={14} /> Filtros Avanzados
            </button>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-zinc-50">
                  <th className="px-10 py-6 text-[10px] font-black text-zinc-300 uppercase tracking-[0.2em]">Identidad</th>
                  <th className="px-10 py-6 text-[10px] font-black text-zinc-300 uppercase tracking-[0.2em]">Cédula</th>
                  <th className="px-10 py-6 text-[10px] font-black text-zinc-300 uppercase tracking-[0.2em]">Puesto / Mesa</th>
                  <th className="px-10 py-6 text-[10px] font-black text-zinc-300 uppercase tracking-[0.2em]">Liderazgo</th>
                  <th className="px-10 py-6 text-[10px] font-black text-zinc-300 uppercase tracking-[0.2em]">Estado</th>
                  <th className="px-10 py-6 text-right"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-50">
                {filteredVotantes.map((v) => (
                  <tr key={v.id} className="group hover:bg-zinc-50/80 transition-all">
                    <td className="px-10 py-7">
                      <div className="flex flex-col">
                        <span className="text-sm font-black text-[#111827] group-hover:text-[#0047AB] transition-colors">{v.nombres}</span>
                        <div className="flex items-center gap-2 text-zinc-400">
                          <Phone className="h-3 w-3" />
                          <span className="text-[10px] font-bold tracking-tight">{v.celular}</span>
                        </div>
                      </div>
                    </td>
                    <td className="px-10 py-7 text-xs font-bold text-zinc-500 font-mono">{maskCedula(v.cedula)}</td>
                    <td className="px-10 py-7 text-xs font-black text-zinc-600">{v.puesto_votacion} / M{v.mesa || "N/A"}</td>
                    <td className="px-10 py-7 text-xs font-bold text-zinc-500">{v.referido_por}</td>
                    <td className="px-10 py-7">
                      <StatusBadge status={v.estado} />
                    </td>
                    <td className="px-10 py-7 text-right">
                      <div className="flex justify-end gap-1 opacity-0 group-hover:opacity-100 transition-all transform translate-x-2 group-hover:translate-x-0">
                        <button className="p-2 text-zinc-400 hover:text-blue-600 transition-colors"><Edit2 size={16} /></button>
                        <button 
                          onClick={() => {
                            deleteVoter(v.id);
                            info("Registro eliminado de la base local");
                          }} 
                          className="p-2 text-zinc-400 hover:text-red-500 transition-colors"
                        >
                          <Trash2 size={16} />
                        </button>
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
        <div className="fixed inset-0 bg-[#111827]/95 backdrop-blur-xl z-[60] flex items-center justify-center p-6">
          <div className="bg-white w-full max-w-2xl rounded-[3.5rem] p-12 shadow-2xl animate-in zoom-in-95 duration-300 relative">
            <button 
              onClick={() => setIsModalOpen(false)}
              className="absolute top-10 right-10 p-3 hover:bg-zinc-100 rounded-full transition-all text-zinc-400"
            >
              <X size={28} />
            </button>

            <div className="mb-10">
              <h2 className="text-4xl font-black text-[#111827] tracking-tighter">Vinculación de Base</h2>
              <p className="text-zinc-500 font-medium italic mt-2">Diligencia los datos del ciudadano para el censo de campaña.</p>
            </div>
            
            <form onSubmit={handleSave} className="space-y-8">
              <div className="grid grid-cols-2 gap-6">
                <div className="space-y-2">
                  <label className="text-[10px] font-black uppercase text-zinc-400 tracking-[0.2em] ml-2">Nombres Completos</label>
                  <input 
                    type="text" required
                    value={formData.nombres}
                    onChange={e => setFormData({...formData, nombres: e.target.value})}
                    className="w-full bg-zinc-50 border-2 border-transparent focus:border-[#0047AB] focus:bg-white rounded-[1.5rem] p-5 text-sm font-bold transition-all outline-none" 
                    placeholder="Ej: Andrés Morales" 
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-[10px] font-black uppercase text-zinc-400 tracking-[0.2em] ml-2">Cédula (CC)</label>
                  <input 
                    type="text" required
                    pattern="[0-9]*"
                    value={formData.cedula}
                    onChange={e => setFormData({...formData, cedula: e.target.value})}
                    className="w-full bg-zinc-50 border-2 border-transparent focus:border-[#0047AB] focus:bg-white rounded-[1.5rem] p-5 text-sm font-bold transition-all outline-none" 
                    placeholder="Sólo números" 
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-[10px] font-black uppercase text-zinc-400 tracking-[0.2em] ml-2">Celular</label>
                  <input 
                    type="tel" 
                    value={formData.celular}
                    onChange={e => setFormData({...formData, celular: e.target.value})}
                    className="w-full bg-zinc-50 border-2 border-transparent focus:border-[#0047AB] focus:bg-white rounded-[1.5rem] p-5 text-sm font-bold transition-all outline-none" 
                    placeholder="3xx xxx xxxx" 
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-[10px] font-black uppercase text-zinc-400 tracking-[0.2em] ml-2">Puesto de Votación</label>
                  <select 
                    value={formData.puesto_votacion}
                    onChange={e => setFormData({...formData, puesto_votacion: e.target.value})}
                    className="w-full bg-zinc-50 border-2 border-transparent focus:border-[#0047AB] focus:bg-white rounded-[1.5rem] p-5 text-sm font-bold transition-all appearance-none outline-none"
                  >
                    <option value="Unicentro">Unicentro</option>
                    <option value="Col. San José">Col. San José</option>
                    <option value="Parque Estadio">Parque Estadio</option>
                    <option value="Col. Mayor">Col. Mayor</option>
                  </select>
                </div>
              </div>

              <button type="submit" className="w-full py-6 bg-[#0047AB] text-white rounded-[2rem] font-black text-xs uppercase tracking-[0.2em] shadow-2xl shadow-blue-200 hover:scale-[1.02] active:scale-[0.98] transition-all flex items-center justify-center gap-4 group">
                Confirmar Vinculación
                <ChevronRight size={18} className="group-hover:translate-x-1 transition-transform" />
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
