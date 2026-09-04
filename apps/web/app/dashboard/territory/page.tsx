"use client";

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
} from "lucide-react";
import { useAuth } from "@/context/auth";
import { ApiError, apiRequest } from "@/lib/api-client";
import { UserRole } from "@/types/saas-schema";

type DivisionType = "MUNICIPIO" | "ZONA" | "PUESTO";

interface Division {
  id: string;
  code: string;
  name: string;
  type: DivisionType;
  parentId: string | null;
  parent: {
    id: string;
    code: string;
    name: string;
    type: string;
  } | null;
}

interface DivisionResult {
  items: Division[];
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

export default function TerritoryPage() {
  const { user } = useAuth();
  const [type, setType] = useState<DivisionType>("MUNICIPIO");
  const [searchDraft, setSearchDraft] = useState("");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [result, setResult] = useState<DivisionResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
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

  const canSynchronize =
    user?.role === UserRole.AdminCampana || user?.role === UserRole.SuperAdmin;

  const loadDivisions = useCallback(async (overrides?: {
    type?: DivisionType;
    page?: number;
    search?: string;
  }) => {
    setLoading(true);
    setLoadError(null);

    const params = new URLSearchParams({
      type: overrides?.type ?? type,
      page: String(overrides?.page ?? page),
      limit: "24",
    });
    const requestedSearch = overrides?.search ?? search;
    if (requestedSearch) params.set("search", requestedSearch);

    try {
      setResult(
        await apiRequest<DivisionResult>(`campaigns/divisions?${params}`),
      );
    } catch (requestError) {
      setLoadError(messageFrom(requestError));
    } finally {
      setLoading(false);
    }
  }, [page, search, type]);

  useEffect(() => {
    void loadDivisions();
  }, [loadDivisions]);

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
      await loadDivisions();
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
      await loadDivisions({ type: created.type, page: 1, search: "" });
    } catch (requestError) {
      setError(messageFrom(requestError));
    } finally {
      setCreating(false);
    }
  }

  const totalPages = Math.max(result?.pagination.totalPages ?? 1, 1);

  return (
    <div className="space-y-7">
      <header className="flex flex-col justify-between gap-5 xl:flex-row xl:items-end">
        <div className="space-y-2">
          <div className="inline-flex items-center gap-2 rounded-full bg-blue-50 px-3 py-1 text-[10px] font-black uppercase tracking-[0.18em] text-blue-700">
            <MapPin size={13} /> Base territorial verificable
          </div>
          <h1 className="text-4xl font-black tracking-tight text-slate-950">
            Organización territorial
          </h1>
          <p className="max-w-3xl text-sm leading-6 text-slate-500">
            Consulta la estructura operativa del tenant. Los municipios se
            sincronizan desde DIVIPOLA MGN 2025 de DANE; zonas y puestos sólo se
            muestran cuando existen registros reales.
          </p>
        </div>
        <div className="flex flex-wrap gap-3">
          <button
            type="button"
            onClick={() => void loadDivisions()}
            className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-slate-200 bg-white px-5 text-xs font-black uppercase tracking-wider text-slate-700 hover:bg-slate-50"
          >
            <RefreshCw size={16} /> Actualizar
          </button>
          {canSynchronize && (
            <button
              type="button"
              disabled={syncing}
              onClick={() => void synchronizeOfficialGeography()}
              className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-slate-950 px-5 text-xs font-black uppercase tracking-wider text-white hover:bg-blue-700 disabled:opacity-50"
            >
              {syncing ? (
                <Loader2 className="animate-spin" size={16} />
              ) : (
                <DatabaseZap size={16} />
              )}
              Sincronizar DANE
            </button>
          )}
        </div>
      </header>

      {notice && (
        <div
          role="status"
          className="rounded-2xl border border-emerald-200 bg-emerald-50 px-5 py-4 text-sm font-bold text-emerald-800"
        >
          {notice}
        </div>
      )}

      {loadError && (
        <div
          role="alert"
          className="flex flex-col items-start gap-4 rounded-2xl border border-red-200 bg-red-50 p-5 text-sm font-semibold text-red-700 sm:flex-row sm:justify-between"
        >
          <div className="flex items-start gap-3">
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
            className="min-h-10 shrink-0 rounded-xl bg-red-700 px-4 text-xs font-black uppercase tracking-wider text-white disabled:opacity-50"
          >
            Reintentar
          </button>
        </div>
      )}

      {error && (
        <div
          role="alert"
          className="flex items-start gap-3 rounded-2xl border border-red-200 bg-red-50 p-5 text-sm font-semibold text-red-700"
        >
          <AlertCircle className="mt-0.5 shrink-0" size={18} /> {error}
        </div>
      )}

      {canSynchronize && (
        <section className="rounded-3xl border border-blue-100 bg-gradient-to-br from-blue-950 via-slate-950 to-slate-900 p-6 text-white shadow-xl shadow-blue-950/10">
          <div className="grid gap-6 xl:grid-cols-[18rem_1fr] xl:items-end">
            <div>
              <div className="inline-flex items-center gap-2 text-xs font-black uppercase tracking-[0.18em] text-blue-300">
                <Plus size={15} aria-hidden="true" /> Estructura operativa
              </div>
              <h2 className="mt-3 text-2xl font-black">Crear zona o puesto</h2>
              <p className="mt-2 text-sm leading-6 text-slate-300">
                Construye la jerarquía real y luego asigna cada miembro desde
                Equipo y accesos.
              </p>
            </div>
            <form
              onSubmit={createOperationalDivision}
              className="grid gap-3 md:grid-cols-2 xl:grid-cols-[10rem_11rem_1fr_1.3fr_auto]"
            >
              <label className="space-y-2 text-xs font-black uppercase tracking-wider text-slate-300">
                Nivel
                <select
                  value={createType}
                  onChange={(event) => {
                    setCreateType(event.target.value as "ZONA" | "PUESTO");
                    setParentId("");
                  }}
                  className="min-h-12 w-full rounded-xl border border-slate-700 bg-slate-900 px-3 text-sm font-bold normal-case tracking-normal text-white"
                >
                  <option value="ZONA">Zona</option>
                  <option value="PUESTO">Puesto</option>
                </select>
              </label>
              <label className="space-y-2 text-xs font-black uppercase tracking-wider text-slate-300">
                Código
                <input
                  required
                  maxLength={50}
                  value={divisionCode}
                  onChange={(event) => setDivisionCode(event.target.value)}
                  className="min-h-12 w-full rounded-xl border border-slate-700 bg-slate-900 px-3 text-sm font-bold normal-case tracking-normal text-white"
                />
              </label>
              <label className="space-y-2 text-xs font-black uppercase tracking-wider text-slate-300">
                Nombre
                <input
                  required
                  maxLength={160}
                  value={divisionName}
                  onChange={(event) => setDivisionName(event.target.value)}
                  className="min-h-12 w-full rounded-xl border border-slate-700 bg-slate-900 px-3 text-sm font-bold normal-case tracking-normal text-white"
                />
              </label>
              <div className="space-y-2">
                <label className="block text-xs font-black uppercase tracking-wider text-slate-300">
                  Buscar territorio padre
                  <input
                    maxLength={100}
                    value={parentSearch}
                    onChange={(event) => setParentSearch(event.target.value)}
                    placeholder="Municipio o zona"
                    className="mt-2 min-h-12 w-full rounded-xl border border-slate-700 bg-slate-900 px-3 text-sm font-bold normal-case tracking-normal text-white"
                  />
                </label>
                <label className="sr-only" htmlFor="division-parent">
                  Territorio padre
                </label>
                <select
                  id="division-parent"
                  required
                  value={parentId}
                  onChange={(event) => setParentId(event.target.value)}
                  disabled={loadingParents}
                  className="min-h-12 w-full rounded-xl border border-slate-700 bg-slate-900 px-3 text-sm font-bold text-white disabled:opacity-60"
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
                className="min-h-12 self-end rounded-xl bg-blue-500 px-5 text-xs font-black uppercase tracking-wider text-white transition hover:bg-blue-400 disabled:opacity-50"
              >
                {creating ? "Creando…" : "Crear"}
              </button>
            </form>
          </div>
        </section>
      )}

      <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div
            className="flex gap-2 overflow-x-auto"
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
                className={`min-h-11 shrink-0 rounded-xl px-4 text-xs font-black uppercase tracking-wider ${
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
            className="flex w-full gap-2 lg:max-w-lg"
          >
            <label className="relative flex-1">
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
                className="min-h-11 w-full rounded-xl border border-slate-200 pl-11 pr-4 text-sm font-semibold text-slate-800 outline-none focus:border-blue-500"
              />
            </label>
            <button
              type="submit"
              className="min-h-11 rounded-xl bg-slate-950 px-5 text-xs font-black uppercase tracking-wider text-white"
            >
              Buscar
            </button>
          </form>
        </div>
      </section>

      {loading ? (
        <div
          role="status"
          className="flex min-h-80 flex-col items-center justify-center gap-3 rounded-3xl border border-slate-200 bg-white text-slate-500"
        >
          <Loader2 className="animate-spin text-blue-700" size={30} />
          <span className="font-bold">Consultando territorio seguro…</span>
        </div>
      ) : loadError && !result ? (
        <div className="flex min-h-80 flex-col items-center justify-center rounded-3xl border border-dashed border-amber-300 bg-amber-50 p-8 text-center">
          <AlertCircle className="mb-4 text-amber-600" size={42} />
          <h2 className="font-black text-slate-950">
            Territorio no disponible
          </h2>
          <p className="mt-2 max-w-xl text-sm leading-6 text-slate-600">
            Reintenta la consulta antes de concluir que no existen divisiones.
          </p>
        </div>
      ) : !result?.items.length ? (
        <div className="flex min-h-80 flex-col items-center justify-center rounded-3xl border border-dashed border-slate-300 bg-white p-8 text-center">
          <Building2 className="mb-4 text-slate-300" size={48} />
          <h2 className="font-black text-slate-950">
            No hay{" "}
            {TYPE_OPTIONS.find(
              (option) => option.value === type,
            )?.label.toLowerCase()}{" "}
            para estos filtros
          </h2>
          <p className="mt-2 max-w-xl text-sm leading-6 text-slate-500">
            No se generan cifras ni ubicaciones de ejemplo. Un administrador
            puede sincronizar municipios oficiales; zonas y puestos requieren
            una fuente electoral autorizada.
          </p>
        </div>
      ) : (
        <>
          <div className="flex flex-wrap items-center justify-between gap-3 text-xs font-bold text-slate-500">
            <span>
              {result.pagination.total.toLocaleString("es-CO")} registros
            </span>
            <span>
              Página {result.pagination.page} de {totalPages}
            </span>
          </div>
          <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
            {result.items.map((division) => (
              <article
                key={division.id}
                className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"
              >
                <div className="flex items-start justify-between gap-4">
                  <div className="rounded-xl bg-blue-50 p-3 text-blue-700">
                    <MapPin size={19} />
                  </div>
                  <span className="rounded-full bg-slate-100 px-3 py-1 text-[10px] font-black uppercase tracking-wider text-slate-500">
                    {division.type}
                  </span>
                </div>
                <h2 className="mt-5 text-lg font-black text-slate-950">
                  {division.name}
                </h2>
                <p className="mt-1 text-xs font-bold text-slate-400">
                  Código {division.code}
                </p>
                {division.parent && (
                  <p className="mt-4 border-t border-slate-100 pt-4 text-xs text-slate-500">
                    Pertenece a <strong>{division.parent.name}</strong>
                  </p>
                )}
              </article>
            ))}
          </section>
          <nav
            aria-label="Paginación territorial"
            className="flex justify-end gap-3"
          >
            <button
              type="button"
              disabled={page <= 1}
              onClick={() => setPage((current) => Math.max(1, current - 1))}
              className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 text-xs font-black uppercase tracking-wider text-slate-700 disabled:opacity-40"
            >
              <ChevronLeft size={16} /> Anterior
            </button>
            <button
              type="button"
              disabled={page >= totalPages}
              onClick={() => setPage((current) => current + 1)}
              className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 text-xs font-black uppercase tracking-wider text-slate-700 disabled:opacity-40"
            >
              Siguiente <ChevronRight size={16} />
            </button>
          </nav>
        </>
      )}

      <p className="text-xs leading-5 text-slate-400">
        Fuente municipal: DANE, servicio DIVIPOLA MGN 2025. La sincronización
        conserva los registros existentes y nunca elimina divisiones.
      </p>
    </div>
  );
}
