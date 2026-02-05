'use client';

import React, { useState, useEffect } from 'react';
import { DollarSign, Save, Camera, Lock, Calendar, PlusCircle, List, Loader2 } from 'lucide-react';
import { useRouter } from 'next/navigation';

import { toast } from 'sonner';

export default function NewExpensePage() {
  const router = useRouter();
  const [formData, setFormData] = useState({ 
      amount: '', 
      category: 'Transporte', 
      description: '', 
      pin: '', 
      eventId: '',
      newEventName: '' 
  });
  const [mode, setMode] = useState<'SELECT' | 'CREATE'>('SELECT');
  const [photo, setPhoto] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [requirePin, setRequirePin] = useState(false);
  const [events, setEvents] = useState<any[]>([]);

  // Load Events
  useEffect(() => {
      fetch('/api/events/list')
        .then(r => r.json())
        .then(data => {
            if (Array.isArray(data)) {
                setEvents(data);
                if (data.length > 0) {
                    setFormData(prev => ({...prev, eventId: data[0].id }));
                } else {
                    setMode('CREATE');
                }
            }
        });
  }, []);

  // Check amount limit
  useEffect(() => {
    const val = parseFloat(formData.amount);
    if (!isNaN(val) && val > 50000) {
        setRequirePin(true);
    } else {
        setRequirePin(false);
    }
  }, [formData.amount]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!photo) {
        toast.warning('Evidencia Requerida', { description: 'La foto del comprobante es obligatoria por ley.' });
        return;
    }
    
    // Validate Event Selection
    if (mode === 'SELECT' && !formData.eventId) {
        toast.warning('Falta Evento', { description: 'Selecciona un evento de la lista.' });
        return;
    }
    if (mode === 'CREATE' && !formData.newEventName) {
        toast.warning('Nombre Requerido', { description: 'Escribe el nombre del nuevo evento.' });
        return;
    }

    setLoading(true);
    try {
        // 1. Upload File
        const uploadData = new FormData();
        uploadData.append('file', photo);
        
        const uploadRes = await fetch('/api/finance/upload', {
            method: 'POST',
            body: uploadData
        });
        
        const uploadResult = await uploadRes.json();
        if (!uploadRes.ok) throw new Error(uploadResult.error || 'Error subiendo recibo');

        // 2. Create Expense
        const res = await fetch('/api/finance/create', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                ...formData,
                evidencePhotoUrl: uploadResult.path,
                eventId: mode === 'SELECT' ? formData.eventId : undefined,
                newEventName: mode === 'CREATE' ? formData.newEventName : undefined
            })
        });
        
        const data = await res.json();
        if (!res.ok) throw new Error(data.error);
        
        toast.success('Gasto Legalizado', { description: 'La transacción ha sido registrada y auditada.' });
        router.push('/dashboard/finance');
        router.refresh();
    } catch (e: any) {
        toast.error('Error de Legalización', { description: e.message });
        setLoading(false);
    }
  };

  return (
    <div className="max-w-md mx-auto space-y-6">
      <div className="text-center">
        <h1 className="text-2xl font-bold text-slate-900">Registrar Nuevo Gasto</h1>
        <p className="text-slate-500">Sube la evidencia para legalizar</p>
      </div>

      <div className="bg-white p-6 rounded-xl shadow-lg border border-slate-100">
        <form onSubmit={handleSubmit} className="space-y-6">
            
            {/* Smart Event Selector */}
            <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 transition-all">
                <div className="flex justify-between items-center mb-3">
                    <label className="text-xs font-bold text-slate-500 uppercase flex items-center gap-1">
                        <Calendar className="w-3 h-3" /> Evento Asociado
                    </label>
                    <button 
                        type="button"
                        onClick={() => setMode(prev => prev === 'SELECT' ? 'CREATE' : 'SELECT')}
                        className="text-[10px] font-bold bg-white border border-slate-200 px-2 py-1 rounded-lg text-blue-600 hover:bg-blue-50 transition-colors flex items-center gap-1 shadow-sm"
                    >
                        {mode === 'SELECT' ? <PlusCircle className="w-3 h-3" /> : <List className="w-3 h-3" />}
                        {mode === 'SELECT' ? 'Crear Nuevo' : 'Seleccionar'}
                    </button>
                </div>

                {mode === 'CREATE' ? (
                    <div className="animate-in fade-in slide-in-from-top-1">
                        <input 
                            type="text" 
                            placeholder="Nombre del Evento (Ej. Cena Donantes)"
                            className="w-full p-2.5 border-2 border-blue-100 rounded-lg text-sm font-bold text-slate-800 focus:border-blue-500 outline-none"
                            value={formData.newEventName}
                            onChange={e => setFormData({...formData, newEventName: e.target.value})}
                            autoFocus
                        />
                        <p className="text-[10px] text-slate-400 mt-1.5 ml-1">Se creará automáticamente en la base de datos.</p>
                    </div>
                ) : (
                    <select 
                        className="w-full p-2.5 border border-slate-300 rounded-lg text-sm bg-white font-medium text-slate-700 outline-none focus:border-blue-500"
                        value={formData.eventId}
                        onChange={e => setFormData({...formData, eventId: e.target.value})}
                    >
                        {events.length === 0 && <option value="">-- No hay eventos --</option>}
                        {events.map(ev => (
                            <option key={ev.id} value={ev.id}>{ev.name} ({new Date(ev.eventDate).toLocaleDateString()})</option>
                        ))}
                    </select>
                )}
            </div>

            <div>
                <label className="block text-sm font-bold text-slate-700 mb-1">Monto (COP)</label>
                <div className="relative">
                    <DollarSign className="absolute left-3 top-3.5 w-5 h-5 text-slate-400" />
                    <input 
                        type="number" 
                        required
                        className="w-full pl-10 p-3 border-2 border-slate-200 rounded-xl focus:border-blue-500 text-xl font-bold text-slate-900 outline-none"
                        placeholder="0"
                        value={formData.amount}
                        onChange={e => setFormData({...formData, amount: e.target.value})}
                    />
                </div>
            </div>

            <div>
                <label className="block text-sm font-bold text-slate-700 mb-1">Categoría</label>
                <select 
                    className="w-full p-3 border-2 border-slate-200 rounded-xl bg-white outline-none focus:border-blue-500 font-medium text-slate-700"
                    value={formData.category}
                    onChange={e => setFormData({...formData, category: e.target.value})}
                >
                    <option value="Transporte">Transporte / Gasolina</option>
                    <option value="Refrigerios">Refrigerios / Alimentación</option>
                    <option value="Publicidad">Publicidad / Impresos</option>
                    <option value="Logistica">Logística / Alquileres</option>
                    <option value="Otros">Otros</option>
                </select>
            </div>

            {/* Photo Upload */}
            <div className={`border-2 border-dashed rounded-xl p-6 text-center cursor-pointer transition-all active:scale-[0.99]
                ${photo ? 'border-green-500 bg-green-50' : 'border-slate-300 hover:bg-slate-50 hover:border-blue-400'}`}
            >
                <label className="cursor-pointer block w-full h-full">
                    <input type="file" className="hidden" accept="image/*" onChange={e => setPhoto(e.target.files?.[0] || null)} />
                    <Camera className={`w-8 h-8 mx-auto mb-2 ${photo ? 'text-green-600' : 'text-slate-400'}`} />
                    <span className={`text-sm font-medium ${photo ? 'text-green-700' : 'text-slate-500'}`}>
                        {photo ? 'Comprobante Cargado' : 'Toca para Subir Foto'}
                    </span>
                </label>
            </div>

            {/* PIN Lock */}
            {requirePin && (
                <div className="bg-orange-50 p-4 rounded-xl border border-orange-200 animate-in fade-in slide-in-from-top-2">
                    <div className="flex items-center gap-2 mb-2 text-orange-800 font-bold text-sm">
                        <Lock className="w-4 h-4" />
                        Autorización Requerida
                    </div>
                    <input 
                        type="password" 
                        placeholder="Ingresa tu PIN"
                        className="w-full p-3 border border-orange-300 rounded-lg text-center tracking-widest font-bold outline-none focus:ring-2 focus:ring-orange-200"
                        value={formData.pin}
                        onChange={e => setFormData({...formData, pin: e.target.value})}
                    />
                    <p className="text-xs text-orange-700 mt-2">Gastos &gt; $50k requieren firma digital.</p>
                </div>
            )}

            <button 
                type="submit" 
                disabled={loading || !photo || (requirePin && !formData.pin)}
                className={`w-full py-4 rounded-xl font-bold text-white shadow-lg transition-all flex items-center justify-center gap-2
                    ${(loading || !photo || (requirePin && !formData.pin)) ? 'bg-slate-300 cursor-not-allowed shadow-none' : 'bg-blue-600 hover:bg-blue-700 active:scale-[0.98]'}
                `}
            >
                {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : <Save className="w-5 h-5" />}
                {loading ? 'Procesando...' : 'Legalizar Gasto'}
            </button>

        </form>
      </div>
    </div>
  );
}