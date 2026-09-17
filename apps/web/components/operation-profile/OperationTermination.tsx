"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import {
  AlertTriangle,
  CheckCircle2,
  Clock3,
  ExternalLink,
  Loader2,
  RefreshCw,
  ShieldX,
  XCircle,
} from "lucide-react";
import { Button, Input, Label } from "@/components/ui";
import { Select } from "@/components/ui/select";
import { ApiError } from "@/lib/api-client";
import {
  cancelOperationTermination,
  computeOperationTerminationCancellationSha256,
  computeOperationTerminationPayloadSha256,
  computeOperationTerminationReviewSha256,
  getOperationTermination,
  OPERATION_TERMINATION_CAUSES,
  requestOperationTermination,
  reviewOperationTermination,
  type OperationTerminationCause,
  type OperationTerminationContext,
  type OperationTerminationDecision,
  type OperationTerminationRequest,
} from "@/lib/operation-termination-api";
import type { OperationProfile } from "@/lib/operation-profile-api";
import type { BackendUserRole } from "@/types/saas-schema";
import { useConfirmation } from "@/context/confirmation";

const READ_ROLES = new Set<BackendUserRole>([
  "ADMIN",
  "COMPLIANCE_OFFICER",
  "AUDITOR",
]);
const REVIEW_ROLES = new Set<BackendUserRole>([
  "COMPLIANCE_OFFICER",
  "AUDITOR",
]);
const TEXTAREA_CLASS =
  "min-h-32 w-full resize-y rounded-2xl border-2 border-slate-200 bg-white px-5 py-4 text-sm leading-6 text-slate-900 outline-none transition focus:border-red-700 focus:ring-2 focus:ring-red-700/10 disabled:cursor-not-allowed disabled:opacity-50";
const CAUSE_LABELS: Record<OperationTerminationCause, string> = {
  CANDIDACY_WITHDRAWAL: "Retiro de candidatura",
  REGISTRATION_DENIED: "Inscripción negada",
  REGISTRATION_REVOKED: "Inscripción revocada",
  DISQUALIFICATION: "Inhabilidad",
  SIGNATURE_THRESHOLD_NOT_MET: "Umbral de firmas no alcanzado",
  ENDORSEMENT_WITHDRAWN: "Aval retirado",
  ELECTION_CANCELLED: "Elección cancelada",
  OTHER: "Otra causal documentada",
};
const STATUS_LABELS = {
  PENDING: { label: "Pendiente", style: "bg-amber-100 text-amber-950" },
  APPROVED: { label: "Aprobada", style: "bg-red-100 text-red-950" },
  REJECTED: { label: "Rechazada", style: "bg-slate-200 text-slate-900" },
  EXPIRED: { label: "Vencida", style: "bg-slate-200 text-slate-900" },
  CANCELLED: { label: "Cancelada", style: "bg-slate-200 text-slate-900" },
} as const;

interface TerminationDraft {
  cause: OperationTerminationCause;
  otherCause: string;
  effectiveAt: string;
  explanation: string;
  authorityName: string;
  officialActType: string;
  officialActReference: string;
  officialActIssuedAt: string;
  evidenceReference: string;
  evidenceSha256: string;
  consequencesAcknowledged: boolean;
  confirmation: string;
}

const EMPTY_DRAFT: TerminationDraft = {
  cause: "CANDIDACY_WITHDRAWAL",
  otherCause: "",
  effectiveAt: "",
  explanation: "",
  authorityName: "",
  officialActType: "",
  officialActReference: "",
  officialActIssuedAt: "",
  evidenceReference: "",
  evidenceSha256: "",
  consequencesAcknowledged: false,
  confirmation: "",
};

function readableError(error: unknown, fallback: string): string {
  if (error instanceof ApiError) return error.message;
  if (error instanceof Error && error.message) return error.message;
  return fallback;
}

function formatDateTime(value: string | null): string {
  if (!value) return "No aplica";
  const parsed = new Date(value);
  if (!Number.isFinite(parsed.getTime())) return "Fecha inválida";
  return new Intl.DateTimeFormat("es-CO", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "America/Bogota",
  }).format(parsed);
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

