"use client";

import React, { useState, useEffect, useMemo } from "react";
import { 
  ShieldCheck, 
  UserPlus, 
  Search, 
  CheckCircle, 
  XCircle, 
  X, 
  Phone, 
  MoreHorizontal,
  Mail,
  Eye,
  ChevronRight,
  MessageSquare
} from "lucide-react";
import { cn } from "@/components/ui/utils";
import { useCampaign } from "@/context/CampaignContext";

export default function TestigosPage() {
  const { witnesses, assignWitness, updateWitness } = useCampaign();
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setMounted(true);
  }, []);

  const [formData, setFormData] = useState({
    nombre: "",
    celular: "",
    asignado_a_puesto: "Unicentro"
  });

  const filteredWitnesses = useMemo(() => {
    return witnesses.filter(w => 
      w.nombre.toLowerCase().includes(searchTerm.toLowerCase()) || 
      w.asignado_a_puesto.toLowerCase().includes(searchTerm.toLowerCase())
    );
  }, [witnesses, searchTerm]);

  const kpis = useMemo(() => {
    const total = witnesses.length;
    const reportaron = witnesses.filter(w => w.reporto_e14).length;
    const mesasCubiertas = total; // Simulación: 1 testigo por mesa
    return { total, reportaron, mesasCubiertas };
  }, [witnesses]);

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.nombre || !formData.celular) return;
    assignWitness(formData);
    setFormData({ nombre: "", celular: "", asignado_a_puesto: "Unicentro" });
    setIsModalOpen(false);
  };

  const toggleE14 = (id: string, current: boolean) => {
    updateWitness(id, { reporto_e14: !current });
  };

  if (!mounted) return null;

  return (
    <div className="space-y-8 animate-in fade-in duration-500">
      <header className="flex flex-col md:flex-row md:items-center justify-between gap-6">
        <div>
          <h1 className="text-4xl font-black text-[#111827] tracking-tighter">Ejército de Testigos</h1>
          <p className="text-zinc-500 font-medium italic text-sm">Cuidado de votos y reporte de actas E-14 para el Día D.</p>
        </div>
        <button 
          onClick={() => setIsModalOpen(true)}
          className="bg-[#111827] text-white px-8 py-4 rounded-2xl flex items-center gap-3 font-black text-xs uppercase tracking-widest hover:bg-[#0047AB] transition-all shadow-xl shadow-zinc-200"
        >
          <UserPlus className="h-5 w-5" />
          Reclutar Testigo
        </button>
      </header>

      {/* KPIs de Tropa */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="bg-white p-8 rounded-[2.5rem] border border-zinc-100 shadow-sm">
          <p className="text-[10px] font-black text-zinc-400 uppercase tracking-widest mb-1">Fuerza Total</p>
          <div className="flex items-center justify-between">
            <h3 className="text-4xl font-black text-[#111827]">{kpis.total}</h3>
            <ShieldCheck className="text-[#0047AB]" size={32} />
          </div>
          <p className="text-xs font-bold text-zinc-400 mt-2">Testigos acreditados</p>
        </div>
        <div className="bg-white p-8 rounded-[2.5rem] border border-zinc-100 shadow-sm">
          <p className="text-[10px] font-black text-zinc-400 uppercase tracking-widest mb-1">Mesas Cubiertas</p>
          <div className="flex items-center justify-between">
            <h3 className="text-4xl font-black text-[#111827]">{kpis.mesasCubiertas}</h3>
            <div className="h-10 w-10 bg-emerald-50 text-emerald-600 rounded-xl flex items-center justify-center">
              <CheckCircle size={24} />
            </div>
          </div>
          <p className="text-xs font-bold text-zinc-400 mt-2">100% de cobertura prevista</p>
        </div>
        <div className="bg-white p-8 rounded-[2.5rem] border border-zinc-100 shadow-sm">
          <p className="text-[10px] font-black text-zinc-400 uppercase tracking-widest mb-1">Actas E-14 (Día D)</p>
          <div className="flex items-center justify-between">
            <h3 className="text-4xl font-black text-[#111827]">{kpis.reportaron}</h3>
            <div className="h-10 w-10 bg-blue-50 text-blue-600 rounded-xl flex items-center justify-center">
              <Mail size={24} />
            </div>
          </div>
          <p className="text-xs font-bold text-zinc-400 mt-2">Reportes recibidos</p>
        </div>
      </div>

      <div className="bg-white rounded-[2.5rem] border border-zinc-100 shadow-sm overflow-hidden">
        <div className="p-8 border-b border-zinc-100 flex flex-col md:flex-row items-center justify-between gap-6 bg-zinc-50/30">
          <div className="relative w-full md:w-[28rem]">
            <Search className="absolute left-5 top-1/2 -translate-y-1/2 h-5 w-5 text-zinc-300" />
            <input 
              type="text" 
              placeholder="Buscar por nombre o puesto de votación..." 
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-14 pr-6 py-4 bg-white border border-zinc-100 rounded-[1.5rem] text-sm font-bold focus:ring-4 focus:ring-blue-50 transition-all shadow-sm outline-none"
            />
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-zinc-50">
                <th className="px-10 py-6 text-[10px] font-black text-zinc-300 uppercase tracking-[0.2em]">Identidad del Testigo</th>
                <th className="px-10 py-6 text-[10px] font-black text-zinc-300 uppercase tracking-[0.2em]">Puesto Asignado</th>
                <th className="px-10 py-6 text-[10px] font-black text-zinc-300 uppercase tracking-[0.2em]">Contacto</th>
                <th className="px-10 py-6 text-[10px] font-black text-zinc-300 uppercase tracking-[0.2em]">Reportó E-14</th>
                <th className="px-10 py-6 text-right"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-50">
              {filteredWitnesses.map((w) => (
                <tr key={w.id} className="group hover:bg-zinc-50 transition-all">
                  <td className="px-10 py-7">
                    <span className="text-sm font-black text-[#111827]">{w.nombre}</span>
                  </td>
                  <td className="px-10 py-7">
                    <div className="flex items-center gap-2">
                      <div className="h-8 w-8 bg-zinc-100 rounded-xl flex items-center justify-center text-[#111827]">
                        <Eye size={14} />
                      </div>
                      <span className="text-xs font-bold text-zinc-600 uppercase tracking-tighter">{w.asignado_a_puesto}</span>
                    </div>
                  </td>
                  <td className="px-10 py-7">
                    <div className="flex items-center gap-4">
                      <span className="text-xs font-bold text-zinc-400 font-mono">{w.celular}</span>
                      <button 
                        onClick={() => alert(`Conectando por WhatsApp con ${w.nombre}...`)}
                        className="h-8 w-8 bg-emerald-50 text-emerald-600 rounded-lg flex items-center justify-center hover:bg-emerald-600 hover:text-white transition-all shadow-sm"
                      >
                        <MessageSquare size={14} />
                      </button>
                    </div>
                  </td>
                  <td className="px-10 py-7">
                    <button 
                      onClick={() => toggleE14(w.id, w.reporto_e14)}
                      className={cn(
                        "flex items-center gap-2 px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest border transition-all",
                        w.reporto_e14 
                          ? "bg-emerald-50 text-emerald-600 border-emerald-100" 
                          : "bg-red-50 text-red-600 border-red-100 hover:bg-red-100"
                      )}
                    >
                      {w.reporto_e14 ? <CheckCircle size={14} /> : <XCircle size={14} />}
                      {w.reporto_e14 ? "Reportado" : "Pendiente"}
                    </button>
                  </td>
                  <td className="px-10 py-7 text-right">
                    <button className="p-2 text-zinc-300 hover:text-[#111827] transition-colors">
                      <MoreHorizontal size={20} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Modal: Asignar Testigo */}
      {isModalOpen && (
        <div className="fixed inset-0 bg-[#111827]/95 backdrop-blur-xl z-[60] flex items-center justify-center p-6">
          <div className="bg-white w-full max-w-xl rounded-[3.5rem] p-12 shadow-2xl animate-in zoom-in-95 duration-300 relative">
            <button 
              onClick={() => setIsModalOpen(false)}
              className="absolute top-10 right-10 p-3 hover:bg-zinc-100 rounded-full transition-all text-zinc-400"
            >
              <X size={28} />
            </button>

            <div className="mb-10 text-center">
              <div className="h-20 w-20 bg-blue-50 text-[#0047AB] rounded-[2rem] flex items-center justify-center mx-auto mb-6 shadow-inner">
                 <ShieldCheck size={36} />
              </div>
              <h2 className="text-4xl font-black text-[#111827] tracking-tighter">Acreditación de Testigo</h2>
              <p className="text-zinc-500 font-medium italic mt-2">Diligencia los datos para asignar un guardián de mesa.</p>
            </div>
            
            <form onSubmit={handleSave} className="space-y-6">
              <div className="space-y-2">
                <label className="text-[10px] font-black uppercase text-zinc-400 tracking-[0.2em] ml-2">Nombre Completo</label>
                <input 
                  type="text" required
                  value={formData.nombre}
                  onChange={e => setFormData({...formData, nombre: e.target.value})}
                  className="w-full bg-zinc-50 border-2 border-transparent focus:border-[#0047AB] focus:bg-white rounded-2xl p-5 text-sm font-bold transition-all outline-none" 
                  placeholder="Ej: Daniel Guerrero" 
                />
              </div>
              <div className="space-y-2">
                <label className="text-[10px] font-black uppercase text-zinc-400 tracking-[0.2em] ml-2">Celular de Contacto</label>
                <input 
                  type="tel" required
                  value={formData.celular}
                  onChange={e => setFormData({...formData, celular: e.target.value})}
                  className="w-full bg-zinc-50 border-2 border-transparent focus:border-[#0047AB] focus:bg-white rounded-2xl p-5 text-sm font-bold transition-all outline-none" 
                  placeholder="3xx xxx xxxx" 
                />
              </div>
              <div className="space-y-2">
                <label className="text-[10px] font-black uppercase text-zinc-400 tracking-[0.2em] ml-2">Puesto de Votación</label>
                <select 
                  value={formData.asignado_a_puesto}
                  onChange={e => setFormData({...formData, asignado_a_puesto: e.target.value})}
                  className="w-full bg-zinc-50 border-2 border-transparent focus:border-[#0047AB] focus:bg-white rounded-2xl p-5 text-sm font-bold transition-all appearance-none outline-none"
                >
                  <option value="Unicentro">Unicentro</option>
                  <option value="Col. San José">Col. San José</option>
                  <option value="Parque Estadio">Parque Estadio</option>
                  <option value="Col. Mayor">Col. Mayor</option>
                </select>
              </div>

              <button type="submit" className="w-full py-6 bg-[#111827] text-white rounded-[2rem] font-black text-xs uppercase tracking-[0.2em] shadow-2xl shadow-zinc-900/40 hover:scale-[1.02] active:scale-[0.98] transition-all flex items-center justify-center gap-4 group">
                Vincular Testigo
                <ChevronRight size={18} className="group-hover:translate-x-1 transition-transform" />
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
