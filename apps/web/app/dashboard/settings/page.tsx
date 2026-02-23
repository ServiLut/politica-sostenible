"use client";

import React, { useState, useRef } from 'react';
import { useCRM, TerritoryZone } from '@/context/CRMContext';
import { MapPin, Plus, Trash2, Edit2, Target, Save, RotateCcw, Search, ChevronLeft, ChevronRight, Crosshair, Upload, FileSpreadsheet, LayoutDashboard, Database } from 'lucide-react';
import { getCoordsForLocation } from '@/utils/geo';
import { COLOMBIA_DATA } from '@/data/divipola';

export default function SettingsPage() {
  const { territory, campaignGoal, addTerritoryZone, updateTerritoryZone, deleteTerritoryZone, updateCampaignGoal, pollingStations, importPollingStations, deletePollingStation } = useCRM();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [goalInput, setGoalInput] = useState(campaignGoal.toString());
  const [form, setForm] = useState({ name: '', target: 0, leader: '', lat: '', lng: '' });
  
  // Territory Search & Pagination State
  const [territorySearch, setTerritorySearch] = useState('');
  const [currentTerritoryPage, setCurrentTerritoryPage] = useState(1);
  const territoryItemsPerPage = 5;

  const filteredTerritory = territory.filter(zone => 
    zone.name.toLowerCase().includes(territorySearch.toLowerCase()) || 
    (zone.leader && zone.leader.toLowerCase().includes(territorySearch.toLowerCase()))
  );

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

  const handleSeedDivipola = () => {
    const allStations: any[] = [];
    COLOMBIA_DATA.forEach(dept => {
      dept.municipios.forEach(muni => {
        muni.puestos.forEach(puesto => {
          allStations.push({
            name: `${puesto.name} (${muni.name}, ${dept.name})`,
            totalTables: puesto.mesas,
            witnessesCount: 0
          });
        });
      });
    });

    if (allStations.length > 0) {
      importPollingStations(allStations);
      alert(`¡Éxito! Se han cargado ${allStations.length} puestos oficiales de la DIVIPOLA Colombia.`);
    }
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const text = event.target?.result as string;
      if (!text) return;
      
      const lines = text.split('\n').map(l => l.trim()).filter(l => l);
      if (lines.length < 2) {
        alert("El archivo está vacío o no tiene encabezados.");
        return;
      }

      // Detect separator (comma or semicolon)
      const separator = lines[0].includes(';') ? ';' : ',';

      const stationsToImport = [];
      // Skip header (line 0)
      for (let i = 1; i < lines.length; i++) {
        const columns = lines[i].split(separator);
        if (columns.length >= 2) {
          const name = columns[0].trim().replace(/^"|"$/g, '');
          const totalTables = parseInt(columns[1].trim().replace(/^"|"$/g, ''), 10);
          const witnessesCount = columns.length >= 3 ? parseInt(columns[2].trim().replace(/^"|"$/g, ''), 10) : 0;
          
          if (name && !isNaN(totalTables)) {
            stationsToImport.push({
              name,
              totalTables,
              witnessesCount: isNaN(witnessesCount) ? 0 : witnessesCount
            });
          }
        }
      }

      if (stationsToImport.length > 0) {
        importPollingStations(stationsToImport);
        alert(`¡Éxito! Se han importado ${stationsToImport.length} puestos de votación.`);
      } else {
        alert("No se encontraron datos válidos. Asegúrate de que las columnas sean: Nombre, Mesas, Testigos.");
      }
      
      // Reset input
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    };
    reader.readAsText(file);
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

        {/* Lista de Nodos con Paginación */}
        <div className="lg:col-span-2">
          <div className="bg-white border-2 border-slate-100 rounded-[3rem] overflow-hidden shadow-sm h-full flex flex-col">
            <div className="p-8 border-b border-slate-50 flex flex-col md:flex-row justify-between items-center gap-4">
              <div className="flex items-center gap-3">
                <h3 className="text-sm font-black text-slate-900 uppercase tracking-widest">Nodos Territoriales</h3>
                <span className="bg-slate-100 px-3 py-1 rounded-full text-[10px] font-black text-slate-400">{territory.length}</span>
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

              {paginatedTerritory.length === 0 && (
                <div className="flex flex-col items-center justify-center py-20 text-slate-300">
                  <Search size={48} className="opacity-10 mb-4" />
                  <p className="text-xs font-black uppercase tracking-widest">No se encontraron resultados</p>
                </div>
              )}
            </div>

            {/* Controles de Paginación */}
            {totalTerritoryPages > 1 && (
              <div className="p-6 border-t border-slate-50 bg-slate-50/30 flex items-center justify-between">
                <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">
                  Página <span className="text-teal-600">{currentTerritoryPage}</span> de {totalTerritoryPages}
                </p>
                <div className="flex gap-2">
                  <button 
                    disabled={currentTerritoryPage === 1}
                    onClick={() => setCurrentTerritoryPage(p => p - 1)}
                    className="p-2.5 rounded-xl bg-white border border-slate-200 text-slate-400 hover:text-teal-600 hover:border-teal-200 disabled:opacity-30 disabled:cursor-not-allowed transition-all shadow-sm"
                  >
                    <ChevronLeft size={18} />
                  </button>
                  <button 
                    disabled={currentTerritoryPage === totalTerritoryPages}
                    onClick={() => setCurrentTerritoryPage(p => p + 1)}
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

      {/* Puestos de Votación (Masivo) */}
      <div className="mt-16 bg-white p-8 md:p-12 rounded-[3rem] border-2 border-slate-100 shadow-sm animate-in slide-in-from-bottom-8 duration-700">
        <div className="flex flex-col md:flex-row justify-between items-center gap-6 mb-10">
          <div>
            <h2 className="text-2xl font-black text-slate-900 uppercase tracking-tighter flex items-center gap-3">
              <LayoutDashboard className="text-teal-600" /> Puestos de Votación y Mesas
            </h2>
            <p className="text-slate-500 font-medium text-sm mt-1">Importa el listado oficial (DIVIPOLA) o gestiona tus puntos electorales.</p>
          </div>
          
          <div className="flex items-center gap-4">
            <button 
              onClick={handleSeedDivipola}
              className="flex items-center gap-2 px-6 py-4 bg-slate-900 text-white rounded-2xl font-black uppercase tracking-widest text-[10px] hover:bg-teal-600 transition-all shadow-xl group"
            >
              <Database size={18} className="group-hover:rotate-12 transition-transform" /> 
              Sincronizar DIVIPOLA (Colombia)
            </button>

            <input 
              type="file" 
              accept=".csv" 
              ref={fileInputRef} 
              style={{ display: 'none' }} 
              onChange={handleFileUpload}
            />
            <button 
              onClick={() => fileInputRef.current?.click()}
              className="flex items-center gap-2 px-6 py-4 bg-teal-50 text-teal-700 rounded-2xl font-black uppercase tracking-widest text-[10px] hover:bg-teal-600 hover:text-white transition-all shadow-sm border border-teal-100 group"
            >
              <FileSpreadsheet size={18} className="group-hover:scale-110 transition-transform" /> 
              Importar CSV / Excel
            </button>
          </div>
        </div>

        {/* Info Carga Masiva */}
        {pollingStations.length === 0 && (
          <div className="bg-slate-50 rounded-3xl p-8 border-2 border-dashed border-slate-200 text-center flex flex-col items-center justify-center space-y-4">
            <div className="w-16 h-16 bg-white rounded-full flex items-center justify-center text-slate-300 border shadow-sm">
              <Upload size={24} />
            </div>
            <div>
              <p className="font-bold text-slate-600">No hay puestos registrados.</p>
              <p className="text-xs text-slate-400 mt-1">Sube un archivo Excel (guardado como .CSV) con las columnas:</p>
            </div>
            <div className="flex gap-2">
              <span className="px-3 py-1 bg-white border rounded text-xs font-black uppercase text-slate-500 tracking-widest">Nombre del Puesto</span>
              <span className="px-3 py-1 bg-white border rounded text-xs font-black uppercase text-slate-500 tracking-widest">Mesas</span>
              <span className="px-3 py-1 bg-white border rounded text-xs font-black uppercase text-slate-500 tracking-widest">Testigos Asignados</span>
            </div>
          </div>
        )}

        {/* Tabla Elegante */}
        {pollingStations.length > 0 && (
          <div className="overflow-hidden rounded-3xl border-2 border-slate-100 shadow-sm">
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-slate-50 border-b-2 border-slate-100">
                    <th className="px-6 py-4 text-[10px] font-black uppercase tracking-widest text-slate-400">Puesto de Votación</th>
                    <th className="px-6 py-4 text-[10px] font-black uppercase tracking-widest text-slate-400 text-center">Cant. Mesas</th>
                    <th className="px-6 py-4 text-[10px] font-black uppercase tracking-widest text-slate-400 text-center">Testigos</th>
                    <th className="px-6 py-4 text-[10px] font-black uppercase tracking-widest text-slate-400 text-right">Acciones</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50 bg-white">
                  {pollingStations.map((station) => (
                    <tr key={station.id} className="hover:bg-teal-50/30 transition-colors group">
                      <td className="px-6 py-5">
                        <div className="flex items-center gap-3">
                          <div className="w-8 h-8 rounded-xl bg-teal-50 text-teal-600 flex items-center justify-center border border-teal-100">
                            <MapPin size={14} />
                          </div>
                          <span className="font-black text-slate-900">{station.name}</span>
                        </div>
                      </td>
                      <td className="px-6 py-5 text-center">
                        <span className="inline-flex items-center justify-center w-8 h-8 rounded-full bg-slate-100 text-slate-600 font-bold text-xs border border-slate-200">
                          {station.totalTables}
                        </span>
                      </td>
                      <td className="px-6 py-5 text-center">
                        <span className="text-sm font-bold text-slate-500">
                          {station.witnessesCount}
                        </span>
                      </td>
                      <td className="px-6 py-5 text-right">
                        <button 
                          onClick={() => deletePollingStation(station.id)}
                          className="p-2 text-slate-300 hover:text-red-500 hover:bg-red-50 rounded-xl transition-all"
                          title="Eliminar Puesto"
                        >
                          <Trash2 size={16} />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="p-4 bg-slate-50 border-t-2 border-slate-100 text-center flex justify-between items-center px-8">
               <span className="text-[10px] font-black uppercase tracking-widest text-slate-400">Total Puestos: <span className="text-teal-600">{pollingStations.length}</span></span>
               <span className="text-[10px] font-black uppercase tracking-widest text-slate-400">Total Mesas: <span className="text-teal-600">{pollingStations.reduce((acc, curr) => acc + curr.totalTables, 0)}</span></span>
            </div>
          </div>
        )}
      </div>

    </div>
  );
}
