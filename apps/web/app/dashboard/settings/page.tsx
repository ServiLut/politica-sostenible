"use client";

import React, { useState, useMemo, useEffect } from 'react';
import { useCRM, TerritoryZone } from '@/context/CRMContext';
import { MapPin, Plus, Trash2, Globe, Search, Edit2, X, Target, Save, ChevronLeft, ChevronRight, RotateCcw } from 'lucide-react';
import { cn } from '@/components/ui/utils';

export default function SettingsPage() {
  const { territory, team, campaignGoal, addTerritoryZone, updateTerritoryZone, deleteTerritoryZone, updateCampaignGoal } = useCRM();
  const [editingId, setEditingId] = useState<string | null>(null);
  const [leaderSearch, setLeaderSearch] = useState('');
  const [goalInput, setGoalInput] = useState(campaignGoal.toString());

  const [currentPage, setCurrentPage] = useState(1);
  const [zoneSearch, setZoneSearch] = useState('');
  const itemsPerPage = 4;

  const filteredTerritory = useMemo(() => {
    return territory.filter(zone => 
      zone.name.toLowerCase().includes(zoneSearch.toLowerCase()) ||
      (zone.leader || '').toLowerCase().includes(zoneSearch.toLowerCase())
    );
  }, [territory, zoneSearch]);

  const totalPages = Math.max(1, Math.ceil(filteredTerritory.length / itemsPerPage));
  
  // Reset page when searching
  useEffect(() => {
    setCurrentPage(1);
  }, [zoneSearch]);

  const paginatedTerritory = useMemo(() => {
    const start = (currentPage - 1) * itemsPerPage;
    return filteredTerritory.slice(start, start + itemsPerPage);
  }, [filteredTerritory, currentPage]);

  const [form, setForm] = useState({ name: '', target: 0, leader: '', lat: '', lng: '' });

  const handleUpdateGoal = (e: React.FormEvent) => {
    e.preventDefault();
    updateCampaignGoal(Number(goalInput));
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const zoneData = { name: form.name, target: Number(form.target), leader: form.leader, lat: Number(form.lat), lng: Number(form.lng) };
    if (editingId) { 
      updateTerritoryZone(editingId, zoneData); 
      setEditingId(null); 
    } else { 
      addTerritoryZone(zoneData); 
    }
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
    // Scroll to form on mobile
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  return (
    <div className="space-y-8 animate-in fade-in duration-700">
      <div>
        <h1 className="text-3xl font-black text-slate-900 tracking-tighter uppercase">Configuración de Territorio</h1>
        <p className="text-slate-500 font-medium">Administra las zonas y asignación estratégica de líderes.</p>
      </div>

      {/* Meta Global */}
      <div className="bg-teal-50/30 p-10 rounded-[3rem] border-2 border-teal-100 shadow-sm flex flex-col md:flex-row justify-between items-center gap-8 relative overflow-hidden group hover:bg-white hover:border-teal-500 transition-all duration-500">
        <div className="absolute top-0 left-0 w-1.5 h-full bg-teal-600" />
        <div className="space-y-2 relative z-10">
          <div className="flex items-center gap-3">
            <div className="p-3 bg-white text-teal-600 rounded-2xl shadow-sm border border-teal-50 group-hover:bg-teal-600 group-hover:text-white transition-all"><Target size={24} /></div>
            <h2 className="text-2xl font-black text-slate-900 tracking-tighter uppercase">Meta Global de Votos</h2>
          </div>
          <p className="text-slate-400 text-[10px] font-black uppercase tracking-widest px-1">Objetivo estratégico para la victoria electoral.</p>
        </div>
        
        <form onSubmit={handleUpdateGoal} className="flex gap-4 w-full md:w-auto relative z-10">
          <input 
            type="number"
            className="px-6 py-4 bg-white border-2 border-teal-100 rounded-2xl text-2xl font-black text-slate-900 focus:border-teal-500 focus:ring-4 focus:ring-teal-500/5 outline-none transition-all w-full md:w-48 text-center"
            value={goalInput}
            onChange={(e) => setGoalInput(e.target.value)}
          />
          <button type="submit" className="px-8 py-4 bg-teal-600 text-white rounded-2xl font-black uppercase tracking-widest text-[10px] hover:bg-teal-700 transition-all shadow-xl shadow-teal-100 flex items-center gap-2">
            <Save size={16} /> Actualizar
          </button>
        </form>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Formulario Lateral */}
        <div className="lg:col-span-1">
          <div className="bg-white p-8 rounded-[2.5rem] border-2 border-slate-100 shadow-sm group hover:border-teal-500/30 transition-all">
            <h3 className="text-xl font-black text-slate-900 mb-6 flex items-center gap-2 uppercase tracking-tight">
              {editingId ? <Edit2 size={20} className="text-teal-600" /> : <Plus size={20} className="text-teal-600" />}
              {editingId ? 'Editar Zona' : 'Añadir Zona'}
            </h3>
            <form onSubmit={handleSubmit} className="space-y-5">
              <div>
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2 block px-1">Nombre del Nodo</label>
                <input type="text" required placeholder="Ej: Comuna 13" className="w-full px-5 py-4 bg-slate-50 border-2 border-transparent rounded-2xl text-sm font-bold focus:border-teal-500 focus:bg-white transition-all outline-none" value={form.name} onChange={e => setForm({...form, name: e.target.value})} />
              </div>
              <div>
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2 block px-1">Meta Local</label>
                <input type="number" required className="w-full px-5 py-4 bg-slate-50 border-2 border-transparent rounded-2xl text-sm font-bold focus:border-teal-500 focus:bg-white transition-all outline-none" value={form.target} onChange={e => setForm({...form, target: Number(e.target.value)})} />
              </div>
              <button type="submit" className="w-full bg-teal-600 text-white py-5 rounded-2xl font-black uppercase tracking-widest text-[10px] hover:bg-teal-700 transition-all shadow-xl shadow-teal-100">
                {editingId ? 'Guardar Cambios' : 'Registrar Territorio'}
              </button>
              {editingId && (
                <button type="button" onClick={() => { setEditingId(null); setForm({ name: '', target: 0, leader: '', lat: '', lng: '' }); }} className="w-full py-3 text-[10px] font-black uppercase text-slate-400 hover:text-slate-600 transition-colors">Cancelar Edición</button>
              )}
            </form>
          </div>
        </div>

        {/* Lista de Nodos con Paginación */}
        <div className="lg:col-span-2">
          <div className="bg-white border-2 border-slate-100 rounded-[3rem] overflow-hidden shadow-sm h-full flex flex-col">
            <div className="p-8 border-b border-slate-50 flex flex-col md:flex-row justify-between items-center gap-4">
              <div className="flex items-center gap-3">
                <h3 className="text-sm font-black text-slate-900 uppercase tracking-widest">Nodos Territoriales</h3>
                <span className="bg-slate-100 px-3 py-1 rounded-full text-[10px] font-black text-slate-400">{filteredTerritory.length}</span>
              </div>
              
              <div className="flex items-center gap-3 w-full md:w-auto">
                {/* Botón de Sincronización/Recuperación */}
                <button 
                  onClick={() => window.location.reload()} 
                  className="p-2.5 bg-teal-50 text-teal-600 rounded-xl hover:bg-teal-600 hover:text-white transition-all shadow-sm group relative"
                  title="Sincronizar con Catastro (Recuperar zonas borradas)"
                >
                  <RotateCcw size={18} className="group-active:rotate-180 transition-transform duration-500" />
                </button>

                {/* Barra de Búsqueda de Nodos */}
                <div className="relative flex-1 md:w-64">
                  <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={14} />
                  <input 
                    type="text" 
                    placeholder="Buscar zona o líder..." 
                    className="w-full pl-10 pr-4 py-2.5 bg-slate-50 border-2 border-transparent rounded-xl text-[11px] font-bold focus:border-teal-500 focus:bg-white outline-none transition-all"
                    value={zoneSearch}
                    onChange={(e) => setZoneSearch(e.target.value)}
                  />
                </div>
              </div>
            </div>

            <div className="p-4 space-y-3 flex-1">
              {paginatedTerritory.map(zone => (
                <div key={zone.id} className="flex items-center justify-between p-6 bg-slate-50/50 rounded-[2rem] border-2 border-transparent hover:border-teal-100 hover:bg-teal-50/30 transition-all group">
                  <div className="flex items-center gap-5">
                    <div className="w-12 h-12 bg-white rounded-2xl flex items-center justify-center text-teal-600 border border-slate-100 shadow-sm group-hover:bg-teal-600 group-hover:text-white transition-all"><MapPin size={24} /></div>
                    <div>
                      <h4 className="font-black text-slate-900 uppercase text-sm">{zone.name}</h4>
                      <p className="text-[10px] font-bold text-slate-400 uppercase tracking-tight">Líder: <span className="text-teal-600/70">{zone.leader || 'Sin asignar'}</span></p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <button onClick={() => handleEdit(zone)} className="p-3 text-slate-400 hover:text-teal-600 hover:bg-white rounded-xl transition-all shadow-sm hover:shadow-md"><Edit2 size={18} /></button>
                    <button onClick={() => deleteTerritoryZone(zone.id)} className="p-3 text-slate-400 hover:text-rose-500 hover:bg-white rounded-xl transition-all shadow-sm hover:shadow-md"><Trash2 size={18} /></button>
                  </div>
                </div>
              ))}

              {filteredTerritory.length === 0 && (
                <div className="flex flex-col items-center justify-center py-20 text-slate-300">
                  <Search size={48} className="opacity-10 mb-4" />
                  <p className="text-xs font-black uppercase tracking-widest">No se encontraron resultados</p>
                </div>
              )}
            </div>

            {/* Controles de Paginación */}
            {totalPages > 1 && (
              <div className="p-6 border-t border-slate-50 bg-slate-50/30 flex items-center justify-between">
                <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">
                  Página <span className="text-teal-600">{currentPage}</span> de {totalPages}
                </p>
                <div className="flex gap-2">
                  <button 
                    disabled={currentPage === 1}
                    onClick={() => setCurrentPage(prev => prev - 1)}
                    className="p-2.5 rounded-xl bg-white border border-slate-200 text-slate-400 hover:text-teal-600 hover:border-teal-200 disabled:opacity-30 disabled:cursor-not-allowed transition-all shadow-sm"
                  >
                    <ChevronLeft size={18} />
                  </button>
                  <button 
                    disabled={currentPage === totalPages}
                    onClick={() => setCurrentPage(prev => prev + 1)}
                    className="p-2.5 rounded-xl bg-white border border-slate-200 text-slate-400 hover:text-teal-600 hover:border-teal-200 disabled:opacity-30 disabled:cursor-not-allowed transition-all shadow-sm"
                  >
                    <ChevronRight size={18} />
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
