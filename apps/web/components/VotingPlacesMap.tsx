"use client";

import { MapContainer, TileLayer, Marker, Popup } from 'react-leaflet';
import MarkerClusterGroup from 'react-leaflet-cluster';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { useMemo, useEffect } from 'react';

const createCustomIcon = (cluster: any) => {
  return L.divIcon({
    html: `<div class="w-10 h-10 bg-teal-600 text-white rounded-full flex items-center justify-center font-bold border-4 border-white shadow-xl shadow-teal-900/20 text-xs">${cluster.getChildCount()}</div>`,
    className: 'custom-cluster-icon',
    iconSize: L.point(40, 40),
  });
};

const defaultIcon = L.icon({
  iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
  iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
  shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
  iconSize: [25, 41],
  iconAnchor: [12, 41],
  popupAnchor: [1, -34],
  shadowSize: [41, 41]
});

export default function VotingPlacesMap({ data }: { data: any[] }) {
  // Fix for default Leaflet icon issues in Next.js
  useEffect(() => {
    delete (L.Icon.Default.prototype as any)._getIconUrl;
    L.Icon.Default.mergeOptions({
      iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
      iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
      shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
    });
  }, []);

  const center = useMemo(() => {
    if (data.length > 0) return [data[0].lat, data[0].lng] as [number, number];
    return [4.5709, -74.2973] as [number, number];
  }, [data]);

  return (
    <div className="w-full h-full rounded-[2rem] overflow-hidden border-2 border-slate-100 shadow-sm z-0">
      <MapContainer center={center} zoom={data.length > 0 ? 12 : 6} style={{ height: '100%', width: '100%', zIndex: 0 }}>
        <TileLayer
          url="https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png"
          attribution='&copy; OpenStreetMap contributors'
        />
        <MarkerClusterGroup
          chunkedLoading
          iconCreateFunction={createCustomIcon}
          showCoverageOnHover={false}
          maxClusterRadius={50}
        >
          {data.map((place, idx) => (
            <Marker key={`${place.puesto}-${idx}`} position={[place.lat, place.lng]} icon={defaultIcon}>
              <Popup className="custom-popup">
                <div className="p-2 min-w-[200px] font-sans">
                  <h3 className="font-black text-teal-600 uppercase text-xs mb-1 leading-tight">{place.puesto}</h3>
                  <p className="text-[10px] font-bold text-slate-800 leading-tight mb-3">{place.direccion}</p>
                  <div className="flex flex-col gap-2 border-t pt-3 border-slate-100">
                    <span className="text-[9px] text-slate-400 uppercase font-black tracking-widest">{place.municipio}, {place.departamento}</span>
                    <span className="text-[10px] bg-teal-50 px-2 py-1 rounded text-teal-700 font-bold w-fit border border-teal-100 shadow-inner">Mesas: {place.mesas}</span>
                  </div>
                </div>
              </Popup>
            </Marker>
          ))}
        </MarkerClusterGroup>
      </MapContainer>
    </div>
  );
}
