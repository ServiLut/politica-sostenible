'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { Save, MapPin, Network, Folder, Trash2, Edit2, User, Globe, Building2, Plus, X, Ban } from 'lucide-react';
import { toast } from 'sonner';
import { updateTerritory, updatePollingPlace } from '@/app/actions/settings';

interface Territory {
    id: string;
    name: string;
    level: string;
    parentId: string | null;
    parentName: string;
    responsibleId: string | null;
    responsibleName: string;
    childrenCount: number;
    lat: number | null;
    lng: number | null;
    children?: Territory[];
}

interface PollingPlace {
    id: string;
    name: string;
    address: string;
    territoryId: string;
}

interface UserSummary {
    id: string;
    fullName: string;
    role: string;
}

export default function TerritoryConfigPage() {
  const [activeSubTab, setActiveSubTab] = useState<'zones' | 'polling'>('zones');
  
  // State for Territories
  const [formData, setFormData] = useState({ id: '', name: '', level: 'barrio', lat: '', lng: '', parentId: '', responsibleUserId: '' });
  const [territories, setTerritories] = useState<Territory[]>([]);
  const [flatTerritories, setFlatTerritories] = useState<Territory[]>([]);
  const [users, setUsers] = useState<UserSummary[]>([]);
  const [loading, setLoading] = useState(false);
  const [isEditing, setIsEditing] = useState(false);

  // State for Polling Places
  const [pollingPlaces, setPollingPlaces] = useState<PollingPlace[]>([]);
  const [pollingForm, setPollingForm] = useState({ id: '', name: '', address: '', territoryId: '' });
  const [isEditingPolling, setIsEditingPolling] = useState(false);

  const loadData = useCallback(async () => {
    try {
        const [tRes, uRes, pRes] = await Promise.all([
            fetch('/api/territory/list'), 
            fetch('/api/users'),
            fetch('/api/polling-places/list')
        ]);
        
        if (tRes.ok) {
            const data: Territory[] = await tRes.json();
            setFlatTerritories(data);
            setTerritories(buildTree(data));
        }
        if (uRes.ok) {
            const allUsers: UserSummary[] = await uRes.json();
            setUsers(allUsers.filter(u => u.role === 'ADMIN' || u.role === 'COORDINATOR'));
        }
        if (pRes.ok) {
            const places: PollingPlace[] = await pRes.json();
            setPollingPlaces(places);
        }
    } catch(e) { console.error(e); }
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  const buildTree = (items: Territory[]) => {
      const rootItems = items.filter(i => !i.parentId);
      const findChildren = (parent: Territory): Territory => {
          const children = items.filter(i => i.parentId === parent.id);
          return { ...parent, children: children.map(findChildren) };
      };
      return rootItems.map(findChildren);
  };

  // --- TERRITORY HANDLERS ---
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    
    try {
        if (isEditing) {
            // Update via Server Action
            const res = await updateTerritory(formData.id, formData);
            if (res.success) {
                toast.success('Zona Actualizada', { description: `${formData.name} se modificó correctamente.` });
                setFormData({ id: '', name: '', level: 'barrio', lat: '', lng: '', parentId: '', responsibleUserId: '' });
                setIsEditing(false);
                loadData();
            }
        } else {
            // Create via API
            const res = await fetch('/api/territory/create', { 
                method: 'POST', 
                headers: { 'Content-Type': 'application/json' }, 
                body: JSON.stringify(formData) 
            });
            if (res.ok) {
                toast.success('Territorio Creado', { description: `${formData.name} se guardó correctamente.` });
                setFormData({ id: '', name: '', level: 'barrio', lat: '', lng: '', parentId: '', responsibleUserId: '' });
                loadData();
            } else {
                toast.error('Error al guardar zona');
            }
        }
    } catch (e: any) { 
        toast.error('Error de operación', { description: e.message });
    }
    finally { setLoading(false); }
  };

  const handleEdit = (t: Territory) => {
      setFormData({ 
          id: t.id, 
          name: t.name, 
          level: t.level, 
          lat: t.lat?.toString() || '', 
          lng: t.lng?.toString() || '', 
          parentId: t.parentId || '', 
          responsibleUserId: t.responsibleId || '' 
      });
      setIsEditing(true);
      window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleCancelEdit = () => {
      setIsEditing(false);
      setFormData({ id: '', name: '', level: 'barrio', lat: '', lng: '', parentId: '', responsibleUserId: '' });
  };

  const handleDelete = async (t: Territory) => {
      if (t.childrenCount > 0) {
          toast.error('Operación Bloqueada', { description: 'La zona tiene sub-territorios dependientes.' });
          return;
      }
      const pin = prompt(`Ingrese PIN de Admin para borrar ${t.name}:`);
      if (!pin) return;
      try {
          const res = await fetch('/api/territory/manage', { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: t.id, pin }) });
          if (res.ok) {
              toast.success('Zona Eliminada');
              loadData();
          } else {
              toast.error('PIN Incorrecto o Error');
          }
      } catch (e) { console.error(e); }
  };

  // --- POLLING PLACE HANDLERS ---
  const handlePollingSubmit = async (e: React.FormEvent) => {
      e.preventDefault();
      setLoading(true);
      try {
          if (isEditingPolling) {
              // Update via Server Action
              const res = await updatePollingPlace(pollingForm.id, pollingForm);
              if (res.success) {
                  toast.success('Puesto Actualizado', { description: `${pollingForm.name} modificado.` });
                  setPollingForm({ id: '', name: '', address: '', territoryId: '' });
                  setIsEditingPolling(false);
                  loadData();
              }
          } else {
              // Create via API
              const res = await fetch('/api/polling-places/manage', { 
                  method: 'POST', 
                  headers: { 'Content-Type': 'application/json' }, 
                  body: JSON.stringify(pollingForm) 
              });
              if (res.ok) {
                  toast.success('Puesto Creado');
                  setPollingForm({ id: '', name: '', address: '', territoryId: '' });
                  loadData(); 
              } else {
                  toast.error('Error al crear puesto');
              }
          }
      } catch (e: any) { 
          toast.error('Error de operación', { description: e.message }); 
      }
      finally { setLoading(false); }
  };

  const handleEditPolling = (p: PollingPlace) => {
      setPollingForm({
          id: p.id,
          name: p.name,
          address: p.address || '',
          territoryId: p.territoryId
      });
      setIsEditingPolling(true);
      window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleCancelPollingEdit = () => {
      setIsEditingPolling(false);
      setPollingForm({ id: '', name: '', address: '', territoryId: '' });
  };

  const handleDeletePolling = async (id: string) => {
      if (!confirm('¿Seguro que desea eliminar este puesto?')) return;
      try {
          const res = await fetch('/api/polling-places/manage', {
              method: 'DELETE',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ id })
          });
          if (res.ok) {
              toast.success('Puesto Eliminado');
              loadData();
          } else {
              toast.error('Error al eliminar');
          }
      } catch (e) { console.error(e); }
  };

  // --- RENDER HELPERS ---
  const renderRows = (nodes: Territory[], depth = 0) => {
      return nodes.map(node => (
          <React.Fragment key={node.id}>
              <tr className={`hover:bg-brand-gray-50 transition-colors border-b border-brand-gray-50 group ${isEditing && formData.id === node.id ? 'bg-blue-50/50' : ''}`}>
                  <td className="px-6 py-5">
                      <div className="flex items-center gap-3" style={{ paddingLeft: `${depth * 24}px` }}>
                          <div className={`p-2 rounded-lg ${depth === 0 ? 'bg-brand-black text-white' : 'bg-brand-gray-100 text-brand-gray-500 group-hover:bg-brand-green-100 group-hover:text-brand-green-700'} transition-colors`}>
                              {node.children && node.children.length > 0 ? <Folder className="w-4 h-4" /> : <MapPin className="w-4 h-4" />}
                          </div>
                          <span className={`text-sm ${depth === 0 ? 'font-black text-brand-black uppercase tracking-tight' : 'font-bold text-brand-gray-700'}`}>
                              {node.name}
                          </span>
                      </div>
                  </td>
                  <td className="px-6 py-5">
                      <span className="px-2.5 py-1 bg-brand-gray-100 text-brand-gray-500 rounded-lg text-[9px] font-black uppercase tracking-widest border border-brand-gray-200 group-hover:border-brand-green-200 group-hover:bg-brand-green-50 group-hover:text-brand-green-700 transition-all">
                          {node.level}
                      </span>
                  </td>
                  <td className="px-6 py-5 text-xs font-bold text-brand-gray-400 uppercase tracking-tighter">
                      {node.parentName !== '-' ? node.parentName : <span className="opacity-30 italic">Nivel Raíz</span>}
                  </td>
                  <td className="px-6 py-5">
                      <div className="flex items-center gap-2">
                          <div className="w-6 h-6 bg-brand-gray-50 rounded-full border border-brand-gray-200 flex items-center justify-center text-[9px] font-black text-brand-gray-400 uppercase">{node.responsibleName.charAt(0)}</div>
                          <span className="text-[11px] font-bold text-brand-gray-600">{node.responsibleName}</span>
                      </div>
                  </td>
                  <td className="px-6 py-5 text-right space-x-3">
                      <button onClick={() => handleEdit(node)} className="p-2 text-brand-gray-400 hover:text-brand-black transition-colors" title="Editar"><Edit2 className="w-4 h-4" /></button>
                      <button onClick={() => handleDelete(node)} className="p-2 text-brand-gray-400 hover:text-red-600 transition-colors" title="Eliminar"><Trash2 className="w-4 h-4" /></button>
                  </td>
              </tr>
              {node.children && renderRows(node.children, depth + 1)}
          </React.Fragment>
      ));
  };

  return (
    <div className="max-w-6xl mx-auto space-y-8 animate-in fade-in duration-500 pb-20">
      
      {/* HEADER & SUBTABS */}
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-6 border-b border-brand-gray-100 pb-2">
        <div>
          <h1 className="text-4xl font-black text-brand-black tracking-tighter">Arquitectura Territorial</h1>
          <p className="text-brand-gray-500 font-bold uppercase text-xs tracking-[0.2em] mt-2">Geopolítica y Estructura de Mando</p>
        </div>
        
        <div className="flex gap-2">
            <button 
                onClick={() => setActiveSubTab('zones')}
                className={`px-6 py-3 rounded-t-2xl text-xs font-black uppercase tracking-widest transition-all ${activeSubTab === 'zones' ? 'bg-brand-gray-50 text-brand-black border-2 border-b-0 border-brand-gray-100 translate-y-[2px]' : 'text-brand-gray-400 hover:text-brand-gray-600 hover:bg-gray-50'}`}
            >
                Zonas ({flatTerritories.length})
            </button>
            <button 
                onClick={() => setActiveSubTab('polling')}
                className={`px-6 py-3 rounded-t-2xl text-xs font-black uppercase tracking-widest transition-all ${activeSubTab === 'polling' ? 'bg-brand-gray-50 text-brand-black border-2 border-b-0 border-brand-gray-100 translate-y-[2px]' : 'text-brand-gray-400 hover:text-brand-gray-600 hover:bg-gray-50'}`}
            >
                Puestos ({pollingPlaces.length})
            </button>
        </div>
      </div>

      {/* CONTENT: ZONES */}
      {activeSubTab === 'zones' && (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-10 animate-in slide-in-from-left-4">
              {/* Left Form */}
              <div className="lg:col-span-4">
                  <div className={`card-friendly p-8 sticky top-6 transition-colors ${isEditing ? 'border-brand-black ring-1 ring-brand-black bg-blue-50/10' : ''}`}>
                    <h3 className="font-black text-brand-black mb-8 flex items-center gap-3 text-sm uppercase tracking-widest">
                        <div className={`p-2.5 text-white rounded-xl shadow-lg transition-colors ${isEditing ? 'bg-brand-green-600' : 'bg-brand-black'}`}>
                            {isEditing ? <Edit2 className="w-5 h-5" /> : <Save className="w-5 h-5" />}
                        </div>
                        {isEditing ? 'Editando Zona' : 'Añadir Territorio'}
                    </h3>

                    <form onSubmit={handleSubmit} className="space-y-6">
                        <div className="space-y-1.5">
                            <label className="text-[10px] font-black text-brand-gray-400 uppercase tracking-[0.15em] ml-1">Nombre Descriptivo</label>
                            <input type="text" required className="w-full p-3.5 bg-brand-gray-50 border-2 border-brand-gray-100 rounded-2xl focus:border-brand-black focus:bg-white outline-none font-bold text-sm text-brand-black transition-all" placeholder="Ej. Comuna 13" value={formData.name} onChange={e => setFormData({...formData, name: e.target.value})} />
                        </div>
                        
                        <div className="space-y-1.5">
                            <label className="text-[10px] font-black text-brand-gray-400 uppercase tracking-[0.15em] ml-1">Nivel Operativo</label>
                            <select className="w-full p-3.5 bg-brand-gray-50 border-2 border-brand-gray-100 rounded-2xl focus:border-brand-black focus:bg-white outline-none font-bold text-sm text-brand-black" value={formData.level} onChange={e => setFormData({...formData, level: e.target.value})}>
                                <option value="pais">País</option>
                                <option value="depto">Departamento</option>
                                <option value="municipio">Municipio</option>
                                <option value="comuna">Comuna / Localidad</option>
                                <option value="barrio">Barrio</option>
                                <option value="zona">Zona / Puesto</option>
                            </select>
                        </div>

                        <div className="space-y-1.5">
                            <label className="text-[10px] font-black text-brand-gray-400 uppercase tracking-[0.15em] ml-1">Zona Superior (Padre)</label>
                            <select className="w-full p-3.5 bg-brand-gray-50 border-2 border-brand-gray-100 rounded-2xl focus:border-brand-black focus:bg-white outline-none font-bold text-sm text-brand-black" value={formData.parentId} onChange={e => setFormData({...formData, parentId: e.target.value})}>
                                <option value="">-- Nivel Superior / Raíz --</option>
                                {flatTerritories.filter(t => t.id !== formData.id).map(t => <option key={t.id} value={t.id}>{t.name} ({t.level})</option>)}
                            </select>
                        </div>

                        <div className="space-y-1.5">
                            <label className="text-[10px] font-black text-brand-gray-400 uppercase tracking-[0.15em] ml-1">Coordinador Responsable</label>
                            <div className="relative">
                                <select className="w-full p-3.5 bg-brand-gray-50 border-2 border-brand-gray-100 rounded-2xl focus:border-brand-black focus:bg-white outline-none font-bold text-sm text-brand-black appearance-none" value={formData.responsibleUserId} onChange={e => setFormData({...formData, responsibleUserId: e.target.value})}>
                                    <option value="">-- Sin Asignar --</option>
                                    {users.map(u => <option key={u.id} value={u.id}>{u.fullName}</option>)}
                                </select>
                                <User className="w-4 h-4 text-brand-gray-400 absolute right-4 top-1/2 -translate-y-1/2 pointer-events-none" />
                            </div>
                        </div>

                        <div className="flex flex-col gap-3 pt-4">
                            {isEditing && (
                                <button type="button" onClick={handleCancelEdit} className="w-full py-3 flex items-center justify-center gap-2 text-brand-gray-400 font-bold uppercase text-[10px] tracking-widest hover:text-red-600 transition-colors bg-white border border-brand-gray-100 rounded-xl">
                                    <Ban className="w-3 h-3" /> Cancelar Edición
                                </button>
                            )}
                            <button type="submit" disabled={loading} className={`btn-primary-friendly w-full h-[60px] uppercase tracking-widest text-xs shadow-xl shadow-brand-black/10 transition-all ${isEditing ? 'bg-brand-green-600 hover:bg-brand-green-700 shadow-brand-green-200' : 'bg-brand-black'}`}>
                                {isEditing ? 'Actualizar Zona' : 'Registrar Zona'}
                            </button>
                        </div>
                    </form>
                  </div>
              </div>

              {/* Right Table */}
              <div className="lg:col-span-8">
                  <div className="card-friendly overflow-hidden">
                      <div className="p-6 bg-brand-gray-50 border-b border-brand-gray-100 flex items-center gap-3">
                          <div className="p-2 bg-white rounded-lg shadow-sm"><Network className="w-4 h-4 text-brand-black" /></div>
                          <h3 className="font-black text-brand-black text-[10px] uppercase tracking-[0.2em]">Mapa Jerárquico</h3>
                      </div>
                      <div className="overflow-x-auto">
                          <table className="min-w-full divide-y divide-brand-gray-100">
                              <thead className="bg-brand-gray-50/50">
                                  <tr>
                                      <th className="px-6 py-4 text-left text-[10px] font-black text-brand-gray-400 uppercase tracking-widest">Territorio</th>
                                      <th className="px-6 py-4 text-left text-[10px] font-black text-brand-gray-400 uppercase tracking-widest">Tipo</th>
                                      <th className="px-6 py-4 text-left text-[10px] font-black text-brand-gray-400 uppercase tracking-widest">Padre</th>
                                      <th className="px-6 py-4 text-left text-[10px] font-black text-brand-gray-400 uppercase tracking-widest">Responsable</th>
                                      <th className="px-6 py-4 text-right text-[10px] font-black text-brand-gray-400 uppercase tracking-widest">Acciones</th>
                                  </tr>
                              </thead>
                              <tbody className="bg-white divide-y divide-brand-gray-50">
                                  {renderRows(territories)}
                              </tbody>
                          </table>
                      </div>
                  </div>
              </div>
          </div>
      )}

      {/* CONTENT: POLLING PLACES */}
      {activeSubTab === 'polling' && (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-10 animate-in slide-in-from-right-4">
              {/* Left Form */}
              <div className="lg:col-span-4">
                  <div className={`card-friendly p-8 sticky top-6 transition-colors ${isEditingPolling ? 'border-brand-black ring-1 ring-brand-black bg-blue-50/10' : ''}`}>
                    <h3 className="font-black text-brand-black mb-8 flex items-center gap-3 text-sm uppercase tracking-widest">
                        <div className={`p-2.5 text-white rounded-xl shadow-lg transition-colors ${isEditingPolling ? 'bg-brand-green-600' : 'bg-brand-black'}`}>
                            {isEditingPolling ? <Edit2 className="w-5 h-5" /> : <Plus className="w-5 h-5" />}
                        </div>
                        {isEditingPolling ? 'Editando Puesto' : 'Nuevo Puesto'}
                    </h3>

                    <form onSubmit={handlePollingSubmit} className="space-y-6">
                        <div className="space-y-1.5">
                            <label className="text-[10px] font-black text-brand-gray-400 uppercase tracking-[0.15em] ml-1">Nombre del Puesto</label>
                            <input type="text" required className="w-full p-3.5 bg-brand-gray-50 border-2 border-brand-gray-100 rounded-2xl focus:border-brand-black focus:bg-white outline-none font-bold text-sm text-brand-black transition-all" placeholder="Ej. Institución Educativa..." value={pollingForm.name} onChange={e => setPollingForm({...pollingForm, name: e.target.value})} />
                        </div>

                        <div className="space-y-1.5">
                            <label className="text-[10px] font-black text-brand-gray-400 uppercase tracking-[0.15em] ml-1">Dirección</label>
                            <div className="relative">
                                <input type="text" required className="w-full p-3.5 pl-10 bg-brand-gray-50 border-2 border-brand-gray-100 rounded-2xl focus:border-brand-black focus:bg-white outline-none font-bold text-sm text-brand-black transition-all" placeholder="Ej. Calle 10 # 5-20" value={pollingForm.address} onChange={e => setPollingForm({...pollingForm, address: e.target.value})} />
                                <MapPin className="w-4 h-4 text-brand-gray-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                            </div>
                        </div>

                        <div className="space-y-1.5">
                            <label className="text-[10px] font-black text-brand-gray-400 uppercase tracking-[0.15em] ml-1">Zona Asignada</label>
                            <select required className="w-full p-3.5 bg-brand-gray-50 border-2 border-brand-gray-100 rounded-2xl focus:border-brand-black focus:bg-white outline-none font-bold text-sm text-brand-black" value={pollingForm.territoryId} onChange={e => setPollingForm({...pollingForm, territoryId: e.target.value})}>
                                <option value="">-- Seleccionar Zona --</option>
                                {flatTerritories.map(t => <option key={t.id} value={t.id}>{t.name} ({t.level})</option>)}
                            </select>
                        </div>

                        <div className="flex flex-col gap-3 pt-4">
                            {isEditingPolling && (
                                <button type="button" onClick={handleCancelPollingEdit} className="w-full py-3 flex items-center justify-center gap-2 text-brand-gray-400 font-bold uppercase text-[10px] tracking-widest hover:text-red-600 transition-colors bg-white border border-brand-gray-100 rounded-xl">
                                    <Ban className="w-3 h-3" /> Cancelar Edición
                                </button>
                            )}
                            <button type="submit" disabled={loading} className={`btn-primary-friendly w-full h-[60px] uppercase tracking-widest text-xs shadow-xl shadow-brand-black/10 transition-all ${isEditingPolling ? 'bg-brand-green-600 hover:bg-brand-green-700 shadow-brand-green-200' : 'bg-brand-black'}`}>
                                {isEditingPolling ? 'Actualizar Puesto' : 'Crear Puesto'}
                            </button>
                        </div>
                    </form>
                  </div>
              </div>

              {/* Right Table */}
              <div className="lg:col-span-8">
                  <div className="card-friendly overflow-hidden">
                      <div className="p-6 bg-brand-gray-50 border-b border-brand-gray-100 flex items-center gap-3">
                          <div className="p-2 bg-white rounded-lg shadow-sm"><Building2 className="w-4 h-4 text-brand-black" /></div>
                          <h3 className="font-black text-brand-black text-[10px] uppercase tracking-[0.2em]">Puestos de Votación Registrados</h3>
                      </div>
                      <div className="overflow-x-auto">
                          <table className="min-w-full divide-y divide-brand-gray-100">
                              <thead className="bg-brand-gray-50/50">
                                  <tr>
                                      <th className="px-6 py-4 text-left text-[10px] font-black text-brand-gray-400 uppercase tracking-widest">Nombre Puesto</th>
                                      <th className="px-6 py-4 text-left text-[10px] font-black text-brand-gray-400 uppercase tracking-widest">Dirección</th>
                                      <th className="px-6 py-4 text-left text-[10px] font-black text-brand-gray-400 uppercase tracking-widest">Zona</th>
                                      <th className="px-6 py-4 text-right text-[10px] font-black text-brand-gray-400 uppercase tracking-widest">Acciones</th>
                                  </tr>
                              </thead>
                              <tbody className="bg-white divide-y divide-brand-gray-50">
                                  {pollingPlaces.map(place => {
                                      // Find territory name locally for speed
                                      const terr = flatTerritories.find(t => t.id === place.territoryId);
                                      return (
                                          <tr key={place.id} className={`hover:bg-brand-gray-50 transition-colors border-b border-brand-gray-50 last:border-0 ${isEditingPolling && pollingForm.id === place.id ? 'bg-blue-50/50' : ''}`}>
                                              <td className="px-6 py-4">
                                                  <div className="font-bold text-brand-black text-sm">{place.name}</div>
                                              </td>
                                              <td className="px-6 py-4">
                                                  <div className="flex items-center gap-2 text-xs text-brand-gray-500 font-medium">
                                                      <MapPin className="w-3 h-3 text-brand-gray-400" />
                                                      {place.address}
                                                  </div>
                                              </td>
                                              <td className="px-6 py-4">
                                                   <span className="px-2.5 py-1 bg-brand-gray-100 text-brand-gray-500 rounded-lg text-[9px] font-black uppercase tracking-widest border border-brand-gray-200">
                                                      {terr?.name || 'Zona Eliminada'}
                                                  </span>
                                              </td>
                                              <td className="px-6 py-4 text-right space-x-3">
                                                  <button onClick={() => handleEditPolling(place)} className="p-2 text-brand-gray-400 hover:text-brand-black transition-colors" title="Editar"><Edit2 className="w-4 h-4" /></button>
                                                  <button onClick={() => handleDeletePolling(place.id)} className="p-2 text-brand-gray-400 hover:text-red-600 transition-colors" title="Eliminar"><Trash2 className="w-4 h-4" /></button>
                                              </td>
                                          </tr>
                                      );
                                  })}
                                  {pollingPlaces.length === 0 && (
                                      <tr>
                                          <td colSpan={4} className="px-6 py-12 text-center text-brand-gray-400 text-sm font-bold">
                                              No hay puestos registrados. Use el formulario para crear uno.
                                          </td>
                                      </tr>
                                  )}
                              </tbody>
                          </table>
                      </div>
                  </div>
              </div>
          </div>
      )}
    </div>
  );
}
