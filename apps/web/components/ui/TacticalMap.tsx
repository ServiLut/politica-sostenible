"use client";

import React from "react";
import { Map as MapIcon, Shield, Radio, Target } from "lucide-react";
import { cn } from "@/components/ui/utils";

interface TacticalMapProps {
  zones: {
    id: string;
    nombre: string;
    percent: number;
    coords?: [number, number];
  }[];
}

export function TacticalMap({ zones }: TacticalMapProps) {
  return (
    <div className="relative w-full aspect-[16/9] bg-[#0F172A] rounded-[3rem] overflow-hidden border border-white/10 shadow-2xl group">
      {/* Grid Pattern Background */}
      <div className="absolute inset-0 opacity-20" style={{ 
        backgroundImage: `radial-gradient(#334155 1px, transparent 1px)`, 
        backgroundSize: '30px 30px' 
      }} />
      
      {/* Simulated Map Topography */}
      <svg className="absolute inset-0 w-full h-full opacity-10" viewBox="0 0 800 450">
        <path d="M100,100 Q150,50 200,100 T300,100 T400,150 T500,100" fill="none" stroke="white" strokeWidth="2" />
        <path d="M50,300 Q150,250 250,300 T450,350 T650,300" fill="none" stroke="white" strokeWidth="1" />
        <circle cx="400" cy="225" r="200" fill="none" stroke="white" strokeWidth="0.5" strokeDasharray="10,10" />
      </svg>

      {/* Map Content Overlay */}
      <div className="absolute inset-0 flex items-center justify-center">
        <div className="relative w-full h-full">
          {/* Dynamic Pulse Points */}
          {zones.map((zone, idx) => {
            // Mock positions if no coords
            const left = zone.coords ? `${(zone.coords[1] + 76) * 500}%` : `${20 + idx * 25}%`;
            const top = zone.coords ? `${(7 - zone.coords[0]) * 500}%` : `${30 + (idx % 2) * 30}%`;
            
            const colorClass = zone.percent >= 70 ? "bg-emerald-500" : zone.percent >= 30 ? "bg-amber-500" : "bg-red-500";
            const borderClass = zone.percent >= 70 ? "border-emerald-500/50" : zone.percent >= 30 ? "border-amber-500/50" : "border-red-500/50";

            return (
              <div 
                key={zone.id} 
                className="absolute transform -translate-x-1/2 -translate-y-1/2 group/point"
                style={{ left, top }}
              >
                {/* Pulse Ring */}
                <div className={cn("absolute inset-0 w-12 h-12 -m-6 rounded-full animate-ping opacity-20", colorClass)} />
                
                {/* Point Core */}
                <div className={cn("relative h-4 w-4 rounded-full border-4 border-[#0F172A] shadow-lg", colorClass)} />
                
                {/* Tooltip Label */}
                <div className="absolute top-6 left-1/2 -translate-x-1/2 opacity-0 group-hover/point:opacity-100 transition-all duration-300 pointer-events-none z-20 min-w-[120px]">
                  <div className="bg-[#111827] border border-white/10 p-3 rounded-2xl shadow-2xl">
                    <p className="text-[8px] font-black text-white/40 uppercase tracking-widest mb-1">Zona Operativa</p>
                    <p className="text-xs font-bold text-white mb-1">{zone.nombre}</p>
                    <div className="flex items-center justify-between gap-4">
                      <div className="h-1 w-full bg-white/5 rounded-full overflow-hidden">
                        <div className={cn("h-full", colorClass)} style={{ width: `${zone.percent}%` }} />
                      </div>
                      <span className="text-[10px] font-black text-white">{zone.percent.toFixed(0)}%</span>
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Tactical HUD Elements */}
      <div className="absolute top-8 left-8 flex flex-col gap-4 pointer-events-none">
        <div className="bg-black/40 backdrop-blur-md border border-white/10 p-4 rounded-2xl flex items-center gap-4">
          <div className="h-10 w-10 bg-blue-600 rounded-xl flex items-center justify-center animate-pulse">
            <Radio size={20} className="text-white" />
          </div>
          <div>
            <p className="text-[8px] font-black text-blue-400 uppercase tracking-[0.2em]">Signal: Active</p>
            <p className="text-xs font-bold text-white tracking-tight">Geolocalización en Tiempo Real</p>
          </div>
        </div>
      </div>

      <div className="absolute bottom-8 right-8 flex gap-2 pointer-events-none">
        <div className="bg-black/40 backdrop-blur-md border border-white/10 px-4 py-2 rounded-xl flex items-center gap-2">
          <div className="h-2 w-2 rounded-full bg-red-500" />
          <span className="text-[8px] font-black text-white uppercase tracking-widest">Crítico</span>
        </div>
        <div className="bg-black/40 backdrop-blur-md border border-white/10 px-4 py-2 rounded-xl flex items-center gap-2">
          <div className="h-2 w-2 rounded-full bg-amber-500" />
          <span className="text-[8px] font-black text-white uppercase tracking-widest">En Proceso</span>
        </div>
        <div className="bg-black/40 backdrop-blur-md border border-white/10 px-4 py-2 rounded-xl flex items-center gap-2">
          <div className="h-2 w-2 rounded-full bg-emerald-500" />
          <span className="text-[8px] font-black text-white uppercase tracking-widest">Asegurado</span>
        </div>
      </div>

      {/* Compass / Decoration */}
      <div className="absolute bottom-8 left-8 opacity-20">
        <Target size={80} className="text-white animate-[spin_10s_linear_infinite]" />
      </div>
    </div>
  );
}
