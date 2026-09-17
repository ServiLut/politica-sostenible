"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  AlertCircle,
  AlertTriangle,
  Archive,
  CheckCircle2,
  Download,
  FileCheck2,
  FolderOpen,
  Loader2,
  Printer,
  RefreshCw,
  ShieldCheck,
} from "lucide-react";
import { Button } from "@/components/ui";
import { useAuth } from "@/context/auth";
import { ApiError } from "@/lib/api-client";
import {
  generatePostElectionHandover,
  getPostElectionHandover,
  listPostElectionHandovers,
  type HandoverStatus,
  type PostElectionHandoverReport,
  type PostElectionHandoverReportSummary,
} from "@/lib/transition-handover-api";
import { getHandoverActionGuidance } from "@/lib/role-action-guidance";
import type { BackendUserRole } from "@/types/saas-schema";

const ALLOWED_ROLES = new Set<BackendUserRole>([
  "ADMIN",
  "COMPLIANCE_OFFICER",
  "AUDITOR",
]);

const STATUS_STYLE: Record<
  HandoverStatus,
  { label: string; className: string; Icon: typeof CheckCircle2 }
> = {
  READY: {
    label: "Listo para revisión final",
    className: "border-emerald-200 bg-emerald-50 text-emerald-950",
    Icon: CheckCircle2,
  },
  ATTENTION: {
    label: "Requiere atención",
    className: "border-amber-200 bg-amber-50 text-amber-950",
    Icon: AlertTriangle,
  },
  BLOCKED: {
    label: "Cierre bloqueado",
    className: "border-red-200 bg-red-50 text-red-950",
    Icon: AlertCircle,
  },
};

function formatNumber(value: number) {
  return new Intl.NumberFormat("es-CO").format(value);
}

function formatMoney(value: number) {
  return new Intl.NumberFormat("es-CO", {
    style: "currency",
    currency: "COP",
    maximumFractionDigits: 2,
  }).format(value);
}

function formatDate(value: string | null, includeTime = false) {
  if (!value) return "Sin configurar";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Fecha no disponible";
  return new Intl.DateTimeFormat("es-CO", {
    dateStyle: "long",
    ...(includeTime ? { timeStyle: "short" as const } : {}),
    timeZone: "America/Bogota",
  }).format(date);
}

function formatStoredDateOnly(value: string | null) {
  if (!value) return "Sin configurar";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Fecha no disponible";
  return new Intl.DateTimeFormat("es-CO", {
    dateStyle: "long",
    timeZone: "UTC",
  }).format(date);
}

function readableError(error: unknown) {
  if (error instanceof ApiError) return error.message;
  if (error instanceof Error && error.message) return error.message;
  return "No fue posible consultar el expediente poselectoral.";
}

function isAbortError(error: unknown) {
  return error instanceof DOMException && error.name === "AbortError";
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4">
      <dt className="text-[10px] font-black uppercase tracking-[0.15em] text-slate-500">
        {label}
      </dt>
      <dd className="mt-2 break-words text-lg font-black text-slate-950">
        {value}
      </dd>
    </div>
  );
}

