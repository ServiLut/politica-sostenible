"use client";

import React from "react";
import { Hammer, ArrowLeft, Sparkles } from "lucide-react";
import Link from "next/link";

export default function ModuleInConstruction() {
  return (
    <div className="h-full flex flex-col items-center justify-center space-y-8 animate-in fade-in zoom-in-95 duration-500">
      <div className="relative">
        <div className="h-32 w-32 bg-[#111827] rounded-[2.5rem] flex items-center justify-center shadow-2xl relative z-10">
          <Hammer className="h-12 w-12 text-[#0047AB] animate-bounce" />
        </div>
        <div className="absolute inset-0 bg-[#0047AB] rounded-[2.5rem] blur-2xl opacity-20 animate-pulse" />
      </div>

      <div className="text-center space-y-2 max-w-sm">
        <div className="flex items-center justify-center gap-2 mb-2">
          <Sparkles className="h-4 w-4 text-[#0047AB]" />
          <span className="text-[10px] font-black text-zinc-400 uppercase tracking-[0.2em]">Módulo en Desarrollo</span>
        </div>
        <h2 className="text-3xl font-black text-[#111827] tracking-tighter">Bajo Construcción</h2>
        <p className="text-zinc-500 font-medium italic leading-relaxed">
          Nuestros ingenieros de campaña están codificando este módulo para la victoria de 2026. ¡Vuelve pronto!
        </p>
      </div>

      <Link 
        href="/dashboard"
        className="flex items-center gap-3 px-8 py-4 bg-[#111827] text-white rounded-2xl font-black text-xs uppercase tracking-widest hover:bg-[#0047AB] transition-all shadow-xl shadow-zinc-200"
      >
        <ArrowLeft className="h-4 w-4" />
        Volver al Inicio
      </Link>
    </div>
  );
}
