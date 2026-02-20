"use client";

import React, { useEffect, useState } from 'react';
import { MapContainer, TileLayer, Marker, Popup, useMap } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { MapPin, MoreHorizontal, Pencil, Trash2 } from 'lucide-react';
import { CampaignEvent } from '@/context/CRMContext';
import { getCoordsForLocation, Coordinate } from '@/utils/geo';

// This component will automatically re-center the map when the events change
function RecenterAutomatically({ events }: { events: CampaignEvent[] }) {
  const map = useMap();
  useEffect(() => {
    // This timeout gives the map time to initialize and avoids race conditions
    const timer = setTimeout(() => {
      const coords = events
        .map(event => getCoordsForLocation(event.location))
        .filter((coord): coord is Coordinate => coord !== null);

      if (coords.length > 0) {
        const bounds = new L.LatLngBounds(coords.map(c => [c.lat, c.lng]));
        
        if (bounds.isValid()) {
           if (coords.length === 1) {
              map.setView([coords[0].lat, coords[0].lng], 15);
           } else {
              map.fitBounds(bounds, { padding: [50, 50] });
           }
        }
      }
    }, 100); // A small delay is often helpful

    return () => clearTimeout(timer);
  }, [events, map]);

  return null;
}

function ChangeView({ center }: { center: [number, number] }) {
  const map = useMap();
  useEffect(() => {
    map.setView(center, map.getZoom());
  }, [center, map]);
  return null;
}

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
    iconSize: [32, 32],
    iconAnchor: [16, 16],
  });
};

interface StrategicMapProps {
  events: CampaignEvent[];
  onEdit?: (event: CampaignEvent) => void;
  onDelete?: (id: string) => void;
  isAdmin?: boolean;
}

export default function StrategicMap({ events, onEdit, onDelete, isAdmin }: StrategicMapProps) {
  const [isReady, setIsReady] = useState(false);
  const [openOptionsId, setOpenOptionsId] = useState<string | null>(null);
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
        style={{ background: '#F8FAFC', height: '100%', width: '100%' }}
      >
        <ChangeView center={center} />
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>'
          url="https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png"
        />
        
        <RecenterAutomatically events={events} />
        
        {events.map((event, idx) => {
          let position = getCoordsForLocation(event.location);

          // 3. Fallback específico para casos comunes que puedan fallar por formato
          if (!position) {
            const cleanLoc = event.location.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
            if (cleanLoc.includes("comuna 11") || cleanLoc.includes("laureles") || cleanLoc.includes("estadio")) {
              position = { lat: 6.2452, lng: -75.5905 };
            } else if (cleanLoc.includes("comuna 14") || cleanLoc.includes("poblado")) {
              position = { lat: 6.2052, lng: -75.5655 };
            } else if (cleanLoc.includes("comuna 16") || cleanLoc.includes("belen")) {
              position = { lat: 6.2305, lng: -75.6005 };
            }
          }

          // 4. Fallback final cerca del centro para que no desaparezca
          if (!position && event.location) {
            position = { 
              lat: center[0] + (idx * 0.002), 
              lng: center[1] + (idx * 0.002) 
            };
          }

          if (!position) return null;

          // Reducción del "jitter" para mayor precisión visual (aprox 100m de dispersión)
          const jitterLat = (Math.random() - 0.5) * 0.001;
          const jitterLng = (Math.random() - 0.5) * 0.001;
          const finalPosition: [number, number] = [position.lat + jitterLat, position.lng + jitterLng];

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
                <div className="p-4 min-w-[220px] bg-white rounded-2xl">
                  <div className="flex items-center justify-between mb-3">
                    <span className={`text-[9px] font-black uppercase px-2.5 py-1 rounded-full border ${badgeClass}`}>
                      {event.type}
                    </span>
                  </div>
                  
                  <h4 className="text-sm font-black text-slate-900 leading-tight mb-1">{event.title}</h4>
                  <p className="text-[11px] text-slate-500 font-bold mb-3 italic">
                    {new Date(event.date).toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long' })}
                  </p>
                  
                  <button 
                    onClick={() => {
                      const url = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(event.location + ", Medellin, Antioquia, Colombia")}`;
                      window.open(url, '_blank');
                    }}
                    className="flex items-center gap-2 text-slate-400 mb-4 hover:text-teal-600 transition-colors group/loc"
                  >
                    <MapPin size={12} className="group-hover/loc:scale-110 transition-transform" />
                    <span className="text-[10px] font-bold uppercase tracking-wider border-b border-transparent group-hover/loc:border-teal-200">
                      {event.location}
                    </span>
                  </button>
                  
                  {isAdmin && (
                    <div className="relative">
                      <button 
                        onClick={() => setOpenOptionsId(openOptionsId === event.id ? null : event.id)}
                        className="w-full py-2.5 bg-teal-600 text-white rounded-xl text-[10px] font-black uppercase tracking-[0.1em] hover:bg-teal-700 transition-all shadow-lg shadow-teal-200/50 active:scale-[0.98] flex items-center justify-center gap-2"
                      >
                        <MoreHorizontal size={14} /> Gestión de Evento
                      </button>

                      {openOptionsId === event.id && (
                        <div className="absolute bottom-full left-0 right-0 mb-2 bg-white border border-slate-100 rounded-xl shadow-2xl overflow-hidden animate-in fade-in slide-in-from-bottom-2 duration-200 z-[100]">
                          <button 
                            onClick={() => {
                              onEdit?.(event);
                              setOpenOptionsId(null);
                            }}
                            className="w-full px-4 py-3 hover:bg-teal-50 text-[10px] font-bold text-slate-600 hover:text-teal-600 flex items-center gap-3 transition-colors border-b border-slate-50"
                          >
                            <Pencil size={12} /> Editar Registro
                          </button>
                          <button 
                            onClick={() => {
                              onDelete?.(event.id);
                              setOpenOptionsId(null);
                            }}
                            className="w-full px-4 py-3 hover:bg-red-50 text-[10px] font-bold text-slate-600 hover:text-red-600 flex items-center gap-3 transition-colors"
                          >
                            <Trash2 size={12} /> Eliminar Registro
                          </button>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </Popup>
            </Marker>
          );
        })}
      </MapContainer>

      <style jsx global>{`
        .leaflet-container {
          background: #F8FAFC !important;
        }
        .marker-container {
          position: relative;
          width: 32px;
          height: 32px;
          display: flex;
          align-items: center;
          justify-content: center;
        }
        .marker-core {
          width: 18px;
          height: 18px;
          border-radius: 50%;
          border: 3px solid #1e293b;
          box-shadow: 0 4px 12px rgba(0,0,0,0.25);
          z-index: 2;
        }
        .marker-pulse {
          position: absolute;
          width: 100%;
          height: 100%;
          border-radius: 50%;
          animation: pulse 1.5s infinite;
          opacity: 0.6;
          z-index: 1;
        }
        @keyframes pulse {
          0% {
            transform: scale(0.5);
            opacity: 0.9;
          }
          70% {
            transform: scale(2.2);
            opacity: 0;
          }
          100% {
            transform: scale(0.5);
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
