"use client";

import { useCallback, useLayoutEffect, useRef, useState, type FormEvent } from "react";
import { useAuth } from "@/context/auth";
import { AlertCircle, ArrowLeft, ArrowRight, CheckCircle2, ChevronDown, ChevronRight, Download, Info, Loader2, MapPinned, RefreshCw, Search, ShieldCheck, WifiOff } from "lucide-react";
import { useOfflineVault } from "@/context/offline-vault";
import { useKeyedState } from "@/hooks/use-keyed-state";
import { usePageRequest } from "@/lib/use-page-request";
import { apiRequest } from "@/lib/api-client";
import { OFFLINE_VAULT_OPEN_EVENT } from "@/lib/offline-vault";
import { buildTerritoryHeatmapPath, validateTerritoryHeatmapResponse, type HeatmapLevel, type HeatmapMetric, type TerritoryHeatmapItem } from "@/lib/territory-heatmap";
import { buildTerritoryOverviewPath, heatmapQuery, resolveTerritoryOverview, type TerritoryOverviewQuery, type TerritoryOverviewView } from "@/lib/territory-overview";
import { TerritoryPageMap } from "./TerritoryPageMap";

const LEVEL_LABELS: Record<HeatmapLevel, string> = { DEPARTAMENTO: "departamentos", MUNICIPIO: "municipios", ZONA: "zonas", PUESTO: "puestos" };
const METRICS: Array<{ value: HeatmapMetric; label: string; column: string; description: string; source: string }> = [
  { value: "OPEN_CASES", label: "Casos por resolver", column: "Casos abiertos", description: "Consulta dónde hay asuntos abiertos y entra al lugar que necesitas revisar.", source: "Se completa con los casos abiertos que tienen un territorio asignado. Los casos sin territorio no aparecen aquí." },
  { value: "TEAM_COVERAGE", label: "Equipo en territorio", column: "Integrantes activos", description: "Revisa cuántos integrantes activos tiene asignados cada lugar.", source: "Se completa con las cuentas activas del equipo que tienen territorio asignado." },
  { value: "VOTER_ACTIVITY", label: "Personas con autorización", column: "Personas autorizadas", description: "Consulta los registros con autorización vigente y ubicación electoral vinculada.", source: "Se completa con Personas. Sólo incluye autorización vigente y un puesto vinculado; no es el total de personas del directorio." },
  { value: "E14_COVERAGE", label: "Revisión de actas E-14", column: "Mesas con acta aceptada", description: "Compara las actas aceptadas con las mesas configuradas para cada lugar.", source: "Se completa con actas aceptadas y mesas configuradas. Sin mesas configuradas no se calcula un porcentaje." },
];
const INITIAL_QUERY: TerritoryOverviewQuery = { level: "DEPARTAMENTO", metric: "OPEN_CASES", parentId: null, search: "", activity: "ACTIVE", page: 1, limit: 20 };
interface HistoryEntry { level: HeatmapLevel; parentId: string | null; label: string }
const dateLabel = (value: string) => new Intl.DateTimeFormat("es-CO", { dateStyle: "medium", timeStyle: "short", timeZone: "America/Bogota" }).format(new Date(value));
const message = (error: unknown) => error instanceof Error ? error.message : "No se pudo cargar la información. Intenta de nuevo.";

