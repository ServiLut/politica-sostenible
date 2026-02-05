'use client';

import { useEffect, useState } from 'react';
import { MapContainer, TileLayer, Marker, Popup, Tooltip, useMap } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { useRouter, useSearchParams } from 'next/navigation';
import { Filter, AlertTriangle, ShieldCheck, Activity, X, Users, FileText, ChevronRight } from 'lucide-react';
import { getUsers } from '@/app/actions/team'; // Import server action

interface TerritoryData {
  id: string;
  name: string;
  level: string;
  lat: number;
  lng: number;
  count: number;
  status: 'CRITICAL' | 'WARNING' | 'SAFE';
}

const statusColors = {
  CRITICAL: '#ef4444', // Red-500
  WARNING: '#eab308', // Yellow-500
  SAFE: '#22c55e',    // Green-500
};

// Sub-component to handle Map Logic (Bounds, Logs)
function MapLogic({ data, isRestricted, onAudit }: { data: TerritoryData[], isRestricted: boolean, onAudit: (center: any, zoom: number) => void }) {
    const map = useMap();
    const [hasFitted, setHasFitted] = useState(false);

    useEffect(() => {
        if (data.length > 0 && !hasFitted) {
            const points = data.map(t => L.latLng(t.lat, t.lng));
            const bounds = L.latLngBounds(points);

            if (isRestricted) {
                map.fitBounds(bounds, { padding: [50, 50], maxZoom: 16 });
                // Lock pan area
                map.setMaxBounds(bounds.pad(0.5)); 
                map.options.minZoom = 12;
            } else {
                 // Admin: Fit once nicely but don't lock
                 map.fitBounds(bounds, { padding: [50, 50] });
            }
            setHasFitted(true);

            // Audit Log (Initial View)
            onAudit(map.getCenter(), map.getZoom());
        }
    }, [data, isRestricted, map, hasFitted, onAudit]);

    return null;
}

