'use client';

import React, { useState, useEffect } from 'react';
import { X, Save, User, Phone, MapPin, AlertCircle, Map } from 'lucide-react';
import { toast } from 'sonner';
import { updateVoterProfile } from '@/app/actions/directory';
import { getAllTerritoriesForSelect } from '@/app/actions/territory';

interface EditProfileDialogProps {
  contactId: string;
  initialData: {
    fullName: string;
    phone: string;
    address: string;
    status: string;
    territoryId: string;
  };
  userRole: string;
  onClose: () => void;
  onSuccess: () => void;
}

export default function EditProfileDialog({
  contactId,
  initialData,
  userRole,
  onClose,
  onSuccess
}: EditProfileDialogProps) {
  const [formData, setFormData] = useState(initialData);
  const [territories, setTerritories] = useState<any[]>([]);
  const [isSaving, setIsSaving] = useState(false);
  const [loadingTerritories, setLoadingTerritories] = useState(true);

  useEffect(() => {
    fetchTerritories();
  }, []);

  const fetchTerritories = async () => {
    try {
      const data = await getAllTerritoriesForSelect();
      setTerritories(data);
    } catch (e) {
      console.error('Error fetching territories', e);
    } finally {
      setLoadingTerritories(false);
    }
  };

  const canDelete = userRole === 'ADMIN' || userRole === 'COORDINATOR';

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.fullName || !formData.phone) {
      toast.error('Nombre y Teléfono son obligatorios');
      return;
    }

    setIsSaving(true);
    try {
      const res = await updateVoterProfile(contactId, {
        fullName: formData.fullName,
        phone: formData.phone,
        address: formData.address,
        status: formData.status as any,
        territoryId: formData.territoryId
      });

      if (res.success) {
        toast.success('Perfil actualizado correctamente');
        onSuccess();
        onClose();
      } else {
        toast.error(res.error || 'Error actualizando perfil');
      }
    } catch (error) {
      toast.error('Error de conexión');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 z-[100] flex items-center justify-center p-4 backdrop-blur-sm animate-in fade-in">
      <div className="bg-white w-full max-w-md rounded-2xl shadow-2xl overflow-hidden flex flex-col">
        <div className="p-6 border-b border-slate-100 flex justify-between items-center bg-slate-50">
          <h3 className="font-black text-lg text-slate-800">Editar Datos Personales</h3>
          <button onClick={onClose} className="p-2 hover:bg-slate-200 rounded-full transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          <div className="space-y-1">
            <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest flex items-center gap-1">
              <User className="w-3 h-3" /> Nombre Completo
            </label>
            <input
              type="text"
              className="w-full px-4 py-2 bg-slate-50 border-2 border-slate-100 rounded-xl font-bold text-sm focus:border-brand-black outline-none"
              value={formData.fullName}
              onChange={(e) => setFormData({ ...formData, fullName: e.target.value })}
              required
            />
          </div>

          <div className="space-y-1">
            <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest flex items-center gap-1">
              <Phone className="w-3 h-3" /> Teléfono
            </label>
            <input
              type="tel"
              className="w-full px-4 py-2 bg-slate-50 border-2 border-slate-100 rounded-xl font-bold text-sm focus:border-brand-black outline-none"
              value={formData.phone}
              onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
              required
            />
          </div>

          <div className="space-y-1">
            <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest flex items-center gap-1">
              <MapPin className="w-3 h-3" /> Dirección
            </label>
            <input
              type="text"
              className="w-full px-4 py-2 bg-slate-50 border-2 border-slate-100 rounded-xl font-bold text-sm focus:border-brand-black outline-none"
              value={formData.address}
              onChange={(e) => setFormData({ ...formData, address: e.target.value })}
            />
          </div>

          <div className="space-y-1">
            <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest flex items-center gap-1">
              <Map className="w-3 h-3" /> Territorio / Zona
            </label>
            <select
              className="w-full px-4 py-2 bg-slate-50 border-2 border-slate-100 rounded-xl font-bold text-sm focus:border-brand-black outline-none disabled:opacity-50"
              value={formData.territoryId}
              onChange={(e) => setFormData({ ...formData, territoryId: e.target.value })}
              disabled={loadingTerritories}
            >
              <option value="">{loadingTerritories ? 'Cargando zonas...' : '-- Sin Zona --'}</option>
              {territories.map((t) => (
                <option key={t.id} value={t.id}>{t.name}</option>
              ))}
            </select>
          </div>

          <div className="space-y-1">
            <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Estado del Contacto</label>
            <select
              className="w-full px-4 py-2 bg-slate-50 border-2 border-slate-100 rounded-xl font-bold text-sm focus:border-brand-black outline-none"
              value={formData.status}
              onChange={(e) => setFormData({ ...formData, status: e.target.value })}
            >
              <option value="active">Activo</option>
              <option value="suspended">Suspendido</option>
              {canDelete && <option value="deleted">Eliminado</option>}
            </select>
            {!canDelete && formData.status !== 'deleted' && (
              <p className="text-[9px] text-amber-600 font-bold flex items-center gap-1 mt-1">
                <AlertCircle className="w-3 h-3" /> Solo Admin/Coord pueden eliminar contactos.
              </p>
            )}
          </div>

          <div className="pt-4 flex gap-3">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 px-5 py-3 rounded-xl font-bold text-slate-600 hover:bg-slate-100 transition-colors"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={isSaving}
              className="flex-1 px-5 py-3 rounded-xl font-bold bg-brand-black text-white hover:opacity-90 transition-opacity flex items-center justify-center gap-2 disabled:opacity-50"
            >
              {isSaving ? 'Guardando...' : <><Save className="w-4 h-4" /> Guardar</>}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
