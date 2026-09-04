"use client";

import {
  FormEvent,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  AlertCircle,
  AlertTriangle,
  BarChart3,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  ClipboardList,
  FileCheck2,
  FileText,
  Loader2,
  MapPin,
  Plus,
  RefreshCw,
  Scale,
  Settings2,
  ShieldCheck,
  UploadCloud,
  Vote,
  X,
} from "lucide-react";
import { ApiError } from "@/lib/api-client";
import { useAuth } from "@/context/auth";
import { uploadFileDirectly } from "@/lib/direct-storage-upload";
import { openPrivateResource } from "@/lib/private-storage";
import type { BackendUserRole } from "@/types/saas-schema";
import {
  createWitnessReport,
  listVotingPlaces,
  listWitnessReports,
  reviewWitnessReport,
  updatePollingPlaceProfile,
  VotingPlace,
  VotingPlacePage,
  WitnessReport,
  WitnessReportPage,
  WitnessReportStatus,
} from "@/lib/election-api";

const EMPTY_FORM = {
  puestoId: "",
  mesa: "",
  candidateVotes: "",
  totalTableVotes: "",
  observations: "",
};

const E14_READ_ROLES = new Set<BackendUserRole>([
  "ADMIN",
  "CAMPAIGN_MANAGER",
  "COMPLIANCE_OFFICER",
  "AUDITOR",
  "ZONE_COORDINATOR",
  "WITNESS",
]);

const E14_REPORT_ROLES = new Set<BackendUserRole>([
  "ADMIN",
  "CAMPAIGN_MANAGER",
  "ZONE_COORDINATOR",
  "WITNESS",
]);

const E14_REVIEW_ROLES = new Set<BackendUserRole>([
  "ADMIN",
  "CAMPAIGN_MANAGER",
  "COMPLIANCE_OFFICER",
  "ZONE_COORDINATOR",
]);

const E14_PROFILE_ROLES = new Set<BackendUserRole>([
  "ADMIN",
  "CAMPAIGN_MANAGER",
]);

const PAGE_SIZE = 25;

const EMPTY_REPORT_PAGE: WitnessReportPage = {
  items: [],
  pagination: { page: 1, limit: PAGE_SIZE, total: 0, totalPages: 0 },
  summary: {
    totalReports: 0,
    pendingReports: 0,
    acceptedReports: 0,
    rejectedReports: 0,
    supersededReports: 0,
    pendingDivergences: 0,
    acceptedCandidateVotes: 0,
    acceptedTotalVotes: 0,
    coverage: {
      configuredPlaces: 0,
      totalPlaces: 0,
      acceptedTables: 0,
      expectedTables: null,
      percentage: null,
    },
  },
};

const STATUS_LABELS: Record<
  WitnessReportStatus,
  { label: string; className: string }
> = {
  PENDING: {
    label: "Pendiente",
    className: "border-amber-200 bg-amber-50 text-amber-800",
  },
  ACCEPTED: {
    label: "Aceptado",
    className: "border-emerald-200 bg-emerald-50 text-emerald-800",
  },
  REJECTED: {
    label: "Rechazado",
    className: "border-red-200 bg-red-50 text-red-800",
  },
  SUPERSEDED: {
    label: "Reemplazado",
    className: "border-slate-200 bg-slate-100 text-slate-700",
  },
};

type ReportFilters = {
  status: "" | WitnessReportStatus;
  puestoId: string;
  mesa: string;
};

const EMPTY_FILTERS: ReportFilters = { status: "", puestoId: "", mesa: "" };

function readableError(error: unknown, fallback: string): string {
  if (error instanceof ApiError) return error.message;
  if (error instanceof Error && error.message) return error.message;
  return fallback;
}

function formatNumber(value: number): string {
  return new Intl.NumberFormat("es-CO").format(value);
}

