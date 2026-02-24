"use client";

import React, { useState, useMemo } from 'react';
import { useSearchParams, useRouter, usePathname } from 'next/navigation';
import { useCRM, TerritoryZone } from '@/context/CRMContext';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { MapPin, Plus, Trash2, Edit2, Target, Save, RotateCcw, Search, ChevronLeft, ChevronRight, Crosshair, LayoutGrid, AlertCircle } from 'lucide-react';
import { getCoordsForLocation } from '@/utils/geo';
import { SearchableSelect } from '@/components/ui/SearchableSelect';

export default function SettingsPage() {
  const { territory, campaignGoal, addTerritoryZone, updateTerritoryZone, deleteTerritoryZone, updateCampaignGoal } = useCRM();
  const queryClient = useQueryClient();
  
  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  
  const activeTab = (searchParams.get('section') || 'territories') as 'territories' | 'stations';

  const setActiveTab = (tab: 'territories' | 'stations') => {
    const params = new URLSearchParams(searchParams.toString());
    params.set('section', tab);
    router.push(`${pathname}?${params.toString()}`, { scroll: false });
  };

  const [editingId, setEditingId] = useState<string | null>(null);
  const [goalInput, setGoalInput] = useState(campaignGoal.toString());
  const [form, setForm] = useState({ name: '', target: 0, leader: '', lat: '', lng: '' });

  // Polling Stations API Search & Pagination & Filters from URL
  const deptFilter = searchParams.get('dept') || '';
  const muniFilter = searchParams.get('muni') || '';
  const nameFilter = searchParams.get('name') || '';
  const currentStationPage = Number(searchParams.get('page')) || 1;
  const stationsPerPage = 10;

  const updateStationsParams = (updates: { dept?: string; muni?: string; name?: string; page?: number; clear?: boolean }) => {
    const params = new URLSearchParams(searchParams.toString());
    
    if (updates.clear) {
      params.delete('dept');
      params.delete('muni');
      params.delete('name');
      params.set('page', '1');
    } else {
      if (updates.dept !== undefined) {
        params.set('dept', updates.dept);
        params.delete('muni'); // Reset muni when dept changes
        params.set('page', '1'); // Reset page when filters change
      }
      if (updates.muni !== undefined) {
        params.set('muni', updates.muni);
        params.set('page', '1'); // Reset page when filters change
      }
      if (updates.name !== undefined) {
        if (updates.name) params.set('name', updates.name);
        else params.delete('name');
        params.set('page', '1');
      }
      if (updates.page !== undefined) {
        params.set('page', updates.page.toString());
      }
    }
    
    router.push(`${pathname}?${params.toString()}`, { scroll: false });
  };

  const { data: stationsData, isLoading: loadingStations, error: stationsError } = useQuery({
    queryKey: ['logistics-voting-places', deptFilter, muniFilter, nameFilter, currentStationPage],
    queryFn: async () => {
      // Usamos el proxy de Next.js para evitar CORS y problemas de puerto
      const url = new URL('/api/logistics/voting-places', window.location.origin);
      url.searchParams.append('page', currentStationPage.toString());
      url.searchParams.append('limit', stationsPerPage.toString());
      
      // Enviamos en MAYÚSCULAS para mayor compatibilidad con la DB
      if (deptFilter) url.searchParams.append('departamento', deptFilter.toUpperCase());
      if (muniFilter) url.searchParams.append('municipio', muniFilter.toUpperCase());
      if (nameFilter) url.searchParams.append('nombre', nameFilter);
      
      console.log('Fetching from URL:', url.toString());
      
      const res = await fetch(url.toString());
      if (!res.ok) throw new Error('Error al cargar puestos: ' + res.statusText);
      const json = await res.json();
      return json;
    }
  });

  const { data: deptsData } = useQuery({
    queryKey: ['voting-departments'],
    queryFn: async () => {
      const res = await fetch('/api/logistics/voting-places/departments');
      if (!res.ok) return { data: [] };
      return res.json();
    }
  });

  const { data: munisData } = useQuery({
    queryKey: ['voting-municipalities', deptFilter],
    queryFn: async () => {
      if (!deptFilter) return { data: [] };
      const res = await fetch(`/api/logistics/voting-places/municipalities?departamento=${deptFilter}`);
      if (!res.ok) return { data: [] };
      return res.json();
    },
    enabled: !!deptFilter
  });

  const departmentsList = deptsData?.data || deptsData || [];
  const municipalitiesList = munisData?.data || munisData || [];

  // Intentar obtener los items de forma ultra-segura
  const getStationsList = () => {
    if (!stationsData) return [];
    // Caso 1: { data: { items: [] } } (Interceptor + Service Paginated)
    if (stationsData.data?.items) return stationsData.data.items;
    // Caso 2: { items: [] } (Service Paginated sin Interceptor)
    if (stationsData.items) return stationsData.items;
    // Caso 3: { data: [] } (Interceptor + Service Array)
    if (Array.isArray(stationsData.data)) return stationsData.data;
    // Caso 4: [] (Service Array sin Interceptor)
    if (Array.isArray(stationsData)) return stationsData;
    return [];
  };

  const stationsList = getStationsList();
  const stationsTotal = stationsData?.data?.total ?? stationsData?.total ?? stationsList.length;
  const stationsTotalPages = stationsData?.data?.totalPages ?? stationsData?.totalPages ?? 1;

  const deleteStationMutation = useMutation({
    mutationFn: async (id: string) => {
      // Nota: El backend no tiene DELETE implementado en logistics-voting.controller.ts
      console.log('Delete station', id);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['logistics-voting-places'] });
    }
  });

  // Territory Search & Pagination State
  const [territorySearch, setTerritorySearch] = useState('');
  const [currentTerritoryPage, setCurrentTerritoryPage] = useState(1);
  const territoryItemsPerPage = 5;

  const filteredTerritory = useMemo(() => {
    return territory
      .filter(zone =>
        zone.name.toLowerCase().includes(territorySearch.toLowerCase()) ||
        (zone.leader && zone.leader.toLowerCase().includes(territorySearch.toLowerCase()))
      )
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [territory, territorySearch]);

  const totalTerritoryPages = Math.ceil(filteredTerritory.length / territoryItemsPerPage);
  const paginatedTerritory = filteredTerritory.slice(
    (currentTerritoryPage - 1) * territoryItemsPerPage,
    currentTerritoryPage * territoryItemsPerPage
  );

  const handleAutoGeocode = () => {
    if (!form.name) return;
    const coords = getCoordsForLocation(form.name);
    if (coords) {
      setForm(prev => ({
        ...prev,
        lat: coords.lat.toString(),
        lng: coords.lng.toString()
      }));
    }
  };

  const handleUpdateGoal = (_e: React.FormEvent) => {
    _e.preventDefault();
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
    // Scroll to form on mobile
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  return (
    <div className="space-y-8 animate-in fade-in duration-700">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-end gap-6">
        <div>
          <h1 className="text-3xl font-black text-slate-900 tracking-tighter uppercase">Configuración Estratégica</h1>
          <p className="text-slate-500 font-medium">Administra territorios, metas y puestos de votación.</p>
        </div>

        <div className="flex p-1 bg-slate-100 rounded-2xl">
          <button
            onClick={() => setActiveTab('territories')}
            className={`px-6 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${activeTab === 'territories' ? 'bg-white text-teal-600 shadow-sm' : 'text-slate-400 hover:text-slate-600'}`}
          >
            Territorios
          </button>
          <button
            onClick={() => setActiveTab('stations')}
            className={`px-6 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${activeTab === 'stations' ? 'bg-white text-teal-600 shadow-sm' : 'text-slate-400 hover:text-slate-600'}`}
          >
            Puestos de Votación
          </button>
        </div>
      </div>

      {activeTab === 'territories' ? (
        <section id="territories" className="space-y-8">
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
                onChange={(_e) => setGoalInput(_e.target.value)}
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
                  <div>
                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2 block px-1">Líder Asignado</label>
                    <input type="text" placeholder="Nombre del líder" className="w-full px-5 py-4 bg-slate-50 border-2 border-transparent rounded-2xl text-sm font-bold focus:border-teal-500 focus:bg-white transition-all outline-none" value={form.leader} onChange={e => setForm({...form, leader: e.target.value})} />
                  </div>

                  <div className="pt-2 border-t border-slate-50">
                    <div className="flex justify-between items-center mb-2 px-1">
                      <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Coordenadas (Mapa)</label>
                      <button
                        type="button"
                        onClick={handleAutoGeocode}
                        className="flex items-center gap-1 text-[9px] font-black text-teal-600 uppercase hover:text-teal-700 transition-colors"
                      >
                        <Crosshair size={10} /> Auto-Georeferenciar
                      </button>
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <input
                        type="text"
                        placeholder="Latitud"
                        className="w-full px-5 py-3 bg-slate-50 border-2 border-transparent rounded-xl text-xs font-bold focus:border-teal-500 focus:bg-white transition-all outline-none"
                        value={form.lat}
                        onChange={e => setForm({...form, lat: e.target.value})}
                      />
                      <input
                        type="text"
                        placeholder="Longitud"
                        className="w-full px-5 py-3 bg-slate-50 border-2 border-transparent rounded-xl text-xs font-bold focus:border-teal-500 focus:bg-white transition-all outline-none"
                        value={form.lng}
                        onChange={e => setForm({...form, lng: e.target.value})}
                      />
                    </div>
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

            {/* Lista de Nodos */}
            <div className="lg:col-span-2">
              <div className="bg-white border-2 border-slate-100 rounded-[3rem] overflow-hidden shadow-sm h-full flex flex-col">
                <div className="p-8 border-b border-slate-50 flex flex-col md:flex-row justify-between items-center gap-4">
                  <div className="flex items-center gap-3">
                    <h3 className="text-sm font-black text-slate-900 uppercase tracking-widest">Nodos Territoriales</h3>
                    <span className="bg-slate-100 px-3 py-1 rounded-full text-[10px] font-black text-slate-400">{territory.length}</span>
                  </div>

                  <div className="flex items-center gap-3 w-full md:w-auto">
                    <button onClick={() => window.location.reload()} className="p-2.5 bg-teal-50 text-teal-600 rounded-xl hover:bg-teal-600 hover:text-white transition-all shadow-sm group">
                      <RotateCcw size={18} className="group-active:rotate-180 transition-transform duration-500" />
                    </button>

                    <div className="relative flex-1 md:w-64">
                      <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={14} />
                      <input
                        type="text"
                        placeholder="Buscar zona o líder..."
                        className="w-full pl-10 pr-4 py-2.5 bg-slate-50 border-2 border-transparent rounded-xl text-[11px] font-bold focus:border-teal-500 focus:bg-white outline-none transition-all"
                        value={territorySearch}
                        onChange={(e) => { setTerritorySearch(e.target.value); setCurrentTerritoryPage(1); }}
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
                </div>

                {totalTerritoryPages > 1 && (
                  <div className="p-6 border-t border-slate-50 bg-slate-50/30 flex items-center justify-between">
                    <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">
                      Página <span className="text-teal-600">{currentTerritoryPage}</span> de {totalTerritoryPages}
                    </p>
                    <div className="flex gap-2">
                      <button disabled={currentTerritoryPage === 1} onClick={() => setCurrentTerritoryPage(p => p - 1)} className="p-2.5 rounded-xl bg-white border border-slate-200 text-slate-400 hover:text-teal-600 disabled:opacity-30 transition-all"><ChevronLeft size={18} /></button>
                      <button disabled={currentTerritoryPage === totalTerritoryPages} onClick={() => setCurrentTerritoryPage(p => p + 1)} className="p-2.5 rounded-xl bg-white border border-slate-200 text-slate-400 hover:text-teal-600 disabled:opacity-30 transition-all"><ChevronRight size={18} /></button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        </section>
      ) : (
        <section id="stations" className="space-y-8 animate-in slide-in-from-right-4 duration-500">
          {/* Listado de Puestos */}
          <div className="bg-white border-2 border-slate-100 rounded-[3.5rem] overflow-hidden shadow-sm">
            <div className="p-8 border-b border-slate-50 flex flex-col md:flex-row justify-between items-center gap-6">
              <div className="flex items-center gap-4">
                <div className="p-3 bg-teal-50 text-teal-600 rounded-2xl">
                  <LayoutGrid size={20} />
                </div>
                <div>
                  <h3 className="text-sm font-black text-slate-900 uppercase tracking-widest">Puestos de Votación</h3>
                  <p className="text-[10px] font-bold text-slate-400 uppercase">{stationsTotal} Registros en Base de Datos</p>
                </div>
              </div>

              <div className="flex flex-col md:flex-row items-center gap-4 w-full md:w-auto">
                {/* Búsqueda por Nombre */}
                <div className="relative w-full md:w-64">
                  <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={14} />
                  <input
                    type="text"
                    placeholder="Buscar por nombre..."
                    className="w-full pl-10 pr-4 py-2.5 bg-slate-50 border-2 border-transparent rounded-xl text-[11px] font-bold focus:border-teal-500 focus:bg-white outline-none transition-all"
                    value={nameFilter}
                    onChange={(e) => updateStationsParams({ name: e.target.value })}
                  />
                </div>

                {/* Filtro Departamento */}
                <div className="w-full md:w-56">
                  <SearchableSelect
                    options={departmentsList}
                    value={deptFilter}
                    onChange={(val) => updateStationsParams({ dept: val })}
                    placeholder="Departamento..."
                  />
                </div>

                {/* Filtro Municipio */}
                <div className="w-full md:w-56">
                  <SearchableSelect
                    options={municipalitiesList}
                    value={muniFilter}
                    onChange={(val) => updateStationsParams({ muni: val })}
                    placeholder="Municipio..."
                    disabled={!deptFilter}
                  />
                </div>

                <div className="flex gap-2">
                  <button 
                    onClick={() => updateStationsParams({ clear: true })}
                    className="p-2.5 bg-rose-50 text-rose-600 rounded-xl hover:bg-rose-600 hover:text-white transition-all shadow-sm"
                    title="Limpiar Filtros"
                  >
                    <Trash2 size={18} />
                  </button>

                  <button 
                    onClick={() => queryClient.invalidateQueries({ queryKey: ['logistics-voting-places'] })}
                    className="p-2.5 bg-slate-100 text-slate-600 rounded-xl hover:bg-teal-600 hover:text-white transition-all shadow-sm"
                    title="Sincronizar"
                  >
                    <RotateCcw size={18} />
                  </button>
                </div>
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-slate-50/50">
                    <th className="px-8 py-5 text-[10px] font-black text-slate-400 uppercase tracking-widest">Nombre</th>
                    <th className="px-8 py-5 text-[10px] font-black text-slate-400 uppercase tracking-widest">Departamento</th>
                    <th className="px-8 py-5 text-[10px] font-black text-slate-400 uppercase tracking-widest">Municipio</th>
                    <th className="px-8 py-5 text-[10px] font-black text-slate-400 uppercase tracking-widest">Dirección</th>
                    <th className="px-8 py-5 text-[10px] font-black text-slate-400 uppercase tracking-widest text-center">Mesas</th>
                    <th className="px-8 py-5 text-[10px] font-black text-slate-400 uppercase tracking-widest text-right">Acciones</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                  {stationsList.map((station: any) => (
                    <tr key={station.id} className="hover:bg-slate-50/30 transition-colors group">
                      <td className="px-8 py-5 font-bold text-slate-700 text-xs uppercase">
                        {station.nombre || station.puesto}
                      </td>
                      <td className="px-8 py-5 font-bold text-slate-500 text-[10px] uppercase">{station.departamento}</td>
                      <td className="px-8 py-5 font-bold text-slate-500 text-[10px] uppercase">{station.municipio}</td>
                      <td className="px-8 py-5">
                        <a 
                          href={station.latitud && station.longitud 
                            ? `https://www.google.com/maps/search/?api=1&query=${station.latitud},${station.longitud}`
                            : `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${station.nombre}, ${station.direccion}, ${station.municipio}, ${station.departamento}, Colombia`)}`
                          }
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-slate-400 text-[10px] hover:text-teal-600 hover:underline flex items-center gap-1 transition-colors"
                        >
                          <MapPin size={10} className="shrink-0" />
                          {station.direccion}
                        </a>
                      </td>
                      <td className="px-8 py-5 text-center font-black text-slate-900 text-sm">{station.totalMesas || 0}</td>
                      <td className="px-8 py-5 text-right">
                        <button 
                          onClick={() => deleteStationMutation.mutate(station.id)}
                          className="p-2.5 text-slate-200 hover:text-rose-500 hover:bg-rose-50 rounded-xl transition-all"
                        >
                          <Trash2 size={16} />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>

              {loadingStations ? (
                <div className="py-20 flex flex-col items-center justify-center text-teal-600">
                  <div className="w-8 h-8 border-4 border-teal-600 border-t-transparent rounded-full animate-spin mb-4"></div>
                  <p className="text-[10px] font-black uppercase tracking-widest">Consultando API...</p>
                </div>
              ) : stationsError ? (
                <div className="py-20 flex flex-col items-center justify-center text-rose-500">
                  <AlertCircle size={48} className="opacity-20 mb-4" />
                  <p className="text-xs font-black uppercase tracking-widest">Error: {(stationsError as any).message}</p>
                </div>
              ) : stationsList.length === 0 && (
                <div className="py-20 flex flex-col items-center justify-center text-slate-300">
                  <MapPin size={48} className="opacity-10 mb-4" />
                  <p className="text-xs font-black uppercase tracking-widest">No hay puestos registrados</p>
                </div>
              )}
            </div>

            {stationsTotalPages > 1 && (
              <div className="p-8 bg-slate-50/30 border-t border-slate-50 flex items-center justify-between">
                <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">
                  Página <span className="text-teal-600">{currentStationPage}</span> de {stationsTotalPages}
                </p>
                <div className="flex gap-2">
                  <button
                    disabled={currentStationPage === 1}
                    onClick={() => updateStationsParams({ page: currentStationPage - 1 })}
                    className="p-3 bg-white border-2 border-slate-100 rounded-xl text-slate-400 hover:text-teal-600 disabled:opacity-30 transition-all shadow-sm"
                  >
                    <ChevronLeft size={18} />
                  </button>
                  <button
                    disabled={currentStationPage === stationsTotalPages}
                    onClick={() => updateStationsParams({ page: currentStationPage + 1 })}
                    className="p-3 bg-white border-2 border-slate-100 rounded-xl text-slate-400 hover:text-teal-600 disabled:opacity-30 transition-all shadow-sm"
                  >
                    <ChevronRight size={18} />
                  </button>
                </div>
              </div>
            )}
          </div>
        </section>
      )}
    </div>
  );
}
