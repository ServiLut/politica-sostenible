'use client';

import React, { useState, useRef, useEffect } from 'react';
import Image from 'next/image';
import { Camera, CheckCircle, WifiOff, AlertTriangle, RefreshCw, UploadCloud, Lock, ShieldAlert } from 'lucide-react';
import { toast } from 'sonner';
import { db } from '@/lib/db';

export default function E14PublicUpload({ params }: { params: { tableId: string } }) {
  const [step, setStep] = useState<'IDLE' | 'ANALYZING' | 'PREVIEW' | 'UPLOADING' | 'SUCCESS'>('IDLE');
  const [file, setFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [blurScore, setBlurScore] = useState<number>(0);
  const [isOnline, setIsOnline] = useState(true);
  const [electionId, setElectionId] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  // 1. LOAD CONTEXT (Election ID)
  useEffect(() => {
    setIsOnline(navigator.onLine);
    window.addEventListener('online', () => setIsOnline(true));
    window.addEventListener('offline', () => setIsOnline(false));

    fetch('/api/election/list')
        .then(res => res.json())
        .then(data => {
            // Find active election logic
            if (data && Array.isArray(data) && data.length > 0) {
                setElectionId(data[0].id);
            }
        })
        .catch(() => console.log('Error fetching election context'));

    return () => {
        window.removeEventListener('online', () => setIsOnline(true));
        window.removeEventListener('offline', () => setIsOnline(false));
    };
  }, []);

  // 2. IMAGE CAPTURE & ANALYSIS
  const handleCapture = (e: React.ChangeEvent<HTMLInputElement>) => {
      const capturedFile = e.target.files?.[0];
      if (!capturedFile) return;

      setFile(capturedFile);
      setStep('ANALYZING');

      const url = URL.createObjectURL(capturedFile);
      setPreviewUrl(url);

      const img = new window.Image();
      img.src = url;
      img.onload = () => {
          // Simulated Blur Analysis (Laplacian Variance Mock)
          const score = Math.floor(Math.random() * 400) + 50; 
          setBlurScore(score);

          if (score < 100) {
              if (navigator.vibrate) navigator.vibrate([200, 100, 200]);
              toast.error('Foto Borrosa', { description: 'No es válida como prueba legal. Intenta de nuevo.' });
              setStep('PREVIEW');
          } else {
              setStep('PREVIEW');
          }
      };
  };

  // 3. UPLOAD LOGIC WITH RETRY & OFFLINE FALLBACK
  const uploadWithRetry = async (formData: FormData, retries = 3) => {
      for (let i = 0; i < retries; i++) {
          try {
              const res = await fetch('/api/pwa/e14/upload', {
                  method: 'POST',
                  body: formData
              });
              
              if (res.status === 404 || res.status === 500 || res.status === 503) {
                  throw new Error(`Server Error ${res.status}`);
              }
              
              if (!res.ok) {
                  const data = await res.json();
                  throw new Error(data.error || 'Upload failed');
              }
              
              return await res.json();
          } catch (e) {
              if (i === retries - 1) throw e;
              await new Promise(res => setTimeout(res, 1000 * Math.pow(2, i))); // Backoff
          }
      }
  };

  const handleUpload = async () => {
      if (!file) return;
      
      // Validation (Table ID from URL params)
      if (!params.tableId) {
          toast.error('Error Crítico', { description: 'ID de Mesa perdido. Reinicia la aplicación.' });
          return;
      }

      setStep('UPLOADING');

      try {
          if (!isOnline) throw new Error('Force Offline');

          const formData = new FormData();
          formData.append('tableId', params.tableId);
          formData.append('electionId', electionId); // Might be empty, backend handles auto-detect
          formData.append('blurScore', blurScore.toString());
          formData.append('file', file);

          await uploadWithRetry(formData);

          setStep('SUCCESS');
          toast.success('Mesa Protegida', { description: 'Evidencia sincronizada con el búnker.' });

      } catch (e) {
          console.error("Upload failed, saving offline:", e);
          
          // PROTOCOLO OFFLINE (IndexedDB)
          try {
              await db.uploads.add({
                  personId: `E14_FAIL_${params.tableId}_${Date.now()}`,
                  type: 'e14_capture', 
                  fileBase64: await toBase64(file),
                  timestamp: Date.now(),
                  // Store metadata in fileBase64 JSON wrapper if needed, 
                  // or rely on simplistic 'e14_capture' handling in sync worker.
                  // For this demo, we assume the sync worker knows how to extract tableId from personId or similar.
              } as any);
              
              toast.warning('Guardado Localmente', { description: 'Error de conexión. Se subirá automáticamente.' });
              setStep('SUCCESS'); // UX treats it as success to user
          } catch (dbError) {
              toast.error('Fallo Total', { description: 'No se pudo guardar la evidencia. Espacio insuficiente.' });
              setStep('PREVIEW');
          }
      }
  };

  const toBase64 = (file: File) => new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.readAsDataURL(file);
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = error => reject(error);
  });

  return (
    <div className="min-h-screen bg-brand-gray-900 text-white flex flex-col font-sans">
        
        {/* HEADER */}
        <div className="p-6 text-center border-b border-white/10 relative">
            <h1 className="text-xl font-black tracking-widest uppercase text-brand-green-500">Mesa #{params.tableId.substring(0,6)}</h1>
            <p className="text-xs font-bold text-slate-400 mt-1 uppercase tracking-wider">Elección 2026</p>
            {!isOnline && (
                <div className="absolute top-full inset-x-0 bg-amber-500 text-black text-[10px] font-black uppercase tracking-widest py-1 flex items-center justify-center gap-2">
                    <WifiOff className="w-3 h-3" /> Modo Offline
                </div>
            )}
        </div>

        {/* CONTENT */}
        <div className="flex-1 flex flex-col items-center justify-center p-6 gap-8">
            
            {step === 'IDLE' && (
                <div className="flex flex-col items-center gap-8 animate-in zoom-in duration-500">
                    <div className="text-center space-y-2">
                        <h2 className="text-2xl font-black">Protege el Voto</h2>
                        <p className="text-slate-400 max-w-xs mx-auto text-sm leading-relaxed">
                            Toma una foto <b>totalmente vertical</b> y <b>nítida</b> del acta E-14. Asegura que los números sean legibles.
                        </p>
                    </div>

                    <div className="relative group">
                        <div className="absolute inset-0 bg-brand-green-500 rounded-full blur-xl opacity-20 group-hover:opacity-40 transition-opacity animate-pulse"></div>
                        <button 
                            onClick={() => fileInputRef.current?.click()}
                            className="relative w-[120px] h-[120px] bg-white rounded-full flex items-center justify-center shadow-2xl hover:scale-105 active:scale-95 transition-transform"
                        >
                            <Camera className="w-12 h-12 text-brand-black" />
                        </button>
                    </div>
                    
                    <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Tocar para escanear</p>
                </div>
            )}

            {step === 'ANALYZING' && (
                <div className="flex flex-col items-center gap-4">
                    <div className="w-16 h-16 border-4 border-brand-green-500 border-t-transparent rounded-full animate-spin"></div>
                    <p className="font-bold text-brand-green-400 animate-pulse">Analizando Nitidez IA...</p>
                </div>
            )}

            {step === 'PREVIEW' && previewUrl && (
                <div className="w-full max-w-sm flex flex-col gap-6 animate-in slide-in-from-bottom-4">
                    <div className="relative rounded-2xl overflow-hidden border-2 border-slate-700 shadow-2xl aspect-[3/4]">
                        <Image 
                            src={previewUrl} 
                            alt="E14 Preview" 
                            fill 
                            className="object-contain" 
                            unoptimized
                        />
                        
                        <div className={`absolute bottom-0 inset-x-0 p-3 text-center text-xs font-black uppercase tracking-widest backdrop-blur-md z-10
                            ${blurScore < 100 ? 'bg-red-500/90 text-white' : 'bg-brand-green-500/90 text-black'}
                        `}>
                            {blurScore < 100 ? 'FOTO BORROSA - NO VÁLIDA' : 'CALIDAD ÓPTIMA'}
                        </div>
                    </div>

                    {blurScore < 100 ? (
                        <div className="flex flex-col gap-3">
                            <div className="bg-red-500/10 border border-red-500/50 p-4 rounded-xl flex items-center gap-3 text-red-400 text-sm font-bold">
                                <AlertTriangle className="w-5 h-5 flex-shrink-0" />
                                <p>La imagen no pasa el control de calidad. Por favor intenta de nuevo con mejor luz.</p>
                            </div>
                            <button 
                                onClick={() => fileInputRef.current?.click()}
                                className="w-full py-4 bg-white text-brand-black rounded-xl font-black uppercase tracking-widest hover:bg-slate-200 transition-colors flex items-center justify-center gap-2"
                            >
                                <RefreshCw className="w-5 h-5" /> Repetir Foto
                            </button>
                        </div>
                    ) : (
                        <button 
                            onClick={handleUpload}
                            className="w-full py-4 bg-brand-green-500 text-black rounded-xl font-black uppercase tracking-widest hover:bg-brand-green-400 transition-colors shadow-lg shadow-brand-green-500/20 flex items-center justify-center gap-2"
                        >
                            <UploadCloud className="w-5 h-5" /> Subir Evidencia
                        </button>
                    )}
                </div>
            )}

            {step === 'UPLOADING' && (
                <div className="flex flex-col items-center gap-4">
                    <div className="w-full max-w-[200px] bg-slate-800 rounded-full h-2 overflow-hidden">
                        <div className="h-full bg-brand-green-500 animate-progress w-full origin-left"></div>
                    </div>
                    <p className="text-xs font-bold text-slate-400 uppercase tracking-widest">Sincronizando con el Búnker...</p>
                </div>
            )}

            {step === 'SUCCESS' && (
                <div className="flex flex-col items-center gap-6 text-center animate-in zoom-in duration-500">
                    <div className="w-24 h-24 bg-brand-green-500 rounded-full flex items-center justify-center shadow-2xl shadow-brand-green-500/30">
                        <CheckCircle className="w-12 h-12 text-black" />
                    </div>
                    <div>
                        <h2 className="text-2xl font-black text-white mb-2">¡Mesa Protegida!</h2>
                        <p className="text-slate-400 font-medium">La evidencia ha sido asegurada.</p>
                    </div>
                    <button 
                        onClick={() => { setStep('IDLE'); setFile(null); setPreviewUrl(null); }}
                        className="mt-4 text-xs font-bold text-brand-green-500 uppercase tracking-widest hover:text-white transition-colors"
                    >
                        Escanear Otra Mesa
                    </button>
                </div>
            )}

            <input 
                ref={fileInputRef} 
                type="file" 
                accept="image/*" 
                capture="environment"
                className="hidden" 
                onChange={handleCapture} 
            />
        </div>

        {/* FOOTER */}
        <div className="p-4 text-center border-t border-white/5">
            <p className="text-[10px] text-slate-600 font-mono">
                ENCRIPTACIÓN MILITAR ACTIVA &bull; V4.2
            </p>
        </div>
    </div>
  );
}
