"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  AlertCircle,
  CheckCircle2,
  Clock3,
  ExternalLink,
  Loader2,
  RefreshCw,
  ShieldAlert,
  XCircle,
} from "lucide-react";
import { Button, Input, Label } from "@/components/ui";
import { ApiError } from "@/lib/api-client";
import {
  computeOperationAdoptionReviewSha256,
  getOperationAdoption,
  reviewOperationAdoption,
  type OperationAdoptionContext,
  type OperationAdoptionDecision,
  type OperationStageAdoptionRequest,
} from "@/lib/operation-profile-api";
import type { BackendUserRole } from "@/types/saas-schema";
import { useConfirmation } from "@/context/confirmation";

export interface OperationAdoptionDraft {
  effectiveAt: string;
  justification: string;
  evidenceReference: string;
  evidenceSha256: string;
  incompleteHistoryAcknowledged: boolean;
  confirmation: string;
}

interface AdoptionFieldsProps {
  value: OperationAdoptionDraft;
  disabled?: boolean;
  onChange: <K extends keyof OperationAdoptionDraft>(
    field: K,
    value: OperationAdoptionDraft[K],
  ) => void;
}

const TEXTAREA_CLASS =
  "min-h-32 w-full resize-y rounded-2xl border-2 border-slate-200 bg-white px-5 py-4 text-sm leading-6 text-slate-900 outline-none transition focus:border-blue-700 focus:ring-2 focus:ring-blue-700/10 disabled:cursor-not-allowed disabled:opacity-50";
const SHA256_PATTERN = "[a-f0-9]{64}";
const REVIEW_ROLES = new Set<BackendUserRole>([
  "COMPLIANCE_OFFICER",
  "AUDITOR",
]);
const READ_ROLES = new Set<BackendUserRole>([
  "ADMIN",
  "COMPLIANCE_OFFICER",
  "AUDITOR",
]);

const STAGE_LABELS: Record<string, string> = {
  SIGNATURE_COLLECTION: "Recolección de firmas",
  CAMPAIGN: "Campaña",
  ELECTION_PREPARATION: "Preparación electoral",
  SIMULATION: "Simulación",
  ELECTION_DAY: "Jornada electoral",
  POST_ELECTION: "Poselectoral",
};

const STATUS_LABELS = {
  PENDING: { label: "Pendiente", className: "bg-amber-100 text-amber-900" },
  APPROVED: { label: "Aprobada", className: "bg-emerald-100 text-emerald-900" },
  REJECTED: { label: "Rechazada", className: "bg-red-100 text-red-900" },
  EXPIRED: { label: "Vencida", className: "bg-slate-200 text-slate-800" },
} as const;

function readableError(error: unknown, fallback: string): string {
  if (error instanceof ApiError) return error.message;
  if (error instanceof Error && error.message) return error.message;
  return fallback;
}

function formatDateTime(value: string | null): string {
  if (!value) return "No aplica";
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return "Fecha inválida";
  return new Intl.DateTimeFormat("es-CO", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "America/Bogota",
  }).format(date);
}

function formatCivilDate(value: string): string {
  const civilDate = value.slice(0, 10);
  const date = new Date(`${civilDate}T00:00:00.000Z`);
  if (
    !/^\d{4}-\d{2}-\d{2}$/.test(civilDate) ||
    !Number.isFinite(date.getTime()) ||
    date.toISOString().slice(0, 10) !== civilDate
  ) {
    return "Fecha inválida";
  }
  return new Intl.DateTimeFormat("es-CO", {
    dateStyle: "medium",
    timeZone: "UTC",
  }).format(date);
}

function formatMoney(value: number): string {
  return new Intl.NumberFormat("es-CO", {
    style: "currency",
    currency: "COP",
    maximumFractionDigits: 2,
  }).format(value);
}

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-[10px] font-black uppercase tracking-[0.14em] text-slate-500">
        {label}
      </dt>
      <dd className="mt-1 break-words text-sm font-semibold leading-6 text-slate-900">
        {value}
      </dd>
    </div>
  );
}

