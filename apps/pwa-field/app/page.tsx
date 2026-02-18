'use client';

import { useState, useEffect } from 'react';
import { Scan, Shield, Users, LogOut, Zap, Wifi, WifiOff } from 'lucide-react';

export default function FieldHomePage() {
  const [isOnline, setIsOnline] = useState(true);

  useEffect(() => {
    setIsOnline(window.navigator.onLine);
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  const actions = [
    { title: 'Recolectar Firma', icon: Scan, color: 'bg-blue-600' },
    { title: 'Reportar E-14', icon: Shield, color: 'bg-emerald-600' },
    { title: 'Mis Simpatizantes', icon: Users, color: 'bg-purple-600' },
  ];

  return (
    <div className="min-h-screen flex flex-col p-6 space-y-8">
      <header className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-black tracking-tighter uppercase">Politica Sostenible <span className="text-blue-500">Field</span></h1>
          <div className="flex items-center gap-2">
            <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Operación Día D</p>
            {isOnline ? (
              <span className="flex items-center gap-1 text-[8px] font-black text-emerald-500 bg-emerald-500/10 px-2 py-0.5 rounded-full">
                <Wifi className="h-2 w-2" /> ONLINE
              </span>
            ) : (
              <span className="flex items-center gap-1 text-[8px] font-black text-amber-500 bg-amber-500/10 px-2 py-0.5 rounded-full">
                <WifiOff className="h-2 w-2" /> MODO OFFLINE
              </span>
            )}
          </div>
        </div>
        <div className="h-10 w-10 rounded-full bg-slate-800 flex items-center justify-center border border-slate-700">
          <Zap className="h-5 w-5 text-yellow-400" />
        </div>
      </header>

      <div className="bg-slate-800 rounded-3xl p-6 border border-slate-700 shadow-2xl">
        <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-1">Mi Desempeño</p>
        <p className="text-3xl font-black">1,450 <span className="text-sm text-slate-500 uppercase">pts</span></p>
        <div className="mt-4 h-2 bg-slate-900 rounded-full overflow-hidden">
          <div className="h-full bg-blue-500 w-[65%]" />
        </div>
        <p className="mt-2 text-[10px] font-bold text-slate-400">Nivel 4 - Próximo nivel en 250 pts</p>
      </div>

      <div className="flex-1 grid grid-cols-1 gap-4">
        {actions.map((action, i) => (
          <button key={i} className={`flex items-center gap-4 p-6 rounded-3xl ${action.color} text-white shadow-lg active:scale-95 transition-transform text-left`}>
            <div className="p-3 bg-white/20 rounded-2xl">
              <action.icon className="h-6 w-6" />
            </div>
            <span className="text-lg font-black uppercase tracking-tight">{action.title}</span>
          </button>
        ))}
      </div>

      <footer className="pt-8">
        <button className="w-full flex items-center justify-center gap-2 p-4 text-slate-500 font-bold uppercase text-xs tracking-widest hover:text-red-400 transition-colors">
          <LogOut className="h-4 w-4" /> Cerrar Sesión Segura
        </button>
      </footer>
    </div>
  );
}
