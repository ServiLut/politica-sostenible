"use client";

import React, { useEffect, useRef, useState, useCallback } from 'react';
import { useCRM } from '@/context/CRMContext';
import { MapPin, User, Globe, Map as MapIcon, LayoutGrid, ChevronDown, Check } from 'lucide-react';
import { cn } from '@/components/ui/utils';

export default function TerritoryPage() {
  const { territory } = useCRM();
  const [activeTab, setActiveTab] = useState<'map' | 'zones'>('map');
  const [selectedZoneId, setSelectedZoneId] = useState<string>('all');
  const [isZoneDropdownOpen, setIsZoneDropdownOpen] = useState(false);
  const mapRef = useRef<HTMLDivElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
   
  const leafletRef = useRef<any>(null);
   
  const markersRef = useRef<any[]>([]);

  // Cerrar dropdown al hacer click fuera
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsZoneDropdownOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const updateMarkers = useCallback(() => {
     
    const L = (window as any).L;
    const map = leafletRef.current;
    if (!L || !map || !mapRef.current) return;

    markersRef.current.forEach(m => m.remove());
    markersRef.current = [];

     
    const bounds: any[] = [];
    const zonesToDisplay = selectedZoneId === 'all' 
      ? territory 
      : territory.filter(z => z.id === selectedZoneId);

    zonesToDisplay.forEach(zone => {
      const lat = parseFloat(zone.lat as any);
      const lng = parseFloat(zone.lng as any);

      if (Number.isFinite(lat) && Number.isFinite(lng)) {
        const percentage = zone.target > 0 ? Math.round((zone.current / zone.target) * 100) : 0;
        const color = percentage >= 70 ? '#10b981' : percentage >= 40 ? '#f59e0b' : '#ef4444';
        
        const pos: [number, number] = [lat, lng];
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

    if (bounds.length > 0 && map && activeTab === 'map') {
      try {
        map.invalidateSize();
        const latLngBounds = L.latLngBounds(bounds);
        if (latLngBounds.isValid()) {
          // Si solo hay un punto, centrar y hacer zoom, de lo contrario ajustar bounds
          if (bounds.length === 1) {
            map.setView(bounds[0], 15, { animate: true });
          } else {
            map.fitBounds(latLngBounds, { padding: [50, 50], animate: true });
          }
        }
      } catch (err) {
        console.error('Error al ajustar límites del mapa:', err);
      }
    }
  }, [territory, selectedZoneId, activeTab]);

  useEffect(() => {
    if (activeTab === 'map' && leafletRef.current) {
      const timer = setTimeout(() => {
        leafletRef.current.invalidateSize();
        updateMarkers();
      }, 200);
      return () => clearTimeout(timer);
    }
  }, [activeTab, updateMarkers]);

  useEffect(() => {
    if (!mapRef.current || leafletRef.current) return;

    const initMap = () => {
       
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

    const loadLeaflet = async () => {
      if (!document.getElementById('leaflet-css')) {
        const link = document.createElement('link');
        link.id = 'leaflet-css';
        link.rel = 'stylesheet';
        link.href = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css';
        document.head.appendChild(link);
      }

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

    loadLeaflet();
  }, [updateMarkers]);

  useEffect(() => {
    if (leafletRef.current) {
      updateMarkers();
    }
  }, [updateMarkers]);

  return (
    <div className="space-y-8 animate-in fade-in duration-500">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-end gap-4">
        <div>
          <h1 className="text-3xl font-black text-slate-900 tracking-tighter uppercase">Inteligencia Territorial</h1>
          <p className="text-slate-500 font-medium">Análisis de fuerza electoral georreferenciada en tiempo real.</p>
        </div>

        {/* Tabs Navigation */}
        <div className="flex bg-slate-100 p-1.5 rounded-2xl border border-slate-200 shadow-inner">
          <button
            onClick={() => setActiveTab('map')}
            className={`flex items-center gap-2 px-6 py-2.5 rounded-xl text-xs font-black uppercase tracking-widest transition-all ${
              activeTab === 'map'
                ? 'bg-white text-teal-600 shadow-sm'
                : 'text-slate-500 hover:text-slate-700'
            }`}
          >
            <MapIcon size={16} /> Mapa
          </button>
          <button
            onClick={() => setActiveTab('zones')}
            className={`flex items-center gap-2 px-6 py-2.5 rounded-xl text-xs font-black uppercase tracking-widest transition-all ${
              activeTab === 'zones'
                ? 'bg-white text-teal-600 shadow-sm'
                : 'text-slate-500 hover:text-slate-700'
            }`}
          >
            <LayoutGrid size={16} /> Zonas
          </button>
        </div>
      </div>

      {/* Map Tab Content */}
      <div className={`space-y-8 ${activeTab === 'map' ? 'block' : 'hidden'}`}>
        <div className="bg-white p-4 rounded-[2.5rem] border border-slate-100 shadow-sm overflow-hidden animate-in slide-in-from-bottom-4 duration-500">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-4 px-4 pt-2">
            <div className="flex items-center gap-2">
              <Globe className="text-teal-600" size={20} />
              <h2 className="text-lg font-black text-slate-900 uppercase tracking-tight">Mapa Metropolitano de Medellín</h2>
            </div>

            <div className="flex items-center gap-3">
              <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest whitespace-nowrap">Filtrar por Zona:</label>
              <div className="w-56 relative" ref={dropdownRef}>
                <button 
                  onClick={() => setIsZoneDropdownOpen(!isZoneDropdownOpen)}
                  className="w-full h-10 px-5 flex items-center justify-between bg-slate-50 border-2 border-slate-100 rounded-2xl text-xs font-black text-slate-600 hover:border-teal-500/30 hover:bg-white transition-all cursor-pointer group"
                >
                  <span className="truncate">
                    {selectedZoneId === 'all' ? 'Todas las Zonas' : territory.find(z => z.id === selectedZoneId)?.name || 'Seleccionar'}
                  </span>
                  <ChevronDown className={cn("text-slate-400 transition-transform", isZoneDropdownOpen && "rotate-180")} size={14} />
                </button>
                
                {isZoneDropdownOpen && (
                  <div className="absolute top-full left-0 right-0 mt-2 bg-white border border-slate-100 rounded-[1.5rem] shadow-2xl z-[100] overflow-hidden animate-in fade-in zoom-in-95 duration-200">
                    <div 
                      onClick={() => {
                        setSelectedZoneId('all');
                        setIsZoneDropdownOpen(false);
                      }}
                      className={cn(
                        "px-5 py-3 hover:bg-teal-50 text-[10px] font-black uppercase tracking-widest cursor-pointer transition-colors border-b border-slate-50 flex justify-between items-center",
                        selectedZoneId === 'all' ? "text-teal-600 bg-teal-50/30" : "text-slate-600"
                      )}
                    >
                      Todas las Zonas
                      {selectedZoneId === 'all' && <Check size={14} className="text-teal-600" />}
                    </div>
                    {territory.map(zone => (
                      <div 
                        key={zone.id}
                        onClick={() => {
                          setSelectedZoneId(zone.id);
                          setIsZoneDropdownOpen(false);
                        }}
                        className={cn(
                          "px-5 py-3 hover:bg-teal-50 text-[10px] font-black uppercase tracking-widest cursor-pointer transition-colors border-b border-slate-50 last:border-none flex justify-between items-center",
                          selectedZoneId === zone.id ? "text-teal-600 bg-teal-50/30" : "text-slate-600"
                        )}
                      >
                        <span className="truncate pr-4">{zone.name}</span>
                        {selectedZoneId === zone.id && <Check size={14} className="text-teal-600" />}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
          
          <div 
            ref={mapRef} 
            className="w-full h-[650px] rounded-[2rem] overflow-hidden border border-slate-100 z-0 shadow-inner"
            style={{ background: '#f8fafc' }}
          />
          
          <div className="mt-4 px-4 pb-2 flex flex-col md:flex-row justify-between items-center gap-4">
            <div className="flex flex-col gap-1">
              <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest">
                Visualización: Número de votantes registrados por zona
              </p>
            </div>
            <div className="flex gap-6">
              <div className="flex items-center gap-2">
                <div className="w-3 h-3 bg-emerald-500 rounded-full shadow-sm"></div>
                <span className="text-[10px] font-black text-slate-600 uppercase">Meta OK (+70%)</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-3 h-3 bg-orange-500 rounded-full shadow-sm"></div>
                <span className="text-[10px] font-black text-slate-600 uppercase">En Gestión (40-70%)</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-3 h-3 bg-red-500 rounded-full shadow-sm"></div>
                <span className="text-[10px] font-black text-slate-600 uppercase">Crítico (-40%)</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Zones Tab Content */}
      <div className={`${activeTab === 'zones' ? 'block' : 'hidden'}`}>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6 animate-in slide-in-from-bottom-4 duration-500">
          {territory.map((zone) => {
            const percentage = zone.target > 0 ? Math.round((zone.current / zone.target) * 100) : 0;
            return (
              <div key={zone.id} className="bg-white p-6 rounded-[2rem] border border-slate-100 shadow-sm hover:shadow-xl hover:scale-[1.02] transition-all group">
                <div className="flex justify-between items-start mb-4">
                  <div className="p-3 bg-teal-50 text-teal-600 rounded-2xl group-hover:bg-teal-600 group-hover:text-white transition-all">
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
                  <div className="h-2 w-full bg-slate-50 rounded-full overflow-hidden border border-slate-100 shadow-inner">
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
    </div>
  );
}

