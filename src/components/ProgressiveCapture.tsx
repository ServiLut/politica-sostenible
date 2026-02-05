'use client';

import React, { useState, useEffect } from 'react';
import { User, Phone, Check, ShieldCheck, MapPin, Building2, Bus, AlertCircle, Loader2, Navigation } from 'lucide-react';
import { toast } from 'sonner';

export default function ProgressiveCapture() {
  const [formData, setFormData] = useState({
    territoryId: '',
    fullName: '',
    phone: '',
    address: '',
    pollingPlaceId: '',
    transportNeed: false,
    consent: false
  });

  const [territories, setTerritories] = useState<any[]>([]);
  const [pollingPlaces, setPollingPlaces] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [phoneError, setPhoneError] = useState('');
  const [loadingPollingPlaces, setLoadingPollingPlaces] = useState(false);

  // 1. Load Territories on Mount
  useEffect(() => {
    fetch('/api/territory/list')
        .then(res => res.json())
        .then(data => {
            if (Array.isArray(data)) setTerritories(data);
        })
        .catch(err => console.error('Error loading territories:', err));
  }, []);

  // 2. Load Polling Places when Territory Changes
  useEffect(() => {
    if (!formData.territoryId) {
        setPollingPlaces([]);
        return;
    }
    
    setLoadingPollingPlaces(true);
    fetch(`/api/polling-places/list?territoryId=${formData.territoryId}`)
        .then(res => res.json())
        .then(data => {
            if (Array.isArray(data)) setPollingPlaces(data);
            else setPollingPlaces([]);
        })
        .catch(console.error)
        .finally(() => setLoadingPollingPlaces(false));
  }, [formData.territoryId]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { name, value, type } = e.target;
    // @ts-ignore
    const checked = e.target.checked;
    
    setFormData(prev => ({
      ...prev,
      [name]: type === 'checkbox' ? checked : value
    }));

    if (name === 'phone') setPhoneError('');
  };

  const handlePhoneBlur = async () => {
      if (formData.phone.length < 7) return;
      try {
          const res = await fetch(`/api/contacts/check-phone?phone=${formData.phone}`);
          const data = await res.json();
          if (data.exists) {
              setPhoneError(`Registrado con Líder: ${data.leaderName}`);
              toast.warning(`Este número ya pertenece al líder ${data.leaderName}`);
          }
      } catch (e) { console.error(e); }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.consent || phoneError) return;
    
    setLoading(true);
    setSuccess(false);

    try {
      const res = await fetch('/api/contacts/capture', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            ...formData,
            consentGranted: formData.consent,
            // Map legacy names if backend expects them differently, but we will update backend to match these
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        if (data.error === 'DUPLICATE') {
             setPhoneError(data.message);
             throw new Error(data.message);
        }
        throw new Error(data.error || 'Error de conexión');
      }

      // Success Feedback
      setSuccess(true);
      toast.success('¡Contacto guardado exitosamente!');
      
      // Reset form but keep Territory for rapid entry
      setFormData(prev => ({ 
          ...prev,
          fullName: '', 
          phone: '', 
          address: '', 
          // Keep territoryId
          pollingPlaceId: '', // Reset polling place
          transportNeed: false,
          consent: false 
      }));
      
      setPhoneError('');
      
      // Auto-hide success message
      setTimeout(() => setSuccess(false), 5000);

    } catch (err: any) {
      toast.error(err.message || 'Error al guardar.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="w-full max-w-lg mx-auto p-4 pb-20">
      
      {/* Header */}
      <div className="mb-6">
          <h2 className="text-2xl md:text-3xl font-extrabold text-gray-900 tracking-tight leading-tight">
            Política Sostenible
          </h2>
          <p className="text-gray-500 mt-1">Captura consolidada de territorio.</p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-5 bg-white p-6 rounded-2xl shadow-xl border border-gray-100">
        
        {/* Success Banner */}
        {success && (
          <div className="bg-green-100 border-l-4 border-green-500 p-4 rounded-r mb-4 animate-in fade-in">
            <div className="flex">
              <div className="flex-shrink-0">
                <Check className="h-6 w-6 text-green-600" />
              </div>
              <div className="ml-3">
                <p className="text-lg font-bold text-green-800">
                  ¡Registro Exitoso!
                </p>
                <p className="text-sm text-green-700">
                  Listo para el siguiente.
                </p>
              </div>
            </div>
          </div>
        )}

        {/* 1. Selector Zona / Territorio */}
        <div>
          <label className="block text-sm font-bold text-gray-700 mb-1">Zona / Territorio</label>
          <div className="relative">
             <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
              <Navigation className="h-5 w-5 text-gray-400" />
            </div>
            <select
                name="territoryId"
                required
                className="block w-full pl-10 pr-4 py-3 text-base border-2 border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all text-gray-900 bg-white appearance-none"
                value={formData.territoryId}
                onChange={handleChange}
            >
                <option value="">-- Seleccionar Zona --</option>
                {territories.map(t => (
                    <option key={t.id} value={t.id}>{t.name} ({t.level})</option>
                ))}
            </select>
          </div>
        </div>

        {/* 2. Nombre Completo */}
        <div>
          <label className="block text-sm font-bold text-gray-700 mb-1">Nombre Completo</label>
          <div className="relative">
            <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
              <User className="h-5 w-5 text-gray-400" />
            </div>
            <input
              type="text"
              name="fullName"
              required
              placeholder="Ej. Juan Pérez"
              className="block w-full pl-10 pr-4 py-3 text-base border-2 border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all text-gray-900 placeholder-gray-400"
              value={formData.fullName}
              onChange={handleChange}
            />
          </div>
        </div>

        {/* 3. Celular */}
        <div>
          <label className="block text-sm font-bold text-gray-700 mb-1">Celular</label>
          <div className="relative">
            <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
              <Phone className={`h-5 w-5 ${phoneError ? 'text-red-400' : 'text-gray-400'}`} />
            </div>
            <input
              type="tel"
              name="phone"
              required
              inputMode="tel"
              pattern="[0-9]*"
              placeholder="300 123 4567"
              className={`block w-full pl-10 pr-4 py-3 text-xl tracking-widest font-mono border-2 rounded-xl focus:ring-2 transition-all text-gray-900 placeholder-gray-400 ${phoneError ? 'border-red-300 focus:ring-red-100 focus:border-red-500 bg-red-50' : 'border-gray-200 focus:ring-blue-500 focus:border-blue-500'}`}
              value={formData.phone}
              onChange={handleChange}
              onBlur={handlePhoneBlur}
            />
          </div>
          {phoneError && (
              <div className="mt-1 text-red-600 text-xs font-bold flex items-center gap-1">
                  <AlertCircle className="w-3 h-3" /> {phoneError}
              </div>
          )}
        </div>

        {/* 4. Dirección de Residencia */}
        <div>
          <label className="block text-sm font-bold text-gray-700 mb-1">Dirección de Residencia</label>
          <div className="relative">
            <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
              <MapPin className="h-5 w-5 text-gray-400" />
            </div>
            <input
              type="text"
              name="address"
              required
              autoComplete="off"
              placeholder="Ej. Calle 10 # 5-20"
              className="block w-full pl-10 pr-4 py-3 text-base border-2 border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all text-gray-900 placeholder-gray-400"
              value={formData.address}
              onChange={handleChange}
            />
          </div>
        </div>

        {/* 5. Puesto de Votación (Dynamic) */}
        <div>
          <label className="block text-sm font-bold text-gray-700 mb-1">
              Puesto de Votación
              {loadingPollingPlaces && <span className="ml-2 text-xs text-blue-500 font-normal animate-pulse">Cargando puestos...</span>}
          </label>
          <div className="relative">
             <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
              <Building2 className="h-5 w-5 text-gray-400" />
            </div>
            <select
                name="pollingPlaceId"
                className="block w-full pl-10 pr-4 py-3 text-base border-2 border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all text-gray-900 bg-white appearance-none disabled:bg-gray-100 disabled:text-gray-400"
                value={formData.pollingPlaceId}
                onChange={handleChange}
                disabled={!formData.territoryId || loadingPollingPlaces}
            >
                <option value="">{formData.territoryId ? '-- Seleccionar Puesto --' : '← Seleccione Zona primero'}</option>
                {pollingPlaces.map(p => (
                    <option key={p.id} value={p.id}>{p.name}</option>
                ))}
            </select>
          </div>
        </div>

        {/* 6. Switch Transporte */}
        <div className={`p-3 rounded-xl border-2 transition-colors duration-200 cursor-pointer ${formData.transportNeed ? 'bg-amber-50 border-amber-200' : 'bg-gray-50 border-gray-200'}`}>
          <label className="flex items-center space-x-3 cursor-pointer">
            <div className="relative inline-flex items-center">
              <input
                type="checkbox"
                name="transportNeed"
                className="sr-only peer"
                checked={formData.transportNeed}
                onChange={handleChange}
              />
              <div className="w-14 h-8 bg-gray-300 peer-focus:outline-none peer-focus:ring-2 peer-focus:ring-amber-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-7 after:w-7 after:transition-all peer-checked:bg-amber-500"></div>
            </div>
            <div className="flex-1">
              <div className="flex items-center text-amber-900 font-bold text-sm">
                <Bus className="w-4 h-4 mr-2" />
                ¿Requiere Transporte el Día D?
              </div>
            </div>
          </label>
        </div>

        {/* 7. Checkbox Autorización */}
        <div className="flex items-start gap-3 p-2">
            <div className="flex items-center h-5">
                <input
                    id="consent"
                    name="consent"
                    type="checkbox"
                    checked={formData.consent}
                    onChange={handleChange}
                    className="w-5 h-5 border border-gray-300 rounded bg-gray-50 focus:ring-3 focus:ring-blue-300"
                />
            </div>
            <label htmlFor="consent" className="text-xs text-gray-600">
                Autorizo el tratamiento de mis datos personales para fines de contacto político y gestión electoral, conforme a la política de privacidad.
            </label>
        </div>

        {/* 8. Botón Guardar */}
        <button
          type="submit"
          disabled={!formData.consent || loading || !!phoneError}
          className={`w-full py-4 text-xl font-black rounded-xl shadow-lg transform transition-all active:scale-95 flex items-center justify-center
            ${!formData.consent || loading || !!phoneError
              ? 'bg-gray-200 text-gray-400 cursor-not-allowed'
              : 'bg-blue-700 text-white hover:bg-blue-800 hover:shadow-xl'
            }
          `}
        >
          {loading ? (
            <div className="flex items-center gap-2">
                <Loader2 className="w-6 h-6 animate-spin" />
                <span>GUARDANDO...</span>
            </div>
          ) : (
            'GUARDAR REGISTRO'
          )}
        </button>

      </form>
    </div>
  );
}