function RequestDetails({ request }: { request: OperationTerminationRequest }) {
  return (
    <dl className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
      <Detail label="Solicitud" value={request.id} />
      <Detail label="Estado" value={STATUS_LABELS[request.status].label} />
      <Detail label="Causal" value={CAUSE_LABELS[request.cause]} />
      {request.otherCause && (
        <div className="sm:col-span-2 lg:col-span-3">
          <Detail label="Otra causal" value={request.otherCause} />
        </div>
      )}
      <Detail
        label="Efectiva desde"
        value={formatDateTime(request.effectiveAt)}
      />
      <Detail label="Autoridad" value={request.authorityName} />
      <Detail
        label="Acto y referencia"
        value={`${request.officialActType} · ${request.officialActReference}`}
      />
      <Detail
        label="Expedición del acto"
        value={formatDateTime(request.officialActIssuedAt)}
      />
      <Detail
        label="Solicitó"
        value={`${request.requestedBy.name} · ${request.requestedBy.role}`}
      />
      <Detail label="Creada" value={formatDateTime(request.createdAt)} />
      <Detail label="Caduca" value={formatDateTime(request.expiresAt)} />
      <Detail
        label="Revisó"
        value={
          request.reviewedBy
            ? `${request.reviewedBy.name} · ${request.reviewedBy.role}`
            : "Pendiente de revisión independiente"
        }
      />
      <Detail label="Revisada" value={formatDateTime(request.reviewedAt)} />
      <Detail
        label="Canceló"
        value={
          request.cancelledBy
            ? `${request.cancelledBy.name} · ${request.cancelledBy.role}`
            : "No aplica"
        }
      />
      <div className="sm:col-span-2 lg:col-span-3">
        <Detail label="Explicación completa" value={request.explanation} />
      </div>
      <div className="sm:col-span-2 lg:col-span-3">
        <dt className="text-[10px] font-black uppercase tracking-[0.14em] text-slate-500">
          Evidencia declarada
        </dt>
        <dd className="mt-1 break-all text-sm font-semibold text-blue-800">
          <a
            href={request.evidenceReference}
            target="_blank"
            rel="noreferrer noopener"
            className="inline-flex items-center gap-1 underline"
          >
            Abrir referencia HTTPS <ExternalLink aria-hidden="true" size={14} />
          </a>
        </dd>
      </div>
      <div className="sm:col-span-2 lg:col-span-3 font-mono text-xs">
        <Detail label="SHA-256 de evidencia" value={request.evidenceSha256} />
      </div>
      <div className="sm:col-span-2 lg:col-span-3 font-mono text-xs">
        <Detail label="SHA-256 canónico" value={request.payloadSha256} />
      </div>
      {request.rejectionReason && (
        <div className="sm:col-span-2 lg:col-span-3">
          <Detail label="Razón de rechazo" value={request.rejectionReason} />
        </div>
      )}
      {request.cancellationReason && (
        <div className="sm:col-span-2 lg:col-span-3">
          <Detail
            label="Razón de cancelación"
            value={request.cancellationReason}
          />
        </div>
      )}
    </dl>
  );
}

interface Props {
  role: BackendUserRole;
  userId: string;
  profile: OperationProfile | null;
  onApproved: () => void;
}

