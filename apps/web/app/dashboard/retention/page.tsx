"use client";

import { FormEvent, useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import {
  AlertCircle,
  ArchiveRestore,
  CheckCircle2,
  FileClock,
  Loader2,
  LockKeyhole,
  RefreshCw,
  Scale,
  ShieldAlert,
} from "lucide-react";
import { Button } from "@/components/ui";
import { useAuth } from "@/context/auth";
import { ApiError } from "@/lib/api-client";
import {
  cancelRetentionDisposition,
  computeRetentionDispositionCancellationSha256,
  computeRetentionDispositionPayloadSha256,
  computeRetentionDispositionReviewSha256,
  computeRetentionLegalHoldPayloadSha256,
  computeRetentionLegalHoldRevocationSha256,
  createRetentionLegalHold,
  getRetentionGovernance,
  previewRetention,
  requestRetentionDisposition,
  RETENTION_DATA_SCOPES,
  reviewRetentionDisposition,
  revokeRetentionLegalHold,
  type RetentionDataScope,
  type RetentionDispositionRequest,
  type RetentionGovernanceOverview,
  type RetentionLegalHold,
  type RetentionPreview,
} from "@/lib/retention-governance-api";

const MUTATION_ROLES = new Set(["ADMIN", "COMPLIANCE_OFFICER"]);
const INPUT_CLASS =
  "mt-2 min-h-11 w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-950 outline-none transition focus:border-blue-600 focus:ring-2 focus:ring-blue-200 disabled:cursor-not-allowed disabled:bg-slate-100";

const SCOPE_LABELS: Record<RetentionDataScope, string> = {
  DATA_SUBJECT_RECORDS: "Personas y consentimientos",
  COMMUNICATION_INTERACTIONS: "Interacciones de comunicaciones",
  STORED_OBJECTS: "Archivos almacenados",
  FINANCIAL_RECORDS: "Registros financieros",
  ELECTORAL_EVIDENCE: "Evidencia electoral E-14",
  AUDIT_TRAIL: "Trazabilidad de auditoría",
  ALL_TENANT_RECORDS: "Todo el expediente del espacio",
};

const STATUS_LABELS: Record<RetentionDispositionRequest["status"], string> = {
  PENDING: "Pendiente de cuatro ojos",
  APPROVED_NOT_EXECUTED: "Aprobada, no ejecutada",
  REJECTED: "Rechazada",
  CANCELLED: "Cancelada",
};

function currentLocalDateTime() {
  const now = new Date();
  const local = new Date(now.getTime() - now.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 16);
}

function formatDate(value: string | null) {
  if (!value) return "Sin dato";
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return "Fecha inválida";
  return new Intl.DateTimeFormat("es-CO", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "America/Bogota",
  }).format(date);
}

function formatNumber(value: number | null) {
  return value === null ? "No aplica" : new Intl.NumberFormat("es-CO").format(value);
}

function readableError(error: unknown) {
  if (error instanceof ApiError) return error.message;
  if (error instanceof Error && error.message) return error.message;
  return "No fue posible completar la operación.";
}

