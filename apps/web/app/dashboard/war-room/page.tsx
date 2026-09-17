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
  LockKeyhole,
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
import { uploadFileDirectlyWithClientDeclaredHash } from "@/lib/direct-storage-upload";
import { OFFLINE_VAULT_OPEN_EVENT } from "@/lib/offline-vault";
import { openPrivateResource } from "@/lib/private-storage";
import type {
  BackendUserRole,
  PoliticalOperationStage,
} from "@/types/saas-schema";
import {
  canConfigurePollingPlaces,
  canPersistE14,
} from "@/lib/e14-stage-policy";
import {
  createWitnessReport,
  type ActiveWitnessCaptureContext,
  E14_FORM_LABELS,
  hasCompleteWitnessTraceability,
  listVotingPlaces,
  listWitnessReports,
  MAX_WITNESS_REPORT_MESA,
  MAX_WITNESS_REPORT_VOTES,
  MIN_WITNESS_REPORT_MESA,
  reviewWitnessReport,
  updatePollingPlaceProfile,
  validateWitnessReportMesaFilter,
  validateWitnessVoteBreakdown,
  VotingPlace,
  VotingPlacePage,
  WITNESS_CREDENTIAL_LABELS,
  WITNESS_RECLAMATION_GROUND_LABELS,
  E14FormType,
  WitnessCredentialType,
  WitnessCaptureContext,
  WitnessReclamationGround,
  WitnessReport,
  WitnessReportPage,
  WitnessReportStatus,
  WITNESS_CHECK_IN_CLOCK_SKEW_MS,
} from "@/lib/election-api";

type ReportFormState = {
  puestoId: string;
  mesa: string;
  credentialType: WitnessCredentialType;
  credentialReference: string;
  checkedInAt: string;
  e14FormType: E14FormType;
  candidateVotes: string;
  blankVotes: string;
  nullVotes: string;
  unmarkedVotes: string;
  totalTableVotes: string;
  hasWrittenClaim: boolean;
  reclamationGround: "" | WitnessReclamationGround;
  reclamationDescription: string;
  observations: string;
};

