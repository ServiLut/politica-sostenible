"use client";

import { useCallback, useEffect, useState } from "react";
import {
  AlertCircle,
  ChevronRight,
  Loader2,
  Mail,
  MapPin,
  Phone,
  RefreshCw,
  Share2,
  UserPlus,
  Users,
} from "lucide-react";
import { ApiError, apiRequest } from "@/lib/api-client";
import { CreateLeaderModal } from "@/components/territory/CreateLeaderModal";

interface Division {
  id: string;
  code: string;
  name: string;
  type: "MUNICIPIO" | "ZONA" | "PUESTO";
  parent: { name: string } | null;
}

interface Leader {
  id: string;
  name: string;
  phone: string | null;
  email: string | null;
  socialNetworkUrl: string | null;
  roleDescription: string;
  politicalAffinity: string | null;
  observations: string | null;
}

interface DivisionResult {
  items: Division[];
  pagination: { page: number; limit: number; total: number; totalPages: number };
}

export default function TerritoryLeadersPage() {
  const [divisions, setDivisions] = useState<Division[]>([]);
  const [leadersByDivision, setLeadersByDivision] = useState<Record<string, Leader[]>>({});
  const [loading, setLoading] = useState(true);
  const [loadingLeaders, setLoadingLeaders] = useState<Set<string>>(new Set());
  const [error, setError] = useState<string | null>(null);
  const [selectedDivision, setSelectedDivision] = useState<Division | null>(null);

  const loadDivisions = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      // Load all division types
      const [munis, zonas, puestos] = await Promise.all([
        apiRequest<DivisionResult>("campaigns/divisions?type=MUNICIPIO&page=1&limit=200"),
        apiRequest<DivisionResult>("campaigns/divisions?type=ZONA&page=1&limit=200"),
        apiRequest<DivisionResult>("campaigns/divisions?type=PUESTO&page=1&limit=200"),
      ]);
      const all = [...munis.items, ...zonas.items, ...puestos.items];
      setDivisions(all);

      // Load leaders for each division
      const leaderMap: Record<string, Leader[]> = {};
      const batches: Promise<void>[] = [];
      for (const div of all) {
        batches.push(
          apiRequest<Leader[]>(`campaigns/divisions/${encodeURIComponent(div.id)}/leaders`)
            .then((leaders) => {
              if (leaders.length > 0) {
                leaderMap[div.id] = leaders;
              }
            })
            .catch(() => {
              // Skip divisions where leaders fail to load
            }),
        );
      }
      await Promise.all(batches);
      setLeadersByDivision(leaderMap);
    } catch (err) {
      setError(
        err instanceof ApiError
          ? err.message
          : "No fue posible cargar los territorios.",
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadDivisions();
  }, [loadDivisions]);

  const divisionsWithLeaders = divisions.filter((d) => leadersByDivision[d.id]?.length);
  const divisionsWithoutLeaders = divisions.filter((d) => !leadersByDivision[d.id]?.length);
  const totalLeaders = Object.values(leadersByDivision).reduce((sum, arr) => sum + arr.length, 0);

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-24 gap-4 text-gray-400">
        <Loader2 className="w-8 h-8 animate-spin" />
        <p className="text-sm">Cargando líderes territoriales…</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center py-24 gap-4">
        <AlertCircle className="w-12 h-12 text-red-400" />
        <p className="text-sm text-gray-500 max-w-md text-center">{error}</p>
        <button
          onClick={() => void loadDivisions()}
          className="mt-4 px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700"
        >
          Reintentar
        </button>
      </div>
    );
  }

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-gray-900">
            Líderes Territoriales
          </h1>
          <p className="text-gray-500 mt-1">
            Gestiona los líderes asignados a cada zona, municipio y puesto
          </p>
        </div>
        <button
          onClick={() => void loadDivisions()}
          className="inline-flex items-center gap-2 px-4 py-2 bg-white border rounded-lg shadow-sm hover:bg-gray-50 text-sm font-medium"
        >
          <RefreshCw className="w-4 h-4" />
          Actualizar
        </button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-white rounded-xl border shadow-sm p-6">
          <p className="text-sm font-medium text-gray-500">Total Líderes</p>
          <h3 className="text-3xl font-bold text-blue-600 mt-1">{totalLeaders}</h3>
        </div>
        <div className="bg-white rounded-xl border shadow-sm p-6">
          <p className="text-sm font-medium text-gray-500">Territorios con Líder</p>
          <h3 className="text-3xl font-bold text-green-600 mt-1">{divisionsWithLeaders.length}</h3>
        </div>
        <div className="bg-white rounded-xl border shadow-sm p-6">
          <p className="text-sm font-medium text-gray-500">Territorios sin Líder</p>
          <h3 className="text-3xl font-bold text-amber-600 mt-1">{divisionsWithoutLeaders.length}</h3>
        </div>
      </div>

      {/* Divisions WITH leaders */}
      {divisionsWithLeaders.length > 0 && (
        <div className="space-y-4">
          <h2 className="text-lg font-bold text-gray-900">
            Territorios con líderes asignados
          </h2>
          {divisionsWithLeaders.map((div) => (
            <div key={div.id} className="bg-white rounded-xl border shadow-sm overflow-hidden">
              <div className="bg-gray-50 px-6 py-4 border-b flex justify-between items-center">
                <div className="flex items-center gap-3">
                  <div className="bg-blue-100 text-blue-700 p-2 rounded-lg">
                    <MapPin className="w-5 h-5" />
                  </div>
                  <div>
                    <h3 className="font-semibold text-gray-900">{div.name}</h3>
                    <p className="text-xs text-gray-500">
                      {div.type} · Código {div.code}
                      {div.parent && <> · {div.parent.name}</>}
                    </p>
                  </div>
                </div>
                <button
                  onClick={() => setSelectedDivision(div)}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-blue-50 text-blue-700 rounded-lg text-xs font-bold hover:bg-blue-100"
                >
                  <UserPlus className="w-4 h-4" />
                  Agregar
                </button>
              </div>
              <div className="divide-y divide-gray-100">
                {(leadersByDivision[div.id] ?? []).map((leader) => (
                  <div key={leader.id} className="px-6 py-4">
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex items-start gap-3">
                        <div className="bg-green-100 text-green-700 p-2 rounded-full mt-0.5">
                          <Users className="w-4 h-4" />
                        </div>
                        <div>
                          <p className="font-semibold text-gray-900">{leader.name}</p>
                          <p className="text-xs text-gray-500">{leader.roleDescription}</p>
                          {leader.politicalAffinity && (
                            <span className="inline-block mt-1 px-2 py-0.5 bg-blue-50 text-blue-700 text-xs font-medium rounded-full">
                              {leader.politicalAffinity}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                    <div className="mt-2 ml-11 flex flex-wrap items-center gap-x-4 gap-y-1">
                      {leader.phone && (
                        <a
                          href={`tel:${leader.phone}`}
                          className="flex items-center gap-1 text-sm text-blue-600 hover:underline"
                        >
                          <Phone className="w-3.5 h-3.5" />
                          {leader.phone}
                        </a>
                      )}
                      {leader.email && (
                        <a
                          href={`mailto:${leader.email}`}
                          className="flex items-center gap-1 text-sm text-blue-600 hover:underline"
                        >
                          <Mail className="w-3.5 h-3.5" />
                          {leader.email}
                        </a>
                      )}
                      {leader.socialNetworkUrl && (
                        <a
                          href={leader.socialNetworkUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="flex items-center gap-1 text-sm text-purple-600 hover:underline"
                        >
                          <Share2 className="w-3.5 h-3.5" />
                          Red social
                        </a>
                      )}
                    </div>
                    {leader.observations && (
                      <p className="mt-2 ml-11 text-xs text-gray-400 italic">
                        {leader.observations}
                      </p>
                    )}
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Divisions WITHOUT leaders */}
      {divisionsWithoutLeaders.length > 0 && (
        <div className="space-y-4">
          <h2 className="text-lg font-bold text-gray-900">
            Territorios sin líder ({divisionsWithoutLeaders.length})
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {divisionsWithoutLeaders.slice(0, 30).map((div) => (
              <div
                key={div.id}
                className="bg-white rounded-lg border p-4 flex items-center justify-between"
              >
                <div>
                  <p className="font-medium text-gray-900 text-sm">{div.name}</p>
                  <p className="text-xs text-gray-400">
                    {div.type} · {div.code}
                  </p>
                </div>
                <button
                  onClick={() => setSelectedDivision(div)}
                  className="p-2 text-blue-600 hover:bg-blue-50 rounded-lg"
                >
                  <UserPlus className="w-4 h-4" />
                </button>
              </div>
            ))}
          </div>
          {divisionsWithoutLeaders.length > 30 && (
            <p className="text-sm text-gray-400 text-center">
              Mostrando 30 de {divisionsWithoutLeaders.length} territorios sin líder
            </p>
          )}
        </div>
      )}

      {divisions.length === 0 && (
        <div className="text-center py-12 bg-white rounded-xl border border-dashed">
          <MapPin className="w-12 h-12 text-gray-300 mx-auto mb-3" />
          <h3 className="text-lg font-medium text-gray-900">No hay territorios</h3>
          <p className="text-gray-500 mt-1">
            Sincroniza la geografía DANE primero desde la página de Territorio.
          </p>
        </div>
      )}

      {selectedDivision && (
        <CreateLeaderModal
          divisionId={selectedDivision.id}
          divisionName={selectedDivision.name}
          onClose={() => setSelectedDivision(null)}
          onSuccess={() => {
            setSelectedDivision(null);
            void loadDivisions();
          }}
        />
      )}
    </div>
  );
}
