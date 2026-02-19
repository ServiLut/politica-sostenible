"use client";

import React, { useEffect, useState } from 'react';
import { MapContainer, TileLayer, Marker, Popup } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { MapPin } from 'lucide-react';
import { CampaignEvent } from '@/context/CRMContext';
import { MEDELLIN_ZONES } from '@/data/medellin-geo';
import { MEDELLIN_COORDINATES } from '@/data/medellin-coordinates';

// Custom icons for different event types
const createCustomIcon = (color: string) => {
  if (typeof window === 'undefined') return null;
  return new L.DivIcon({
    className: 'custom-div-icon',
    html: `
      <div class="marker-container">
        <div class="marker-pulse" style="background-color: ${color}"></div>
        <div class="marker-core" style="background-color: ${color}"></div>
      </div>
    `,
    iconSize: [24, 24],
    iconAnchor: [12, 12],
  });
};

interface StrategicMapProps {
  events: CampaignEvent[];
}

export default function StrategicMap({ events }: StrategicMapProps) {
  const [isReady, setIsReady] = useState(false);
  const center: [number, number] = [6.2442, -75.5812]; // Medellin Center

  useEffect(() => {
    // Fix for default marker icons in Leaflet + Next.js
    delete (L.Icon.Default.prototype as any)._getIconUrl;
    L.Icon.Default.mergeOptions({
      iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
      iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
      shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
    });
    setIsReady(true);
  }, []);

  if (!isReady) return null;

  const redIcon = createCustomIcon('#ef4444'); 
  const blueIcon = createCustomIcon('#3b82f6');
  const greenIcon = createCustomIcon('#22c55e');
  const orangeIcon = createCustomIcon('#f97316');

  return (
    <div className="w-full h-full relative z-0 min-h-[400px]">
      <MapContainer 
        center={center} 
        zoom={13} 
        scrollWheelZoom={true} 
        className="w-full h-full"
        style={{ background: '#0F172A', height: '100%', width: '100%' }}
      >
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>'
          url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
        />
        
        {events.map((event, idx) => {
          const normalize = (str: string) => 
            str.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
          
          const cleanLoc = normalize(event.location);
          let position: [number, number] | null = null;

          // 1. Buscar todas las coincidencias y elegir la más específica (la más larga)
          const candidates = Object.entries(MEDELLIN_COORDINATES)
            .filter(([key]) => cleanLoc.includes(normalize(key)))
            .sort((a, b) => b[0].length - a[0].length);

          if (candidates.length > 0) {
            position = [candidates[0][1].lat, candidates[0][1].lng];
          }

          // 2. Fallback a Zonas de Medellín
          if (!position) {
            const zone = MEDELLIN_ZONES.find(z => {
              const zName = normalize(z.name);
              return cleanLoc.includes(zName) || zName.includes(cleanLoc);
            });
            if (zone) position = [zone.lat, zone.lng];
          }

          // 3. Si no hay posición, no renderizar
          if (!position) return null;

          // Reducción del "jitter" para mayor precisión visual (aprox 100m de dispersión)
          const jitterLat = (Math.random() - 0.5) * 0.001;
          const jitterLng = (Math.random() - 0.5) * 0.001;
          const finalPosition: [number, number] = [position[0] + jitterLat, position[1] + jitterLng];

          let icon = blueIcon;
          let badgeClass = 'bg-blue-50 text-blue-600 border-blue-100';
          
          if (event.type === 'Marcha') {
            icon = redIcon;
            badgeClass = 'bg-red-50 text-red-600 border-red-100';
          } else if (event.type === 'Capacitación') {
            icon = greenIcon;
            badgeClass = 'bg-emerald-50 text-emerald-600 border-emerald-100';
          } else if (event.type === 'Otro') {
            icon = orangeIcon;
            badgeClass = 'bg-orange-50 text-orange-600 border-orange-100';
          }

          if (!icon) return null;

          return (
            <Marker key={event.id} position={finalPosition} icon={icon}>
              <Popup className="custom-popup">
                <div className="p-4 min-w-[200px] bg-white rounded-2xl">
                  <div className="flex items-center gap-2 mb-3">
                    <span className={`text-[9px] font-black uppercase px-2.5 py-1 rounded-full border ${badgeClass}`}>
                      {event.type}
                    </span>
                  </div>
                  <h4 className="text-sm font-black text-slate-900 leading-tight mb-1">{event.title}</h4>
                  <p className="text-[11px] text-slate-500 font-bold mb-3 italic">
                    {new Date(event.date).toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long' })}
                  </p>
                  <div className="flex items-center gap-2 text-slate-400 mb-4">
                    <MapPin size={12} />
                    <span className="text-[10px] font-bold uppercase tracking-wider">{event.location}</span>
                  </div>
                  <button className="w-full py-2.5 bg-slate-900 text-white rounded-xl text-[10px] font-black uppercase tracking-[0.1em] hover:bg-blue-600 transition-colors">
                    Ver Detalles
                  </button>
                </div>
              </Popup>
            </Marker>
          );
        })}
      </MapContainer>

      <style jsx global>{`
        .leaflet-container {
          background: #0F172A !important;
        }
        .marker-container {
          position: relative;
          width: 24px;
          height: 24px;
          display: flex;
          align-items: center;
          justify-content: center;
        }
        .marker-core {
          width: 16px;
          height: 16px;
          border-radius: 50%;
          border: 3px solid #0F172A;
          box-shadow: 0 0 10px rgba(0,0,0,0.5);
          z-index: 2;
        }
        .marker-pulse {
          position: absolute;
          width: 100%;
          height: 100%;
          border-radius: 50%;
          animation: pulse 2s infinite;
          opacity: 0.6;
          z-index: 1;
        }
        @keyframes pulse {
          0% {
            transform: scale(0.6);
            opacity: 0.8;
          }
          70% {
            transform: scale(2.5);
            opacity: 0;
          }
          100% {
            transform: scale(0.6);
            opacity: 0;
          }
        }
        .custom-popup .leaflet-popup-content-wrapper {
          border-radius: 1.5rem;
          padding: 0;
          overflow: hidden;
          box-shadow: 0 10px 25px -5px rgba(0, 0, 0, 0.1), 0 8px 10px -6px rgba(0, 0, 0, 0.1);
        }
        .custom-popup .leaflet-popup-content {
          margin: 0;
        }
        .custom-popup .leaflet-popup-tip-container {
          display: none;
        }
      `}</style>
    </div>
  );
}