function formatDate(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Fecha no disponible";

  return new Intl.DateTimeFormat("es-CO", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}

function placeName(
  report: WitnessReport,
  placesById: ReadonlyMap<string, VotingPlace>,
): string {
  return (
    report.puesto?.name ??
    placesById.get(report.puestoId)?.name ??
    "Puesto no disponible"
  );
}

export default function WarRoomPage() {
  const { user } = useAuth();
  const canReadE14 = user !== null && E14_READ_ROLES.has(user.backendRole);
  const canReportE14 = user !== null && E14_REPORT_ROLES.has(user.backendRole);
  const canReviewE14 = user !== null && E14_REVIEW_ROLES.has(user.backendRole);
  const canConfigurePlaces =
    user !== null && E14_PROFILE_ROLES.has(user.backendRole);
  const [placesPage, setPlacesPage] = useState<VotingPlacePage>({
    items: [],
    pagination: { page: 1, limit: 50, total: 0, totalPages: 0 },
  });
  const [placePage, setPlacePage] = useState(1);
  const [placeSearchDraft, setPlaceSearchDraft] = useState("");
  const [placeSearch, setPlaceSearch] = useState("");
  const [reportPage, setReportPage] =
    useState<WitnessReportPage>(EMPTY_REPORT_PAGE);
  const [page, setPage] = useState(1);
  const [filterDraft, setFilterDraft] =
    useState<ReportFilters>(EMPTY_FILTERS);
  const [filters, setFilters] = useState<ReportFilters>(EMPTY_FILTERS);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [savingStep, setSavingStep] = useState<
    "uploading" | "reporting" | null
  >(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [e14File, setE14File] = useState<File | null>(null);
  const [openingReportId, setOpeningReportId] = useState<string | null>(null);
  const [reviewTarget, setReviewTarget] = useState<WitnessReport | null>(null);
  const [reviewDecision, setReviewDecision] = useState<
    "ACCEPTED" | "REJECTED"
  >("ACCEPTED");
  const [reviewReason, setReviewReason] = useState("");
  const [reviewSaving, setReviewSaving] = useState(false);
  const [profileTarget, setProfileTarget] = useState<VotingPlace | null>(null);
  const [expectedTables, setExpectedTables] = useState("");
  const [profileSaving, setProfileSaving] = useState(false);
  const dialogTitleRef = useRef<HTMLHeadingElement>(null);

  async function handleOpenReport(reportId: string) {
    setOpeningReportId(reportId);
    setActionError(null);
    try {
      await openPrivateResource("e14", reportId);
    } catch (error) {
      setActionError(
        readableError(error, "No fue posible abrir el acta privada."),
      );
    } finally {
      setOpeningReportId(null);
    }
  }

  const loadData = useCallback(async (signal?: AbortSignal) => {
    if (!canReadE14) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setLoadError(null);

    try {
      const [loadedPlaces, loadedReports] = await Promise.all([
        listVotingPlaces(
          { page: placePage, limit: 50, search: placeSearch || undefined },
          signal,
        ),
        listWitnessReports(
          {
            page,
            limit: PAGE_SIZE,
            ...(filters.status ? { status: filters.status } : {}),
            ...(filters.puestoId ? { puestoId: filters.puestoId } : {}),
            ...(filters.mesa ? { mesa: Number(filters.mesa) } : {}),
          },
          signal,
        ),
      ]);

      setPlacesPage(loadedPlaces);
      setReportPage(loadedReports);
      setForm((current) => {
        const selectedPlaceStillExists = loadedPlaces.items.some(
          (place) => place.id === current.puestoId,
        );

        return {
          ...current,
          puestoId: selectedPlaceStillExists
            ? current.puestoId
            : (loadedPlaces.items[0]?.id ?? ""),
        };
      });
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") return;
      setLoadError(
        readableError(
          error,
          "No fue posible consultar los puestos y reportes electorales.",
        ),
      );
    } finally {
      if (!signal?.aborted) setLoading(false);
    }
  }, [canReadE14, filters, page, placePage, placeSearch]);

  useEffect(() => {
    const controller = new AbortController();
    void loadData(controller.signal);
    return () => controller.abort();
  }, [loadData]);

  useEffect(() => {
    if (!dialogOpen) return;

    const previousActiveElement = document.activeElement as HTMLElement | null;
    dialogTitleRef.current?.focus();

    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !savingStep) setDialogOpen(false);
    };

    window.addEventListener("keydown", closeOnEscape);
    return () => {
      window.removeEventListener("keydown", closeOnEscape);
      previousActiveElement?.focus();
    };
  }, [dialogOpen, savingStep]);

  const places = placesPage.items;
  const reports = reportPage.items;
  const summary = reportPage.summary;
  const placesById = useMemo(
    () => new Map(places.map((place) => [place.id, place])),
    [places],
  );
  const metrics = {
    reports: summary.acceptedReports,
    candidateVotes: summary.acceptedCandidateVotes,
    totalVotes: summary.acceptedTotalVotes,
  };

  function openReportDialog(puestoId?: string) {
    if (!canReportE14 || places.length === 0) return;

    setFormError(null);
    setNotice(null);
    setForm((current) => ({
      ...current,
      puestoId: puestoId ?? current.puestoId ?? places[0].id,
    }));
    setDialogOpen(true);
  }

  function closeReportDialog() {
    if (savingStep) return;
    setDialogOpen(false);
    setFormError(null);
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFormError(null);

    const mesa = Number(form.mesa);
    const candidateVotes = Number(form.candidateVotes);
    const totalTableVotes = Number(form.totalTableVotes);

    if (!placesById.has(form.puestoId)) {
      setFormError("Selecciona un puesto de votación disponible.");
      return;
    }

    const configuredTables = placesById.get(form.puestoId)?.expectedTables;
    if (configuredTables && mesa > configuredTables) {
      setFormError(
        `Este puesto tiene ${configuredTables} mesas esperadas. Verifica el numero de mesa.`,
      );
      return;
    }

    if (
      !Number.isInteger(mesa) ||
      mesa < 1 ||
      !Number.isInteger(candidateVotes) ||
      candidateVotes < 0 ||
      !Number.isInteger(totalTableVotes) ||
      totalTableVotes < 0
    ) {
      setFormError(
        "Mesa y votos deben ser números enteros dentro de los rangos permitidos.",
      );
      return;
    }

    if (candidateVotes > totalTableVotes) {
      setFormError(
        "Los votos del candidato no pueden superar el total de votos de la mesa.",
      );
      return;
    }

    if (!e14File) {
      setFormError(
        "Adjunta el acta E-14 en PDF o imagen antes de enviar el reporte.",
      );
      return;
    }

    try {
      setSavingStep("uploading");
      const upload = await uploadFileDirectly(e14File, "e14");

      setSavingStep("reporting");
      await createWitnessReport({
        puestoId: form.puestoId,
        mesa,
        candidateVotes,
        totalTableVotes,
        e14ImageUrl: upload.path,
        ...(form.observations.trim()
          ? { observations: form.observations.trim() }
          : {}),
      });

      setForm({
        ...EMPTY_FORM,
        puestoId: places[0]?.id ?? "",
      });
      setE14File(null);
      setDialogOpen(false);
      setNotice(
        "Reporte E-14 radicado como pendiente. Sus votos solo contaran despues de una revision independiente.",
      );
      if (page === 1) await loadData();
      else setPage(1);
    } catch (error) {
      setFormError(
        readableError(error, "No fue posible registrar el reporte E-14."),
      );
    } finally {
      setSavingStep(null);
    }
  }

  function applyFilters(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const mesa = filterDraft.mesa.trim();
    if (mesa && (!Number.isInteger(Number(mesa)) || Number(mesa) < 1)) {
      setActionError("La mesa del filtro debe ser un entero positivo.");
      return;
    }
    setActionError(null);
    setPage(1);
    setFilters({ ...filterDraft, mesa });
  }

  function clearFilters() {
    setFilterDraft(EMPTY_FILTERS);
    setFilters(EMPTY_FILTERS);
    setPage(1);
  }

  function searchPlaces(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPlacePage(1);
    setPlaceSearch(placeSearchDraft.trim());
  }

  function clearPlaceSearch() {
    setPlaceSearchDraft("");
    setPlaceSearch("");
    setPlacePage(1);
  }

  function openReviewDialog(report: WitnessReport) {
    if (!canReviewE14 || report.status !== "PENDING") return;
    setActionError(null);
    setReviewTarget(report);
    setReviewDecision("ACCEPTED");
    setReviewReason("");
  }

  async function handleReview(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!reviewTarget) return;
    const reason = reviewReason.trim();
    if (reason.length < 10) {
      setActionError("El motivo de revision debe tener al menos 10 caracteres.");
      return;
    }

    setReviewSaving(true);
    setActionError(null);
    try {
      await reviewWitnessReport(reviewTarget.id, {
        status: reviewDecision,
        reviewReason: reason,
      });
      setReviewTarget(null);
      setNotice(
        reviewDecision === "ACCEPTED"
          ? "Reporte aceptado. Esta es ahora la unica lectura que alimenta las metricas de la mesa."
          : "Reporte rechazado con motivo registrado en la auditoria.",
      );
      await loadData();
    } catch (error) {
      setActionError(
        readableError(error, "No fue posible registrar la revision E-14."),
      );
    } finally {
      setReviewSaving(false);
    }
  }

  function openProfileDialog(place: VotingPlace) {
    if (!canConfigurePlaces) return;
    setActionError(null);
    setProfileTarget(place);
    setExpectedTables(place.expectedTables?.toString() ?? "");
  }

  async function handleProfile(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!profileTarget) return;
    const value = Number(expectedTables);
    if (!Number.isInteger(value) || value < 1 || value > 99_999) {
      setActionError("Las mesas esperadas deben ser un entero entre 1 y 99.999.");
      return;
    }

    setProfileSaving(true);
    setActionError(null);
    try {
      await updatePollingPlaceProfile(profileTarget.id, value);
      setProfileTarget(null);
      setNotice(`Perfil electoral actualizado: ${value} mesas esperadas.`);
      await loadData();
    } catch (error) {
      setActionError(
        readableError(error, "No fue posible actualizar el perfil del puesto."),
      );
    } finally {
      setProfileSaving(false);
    }
  }

  return (
    <div className="mx-auto max-w-7xl space-y-7">
      <header className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <div className="mb-3 inline-flex items-center gap-2 rounded-full border border-blue-100 bg-blue-50 px-3 py-1 text-xs font-black uppercase tracking-wider text-blue-700">
            <ShieldCheck aria-hidden="true" size={14} /> Reportes verificables
          </div>
          <h1 className="text-3xl font-black tracking-tight text-slate-950 sm:text-4xl">
            Control de reportes E-14
          </h1>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">
            Concilia lecturas independientes por mesa. Solo las actas aceptadas
            alimentan los resultados y la cobertura del tablero.
          </p>
        </div>
        <div className="flex flex-col gap-3 sm:flex-row">
          <button
            type="button"
            onClick={() => void loadData()}
            disabled={loading}
            className="inline-flex min-h-12 items-center justify-center gap-2 rounded-2xl border border-slate-200 bg-white px-5 text-sm font-black text-slate-700 transition hover:border-blue-300 disabled:opacity-50"
          >
            <RefreshCw
              aria-hidden="true"
              className={loading ? "animate-spin" : ""}
              size={17}
            />
            Actualizar
          </button>
          {canReportE14 && (
            <button
              type="button"
              onClick={() => openReportDialog()}
              disabled={loading || places.length === 0}
              className="inline-flex min-h-12 items-center justify-center gap-2 rounded-2xl bg-blue-700 px-5 text-sm font-black text-white shadow-lg shadow-blue-900/10 transition hover:bg-blue-800 disabled:cursor-not-allowed disabled:opacity-45"
            >
              <Plus aria-hidden="true" size={18} /> Registrar E-14
            </button>
          )}
        </div>
      </header>

      {notice && (
        <div
          aria-live="polite"
          className="flex items-center justify-between gap-4 rounded-2xl border border-emerald-200 bg-emerald-50 px-5 py-4 text-sm font-semibold text-emerald-900"
        >
          <span className="inline-flex items-center gap-2">
            <CheckCircle2 aria-hidden="true" size={19} /> {notice}
          </span>
          <button
            type="button"
            onClick={() => setNotice(null)}
            aria-label="Cerrar confirmación"
          >
            <X aria-hidden="true" size={18} />
          </button>
        </div>
      )}

      {actionError && (
        <div
          role="alert"
          className="flex items-center justify-between gap-4 rounded-2xl border border-red-200 bg-red-50 px-5 py-4 text-sm font-semibold text-red-900"
        >
          <span className="inline-flex items-center gap-2">
            <AlertCircle aria-hidden="true" size={19} /> {actionError}
          </span>
          <button
            type="button"
            onClick={() => setActionError(null)}
            aria-label="Cerrar error"
          >
            <X aria-hidden="true" size={18} />
          </button>
        </div>
      )}

      {!canReadE14 ? (
        <div
          role="alert"
          className="rounded-3xl border border-amber-200 bg-amber-50 p-8 text-center text-sm text-amber-950"
        >
          Tu rol no tiene acceso al modulo de conciliacion E-14.
        </div>
      ) : loading ? (
        <div
          role="status"
          className="flex min-h-96 flex-col items-center justify-center gap-3 rounded-3xl border border-slate-200 bg-white text-sm font-semibold text-slate-500"
        >
          <Loader2
            aria-hidden="true"
            className="animate-spin text-blue-700"
            size={30}
          />
          Consultando puestos y reportes reales…
        </div>
      ) : loadError ? (
        <div
          role="alert"
          className="flex min-h-80 flex-col items-center justify-center gap-4 rounded-3xl border border-red-200 bg-red-50 p-8 text-center"
        >
          <AlertCircle aria-hidden="true" className="text-red-600" size={34} />
          <div>
            <h2 className="font-black text-slate-950">
              No pudimos cargar el control electoral
            </h2>
            <p className="mt-1 max-w-xl text-sm text-slate-600">{loadError}</p>
          </div>
          <button
            type="button"
            onClick={() => void loadData()}
            className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-slate-950 px-5 text-sm font-black text-white hover:bg-blue-800"
          >
            <RefreshCw aria-hidden="true" size={16} /> Reintentar
          </button>
        </div>
      ) : (
        <>
          <section
            aria-label="Métricas de reportes"
            className="grid gap-4 md:grid-cols-2 xl:grid-cols-4"
          >
            <article className="rounded-3xl bg-slate-950 p-6 text-white shadow-xl">
              <FileCheck2
                aria-hidden="true"
                className="text-blue-300"
                size={24}
              />
              <p className="mt-5 text-xs font-black uppercase tracking-wider text-slate-400">
                Actas conciliadas
              </p>
              <p
                data-testid="reports-metric"
                className="mt-2 text-4xl font-black tracking-tight"
              >
                {formatNumber(metrics.reports)}
              </p>
              <p className="mt-2 text-xs text-slate-400">
                Reportes aceptados por revisión independiente
              </p>
            </article>
            <article className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
              <Vote aria-hidden="true" className="text-blue-700" size={24} />
              <p className="mt-5 text-xs font-black uppercase tracking-wider text-slate-400">
                Votos del candidato
              </p>
              <p
                data-testid="candidate-votes-metric"
                className="mt-2 text-4xl font-black tracking-tight text-slate-950"
              >
                {formatNumber(metrics.candidateVotes)}
              </p>
              <p className="mt-2 text-xs text-slate-500">
                Sólo actas aceptadas
              </p>
            </article>
            <article className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
              <BarChart3
                aria-hidden="true"
                className="text-emerald-700"
                size={24}
              />
              <p className="mt-5 text-xs font-black uppercase tracking-wider text-slate-400">
                Votos totales
              </p>
              <p
                data-testid="total-votes-metric"
                className="mt-2 text-4xl font-black tracking-tight text-slate-950"
              >
                {formatNumber(metrics.totalVotes)}
              </p>
              <p className="mt-2 text-xs text-slate-500">
                Sólo actas aceptadas
              </p>
            </article>
            <article className="rounded-3xl border border-amber-200 bg-amber-50 p-6 shadow-sm">
              <AlertTriangle
                aria-hidden="true"
                className="text-amber-700"
                size={24}
              />
              <p className="mt-5 text-xs font-black uppercase tracking-wider text-amber-700">
                Divergencias pendientes
              </p>
              <p
                data-testid="divergences-metric"
                className="mt-2 text-4xl font-black tracking-tight text-slate-950"
              >
                {formatNumber(summary.pendingDivergences)}
              </p>
              <p className="mt-2 text-xs text-amber-800">
                Mesas con lecturas distintas por resolver
              </p>
            </article>
          </section>

          <div
            data-testid="coverage-summary"
            className={`flex items-start gap-3 rounded-2xl border p-4 text-sm ${
              summary.coverage.percentage === null
                ? "border-amber-200 bg-amber-50 text-amber-950"
                : "border-blue-200 bg-blue-50 text-blue-950"
            }`}
          >
            {summary.coverage.percentage === null ? (
              <AlertCircle
                aria-hidden="true"
                className="mt-0.5 shrink-0 text-amber-700"
                size={19}
              />
            ) : (
              <Scale
                aria-hidden="true"
                className="mt-0.5 shrink-0 text-blue-700"
                size={19}
              />
            )}
            <p>
              {summary.coverage.percentage === null ? (
                <>
                  <strong>Cobertura pendiente de parametrizar.</strong>{" "}
                  {formatNumber(summary.coverage.configuredPlaces)} de{" "}
                  {formatNumber(summary.coverage.totalPlaces)} puestos tienen
                  definido su número esperado de mesas. La plataforma no
                  inventa porcentajes cuando falta esa base.
                </>
              ) : (
                <>
                  <strong>
                    Cobertura conciliada: {summary.coverage.percentage}%.
                  </strong>{" "}
                  {formatNumber(summary.coverage.acceptedTables)} de{" "}
                  {formatNumber(summary.coverage.expectedTables ?? 0)} mesas
                  esperadas cuentan con un acta aceptada.
                </>
              )}
            </p>
          </div>

          <section aria-labelledby="places-heading" className="space-y-4">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
              <div>
                <h2
                  id="places-heading"
                  className="text-xl font-black text-slate-950"
                >
                  Puestos de votación
                </h2>
                <p className="mt-1 text-sm text-slate-500">
                  {formatNumber(placesPage.pagination.total)} puestos
                  encontrados. La consulta se pagina en el servidor para operar
                  con el censo nacional completo.
                </p>
              </div>
              <form
                role="search"
                aria-label="Buscar puesto de votación"
                onSubmit={searchPlaces}
                className="flex w-full max-w-xl gap-2"
              >
                <label className="sr-only" htmlFor="place-search">
                  Código o nombre del puesto
                </label>
                <input
                  id="place-search"
                  type="search"
                  value={placeSearchDraft}
                  onChange={(event) => setPlaceSearchDraft(event.target.value)}
                  placeholder="Código o nombre del puesto"
                  maxLength={100}
                  className="min-h-11 min-w-0 flex-1 rounded-xl border border-slate-200 bg-white px-4 text-sm outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-100"
                />
                <button
                  type="submit"
                  className="min-h-11 rounded-xl bg-slate-950 px-4 text-sm font-black text-white hover:bg-blue-800"
                >
                  Buscar
                </button>
                {placeSearch && (
                  <button
                    type="button"
                    onClick={clearPlaceSearch}
                    className="min-h-11 rounded-xl border border-slate-200 bg-white px-4 text-sm font-black text-slate-700 hover:bg-slate-50"
                  >
                    Limpiar
                  </button>
                )}
              </form>
            </div>

            {places.length === 0 ? (
              <div className="rounded-3xl border border-amber-200 bg-amber-50 p-8 text-center">
                <MapPin
                  aria-hidden="true"
                  className="mx-auto text-amber-600"
                  size={40}
                />
                <h3 className="mt-4 text-xl font-black text-slate-950">
                  {placeSearch
                    ? "No encontramos puestos con esa búsqueda"
                    : "No hay puestos de votación configurados"}
                </h3>
                <p className="mx-auto mt-2 max-w-2xl text-sm leading-6 text-slate-600">
                  {placeSearch
                    ? "Prueba otro código o nombre para continuar."
                    : "Una persona administradora debe crear puestos territoriales antes de registrar reportes E-14."}
                </p>
              </div>
            ) : (
              <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                {places.map((place) => (
                  <article
                    key={place.id}
                    data-testid={`place-card-${place.id}`}
                    className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <span className="rounded-xl bg-blue-50 p-2 text-blue-700">
                        <MapPin aria-hidden="true" size={20} />
                      </span>
                      <span className="font-mono text-xs font-black text-slate-400">
                        {place.code}
                      </span>
                    </div>
                    <h3 className="mt-4 font-black text-slate-950">
                      {place.name}
                    </h3>
                    {place.parent && (
                      <p className="mt-1 text-xs text-slate-500">
                        {place.parent.name}
                      </p>
                    )}
                    <div className="mt-5 flex items-center justify-between gap-3 border-t border-slate-100 pt-4">
                      <div>
                        <p className="text-[10px] font-black uppercase tracking-wider text-slate-400">
                          Mesas esperadas
                        </p>
                        <p className="mt-1 text-sm font-black text-slate-900">
                          {place.expectedTables === null
                            ? "Sin parametrizar"
                            : formatNumber(place.expectedTables)}
                        </p>
                      </div>
                      {canConfigurePlaces && (
                        <button
                          type="button"
                          onClick={() => openProfileDialog(place)}
                          aria-label={`Configurar mesas esperadas de ${place.name}`}
                          className="inline-flex min-h-10 items-center gap-2 rounded-xl border border-slate-200 px-3 text-xs font-black text-slate-700 hover:border-blue-300 hover:text-blue-800"
                        >
                          <Settings2 aria-hidden="true" size={15} /> Configurar
                        </button>
                      )}
                    </div>
                    {canReportE14 && (
                      <button
                        type="button"
                        onClick={() => openReportDialog(place.id)}
                        className="mt-4 min-h-11 w-full rounded-xl bg-slate-950 px-4 text-sm font-black text-white transition hover:bg-blue-800"
                      >
                        Reportar mesa
                      </button>
                    )}
                  </article>
                ))}
              </div>
            )}

            {placesPage.pagination.totalPages > 1 && (
              <nav
                aria-label="Paginación de puestos"
                className="flex items-center justify-between rounded-2xl border border-slate-200 bg-white px-4 py-3"
              >
                <button
                  type="button"
                  disabled={placePage <= 1}
                  onClick={() => setPlacePage((current) => current - 1)}
                  className="inline-flex min-h-10 items-center gap-1 rounded-xl px-3 text-sm font-black text-slate-700 hover:bg-slate-100 disabled:opacity-40"
                >
                  <ChevronLeft aria-hidden="true" size={16} /> Anterior
                </button>
                <span className="text-xs font-bold text-slate-500">
                  Página {placesPage.pagination.page} de{" "}
                  {placesPage.pagination.totalPages}
                </span>
                <button
                  type="button"
                  disabled={placePage >= placesPage.pagination.totalPages}
                  onClick={() => setPlacePage((current) => current + 1)}
                  className="inline-flex min-h-10 items-center gap-1 rounded-xl px-3 text-sm font-black text-slate-700 hover:bg-slate-100 disabled:opacity-40"
                >
                  Siguiente <ChevronRight aria-hidden="true" size={16} />
                </button>
              </nav>
            )}
          </section>

          <section
            aria-labelledby="reports-heading"
            className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm"
          >
            <header className="border-b border-slate-100 bg-slate-50/60 px-6 py-5">
              <h2 id="reports-heading" className="font-black text-slate-950">
                Reportes registrados
              </h2>
              <p className="mt-1 text-xs text-slate-500">
                La ruta privada del acta nunca se expone en esta vista.
              </p>
            </header>
            {reports.length === 0 ? (
              <div className="px-6 py-16 text-center">
                <ClipboardList
                  aria-hidden="true"
                  className="mx-auto text-slate-300"
                  size={42}
                />
                <h3 className="mt-4 font-black text-slate-950">
                  Aún no hay reportes E-14
                </h3>
                <p className="mt-1 text-sm text-slate-500">
                  Las métricas permanecerán en cero hasta recibir el primer
                  reporte real.
                </p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[820px] text-left text-sm">
                  <thead className="bg-white text-xs font-black uppercase tracking-wider text-slate-400">
                    <tr>
                      <th className="px-6 py-4">Puesto / mesa</th>
                      <th className="px-6 py-4">Testigo</th>
                      <th className="px-6 py-4 text-right">Votos candidato</th>
                      <th className="px-6 py-4 text-right">Votos totales</th>
                      <th className="px-6 py-4">Soporte</th>
                      <th className="px-6 py-4">Fecha</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {reports.map((report) => (
                      <tr
                        key={report.id}
                        data-testid={`report-row-${report.id}`}
                        className="hover:bg-slate-50/70"
                      >
                        <td className="px-6 py-5">
                          <p className="font-black text-slate-900">
                            {placeName(report, placesById)}
                          </p>
                          <p className="mt-1 text-xs text-slate-500">
                            Mesa {report.mesa}
                          </p>
                        </td>
                        <td className="px-6 py-5 font-semibold text-slate-600">
                          {report.witness?.name ?? "Testigo autenticado"}
                        </td>
                        <td className="px-6 py-5 text-right font-black text-blue-800">
                          {formatNumber(report.candidateVotes)}
                        </td>
                        <td className="px-6 py-5 text-right font-black text-slate-900">
                          {formatNumber(report.totalTableVotes)}
                        </td>
                        <td className="px-6 py-5">
                          <div className="flex flex-col items-start gap-2">
                            <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-3 py-1 text-xs font-black text-emerald-800">
                              <FileCheck2 aria-hidden="true" size={14} />{" "}
                              Privado confirmado
                            </span>
                            {canReadE14 && (
                              <button
                                type="button"
                                disabled={openingReportId === report.id}
                                onClick={() => void handleOpenReport(report.id)}
                                className="inline-flex items-center gap-1.5 rounded-lg border border-blue-200 bg-blue-50 px-3 py-1.5 text-[10px] font-black uppercase tracking-wider text-blue-800 hover:bg-blue-100 disabled:opacity-60"
                              >
                                {openingReportId === report.id ? (
                                  <Loader2
                                    aria-hidden="true"
                                    className="animate-spin"
                                    size={12}
                                  />
                                ) : (
                                  <FileText aria-hidden="true" size={12} />
                                )}
                                Ver acta
                              </button>
                            )}
                          </div>
                        </td>
                        <td className="px-6 py-5 text-xs text-slate-500">
                          {formatDate(report.createdAt)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </>
      )}

      {dialogOpen && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-slate-950/70 p-4 backdrop-blur-sm">
          <section
            role="dialog"
            aria-modal="true"
            aria-labelledby="e14-dialog-title"
            className="max-h-[94vh] w-full max-w-2xl overflow-y-auto rounded-3xl bg-white shadow-2xl"
          >
            <header className="sticky top-0 z-10 flex items-start justify-between gap-4 border-b border-slate-100 bg-white px-6 py-5">
              <div>
                <h2
                  id="e14-dialog-title"
                  ref={dialogTitleRef}
                  tabIndex={-1}
                  className="text-xl font-black text-slate-950 outline-none"
                >
                  Registrar reporte de mesa
                </h2>
                <p className="mt-1 text-sm text-slate-500">
                  El acta se carga directamente al almacenamiento privado.
                </p>
              </div>
              <button
                type="button"
                onClick={closeReportDialog}
                disabled={Boolean(savingStep)}
                aria-label="Cerrar formulario"
                className="rounded-full p-2 text-slate-500 hover:bg-slate-100 disabled:opacity-50"
              >
                <X aria-hidden="true" size={21} />
              </button>
            </header>
            <form onSubmit={handleSubmit} className="space-y-5 p-6">
              {formError && (
                <div
                  role="alert"
                  className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm font-semibold text-red-800"
                >
                  {formError}
                </div>
              )}
              <div className="grid gap-5 sm:grid-cols-2">
                <label className="text-sm font-black text-slate-800 sm:col-span-2">
                  Puesto de votación
                  <select
                    required
                    value={form.puestoId}
                    onChange={(event) =>
                      setForm((current) => ({
                        ...current,
                        puestoId: event.target.value,
                      }))
                    }
                    className="mt-2 min-h-12 w-full rounded-2xl border border-slate-200 bg-white px-4 font-normal outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-100"
                  >
                    <option value="" disabled>
                      Seleccionar puesto
                    </option>
                    {places.map((place) => (
                      <option key={place.id} value={place.id}>
                        {place.code} · {place.name}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="text-sm font-black text-slate-800">
                  Número de mesa
                  <input
                    required
                    type="number"
                    min={1}
                    step={1}
                    inputMode="numeric"
                    value={form.mesa}
                    onChange={(event) =>
                      setForm((current) => ({
                        ...current,
                        mesa: event.target.value,
                      }))
                    }
                    className="mt-2 min-h-12 w-full rounded-2xl border border-slate-200 px-4 font-normal outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-100"
                  />
                </label>
                <div aria-hidden="true" className="hidden sm:block" />
                <label className="text-sm font-black text-slate-800">
                  Votos del candidato
                  <input
                    required
                    type="number"
                    min={0}
                    step={1}
                    inputMode="numeric"
                    value={form.candidateVotes}
                    onChange={(event) =>
                      setForm((current) => ({
                        ...current,
                        candidateVotes: event.target.value,
                      }))
                    }
                    className="mt-2 min-h-12 w-full rounded-2xl border border-blue-200 px-4 font-normal text-blue-900 outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-100"
                  />
                </label>
                <label className="text-sm font-black text-slate-800">
                  Votos totales de la mesa
                  <input
                    required
                    type="number"
                    min={0}
                    step={1}
                    inputMode="numeric"
                    value={form.totalTableVotes}
                    onChange={(event) =>
                      setForm((current) => ({
                        ...current,
                        totalTableVotes: event.target.value,
                      }))
                    }
                    className="mt-2 min-h-12 w-full rounded-2xl border border-slate-200 px-4 font-normal outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-100"
                  />
                </label>
              </div>
              <label className="block text-sm font-black text-slate-800">
                Observaciones{" "}
                <span className="font-normal text-slate-400">(opcional)</span>
                <textarea
                  rows={3}
                  maxLength={1000}
                  value={form.observations}
                  onChange={(event) =>
                    setForm((current) => ({
                      ...current,
                      observations: event.target.value,
                    }))
                  }
                  className="mt-2 w-full rounded-2xl border border-slate-200 px-4 py-3 font-normal outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-100"
                />
              </label>
              <label className="block text-sm font-black text-slate-800">
                Acta E-14 privada
                <span className="mt-2 flex min-h-20 cursor-pointer items-center gap-3 rounded-2xl border border-dashed border-blue-300 bg-blue-50/60 px-4 py-4 font-normal text-slate-700 transition hover:bg-blue-50">
                  <UploadCloud
                    aria-hidden="true"
                    className="shrink-0 text-blue-700"
                    size={24}
                  />
                  <span>
                    <strong className="block text-sm">
                      {e14File?.name ?? "Seleccionar PDF o imagen"}
                    </strong>
                    <span className="mt-1 block text-xs text-slate-500">
                      El archivo no atraviesa el servidor NestJS.
                    </span>
                  </span>
                  <input
                    required
                    type="file"
                    accept=".pdf,.jpg,.jpeg,.png,.webp,application/pdf,image/jpeg,image/png,image/webp"
                    className="sr-only"
                    onChange={(event) =>
                      setE14File(event.target.files?.[0] ?? null)
                    }
                  />
                </span>
              </label>
              <div className="flex items-start gap-3 rounded-2xl border border-slate-200 bg-slate-50 p-4 text-xs leading-5 text-slate-600">
                <FileText
                  aria-hidden="true"
                  className="mt-0.5 shrink-0 text-slate-500"
                  size={17}
                />
                Sólo se enviará a la API la ruta privada confirmada del E-14
                junto con los datos numéricos del reporte.
              </div>
              <div className="flex flex-col-reverse gap-3 border-t border-slate-100 pt-5 sm:flex-row sm:justify-end">
                <button
                  type="button"
                  onClick={closeReportDialog}
                  disabled={Boolean(savingStep)}
                  className="min-h-11 rounded-xl border border-slate-200 px-5 text-sm font-black text-slate-700 hover:bg-slate-50 disabled:opacity-50"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={Boolean(savingStep)}
                  className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-blue-700 px-6 text-sm font-black text-white hover:bg-blue-800 disabled:opacity-60"
                >
                  {savingStep ? (
                    <Loader2
                      aria-hidden="true"
                      className="animate-spin"
                      size={17}
                    />
                  ) : (
                    <ShieldCheck aria-hidden="true" size={17} />
                  )}
                  {savingStep === "uploading"
                    ? "Subiendo acta…"
                    : savingStep === "reporting"
                      ? "Guardando reporte…"
                      : "Enviar reporte"}
                </button>
              </div>
            </form>
          </section>
        </div>
      )}
    </div>
  );
}