export default function RetentionGovernancePage() {
  const { user } = useAuth();
  const [overview, setOverview] =
    useState<RetentionGovernanceOverview | null>(null);
  const [preview, setPreview] = useState<RetentionPreview | null>(null);
  const [scope, setScope] = useState<RetentionDataScope>(
    "DATA_SUBJECT_RECORDS",
  );
  const [cutoff, setCutoff] = useState(currentLocalDateTime);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [selectedRequest, setSelectedRequest] =
    useState<RetentionDispositionRequest | null>(null);
  const [selectedHold, setSelectedHold] = useState<RetentionLegalHold | null>(
    null,
  );
  const feedbackRef = useRef<HTMLDivElement>(null);
  const canMutate = Boolean(
    user && MUTATION_ROLES.has(user.backendRole),
  );

  const refresh = useCallback(async (signal?: AbortSignal) => {
    const result = await getRetentionGovernance(signal);
    setOverview(result);
    setSelectedRequest((current) =>
      current
        ? (result.requests.find((item) => item.id === current.id) ?? null)
        : null,
    );
    setSelectedHold((current) =>
      current
        ? (result.legalHolds.find((item) => item.id === current.id) ?? null)
        : null,
    );
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    void refresh(controller.signal)
      .catch((requestError: unknown) => {
        if (
          requestError instanceof DOMException &&
          requestError.name === "AbortError"
        ) {
          return;
        }
        setError(readableError(requestError));
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [refresh]);

  useEffect(() => {
    if (error || notice) feedbackRef.current?.focus();
  }, [error, notice]);

  async function runPreview(event?: FormEvent) {
    event?.preventDefault();
    if (busy) return;
    setBusy("preview");
    setError(null);
    setNotice(null);
    try {
      const cutoffIso = new Date(cutoff).toISOString();
      setPreview(await previewRetention(scope, cutoffIso));
    } catch (requestError) {
      setError(readableError(requestError));
    } finally {
      setBusy(null);
    }
  }

  async function submitDisposition(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!preview || busy) return;
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    const hashInput = {
      clientRequestId: crypto.randomUUID(),
      expectedPreviewSha256: preview.previewSha256,
      expectedProfileUpdatedAt: preview.profileUpdatedAt ?? "",
      scope: preview.scope,
      cutoffAt: preview.cutoffAt,
      justification: String(form.get("justification") ?? ""),
      legalReference: String(form.get("legalReference") ?? ""),
      evidenceReference: String(form.get("evidenceReference") ?? ""),
      evidenceSha256: String(form.get("evidenceSha256") ?? ""),
      legalPolicyRequiredAcknowledged: true as const,
      backupRestoreRequiredAcknowledged: true as const,
      executorUnavailableAcknowledged: true as const,
    };
    setBusy("request");
    setError(null);
    setNotice(null);
    try {
      await requestRetentionDisposition({
        ...hashInput,
        payloadSha256:
          await computeRetentionDispositionPayloadSha256(hashInput),
      });
      setNotice(
        "Solicitud registrada. Quedó pendiente de revisión por una persona diferente; nada fue eliminado ni programado.",
      );
      setPreview(null);
      formElement.reset();
      await refresh();
    } catch (requestError) {
      setError(readableError(requestError));
    } finally {
      setBusy(null);
    }
  }

  async function submitReview(
    event: FormEvent<HTMLFormElement>,
    decision: "APPROVE" | "REJECT",
  ) {
    event.preventDefault();
    if (!selectedRequest || busy) return;
    const form = new FormData(event.currentTarget);
    const hashInput = {
      clientReviewId: crypto.randomUUID(),
      expectedPayloadSha256: selectedRequest.payloadSha256,
      decision,
      ...(decision === "APPROVE"
        ? { approvedNotExecutedAcknowledged: true as const }
        : { rejectionReason: String(form.get("rejectionReason") ?? "") }),
    };
    setBusy(`review-${decision}`);
    setError(null);
    setNotice(null);
    try {
      const result = await reviewRetentionDisposition(selectedRequest.id, {
        ...hashInput,
        reviewPayloadSha256:
          await computeRetentionDispositionReviewSha256(
            selectedRequest.id,
            hashInput,
          ),
      });
      setNotice(
        result.approved
          ? "Aprobación registrada como NO EJECUTADA. El sistema sigue sin disponer datos."
          : "Rechazo registrado con trazabilidad.",
      );
      setSelectedRequest(null);
      await refresh();
    } catch (requestError) {
      setError(readableError(requestError));
    } finally {
      setBusy(null);
    }
  }

  async function submitCancellation(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedRequest || busy) return;
    const form = new FormData(event.currentTarget);
    const hashInput = {
      clientCancellationId: crypto.randomUUID(),
      expectedPayloadSha256: selectedRequest.payloadSha256,
      reason: String(form.get("cancellationReason") ?? ""),
    };
    setBusy("cancel");
    setError(null);
    setNotice(null);
    try {
      await cancelRetentionDisposition(selectedRequest.id, {
        ...hashInput,
        cancellationPayloadSha256:
          await computeRetentionDispositionCancellationSha256(
            selectedRequest.id,
            hashInput,
          ),
      });
      setNotice("Solicitud pendiente cancelada; el expediente permanece intacto.");
      setSelectedRequest(null);
      await refresh();
    } catch (requestError) {
      setError(readableError(requestError));
    } finally {
      setBusy(null);
    }
  }

  async function submitLegalHold(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    const hashInput = {
      clientRequestId: crypto.randomUUID(),
      scope: String(form.get("holdScope")) as RetentionDataScope,
      reason: String(form.get("holdReason") ?? ""),
      legalAuthority: String(form.get("holdAuthority") ?? ""),
      legalReference: String(form.get("holdLegalReference") ?? ""),
      evidenceReference: String(form.get("holdEvidenceReference") ?? ""),
      evidenceSha256: String(form.get("holdEvidenceSha256") ?? ""),
      effectiveAt: new Date().toISOString(),
    };
    setBusy("hold");
    setError(null);
    setNotice(null);
    try {
      await createRetentionLegalHold({
        ...hashInput,
        payloadSha256: await computeRetentionLegalHoldPayloadSha256(hashInput),
      });
      setNotice(
        "Orden de conservación activa. Bloqueará cualquier disposición aplicable hasta una revocación independiente.",
      );
      formElement.reset();
      setPreview(null);
      await refresh();
    } catch (requestError) {
      setError(readableError(requestError));
    } finally {
      setBusy(null);
    }
  }

  async function submitHoldRevocation(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedHold || busy) return;
    const form = new FormData(event.currentTarget);
    const hashInput = {
      clientRequestId: crypto.randomUUID(),
      expectedHoldPayloadSha256: selectedHold.payloadSha256,
      reason: String(form.get("revokeReason") ?? ""),
      legalAuthority: String(form.get("revokeAuthority") ?? ""),
      legalReference: String(form.get("revokeLegalReference") ?? ""),
      evidenceReference: String(form.get("revokeEvidenceReference") ?? ""),
      evidenceSha256: String(form.get("revokeEvidenceSha256") ?? ""),
    };
    setBusy("revoke-hold");
    setError(null);
    setNotice(null);
    try {
      await revokeRetentionLegalHold(selectedHold.id, {
        ...hashInput,
        payloadSha256: await computeRetentionLegalHoldRevocationSha256(
          selectedHold.id,
          hashInput,
        ),
      });
      setNotice("Revocación independiente registrada; la orden original se conservó.");
      setSelectedHold(null);
      setPreview(null);
      await refresh();
    } catch (requestError) {
      setError(readableError(requestError));
    } finally {
      setBusy(null);
    }
  }

  if (loading) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center" role="status">
        <Loader2 className="animate-spin text-blue-700" aria-hidden="true" />
        <span className="ml-3 font-semibold">Cargando gobierno de datos…</span>
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-7xl space-y-6 p-4 pb-28 sm:p-6 lg:p-8 lg:pb-8">
      <header className="rounded-3xl bg-slate-950 p-6 text-white shadow-xl sm:p-8">
        <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
          <div className="max-w-3xl">
            <p className="text-xs font-black uppercase tracking-[0.18em] text-blue-300">
              Después de las elecciones
            </p>
            <h1 className="mt-3 text-3xl font-black tracking-tight sm:text-4xl">
              Gobierno de retención y conservación legal
            </h1>
            <p className="mt-4 text-sm font-semibold leading-6 text-slate-300">
              Cuenta vencimientos, documenta decisiones con cuatro ojos y protege
              expedientes con retenciones legales. Este módulo no elimina datos,
              no programa purgas y no toca archivos.
            </p>
          </div>
          <Button
            type="button"
            variant="outline"
            disabled={Boolean(busy)}
            onClick={() => {
              setBusy("refresh");
              setError(null);
              void refresh()
                .catch((requestError: unknown) =>
                  setError(readableError(requestError)),
                )
                .finally(() => setBusy(null));
            }}
            className="min-h-11 border-slate-600 bg-slate-900 text-white hover:bg-slate-800"
          >
            <RefreshCw aria-hidden="true" size={17} /> Actualizar
          </Button>
        </div>
      </header>

      <div ref={feedbackRef} tabIndex={-1} className="outline-none">
        {error && (
          <div
            role="alert"
            className="flex gap-3 rounded-2xl border border-red-200 bg-red-50 p-4 text-sm font-semibold text-red-950"
          >
            <AlertCircle aria-hidden="true" className="shrink-0" size={20} />
            {error}
          </div>
        )}
        {notice && (
          <div
            role="status"
            className="flex gap-3 rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-sm font-semibold text-emerald-950"
          >
            <CheckCircle2 aria-hidden="true" className="shrink-0" size={20} />
            {notice}
          </div>
        )}
      </div>

      <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4" aria-label="Estado de retención">
        <Metric label="Etapa" value={overview?.profile?.stage ?? "Sin perfil"} />
        <Metric
          label="Tipo de cierre"
          value={
            overview?.profile?.closureType === "CLOSED_NORMAL"
              ? "Ordinario"
              : overview?.profile?.closureType === "CLOSED_EXCEPTIONAL"
                ? "Excepcional"
                : "Sin clasificar"
          }
        />
        <Metric
          label="Vencimiento configurado"
          value={formatDate(overview?.profile?.retentionDueAt ?? null)}
        />
        <Metric
          label="Órdenes activas"
          value={String(
            overview?.legalHolds.filter((hold) => hold.active).length ?? 0,
          )}
        />
      </section>

      <section className="rounded-3xl border-2 border-red-200 bg-red-50 p-6 text-red-950">
        <div className="flex items-start gap-3">
          <ShieldAlert aria-hidden="true" className="shrink-0" size={26} />
          <div>
            <h2 className="text-xl font-black">Ejecución deliberadamente bloqueada</h2>
            <p className="mt-2 text-sm font-semibold leading-6">
              Incluso una aprobación queda como “aprobada, no ejecutada”. Antes
              de construir un ejecutor se necesita política jurídica validada,
              prueba real de restauración, worker BullMQ revisado y disposición
              coordinada de Storage.
            </p>
            <ul className="mt-3 list-disc space-y-1 pl-5 text-sm font-semibold">
              {overview?.executionCapability.blockers.map((blocker) => (
                <li key={blocker.code}>{blocker.message}</li>
              ))}
            </ul>
          </div>
        </div>
      </section>

      <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="flex items-start gap-3">
          <FileClock aria-hidden="true" className="text-blue-700" size={25} />
          <div>
            <h2 className="text-xl font-black text-slate-950">Vista previa de vencimientos</h2>
            <p className="mt-1 text-sm text-slate-600">
              Solo ejecuta conteos tenant-scoped; no expone nombres, documentos ni contenido.
            </p>
          </div>
        </div>
        <form onSubmit={(event) => void runPreview(event)} className="mt-5 grid gap-4 md:grid-cols-[1fr_1fr_auto] md:items-end">
          <label className="text-sm font-bold text-slate-800" htmlFor="retention-scope">
            Alcance
            <select
              id="retention-scope"
              value={scope}
              onChange={(event) => {
                setScope(event.target.value as RetentionDataScope);
                setPreview(null);
              }}
              className={INPUT_CLASS}
            >
              {RETENTION_DATA_SCOPES.map((value) => (
                <option key={value} value={value}>{SCOPE_LABELS[value]}</option>
              ))}
            </select>
          </label>
          <label className="text-sm font-bold text-slate-800" htmlFor="retention-cutoff">
            Fecha y hora de corte
            <input
              id="retention-cutoff"
              type="datetime-local"
              required
              value={cutoff}
              onChange={(event) => {
                setCutoff(event.target.value);
                setPreview(null);
              }}
              className={INPUT_CLASS}
            />
          </label>
          <Button type="submit" disabled={Boolean(busy)} className="min-h-11">
            {busy === "preview" ? <Loader2 aria-hidden="true" className="animate-spin" size={17} /> : <Scale aria-hidden="true" size={17} />}
            Evaluar corte
          </Button>
        </form>

        {preview && (
          <div className="mt-6 space-y-5" aria-live="polite">
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              {Object.entries(preview.counts)
                .filter(([key]) => key !== "total")
                .map(([key, value]) =>
                  value === null ? null : (
                    <Metric key={key} label={COUNT_LABELS[key] ?? key} value={formatNumber(value)} />
                  ),
                )}
              <Metric label="Total contado" value={formatNumber(preview.counts.total)} />
            </div>
            {preview.governanceBlockers.length > 0 ? (
              <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-amber-950">
                <h3 className="font-black">Solicitud bloqueada</h3>
                <ul className="mt-2 list-disc space-y-1 pl-5 text-sm font-semibold">
                  {preview.governanceBlockers.map((blocker) => (
                    <li key={blocker.code}>{blocker.message}</li>
                  ))}
                </ul>
              </div>
            ) : (
              <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-sm font-semibold text-emerald-950">
                No hay bloqueos de gobierno para documentar la solicitud. Esto no habilita ejecución.
              </div>
            )}

            {canMutate && preview.canRequest && (
              <DispositionRequestForm busy={Boolean(busy)} onSubmit={submitDisposition} />
            )}
            {!canMutate && preview.canRequest && (
              <p className="rounded-2xl bg-slate-100 p-4 text-sm font-semibold text-slate-700">
                Tu rol puede auditar el corte, pero solo Administración o Cumplimiento pueden solicitar disposición.
              </p>
            )}
          </div>
        )}
      </section>

      <section className="grid gap-6 xl:grid-cols-2">
        <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="flex items-start gap-3">
            <LockKeyhole aria-hidden="true" className="text-indigo-700" size={25} />
            <div>
              <h2 className="text-xl font-black">Retenciones legales</h2>
              <p className="mt-1 text-sm text-slate-600">
                Una orden activa prevalece sobre cualquier solicitud de disposición.
              </p>
            </div>
          </div>
          <div className="mt-5 space-y-3">
            {overview?.legalHolds.length ? overview.legalHolds.map((hold) => (
              <article key={hold.id} className="rounded-2xl border border-slate-200 p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="font-black text-slate-950">{SCOPE_LABELS[hold.scope]}</p>
                    <p className="mt-1 text-xs font-bold uppercase tracking-wider text-slate-500">
                      {hold.active ? "Activa" : `Revocada ${formatDate(hold.revocation?.revokedAt ?? null)}`}
                    </p>
                  </div>
                  {hold.active && (
                    <Button type="button" variant="outline" onClick={() => setSelectedHold(hold)}>
                      Revisar revocación
                    </Button>
                  )}
                </div>
                <p className="mt-3 text-sm leading-6 text-slate-700">{hold.reason}</p>
                <a href={hold.evidenceReference} target="_blank" rel="noreferrer" className="mt-2 inline-flex text-sm font-bold text-blue-700 underline">
                  Ver evidencia registrada
                </a>
              </article>
            )) : <p className="rounded-2xl bg-slate-50 p-4 text-sm text-slate-600">No hay retenciones legales registradas.</p>}
          </div>
          {canMutate && <LegalHoldForm busy={Boolean(busy)} onSubmit={submitLegalHold} />}
        </div>

        <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="flex items-start gap-3">
            <ArchiveRestore aria-hidden="true" className="text-blue-700" size={25} />
            <div>
              <h2 className="text-xl font-black">Solicitudes durables</h2>
              <p className="mt-1 text-sm text-slate-600">
                Historial tenant-scoped; los resultados terminales son inmutables.
              </p>
            </div>
          </div>
          <div className="mt-5 space-y-3">
            {overview?.requests.length ? overview.requests.map((request) => (
              <article key={request.id} className="rounded-2xl border border-slate-200 p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="font-black text-slate-950">{SCOPE_LABELS[request.scope]}</p>
                    <p className="mt-1 text-xs font-black uppercase tracking-wider text-slate-500">{STATUS_LABELS[request.status]}</p>
                  </div>
                  {request.status === "PENDING" && (
                    <Button type="button" variant="outline" onClick={() => setSelectedRequest(request)}>
                      Revisar solicitud
                    </Button>
                  )}
                </div>
                <p className="mt-3 text-sm leading-6 text-slate-700">{request.justification}</p>
                <p className="mt-2 font-mono text-[11px] text-slate-500">SHA-256 {request.payloadSha256}</p>
              </article>
            )) : <p className="rounded-2xl bg-slate-50 p-4 text-sm text-slate-600">No hay solicitudes registradas.</p>}
          </div>
        </div>
      </section>

      {selectedRequest && (
        <ReviewPanel
          request={selectedRequest}
          currentUserId={user?.id ?? null}
          canMutate={canMutate}
          busy={Boolean(busy)}
          onApprove={(event) => void submitReview(event, "APPROVE")}
          onReject={(event) => void submitReview(event, "REJECT")}
          onCancel={(event) => void submitCancellation(event)}
          onClose={() => setSelectedRequest(null)}
        />
      )}

      {selectedHold && (
        <HoldRevocationPanel
          hold={selectedHold}
          currentUserId={user?.id ?? null}
          busy={Boolean(busy)}
          onSubmit={(event) => void submitHoldRevocation(event)}
          onClose={() => setSelectedHold(null)}
        />
      )}

      <p className="text-center text-xs font-semibold text-slate-500">
        Consulta también el <Link href="/dashboard/transition" className="font-black text-blue-700 underline">expediente de cierre poselectoral</Link> para obligaciones financieras, operativas y de evidencia.
      </p>
    </div>
  );
}

