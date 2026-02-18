"use client";

import React from 'react';

interface ModuleShellProps {
  title: string;
  description: string;
}

export function ModuleShell({ title, description }: ModuleShellProps) {
  return (
    <div className="space-y-6">
      <div className="border-b pb-4">
        <h1 className="text-3xl font-bold text-slate-900">{title}</h1>
        <p className="text-slate-500 mt-2">{description}</p>
      </div>
      
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {[1, 2, 3].map((i) => (
          <div key={i} className="bg-white p-6 rounded-lg border border-slate-200 shadow-sm animate-pulse">
            <div className="h-4 bg-slate-200 rounded w-3/4 mb-4"></div>
            <div className="h-3 bg-slate-100 rounded w-full mb-2"></div>
            <div className="h-3 bg-slate-100 rounded w-5/6"></div>
          </div>
        ))}
      </div>
      
      <div className="bg-blue-50 border-l-4 border-blue-400 p-4 rounded text-blue-800">
        <p className="text-sm font-medium">Estado del Módulo:</p>
        <p className="text-xs mt-1">Este módulo está configurado en el sistema de navegación y listo para su implementación lógica según el PRD.</p>
      </div>
    </div>
  );
}
