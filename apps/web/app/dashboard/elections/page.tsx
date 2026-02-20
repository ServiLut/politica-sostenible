'use client';

import React from 'react';
import { ShieldCheck, FileText, AlertCircle, CheckCircle2, Search } from 'lucide-react';
import { cn } from '@/components/ui/utils';

export default function ElectionsPage() {
  return (
    <div className="space-y-10 animate-in fade-in duration-500">
      <header className="flex flex-col md:flex-row md:items-center justify-between gap-6">
        <div className="space-y-1">
          <h1 className="text-4xl font-black text-secondary tracking-tighter">Día D / Testigos</h1>
          <p className="text-zinc-500 font-medium italic">Operación de Control Electoral 2026</p>
        </div>
        
        <div className="flex gap-4">
           <div className="bg-emerald-50 border border-emerald-100 px-6 py-3 rounded-2xl flex items-center gap-3">
              <ShieldCheck className="h-5 w-5 text-emerald-600" />
              <div>
                 <p className="text-[10px] font-black text-emerald-800 uppercase tracking-widest">Testigos Validados</p>
                 <p className="text-xl font-black text-emerald-600">8.432 / 10.000</p>
              </div>
           </div>
        </div>
      </header>

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
         {[
           { label: 'E-14 Recolectados', value: '1,204', icon: FileText, color: 'primary' },
           { label: 'Mesas en Alerta', value: '12', icon: AlertCircle, iconColor: 'text-accent', color: 'accent' },
           { label: 'Puestos Cubiertos', value: '92%', icon: CheckCircle2, color: 'emerald' },
           { label: 'Soportes Pendientes', value: '45', icon: FileText, color: 'zinc' },
         ].map((stat, idx) => (
           <div key={idx} className="bg-white p-6 rounded-[2rem] border border-zinc-100 shadow-sm">
              <div className={cn(
                "h-10 w-10 rounded-xl flex items-center justify-center mb-4",
                stat.color === 'primary' ? "bg-primary/10 text-primary" :
                stat.color === 'accent' ? "bg-accent/10 text-accent" :
                stat.color === 'emerald' ? "bg-emerald-100 text-emerald-600" : "bg-zinc-100 text-zinc-400"
              )}>
                <stat.icon className="h-5 w-5" />
              </div>
              <p className="text-[10px] font-black text-zinc-400 uppercase tracking-widest">{stat.label}</p>
              <p className="text-2xl font-black text-secondary">{stat.value}</p>
           </div>
         ))}
      </div>

      <div className="bg-white rounded-[2.5rem] border border-zinc-100 shadow-sm overflow-hidden">
         <div className="p-8 border-b border-zinc-100 flex items-center justify-between bg-zinc-50/50">
            <h2 className="text-xl font-black text-secondary uppercase tracking-tight">Monitoreo de Puestos</h2>
            <div className="relative">
               <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-zinc-400" />
               <input 
                 type="text" 
                 placeholder="Filtrar por puesto..." 
                 className="pl-10 pr-4 py-2 bg-white border border-zinc-200 rounded-xl text-xs font-bold focus:ring-2 focus:ring-primary w-64"
               />
            </div>
         </div>
         
         <div className="p-0">
            <table className="w-full text-left">
               <thead>
                  <tr className="border-b border-zinc-100">
                     <th className="px-8 py-5 text-[10px] font-black text-zinc-400 uppercase tracking-widest">Puesto</th>
                     <th className="px-8 py-5 text-[10px] font-black text-zinc-400 uppercase tracking-widest">Ubicación</th>
                     <th className="px-8 py-5 text-[10px] font-black text-zinc-400 uppercase tracking-widest">Testigos</th>
                     <th className="px-8 py-5 text-[10px] font-black text-zinc-400 uppercase tracking-widest">Estado</th>
                  </tr>
               </thead>
               <tbody>
                  {[
                    { name: 'Col. Marco Fidel Suárez', loc: 'Itagüí, Antioquia', count: '12/12', status: 'Completo' },
                    { name: 'Inst. Educativa Nacional', loc: 'Bogotá, Suba', count: '8/20', status: 'Parcial' },
                    { name: 'Escuela Rural La Paz', loc: 'Valle del Cauca', count: '0/2', status: 'Pendiente' },
                  ].map((row, idx) => (
                    <tr key={idx} className="border-b border-zinc-50 hover:bg-zinc-50/50 transition-colors">
                       <td className="px-8 py-6">
                          <p className="text-sm font-black text-secondary">{row.name}</p>
                       </td>
                       <td className="px-8 py-6">
                          <p className="text-xs text-zinc-500 font-medium">{row.loc}</p>
                       </td>
                       <td className="px-8 py-6">
                          <p className="text-xs font-black text-secondary">{row.count}</p>
                       </td>
                       <td className="px-8 py-6">
                          <span className={cn(
                            "px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-widest",
                            row.status === 'Completo' ? "bg-emerald-100 text-emerald-700" :
                            row.status === 'Parcial' ? "bg-amber-100 text-amber-700" : "bg-red-100 text-red-700"
                          )}>
                            {row.status}
                          </span>
                       </td>
                    </tr>
                  ))}
               </tbody>
            </table>
         </div>
      </div>
    </div>
  );
}