const COUNT_LABELS: Record<string, string> = {
  voters: "Personas",
  consentRecords: "Consentimientos",
  interactions: "Interacciones",
  storedObjects: "Archivos",
  financialEntries: "Registros financieros",
  witnessReports: "Actas E-14",
  auditEvents: "Eventos de auditoría",
};

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <dl className="rounded-2xl border border-slate-200 bg-white p-4">
      <dt className="text-[10px] font-black uppercase tracking-[0.14em] text-slate-500">{label}</dt>
      <dd className="mt-2 break-words text-lg font-black text-slate-950">{value}</dd>
    </dl>
  );
}

function DispositionRequestForm({ busy, onSubmit }: { busy: boolean; onSubmit: (event: FormEvent<HTMLFormElement>) => void }) {
  return (
    <form onSubmit={onSubmit} className="rounded-2xl border border-blue-200 bg-blue-50 p-5">
      <h3 className="font-black text-blue-950">Documentar solicitud</h3>
      <div className="mt-4 grid gap-4 md:grid-cols-2">
        <Field id="justification" label="Justificación (mínimo 100 caracteres)" textarea minLength={100} />
        <Field id="legalReference" label="Referencia jurídica aplicable" minLength={10} />
        <Field id="evidenceReference" label="URL HTTPS de evidencia durable" type="url" />
        <Field id="evidenceSha256" label="SHA-256 de la evidencia" pattern="[a-f0-9]{64}" />
      </div>
      <fieldset className="mt-4 space-y-2">
        <legend className="text-sm font-black text-blue-950">Reconocimientos obligatorios</legend>
        {[
          "La política jurídica aún debe ser validada antes de cualquier ejecución.",
          "Debe existir evidencia real y vigente de backup y restauración.",
          "No existe ejecutor BullMQ/Storage y esta solicitud no crea uno.",
        ].map((label, index) => (
          <label key={label} className="flex items-start gap-2 text-sm font-semibold text-blue-950">
            <input name={`ack-${index}`} type="checkbox" required className="mt-1 size-4" /> {label}
          </label>
        ))}
      </fieldset>
      <Button type="submit" disabled={busy} className="mt-5 min-h-11">Registrar solicitud no destructiva</Button>
    </form>
  );
}

