"use client";

import React, { useState } from 'react';
import { useCRM, TerritoryZone } from '@/context/CRMContext';
import { MapPin, Plus, Trash2, Edit2, Target, Save } from 'lucide-react';

export default function SettingsPage() {
  const { territory, campaignGoal, addTerritoryZone, updateTerritoryZone, deleteTerritoryZone, updateCampaignGoal } = useCRM();
  const [editingId, setEditingId] = useState<string | null>(null);
  const [goalInput, setGoalInput] = useState(campaignGoal.toString());

  const [form, setForm] = useState({ name: '', target: 0, leader: '', lat: '', lng: '' });

  const handleUpdateGoal = (e: React.FormEvent) => {
    e.preventDefault();
    updateCampaignGoal(Number(goalInput));
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const zoneData = { name: form.name, target: Number(form.target), leader: form.leader, lat: Number(form.lat), lng: Number(form.lng) };
    if (editingId) { updateTerritoryZone(editingId, zoneData); setEditingId(null); }
    else { addTerritoryZone(zoneData); }
    setForm({ name: '', target: 0, leader: '', lat: '', lng: '' });
  };

  const handleEdit = (zone: TerritoryZone) => {
    setEditingId(zone.id);
    setForm({
      name: zone.name,
      target: zone.target,
      leader: zone.leader,
      lat: (zone.lat || '').toString(),
      lng: (zone.lng || '').toString()
    });
  };

  return (
    <div className="space-y-8 animate-in fade-in duration-700">
      <div>
        <h1 className="text-3xl font-black text-slate-900 tracking-tighter uppercase">Configuración de Territorio</h1>
        <p className="text-slate-500 font-medium">Administra las zonas y asignación estratégica de líderes.</p>
      </div>

      {/* Meta Global - Rediseñada a Soft Teal */}
      <div className="bg-white p-10 rounded-[3rem] border border-slate-100 shadow-sm flex flex-col md:flex-row justify-between items-center gap-8 relative overflow-hidden">
        <div className="absolute top-0 left-0 w-1 h-full bg-teal-600" />
        <div className="space-y-2 relative z-10">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-teal-50 text-teal-600 rounded-lg"><Target size={24} /></div>
            <h2 className="text-2xl font-black text-slate-900 tracking-tighter uppercase">Meta Global de Votos</h2>
          </div>
          <p className="text-slate-400 text-[10px] font-black uppercase tracking-widest px-1">Objetivo estratégico para la victoria electoral.</p>
        </div>
        
        <form onSubmit={handleUpdateGoal} className="flex gap-4 w-full md:w-auto relative z-10">
          <input 
            type="number"
            className="px-6 py-4 bg-slate-50 border border-slate-200 rounded-2xl text-2xl font-black text-slate-900 focus:border-teal-500 focus:ring-4 focus:ring-teal-500/5 outline-none transition-all w-full md:w-48 text-center"
            value={goalInput}
            onChange={(e) => setGoalInput(e.target.value)}
          />
          <button type="submit" className="px-8 py-4 bg-teal-600 text-white rounded-2xl font-black uppercase tracking-widest text-[10px] hover:bg-teal-700 transition-all shadow-xl shadow-teal-100 flex items-center gap-2">
            <Save size={16} /> Actualizar
          </button>
        </form>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        <div className="lg:col-span-1">
          <div className="bg-white p-8 rounded-[2.5rem] border border-slate-100 shadow-sm">
            <h3 className="text-xl font-black text-slate-900 mb-6 flex items-center gap-2 uppercase tracking-tight">
              {editingId ? <Edit2 size={20} className="text-teal-600" /> : <Plus size={20} className="text-teal-600" />}
              {editingId ? 'Editar Zona' : 'Añadir Zona'}
            </h3>
            <form onSubmit={handleSubmit} className="space-y-5">
              <div>
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2 block px-1">Nombre del Nodo</label>
                <input type="text" required className="w-full px-5 py-4 bg-slate-50 border border-transparent rounded-2xl text-sm font-bold focus:border-teal-500 focus:bg-white transition-all outline-none" value={form.name} onChange={e => setForm({...form, name: e.target.value})} />
              </div>
              <div>
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2 block px-1">Meta Local</label>
                <input type="number" required className="w-full px-5 py-4 bg-slate-50 border border-transparent rounded-2xl text-sm font-bold focus:border-teal-500 focus:bg-white transition-all outline-none" value={form.target} onChange={e => setForm({...form, target: Number(e.target.value)})} />
              </div>
              <button type="submit" className="w-full bg-slate-900 text-white py-5 rounded-2xl font-black uppercase tracking-widest text-[10px] hover:bg-teal-600 transition-all shadow-xl">
                {editingId ? 'Guardar Cambios' : 'Registrar Territorio'}
              </button>
            </form>
          </div>
        </div>

        <div className="lg:col-span-2">
          <div className="bg-white border border-slate-100 rounded-[3rem] overflow-hidden shadow-sm h-full">
            <div className="p-8 border-b border-slate-50 flex justify-between items-center">
              <h3 className="text-sm font-black text-slate-900 uppercase tracking-widest">Nodos Territoriales</h3>
              <span className="text-[10px] font-black text-slate-400 uppercase">{territory.length} Activos</span>
            </div>
            <div className="p-4 space-y-3">
              {territory.map(zone => (
                <div key={zone.id} className="flex items-center justify-between p-6 bg-slate-50/50 rounded-[2rem] border border-transparent hover:border-teal-100 hover:bg-teal-50/30 transition-all group">
                  <div className="flex items-center gap-5">
                    <div className="w-12 h-12 bg-white rounded-2xl flex items-center justify-center text-teal-600 border border-slate-100 shadow-sm group-hover:scale-110 transition-transform"><MapPin size={24} /></div>
                    <div>
                      <h4 className="font-black text-slate-900 uppercase text-sm">{zone.name}</h4>
                      <p className="text-[10px] font-bold text-slate-400 uppercase">Líder: {zone.leader || 'Sin asignar'}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <button onClick={() => handleEdit(zone)} className="p-3 text-slate-400 hover:text-teal-600 hover:bg-white rounded-xl transition-all"><Edit2 size={18} /></button>
                    <button onClick={() => deleteTerritoryZone(zone.id)} className="p-3 text-slate-400 hover:text-rose-500 hover:bg-white rounded-xl transition-all"><Trash2 size={18} /></button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