export function OperationAdoptionFields({
  value,
  disabled,
  onChange,
}: AdoptionFieldsProps) {
  return (
    <fieldset className="space-y-5 border-t border-amber-200 pt-7">
      <legend className="text-xs font-black uppercase tracking-[0.16em] text-amber-900">
        Adopción excepcional de historia previa
      </legend>
      <div
        role="note"
        className="rounded-2xl border border-amber-300 bg-amber-50 p-4 text-sm font-semibold leading-6 text-amber-950"
      >
        Este flujo no reconstruye ni certifica lo ocurrido antes de usar la
        plataforma. La referencia y el SHA-256 son declaraciones: una persona
        revisora independiente debe contrastarlos fuera del sistema. Aquí no se
        carga ni se verifica automáticamente ningún archivo.
      </div>
      <div className="grid gap-5 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="adoption-effective-at">Inicio real de la etapa</Label>
          <Input
            id="adoption-effective-at"
            type="datetime-local"
            required
            disabled={disabled}
            value={value.effectiveAt}
            onChange={(event) => onChange("effectiveAt", event.target.value)}
          />
          <p className="text-xs leading-5 text-slate-500">
            Debe ser un instante pasado o actual; nunca futuro.
          </p>
        </div>
        <div className="space-y-2">
          <Label htmlFor="adoption-evidence-reference">
            Referencia externa de evidencia
          </Label>
          <Input
            id="adoption-evidence-reference"
            minLength={3}
            maxLength={512}
            required
            disabled={disabled}
            placeholder="Ej. expediente/acta-inicio.pdf"
            value={value.evidenceReference}
            onChange={(event) =>
              onChange("evidenceReference", event.target.value)
            }
          />
        </div>
        <div className="space-y-2 sm:col-span-2">
          <Label htmlFor="adoption-evidence-sha256">
            SHA-256 declarado de la evidencia
          </Label>
          <Input
            id="adoption-evidence-sha256"
            minLength={64}
            maxLength={64}
            pattern={SHA256_PATTERN}
            spellCheck={false}
            autoCapitalize="none"
            required
            disabled={disabled}
            className="font-mono text-xs"
            placeholder="64 caracteres hexadecimales en minúscula"
            value={value.evidenceSha256}
            onChange={(event) =>
              onChange("evidenceSha256", event.target.value.toLowerCase())
            }
          />
        </div>
        <div className="space-y-2 sm:col-span-2">
          <Label htmlFor="adoption-justification">
            Justificación verificable de la adopción
          </Label>
          <textarea
            id="adoption-justification"
            className={TEXTAREA_CLASS}
            minLength={80}
            maxLength={4_000}
            required
            disabled={disabled}
            value={value.justification}
            onChange={(event) => onChange("justification", event.target.value)}
          />
          <p className="text-right text-xs font-semibold text-slate-500">
            {value.justification.length.toLocaleString("es-CO")} / 4.000 ·
            mínimo 80
          </p>
        </div>
      </div>
      <label className="flex items-start gap-3 rounded-2xl border border-red-200 bg-red-50 p-4 text-sm font-semibold leading-6 text-red-950">
        <input
          type="checkbox"
          required
          disabled={disabled}
          checked={value.incompleteHistoryAcknowledged}
          onChange={(event) =>
            onChange("incompleteHistoryAcknowledged", event.target.checked)
          }
          className="mt-1 h-4 w-4 shrink-0 accent-red-700"
        />
        Reconozco expresamente que el historial anterior en la plataforma es
        incompleto y que esta solicitud no lo convierte en evidencia oficial.
      </label>
      <div className="space-y-2">
        <Label htmlFor="adoption-confirmation">
          Escribe ADOPTAR HISTORIA INCOMPLETA para habilitar la solicitud
        </Label>
        <Input
          id="adoption-confirmation"
          required
          autoComplete="off"
          disabled={disabled}
          value={value.confirmation}
          onChange={(event) => onChange("confirmation", event.target.value)}
        />
      </div>
    </fieldset>
  );
}

