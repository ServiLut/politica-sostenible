"use client";

import {
  AlertCircle,
  CheckCircle2,
  Clock3,
  Download,
  FileJson,
  Loader2,
  RefreshCw,
  RotateCcw,
  ShieldAlert,
  UploadCloud,
} from "lucide-react";
import {
  type FormEvent,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useAuth } from "@/context/auth";
import { ApiError } from "@/lib/api-client";
import { catalogErrorMessage } from "@/lib/electoral-catalog-api";
import {
  buildRnecPublicPackageFile,
  type CatalogImportMetadata,
  createElectoralCatalogImport,
  createRnecPublicPackageTemplateFile,
  type CreateElectoralCatalogImportInput,
  type ElectoralCatalogImportJob,
  type ElectoralCatalogImportStatus,
  getElectoralCatalogImport,
  isPendingCatalogImport,
  listElectoralCatalogImports,
  prepareElectoralCatalogImport,
  retryElectoralCatalogImport,
  type RnecElectionRound,
} from "@/lib/electoral-catalog-import-api";

const POLL_INTERVAL_MS = 3_000;
const MAX_POLL_CYCLES = 40;
const STATUS_LABELS: Record<ElectoralCatalogImportStatus, string> = {
  QUEUED: "En cola",
  PROCESSING: "Procesando",
  SUCCEEDED: "Snapshot preparado",
  FAILED: "Fallida",
};
const STATUS_STYLES: Record<ElectoralCatalogImportStatus, string> = {
  QUEUED: "border-amber-200 bg-amber-50 text-amber-900",
  PROCESSING: "border-blue-200 bg-blue-50 text-blue-900",
  SUCCEEDED: "border-emerald-200 bg-emerald-50 text-emerald-900",
  FAILED: "border-red-200 bg-red-50 text-red-900",
};

interface ElectoralCatalogImportPanelProps {
  onReleaseAvailable?: () => void | Promise<void>;
}

function formatDate(value: string | null, includeTime = true) {
  if (!value) return "No registrado";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Fecha inválida";
  return new Intl.DateTimeFormat("es-CO", {
    dateStyle: "medium",
    ...(includeTime ? { timeStyle: "short" } : {}),
    timeZone: "America/Bogota",
  }).format(date);
}

function DetailValue({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0 rounded-xl border border-slate-200 bg-slate-50 p-3">
      <dt className="text-[10px] font-black uppercase tracking-wider text-slate-500">
        {label}
      </dt>
      <dd className="mt-1 break-all text-xs font-bold leading-5 text-slate-900">
        {value}
      </dd>
    </div>
  );
}

function toIsoDateTime(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    throw new Error("La fecha de corte no es válida.");
  }
  if (date.getTime() > Date.now()) {
    throw new Error("La fecha de corte no puede estar en el futuro.");
  }
  return date.toISOString();
}

function validateRnecUrl(value: string) {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new Error("La fuente debe ser una URL HTTPS válida de RNEC.");
  }
  const host = url.hostname.toLowerCase().replace(/\.$/u, "");
  if (
    url.protocol !== "https:" ||
    (host !== "registraduria.gov.co" && !host.endsWith(".registraduria.gov.co"))
  ) {
    throw new Error(
      "La fuente debe pertenecer a registraduria.gov.co y usar HTTPS.",
    );
  }
  url.hash = "";
  return url.toString();
}

