"use client";

import React, { useEffect, useRef, useCallback } from 'react';
import { useCRM } from '@/context/CRMContext';
import { MapPin, User, Globe } from 'lucide-react';

export default function TerritoryPage() {
  const { territory } = useCRM();
  const mapRef = useRef<HTMLDivElement>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const leafletRef = useRef<any>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const markersRef = useRef<any[]>([]);

  const updateMarkers = useCallback(() => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const L = (window as any).L;
    const map = leafletRef.current;
    if (!L || !map) return;

    markersRef.current.forEach(m => m.remove());
    markersRef.current = [];

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const bounds: any[] = [];
    territory.forEach(zone => {
      if (zone.lat && zone.lng) {
        const percentage = zone.target > 0 ? Math.round((zone.current / zone.target) * 100) : 0;
        const color = percentage >= 70 ? '#10b981' : percentage >= 40 ? '#f59e0b' : '#ef4444';
        
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const pos: any = [zone.lat, zone.lng];
        bounds.push(pos);

        // Crear Icono Personalizado con Número
        const customIcon = L.divIcon({
          className: 'custom-marker',
          html: `<div style="
            background-color: ${color}; 
            color: white; 
            border-radius: 50%; 
            width: 36px; 
            height: 36px; 
            display: flex; 
            align-items: center; 
            justify-content: center; 
            border: 3px solid white; 
            font-weight: 900; 
            font-size: 13px; 
            box-shadow: 0 4px 10px rgba(0,0,0,0.3);
            text-shadow: 0 1px 2px rgba(0,0,0,0.2);
          ">${zone.current}</div>`,
          iconSize: [36, 36],
          iconAnchor: [18, 18]
        });

        const marker = L.marker(pos, { icon: customIcon }).addTo(map);

        marker.bindPopup(`
          <div style="font-family: sans-serif; padding: 10px; min-width: 180px;">
            <b style="display: block; margin-bottom: 8px; font-size: 16px; color: #1e293b;">${zone.name}</b>
            <div style="display: flex; flex-direction: column; gap: 6px; border-top: 1px solid #f1f5f9; pt: 8px;">
              <span style="font-size: 13px; color: #1e293b;"><b>Registrados:</b> ${zone.current} personas</span>
              <span style="font-size: 12px; color: #64748b;"><b>Líder:</b> ${zone.leader || 'Sin asignar'}</span>
              <span style="font-size: 12px; color: #64748b;"><b>Meta:</b> ${zone.target.toLocaleString()}</span>
              <div style="margin-top: 5px; height: 6px; width: 100%; background: #f1f5f9; border-radius: 10px; overflow: hidden;">
                <div style="height: 100%; width: ${Math.min(percentage, 100)}%; background: ${color};"></div>
              </div>
              <span style="font-size: 11px; font-weight: 900; color: ${color}; text-align: right;">${percentage}%</span>
            </div>
          </div>
        `, {
          className: 'custom-popup'
        });

        markersRef.current.push(marker);
      }
    });

    if (bounds.length > 0 && map) {
      map.fitBounds(L.latLngBounds(bounds), { padding: [50, 50] });
    }
  }, [territory]);

  useEffect(() => {
    if (!mapRef.current || leafletRef.current) return;

    const loadLeaflet = async () => {
      if (!document.getElementById('leaflet-css')) {
        const link = document.createElement('link');
        link.id = 'leaflet-css';
        link.rel = 'stylesheet';
        link.href = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css';
        document.head.appendChild(link);
      }

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      if (!(window as any).L) {
        const script = document.createElement('script');
        script.src = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js';
        script.async = true;
        script.onload = () => initMap();
        document.body.appendChild(script);
      } else {
        initMap();
      }
    };

    const initMap = () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const L = (window as any).L;
      if (!L || !mapRef.current || leafletRef.current) return;

      const map = L.map(mapRef.current).setView([6.2442, -75.5812], 12);
      leafletRef.current = map;

      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '© OpenStreetMap contributors',
        maxZoom: 19
      }).addTo(map);

      setTimeout(() => {
        map.invalidateSize();
      }, 500);

      updateMarkers();
    };

    loadLeaflet();
  }, [updateMarkers]);

  useEffect(() => {
    if (leafletRef.current) {
      updateMarkers();
    }
  }, [territory, updateMarkers]);

  return (
    <div className="space-y-8 animate-in fade-in duration-500">
      <div className="flex justify-between items-end">
        <div>
          <h1 className="text-3xl font-black text-slate-900 tracking-tighter uppercase">Inteligencia Territorial</h1>
          <p className="text-slate-500 font-medium">Análisis de fuerza electoral georreferenciada en tiempo real.</p>
        </div>
      </div>

      <div className="bg-white p-4 rounded-[2.5rem] border border-slate-100 shadow-sm overflow-hidden">
        <div className="flex items-center gap-2 mb-4 px-4 pt-2">
          <Globe className="text-blue-600" size={20} />
          <h2 className="text-lg font-black text-slate-900">Mapa Metropolitano de Medellín</h2>
        </div>
        
        <div 
          ref={mapRef} 
          className="w-full h-[600px] rounded-[2rem] overflow-hidden border border-slate-100 z-0"
          style={{ background: '#f8fafc' }}
        />
        
        <div className="mt-4 px-4 pb-2 flex justify-between items-center">
          <div className="flex flex-col gap-1">
            <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest">
              Visualización: Número de votantes registrados por zona
            </p>
          </div>
          <div className="flex gap-6">
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 bg-emerald-500 rounded-full"></div>
              <span className="text-[10px] font-black text-slate-600 uppercase">Meta OK</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 bg-orange-500 rounded-full"></div>
              <span className="text-[10px] font-black text-slate-600 uppercase">En Gestión</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 bg-red-500 rounded-full"></div>
              <span className="text-[10px] font-black text-slate-600 uppercase">Crítico</span>
            </div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
        {territory.map((zone) => {
          const percentage = zone.target > 0 ? Math.round((zone.current / zone.target) * 100) : 0;
          return (
            <div key={zone.id} className="bg-white p-6 rounded-[2rem] border border-slate-100 shadow-sm hover:shadow-xl hover:scale-[1.02] transition-all group">
              <div className="flex justify-between items-start mb-4">
                <div className="p-3 bg-blue-50 text-blue-600 rounded-2xl group-hover:bg-blue-600 group-hover:text-white transition-all">
                  <MapPin size={20} />
                </div>
                <div className="text-right">
                  <p className="text-[10px] font-black text-slate-400 uppercase">Registrados</p>
                  <p className="text-xl font-black text-slate-900 leading-none">{zone.current}</p>
                </div>
              </div>
              
              <h3 className="text-lg font-black text-slate-900 mb-1 leading-tight truncate">{zone.name}</h3>
              <div className="flex items-center gap-2 text-slate-400 text-[10px] font-bold uppercase tracking-widest mb-6">
                <User size={12} className="shrink-0" /> {zone.leader || 'Sin Líder'}
              </div>

              <div className="space-y-4">
                <div className="flex justify-between text-[10px] font-black uppercase tracking-tighter">
                  <span className="text-slate-400">Meta: {zone.target.toLocaleString()}</span>
                  <span className={percentage >= 70 ? 'text-emerald-600' : 'text-slate-900'}>{percentage}%</span>
                </div>
                <div className="h-2 w-full bg-slate-50 rounded-full overflow-hidden border border-slate-100">
                  <div 
                    className={`h-full transition-all duration-1000 ${percentage >= 70 ? 'bg-emerald-500' : percentage >= 40 ? 'bg-orange-500' : 'bg-red-500'}`} 
                    style={{ width: `${Math.min(percentage, 100)}%` }}
                  />
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
