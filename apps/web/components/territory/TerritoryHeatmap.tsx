"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  AlertCircle,
  ArrowLeft,
  ChevronRight,
  Clock3,
  HardDriveDownload,
  Layers3,
  Loader2,
  LockKeyhole,
  MapPinned,
  RefreshCw,
  ShieldCheck,
  TableProperties,
  WifiOff,
} from "lucide-react";
import { useOfflineVault } from "@/context/offline-vault";
import { ApiError, apiRequest } from "@/lib/api-client";
import { OFFLINE_VAULT_OPEN_EVENT } from "@/lib/offline-vault";
import {
  buildTerritoryHeatmapPath,
  projectTerritoryHeatmapItems,
  resolveTerritoryHeatmapView,
  type HeatmapLevel,
  type HeatmapMetric,
  type TerritoryHeatmapItem,
  type TerritoryHeatmapQuery,
  type TerritoryHeatmapResponse,
  type TerritoryHeatmapView,
} from "@/lib/territory-heatmap";

interface HeatmapHistoryEntry {
  level: HeatmapLevel;
  parentId: string | null;
}

type HeatmapDisplayMode = "GEOGRAPHIC" | "MATRIX";

const METRICS: ReadonlyArray<{
  value: HeatmapMetric;
  label: string;
  description: string;
}> = [
  {
    value: "E14_COVERAGE",
    label: "Cobertura E-14",
    description:
      "Mesas aceptadas frente a las mesas configuradas para la operación.",
  },
  {
    value: "VOTER_ACTIVITY",
    label: "Actividad autorizada",
    description: "Volumen relativo de registros con consentimiento.",
  },
  {
    value: "OPEN_CASES",
    label: "Casos abiertos",
    description: "Concentración relativa de asuntos territoriales pendientes.",
  },
  {
    value: "TEAM_COVERAGE",
    label: "Equipo asignado",
    description: "Cobertura relativa del equipo activo por territorio.",
  },
];

const LEVEL_LABELS: Readonly<Record<HeatmapLevel, string>> = {
  DEPARTAMENTO: "departamentos",
  MUNICIPIO: "municipios",
  ZONA: "zonas",
  PUESTO: "puestos",
};

function tileClass(bucket: number): string {
  if (bucket >= 5) return "border-blue-950 bg-blue-950 text-white";
  if (bucket === 4) return "border-blue-800 bg-blue-800 text-white";
  if (bucket === 3) return "border-blue-600 bg-blue-600 text-white";
  if (bucket === 2) return "border-blue-300 bg-blue-200 text-blue-950";
  if (bucket === 1) return "border-blue-100 bg-blue-50 text-blue-950";
  return "border-slate-200 bg-slate-50 text-slate-700";
}

function messageFrom(error: unknown): string {
  if (error instanceof ApiError) return error.message;
  if (error instanceof Error) return error.message;
  return "No fue posible construir el mapa de calor territorial.";
}

function formatTimestamp(timestamp: string): string {
  return new Intl.DateTimeFormat("es-CO", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "America/Bogota",
  }).format(new Date(timestamp));
}

