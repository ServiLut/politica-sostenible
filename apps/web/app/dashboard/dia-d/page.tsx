"use client";

import React, { useState } from "react";
import { 
  Users, 
  CheckCircle2, 
  Clock, 
  Bus, 
  Phone, 
  Search, 
  Filter, 
  BarChart3,
  MapPin,
  ChevronDown
} from "lucide-react";

// Mock Data
type Status = "VOTED" | "PENDING" | "NEEDS_TRANSPORT";

interface Supporter {
  id: string;
  name: string;
  phone: string;
  status: Status;
  votingCenter: string;
  liderZonal: string;
}

const INITIAL_DATA: Supporter[] = [
  { id: "1", name: "María González", phone: "310 123 4567", status: "VOTED", votingCenter: "Colegio San José", liderZonal: "Carlos Rodríguez" },
  { id: "2", name: "Juan Pérez", phone: "320 987 6543", status: "PENDING", votingCenter: "Escuela Central", liderZonal: "Carlos Rodríguez" },
  { id: "3", name: "Ana Martínez", phone: "300 456 7890", status: "NEEDS_TRANSPORT", votingCenter: "Polideportivo Sur", liderZonal: "Carlos Rodríguez" },
  { id: "4", name: "Luis Ramírez", phone: "315 234 5678", status: "VOTED", votingCenter: "Colegio San José", liderZonal: "Laura Gómez" },
  { id: "5", name: "Carmen López", phone: "311 345 6789", status: "PENDING", votingCenter: "Escuela Norte", liderZonal: "Laura Gómez" },
  { id: "6", name: "Pedro Silva", phone: "312 456 7890", status: "NEEDS_TRANSPORT", votingCenter: "Liceo Departamental", liderZonal: "Laura Gómez" },
  { id: "7", name: "Sofía Torres", phone: "318 567 8901", status: "PENDING", votingCenter: "Colegio San José", liderZonal: "Andrés Vargas" },
];

