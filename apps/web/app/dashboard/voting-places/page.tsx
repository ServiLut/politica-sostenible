"use client";

import React, { useState, useEffect } from 'react';
import dynamic from 'next/dynamic';
import { useQuery } from '@tanstack/react-query';
import { Search, MapPin, Layers } from 'lucide-react';
import { cn } from '@/components/ui/utils';

// Cargamos el mapa dinámicamente sin Server-Side Rendering
const VotingPlacesMap = dynamic(() => import('@/components/VotingPlacesMap'), {
  ssr: false,
  loading: () => (
    <div className="w-full h-full bg-slate-50 flex items-center justify-center border-2 border-slate-100 rounded-[2rem]">
      <div className="flex flex-col items-center gap-4 text-teal-600">
        <div className="w-8 h-8 border-4 border-teal-600 border-t-transparent rounded-full animate-spin"></div>
        <p className="text-[10px] font-black uppercase tracking-widest">Cargando Sistema Geográfico...</p>
      </div>
    </div>
  )
});

export default function VotingPlacesPage() {
  const [searchTerm, setSearchTerm] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');

  // Implementamos el debounce de 500ms
  useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedSearch(searchTerm);
    }, 500);
    return () => clearTimeout(handler);
  }, [searchTerm]);

  const fetchVotingPlaces = async () => {
    // Apuntamos al backend local de NestJS
    const url = new URL('http://localhost:3001/voting-places');
    url.searchParams.append('limit', '5000');
    url.searchParams.append('offset', '0');
    
    // Opcional: Podríamos pasar un municipio si la búsqueda lo coincide, 
    // pero filtrar 5000 puntos en memoria cliente es muy rápido.
    
    const res = await fetch(url.toString());
    if (!res.ok) throw new Error('Network response was not ok');
    return res.json();
  };

  const { data, isLoading, isError } = useQuery({
    queryKey: ['votingPlaces'],
    queryFn: fetchVotingPlaces,
    staleTime: 1000 * 60 * 60, // 1 hora de cache (Stale)
  });

  const filteredData = React.useMemo(() => {
    if (!data) return [];
    if (!debouncedSearch) return data;
    
    const lowerSearch = debouncedSearch.toLowerCase();
    return data.filter((place: any) => 
      place.puesto.toLowerCase().includes(lowerSearch) ||
      place.municipio.toLowerCase().includes(lowerSearch) ||
      place.direccion.toLowerCase().includes(lowerSearch)
    );
  }, [data, debouncedSearch]);

  return (
    <div className="space-y-8 animate-in fade-in duration-500 pb-20 h-[calc(100vh-100px)] flex flex-col">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 shrink-0">
        <div>
          <h1 className="text-3xl font-black text-slate-900 tracking-tighter uppercase">Puestos de Votación</h1>
          <p className="text-slate-500 font-medium">Georreferenciación oficial de la Registraduría (datos.gov.co).</p>
        </div>
        
        <div className="relative w-full md:w-96">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-teal-600" size={16} />
          <input 
            type="text" 
            placeholder="Buscar por municipio, puesto o dirección..." 
            className="w-full pl-12 pr-4 py-3 bg-white border-2 border-slate-100 rounded-2xl text-[11px] font-black focus:border-teal-500 focus:ring-4 focus:ring-teal-500/5 outline-none transition-all shadow-sm"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>
      </div>

      <div className="flex-1 flex flex-col lg:flex-row gap-8 min-h-0">
        <div className="flex-1 min-h-0">
          <VotingPlacesMap data={filteredData || []} />
        </div>

        <div className="w-full lg:w-80 flex flex-col gap-6 shrink-0 overflow-y-auto">
          <div className="bg-white p-8 rounded-[2.5rem] border-2 border-slate-100 shadow-sm">
            <div className="w-12 h-12 bg-teal-50 text-teal-600 rounded-2xl flex items-center justify-center mb-6 border border-teal-100">
              <Layers size={24} />
            </div>
            <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2">Estado de Conexión</p>
            <div className="flex items-center gap-2 mb-8">
              <div className={cn("w-2.5 h-2.5 rounded-full shadow-sm", isLoading ? "bg-amber-500 animate-pulse shadow-amber-200" : isError ? "bg-rose-500 shadow-rose-200" : "bg-emerald-500 shadow-emerald-200")} />
              <span className="text-xs font-black uppercase text-slate-700 tracking-tight">
                {isLoading ? "Consultando API..." : isError ? "Error de conexión" : "Conectado a NestJS"}
              </span>
            </div>

            <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Puestos Visibles</p>
            <h3 className="text-4xl font-black text-slate-900 tracking-tighter">
              {filteredData ? filteredData.length.toLocaleString() : 0}
            </h3>
          </div>

          <div className="bg-slate-900 text-white p-8 rounded-[2.5rem] shadow-xl relative overflow-hidden group">
            <MapPin className="absolute -right-4 -bottom-4 w-32 h-32 text-white/5 group-hover:scale-110 transition-transform duration-700" />
            <h4 className="text-[10px] font-black uppercase tracking-[0.3em] text-teal-400 mb-4 relative z-10">Información Oficial</h4>
            <p className="text-xs font-medium leading-relaxed text-slate-300 relative z-10">
              Estos datos provienen de la API de NestJS conectada a datos.gov.co. El mapa utiliza MarkerClusterGroup para asegurar fluidez.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