export function TerritoryHeatmap({ reloadKey = 0 }: { reloadKey?: number } = {}) {
  const { user, tenant } = useAuth();
  const identityKey = `${tenant?.id}:${user?.id}:${user?.role}`;
  const { phase: vaultPhase, readHeatmapSnapshot, saveHeatmapSnapshot } = useOfflineVault();
  const [query, setQuery] = useState<TerritoryOverviewQuery>(INITIAL_QUERY);
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const queryKey = `${identityKey}:${query.metric}:${query.level}:${query.parentId}:${query.page}:${query.search}:${query.activity}:${vaultPhase}`;
  const scopeKey = `${identityKey}:${query.metric}:${query.level}:${query.parentId}`;
  const [draftSearch, setDraftSearch] = useKeyedState(scopeKey, "");
  const [selectedId, setSelectedId] = useKeyedState<string | null>(queryKey, null);
  const [mapOpen, setMapOpen] = useKeyedState(queryKey, false);
  const [saveMessage, setSaveMessage] = useKeyedState<string | null>(scopeKey, null);
  const [saveError, setSaveError] = useKeyedState<string | null>(scopeKey, null);
  const [saving, setSaving] = useState(false);
  const savingLock = useRef(false);
  const resultsHeading = useRef<HTMLHeadingElement>(null);
  const pendingScroll = useRef(false);
  const request = useCallback((signal: AbortSignal) => resolveTerritoryOverview(query, {
    loadOnline: validated => apiRequest<unknown>(buildTerritoryOverviewPath(validated), { signal }),
    readOffline: vaultPhase === "UNLOCKED" ? readHeatmapSnapshot : undefined,
  }), [query, vaultPhase, readHeatmapSnapshot]);
  const { data: view, loading, error, refresh } = usePageRequest<TerritoryOverviewView>(request, { enabled: Boolean(user && tenant), reloadKey: `${identityKey}:${reloadKey}` });
  const result = view?.response;
  const activeMetric = METRICS.find(metric => metric.value === query.metric)!;
  const activeCount = result ? result.summary.reportedTerritories + result.summary.protectedTerritories + (query.metric === "E14_COVERAGE" ? result.summary.zeroTerritories : 0) : 0;
  const pageRange = !result?.items.length ? "" : `${(query.page - 1) * query.limit + 1}–${(query.page - 1) * query.limit + result.items.length} de ${result.pageInfo.totalItems}`;
  useLayoutEffect(() => {
    if (!pendingScroll.current || loading || !result) return;
    pendingScroll.current = false;
    resultsHeading.current?.focus({ preventScroll: true });
    resultsHeading.current?.scrollIntoView({ block: "start" });
  }, [loading, result]);

  function changeMetric(metric: HeatmapMetric) {
    setQuery(current => ({ ...current, metric, search: "", page: 1, activity: metric === "TEAM_COVERAGE" ? "ALL" : "ACTIVE" }));
  }
  function selectTerritory(item: TerritoryHeatmapItem) {
    if (item.hasChildren && item.nextLevel) {
      pendingScroll.current = true;
      setHistory(current => [...current, { level: query.level, parentId: query.parentId, label: result?.parent?.name ?? "Colombia" }]);
      setQuery(current => ({ ...current, level: item.nextLevel!, parentId: item.id, search: "", page: 1 }));
    } else setSelectedId(item.id);
  }
  function backTo(index: number) {
    const previous = history[index];
    if (!previous) return;
    pendingScroll.current = true;
    setHistory(current => current.slice(0, index));
    setQuery(current => ({ ...current, level: previous.level, parentId: previous.parentId, search: "", page: 1 }));
  }
  function search(event: FormEvent) {
    event.preventDefault();
    setQuery(current => ({ ...current, search: draftSearch.trim(), page: 1 }));
  }
  function changePage(page: number) {
    pendingScroll.current = true;
    setQuery(current => ({ ...current, page }));
  }
  async function saveOffline() {
    if (savingLock.current) return;
    setSaveMessage(null);
    setSaveError(null);
    if (vaultPhase !== "UNLOCKED") { window.dispatchEvent(new Event(OFFLINE_VAULT_OPEN_EVENT)); return; }
    if (!result || result.summary.totalTerritories > 500) { setSaveError("Abre un territorio más pequeño para guardar hasta 500 lugares por copia."); return; }
    savingLock.current = true;
    setSaving(true);
    try {
      const exactQuery = heatmapQuery(query);
      // Save the whole bounded level, never a page disguised as a full snapshot.
      const full = validateTerritoryHeatmapResponse(await apiRequest<unknown>(buildTerritoryHeatmapPath(exactQuery)), exactQuery);
      const saved = await saveHeatmapSnapshot(exactQuery, full);
      setSaveMessage(`${full.items.length} ${full.items.length === 1 ? "lugar guardado" : "lugares guardados"} en este dispositivo. Copia del ${dateLabel(saved.savedAt)}.`);
    } catch (failure) { setSaveError(message(failure)); }
    finally { savingLock.current = false; setSaving(false); }
  }

  return <section aria-labelledby="territory-heatmap-title" className="min-w-0 space-y-4">
    <header className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
      <div className="min-w-0 flex-1">
        <h1 id="territory-heatmap-title" className="text-2xl font-bold tracking-tight text-slate-950">Territorio y actividad</h1>
        <p className="mt-1 text-sm leading-6 text-slate-600">Datos automáticos de tu equipo.</p>
      </div>
      <div className="w-full min-w-0 md:w-80 md:shrink-0">
        <div className="flex items-end gap-2"><label className="block min-w-0 flex-1 text-sm font-semibold text-slate-900">¿Qué quieres consultar?
          <select value={query.metric} onChange={event => changeMetric(event.target.value as HeatmapMetric)} className="mt-2 min-h-11 w-full rounded-xl border border-slate-300 bg-white px-3 text-sm font-normal focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600">{METRICS.map(metric => <option key={metric.value} value={metric.value}>{metric.label}</option>)}</select>
        </label><button type="button" aria-label="Actualizar" title="Actualizar" onClick={() => void refresh()} disabled={loading} className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-700 disabled:opacity-50"><RefreshCw size={17} className={loading ? "animate-spin" : ""} aria-hidden="true" /></button></div>
        <details className="mt-2"><summary className="w-fit cursor-pointer text-xs font-semibold text-blue-700">¿De dónde sale esta información?</summary><p className="mt-2 text-xs leading-5 text-slate-600">{activeMetric.source}</p></details>
      </div>
    </header>
    {view?.source === "OFFLINE" && view.savedAt && <div role="status" className="flex gap-3 rounded-xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-950"><WifiOff size={20} className="shrink-0" /><p><strong>Sin conexión: estás viendo una copia guardada.</strong><br />Copia del {dateLabel(view.savedAt)}. Los cambios posteriores no aparecen aquí.</p></div>}

    <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
      <div className="border-b border-slate-200 p-4">
        <nav aria-label="Ruta del territorio" className="flex flex-wrap items-center gap-1 text-sm">
          {history.map((entry, index) => <span key={`${entry.level}:${entry.parentId}`} className="inline-flex max-w-full items-center gap-1"><button type="button" onClick={() => backTo(index)} className="min-h-11 break-words rounded-lg px-2 text-left text-blue-700 hover:bg-blue-50">{entry.label}</button><ChevronRight size={14} className="shrink-0 text-slate-400" /></span>)}
          <span className="min-w-0 break-words font-semibold text-slate-950">{result?.parent?.name ?? (query.parentId ? "Cargando territorio…" : "Colombia")}</span>
        </nav>
        <div className="mt-3 flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
          <div><h2 ref={resultsHeading} tabIndex={-1} className="scroll-mt-24 text-lg font-bold text-slate-950 focus:outline-none">{activeMetric.label}</h2>{result && <p className="mt-1 text-xs leading-5 text-slate-500">{result.summary.totalTerritories.toLocaleString("es-CO")} {LEVEL_LABELS[query.level]} disponibles · actualizado {dateLabel(result.generatedAt)}</p>}</div>
          {history.length > 0 && <button type="button" onClick={() => backTo(history.length - 1)} className="inline-flex min-h-11 w-fit items-center gap-2 rounded-lg border px-3 text-sm text-slate-700"><ArrowLeft size={16} />Volver</button>}
        </div>
        <form onSubmit={search} className="mt-4 flex min-w-0 gap-2">
          <label className="min-w-0 flex-1"><span className="sr-only">Buscar lugar por nombre o código</span><input type="search" value={draftSearch} onChange={event => setDraftSearch(event.target.value)} maxLength={80} placeholder={query.level === "DEPARTAMENTO" ? "Buscar un departamento, por ejemplo Antioquia" : "Buscar un lugar, por ejemplo Medellín o 05001"} className="min-h-11 w-full rounded-xl border border-slate-300 px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600" /></label>
          <button type="submit" aria-label="Buscar" className="inline-flex min-h-11 min-w-11 shrink-0 items-center justify-center gap-2 rounded-xl bg-blue-700 text-sm font-semibold text-white hover:bg-blue-800 sm:px-5"><Search size={16} /><span className="hidden sm:inline">Buscar</span></button>
        </form>
        {query.search && <button type="button" onClick={() => { setDraftSearch(""); setQuery(current => ({ ...current, search: "", page: 1 })); }} className="mt-2 min-h-11 rounded-xl border px-4 text-sm text-slate-600">Quitar búsqueda</button>}
        <div role="group" aria-label="Lugares que se muestran" className="mt-3 flex flex-wrap gap-2">
          <button type="button" aria-pressed={query.activity === "ACTIVE"} onClick={() => setQuery(current => ({ ...current, activity: "ACTIVE", page: 1 }))} className={`min-h-11 rounded-full border px-4 text-xs font-semibold ${query.activity === "ACTIVE" ? "border-blue-300 bg-blue-50 text-blue-900" : "border-slate-200 text-slate-600"}`}>{query.metric === "E14_COVERAGE" ? "Con mesas configuradas" : "Con registros"}{result ? ` (${activeCount})` : ""}</button>
          <button type="button" aria-pressed={query.activity === "ALL"} onClick={() => setQuery(current => ({ ...current, activity: "ALL", page: 1 }))} className={`min-h-11 rounded-full border px-4 text-xs font-semibold ${query.activity === "ALL" ? "border-blue-300 bg-blue-50 text-blue-900" : "border-slate-200 text-slate-600"}`}><span className="sm:hidden">Todos</span><span className="hidden sm:inline">Todos los lugares</span>{result ? ` (${result.summary.totalTerritories})` : ""}</button>
        </div>
      </div>

      {loading ? <div role="status" className="flex min-h-48 items-center justify-center gap-3 p-6 text-sm text-slate-600"><Loader2 className="animate-spin text-blue-700" size={20} />Cargando lugares…</div> : error ? <div role="alert" className="m-4 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800"><p className="flex gap-2"><AlertCircle size={18} className="shrink-0" />{message(error)}</p><button type="button" onClick={() => void refresh()} className="mt-3 min-h-11 rounded-lg bg-red-700 px-4 font-semibold text-white">Volver a intentar</button></div> : result?.items.length ? <>
        <div className="hidden grid-cols-[1fr_minmax(160px,auto)_minmax(130px,auto)] gap-4 bg-slate-50 px-6 py-3 text-xs font-semibold text-slate-600 sm:grid"><span>Lugar</span><span>{activeMetric.column}</span><span className="text-right">Qué puedes hacer</span></div>
        <ul aria-label="Resultados por territorio" className="divide-y divide-slate-100">{result.items.map(item => <li key={item.id}>
          <button type="button" onClick={() => selectTerritory(item)} aria-label={`${item.name}: ${item.displayValue}. ${item.hasChildren && item.nextLevel ? `Ver ${LEVEL_LABELS[item.nextLevel]}` : "Ver detalle"}`} aria-expanded={item.hasChildren ? undefined : selectedId === item.id} className={`grid min-h-20 w-full grid-cols-[minmax(0,1fr)_auto] items-center gap-3 px-4 py-4 text-left hover:bg-blue-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-blue-600 sm:grid-cols-[1fr_minmax(160px,auto)_minmax(130px,auto)] sm:gap-4 sm:px-6 ${selectedId === item.id ? "bg-blue-50" : ""}`}>
            <span className="min-w-0"><span className="block break-words text-sm font-semibold text-slate-900">{item.name}</span><span className="mt-1 block text-xs text-slate-500">Código {item.code}</span></span>
            <span className="text-right sm:text-left"><strong className={`block text-lg font-bold ${item.value === 0 ? "text-slate-500" : "text-blue-900"}`}>{item.displayValue}</strong><span className="mt-1 block max-w-40 text-xs leading-4 text-slate-500 sm:hidden">{activeMetric.column}</span>{query.metric === "E14_COVERAGE" && <span className="mt-1 block text-xs text-slate-500">{item.operationalContext.expectedTables ? `${item.operationalContext.acceptedTables} de ${item.operationalContext.expectedTables} mesas` : "Sin mesas configuradas"}</span>}</span>
            <span className="col-span-2 flex items-center gap-1 text-xs font-semibold text-blue-700 sm:col-span-1 sm:justify-end">{item.hasChildren && item.nextLevel ? `Ver ${LEVEL_LABELS[item.nextLevel]}` : "Ver detalle"}<ArrowRight size={15} /></span>
          </button>
          {selectedId === item.id && <div role="region" aria-label={`Detalle de ${item.name}`} className="border-t border-blue-100 bg-blue-50 px-4 py-4 sm:px-6"><p className="text-sm leading-6 text-blue-950">{item.suppressed ? "El conteo es pequeño y se reserva para proteger a las personas. No significa cero." : activeMetric.source}</p><p className="mt-2 text-xs leading-5 text-blue-900">{item.geo.latitude === null || item.geo.longitude === null ? "Este lugar aún no tiene coordenadas disponibles." : "La ubicación del mapa es una referencia administrativa; no indica direcciones de personas."}</p><button type="button" onClick={() => setSelectedId(null)} className="mt-2 min-h-11 rounded-lg border border-blue-200 bg-white px-4 text-sm text-blue-800">Cerrar detalle</button></div>}
        </li>)}</ul>
        <div className="flex flex-wrap items-center justify-between gap-3 border-t p-4 sm:px-6"><p role="status" className="text-xs text-slate-600">Mostrando {pageRange} {result.pageInfo.totalItems === 1 ? "lugar" : "lugares"}</p><div className="flex gap-2"><button type="button" disabled={query.page <= 1} onClick={() => changePage(query.page - 1)} className="min-h-11 rounded-lg border px-3 text-sm disabled:opacity-40">Anterior</button><button type="button" disabled={query.page >= result.pageInfo.totalPages} onClick={() => changePage(query.page + 1)} className="min-h-11 rounded-lg border px-3 text-sm disabled:opacity-40">Siguiente</button></div></div>
      </> : result ? <div className="flex flex-col items-center p-8 text-center sm:p-12">
        <CheckCircle2 size={28} className="text-slate-400" aria-hidden="true" />
        <h3 className="mt-3 text-base font-semibold text-slate-900">{query.search ? "No encontramos ese lugar en esta vista" : query.page > 1 ? "Esta página ya no tiene resultados" : query.activity === "ACTIVE" ? query.metric === "OPEN_CASES" ? "No hay casos abiertos vinculados a estos lugares" : "Todavía no hay registros para mostrar" : "No hay lugares disponibles en este nivel"}</h3>
        <p className="mt-2 max-w-lg text-sm leading-6 text-slate-600">{query.search ? "Prueba con parte del nombre o consulta todos los lugares. La búsqueda corresponde al nivel y al territorio elegidos." : activeMetric.source}</p>
        {query.activity === "ACTIVE" && result.summary.totalTerritories > 0 && <button type="button" onClick={() => { setDraftSearch(""); setQuery(current => ({ ...current, activity: "ALL", search: "", page: 1 })); }} className="mt-4 min-h-11 rounded-xl border border-blue-200 bg-blue-50 px-4 text-sm font-semibold text-blue-800">Ver {result.summary.totalTerritories === 1 ? "el lugar disponible" : `los ${result.summary.totalTerritories} lugares disponibles`}</button>}
        {query.page > 1 && <button type="button" onClick={() => setQuery(current => ({ ...current, page: 1 }))} className="mt-3 min-h-11 px-4 text-sm font-semibold text-blue-700">Volver a la primera página</button>}
      </div> : null}
    </div>

    {result && !loading && <>
      {result.privacy.minimumReportableCount !== null && <p className="flex items-start gap-2 px-1 text-xs leading-5 text-slate-500"><ShieldCheck size={16} className="mt-0.5 shrink-0" />Los conteos pequeños se reservan y aparecen como «Menos de {result.privacy.minimumReportableCount}». El cero sí significa que no hay registros para esta consulta.</p>}
      {result.items.length > 0 && <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white"><button type="button" aria-expanded={mapOpen} onClick={() => setMapOpen(!mapOpen)} className="flex min-h-16 w-full items-center justify-between gap-3 p-4 text-left sm:px-6"><span className="flex items-center gap-3"><MapPinned size={20} className="shrink-0 text-blue-700" /><span><span className="block text-sm font-semibold text-slate-900">Ver estos lugares en el mapa</span><span className="mt-1 block text-xs text-slate-500">Vista opcional {result.items.length === 1 ? "del resultado" : `de los ${result.items.length} resultados`} de esta página</span></span></span><ChevronDown size={18} className={`shrink-0 ${mapOpen ? "rotate-180" : ""}`} /></button>{mapOpen && <div className="border-t p-3 sm:p-4"><TerritoryPageMap key={queryKey} items={result.items} onSelect={selectTerritory} /></div>}</div>}
      <details className="rounded-xl border border-slate-200 bg-white p-4"><summary className="cursor-pointer text-sm font-semibold text-slate-600">Guardar una copia para consultar sin conexión</summary><div className="mt-3 max-w-2xl space-y-3 text-xs leading-5 text-slate-600"><p className="flex gap-2"><Info size={16} className="mt-0.5 shrink-0" />Guarda este nivel completo, hasta 500 lugares, cifrado en este dispositivo. No guarda personas. La copia no se actualiza sola; después podrás abrirla desde Bóveda offline.</p><button type="button" onClick={() => void saveOffline()} disabled={saving || view?.source !== "ONLINE"} className="inline-flex min-h-11 items-center gap-2 rounded-lg border border-slate-300 px-4 text-sm font-semibold disabled:opacity-40">{saving ? <Loader2 className="animate-spin" size={16} /> : <Download size={16} />}{saving ? "Guardando copia…" : vaultPhase === "UNLOCKED" ? "Guardar este nivel" : "Abrir bóveda para guardar"}</button>{saveMessage && <p role="status" className="rounded-lg bg-emerald-50 p-3 text-emerald-900">{saveMessage}</p>}{saveError && <p role="alert" className="rounded-lg bg-red-50 p-3 text-red-800">{saveError}</p>}</div></details>
    </>}
  </section>;
}