export default function DiaDTrackingPage() {
  const [supporters, setSupporters] = useState<Supporter[]>(INITIAL_DATA);
  const [filter, setFilter] = useState<Status | "ALL">("ALL");
  const [search, setSearch] = useState("");

  const totalVotes = supporters.length;
  const votesAssured = supporters.filter(s => s.status === "VOTED").length;
  const progressPercentage = Math.round((votesAssured / totalVotes) * 100) || 0;

  const handleMarkAsVoted = (id: string) => {
    setSupporters(prev => 
      prev.map(s => s.id === id ? { ...s, status: "VOTED" } : s)
    );
  };

  const handleNeedsTransport = (id: string) => {
    setSupporters(prev => 
      prev.map(s => s.id === id ? { ...s, status: "NEEDS_TRANSPORT" } : s)
    );
  };

  const filteredSupporters = supporters.filter(s => {
    const matchesFilter = filter === "ALL" || s.status === filter;
    const matchesSearch = s.name.toLowerCase().includes(search.toLowerCase()) || 
                          s.liderZonal.toLowerCase().includes(search.toLowerCase());
    return matchesFilter && matchesSearch;
  });

  // Group by Líder Zonal
  const groupedSupporters = filteredSupporters.reduce((acc, supporter) => {
    if (!acc[supporter.liderZonal]) {
      acc[supporter.liderZonal] = [];
    }
    acc[supporter.liderZonal].push(supporter);
    return acc;
  }, {} as Record<string, Supporter[]>);

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-gray-900">Día D - Tracking 1x10</h1>
          <p className="text-gray-500 mt-1">Monitoreo en tiempo real de la jornada electoral</p>
        </div>
        <div className="flex items-center gap-2 text-sm font-medium text-gray-500 bg-white px-4 py-2 rounded-lg border shadow-sm">
          <Clock className="w-4 h-4" />
          <span>Última actualización: Justo ahora</span>
        </div>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="bg-white rounded-xl border shadow-sm p-6 flex flex-col justify-between">
          <div className="flex justify-between items-start">
            <div>
              <p className="text-sm font-medium text-gray-500">Progreso Global</p>
              <h3 className="text-3xl font-bold text-gray-900 mt-1">{progressPercentage}%</h3>
            </div>
            <div className="p-2 bg-blue-50 text-blue-600 rounded-lg">
              <BarChart3 className="w-5 h-5" />
            </div>
          </div>
          <div className="mt-4 w-full bg-gray-100 rounded-full h-2">
            <div 
              className="bg-blue-600 h-2 rounded-full transition-all duration-500" 
              style={{ width: `${progressPercentage}%` }}
            />
          </div>
        </div>

        <div className="bg-white rounded-xl border shadow-sm p-6 flex flex-col justify-between">
          <div className="flex justify-between items-start">
            <div>
              <p className="text-sm font-medium text-gray-500">Votos Asegurados</p>
              <h3 className="text-3xl font-bold text-green-600 mt-1">{votesAssured} <span className="text-sm text-gray-400 font-normal">/ {totalVotes}</span></h3>
            </div>
            <div className="p-2 bg-green-50 text-green-600 rounded-lg">
              <CheckCircle2 className="w-5 h-5" />
            </div>
          </div>
        </div>

        <div className="bg-white rounded-xl border shadow-sm p-6 flex flex-col justify-between">
          <div className="flex justify-between items-start">
            <div>
              <p className="text-sm font-medium text-gray-500">Faltan por Votar</p>
              <h3 className="text-3xl font-bold text-amber-600 mt-1">
                {supporters.filter(s => s.status === "PENDING").length}
              </h3>
            </div>
            <div className="p-2 bg-amber-50 text-amber-600 rounded-lg">
              <Clock className="w-5 h-5" />
            </div>
          </div>
        </div>

        <div className="bg-white rounded-xl border shadow-sm p-6 flex flex-col justify-between">
          <div className="flex justify-between items-start">
            <div>
              <p className="text-sm font-medium text-gray-500">Requieren Transporte</p>
              <h3 className="text-3xl font-bold text-purple-600 mt-1">
                {supporters.filter(s => s.status === "NEEDS_TRANSPORT").length}
              </h3>
            </div>
            <div className="p-2 bg-purple-50 text-purple-600 rounded-lg">
              <Bus className="w-5 h-5" />
            </div>
          </div>
        </div>
      </div>

      {/* Controls */}
      <div className="bg-white p-4 rounded-xl border shadow-sm flex flex-col md:flex-row gap-4 justify-between items-center">
        <div className="relative w-full md:w-96">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 w-4 h-4" />
          <input 
            type="text" 
            placeholder="Buscar por nombre o líder zonal..." 
            className="w-full pl-9 pr-4 py-2 bg-gray-50 border-gray-200 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:bg-white transition-all text-sm"
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
        </div>
        
        <div className="flex items-center gap-2 w-full md:w-auto overflow-x-auto pb-2 md:pb-0">
          <Filter className="w-4 h-4 text-gray-500 mr-2" />
          {(["ALL", "PENDING", "NEEDS_TRANSPORT", "VOTED"] as const).map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`px-3 py-1.5 rounded-full text-xs font-medium whitespace-nowrap transition-colors ${
                filter === f 
                  ? "bg-gray-900 text-white" 
                  : "bg-gray-100 text-gray-600 hover:bg-gray-200"
              }`}
            >
              {f === "ALL" && "Todos"}
              {f === "PENDING" && "Faltan"}
              {f === "NEEDS_TRANSPORT" && "Transporte"}
              {f === "VOTED" && "Ya Votaron"}
            </button>
          ))}
        </div>
      </div>

      {/* List */}
      <div className="space-y-6">
        {Object.entries(groupedSupporters).length === 0 ? (
          <div className="text-center py-12 bg-white rounded-xl border border-dashed">
            <Users className="w-12 h-12 text-gray-300 mx-auto mb-3" />
            <h3 className="text-lg font-medium text-gray-900">No se encontraron resultados</h3>
            <p className="text-gray-500">Intenta con otros términos de búsqueda o filtros.</p>
          </div>
        ) : (
          Object.entries(groupedSupporters).map(([lider, list]) => (
            <div key={lider} className="bg-white rounded-xl border shadow-sm overflow-hidden">
              <div className="bg-gray-50 px-6 py-4 border-b flex justify-between items-center">
                <div className="flex items-center gap-3">
                  <div className="bg-blue-100 text-blue-700 p-2 rounded-lg">
                    <Users className="w-5 h-5" />
                  </div>
                  <div>
                    <h3 className="font-semibold text-gray-900">Líder Zonal: {lider}</h3>
                    <p className="text-sm text-gray-500">{list.length} simpatizantes referidos</p>
                  </div>
                </div>
                <div className="text-sm font-medium text-gray-500">
                  {Math.round((list.filter(s => s.status === "VOTED").length / list.length) * 100)}% de avance
                </div>
              </div>
              
              <div className="divide-y divide-gray-100">
                {list.map(supporter => (
                  <div key={supporter.id} className="p-6 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 hover:bg-gray-50/50 transition-colors">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        <h4 className="font-semibold text-gray-900">{supporter.name}</h4>
                        {supporter.status === "VOTED" && (
                          <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-green-100 text-green-800">
                            Ya Votó
                          </span>
                        )}
                        {supporter.status === "NEEDS_TRANSPORT" && (
                          <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-purple-100 text-purple-800">
                            Requiere Transporte
                          </span>
                        )}
                        {supporter.status === "PENDING" && (
                          <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-amber-100 text-amber-800">
                            Pendiente
                          </span>
                        )}
                      </div>
                      
                      <div className="flex flex-wrap items-center gap-4 text-sm text-gray-500 mt-2">
                        <div className="flex items-center gap-1.5">
                          <Phone className="w-3.5 h-3.5" />
                          {supporter.phone}
                        </div>
                        <div className="flex items-center gap-1.5">
                          <MapPin className="w-3.5 h-3.5" />
                          {supporter.votingCenter}
                        </div>
                      </div>
                    </div>
                    
                    <div className="flex items-center gap-2 w-full sm:w-auto mt-4 sm:mt-0">
                      {supporter.status !== "VOTED" && (
                        <>
                          <button 
                            onClick={() => handleMarkAsVoted(supporter.id)}
                            className="flex-1 sm:flex-none px-4 py-2 bg-green-600 hover:bg-green-700 text-white text-sm font-medium rounded-lg transition-colors flex items-center justify-center gap-2"
                          >
                            <CheckCircle2 className="w-4 h-4" />
                            Ya Votó
                          </button>
                          
                          {supporter.status !== "NEEDS_TRANSPORT" && (
                            <button 
                              onClick={() => handleNeedsTransport(supporter.id)}
                              className="flex-1 sm:flex-none px-4 py-2 bg-white border border-gray-200 hover:bg-gray-50 text-gray-700 text-sm font-medium rounded-lg transition-colors flex items-center justify-center gap-2 shadow-sm"
                            >
                              <Bus className="w-4 h-4" />
                              <span className="hidden sm:inline">Transporte</span>
                            </button>
                          )}
                        </>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