function LegalHoldForm({ busy, onSubmit }: { busy: boolean; onSubmit: (event: FormEvent<HTMLFormElement>) => void }) {
  return (
    <details className="mt-5 rounded-2xl border border-indigo-200 bg-indigo-50 p-4">
      <summary className="cursor-pointer font-black text-indigo-950">Crear orden de conservación</summary>
      <form onSubmit={onSubmit} className="mt-4 grid gap-4">
        <label className="text-sm font-bold text-indigo-950" htmlFor="holdScope">Alcance
          <select id="holdScope" name="holdScope" className={INPUT_CLASS} required>
            {RETENTION_DATA_SCOPES.map((value) => <option key={value} value={value}>{SCOPE_LABELS[value]}</option>)}
          </select>
        </label>
        <Field id="holdReason" label="Motivo de conservación (mínimo 50 caracteres)" textarea minLength={50} />
        <Field id="holdAuthority" label="Autoridad jurídica" minLength={3} />
        <Field id="holdLegalReference" label="Referencia jurídica" minLength={10} />
        <Field id="holdEvidenceReference" label="URL HTTPS de evidencia" type="url" />
        <Field id="holdEvidenceSha256" label="SHA-256 de evidencia" pattern="[a-f0-9]{64}" />
        <Button type="submit" disabled={busy}>Activar conservación</Button>
      </form>
    </details>
  );
}

