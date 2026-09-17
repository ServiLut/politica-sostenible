"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  FileCheck2,
  Landmark,
  Loader2,
  Plus,
  RefreshCw,
  Scale,
  ShieldCheck,
} from "lucide-react";
import { ApiError } from "@/lib/api-client";
import {
  approveFinanceReportVersion,
  createFinanceBankStatement,
  createFinanceDossier,
  createFinanceInKindContribution,
  createFinancePayable,
  createFinanceReportVersion,
  getFinanceCloseoutOverview,
  recordFinanceExternalEvidence,
  reviewFinanceExternalEvidence,
  settleFinancePayable,
  type FinanceApprovalDecision,
  type FinanceBankMatchStatus,
  type FinanceCloseoutOverview,
  type FinanceCloseoutVersion,
} from "@/lib/finance-closeout-api";
import {
  uploadFileDirectlyWithClientDeclaredHash,
  type ClientDeclaredHashUploadConfirmation,
} from "@/lib/direct-storage-upload";
import { useAuth } from "@/context/auth";

interface EntryOption {
  id: string;
  type: "INCOME" | "EXPENSE";
  amount: string | number;
  date: string;
  description: string;
  status: "PENDING" | "APPROVED" | "REJECTED" | "REPORTED_CNE";
  hasEvidence: boolean;
}

interface Props {
  financialEntries: EntryOption[];
  complianceReady: boolean;
}

type BankLineForm = {
  lineNumber: number;
  occurredAt: string;
  bankReference: string;
  description: string;
  debit: string;
  credit: string;
  matchStatus: FinanceBankMatchStatus;
  matchedEntryId: string;
  exclusionReason: string;
};

const inputClass =
  "w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-900";
const labelClass =
  "space-y-1 text-[10px] font-black uppercase tracking-wider text-slate-500";
const actionClass =
  "inline-flex min-h-10 items-center justify-center gap-2 rounded-xl bg-slate-950 px-4 text-xs font-black uppercase tracking-wider text-white disabled:cursor-not-allowed disabled:opacity-50";

function requestId() {
  return globalThis.crypto.randomUUID();
}

function today() {
  return new Date().toISOString().slice(0, 10);
}

function money(value: string | number) {
  return new Intl.NumberFormat("es-CO", {
    style: "currency",
    currency: "COP",
    maximumFractionDigits: 0,
  }).format(Number(value));
}

function errorMessage(error: unknown, fallback: string) {
  return error instanceof ApiError || error instanceof Error
    ? error.message
    : fallback;
}

function newBankLine(lineNumber: number): BankLineForm {
  return {
    lineNumber,
    occurredAt: today(),
    bankReference: "",
    description: "",
    debit: "0",
    credit: "0",
    matchStatus: "UNMATCHED",
    matchedEntryId: "",
    exclusionReason: "",
  };
}

