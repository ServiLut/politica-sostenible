'use client';

import React, { useState, useEffect } from 'react';
import { Plus, ToggleLeft, ToggleRight, Calendar, Trash2 } from 'lucide-react';
import { toast } from 'sonner';

export default function ElectionManager() {
  const [elections, setElections] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [newElection, setNewElection] = useState({ name: '', date: '', isActive: false });

  const loadData = async () => {
      // Prevent caching with timestamp
      const res = await fetch(`/api/election/list?all=true&t=${new Date().getTime()}`); 
      if (res.ok) setElections(await res.json());
  };

  useEffect(() => { loadData(); }, []);

  const handleCreate = async (e: React.FormEvent) => {
      e.preventDefault();
      setLoading(true);
      try {
          const res = await fetch('/api/election/create', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify(newElection)
          });
          if (res.ok) {
              toast.success('Elección Creada');
              setNewElection({ name: '', date: '', isActive: false });
              loadData();
          } else {
              toast.error('Error al crear');
          }
      } catch (e) { toast.error('Error'); }
      finally { setLoading(false); }
  };

  const toggleStatus = async (id: string, currentStatus: string) => {
      const newStatus = currentStatus === 'ACTIVE' ? 'DRAFT' : 'ACTIVE';
      try {
          const res = await fetch('/api/election/update-status', {
              method: 'PUT',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ id, status: newStatus })
          });
          
          if (!res.ok) {
              const data = await res.json();
              throw new Error(data.error || 'Error al actualizar estado');
          }

          toast.success('Estado Actualizado');
          loadData();
      } catch (e: any) { 
          toast.error('Error', { description: e.message }); 
      }
  };

  return (
    <div className="space-y-8">
        {/* CREATE FORM */}
        <div className="card-friendly p-6">
            <h3 className="text-sm font-black text-brand-black uppercase tracking-widest mb-4">Nueva Elección</h3>
            <form onSubmit={handleCreate} className="flex flex-col md:flex-row gap-4 items-end">
                <div className="flex-1 w-full">
                    <label className="text-[10px] font-black text-brand-gray-400 uppercase tracking-widest">Nombre</label>
                    <input type="text" required className="w-full p-3 bg-brand-gray-50 rounded-xl font-bold text-sm outline-none border-2 border-transparent focus:border-brand-black transition-all" placeholder="Ej. Senado 2026" value={newElection.name} onChange={e => setNewElection({...newElection, name: e.target.value})} />
                </div>
                <div className="w-full md:w-40">
                    <label className="text-[10px] font-black text-brand-gray-400 uppercase tracking-widest">Fecha</label>
                    <input type="date" required className="w-full p-3 bg-brand-gray-50 rounded-xl font-bold text-sm outline-none" value={newElection.date} onChange={e => setNewElection({...newElection, date: e.target.value})} />
                </div>
                <div className="flex items-center gap-2 pb-3">
                    <button type="button" onClick={() => setNewElection({...newElection, isActive: !newElection.isActive})}>
                        {newElection.isActive ? <ToggleRight className="w-8 h-8 text-brand-green-500" /> : <ToggleLeft className="w-8 h-8 text-brand-gray-300" />}
                    </button>
                    <span className="text-xs font-bold text-brand-gray-500">Activa</span>
                </div>
                <button type="submit" disabled={loading} className="btn-primary-friendly w-full md:w-auto px-6 h-[48px]">
                    <Plus className="w-4 h-4" /> Crear
                </button>
            </form>
        </div>

        {/* LIST */}
        <div className="card-friendly overflow-hidden">
            <table className="min-w-full divide-y divide-brand-gray-100">
                <thead className="bg-brand-gray-50">
                    <tr>
                        <th className="px-6 py-4 text-left text-[10px] font-black text-brand-gray-400 uppercase tracking-widest">Elección</th>
                        <th className="px-6 py-4 text-left text-[10px] font-black text-brand-gray-400 uppercase tracking-widest">Fecha</th>
                        <th className="px-6 py-4 text-left text-[10px] font-black text-brand-gray-400 uppercase tracking-widest">Estado</th>
                        <th className="px-6 py-4 text-right text-[10px] font-black text-brand-gray-400 uppercase tracking-widest">Acción</th>
                    </tr>
                </thead>
                <tbody className="bg-white divide-y divide-brand-gray-50">
                    {elections.map(e => (
                        <tr key={e.id}>
                            <td className="px-6 py-4 font-bold text-sm text-brand-black">{e.name}</td>
                            <td className="px-6 py-4 text-xs font-medium text-brand-gray-500">{new Date(e.electionDate).toLocaleDateString()}</td>
                            <td className="px-6 py-4">
                                <span className={`px-2 py-1 rounded text-[10px] font-black uppercase tracking-widest ${e.status === 'ACTIVE' ? 'bg-brand-green-100 text-brand-green-700' : 'bg-brand-gray-100 text-brand-gray-500'}`}>
                                    {e.status}
                                </span>
                            </td>
                            <td className="px-6 py-4 text-right">
                                <button onClick={() => toggleStatus(e.id, e.status)} className="text-brand-black font-bold text-xs hover:underline">
                                    {e.status === 'ACTIVE' ? 'Desactivar' : 'Activar'}
                                </button>
                            </td>
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>
    </div>
  );
}