function ReviewPanel({ request, currentUserId, canMutate, busy, onApprove, onReject, onCancel, onClose }: {
  request: RetentionDispositionRequest;
  currentUserId: string | null;
  canMutate: boolean;
  busy: boolean;
  onApprove: (event: FormEvent<HTMLFormElement>) => void;
  onReject: (event: FormEvent<HTMLFormElement>) => void;
  onCancel: (event: FormEvent<HTMLFormElement>) => void;
  onClose: () => void;
}) {
  const isRequester = request.requestedById === currentUserId;
  return (
    <section className="rounded-3xl border-2 border-blue-300 bg-white p-6 shadow-lg" aria-labelledby="review-title">
      <div className="flex items-start justify-between gap-4">
        <div><h2 id="review-title" className="text-xl font-black">Revisión con cuatro ojos</h2><p className="mt-1 text-sm text-slate-600">{SCOPE_LABELS[request.scope]} · corte {formatDate(request.cutoffAt)}</p></div>
        <Button type="button" variant="outline" onClick={onClose}>Cerrar panel</Button>
      </div>
      {isRequester ? (
        <div className="mt-4 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm font-semibold text-amber-950">
          No puedes revisar tu propia solicitud. Otra persona autorizada debe aprobarla o rechazarla.
        </div>
      ) : (
        <div className="mt-5 grid gap-4 lg:grid-cols-2">
          <form onSubmit={onApprove} className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4">
            <h3 className="font-black text-emerald-950">Aprobar sin ejecutar</h3>
            <p className="mt-2 text-sm font-semibold text-emerald-950">La aprobación no habilita borrado, anonimización ni trabajo en segundo plano.</p>
            <label className="mt-3 flex items-start gap-2 text-sm font-semibold text-emerald-950"><input type="checkbox" required className="mt-1 size-4" /> Reconozco que el estado final será “aprobada, no ejecutada”.</label>
            <Button type="submit" disabled={busy} className="mt-4">Aprobar como no ejecutada</Button>
          </form>
          <form onSubmit={onReject} className="rounded-2xl border border-red-200 bg-red-50 p-4">
            <h3 className="font-black text-red-950">Rechazar</h3>
            <Field id="rejectionReason" label="Razón concreta" textarea minLength={20} />
            <Button type="submit" disabled={busy} variant="outline" className="mt-4 border-red-300 text-red-900">Rechazar solicitud</Button>
          </form>
        </div>
      )}
      {isRequester && canMutate && (
        <form onSubmit={onCancel} className="mt-4 rounded-2xl border border-slate-200 bg-slate-50 p-4">
          <Field id="cancellationReason" label="Razón para cancelar la solicitud pendiente" textarea minLength={20} />
          <Button type="submit" disabled={busy} variant="outline" className="mt-4">Cancelar mi solicitud</Button>
        </form>
      )}
    </section>
  );
}

