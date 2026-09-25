"use client";

import { usePageRequest } from "@/lib/use-page-request";

import { FormEvent, useCallback, useEffect, useState } from "react";
import {
  AlertCircle,
  Building2,
  ChevronLeft,
  ChevronRight,
  DatabaseZap,
  Loader2,
  MapPin,
  Plus,
  RefreshCw,
  Search,
  UserPlus,
} from "lucide-react";
import { useAuth } from "@/context/auth";
import { ApiError, apiRequest } from "@/lib/api-client";
import { UserRole } from "@/types/saas-schema";
import { TerritoryHeatmap } from "@/components/territory/TerritoryHeatmap";
import { CreateLeaderModal } from "@/components/territory/CreateLeaderModal";

type DivisionType = "MUNICIPIO" | "ZONA" | "PUESTO";

interface Division {
  id: string;
  code: string;
  name: string;
  type: DivisionType;
  parentId: string | null;
  expectedTables: number | null;
  sourceNamespace: "RNEC_DIVIPOLE" | "DANE_DIVIPOLA" | null;
  sourceReleaseId: string | null;
  sourceLocationCode: string | null;
  votingDate: string | null;
  address: string | null;
  commune: string | null;
  latitude: string | number | null;
  longitude: string | number | null;
  timeZone: string | null;
  operationalStatus: {
    code:
      | "OPEN_FOR_LOGICAL_VOTING_DATE"
      | "VOTING_DATE_NOT_DOCUMENTED"
      | "TIME_ZONE_NOT_VERIFIED"
      | "OUTSIDE_LOGICAL_VOTING_DATE";
    operationalNow: boolean;
    votingDate: string | null;
    evaluatedLocalDate: string | null;
    timeZone: string | null;
  } | null;
  parent: {
    id: string;
    code: string;
    name: string;
    type: string;
  } | null;
}

