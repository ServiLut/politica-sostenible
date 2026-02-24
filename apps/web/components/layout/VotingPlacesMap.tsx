"use client";

import React, { useEffect, useState } from 'react';
import { MapContainer, TileLayer, Marker, Popup, useMap } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import MarkerClusterGroup from 'react-leaflet-cluster';
import { MapPin, Check } from 'lucide-react';

// Re-center map based on voting places
function RecenterAutomatically({ items }: { items: any[] }) {
  const map = useMap();
  useEffect(() => {
    if (items.length > 0) {
      const coords = items
        .filter(item => item.latitud && item.longitud)
        .map(item => [item.latitud, item.longitud] as [number, number]);

      if (coords.length > 0) {
        const bounds = new L.LatLngBounds(coords);
        if (bounds.isValid()) {
           if (coords.length === 1) {
              map.setView(coords[0], 14);
           } else {
              map.fitBounds(bounds, { padding: [50, 50] });
           }
        }
      }
    }
  }, [items, map]);

  return null;
}

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

const createClusterIcon = (cluster: any) => {
  return L.divIcon({
    html: `<div class="w-10 h-10 bg-teal-600 text-white rounded-full flex items-center justify-center font-bold border-4 border-white shadow-xl text-xs">${cluster.getChildCount()}</div>`,
    className: 'custom-cluster-icon',
    iconSize: L.point(40, 40),
  });
};

const COLOMBIA_CENTER: [number, number] = [4.5709, -74.2973];

interface VotingPlacesMapProps {
  places: any[];
  onSelect?: (place: any) => void;
}

export default function VotingPlacesMap({ places, onSelect }: VotingPlacesMapProps) {
  const [isReady, setIsReady] = useState(false);

  useEffect(() => {
    delete (L.Icon.Default.prototype as any)._getIconUrl;
    L.Icon.Default.mergeOptions({
      iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
      iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
      shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
    });
    setIsReady(true);
  }, []);

  if (!isReady) return null;

  const tealIcon = createCustomIcon('#0d9488');

  return (
    <div className="w-full h-full relative z-0 min-h-[500px] rounded-[2rem] overflow-hidden border-2 border-slate-100 shadow-sm">
      <MapContainer 
        center={COLOMBIA_CENTER} 
        zoom={6} 
        scrollWheelZoom={true} 
        className="w-full h-full"
        style={{ background: '#F8FAFC', height: '100%', width: '100%' }}
      >
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>'
          url="https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png"
        />
        
        <RecenterAutomatically items={places} />
        
        <MarkerClusterGroup
          chunkedLoading
          iconCreateFunction={createClusterIcon}
          showCoverageOnHover={false}
          maxClusterRadius={50}
        >
          {places.map((place) => {
            if (!place.latitud || !place.longitud) return null;
            
            return (
              <Marker 
                key={place.id} 
                position={[place.latitud, place.longitud]} 
                icon={tealIcon as any}
                eventHandlers={{
                  click: () => onSelect?.(place),
                }}
              >
                <Popup className="custom-popup">
                  <div className="p-5 min-w-[240px] bg-white rounded-3xl">
                    <div className="flex items-center gap-2 mb-4">
                      <span className="text-[8px] font-black uppercase px-2.5 py-1 rounded-full border tracking-widest bg-teal-50 text-teal-600 border-teal-100">
                        Puesto de Votación
                      </span>
                    </div>
                    
                    <h4 className="text-lg font-black text-slate-900 tracking-tighter uppercase leading-[0.9] mb-2">{place.nombre}</h4>
                    
                    <div className="flex items-center gap-2 text-teal-600 mb-4">
                      <Check size={14} className="shrink-0" />
                      <p className="text-[10px] font-black uppercase tracking-widest">
                        {place.municipio}, {place.departamento}
                      </p>
                    </div>
                    
                    <div className="space-y-3">
                      <div className="w-full flex items-center gap-3 p-3 bg-slate-50 rounded-2xl text-slate-500">
                        <MapPin size={14} className="text-teal-500" />
                        <span className="text-[10px] font-bold uppercase tracking-tight truncate">
                          {place.direccion}
                        </span>
                      </div>

                      <button 
                        onClick={() => onSelect?.(place)}
                        className="w-full py-3 bg-slate-900 text-white rounded-xl text-[9px] font-black uppercase tracking-widest hover:bg-teal-600 transition-colors"
                      >
                        Gestionar Mesas
                      </button>
                    </div>
                  </div>
                </Popup>
              </Marker>
            );
          })}
        </MarkerClusterGroup>
      </MapContainer>

      <style jsx global>{`
        .leaflet-container { background: #F8FAFC !important; }
        .marker-container { position: relative; width: 32px; height: 32px; display: flex; align-items: center; justify-content: center; }
        .marker-core { width: 14px; height: 14px; border-radius: 50%; border: 3px solid #ffffff; box-shadow: 0 2px 4px rgba(0,0,0,0.2); z-index: 2; }
        .marker-pulse { position: absolute; width: 100%; height: 100%; border-radius: 50%; animation: pulse 2s infinite; opacity: 0.4; z-index: 1; }
        @keyframes pulse { 0% { transform: scale(0.5); opacity: 0.8; } 70% { transform: scale(2); opacity: 0; } 100% { transform: scale(0.5); opacity: 0; } }
      `}</style>
    </div>
  );
}
