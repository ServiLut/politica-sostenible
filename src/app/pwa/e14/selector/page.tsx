'use client';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Search, ChevronRight, AlertTriangle } from 'lucide-react';

export default function E14SelectorPage() {
  const router = useRouter();
  const [tableId, setTableId] = useState('');
  const [error, setError] = useState('');

  const handleGo = (e: React.FormEvent) => {
    e.preventDefault();
    if (!tableId || tableId.length < 4) {
        setError('Ingresa un código de mesa válido (Min. 4 dígitos)');
        return;
    }
    // Redirigir a la interfaz de carga segura
    router.push(`/pwa/e14/${tableId}`);
  };

  return (
    <div className="min-h-screen bg-brand-gray-900 flex items-center justify-center p-6 font-sans text-white">
      <div className="max-w-md w-full space-y-8 animate-in zoom-in duration-500">
        
        <div className="text-center space-y-2">
            <div className="w-20 h-20 bg-brand-green-500 rounded-3xl mx-auto flex items-center justify-center shadow-[0_0_40px_rgba(34,197,94,0.3)] mb-6">
                <Search className="w-10 h-10 text-black" />
            </div>
            <h1 className="text-3xl font-black tracking-tight">Portal de Testigos</h1>
            <p className="text-slate-400 font-medium">Sistema de Transmisión E-14 Segura</p>
        </div>

        <div className="bg-slate-800/50 p-8 rounded-3xl border border-slate-700 backdrop-blur-sm">
            <form onSubmit={handleGo} className="space-y-6">
                <div className="space-y-2">
                    <label className="text-xs font-bold text-brand-green-400 uppercase tracking-widest ml-1">Código de Mesa / Puesto</label>
                    <input 
                        type="tel" // Keypad numérico en móviles
                        autoFocus
                        placeholder="Ej. 12345"
                        className="w-full bg-slate-900 border-2 border-slate-700 rounded-2xl p-4 text-center text-2xl font-black tracking-widest text-white focus:border-brand-green-500 outline-none transition-all placeholder:text-slate-600"
                        value={tableId}
                        onChange={e => setTableId(e.target.value.replace(/\D/g, ''))} // Solo números
                    />
                </div>

                {error && (
                    <div className="flex items-center gap-2 text-red-400 text-xs font-bold bg-red-500/10 p-3 rounded-xl border border-red-500/20">
                        <AlertTriangle className="w-4 h-4 flex-shrink-0" />
                        {error}
                    </div>
                )}

                <button 
                    type="submit" 
                    className="w-full h-[70px] bg-brand-green-500 text-black rounded-2xl font-black uppercase tracking-widest text-sm hover:bg-brand-green-400 active:scale-95 transition-all shadow-xl shadow-brand-green-500/20 flex items-center justify-center gap-2"
                >
                    Iniciar Transmisión <ChevronRight className="w-5 h-5" />
                </button>
            </form>
        </div>

        <p className="text-center text-[10px] text-slate-600 font-mono uppercase tracking-widest">
            Acceso Restringido &bull; Monitoreado por IP
        </p>

      </div>
    </div>
  );
}
