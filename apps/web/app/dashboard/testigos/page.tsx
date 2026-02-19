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
    setMounted(true);
  }, []);

  const [formData, setFormData] = useState({ nombre: "", celular: "", asignado_a_puesto: "Unicentro" });

  const filteredWitnesses = useMemo(() => {
    return witnesses.filter(w => w.nombre.toLowerCase().includes(searchTerm.toLowerCase()) || w.asignado_a_puesto.toLowerCase().includes(searchTerm.toLowerCase()));
  }, [witnesses, searchTerm]);

  const kpis = useMemo(() => {
    const total = witnesses.length;
    const reportaron = witnesses.filter(w => w.reporto_e14).length;
    return { total, reportaron, mesasCubiertas: total };
  }, [witnesses]);

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.nombre || !formData.celular) return;
    assignWitness(formData);
    setFormData({ nombre: "", celular: "", asignado_a_puesto: "Unicentro" });
    setIsModalOpen(false);
  };

  if (!mounted) return null;

  return (
    <div className="space-y-8 animate-in fade-in duration-700">
      <header className="flex flex-col md:flex-row md:items-center justify-between gap-6">
        <div>
          <h1 className="text-4xl font-black text-slate-900 tracking-tighter uppercase">Fuerza de Testigos</h1>
          <p className="text-slate-500 font-medium">Cuidado de votos y reporte de actas E-14 para el Día D.</p>
        </div>
        <button onClick={() => setIsModalOpen(true)} className="bg-teal-600 text-white px-8 py-4 rounded-2xl flex items-center gap-3 font-black text-[10px] uppercase tracking-widest hover:bg-teal-700 transition-all shadow-xl shadow-teal-100"><UserPlus className="h-5 w-5" /> Reclutar Guardián</button>
      </header>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="bg-white p-8 rounded-[2.5rem] border border-slate-100 shadow-sm relative overflow-hidden group">
          <div className="absolute -right-2 -bottom-2 opacity-5 group-hover:scale-110 transition-transform"><ShieldCheck size={100} className="text-teal-600" /></div>
          <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Capacidad Total</p>
          <h3 className="text-4xl font-black text-slate-900">{kpis.total}</h3>
          <p className="text-[10px] font-bold text-teal-600 mt-2 uppercase">Testigos Acreditados</p>
        </div>
        <div className="bg-white p-8 rounded-[2.5rem] border border-slate-100 shadow-sm">
          <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Cobertura</p>
          <h3 className="text-4xl font-black text-slate-900">{kpis.mesasCubiertas}</h3>
          <p className="text-[10px] font-bold text-emerald-600 mt-2 uppercase">Mesas Blindadas</p>
        </div>
        <div className="bg-white p-8 rounded-[2.5rem] border border-slate-100 shadow-sm">
          <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Reportes E-14</p>
          <h3 className="text-4xl font-black text-slate-900">{kpis.reportaron}</h3>
          <p className="text-[10px] font-bold text-teal-600 mt-2 uppercase">Actas Recibidas</p>
        </div>
      </div>

      <div className="bg-white rounded-[2.5rem] border border-slate-100 shadow-sm overflow-hidden">
        <div className="p-8 border-b border-slate-50 bg-slate-50/30">
          <div className="relative w-full md:w-[28rem]">
            <Search className="absolute left-5 top-1/2 -translate-y-1/2 h-5 w-5 text-teal-500" />
            <input type="text" placeholder="Buscar por nombre o puesto..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} className="w-full pl-14 pr-6 py-4 bg-white border border-slate-200 rounded-2xl text-sm font-medium focus:ring-4 focus:ring-teal-500/5 outline-none transition-all shadow-sm" />
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-100">
                <th className="px-10 py-6 text-[10px] font-black text-slate-400 uppercase tracking-[0.2em]">Identidad</th>
                <th className="px-10 py-6 text-[10px] font-black text-slate-400 uppercase tracking-[0.2em]">Asignación</th>
                <th className="px-10 py-6 text-[10px] font-black text-slate-400 uppercase tracking-[0.2em]">Estado E-14</th>
                <th className="px-10 py-6 text-right"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {filteredWitnesses.map((w) => (
                <tr key={w.id} className="group hover:bg-teal-50/30 transition-all">
                  <td className="px-10 py-7">
                    <p className="text-sm font-black text-slate-900 uppercase">{w.nombre}</p>
                    <p className="text-[10px] font-bold text-slate-400 font-mono mt-1">{w.celular}</p>
                  </td>
                  <td className="px-10 py-7">
                    <div className="flex items-center gap-2 text-[11px] font-black text-slate-600 uppercase">
                      <div className="w-8 h-8 bg-slate-100 rounded-lg flex items-center justify-center text-teal-600"><Eye size={14} /></div>
                      {w.asignado_a_puesto}
                    </div>
                  </td>
                  <td className="px-10 py-7">
                    <button onClick={() => updateWitness(w.id, { reporto_e14: !w.reporto_e14 })} className={cn("flex items-center gap-2 px-4 py-2 rounded-xl text-[9px] font-black uppercase tracking-widest border transition-all", w.reporto_e14 ? "bg-emerald-50 text-emerald-700 border-emerald-100" : "bg-rose-50 text-rose-700 border-rose-100 hover:bg-rose-100")}>
                      {w.reporto_e14 ? <CheckCircle size={14} /> : <XCircle size={14} />} {w.reporto_e14 ? "Reportado" : "Pendiente"}
                    </button>
                  </td>
                  <td className="px-10 py-7 text-right">
                    <button className="p-3 text-slate-300 hover:text-teal-600 hover:bg-white rounded-xl transition-all shadow-sm"><MoreHorizontal size={20} /></button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {isModalOpen && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm z-[60] flex items-center justify-center p-6">
          <div className="bg-white w-full max-w-xl rounded-[3rem] p-12 shadow-2xl animate-in zoom-in-95 duration-300 relative">
            <button onClick={() => setIsModalOpen(false)} className="absolute top-10 right-10 p-3 hover:bg-slate-50 rounded-2xl transition-all text-slate-400"><X size={24} /></button>
            <div className="mb-10 text-center">
              <div className="h-20 w-20 bg-teal-50 text-teal-600 rounded-[2rem] flex items-center justify-center mx-auto mb-6 shadow-inner"><ShieldCheck size={36} /></div>
              <h2 className="text-4xl font-black text-slate-900 tracking-tighter uppercase">Acreditación</h2>
              <p className="text-slate-500 font-medium mt-2">Asigna un guardián de mesa para el control electoral.</p>
            </div>
            <form onSubmit={handleSave} className="space-y-6">
              <div className="space-y-2"><label className="text-[10px] font-black uppercase text-slate-400 tracking-[0.2em] ml-2">Nombre Completo</label><input type="text" required value={formData.nombre} onChange={e => setFormData({...formData, nombre: e.target.value})} className="w-full bg-slate-50 border-2 border-transparent focus:border-teal-500 focus:bg-white rounded-2xl p-5 text-sm font-bold transition-all outline-none" placeholder="Daniel Guerrero" /></div>
              <div className="space-y-2"><label className="text-[10px] font-black uppercase text-slate-400 tracking-[0.2em] ml-2">Celular de Contacto</label><input type="tel" required value={formData.celular} onChange={e => setFormData({...formData, celular: e.target.value})} className="w-full bg-slate-50 border-2 border-transparent focus:border-teal-500 focus:bg-white rounded-2xl p-5 text-sm font-bold transition-all outline-none" placeholder="3xx xxx xxxx" /></div>
              <div className="space-y-2"><label className="text-[10px] font-black uppercase text-slate-400 tracking-[0.2em] ml-2">Puesto de Votación</label><select value={formData.asignado_a_puesto} onChange={e => setFormData({...formData, asignado_a_puesto: e.target.value})} className="w-full bg-slate-50 border-2 border-transparent focus:border-teal-500 focus:bg-white rounded-2xl p-5 text-sm font-bold transition-all appearance-none outline-none cursor-pointer"><option value="Unicentro">Unicentro</option><option value="Col. San José">Col. San José</option><option value="Parque Estadio">Parque Estadio</option><option value="Col. Mayor">Col. Mayor</option></select></div>
              <button type="submit" className="w-full py-6 bg-teal-600 text-white rounded-[2rem] font-black text-[10px] uppercase tracking-[0.2em] shadow-xl shadow-teal-100 hover:bg-teal-700 transition-all flex items-center justify-center gap-4 group">Vincular Testigo <ChevronRight size={18} className="group-hover:translate-x-1 transition-transform" /></button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
