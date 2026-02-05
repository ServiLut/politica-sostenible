'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import Image from 'next/image';
import { User, Phone, MapPin, FileText, Upload, Eye, Lock, ShieldCheck, WifiOff, Car, History, Edit, Save, X, Search, PlusCircle, CheckCircle, Download, ExternalLink, Settings } from 'lucide-react';
import { toast } from 'sonner';
import { getPollingPlaces, updateTransportNeed, uploadEvidenceAction, createPollingPlace, getSecureDocumentUrl } from '@/app/actions/contact';
import { assignPollingPlace } from '@/app/actions/directory';
import EditProfileDialog from '@/components/directory/edit-profile-dialog';

export default function ContactProfilePage({ params }: { params: { id: string } }) {
  const router = useRouter();
  const [contact, setContact] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [currentUser, setCurrentUser] = useState<any>(null);
  
  // Upload State
  const [uploadingState, setUploadingState] = useState<{ [key: string]: boolean }>({});
  const [uploadProgress, setUploadProgress] = useState<{ [key: string]: number }>({});
  
  const [isOnline, setIsOnline] = useState(true);
  const [renderHash, setRenderHash] = useState('');
  
  // Edit Profile State
  const [isEditingProfile, setIsEditingProfile] = useState(false);

  // Transport Feedback
  const [showTransportSaved, setShowTransportSaved] = useState(false);

  // Edit Polling Place State
  const [isEditingPolling, setIsEditingPolling] = useState(false);
  const [pollingSearch, setPollingSearch] = useState('');
  const [pollingResults, setPollingResults] = useState<any[]>([]);
  const [selectedPolling, setSelectedPolling] = useState<any>(null);
  const [selectedTable, setSelectedTable] = useState('');
  const [manualTableNumber, setManualTableNumber] = useState('');
  const [isCreatingPolling, setIsCreatingPolling] = useState(false);

  // Document Viewer State
  const [viewingDoc, setViewingDoc] = useState<{ url: string, type: string } | null>(null);
  const [secureUrl, setSecureUrl] = useState('');
  const [loadingDoc, setLoadingDoc] = useState(false);

  const fetchCurrentUser = useCallback(async () => {
      try {
          const res = await fetch('/api/auth/me');
          if (res.ok) {
              const data = await res.json();
              setCurrentUser(data);
          }
      } catch (e) { console.error('Error fetching user', e); }
  }, []);

  const fetchContact = useCallback(async () => {
    try {
        const res = await fetch(`/api/contacts/${params.id}`);
        if (res.ok) {
            const data = await res.json();
            setContact(data);
            // Pre-fill table number if exists
            if (data.person.tableNumber) setManualTableNumber(data.person.tableNumber);
        } else {
            toast.error('Error cargando contacto');
        }
    } catch (e) { console.error(e); }
    finally { setLoading(false); }
  }, [params.id]);

  // Initial Data & Online Status
  useEffect(() => {
    setIsOnline(navigator.onLine);
    const setOnline = () => setIsOnline(true);
    const setOffline = () => setIsOnline(false);
    window.addEventListener('online', setOnline);
    window.addEventListener('offline', setOffline);
    
    // Generate Session Hash for Forensics
    setRenderHash(Math.random().toString(36).substring(7).toUpperCase());

    fetchContact();
    fetchCurrentUser();

    return () => {
        window.removeEventListener('online', setOnline);
        window.removeEventListener('offline', setOffline);
    };
  }, [fetchContact, fetchCurrentUser]);

  const handleViewDocument = async (path: string, type: string) => {
      if (!path || path === 'PROTECTED') return; // Should not happen for Admin if implemented correctly in API, but double check
      
      setViewingDoc({ url: path, type });
      setLoadingDoc(true);
      setSecureUrl('');

      try {
          const res = await getSecureDocumentUrl(path, contact.person.fullName);
          if (res.success && res.url) {
              setSecureUrl(res.url);
          } else {
              toast.error('No se pudo generar el enlace seguro');
              setViewingDoc(null);
          }
      } catch (e) {
          toast.error('Error de seguridad al acceder al documento');
          setViewingDoc(null);
      } finally {
          setLoadingDoc(false);
      }
  };

  const handleTransportToggle = async (checked: boolean) => {
      try {
          // Optimistic UI
          const newContact = { ...contact };
          newContact.transportNeed = checked;
          if (!newContact.electoralHistory[0]) newContact.electoralHistory[0] = {};
          newContact.electoralHistory[0].transportNeed = checked ? 'transport' : 'walk';
          setContact(newContact);

          const res = await updateTransportNeed(contact.id, checked);
          if (res.success) {
              setShowTransportSaved(true);
              setTimeout(() => setShowTransportSaved(false), 2000);
              router.refresh(); // Sync Dashboard Counters
          }
      } catch (e) {
          toast.error('Error actualizando transporte');
          fetchContact(); // Revert
      }
  };

  const handleCreateManualPolling = async () => {
      if (!pollingSearch) return;
      setIsCreatingPolling(true);
      try {
          const res = await createPollingPlace(pollingSearch);
          if (res.success && res.place) {
             toast.success('Puesto Creado Manualmente');
             // Auto select
             setSelectedPolling({ ...res.place, tables: [] }); 
             setPollingSearch(res.place.name); // Trigger search again to find it properly with tables
          }
      } catch (e) {
          toast.error('Error creando puesto');
      } finally {
          setIsCreatingPolling(false);
      }
  };

  const handleSavePollingPlace = async () => {
      if (!selectedPolling) {
          toast.error('Selecciona Puesto');
          return;
      }

      if (!manualTableNumber) {
          toast.error('Ingresa número de mesa');
          return;
      }

      try {
          const res = await assignPollingPlace(contact.id, selectedPolling.id, manualTableNumber);
          if (res.success) {
              toast.success('Puesto de votación actualizado');
              setIsEditingPolling(false);
              fetchContact();
          } else {
              toast.error(res.error || 'Error guardando puesto');
          }
      } catch (e) {
          toast.error('Error guardando puesto');
      }
  };

  const handleUpload = async (type: 'front' | 'back') => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*,application/pdf';
    input.onchange = async (e: any) => {
        const file = e.target.files?.[0];
        if (!file) return;

        setUploadingState(prev => ({ ...prev, [type]: true }));
        setUploadProgress(prev => ({ ...prev, [type]: 0 }));

        // Simulate Progress
        const interval = setInterval(() => {
            setUploadProgress(prev => {
                const current = prev[type] || 0;
                if (current >= 90) return prev;
                return { ...prev, [type]: current + 10 };
            });
        }, 300);

        const formData = new FormData();
        formData.append('contactId', contact.id);
        formData.append('type', type);
        formData.append('file', file);

        try {
            const res = await uploadEvidenceAction(formData);
            clearInterval(interval);
            setUploadProgress(prev => ({ ...prev, [type]: 100 }));
            
            if (res.success) {
                toast.success('Documento cargado exitosamente');
                fetchContact();
            } else {
                // Specific Server Error
                throw new Error(res.error || 'Error en subida');
            }
        } catch (error: any) {
            clearInterval(interval);
            console.error('Upload Error Details:', error);
            
            const msg = error.message || '';
            if (msg.includes('413')) {
                toast.error('Archivo demasiado grande (Max 5MB)');
            } else if (msg.includes('403')) {
                 toast.error('Permiso Denegado (403). Verifica RLS en Supabase.');
            } else {
                toast.error(`Error subiendo documento: ${msg}`);
            }
        } finally {
            setTimeout(() => {
                setUploadingState(prev => ({ ...prev, [type]: false }));
                setUploadProgress(prev => ({ ...prev, [type]: 0 }));
            }, 1000);
        }
    };
    input.click();
  };

  if (loading) return <div className="p-8 text-center animate-pulse">Cargando perfil seguro...</div>;
  if (!contact) return <div className="p-8 text-center text-red-500">Acceso denegado.</div>;

  const { person, leader, territory, electoralHistory, logs } = contact;
  const activeElectoral = electoralHistory?.[0] || {};
  // Prioritize Person's polling place (Simplified Flow), then Electoral History (Legacy)
  const pollingPlace = person.pollingPlace || activeElectoral.pollingPlace;
  const pollingTable = activeElectoral.pollingTable;

  const DocViewer = ({ label, url, type }: any) => {
    const isUploading = uploadingState[type];
    const progress = uploadProgress[type] || 0;

    return (
    <div className="border rounded-xl p-4 bg-slate-50 flex flex-col items-center gap-3 relative overflow-hidden group/doc">
        <span className="text-sm font-bold text-slate-600">{label}</span>
        
        {/* Forensic Watermark */}
        <div className="absolute inset-0 pointer-events-none opacity-5 z-10 flex items-center justify-center -rotate-45">
            <span className="text-4xl font-bold">{renderHash}</span>
        </div>

        {url ? (
            url.includes('PROTECTED') ? (
                <div className="w-full h-32 bg-slate-200 rounded-lg flex flex-col items-center justify-center text-slate-500 gap-2 relative z-20">
                    <Lock className="w-8 h-8" />
                    <span className="text-xs font-bold">CONFIDENCIAL</span>
                    <span className="text-[10px] bg-slate-300 px-2 py-0.5 rounded text-slate-600">ID: {renderHash}</span>
                </div>
            ) : (
                <div 
                    onClick={() => handleViewDocument(url, type)}
                    className="w-full h-32 bg-slate-800 rounded-lg flex items-center justify-center relative overflow-hidden group cursor-pointer z-20 hover:ring-4 ring-brand-green-200 transition-all"
                >
                    <div className="text-white text-xs opacity-50 font-bold">VER DOCUMENTO</div>
                    <Eye className="absolute text-white w-8 h-8 opacity-0 group-hover:opacity-100 transition-opacity scale-75 group-hover:scale-100 duration-300" />
                    <span className="absolute bottom-2 right-2 text-[10px] text-green-400 font-bold bg-black/50 px-2 rounded">CARGADO</span>
                    {/* Thumbnail simulation (in real app, use signed url for thumbnail too) */}
                    <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent opacity-60" />
                </div>
            )
        ) : (
            <div className="w-full h-32 border-2 border-dashed border-red-300 bg-red-50 rounded-lg flex flex-col items-center justify-center text-red-400 gap-2 relative z-20">
                <FileText className="w-8 h-8" />
                <span className="text-xs font-bold">PENDIENTE</span>
            </div>
        )}
        
        {/* Actions */}
        {!url && (
            <button 
                disabled={isUploading}
                onClick={() => handleUpload(type)}
                className={`text-xs text-white px-4 py-2 rounded-lg font-bold flex items-center gap-2 hover:opacity-90 z-20 shadow-md transition-all ${isUploading ? 'bg-gray-400' : 'bg-blue-600'}`}
            >
                {isUploading ? `Subiendo ${progress}%` : 'Subir Cédula'} <Upload className="w-3 h-3" />
            </button>
        )}
        
        {/* Progress Bar */}
        {isUploading && (
            <div className="w-full h-2 bg-gray-200 rounded-full mt-2 overflow-hidden z-20">
                <div className="h-full bg-blue-500 transition-all duration-300" style={{ width: `${progress}%` }} />
            </div>
        )}

         {url && (
            <div className="text-xs text-green-600 font-black flex items-center gap-1 mt-2">
                <ShieldCheck className="w-4 h-4" /> DOCUMENTO CARGADO
            </div>
        )}
    </div>
  )};

  const AuditDetails = ({ details }: { details: any }) => {
      if (!details) return null;
      let data = {};
      try {
          data = typeof details === 'string' ? JSON.parse(details) : details;
      } catch (e) { return null; }

      const formatLabel = (key: string) => {
          const map: any = {
              transportNeed: 'Necesidad Transporte',
              newPollingPlace: 'Nuevo Puesto (ID)',
              newTable: 'Nueva Mesa',
              type: 'Tipo Doc',
              path: 'Ruta Archivo',
              contactName: 'Nombre Contacto',
              viewer: 'Visualizador',
              targetName: 'Nombre Objetivo',
              role: 'Rol',
              _snapshotRole: 'Rol (Snapshot)',
              name: 'Nombre',
              origin: 'Origen'
          };
          return map[key] || key;
      };

      const formatValue = (val: any) => {
          if (val === 'transport') return 'Requiere Transporte';
          if (val === 'walk') return 'Camina / Propio';
          if (val === 'front') return 'Cédula (Frente)';
          if (val === 'back') return 'Cédula (Reverso)';
          return String(val);
      };

      return (
          <div className="mt-1 flex flex-wrap gap-2">
              {Object.entries(data).map(([key, val]) => (
                  <span key={key} className="inline-flex items-center gap-1 text-[10px] bg-slate-100 px-2 py-1 rounded text-slate-600 font-medium">
                      <span className="font-bold text-slate-400 uppercase tracking-tighter">{formatLabel(key)}:</span>
                      <span>{formatValue(val)}</span>
                  </span>
              ))}
          </div>
      );
  };

  return (
    <div className="max-w-5xl mx-auto space-y-6 pb-20">
      
      {/* Header */}
      <div className="flex flex-col md:flex-row items-start md:items-center gap-6 bg-white p-6 rounded-2xl shadow-sm border border-slate-100 relative overflow-hidden">
        <div className="absolute top-0 right-0 p-2 opacity-5">
            <ShieldCheck className="w-48 h-48 text-brand-black" />
        </div>
        
        <div className="w-20 h-20 bg-brand-black rounded-2xl flex items-center justify-center text-3xl font-black text-white z-10 shadow-lg">
            {person.fullName?.charAt(0)}
        </div>
        <div className="z-10 flex-1">
            <div className="flex items-center gap-4">
                <h1 className="text-3xl font-black text-slate-900 tracking-tight">{person.fullName}</h1>
                {(currentUser?.role === 'ADMIN' || currentUser?.role === 'COORDINATOR') && (
                    <button 
                        onClick={() => setIsEditingProfile(true)}
                        className="p-2 bg-slate-100 hover:bg-slate-200 text-slate-600 rounded-full transition-all"
                        title="Editar Datos Personales"
                    >
                        <Edit className="w-4 h-4" />
                    </button>
                )}
            </div>
            <div className="flex flex-wrap items-center gap-4 text-sm text-slate-500 mt-2 font-bold">
                <span className="flex items-center gap-1 bg-slate-50 px-3 py-1 rounded-lg"><Phone className="w-4 h-4" /> {person.phone}</span>
                <span className="flex items-center gap-1 bg-slate-50 px-3 py-1 rounded-lg"><MapPin className="w-4 h-4" /> {territory?.name || 'Sin Territorio'}</span>
                <span className="flex items-center gap-1 bg-slate-50 px-3 py-1 rounded-lg"><User className="w-4 h-4" /> Líder: {leader?.fullName}</span>
                <span className={`px-3 py-1 rounded-lg uppercase text-[10px] font-black ${
                    contact.status === 'active' ? 'bg-green-100 text-green-700' : 
                    contact.status === 'suspended' ? 'bg-amber-100 text-amber-700' : 'bg-red-100 text-red-700'
                }`}>
                    {contact.status}
                </span>
            </div>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        
        {/* Evidence Section */}
        <div className="bg-white p-8 rounded-2xl shadow-sm border border-slate-100">
            <div className="flex justify-between items-center mb-6">
                <h3 className="font-black text-lg text-slate-800 flex items-center gap-2">
                    <FileText className="w-5 h-5 text-brand-blue" />
                    Evidencia Digital
                </h3>
                <span className="text-[10px] text-slate-400 font-mono">HASH: {renderHash}</span>
            </div>
            <div className="grid grid-cols-2 gap-4">
                <DocViewer label="Cédula (Frente)" url={person.idCardFrontUrl} type="front" />
                <DocViewer label="Cédula (Reverso)" url={person.idCardBackUrl} type="back" />
            </div>
        </div>

        {/* Logistic Section */}
        <div className="bg-white p-8 rounded-2xl shadow-sm border border-slate-100 flex flex-col">
            <div className="flex justify-between items-start mb-6">
                <h3 className="font-black text-lg text-slate-800 flex items-center gap-2">
                    <MapPin className="w-5 h-5 text-brand-green" />
                    Puesto de Votación
                </h3>
                <button 
                    onClick={() => setIsEditingPolling(true)}
                    className="text-xs bg-slate-100 hover:bg-slate-200 text-slate-600 px-3 py-1.5 rounded-lg font-bold flex items-center gap-1 transition-colors"
                >
                    <Edit className="w-3 h-3" /> Editar
                </button>
            </div>

            <div className="space-y-4 flex-1">
                <div className="p-5 bg-slate-50 rounded-xl border border-slate-200">
                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Puesto Asignado</label>
                    <div className="text-slate-900 font-bold text-lg mt-1">{pollingPlace?.name || 'NO ASIGNADO'}</div>
                    <div className="text-xs text-slate-500 font-medium">{pollingPlace?.address || ''}</div>
                </div>
                <div className="flex gap-4">
                    <div className="flex-1 p-5 bg-slate-50 rounded-xl border border-slate-200">
                        <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Mesa</label>
                        <div className="text-slate-900 font-black text-2xl mt-1">{person.tableNumber || pollingTable?.tableNumber || '--'}</div>
                    </div>
                    <div className="flex-1 p-5 bg-slate-50 rounded-xl border border-slate-200 flex flex-col justify-between">
                        <div className="flex justify-between items-center">
                            <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Transporte (Día D)</label>
                            {showTransportSaved && <CheckCircle className="w-4 h-4 text-green-500 animate-in fade-in" />}
                        </div>
                        <div className="flex items-center gap-3 mt-2">
                            {(() => {
                                const isNeeded = contact.transportNeed || (activeElectoral.transportNeed === 'transport');
                                return (
                                    <>
                                        <div className={`w-10 h-6 rounded-full p-1 transition-colors cursor-pointer ${isNeeded ? 'bg-brand-green-500' : 'bg-slate-300'}`}
                                            onClick={() => handleTransportToggle(!isNeeded)}
                                        >
                                            <div className={`w-4 h-4 bg-white rounded-full shadow-sm transition-transform ${isNeeded ? 'translate-x-4' : ''}`} />
                                        </div>
                                        <span className="text-xs font-bold text-slate-600">{isNeeded ? 'SI' : 'NO'}</span>
                                    </>
                                );
                            })()}
                        </div>
                    </div>
                </div>
            </div>
        </div>

      </div>

      {/* Audit Log */}
      <div className="bg-slate-50 p-8 rounded-2xl border border-slate-200">
          <h3 className="font-black text-sm text-slate-500 uppercase tracking-widest mb-4 flex items-center gap-2">
              <History className="w-4 h-4" /> Historial de Actividad
          </h3>
          <div className="space-y-3">
              {logs && logs.length > 0 ? logs.map((log: any) => (
                  <div key={log.id} className="flex items-start gap-3 text-xs border-b border-slate-200 pb-3 last:border-0 last:pb-0">
                      <div className="w-6 h-6 rounded-full bg-slate-200 flex items-center justify-center font-bold text-slate-500">
                          {log.user?.fullName?.charAt(0) || '?'}
                      </div>
                      <div>
                          <p className="font-bold text-slate-700">{log.action}</p>
                          <p className="text-slate-500">{log.user?.fullName || 'Sistema'} - {new Date(log.createdAt).toLocaleString()}</p>
                          <AuditDetails details={log.details} />
                      </div>
                  </div>
              )) : (
                  <div className="text-slate-400 italic text-xs">Sin actividad registrada reciente.</div>
              )}
          </div>
      </div>

      {/* Edit Polling Place Modal */}
      {isEditingPolling && (
          <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4 backdrop-blur-sm animate-in fade-in">
              <div className="bg-white w-full max-w-lg rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
                  <div className="p-6 border-b border-slate-100 flex justify-between items-center bg-slate-50">
                      <h3 className="font-black text-lg text-slate-800">Editar Puesto de Votación</h3>
                      <button onClick={() => setIsEditingPolling(false)} className="p-2 hover:bg-slate-200 rounded-full transition-colors"><X className="w-5 h-5" /></button>
                  </div>
                  
                  <div className="p-6 space-y-4 flex-1 overflow-y-auto">
                      <div className="relative">
                        <Search className="absolute left-3 top-3 w-5 h-5 text-slate-400" />
                        <input 
                            type="text" 
                            className="w-full pl-10 pr-4 py-3 bg-slate-50 border-2 border-slate-100 rounded-xl font-bold text-sm focus:border-brand-black outline-none"
                            placeholder="Buscar puesto..."
                            value={pollingSearch}
                            onChange={(e) => setPollingSearch(e.target.value)}
                            autoFocus
                        />
                      </div>

                      <div className="space-y-2">
                          {pollingResults.map((place) => (
                              <div 
                                key={place.id} 
                                onClick={() => { setSelectedPolling(place); setSelectedTable(''); }}
                                className={`p-3 rounded-xl cursor-pointer border-2 transition-all ${selectedPolling?.id === place.id ? 'border-brand-blue bg-blue-50' : 'border-transparent hover:bg-slate-50'}`}
                              >
                                  <div className="font-bold text-slate-800 text-sm">{place.name}</div>
                                  <div className="text-xs text-slate-500">{place.tables.length} Mesas</div>
                              </div>
                          ))}
                          {pollingSearch.length > 2 && pollingResults.length === 0 && (
                              <div className="text-center py-4 space-y-3">
                                  <div className="text-slate-400 text-xs">No se encontraron puestos.</div>
                                  <button 
                                    onClick={handleCreateManualPolling}
                                    disabled={isCreatingPolling}
                                    className="text-brand-blue font-black text-xs uppercase flex items-center justify-center gap-2 mx-auto hover:underline disabled:opacity-50"
                                  >
                                      <PlusCircle className="w-4 h-4" /> Crear &quot;{pollingSearch}&quot; Manualmente
                                  </button>
                              </div>
                          )}
                      </div>

                      {selectedPolling && (
                          <div className="mt-4 animate-in slide-in-from-bottom-2 space-y-4">
                              <div>
                                <label className="text-[10px] font-black text-slate-400 uppercase mb-2 block tracking-widest">Número de Mesa</label>
                                <input 
                                    type="number"
                                    className="w-full px-4 py-3 bg-slate-50 border-2 border-slate-100 rounded-xl font-black text-lg focus:border-brand-black outline-none"
                                    placeholder="Ej. 14"
                                    value={manualTableNumber}
                                    onChange={(e) => setManualTableNumber(e.target.value)}
                                />
                              </div>

                              <div>
                                <label className="text-[10px] font-black text-slate-400 uppercase mb-2 block tracking-widest">Mesas Disponibles (Referencia)</label>
                                <div className="grid grid-cols-5 gap-2">
                                    {selectedPolling.tables?.map((t: any) => (
                                        <button
                                            key={t.id}
                                            type="button"
                                            onClick={() => setManualTableNumber(t.tableNumber)}
                                            className={`py-2 rounded-lg font-bold text-sm transition-all ${manualTableNumber === t.tableNumber ? 'bg-brand-black text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}
                                        >
                                            {t.tableNumber}
                                        </button>
                                    ))}
                                </div>
                              </div>
                          </div>
                      )}
                  </div>

                  <div className="p-6 border-t border-slate-100 bg-slate-50 flex justify-end gap-3">
                      <button onClick={() => setIsEditingPolling(false)} className="px-5 py-3 rounded-xl font-bold text-slate-600 hover:bg-slate-200 transition-colors">Cancelar</button>
                      <button onClick={handleSavePollingPlace} className="px-5 py-3 rounded-xl font-bold bg-brand-black text-white hover:opacity-90 transition-opacity flex items-center gap-2">
                          <Save className="w-4 h-4" /> Guardar Cambios
                      </button>
                  </div>
              </div>
          </div>
      )}

      {/* EDIT PROFILE DIALOG */}
      {isEditingProfile && (
          <EditProfileDialog 
            contactId={contact.id}
            initialData={{
                fullName: person.fullName,
                phone: person.phone,
                address: person.address || '',
                status: contact.status || 'active',
                territoryId: contact.territoryId || ''
            }}
            userRole={currentUser?.role}
            onClose={() => setIsEditingProfile(false)}
            onSuccess={fetchContact}
          />
      )}

      {/* DOCUMENT VIEWER MODAL */}
      {viewingDoc && (
          <div className="fixed inset-0 bg-black/90 z-[60] flex items-center justify-center p-4 backdrop-blur-md animate-in fade-in">
              <div className="w-full max-w-4xl h-[80vh] flex flex-col relative">
                  {/* Toolbar */}
                  <div className="absolute top-0 left-0 right-0 p-4 flex justify-between items-start z-10 bg-gradient-to-b from-black/80 to-transparent">
                      <div className="text-white">
                          <h3 className="font-bold text-lg">{person.fullName}</h3>
                          <p className="text-xs text-slate-300 uppercase tracking-widest">{viewingDoc.type === 'front' ? 'Cédula Frontal' : 'Cédula Reverso'}</p>
                      </div>
                      <div className="flex gap-3">
                           {secureUrl && (
                               <a 
                                 href={secureUrl} 
                                 download={`cedula_${person.id}_${viewingDoc.type}.jpg`}
                                 className="p-3 bg-white/10 hover:bg-white/20 text-white rounded-full transition-colors backdrop-blur-sm"
                                 title="Descargar Original"
                               >
                                   <Download className="w-5 h-5" />
                               </a>
                           )}
                           <button 
                             onClick={() => setViewingDoc(null)} 
                             className="p-3 bg-white/10 hover:bg-red-500/80 text-white rounded-full transition-colors backdrop-blur-sm"
                           >
                               <X className="w-5 h-5" />
                           </button>
                      </div>
                  </div>

                  {/* Content */}
                  <div className="flex-1 flex items-center justify-center bg-black rounded-lg overflow-hidden relative border border-slate-800 shadow-2xl">
                      {loadingDoc ? (
                          <div className="flex flex-col items-center gap-3 text-brand-green-400 animate-pulse">
                              <ShieldCheck className="w-12 h-12" />
                              <span className="text-xs font-mono uppercase tracking-widest">Verificando Credenciales...</span>
                          </div>
                      ) : secureUrl ? (
                          <div className="relative w-full h-full">
                            <Image 
                                src={secureUrl} 
                                alt="Evidencia Segura" 
                                fill
                                className="object-contain"
                                unoptimized
                            />
                          </div>
                      ) : (
                          <div className="text-red-400 flex flex-col items-center gap-2">
                              <WifiOff className="w-8 h-8" />
                              <span className="text-sm font-bold">Error de Carga Segura</span>
                          </div>
                      )}

                      {/* Security Watermark Overlay */}
                      <div className="absolute inset-0 pointer-events-none flex items-center justify-center opacity-[0.03] select-none overflow-hidden">
                           <div className="transform -rotate-45 whitespace-nowrap text-[10rem] font-black text-white">
                               CONFIDENTIAL
                           </div>
                      </div>
                  </div>
                  
                  <div className="text-center text-[10px] text-slate-500 mt-2 font-mono">
                      ACCESO AUDITADO: {new Date().toLocaleString()} &bull; ID: {renderHash}
                  </div>
              </div>
          </div>
      )}

    </div>
  );
}
