"use client";

import React, { useState, useMemo } from 'react';
import { useCRM, TerritoryZone } from '@/context/CRMContext';
import { MapPin, Plus, Trash2, Globe, Search, Edit2, X, Target, Save, ChevronLeft, ChevronRight } from 'lucide-react';

export default function SettingsPage() {
  const { territory, team, campaignGoal, addTerritoryZone, updateTerritoryZone, deleteTerritoryZone, updateCampaignGoal } = useCRM();
  const [editingId, setEditingId] = useState<string | null>(null);
  const [leaderSearch, setLeaderSearch] = useState('');
  const [showLeaderDropdown, setShowLeaderDropdown] = useState(false);
  const [goalInput, setGoalInput] = useState(campaignGoal.toString());

  // Pagination State
  const [currentPage, setCurrentPage] = useState(1);
  const [zoneSearch, setZoneSearch] = useState('');
  const itemsPerPage = 4;

  const filteredTerritory = useMemo(() => {
    return territory.filter(zone => 
      zone.name.toLowerCase().includes(zoneSearch.toLowerCase()) ||
      zone.leader.toLowerCase().includes(zoneSearch.toLowerCase())
    );
  }, [territory, zoneSearch]);

  const totalPages = Math.ceil(filteredTerritory.length / itemsPerPage);

  const paginatedTerritory = useMemo(() => {
    const startIndex = (currentPage - 1) * itemsPerPage;
    return filteredTerritory.slice(startIndex, startIndex + itemsPerPage);
  }, [filteredTerritory, currentPage]);

  // Reset to page 1 when searching
  React.useEffect(() => {
    setCurrentPage(1);
  }, [zoneSearch]);

  // Handle page reset if items are deleted and page becomes empty
  React.useEffect(() => {
    if (currentPage > totalPages && totalPages > 0) {
      setCurrentPage(totalPages);
    }
  }, [filteredTerritory.length, totalPages, currentPage]);

  const [form, setForm] = useState({
    name: '',
    target: 0,
    leader: '',
    lat: '',
    lng: ''
  });

  const handleUpdateGoal = (e: React.FormEvent) => {
    e.preventDefault();
    updateCampaignGoal(Number(goalInput));
  };

  const filteredTeam = useMemo(() => {
    return team.filter(member => 
      member.name.toLowerCase().includes(leaderSearch.toLowerCase())
    );
  }, [team, leaderSearch]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name || !form.lat || !form.lng) return;

    const zoneData = {
      name: form.name,
      target: Number(form.target),
      leader: form.leader,
      lat: Number(form.lat),
      lng: Number(form.lng)
    };

    if (editingId) {
      updateTerritoryZone(editingId, zoneData);
      setEditingId(null);
    } else {
      addTerritoryZone(zoneData);
    }

    setForm({ name: '', target: 0, leader: '', lat: '', lng: '' });
    setLeaderSearch('');
  };

  const handleEdit = (zone: TerritoryZone) => {
    setEditingId(zone.id);
    setForm({
      name: zone.name,
      target: zone.target,
      leader: zone.leader,
      lat: zone.lat?.toString() || '',
      lng: zone.lng?.toString() || ''
    });
    setLeaderSearch(zone.leader);
  };

  const cancelEdit = () => {
    setEditingId(null);
    setForm({ name: '', target: 0, leader: '', lat: '', lng: '' });
    setLeaderSearch('');
  };

  return (
    <div className="space-y-8 animate-in fade-in duration-500">
      <div>
        <h1 className="text-3xl font-black text-slate-900 tracking-tighter">Configuración de Territorio</h1>
        <p className="text-slate-500">Administra las zonas y asignación de líderes.</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Meta Global */}
        <div className="lg:col-span-3">
          <div className="bg-[#111827] text-white p-8 rounded-[2.5rem] shadow-xl border-b-4 border-blue-600 flex flex-col md:flex-row justify-between items-center gap-8">
            <div className="space-y-2">
              <div className="flex items-center gap-3">
                <Target className="text-blue-500" size={24} />
                <h2 className="text-2xl font-black tracking-tighter uppercase">Meta Global de Campaña</h2>
              </div>
              <p className="text-slate-400 text-xs font-bold uppercase tracking-widest">Establece el objetivo de votos fidelizados para la victoria.</p>
            </div>
            
            <form onSubmit={handleUpdateGoal} className="flex gap-4 w-full md:w-auto">
              <input 
                type="number"
                className="px-6 py-4 bg-white/10 border-2 border-white/10 rounded-2xl text-xl font-black focus:border-blue-500 outline-none transition-all w-full md:w-48 text-center"
                value={goalInput}
                onChange={(e) => setGoalInput(e.target.value)}
              />
              <button 
                type="submit"
                className="px-8 py-4 bg-blue-600 text-white rounded-2xl font-black uppercase tracking-widest text-xs hover:bg-blue-700 transition-all flex items-center gap-2 shadow-lg shadow-blue-900/20"
              >
                <Save size={16} /> Actualizar
              </button>
            </form>
          </div>
        </div>

        {/* Formulario */}
        <div className="lg:col-span-1">
          <div className="bg-white p-8 rounded-[2.5rem] border border-slate-100 shadow-sm sticky top-8">
            <div className="flex items-center justify-between mb-6">
              <div className="flex items-center gap-3">
                <div className="p-3 bg-blue-50 text-blue-600 rounded-2xl">
                  {editingId ? <Edit2 size={24} /> : <MapPin size={24} />}
                </div>
                <h2 className="text-xl font-black text-slate-900">
                  {editingId ? 'Editar Zona' : 'Agregar Zona'}
                </h2>
              </div>
              {editingId && (
                <button onClick={cancelEdit} className="p-2 text-slate-400 hover:text-slate-600">
                  <X size={20} />
                </button>
              )}
            </div>

            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1 block">Nombre de la Zona</label>
                <input
                  type="text"
                  required
                  placeholder="Ej: Comuna 13"
                  className="w-full px-4 py-3 rounded-xl border border-slate-100 focus:border-blue-500 focus:ring-4 focus:ring-blue-500/10 outline-none transition-all"
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                />
              </div>

              <div>
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1 block">Meta de Votos</label>
                <input
                  type="number"
                  required
                  className="w-full px-4 py-3 rounded-xl border border-slate-100 focus:border-blue-500 focus:ring-4 focus:ring-blue-500/10 outline-none transition-all"
                  value={form.target}
                  onChange={(e) => setForm({ ...form, target: Number(e.target.value) })}
                />
              </div>

              <div className="relative">
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1 block">Líder Encargado</label>
                <div className="relative">
                  <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
                  <input
                    type="text"
                    required
                    placeholder="Buscar líder del equipo..."
                    className="w-full pl-11 pr-4 py-3 rounded-xl border border-slate-100 focus:border-blue-500 focus:ring-4 focus:ring-blue-500/10 outline-none transition-all"
                    value={leaderSearch}
                    onChange={(e) => {
                      setLeaderSearch(e.target.value);
                      setShowLeaderDropdown(true);
                    }}
                    onFocus={() => setShowLeaderDropdown(true)}
                  />
                </div>
                
                {showLeaderDropdown && (
                  <div className="absolute z-50 w-full mt-2 bg-white rounded-2xl border border-slate-100 shadow-2xl overflow-hidden animate-in slide-in-from-top-2 duration-200">
                    <div className="max-h-48 overflow-y-auto">
                      {filteredTeam.length > 0 ? (
                        filteredTeam.map(member => (
                          <button
                            key={member.id}
                            type="button"
                            className="w-full px-4 py-3 text-left text-sm hover:bg-blue-50 hover:text-blue-600 transition-all flex items-center justify-between group"
                            onClick={() => {
                              setForm({ ...form, leader: member.name });
                              setLeaderSearch(member.name);
                              setShowLeaderDropdown(false);
                            }}
                          >
                            <span className="font-bold">{member.name}</span>
                            <span className="text-[10px] font-black text-slate-400 group-hover:text-blue-400 uppercase">{member.role}</span>
                          </button>
                        ))
                      ) : (
                        <div className="px-4 py-3 text-xs text-slate-400 font-bold italic">
                          No se encontraron miembros. Crea uno en Organización.
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1 block">Latitud</label>
                  <input
                    type="text"
                    required
                    placeholder="6.2442"
                    className="w-full px-4 py-3 rounded-xl border border-slate-100 focus:border-blue-500 focus:ring-4 focus:ring-blue-500/10 outline-none transition-all"
                    value={form.lat}
                    onChange={(e) => setForm({ ...form, lat: e.target.value })}
                  />
                </div>
                <div>
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1 block">Longitud</label>
                  <input
                    type="text"
                    required
                    placeholder="-75.5812"
                    className="w-full px-4 py-3 rounded-xl border border-slate-100 focus:border-blue-500 focus:ring-4 focus:ring-blue-500/10 outline-none transition-all"
                    value={form.lng}
                    onChange={(e) => setForm({ ...form, lng: e.target.value })}
                  />
                </div>
              </div>

              <button
                type="submit"
                className="w-full bg-[#111827] text-white py-4 rounded-2xl font-black uppercase tracking-widest text-xs hover:bg-blue-600 transition-all flex items-center justify-center gap-2 mt-4 shadow-lg shadow-zinc-200"
              >
                {editingId ? <><Edit2 size={16} /> Actualizar Zona</> : <><Plus size={16} /> Guardar Zona</>}
              </button>
            </form>
          </div>
        </div>

        {/* Listado */}
        <div className="lg:col-span-2">
          <div className="bg-white p-8 rounded-[2.5rem] border border-slate-100 shadow-sm flex flex-col h-full">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-8">
              <div className="flex items-center gap-3">
                <div className="p-3 bg-slate-100 text-slate-600 rounded-2xl">
                  <Globe size={24} />
                </div>
                <h2 className="text-xl font-black text-slate-900">Zonas Registradas</h2>
              </div>
              
              <div className="flex items-center gap-4 flex-1 md:justify-end">
                <div className="relative flex-1 max-w-xs">
                  <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
                  <input
                    type="text"
                    placeholder="Buscar zona o líder..."
                    className="w-full pl-11 pr-4 py-2 text-sm rounded-xl border border-slate-100 focus:border-blue-500 focus:ring-4 focus:ring-blue-500/10 outline-none transition-all"
                    value={zoneSearch}
                    onChange={(e) => setZoneSearch(e.target.value)}
                  />
                </div>
                <span className="text-xs font-black bg-slate-100 px-4 py-2 rounded-full text-slate-600 uppercase tracking-widest whitespace-nowrap">
                  {filteredTerritory.length} {zoneSearch ? 'Resultados' : 'Activas'}
                </span>
              </div>
            </div>

            <div className="space-y-3 flex-1 min-h-[290px]">
              {filteredTerritory.length === 0 ? (
                <div className="text-center py-12 border-2 border-dashed border-slate-100 rounded-[2rem]">
                  <p className="text-slate-400 font-bold italic text-sm">
                    {zoneSearch 
                      ? `No se encontraron resultados para "${zoneSearch}"`
                      : 'No hay zonas configuradas. Usa el formulario de la izquierda.'}
                  </p>
                </div>
              ) : (
                paginatedTerritory.map((zone) => (
                  <div key={zone.id} className="flex items-center justify-between p-5 rounded-[1.5rem] border border-slate-50 hover:border-blue-100 hover:bg-blue-50/10 transition-all group animate-in fade-in zoom-in-95 duration-300">
                    <div className="flex items-center gap-4">
                      <div className="h-12 w-12 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center shadow-inner">
                        <MapPin size={20} />
                      </div>
                      <div>
                        <h4 className="font-black text-slate-900">{zone.name}</h4>
                        <p className="text-[10px] text-slate-500 font-bold uppercase tracking-tighter">
                          GPS: {zone.lat}, {zone.lng} • LÍDER: {zone.leader}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <button 
                        onClick={() => handleEdit(zone)}
                        className="p-3 text-zinc-400 hover:text-blue-600 hover:bg-blue-50 rounded-xl transition-all"
                      >
                        <Edit2 size={18} />
                      </button>
                      <button 
                        onClick={() => deleteTerritoryZone(zone.id)}
                        className="p-3 text-zinc-400 hover:text-red-500 hover:bg-red-50 rounded-xl transition-all"
                      >
                        <Trash2 size={18} />
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>

            {/* Paginación */}
            {totalPages > 1 && (
              <div className="flex items-center justify-end gap-4 border-t border-slate-50">
                <p className="text-xs font-bold text-slate-400 uppercase tracking-widest">
                  Página {currentPage} de {totalPages}
                </p>
                <div className="flex gap-2">
                  <button
                    onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
                    disabled={currentPage === 1}
                    className="p-2 rounded-xl border border-slate-100 text-slate-400 hover:text-blue-600 hover:bg-blue-50 disabled:opacity-30 disabled:hover:bg-transparent transition-all"
                  >
                    <ChevronLeft size={20} />
                  </button>
                  <button
                    onClick={() => setCurrentPage(prev => Math.min(totalPages, prev + 1))}
                    disabled={currentPage === totalPages}
                    className="p-2 rounded-xl border border-slate-100 text-slate-400 hover:text-blue-600 hover:bg-blue-50 disabled:opacity-30 disabled:hover:bg-transparent transition-all"
                  >
                    <ChevronRight size={20} />
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