export function OperationTerminationPanel({
  role,
  userId,
  profile,
  onApproved,
}: Props) {
  const confirm = useConfirmation();
  const [context, setContext] = useState<OperationTerminationContext | null>(
    null,
  );
  const [draft, setDraft] = useState<TerminationDraft>(EMPTY_DRAFT);
  const [loading, setLoading] = useState(true);
  const [mutating, setMutating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [decision, setDecision] =
    useState<OperationTerminationDecision>("APPROVE");
  const [reviewReason, setReviewReason] = useState("");
  const [reviewChecked, setReviewChecked] = useState(false);
  const [reviewConfirmation, setReviewConfirmation] = useState("");
  const [cancelReason, setCancelReason] = useState("");
  const [cancelConfirmation, setCancelConfirmation] = useState("");
  const [newRequestMode, setNewRequestMode] = useState(false);
  const requestAttempt = useRef<{ fingerprint: string; id: string } | null>(
    null,
  );
  const reviewAttempt = useRef<{ fingerprint: string; id: string } | null>(
    null,
  );
  const cancelAttempt = useRef<{ fingerprint: string; id: string } | null>(
    null,
  );

  const load = useCallback(
    async (signal?: AbortSignal) => {
      if (!READ_ROLES.has(role)) return;
      setLoading(true);
      setContext(null);
      setNewRequestMode(false);
      setError(null);
      setNotice(null);
      try {
        setContext(await getOperationTermination(signal));
      } catch (loadError: unknown) {
        if (!signal?.aborted) {
          setError(
            readableError(
              loadError,
              "No fue posible consultar el expediente de terminación.",
            ),
          );
        }
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
  }, [load, role, profile?.stage, profile?.updatedAt]);

  if (!READ_ROLES.has(role)) return null;
  const storedRequest = context?.request ?? null;
  const request = newRequestMode ? null : storedRequest;
  const effectiveProfile = context?.profile ?? profile;
  const mayRequest =
    role === "ADMIN" &&
    context !== null &&
    Boolean(effectiveProfile) &&
    effectiveProfile?.stage !== "CLOSED" &&
    storedRequest?.status !== "PENDING" &&
    storedRequest?.status !== "APPROVED";
  const mayReview = Boolean(
    request?.status === "PENDING" &&
    REVIEW_ROLES.has(role) &&
    request.requestedById !== userId,
  );
  const mayCancel = Boolean(
    request?.status === "PENDING" &&
    role === "ADMIN" &&
    request.requestedById === userId,
  );

  function setField<K extends keyof TerminationDraft>(
    field: K,
    value: TerminationDraft[K],
  ) {
    setDraft((current) => ({ ...current, [field]: value }));
    setError(null);
    setNotice(null);
  }

  async function submitRequest() {
    if (!mayRequest || !effectiveProfile) return;
    const effectiveAt = new Date(draft.effectiveAt);
    const issuedAt = new Date(draft.officialActIssuedAt);
    if (
      !Number.isFinite(effectiveAt.getTime()) ||
      !Number.isFinite(issuedAt.getTime()) ||
      effectiveAt.getTime() > Date.now() ||
      issuedAt.getTime() > Date.now()
    ) {
      setError(
        "La fecha efectiva y la expedición del acto deben ser válidas y no futuras.",
      );
      return;
    }
    if (draft.explanation.trim().length < 120) {
      setError(
        "La explicación verificable debe tener al menos 120 caracteres.",
      );
      return;
    }
    if (draft.cause === "OTHER" && draft.otherCause.trim().length < 50) {
      setError(
        "La otra causal requiere una descripción de al menos 50 caracteres.",
      );
      return;
    }
    if (!/^[a-f0-9]{64}$/.test(draft.evidenceSha256)) {
      setError(
        "El SHA-256 debe tener 64 caracteres hexadecimales en minúscula.",
      );
      return;
    }
    try {
      const url = new URL(draft.evidenceReference.trim());
      if (url.protocol !== "https:" || url.username || url.password)
        throw new Error();
    } catch {
      setError(
        "La evidencia requiere una URL HTTPS válida y sin credenciales embebidas.",
      );
      return;
    }
    if (
      !draft.consequencesAcknowledged ||
      draft.confirmation.trim() !== "SOLICITAR CIERRE EXCEPCIONAL"
    ) {
      setError("Reconoce las consecuencias y escribe la confirmación exacta.");
      return;
    }
    if (
      !(await confirm({
        title: "Enviar solicitud de cierre excepcional",
        description:
          "Esta solicitud busca terminar la operación antes del cierre ordinario. No elimina datos ni obligaciones y requerirá aprobación independiente.",
        confirmLabel: "Enviar solicitud",
      }))
    )
      return;

    setMutating(true);
    setError(null);
    setNotice(null);
    try {
      const logicalPayload = {
        expectedProfileUpdatedAt: effectiveProfile.updatedAt,
        cause: draft.cause,
        ...(draft.cause === "OTHER"
          ? { otherCause: draft.otherCause.trim() }
          : {}),
        effectiveAt: effectiveAt.toISOString(),
        explanation: draft.explanation.trim(),
        authorityName: draft.authorityName.trim(),
        officialActType: draft.officialActType.trim(),
        officialActReference: draft.officialActReference.trim(),
        officialActIssuedAt: issuedAt.toISOString(),
        evidenceReference: draft.evidenceReference.trim(),
        evidenceSha256: draft.evidenceSha256,
        consequencesAcknowledged: true as const,
      };
      const fingerprint = JSON.stringify(logicalPayload);
      const clientRequestId =
        requestAttempt.current?.fingerprint === fingerprint
          ? requestAttempt.current.id
          : globalThis.crypto.randomUUID();
      requestAttempt.current = { fingerprint, id: clientRequestId };
      const hashInput = { clientRequestId, ...logicalPayload };
      const payloadSha256 =
        await computeOperationTerminationPayloadSha256(hashInput);
      const result = await requestOperationTermination({
        ...hashInput,
        payloadSha256,
      });
      setContext((current) => ({
        profile: current?.profile ?? effectiveProfile,
        request: result.request,
        dossier: result.dossier,
      }));
      setNewRequestMode(false);
      setNotice(
        result.noOp
          ? "La solicitud idéntica ya estaba registrada; no se duplicó."
          : "Solicitud registrada. La etapa no cambió y requiere revisión independiente antes de caducar.",
      );
    } catch (requestError: unknown) {
      setError(
        readableError(requestError, "No fue posible registrar la terminación."),
      );
    } finally {
      setMutating(false);
    }
  }

  async function submitReview() {
    if (!request || !mayReview) return;
    const reason = reviewReason.trim();
    const phrase =
      decision === "APPROVE"
        ? "APROBAR CIERRE EXCEPCIONAL"
        : "RECHAZAR CIERRE EXCEPCIONAL";
    if (
      !reviewChecked ||
      reviewConfirmation.trim() !== phrase ||
      (decision === "REJECT" && reason.length < 20)
    ) {
      setError(`Verifica el expediente y escribe ${phrase}.`);
      return;
    }
    if (
      !(await confirm({
        title:
          decision === "APPROVE"
            ? "Cerrar la operación"
            : "Rechazar la solicitud",
        description:
          decision === "APPROVE"
            ? "La aprobación cerrará inmediatamente la operación, cancelará comunicaciones no publicadas y no podrá deshacerse."
            : "El rechazo terminará esta solicitud sin cambiar la etapa.",
        confirmLabel:
          decision === "APPROVE" ? "Confirmar cierre" : "Confirmar rechazo",
        destructive: decision === "APPROVE",
      }))
    )
      return;

    setMutating(true);
    setError(null);
    setNotice(null);
    try {
      const fingerprint = JSON.stringify({
        requestId: request.id,
        expectedPayloadSha256: request.payloadSha256,
        decision,
        rejectionReason: decision === "REJECT" ? reason : null,
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
        ...(decision === "REJECT" ? { rejectionReason: reason } : {}),
      };
      const reviewPayloadSha256 = await computeOperationTerminationReviewSha256(
        request.id,
        hashInput,
      );
      const result = await reviewOperationTermination(request.id, {
        ...hashInput,
        reviewPayloadSha256,
      });
      setContext({
        profile: result.profile ?? context?.profile ?? null,
        request: result.request,
        dossier: result.dossier,
      });
      if (result.request.status === "APPROVED") {
        setNotice(
          result.noOp
            ? "La misma aprobación ya estaba confirmada; no se ejecutó de nuevo."
            : "Cierre excepcional confirmado. Las obligaciones supervivientes permanecen visibles y los datos no fueron eliminados.",
        );
        onApproved();
      } else if (result.request.status === "REJECTED") {
        setNotice("Solicitud rechazada sin cambiar la etapa operativa.");
      } else {
        setNotice("La solicitud ya había vencido; no se cerró la operación.");
      }
    } catch (reviewError: unknown) {
      setError(
        readableError(reviewError, "No fue posible registrar la revisión."),
      );
    } finally {
      setMutating(false);
    }
  }

  async function submitCancellation() {
    if (!request || !mayCancel) return;
    const reason = cancelReason.trim();
    if (
      reason.length < 20 ||
      cancelConfirmation.trim() !== "CANCELAR SOLICITUD"
    ) {
      setError("Explica la cancelación y escribe CANCELAR SOLICITUD.");
      return;
    }
    if (
      !(await confirm({
        title: "Cancelar solicitud pendiente",
        description:
          "La solicitud se cancelará sin cerrar la operación y el registro histórico se conservará.",
        confirmLabel: "Cancelar solicitud",
        destructive: true,
      }))
    )
      return;
    setMutating(true);
    setError(null);
    setNotice(null);
    try {
      const fingerprint = JSON.stringify({ requestId: request.id, reason });
      const clientCancellationId =
        cancelAttempt.current?.fingerprint === fingerprint
          ? cancelAttempt.current.id
          : globalThis.crypto.randomUUID();
      cancelAttempt.current = { fingerprint, id: clientCancellationId };
      const hashInput = {
        clientCancellationId,
        expectedPayloadSha256: request.payloadSha256,
        reason,
      };
      const cancellationPayloadSha256 =
        await computeOperationTerminationCancellationSha256(
          request.id,
          hashInput,
        );
      const result = await cancelOperationTermination(request.id, {
        ...hashInput,
        cancellationPayloadSha256,
      });
      setContext((current) => ({
        profile: current?.profile ?? null,
        request: result.request,
        dossier: null,
      }));
      setNotice(
        result.noOp
          ? "La misma cancelación ya estaba registrada."
          : "Solicitud cancelada. La etapa operativa no cambió.",
      );
    } catch (cancelError: unknown) {
      setError(
        readableError(cancelError, "No fue posible cancelar la solicitud."),
      );
    } finally {
      setMutating(false);
    }
  }

  return (
    <section
      aria-labelledby="termination-title"
      className="space-y-6 rounded-3xl border-2 border-red-300 bg-white p-5 shadow-sm sm:p-8"
    >
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="text-[10px] font-black uppercase tracking-[0.18em] text-red-700">
            Zona de alto impacto · irreversible
          </p>
          <h2
            id="termination-title"
            className="mt-2 flex items-center gap-3 text-xl font-black text-slate-950"
          >
            <ShieldX aria-hidden="true" className="text-red-700" />
            Terminación excepcional de la operación
          </h2>
          <p className="mt-2 max-w-3xl text-sm font-semibold leading-6 text-slate-700">
            Úsala sólo cuando una causal documentada hace imposible continuar
            antes del cierre poselectoral ordinario. No borra datos, no
            certifica cumplimiento y nunca permite reabrir.
          </p>
        </div>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => void load()}
          disabled={loading || mutating}
          className="gap-2"
        >
          <RefreshCw
            aria-hidden="true"
            size={15}
            className={loading ? "animate-spin" : undefined}
          />
          Recargar expediente
        </Button>
      </div>

      <div
        role="note"
        className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm font-semibold leading-6 text-red-950"
      >
        <AlertTriangle aria-hidden="true" className="mr-2 inline" size={18} />
        El cierre ordinario continúa siendo POST_ELECTION → CLOSED y conserva
        todos sus bloqueadores. Esta vía excepcional exige acto, evidencia,
        hash, vigencia del perfil y cuatro ojos.
      </div>

      {effectiveProfile && (
        <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 text-sm leading-6 text-slate-800">
          <p className="font-black">
            Ventana electoral conservada en el expediente
          </p>
          <p>
            {effectiveProfile.votingStartDate} a{" "}
            {effectiveProfile.votingEndDate}, fechas civiles inclusivas en
            America/Bogota.
          </p>
          {effectiveProfile.votingWindowSourceUrl &&
            effectiveProfile.votingWindowReference && (
              <p className="mt-1">
                {effectiveProfile.votingWindowReference}.{" "}
                <a
                  href={effectiveProfile.votingWindowSourceUrl}
                  target="_blank"
                  rel="noreferrer noopener"
                  className="inline-flex items-center gap-1 font-bold text-blue-800 underline decoration-2 underline-offset-4"
                >
                  Abrir fuente
                  <ExternalLink aria-hidden="true" size={14} />
                </a>
              </p>
            )}
        </div>
      )}

      {loading ? (
        <div
          role="status"
          className="flex items-center gap-3 text-sm font-semibold text-slate-600"
        >
          <Loader2 aria-hidden="true" className="animate-spin" size={18} />{" "}
          Consultando expediente…
        </div>
      ) : request ? (
        <>
          <div className="flex flex-wrap items-center gap-3">
            <span
              role="status"
              className={`rounded-full px-3 py-1.5 text-xs font-black ${STATUS_LABELS[request.status].style}`}
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

          {request.status === "PENDING" &&
            REVIEW_ROLES.has(role) &&
            request.requestedById === userId && (
              <div
                role="note"
                className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm font-semibold text-amber-950"
              >
                No puedes revisar tu propia solicitud. Debe decidir otra persona
                de cumplimiento o auditoría.
              </div>
            )}

          {mayReview && (
            <div className="space-y-5 border-t border-red-200 pt-6">
              <h3 className="text-lg font-black">Decisión independiente</h3>
              <div className="grid gap-3 sm:grid-cols-2">
                <button
                  type="button"
                  aria-pressed={decision === "APPROVE"}
                  onClick={() => {
                    setDecision("APPROVE");
                    setReviewConfirmation("");
                    setError(null);
                  }}
                  className={`rounded-2xl border-2 p-4 text-left text-sm font-black ${decision === "APPROVE" ? "border-red-700 bg-red-50 text-red-950" : "border-slate-200 text-slate-700"}`}
                >
                  <ShieldX aria-hidden="true" className="mb-2" /> Aprobar cierre
                  irreversible
                </button>
                <button
                  type="button"
                  aria-pressed={decision === "REJECT"}
                  onClick={() => {
                    setDecision("REJECT");
                    setReviewConfirmation("");
                    setError(null);
                  }}
                  className={`rounded-2xl border-2 p-4 text-left text-sm font-black ${decision === "REJECT" ? "border-slate-700 bg-slate-100 text-slate-950" : "border-slate-200 text-slate-700"}`}
                >
                  <XCircle aria-hidden="true" className="mb-2" /> Rechazar
                  solicitud
                </button>
              </div>
              {decision === "REJECT" && (
                <div className="space-y-2">
                  <Label htmlFor="termination-rejection-reason">
                    Razón concreta del rechazo
                  </Label>
                  <textarea
                    id="termination-rejection-reason"
                    className={TEXTAREA_CLASS}
                    minLength={20}
                    maxLength={2_000}
                    value={reviewReason}
                    onChange={(event) => setReviewReason(event.target.value)}
                  />
                </div>
              )}
              <label className="flex items-start gap-3 rounded-2xl border border-red-200 bg-red-50 p-4 text-sm font-semibold leading-6 text-red-950">
                <input
                  type="checkbox"
                  checked={reviewChecked}
                  onChange={(event) => setReviewChecked(event.target.checked)}
                  className="mt-1 h-4 w-4 accent-red-700"
                />
                Verifiqué independientemente la autoridad, el acto, la
                referencia HTTPS, el SHA-256 y la versión exacta del perfil;
                entiendo las obligaciones que sobreviven.
              </label>
              <div className="space-y-2">
                <Label htmlFor="termination-review-confirmation">
                  Escribe{" "}
                  {decision === "APPROVE"
                    ? "APROBAR CIERRE EXCEPCIONAL"
                    : "RECHAZAR CIERRE EXCEPCIONAL"}
                </Label>
                <Input
                  id="termination-review-confirmation"
                  autoComplete="off"
                  value={reviewConfirmation}
                  onChange={(event) =>
                    setReviewConfirmation(event.target.value)
                  }
                />
              </div>
              <Button
                type="button"
                onClick={() => void submitReview()}
                disabled={mutating}
                className="w-full bg-red-800 hover:bg-red-900 sm:w-auto"
              >
                {mutating && (
                  <Loader2
                    aria-hidden="true"
                    size={17}
                    className="mr-2 animate-spin"
                  />
                )}
                Confirmar decisión independiente
              </Button>
            </div>
          )}

          {mayCancel && (
            <div className="space-y-4 border-t border-slate-200 pt-6">
              <h3 className="font-black">Cancelar mi solicitud pendiente</h3>
              <div className="space-y-2">
                <Label htmlFor="termination-cancel-reason">
                  Razón de cancelación
                </Label>
                <textarea
                  id="termination-cancel-reason"
                  className={TEXTAREA_CLASS}
                  minLength={20}
                  maxLength={2_000}
                  value={cancelReason}
                  onChange={(event) => setCancelReason(event.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="termination-cancel-confirmation">
                  Escribe CANCELAR SOLICITUD
                </Label>
                <Input
                  id="termination-cancel-confirmation"
                  autoComplete="off"
                  value={cancelConfirmation}
                  onChange={(event) =>
                    setCancelConfirmation(event.target.value)
                  }
                />
              </div>
              <Button
                type="button"
                variant="outline"
                onClick={() => void submitCancellation()}
                disabled={mutating}
              >
                Cancelar solicitud pendiente
              </Button>
            </div>
          )}

          {mayRequest &&
            ["REJECTED", "EXPIRED", "CANCELLED"].includes(request.status) && (
              <div className="border-t border-slate-200 pt-6">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => {
                    setNewRequestMode(true);
                    setError(null);
                    setNotice(null);
                  }}
                >
                  Crear una nueva solicitud con evidencia actualizada
                </Button>
              </div>
            )}
        </>
      ) : mayRequest ? (
        <div className="space-y-6 border-t border-red-200 pt-6">
          <div className="grid gap-5 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="termination-cause">Causal formal</Label>
              <Select
                id="termination-cause"
                value={draft.cause}
                onChange={(event) =>
                  setField(
                    "cause",
                    event.target.value as OperationTerminationCause,
                  )
                }
              >
                {OPERATION_TERMINATION_CAUSES.map((cause) => (
                  <option key={cause} value={cause}>
                    {CAUSE_LABELS[cause]}
                  </option>
                ))}
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="termination-effective-at">
                Fecha y hora efectiva
              </Label>
              <Input
                id="termination-effective-at"
                type="datetime-local"
                required
                value={draft.effectiveAt}
                onChange={(event) =>
                  setField("effectiveAt", event.target.value)
                }
              />
            </div>
            {draft.cause === "OTHER" && (
              <div className="space-y-2 sm:col-span-2">
                <Label htmlFor="termination-other-cause">
                  Descripción precisa de la otra causal
                </Label>
                <textarea
                  id="termination-other-cause"
                  className={TEXTAREA_CLASS}
                  minLength={50}
                  maxLength={300}
                  value={draft.otherCause}
                  onChange={(event) =>
                    setField("otherCause", event.target.value)
                  }
                />
              </div>
            )}
            <div className="space-y-2">
              <Label htmlFor="termination-authority">
                Autoridad u órgano competente
              </Label>
              <Input
                id="termination-authority"
                minLength={3}
                maxLength={300}
                required
                value={draft.authorityName}
                onChange={(event) =>
                  setField("authorityName", event.target.value)
                }
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="termination-act-type">
                Tipo de acto o decisión
              </Label>
              <Input
                id="termination-act-type"
                minLength={3}
                maxLength={160}
                required
                value={draft.officialActType}
                onChange={(event) =>
                  setField("officialActType", event.target.value)
                }
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="termination-act-reference">
                Número o referencia verificable
              </Label>
              <Input
                id="termination-act-reference"
                minLength={3}
                maxLength={300}
                required
                value={draft.officialActReference}
                onChange={(event) =>
                  setField("officialActReference", event.target.value)
                }
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="termination-act-issued-at">
                Expedición del acto
              </Label>
              <Input
                id="termination-act-issued-at"
                type="datetime-local"
                required
                value={draft.officialActIssuedAt}
                onChange={(event) =>
                  setField("officialActIssuedAt", event.target.value)
                }
              />
            </div>
            <div className="space-y-2 sm:col-span-2">
              <Label htmlFor="termination-explanation">
                Explicación extensa y verificable
              </Label>
              <textarea
                id="termination-explanation"
                className={TEXTAREA_CLASS}
                minLength={120}
                maxLength={6_000}
                required
                value={draft.explanation}
                onChange={(event) =>
                  setField("explanation", event.target.value)
                }
              />
              <p className="text-right text-xs font-semibold text-slate-500">
                {draft.explanation.length.toLocaleString("es-CO")} / 6.000 ·
                mínimo 120
              </p>
            </div>
            <div className="space-y-2 sm:col-span-2">
              <Label htmlFor="termination-evidence-url">
                Referencia HTTPS durable de evidencia
              </Label>
              <Input
                id="termination-evidence-url"
                type="url"
                maxLength={2_048}
                required
                placeholder="https://autoridad.example/acto/123"
                value={draft.evidenceReference}
                onChange={(event) =>
                  setField("evidenceReference", event.target.value)
                }
              />
              <p className="text-xs text-slate-500">
                No uses enlaces firmados temporales ni URLs con credenciales. La
                plataforma no descarga ni certifica el archivo.
              </p>
            </div>
            <div className="space-y-2 sm:col-span-2">
              <Label htmlFor="termination-evidence-sha">
                SHA-256 de la evidencia
              </Label>
              <Input
                id="termination-evidence-sha"
                minLength={64}
                maxLength={64}
                pattern="[a-f0-9]{64}"
                className="font-mono text-xs"
                required
                value={draft.evidenceSha256}
                onChange={(event) =>
                  setField("evidenceSha256", event.target.value.toLowerCase())
                }
              />
            </div>
          </div>
          <label className="flex items-start gap-3 rounded-2xl border border-red-300 bg-red-50 p-4 text-sm font-semibold leading-6 text-red-950">
            <input
              type="checkbox"
              checked={draft.consequencesAcknowledged}
              onChange={(event) =>
                setField("consequencesAcknowledged", event.target.checked)
              }
              className="mt-1 h-4 w-4 accent-red-700"
            />
            Declaro que el cierre no borra datos, no acredita cumplimiento ni
            radicación y que sobreviven finanzas, retención, derechos de
            titulares, evidencia, comunicaciones y asuntos urgentes.
          </label>
          <div className="space-y-2">
            <Label htmlFor="termination-confirmation">
              Escribe SOLICITAR CIERRE EXCEPCIONAL
            </Label>
            <Input
              id="termination-confirmation"
              autoComplete="off"
              value={draft.confirmation}
              onChange={(event) => setField("confirmation", event.target.value)}
            />
          </div>
          <Button
            type="button"
            onClick={() => void submitRequest()}
            disabled={mutating}
            className="w-full bg-red-800 hover:bg-red-900 sm:w-auto"
          >
            {mutating && (
              <Loader2
                aria-hidden="true"
                size={17}
                className="mr-2 animate-spin"
              />
            )}
            Solicitar revisión de cierre excepcional
          </Button>
        </div>
      ) : (
        <p className="rounded-2xl bg-slate-50 p-4 text-sm font-semibold text-slate-700">
          {effectiveProfile?.stage === "CLOSED"
            ? "La operación está cerrada y este expediente permanece en consulta; no existe acción de reapertura."
            : "Tu rol puede consultar el expediente, pero no solicitar la terminación."}
        </p>
      )}

      {context?.dossier && (
        <div className="space-y-4 border-t border-red-200 pt-6">
          <div>
            <h3 className="text-lg font-black">
              Expediente de obligaciones supervivientes
            </h3>
            <p className="mt-1 text-sm font-semibold text-red-900">
              No certifica cumplimiento ni radicación ante autoridad.
            </p>
          </div>
          <ul className="grid gap-3 sm:grid-cols-2">
            {context.dossier.obligations.map((obligation) => (
              <li
                key={obligation.code}
                className="rounded-2xl border border-slate-200 p-4"
              >
                <span className="text-[10px] font-black uppercase tracking-[0.14em] text-red-700">
                  {obligation.status}
                </span>
                <h4 className="mt-1 font-black">{obligation.label}</h4>
                <p className="mt-2 text-sm leading-6 text-slate-700">
                  {obligation.detail}
                </p>
                <Link
                  href={obligation.href}
                  className="mt-3 inline-flex items-center gap-1 text-sm font-black text-blue-800 underline"
                >
                  Abrir obligación <ExternalLink aria-hidden="true" size={14} />
                </Link>
              </li>
            ))}
          </ul>
          <p className="rounded-2xl bg-amber-50 p-4 text-sm font-semibold leading-6 text-amber-950">
            {context.dossier.disclaimer}
          </p>
        </div>
      )}

      {error && (
        <div
          role="alert"
          className="rounded-2xl border border-red-300 bg-red-50 p-4 text-sm font-semibold text-red-950"
        >
          {error}
        </div>
      )}
      {notice && (
        <div
          role="status"
          aria-live="polite"
          className="flex items-start gap-2 rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-sm font-semibold text-emerald-950"
        >
          <CheckCircle2 aria-hidden="true" size={18} className="shrink-0" />
          {notice}
        </div>
      )}
    </section>
  );
}