export function ElectoralCatalogImportPanel({
  onReleaseAvailable,
}: ElectoralCatalogImportPanelProps) {
  const { user } = useAuth();
  const canImport = user?.backendRole === "ADMIN";
  const [jobs, setJobs] = useState<ElectoralCatalogImportJob[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [selectedJob, setSelectedJob] =
    useState<ElectoralCatalogImportJob | null>(null);
  const [statusFilter, setStatusFilter] = useState<
    ElectoralCatalogImportStatus | ""
  >("");
  const [loadingJobs, setLoadingJobs] = useState(true);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [retrying, setRetrying] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [pageVisible, setPageVisible] = useState(true);
  const [pollCycles, setPollCycles] = useState(0);
  const [retryConfirmed, setRetryConfirmed] = useState(false);
  const [legalConfirmed, setLegalConfirmed] = useState(false);
  const [confirmationPhrase, setConfirmationPhrase] = useState("");
  const [artifactMode, setArtifactMode] = useState<"CANONICAL" | "RNEC_PACKAGE">(
    "CANONICAL",
  );
  const [file, setFile] = useState<File | null>(null);
  const [departmentsTreeFile, setDepartmentsTreeFile] = useState<File | null>(
    null,
  );
  const [geolocationFile, setGeolocationFile] = useState<File | null>(null);
  const [matchingRulesFile, setMatchingRulesFile] = useState<File | null>(null);
  const [departmentsTreeSourceUrl, setDepartmentsTreeSourceUrl] = useState("");
  const [geolocationSourceUrl, setGeolocationSourceUrl] = useState("");
  const [electionRound, setElectionRound] =
    useState<RnecElectionRound>("FIRST_ROUND");
  const [fileInputKey, setFileInputKey] = useState(0);
  const [pendingPayload, setPendingPayload] =
    useState<CreateElectoralCatalogImportInput | null>(null);
  const [catalogKey, setCatalogKey] = useState("");
  const [sourceUrl, setSourceUrl] = useState("");
  const [sourceDataset, setSourceDataset] = useState("");
  const [sourceCutoffAt, setSourceCutoffAt] = useState("");
  const [electionDate, setElectionDate] = useState("");
  const [authorizationReference, setAuthorizationReference] = useState("");
  const [licenseDeclaration, setLicenseDeclaration] = useState("");
  const notifiedReleaseIds = useRef(new Set<string>());

  const loadJobs = useCallback(
    async (signal?: AbortSignal, background = false) => {
      if (!background) setLoadingJobs(true);
      setLoadError(null);
      try {
        const loaded = await listElectoralCatalogImports(
          {
            status: statusFilter || undefined,
            limit: 50,
          },
          signal,
        );
        setJobs(loaded);
        setSelectedId((current) =>
          current && loaded.some((job) => job.id === current)
            ? current
            : (loaded.at(0)?.id ?? null),
        );
      } catch (error) {
        if (error instanceof DOMException && error.name === "AbortError")
          return;
        setLoadError(catalogErrorMessage(error));
      } finally {
        if (!signal?.aborted && !background) setLoadingJobs(false);
      }
    },
    [statusFilter],
  );

  const loadJobDetail = useCallback(
    async (jobId: string, signal?: AbortSignal, background = false) => {
      if (!background) setLoadingDetail(true);
      try {
        const loaded = await getElectoralCatalogImport(jobId, signal);
        setSelectedJob(loaded);
        setJobs((current) =>
          current.map((job) => (job.id === loaded.id ? loaded : job)),
        );
      } catch (error) {
        if (error instanceof DOMException && error.name === "AbortError")
          return;
        if (!background) setLoadError(catalogErrorMessage(error));
      } finally {
        if (!signal?.aborted && !background) setLoadingDetail(false);
      }
    },
    [],
  );

  useEffect(() => {
    const controller = new AbortController();
    void loadJobs(controller.signal);
    return () => controller.abort();
  }, [loadJobs]);

  useEffect(() => {
    if (!selectedId) {
      setSelectedJob(null);
      return;
    }
    setRetryConfirmed(false);
    const controller = new AbortController();
    void loadJobDetail(selectedId, controller.signal);
    return () => controller.abort();
  }, [loadJobDetail, selectedId]);

  useEffect(() => {
    const updateVisibility = () =>
      setPageVisible(document.visibilityState !== "hidden");
    updateVisibility();
    document.addEventListener("visibilitychange", updateVisibility);
    return () =>
      document.removeEventListener("visibilitychange", updateVisibility);
  }, []);

  const hasPendingJob = useMemo(
    () => jobs.some((job) => isPendingCatalogImport(job.status)),
    [jobs],
  );

  useEffect(() => {
    if (!pageVisible || !hasPendingJob || pollCycles >= MAX_POLL_CYCLES) {
      return;
    }
    const controller = new AbortController();
    const timer = window.setTimeout(() => {
      void Promise.all([
        loadJobs(controller.signal, true),
        selectedId
          ? loadJobDetail(selectedId, controller.signal, true)
          : Promise.resolve(),
      ]).finally(() => {
        if (!controller.signal.aborted) {
          setPollCycles((current) => current + 1);
        }
      });
    }, POLL_INTERVAL_MS);
    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [
    hasPendingJob,
    loadJobDetail,
    loadJobs,
    pageVisible,
    pollCycles,
    selectedId,
  ]);

  useEffect(() => {
    for (const job of jobs) {
      if (
        job.status !== "SUCCEEDED" ||
        !job.releaseId ||
        notifiedReleaseIds.current.has(job.releaseId)
      ) {
        continue;
      }
      notifiedReleaseIds.current.add(job.releaseId);
      void onReleaseAvailable?.();
    }
  }, [jobs, onReleaseAvailable]);

  async function submitImport(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (
      !canImport ||
      !legalConfirmed ||
      confirmationPhrase !== "INGESTAR RNEC"
    ) {
      return;
    }
    setSubmitting(true);
    setActionError(null);
    setNotice(null);
    try {
      let payload = pendingPayload;
      if (!payload) {
        const metadata: CatalogImportMetadata = {
          catalogKey: catalogKey.trim(),
          sourceUrl: validateRnecUrl(sourceUrl.trim()),
          sourceDataset: sourceDataset.trim(),
          sourceCutoffAt: toIsoDateTime(sourceCutoffAt),
          electionDate,
          authorizationReference: authorizationReference.trim(),
          licenseDeclaration: licenseDeclaration.trim(),
        };
        let artifact = file;
        if (artifactMode === "RNEC_PACKAGE") {
          if (!departmentsTreeFile || !geolocationFile) {
            throw new Error(
              "Selecciona los archivos locales departmentsTree y geolocalización.",
            );
          }
          artifact = await buildRnecPublicPackageFile({
            departmentsTreeFile,
            geolocationFile,
            matchingRulesFile,
            electionName: metadata.sourceDataset,
            electionDate: metadata.electionDate,
            electionRound,
            cutoffAt: metadata.sourceCutoffAt,
            departmentsTreeSourceUrl: departmentsTreeSourceUrl.trim(),
            geolocationSourceUrl: geolocationSourceUrl.trim(),
          });
        }
        if (!artifact) throw new Error("Selecciona el artefacto JSON de RNEC.");
        payload = await prepareElectoralCatalogImport(artifact, metadata);
        setPendingPayload(payload);
      }
      const result = await createElectoralCatalogImport(payload);
      setPendingPayload(null);
      setJobs((current) => [
        result.job,
        ...current.filter((job) => job.id !== result.job.id),
      ]);
      setSelectedId(result.job.id);
      setSelectedJob(result.job);
      setPollCycles(0);
      setNotice(
        result.created
          ? "Ingesta registrada y enviada al procesador. El resultado todavía no es un catálogo activo."
          : "El servidor reconoció la misma solicitud idempotente y confirmó su estado durable.",
      );
      setFile(null);
      setDepartmentsTreeFile(null);
      setGeolocationFile(null);
      setMatchingRulesFile(null);
      setFileInputKey((current) => current + 1);
      setLegalConfirmed(false);
      setConfirmationPhrase("");
    } catch (error) {
      setActionError(
        error instanceof ApiError
          ? catalogErrorMessage(error)
          : error instanceof Error
            ? error.message
            : "No fue posible iniciar la ingesta electoral.",
      );
    } finally {
      setSubmitting(false);
    }
  }

  async function retrySelectedJob() {
    if (!selectedJob || !canImport || !retryConfirmed) return;
    setRetrying(true);
    setActionError(null);
    setNotice(null);
    try {
      const result = await retryElectoralCatalogImport(selectedJob.id);
      setSelectedJob(result.job);
      setJobs((current) =>
        current.map((job) => (job.id === result.job.id ? result.job : job)),
      );
      setRetryConfirmed(false);
      setPollCycles(0);
      setNotice(
        result.noOp
          ? "La ingesta ya había terminado correctamente; no se duplicó el trabajo."
          : "La ingesta fue reencolada sin volver a subir ni duplicar el artefacto.",
      );
    } catch (error) {
      setActionError(catalogErrorMessage(error));
    } finally {
      setRetrying(false);
    }
  }

  const pollingExhausted = hasPendingJob && pollCycles >= MAX_POLL_CYCLES;
  const inputsLocked = submitting || pendingPayload !== null;

  return (
    <section
      className="rounded-3xl border border-indigo-200 bg-gradient-to-br from-indigo-950 via-slate-950 to-slate-900 p-5 text-white shadow-xl shadow-indigo-950/10 sm:p-6"
      aria-labelledby="catalog-import-title"
    >
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="max-w-3xl">
          <p className="text-xs font-black uppercase tracking-[0.18em] text-indigo-300">
            Ingesta privada y auditable
          </p>
          <h2 id="catalog-import-title" className="mt-2 text-2xl font-black">
            Artefactos electorales de RNEC
          </h2>
          <p className="mt-2 text-sm font-semibold leading-6 text-slate-300">
            El navegador calcula SHA-256 y sube el JSON directamente al Storage
            privado. NestJS recibe únicamente metadatos, confirma el objeto y
            encola su procesamiento. El resultado queda en preparación: no es
            oficial ni operativo hasta superar validación independiente y quedar
            Activo.
          </p>
        </div>
        <button
          type="button"
          onClick={() => {
            setPollCycles(0);
            void loadJobs();
            if (selectedId) void loadJobDetail(selectedId);
          }}
          disabled={loadingJobs}
          className="inline-flex min-h-11 shrink-0 items-center justify-center gap-2 rounded-xl border border-white/20 bg-white/10 px-4 text-xs font-black uppercase tracking-wider text-white hover:bg-white/15 disabled:opacity-50"
        >
          <RefreshCw className={loadingJobs ? "animate-spin" : ""} size={16} />
          Actualizar ingestas
        </button>
      </div>

      {canImport ? (
        <form onSubmit={submitImport} className="mt-6 space-y-5">
          <fieldset disabled={inputsLocked} className="space-y-3">
            <legend className="text-xs font-black uppercase tracking-wider text-slate-300">
              Tipo de artefacto
            </legend>
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="flex cursor-pointer items-start gap-3 rounded-2xl border border-indigo-400/50 bg-indigo-400/10 p-4 text-sm font-semibold leading-6 text-slate-100">
                <input
                  type="radio"
                  name="artifact-mode"
                  value="RNEC_PACKAGE"
                  checked={artifactMode === "RNEC_PACKAGE"}
                  onChange={() => {
                    setArtifactMode("RNEC_PACKAGE");
                    setPendingPayload(null);
                  }}
                  className="mt-1 accent-indigo-400"
                />
                <span>
                  <strong className="block text-white">Paquete público RNEC</strong>
                  Construye localmente un envelope versionado con jerarquía y
                  geolocalización; no consulta fuentes por CORS ni incorpora datos.
                </span>
              </label>
              <label className="flex cursor-pointer items-start gap-3 rounded-2xl border border-white/15 bg-white/5 p-4 text-sm font-semibold leading-6 text-slate-200">
                <input
                  type="radio"
                  name="artifact-mode"
                  value="CANONICAL"
                  checked={artifactMode === "CANONICAL"}
                  onChange={() => {
                    setArtifactMode("CANONICAL");
                    setPendingPayload(null);
                  }}
                  className="mt-1 accent-indigo-400"
                />
                <span>
                  <strong className="block text-white">Árbol canónico preparado</strong>
                  Para un JSON ya transformado y verificable contra el contrato.
                </span>
              </label>
            </div>
          </fieldset>

          {artifactMode === "RNEC_PACKAGE" && !pendingPayload && (
            <div className="space-y-4 rounded-2xl border border-cyan-300/30 bg-cyan-300/5 p-4">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <p className="max-w-3xl text-sm font-semibold leading-6 text-cyan-50">
                  Selecciona las dos descargas oficiales conservadas localmente.
                  El navegador arma un paquete nuevo y lo envía por Storage firmado;
                  nunca descarga desde RNEC. Conserva como evidencia declarada la huella
                  SHA-256 de los bytes locales y el backend recalcula otra huella sobre
                  cada payload canónico. Una coincidencia ausente, ambigua o con coordenadas
                  fuera de rango hace fallar toda la ingesta. Una omisión de ambas
                  coordenadas exige código, valores originales exactos, justificación y
                  evidencia; nunca permite inventar coordenadas corregidas.
                </p>
                <button
                  type="button"
                  onClick={() => {
                    const template = createRnecPublicPackageTemplateFile();
                    const href = URL.createObjectURL(template);
                    const anchor = document.createElement("a");
                    anchor.href = href;
                    anchor.download = template.name;
                    anchor.click();
                    URL.revokeObjectURL(href);
                  }}
                  className="inline-flex min-h-11 shrink-0 items-center justify-center gap-2 rounded-xl border border-cyan-200/30 px-4 text-xs font-black uppercase tracking-wider text-cyan-50 hover:bg-cyan-200/10"
                >
                  <Download size={16} aria-hidden="true" />
                  Descargar plantilla no oficial
                </button>
              </div>
              <div className="grid gap-4 md:grid-cols-2">
                <label className="text-xs font-black uppercase tracking-wider text-slate-300 md:col-span-2">
                  Vuelta electoral vinculada a las fuentes
                  <select
                    required
                    value={electionRound}
                    onChange={(event) => {
                      const round = event.target.value as RnecElectionRound;
                      setElectionRound(round);
                      if (round === "FIRST_ROUND") {
                        setElectionDate("2026-05-31");
                        setDepartmentsTreeSourceUrl(
                          "https://divulgacione14presidente.registraduria.gov.co/assets/temis/divipol_json/departmentsTree.json",
                        );
                      } else {
                        setElectionDate("2026-06-21");
                        setDepartmentsTreeSourceUrl(
                          "https://e14segundavueltapresidente.registraduria.gov.co/assets/temis/divipol_json/departmentsTree.json",
                        );
                      }
                      setGeolocationSourceUrl(
                        round === "FIRST_ROUND"
                          ? "https://wapp.registraduria.gov.co/electoral/2026/presidente-de-la-republica/data/data.json"
                          : "https://wapp.registraduria.gov.co/electoral/2026/presidente-de-la-republica-segunda-vuelta/data/data.json",
                      );
                    }}
                    className="mt-2 min-h-12 w-full rounded-xl border border-slate-700 bg-slate-900 px-3 text-sm font-bold normal-case tracking-normal text-white"
                  >
                    <option value="FIRST_ROUND">Primera vuelta — 31 mayo 2026</option>
                    <option value="SECOND_ROUND">Segunda vuelta — 21 junio 2026</option>
                  </select>
                  <span className="mt-2 block normal-case tracking-normal text-amber-200">
                    La selección fija la fecha y la URL exacta del árbol. El backend
                    rechaza mezclas entre vueltas.
                  </span>
                </label>
                <label className="text-xs font-black uppercase tracking-wider text-slate-300">
                  departmentsTree oficial (JSON local)
                  <input
                    key={`tree-${fileInputKey}`}
                    required
                    type="file"
                    accept="application/json,.json"
                    onChange={(event) =>
                      setDepartmentsTreeFile(event.target.files?.[0] ?? null)
                    }
                    className="mt-2 block min-h-12 w-full rounded-xl border border-slate-700 bg-slate-900 px-3 py-2 text-sm font-semibold normal-case tracking-normal file:mr-3 file:rounded-lg file:border-0 file:bg-indigo-600 file:px-3 file:py-2 file:text-xs file:font-black file:text-white"
                  />
                </label>
                <label className="text-xs font-black uppercase tracking-wider text-slate-300">
                  Geolocalización oficial (JSON local)
                  <input
                    key={`geo-${fileInputKey}`}
                    required
                    type="file"
                    accept="application/json,.json"
                    onChange={(event) =>
                      setGeolocationFile(event.target.files?.[0] ?? null)
                    }
                    className="mt-2 block min-h-12 w-full rounded-xl border border-slate-700 bg-slate-900 px-3 py-2 text-sm font-semibold normal-case tracking-normal file:mr-3 file:rounded-lg file:border-0 file:bg-indigo-600 file:px-3 file:py-2 file:text-xs file:font-black file:text-white"
                  />
                </label>
                <label className="text-xs font-black uppercase tracking-wider text-slate-300 md:col-span-2">
                  Reglas opcionales: alias, overrides y omisiones (JSON local)
                  <input
                    key={`rules-${fileInputKey}`}
                    type="file"
                    accept="application/json,.json"
                    onChange={(event) =>
                      setMatchingRulesFile(event.target.files?.[0] ?? null)
                    }
                    className="mt-2 block min-h-12 w-full rounded-xl border border-slate-700 bg-slate-900 px-3 py-2 text-sm font-semibold normal-case tracking-normal file:mr-3 file:rounded-lg file:border-0 file:bg-indigo-600 file:px-3 file:py-2 file:text-xs file:font-black file:text-white"
                  />
                </label>
                <label className="text-xs font-black uppercase tracking-wider text-slate-300">
                  URL fuente de departmentsTree
                  <input
                    required
                    type="url"
                    maxLength={2048}
                    value={departmentsTreeSourceUrl}
                    onChange={(event) => setDepartmentsTreeSourceUrl(event.target.value)}
                    placeholder="https://…registraduria.gov.co/…/departmentsTree.json"
                    className="mt-2 min-h-12 w-full rounded-xl border border-slate-700 bg-slate-900 px-3 text-sm font-bold normal-case tracking-normal text-white"
                  />
                </label>
                <label className="text-xs font-black uppercase tracking-wider text-slate-300">
                  URL fuente de geolocalización
                  <input
                    required
                    type="url"
                    maxLength={2048}
                    value={geolocationSourceUrl}
                    onChange={(event) => setGeolocationSourceUrl(event.target.value)}
                    placeholder="https://…registraduria.gov.co/…/data.json"
                    className="mt-2 min-h-12 w-full rounded-xl border border-slate-700 bg-slate-900 px-3 text-sm font-bold normal-case tracking-normal text-white"
                  />
                </label>
              </div>
              <p className="text-xs font-bold leading-5 text-amber-200">
                El paquete sigue bloqueado para uso operativo: exige autorización
                escrita, declaración de licencia, validación y aprobación por una
                segunda persona antes de quedar Activo.
              </p>
            </div>
          )}

          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {artifactMode === "CANONICAL" && (
              <label className="text-xs font-black uppercase tracking-wider text-slate-300">
                Artefacto JSON
                <input
                  key={fileInputKey}
                  required={!pendingPayload}
                  disabled={inputsLocked}
                  type="file"
                  accept="application/json,.json"
                  onChange={(event) => {
                    setFile(event.target.files?.[0] ?? null);
                    setPendingPayload(null);
                  }}
                  className="mt-2 block min-h-12 w-full rounded-xl border border-slate-700 bg-slate-900 px-3 py-2 text-sm font-semibold normal-case tracking-normal file:mr-3 file:rounded-lg file:border-0 file:bg-indigo-600 file:px-3 file:py-2 file:text-xs file:font-black file:text-white disabled:opacity-60"
                />
              </label>
            )}
            <label className="text-xs font-black uppercase tracking-wider text-slate-300">
              Clave de catálogo
              <input
                required
                disabled={inputsLocked}
                value={catalogKey}
                onChange={(event) =>
                  setCatalogKey(event.target.value.toUpperCase())
                }
                pattern="[A-Z0-9][A-Z0-9._-]{2,159}"
                maxLength={160}
                placeholder="PRESIDENCIA_2026"
                className="mt-2 min-h-12 w-full rounded-xl border border-slate-700 bg-slate-900 px-3 text-sm font-bold normal-case tracking-normal text-white disabled:opacity-60"
              />
            </label>
            <label className="text-xs font-black uppercase tracking-wider text-slate-300">
              Nombre exacto del dataset
              <input
                required
                disabled={inputsLocked}
                minLength={3}
                maxLength={300}
                value={sourceDataset}
                onChange={(event) => setSourceDataset(event.target.value)}
                className="mt-2 min-h-12 w-full rounded-xl border border-slate-700 bg-slate-900 px-3 text-sm font-bold normal-case tracking-normal text-white disabled:opacity-60"
              />
            </label>
            <label className="text-xs font-black uppercase tracking-wider text-slate-300 md:col-span-2">
              URL HTTPS declarada de RNEC
              <input
                required
                disabled={inputsLocked}
                type="url"
                maxLength={2048}
                value={sourceUrl}
                onChange={(event) => setSourceUrl(event.target.value)}
                placeholder="https://www.registraduria.gov.co/…"
                className="mt-2 min-h-12 w-full rounded-xl border border-slate-700 bg-slate-900 px-3 text-sm font-bold normal-case tracking-normal text-white disabled:opacity-60"
              />
            </label>
            <label className="text-xs font-black uppercase tracking-wider text-slate-300">
              Fecha electoral
              <input
                required
                disabled={inputsLocked}
                type="date"
                value={electionDate}
                onChange={(event) => setElectionDate(event.target.value)}
                className="mt-2 min-h-12 w-full rounded-xl border border-slate-700 bg-slate-900 px-3 text-sm font-bold normal-case tracking-normal text-white disabled:opacity-60"
              />
            </label>
            <label className="text-xs font-black uppercase tracking-wider text-slate-300">
              Fecha y hora de corte
              <input
                required
                disabled={inputsLocked}
                type="datetime-local"
                value={sourceCutoffAt}
                onChange={(event) => setSourceCutoffAt(event.target.value)}
                className="mt-2 min-h-12 w-full rounded-xl border border-slate-700 bg-slate-900 px-3 text-sm font-bold normal-case tracking-normal text-white disabled:opacity-60"
              />
            </label>
            <label className="text-xs font-black uppercase tracking-wider text-slate-300">
              Referencia de autorización escrita
              <input
                required
                disabled={inputsLocked}
                minLength={3}
                maxLength={500}
                value={authorizationReference}
                onChange={(event) =>
                  setAuthorizationReference(event.target.value)
                }
                className="mt-2 min-h-12 w-full rounded-xl border border-slate-700 bg-slate-900 px-3 text-sm font-bold normal-case tracking-normal text-white disabled:opacity-60"
              />
            </label>
            <label className="text-xs font-black uppercase tracking-wider text-slate-300">
              Declaración de licencia y alcance
              <input
                required
                disabled={inputsLocked}
                minLength={3}
                maxLength={500}
                value={licenseDeclaration}
                onChange={(event) => setLicenseDeclaration(event.target.value)}
                className="mt-2 min-h-12 w-full rounded-xl border border-slate-700 bg-slate-900 px-3 text-sm font-bold normal-case tracking-normal text-white disabled:opacity-60"
              />
            </label>
          </div>

          {pendingPayload && (
            <div
              role="status"
              className="rounded-2xl border border-amber-400/40 bg-amber-300/10 p-4 text-sm font-semibold leading-6 text-amber-100"
            >
              El archivo ya fue confirmado en Storage. Reenvía exactamente la
              misma solicitud durable; no selecciones otro archivo ni cambies
              metadatos.
            </div>
          )}

          <label className="flex items-start gap-3 rounded-2xl border border-white/15 bg-white/5 p-4 text-sm font-semibold leading-6 text-slate-200">
            <input
              type="checkbox"
              checked={legalConfirmed}
              onChange={(event) => setLegalConfirmed(event.target.checked)}
              className="mt-1 h-4 w-4 shrink-0 accent-indigo-500"
            />
            <span>
              Confirmo que la organización posee autorización escrita vigente
              para almacenar y procesar este artefacto, que la licencia permite
              este uso, que la fecha electoral coincide con el perfil operativo
              y que revisé procedencia y fecha de corte. Entiendo que la ingesta
              no activa datos.
            </span>
          </label>
          <label className="block text-xs font-black uppercase tracking-wider text-slate-300">
            Escribe exactamente: INGESTAR RNEC
            <input
              required
              value={confirmationPhrase}
              onChange={(event) => setConfirmationPhrase(event.target.value)}
              autoComplete="off"
              className="mt-2 min-h-12 w-full max-w-md rounded-xl border border-slate-700 bg-slate-900 px-3 text-sm font-bold normal-case tracking-normal text-white"
            />
          </label>
          <button
            type="submit"
            disabled={
              submitting ||
              !legalConfirmed ||
              confirmationPhrase !== "INGESTAR RNEC"
            }
            className="inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-indigo-500 px-5 text-xs font-black uppercase tracking-wider text-white hover:bg-indigo-400 disabled:cursor-not-allowed disabled:opacity-50 sm:w-auto"
          >
            {submitting ? (
              <Loader2 className="animate-spin" size={17} aria-hidden="true" />
            ) : (
              <UploadCloud size={17} aria-hidden="true" />
            )}
            {submitting
              ? "Calculando, subiendo y registrando…"
              : pendingPayload
                ? "Reenviar solicitud durable"
                : "Subir y encolar ingesta"}
          </button>
        </form>
      ) : (
        <div className="mt-6 flex items-start gap-3 rounded-2xl border border-white/15 bg-white/5 p-4 text-sm font-semibold leading-6 text-slate-200">
          <ShieldAlert
            className="mt-0.5 shrink-0 text-amber-300"
            aria-hidden="true"
          />
          <p>
            Modo de observación: Cumplimiento y Auditoría pueden vigilar
            trabajos, procedencia y fallos, pero solo Administración puede
            subir, encolar o reintentar una ingesta.
          </p>
        </div>
      )}

      {actionError && (
        <div
          role="alert"
          className="mt-5 rounded-2xl border border-red-400/50 bg-red-300/10 p-4 text-sm font-semibold text-red-100"
        >
          {actionError}
        </div>
      )}
      {notice && (
        <div
          role="status"
          className="mt-5 rounded-2xl border border-emerald-400/40 bg-emerald-300/10 p-4 text-sm font-semibold text-emerald-100"
        >
          {notice}
        </div>
      )}

      <div className="mt-7 grid min-w-0 gap-5 lg:grid-cols-[20rem_minmax(0,1fr)]">
        <div className="space-y-3">
          <label className="block text-xs font-black uppercase tracking-wider text-slate-300">
            Estado de ingesta
            <select
              value={statusFilter}
              onChange={(event) => {
                setStatusFilter(
                  event.target.value as ElectoralCatalogImportStatus | "",
                );
                setPollCycles(0);
              }}
              className="mt-2 min-h-11 w-full rounded-xl border border-slate-700 bg-slate-900 px-3 text-sm font-bold normal-case tracking-normal text-white"
            >
              <option value="">Todos</option>
              {Object.entries(STATUS_LABELS).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </label>
          {loadingJobs && jobs.length === 0 ? (
            <div
              role="status"
              className="flex min-h-32 items-center justify-center gap-2 rounded-2xl border border-white/10 bg-white/5 text-sm font-bold text-slate-300"
            >
              <Loader2 className="animate-spin" aria-hidden="true" />{" "}
              Consultando…
            </div>
          ) : jobs.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-slate-700 p-5 text-center text-sm font-semibold text-slate-400">
              No hay ingestas para este filtro.
            </div>
          ) : (
            jobs.map((job) => (
              <button
                key={job.id}
                type="button"
                aria-pressed={selectedId === job.id}
                onClick={() => setSelectedId(job.id)}
                className={`w-full rounded-2xl border p-4 text-left ${
                  selectedId === job.id
                    ? "border-indigo-400 bg-indigo-400/15"
                    : "border-white/10 bg-white/5 hover:bg-white/10"
                }`}
              >
                <span
                  className={`inline-flex rounded-full border px-2 py-1 text-[10px] font-black uppercase tracking-wider ${STATUS_STYLES[job.status]}`}
                >
                  {STATUS_LABELS[job.status]}
                </span>
                <span className="mt-2 block break-words text-sm font-black text-white">
                  {job.sourceDataset}
                </span>
                <span className="mt-1 block text-xs font-semibold text-slate-400">
                  Intentos: {job.attempts} · {formatDate(job.updatedAt)}
                </span>
              </button>
            ))
          )}
        </div>

        <div className="min-w-0 rounded-2xl border border-white/10 bg-white p-5 text-slate-950">
          {loadError && (
            <div
              role="alert"
              className="mb-4 rounded-xl border border-red-200 bg-red-50 p-3 text-sm font-semibold text-red-950"
            >
              {loadError}
            </div>
          )}
          {pollingExhausted && (
            <div
              role="status"
              className="mb-4 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm font-semibold text-amber-950"
            >
              El seguimiento automático se detuvo después de dos minutos.
              Actualiza manualmente; no se interpreta la demora como éxito ni
              como fallo.
            </div>
          )}
          {!pageVisible && hasPendingJob && (
            <div
              role="status"
              className="mb-4 rounded-xl border border-blue-200 bg-blue-50 p-3 text-sm font-semibold text-blue-950"
            >
              Seguimiento pausado mientras esta pestaña está oculta.
            </div>
          )}
          {loadingDetail ? (
            <div
              role="status"
              className="flex min-h-56 items-center justify-center gap-2 font-bold text-slate-500"
            >
              <Loader2 className="animate-spin" aria-hidden="true" />{" "}
              Verificando estado…
            </div>
          ) : !selectedJob ? (
            <div className="flex min-h-56 flex-col items-center justify-center text-center text-slate-500">
              <FileJson
                size={38}
                className="text-slate-300"
                aria-hidden="true"
              />
              <p className="mt-3 font-black text-slate-900">
                Selecciona una ingesta
              </p>
            </div>
          ) : (
            <div className="space-y-5" aria-live="polite">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <span
                    className={`inline-flex rounded-full border px-3 py-1 text-[10px] font-black uppercase tracking-wider ${STATUS_STYLES[selectedJob.status]}`}
                  >
                    {STATUS_LABELS[selectedJob.status]}
                  </span>
                  <h3 className="mt-3 text-xl font-black">
                    {selectedJob.sourceDataset}
                  </h3>
                  <p className="mt-1 text-xs font-bold text-slate-500">
                    Solicitud {selectedJob.clientRequestId}
                  </p>
                </div>
                {isPendingCatalogImport(selectedJob.status) && (
                  <div className="inline-flex items-center gap-2 text-xs font-black uppercase tracking-wider text-blue-800">
                    <Clock3
                      className="animate-pulse"
                      size={16}
                      aria-hidden="true"
                    />{" "}
                    Seguimiento {pollCycles}/{MAX_POLL_CYCLES}
                  </div>
                )}
              </div>

              <dl className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
                <DetailValue label="Clave" value={selectedJob.catalogKey} />
                <DetailValue
                  label="Fecha electoral"
                  value={formatDate(selectedJob.electionDate, false)}
                />
                <DetailValue
                  label="Fuente RNEC declarada"
                  value={selectedJob.sourceUrl}
                />
                <DetailValue
                  label="Corte de fuente"
                  value={formatDate(selectedJob.sourceCutoffAt)}
                />
                <DetailValue
                  label="Solicitante (ID)"
                  value={selectedJob.requestedById}
                />
                <DetailValue
                  label="Intentos"
                  value={String(selectedJob.attempts)}
                />
                <DetailValue
                  label="Última actualización"
                  value={formatDate(selectedJob.updatedAt)}
                />
                <DetailValue
                  label="Autorización"
                  value={selectedJob.authorizationReference}
                />
                <DetailValue
                  label="Licencia"
                  value={selectedJob.licenseDeclaration}
                />
                <DetailValue
                  label="Artefacto privado"
                  value={selectedJob.sourceArtifactPath}
                />
              </dl>
              <div className="rounded-xl bg-slate-950 p-3 text-white">
                <p className="text-[10px] font-black uppercase tracking-wider text-slate-400">
                  SHA-256 calculado en navegador
                </p>
                <code className="mt-2 block break-all text-xs leading-5 text-blue-200">
                  {selectedJob.expectedContentSha256}
                </code>
              </div>

              {selectedJob.status === "SUCCEEDED" && (
                <div className="flex items-start gap-3 rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm font-semibold leading-6 text-emerald-950">
                  <CheckCircle2
                    className="mt-0.5 shrink-0"
                    aria-hidden="true"
                  />
                  <p>
                    El procesamiento creó o reconoció el snapshot{" "}
                    {selectedJob.releaseId ?? "sin identificador"}. Aún debe
                    revisarse, validarse y activarse por una segunda persona
                    antes de uso operativo.
                  </p>
                </div>
              )}
              {selectedJob.status === "FAILED" && (
                <div className="space-y-4">
                  <div className="flex items-start gap-3 rounded-xl border border-red-200 bg-red-50 p-4 text-sm font-semibold leading-6 text-red-950">
                    <AlertCircle
                      className="mt-0.5 shrink-0"
                      aria-hidden="true"
                    />
                    <div>
                      <p className="font-black">
                        {selectedJob.lastErrorCode ?? "Fallo de ingesta"}
                      </p>
                      <p>
                        {selectedJob.lastErrorMessage ??
                          "El procesador no informó un detalle seguro."}
                      </p>
                    </div>
                  </div>
                  {canImport && (
                    <>
                      <label className="flex items-start gap-3 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm font-semibold leading-6 text-amber-950">
                        <input
                          type="checkbox"
                          checked={retryConfirmed}
                          onChange={(event) =>
                            setRetryConfirmed(event.target.checked)
                          }
                          className="mt-1 h-4 w-4 shrink-0 accent-amber-700"
                        />
                        Confirmo que revisé la causa segura del fallo y que
                        reintentar no sustituye la validación humana posterior.
                      </label>
                      <button
                        type="button"
                        onClick={() => void retrySelectedJob()}
                        disabled={retrying || !retryConfirmed}
                        className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-amber-700 px-4 text-xs font-black uppercase tracking-wider text-white hover:bg-amber-600 disabled:opacity-50"
                      >
                        {retrying ? (
                          <Loader2 className="animate-spin" size={16} />
                        ) : (
                          <RotateCcw size={16} />
                        )}
                        {retrying ? "Reencolando…" : "Reintentar ingesta"}
                      </button>
                    </>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