function RequestDetails({
  request,
}: {
  request: OperationStageAdoptionRequest;
}) {
  return (
    <dl className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
      <Detail label="Solicitud" value={request.id} />
      <Detail
        label="Idempotencia de solicitud"
        value={request.clientRequestId}
      />
      <Detail
        label="Etapa adoptada"
        value={STAGE_LABELS[request.targetStage] ?? request.targetStage}
      />
      <Detail
        label="Inicio efectivo declarado"
        value={formatDateTime(request.effectiveAt)}
      />
      <Detail
        label="Fecha electoral"
        value={formatCivilDate(request.electionDate)}
      />
      <Detail
        label="Ventana operativa (America/Bogota)"
        value={`${request.votingStartDate} a ${request.votingEndDate}, inclusiva`}
      />
      <Detail label="Tipo de operación" value={request.operationType} />
      <Detail label="Tipo de elección" value={request.electionType} />
      <Detail
        label="Circunscripción"
        value={`${request.circumscriptionType} · ${request.circumscriptionName}`}
      />
      <Detail
        label="Código de circunscripción"
        value={request.circumscriptionCode ?? "No declarado"}
      />
      <Detail label="Tipo de lista" value={request.listType ?? "No aplica"} />
      <Detail label="Candidaturas" value={String(request.candidateCount)} />
      <Detail
        label="Equipo esperado"
        value={String(request.expectedTeamSize)}
      />
      <Detail
        label="Presupuesto máximo"
        value={formatMoney(request.maxTotalBudget)}
      />
      <Detail
        label="Límite de publicidad"
        value={formatMoney(request.maxPublicityLimit)}
      />
      <Detail
        label="Responsable del tratamiento"
        value={request.dataControllerName}
      />
      <Detail
        label="Persona responsable"
        value={`${request.responsibleDataUser.name} · ${request.responsibleDataUser.role} · ${request.responsibleDataUserId}`}
      />
      <Detail
        label="Conservación"
        value={`${request.retentionPeriodDays} días`}
      />
      <Detail
        label="Solicitante"
        value={`${request.requestedBy.name} · ${request.requestedBy.role} · ${request.requestedById}`}
      />
      <Detail label="Creada" value={formatDateTime(request.createdAt)} />
      <Detail label="Caduca" value={formatDateTime(request.expiresAt)} />
      <Detail label="Vencida" value={formatDateTime(request.expiredAt)} />
      <Detail
        label="Revisó"
        value={
          request.reviewedBy
            ? `${request.reviewedBy.name} · ${request.reviewedBy.role} · ${request.reviewedById}`
            : "Pendiente de revisión independiente"
        }
      />
      <Detail label="Revisada" value={formatDateTime(request.reviewedAt)} />
      <Detail
        label="Idempotencia de revisión"
        value={request.reviewClientRequestId ?? "Pendiente"}
      />
      <Detail
        label="Perfil creado"
        value={request.operationProfileId ?? "No creado"}
      />
      <div className="sm:col-span-2 lg:col-span-3">
        <Detail label="Justificación completa" value={request.justification} />
      </div>
      <div className="sm:col-span-2 lg:col-span-3">
        <Detail
          label="Procedimiento de revocación"
          value={request.revocationProcedure}
        />
      </div>
      <div className="sm:col-span-2 lg:col-span-3">
        <Detail
          label="Referencia de evidencia declarada"
          value={request.evidenceReference}
        />
      </div>
      {request.votingWindowSourceUrl && request.votingWindowReference && (
        <div className="sm:col-span-2 lg:col-span-3">
          <dt className="text-[10px] font-black uppercase tracking-[0.14em] text-slate-500">
            Fuente declarada de la ventana
          </dt>
          <dd className="mt-1 break-words text-sm font-semibold leading-6 text-slate-900">
            {request.votingWindowReference}.{" "}
            <a
              href={request.votingWindowSourceUrl}
              target="_blank"
              rel="noreferrer noopener"
              className="inline-flex items-center gap-1 text-blue-800 underline decoration-2 underline-offset-4"
            >
              Abrir fuente
              <ExternalLink aria-hidden="true" size={14} />
            </a>
          </dd>
        </div>
      )}
      <div className="sm:col-span-2 lg:col-span-3 font-mono text-xs">
        <Detail
          label="SHA-256 de evidencia declarado"
          value={request.evidenceSha256}
        />
      </div>
      <div className="sm:col-span-2 lg:col-span-3 font-mono text-xs">
        <Detail
          label="SHA-256 canónico de solicitud"
          value={request.payloadSha256}
        />
      </div>
      <div className="sm:col-span-2 lg:col-span-3 font-mono text-xs">
        <Detail
          label="SHA-256 canónico de revisión"
          value={request.reviewPayloadSha256 ?? "Pendiente"}
        />
      </div>
      <div className="sm:col-span-2 lg:col-span-3">
        <Detail
          label="Reconocimiento de historia incompleta"
          value={
            request.incompleteHistoryAcknowledged
              ? "Sí, reconocido expresamente"
              : "No consta"
          }
        />
      </div>
      {request.rejectionReason && (
        <div className="sm:col-span-2 lg:col-span-3">
          <Detail label="Razón de rechazo" value={request.rejectionReason} />
        </div>
      )}
    </dl>
  );
}