interface DivisionResult {
  items: Division[];
  evaluatedAt: string;
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

interface SyncResult {
  source: string;
  synchronized: {
    departments: number;
    municipalities: number;
  };
  synchronizedAt: string;
}

interface CreateDivisionInput {
  type: "ZONA" | "PUESTO";
  code: string;
  name: string;
  parentId: string;
}

const TYPE_OPTIONS: Array<{ value: DivisionType; label: string }> = [
  { value: "MUNICIPIO", label: "Municipios" },
  { value: "ZONA", label: "Zonas" },
  { value: "PUESTO", label: "Puestos" },
];

function messageFrom(error: unknown) {
  return error instanceof ApiError
    ? error.message
    : "No fue posible consultar la organización territorial.";
}

function civilDate(value: string | null) {
  return value?.slice(0, 10) ?? null;
}

export default function TerritoryPage() {
  const { user } = useAuth();
  const [type, setType] = useState<DivisionType>("MUNICIPIO");
  const [searchDraft, setSearchDraft] = useState("");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [syncing, setSyncing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [createType, setCreateType] = useState<"ZONA" | "PUESTO">("ZONA");
  const [divisionCode, setDivisionCode] = useState("");
  const [divisionName, setDivisionName] = useState("");
  const [parentSearch, setParentSearch] = useState("");
  const [parentOptions, setParentOptions] = useState<Division[]>([]);
  const [parentId, setParentId] = useState("");
  const [loadingParents, setLoadingParents] = useState(false);
  const [creating, setCreating] = useState(false);
  const [selectedDivisionForLeader, setSelectedDivisionForLeader] =
    useState<Division | null>(null);

  const canSynchronize =
    user?.role === UserRole.AdminCampana || user?.role === UserRole.SuperAdmin;

  const request = useCallback(
    (signal: AbortSignal) => {
      const params = new URLSearchParams({
        type,
        page: String(page),
        limit: "24",
      });
      if (search) params.set("search", search);
      return apiRequest<DivisionResult>(`campaigns/divisions?${params}`, {
        signal,
      });
    },
    [page, search, type],
  );
  const {
    data: result,
    loading,
    error: requestError,
    refresh: loadDivisions,
  } = usePageRequest(request);
  const loadError = requestError ? messageFrom(requestError) : null;

  useEffect(() => {
    if (!canSynchronize) return;

    const controller = new AbortController();
    const timeout = window.setTimeout(() => {
      setLoadingParents(true);
      const parentTypes: DivisionType[] =
        createType === "ZONA" ? ["MUNICIPIO"] : ["MUNICIPIO", "ZONA"];

      void Promise.all(
        parentTypes.map((parentType) => {
          const params = new URLSearchParams({
            type: parentType,
            page: "1",
            limit: "30",
          });
          if (parentSearch.trim()) params.set("search", parentSearch.trim());
          return apiRequest<DivisionResult>(`campaigns/divisions?${params}`, {
            signal: controller.signal,
          });
        }),
      )
        .then((responses) => {
          const unique = new Map<string, Division>();
          for (const response of responses) {
            for (const division of response.items)
              unique.set(division.id, division);
          }
          const options = [...unique.values()];
          setParentOptions(options);
          setParentId((current) =>
            options.some((option) => option.id === current) ? current : "",
          );
        })
        .catch((requestError: unknown) => {
          if (
            requestError instanceof DOMException &&
            requestError.name === "AbortError"
          ) {
            return;
          }
          setError(messageFrom(requestError));
        })
        .finally(() => {
          if (!controller.signal.aborted) setLoadingParents(false);
        });
    }, 250);

    return () => {
      window.clearTimeout(timeout);
      controller.abort();
    };
  }, [canSynchronize, createType, parentSearch]);

  function handleSearch(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPage(1);
    setSearch(searchDraft.trim());
  }

  async function synchronizeOfficialGeography() {
    setSyncing(true);
    setError(null);
    setNotice(null);
    try {
      const sync = await apiRequest<SyncResult>("campaigns/init", {
        method: "POST",
      });
      setType("MUNICIPIO");
      setPage(1);
      setSearch("");
      setSearchDraft("");
      setNotice(
        `${sync.synchronized.municipalities.toLocaleString("es-CO")} municipios y ${sync.synchronized.departments.toLocaleString("es-CO")} departamentos sincronizados desde DANE.`,
      );
    } catch (requestError) {
      setError(messageFrom(requestError));
    } finally {
      setSyncing(false);
    }
  }

  async function createOperationalDivision(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!parentId) {
      setError("Selecciona un territorio padre válido.");
      return;
    }

    setCreating(true);
    setError(null);
    setNotice(null);
    const input: CreateDivisionInput = {
      type: createType,
      code: divisionCode.trim(),
      name: divisionName.trim(),
      parentId,
    };

    try {
      const created = await apiRequest<Division>("campaigns/divisions", {
        method: "POST",
        body: JSON.stringify(input),
      });
      setDivisionCode("");
      setDivisionName("");
      setParentId("");
      setType(created.type);
      setPage(1);
      setSearch("");
      setSearchDraft("");
      setNotice(`${created.name} quedó disponible para asignaciones.`);
    } catch (requestError) {
      setError(messageFrom(requestError));
    } finally {
      setCreating(false);
    }
  }

  const totalPages = Math.max(result?.pagination.totalPages ?? 1, 1);

  return (
    <div className="space-y-7 min-w-0">
      <header className="flex flex-col justify-between gap-5 xl:flex-row xl:items-end min-w-0">
        <div className="space-y-2 min-w-0">
          <div className="inline-flex items-center gap-2 rounded-full bg-blue-50 px-3 py-1 text-xs font-semibold text-blue-700 min-w-0">
            <MapPin size={13} /> Base territorial verificable
          </div>
          <h1 className="font-semibold tracking-tight text-slate-950 text-2xl sm:text-3xl break-words">
            Organización territorial
          </h1>
          <p className="max-w-3xl text-sm leading-6 text-slate-500">
            Consulta la estructura operativa del tenant. DANE aporta DIVIPOLA
            administrativa para departamentos y municipios; las zonas y puestos
            electorales pertenecen a DIVIPOLE de Registraduría y sólo aparecen
            desde un catálogo electoral autorizado y verificable.
          </p>
        </div>
        <div className="flex flex-wrap gap-3 min-w-0">
          <button
            type="button"
            onClick={() => void loadDivisions()}
            className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-slate-200 bg-white px-5 text-sm font-semibold text-slate-700 hover:bg-slate-50 max-w-full whitespace-normal"
          >
            <RefreshCw size={16} /> Actualizar
          </button>
          {canSynchronize && (
            <button
              type="button"
              disabled={syncing}
              onClick={() => void synchronizeOfficialGeography()}
              className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-slate-950 px-5 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50 max-w-full whitespace-normal"
            >
              {syncing ? (
                <Loader2 className="animate-spin" size={16} />
              ) : (
                <DatabaseZap size={16} />
              )}
              Sincronizar geografía DANE
            </button>
          )}
        </div>
      </header>

      {notice && (
        <div
          role="status"
          className="rounded-2xl border border-emerald-200 bg-emerald-50 px-5 py-4 text-sm font-bold text-emerald-800 min-w-0"
        >
          {notice}
        </div>
      )}

      {loadError && (
        <div
          role="alert"
          className="flex flex-col items-start gap-4 rounded-2xl border border-red-200 bg-red-50 p-5 text-sm font-semibold text-red-700 sm:flex-row sm:justify-between min-w-0"
        >
          <div className="flex items-start gap-3 min-w-0">
            <AlertCircle className="mt-0.5 shrink-0" size={18} />
            <div>
              <p>{loadError}</p>
              <p className="mt-1 text-xs">
                {result
                  ? "Se conserva el último resultado territorial disponible."
                  : "El territorio no está disponible; no se sustituyó por un listado vacío."}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => void loadDivisions()}
            disabled={loading}
            className="min-h-10 shrink-0 rounded-xl bg-red-700 px-4 text-sm font-semibold text-white disabled:opacity-50 max-w-full whitespace-normal"
          >
            Reintentar
          </button>
        </div>
      )}

      {error && (
        <div
          role="alert"
          className="flex items-start gap-3 rounded-2xl border border-red-200 bg-red-50 p-5 text-sm font-semibold text-red-700 min-w-0"
        >
          <AlertCircle className="mt-0.5 shrink-0" size={18} /> {error}
        </div>
      )}

      {canSynchronize && (
        <section className="rounded-3xl border border-blue-100 bg-gradient-to-br from-blue-950 via-slate-950 to-slate-900 p-6 text-white shadow-xl shadow-blue-950/10 min-w-0">
          <div className="grid gap-6 xl:grid-cols-[18rem_minmax(0,1fr)] xl:items-end min-w-0">
            <div>
              <div className="inline-flex items-center gap-2 text-xs font-semibold text-blue-300 min-w-0">
                <Plus size={15} aria-hidden="true" /> Estructura operativa
              </div>
              <h2 className="mt-3 text-2xl font-semibold">
                Crear zona o puesto
              </h2>
              <p className="mt-2 text-sm leading-6 text-slate-300">
                Construye la jerarquía real y luego asigna cada miembro desde
                Equipo y accesos.
              </p>
            </div>
            <form
              onSubmit={createOperationalDivision}
              className="grid min-w-0 gap-3 sm:grid-cols-2 2xl:grid-cols-[10rem_11rem_minmax(0,1fr)_minmax(0,1.3fr)_auto]"
            >
              <label className="space-y-2 text-sm font-semibold text-slate-300 min-w-0">
                Nivel
                <select
                  value={createType}
                  onChange={(event) => {
                    setCreateType(event.target.value as "ZONA" | "PUESTO");
                    setParentId("");
                  }}
                  className="min-h-12 w-full rounded-xl border border-slate-700 bg-slate-900 px-3 text-sm font-bold normal-case tracking-normal text-white min-w-0 max-w-full"
                >
                  <option value="ZONA">Zona</option>
                  <option value="PUESTO">Puesto</option>
                </select>
              </label>
              <label className="space-y-2 text-sm font-semibold text-slate-300 min-w-0">
                Código
                <input
                  required
                  maxLength={50}
                  value={divisionCode}
                  onChange={(event) => setDivisionCode(event.target.value)}
                  className="min-h-12 w-full rounded-xl border border-slate-700 bg-slate-900 px-3 text-sm font-bold normal-case tracking-normal text-white min-w-0 max-w-full"
                />
              </label>
              <label className="space-y-2 text-sm font-semibold text-slate-300 min-w-0">
                Nombre
                <input
                  required
                  maxLength={160}
                  value={divisionName}
                  onChange={(event) => setDivisionName(event.target.value)}
                  className="min-h-12 w-full rounded-xl border border-slate-700 bg-slate-900 px-3 text-sm font-bold normal-case tracking-normal text-white min-w-0 max-w-full"
                />
              </label>
              <div className="space-y-2 min-w-0">
                <label className="block text-sm font-semibold text-slate-300 min-w-0">
                  Buscar territorio padre
                  <input
                    maxLength={100}
                    value={parentSearch}
                    onChange={(event) => setParentSearch(event.target.value)}
                    placeholder="Municipio o zona"
                    className="mt-2 min-h-12 w-full rounded-xl border border-slate-700 bg-slate-900 px-3 text-sm font-bold normal-case tracking-normal text-white min-w-0 max-w-full"
                  />
                </label>
                <label className="sr-only min-w-0" htmlFor="division-parent">
                  Territorio padre
                </label>
                <select
                  id="division-parent"
                  required
                  value={parentId}
                  onChange={(event) => setParentId(event.target.value)}
                  disabled={loadingParents}
                  className="min-h-12 w-full rounded-xl border border-slate-700 bg-slate-900 px-3 text-sm font-bold text-white disabled:opacity-60 min-w-0 max-w-full"
                >
                  <option value="">
                    {loadingParents
                      ? "Consultando…"
                      : parentOptions.length
                        ? "Selecciona el padre"
                        : "Sin resultados"}
                  </option>
                  {parentOptions.map((option) => (
                    <option key={option.id} value={option.id}>
                      {option.type} · {option.name} · {option.code}
                    </option>
                  ))}
                </select>
              </div>
              <button
                type="submit"
                disabled={creating || loadingParents || !parentId}
                className="min-h-12 self-end rounded-xl bg-blue-500 px-5 text-sm font-semibold text-white transition hover:bg-blue-400 disabled:opacity-50 max-w-full whitespace-normal"
              >
                {creating ? "Creando…" : "Crear"}
              </button>
            </form>
          </div>
        </section>
      )}

      <TerritoryHeatmap />

      <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm min-w-0">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between min-w-0">
          <div
            className="flex min-w-0 max-w-full flex-wrap gap-2"
            role="group"
            aria-label="Tipo de división"
          >
            {TYPE_OPTIONS.map((option) => (
              <button
                key={option.value}
                type="button"
                aria-pressed={type === option.value}
                onClick={() => {
                  setType(option.value);
                  setPage(1);
                }}
                className={`min-h-11 shrink-0 rounded-xl px-4 text-xs font-semibold ${
                  type === option.value
                    ? "bg-blue-700 text-white"
                    : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                }`}
              >
                {option.label}
              </button>
            ))}
          </div>
          <form
            onSubmit={handleSearch}
            className="flex w-full gap-2 lg:max-w-lg min-w-0 flex-wrap"
          >
            <label className="relative flex-1 min-w-0">
              <span className="sr-only">Buscar por código o nombre</span>
              <Search
                aria-hidden="true"
                className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400"
                size={17}
              />
              <input
                value={searchDraft}
                onChange={(event) => setSearchDraft(event.target.value)}
                maxLength={100}
                placeholder="Código o nombre"
                className="min-h-11 w-full rounded-xl border border-slate-200 pl-11 pr-4 text-sm font-semibold text-slate-800 outline-none focus:border-blue-500 min-w-0 max-w-full"
              />
            </label>
            <button
              type="submit"
              className="min-h-11 rounded-xl bg-slate-950 px-5 text-sm font-semibold text-white max-w-full whitespace-normal"
            >
              Buscar
            </button>
          </form>
        </div>
      </section>

      {loading ? (
        <div
          role="status"
          className="flex min-h-80 flex-col items-center justify-center gap-3 rounded-3xl border border-slate-200 bg-white text-slate-500 min-w-0"
        >
          <Loader2 className="animate-spin text-blue-700" size={30} />
          <span className="font-bold">Consultando territorio seguro…</span>
        </div>
      ) : loadError && !result ? (
        <div className="flex min-h-80 flex-col items-center justify-center rounded-3xl border border-dashed border-amber-300 bg-amber-50 p-8 text-center min-w-0">
          <AlertCircle className="mb-4 text-amber-600" size={42} />
          <h2 className="font-semibold text-slate-950">
            Territorio no disponible
          </h2>
          <p className="mt-2 max-w-xl text-sm leading-6 text-slate-600">
            Reintenta la consulta antes de concluir que no existen divisiones.
          </p>
        </div>
      ) : !result?.items.length ? (
        <div className="flex min-h-80 flex-col items-center justify-center rounded-3xl border border-dashed border-slate-300 bg-white p-8 text-center min-w-0">
          <Building2 className="mb-4 text-slate-300" size={48} />
          <h2 className="font-semibold text-slate-950">
            No hay{" "}
            {TYPE_OPTIONS.find(
              (option) => option.value === type,
            )?.label.toLowerCase()}{" "}
            para estos filtros
          </h2>
          <p className="mt-2 max-w-xl text-sm leading-6 text-slate-500">
            No se generan cifras ni ubicaciones de ejemplo. Un administrador
            puede sincronizar la geografía administrativa oficial; zonas y
            puestos requieren una versión electoral autorizada de Registraduría.
          </p>
        </div>
      ) : (
        <>
          <div className="flex flex-wrap items-center justify-between gap-3 text-xs font-bold text-slate-500 min-w-0">
            <span>
              {result.pagination.total.toLocaleString("es-CO")} registros
            </span>
            <span>
              Página {result.pagination.page} de {totalPages}
            </span>
          </div>
          <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4 min-w-0">
            {result.items.map((division) => (
              <article
                key={division.id}
                className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm min-w-0"
              >
                <div className="flex items-start justify-between gap-4 min-w-0 flex-wrap">
                  <div className="rounded-xl bg-blue-50 p-3 text-blue-700 min-w-0">
                    <MapPin size={19} />
                  </div>
                  <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-500">
                    {division.type}
                  </span>
                </div>
                <h2 className="mt-5 text-lg font-semibold text-slate-950">
                  {division.name}
                </h2>
                <p className="mt-1 text-xs font-bold text-slate-400">
                  Código {division.code}
                </p>
                {division.type === "PUESTO" && (
                  <div className="mt-4 space-y-2 rounded-xl bg-slate-50 p-3 text-xs leading-5 text-slate-600 min-w-0">
                    <p>
                      <strong className="text-slate-900">Código fuente:</strong>{" "}
                      {division.sourceLocationCode ?? "No trazable"}
                    </p>
                    <p>
                      <strong className="text-slate-900">Jornada:</strong>{" "}
                      {civilDate(division.votingDate) ?? "No documentada"}
                    </p>
                    <p>
                      <strong className="text-slate-900">Zona horaria:</strong>{" "}
                      {division.timeZone ?? "Exterior no verificada"}
                    </p>
                    <p>
                      <strong className="text-slate-900">Dirección:</strong>{" "}
                      {division.address ?? "Sin dirección publicada"}
                    </p>
                    {division.commune && (
                      <p>
                        <strong className="text-slate-900">Comuna:</strong>{" "}
                        {division.commune}
                      </p>
                    )}
                    <p
                      className={
                        division.latitude === null ||
                        division.longitude === null
                          ? "font-semibold text-amber-700"
                          : "font-semibold text-emerald-700"
                      }
                    >
                      {division.latitude === null || division.longitude === null
                        ? "Sin coordenadas publicadas utilizables"
                        : "Georreferenciado por la fuente"}
                    </p>
                    <p
                      className={
                        division.operationalStatus?.operationalNow
                          ? "font-semibold text-emerald-700"
                          : "font-semibold text-amber-700"
                      }
                    >
                      {division.operationalStatus?.operationalNow
                        ? "Jornada lógica habilitada ahora"
                        : division.operationalStatus?.code ===
                            "TIME_ZONE_NOT_VERIFIED"
                          ? "Bloqueado para operación REAL: falta zona horaria verificable"
                          : division.operationalStatus?.code ===
                              "OUTSIDE_LOGICAL_VOTING_DATE"
                            ? `No corresponde al día local ${division.operationalStatus.evaluatedLocalDate}`
                            : "Jornada lógica no documentada"}
                    </p>
                  </div>
                )}
                {division.parent && (
                  <p className="mt-4 border-t border-slate-100 pt-4 text-xs text-slate-500">
                    Pertenece a <strong>{division.parent.name}</strong>
                  </p>
                )}
                <div className="mt-4 flex items-center justify-end border-t border-slate-100 pt-4 min-w-0 flex-wrap gap-3">
                  <button
                    type="button"
                    onClick={() => setSelectedDivisionForLeader(division)}
                    className="inline-flex items-center gap-1.5 rounded-lg bg-blue-50 px-3 py-1.5 text-sm font-bold text-blue-700 hover:bg-blue-100 max-w-full whitespace-normal"
                  >
                    <UserPlus size={14} />
                    Crear Líder
                  </button>
                </div>
              </article>
            ))}
          </section>
          <nav
            aria-label="Paginación territorial"
            className="flex justify-end gap-3 min-w-0 flex-wrap"
          >
            <button
              type="button"
              disabled={page <= 1}
              onClick={() => setPage((current) => Math.max(1, current - 1))}
              className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-700 disabled:opacity-40 max-w-full whitespace-normal"
            >
              <ChevronLeft size={16} /> Anterior
            </button>
            <button
              type="button"
              disabled={page >= totalPages}
              onClick={() => setPage((current) => current + 1)}
              className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-700 disabled:opacity-40 max-w-full whitespace-normal"
            >
              Siguiente <ChevronRight size={16} />
            </button>
          </nav>
        </>
      )}

      <p className="text-xs leading-5 text-slate-400">
        Fuente administrativa municipal: DANE, servicio DIVIPOLA MGN 2025. No
        equivale a DIVIPOLE ni certifica zonas, puestos o mesas electorales. La
        sincronización conserva los registros existentes y nunca elimina
        divisiones.
      </p>

      {selectedDivisionForLeader && (
        <CreateLeaderModal
          divisionId={selectedDivisionForLeader.id}
          divisionName={selectedDivisionForLeader.name}
          onClose={() => setSelectedDivisionForLeader(null)}
          onSuccess={() => {
            const name = selectedDivisionForLeader.name;
            setSelectedDivisionForLeader(null);
            setNotice(`Líder asignado exitosamente a ${name}.`);
          }}
        />
      )}
    </div>
  );
}
