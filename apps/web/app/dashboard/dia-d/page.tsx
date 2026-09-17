"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
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
  RefreshCw,
  Loader2,
  AlertCircle,
  XCircle,
} from "lucide-react";
import { ApiError, apiRequest } from "@/lib/api-client";

type VotingStatus = "VOTED" | "PENDING" | "NEEDS_TRANSPORT" | "NO_SHOW";

interface ElectionDayVoter {
  id: string;
  firstName: string;
  lastName: string;
  phone: string | null;
  votingStatus: VotingStatus;
  votedAt: string | null;
  puestoId: string | null;
  mesa: number | null;
  registrar: { id: string; name: string } | null;
  puesto: { id: string; name: string } | null;
}

interface ElectionDaySummary {
  total: number;
  voted: number;
  pending: number;
  needsTransport: number;
  noShow: number;
}

interface ElectionDayResponse {
  summary: ElectionDaySummary;
  voters: ElectionDayVoter[];
}

const STATUS_CONFIG: Record<
  VotingStatus,
  { label: string; badgeClass: string }
> = {
  VOTED: {
    label: "Ya Votó",
    badgeClass: "bg-green-100 text-green-800",
  },
  PENDING: {
    label: "Pendiente",
    badgeClass: "bg-amber-100 text-amber-800",
  },
  NEEDS_TRANSPORT: {
    label: "Requiere Transporte",
    badgeClass: "bg-purple-100 text-purple-800",
  },
  NO_SHOW: {
    label: "No asistió",
    badgeClass: "bg-red-100 text-red-800",
  },
};

async function fetchElectionDayData(
  signal?: AbortSignal,
): Promise<ElectionDayResponse> {
  return apiRequest("voters/election-day", { signal });
}

async function updateVoterStatus(
  voterId: string,
  status: VotingStatus,
): Promise<ElectionDayVoter> {
  return apiRequest(
    `voters/${encodeURIComponent(voterId)}/voting-status`,
    {
      method: "PATCH",
      body: JSON.stringify({ status }),
    },
  );
}

