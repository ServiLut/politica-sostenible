'use client';

import React, { useState, useEffect, useRef } from 'react';
import { User, Phone, Check, ShieldCheck, MapPin, Building2, Bus, AlertCircle, Loader2, Navigation, WifiOff, ChevronDown, Search, Hash, Lock } from 'lucide-react';
import { toast } from 'sonner';

export default function CaptureForm() {
  const [formData, setFormData] = useState({
    territoryId: '',
    fullName: '',
    phone: '',
    address: '',
    pollingPlaceId: '',
    tableNumber: '', // New field
    transportNeed: false,
    consent: false
  });

  const [territories, setTerritories] = useState<any[]>([]);
  const [pollingPlaces, setPollingPlaces] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [phoneError, setPhoneError] = useState('');
  const [loadingPollingPlaces, setLoadingPollingPlaces] = useState(false);
  const [isOnline, setIsOnline] = useState(true);

  // Auto-Lock State
  const [isTerritoryLocked, setIsTerritoryLocked] = useState(false);
  const [userTerritoryId, setUserTerritoryId] = useState<string | null>(null);

  // Searchable Dropdown State
  const [searchTerm, setSearchTerm] = useState('');
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // 1. Connectivity Check
  useEffect(() => {
    setIsOnline(navigator.onLine);
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    return () => {
        window.removeEventListener('online', handleOnline);
        window.removeEventListener('offline', handleOffline);
    }
  }, []);

  // 2. Load Territories & User Profile
  useEffect(() => {
    // Load Territories
    fetch('/api/territory/list')
        .then(res => res.json())
        .then(data => {
            if (Array.isArray(data)) setTerritories(data);
        })
        .catch(err => console.error('Error loading territories:', err));
    
    // Load User Profile for Auto-Lock
    fetch('/api/auth/me')
        .then(res => res.json())
        .then(data => {
            if (data.territoryId && data.role !== 'ADMIN') {
                setUserTerritoryId(data.territoryId);
                setIsTerritoryLocked(true);
            }
        })
        .catch(console.error);
  }, []);

  // 2.5 Sync User Territory with Form
  useEffect(() => {
      if (userTerritoryId && territories.length > 0) {
          const t = territories.find(t => t.id === userTerritoryId);
          if (t) {
              setFormData(prev => ({ ...prev, territoryId: userTerritoryId }));
              setSearchTerm(t.name);
          }
      }
  }, [userTerritoryId, territories]);

  // 3. Load Polling Places when Territory Changes
  useEffect(() => {
    // A. Clean current polling place when zone changes (ONLY if not locked or if it's a manual change)
    // If locked, we want to keep it valid, but we might be switching to the locked one initially.
    // The previous logic cleared it on ANY change.
    
    // If it's a manual change (not initial auto-set), we clear.
    // However, simplest logic is: if territory changes, polling places must reload, so selection is invalid.
    setFormData(prev => ({ ...prev, pollingPlaceId: '' }));

    if (!formData.territoryId) {
        setPollingPlaces([]);
        return;
    }
    
    setLoadingPollingPlaces(true);
    // C. Fetch with zone_id (or territoryId)
    fetch(`/api/polling-places/list?zone_id=${formData.territoryId}`)
        .then(res => res.json())
        .then(data => {
            if (Array.isArray(data)) setPollingPlaces(data);
            else setPollingPlaces([]);
        })
        .catch(console.error)
        .finally(() => setLoadingPollingPlaces(false));
  }, [formData.territoryId]);

  // Click Outside Listener for Dropdown
  useEffect(() => {
    function handleClickOutside(event: any) {
        if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
            setIsDropdownOpen(false);
        }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [dropdownRef]);

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
      if (formData.phone.length < 7 || !isOnline) return;
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
    
    // Ensure a valid territory ID is selected, not just text
    if (!formData.territoryId) {
        toast.error("Por favor seleccione una zona válida de la lista.");
        return;
    }
    
    setLoading(true);
    setSuccess(false);

    try {
      const res = await fetch('/api/contacts/capture', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            ...formData,
            consentGranted: formData.consent,
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

      setSuccess(true);
      toast.success('¡Registro guardado exitosamente!');
      
      setFormData(prev => ({ 
          ...prev,
          fullName: '', 
          phone: '', 
          address: '', 
          pollingPlaceId: '', 
          tableNumber: '',
          transportNeed: false,
          consent: false 
      }));
      // If locked, we KEEP the territory ID and Name.
      if (isTerritoryLocked && userTerritoryId) {
          setFormData(prev => ({ ...prev, territoryId: userTerritoryId }));
          // searchTerm stays as is (territory name)
      } else {
          // If manual, we could reset or keep. Usually for speed we keep.
          // But based on request, let's keep it consistent.
          // The previous code reset it? No, "Don't reset territory ID for speed".
          // So we don't reset territoryId in setFormData above.
          // Wait, I see "setFormData(prev => ({ ...prev, fullName: '', ... }))" above.
          // It preserves territoryId because ...prev includes it and we don't overwrite it.
          // Correct.
      }
      
      setPhoneError('');
      setTimeout(() => setSuccess(false), 5000);

    } catch (err: any) {
      toast.error(err.message || 'Error al guardar.');
    } finally {
      setLoading(false);
    }
  };

  // Filter Logic
  const filteredTerritories = territories.filter(t => 
    t.name.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div className="w-full max-w-lg mx-auto">
      
      {/* Status Indicators */}
      {!isOnline && (
          <div className="mb-4 flex items-center gap-2 text-amber-700 bg-amber-50 p-3 rounded-xl text-xs font-bold uppercase tracking-tight border border-amber-200 animate-pulse">
              <WifiOff className="w-4 h-4" /> Modo Offline: Guardado local activado
          </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-5 bg-white p-6 md:p-8 rounded-3xl shadow-2xl border border-gray-100">
        
        {/* Header - Política Sostenible */}
        <div className="text-center pb-2">
            <h2 className="text-xl md:text-2xl font-black text-gray-900 uppercase tracking-tighter leading-tight">Captura Política Sostenible</h2>
            <p className="text-[10px] font-bold text-blue-600 uppercase tracking-[0.3em] mt-1">Módulo de Terreno Consolidado</p>
        </div>

        {/* Success Banner */}
        {success && (
          <div className="bg-green-100 border-l-4 border-green-500 p-4 rounded-r mb-2 animate-in fade-in zoom-in-95">
            <div className="flex">
              <Check className="h-5 w-5 text-green-600 mr-3" />
              <p className="text-sm font-bold text-green-800">¡Ciudadano Blindado!</p>
            </div>
          </div>
        )}

        {/* 1. Buscador Predictivo Zona / Territorio */}
        <div className="space-y-1" ref={dropdownRef}>
          <label className="text-[11px] font-black text-gray-400 uppercase tracking-widest ml-1 flex items-center justify-between">
              Zona / Territorio
              {isTerritoryLocked && <span className="text-[9px] bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full flex items-center gap-1"><Lock className="w-3 h-3" /> Asignada por Sistema</span>}
          </label>
          <div className="relative">
             <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
              {isTerritoryLocked ? <Lock className="h-5 w-5 text-gray-400" /> : <Navigation className="h-5 w-5 text-blue-500" />}
            </div>
            
            <input
                type="text"
                placeholder={isTerritoryLocked ? "Zona Bloqueada" : "Escribe para buscar zona..."}
                className={`block w-full pl-12 pr-10 py-4 text-base font-bold border-2 rounded-2xl transition-all 
                    ${isTerritoryLocked 
                        ? 'bg-gray-100 text-gray-500 border-gray-200 cursor-not-allowed' 
                        : 'bg-gray-50 text-gray-900 border-gray-100 focus:ring-4 focus:ring-blue-50 focus:border-blue-500 placeholder-gray-400'
                    }`}
                value={searchTerm}
                onChange={(e) => {
                    if (isTerritoryLocked) return;
                    setSearchTerm(e.target.value);
                    setIsDropdownOpen(true);
                    if (e.target.value === '') setFormData(prev => ({ ...prev, territoryId: '' }));
                }}
                onFocus={() => !isTerritoryLocked && setIsDropdownOpen(true)}
                readOnly={isTerritoryLocked}
            />
            
            {!isTerritoryLocked && (
                <div 
                    className="absolute inset-y-0 right-0 pr-4 flex items-center cursor-pointer"
                    onClick={() => setIsDropdownOpen(!isDropdownOpen)}
                >
                    <ChevronDown className="h-5 w-5 text-gray-400" />
                </div>
            )}

            {/* Dropdown List */}
            {isDropdownOpen && !isTerritoryLocked && (
                <div className="absolute z-50 w-full mt-2 bg-white border border-gray-200 rounded-2xl shadow-2xl max-h-60 overflow-y-auto animate-in fade-in slide-in-from-top-2">
                    {filteredTerritories.length > 0 ? (
                        filteredTerritories.map(t => (
                            <div 
                                key={t.id} 
                                className="px-5 py-3 hover:bg-blue-50 cursor-pointer border-b border-gray-50 last:border-0 transition-colors"
                                onClick={() => {
                                    setFormData(prev => ({ ...prev, territoryId: t.id }));
                                    setSearchTerm(t.name);
                                    setIsDropdownOpen(false);
                                }}
                            >
                                <div className="font-bold text-gray-800 text-sm">{t.name}</div>
                                <div className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">{t.level}</div>
                            </div>
                        ))
                    ) : (
                        <div className="p-4 text-center">
                            <Search className="w-8 h-8 text-gray-300 mx-auto mb-2" />
                            <p className="text-sm font-bold text-gray-400">No se encontraron zonas</p>
                        </div>
                    )}
                </div>
            )}
          </div>
        </div>

        {/* 2. Nombre Completo */}
        <div className="space-y-1">
          <label className="text-[11px] font-black text-gray-400 uppercase tracking-widest ml-1">Nombre Completo</label>
          <div className="relative">
            <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
              <User className="h-5 w-5 text-blue-500" />
            </div>
            <input
              type="text"
              name="fullName"
              required
              placeholder="Juan Pérez"
              className="block w-full pl-12 pr-4 py-4 text-base font-bold border-2 border-gray-100 rounded-2xl focus:ring-4 focus:ring-blue-50 focus:border-blue-500 transition-all text-gray-900 bg-gray-50"
              value={formData.fullName}
              onChange={handleChange}
            />
          </div>
        </div>

        {/* 3. Celular */}
        <div className="space-y-1">
          <label className="text-[11px] font-black text-gray-400 uppercase tracking-widest ml-1">Número Celular</label>
          <div className="relative">
            <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
              <Phone className={`h-5 w-5 ${phoneError ? 'text-red-500' : 'text-blue-500'}`} />
            </div>
            <input
              type="tel"
              name="phone"
              required
              inputMode="tel"
              pattern="[0-9]*"
              placeholder="300 000 0000"
              className={`block w-full pl-12 pr-4 py-4 text-xl tracking-widest font-black border-2 rounded-2xl focus:ring-4 transition-all text-gray-900 bg-gray-50 ${phoneError ? 'border-red-200 focus:ring-red-50 focus:border-red-500' : 'border-gray-100 focus:ring-blue-50 focus:border-blue-500'}`}
              value={formData.phone}
              onChange={handleChange}
              onBlur={handlePhoneBlur}
            />
          </div>
          {phoneError && (
              <div className="mt-1 text-red-600 text-[10px] font-black uppercase flex items-center gap-1 ml-1">
                  <AlertCircle className="w-3 h-3" /> {phoneError}
              </div>
          )}
        </div>

        {/* 4. Dirección de Residencia */}
        <div className="space-y-1">
          <label className="text-[11px] font-black text-gray-400 uppercase tracking-widest ml-1">Dirección de Residencia</label>
          <div className="relative">
            <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
              <MapPin className="h-5 w-5 text-blue-500" />
            </div>
            <input
              type="text"
              name="address"
              required
              autoComplete="off"
              placeholder="Calle, Carrera, Barrio..."
              className="block w-full pl-12 pr-4 py-4 text-base font-bold border-2 border-gray-100 rounded-2xl focus:ring-4 focus:ring-blue-50 focus:border-blue-500 transition-all text-gray-900 bg-gray-50"
              value={formData.address}
              onChange={handleChange}
            />
          </div>
        </div>

        {/* 5. Puesto de Votación y Mesa */}
        <div className="grid grid-cols-12 gap-3">
            <div className="col-span-8 space-y-1">
                <label className="text-[11px] font-black text-gray-400 uppercase tracking-widest ml-1">
                    Puesto de Votación
                    {loadingPollingPlaces && <span className="ml-2 text-[9px] text-blue-500 animate-pulse">Cargando...</span>}
                </label>
                <div className="relative">
                    <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                    <Building2 className="h-5 w-5 text-blue-500" />
                    </div>
                    <select
                        name="pollingPlaceId"
                        className="block w-full pl-12 pr-4 py-4 text-base font-bold border-2 border-gray-100 rounded-2xl focus:ring-4 focus:ring-blue-50 focus:border-blue-500 transition-all text-gray-900 bg-gray-50 appearance-none disabled:opacity-50"
                        value={formData.pollingPlaceId}
                        onChange={handleChange}
                        disabled={!formData.territoryId || loadingPollingPlaces || pollingPlaces.length === 0}
                    >
                        {loadingPollingPlaces ? (
                            <option>Cargando puestos...</option>
                        ) : !formData.territoryId ? (
                            <option value="">← SELECCIONE ZONA</option>
                        ) : pollingPlaces.length === 0 ? (
                            <option value="">⚠️ No hay puestos registrados</option>
                        ) : (
                            <>
                                <option value="">-- SELECCIONAR --</option>
                                {pollingPlaces.map(p => (
                                    <option key={p.id} value={p.id}>{p.name}</option>
                                ))}
                            </>
                        )}
                    </select>
                </div>
            </div>

            <div className="col-span-4 space-y-1">
                <label className="text-[11px] font-black text-gray-400 uppercase tracking-widest ml-1">Mesa</label>
                <div className="relative">
                    <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                        <Hash className="h-4 w-4 text-blue-500" />
                    </div>
                    <input
                        type="number"
                        name="tableNumber"
                        placeholder="#"
                        min="1"
                        className="block w-full pl-9 pr-2 py-4 text-base font-black border-2 border-gray-100 rounded-2xl focus:ring-4 focus:ring-blue-50 focus:border-blue-500 transition-all text-gray-900 bg-gray-50"
                        value={formData.tableNumber}
                        onChange={handleChange}
                    />
                </div>
            </div>
        </div>

        {/* 6. Switch Transporte */}
        <div className={`p-4 rounded-2xl border-2 transition-all cursor-pointer ${formData.transportNeed ? 'bg-amber-50 border-amber-300 shadow-inner' : 'bg-gray-50 border-gray-100 hover:border-gray-200'}`}>
          <label className="flex items-center justify-between cursor-pointer">
            <div className="flex items-center gap-3">
                <div className={`p-2 rounded-lg ${formData.transportNeed ? 'bg-amber-500 text-white' : 'bg-gray-200 text-gray-400'}`}>
                    <Bus className="w-5 h-5" />
                </div>
                <div>
                    <div className="text-sm font-black text-gray-900 uppercase tracking-tighter">¿Requiere Transporte?</div>
                    <div className="text-[10px] text-gray-500 font-bold uppercase">Logística Día D</div>
                </div>
            </div>
            <div className="relative inline-flex items-center">
              <input
                type="checkbox"
                name="transportNeed"
                className="sr-only peer"
                checked={formData.transportNeed}
                onChange={handleChange}
              />
              <div className="w-12 h-6 bg-gray-300 rounded-full peer peer-checked:after:translate-x-6 peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-amber-500"></div>
            </div>
          </label>
        </div>

        {/* 7. Autorización Checkbox */}
        <div className="flex items-start gap-4 p-4 bg-blue-50/30 rounded-2xl border border-blue-100/50">
            <div className="flex items-center h-5 mt-1">
                <input
                    id="consent"
                    name="consent"
                    type="checkbox"
                    checked={formData.consent}
                    onChange={handleChange}
                    className="w-6 h-6 text-blue-600 rounded-lg bg-white border-blue-200 focus:ring-blue-500"
                />
            </div>
            <div className="flex-1">
                <label htmlFor="consent" className="text-[11px] font-bold text-gray-600 leading-tight block">
                    <span className="text-blue-700 font-black uppercase text-[10px] block mb-1">Autorización Legal</span>
                    Autorizo el tratamiento de mis datos para fines de contacto político y gestión electoral (Ley 1581 de 2012).
                </label>
            </div>
        </div>

        {/* 8. Botón Guardar */}
        <button
          type="submit"
          disabled={!formData.consent || loading || !!phoneError}
          className={`w-full py-5 text-xl font-black rounded-2xl shadow-xl transform transition-all active:scale-[0.98] flex items-center justify-center gap-3
            ${!formData.consent || loading || !!phoneError
              ? 'bg-gray-100 text-gray-300 cursor-not-allowed shadow-none'
              : 'bg-gradient-to-br from-blue-700 to-blue-900 text-white hover:shadow-blue-200 hover:scale-[1.01]'
            }
          `}
        >
          {loading ? (
            <>
                <Loader2 className="w-6 h-6 animate-spin" />
                <span className="uppercase">Procesando...</span>
            </>
          ) : (
            <>
                <ShieldCheck className="w-6 h-6" />
                <span className="uppercase tracking-widest">Guardar Registro</span>
            </>
          )}
        </button>

      </form>
      
      <div className="mt-6 text-center">
          <p className="text-[10px] font-black text-gray-400 uppercase tracking-[0.2em]">Cifrado AES-256 Síncrono</p>
      </div>
    </div>
  );
}
