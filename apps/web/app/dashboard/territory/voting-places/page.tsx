"use client";

import React, { useState, useEffect } from 'react';
import dynamic from 'next/dynamic';
import { useQuery } from '@tanstack/react-query';
import { Search, MapPin, Database, Loader2, ChevronLeft, ChevronRight } from 'lucide-react';
import { Input } from '@/components/ui/input';

// Dynamic import for Leaflet map to avoid SSR issues
const VotingPlacesMap = dynamic(() => import('@/components/layout/VotingPlacesMap'), {
  ssr: false,
  loading: () => (
    <div className="w-full h-[500px] bg-slate-50 flex items-center justify-center border-2 border-slate-100 rounded-[2rem]">
      <div className="flex flex-col items-center gap-4 text-teal-600">
        <Loader2 className="w-8 h-8 animate-spin" />
        <p className="text-[10px] font-black uppercase tracking-widest">Iniciando Cartografía...</p>
      </div>
    </div>
  )
});

export default function VotingPlacesPage() {
  const [municipio, setMunicipio] = useState('');
  const [debouncedMunicipio, setDebouncedMunicipio] = useState('');
  const [page, setPage] = useState(1);
  const limit = 50;

  // Debounce for search
  useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedMunicipio(municipio);
      setPage(1); // Reset to page 1 on search
    }, 500);
    return () => clearTimeout(handler);
  }, [municipio]);

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['votingPlaces', debouncedMunicipio, page],
    queryFn: async () => {
      const url = new URL('http://localhost:3001/logistics/voting-places');
      url.searchParams.append('page', page.toString());
      url.searchParams.append('limit', limit.toString());
      if (debouncedMunicipio) {
        url.searchParams.append('municipio', debouncedMunicipio);
      }
      
      const res = await fetch(url.toString());
      if (!res.ok) throw new Error('Error al consultar puestos de votación');
      return res.json();
    },
    staleTime: 1000 * 60 * 5, // 5 minutes
  });

  const handleSync = async () => {
    try {
      const res = await fetch('http://localhost:3001/logistics/voting-places/sync', {
        method: 'POST'
      });
      if (res.ok) {
        alert('Sincronización completada con éxito');
        refetch();
      }
    } catch {
      alert('Error al sincronizar datos');
    }
  };

  return (
    <div className="space-y-8 animate-in fade-in duration-500 pb-20">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h1 className="text-3xl font-black text-slate-900 tracking-tighter uppercase">Puestos de Votación (Logística)</h1>
          <p className="text-slate-500 font-medium italic">Georreferenciación masiva de la Registraduría Nacional.</p>
        </div>
        
        <button 
          onClick={handleSync}
          className="bg-slate-900 text-white px-6 py-3 rounded-2xl font-black uppercase tracking-widest text-[10px] flex items-center gap-2 hover:bg-teal-600 transition-all shadow-xl"
        >
          <Database size={16} /> Sincronizar Socrata (+12k)
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-8">
        {/* Filtros y Buscador */}
        <div className="lg:col-span-1 space-y-6">
          <div className="bg-white p-8 rounded-[2.5rem] border-2 border-slate-100 shadow-sm space-y-6">
            <h3 className="text-sm font-black text-slate-900 uppercase tracking-widest flex items-center gap-2">
              <Search size={18} className="text-teal-600" /> Búsqueda Táctica
            </h3>
            
            <div className="space-y-4">
              <div>
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] mb-2 block px-1">Municipio</label>
                <Input 
                  placeholder="Ej: Medellin, Envigado..."
                  value={municipio}
                  onChange={(e) => setMunicipio(e.target.value)}
                />
              </div>
            </div>

            <div className="pt-6 border-t border-slate-50">
               <div className="flex items-center justify-between mb-4">
                  <p className="text-[10px] font-black text-slate-400 uppercase">Resultados</p>
                  <span className="text-xs font-black text-teal-600">
                    {data?.total?.toLocaleString() || 0}
                  </span>
               </div>
               
               {/* Pagination Controls */}
               <div className="flex items-center gap-2">
                  <button 
                    onClick={() => setPage(p => Math.max(1, p - 1))}
                    disabled={page === 1 || isLoading}
                    className="flex-1 p-3 bg-slate-50 rounded-xl text-slate-400 hover:text-teal-600 hover:bg-teal-50 disabled:opacity-30 transition-all border border-transparent"
                  >
                    <ChevronLeft size={20} className="mx-auto" />
                  </button>
                  <div className="px-4 text-[10px] font-black text-slate-900">
                    {page} / {data?.totalPages || 1}
                  </div>
                  <button 
                    onClick={() => setPage(p => p + 1)}
                    disabled={page === data?.totalPages || isLoading}
                    className="flex-1 p-3 bg-slate-50 rounded-xl text-slate-400 hover:text-teal-600 hover:bg-teal-50 disabled:opacity-30 transition-all border border-transparent"
                  >
                    <ChevronRight size={20} className="mx-auto" />
                  </button>
               </div>
            </div>
          </div>

          <div className="bg-teal-50 p-8 rounded-[2.5rem] border-2 border-teal-100 shadow-sm relative overflow-hidden group">
            <MapPin className="absolute -right-4 -bottom-4 w-32 h-32 text-teal-600/10 group-hover:scale-110 transition-transform duration-700" />
            <h4 className="text-[10px] font-black text-teal-600 uppercase tracking-[0.3em] mb-4">Inteligencia de Datos</h4>
            <p className="text-[11px] font-bold text-teal-800 leading-relaxed italic">
              "El control territorial comienza con la precisión en la ubicación de cada mesa de votación."
            </p>
          </div>
        </div>

        {/* Mapa Georreferenciado */}
        <div className="lg:col-span-3 min-h-[600px] h-full">
          {isLoading ? (
            <div className="w-full h-full bg-slate-50 flex flex-col items-center justify-center border-2 border-slate-100 rounded-[2.5rem] gap-4">
              <Loader2 className="w-12 h-12 text-teal-600 animate-spin" />
              <p className="text-[11px] font-black uppercase tracking-widest text-teal-600">Cargando despliegue territorial...</p>
            </div>
          ) : isError ? (
             <div className="w-full h-full bg-rose-50 flex flex-col items-center justify-center border-2 border-rose-100 rounded-[2.5rem] gap-4 p-10 text-center">
                <Database className="w-12 h-12 text-rose-300" />
                <h3 className="text-sm font-black text-rose-900 uppercase">Error en el flujo de datos</h3>
                <p className="text-[10px] font-bold text-rose-600 uppercase max-w-xs leading-relaxed">
                  No pudimos conectar con el servidor táctico. Verifica tu conexión o intenta sincronizar con Socrata.
                </p>
             </div>
          ) : (
            <VotingPlacesMap places={data?.items || []} />
          )}
        </div>
      </div>
    </div>
  );
}
