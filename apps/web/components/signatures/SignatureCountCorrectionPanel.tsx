"use client";

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { AlertTriangle, CheckCircle2, FileSearch, Loader2, RefreshCw, ShieldCheck } from "lucide-react";
import { ApiError } from "@/lib/api-client";
import { uploadFileDirectlyWithClientDeclaredHash } from "@/lib/direct-storage-upload";
import { openPrivateResource } from "@/lib/private-storage";
import {
  decideSignatureCountCorrection,
  getSignatureCountCorrections,
  proposeSignatureCountCorrection,
  type SignatureCountCorrectionOverview,
  type SignatureCountCorrectionProposal,
  type SignatureCountField,
  type SignatureProposedAbsoluteCounts,
} from "@/lib/signature-count-correction-api";
import type { SignatureCollectionBatch } from "@/lib/signature-collection-api";
import type { BackendUserRole } from "@/types/saas-schema";

const PROPOSER_ROLES = new Set<BackendUserRole>([
  "ADMIN",
  "CAMPAIGN_MANAGER",
  "ZONE_COORDINATOR",
]);

const COUNT_FIELDS: Array<{
  key: SignatureCountField;
  proposedKey: keyof SignatureProposedAbsoluteCounts;
  label: string;
}> = [
  {
    key: "plannedForms",
    proposedKey: "proposedPlannedForms",
    label: "Formularios planificados",
  },
  {
    key: "issuedForms",
    proposedKey: "proposedIssuedForms",
    label: "Formularios entregados",
  },
  {
    key: "returnedForms",
    proposedKey: "proposedReturnedForms",
    label: "Formularios devueltos",
  },
  {
    key: "annulledForms",
    proposedKey: "proposedAnnulledForms",
    label: "Formularios anulados",
  },
  {
    key: "missingForms",
    proposedKey: "proposedMissingForms",
    label: "Formularios faltantes",
  },
  {
    key: "inCustodyForms",
    proposedKey: "proposedInCustodyForms",
    label: "Formularios en custodia",
  },
  {
    key: "reportedSupports",
    proposedKey: "proposedReportedSupports",
    label: "Apoyos reportados",
  },
  {
    key: "internalAcceptedSupports",
    proposedKey: "proposedInternalAcceptedSupports",
    label: "Apoyos aceptados internamente",
  },
  {
    key: "internalRejectedSupports",
    proposedKey: "proposedInternalRejectedSupports",
    label: "Apoyos rechazados internamente",
  },
  {
    key: "possibleDuplicateSupports",
    proposedKey: "proposedPossibleDuplicateSupports",
    label: "Posibles duplicados",
  },
];

function readableError(error: unknown): string {
  if (error instanceof ApiError) return error.message;
  if (error instanceof Error && error.message) return error.message;
  return "No fue posible completar el control de corrección.";
}

function formatDate(value: string): string {
  const date = new Date(value);
  return Number.isFinite(date.getTime())
    ? new Intl.DateTimeFormat("es-CO", {
        dateStyle: "medium",
        timeStyle: "short",
        timeZone: "America/Bogota",
      }).format(date)
    : value;
}

function signed(value: number): string {
  return value > 0 ? `+${value.toLocaleString("es-CO")}` : value.toLocaleString("es-CO");
}

function DecisionForm({
  proposal,
  busy,
  onSubmit,
}: {
  proposal: SignatureCountCorrectionProposal;
  busy: boolean;
  onSubmit: (
    event: FormEvent<HTMLFormElement>,
    proposal: SignatureCountCorrectionProposal,
  ) => void;
}) {
  return (
    <form
      className="mt-4 grid gap-3 rounded-xl border border-indigo-200 bg-indigo-50 p-4"
      data-testid={`signature-correction-decision-${proposal.id}`}
      onSubmit={(event) => onSubmit(event, proposal)}
    >
      <p className="text-sm font-semibold text-indigo-950">
        Revisión de cuatro ojos: este control exige {proposal.requiredReviewerRole}.
      </p>
      <label className="grid gap-1 text-sm font-medium text-slate-800">
        Decisión terminal
        <select
          name="decision"
          required
          defaultValue=""
          className="min-h-11 rounded-xl border border-slate-300 bg-white px-3 py-2"
        >
          <option value="" disabled>
            Selecciona aprobar o rechazar
          </option>
          <option value="APPROVE">Aprobar valores absolutos</option>
          <option value="REJECT">Rechazar sin modificar conteos</option>
        </select>
      </label>
      <label className="grid gap-1 text-sm font-medium text-slate-800">
        Motivación independiente
        <textarea
          name="reviewReason"
          required
          minLength={20}
          maxLength={2000}
          rows={3}
          className="rounded-xl border border-slate-300 bg-white px-3 py-2"
        />
      </label>
      <p className="text-xs text-indigo-900">
        Aprobar aplica la fotografía completa en una sola transacción, incrementa la versión y
        mantiene el lote en cuarentena. Liberarlo es un control posterior y separado.
      </p>
      <button
        type="submit"
        disabled={busy}
        className="min-h-11 rounded-xl bg-indigo-800 px-4 py-2 font-bold text-white disabled:opacity-60"
      >
        {busy ? "Registrando decisión…" : "Registrar decisión inmutable"}
      </button>
    </form>
  );
}

