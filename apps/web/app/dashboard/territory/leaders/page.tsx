"use client";

import { useCallback, useEffect, useState } from "react";
import {
  AlertCircle,
  ChevronDown,
  ChevronRight,
  Filter,
  Loader2,
  Mail,
  MapPin,
  Phone,
  RefreshCw,
  Search,
  Share2,
  UserPlus,
  Users,
} from "lucide-react";
import { ApiError, apiRequest } from "@/lib/api-client";
import { CreateLeaderModal } from "@/components/territory/CreateLeaderModal";

/* ─── Types ─── */

interface Division {
  id: string;
  code: string;
  name: string;
  type: "MUNICIPIO" | "ZONA" | "PUESTO";
  parent: { id: string; name: string; code: string; type: string } | null;
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
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

/* ─── Constants ─── */

const ROLE_FILTERS = [
  { value: "", label: "Todos los cargos" },
  { value: "Edil JAL", label: "Edil JAL" },
  { value: "Presidente JAL", label: "Presidente JAL" },
  { value: "Presidente JAC", label: "Presidente JAC" },
  { value: "Coordinador", label: "Coordinador de zona" },
  { value: "Líder", label: "Líder comunitario" },
  { value: "Testigo", label: "Testigo electoral" },
];

const DIVISION_TYPES = [
  { value: "MUNICIPIO" as const, label: "Municipios" },
  { value: "ZONA" as const, label: "Zonas / Comunas" },
  { value: "PUESTO" as const, label: "Puestos de votación" },
];

/* ─── Component ─── */

export default function TerritoryLeadersPage() {
  // Filters
  const [divisionType, setDivisionType] = useState<
    "MUNICIPIO" | "ZONA" | "PUESTO"
  >("MUNICIPIO");
  const [territorySearch, setTerritorySearch] = useState("");
  const [territorySearchInput, setTerritorySearchInput] = useState("");
  const [leaderNameFilter, setLeaderNameFilter] = useState("");
  const [roleFilter, setRoleFilter] = useState("");

  // Data
  const [divisions, setDivisions] = useState<Division[]>([]);
  const [loadingDivisions, setLoadingDivisions] = useState(true);
  const [divisionPage, setDivisionPage] = useState(1);
  const [totalDivisionPages, setTotalDivisionPages] = useState(1);
  const [totalDivisions, setTotalDivisions] = useState(0);

  // Expanded divisions (leaders loaded on expand)
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [leadersByDivision, setLeadersByDivision] = useState<
    Record<string, Leader[]>
  >({});
  const [loadingLeaders, setLoadingLeaders] = useState<string | null>(null);

  // Create modal
  const [selectedDivision, setSelectedDivision] = useState<Division | null>(
    null,
  );

  // Errors
  const [error, setError] = useState<string | null>(null);

  // Stats
  const [stats, setStats] = useState({
    totalLeadersLoaded: 0,
    divisionsWithLeaders: 0,
  });

  /* ─── Load divisions ─── */

  const loadDivisions = useCallback(
    async (overrides?: {
      type?: typeof divisionType;
      page?: number;
      search?: string;
    }) => {
      setLoadingDivisions(true);
      setError(null);

      const type = overrides?.type ?? divisionType;
      const page = overrides?.page ?? divisionPage;
      const search = overrides?.search ?? territorySearch;

      const params = new URLSearchParams({
        type,
        page: String(page),
        limit: "20",
      });
      if (search) params.set("search", search);

      try {
        const result = await apiRequest<DivisionResult>(
          `campaigns/divisions?${params}`,
        );
        setDivisions(result.items);
        setTotalDivisionPages(result.pagination.totalPages);
        setTotalDivisions(result.pagination.total);
      } catch (err) {
        setError(
          err instanceof ApiError
            ? err.message
            : "No fue posible cargar los territorios.",
        );
      } finally {
        setLoadingDivisions(false);
      }
    },
    [divisionType, divisionPage, territorySearch],
  );

  useEffect(() => {
    void loadDivisions();
  }, [loadDivisions]);

  /* ─── Load leaders for a division ─── */

  const loadLeaders = useCallback(
    async (divisionId: string) => {
      setLoadingLeaders(divisionId);
      try {
        const leaders = await apiRequest<Leader[]>(
          `campaigns/divisions/${encodeURIComponent(divisionId)}/leaders`,
        );
        setLeadersByDivision((prev) => ({ ...prev, [divisionId]: leaders }));
      } catch {
        setLeadersByDivision((prev) => ({ ...prev, [divisionId]: [] }));
      } finally {
        setLoadingLeaders(null);
      }
    },
    [],
  );

  /* ─── Toggle expand ─── */

  function toggleExpand(divisionId: string) {
    if (expandedId === divisionId) {
      setExpandedId(null);
      return;
    }
    setExpandedId(divisionId);
    if (!leadersByDivision[divisionId]) {
      void loadLeaders(divisionId);
    }
  }

  /* ─── Filter leaders by name/role ─── */

  function filterLeaders(leaders: Leader[]): Leader[] {
    return leaders.filter((l) => {
      const matchesName =
        !leaderNameFilter ||
        l.name.toLowerCase().includes(leaderNameFilter.toLowerCase());
      const matchesRole =
        !roleFilter ||
        l.roleDescription.toLowerCase().includes(roleFilter.toLowerCase());
      return matchesName && matchesRole;
    });
  }

  /* ─── Handle territory search ─── */

  function handleTerritorySearch(e: React.FormEvent) {
    e.preventDefault();
    setDivisionPage(1);
    setTerritorySearch(territorySearchInput.trim());
    setExpandedId(null);
  }

  /* ─── Render ─── */

  return (
    <div className="space-y-6">
      {/* Header */}
      <header className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
        <div className="space-y-2">
          <div className="inline-flex items-center gap-2 rounded-full bg-blue-50 px-3 py-1 text-[10px] font-black uppercase tracking-[0.18em] text-blue-700">
            <Users size={13} /> Directorio de líderes
          </div>
          <h1 className="text-3xl font-black tracking-tight text-slate-950">
            Líderes Territoriales
          </h1>
          <p className="max-w-2xl text-sm leading-6 text-slate-500">
            Consulta y gestiona los líderes asignados a cada territorio. Filtra
            por departamento, municipio, comuna o puesto de votación.
          </p>
        </div>
        <button
          onClick={() => {
            setExpandedId(null);
            setLeadersByDivision({});
            void loadDivisions();
          }}
          className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-slate-200 bg-white px-5 text-xs font-black uppercase tracking-wider text-slate-700 hover:bg-slate-50"
        >
          <RefreshCw size={16} /> Actualizar
        </button>
      </header>

      {/* Filters Bar */}
      <div className="flex flex-col gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm lg:flex-row lg:items-end">
        {/* Territory Type */}
        <div className="flex-1">
          <label className="mb-1 block text-[10px] font-black uppercase tracking-wider text-slate-500">
            <Filter size={11} className="mr-1 inline" />
            Nivel territorial
          </label>
          <div className="flex rounded-xl border border-slate-200 bg-slate-50 p-1">
            {DIVISION_TYPES.map((dt) => (
              <button
                key={dt.value}
                onClick={() => {
                  setDivisionType(dt.value);
                  setDivisionPage(1);
                  setExpandedId(null);
                }}
                className={`flex-1 rounded-lg px-3 py-2 text-xs font-bold transition-all ${
                  divisionType === dt.value
                    ? "bg-white text-blue-700 shadow-sm"
                    : "text-slate-500 hover:text-slate-700"
                }`}
              >
                {dt.label}
              </button>
            ))}
          </div>
        </div>

        {/* Territory Search */}
        <form onSubmit={handleTerritorySearch} className="flex-1">
          <label className="mb-1 block text-[10px] font-black uppercase tracking-wider text-slate-500">
            <MapPin size={11} className="mr-1 inline" />
            Buscar territorio
          </label>
          <div className="flex gap-2">
            <input
              value={territorySearchInput}
              onChange={(e) => setTerritorySearchInput(e.target.value)}
              placeholder="Ej: Medellín, Bello, Itagüí..."
              className="min-h-10 w-full rounded-xl border border-slate-200 px-3 text-sm outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
            />
            <button
              type="submit"
              className="inline-flex min-h-10 items-center gap-1.5 rounded-xl bg-slate-950 px-4 text-xs font-bold text-white hover:bg-blue-700"
            >
              <Search size={14} /> Buscar
            </button>
          </div>
        </form>

        {/* Leader Name Filter */}
        <div className="flex-1">
          <label className="mb-1 block text-[10px] font-black uppercase tracking-wider text-slate-500">
            <Users size={11} className="mr-1 inline" />
            Filtrar por nombre de líder
          </label>
          <input
            value={leaderNameFilter}
            onChange={(e) => setLeaderNameFilter(e.target.value)}
            placeholder="Nombre del líder..."
            className="min-h-10 w-full rounded-xl border border-slate-200 px-3 text-sm outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
          />
        </div>

        {/* Role Filter */}
        <div className="w-full lg:w-56">
          <label className="mb-1 block text-[10px] font-black uppercase tracking-wider text-slate-500">
            Cargo
          </label>
          <select
            value={roleFilter}
            onChange={(e) => setRoleFilter(e.target.value)}
            className="min-h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
          >
            {ROLE_FILTERS.map((rf) => (
              <option key={rf.value} value={rf.value}>
                {rf.label}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Error */}
      {error && (
        <div
          role="alert"
          className="flex items-start gap-3 rounded-2xl border border-red-200 bg-red-50 p-5 text-sm font-semibold text-red-700"
        >
          <AlertCircle className="mt-0.5 shrink-0" size={18} /> {error}
        </div>
      )}

      {/* Results summary */}
      <div className="flex flex-wrap items-center justify-between gap-3 text-xs font-bold text-slate-500">
        <span>
          {totalDivisions.toLocaleString("es-CO")}{" "}
          {divisionType === "MUNICIPIO"
            ? "municipios"
            : divisionType === "ZONA"
              ? "zonas"
              : "puestos"}
          {territorySearch && (
            <>
              {" "}
              para &ldquo;{territorySearch}&rdquo;
              <button
                onClick={() => {
                  setTerritorySearchInput("");
                  setTerritorySearch("");
                  setDivisionPage(1);
                }}
                className="ml-2 text-blue-600 underline"
              >
                Limpiar
              </button>
            </>
          )}
        </span>
        <span>
          Página {divisionPage} de {Math.max(totalDivisionPages, 1)}
        </span>
      </div>

      {/* Division List */}
      {loadingDivisions ? (
        <div className="flex min-h-48 items-center justify-center gap-3 rounded-2xl border border-slate-200 bg-slate-50 text-sm font-bold text-slate-500">
          <Loader2 className="animate-spin text-blue-600" size={24} />{" "}
          Cargando territorios…
        </div>
      ) : divisions.length === 0 ? (
        <div className="py-16 text-center">
          <MapPin className="mx-auto mb-3 text-slate-300" size={48} />
          <h3 className="text-lg font-bold text-slate-900">
            No hay{" "}
            {divisionType === "MUNICIPIO"
              ? "municipios"
              : divisionType === "ZONA"
                ? "zonas"
                : "puestos"}{" "}
            disponibles
          </h3>
          <p className="mt-1 text-sm text-slate-500">
            {territorySearch
              ? "Intenta con otro término de búsqueda."
              : "Sincroniza la geografía DANE desde la página de Territorio."}
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {divisions.map((div) => {
            const isExpanded = expandedId === div.id;
            const leaders = leadersByDivision[div.id];
            const isLoading = loadingLeaders === div.id;
            const filteredLeaders = leaders ? filterLeaders(leaders) : [];

            return (
              <div
                key={div.id}
                className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm"
              >
                {/* Division Header (clickable to expand) */}
                <button
                  type="button"
                  onClick={() => toggleExpand(div.id)}
                  className="flex w-full items-center gap-4 px-5 py-4 text-left transition-colors hover:bg-slate-50"
                >
                  <div
                    className={`rounded-lg p-2 ${isExpanded ? "bg-blue-600 text-white" : "bg-blue-50 text-blue-700"}`}
                  >
                    <MapPin size={18} />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <h3 className="truncate font-bold text-slate-900">
                        {div.name}
                      </h3>
                      <span className="shrink-0 rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-black uppercase tracking-wider text-slate-500">
                        {div.type}
                      </span>
                    </div>
                    <p className="text-xs text-slate-400">
                      Código {div.code}
                      {div.parent && <> · {div.parent.name}</>}
                    </p>
                  </div>
                  <div className="flex items-center gap-3">
                    {leaders && (
                      <span
                        className={`rounded-full px-2.5 py-1 text-xs font-bold ${
                          leaders.length > 0
                            ? "bg-green-50 text-green-700"
                            : "bg-slate-50 text-slate-400"
                        }`}
                      >
                        {leaders.length}{" "}
                        {leaders.length === 1 ? "líder" : "líderes"}
                      </span>
                    )}
                    {isExpanded ? (
                      <ChevronDown size={18} className="text-slate-400" />
                    ) : (
                      <ChevronRight size={18} className="text-slate-400" />
                    )}
                  </div>
                </button>

                {/* Expanded: Leaders List */}
                {isExpanded && (
                  <div className="border-t border-slate-100 bg-slate-50/50">
                    {/* Action bar */}
                    <div className="flex items-center justify-between border-b border-slate-100 px-5 py-3">
                      <p className="text-xs font-bold text-slate-500">
                        {isLoading
                          ? "Cargando líderes…"
                          : leaders
                            ? `${filteredLeaders.length} líder(es) encontrado(s)`
                            : ""}
                      </p>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          setSelectedDivision(div);
                        }}
                        className="inline-flex items-center gap-1.5 rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-bold text-white hover:bg-blue-700"
                      >
                        <UserPlus size={14} /> Agregar líder
                      </button>
                    </div>

                    {/* Loading state */}
                    {isLoading && (
                      <div className="flex items-center justify-center gap-2 py-8 text-sm text-slate-400">
                        <Loader2 className="animate-spin" size={16} /> Cargando…
                      </div>
                    )}

                    {/* No leaders */}
                    {!isLoading && leaders && filteredLeaders.length === 0 && (
                      <div className="py-8 text-center">
                        <Users className="mx-auto mb-2 text-slate-300" size={32} />
                        <p className="text-sm font-medium text-slate-500">
                          {leaders.length === 0
                            ? "Sin líderes asignados"
                            : "Ningún líder coincide con los filtros"}
                        </p>
                        <p className="mt-1 text-xs text-slate-400">
                          Usa el botón &ldquo;Agregar líder&rdquo; para asignar
                          uno.
                        </p>
                      </div>
                    )}

                    {/* Leaders list */}
                    {!isLoading && filteredLeaders.length > 0 && (
                      <div className="divide-y divide-slate-100">
                        {filteredLeaders.map((leader) => (
                          <div
                            key={leader.id}
                            className="px-5 py-4 transition-colors hover:bg-white"
                          >
                            <div className="flex items-start justify-between gap-4">
                              <div className="flex items-start gap-3">
                                <div className="mt-0.5 rounded-full bg-green-100 p-2 text-green-700">
                                  <Users size={14} />
                                </div>
                                <div>
                                  <p className="font-bold text-slate-900">
                                    {leader.name}
                                  </p>
                                  <p className="text-xs text-slate-500">
                                    {leader.roleDescription}
                                  </p>
                                  {leader.politicalAffinity && (
                                    <span className="mt-1 inline-block rounded-full bg-blue-50 px-2 py-0.5 text-[10px] font-bold text-blue-700">
                                      {leader.politicalAffinity}
                                    </span>
                                  )}
                                </div>
                              </div>
                            </div>

                            {/* Contact info */}
                            <div className="mt-2 ml-9 flex flex-wrap items-center gap-x-4 gap-y-1">
                              {leader.phone && (
                                <a
                                  href={`https://wa.me/57${leader.phone.replace(/\D/g, "")}`}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="flex items-center gap-1 text-xs text-emerald-600 hover:underline"
                                >
                                  <Phone size={12} /> {leader.phone}
                                </a>
                              )}
                              {leader.email && (
                                <a
                                  href={`mailto:${leader.email}`}
                                  className="flex items-center gap-1 text-xs text-blue-600 hover:underline"
                                >
                                  <Mail size={12} /> {leader.email}
                                </a>
                              )}
                              {leader.socialNetworkUrl && (
                                <a
                                  href={leader.socialNetworkUrl}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="flex items-center gap-1 text-xs text-purple-600 hover:underline"
                                >
                                  <Share2 size={12} /> Red social
                                </a>
                              )}
                            </div>

                            {/* Observations */}
                            {leader.observations && (
                              <p className="mt-2 ml-9 text-xs italic text-slate-400">
                                {leader.observations}
                              </p>
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Pagination */}
      {totalDivisionPages > 1 && (
        <nav
          aria-label="Paginación de territorios"
          className="flex justify-end gap-3"
        >
          <button
            type="button"
            disabled={divisionPage <= 1}
            onClick={() => setDivisionPage((p) => Math.max(1, p - 1))}
            className="inline-flex min-h-10 items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 text-xs font-black uppercase tracking-wider text-slate-700 disabled:opacity-40"
          >
            Anterior
          </button>
          <button
            type="button"
            disabled={divisionPage >= totalDivisionPages}
            onClick={() => setDivisionPage((p) => p + 1)}
            className="inline-flex min-h-10 items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 text-xs font-black uppercase tracking-wider text-slate-700 disabled:opacity-40"
          >
            Siguiente
          </button>
        </nav>
      )}

      {/* Footer note */}
      <p className="text-xs leading-5 text-slate-400">
        Los líderes territoriales se asignan por territorio operativo del
        tenant. Los datos de contacto (teléfono, correo, redes sociales) son
        gestionados internamente por la campaña y no se exponen públicamente.
      </p>

      {/* Create Leader Modal */}
      {selectedDivision && (
        <CreateLeaderModal
          divisionId={selectedDivision.id}
          divisionName={selectedDivision.name}
          onClose={() => setSelectedDivision(null)}
          onSuccess={() => {
            const divId = selectedDivision.id;
            setSelectedDivision(null);
            void loadLeaders(divId);
          }}
        />
      )}
    </div>
  );
}
