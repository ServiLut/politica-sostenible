'use client';

import dynamic from 'next/dynamic';
import React from 'react';

// Importación dinámica para evitar errores de SSR con Leaflet (window is not defined)
const TerritoryMap = dynamic(() => import('@/components/territory/TerritoryMap'), {
  ssr: false,
  loading: () => <div className="h-96 bg-slate-100 rounded-xl animate-pulse" />
});

export default function TerritoryPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Mapa de Poder Territorial</h1>
        <p className="text-slate-500">Visualización geo-referenciada de la fuerza política</p>
      </div>

      <div className="bg-white p-4 rounded-xl shadow-sm border border-slate-100">
        <TerritoryMap />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-white p-4 rounded-xl border border-l-4 border-l-red-500 shadow-sm">
            <h4 className="font-bold text-slate-700">Zona Crítica (&lt; 10)</h4>
            <p className="text-sm text-slate-500">Requiere intervención inmediata de líderes.</p>
        </div>
        <div className="bg-white p-4 rounded-xl border border-l-4 border-l-yellow-400 shadow-sm">
            <h4 className="font-bold text-slate-700">En Crecimiento (10-50)</h4>
            <p className="text-sm text-slate-500">Mantener actividades de fidelización.</p>
        </div>
        <div className="bg-white p-4 rounded-xl border border-l-4 border-l-green-500 shadow-sm">
            <h4 className="font-bold text-slate-700">Zona Segura (&gt; 50)</h4>
            <p className="text-sm text-slate-500">Consolidada. Usar como base de expansión.</p>
        </div>
      </div>
    </div>
  );
}