export function TerritoryHeatmap() {
  const {
    phase: vaultPhase,
    readHeatmapSnapshot,
    saveHeatmapSnapshot,
  } = useOfflineVault();
  const [level, setLevel] = useState<HeatmapLevel>("DEPARTAMENTO");
  const [metric, setMetric] = useState<HeatmapMetric>("E14_COVERAGE");
  const [parentId, setParentId] = useState<string | null>(null);
  const [history, setHistory] = useState<HeatmapHistoryEntry[]>([]);
  const [result, setResult] = useState<TerritoryHeatmapResponse | null>(null);
  const [viewSource, setViewSource] = useState<
    TerritoryHeatmapView["source"] | null
  >(null);
  const [offlineSavedAt, setOfflineSavedAt] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveMessage, setSaveMessage] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [displayMode, setDisplayMode] =
    useState<HeatmapDisplayMode>("GEOGRAPHIC");
  const requestSequence = useRef(0);
  const abortController = useRef<AbortController | null>(null);

  const query = useMemo<TerritoryHeatmapQuery>(
    () => ({ level, metric, parentId }),
    [level, metric, parentId],
  );

  const load = useCallback(async () => {
    const sequence = ++requestSequence.current;
    abortController.current?.abort();
    const requestAbortController = new AbortController();
    abortController.current = requestAbortController;
    setLoading(true);
    setError(null);
    setResult(null);
    setViewSource(null);
    setOfflineSavedAt(null);
    setSaveMessage(null);
    setSaveError(null);

    try {
      const view = await resolveTerritoryHeatmapView(query, {
        loadOnline: (validatedQuery) =>
          apiRequest<unknown>(buildTerritoryHeatmapPath(validatedQuery), {
            signal: requestAbortController.signal,
          }),
        readOffline:
          vaultPhase === "UNLOCKED" ? readHeatmapSnapshot : undefined,
      });
      if (sequence !== requestSequence.current) return;
      setResult(view.response);
      setViewSource(view.source);
      setOfflineSavedAt(view.savedAt);
    } catch (requestError) {
      if (
        sequence !== requestSequence.current ||
        (requestError instanceof DOMException &&
          requestError.name === "AbortError")
      ) {
        return;
      }
      setError(messageFrom(requestError));
    } finally {
      if (sequence === requestSequence.current) {
        setLoading(false);
        if (abortController.current === requestAbortController) {
          abortController.current = null;
        }
      }
    }
  }, [query, readHeatmapSnapshot, vaultPhase]);

  useEffect(() => {
    void load();
    return () => {
      requestSequence.current += 1;
      abortController.current?.abort();
      abortController.current = null;
    };
  }, [load]);

  function drillDown(item: TerritoryHeatmapItem) {
    if (!item.hasChildren || !item.nextLevel) return;
    setHistory((current) => [...current, { level, parentId }]);
    setLevel(item.nextLevel);
    setParentId(item.id);
  }

  function goBack() {
    const previous = history.at(-1);
    if (!previous) return;
    setHistory((current) => current.slice(0, -1));
    setLevel(previous.level);
    setParentId(previous.parentId);
  }

  async function saveCurrentView() {
    setSaveMessage(null);
    setSaveError(null);
    if (vaultPhase !== "UNLOCKED") {
      setSaveMessage(
        "Desbloquea o crea la bóveda cifrada para guardar esta vista.",
      );
      window.dispatchEvent(new Event(OFFLINE_VAULT_OPEN_EVENT));
      return;
    }
    if (!result || viewSource !== "ONLINE") return;

    setSaving(true);
    try {
      const snapshot = await saveHeatmapSnapshot(query, result);
      setSaveMessage(
        `Vista cifrada guardada en este dispositivo: ${formatTimestamp(snapshot.savedAt)}.`,
      );
    } catch (saveFailure) {
      setSaveError(messageFrom(saveFailure));
    } finally {
      setSaving(false);
    }
  }

  const activeMetric = METRICS.find((option) => option.value === metric);
  const canSave = Boolean(result && viewSource === "ONLINE" && !loading);
  const projection = useMemo(
    () => (result ? projectTerritoryHeatmapItems(result.items) : null),
    [result],
  );

  return (
    <section
      aria-labelledby="territory-heatmap-title"
      className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm"
    >
      <div className="border-b border-slate-200 bg-slate-950 p-6 text-white">
        <div className="flex flex-col gap-5 xl:flex-row xl:items-end xl:justify-between">
          <div className="max-w-3xl">
            <div className="inline-flex items-center gap-2 text-xs font-black uppercase tracking-[0.18em] text-blue-300">
              <Layers3 size={16} aria-hidden="true" /> Inteligencia territorial
              agregada
            </div>
            <h2
              id="territory-heatmap-title"
              className="mt-3 text-2xl font-black"
            >
              Mapa de calor operativo
            </h2>
            <p className="mt-2 text-sm leading-6 text-slate-300">
              Compara intensidad y baja desde departamento hasta puesto en una
              vista espacial o matricial. No ubica personas ni mide afinidad
              política.
            </p>
          </div>
          <label className="w-full max-w-sm text-xs font-black uppercase tracking-wider text-slate-300">
            Indicador
            <select
              value={metric}
              onChange={(event) => {
                setMetric(event.target.value as HeatmapMetric);
                setLevel("DEPARTAMENTO");
                setParentId(null);
                setHistory([]);
              }}
              className="mt-2 min-h-12 w-full rounded-xl border border-slate-700 bg-slate-900 px-4 text-sm font-bold normal-case tracking-normal text-white"
            >
              {METRICS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
        </div>
      </div>

      <div className="space-y-5 p-5 sm:p-6">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <div className="flex flex-wrap items-center gap-2 text-xs font-bold text-slate-500">
              <span>Colombia</span>
              {result?.breadcrumbs.map((breadcrumb) => (
                <span key={breadcrumb.id} className="inline-flex items-center">
                  <ChevronRight size={13} aria-hidden="true" />
                  {breadcrumb.name}
                </span>
              ))}
            </div>
            <p className="mt-2 text-sm text-slate-600">
              {activeMetric?.description}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            {history.length > 0 && (
              <button
                type="button"
                onClick={goBack}
                className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-4 text-xs font-black uppercase tracking-wider text-slate-700 hover:bg-slate-50"
              >
                <ArrowLeft size={16} aria-hidden="true" /> Subir un nivel
              </button>
            )}
            <button
              type="button"
              onClick={() => void load()}
              disabled={loading}
              className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-4 text-xs font-black uppercase tracking-wider text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <RefreshCw
                size={16}
                aria-hidden="true"
                className={loading ? "animate-spin" : undefined}
              />
              Actualizar vista
            </button>
            <button
              type="button"
              onClick={() => void saveCurrentView()}
              disabled={saving || (!canSave && vaultPhase === "UNLOCKED")}
              aria-describedby="territory-offline-storage-warning"
              className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-emerald-700 px-4 text-xs font-black uppercase tracking-wider text-white hover:bg-emerald-800 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {saving ? (
                <Loader2
                  size={16}
                  aria-hidden="true"
                  className="animate-spin"
                />
              ) : vaultPhase === "UNLOCKED" ? (
                <HardDriveDownload size={16} aria-hidden="true" />
              ) : (
                <LockKeyhole size={16} aria-hidden="true" />
              )}
              Guardar esta vista offline
            </button>
          </div>
        </div>

        <div
          id="territory-offline-storage-warning"
          className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-xs leading-5 text-amber-950"
        >
          <p className="font-black">Almacenamiento local opcional</p>
          <p className="mt-1">
            Al guardar, este dispositivo conserva cifrados los nombres, códigos
            e identificadores de territorios y los agregados de esta vista
            exacta. No guarda personas. La copia no se actualiza sola y puede
            quedar desactualizada; bloquéala al terminar.
          </p>
        </div>

        <div aria-live="polite" className="space-y-2">
          {saveMessage && (
            <p className="rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-xs font-semibold text-emerald-900">
              {saveMessage}
            </p>
          )}
          {saveError && (
            <p
              role="alert"
              className="rounded-xl border border-red-200 bg-red-50 p-3 text-xs font-semibold text-red-800"
            >
              {saveError}
            </p>
          )}
        </div>

        {viewSource === "OFFLINE" && result && offlineSavedAt && (
          <div
            role="status"
            className="rounded-2xl border-2 border-amber-400 bg-amber-50 p-4 text-amber-950"
          >
            <p className="flex items-center gap-2 text-sm font-black uppercase tracking-[0.14em]">
              <WifiOff size={18} aria-hidden="true" /> Modo offline
            </p>
            <p className="mt-2 text-xs font-semibold leading-5">
              Copia cifrada guardada el{" "}
              <time dateTime={offlineSavedAt}>
                {formatTimestamp(offlineSavedAt)}
              </time>
              . Puede estar desactualizada y no se actualizará hasta recuperar
              conexión y volver a guardarla.
            </p>
          </div>
        )}

        {result && (
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <p className="flex items-center gap-2 text-xs font-semibold text-slate-600">
              <Clock3 size={15} aria-hidden="true" />
              Corte del servidor:{" "}
              <time dateTime={result.generatedAt}>
                {formatTimestamp(result.generatedAt)}
              </time>
            </p>
            <div
              role="group"
              aria-label="Presentación del mapa de calor"
              className="inline-flex w-fit rounded-xl border border-slate-200 bg-slate-50 p-1"
            >
              <button
                type="button"
                aria-pressed={displayMode === "GEOGRAPHIC"}
                onClick={() => setDisplayMode("GEOGRAPHIC")}
                className={`inline-flex min-h-10 items-center gap-2 rounded-lg px-3 text-xs font-black uppercase tracking-wide ${displayMode === "GEOGRAPHIC" ? "bg-white text-blue-800 shadow-sm" : "text-slate-500 hover:text-slate-900"}`}
              >
                <MapPinned size={15} aria-hidden="true" /> Geográfica
              </button>
              <button
                type="button"
                aria-pressed={displayMode === "MATRIX"}
                onClick={() => setDisplayMode("MATRIX")}
                className={`inline-flex min-h-10 items-center gap-2 rounded-lg px-3 text-xs font-black uppercase tracking-wide ${displayMode === "MATRIX" ? "bg-white text-blue-800 shadow-sm" : "text-slate-500 hover:text-slate-900"}`}
              >
                <TableProperties size={15} aria-hidden="true" /> Matriz
              </button>
            </div>
          </div>
        )}

        {error && (
          <div
            role="alert"
            className="flex flex-col gap-3 rounded-2xl border border-red-200 bg-red-50 p-4 text-sm font-semibold text-red-700 sm:flex-row sm:items-center sm:justify-between"
          >
            <span className="flex items-start gap-2">
              <AlertCircle className="mt-0.5 shrink-0" size={18} /> {error}
            </span>
            <button
              type="button"
              onClick={() => void load()}
              className="min-h-10 rounded-xl bg-red-700 px-4 text-xs font-black uppercase tracking-wider text-white"
            >
              Reintentar
            </button>
          </div>
        )}

        {loading ? (
          <div
            role="status"
            className="flex min-h-64 items-center justify-center gap-3 rounded-2xl border border-slate-200 bg-slate-50 text-sm font-bold text-slate-500"
          >
            <Loader2 className="animate-spin text-blue-700" size={24} />
            Calculando agregados autorizados…
          </div>
        ) : result?.items.length ? (
          <>
            {displayMode === "GEOGRAPHIC" ? (
              <div className="overflow-hidden rounded-2xl border border-slate-200 bg-slate-50">
                <div className="flex flex-col gap-2 border-b border-slate-200 bg-white p-4 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <p className="text-sm font-black text-slate-900">
                      Distribución espacial relativa
                    </p>
                    <p className="mt-1 text-xs leading-5 text-slate-500">
                      {projection?.scope === "COLOMBIA"
                        ? "Escala fija aproximada de Colombia; los puntos externos se informan aparte."
                        : "Escala ajustada al territorio visible; no representa límites administrativos."}
                    </p>
                  </div>
                  <p className="text-xs font-bold text-slate-600">
                    {projection?.points.length.toLocaleString("es-CO")} con
                    coordenadas ·{" "}
                    {projection?.missingCoordinates.toLocaleString("es-CO")} sin
                    coordenadas
                  </p>
                </div>

                {projection?.points.length ? (
                  <div
                    className="relative aspect-[4/3] min-h-80 overflow-hidden bg-slate-100 sm:aspect-[16/9]"
                    aria-label="Mapa de calor espacial de territorios con coordenadas disponibles"
                  >
                    <div
                      aria-hidden="true"
                      className="absolute inset-0 grid grid-cols-6 grid-rows-4 opacity-60"
                    >
                      {Array.from({ length: 24 }, (_, index) => (
                        <span
                          key={index}
                          className="border-b border-r border-slate-200"
                        />
                      ))}
                    </div>
                    {projection.points.map(({ item, x, y }) => {
                      const canDrill = Boolean(
                        item.hasChildren && item.nextLevel,
                      );
                      const hasLowPresenceAlert = metric === "VOTER_ACTIVITY" && item.bucket <= 1;
                      const label = `${hasLowPresenceAlert ? "⚠️ ALERTA BAJA PRESENCIA - " : ""}${item.name}: ${item.displayValue}; ${item.geo.locatedPollingPlaces.toLocaleString("es-CO")} de ${item.geo.totalPollingPlaces.toLocaleString("es-CO")} registros de puesto o jornada con coordenadas${canDrill ? "; abrir siguiente nivel" : ""}`;
                      const pointClass = `absolute flex h-9 w-9 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border-2 text-[10px] font-black shadow-md ${tileClass(item.bucket)}`;
                      const style = {
                        left: `${x}%`,
                        top: `${y}%`,
                        zIndex: Math.max(1, item.bucket),
                      };
                      return canDrill ? (
                        <button
                          key={item.id}
                          type="button"
                          title={label}
                          aria-label={label}
                          onClick={() => drillDown(item)}
                          style={style}
                          className={`${pointClass} transition hover:scale-125 hover:shadow-xl focus-visible:z-50 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-blue-300`}
                        >
                          {item.bucket}
                        </button>
                      ) : (
                        <span
                          key={item.id}
                          role="img"
                          title={label}
                          aria-label={label}
                          style={style}
                          className={pointClass}
                        >
                          {item.bucket}
                        </span>
                      );
                    })}
                  </div>
                ) : (
                  <div className="flex min-h-64 flex-col items-center justify-center p-8 text-center">
                    <MapPinned
                      className="text-slate-300"
                      size={40}
                      aria-hidden="true"
                    />
                    <p className="mt-3 font-black text-slate-900">
                      No hay coordenadas verificadas para esta vista
                    </p>
                    <p className="mt-1 max-w-xl text-sm text-slate-500">
                      La matriz sigue disponible. El sistema no completa ni
                      aproxima puestos sin coordenadas de la fuente activada.
                    </p>
                  </div>
                )}

                {Boolean(projection?.excludedOutsideScope) && (
                  <p className="border-t border-amber-200 bg-amber-50 p-3 text-xs font-semibold text-amber-950">
                    {projection?.excludedOutsideScope.toLocaleString("es-CO")}{" "}
                    territorio(s) exterior(es) quedaron fuera de la escala
                    Colombia. Ingresa a Exterior para verlos en escala relativa.
                  </p>
                )}
              </div>
            ) : (
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4">
                {result.items.map((item) => {
                  const canDrill = Boolean(item.hasChildren && item.nextLevel);
                  const contents = (
                    <>
                      <div className="flex items-start justify-between gap-3">
                        <span className="text-[10px] font-black uppercase tracking-[0.16em] opacity-70">
                          {item.type} · {item.code}
                        </span>
                        {canDrill && (
                          <ChevronRight size={17} aria-hidden="true" />
                        )}
                      </div>
                      <p className="mt-5 text-lg font-black leading-tight">
                        {item.name}
                      </p>
                      <p className="mt-3 text-2xl font-black flex items-center gap-2">
                        {item.displayValue}
                        {metric === "VOTER_ACTIVITY" && item.bucket <= 1 && (
                          <span className="inline-flex items-center gap-1 rounded-full bg-red-100 px-2 py-0.5 text-[10px] font-bold tracking-widest text-red-700 ring-1 ring-inset ring-red-600/20">
                            <AlertCircle size={10} />
                            ALERTA: BAJA PRESENCIA
                          </span>
                        )}
                      </p>
                      {metric === "E14_COVERAGE" && (
                        <p className="mt-1 text-xs font-semibold opacity-75">
                          {item.operationalContext.acceptedTables.toLocaleString(
                            "es-CO",
                          )}{" "}
                          de{" "}
                          {item.operationalContext.expectedTables.toLocaleString(
                            "es-CO",
                          )}{" "}
                          mesas configuradas
                        </p>
                      )}
                      {(item.leaders ?? []).length > 0 && (
                        <div className="mt-4 pt-4 border-t border-black/10">
                          <p className="text-[10px] font-black uppercase tracking-[0.16em] opacity-70 mb-2">Líderes de Zona</p>
                          <ul className="space-y-2">
                            {item.leaders?.map((leader) => (
                              <li key={leader.id} className="text-xs">
                                <span className="font-bold">{leader.name}</span>
                                <br />
                                <span className="opacity-80">{leader.roleDescription}</span>
                                {leader.phone && (
                                  <>
                                    <br />
                                    <span className="opacity-80">📞 {leader.phone}</span>
                                  </>
                                )}
                                {leader.socialNetworkUrl && (
                                  <>
                                    <br />
                                    <span className="opacity-80 break-all text-blue-600">
                                      <a href={leader.socialNetworkUrl} target="_blank" rel="noreferrer">
                                        🔗 {leader.socialNetworkUrl}
                                      </a>
                                    </span>
                                  </>
                                )}
                              </li>
                            ))}
                          </ul>
                        </div>
                      )}
                    </>
                  );
                  const itemClass = `min-h-36 rounded-2xl border p-5 text-left transition ${tileClass(item.bucket)}`;
                  return canDrill ? (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => drillDown(item)}
                      aria-label={`${item.name}: ${item.displayValue}; abrir siguiente nivel`}
                      className={`${itemClass} cursor-pointer hover:-translate-y-0.5 hover:shadow-lg`}
                    >
                      {contents}
                    </button>
                  ) : (
                    <article key={item.id} className={itemClass}>
                      {contents}
                    </article>
                  );
                })}
              </div>
            )}

            <div className="flex flex-col gap-3 rounded-2xl border border-slate-200 bg-slate-50 p-4 text-xs text-slate-600 lg:flex-row lg:items-center lg:justify-between">
              <div className="flex items-center gap-2 font-semibold">
                <ShieldCheck className="shrink-0 text-emerald-700" size={18} />
                {result.privacy.rule}
              </div>
              <div
                className="flex items-center gap-1"
                aria-label="Escala de intensidad de menor a mayor"
              >
                <span className="mr-2 font-bold">Menor</span>
                {[0, 1, 2, 3, 4, 5].map((bucket) => (
                  <span
                    key={bucket}
                    className={`h-5 w-7 rounded border ${tileClass(bucket)}`}
                    aria-hidden="true"
                  />
                ))}
                <span className="ml-2 font-bold">Mayor</span>
              </div>
            </div>
          </>
        ) : !error ? (
          <div className="flex min-h-56 flex-col items-center justify-center rounded-2xl border border-dashed border-slate-300 bg-slate-50 p-8 text-center">
            <Layers3 className="text-slate-300" size={40} aria-hidden="true" />
            <p className="mt-3 font-black text-slate-900">
              No hay {LEVEL_LABELS[level]} para este alcance
            </p>
            <p className="mt-1 max-w-lg text-sm text-slate-500">
              Sincroniza el catálogo electoral vigente o revisa la asignación
              territorial del usuario. No se muestran datos simulados.
            </p>
          </div>
        ) : null}
      </div>
    </section>
  );
}