function HoldRevocationPanel({ hold, currentUserId, busy, onSubmit, onClose }: {
  hold: RetentionLegalHold;
  currentUserId: string | null;
  busy: boolean;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  onClose: () => void;
}) {
  const isCreator = hold.createdById === currentUserId;
  return (
    <section className="rounded-3xl border-2 border-indigo-300 bg-white p-6 shadow-lg" aria-labelledby="revoke-hold-title">
      <div className="flex items-start justify-between gap-4"><div><h2 id="revoke-hold-title" className="text-xl font-black">Revocar retención legal</h2><p className="mt-1 text-sm text-slate-600">La orden original siempre se conservará.</p></div><Button type="button" variant="outline" onClick={onClose}>Cerrar panel</Button></div>
      {isCreator ? <p className="mt-4 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm font-semibold text-amber-950">Quien creó la orden no puede revocarla. Se exige una segunda persona autorizada.</p> : (
        <form onSubmit={onSubmit} className="mt-5 grid gap-4 md:grid-cols-2">
          <Field id="revokeReason" label="Motivo del levantamiento (mínimo 50 caracteres)" textarea minLength={50} />
          <Field id="revokeAuthority" label="Autoridad que respalda el levantamiento" minLength={3} />
          <Field id="revokeLegalReference" label="Referencia jurídica" minLength={10} />
          <Field id="revokeEvidenceReference" label="URL HTTPS de evidencia" type="url" />
          <Field id="revokeEvidenceSha256" label="SHA-256 de evidencia" pattern="[a-f0-9]{64}" />
          <div className="md:col-span-2"><Button type="submit" disabled={busy}>Registrar revocación independiente</Button></div>
        </form>
      )}
    </section>
  );
}

function Field({ id, label, textarea = false, type = "text", minLength, pattern }: {
  id: string;
  label: string;
  textarea?: boolean;
  type?: string;
  minLength?: number;
  pattern?: string;
}) {
  return (
    <label className="text-sm font-bold text-slate-800" htmlFor={id}>{label}
      {textarea ? <textarea id={id} name={id} required minLength={minLength} rows={4} className={INPUT_CLASS} /> : <input id={id} name={id} required minLength={minLength} type={type} pattern={pattern} autoCapitalize={pattern ? "none" : undefined} spellCheck={pattern ? false : undefined} className={INPUT_CLASS} />}
    </label>
  );
}
