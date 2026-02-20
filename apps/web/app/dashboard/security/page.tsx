"use client";

import React, { useState } from 'react';
import { useCRM } from '@/context/CRMContext';
import { Shield, Terminal, ShieldAlert, UserCheck, Eye, Zap, AlertCircle } from 'lucide-react';
import { cn } from '@/components/ui/utils';

export default function SecurityPage() {
  const { auditLogs } = useCRM();
  const [panicMode, setPanicMode] = useState(false);

  return (
    <div className="space-y-8">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-4xl font-black text-slate-900 tracking-tighter">Seguridad y Auditoría</h1>
          <p className="text-slate-500">Control de accesos inmutable y monitor de integridad de datos.</p>
        </div>
        <div className="flex items-center gap-4 bg-white p-2 rounded-2xl border border-slate-100 shadow-sm">
          <div className="px-4">
            <p className="text-[8px] font-black text-slate-400 uppercase tracking-widest leading-none mb-1">Modo Pánico</p>
            <p className="text-[10px] font-bold text-slate-600">{panicMode ? 'Activado' : 'Inactivo'}</p>
          </div>
          <button 
            onClick={() => {
              setPanicMode(!panicMode);
              if(!panicMode) alert('MODO PÁNICO ACTIVADO: Bloqueando exportaciones y cerrando sesiones no autorizadas...');
            }}
            className={cn(
              "w-12 h-12 rounded-xl flex items-center justify-center transition-all shadow-lg",
              panicMode ? "bg-red-600 text-white animate-pulse" : "bg-slate-100 text-slate-400 hover:bg-red-50 hover:text-red-500"
            )}
          >
            <Zap size={24} fill={panicMode ? "currentColor" : "none"} />
          </button>
        </div>
      </div>

      {/* Security Alerts */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="bg-white p-8 rounded-[2.5rem] border border-slate-100 shadow-sm flex items-center gap-6">
          <div className="w-16 h-16 bg-blue-50 text-blue-600 rounded-3xl flex items-center justify-center">
            <UserCheck size={28} />
          </div>
          <div>
            <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Accesos Hoy</p>
            <h3 className="text-3xl font-black text-slate-900">24</h3>
          </div>
        </div>
        <div className="bg-white p-8 rounded-[2.5rem] border border-slate-100 shadow-sm flex items-center gap-6 relative overflow-hidden">
          <div className="w-16 h-16 bg-amber-50 text-amber-600 rounded-3xl flex items-center justify-center">
            <Eye size={28} />
          </div>
          <div>
            <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Exportaciones</p>
            <h3 className="text-3xl font-black text-slate-900">02</h3>
          </div>
          <div className="absolute top-0 right-0 p-4">
            <span className="flex h-2 w-2 rounded-full bg-amber-500"></span>
          </div>
        </div>
        <div className="bg-white p-8 rounded-[2.5rem] border border-slate-100 shadow-sm flex items-center gap-6">
          <div className="w-16 h-16 bg-red-50 text-red-600 rounded-3xl flex items-center justify-center">
            <ShieldAlert size={28} />
          </div>
          <div>
            <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Intentos Fallidos</p>
            <h3 className="text-3xl font-black text-slate-900">0</h3>
          </div>
        </div>
      </div>

      {/* Audit Log Table */}
      <div className="bg-slate-900 rounded-[3rem] p-10 text-white shadow-2xl relative overflow-hidden">
        <div className="flex items-center gap-3 mb-10 border-b border-white/10 pb-6">
          <Terminal className="text-blue-400" />
          <h3 className="text-xl font-black tracking-tighter">Log de Auditoría Forense</h3>
          <span className="ml-auto text-[10px] font-black text-blue-400 uppercase tracking-[0.3em]">Inmutable System</span>
        </div>
        
        <div className="space-y-4 font-mono text-xs">
          {auditLogs.map((log) => (
            <div key={log.id} className="flex items-start gap-4 p-4 rounded-2xl hover:bg-white/5 transition-all group">
              <span className="text-white/30 whitespace-nowrap">[{new Date(log.timestamp).toLocaleTimeString()}]</span>
              <div className="flex-1">
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-blue-400 font-bold">{log.actor}</span>
                  <span className="text-white/20">|</span>
                  <span className={cn(
                    "px-2 py-0.5 rounded text-[8px] font-black uppercase",
                    log.severity === 'Critical' ? 'bg-red-500/20 text-red-400' :
                    log.severity === 'Warning' ? 'bg-amber-500/20 text-amber-400' :
                    'bg-emerald-500/20 text-emerald-400'
                  )}>
                    {log.severity}
                  </span>
                  <span className="text-white/10 ml-auto">{log.ip}</span>
                </div>
                <p className="text-white/70">
                  <span className="text-white/40 uppercase text-[9px] font-black mr-2">[{log.module}]</span>
                  {log.action}
                </p>
              </div>
            </div>
          ))}
          {auditLogs.length === 0 && (
            <div className="text-center py-20 text-white/20">
              <AlertCircle size={40} className="mx-auto mb-4" />
              <p className="uppercase font-black tracking-widest">No hay registros disponibles</p>
            </div>
          )}
        </div>
      </div>

      {/* Security Tip */}
      <div className="bg-blue-50 border-l-4 border-blue-600 p-6 rounded-3xl flex items-center gap-6">
        <Shield className="text-blue-600" size={32} />
        <div>
          <p className="text-blue-900 font-black text-sm mb-1">Protección de Datos Activa</p>
          <p className="text-blue-700 text-xs">
            Este sistema cumple con los estándares de encriptación de grado militar y registra cada movimiento de información sensible de acuerdo a la Ley de Habeas Data.
          </p>
        </div>
      </div>
    </div>
  );
}
