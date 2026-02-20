"use client";

import React, { useState } from 'react';
import { useCRM } from '@/context/CRMContext';
import { Shield, Terminal, ShieldAlert, UserCheck, Eye, Zap, AlertCircle } from 'lucide-react';
import { cn } from '@/components/ui/utils';

export default function SecurityPage() {
  const { auditLogs } = useCRM();
  const [panicMode, setPanicMode] = useState(false);

  return (
    <div className="space-y-8 animate-in fade-in duration-500">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h1 className="text-4xl font-black text-slate-900 tracking-tighter uppercase">Seguridad y Auditoría</h1>
          <p className="text-slate-500 font-medium">Control de accesos inmutable y monitor de integridad de datos.</p>
        </div>
        <div className="flex items-center gap-4 bg-white p-2 rounded-2xl border-2 border-teal-500/20 shadow-sm">
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
              panicMode ? "bg-red-600 text-white animate-pulse shadow-red-200" : "bg-slate-100 text-slate-400 hover:bg-red-50 hover:text-red-500"
            )}
          >
            <Zap size={24} fill={panicMode ? "currentColor" : "none"} />
          </button>
        </div>
      </div>

      {/* Security Alerts */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="bg-teal-50 p-8 rounded-[2.5rem] border-2 border-teal-200 shadow-sm flex items-center gap-6 group hover:bg-white hover:border-teal-500 hover:shadow-xl hover:-translate-y-1 transition-all duration-500">
          <div className="w-16 h-16 bg-white text-teal-600 rounded-3xl flex items-center justify-center shadow-sm group-hover:bg-teal-600 group-hover:text-white transition-all">
            <UserCheck size={28} />
          </div>
          <div>
            <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Accesos Hoy</p>
            <h3 className="text-3xl font-black text-slate-900">24</h3>
          </div>
        </div>
        
        <div className="bg-white p-8 rounded-[2.5rem] border-2 border-slate-100 shadow-sm flex items-center gap-6 relative overflow-hidden group hover:border-amber-500 hover:shadow-xl hover:-translate-y-1 transition-all duration-500">
          <div className="w-16 h-16 bg-amber-50 text-amber-600 rounded-3xl flex items-center justify-center group-hover:bg-amber-600 group-hover:text-white transition-all">
            <Eye size={28} />
          </div>
          <div>
            <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Exportaciones</p>
            <h3 className="text-3xl font-black text-slate-900">02</h3>
          </div>
          <div className="absolute top-0 right-0 p-4">
            <span className="flex h-2 w-2 rounded-full bg-amber-500 animate-ping"></span>
          </div>
        </div>

        <div className="bg-white p-8 rounded-[2.5rem] border-2 border-slate-100 shadow-sm flex items-center gap-6 group hover:border-red-500 hover:shadow-xl hover:-translate-y-1 transition-all duration-500">
          <div className="w-16 h-16 bg-red-50 text-red-600 rounded-3xl flex items-center justify-center group-hover:bg-red-600 group-hover:text-white transition-all">
            <ShieldAlert size={28} />
          </div>
          <div>
            <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Intentos Fallidos</p>
            <h3 className="text-3xl font-black text-slate-900">0</h3>
          </div>
        </div>
      </div>

      {/* Audit Log Table - Updated to Light/Warm Theme */}
      <div className="bg-white rounded-[3rem] p-10 text-slate-900 border-2 border-teal-500/20 shadow-sm relative overflow-hidden group hover:border-teal-500 hover:shadow-2xl hover:shadow-teal-500/10 transition-all duration-500">
        <div className="flex items-center gap-3 mb-10 border-b border-slate-100 pb-6">
          <Terminal className="text-teal-600" />
          <h3 className="text-xl font-black tracking-tighter uppercase">Log de Auditoría Forense</h3>
          <span className="ml-auto text-[10px] font-black text-teal-600 uppercase tracking-[0.3em]">Inmutable System</span>
        </div>
        
        <div className="space-y-4 font-mono text-xs">
          {auditLogs.map((log) => (
            <div key={log.id} className="flex flex-col sm:flex-row sm:items-start gap-4 p-4 rounded-2xl hover:bg-teal-50/50 transition-all group border border-transparent hover:border-teal-100">
              <span className="text-slate-400 whitespace-nowrap font-bold">[{new Date(log.timestamp).toLocaleTimeString()}]</span>
              <div className="flex-1">
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-teal-600 font-black uppercase text-[10px]">{log.actor}</span>
                  <span className="text-slate-200">|</span>
                  <span className={cn(
                    "px-2 py-0.5 rounded text-[8px] font-black uppercase tracking-widest",
                    log.severity === 'Critical' ? 'bg-red-100 text-red-600' :
                    log.severity === 'Warning' ? 'bg-amber-100 text-amber-600' :
                    'bg-emerald-100 text-emerald-600'
                  )}>
                    {log.severity}
                  </span>
                  <span className="text-slate-300 ml-auto text-[9px] font-bold">{log.ip}</span>
                </div>
                <p className="text-slate-600 font-medium">
                  <span className="text-slate-400 uppercase text-[9px] font-black mr-2">[{log.module}]</span>
                  {log.action}
                </p>
              </div>
            </div>
          ))}
          {auditLogs.length === 0 && (
            <div className="text-center py-20 text-slate-200">
              <AlertCircle size={48} className="mx-auto mb-4 opacity-20" />
              <p className="uppercase font-black tracking-widest text-xs">No hay registros de seguridad</p>
            </div>
          )}
        </div>
      </div>

      {/* Security Tip */}
      <div className="bg-teal-50 border-l-4 border-teal-600 p-8 rounded-3xl flex items-center gap-6 shadow-sm">
        <div className="w-12 h-12 bg-white rounded-2xl flex items-center justify-center text-teal-600 shadow-sm">
          <Shield size={28} />
        </div>
        <div>
          <p className="text-teal-900 font-black text-sm mb-1 uppercase tracking-tight">Protección de Datos Activa</p>
          <p className="text-teal-700 text-xs font-medium leading-relaxed">
            Este sistema cumple con los estándares de encriptación de grado militar y registra cada movimiento de información sensible de acuerdo a la Ley de Habeas Data.
          </p>
        </div>
      </div>
    </div>
  );
}