interface AdoptionStatusPanelProps {
  role: BackendUserRole;
  userId: string;
  reloadKey: number;
  onApproved: (stage: OperationStageAdoptionRequest["targetStage"]) => void;
}

export function OperationAdoptionStatusPanel({
  role,
  userId,
  reloadKey,
  onApproved,
}: AdoptionStatusPanelProps) {
  const confirm = useConfirmation();
  const [context, setContext] = useState<OperationAdoptionContext | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reviewing, setReviewing] = useState(false);
  const [decision, setDecision] =
    useState<OperationAdoptionDecision>("APPROVE");
  const [reason, setReason] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [evidenceChecked, setEvidenceChecked] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const reviewAttempt = useRef<{ fingerprint: string; id: string } | null>(
    null,
  );

  const load = useCallback(
    async (signal?: AbortSignal) => {
      if (!READ_ROLES.has(role)) return;
      setLoading(true);
      setError(null);
      try {
        setContext(await getOperationAdoption(signal));
      } catch (loadError: unknown) {
        if (signal?.aborted) return;
        setError(
          readableError(
            loadError,
            "No fue posible consultar la adopción excepcional.",
          ),
        );
      } finally {
        if (!signal?.aborted) setLoading(false);
      }
    },
    [role],
  );

  useEffect(() => {
    if (!READ_ROLES.has(role)) return;
    const controller = new AbortController();
    void load(controller.signal);
    return () => controller.abort();
  }, [load, reloadKey, role]);

  if (!READ_ROLES.has(role)) return null;
  const request = context?.request ?? null;
  const mayReview = Boolean(
    request &&
    request.status === "PENDING" &&
    REVIEW_ROLES.has(role) &&
    request.requestedById !== userId,
  );

  async function submitReview() {
    if (!request || !mayReview) return;
    const normalizedReason = reason.trim();
    if (decision === "REJECT" && normalizedReason.length < 20) {
      setError(
        "El rechazo exige una razón concreta de al menos 20 caracteres.",
      );
      return;
    }
    const requiredConfirmation =
      decision === "APPROVE" ? "APROBAR ADOPCION" : "RECHAZAR ADOPCION";
    if (!evidenceChecked || confirmation.trim() !== requiredConfirmation) {
      setError(
        `Confirma la revisión externa y escribe ${requiredConfirmation}.`,
      );
      return;
    }
    if (
      !(await confirm({
        title:
          decision === "APPROVE"
            ? "Aprobar adopción de etapa"
            : "Rechazar adopción de etapa",
        description:
          decision === "APPROVE"
            ? "La aprobación creará el perfil operativo y habilitará la etapa declarada como una decisión independiente."
            : "El rechazo cerrará esta solicitud sin crear el perfil operativo.",
        confirmLabel:
          decision === "APPROVE" ? "Confirmar aprobación" : "Confirmar rechazo",
        destructive: decision === "APPROVE",
      }))
    )
      return;

    setReviewing(true);
    setError(null);
    setNotice(null);
    try {
      const fingerprint = JSON.stringify({
        requestId: request.id,
        expectedPayloadSha256: request.payloadSha256,
        decision,
        rejectionReason: decision === "REJECT" ? normalizedReason : null,
      });
      const clientReviewId =
        reviewAttempt.current?.fingerprint === fingerprint
          ? reviewAttempt.current.id
          : globalThis.crypto.randomUUID();
      reviewAttempt.current = { fingerprint, id: clientReviewId };
      const hashInput = {
        clientReviewId,
        expectedPayloadSha256: request.payloadSha256,
        decision,
        ...(decision === "REJECT" ? { rejectionReason: normalizedReason } : {}),
      };
      const reviewPayloadSha256 = await computeOperationAdoptionReviewSha256(
        request.id,
        hashInput,
      );
      const result = await reviewOperationAdoption(request.id, {
        ...hashInput,
        reviewPayloadSha256,
      });
      setContext((current) => ({
        configured: Boolean(result.profile) || current?.configured === true,
        profile: result.profile ?? current?.profile ?? null,
        request: result.request,
      }));
      setNotice(
        result.request.status === "APPROVED"
          ? "Adopción aprobada. El perfil y la etapa se sincronizarán ahora."
          : result.request.status === "REJECTED"
            ? "Solicitud rechazada con razón auditable."
            : "La solicitud ya había vencido; no se aplicó ningún cambio.",
      );
      if (result.request.status === "APPROVED") {
        onApproved(result.request.targetStage);
      }
    } catch (reviewError: unknown) {
      setError(
        readableError(reviewError, "No fue posible registrar la revisión."),
      );
    } finally {
      setReviewing(false);
    }
  }

  return (
    <section
      aria-labelledby="adoption-status-title"
      className="space-y-6 rounded-3xl border border-slate-200 bg-white p-5 shadow-sm sm:p-8"
    >
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h2
            id="adoption-status-title"
            className="flex items-center gap-3 text-xl font-black text-slate-950"
          >
            <ShieldAlert aria-hidden="true" className="text-amber-700" />
            Adopción excepcional
          </h2>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">
            Control de cuatro ojos para una operación iniciada fuera de la
            plataforma. La evidencia declarada debe verificarse externamente.
          </p>
        </div>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => void load()}
          disabled={loading || reviewing}
          className="gap-2"
        >
          <RefreshCw
            aria-hidden="true"
            size={15}
            className={loading ? "animate-spin" : undefined}
          />
          Recargar adopción
        </Button>
      </div>

      {loading && !context ? (
        <div
          role="status"
          className="flex items-center gap-3 text-sm font-semibold text-slate-600"
        >
          <Loader2 aria-hidden="true" className="animate-spin" size={18} />{" "}
          Consultando solicitud…
        </div>
      ) : error && !context ? (
        <div
          role="alert"
          className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm font-semibold text-red-900"
        >
          {error}
        </div>
      ) : !request ? (
        <div className="rounded-2xl bg-slate-50 p-5 text-sm font-semibold text-slate-600">
          No existe una solicitud de adopción. El alta ordinaria sigue siendo el
          camino seguro.
        </div>
      ) : (
        <>
          <div className="flex flex-wrap items-center gap-3">
            <span
              role="status"
              className={`rounded-full px-3 py-1.5 text-xs font-black ${STATUS_LABELS[request.status].className}`}
            >
              {STATUS_LABELS[request.status].label}
            </span>
            {request.status === "PENDING" && (
              <span className="flex items-center gap-2 text-xs font-bold text-slate-600">
                <Clock3 aria-hidden="true" size={15} /> vence{" "}
                {formatDateTime(request.expiresAt)}
              </span>
            )}
          </div>
          <RequestDetails request={request} />

          {REVIEW_ROLES.has(role) &&
            request.status === "PENDING" &&
            request.requestedById === userId && (
              <div
                role="note"
                className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm font-semibold text-amber-950"
              >
                No puedes revisar tu propia solicitud. Debe actuar otra persona
                autorizada.
              </div>
            )}

          {mayReview && (
            <div className="space-y-5 border-t border-slate-200 pt-6">
              <h3 className="text-lg font-black text-slate-950">
                Decisión independiente
              </h3>
              <div className="grid gap-3 sm:grid-cols-2">
                <button
                  type="button"
                  aria-pressed={decision === "APPROVE"}
                  onClick={() => {
                    setDecision("APPROVE");
                    setConfirmation("");
                    setError(null);
                  }}
                  className={`rounded-2xl border-2 p-4 text-left text-sm font-black ${decision === "APPROVE" ? "border-emerald-600 bg-emerald-50 text-emerald-950" : "border-slate-200 text-slate-700"}`}
                >
                  <CheckCircle2 aria-hidden="true" className="mb-2" /> Aprobar y
                  crear perfil
                </button>
                <button
                  type="button"
                  aria-pressed={decision === "REJECT"}
                  onClick={() => {
                    setDecision("REJECT");
                    setConfirmation("");
                    setError(null);
                  }}
                  className={`rounded-2xl border-2 p-4 text-left text-sm font-black ${decision === "REJECT" ? "border-red-600 bg-red-50 text-red-950" : "border-slate-200 text-slate-700"}`}
                >
                  <XCircle aria-hidden="true" className="mb-2" /> Rechazar
                  solicitud
                </button>
              </div>
              {decision === "REJECT" && (
                <div className="space-y-2">
                  <Label htmlFor="adoption-rejection-reason">
                    Razón concreta del rechazo
                  </Label>
                  <textarea
                    id="adoption-rejection-reason"
                    className={TEXTAREA_CLASS}
                    minLength={20}
                    maxLength={2_000}
                    required
                    value={reason}
                    onChange={(event) => setReason(event.target.value)}
                  />
                  <p className="text-right text-xs font-semibold text-slate-500">
                    {reason.length.toLocaleString("es-CO")} / 2.000 · mínimo 20
                  </p>
                </div>
              )}
              <label className="flex items-start gap-3 rounded-2xl border border-blue-200 bg-blue-50 p-4 text-sm font-semibold leading-6 text-blue-950">
                <input
                  type="checkbox"
                  checked={evidenceChecked}
                  onChange={(event) => setEvidenceChecked(event.target.checked)}
                  className="mt-1 h-4 w-4 shrink-0 accent-blue-700"
                />
                Comparé fuera del sistema la referencia, el archivo o expediente
                y su SHA-256; mi decisión es independiente de la persona
                solicitante.
              </label>
              <div className="space-y-2">
                <Label htmlFor="adoption-review-confirmation">
                  Escribe{" "}
                  {decision === "APPROVE"
                    ? "APROBAR ADOPCION"
                    : "RECHAZAR ADOPCION"}
                </Label>
                <Input
                  id="adoption-review-confirmation"
                  autoComplete="off"
                  value={confirmation}
                  onChange={(event) => setConfirmation(event.target.value)}
                />
              </div>
              {error && (
                <div
                  role="alert"
                  className="flex items-start gap-3 rounded-2xl border border-red-200 bg-red-50 p-4 text-sm font-semibold text-red-900"
                >
                  <AlertCircle
                    aria-hidden="true"
                    size={18}
                    className="shrink-0"
                  />
                  {error}
                </div>
              )}
              {notice && (
                <div
                  role="status"
                  className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-sm font-semibold text-emerald-950"
                >
                  {notice}
                </div>
              )}
              <Button
                type="button"
                onClick={() => void submitReview()}
                disabled={
                  reviewing ||
                  !evidenceChecked ||
                  confirmation.trim() !==
                    (decision === "APPROVE"
                      ? "APROBAR ADOPCION"
                      : "RECHAZAR ADOPCION") ||
                  (decision === "REJECT" && reason.trim().length < 20)
                }
                className="w-full sm:w-auto"
              >
                {reviewing && (
                  <Loader2
                    aria-hidden="true"
                    size={17}
                    className="mr-2 animate-spin"
                  />
                )}
                {decision === "APPROVE"
                  ? "Confirmar aprobación independiente"
                  : "Confirmar rechazo independiente"}
              </Button>
            </div>
          )}
          {!mayReview && error && (
            <div
              role="alert"
              className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm font-semibold text-red-900"
            >
              {error}
            </div>
          )}
          {!mayReview && notice && (
            <div
              role="status"
              className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-sm font-semibold text-emerald-950"
            >
              {notice}
            </div>
          )}
        </>
      )}
    </section>
  );
}