export function SignatureCountCorrectionPanel({
  batches,
  role,
  readOnly,
  onChanged,
}: {
  batches: SignatureCollectionBatch[];
  role?: BackendUserRole;
  readOnly: boolean;
  onChanged?: () => void;
}) {
  const [overview, setOverview] = useState<SignatureCountCorrectionOverview | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [selectedBatchId, setSelectedBatchId] = useState("");
  const [reload, setReload] = useState(0);

  const quarantined = useMemo(
    () => batches.filter((batch) => batch.status === "QUARANTINED"),
    [batches],
  );
  const selectedBatch = quarantined.find(({ id }) => id === selectedBatchId) ?? quarantined[0];
  const canPropose = Boolean(role && PROPOSER_ROLES.has(role) && !readOnly);

  const refresh = useCallback(() => setReload((value) => value + 1), []);

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError(null);
    void getSignatureCountCorrections(controller.signal)
      .then((result) => {
        if (!controller.signal.aborted) setOverview(result);
      })
      .catch((loadError: unknown) => {
        if (!(loadError instanceof DOMException && loadError.name === "AbortError")) {
          setError(readableError(loadError));
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [reload]);

  async function submitProposal(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedBatch) return;
    const form = event.currentTarget;
    const data = new FormData(form);
    const fileValue = data.get("evidenceFile");
    if (!(fileValue instanceof File) || fileValue.size === 0) {
      setError("Selecciona una evidencia PDF o imagen antes de proponer.");
      return;
    }
    setBusy("proposal");
    setError(null);
    setNotice(null);
    try {
      const uploaded = await uploadFileDirectlyWithClientDeclaredHash(
        fileValue,
        "signature-collection",
      );
      const absoluteCounts = Object.fromEntries(
        COUNT_FIELDS.map(({ key, proposedKey }) => [
          proposedKey,
          Number(data.get(key)),
        ]),
      ) as unknown as SignatureProposedAbsoluteCounts;
      await proposeSignatureCountCorrection(selectedBatch.id, {
        clientRequestId: globalThis.crypto.randomUUID(),
        expectedVersion: selectedBatch.version,
        reason: String(data.get("reason") ?? "").trim(),
        evidenceStoragePath: uploaded.path,
        evidenceSha256: uploaded.sha256,
        ...absoluteCounts,
      });
      form.reset();
      setNotice(
        "Propuesta inmutable registrada. Los conteos siguen intactos hasta la decisión independiente.",
      );
      refresh();
      onChanged?.();
    } catch (mutationError) {
      setError(readableError(mutationError));
    } finally {
      setBusy(null);
    }
  }

  async function submitDecision(
    event: FormEvent<HTMLFormElement>,
    proposal: SignatureCountCorrectionProposal,
  ) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    const decision = String(data.get("decision"));
    if (decision !== "APPROVE" && decision !== "REJECT") return;
    setBusy(proposal.id);
    setError(null);
    setNotice(null);
    try {
      await decideSignatureCountCorrection(proposal.id, {
        clientRequestId: globalThis.crypto.randomUUID(),
        expectedVersion: proposal.snapshotBatchVersion,
        decision,
        reviewReason: String(data.get("reviewReason") ?? "").trim(),
      });
      setNotice(
        decision === "APPROVE"
          ? "Corrección aplicada atómicamente. El lote permanece en cuarentena."
          : "Propuesta rechazada; ningún conteo fue modificado.",
      );
      refresh();
      onChanged?.();
    } catch (mutationError) {
      setError(readableError(mutationError));
    } finally {
      setBusy(null);
    }
  }

  async function openEvidence(proposalId: string) {
    setError(null);
    try {
      await openPrivateResource("signature-collection", proposalId);
    } catch (downloadError) {
      setError(readableError(downloadError));
    }
  }

  return (
    <section
      className="rounded-2xl border border-violet-200 bg-white p-5 shadow-sm"
      aria-labelledby="signature-count-corrections-title"
      data-testid="signature-count-corrections"
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          <ShieldCheck className="mt-0.5 text-violet-700" aria-hidden="true" />
          <div>
            <h2 id="signature-count-corrections-title" className="text-lg font-black text-slate-950">
              Correcciones compensatorias de conteos
            </h2>
            <p className="mt-1 max-w-3xl text-sm text-slate-600">
              Sin edición silenciosa: fotografía completa, valores absolutos, evidencia privada y
              decisión terminal por otra persona. Este flujo nunca recibe firmas, cédulas ni datos
              individuales de apoyantes.
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={refresh}
          disabled={loading}
          className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-slate-300 px-3 py-2 text-sm font-semibold"
        >
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
          Actualizar
        </button>
      </div>

      {error ? (
        <div role="alert" className="mt-4 flex gap-2 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-900">
          <AlertTriangle className="h-5 w-5 shrink-0" aria-hidden="true" />
          {error}
        </div>
      ) : null}
      {notice ? (
        <div role="status" className="mt-4 flex gap-2 rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-900">
          <CheckCircle2 className="h-5 w-5 shrink-0" aria-hidden="true" />
          {notice}
        </div>
      ) : null}

      <div className="mt-4 grid gap-3 md:grid-cols-3">
        <div className="rounded-xl bg-violet-50 p-3 text-sm">
          <strong>Custodia física:</strong> revisa exclusivamente COMPLIANCE_OFFICER.
        </div>
        <div className="rounded-xl bg-violet-50 p-3 text-sm">
          <strong>Clasificación de apoyos:</strong> revisa exclusivamente AUDITOR.
        </div>
        <div className="rounded-xl bg-violet-50 p-3 text-sm">
          <strong>Pendientes:</strong> {overview?.readiness.pendingCount ?? "—"}. La liberación se
          bloquea mientras haya alguno.
        </div>
      </div>

      {canPropose ? (
        selectedBatch ? (
          <form
            key={selectedBatch.id}
            onSubmit={submitProposal}
            className="mt-5 grid gap-4 rounded-2xl border border-amber-200 bg-amber-50 p-4"
            data-testid="signature-count-correction-proposal-form"
          >
            <div>
              <h3 className="font-bold text-amber-950">Proponer fotografía corregida</h3>
              <p className="text-sm text-amber-900">
                Sólo aparecen lotes ya puestos en cuarentena. Ningún valor se aplica al enviar esta
                propuesta.
              </p>
            </div>
            <label className="grid gap-1 text-sm font-medium">
              Lote en cuarentena
              <select
                value={selectedBatch.id}
                onChange={(event) => setSelectedBatchId(event.target.value)}
                className="min-h-11 rounded-xl border border-amber-300 bg-white px-3 py-2"
              >
                {quarantined.map((batch) => (
                  <option key={batch.id} value={batch.id}>
                    {batch.code} · versión {batch.version}
                  </option>
                ))}
              </select>
            </label>
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
              {COUNT_FIELDS.map(({ key, label }) => (
                <label key={key} className="grid gap-1 text-xs font-semibold text-slate-700">
                  {label}
                  <input
                    name={key}
                    type="number"
                    min={key === "plannedForms" ? 1 : 0}
                    max={1_000_000_000}
                    required
                    defaultValue={selectedBatch[key]}
                    className="min-h-11 rounded-xl border border-slate-300 bg-white px-3 py-2 text-base"
                  />
                </label>
              ))}
            </div>
            <p className="text-xs text-amber-900">
              Ecuaciones obligatorias: devueltos + anulados + faltantes + custodia = entregados;
              aceptados + rechazados = reportados; duplicados ≤ rechazados.
            </p>
            <label className="grid gap-1 text-sm font-medium">
              Razón verificable
              <textarea
                name="reason"
                required
                minLength={20}
                maxLength={2000}
                rows={3}
                className="rounded-xl border border-amber-300 bg-white px-3 py-2"
              />
            </label>
            <label className="grid gap-1 text-sm font-medium">
              Evidencia privada (PDF o imagen, máximo 20 MiB)
              <input
                name="evidenceFile"
                type="file"
                accept="application/pdf,image/jpeg,image/png,image/webp"
                required
                className="min-h-11 rounded-xl border border-amber-300 bg-white px-3 py-2"
              />
            </label>
            <button
              type="submit"
              disabled={busy !== null}
              className="min-h-11 rounded-xl bg-amber-800 px-4 py-2 font-bold text-white disabled:opacity-60"
            >
              {busy === "proposal" ? "Verificando y registrando…" : "Registrar propuesta inmutable"}
            </button>
          </form>
        ) : (
          <p className="mt-5 rounded-xl border border-dashed border-slate-300 p-4 text-sm text-slate-600">
            Para corregir conteos, primero registra la cuarentena del lote mediante el control de
            custodia existente.
          </p>
        )
      ) : null}

      <div className="mt-6 space-y-4">
        <h3 className="font-bold text-slate-950">Historial append-only</h3>
        {loading && !overview ? (
          <p className="flex items-center gap-2 text-sm text-slate-600">
            <Loader2 className="h-4 w-4 animate-spin" /> Cargando propuestas…
          </p>
        ) : overview?.proposals.length ? (
          overview.proposals.map((proposal) => (
            <article key={proposal.id} className="rounded-2xl border border-slate-200 p-4" data-testid={`signature-correction-${proposal.id}`}>
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <h4 className="font-bold text-slate-950">
                    Lote {proposal.batchCode} · versión fotografiada {proposal.snapshotBatchVersion}
                  </h4>
                  <p className="mt-1 text-xs text-slate-500">
                    Solicitó {proposal.requestedBy.name} ({proposal.requestedBy.role}) · {formatDate(proposal.createdAt)}
                  </p>
                </div>
                <span className={`rounded-full px-3 py-1 text-xs font-bold ${proposal.decision ? proposal.decision.decision === "APPROVE" ? "bg-emerald-100 text-emerald-800" : "bg-red-100 text-red-800" : "bg-amber-100 text-amber-900"}`}>
                  {proposal.decision ? (proposal.decision.decision === "APPROVE" ? "Aprobada" : "Rechazada") : "Pendiente"}
                </span>
              </div>
              <p className="mt-3 text-sm text-slate-700">{proposal.reason}</p>
              <div className="mt-3 overflow-x-auto">
                <table className="w-full min-w-[620px] border-collapse text-sm">
                  <caption className="sr-only">Valores antes, propuestos y diferencia</caption>
                  <thead>
                    <tr className="border-b text-left text-xs uppercase tracking-wide text-slate-500">
                      <th className="py-2 pr-3">Conteo</th>
                      <th className="py-2 pr-3 text-right">Antes</th>
                      <th className="py-2 pr-3 text-right">Propuesto</th>
                      <th className="py-2 text-right">Diferencia</th>
                    </tr>
                  </thead>
                  <tbody>
                    {proposal.differences.map((difference) => (
                      <tr key={difference.field} className={`border-b border-slate-100 ${difference.change ? "font-semibold" : "text-slate-500"}`}>
                        <td className="py-2 pr-3">{difference.label}</td>
                        <td className="py-2 pr-3 text-right tabular-nums">{difference.before.toLocaleString("es-CO")}</td>
                        <td className="py-2 pr-3 text-right tabular-nums">{difference.proposed.toLocaleString("es-CO")}</td>
                        <td className={`py-2 text-right tabular-nums ${difference.change > 0 ? "text-emerald-700" : difference.change < 0 ? "text-red-700" : ""}`}>
                          {signed(difference.change)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="mt-3 flex flex-wrap items-center gap-3 text-xs text-slate-600">
                <span>Control: {proposal.requiredReviewControl}</span>
                <span>Revisor exigido: {proposal.requiredReviewerRole}</span>
                <span>SHA-256: <code>{proposal.evidenceSha256.slice(0, 12)}…</code></span>
                <button
                  type="button"
                  onClick={() => void openEvidence(proposal.id)}
                  className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-slate-300 px-3 py-2 font-semibold text-slate-800"
                >
                  <FileSearch className="h-4 w-4" aria-hidden="true" /> Ver evidencia privada
                </button>
              </div>
              {proposal.decision ? (
                <div className="mt-4 rounded-xl border border-slate-200 bg-slate-50 p-3 text-sm">
                  <strong>{proposal.decision.decision === "APPROVE" ? "Aprobó" : "Rechazó"}</strong>{" "}
                  {proposal.decision.reviewedBy.name} ({proposal.decision.reviewerRole}): {proposal.decision.reviewReason}
                  <p className="mt-1 text-xs text-slate-600">
                    Versión {proposal.decision.batchVersionBefore} → {proposal.decision.batchVersionAfter}. Estado actual: {proposal.currentBatch.status}.
                  </p>
                </div>
              ) : proposal.canReview && !readOnly ? (
                <DecisionForm proposal={proposal} busy={busy !== null} onSubmit={submitDecision} />
              ) : (
                <p className="mt-4 rounded-xl bg-slate-50 p-3 text-sm text-slate-600">
                  Pendiente de una persona distinta con rol {proposal.requiredReviewerRole}.
                </p>
              )}
            </article>
          ))
        ) : (
          <p className="rounded-xl border border-dashed border-slate-300 p-4 text-sm text-slate-600">
            No hay correcciones registradas. El historial aparecerá aquí sin reemplazar entradas previas.
          </p>
        )}
      </div>
    </section>
  );
}
