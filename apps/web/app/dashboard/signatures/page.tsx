"use client";

import { usePageRequest } from "@/lib/use-page-request";

import { SignatureCountCorrectionPanel } from "@/components/signatures/SignatureCountCorrectionPanel";
import { useAuth } from "@/context/auth";
import { ApiError } from "@/lib/api-client";
import {
  advanceSignatureBatch,
  createSignatureBatch,
  createSignatureCollectionPlan,
  getSignatureCollectionOverview,
  issueSignatureBatch,
  quarantineSignatureBatch,
  recordSignatureAuthorityResult,
  releaseSignatureBatch,
  returnSignatureBatch,
  reviewSignatureAuthorityResult,
  reviewSignatureBatch,
  type SignatureCollectionBatch,
  type SignatureCommandResponse,
} from "@/lib/signature-collection-api";
import type { BackendUserRole } from "@/types/saas-schema";
import {
  AlertTriangle,
  CheckCircle2,
  ClipboardCheck,
  FileCheck2,
  Loader2,
  RefreshCw,
  ShieldCheck,
} from "lucide-react";
import Link from "next/link";
import { FormEvent, useMemo, useState } from "react";

const MANAGEMENT_ROLES = new Set<BackendUserRole>([
  "ADMIN",
  "CAMPAIGN_MANAGER",
]);
const FIELD_ROLES = new Set<BackendUserRole>([
  "ADMIN",
  "CAMPAIGN_MANAGER",
  "ZONE_COORDINATOR",
]);
const INTERNAL_REVIEW_ROLES = new Set<BackendUserRole>([
  "ADMIN",
  "CAMPAIGN_MANAGER",
  "COMPLIANCE_OFFICER",
]);
const AUTHORITY_REVIEW_ROLES = new Set<BackendUserRole>([
  "COMPLIANCE_OFFICER",
  "AUDITOR",
]);

const STATUS_LABEL: Record<SignatureCollectionBatch["status"], string> = {
  PLANNED: "Planificado",
  ISSUED: "Entregado a custodia",
  PARTIALLY_RETURNED: "Retorno parcial",
  RETURNED: "Retornado",
  INTERNAL_REVIEWED: "Revisión interna terminada",
  DELIVERED_TO_COMMITTEE: "Entregado al comité",
  SUBMITTED_TO_AUTHORITY: "Radicado ante autoridad",
  AUTHORITY_RESULT_RECORDED: "Constancia aprobada y vinculada",
  QUARANTINED: "En cuarentena",
};

const HASH_PATTERN = "[a-f0-9]{64}";

function text(data: FormData, key: string): string {
  const value = data.get(key);
  return typeof value === "string" ? value.trim() : "";
}

function optionalText(data: FormData, key: string): string | undefined {
  return text(data, key) || undefined;
}

function number(data: FormData, key: string): number {
  return Number(text(data, key));
}

function freshId(): string {
  return globalThis.crypto.randomUUID();
}

function readableError(error: unknown): string {
  if (error instanceof ApiError) return error.message;
  if (error instanceof Error && error.message) return error.message;
  return "No fue posible confirmar la operación. Recarga el expediente e inténtalo de nuevo.";
}

function formatDate(value: string | null, withTime = false): string {
  if (!value) return "Sin fecha";
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return value.slice(0, 10);
  return new Intl.DateTimeFormat("es-CO", {
    dateStyle: "medium",
    ...(withTime ? { timeStyle: "short" as const } : {}),
    timeZone: "America/Bogota",
  }).format(date);
}

function SummaryCard({
  label,
  value,
  warning = false,
}: {
  label: string;
  value: number | null;
  warning?: boolean;
}) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm min-w-0">
      <p className="text-xs font-semibold text-slate-500">{label}</p>
      <p
        className={`mt-2 text-3xl font-semibold ${warning && (value ?? 0) > 0 ? "text-amber-700" : "text-slate-950"}`}
      >
        {value === null ? "—" : value.toLocaleString("es-CO")}
      </p>
    </div>
  );
}

function EvidenceFields({ prefix }: { prefix: string }) {
  return (
    <div className="grid gap-3 md:grid-cols-2 min-w-0">
      <label className="grid gap-1 text-sm font-medium text-slate-800 min-w-0">
        Referencia HTTPS de evidencia
        <input
          name="evidenceReference"
          type="url"
          required
          placeholder="https://autoridad.example/constancia.pdf"
          className="rounded-xl border border-slate-300 px-3 py-2 min-w-0 max-w-full"
          aria-describedby={`${prefix}-evidence-help`}
        />
      </label>
      <label className="grid gap-1 text-sm font-medium text-slate-800 min-w-0">
        SHA-256 de la evidencia
        <input
          name="evidenceSha256"
          required
          minLength={64}
          maxLength={64}
          pattern={HASH_PATTERN}
          spellCheck={false}
          className="rounded-xl border border-slate-300 px-3 py-2 font-mono text-xs min-w-0 max-w-full"
        />
      </label>
      <p
        id={`${prefix}-evidence-help`}
        className="text-xs text-slate-500 md:col-span-2"
      >
        La referencia debe ser durable. No cargues fotografías, firmas ni datos
        individuales de quienes apoyaron la candidatura.
      </p>
    </div>
  );
}

function MutationFields({ prefix }: { prefix: string }) {
  return (
    <>
      <label className="grid gap-1 text-sm font-medium text-slate-800 min-w-0">
        Declaración de custodia
        <textarea
          name="observation"
          required
          minLength={20}
          maxLength={2000}
          rows={3}
          className="rounded-xl border border-slate-300 px-3 py-2 min-w-0 max-w-full"
        />
      </label>
      <EvidenceFields prefix={prefix} />
    </>
  );
}

