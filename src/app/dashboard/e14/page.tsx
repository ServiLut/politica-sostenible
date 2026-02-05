'use client';

import React, { useState, useEffect } from 'react';
import Image from 'next/image';
import { ShieldCheck, MapPin, Table, CheckCircle, AlertTriangle, Eye, X, ZoomIn, Loader2 } from 'lucide-react';
import { getUploadedE14s, updateE14Status } from '@/app/actions/e14';
import { toast } from 'sonner';

export default function EscrutinioPage() {
  const [records, setRecords] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedImage, setSelectedImage] = useState<string | null>(null);

  useEffect(() => {
    fetchRecords();
  }, []);

  const fetchRecords = async () => {
    setLoading(true);
    try {
      const data = await getUploadedE14s();
      setRecords(data);
    } catch (e) {
      toast.error('Error cargando actas');
    } finally {
      setLoading(false);
    }
  };

  const handleStatusUpdate = async (id: string, status: 'VALIDATED' | 'ANOMALY') => {
    try {
      const res = await updateE14Status(id, status);
      if (res.success) {
        toast.success(`E-14 marcado como ${status === 'VALIDATED' ? 'Válido' : 'Anomalía'}`);
        fetchRecords();
      } else {
        toast.error('Error al actualizar estado');
      }
    } catch (e) {
      toast.error('Fallo de conexión');
    }
  };

  return (
    <div className="space-y-8 pb-12 animate-in fade-in duration-500">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-black text-brand-black tracking-tight">Auditoría de Escrutinio (E-14)</h1>
          <p className="text-brand-gray-500 font-bold uppercase text-xs tracking-widest mt-1">Verificación de actas en tiempo real</p>
        </div>
        <div className="bg-brand-gray-100 px-4 py-2 rounded-2xl flex items-center gap-2">
            <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse" />
            <span className="text-[10px] font-black uppercase tracking-tighter text-brand-gray-600">{records.length} Actas Recibidas</span>
        </div>
      </div>

      {loading ? (
        <div className="flex flex-col items-center justify-center py-20 text-brand-gray-400">
          <Loader2 className="w-10 h-10 animate-spin mb-4" />
          <p className="font-black uppercase tracking-widest text-xs">Consultando Archivo Digital...</p>
        </div>
      ) : records.length > 0 ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {records.map((record) => (
            <div key={record.id} className="card-friendly overflow-hidden flex flex-col group">
              {/* Photo Area */}
              <div className="relative h-64 bg-slate-900 overflow-hidden cursor-zoom-in" onClick={() => setSelectedImage(record.e14PhotoUrl)}>
                <Image 
                  src={record.e14PhotoUrl} 
                  alt={`E-14 Mesa ${record.pollingTable?.tableNumber}`}
                  fill
                  className="object-cover opacity-80 group-hover:opacity-100 transition-all group-hover:scale-105"
                  unoptimized
                />
                <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent" />
                <div className="absolute top-4 right-4 bg-white/10 backdrop-blur-md p-2 rounded-full text-white">
                    <ZoomIn className="w-4 h-4" />
                </div>
                
                <div className="absolute bottom-4 left-4 text-white">
                    <div className="text-2xl font-black">Mesa #{record.pollingTable?.tableNumber}</div>
                    <div className="text-[10px] font-bold uppercase opacity-80 flex items-center gap-1">
                        <MapPin className="w-3 h-3" /> {record.pollingPlace?.name}
                    </div>
                </div>
              </div>

              {/* Info & Actions */}
              <div className="p-5 flex-1 flex flex-col">
                <div className="flex items-center justify-between mb-4">
                    <span className="text-[10px] font-black text-brand-gray-400 uppercase tracking-widest">{record.pollingPlace?.territory?.name}</span>
                    <span className={`px-2 py-0.5 rounded text-[9px] font-black uppercase ${
                        record.status === 'VALIDATED' ? 'bg-green-100 text-green-700' : 
                        record.status === 'ANOMALY' ? 'bg-red-100 text-red-700' : 'bg-amber-100 text-amber-700'
                    }`}>
                        {record.status}
                    </span>
                </div>

                <div className="mt-auto flex gap-2">
                    <button 
                        onClick={() => handleStatusUpdate(record.id, 'VALIDATED')}
                        disabled={record.status === 'VALIDATED'}
                        className="flex-1 flex items-center justify-center gap-2 py-3 bg-brand-green-500 hover:bg-brand-green-600 text-white rounded-xl text-xs font-black uppercase transition-all shadow-lg shadow-brand-green-500/20 disabled:opacity-50"
                    >
                        <CheckCircle className="w-4 h-4" /> Validar
                    </button>
                    <button 
                        onClick={() => handleStatusUpdate(record.id, 'ANOMALY')}
                        disabled={record.status === 'ANOMALY'}
                        className="flex-1 flex items-center justify-center gap-2 py-3 bg-red-500 hover:bg-red-600 text-white rounded-xl text-xs font-black uppercase transition-all shadow-lg shadow-red-500/20 disabled:opacity-50"
                    >
                        <AlertTriangle className="w-4 h-4" /> Anomalía
                    </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="text-center py-20 card-friendly bg-brand-gray-50 border-dashed">
            <ShieldCheck className="w-12 h-12 text-brand-gray-200 mx-auto mb-4" />
            <p className="text-brand-gray-400 font-bold italic">No hay actas E-14 pendientes de revisión.</p>
        </div>
      )}

      {/* ZOOM MODAL */}
      {selectedImage && (
        <div className="fixed inset-0 z-[100] bg-black/95 backdrop-blur-xl flex flex-col animate-in fade-in" onClick={() => setSelectedImage(null)}>
            <div className="p-6 flex justify-between items-center text-white">
                <div className="font-black uppercase tracking-[0.2em] text-xs">Previsualización de Acta E-14</div>
                <button className="p-2 hover:bg-white/10 rounded-full transition-colors">
                    <X className="w-8 h-8" />
                </button>
            </div>
            <div className="flex-1 overflow-auto p-4 flex items-center justify-center relative">
                <Image 
                    src={selectedImage} 
                    alt="E-14 Zoom" 
                    fill
                    className="object-contain shadow-2xl"
                    onClick={(e) => e.stopPropagation()}
                    unoptimized
                />
            </div>
            <div className="p-8 text-center text-white/40 text-[10px] font-mono uppercase tracking-widest">
                Acceso Auditado - {new Date().toLocaleString()}
            </div>
        </div>
      )}
    </div>
  );
}