export default function DiaDTrackingPage() {
  const [data, setData] = useState<ElectionDayResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<VotingStatus | "ALL">("ALL");
  const [search, setSearch] = useState("");
  const [updatingIds, setUpdatingIds] = useState<Set<string>>(new Set());
  const [lastRefreshed, setLastRefreshed] = useState<Date>(new Date());

  const loadData = useCallback(async (signal?: AbortSignal) => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetchElectionDayData(signal);
      if (!signal?.aborted) {
        setData(response);
        setLastRefreshed(new Date());
      }
    } catch (err) {
      if (signal?.aborted) return;
      if (err instanceof ApiError) {
        setError(err.message);
      } else {
        setError("No fue posible cargar los datos del Día D.");
      }
    } finally {
      if (!signal?.aborted) setLoading(false);
    }
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    void loadData(controller.signal);
    return () => controller.abort();
  }, [loadData]);

  // Auto-refresh every 30 seconds
  useEffect(() => {
    const interval = setInterval(() => {
      void loadData();
    }, 30_000);
    return () => clearInterval(interval);
  }, [loadData]);

  async function handleStatusChange(voterId: string, newStatus: VotingStatus) {
    setUpdatingIds((prev) => new Set([...prev, voterId]));
    try {
      const updated = await updateVoterStatus(voterId, newStatus);
      setData((prev) => {
        if (!prev) return prev;
        const updatedVoters = prev.voters.map((v) =>
          v.id === voterId
            ? { ...v, votingStatus: updated.votingStatus, votedAt: updated.votedAt }
            : v,
        );
        // Recalculate summary
        const summary: ElectionDaySummary = {
          total: updatedVoters.length,
          voted: updatedVoters.filter((v) => v.votingStatus === "VOTED").length,
          pending: updatedVoters.filter((v) => v.votingStatus === "PENDING").length,
          needsTransport: updatedVoters.filter((v) => v.votingStatus === "NEEDS_TRANSPORT").length,
          noShow: updatedVoters.filter((v) => v.votingStatus === "NO_SHOW").length,
        };
        return { summary, voters: updatedVoters };
      });
    } catch {
      // Silently fail - the UI will still show the old status
    } finally {
      setUpdatingIds((prev) => {
        const next = new Set(prev);
        next.delete(voterId);
        return next;
      });
    }
  }

  const filteredVoters = useMemo(() => {
    if (!data) return [];
    return data.voters.filter((v) => {
      const matchesFilter = filter === "ALL" || v.votingStatus === filter;
      const fullName = `${v.firstName} ${v.lastName}`.toLowerCase();
      const leaderName = v.registrar?.name?.toLowerCase() ?? "";
      const matchesSearch =
        !search ||
        fullName.includes(search.toLowerCase()) ||
        leaderName.includes(search.toLowerCase());
      return matchesFilter && matchesSearch;
    });
  }, [data, filter, search]);

  // Group by registrar (leader)
  const groupedByLeader = useMemo(() => {
    const groups: Record<string, { leaderName: string; voters: ElectionDayVoter[] }> = {};
    for (const voter of filteredVoters) {
      const leaderKey = voter.registrar?.id ?? "sin-lider";
      const leaderName = voter.registrar?.name ?? "Sin líder asignado";
      if (!groups[leaderKey]) {
        groups[leaderKey] = { leaderName, voters: [] };
      }
      groups[leaderKey].voters.push(voter);
    }
    return Object.values(groups).sort((a, b) => a.leaderName.localeCompare(b.leaderName));
  }, [filteredVoters]);

  const summary = data?.summary ?? { total: 0, voted: 0, pending: 0, needsTransport: 0, noShow: 0 };
  const progressPercentage = summary.total > 0 ? Math.round((summary.voted / summary.total) * 100) : 0;

  if (loading && !data) {
    return (
      <div className="flex flex-col items-center justify-center py-24 gap-4 text-gray-400">
        <Loader2 className="w-8 h-8 animate-spin" />
        <p className="text-sm">Cargando datos del Día D…</p>
      </div>
    );
  }

  if (error && !data) {
    return (
      <div className="flex flex-col items-center justify-center py-24 gap-4">
        <AlertCircle className="w-12 h-12 text-red-400" />
        <h2 className="text-lg font-semibold text-gray-900">Error al cargar</h2>
        <p className="text-sm text-gray-500 max-w-md text-center">{error}</p>
        <button
          onClick={() => void loadData()}
          className="mt-4 px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 transition-colors"
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
            Día D — Tracking 1×10
          </h1>
          <p className="text-gray-500 mt-1">
            Monitoreo en tiempo real de la jornada electoral
          </p>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2 text-sm text-gray-500 bg-white px-4 py-2 rounded-lg border shadow-sm">
            <Clock className="w-4 h-4" />
            <span>
              {lastRefreshed.toLocaleTimeString("es-CO", {
                hour: "2-digit",
                minute: "2-digit",
              })}
            </span>
          </div>
          <button
            onClick={() => void loadData()}
            disabled={loading}
            className="p-2 bg-white border rounded-lg shadow-sm hover:bg-gray-50 disabled:opacity-50 transition-colors"
          >
            <RefreshCw className={`w-4 h-4 text-gray-600 ${loading ? "animate-spin" : ""}`} />
          </button>
        </div>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="bg-white rounded-xl border shadow-sm p-6">
          <div className="flex justify-between items-start">
            <div>
              <p className="text-sm font-medium text-gray-500">Progreso Global</p>
              <h3 className="text-3xl font-bold text-gray-900 mt-1">{progressPercentage}%</h3>
            </div>
            <div className="p-2 bg-blue-50 text-blue-600 rounded-lg">
              <BarChart3 className="w-5 h-5" />
            </div>
          </div>
          <div className="mt-4 w-full bg-gray-100 rounded-full h-2.5">
            <div
              className="bg-blue-600 h-2.5 rounded-full transition-all duration-500"
              style={{ width: `${progressPercentage}%` }}
            />
          </div>
        </div>

        <div className="bg-white rounded-xl border shadow-sm p-6">
          <div className="flex justify-between items-start">
            <div>
              <p className="text-sm font-medium text-gray-500">Votos Asegurados</p>
              <h3 className="text-3xl font-bold text-green-600 mt-1">
                {summary.voted}{" "}
                <span className="text-sm text-gray-400 font-normal">/ {summary.total}</span>
              </h3>
            </div>
            <div className="p-2 bg-green-50 text-green-600 rounded-lg">
              <CheckCircle2 className="w-5 h-5" />
            </div>
          </div>
        </div>

        <div className="bg-white rounded-xl border shadow-sm p-6">
          <div className="flex justify-between items-start">
            <div>
              <p className="text-sm font-medium text-gray-500">Faltan por Votar</p>
              <h3 className="text-3xl font-bold text-amber-600 mt-1">{summary.pending}</h3>
            </div>
            <div className="p-2 bg-amber-50 text-amber-600 rounded-lg">
              <Clock className="w-5 h-5" />
            </div>
          </div>
        </div>

        <div className="bg-white rounded-xl border shadow-sm p-6">
          <div className="flex justify-between items-start">
            <div>
              <p className="text-sm font-medium text-gray-500">Requieren Transporte</p>
              <h3 className="text-3xl font-bold text-purple-600 mt-1">{summary.needsTransport}</h3>
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
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>

        <div className="flex items-center gap-2 w-full md:w-auto overflow-x-auto pb-2 md:pb-0">
          <Filter className="w-4 h-4 text-gray-500 mr-2 shrink-0" />
          {(["ALL", "PENDING", "NEEDS_TRANSPORT", "VOTED", "NO_SHOW"] as const).map((f) => (
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
              {f === "PENDING" && `Faltan (${summary.pending})`}
              {f === "NEEDS_TRANSPORT" && `Transporte (${summary.needsTransport})`}
              {f === "VOTED" && `Votaron (${summary.voted})`}
              {f === "NO_SHOW" && `No asistió (${summary.noShow})`}
            </button>
          ))}
        </div>
      </div>

      {/* Empty State */}
      {filteredVoters.length === 0 && !loading && (
        <div className="text-center py-12 bg-white rounded-xl border border-dashed">
          <Users className="w-12 h-12 text-gray-300 mx-auto mb-3" />
          <h3 className="text-lg font-medium text-gray-900">
            {summary.total === 0
              ? "No hay simpatizantes registrados"
              : "No se encontraron resultados"}
          </h3>
          <p className="text-gray-500 mt-1">
            {summary.total === 0
              ? "Registra votantes en el módulo de Jornada Territorial primero."
              : "Intenta con otros términos de búsqueda o filtros."}
          </p>
        </div>
      )}

      {/* Grouped by Leader */}
      <div className="space-y-6">
        {groupedByLeader.map((group) => {
          const groupVoted = group.voters.filter((v) => v.votingStatus === "VOTED").length;
          const groupTotal = group.voters.length;
          const groupProgress = groupTotal > 0 ? Math.round((groupVoted / groupTotal) * 100) : 0;

          return (
            <div key={group.leaderName} className="bg-white rounded-xl border shadow-sm overflow-hidden">
              <div className="bg-gray-50 px-6 py-4 border-b flex justify-between items-center">
                <div className="flex items-center gap-3">
                  <div className="bg-blue-100 text-blue-700 p-2 rounded-lg">
                    <Users className="w-5 h-5" />
                  </div>
                  <div>
                    <h3 className="font-semibold text-gray-900">
                      Líder: {group.leaderName}
                    </h3>
                    <p className="text-sm text-gray-500">
                      {groupTotal} simpatizantes · {groupVoted} confirmados
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <div className="w-24 bg-gray-200 rounded-full h-2">
                    <div
                      className="bg-green-500 h-2 rounded-full transition-all duration-500"
                      style={{ width: `${groupProgress}%` }}
                    />
                  </div>
                  <span className="text-sm font-medium text-gray-600 tabular-nums">
                    {groupProgress}%
                  </span>
                </div>
              </div>

              <div className="divide-y divide-gray-100">
                {group.voters.map((voter) => {
                  const isUpdating = updatingIds.has(voter.id);
                  const statusInfo = STATUS_CONFIG[voter.votingStatus];

                  return (
                    <div
                      key={voter.id}
                      className="p-5 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 hover:bg-gray-50/50 transition-colors"
                    >
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1 flex-wrap">
                          <h4 className="font-semibold text-gray-900 truncate">
                            {voter.firstName} {voter.lastName}
                          </h4>
                          <span
                            className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${statusInfo.badgeClass}`}
                          >
                            {statusInfo.label}
                          </span>
                        </div>

                        <div className="flex flex-wrap items-center gap-4 text-sm text-gray-500 mt-1.5">
                          {voter.phone && (
                            <a
                              href={`tel:${voter.phone}`}
                              className="flex items-center gap-1.5 hover:text-blue-600 transition-colors"
                            >
                              <Phone className="w-3.5 h-3.5" />
                              {voter.phone}
                            </a>
                          )}
                          {voter.puesto && (
                            <div className="flex items-center gap-1.5">
                              <MapPin className="w-3.5 h-3.5" />
                              {voter.puesto.name}
                              {voter.mesa != null && (
                                <span className="text-gray-400">· Mesa {voter.mesa}</span>
                              )}
                            </div>
                          )}
                          {voter.votedAt && (
                            <div className="flex items-center gap-1.5 text-green-600">
                              <CheckCircle2 className="w-3.5 h-3.5" />
                              {new Date(voter.votedAt).toLocaleTimeString("es-CO", {
                                hour: "2-digit",
                                minute: "2-digit",
                              })}
                            </div>
                          )}
                        </div>
                      </div>

                      <div className="flex items-center gap-2 w-full sm:w-auto shrink-0">
                        {isUpdating ? (
                          <div className="flex items-center gap-2 px-4 py-2 text-sm text-gray-400">
                            <Loader2 className="w-4 h-4 animate-spin" />
                            Actualizando…
                          </div>
                        ) : (
                          <>
                            {voter.votingStatus !== "VOTED" && (
                              <button
                                onClick={() => handleStatusChange(voter.id, "VOTED")}
                                className="flex-1 sm:flex-none px-4 py-2 bg-green-600 hover:bg-green-700 text-white text-sm font-medium rounded-lg transition-colors flex items-center justify-center gap-2"
                              >
                                <CheckCircle2 className="w-4 h-4" />
                                Ya Votó
                              </button>
                            )}
                            {voter.votingStatus === "PENDING" && (
                              <button
                                onClick={() => handleStatusChange(voter.id, "NEEDS_TRANSPORT")}
                                className="flex-1 sm:flex-none px-4 py-2 bg-white border border-gray-200 hover:bg-gray-50 text-gray-700 text-sm font-medium rounded-lg transition-colors flex items-center justify-center gap-2 shadow-sm"
                              >
                                <Bus className="w-4 h-4" />
                                <span className="hidden sm:inline">Transporte</span>
                              </button>
                            )}
                            {voter.votingStatus === "VOTED" && (
                              <button
                                onClick={() => handleStatusChange(voter.id, "PENDING")}
                                className="px-3 py-2 bg-white border border-gray-200 hover:bg-gray-50 text-gray-500 text-xs font-medium rounded-lg transition-colors flex items-center justify-center gap-1.5 shadow-sm"
                              >
                                <XCircle className="w-3.5 h-3.5" />
                                Desmarcar
                              </button>
                            )}
                          </>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