export default function SignatureCollectionPage() {
  const { user } = useAuth();
  const [mutationKey, setMutationKey] = useState<string | null>(null);
  const [mutationError, setMutationError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [reloadVersion, setReloadVersion] = useState(0);

  const {
    data: overview,
    loading,
    error: requestError,
    refresh: load,
  } = usePageRequest(getSignatureCollectionOverview, {
    reloadKey: reloadVersion,
  });
  const loadError = requestError ? readableError(requestError) : null;

  const role = user?.backendRole;
  const canManage = Boolean(role && MANAGEMENT_ROLES.has(role));
  const canField = Boolean(role && FIELD_ROLES.has(role));
  const canInternalReview = Boolean(role && INTERNAL_REVIEW_ROLES.has(role));
  const canAuthorityReview = Boolean(role && AUTHORITY_REVIEW_ROLES.has(role));
  const stage = overview?.operation.stage;
  const collecting = stage === "SIGNATURE_COLLECTION";
  const canCreatePlan =
    canManage &&
    !overview?.plan &&
    (stage === "PRE_CAMPAIGN" || stage === "SIGNATURE_COLLECTION");
  const allSubmitted = useMemo(
    () =>
      Boolean(overview?.batches.length) &&
      overview!.batches.every((batch) =>
        ["SUBMITTED_TO_AUTHORITY", "AUTHORITY_RESULT_RECORDED"].includes(
          batch.status,
        ),
      ),
    [overview],
  );

  async function mutate<T>(
    key: string,
    label: string,
    action: () => Promise<SignatureCommandResponse<T>>,
    form?: HTMLFormElement,
  ) {
    setMutationKey(key);
    setMutationError(null);
    setNotice(null);
    try {
      const result = await action();
      setNotice(
        result.noOp
          ? `${label}: reintento exacto reconocido; no se duplicó el registro.`
          : `${label}: confirmado con recibo ${result.command.id}.`,
      );
      form?.reset();
      await load();
    } catch (error) {
      setMutationError(readableError(error));
    } finally {
      setMutationKey(null);
    }
  }

  function submitPlan(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    void mutate("plan", "Expediente creado", () =>
      createSignatureCollectionPlan({
        clientRequestId: freshId(),
        committeeMemberCount: 3,
        committeeEvidenceReference: text(data, "committeeEvidenceReference"),
        committeeEvidenceSha256: text(
          data,
          "committeeEvidenceSha256",
        ).toLowerCase(),
        committeeRegisteredAt: text(data, "committeeRegisteredAt"),
        collectionStartsAt: text(data, "collectionStartsAt"),
        collectionClosesAt: text(data, "collectionClosesAt"),
        candidateRegistrationClosesAt: text(
          data,
          "candidateRegistrationClosesAt",
        ),
        requiredThreshold: number(data, "requiredThreshold"),
        internalTarget: number(data, "internalTarget"),
        thresholdSourceUrl: text(data, "thresholdSourceUrl"),
        thresholdSourceReference: text(data, "thresholdSourceReference"),
        thresholdSourceSha256: text(
          data,
          "thresholdSourceSha256",
        ).toLowerCase(),
        fileOwnerUserId: text(data, "fileOwnerUserId"),
        custodyOwnerUserId: text(data, "custodyOwnerUserId"),
        formHandlingRules: text(data, "formHandlingRules"),
        deliveryPlan: text(data, "deliveryPlan"),
        contingencyPlan: text(data, "contingencyPlan"),
        submissionDueAt: text(data, "submissionDueAt"),
      }),
    );
  }

  function submitBatch(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    const localReturn = text(data, "expectedReturnAt");
    const returnDate = new Date(localReturn);
    void mutate(
      "batch-create",
      "Lote planificado",
      () =>
        createSignatureBatch({
          clientRequestId: freshId(),
          code: text(data, "code"),
          physicalSealReference: optionalText(data, "physicalSealReference"),
          territoryReference: text(data, "territoryReference"),
          plannedForms: number(data, "plannedForms"),
          expectedReturnAt: Number.isFinite(returnDate.getTime())
            ? returnDate.toISOString()
            : localReturn,
        }),
      form,
    );
  }

  function commonMutation(data: FormData, batch: SignatureCollectionBatch) {
    return {
      clientRequestId: freshId(),
      expectedVersion: batch.version,
      observation: text(data, "observation"),
      evidenceReference: text(data, "evidenceReference"),
      evidenceSha256: text(data, "evidenceSha256").toLowerCase(),
    };
  }

  function submitIssue(
    event: FormEvent<HTMLFormElement>,
    batch: SignatureCollectionBatch,
  ) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    void mutate(
      `issue-${batch.id}`,
      `Entrega ${batch.code}`,
      () =>
        issueSignatureBatch(batch.id, {
          ...commonMutation(data, batch),
          issuedForms: number(data, "issuedForms"),
          receiverUserId: text(data, "receiverUserId"),
          physicalSealReference: optionalText(data, "physicalSealReference"),
        }),
      form,
    );
  }

  function submitReturn(
    event: FormEvent<HTMLFormElement>,
    batch: SignatureCollectionBatch,
  ) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    void mutate(
      `return-${batch.id}`,
      `Retorno ${batch.code}`,
      () =>
        returnSignatureBatch(batch.id, {
          ...commonMutation(data, batch),
          returnedForms: number(data, "returnedForms"),
          annulledForms: number(data, "annulledForms"),
          missingForms: number(data, "missingForms"),
          finalReturn: data.get("finalReturn") === "on",
          receiverUserId: text(data, "receiverUserId"),
        }),
      form,
    );
  }

  function submitInternalReview(
    event: FormEvent<HTMLFormElement>,
    batch: SignatureCollectionBatch,
  ) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    void mutate(
      `review-${batch.id}`,
      `Revisión interna ${batch.code}`,
      () =>
        reviewSignatureBatch(batch.id, {
          ...commonMutation(data, batch),
          reportedSupports: number(data, "reportedSupports"),
          internalAcceptedSupports: number(data, "internalAcceptedSupports"),
          internalRejectedSupports: number(data, "internalRejectedSupports"),
          possibleDuplicateSupports: number(data, "possibleDuplicateSupports"),
        }),
      form,
    );
  }

  function submitAdvance(
    event: FormEvent<HTMLFormElement>,
    batch: SignatureCollectionBatch,
    action: "DELIVER_TO_COMMITTEE" | "SUBMIT_TO_AUTHORITY",
  ) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    void mutate(
      `advance-${batch.id}`,
      action === "DELIVER_TO_COMMITTEE"
        ? `Entrega al comité ${batch.code}`
        : `Radicación ${batch.code}`,
      () =>
        advanceSignatureBatch(batch.id, {
          ...commonMutation(data, batch),
          action,
          receiverUserId: optionalText(data, "receiverUserId"),
        }),
      form,
    );
  }

  function submitQuarantine(
    event: FormEvent<HTMLFormElement>,
    batch: SignatureCollectionBatch,
  ) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    void mutate(
      `quarantine-${batch.id}`,
      `Cuarentena ${batch.code}`,
      () => quarantineSignatureBatch(batch.id, commonMutation(data, batch)),
      form,
    );
  }

  function submitRelease(
    event: FormEvent<HTMLFormElement>,
    batch: SignatureCollectionBatch,
  ) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    void mutate(
      `release-${batch.id}`,
      `Cuarentena cerrada ${batch.code}`,
      () =>
        releaseSignatureBatch(batch.id, {
          ...commonMutation(data, batch),
          receiverUserId: optionalText(data, "receiverUserId"),
        }),
      form,
    );
  }

  function submitAuthorityResult(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    void mutate(
      "authority-result",
      "Constancia registrada para revisión",
      () =>
        recordSignatureAuthorityResult({
          clientRequestId: freshId(),
          authorityName: text(data, "authorityName"),
          authorityActReference: text(data, "authorityActReference"),
          authorityActIssuedAt: text(data, "authorityActIssuedAt"),
          evidenceReference: text(data, "evidenceReference"),
          evidenceSha256: text(data, "evidenceSha256").toLowerCase(),
          submittedSupports: number(data, "submittedSupports"),
          validSupports: number(data, "validSupports"),
          invalidSupports: number(data, "invalidSupports"),
          outcome: text(data, "outcome") as
            | "THRESHOLD_MET"
            | "THRESHOLD_NOT_MET"
            | "REGISTRATION_DENIED"
            | "WITHDRAWN",
        }),
      form,
    );
  }

  function submitAuthorityReview(
    event: FormEvent<HTMLFormElement>,
    resultId: string,
  ) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    void mutate(
      `authority-review-${resultId}`,
      "Revisión de constancia",
      () =>
        reviewSignatureAuthorityResult(resultId, {
          clientRequestId: freshId(),
          decision: text(data, "decision") as "APPROVE" | "REJECT",
          reason: optionalText(data, "reason"),
        }),
      form,
    );
  }

  if (loading && !overview) {
    return (
      <main
        className="flex min-h-[50vh] items-center justify-center min-w-0"
        aria-live="polite"
      >
        <Loader2 className="animate-spin text-blue-700" aria-hidden="true" />
        <span className="ml-3 font-medium text-slate-700">
          Cargando expediente de firmas…
        </span>
      </main>
    );
  }

  if (loadError || !overview) {
    return (
      <main className="mx-auto max-w-3xl min-w-0">
        <div
          role="alert"
          className="rounded-2xl border border-red-200 bg-red-50 p-5 text-red-900 min-w-0"
        >
          <h1 className="font-bold text-2xl sm:text-3xl break-words">
            No fue posible abrir el expediente
          </h1>
          <p className="mt-2">{loadError}</p>
          <button
            type="button"
            onClick={() => setReloadVersion((value) => value + 1)}
            className="mt-4 inline-flex items-center gap-2 rounded-xl bg-red-800 px-4 py-2 font-semibold text-white max-w-full whitespace-normal"
          >
            <RefreshCw size={16} aria-hidden="true" /> Reintentar
          </button>
        </div>
      </main>
    );
  }

  const { plan, summary } = overview;

  return (
    <main className="mx-auto max-w-7xl space-y-6 min-w-0">
      <header className="rounded-3xl bg-slate-950 p-6 text-white shadow-xl md:p-8 min-w-0">
        <div className="flex flex-wrap items-start justify-between gap-4 min-w-0">
          <div>
            <p className="text-sm font-bold text-blue-300">
              Antes de campaña · cadena de custodia
            </p>
            <h1 className="mt-2 font-semibold text-2xl sm:text-3xl break-words">
              Recolección de firmas y apoyos
            </h1>
            <p className="mt-3 max-w-3xl text-sm leading-6 text-slate-300">
              Controla lotes físicos y totales agregados. No sustituye los
              formularios, la radicación ni la certificación de la autoridad.
            </p>
          </div>
          <button
            type="button"
            onClick={() => setReloadVersion((value) => value + 1)}
            disabled={loading || mutationKey !== null}
            className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-slate-600 px-4 py-2 font-semibold hover:bg-slate-800 disabled:opacity-50 max-w-full whitespace-normal"
          >
            <RefreshCw size={16} aria-hidden="true" /> Actualizar
          </button>
        </div>
      </header>

      <section
        className="grid gap-3 md:grid-cols-2 min-w-0"
        aria-label="Límites del expediente"
      >
        <div className="rounded-2xl border border-blue-200 bg-blue-50 p-4 text-sm text-blue-950 min-w-0">
          <ShieldCheck className="mb-2" aria-hidden="true" />
          <strong>Límite de privacidad.</strong> {overview.privacyBoundary}
        </div>
        <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-950 min-w-0">
          <AlertTriangle className="mb-2" aria-hidden="true" />
          <strong>Límite electoral.</strong> {overview.authorityDisclaimer}
        </div>
      </section>

      {notice ? (
        <p
          role="status"
          data-testid="signature-mutation-success"
          className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-emerald-900"
        >
          {notice}
        </p>
      ) : null}
      {mutationError ? (
        <p
          role="alert"
          className="rounded-xl border border-red-200 bg-red-50 p-4 text-red-900"
        >
          {mutationError}
        </p>
      ) : null}

      {stage === "CLOSED" ? (
        <section className="rounded-2xl border border-slate-300 bg-slate-100 p-5 min-w-0">
          <h2 className="font-bold text-slate-950">
            Expediente en solo lectura
          </h2>
          <p className="mt-1 text-sm text-slate-700">
            El cierre impide nuevas entregas, cambios de conteo y revisiones; la
            trazabilidad permanece disponible.
          </p>
        </section>
      ) : null}

      {canCreatePlan ? (
        <details className="rounded-2xl border border-blue-200 bg-white p-5 shadow-sm">
          <summary className="cursor-pointer text-lg font-bold text-slate-950">
            Crear expediente mínimo verificable
          </summary>
          <form
            onSubmit={submitPlan}
            data-testid="signature-plan-form"
            className="mt-5 grid gap-4 min-w-0"
          >
            <p className="rounded-xl bg-slate-100 p-3 text-sm text-slate-700">
              Comité acreditado: <strong>exactamente 3 integrantes</strong>. La
              plataforma conserva la constancia, no duplica sus datos
              personales.
            </p>
            <div className="grid gap-3 md:grid-cols-2 min-w-0">
              <label className="grid gap-1 text-sm font-medium min-w-0">
                Constancia HTTPS del comité
                <input
                  name="committeeEvidenceReference"
                  type="url"
                  required
                  className="rounded-xl border px-3 py-2 min-w-0 max-w-full"
                />
              </label>
              <label className="grid gap-1 text-sm font-medium min-w-0">
                SHA-256 de constancia del comité
                <input
                  name="committeeEvidenceSha256"
                  required
                  pattern={HASH_PATTERN}
                  minLength={64}
                  maxLength={64}
                  className="rounded-xl border px-3 py-2 font-mono text-xs min-w-0 max-w-full"
                />
              </label>
              <label className="grid gap-1 text-sm font-medium min-w-0">
                Registro del comité
                <input
                  name="committeeRegisteredAt"
                  type="date"
                  required
                  className="rounded-xl border px-3 py-2 min-w-0 max-w-full"
                />
              </label>
              <label className="grid gap-1 text-sm font-medium min-w-0">
                Inicio de recolección
                <input
                  name="collectionStartsAt"
                  type="date"
                  required
                  className="rounded-xl border px-3 py-2 min-w-0 max-w-full"
                />
              </label>
              <label className="grid gap-1 text-sm font-medium min-w-0">
                Cierre de recolección
                <input
                  name="collectionClosesAt"
                  type="date"
                  required
                  className="rounded-xl border px-3 py-2 min-w-0 max-w-full"
                />
              </label>
              <label className="grid gap-1 text-sm font-medium min-w-0">
                Cierre de inscripción aplicable
                <input
                  name="candidateRegistrationClosesAt"
                  type="date"
                  required
                  className="rounded-xl border px-3 py-2 min-w-0 max-w-full"
                />
              </label>
              <label className="grid gap-1 text-sm font-medium min-w-0">
                Fecha límite de entrega
                <input
                  name="submissionDueAt"
                  type="date"
                  required
                  className="rounded-xl border px-3 py-2 min-w-0 max-w-full"
                />
              </label>
              <label className="grid gap-1 text-sm font-medium min-w-0">
                Umbral requerido
                <input
                  name="requiredThreshold"
                  type="number"
                  min={1}
                  required
                  className="rounded-xl border px-3 py-2 min-w-0 max-w-full"
                />
              </label>
              <label className="grid gap-1 text-sm font-medium min-w-0">
                Meta interna
                <input
                  name="internalTarget"
                  type="number"
                  min={1}
                  required
                  className="rounded-xl border px-3 py-2 min-w-0 max-w-full"
                />
              </label>
              <label className="grid gap-1 text-sm font-medium min-w-0">
                Fuente HTTPS del umbral
                <input
                  name="thresholdSourceUrl"
                  type="url"
                  required
                  className="rounded-xl border px-3 py-2 min-w-0 max-w-full"
                />
              </label>
              <label className="grid gap-1 text-sm font-medium min-w-0">
                Referencia del acto y vigencia
                <input
                  name="thresholdSourceReference"
                  minLength={5}
                  maxLength={500}
                  required
                  className="rounded-xl border px-3 py-2 min-w-0 max-w-full"
                />
              </label>
              <label className="grid gap-1 text-sm font-medium min-w-0">
                SHA-256 de la fuente del umbral
                <input
                  name="thresholdSourceSha256"
                  required
                  pattern={HASH_PATTERN}
                  minLength={64}
                  maxLength={64}
                  className="rounded-xl border px-3 py-2 font-mono text-xs min-w-0 max-w-full"
                />
              </label>
              <label className="grid gap-1 text-sm font-medium min-w-0">
                Responsable del expediente
                <select
                  name="fileOwnerUserId"
                  required
                  className="rounded-xl border px-3 py-2 min-w-0 max-w-full"
                  defaultValue=""
                >
                  <option value="" disabled>
                    Selecciona una persona activa
                  </option>
                  {overview.operators.map((operator) => (
                    <option key={operator.id} value={operator.id}>
                      {operator.name} · {operator.role}
                    </option>
                  ))}
                </select>
              </label>
              <label className="grid gap-1 text-sm font-medium min-w-0">
                Responsable de custodia
                <select
                  name="custodyOwnerUserId"
                  required
                  className="rounded-xl border px-3 py-2 min-w-0 max-w-full"
                  defaultValue=""
                >
                  <option value="" disabled>
                    Debe ser una persona distinta
                  </option>
                  {overview.operators.map((operator) => (
                    <option key={operator.id} value={operator.id}>
                      {operator.name} · {operator.role}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <label className="grid gap-1 text-sm font-medium min-w-0">
              Reglas para anulados, incompletos, duplicados e intervenidos
              <textarea
                name="formHandlingRules"
                minLength={100}
                maxLength={6000}
                rows={4}
                required
                className="rounded-xl border px-3 py-2 min-w-0 max-w-full"
              />
            </label>
            <label className="grid gap-1 text-sm font-medium min-w-0">
              Plan físico de entrega y radicación
              <textarea
                name="deliveryPlan"
                minLength={50}
                maxLength={4000}
                rows={3}
                required
                className="rounded-xl border px-3 py-2 min-w-0 max-w-full"
              />
            </label>
            <label className="grid gap-1 text-sm font-medium min-w-0">
              Contingencia física
              <textarea
                name="contingencyPlan"
                minLength={50}
                maxLength={4000}
                rows={3}
                required
                className="rounded-xl border px-3 py-2 min-w-0 max-w-full"
              />
            </label>
            <button
              type="submit"
              disabled={mutationKey !== null}
              className="min-h-11 rounded-xl bg-blue-700 px-5 py-3 font-bold text-white disabled:opacity-50 max-w-full whitespace-normal"
            >
              {mutationKey === "plan" ? "Confirmando…" : "Crear expediente"}
            </button>
          </form>
        </details>
      ) : null}

      {!plan ? (
        <section className="rounded-2xl border border-dashed border-slate-300 bg-white p-8 text-center min-w-0">
          <ClipboardCheck
            className="mx-auto text-slate-400"
            aria-hidden="true"
          />
          <h2 className="mt-3 text-xl font-bold">
            No existe un expediente mínimo
          </h2>
          <p className="mt-2 text-sm text-slate-600">
            La puerta a recolección debe permanecer bloqueada hasta acreditar
            comité, calendario, umbral, responsables y contingencia.
          </p>
          {!canCreatePlan ? (
            <Link
              href="/dashboard/operation-profile"
              className="mt-4 inline-flex min-h-11 items-center rounded-xl bg-slate-900 px-4 py-2 font-semibold text-white max-w-full whitespace-normal"
            >
              Revisar perfil y etapa
            </Link>
          ) : null}
        </section>
      ) : (
        <>
          <section
            className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5 min-w-0"
            aria-label="Indicadores agregados"
          >
            <SummaryCard
              label="Umbral aplicable"
              value={plan.requiredThreshold}
            />
            <SummaryCard label="Meta interna" value={plan.internalTarget} />
            <SummaryCard
              label="Apoyos revisados internos"
              value={summary.internalAcceptedSupports}
            />
            <SummaryCard
              label="Válidos certificados"
              value={overview.readiness.certifiedValidSupports}
            />
            <SummaryCard
              label="Ritmo diario requerido"
              value={summary.requiredDailyPace}
              warning
            />
            <SummaryCard
              label="Formularios en custodia"
              value={summary.inCustodyForms}
              warning
            />
            <SummaryCard
              label="Formularios faltantes"
              value={summary.missingForms}
              warning
            />
            <SummaryCard
              label="Lotes vencidos"
              value={summary.overdueBatches}
              warning
            />
            <SummaryCard
              label="Cuarentenas"
              value={summary.quarantinedBatches}
              warning
            />
            <SummaryCard
              label="Margen certificado"
              value={
                overview.readiness.certifiedValidSupports === null
                  ? null
                  : overview.readiness.certifiedValidSupports -
                    plan.requiredThreshold
              }
              warning
            />
          </section>

          <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm min-w-0">
            <div className="flex flex-wrap items-start justify-between gap-4 min-w-0">
              <div>
                <h2 className="text-xl font-bold">Expediente base</h2>
                <p className="mt-1 text-sm text-slate-600">
                  {plan.thresholdSourceReference} · recolección{" "}
                  {formatDate(plan.collectionStartsAt)} a{" "}
                  {formatDate(plan.collectionClosesAt)}
                </p>
              </div>
              <span className="rounded-full bg-blue-100 px-3 py-1 text-sm font-bold text-blue-900">
                {plan.status}
              </span>
            </div>
            <dl className="mt-4 grid gap-3 text-sm md:grid-cols-2 min-w-0">
              <div>
                <dt className="font-semibold">Expediente</dt>
                <dd>{plan.fileOwner.name}</dd>
              </div>
              <div>
                <dt className="font-semibold">Custodia</dt>
                <dd>{plan.custodyOwner.name}</dd>
              </div>
              <div>
                <dt className="font-semibold">Entrega</dt>
                <dd>{formatDate(plan.submissionDueAt)}</dd>
              </div>
              <div>
                <dt className="font-semibold">Comité</dt>
                <dd>{plan.committeeMemberCount} integrantes acreditados</dd>
              </div>
            </dl>
            <div className="mt-4 flex flex-wrap gap-3 text-sm min-w-0">
              <a
                href={plan.committeeEvidenceReference}
                target="_blank"
                rel="noreferrer"
                className="font-semibold text-blue-700 underline"
              >
                Abrir constancia del comité
              </a>
              <a
                href={plan.thresholdSourceUrl}
                target="_blank"
                rel="noreferrer"
                className="font-semibold text-blue-700 underline"
              >
                Abrir fuente del umbral
              </a>
            </div>
          </section>

          <SignatureCountCorrectionPanel
            batches={overview.batches}
            role={role}
            readOnly={overview.readOnly}
            onChanged={() => setReloadVersion((value) => value + 1)}
          />

          {collecting && canManage ? (
            <details className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <summary className="cursor-pointer text-lg font-bold">
                Planificar lote físico
              </summary>
              <form
                onSubmit={submitBatch}
                data-testid="signature-batch-form"
                className="mt-4 grid gap-3 md:grid-cols-2 min-w-0"
              >
                <label className="grid gap-1 text-sm font-medium min-w-0">
                  Código interno
                  <input
                    name="code"
                    required
                    pattern="[A-Za-z0-9][A-Za-z0-9._-]{1,63}"
                    className="rounded-xl border px-3 py-2 min-w-0 max-w-full"
                  />
                </label>
                <label className="grid gap-1 text-sm font-medium min-w-0">
                  Sello físico opaco (opcional)
                  <input
                    name="physicalSealReference"
                    minLength={2}
                    maxLength={160}
                    className="rounded-xl border px-3 py-2 min-w-0 max-w-full"
                  />
                </label>
                <label className="grid gap-1 text-sm font-medium min-w-0">
                  Territorio operativo
                  <input
                    name="territoryReference"
                    required
                    minLength={2}
                    maxLength={300}
                    className="rounded-xl border px-3 py-2 min-w-0 max-w-full"
                  />
                </label>
                <label className="grid gap-1 text-sm font-medium min-w-0">
                  Formularios planificados
                  <input
                    name="plannedForms"
                    type="number"
                    required
                    min={1}
                    className="rounded-xl border px-3 py-2 min-w-0 max-w-full"
                  />
                </label>
                <label className="grid gap-1 text-sm font-medium min-w-0">
                  Retorno esperado
                  <input
                    name="expectedReturnAt"
                    type="datetime-local"
                    required
                    className="rounded-xl border px-3 py-2 min-w-0 max-w-full"
                  />
                </label>
                <button
                  type="submit"
                  disabled={mutationKey !== null}
                  className="min-h-11 self-end rounded-xl bg-slate-900 px-4 py-2 font-bold text-white disabled:opacity-50 max-w-full whitespace-normal"
                >
                  Planificar lote
                </button>
              </form>
            </details>
          ) : null}

          <section
            className="space-y-4 min-w-0"
            aria-labelledby="signature-batches-title"
          >
            <h2 id="signature-batches-title" className="text-2xl font-semibold">
              Lotes y cadena de custodia
            </h2>
            {overview.batches.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-6 text-slate-600 min-w-0">
                No hay lotes. Un total de cero no se interpreta como recolección
                terminada.
              </div>
            ) : (
              overview.batches.map((batch) => (
                <article
                  key={batch.id}
                  className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm min-w-0"
                >
                  <div className="flex flex-wrap items-start justify-between gap-3 min-w-0">
                    <div>
                      <h3 className="text-lg font-bold">{batch.code}</h3>
                      <p className="text-sm text-slate-600">
                        {batch.territoryReference} · retorno{" "}
                        {formatDate(batch.expectedReturnAt, true)}
                      </p>
                    </div>
                    <span
                      className={`rounded-full px-3 py-1 text-sm font-bold ${batch.status === "QUARANTINED" ? "bg-amber-100 text-amber-900" : "bg-slate-100 text-slate-800"}`}
                    >
                      {STATUS_LABEL[batch.status]}
                    </span>
                  </div>
                  <dl className="mt-4 grid gap-2 text-sm md:grid-cols-5 min-w-0 grid-cols-1 sm:grid-cols-2">
                    <div>
                      <dt className="text-slate-500">Entregados</dt>
                      <dd className="font-bold">{batch.issuedForms}</dd>
                    </div>
                    <div>
                      <dt className="text-slate-500">Devueltos</dt>
                      <dd className="font-bold">{batch.returnedForms}</dd>
                    </div>
                    <div>
                      <dt className="text-slate-500">Anulados</dt>
                      <dd className="font-bold">{batch.annulledForms}</dd>
                    </div>
                    <div>
                      <dt className="text-slate-500">Faltantes</dt>
                      <dd className="font-bold">{batch.missingForms}</dd>
                    </div>
                    <div>
                      <dt className="text-slate-500">En custodia</dt>
                      <dd className="font-bold">{batch.inCustodyForms}</dd>
                    </div>
                  </dl>
                  {batch.currentCustodian ? (
                    <p className="mt-3 text-sm">
                      <strong>Responsable actual:</strong>{" "}
                      {batch.currentCustodian.name}
                    </p>
                  ) : null}

                  {collecting && canField && batch.status === "PLANNED" ? (
                    <details className="mt-4 rounded-xl border p-4">
                      <summary className="cursor-pointer font-semibold">
                        Confirmar entrega a custodia
                      </summary>
                      <form
                        onSubmit={(event) => submitIssue(event, batch)}
                        data-testid={`issue-${batch.id}`}
                        className="mt-3 grid gap-3 min-w-0"
                      >
                        <label className="grid gap-1 text-sm font-medium min-w-0">
                          Formularios entregados
                          <input
                            name="issuedForms"
                            type="number"
                            min={1}
                            max={batch.plannedForms}
                            defaultValue={batch.plannedForms}
                            required
                            className="rounded-xl border px-3 py-2 min-w-0 max-w-full"
                          />
                        </label>
                        <label className="grid gap-1 text-sm font-medium min-w-0">
                          Persona receptora
                          <select
                            name="receiverUserId"
                            required
                            defaultValue=""
                            className="rounded-xl border px-3 py-2 min-w-0 max-w-full"
                          >
                            <option value="" disabled>
                              Selecciona
                            </option>
                            {overview.operators.map((operator) => (
                              <option key={operator.id} value={operator.id}>
                                {operator.name}
                              </option>
                            ))}
                          </select>
                        </label>
                        <label className="grid gap-1 text-sm font-medium min-w-0">
                          Sello verificado
                          <input
                            name="physicalSealReference"
                            defaultValue={batch.physicalSealReference ?? ""}
                            className="rounded-xl border px-3 py-2 min-w-0 max-w-full"
                          />
                        </label>
                        <MutationFields prefix={`issue-${batch.id}`} />
                        <button
                          type="submit"
                          disabled={mutationKey !== null}
                          className="min-h-11 rounded-xl bg-blue-700 px-4 py-2 font-bold text-white max-w-full whitespace-normal"
                        >
                          Registrar entrega
                        </button>
                      </form>
                    </details>
                  ) : null}

                  {collecting &&
                  canField &&
                  ["ISSUED", "PARTIALLY_RETURNED"].includes(batch.status) ? (
                    <details className="mt-4 rounded-xl border p-4">
                      <summary className="cursor-pointer font-semibold">
                        Registrar retorno acumulado
                      </summary>
                      <form
                        onSubmit={(event) => submitReturn(event, batch)}
                        data-testid={`return-${batch.id}`}
                        className="mt-3 grid gap-3 min-w-0"
                      >
                        <div className="grid gap-3 md:grid-cols-3 min-w-0">
                          <label className="grid gap-1 text-sm font-medium min-w-0">
                            Devueltos acumulados
                            <input
                              name="returnedForms"
                              type="number"
                              min={batch.returnedForms}
                              defaultValue={batch.returnedForms}
                              required
                              className="rounded-xl border px-3 py-2 min-w-0 max-w-full"
                            />
                          </label>
                          <label className="grid gap-1 text-sm font-medium min-w-0">
                            Anulados acumulados
                            <input
                              name="annulledForms"
                              type="number"
                              min={batch.annulledForms}
                              defaultValue={batch.annulledForms}
                              required
                              className="rounded-xl border px-3 py-2 min-w-0 max-w-full"
                            />
                          </label>
                          <label className="grid gap-1 text-sm font-medium min-w-0">
                            Faltantes acumulados
                            <input
                              name="missingForms"
                              type="number"
                              min={batch.missingForms}
                              defaultValue={batch.missingForms}
                              required
                              className="rounded-xl border px-3 py-2 min-w-0 max-w-full"
                            />
                          </label>
                        </div>
                        <label className="flex min-h-11 items-center gap-2 text-sm font-medium min-w-0">
                          <input name="finalReturn" type="checkbox" /> Confirmo
                          que no queda ningún formulario en custodia
                        </label>
                        <label className="grid gap-1 text-sm font-medium min-w-0">
                          Persona que recibe
                          <select
                            name="receiverUserId"
                            required
                            defaultValue=""
                            className="rounded-xl border px-3 py-2 min-w-0 max-w-full"
                          >
                            <option value="" disabled>
                              Selecciona
                            </option>
                            {overview.operators.map((operator) => (
                              <option key={operator.id} value={operator.id}>
                                {operator.name}
                              </option>
                            ))}
                          </select>
                        </label>
                        <MutationFields prefix={`return-${batch.id}`} />
                        <button
                          type="submit"
                          disabled={mutationKey !== null}
                          className="min-h-11 rounded-xl bg-blue-700 px-4 py-2 font-bold text-white max-w-full whitespace-normal"
                        >
                          Registrar retorno
                        </button>
                      </form>
                    </details>
                  ) : null}

                  {collecting &&
                  canInternalReview &&
                  batch.status === "RETURNED" ? (
                    <details className="mt-4 rounded-xl border p-4">
                      <summary className="cursor-pointer font-semibold">
                        Cerrar revisión interna agregada
                      </summary>
                      <form
                        onSubmit={(event) => submitInternalReview(event, batch)}
                        data-testid={`review-${batch.id}`}
                        className="mt-3 grid gap-3 min-w-0"
                      >
                        <p className="text-xs text-amber-800">
                          Estos conteos son revisión interna; no son apoyos
                          válidos certificados.
                        </p>
                        <div className="grid gap-3 md:grid-cols-4 min-w-0">
                          <label className="grid gap-1 text-sm font-medium min-w-0">
                            Apoyos revisados
                            <input
                              name="reportedSupports"
                              type="number"
                              min={0}
                              required
                              className="rounded-xl border px-3 py-2 min-w-0 max-w-full"
                            />
                          </label>
                          <label className="grid gap-1 text-sm font-medium min-w-0">
                            Aceptados internos
                            <input
                              name="internalAcceptedSupports"
                              type="number"
                              min={0}
                              required
                              className="rounded-xl border px-3 py-2 min-w-0 max-w-full"
                            />
                          </label>
                          <label className="grid gap-1 text-sm font-medium min-w-0">
                            Rechazados internos
                            <input
                              name="internalRejectedSupports"
                              type="number"
                              min={0}
                              required
                              className="rounded-xl border px-3 py-2 min-w-0 max-w-full"
                            />
                          </label>
                          <label className="grid gap-1 text-sm font-medium min-w-0">
                            Posibles duplicados
                            <input
                              name="possibleDuplicateSupports"
                              type="number"
                              min={0}
                              required
                              className="rounded-xl border px-3 py-2 min-w-0 max-w-full"
                            />
                          </label>
                        </div>
                        <MutationFields prefix={`review-${batch.id}`} />
                        <button
                          type="submit"
                          disabled={mutationKey !== null}
                          className="min-h-11 rounded-xl bg-blue-700 px-4 py-2 font-bold text-white max-w-full whitespace-normal"
                        >
                          Registrar revisión interna
                        </button>
                      </form>
                    </details>
                  ) : null}

                  {collecting &&
                  canManage &&
                  ["INTERNAL_REVIEWED", "DELIVERED_TO_COMMITTEE"].includes(
                    batch.status,
                  ) ? (
                    <details className="mt-4 rounded-xl border p-4">
                      <summary className="cursor-pointer font-semibold">
                        {batch.status === "INTERNAL_REVIEWED"
                          ? "Entregar al comité"
                          : "Radicar ante la autoridad"}
                      </summary>
                      <form
                        onSubmit={(event) =>
                          submitAdvance(
                            event,
                            batch,
                            batch.status === "INTERNAL_REVIEWED"
                              ? "DELIVER_TO_COMMITTEE"
                              : "SUBMIT_TO_AUTHORITY",
                          )
                        }
                        data-testid={`advance-${batch.id}`}
                        className="mt-3 grid gap-3 min-w-0"
                      >
                        <label className="grid gap-1 text-sm font-medium min-w-0">
                          Receptor interno (opcional)
                          <select
                            name="receiverUserId"
                            defaultValue=""
                            className="rounded-xl border px-3 py-2 min-w-0 max-w-full"
                          >
                            <option value="">Sin receptor interno</option>
                            {overview.operators.map((operator) => (
                              <option key={operator.id} value={operator.id}>
                                {operator.name}
                              </option>
                            ))}
                          </select>
                        </label>
                        <MutationFields prefix={`advance-${batch.id}`} />
                        <button
                          type="submit"
                          disabled={mutationKey !== null}
                          className="min-h-11 rounded-xl bg-blue-700 px-4 py-2 font-bold text-white max-w-full whitespace-normal"
                        >
                          Confirmar hito físico
                        </button>
                      </form>
                    </details>
                  ) : null}

                  {collecting &&
                  canField &&
                  !["QUARANTINED", "AUTHORITY_RESULT_RECORDED"].includes(
                    batch.status,
                  ) ? (
                    <details className="mt-4 rounded-xl border border-amber-200 p-4">
                      <summary className="cursor-pointer font-semibold text-amber-900">
                        Abrir cuarentena por riesgo
                      </summary>
                      <form
                        onSubmit={(event) => submitQuarantine(event, batch)}
                        data-testid={`quarantine-${batch.id}`}
                        className="mt-3 grid gap-3 min-w-0"
                      >
                        <MutationFields prefix={`quarantine-${batch.id}`} />
                        <button
                          type="submit"
                          disabled={mutationKey !== null}
                          className="min-h-11 rounded-xl bg-amber-700 px-4 py-2 font-bold text-white max-w-full whitespace-normal"
                        >
                          Registrar cuarentena
                        </button>
                      </form>
                    </details>
                  ) : null}

                  {collecting &&
                  canInternalReview &&
                  batch.status === "QUARANTINED" ? (
                    <details className="mt-4 rounded-xl border border-emerald-200 p-4">
                      <summary className="cursor-pointer font-semibold text-emerald-900">
                        Decidir cierre de cuarentena
                      </summary>
                      <form
                        onSubmit={(event) => submitRelease(event, batch)}
                        data-testid={`release-${batch.id}`}
                        className="mt-3 grid gap-3 min-w-0"
                      >
                        <label className="grid gap-1 text-sm font-medium min-w-0">
                          Nuevo custodio interno (opcional)
                          <select
                            name="receiverUserId"
                            defaultValue=""
                            className="rounded-xl border px-3 py-2 min-w-0 max-w-full"
                          >
                            <option value="">Conservar responsable</option>
                            {overview.operators.map((operator) => (
                              <option key={operator.id} value={operator.id}>
                                {operator.name}
                              </option>
                            ))}
                          </select>
                        </label>
                        <MutationFields prefix={`release-${batch.id}`} />
                        <button
                          type="submit"
                          disabled={mutationKey !== null}
                          className="min-h-11 rounded-xl bg-emerald-700 px-4 py-2 font-bold text-white max-w-full whitespace-normal"
                        >
                          Cerrar cuarentena con evidencia
                        </button>
                      </form>
                    </details>
                  ) : null}

                  <details className="mt-4 rounded-xl bg-slate-50 p-4">
                    <summary className="cursor-pointer font-semibold">
                      Ver trazabilidad inmutable ({batch.custodyEvents.length})
                    </summary>
                    <ol className="mt-3 space-y-3">
                      {batch.custodyEvents.map((event) => (
                        <li
                          key={event.id}
                          className="border-l-2 border-slate-300 pl-3 text-sm min-w-0"
                        >
                          <strong>{event.type}</strong> ·{" "}
                          {formatDate(event.createdAt, true)}
                          <p>{event.observation}</p>
                          <p className="text-xs text-slate-500">
                            {event.actor.name}
                            {event.receiver ? ` → ${event.receiver.name}` : ""}
                          </p>
                          {event.evidenceReference ? (
                            <a
                              href={event.evidenceReference}
                              target="_blank"
                              rel="noreferrer"
                              className="text-blue-700 underline"
                            >
                              Abrir evidencia
                            </a>
                          ) : null}
                        </li>
                      ))}
                    </ol>
                  </details>
                </article>
              ))
            )}
          </section>

          {collecting && canManage && allSubmitted ? (
            <details className="rounded-2xl border border-indigo-200 bg-white p-5 shadow-sm">
              <summary className="cursor-pointer text-lg font-bold">
                Registrar constancia recibida de la autoridad
              </summary>
              <form
                onSubmit={submitAuthorityResult}
                data-testid="signature-authority-result-form"
                className="mt-4 grid gap-3 min-w-0"
              >
                <p className="rounded-xl bg-amber-50 p-3 text-sm text-amber-900">
                  Registrar no significa aprobar: otra persona de cumplimiento o
                  auditoría debe verificarla.
                </p>
                <div className="grid gap-3 md:grid-cols-2 min-w-0">
                  <label className="grid gap-1 text-sm font-medium min-w-0">
                    Autoridad emisora
                    <input
                      name="authorityName"
                      required
                      minLength={3}
                      className="rounded-xl border px-3 py-2 min-w-0 max-w-full"
                    />
                  </label>
                  <label className="grid gap-1 text-sm font-medium min-w-0">
                    Referencia del acto
                    <input
                      name="authorityActReference"
                      required
                      minLength={3}
                      className="rounded-xl border px-3 py-2 min-w-0 max-w-full"
                    />
                  </label>
                  <label className="grid gap-1 text-sm font-medium min-w-0">
                    Fecha del acto
                    <input
                      name="authorityActIssuedAt"
                      type="date"
                      required
                      className="rounded-xl border px-3 py-2 min-w-0 max-w-full"
                    />
                  </label>
                  <label className="grid gap-1 text-sm font-medium min-w-0">
                    Resultado declarado
                    <select
                      name="outcome"
                      required
                      defaultValue="THRESHOLD_MET"
                      className="rounded-xl border px-3 py-2 min-w-0 max-w-full"
                    >
                      <option value="THRESHOLD_MET">
                        Umbral cumplido según autoridad
                      </option>
                      <option value="THRESHOLD_NOT_MET">
                        Umbral no cumplido
                      </option>
                      <option value="REGISTRATION_DENIED">
                        Inscripción denegada
                      </option>
                      <option value="WITHDRAWN">Retiro</option>
                    </select>
                  </label>
                  <label className="grid gap-1 text-sm font-medium min-w-0">
                    Apoyos evaluados
                    <input
                      name="submittedSupports"
                      type="number"
                      min={0}
                      defaultValue={summary.reportedSupports}
                      required
                      className="rounded-xl border px-3 py-2 min-w-0 max-w-full"
                    />
                  </label>
                  <label className="grid gap-1 text-sm font-medium min-w-0">
                    Apoyos válidos certificados
                    <input
                      name="validSupports"
                      type="number"
                      min={0}
                      required
                      className="rounded-xl border px-3 py-2 min-w-0 max-w-full"
                    />
                  </label>
                  <label className="grid gap-1 text-sm font-medium min-w-0">
                    Apoyos inválidos certificados
                    <input
                      name="invalidSupports"
                      type="number"
                      min={0}
                      required
                      className="rounded-xl border px-3 py-2 min-w-0 max-w-full"
                    />
                  </label>
                </div>
                <EvidenceFields prefix="authority-result" />
                <button
                  type="submit"
                  disabled={mutationKey !== null}
                  className="min-h-11 rounded-xl bg-indigo-700 px-4 py-2 font-bold text-white max-w-full whitespace-normal"
                >
                  Registrar para revisión
                </button>
              </form>
            </details>
          ) : null}

          <section
            className="space-y-3 min-w-0"
            aria-labelledby="authority-results-title"
          >
            <h2 id="authority-results-title" className="text-2xl font-semibold">
              Constancias de autoridad y cuatro ojos
            </h2>
            {overview.authorityResults.length === 0 ? (
              <p className="rounded-2xl border border-dashed bg-white p-6 text-slate-600">
                No hay constancias. Ningún conteo interno se presenta como
                resultado certificado.
              </p>
            ) : (
              overview.authorityResults.map((result) => (
                <article
                  key={result.id}
                  className="rounded-2xl border bg-white p-5 shadow-sm min-w-0"
                >
                  <div className="flex flex-wrap justify-between gap-3 min-w-0">
                    <div>
                      <h3 className="font-bold">
                        {result.authorityActReference}
                      </h3>
                      <p className="text-sm text-slate-600">
                        {result.authorityName} ·{" "}
                        {formatDate(result.authorityActIssuedAt)}
                      </p>
                    </div>
                    <span
                      className={`rounded-full px-3 py-1 text-sm font-bold ${result.review?.decision === "APPROVE" ? "bg-emerald-100 text-emerald-900" : result.review?.decision === "REJECT" ? "bg-red-100 text-red-900" : "bg-amber-100 text-amber-900"}`}
                    >
                      {result.review?.decision === "APPROVE"
                        ? "Aprobada por segunda persona"
                        : result.review?.decision === "REJECT"
                          ? "Rechazada en revisión"
                          : "Pendiente de segunda persona"}
                    </span>
                  </div>
                  <dl className="mt-4 grid gap-3 text-sm min-w-0 grid-cols-1 sm:grid-cols-3">
                    <div>
                      <dt>Evaluados</dt>
                      <dd className="text-xl font-semibold">
                        {result.submittedSupports}
                      </dd>
                    </div>
                    <div>
                      <dt>Válidos certificados</dt>
                      <dd className="text-xl font-semibold">
                        {result.validSupports}
                      </dd>
                    </div>
                    <div>
                      <dt>Inválidos certificados</dt>
                      <dd className="text-xl font-semibold">
                        {result.invalidSupports}
                      </dd>
                    </div>
                  </dl>
                  <p className="mt-3 text-sm">
                    <strong>Registró:</strong> {result.recordedBy.name}.{" "}
                    <a
                      href={result.evidenceReference}
                      target="_blank"
                      rel="noreferrer"
                      className="text-blue-700 underline"
                    >
                      Abrir constancia
                    </a>
                  </p>
                  {result.review ? (
                    <p className="mt-2 text-sm">
                      <strong>Revisó:</strong> {result.review.reviewedBy.name}
                      {result.review.reason ? ` · ${result.review.reason}` : ""}
                    </p>
                  ) : null}
                  {collecting && canAuthorityReview && !result.review ? (
                    <details className="mt-4 rounded-xl border p-4">
                      <summary className="cursor-pointer font-semibold">
                        Revisar constancia
                      </summary>
                      <form
                        onSubmit={(event) =>
                          submitAuthorityReview(event, result.id)
                        }
                        data-testid={`authority-review-${result.id}`}
                        className="mt-3 grid gap-3 min-w-0"
                      >
                        <label className="grid gap-1 text-sm font-medium min-w-0">
                          Decisión
                          <select
                            name="decision"
                            required
                            defaultValue=""
                            className="rounded-xl border px-3 py-2 min-w-0 max-w-full"
                          >
                            <option value="" disabled>
                              Selecciona después de verificar
                            </option>
                            <option value="APPROVE">
                              Aprobar constancia verificada
                            </option>
                            <option value="REJECT">
                              Rechazar por inconsistencia
                            </option>
                          </select>
                        </label>
                        <label className="grid gap-1 text-sm font-medium min-w-0">
                          Razón del rechazo (obligatoria al rechazar)
                          <textarea
                            name="reason"
                            minLength={20}
                            maxLength={2000}
                            rows={3}
                            className="rounded-xl border px-3 py-2 min-w-0 max-w-full"
                          />
                        </label>
                        <button
                          type="submit"
                          disabled={mutationKey !== null}
                          className="min-h-11 rounded-xl bg-slate-900 px-4 py-2 font-bold text-white max-w-full whitespace-normal"
                        >
                          Registrar revisión inmutable
                        </button>
                      </form>
                    </details>
                  ) : null}
                </article>
              ))
            )}
          </section>

          <section
            className={`rounded-2xl border p-5 ${overview.readiness.exitReady ? "border-emerald-200 bg-emerald-50" : "border-amber-200 bg-amber-50"}`}
          >
            <div className="flex items-start gap-3 min-w-0">
              {overview.readiness.exitReady ? (
                <CheckCircle2 className="text-emerald-700" aria-hidden="true" />
              ) : (
                <FileCheck2 className="text-amber-700" aria-hidden="true" />
              )}
              <div>
                <h2 className="font-bold">Puerta hacia campaña</h2>
                <p className="mt-1 text-sm">
                  {overview.readiness.exitReady
                    ? "Custodia conciliada y constancia aprobada con apoyos válidos certificados iguales o superiores al umbral."
                    : "La transición sigue bloqueada. Corrige cada pendiente o utiliza el cierre excepcional con cuatro ojos; nunca avances una etapa ficticia."}
                </p>
                {overview.readiness.exitBlockers.length ? (
                  <ul className="mt-2 list-disc pl-5 text-sm min-w-0">
                    {overview.readiness.exitBlockers.map((blocker) => (
                      <li key={blocker}>{blocker}</li>
                    ))}
                  </ul>
                ) : null}
                <Link
                  href="/dashboard/operation-profile"
                  className="mt-3 inline-flex min-h-11 items-center rounded-xl bg-slate-950 px-4 py-2 font-semibold text-white max-w-full whitespace-normal"
                >
                  Abrir perfil de operación
                </Link>
              </div>
            </div>
          </section>
        </>
      )}
    </main>
  );
}