export default function TerritoryMap() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const filter = searchParams.get('filter'); // 'critical'

  const [data, setData] = useState<TerritoryData[]>([]);
  const [loading, setLoading] = useState(true);
  const [elections, setElections] = useState<any[]>([]);
  const [selectedElection, setSelectedElection] = useState('');
  const [isRestricted, setIsRestricted] = useState(false);

  // Inspector State
  const [selectedZone, setSelectedZone] = useState<TerritoryData | null>(null);
  const [zoneLeaders, setZoneLeaders] = useState<any[]>([]);
  const [loadingLeaders, setLoadingLeaders] = useState(false);

  // Filter invalid coordinates (Null Island or missing)
  const validData = data.filter(t => 
    t.lat && t.lng && 
    !isNaN(t.lat) && !isNaN(t.lng) && 
    (t.lat !== 0 || t.lng !== 0) &&
    (filter === 'critical' ? t.status === 'CRITICAL' : true)
  );

  // 1. Load Elections
  useEffect(() => {
    fetch('/api/election/list')
        .then(res => res.json())
        .then(data => {
            if (Array.isArray(data)) {
                setElections(data);
                if (data.length > 0) setSelectedElection(data[0].id); // Default to first
            }
        })
        .catch(e => console.error(e));
  }, []);

  // 2. Load Stats based on Selection
  useEffect(() => {
    setLoading(true);
    const params = new URLSearchParams();
    if (selectedElection) params.append('electionId', selectedElection);

    fetch(`/api/territory/stats?${params.toString()}`)
      .then(res => res.json())
      .then(res => {
        if (res.stats && Array.isArray(res.stats)) {
            setData(res.stats);
            setIsRestricted(res.isRestricted);
        } else {
            setData([]);
        }
        setLoading(false);
      })
      .catch(e => { console.error(e); setLoading(false); });
  }, [selectedElection]);

  // 3. Fetch Leaders when Zone Selected
  useEffect(() => {
      if (selectedZone) {
          setLoadingLeaders(true);
          // Fetch leaders via server action and filter client-side (optimization for prototype)
          getUsers({ role: 'LEADER', page: 1 }) 
            .then(res => {
                // Filter leaders who belong to this territory
                const relevant = res.users.filter((u: any) => u.territoryId === selectedZone.id);
                setZoneLeaders(relevant);
            })
            .catch(() => setZoneLeaders([]))
            .finally(() => setLoadingLeaders(false));
      }
  }, [selectedZone]);

  const handleAudit = (center: any, zoom: number) => {
      // Log view action
      fetch('/api/audit/create', {
          method: 'POST',
          headers: {'Content-Type': 'application/json'},
          body: JSON.stringify({
              action: 'VIEW_MAP',
              entity: 'TerritoryMap',
              details: { 
                  center: { lat: center.lat, lng: center.lng }, 
                  zoom,
                  electionFilter: selectedElection 
              }
          })
      }).catch(e => console.error('Audit failed', e));
  };

  return (
    <div className="relative h-[600px] w-full rounded-2xl overflow-hidden shadow-2xl border border-slate-200 bg-slate-50">
      
      {/* FILTER CONTROL (Floating) */}
      <div className="absolute top-4 right-4 z-[400] bg-white p-2 rounded-xl shadow-lg border border-slate-100 flex items-center gap-2">
          <div className="bg-slate-100 p-2 rounded-lg text-slate-500">
             <Filter className="w-5 h-5" />
          </div>
          <select 
            className="bg-transparent font-bold text-slate-700 outline-none text-sm pr-2 cursor-pointer min-w-[150px]"
            value={selectedElection}
            onChange={(e) => setSelectedElection(e.target.value)}
          >
              <option value="">-- Consolidado Global --</option>
              {elections.map(e => (
                  <option key={e.id} value={e.id}>{e.name}</option>
              ))}
          </select>
      </div>

      {loading && (
        <div className="absolute inset-0 z-[500] bg-white/80 backdrop-blur-sm flex flex-col items-center justify-center text-slate-500">
            <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-blue-600 mb-4"></div>
            <p className="font-medium">Analizando Territorio...</p>
        </div>
      )}

      <MapContainer 
        center={[6.2442, -75.5812]} 
        zoom={12} 
        style={{ height: '100%', width: '100%' }}
        scrollWheelZoom={!isRestricted} 
      >
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        
        <MapLogic data={validData} isRestricted={isRestricted} onAudit={handleAudit} />

        {/* Global Styles for Pulse Effect */}
        <style jsx global>{`
            @keyframes pulse-red { 0% { box-shadow: 0 0 0 0 rgba(239, 68, 68, 0.7); } 70% { box-shadow: 0 0 0 15px rgba(239, 68, 68, 0); } 100% { box-shadow: 0 0 0 0 rgba(239, 68, 68, 0); } }
            @keyframes pulse-yellow { 0% { box-shadow: 0 0 0 0 rgba(234, 179, 8, 0.7); } 70% { box-shadow: 0 0 0 15px rgba(234, 179, 8, 0); } 100% { box-shadow: 0 0 0 0 rgba(234, 179, 8, 0); } }
            @keyframes pulse-green { 0% { box-shadow: 0 0 0 0 rgba(34, 197, 94, 0.7); } 70% { box-shadow: 0 0 0 15px rgba(34, 197, 94, 0); } 100% { box-shadow: 0 0 0 0 rgba(34, 197, 94, 0); } }
            
            .marker-critical { background: #ef4444; border: 2px solid white; border-radius: 50%; animation: pulse-red 2s infinite; }
            .marker-warning { background: #eab308; border: 2px solid white; border-radius: 50%; animation: pulse-yellow 3s infinite; }
            .marker-safe { background: #22c55e; border: 2px solid white; border-radius: 50%; box-shadow: 0 0 15px #22c55e; }
        `}</style>

        {validData.map((t) => {
            // Determine size based on count
            const size = t.count > 100 ? 32 : t.count > 50 ? 24 : 16;
            const iconClass = t.status === 'CRITICAL' ? 'marker-critical' : t.status === 'WARNING' ? 'marker-warning' : 'marker-safe';
            
            const customIcon = L.divIcon({
                className: '', // Clear default
                html: `<div class="${iconClass}" style="width: ${size}px; height: ${size}px;"></div>`,
                iconSize: [size, size],
                iconAnchor: [size / 2, size / 2]
            });

            return (
                <div key={t.id}> 
                    <Marker 
                        position={[t.lat, t.lng]}
                        icon={customIcon}
                        eventHandlers={{
                            click: () => setSelectedZone(t),
                            mouseover: (e) => e.target.openPopup(),
                            mouseout: (e) => e.target.closePopup()
                        }}
                    >
                        <Tooltip direction="top" offset={[0, -10]} opacity={1} className="font-bold text-xs bg-slate-900 text-white border-none px-2 py-1 rounded shadow-xl">
                        {t.count}
                        </Tooltip>
                        <Popup offset={[0, -10]}>
                            <div className="p-2 font-sans text-center min-w-[150px]">
                                <h3 className="font-bold text-slate-900 text-sm">{t.name}</h3>
                                <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-2">{t.level}</div>
                                <div className="text-xs font-medium text-slate-600">
                                    <span className="font-black text-slate-900">{t.count}</span> Votos
                                </div>
                            </div>
                        </Popup>
                    </Marker>
                </div>
            );
        })}
      </MapContainer>

      {/* TACTICAL INSPECTOR (Side Panel) */}
      {selectedZone && (
        <>
            <div className="absolute inset-0 bg-slate-900/20 backdrop-blur-[2px] z-[900]" onClick={() => setSelectedZone(null)} />
            <div className="absolute inset-y-0 right-0 w-80 bg-white shadow-2xl z-[1000] border-l border-slate-200 p-6 animate-in slide-in-from-right duration-300 flex flex-col">
                {/* Header */}
                <div className="flex justify-between items-start mb-6">
                    <div>
                        <h2 className="text-2xl font-black text-slate-900 leading-tight">{selectedZone.name}</h2>
                        <span className="text-xs font-bold text-slate-400 uppercase tracking-widest">{selectedZone.level}</span>
                    </div>
                    <button onClick={() => setSelectedZone(null)} className="p-2 hover:bg-slate-100 rounded-full transition-colors">
                        <X className="w-5 h-5 text-slate-400" />
                    </button>
                </div>

                {/* Impact Card */}
                <div className={`rounded-2xl p-6 mb-6 border text-center ${
                    selectedZone.status === 'CRITICAL' ? 'bg-red-50 border-red-100' :
                    selectedZone.status === 'WARNING' ? 'bg-yellow-50 border-yellow-100' :
                    'bg-green-50 border-green-100'
                }`}>
                    <div className={`text-4xl font-black mb-1 ${
                        selectedZone.status === 'CRITICAL' ? 'text-red-600' :
                        selectedZone.status === 'WARNING' ? 'text-yellow-600' :
                        'text-green-600'
                    }`}>{selectedZone.count}</div>
                    <div className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Votos Registrados</div>
                </div>

                {/* Leaders List */}
                <div className="mb-8 flex-1 overflow-y-auto">
                    <h4 className="text-xs font-black text-slate-400 uppercase tracking-widest mb-4 flex items-center gap-2">
                        <Users className="w-4 h-4" /> Líderes Asignados
                    </h4>
                    <div className="space-y-3">
                        {loadingLeaders ? (
                            <div className="text-center py-4 text-xs text-slate-400 animate-pulse">Buscando líderes...</div>
                        ) : zoneLeaders.length > 0 ? (
                            zoneLeaders.map(l => (
                                <div key={l.id} className="flex items-center gap-3 p-3 bg-slate-50 rounded-xl">
                                    <div className="w-8 h-8 bg-white border border-slate-200 rounded-full flex items-center justify-center text-xs font-bold text-slate-700 shadow-sm">
                                        {(l.fullName || 'U').charAt(0)}
                                    </div>
                                    <div className="flex-1">
                                        <div className="text-xs font-bold text-slate-800">{l.fullName}</div>
                                        <div className="text-[10px] text-slate-400">{l.role}</div>
                                    </div>
                                </div>
                            ))
                        ) : (
                            <div className="text-center py-6 bg-slate-50 rounded-xl border border-dashed border-slate-200">
                                <p className="text-xs text-slate-400 italic">Sin líderes asignados aún.</p>
                            </div>
                        )}
                    </div>
                </div>

                {/* Main Action */}
                <button 
                    onClick={() => router.push(`/dashboard/directory?territoryId=${selectedZone.id}`)}
                    className="w-full py-4 bg-slate-900 text-white rounded-xl font-bold text-xs uppercase tracking-widest hover:bg-slate-800 transition-all flex items-center justify-center gap-2 shadow-xl shadow-slate-900/20 active:scale-[0.98]"
                >
                    <FileText className="w-4 h-4" /> Ver Directorio Detallado
                </button>
            </div>
        </>
      )}

      {/* FIXED LEGEND */}
      <div className="absolute bottom-6 left-6 z-[400] bg-white/95 backdrop-blur rounded-xl shadow-lg border border-slate-200 p-3 flex gap-4 text-xs font-bold text-slate-600">
            <div className="flex items-center gap-1.5">
                <span className="w-3 h-3 rounded-full bg-red-500"></span> Débil (&lt;10)
            </div>
            <div className="flex items-center gap-1.5">
                <span className="w-3 h-3 rounded-full bg-yellow-500"></span> Disputa (10-50)
            </div>
            <div className="flex items-center gap-1.5">
                <span className="w-3 h-3 rounded-full bg-green-500"></span> Bastión (&gt;50)
            </div>
      </div>
    </div>
  );
}