export default function TransitionPage() {
  const { tenant, user } = useAuth();
  const [report, setReport] = useState<PostElectionHandoverReport | null>(null);
  const [reportOrigin, setReportOrigin] = useState<
    "GENERATED" | "STORED" | null
  >(null);
  const [history, setHistory] = useState<PostElectionHandoverReportSummary[]>(
    [],
  );
  const [historyLoading, setHistoryLoading] = useState(true);
  const [historyError, setHistoryError] = useState<string | null>(null);
  const [openingReportId, setOpeningReportId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const canGenerate = Boolean(user && ALLOWED_ROLES.has(user.backendRole));
  const isPostElection =
    tenant?.operationStage === "POST_ELECTION" ||
    tenant?.operationStage === "CLOSED";

  useEffect(() => {
    if (!canGenerate) return;
    const controller = new AbortController();

    void listPostElectionHandovers(1, 25, controller.signal)
      .then(({ items }) => {
        setHistory(items);
        setHistoryError(null);
      })
      .catch((requestError: unknown) => {
        if (!isAbortError(requestError)) {
          setHistoryError(readableError(requestError));
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) setHistoryLoading(false);
      });

    return () => controller.abort();
  }, [canGenerate]);

  async function refreshHistory() {
    try {
      const { items } = await listPostElectionHandovers();
      setHistory(items);
      setHistoryError(null);
    } catch (requestError) {
      setHistoryError(readableError(requestError));
    }
  }

  async function generate() {
    if (loading) return;
    setLoading(true);
    setError(null);
    try {
      const generated = await generatePostElectionHandover();
      setReport(generated);
      setReportOrigin("GENERATED");
      await refreshHistory();
    } catch (requestError) {
      setError(readableError(requestError));
    } finally {
      setLoading(false);
    }
  }

  async function openStoredReport(reportId: string) {
    if (openingReportId) return;
    setOpeningReportId(reportId);
    setError(null);
    try {
      const stored = await getPostElectionHandover(reportId);
      setReport(stored);
      setReportOrigin("STORED");
    } catch (requestError) {
      setError(readableError(requestError));
    } finally {
      setOpeningReportId(null);
    }
  }

  function downloadReport() {
    if (!report) return;
    const blob = new Blob([JSON.stringify(report, null, 2)], {
      type: "application/json;charset=utf-8",
    });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `expediente-empalme-${report.reportId}.json`;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="mx-auto w-full max-w-7xl space-y-6 p-4 pb-28 sm:p-6 lg:p-8 lg:pb-8">
      <header className="overflow-hidden rounded-3xl bg-slate-950 p-6 text-white shadow-xl sm:p-8">
        <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
          <div className="max-w-3xl">
            <p className="text-xs font-black uppercase tracking-[0.18em] text-blue-300">
              Cierre documentado de la operación
            </p>
            <h1 className="mt-3 text-3xl font-black tracking-tight sm:text-4xl">
              Cierre y transición responsable
            </h1>
            <p className="mt-4 max-w-2xl text-sm font-semibold leading-6 text-slate-300">
              Consolida un corte interno con pendientes financieros, operativos,
              de actas, evidencia y privacidad. Cada generación queda auditada y
              lleva una huella SHA-256.
            </p>
          </div>
          {canGenerate && (
            <Button
              type="button"
              onClick={() => void generate()}
              disabled={loading || !isPostElection}
              className="min-h-12 gap-2 bg-blue-600 text-white hover:bg-blue-500"
            >
              {loading ? (
                <Loader2
                  aria-hidden="true"
                  className="animate-spin"
                  size={18}
                />
              ) : report ? (
                <RefreshCw aria-hidden="true" size={18} />
              ) : (
                <FileCheck2 aria-hidden="true" size={18} />
              )}
              {loading
                ? "Generando…"
                : report
                  ? "Generar nuevo corte"
                  : "Generar expediente"}
            </Button>
          )}
        </div>
      </header>

      {!isPostElection && (
        <section
          role="status"
          className="rounded-3xl border border-blue-200 bg-blue-50 p-6 text-blue-950"
        >
          <ShieldCheck aria-hidden="true" size={28} />
          <h2 className="mt-4 text-xl font-black">Aún no corresponde cerrar</h2>
          <p className="mt-2 max-w-3xl text-sm font-semibold leading-6">
            El expediente se habilita únicamente en Poselectoral o Cerrada. Usa
            el perfil de operación para avanzar por el ciclo con trazabilidad;
            no se permite saltar silenciosamente desde campaña o jornada.
          </p>
          <Link
            href="/dashboard/operation-profile"
            className="mt-4 inline-flex min-h-11 items-center rounded-xl bg-blue-800 px-4 text-xs font-black uppercase tracking-wider text-white"
          >
            Revisar perfil de operación
          </Link>
        </section>
      )}

      {!canGenerate && (
        <section className="rounded-3xl border border-amber-200 bg-amber-50 p-6 text-amber-950">
          <h2 className="text-lg font-black">Consulta especializada</h2>
          <p className="mt-2 text-sm font-semibold leading-6">
            Solo Administración, Cumplimiento o Auditoría pueden generar este
            corte sensible. El servidor vuelve a validar el rol vigente.
          </p>
        </section>
      )}

      {error && (
        <div
          role="alert"
          className="flex items-start gap-3 rounded-2xl border border-red-200 bg-red-50 p-4 text-sm font-semibold text-red-950"
        >
          <AlertCircle
            aria-hidden="true"
            className="mt-0.5 shrink-0"
            size={20}
          />
          <span>{error}</span>
        </div>
      )}

      {canGenerate && (
        <section
          aria-labelledby="handover-history-title"
          className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm"
        >
          <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <p className="text-xs font-black uppercase tracking-[0.16em] text-slate-500">
                Archivo inmutable
              </p>
              <h2
                id="handover-history-title"
                className="mt-1 text-xl font-black text-slate-950"
              >
                Expedientes conservados
              </h2>
            </div>
            <p className="max-w-xl text-xs font-semibold leading-5 text-slate-500">
              Abrir un corte anterior recupera ese mismo payload por su ID. No
              recalcula cifras ni crea un expediente nuevo.
            </p>
          </div>

          {historyError && (
            <div
              role="alert"
              className="mt-4 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm font-semibold text-amber-950"
            >
              No fue posible actualizar el archivo conservado: {historyError}
            </div>
          )}

          {historyLoading ? (
            <div
              role="status"
              className="mt-5 flex items-center gap-2 text-sm font-semibold text-slate-600"
            >
              <Loader2 aria-hidden="true" className="animate-spin" size={18} />
              Consultando expedientes conservados…
            </div>
          ) : history.length === 0 ? (
            <p className="mt-5 rounded-2xl bg-slate-50 p-4 text-sm font-semibold text-slate-600">
              Aún no hay expedientes conservados. La primera generación se
              guardará aquí con ID y huella propios.
            </p>
          ) : (
            <ul className="mt-5 space-y-3">
              {history.map((item) => {
                const selected = report?.reportId === item.reportId;
                return (
                  <li
                    key={item.reportId}
                    className={`rounded-2xl border p-4 ${
                      selected
                        ? "border-blue-400 bg-blue-50"
                        : "border-slate-200 bg-slate-50"
                    }`}
                  >
                    <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="rounded-full bg-white px-2.5 py-1 text-[10px] font-black uppercase tracking-wider text-slate-700">
                            {STATUS_STYLE[item.status].label}
                          </span>
                          <span className="text-xs font-bold text-slate-500">
                            {formatDate(item.generatedAt, true)}
                          </span>
                        </div>
                        <p className="mt-2 text-sm font-black text-slate-950">
                          Generado por {item.generatedBy.name} ·{" "}
                          {item.generatedBy.role}
                        </p>
                        <code className="mt-1 block break-all text-[11px] font-semibold text-slate-500">
                          ID {item.reportId} · SHA-256 {item.sha256}
                        </code>
                      </div>
                      <Button
                        type="button"
                        variant="outline"
                        aria-pressed={selected}
                        disabled={openingReportId !== null}
                        onClick={() => void openStoredReport(item.reportId)}
                        className="shrink-0"
                      >
                        {openingReportId === item.reportId ? (
                          <Loader2
                            aria-hidden="true"
                            className="animate-spin"
                            size={17}
                          />
                        ) : (
                          <FolderOpen aria-hidden="true" size={17} />
                        )}
                        {selected && reportOrigin === "STORED"
                          ? "Expediente abierto"
                          : "Abrir expediente guardado"}
                      </Button>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      )}

      {report && (
        <div className="space-y-6" aria-live="polite">
          <section
            className={`rounded-3xl border p-6 ${STATUS_STYLE[report.status].className}`}
          >
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex items-start gap-3">
                {(() => {
                  const StatusIcon = STATUS_STYLE[report.status].Icon;
                  return (
                    <StatusIcon
                      aria-hidden="true"
                      className="shrink-0"
                      size={26}
                    />
                  );
                })()}
                <div>
                  <p className="text-xs font-black uppercase tracking-wider">
                    {STATUS_STYLE[report.status].label}
                  </p>
                  <p className="mt-1 text-sm font-semibold">
                    {reportOrigin === "STORED"
                      ? "Expediente conservado, recuperado sin regeneración"
                      : "Nuevo expediente persistido"}
                    {" · "}
                    {formatDate(report.generatedAt, true)}
                  </p>
                  <code className="mt-1 block break-all text-[11px] font-bold opacity-80">
                    ID {report.reportId}
                  </code>
                </div>
              </div>
              <div className="flex flex-wrap gap-2 print:hidden">
                <Button
                  type="button"
                  variant="outline"
                  onClick={downloadReport}
                >
                  <Download aria-hidden="true" size={17} /> Descargar JSON
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => window.print()}
                >
                  <Printer aria-hidden="true" size={17} /> Imprimir
                </Button>
              </div>
            </div>
          </section>

          <section className="grid gap-6 lg:grid-cols-2">
            <article className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
              <p className="text-xs font-black uppercase tracking-[0.16em] text-slate-500">
                Elección y alcance
              </p>
              <h2 className="mt-2 text-xl font-black text-slate-950">
                {report.election.name ?? report.organization.name}
              </h2>
              <dl className="mt-5 grid gap-3 sm:grid-cols-2">
                <Metric
                  label="Fecha electoral"
                  value={formatDate(report.election.date)}
                />
                <Metric label="Etapa" value={report.lifecycle.stage} />
                <Metric
                  label="Tipo de cierre"
                  value={
                    report.lifecycle.closureType === "CLOSED_EXCEPTIONAL"
                      ? "Cierre excepcional"
                      : report.lifecycle.closureType === "CLOSED_NORMAL"
                        ? "Cierre ordinario"
                        : "Aún sin cierre"
                  }
                />
                <Metric
                  label="Circunscripción"
                  value={report.election.circumscriptionName}
                />
                <Metric
                  label="Retención definida"
                  value={`${formatNumber(report.lifecycle.retentionPeriodDays)} días`}
                />
              </dl>
              {report.termination && (
                <div className="mt-5 rounded-2xl border-2 border-red-300 bg-red-50 p-4 text-sm font-semibold leading-6 text-red-950">
                  <p className="font-black">
                    Terminación excepcional irreversible
                  </p>
                  <p>
                    Efectiva: {formatDate(report.termination.effectiveAt, true)}
                    . Revisión:{" "}
                    {formatDate(report.termination.reviewedAt, true)}.
                  </p>
                  <p>
                    Revisor:{" "}
                    {report.termination.reviewer?.name ?? "No disponible"}
                    {report.termination.reviewer
                      ? ` · ${report.termination.reviewer.role}`
                      : ""}
                    .
                  </p>
                  <Link
                    href="/dashboard/operation-profile"
                    className="mt-2 inline-block font-black underline"
                  >
                    Abrir expediente causal y obligaciones
                  </Link>
                </div>
              )}
            </article>

            <article className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
              <p className="text-xs font-black uppercase tracking-[0.16em] text-slate-500">
                Cierre financiero interno
              </p>
              <dl className="mt-5 grid gap-3 sm:grid-cols-2">
                <Metric
                  label="Ingresos"
                  value={formatMoney(report.finance.income)}
                />
                <Metric
                  label="Gastos"
                  value={formatMoney(report.finance.expenses)}
                />
                <Metric
                  label="Balance"
                  value={formatMoney(report.finance.balance)}
                />
                <Metric
                  label="Reportados"
                  value={formatNumber(report.finance.reported)}
                />
                <Metric
                  label="Pendientes de revisión"
                  value={formatNumber(report.finance.pendingReview)}
                />
                <Metric
                  label="Aprobados sin constancia"
                  value={formatNumber(report.finance.approvedNotReported)}
                />
                <Metric
                  label="Expediente financiero listo"
                  value={report.finance.closeoutReady ? "Sí" : "No"}
                />
              </dl>
              <p className="mt-4 text-xs font-semibold leading-5 text-slate-500">
                Fecha configurada de reporte:{" "}
                {formatStoredDateOnly(report.finance.reportDeadline)}. Este
                corte no equivale a una radicación en Cuentas Claras.
              </p>
              {!report.finance.closeoutReady && (
                <p className="mt-2 text-xs font-semibold leading-5 text-amber-800">
                  Bloqueos del mismo control usado por el cierre:{" "}
                  {report.finance.closeoutBlockerCodes.join(", ")}.
                </p>
              )}
            </article>
          </section>

          <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
            <div className="flex items-center gap-3">
              <Archive aria-hidden="true" className="text-blue-800" size={24} />
              <div>
                <p className="text-xs font-black uppercase tracking-[0.16em] text-slate-500">
                  Operación y evidencia
                </p>
                <h2 className="mt-1 text-xl font-black text-slate-950">
                  Pendientes del corte
                </h2>
              </div>
            </div>
            <dl className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <Metric
                label="Tareas abiertas"
                value={formatNumber(report.operation.openTasks)}
              />
              <Metric
                label="Casos abiertos"
                value={formatNumber(report.operation.openCases)}
              />
              <Metric
                label="Actas por revisar"
                value={formatNumber(report.operation.e14PendingReview)}
              />
              <Metric
                label="Evidencias sin asociar"
                value={formatNumber(report.evidence.confirmedNotAssociated)}
              />
            </dl>

            {report.actions.length === 0 ? (
              <div className="mt-5 rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-sm font-semibold text-emerald-950">
                No hay pendientes detectados por este corte. Aún se requiere
                revisión humana, contable, jurídica y electoral antes del
                cierre.
              </div>
            ) : (
              <ul className="mt-6 space-y-3">
                {report.actions.map((action) => {
                  const guidance = getHandoverActionGuidance(
                    action.code,
                    user?.backendRole,
                  );
                  return (
                    <li
                      key={action.code}
                      className={`rounded-2xl border p-4 ${
                        action.severity === "BLOCK"
                          ? "border-red-200 bg-red-50"
                          : "border-amber-200 bg-amber-50"
                      }`}
                    >
                      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                        <div>
                          <p className="text-sm font-black text-slate-950">
                            {action.severity === "BLOCK"
                              ? "Bloqueante · "
                              : "Atención · "}
                            {action.label}
                          </p>
                          <p className="mt-1 text-sm font-semibold leading-6 text-slate-700">
                            {action.detail}
                          </p>
                        </div>
                        {guidance.linkLabel ? (
                          <Link
                            href={action.href}
                            className="shrink-0 text-xs font-black uppercase tracking-wider text-blue-800 underline underline-offset-4"
                          >
                            {guidance.linkLabel}
                          </Link>
                        ) : (
                          <p className="max-w-sm shrink-0 text-xs font-bold leading-5 text-amber-900 sm:text-right">
                            {guidance.advice}
                          </p>
                        )}
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>

          <section className="grid gap-6 lg:grid-cols-[1.2fr_0.8fr]">
            <article className="rounded-3xl border border-blue-200 bg-blue-50 p-6 text-blue-950">
              <ShieldCheck aria-hidden="true" size={26} />
              <h2 className="mt-4 text-xl font-black">
                Campaña y gestión pública no se mezclan
              </h2>
              <p className="mt-2 text-sm font-semibold leading-6">
                {report.transitionPolicy.explanation}
              </p>
              <ol className="mt-4 list-decimal space-y-2 pl-5 text-sm font-semibold leading-6">
                <li>
                  Crear una organización separada de tipo gestión pública.
                </li>
                <li>
                  Definir finalidad, aviso, responsables y conservación propios.
                </li>
                <li>
                  Evaluar registro por registro antes de cualquier transferencia
                  autorizada.
                </li>
                <li>
                  Conservar el expediente de campaña conforme a su política y
                  obligaciones.
                </li>
              </ol>
            </article>

            <article className="rounded-3xl border border-slate-200 bg-slate-950 p-6 text-white">
              <p className="text-xs font-black uppercase tracking-[0.16em] text-slate-400">
                Integridad del corte
              </p>
              <p className="mt-3 text-sm font-bold">
                {report.integrity.algorithm}
              </p>
              <code className="mt-2 block break-all rounded-xl bg-white/10 p-3 text-xs leading-5 text-blue-100">
                {report.integrity.sha256}
              </code>
              <p className="mt-4 text-xs font-semibold leading-5 text-slate-300">
                La huella identifica el contenido del expediente, excluyendo el
                bloque de integridad que contiene la propia huella. Un nuevo
                corte tendrá otra fecha y quedará registrado en auditoría.
              </p>
            </article>
          </section>

          <p className="rounded-2xl border border-slate-200 bg-slate-50 p-4 text-xs font-semibold leading-5 text-slate-600">
            {report.disclaimer}
          </p>
        </div>
      )}
    </div>
  );
}
