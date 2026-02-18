"use client";

import React from 'react';

export function PlaceholderModule({ title }: { title: string }) {
  return (
    <div className="space-y-6">
      <div className="border-b pb-4">
        <h1 className="text-3xl font-black text-slate-900 tracking-tighter">{title}</h1>
        <p className="text-slate-500 mt-2">Módulo del ecosistema Politica Sostenible CRM.</p>
      </div>
      
      <div className="flex flex-col items-center justify-center p-20 text-center border-4 border-dashed border-slate-200 rounded-[3rem] bg-slate-50/50">
        <div className="w-20 h-20 bg-slate-200 rounded-full flex items-center justify-center mb-6">
          <svg className="w-10 h-10 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
          </svg>
        </div>
        <h2 className="text-2xl font-black text-slate-700 mb-2">Módulo en Construcción</h2>
        <p className="text-slate-500 max-w-sm mx-auto">
          Esta funcionalidad está siendo integrada para cumplir con la normativa CNE 2026. Estará disponible en la siguiente fase de despliegue.
        </p>
      </div>
    </div>
  );
}