export function FinanceCloseoutPanel({
  financialEntries,
  complianceReady,
}: Props) {
  const { user } = useAuth();
  const role = user?.backendRole;
  const canPrepare = role === "CAMPAIGN_MANAGER" || role === "FINANCE_MANAGER";
  const canAccount = role === "FINANCE_MANAGER";
  const canApprove =
    role === "CAMPAIGN_MANAGER" ||
    role === "FINANCE_MANAGER" ||
    role === "COMPLIANCE_OFFICER";
  const canRecordEvidence =
    role === "FINANCE_MANAGER" || role === "COMPLIANCE_OFFICER";
  const canAuditEvidence = role === "AUDITOR";
  const [overview, setOverview] = useState<FinanceCloseoutOverview | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [openForm, setOpenForm] = useState<string | null>(null);

  const [dossierForm, setDossierForm] = useState({
    kind: "CANDIDATE" as "CANDIDATE" | "CONSOLIDATED",
    subjectCode: "",
    subjectName: "",
  });
  const [versionForm, setVersionForm] = useState({
    dossierId: "",
    periodStartsAt: today(),
    periodEndsAt: today(),
    preparationNote: "",
  });
  const [approvalForm, setApprovalForm] = useState({
    versionId: "",
    decision: "APPROVE" as FinanceApprovalDecision,
    rationale: "",
  });
  const [statementForm, setStatementForm] = useState({
    bankName: "",
    accountLastFour: "",
    periodStartsAt: today(),
    periodEndsAt: today(),
    openingBalance: "0",
    closingBalance: "0",
  });
  const [statementFile, setStatementFile] = useState<File | null>(null);
  const [bankLines, setBankLines] = useState<BankLineForm[]>([newBankLine(1)]);
  const [inKindForm, setInKindForm] = useState({
    incomeEntryId: "",
    expenseEntryId: "",
    contributorName: "",
    contributorDocument: "",
    contributionDate: today(),
    description: "",
    value: "",
    valuationMethod: "",
    valuationSourceReference: "",
  });
  const [inKindFile, setInKindFile] = useState<File | null>(null);
  const [payableForm, setPayableForm] = useState({
    expenseEntryId: "",
    creditorName: "",
    creditorTaxId: "",
    description: "",
    incurredAt: today(),
    dueAt: today(),
    originalAmount: "",
  });
  const [payableFile, setPayableFile] = useState<File | null>(null);
  const [settlementForm, setSettlementForm] = useState({
    payableId: "",
    bankStatementLineId: "",
    amount: "",
    paidAt: today(),
    paymentReference: "",
  });
  const [settlementFile, setSettlementFile] = useState<File | null>(null);
  const [evidenceForm, setEvidenceForm] = useState({
    versionId: "",
    authorityName: "Consejo Nacional Electoral",
    channel: "Cuentas Claras",
    externalReference: "",
    submittedAt: new Date().toISOString().slice(0, 16),
  });
  const [evidenceFile, setEvidenceFile] = useState<File | null>(null);
  const [reviewForm, setReviewForm] = useState({
    evidenceId: "",
    decision: "APPROVE" as "APPROVE" | "REJECT",
    reviewNote: "",
  });

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setOverview(await getFinanceCloseoutOverview());
    } catch (requestError) {
      setError(
        errorMessage(
          requestError,
          "No fue posible consultar el cierre financiero.",
        ),
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const approvedEntries = useMemo(
    () =>
      financialEntries.filter(
        (entry) =>
          entry.status === "APPROVED" || entry.status === "REPORTED_CNE",
      ),
    [financialEntries],
  );
  const payableBankLines = useMemo(
    () =>
      (overview?.bankStatements ?? []).flatMap((statement) =>
        statement.lines
          .filter(
            (line) =>
              Number(line.debit) > 0 && line.matchStatus === "MATCHED",
          )
          .map((line) => ({
            ...line,
            statementLabel: `${statement.bankName} ${statement.accountMasked}`,
          })),
      ),
    [overview],
  );

  async function run(action: () => Promise<unknown>, success: string) {
    setSaving(true);
    setError(null);
    setNotice(null);
    try {
      await action();
      setNotice(success);
      setOpenForm(null);
      await load();
    } catch (requestError) {
      setError(errorMessage(requestError, "No fue posible completar la accion."));
    } finally {
      setSaving(false);
    }
  }

  async function requireIntegrityUpload(
    file: File | null,
    label: string,
  ): Promise<ClientDeclaredHashUploadConfirmation> {
    if (!file) throw new Error(`Adjunta ${label} antes de continuar.`);
    return uploadFileDirectlyWithClientDeclaredHash(file, "finance");
  }

  function latestVersion(dossierId: string) {
    return overview?.dossiers.find((item) => item.id === dossierId)?.versions[0];
  }

  const readOnly = overview?.readOnly === true;

  return (
    <section
      aria-labelledby="finance-closeout-title"
      className="space-y-5 rounded-[2rem] border border-indigo-200 bg-white p-6 shadow-sm"
    >
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <div className="inline-flex items-center gap-2 rounded-full bg-indigo-50 px-3 py-1 text-[10px] font-black uppercase tracking-[0.18em] text-indigo-700">
            <Scale size={13} /> Cierre y rendicion interna
          </div>
          <h2
            id="finance-closeout-title"
            className="mt-3 text-2xl font-black text-slate-950"
          >
            Expedientes, conciliacion y controles
          </h2>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">
            {overview?.legalStateNotice ??
              "Prepara cortes inmutables y evidencia verificable sin sustituir la presentacion oficial."}
          </p>
        </div>
        <button
          type="button"
          onClick={() => void load()}
          disabled={loading}
          className="inline-flex min-h-10 items-center justify-center gap-2 rounded-xl border border-slate-200 px-4 text-xs font-black uppercase tracking-wider text-slate-700 disabled:opacity-50"
        >
          <RefreshCw className={loading ? "animate-spin" : ""} size={15} />
          Actualizar controles
        </button>
      </div>

      {notice && (
        <div
          role="status"
          className="flex items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm font-bold text-emerald-800"
        >
          <CheckCircle2 size={18} /> {notice}
        </div>
      )}
      {error && (
        <div
          role="alert"
          className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm font-semibold text-red-800"
        >
          {error}
        </div>
      )}
      {!complianceReady && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
          Completa primero el expediente electoral superior; los cortes no deben
          prepararse sin eleccion, topes, cuenta unica, responsables y plazo.
        </div>
      )}
      {readOnly && (
        <div className="rounded-xl border border-slate-300 bg-slate-100 p-4 text-sm font-bold text-slate-700">
          Operacion cerrada: todo este expediente permanece disponible en solo
          lectura y ningun comando puede reabrirlo.
        </div>
      )}

      {overview && (
        <>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <article className="rounded-2xl bg-slate-950 p-5 text-white">
              <p className="text-[10px] font-black uppercase tracking-wider text-slate-400">
                Alistamiento financiero
              </p>
              <p className="mt-2 text-xl font-black">
                {overview.readiness.readyForCloseout ? "Si" : "No"}
              </p>
            </article>
            <article className="rounded-2xl border border-slate-200 p-5">
              <p className="text-[10px] font-black uppercase tracking-wider text-slate-400">
                Expedientes / extractos
              </p>
              <p className="mt-2 text-xl font-black text-slate-950">
                {overview.summary.dossierCount} / {overview.summary.bankStatementCount}
              </p>
            </article>
            <article className="rounded-2xl border border-slate-200 p-5">
              <p className="text-[10px] font-black uppercase tracking-wider text-slate-400">
                Lineas sin conciliar
              </p>
              <p className="mt-2 text-xl font-black text-slate-950">
                {overview.summary.unmatchedBankLineCount}
              </p>
            </article>
            <article className="rounded-2xl border border-slate-200 p-5">
              <p className="text-[10px] font-black uppercase tracking-wider text-slate-400">
                Cuentas por pagar
              </p>
              <p className="mt-2 text-xl font-black text-slate-950">
                {money(overview.summary.outstandingPayables)}
              </p>
            </article>
          </div>

          <p className="rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm leading-6 text-slate-700">
            Este indicador no ejecuta ni aprueba el cierre. El cierre ordinario
            sigue siendo una unica accion administrativa; los tres controles
            independientes aprueban la version del informe, no la transicion de
            etapa.
          </p>

          {overview.readiness.blockers.length > 0 && (
            <div className="rounded-2xl border border-amber-200 bg-amber-50 p-5">
              <h3 className="flex items-center gap-2 font-black text-amber-950">
                <AlertTriangle size={18} /> Bloqueos verificables de cierre
              </h3>
              <ul className="mt-3 space-y-2 text-sm text-amber-900">
                {overview.readiness.blockers.map((blocker) => (
                  <li key={blocker.code}>
                    <span className="font-black">{blocker.code}:</span>{" "}
                    {blocker.detail}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </>
      )}

      {!readOnly && complianceReady && (
        <div className="flex flex-wrap gap-2 border-y border-slate-100 py-4">
          {canPrepare && (
            <button
              type="button"
              onClick={() => setOpenForm("dossier")}
              className={actionClass}
            >
              <Plus size={14} /> Expediente
            </button>
          )}
          {canAccount && (
            <>
              <button
                type="button"
                onClick={() => setOpenForm("statement")}
                className={actionClass}
              >
                <Landmark size={14} /> Extracto
              </button>
              <button
                type="button"
                onClick={() => setOpenForm("in-kind")}
                className={actionClass}
              >
                Aporte en especie
              </button>
              <button
                type="button"
                onClick={() => setOpenForm("payable")}
                className={actionClass}
              >
                Cuenta por pagar
              </button>
              <button
                type="button"
                onClick={() => setOpenForm("settlement")}
                disabled={overview?.payables.every((item) => item.status === "PAID")}
                className={actionClass}
              >
                Registrar pago
              </button>
            </>
          )}
        </div>
      )}

      {openForm === "dossier" && (
        <form
          onSubmit={(event) => {
            event.preventDefault();
            void run(
              () =>
                createFinanceDossier({
                  clientRequestId: requestId(),
                  ...dossierForm,
                  subjectCode:
                    dossierForm.kind === "CONSOLIDATED"
                      ? "CONSOLIDATED"
                      : dossierForm.subjectCode,
                }),
              "Expediente interno creado; aun no constituye un informe oficial.",
            );
          }}
          className="grid gap-3 rounded-2xl border border-indigo-200 bg-indigo-50/40 p-5 md:grid-cols-3"
        >
          <label className={labelClass}>
            Tipo
            <select
              value={dossierForm.kind}
              onChange={(event) =>
                setDossierForm({
                  ...dossierForm,
                  kind: event.target.value as typeof dossierForm.kind,
                })
              }
              className={inputClass}
            >
              <option value="CANDIDATE">Candidatura</option>
              <option value="CONSOLIDATED">Consolidado organizacion</option>
            </select>
          </label>
          <label className={labelClass}>
            Codigo del sujeto
            <input
              required
              disabled={dossierForm.kind === "CONSOLIDATED"}
              value={
                dossierForm.kind === "CONSOLIDATED"
                  ? "CONSOLIDATED"
                  : dossierForm.subjectCode
              }
              onChange={(event) =>
                setDossierForm({ ...dossierForm, subjectCode: event.target.value })
              }
              className={inputClass}
            />
          </label>
          <label className={labelClass}>
            Nombre
            <input
              required
              minLength={2}
              maxLength={200}
              value={dossierForm.subjectName}
              onChange={(event) =>
                setDossierForm({ ...dossierForm, subjectName: event.target.value })
              }
              className={inputClass}
            />
          </label>
          <FormActions saving={saving} onCancel={() => setOpenForm(null)} />
        </form>
      )}

      {openForm === "version" && (
        <form
          onSubmit={(event) => {
            event.preventDefault();
            const previous = latestVersion(versionForm.dossierId);
            void run(
              () =>
                createFinanceReportVersion(versionForm.dossierId, {
                  clientRequestId: requestId(),
                  periodStartsAt: versionForm.periodStartsAt,
                  periodEndsAt: versionForm.periodEndsAt,
                  preparationNote: versionForm.preparationNote,
                  ...(previous
                    ? {
                        basedOnVersionId: previous.id,
                        correctionReason:
                          "Correccion solicitada sobre la version vigente; se conserva el corte anterior.",
                      }
                    : {}),
                }),
              previous
                ? "Nueva correccion creada sin reescribir el corte anterior."
                : "Primera version y corte inmutable creados.",
            );
          }}
          className="grid gap-3 rounded-2xl border border-indigo-200 bg-indigo-50/40 p-5 md:grid-cols-3"
        >
          <label className={labelClass}>
            Inicio del periodo
            <input
              required
              type="date"
              value={versionForm.periodStartsAt}
              onChange={(event) =>
                setVersionForm({
                  ...versionForm,
                  periodStartsAt: event.target.value,
                })
              }
              className={inputClass}
            />
          </label>
          <label className={labelClass}>
            Fin del periodo
            <input
              required
              type="date"
              value={versionForm.periodEndsAt}
              onChange={(event) =>
                setVersionForm({ ...versionForm, periodEndsAt: event.target.value })
              }
              className={inputClass}
            />
          </label>
          <label className={`${labelClass} md:col-span-3`}>
            Nota de preparacion
            <textarea
              required
              minLength={10}
              maxLength={4000}
              value={versionForm.preparationNote}
              onChange={(event) =>
                setVersionForm({
                  ...versionForm,
                  preparationNote: event.target.value,
                })
              }
              className={inputClass}
            />
          </label>
          <FormActions saving={saving} onCancel={() => setOpenForm(null)} />
        </form>
      )}

      {openForm === "approval" && (
        <form
          onSubmit={(event) => {
            event.preventDefault();
            void run(
              () =>
                approveFinanceReportVersion(approvalForm.versionId, {
                  clientRequestId: requestId(),
                  decision: approvalForm.decision,
                  rationale: approvalForm.rationale,
                }),
              approvalForm.decision === "APPROVE"
                ? "Control independiente registrado."
                : "Version devuelta y sellada; la correccion exige una nueva version.",
            );
          }}
          className="grid gap-3 rounded-2xl border border-indigo-200 bg-indigo-50/40 p-5 md:grid-cols-2"
        >
          <label className={labelClass}>
            Decision
            <select
              value={approvalForm.decision}
              onChange={(event) =>
                setApprovalForm({
                  ...approvalForm,
                  decision: event.target.value as FinanceApprovalDecision,
                })
              }
              className={inputClass}
            >
              <option value="APPROVE">Aprobar mi control</option>
              <option value="RETURN_FOR_CORRECTION">Devolver para correccion</option>
            </select>
          </label>
          <label className={labelClass}>
            Justificacion
            <textarea
              required
              minLength={10}
              maxLength={2000}
              value={approvalForm.rationale}
              onChange={(event) =>
                setApprovalForm({ ...approvalForm, rationale: event.target.value })
              }
              className={inputClass}
            />
          </label>
          <FormActions saving={saving} onCancel={() => setOpenForm(null)} />
        </form>
      )}

      {openForm === "statement" && (
        <form
          onSubmit={(event) => {
            event.preventDefault();
            void run(async () => {
              const upload = await requireIntegrityUpload(
                statementFile,
                "el extracto bancario privado",
              );
              await createFinanceBankStatement({
                clientRequestId: requestId(),
                ...statementForm,
                openingBalance: Number(statementForm.openingBalance),
                closingBalance: Number(statementForm.closingBalance),
                storagePath: upload.path,
                statementSha256: upload.sha256,
                lines: bankLines.map((line) => ({
                  ...line,
                  debit: Number(line.debit),
                  credit: Number(line.credit),
                  ...(line.matchedEntryId
                    ? { matchedEntryId: line.matchedEntryId }
                    : {}),
                  ...(line.exclusionReason
                    ? { exclusionReason: line.exclusionReason }
                    : {}),
                })),
              });
            }, "Extracto y lineas conciliatorias guardados con huella SHA-256.");
          }}
          className="space-y-4 rounded-2xl border border-indigo-200 bg-indigo-50/40 p-5"
        >
          <div className="grid gap-3 md:grid-cols-3">
            {[
              ["Banco", "bankName", "text"],
              ["Ultimos 4", "accountLastFour", "text"],
              ["Inicio", "periodStartsAt", "date"],
              ["Fin", "periodEndsAt", "date"],
              ["Saldo inicial", "openingBalance", "number"],
              ["Saldo final", "closingBalance", "number"],
            ].map(([label, key, type]) => (
              <label key={key} className={labelClass}>
                {label}
                <input
                  required
                  type={type}
                  step={type === "number" ? "0.01" : undefined}
                  value={statementForm[key as keyof typeof statementForm]}
                  onChange={(event) =>
                    setStatementForm({
                      ...statementForm,
                      [key]: event.target.value,
                    })
                  }
                  className={inputClass}
                />
              </label>
            ))}
            <label className={`${labelClass} md:col-span-3`}>
              Archivo privado del extracto
              <input
                required
                type="file"
                accept="application/pdf,text/csv,.xlsx"
                onChange={(event) =>
                  setStatementFile(event.target.files?.[0] ?? null)
                }
                className={inputClass}
              />
            </label>
          </div>
          <div className="space-y-3">
            {bankLines.map((line, index) => (
              <fieldset
                key={line.lineNumber}
                className="grid gap-2 rounded-xl border border-slate-200 bg-white p-3 md:grid-cols-4"
              >
                <legend className="px-2 text-xs font-black">
                  Linea {line.lineNumber}
                </legend>
                <input
                  aria-label={`Fecha linea ${line.lineNumber}`}
                  required
                  type="date"
                  value={line.occurredAt}
                  onChange={(event) =>
                    setBankLines((current) =>
                      current.map((item, itemIndex) =>
                        itemIndex === index
                          ? { ...item, occurredAt: event.target.value }
                          : item,
                      ),
                    )
                  }
                  className={inputClass}
                />
                {(["bankReference", "description", "debit", "credit"] as const).map(
                  (key) => (
                    <input
                      key={key}
                      aria-label={`${key} linea ${line.lineNumber}`}
                      required
                      type={key === "debit" || key === "credit" ? "number" : "text"}
                      step="0.01"
                      value={line[key]}
                      onChange={(event) =>
                        setBankLines((current) =>
                          current.map((item, itemIndex) =>
                            itemIndex === index
                              ? { ...item, [key]: event.target.value }
                              : item,
                          ),
                        )
                      }
                      className={inputClass}
                      placeholder={key}
                    />
                  ),
                )}
                <select
                  aria-label={`Estado linea ${line.lineNumber}`}
                  value={line.matchStatus}
                  onChange={(event) =>
                    setBankLines((current) =>
                      current.map((item, itemIndex) =>
                        itemIndex === index
                          ? {
                              ...item,
                              matchStatus: event.target.value as FinanceBankMatchStatus,
                              matchedEntryId: "",
                              exclusionReason: "",
                            }
                          : item,
                      ),
                    )
                  }
                  className={inputClass}
                >
                  <option value="MATCHED">Conciliada</option>
                  <option value="UNMATCHED">Sin conciliar</option>
                  <option value="EXCLUDED">Excluida con justificacion</option>
                </select>
                {line.matchStatus === "MATCHED" && (
                  <select
                    required
                    aria-label={`Movimiento linea ${line.lineNumber}`}
                    value={line.matchedEntryId}
                    onChange={(event) =>
                      setBankLines((current) =>
                        current.map((item, itemIndex) =>
                          itemIndex === index
                            ? { ...item, matchedEntryId: event.target.value }
                            : item,
                        ),
                      )
                    }
                    className={`${inputClass} md:col-span-2`}
                  >
                    <option value="">Selecciona movimiento</option>
                    {approvedEntries.map((entry) => (
                      <option key={entry.id} value={entry.id}>
                        {entry.type} · {money(entry.amount)} · {entry.description}
                      </option>
                    ))}
                  </select>
                )}
                {line.matchStatus === "EXCLUDED" && (
                  <input
                    required
                    minLength={10}
                    aria-label={`Justificacion linea ${line.lineNumber}`}
                    value={line.exclusionReason}
                    onChange={(event) =>
                      setBankLines((current) =>
                        current.map((item, itemIndex) =>
                          itemIndex === index
                            ? { ...item, exclusionReason: event.target.value }
                            : item,
                        ),
                      )
                    }
                    className={`${inputClass} md:col-span-2`}
                  />
                )}
                {bankLines.length > 1 && (
                  <button
                    type="button"
                    onClick={() =>
                      setBankLines((current) =>
                        current
                          .filter((_, itemIndex) => itemIndex !== index)
                          .map((item, itemIndex) => ({
                            ...item,
                            lineNumber: itemIndex + 1,
                          })),
                      )
                    }
                    className="text-xs font-black text-red-700"
                  >
                    Quitar linea
                  </button>
                )}
              </fieldset>
            ))}
            <button
              type="button"
              onClick={() =>
                setBankLines((current) => [
                  ...current,
                  newBankLine(current.length + 1),
                ])
              }
              className="text-xs font-black text-indigo-700"
            >
              + Agregar linea bancaria
            </button>
          </div>
          <FormActions saving={saving} onCancel={() => setOpenForm(null)} />
        </form>
      )}

      {openForm === "in-kind" && (
        <EvidenceAccountingForm
          title="Registrar aporte en especie con par ingreso/gasto"
          saving={saving}
          fields={inKindForm}
          setField={(key, value) =>
            setInKindForm((current) => ({ ...current, [key]: value }))
          }
          setFile={setInKindFile}
          approvedEntries={approvedEntries}
          kind="in-kind"
          onCancel={() => setOpenForm(null)}
          onSubmit={() =>
            run(async () => {
              const upload = await requireIntegrityUpload(
                inKindFile,
                "el soporte de valoracion",
              );
              await createFinanceInKindContribution({
                clientRequestId: requestId(),
                ...inKindForm,
                value: Number(inKindForm.value),
                storagePath: upload.path,
                valuationSha256: upload.sha256,
              });
            }, "Aporte en especie enlazado a un ingreso y gasto del mismo valor.")
          }
        />
      )}

      {openForm === "payable" && (
        <EvidenceAccountingForm
          title="Registrar cuenta por pagar"
          saving={saving}
          fields={payableForm}
          setField={(key, value) =>
            setPayableForm((current) => ({ ...current, [key]: value }))
          }
          setFile={setPayableFile}
          approvedEntries={approvedEntries}
          kind="payable"
          onCancel={() => setOpenForm(null)}
          onSubmit={() =>
            run(async () => {
              const upload = await requireIntegrityUpload(
                payableFile,
                "el soporte de la obligacion",
              );
              await createFinancePayable({
                clientRequestId: requestId(),
                ...payableForm,
                originalAmount: Number(payableForm.originalAmount),
                storagePath: upload.path,
                supportSha256: upload.sha256,
              });
            }, "Cuenta por pagar vinculada a un gasto aprobado.")
          }
        />
      )}

      {openForm === "settlement" && (
        <form
          onSubmit={(event) => {
            event.preventDefault();
            void run(async () => {
              const upload = await requireIntegrityUpload(
                settlementFile,
                "el soporte del pago",
              );
              await settleFinancePayable(settlementForm.payableId, {
                clientRequestId: requestId(),
                bankStatementLineId: settlementForm.bankStatementLineId,
                amount: Number(settlementForm.amount),
                paidAt: settlementForm.paidAt,
                paymentReference: settlementForm.paymentReference,
                storagePath: upload.path,
                supportSha256: upload.sha256,
              });
            }, "Pago conciliado con una linea bancaria y saldo recalculado.");
          }}
          className="grid gap-3 rounded-2xl border border-indigo-200 bg-indigo-50/40 p-5 md:grid-cols-2"
        >
          <label className={labelClass}>
            Cuenta por pagar
            <select
              required
              value={settlementForm.payableId}
              onChange={(event) =>
                setSettlementForm({
                  ...settlementForm,
                  payableId: event.target.value,
                })
              }
              className={inputClass}
            >
              <option value="">Selecciona obligacion</option>
              {overview?.payables
                .filter((item) => item.status !== "PAID")
                .map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.creditorName} · {money(item.outstandingAmount)}
                  </option>
                ))}
            </select>
          </label>
          <label className={labelClass}>
            Debito bancario conciliado
            <select
              required
              value={settlementForm.bankStatementLineId}
              onChange={(event) => {
                const selected = payableBankLines.find(
                  (line) => line.id === event.target.value,
                );
                setSettlementForm({
                  ...settlementForm,
                  bankStatementLineId: event.target.value,
                  amount: selected ? String(selected.debit) : "",
                  paidAt: selected?.occurredAt.slice(0, 10) ?? today(),
                });
              }}
              className={inputClass}
            >
              <option value="">Selecciona debito</option>
              {payableBankLines.map((line) => (
                <option key={line.id} value={line.id}>
                  {line.statementLabel} · {line.bankReference} · {money(line.debit)}
                </option>
              ))}
            </select>
          </label>
          {(["amount", "paidAt", "paymentReference"] as const).map((key) => (
            <label key={key} className={labelClass}>
              {key === "amount"
                ? "Valor"
                : key === "paidAt"
                  ? "Fecha"
                  : "Referencia de pago"}
              <input
                required
                readOnly={key === "amount" || key === "paidAt"}
                type={key === "amount" ? "number" : key === "paidAt" ? "date" : "text"}
                value={settlementForm[key]}
                onChange={(event) =>
                  setSettlementForm({
                    ...settlementForm,
                    [key]: event.target.value,
                  })
                }
                className={inputClass}
              />
            </label>
          ))}
          <label className={labelClass}>
            Soporte privado del pago
            <input
              required
              type="file"
              accept="application/pdf,image/*"
              onChange={(event) =>
                setSettlementFile(event.target.files?.[0] ?? null)
              }
              className={inputClass}
            />
          </label>
          <FormActions saving={saving} onCancel={() => setOpenForm(null)} />
        </form>
      )}

      {openForm === "external-evidence" && (
        <form
          onSubmit={(event) => {
            event.preventDefault();
            void run(async () => {
              const upload = await requireIntegrityUpload(
                evidenceFile,
                "la constancia externa",
              );
              await recordFinanceExternalEvidence(evidenceForm.versionId, {
                clientRequestId: requestId(),
                authorityName: evidenceForm.authorityName,
                channel: evidenceForm.channel,
                externalReference: evidenceForm.externalReference,
                submittedAt: new Date(evidenceForm.submittedAt).toISOString(),
                storagePath: upload.path,
                evidenceSha256: upload.sha256,
              });
            }, "Constancia externa declarada; queda pendiente de auditoria independiente.");
          }}
          className="grid gap-3 rounded-2xl border border-indigo-200 bg-indigo-50/40 p-5 md:grid-cols-2"
        >
          {(
            [
              ["Autoridad declarada", "authorityName", "text"],
              ["Canal declarado", "channel", "text"],
              ["Referencia externa", "externalReference", "text"],
              ["Fecha y hora declarada", "submittedAt", "datetime-local"],
            ] as const
          ).map(([label, key, type]) => (
            <label key={key} className={labelClass}>
              {label}
              <input
                required
                type={type}
                value={evidenceForm[key]}
                onChange={(event) =>
                  setEvidenceForm({ ...evidenceForm, [key]: event.target.value })
                }
                className={inputClass}
              />
            </label>
          ))}
          <label className={`${labelClass} md:col-span-2`}>
            Archivo privado de constancia
            <input
              required
              type="file"
              accept="application/pdf,image/*"
              onChange={(event) => setEvidenceFile(event.target.files?.[0] ?? null)}
              className={inputClass}
            />
          </label>
          <p className="md:col-span-2 text-xs leading-5 text-amber-800">
            Guardar esta evidencia no transmite datos ni prueba por si solo que la
            autoridad recibio o valido el informe.
          </p>
          <FormActions saving={saving} onCancel={() => setOpenForm(null)} />
        </form>
      )}

      {openForm === "external-review" && (
        <form
          onSubmit={(event) => {
            event.preventDefault();
            void run(
              () =>
                reviewFinanceExternalEvidence(reviewForm.evidenceId, {
                  clientRequestId: requestId(),
                  decision: reviewForm.decision,
                  reviewNote: reviewForm.reviewNote,
                }),
              reviewForm.decision === "APPROVE"
                ? "Constancia revisada; los movimientos exactos del corte quedaron cubiertos."
                : "Constancia rechazada; debe prepararse una correccion verificable.",
            );
          }}
          className="grid gap-3 rounded-2xl border border-indigo-200 bg-indigo-50/40 p-5 md:grid-cols-2"
        >
          <label className={labelClass}>
            Decision del auditor
            <select
              value={reviewForm.decision}
              onChange={(event) =>
                setReviewForm({
                  ...reviewForm,
                  decision: event.target.value as typeof reviewForm.decision,
                })
              }
              className={inputClass}
            >
              <option value="APPROVE">Aprobar autenticidad interna</option>
              <option value="REJECT">Rechazar constancia</option>
            </select>
          </label>
          <label className={labelClass}>
            Nota de revision
            <textarea
              required
              minLength={10}
              maxLength={2000}
              value={reviewForm.reviewNote}
              onChange={(event) =>
                setReviewForm({ ...reviewForm, reviewNote: event.target.value })
              }
              className={inputClass}
            />
          </label>
          <FormActions saving={saving} onCancel={() => setOpenForm(null)} />
        </form>
      )}

      <div className="space-y-4">
        <h3 className="flex items-center gap-2 text-lg font-black text-slate-950">
          <FileCheck2 size={19} /> Versiones y controles independientes
        </h3>
        {overview?.dossiers.length === 0 && !loading && (
          <p className="rounded-xl border border-dashed border-slate-300 p-5 text-sm text-slate-500">
            No hay expedientes. Crea uno por candidatura o un consolidado segun
            la responsabilidad real del tenant.
          </p>
        )}
        {overview?.dossiers.map((dossier) => {
          const version = dossier.versions[0];
          return (
            <article key={dossier.id} className="rounded-2xl border border-slate-200 p-5">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <p className="text-[10px] font-black uppercase tracking-wider text-indigo-700">
                    {dossier.kind === "CANDIDATE" ? "Candidatura" : "Consolidado"}
                  </p>
                  <h4 className="mt-1 font-black text-slate-950">
                    {dossier.subjectName} · {dossier.subjectCode}
                  </h4>
                </div>
                {canPrepare && !readOnly && (
                  <button
                    type="button"
                    onClick={() => {
                      setVersionForm({
                        dossierId: dossier.id,
                        periodStartsAt:
                          version?.ledgerCut.periodStartsAt.slice(0, 10) ?? today(),
                        periodEndsAt:
                          version?.ledgerCut.periodEndsAt.slice(0, 10) ?? today(),
                        preparationNote: "",
                      });
                      setOpenForm("version");
                    }}
                    className="text-xs font-black text-indigo-700"
                  >
                    {version ? "Crear correccion" : "Crear primer corte"}
                  </button>
                )}
              </div>
              {version && (
                <VersionCard
                  version={version}
                  canApprove={canApprove && !readOnly}
                  canRecordEvidence={
                    canRecordEvidence &&
                    !readOnly &&
                    overview.operationStage === "POST_ELECTION"
                  }
                  canAuditEvidence={canAuditEvidence && !readOnly}
                  onApproval={() => {
                    setApprovalForm({
                      versionId: version.id,
                      decision: "APPROVE",
                      rationale: "",
                    });
                    setOpenForm("approval");
                  }}
                  onEvidence={() => {
                    setEvidenceForm({ ...evidenceForm, versionId: version.id });
                    setOpenForm("external-evidence");
                  }}
                  onReview={() => {
                    if (!version.externalEvidence) return;
                    setReviewForm({
                      evidenceId: version.externalEvidence.id,
                      decision: "APPROVE",
                      reviewNote: "",
                    });
                    setOpenForm("external-review");
                  }}
                />
              )}
            </article>
          );
        })}
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <EvidenceList
          title="Extractos conciliados"
          items={(overview?.bankStatements ?? []).map((item) => ({
            id: item.id,
            primary: `${item.bankName} ${item.accountMasked}`,
            secondary: `${item.lineCount} lineas · ${item.unmatchedLineCount} sin conciliar · SHA ${item.statementSha256.slice(0, 12)}…`,
          }))}
        />
        <EvidenceList
          title="Aportes en especie"
          items={(overview?.inKindContributions ?? []).map((item) => ({
            id: item.id,
            primary: `${item.contributorName} · ${money(item.value)}`,
            secondary: `${item.contributorDocumentMasked} · par ingreso/gasto verificado`,
          }))}
        />
        <EvidenceList
          title="Cuentas por pagar"
          items={(overview?.payables ?? []).map((item) => ({
            id: item.id,
            primary: `${item.creditorName} · ${money(item.outstandingAmount)}`,
            secondary: `${item.status} · vence ${item.dueAt.slice(0, 10)}`,
          }))}
        />
      </div>
    </section>
  );
}

function FormActions({
  saving,
  onCancel,
}: {
  saving: boolean;
  onCancel: () => void;
}) {
  return (
    <div className="flex gap-2 md:col-span-full">
      <button type="button" onClick={onCancel} className="rounded-xl border border-slate-200 px-4 text-xs font-black">
        Cancelar
      </button>
      <button disabled={saving} type="submit" className={actionClass}>
        {saving ? <Loader2 className="animate-spin" size={15} /> : <ShieldCheck size={15} />}
        Guardar con control
      </button>
    </div>
  );
}

function VersionCard({
  version,
  canApprove,
  canRecordEvidence,
  canAuditEvidence,
  onApproval,
  onEvidence,
  onReview,
}: {
  version: FinanceCloseoutVersion;
  canApprove: boolean;
  canRecordEvidence: boolean;
  canAuditEvidence: boolean;
  onApproval: () => void;
  onEvidence: () => void;
  onReview: () => void;
}) {
  const controlLabels = {
    CAMPAIGN_MANAGER: "Gerencia",
    ACCOUNTANT: "Contador",
    COMPLIANCE: "Cumplimiento",
  };
  return (
    <div className="mt-4 rounded-xl bg-slate-50 p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="font-black text-slate-900">
          Version {version.versionNumber} · {version.internalStatus}
        </p>
        <p className="text-xs font-bold text-slate-500">
          {version.ledgerCut.entryCount} movimientos · {money(version.ledgerCut.balance)}
        </p>
      </div>
      <p className="mt-2 break-all font-mono text-[10px] text-slate-500">
        Corte SHA-256: {version.ledgerCut.ledgerSha256}
      </p>
      <div className="mt-3 flex flex-wrap gap-2">
        {(["CAMPAIGN_MANAGER", "ACCOUNTANT", "COMPLIANCE"] as const).map(
          (control) => {
            const approval = version.approvals.find(
              (item) => item.control === control,
            );
            return (
              <span
                key={control}
                className={`rounded-full px-3 py-1 text-[10px] font-black uppercase ${
                  approval?.decision === "APPROVE"
                    ? "bg-emerald-100 text-emerald-800"
                    : approval
                      ? "bg-red-100 text-red-800"
                      : "bg-slate-200 text-slate-600"
                }`}
              >
                {controlLabels[control]}: {approval?.decision ?? "pendiente"}
              </span>
            );
          },
        )}
      </div>
      <p className="mt-3 text-xs font-bold text-slate-600">
        Evidencia externa: {version.externalEvidenceStatus}
      </p>
      <div className="mt-3 flex flex-wrap gap-2">
        {canApprove &&
          version.internalStatus !== "APPROVED_INTERNAL" &&
          version.internalStatus !== "RETURNED_FOR_CORRECTION" && (
            <button type="button" onClick={onApproval} className="text-xs font-black text-indigo-700">
              Registrar mi control
            </button>
          )}
        {canRecordEvidence &&
          version.internalStatus === "APPROVED_INTERNAL" &&
          version.externalEvidenceStatus === "NOT_RECORDED" && (
            <button type="button" onClick={onEvidence} className="text-xs font-black text-indigo-700">
              Anotar constancia externa
            </button>
          )}
        {canAuditEvidence && version.externalEvidenceStatus === "PENDING_REVIEW" && (
          <button type="button" onClick={onReview} className="text-xs font-black text-indigo-700">
            Auditar constancia
          </button>
        )}
      </div>
    </div>
  );
}

function EvidenceList({
  title,
  items,
}: {
  title: string;
  items: Array<{ id: string; primary: string; secondary: string }>;
}) {
  return (
    <article className="rounded-2xl border border-slate-200 p-4">
      <h3 className="font-black text-slate-900">{title}</h3>
      {items.length === 0 ? (
        <p className="mt-3 text-xs text-slate-500">Sin registros.</p>
      ) : (
        <ul className="mt-3 space-y-3">
          {items.slice(0, 10).map((item) => (
            <li key={item.id} className="border-t border-slate-100 pt-2 first:border-0">
              <p className="text-sm font-bold text-slate-800">{item.primary}</p>
              <p className="mt-1 text-xs text-slate-500">{item.secondary}</p>
            </li>
          ))}
        </ul>
      )}
    </article>
  );
}

function EvidenceAccountingForm({
  title,
  saving,
  fields,
  setField,
  setFile,
  approvedEntries,
  kind,
  onCancel,
  onSubmit,
}: {
  title: string;
  saving: boolean;
  fields: Record<string, string>;
  setField: (key: string, value: string) => void;
  setFile: (file: File | null) => void;
  approvedEntries: EntryOption[];
  kind: "in-kind" | "payable";
  onCancel: () => void;
  onSubmit: () => Promise<void>;
}) {
  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        void onSubmit();
      }}
      className="grid gap-3 rounded-2xl border border-indigo-200 bg-indigo-50/40 p-5 md:grid-cols-3"
    >
      <h3 className="font-black text-slate-950 md:col-span-3">{title}</h3>
      {kind === "in-kind" ? (
        <>
          <EntrySelect
            label="Ingreso aprobado"
            value={fields.incomeEntryId}
            entries={approvedEntries.filter((entry) => entry.type === "INCOME")}
            onChange={(value) => setField("incomeEntryId", value)}
          />
          <EntrySelect
            label="Gasto espejo aprobado"
            value={fields.expenseEntryId}
            entries={approvedEntries.filter((entry) => entry.type === "EXPENSE")}
            onChange={(value) => setField("expenseEntryId", value)}
          />
          {[
            ["Aportante", "contributorName", "text"],
            ["Documento", "contributorDocument", "text"],
            ["Fecha", "contributionDate", "date"],
            ["Descripcion", "description", "text"],
            ["Valor", "value", "number"],
            ["Metodo de valoracion", "valuationMethod", "text"],
            ["Referencia de valoracion", "valuationSourceReference", "text"],
          ].map(([label, key, type]) => (
            <TextField
              key={key}
              label={label}
              type={type}
              value={fields[key]}
              onChange={(value) => setField(key, value)}
            />
          ))}
        </>
      ) : (
        <>
          <EntrySelect
            label="Gasto aprobado"
            value={fields.expenseEntryId}
            entries={approvedEntries.filter((entry) => entry.type === "EXPENSE")}
            onChange={(value) => setField("expenseEntryId", value)}
          />
          {[
            ["Acreedor", "creditorName", "text"],
            ["NIT o documento", "creditorTaxId", "text"],
            ["Descripcion", "description", "text"],
            ["Causacion", "incurredAt", "date"],
            ["Vencimiento", "dueAt", "date"],
            ["Valor original", "originalAmount", "number"],
          ].map(([label, key, type]) => (
            <TextField
              key={key}
              label={label}
              type={type}
              value={fields[key]}
              onChange={(value) => setField(key, value)}
            />
          ))}
        </>
      )}
      <label className={labelClass}>
        Soporte privado
        <input required type="file" accept="application/pdf,image/*" onChange={(event) => setFile(event.target.files?.[0] ?? null)} className={inputClass} />
      </label>
      <FormActions saving={saving} onCancel={onCancel} />
    </form>
  );
}

function EntrySelect({
  label,
  value,
  entries,
  onChange,
}: {
  label: string;
  value: string;
  entries: EntryOption[];
  onChange: (value: string) => void;
}) {
  return (
    <label className={labelClass}>
      {label}
      <select required value={value} onChange={(event) => onChange(event.target.value)} className={inputClass}>
        <option value="">Selecciona movimiento</option>
        {entries.map((entry) => (
          <option key={entry.id} value={entry.id}>
            {money(entry.amount)} · {entry.description}
          </option>
        ))}
      </select>
    </label>
  );
}

function TextField({
  label,
  type,
  value,
  onChange,
}: {
  label: string;
  type: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <label className={labelClass}>
      {label}
      <input required type={type} step={type === "number" ? "0.01" : undefined} value={value} onChange={(event) => onChange(event.target.value)} className={inputClass} />
    </label>
  );
}