const EMPTY_FORM: ReportFormState = {
  puestoId: "",
  mesa: "",
  credentialType: "E15",
  credentialReference: "",
  checkedInAt: "",
  e14FormType: "DELEGADOS",
  candidateVotes: "",
  blankVotes: "",
  nullVotes: "",
  unmarkedVotes: "",
  totalTableVotes: "",
  hasWrittenClaim: false,
  reclamationGround: "",
  reclamationDescription: "",
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

function emptyReportPage(
  captureContext: ActiveWitnessCaptureContext,
): WitnessReportPage {
  return {
    captureContext,
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
}

function expectedCaptureContextForStage(
  stage: PoliticalOperationStage | null | undefined,
): ActiveWitnessCaptureContext | null {
  if (stage === "SIMULATION") return "SIMULATION";
  if (
    stage === "ELECTION_DAY" ||
    stage === "POST_ELECTION" ||
    stage === "CLOSED"
  ) {
    return "REAL";
  }
  return null;
}

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

const CAPTURE_CONTEXT_LABELS: Record<
  WitnessCaptureContext,
  { short: string; detail: string; className: string }
> = {
  SIMULATION: {
    short: "SIMULACRO",
    detail: "Datos de ensayo aislados; nunca alimentan el resultado real.",
    className: "border-amber-300 bg-amber-100 text-amber-950",
  },
  REAL: {
    short: "OPERACIÓN REAL",
    detail: "Datos electorales reales; no incluyen capturas de simulacro.",
    className: "border-emerald-300 bg-emerald-100 text-emerald-950",
  },
  LEGACY_UNCLASSIFIED: {
    short: "LEGADO SIN CLASIFICAR",
    detail: "Registro histórico en cuarentena; no cuenta como resultado real.",
    className: "border-slate-300 bg-slate-100 text-slate-800",
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

function readableLoadError(error: unknown): string {
  if (error instanceof ApiError) {
    if (error.status === 0) return error.message;
    if (error.status === 400) {
      return "Los filtros electorales no son válidos. Corrígelos o límpialos para volver a consultar.";
    }
    if (error.status === 401) {
      return "Tu sesión venció. Inicia sesión nuevamente para consultar los reportes.";
    }
    if (error.status === 403) {
      return "Tu rol no tiene permiso para consultar estos reportes electorales.";
    }
    if (error.status >= 500) {
      return "El servidor no pudo consultar los reportes electorales. Intenta nuevamente en unos minutos.";
    }
  }

  return "No fue posible consultar los puestos y reportes electorales.";
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

function localDateTimeInputValue(date = new Date()): string {
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 16);
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
  const { tenant, user } = useAuth();
  const operationStage = tenant?.operationStage;
  const isE14PersistenceAllowed = canPersistE14(operationStage);
  const isPollingPlaceConfigurationAllowed =
    canConfigurePollingPlaces(operationStage);
  const canReadE14 = user !== null && E14_READ_ROLES.has(user.backendRole);
  const canReportE14 =
    isE14PersistenceAllowed &&
    user !== null &&
    E14_REPORT_ROLES.has(user.backendRole);
  const canReviewE14 =
    isE14PersistenceAllowed &&
    user !== null &&
    E14_REVIEW_ROLES.has(user.backendRole);
  const canConfigurePlaces =
    isPollingPlaceConfigurationAllowed &&
    user !== null &&
    E14_PROFILE_ROLES.has(user.backendRole);
  const [placesPage, setPlacesPage] = useState<VotingPlacePage>({
    items: [],
    evaluatedAt: new Date(0).toISOString(),
    pagination: { page: 1, limit: 50, total: 0, totalPages: 0 },
  });
  const [placePage, setPlacePage] = useState(1);
  const [placeSearchDraft, setPlaceSearchDraft] = useState("");
  const [placeSearch, setPlaceSearch] = useState("");
  const initialCaptureContext =
    expectedCaptureContextForStage(operationStage) ?? "REAL";
  const [reportPage, setReportPage] = useState<WitnessReportPage>(() =>
    emptyReportPage(initialCaptureContext),
  );
  const [reportSnapshotStage, setReportSnapshotStage] =
    useState<PoliticalOperationStage | null>(null);
  const [page, setPage] = useState(1);
  const [filterDraft, setFilterDraft] = useState<ReportFilters>(EMPTY_FILTERS);
  const [filters, setFilters] = useState<ReportFilters>(EMPTY_FILTERS);
  const [loading, setLoading] = useState(true);
  const [loadFailure, setLoadFailure] = useState<{
    stage: PoliticalOperationStage | null;
    message: string;
    status: number | null;
  } | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [filterError, setFilterError] = useState<string | null>(null);
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
  const [reviewDecision, setReviewDecision] = useState<"ACCEPTED" | "REJECTED">(
    "ACCEPTED",
  );
  const [reviewReason, setReviewReason] = useState("");
  const [reviewSaving, setReviewSaving] = useState(false);
  const [profileTarget, setProfileTarget] = useState<VotingPlace | null>(null);
  const [expectedTables, setExpectedTables] = useState("");
  const [profileSaving, setProfileSaving] = useState(false);
  const dialogTitleRef = useRef<HTMLHeadingElement>(null);
  const reviewTitleRef = useRef<HTMLHeadingElement>(null);
  const profileTitleRef = useRef<HTMLHeadingElement>(null);
  const loadRequestIdRef = useRef(0);

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

  const loadData = useCallback(
    async (signal?: AbortSignal) => {
      const requestId = ++loadRequestIdRef.current;
      const requestedStage = operationStage ?? null;
      const requestedContext = expectedCaptureContextForStage(requestedStage);

      // Never retain a report snapshot while its context is being refreshed.
      // This also hides SIMULATION data synchronously when the stage changes.
      setReportSnapshotStage(null);
      setReportPage(emptyReportPage(requestedContext ?? "REAL"));
      setLoadFailure(null);

      if (!canReadE14) {
        setLoading(false);
        return;
      }
      setLoading(true);

      try {
        const reportRequest =
          operationStage === "ELECTION_PREPARATION"
            ? Promise.resolve(emptyReportPage("REAL"))
            : listWitnessReports(
                {
                  page,
                  limit: PAGE_SIZE,
                  ...(filters.status ? { status: filters.status } : {}),
                  ...(filters.puestoId ? { puestoId: filters.puestoId } : {}),
                  ...(filters.mesa ? { mesa: Number(filters.mesa) } : {}),
                },
                signal,
              );
        const [loadedPlaces, loadedReports] = await Promise.all([
          listVotingPlaces(
            { page: placePage, limit: 50, search: placeSearch || undefined },
            signal,
          ),
          reportRequest,
        ]);

        if (signal?.aborted || requestId !== loadRequestIdRef.current) return;

        if (
          (requestedContext !== null &&
            loadedReports.captureContext !== requestedContext) ||
          loadedReports.items.some(
            (report) => report.captureContext !== loadedReports.captureContext,
          )
        ) {
          throw new Error(
            "La respuesta E-14 mezcló contextos electorales incompatibles.",
          );
        }

        setPlacesPage(loadedPlaces);
        setReportPage(loadedReports);
        setReportSnapshotStage(requestedStage);
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
        if (
          signal?.aborted ||
          requestId !== loadRequestIdRef.current ||
          (error instanceof DOMException && error.name === "AbortError")
        ) {
          return;
        }
        setReportSnapshotStage(null);
        setReportPage(emptyReportPage(requestedContext ?? "REAL"));
        setLoadFailure({
          stage: requestedStage,
          message: readableLoadError(error),
          status: error instanceof ApiError ? error.status : null,
        });
      } finally {
        if (!signal?.aborted && requestId === loadRequestIdRef.current) {
          setLoading(false);
        }
      }
    },
    [canReadE14, filters, operationStage, page, placePage, placeSearch],
  );

  useEffect(() => {
    const controller = new AbortController();
    void loadData(controller.signal);
    return () => controller.abort();
  }, [loadData]);

  useEffect(() => {
    const activeDialogTitle = dialogOpen
      ? dialogTitleRef.current
      : reviewTarget
        ? reviewTitleRef.current
        : profileTarget
          ? profileTitleRef.current
          : null;
    if (!activeDialogTitle) return;

    const previousActiveElement = document.activeElement as HTMLElement | null;
    activeDialogTitle.focus();

    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      if (dialogOpen && !savingStep) setDialogOpen(false);
      if (reviewTarget && !reviewSaving) setReviewTarget(null);
      if (profileTarget && !profileSaving) setProfileTarget(null);
    };

    window.addEventListener("keydown", closeOnEscape);
    return () => {
      window.removeEventListener("keydown", closeOnEscape);
      previousActiveElement?.focus();
    };
  }, [
    dialogOpen,
    profileSaving,
    profileTarget,
    reviewSaving,
    reviewTarget,
    savingStep,
  ]);

  const places = placesPage.items;
  const currentStage = operationStage ?? null;
  const expectedCaptureContext = expectedCaptureContextForStage(currentStage);
  const hasCurrentReportSnapshot =
    reportSnapshotStage === currentStage &&
    (expectedCaptureContext === null ||
      reportPage.captureContext === expectedCaptureContext);
  const visibleReportPage = hasCurrentReportSnapshot
    ? reportPage
    : emptyReportPage(expectedCaptureContext ?? "REAL");
  const reports = visibleReportPage.items;
  const summary = visibleReportPage.summary;
  const captureContextPresentation = expectedCaptureContext
    ? CAPTURE_CONTEXT_LABELS[expectedCaptureContext]
    : null;
  const currentLoadFailure =
    loadFailure?.stage === currentStage ? loadFailure : null;
  const isContextLoading =
    loading ||
    (canReadE14 && currentLoadFailure === null && !hasCurrentReportSnapshot);
  const isSimulationMode = operationStage === "SIMULATION";
  const reportablePlaces = useMemo(
    () =>
      isSimulationMode
        ? places
        : places.filter((place) => place.operationalStatus.operationalNow),
    [isSimulationMode, places],
  );
  const placesById = useMemo(
    () => new Map(places.map((place) => [place.id, place])),
    [places],
  );
  const metrics = {
    reports: summary.acceptedReports,
    candidateVotes: summary.acceptedCandidateVotes,
    totalVotes: summary.acceptedTotalVotes,
  };
  const reviewHasCompleteTraceability = reviewTarget
    ? hasCompleteWitnessTraceability(reviewTarget)
    : false;

  function openReportDialog(puestoId?: string) {
    if (!canReportE14 || reportablePlaces.length === 0) return;
    const requestedPlace = puestoId
      ? reportablePlaces.find((place) => place.id === puestoId)
      : null;
    if (puestoId && !requestedPlace) {
      setActionError(
        "Ese puesto no corresponde a su jornada civil local y no admite una captura REAL ahora.",
      );
      return;
    }

    setFormError(null);
    setNotice(null);
    setForm((current) => ({
      ...current,
      puestoId:
        requestedPlace?.id ??
        (reportablePlaces.some((place) => place.id === current.puestoId)
          ? current.puestoId
          : reportablePlaces[0].id),
      checkedInAt: current.checkedInAt || localDateTimeInputValue(),
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
    const blankVotes = Number(form.blankVotes);
    const nullVotes = Number(form.nullVotes);
    const unmarkedVotes = Number(form.unmarkedVotes);
    const totalTableVotes = Number(form.totalTableVotes);
    const credentialReference = form.credentialReference.trim();
    const checkedInAt = new Date(form.checkedInAt);
    const reclamationDescription = form.reclamationDescription.trim();

    if (!placesById.has(form.puestoId)) {
      setFormError("Selecciona un puesto de votación disponible.");
      return;
    }
    if (
      !isSimulationMode &&
      !placesById.get(form.puestoId)?.operationalStatus.operationalNow
    ) {
      setFormError(
        "El puesto no corresponde a su jornada civil local. El servidor no aceptará un E-14 REAL fuera de esa fecha.",
      );
      return;
    }

    const configuredTables = placesById.get(form.puestoId)?.expectedTables;
    if (configuredTables && mesa > configuredTables) {
      setFormError(
        `Este puesto tiene ${configuredTables} mesas esperadas. Verifica el numero de mesa.`,
      );
      return;
    }

    if (!Number.isInteger(mesa) || mesa < 1 || mesa > MAX_WITNESS_REPORT_MESA) {
      setFormError("La mesa debe ser un número entero entre 1 y 99.999.");
      return;
    }

    if (!credentialReference) {
      setFormError("Registra la referencia de la credencial E-15 o E-16.");
      return;
    }

    if (Number.isNaN(checkedInAt.getTime())) {
      setFormError("Registra la hora de presencia del testigo.");
      return;
    }
    if (checkedInAt.getTime() > Date.now() + WITNESS_CHECK_IN_CLOCK_SKEW_MS) {
      setFormError("La hora de presencia no puede estar en el futuro.");
      return;
    }

    const voteValidation = validateWitnessVoteBreakdown({
      candidateVotes,
      blankVotes,
      nullVotes,
      unmarkedVotes,
      totalTableVotes,
    });
    if (!voteValidation.valid) {
      setFormError(voteValidation.message);
      return;
    }

    if (
      form.hasWrittenClaim &&
      (!form.reclamationGround || reclamationDescription.length < 20)
    ) {
      setFormError(
        "La reclamación escrita requiere causal y una descripción de al menos 20 caracteres.",
      );
      return;
    }
    if (
      form.reclamationGround === "OTHER_STATUTORY_GROUND" &&
      !/(art(?:[íi]culo)?\.?|ley|decreto|numeral)\s+/i.test(
        reclamationDescription,
      )
    ) {
      setFormError(
        "Identifica en la descripción la norma, el artículo o el numeral de la causal taxativa.",
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
      const upload = await uploadFileDirectlyWithClientDeclaredHash(
        e14File,
        "e14",
      );

      setSavingStep("reporting");
      await createWitnessReport({
        puestoId: form.puestoId,
        mesa,
        credentialType: form.credentialType,
        credentialReference,
        checkedInAt: checkedInAt.toISOString(),
        e14FormType: form.e14FormType,
        candidateVotes,
        blankVotes,
        nullVotes,
        unmarkedVotes,
        totalTableVotes,
        hasWrittenClaim: form.hasWrittenClaim,
        ...(form.hasWrittenClaim && form.reclamationGround
          ? {
              reclamationGround: form.reclamationGround,
              reclamationDescription,
            }
          : {}),
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
        isSimulationMode
          ? "Reporte de simulacro guardado y aislado de la operación real. Solo contará en las métricas del ensayo después de una revisión independiente."
          : "Reporte E-14 real guardado como lectura interna pendiente. Sus votos solo contarán en el tablero real después de una revisión independiente.",
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
    const mesaValidation = validateWitnessReportMesaFilter(filterDraft.mesa);
    if (!mesaValidation.valid) {
      setFilterError(mesaValidation.message);
      return;
    }

    setFilterError(null);
    setLoadFailure(null);
    setPage(1);
    setFilters({
      ...filterDraft,
      mesa:
        mesaValidation.mesa === undefined ? "" : String(mesaValidation.mesa),
    });
  }

  function clearFilters() {
    setFilterDraft(EMPTY_FILTERS);
    setFilters(EMPTY_FILTERS);
    setFilterError(null);
    setLoadFailure(null);
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
    if (
      !canReviewE14 ||
      report.status !== "PENDING" ||
      report.witnessId === user?.id
    ) {
      return;
    }
    setActionError(null);
    setReviewTarget(report);
    setReviewDecision(
      hasCompleteWitnessTraceability(report) ? "ACCEPTED" : "REJECTED",
    );
    setReviewReason("");
  }

  async function handleReview(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!reviewTarget) return;
    const reason = reviewReason.trim();
    if (
      reviewDecision === "ACCEPTED" &&
      !hasCompleteWitnessTraceability(reviewTarget)
    ) {
      setActionError(
        "Un reporte histórico sin trazabilidad completa no puede aceptarse. Verifica el soporte y registra un rechazo motivado.",
      );
      return;
    }
    if (reason.length < 10) {
      setActionError(
        "El motivo de revisión debe tener al menos 10 caracteres.",
      );
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
          ? isSimulationMode
            ? "Reporte de simulacro aceptado. Solo alimenta las métricas aisladas del ensayo."
            : "Reporte real aceptado. Esta es ahora la única lectura real que alimenta las métricas de la mesa."
          : "Reporte rechazado con motivo registrado en la auditoría.",
      );
      await loadData();
    } catch (error) {
      setActionError(
        readableError(error, "No fue posible registrar la revisión E-14."),
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

  function closeReviewDialog() {
    if (reviewSaving) return;
    setReviewTarget(null);
    setActionError(null);
  }

  function closeProfileDialog() {
    if (profileSaving) return;
    setProfileTarget(null);
    setActionError(null);
  }

  async function handleProfile(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!profileTarget) return;
    const value = Number(expectedTables);
    if (!Number.isInteger(value) || value < 1 || value > 99_999) {
      setActionError(
        "Las mesas esperadas deben ser un entero entre 1 y 99.999.",
      );
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

  const showClearFilters = Boolean(
    filters.status ||
    filters.puestoId ||
    filters.mesa ||
    filterDraft.status ||
    filterDraft.puestoId ||
    filterDraft.mesa,
  );
  const shouldRetryWithoutFilters =
    currentLoadFailure?.status === 400 &&
    Boolean(filters.status || filters.puestoId || filters.mesa);

  const reportFiltersForm = (
    <form
      aria-label="Filtrar reportes E-14"
      noValidate
      onSubmit={applyFilters}
      className="grid w-full gap-3 text-left sm:grid-cols-2 lg:grid-cols-[1fr_1fr_1fr_auto]"
    >
      <label className="text-xs font-black uppercase tracking-wider text-slate-500">
        Estado
        <select
          value={filterDraft.status}
          onChange={(event) =>
            setFilterDraft((current) => ({
              ...current,
              status: event.target.value as ReportFilters["status"],
            }))
          }
          className="mt-1.5 min-h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm font-semibold normal-case tracking-normal text-slate-800 outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-100"
        >
          <option value="">Todos</option>
          {Object.entries(STATUS_LABELS).map(([value, meta]) => (
            <option key={value} value={value}>
              {meta.label}
            </option>
          ))}
        </select>
      </label>
      <label className="text-xs font-black uppercase tracking-wider text-slate-500">
        Puesto
        <select
          value={filterDraft.puestoId}
          onChange={(event) =>
            setFilterDraft((current) => ({
              ...current,
              puestoId: event.target.value,
            }))
          }
          className="mt-1.5 min-h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm font-semibold normal-case tracking-normal text-slate-800 outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-100"
        >
          <option value="">Todos los visibles</option>
          {places.map((place) => (
            <option key={place.id} value={place.id}>
              {place.code} · {place.name}
            </option>
          ))}
        </select>
      </label>
      <label className="text-xs font-black uppercase tracking-wider text-slate-500">
        Mesa
        <input
          type="number"
          min={MIN_WITNESS_REPORT_MESA}
          max={MAX_WITNESS_REPORT_MESA}
          step={1}
          inputMode="numeric"
          value={filterDraft.mesa}
          aria-invalid={Boolean(filterError)}
          aria-describedby={filterError ? "mesa-filter-error" : undefined}
          onChange={(event) => {
            setFilterDraft((current) => ({
              ...current,
              mesa: event.target.value,
            }));
            setFilterError(null);
          }}
          placeholder="Cualquier mesa"
          className="mt-1.5 min-h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm font-semibold normal-case tracking-normal text-slate-800 outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-100 aria-invalid:border-red-500 aria-invalid:ring-4 aria-invalid:ring-red-100"
        />
        {filterError && (
          <span
            id="mesa-filter-error"
            role="alert"
            className="mt-1.5 block text-xs font-semibold normal-case tracking-normal text-red-700"
          >
            {filterError}
          </span>
        )}
      </label>
      <div className="flex items-end gap-2">
        <button
          type="submit"
          className="min-h-11 flex-1 rounded-xl bg-slate-950 px-4 text-sm font-black text-white hover:bg-blue-800"
        >
          Filtrar
        </button>
        {showClearFilters && (
          <button
            type="button"
            onClick={clearFilters}
            className="min-h-11 rounded-xl border border-slate-200 bg-white px-4 text-sm font-black text-slate-700 hover:bg-slate-100"
          >
            Limpiar filtros
          </button>
        )}
      </div>
    </form>
  );

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
            alimentan únicamente los resultados internos y la cobertura del
            tablero; no sustituyen el escrutinio oficial.
          </p>
        </div>
        <div className="flex flex-col gap-3 sm:flex-row">
          {canReportE14 && (
            <button
              type="button"
              onClick={() =>
                window.dispatchEvent(new Event(OFFLINE_VAULT_OPEN_EVENT))
              }
              className="inline-flex min-h-12 items-center justify-center gap-2 rounded-2xl border border-blue-200 bg-blue-50 px-5 text-sm font-black text-blue-900 transition hover:border-blue-400"
            >
              <LockKeyhole aria-hidden="true" size={17} />
              Capturar offline
            </button>
          )}
          <button
            type="button"
            onClick={() => void loadData()}
            disabled={isContextLoading}
            className="inline-flex min-h-12 items-center justify-center gap-2 rounded-2xl border border-slate-200 bg-white px-5 text-sm font-black text-slate-700 transition hover:border-blue-300 disabled:opacity-50"
          >
            <RefreshCw
              aria-hidden="true"
              className={isContextLoading ? "animate-spin" : ""}
              size={17}
            />
            Actualizar
          </button>
          {canReportE14 && (
            <button
              type="button"
              onClick={() => openReportDialog()}
              disabled={isContextLoading || reportablePlaces.length === 0}
              className="inline-flex min-h-12 items-center justify-center gap-2 rounded-2xl bg-blue-700 px-5 text-sm font-black text-white shadow-lg shadow-blue-900/10 transition hover:bg-blue-800 disabled:cursor-not-allowed disabled:opacity-45"
            >
              <Plus aria-hidden="true" size={18} />{" "}
              {isSimulationMode
                ? "Registrar E-14 de simulacro"
                : "Registrar E-14 real"}
            </button>
          )}
        </div>
      </header>

      {operationStage === "SIMULATION" && (
        <div
          role="status"
          data-testid="e14-context-banner"
          className="rounded-2xl border border-amber-300 bg-amber-50 px-5 py-4 text-sm leading-6 text-amber-950"
        >
          <p className="font-black">SIMULACRO E-14 · DATOS DE ENSAYO</p>
          <p className="mt-1 font-medium">
            Puedes registrar, sincronizar y revisar el flujo completo. Estas
            actas quedan marcadas como SIMULATION y jamás alimentan tableros,
            mapas de calor, cierres ni resultados electorales reales.
          </p>
        </div>
      )}

      {(operationStage === "ELECTION_DAY" ||
        operationStage === "POST_ELECTION" ||
        operationStage === "CLOSED") && (
        <div
          role="status"
          data-testid="e14-context-banner"
          className="rounded-2xl border border-emerald-300 bg-emerald-50 px-5 py-4 text-sm leading-6 text-emerald-950"
        >
          <p className="font-black">OPERACIÓN ELECTORAL REAL · E-14 REALES</p>
          <p className="mt-1 font-medium">
            Esta vista y sus métricas incluyen únicamente actas marcadas como
            REAL. Los ensayos y los registros históricos sin clasificar
            permanecen excluidos.
          </p>
        </div>
      )}

      {operationStage === "ELECTION_PREPARATION" && (
        <div
          role="status"
          className="rounded-2xl border border-blue-200 bg-blue-50 px-5 py-4 text-sm leading-6 text-blue-950"
        >
          <p className="font-black">Preparación electoral</p>
          <p className="mt-1 font-medium">
            Configura las mesas esperadas de cada puesto. El registro y la
            revisión de E-14 se habilitan únicamente al iniciar el Día D.
          </p>
        </div>
      )}

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

      {actionError && !reviewTarget && !profileTarget && (
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
          Tu rol no tiene acceso al módulo de conciliación E-14.
        </div>
      ) : isContextLoading ? (
        <div
          role="status"
          className="flex min-h-96 flex-col items-center justify-center gap-3 rounded-3xl border border-slate-200 bg-white text-sm font-semibold text-slate-500"
        >
          <Loader2
            aria-hidden="true"
            className="animate-spin text-blue-700"
            size={30}
          />
          {isSimulationMode
            ? "Consultando puestos y reportes de simulacro…"
            : "Consultando puestos y reportes reales…"}
        </div>
      ) : currentLoadFailure ? (
        <div className="flex min-h-80 flex-col items-center justify-center gap-4 rounded-3xl border border-red-200 bg-red-50 p-8 text-center">
          <div role="alert" className="flex flex-col items-center gap-3">
            <AlertCircle
              aria-hidden="true"
              className="text-red-600"
              size={34}
            />
            <div>
              <h2 className="font-black text-slate-950">
                No pudimos cargar el control electoral
              </h2>
              <p className="mt-1 max-w-xl text-sm text-slate-600">
                {currentLoadFailure.message}
              </p>
            </div>
          </div>
          <div className="w-full max-w-4xl rounded-2xl border border-red-200 bg-white p-4">
            <p className="mb-3 text-left text-xs font-bold text-slate-600">
              Corrige los filtros o límpialos para recuperar la consulta.
            </p>
            {reportFiltersForm}
          </div>
          <div className="flex flex-wrap justify-center gap-2">
            <button
              type="button"
              onClick={() => {
                if (shouldRetryWithoutFilters) {
                  clearFilters();
                  return;
                }
                void loadData();
              }}
              className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-slate-950 px-5 text-sm font-black text-white hover:bg-blue-800"
            >
              <RefreshCw aria-hidden="true" size={16} />
              {shouldRetryWithoutFilters
                ? "Reintentar sin filtros"
                : "Reintentar"}
            </button>
          </div>
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
                  definido su número esperado de mesas. La plataforma no inventa
                  porcentajes cuando falta esa base.
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
                    <div className="mt-3 space-y-1 text-xs leading-5 text-slate-600">
                      <p>
                        Código fuente:{" "}
                        {place.sourceLocationCode ?? "No trazable"}
                      </p>
                      <p>
                        Jornada:{" "}
                        {place.votingDate?.slice(0, 10) ?? "No documentada"}
                      </p>
                      <p>
                        Zona horaria:{" "}
                        {place.timeZone ?? "Exterior no verificada"}
                      </p>
                      <p>{place.address ?? "Sin dirección publicada"}</p>
                      {place.commune && <p>Comuna: {place.commune}</p>}
                      {!isSimulationMode && (
                        <p
                          className={
                            place.operationalStatus.operationalNow
                              ? "font-black text-emerald-700"
                              : "font-black text-amber-700"
                          }
                        >
                          {place.operationalStatus.operationalNow
                            ? "Habilitado para la jornada REAL local"
                            : place.operationalStatus.code ===
                                "TIME_ZONE_NOT_VERIFIED"
                              ? "REAL bloqueado: falta zona horaria verificable"
                              : "Fuera de su jornada REAL local"}
                        </p>
                      )}
                    </div>
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
                        disabled={
                          !isSimulationMode &&
                          !place.operationalStatus.operationalNow
                        }
                        className="mt-4 min-h-11 w-full rounded-xl bg-slate-950 px-4 text-sm font-black text-white transition hover:bg-blue-800 disabled:cursor-not-allowed disabled:opacity-45"
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
            <header className="space-y-4 border-b border-slate-100 bg-slate-50/60 px-6 py-5">
              <div>
                <h2 id="reports-heading" className="font-black text-slate-950">
                  {captureContextPresentation
                    ? `${captureContextPresentation.short} · Reportes registrados`
                    : "Reportes E-14 no habilitados"}
                </h2>
                <p className="mt-1 text-xs text-slate-500">
                  {captureContextPresentation
                    ? `${captureContextPresentation.detail} La ruta privada del acta nunca se expone en esta vista.`
                    : "La captura de actas solo se habilita en simulacro, Día D y poselección."}
                </p>
              </div>
              {reportFiltersForm}
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
                  reporte de este contexto.
                </p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[1480px] text-left text-sm">
                  <thead className="bg-white text-xs font-black uppercase tracking-wider text-slate-400">
                    <tr>
                      <th className="px-6 py-4">Puesto / mesa</th>
                      <th className="px-6 py-4">Testigo</th>
                      <th className="px-6 py-4">Trazabilidad</th>
                      <th className="px-6 py-4 text-right">Votos candidato</th>
                      <th className="px-6 py-4 text-right">Votos totales</th>
                      <th className="px-6 py-4">Conciliación</th>
                      <th className="px-6 py-4">Soporte</th>
                      <th className="px-6 py-4">Fecha</th>
                      <th className="px-6 py-4 text-right">Acción</th>
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
                          <span
                            data-testid={`report-context-${report.id}`}
                            className={`mb-2 inline-flex rounded-full border px-2.5 py-1 text-[10px] font-black tracking-wide ${CAPTURE_CONTEXT_LABELS[report.captureContext].className}`}
                          >
                            {
                              CAPTURE_CONTEXT_LABELS[report.captureContext]
                                .short
                            }
                          </span>
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
                        <td className="px-6 py-5">
                          {report.credentialType &&
                          report.credentialReference &&
                          report.checkedInAt &&
                          report.e14FormType ? (
                            <div className="max-w-xs space-y-1 text-xs leading-5 text-slate-600">
                              <p className="font-black text-slate-900">
                                {
                                  WITNESS_CREDENTIAL_LABELS[
                                    report.credentialType
                                  ]
                                }
                              </p>
                              <p>Ref. {report.credentialReference}</p>
                              <p>Presencia: {formatDate(report.checkedInAt)}</p>
                              <p>{E14_FORM_LABELS[report.e14FormType]}</p>
                            </div>
                          ) : (
                            <span className="text-xs font-semibold text-slate-400">
                              Reporte legado sin trazabilidad
                            </span>
                          )}
                        </td>
                        <td className="px-6 py-5 text-right font-black text-blue-800">
                          {formatNumber(report.candidateVotes)}
                        </td>
                        <td className="px-6 py-5 text-right font-black text-slate-900">
                          {formatNumber(report.totalTableVotes)}
                          {report.blankVotes !== null &&
                            report.nullVotes !== null &&
                            report.unmarkedVotes !== null && (
                              <span className="mt-1 block text-[10px] font-semibold leading-4 text-slate-500">
                                Blanco {formatNumber(report.blankVotes)} · Nulos{" "}
                                {formatNumber(report.nullVotes)} · No marcados{" "}
                                {formatNumber(report.unmarkedVotes)}
                              </span>
                            )}
                        </td>
                        <td className="px-6 py-5">
                          <div className="flex max-w-xs flex-col items-start gap-2">
                            <span
                              data-testid={`report-status-${report.id}`}
                              className={`inline-flex rounded-full border px-3 py-1 text-xs font-black ${STATUS_LABELS[report.status].className}`}
                            >
                              {STATUS_LABELS[report.status].label}
                            </span>
                            {report.divergent && (
                              <span className="inline-flex items-center gap-1 text-xs font-black text-amber-700">
                                <AlertTriangle aria-hidden="true" size={14} />
                                Lecturas divergentes
                              </span>
                            )}
                            {report.hasWrittenClaim && (
                              <span className="inline-flex items-center gap-1 rounded-full border border-amber-200 bg-amber-50 px-2.5 py-1 text-xs font-black text-amber-800">
                                <Scale aria-hidden="true" size={13} />
                                Reclamación escrita
                              </span>
                            )}
                            {report.reviewer && report.reviewedAt && (
                              <p className="text-xs leading-5 text-slate-500">
                                Revisó {report.reviewer.name} ·{" "}
                                {formatDate(report.reviewedAt)}
                              </p>
                            )}
                            {report.reviewReason && (
                              <p
                                title={report.reviewReason}
                                className="line-clamp-2 text-xs leading-5 text-slate-600"
                              >
                                Motivo: {report.reviewReason}
                              </p>
                            )}
                          </div>
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
                        <td className="px-6 py-5 text-right">
                          {report.status === "PENDING" && canReviewE14 ? (
                            report.witnessId === user?.id ? (
                              <span className="text-xs font-semibold text-slate-500">
                                Requiere otro revisor
                              </span>
                            ) : (
                              <button
                                type="button"
                                onClick={() => openReviewDialog(report)}
                                className="inline-flex min-h-10 items-center gap-2 rounded-xl bg-blue-700 px-4 text-xs font-black text-white hover:bg-blue-800"
                              >
                                <Scale aria-hidden="true" size={15} /> Revisar
                              </button>
                            )
                          ) : (
                            <span className="text-xs text-slate-400">—</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            {reportPage.pagination.totalPages > 1 && (
              <nav
                aria-label="Paginación de reportes E-14"
                className="flex items-center justify-between border-t border-slate-100 px-4 py-3 sm:px-6"
              >
                <button
                  type="button"
                  disabled={page <= 1}
                  onClick={() => setPage((current) => current - 1)}
                  className="inline-flex min-h-10 items-center gap-1 rounded-xl px-3 text-sm font-black text-slate-700 hover:bg-slate-100 disabled:opacity-40"
                >
                  <ChevronLeft aria-hidden="true" size={16} /> Anterior
                </button>
                <span className="text-xs font-bold text-slate-500">
                  Página {reportPage.pagination.page} de{" "}
                  {reportPage.pagination.totalPages}
                </span>
                <button
                  type="button"
                  disabled={page >= reportPage.pagination.totalPages}
                  onClick={() => setPage((current) => current + 1)}
                  className="inline-flex min-h-10 items-center gap-1 rounded-xl px-3 text-sm font-black text-slate-700 hover:bg-slate-100 disabled:opacity-40"
                >
                  Siguiente <ChevronRight aria-hidden="true" size={16} />
                </button>
              </nav>
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
                  {isSimulationMode
                    ? "Registrar reporte de simulacro"
                    : "Registrar reporte real de mesa"}
                </h2>
                <p className="mt-1 text-sm text-slate-500">
                  {isSimulationMode
                    ? "Quedará marcado como SIMULATION y aislado de todo resultado real."
                    : "Quedará marcado como REAL. El acta se carga al almacenamiento privado."}
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
                    {reportablePlaces.map((place) => (
                      <option key={place.id} value={place.id}>
                        {place.code} · {place.name}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="text-sm font-black text-slate-800">
                  Tipo de credencial
                  <select
                    required
                    value={form.credentialType}
                    onChange={(event) =>
                      setForm((current) => ({
                        ...current,
                        credentialType: event.target
                          .value as WitnessCredentialType,
                      }))
                    }
                    className="mt-2 min-h-12 w-full rounded-2xl border border-slate-200 bg-white px-4 font-normal outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-100"
                  >
                    {(["E15", "E16"] as const).map((credentialType) => (
                      <option key={credentialType} value={credentialType}>
                        {WITNESS_CREDENTIAL_LABELS[credentialType]}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="text-sm font-black text-slate-800">
                  Referencia de credencial
                  <input
                    required
                    type="text"
                    maxLength={120}
                    value={form.credentialReference}
                    onChange={(event) =>
                      setForm((current) => ({
                        ...current,
                        credentialReference: event.target.value,
                      }))
                    }
                    placeholder="Ej. E15-BOG-001-00012"
                    className="mt-2 min-h-12 w-full rounded-2xl border border-slate-200 px-4 font-normal outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-100"
                  />
                </label>
                <label className="text-sm font-black text-slate-800">
                  Hora de presencia
                  <input
                    required
                    type="datetime-local"
                    value={form.checkedInAt}
                    onChange={(event) =>
                      setForm((current) => ({
                        ...current,
                        checkedInAt: event.target.value,
                      }))
                    }
                    className="mt-2 min-h-12 w-full rounded-2xl border border-slate-200 px-4 font-normal outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-100"
                  />
                </label>
                <label className="text-sm font-black text-slate-800">
                  Ejemplar del formulario E-14
                  <select
                    required
                    value={form.e14FormType}
                    onChange={(event) =>
                      setForm((current) => ({
                        ...current,
                        e14FormType: event.target.value as E14FormType,
                      }))
                    }
                    className="mt-2 min-h-12 w-full rounded-2xl border border-slate-200 bg-white px-4 font-normal outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-100"
                  >
                    {(["DELEGADOS", "CLAVEROS", "TRANSMISION"] as const).map(
                      (formType) => (
                        <option key={formType} value={formType}>
                          {E14_FORM_LABELS[formType]}
                        </option>
                      ),
                    )}
                  </select>
                </label>
                <label className="text-sm font-black text-slate-800">
                  Número de mesa
                  <input
                    required
                    type="number"
                    min={1}
                    max={MAX_WITNESS_REPORT_MESA}
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
              </div>
              <fieldset className="rounded-2xl border border-slate-200 p-4">
                <legend className="px-2 text-sm font-black text-slate-800">
                  Lectura numérica del acta
                </legend>
                <p className="mb-4 text-xs leading-5 text-slate-500">
                  Registra por separado las categorías visibles. La suma
                  clasificada no puede superar el total de la mesa.
                </p>
                <div className="grid gap-5 sm:grid-cols-2">
                  <label className="text-sm font-black text-slate-800">
                    Votos del candidato
                    <input
                      required
                      type="number"
                      min={0}
                      max={MAX_WITNESS_REPORT_VOTES}
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
                    Votos en blanco
                    <input
                      required
                      type="number"
                      min={0}
                      max={MAX_WITNESS_REPORT_VOTES}
                      step={1}
                      inputMode="numeric"
                      value={form.blankVotes}
                      onChange={(event) =>
                        setForm((current) => ({
                          ...current,
                          blankVotes: event.target.value,
                        }))
                      }
                      className="mt-2 min-h-12 w-full rounded-2xl border border-slate-200 px-4 font-normal outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-100"
                    />
                  </label>
                  <label className="text-sm font-black text-slate-800">
                    Votos nulos
                    <input
                      required
                      type="number"
                      min={0}
                      max={MAX_WITNESS_REPORT_VOTES}
                      step={1}
                      inputMode="numeric"
                      value={form.nullVotes}
                      onChange={(event) =>
                        setForm((current) => ({
                          ...current,
                          nullVotes: event.target.value,
                        }))
                      }
                      className="mt-2 min-h-12 w-full rounded-2xl border border-slate-200 px-4 font-normal outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-100"
                    />
                  </label>
                  <label className="text-sm font-black text-slate-800">
                    Votos no marcados
                    <input
                      required
                      type="number"
                      min={0}
                      max={MAX_WITNESS_REPORT_VOTES}
                      step={1}
                      inputMode="numeric"
                      value={form.unmarkedVotes}
                      onChange={(event) =>
                        setForm((current) => ({
                          ...current,
                          unmarkedVotes: event.target.value,
                        }))
                      }
                      className="mt-2 min-h-12 w-full rounded-2xl border border-slate-200 px-4 font-normal outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-100"
                    />
                  </label>
                  <label className="text-sm font-black text-slate-800 sm:col-span-2">
                    Votos totales de la mesa
                    <input
                      required
                      type="number"
                      min={0}
                      max={MAX_WITNESS_REPORT_VOTES}
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
              </fieldset>
              <div className="rounded-2xl border border-amber-200 bg-amber-50/70 p-4">
                <label className="flex cursor-pointer items-start gap-3 text-sm font-black text-slate-800">
                  <input
                    type="checkbox"
                    checked={form.hasWrittenClaim}
                    onChange={(event) =>
                      setForm((current) => ({
                        ...current,
                        hasWrittenClaim: event.target.checked,
                        ...(!event.target.checked
                          ? {
                              reclamationGround: "" as const,
                              reclamationDescription: "",
                            }
                          : {}),
                      }))
                    }
                    className="mt-0.5 size-5 rounded border-amber-300 text-blue-700 focus:ring-blue-500"
                  />
                  <span>
                    Se presentó reclamación escrita
                    <span className="mt-1 block text-xs font-normal leading-5 text-slate-600">
                      Registra únicamente reclamaciones efectivamente
                      presentadas; esta aplicación no las radica ante la
                      autoridad electoral.
                    </span>
                  </span>
                </label>
                {form.hasWrittenClaim && (
                  <div className="mt-4 grid gap-4">
                    <label className="text-sm font-black text-slate-800">
                      Causal de reclamación
                      <select
                        required
                        value={form.reclamationGround}
                        onChange={(event) =>
                          setForm((current) => ({
                            ...current,
                            reclamationGround: event.target
                              .value as WitnessReclamationGround,
                          }))
                        }
                        className="mt-2 min-h-12 w-full rounded-2xl border border-amber-200 bg-white px-4 font-normal outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-100"
                      >
                        <option value="" disabled>
                          Seleccionar causal legal
                        </option>
                        {Object.entries(WITNESS_RECLAMATION_GROUND_LABELS).map(
                          ([ground, label]) => (
                            <option key={ground} value={ground}>
                              {label}
                            </option>
                          ),
                        )}
                      </select>
                    </label>
                    <label className="text-sm font-black text-slate-800">
                      Descripción de la reclamación
                      <textarea
                        required
                        minLength={20}
                        maxLength={2000}
                        rows={4}
                        value={form.reclamationDescription}
                        onChange={(event) =>
                          setForm((current) => ({
                            ...current,
                            reclamationDescription: event.target.value,
                          }))
                        }
                        placeholder="Describe hechos, modo, tiempo y lugar de la reclamación presentada."
                        className="mt-2 w-full rounded-2xl border border-amber-200 bg-white px-4 py-3 font-normal outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-100"
                      />
                    </label>
                  </div>
                )}
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
                La foto viaja directamente al almacenamiento privado. Este
                registro sirve para conciliación interna: no transmite
                resultados ni radica reclamaciones ante la Registraduría.
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

      {reviewTarget && (
        <div className="fixed inset-0 z-[80] flex items-center justify-center bg-slate-950/70 p-4 backdrop-blur-sm">
          <section
            role="dialog"
            aria-modal="true"
            aria-labelledby="e14-review-title"
            className="max-h-[94vh] w-full max-w-xl overflow-y-auto rounded-3xl bg-white shadow-2xl"
          >
            <header className="sticky top-0 z-10 flex items-start justify-between gap-4 border-b border-slate-100 bg-white px-6 py-5">
              <div>
                <h2
                  id="e14-review-title"
                  ref={reviewTitleRef}
                  tabIndex={-1}
                  className="text-xl font-black text-slate-950 outline-none"
                >
                  {reviewTarget.captureContext === "SIMULATION"
                    ? "Revisar E-14 de simulacro"
                    : "Revisar reporte E-14 real"}
                </h2>
                <p className="mt-1 text-sm text-slate-500">
                  Mesa {reviewTarget.mesa} ·{" "}
                  {placeName(reviewTarget, placesById)}
                </p>
              </div>
              <button
                type="button"
                onClick={closeReviewDialog}
                disabled={reviewSaving}
                aria-label="Cerrar revisión"
                className="rounded-full p-2 text-slate-500 hover:bg-slate-100 disabled:opacity-50"
              >
                <X aria-hidden="true" size={21} />
              </button>
            </header>
            <form onSubmit={handleReview} className="space-y-5 p-6">
              <div className="grid gap-3 rounded-2xl border border-slate-200 bg-slate-50 p-4 sm:grid-cols-3">
                <div>
                  <p className="text-[10px] font-black uppercase tracking-wider text-slate-400">
                    Reportante
                  </p>
                  <p className="mt-1 text-sm font-black text-slate-900">
                    {reviewTarget.witness.name}
                  </p>
                </div>
                <div>
                  <p className="text-[10px] font-black uppercase tracking-wider text-slate-400">
                    Votos candidato
                  </p>
                  <p className="mt-1 text-sm font-black text-blue-800">
                    {formatNumber(reviewTarget.candidateVotes)}
                  </p>
                </div>
                <div>
                  <p className="text-[10px] font-black uppercase tracking-wider text-slate-400">
                    Votos totales
                  </p>
                  <p className="mt-1 text-sm font-black text-slate-900">
                    {formatNumber(reviewTarget.totalTableVotes)}
                  </p>
                </div>
              </div>

              {reviewHasCompleteTraceability ? (
                <section
                  aria-label="Trazabilidad electoral del reporte"
                  className="rounded-2xl border border-blue-100 bg-blue-50/60 p-4"
                >
                  <h3 className="text-sm font-black text-slate-950">
                    Trazabilidad que debe verificarse
                  </h3>
                  <dl className="mt-3 grid gap-3 text-xs sm:grid-cols-2">
                    <div>
                      <dt className="font-black uppercase tracking-wider text-slate-500">
                        Credencial
                      </dt>
                      <dd className="mt-1 font-semibold text-slate-800">
                        {
                          WITNESS_CREDENTIAL_LABELS[
                            reviewTarget.credentialType!
                          ]
                        }
                        {" · "}
                        {reviewTarget.credentialReference}
                      </dd>
                    </div>
                    <div>
                      <dt className="font-black uppercase tracking-wider text-slate-500">
                        Presencia
                      </dt>
                      <dd className="mt-1 font-semibold text-slate-800">
                        {formatDate(reviewTarget.checkedInAt!)}
                      </dd>
                    </div>
                    <div>
                      <dt className="font-black uppercase tracking-wider text-slate-500">
                        Ejemplar
                      </dt>
                      <dd className="mt-1 font-semibold text-slate-800">
                        {E14_FORM_LABELS[reviewTarget.e14FormType!]}
                      </dd>
                    </div>
                    <div>
                      <dt className="font-black uppercase tracking-wider text-slate-500">
                        Desglose
                      </dt>
                      <dd className="mt-1 font-semibold text-slate-800">
                        Blanco {formatNumber(reviewTarget.blankVotes!)} · Nulos{" "}
                        {formatNumber(reviewTarget.nullVotes!)} · No marcados{" "}
                        {formatNumber(reviewTarget.unmarkedVotes!)}
                      </dd>
                    </div>
                  </dl>
                </section>
              ) : (
                <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 text-sm font-semibold text-slate-600">
                  Reporte histórico sin trazabilidad completa: el backend no
                  permite aceptarlo. Contrasta el soporte disponible y registra
                  un rechazo motivado para sacarlo de la cola pendiente.
                </div>
              )}

              {reviewTarget.hasWrittenClaim && (
                <section
                  aria-label="Reclamación escrita reportada"
                  className="rounded-2xl border border-amber-200 bg-amber-50 p-4"
                >
                  <h3 className="text-sm font-black text-amber-950">
                    Reclamación escrita reportada
                  </h3>
                  <p className="mt-2 text-xs font-black text-amber-900">
                    {reviewTarget.reclamationGround
                      ? WITNESS_RECLAMATION_GROUND_LABELS[
                          reviewTarget.reclamationGround
                        ]
                      : "Causal no disponible"}
                  </p>
                  <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-amber-950">
                    {reviewTarget.reclamationDescription ??
                      "Descripción no disponible"}
                  </p>
                  <p className="mt-2 text-xs font-semibold text-amber-800">
                    Este registro interno no prueba por sí solo la radicación
                    ante la autoridad electoral.
                  </p>
                </section>
              )}

              {reviewTarget.divergent && (
                <div className="flex items-start gap-2 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm font-semibold text-amber-900">
                  <AlertTriangle
                    aria-hidden="true"
                    className="mt-0.5 shrink-0"
                    size={18}
                  />
                  Este reporte difiere de otra lectura pendiente o aceptada de
                  la misma mesa. Verifica el acta antes de decidir.
                </div>
              )}

              {actionError && (
                <div
                  role="alert"
                  className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm font-semibold text-red-800"
                >
                  {actionError}
                </div>
              )}

              <label className="block text-sm font-black text-slate-800">
                Decisión de conciliación
                <select
                  value={reviewDecision}
                  onChange={(event) =>
                    setReviewDecision(
                      event.target.value as "ACCEPTED" | "REJECTED",
                    )
                  }
                  className="mt-2 min-h-12 w-full rounded-2xl border border-slate-200 bg-white px-4 font-normal outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-100"
                >
                  <option
                    value="ACCEPTED"
                    disabled={!reviewHasCompleteTraceability}
                  >
                    Aceptar como lectura interna conciliada
                  </option>
                  <option value="REJECTED">Rechazar reporte</option>
                </select>
              </label>

              <label className="block text-sm font-black text-slate-800">
                Motivo de la decisión
                <textarea
                  required
                  minLength={10}
                  maxLength={1000}
                  rows={4}
                  value={reviewReason}
                  onChange={(event) => setReviewReason(event.target.value)}
                  placeholder="Describe la verificación realizada y la razón de la decisión."
                  className="mt-2 w-full rounded-2xl border border-slate-200 px-4 py-3 font-normal outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-100"
                />
              </label>

              <div className="flex flex-col-reverse gap-3 border-t border-slate-100 pt-5 sm:flex-row sm:justify-end">
                <button
                  type="button"
                  onClick={closeReviewDialog}
                  disabled={reviewSaving}
                  className="min-h-11 rounded-xl border border-slate-200 px-5 text-sm font-black text-slate-700 hover:bg-slate-50 disabled:opacity-50"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={reviewSaving}
                  className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-blue-700 px-6 text-sm font-black text-white hover:bg-blue-800 disabled:opacity-60"
                >
                  {reviewSaving ? (
                    <Loader2
                      aria-hidden="true"
                      className="animate-spin"
                      size={17}
                    />
                  ) : (
                    <Scale aria-hidden="true" size={17} />
                  )}
                  {reviewSaving ? "Guardando decisión…" : "Guardar decisión"}
                </button>
              </div>
            </form>
          </section>
        </div>
      )}

      {profileTarget && (
        <div className="fixed inset-0 z-[80] flex items-center justify-center bg-slate-950/70 p-4 backdrop-blur-sm">
          <section
            role="dialog"
            aria-modal="true"
            aria-labelledby="e14-profile-title"
            className="w-full max-w-lg overflow-hidden rounded-3xl bg-white shadow-2xl"
          >
            <header className="flex items-start justify-between gap-4 border-b border-slate-100 px-6 py-5">
              <div>
                <h2
                  id="e14-profile-title"
                  ref={profileTitleRef}
                  tabIndex={-1}
                  className="text-xl font-black text-slate-950 outline-none"
                >
                  Configurar mesas esperadas
                </h2>
                <p className="mt-1 text-sm text-slate-500">
                  {profileTarget.code} · {profileTarget.name}
                </p>
              </div>
              <button
                type="button"
                onClick={closeProfileDialog}
                disabled={profileSaving}
                aria-label="Cerrar configuración"
                className="rounded-full p-2 text-slate-500 hover:bg-slate-100 disabled:opacity-50"
              >
                <X aria-hidden="true" size={21} />
              </button>
            </header>
            <form onSubmit={handleProfile} className="space-y-5 p-6">
              {actionError && (
                <div
                  role="alert"
                  className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm font-semibold text-red-800"
                >
                  {actionError}
                </div>
              )}
              <p className="text-sm leading-6 text-slate-600">
                Este valor define el denominador de cobertura. Debe corresponder
                al número real de mesas habilitadas en el puesto.
              </p>
              <label className="block text-sm font-black text-slate-800">
                Mesas esperadas
                <input
                  required
                  type="number"
                  min={1}
                  max={99_999}
                  step={1}
                  inputMode="numeric"
                  value={expectedTables}
                  onChange={(event) => setExpectedTables(event.target.value)}
                  className="mt-2 min-h-12 w-full rounded-2xl border border-slate-200 px-4 font-normal outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-100"
                />
              </label>
              <div className="flex flex-col-reverse gap-3 border-t border-slate-100 pt-5 sm:flex-row sm:justify-end">
                <button
                  type="button"
                  onClick={closeProfileDialog}
                  disabled={profileSaving}
                  className="min-h-11 rounded-xl border border-slate-200 px-5 text-sm font-black text-slate-700 hover:bg-slate-50 disabled:opacity-50"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={profileSaving}
                  className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-slate-950 px-6 text-sm font-black text-white hover:bg-blue-800 disabled:opacity-60"
                >
                  {profileSaving ? (
                    <Loader2
                      aria-hidden="true"
                      className="animate-spin"
                      size={17}
                    />
                  ) : (
                    <Settings2 aria-hidden="true" size={17} />
                  )}
                  {profileSaving ? "Guardando perfil…" : "Guardar perfil"}
                </button>
              </div>
            </form>
          </section>
        </div>
      )}
    </div>
  );
}
