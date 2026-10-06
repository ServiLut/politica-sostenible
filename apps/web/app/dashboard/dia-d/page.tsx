"use client";
import { PageHeader } from "@/components/ui/PageHeader";

import { usePageRequest } from "@/lib/use-page-request";

import { ApiError, apiRequest } from "@/lib/api-client";
import {
  AlertCircle,
  BarChart3,
  Bus,
  CheckCircle2,
  Clock,
  Filter,
  Loader2,
  MapPin,
  Phone,
  RefreshCw,
  Search,
  Users,
  XCircle,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";

type VotingStatus = "VOTED" | "PENDING" | "NEEDS_TRANSPORT" | "NO_SHOW";

interface ElectionDayVoter {
  id: string;
  firstName: string;
  lastName: string;
  phoneMasked: string | null;
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
    label: "Participación reportada",
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
  return apiRequest(`voters/${encodeURIComponent(voterId)}/voting-status`, {
    method: "PATCH",
    body: JSON.stringify({ status }),
  });
}

export default function DiaDTrackingPage() {
  const [filter, setFilter] = useState<VotingStatus | "ALL">("ALL");
  const [search, setSearch] = useState("");
  const [updatingIds, setUpdatingIds] = useState<Set<string>>(new Set());
  const [updateError, setUpdateError] = useState<string | null>(null);
  const pendingUpdates = useRef(new Set<string>());

  const {
    data,
    loading,
    error: requestError,
    receivedAt,
    refresh: loadData,
    setData,
  } = usePageRequest(fetchElectionDayData, { retainDataOnRefresh: true });
  const error =
    requestError instanceof ApiError
      ? requestError.message
      : requestError
        ? "No fue posible cargar los datos del Día D."
        : null;
  const lastRefreshed = receivedAt === null ? null : new Date(receivedAt);

  // Auto-refresh every 30 seconds
  useEffect(() => {
    const interval = setInterval(() => {
      if (
        pendingUpdates.current.size > 0 ||
        document.visibilityState !== "visible"
      )
        return;
      void loadData();
    }, 30_000);
    return () => {
      clearInterval(interval);
    };
  }, [loadData]);

  async function handleStatusChange(voterId: string, newStatus: VotingStatus) {
    if (pendingUpdates.current.has(voterId)) return;
    pendingUpdates.current.add(voterId);
    setData(data);
    setUpdatingIds((prev) => new Set([...prev, voterId]));
    setUpdateError(null);
    try {
      await updateVoterStatus(voterId, newStatus);
      await loadData();
    } catch (err) {
      const message =
        err instanceof ApiError
          ? err.message
          : "No fue posible actualizar el estado del votante.";
      setUpdateError(message);
    } finally {
      pendingUpdates.current.delete(voterId);
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
    const groups: Record<
      string,
      { leaderId: string; leaderName: string; voters: ElectionDayVoter[] }
    > = {};
    for (const voter of filteredVoters) {
      const leaderKey = voter.registrar?.id ?? "sin-lider";
      const leaderName = voter.registrar?.name ?? "Sin líder asignado";
      if (!groups[leaderKey]) {
        groups[leaderKey] = { leaderId: leaderKey, leaderName, voters: [] };
      }
      groups[leaderKey].voters.push(voter);
    }
    return Object.values(groups).sort((a, b) =>
      a.leaderName.localeCompare(b.leaderName),
    );
  }, [filteredVoters]);

  const summary = data?.summary ?? {
    total: 0,
    voted: 0,
    pending: 0,
    needsTransport: 0,
    noShow: 0,
  };
  const progressPercentage =
    summary.total > 0 ? Math.round((summary.voted / summary.total) * 100) : 0;

  if (loading && !data) {
    return (
      <div className="flex flex-col items-center justify-center py-24 gap-4 text-gray-400 min-w-0">
        <Loader2 className="w-8 h-8 animate-spin" />
        <p className="text-sm">Cargando datos del Día D…</p>
      </div>
    );
  }

  if (error && !data) {
    return (
      <div className="flex flex-col items-center justify-center py-24 gap-4 min-w-0">
        <AlertCircle className="w-12 h-12 text-red-400" />
        <h2 className="text-lg font-semibold text-gray-900">Error al cargar</h2>
        <p className="text-sm text-gray-500 max-w-md text-center">{error}</p>
        <button
          type="button"
          onClick={() => void loadData()}
          className="mt-4 px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 transition-colors max-w-full whitespace-normal"
        >
          Reintentar
        </button>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto space-y-6 min-w-0">
      {updateError && (
        <div
          role="alert"
          className="bg-red-50 border border-red-200 text-red-700 rounded-lg px-4 py-3 text-sm flex items-center justify-between min-w-0 flex-wrap gap-3"
        >
          <span>{updateError}</span>
          <button
            type="button"
            aria-label="Cerrar aviso de actualización"
            onClick={() => setUpdateError(null)}
            className="ml-4 text-red-500 hover:text-red-700 max-w-full whitespace-normal"
          >
            ✕
          </button>
        </div>
      )}
      <PageHeader
        title="Día D — Seguimiento de participación"
        description="Reportes manuales del equipo, actualizados cada 30 segundos. No son votos asegurados ni resultados oficiales."
        icon={BarChart3}
        actions={
          <div className="flex items-center gap-3 min-w-0 flex-wrap">
            <div className="flex items-center gap-2 text-sm text-gray-500 bg-white px-4 py-2 rounded-lg border shadow-sm min-w-0">
              <Clock className="w-4 h-4" />
              <span>
                {lastRefreshed?.toLocaleTimeString("es-CO", {
                  hour: "2-digit",
                  minute: "2-digit",
                })}
              </span>
            </div>
            <button
              type="button"
              aria-label="Actualizar seguimiento de participación"
              onClick={() => void loadData()}
              disabled={loading || updatingIds.size > 0}
              className="inline-flex h-11 w-11 items-center justify-center bg-white border border-slate-200 rounded-xl shadow-sm hover:bg-gray-50 disabled:opacity-50 transition-colors max-w-full whitespace-normal"
            >
              <RefreshCw
                className={`w-4 h-4 text-gray-600 ${loading ? "animate-spin" : ""}`}
              />
            </button>
          </div>
        }
      />

      {error && data && (
        <div
          role="alert"
          className="rounded-xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-950 min-w-0"
        >
          No se pudo actualizar: {error} Se conserva el último corte recibido;
          los estados y conteos pueden haber cambiado.
        </div>
      )}

      {/* Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 min-w-0">
        <div className="bg-white rounded-xl border shadow-sm p-6 min-w-0">
          <div className="flex justify-between items-start min-w-0 flex-wrap gap-3">
            <div>
              <p className="text-sm font-medium text-gray-500">
                Participación reportada
              </p>
              <h3 className="text-2xl font-bold text-gray-900 mt-1">
                {progressPercentage}%
              </h3>
            </div>
            <div className="p-2 bg-blue-50 text-blue-600 rounded-lg min-w-0">
              <BarChart3 className="w-5 h-5" />
            </div>
          </div>
          <div className="mt-4 w-full bg-gray-100 rounded-full h-2.5 min-w-0">
            <div
              className="bg-blue-600 h-2.5 rounded-full transition-all duration-500 min-w-0"
              style={{ width: `${progressPercentage}%` }}
            />
          </div>
        </div>

        <div className="bg-white rounded-xl border shadow-sm p-6 min-w-0">
          <div className="flex justify-between items-start min-w-0 flex-wrap gap-3">
            <div>
              <p className="text-sm font-medium text-gray-500">
                Reportados por el equipo
              </p>
              <h3 className="text-2xl font-bold text-green-600 mt-1">
                {summary.voted}{" "}
                <span className="text-sm text-gray-400 font-normal">
                  / {summary.total}
                </span>
              </h3>
            </div>
            <div className="p-2 bg-green-50 text-green-600 rounded-lg min-w-0">
              <CheckCircle2 className="w-5 h-5" />
            </div>
          </div>
        </div>

        <div className="bg-white rounded-xl border shadow-sm p-6 min-w-0">
          <div className="flex justify-between items-start min-w-0 flex-wrap gap-3">
            <div>
              <p className="text-sm font-medium text-gray-500">
                Sin reporte de participación
              </p>
              <h3 className="text-2xl font-bold text-amber-600 mt-1">
                {summary.pending}
              </h3>
            </div>
            <div className="p-2 bg-amber-50 text-amber-600 rounded-lg min-w-0">
              <Clock className="w-5 h-5" />
            </div>
          </div>
        </div>

        <div className="bg-white rounded-xl border shadow-sm p-6 min-w-0">
          <div className="flex justify-between items-start min-w-0 flex-wrap gap-3">
            <div>
              <p className="text-sm font-medium text-gray-500">
                Requieren Transporte
              </p>
              <h3 className="text-2xl font-bold text-purple-600 mt-1">
                {summary.needsTransport}
              </h3>
            </div>
            <div className="p-2 bg-purple-50 text-purple-600 rounded-lg min-w-0">
              <Bus className="w-5 h-5" />
            </div>
          </div>
        </div>
      </div>

      {/* Controls */}
      <div className="bg-white p-4 rounded-xl border shadow-sm flex flex-col md:flex-row gap-4 justify-between items-center min-w-0">
        <div className="relative w-full md:w-96 min-w-0">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 w-4 h-4" />
          <input
            type="text"
            placeholder="Buscar por nombre o líder zonal..."
            className="w-full pl-9 pr-4 py-2 bg-gray-50 border-gray-200 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:bg-white transition-all text-sm min-w-0 max-w-full"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>

        <div className="flex items-center gap-2 w-full md:w-auto overflow-x-auto pb-2 md:pb-0 min-w-0 max-w-full">
          <Filter className="w-4 h-4 text-gray-500 mr-2 shrink-0" />
          {(
            ["ALL", "PENDING", "NEEDS_TRANSPORT", "VOTED", "NO_SHOW"] as const
          ).map((f) => (
            <button
              type="button"
              key={f}
              onClick={() => setFilter(f)}
              className={`px-3 py-1.5 rounded-full text-xs font-medium whitespace-nowrap transition-colors ${
                filter === f
                  ? "bg-gray-900 text-white"
                  : "bg-gray-100 text-gray-600 hover:bg-gray-200"
              }`}
            >
              {f === "ALL" && "Todos"}
              {f === "PENDING" && `Pendientes (${summary.pending})`}
              {f === "NEEDS_TRANSPORT" &&
                `Transporte (${summary.needsTransport})`}
              {f === "VOTED" && `Votaron (${summary.voted})`}
              {f === "NO_SHOW" && `No asistió (${summary.noShow})`}
            </button>
          ))}
        </div>
      </div>

      {/* Empty State */}
      {filteredVoters.length === 0 && !loading && (
        <div className="text-center py-12 bg-white rounded-xl border border-dashed min-w-0">
          <Users className="w-12 h-12 text-gray-300 mx-auto mb-3" />
          <h3 className="text-lg font-medium text-gray-900">
            {summary.total === 0
              ? "No hay simpatizantes registrados"
              : "No se encontraron resultados"}
          </h3>
          <p className="text-gray-500 mt-1">
            {summary.total === 0
              ? "Consulta el módulo Personas y verifica el consentimiento vigente y el alcance de tu territorio."
              : "Intenta con otros términos de búsqueda o filtros."}
          </p>
        </div>
      )}

      {/* Grouped by Leader */}
      <div className="space-y-6 min-w-0">
        {groupedByLeader.map((group) => {
          const groupVoted = group.voters.filter(
            (v) => v.votingStatus === "VOTED",
          ).length;
          const groupTotal = group.voters.length;
          const groupProgress =
            groupTotal > 0 ? Math.round((groupVoted / groupTotal) * 100) : 0;

          return (
            <div
              key={group.leaderId}
              className="bg-white rounded-xl border shadow-sm overflow-hidden min-w-0"
            >
              <div className="bg-gray-50 px-6 py-4 border-b flex justify-between items-center min-w-0 flex-wrap gap-3">
                <div className="flex items-center gap-3 min-w-0">
                  <div className="bg-blue-100 text-blue-700 p-2 rounded-lg min-w-0">
                    <Users className="w-5 h-5" />
                  </div>
                  <div>
                    <h3 className="font-semibold text-gray-900">
                      Líder: {group.leaderName}
                    </h3>
                    <p className="text-sm text-gray-500">
                      {groupTotal} personas · {groupVoted} reportes de
                      participación
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-3 min-w-0">
                  <div className="w-24 bg-gray-200 rounded-full h-2 min-w-0">
                    <div
                      className="bg-green-500 h-2 rounded-full transition-all duration-500 min-w-0"
                      style={{ width: `${groupProgress}%` }}
                    />
                  </div>
                  <span className="text-sm font-medium text-gray-600 tabular-nums">
                    {groupProgress}%
                  </span>
                </div>
              </div>

              <div className="divide-y divide-gray-100 min-w-0">
                {group.voters.map((voter) => {
                  const isUpdating = updatingIds.has(voter.id);
                  const statusInfo = STATUS_CONFIG[voter.votingStatus];

                  return (
                    <div
                      key={voter.id}
                      className="flex min-w-0 flex-col items-start justify-between gap-4 p-4 transition-colors hover:bg-gray-50/50 sm:p-5 xl:flex-row xl:items-center"
                    >
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1 flex-wrap min-w-0">
                          <h4 className="font-semibold text-gray-900 truncate">
                            {voter.firstName} {voter.lastName}
                          </h4>
                          <span
                            className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${statusInfo.badgeClass}`}
                          >
                            {statusInfo.label}
                          </span>
                        </div>

                        <div className="flex flex-wrap items-center gap-4 text-sm text-gray-500 mt-1.5 min-w-0">
                          {voter.phoneMasked && (
                            <span className="flex items-center gap-1.5">
                              <Phone className="w-3.5 h-3.5" />
                              {voter.phoneMasked}
                            </span>
                          )}
                          {voter.puesto && (
                            <div className="flex items-center gap-1.5 min-w-0">
                              <MapPin className="w-3.5 h-3.5" />
                              {voter.puesto.name}
                              {voter.mesa != null && (
                                <span className="text-gray-400">
                                  · Mesa {voter.mesa}
                                </span>
                              )}
                            </div>
                          )}
                          {voter.votedAt && (
                            <div className="flex items-center gap-1.5 text-green-600 min-w-0">
                              <CheckCircle2 className="w-3.5 h-3.5" />
                              {new Date(voter.votedAt).toLocaleTimeString(
                                "es-CO",
                                {
                                  hour: "2-digit",
                                  minute: "2-digit",
                                },
                              )}
                            </div>
                          )}
                        </div>
                      </div>

                      <div className="grid w-full min-w-0 gap-2 sm:grid-cols-2 xl:flex xl:w-auto xl:max-w-[65%] xl:flex-wrap xl:justify-end">
                        {isUpdating ? (
                          <div className="flex items-center gap-2 px-4 py-2 text-sm text-gray-400 min-w-0">
                            <Loader2 className="w-4 h-4 animate-spin" />
                            Actualizando…
                          </div>
                        ) : (
                          <>
                            {voter.votingStatus !== "VOTED" && (
                              <button
                                type="button"
                                disabled={loading}
                                onClick={() =>
                                  handleStatusChange(voter.id, "VOTED")
                                }
                                className="flex-1 sm:flex-none px-4 py-2 bg-green-600 hover:bg-green-700 text-white text-sm font-medium rounded-lg transition-colors flex items-center justify-center gap-2 max-w-full whitespace-normal"
                              >
                                <CheckCircle2 className="w-4 h-4" />
                                Reportar participación
                              </button>
                            )}
                            {voter.votingStatus === "PENDING" && (
                              <button
                                type="button"
                                disabled={loading}
                                onClick={() =>
                                  handleStatusChange(
                                    voter.id,
                                    "NEEDS_TRANSPORT",
                                  )
                                }
                                className="flex-1 sm:flex-none px-4 py-2 bg-white border border-gray-200 hover:bg-gray-50 text-gray-700 text-sm font-medium rounded-lg transition-colors flex items-center justify-center gap-2 shadow-sm max-w-full whitespace-normal"
                              >
                                <Bus className="w-4 h-4" />
                                <span>Transporte</span>
                              </button>
                            )}
                            {voter.votingStatus !== "NO_SHOW" && (
                              <button
                                type="button"
                                disabled={loading}
                                onClick={() =>
                                  handleStatusChange(voter.id, "NO_SHOW")
                                }
                                className="px-3 py-2 rounded-lg border border-red-200 text-sm font-medium text-red-700 max-w-full whitespace-normal"
                              >
                                No asistió
                              </button>
                            )}
                            {voter.votingStatus !== "PENDING" && (
                              <button
                                type="button"
                                disabled={loading}
                                onClick={() =>
                                  handleStatusChange(voter.id, "PENDING")
                                }
                                className="px-3 py-2 bg-white border border-gray-200 hover:bg-gray-50 text-gray-500 text-sm font-medium rounded-lg transition-colors flex items-center justify-center gap-1.5 shadow-sm max-w-full whitespace-normal"
                              >
                                <XCircle className="w-3.5 h-3.5" />
                                Volver a pendiente
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
