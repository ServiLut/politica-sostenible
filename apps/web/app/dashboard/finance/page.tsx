"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  Clock3,
  Download,
  Loader2,
  Plus,
  ReceiptText,
  RefreshCw,
  SlidersHorizontal,
  UploadCloud,
  WalletCards,
  X,
} from "lucide-react";
import { ApiError, apiDownload, apiRequest } from "@/lib/api-client";
import { uploadFileDirectlyWithClientDeclaredHash } from "@/lib/direct-storage-upload";
import { openPrivateResource } from "@/lib/private-storage";
import { useAuth } from "@/context/auth";
import type { BackendUserRole } from "@/types/saas-schema";
import { useAccessibleDialog } from "@/lib/use-accessible-dialog";
import { FinanceCloseoutPanel } from "@/components/finance/FinanceCloseoutPanel";

type EntryType = "INCOME" | "EXPENSE";
type FinanceStatus = "PENDING" | "APPROVED" | "REJECTED" | "REPORTED_CNE";
type FinanceReviewStatus = "APPROVED" | "REJECTED";
type FinanceReportScope = "CANDIDATE" | "POLITICAL_ORGANIZATION";
type CneCode =
  | "PUBLICIDAD_VALLAS"
  | "TRANSPORTE"
  | "SEDE_CAMPANA"
  | "ACTOS_PUBLICOS"
  | "OTROS";

interface FinancialEntry {
  id: string;
  type: EntryType;
  amount: string | number;
  date: string;
  cneCode: CneCode;
  description: string;
  vendorName: string;
  vendorTaxId: string;
  hasEvidence: boolean;
  hasCneReportEvidence: boolean;
  status: FinanceStatus;
  reportedByMe: boolean;
  reviewedAt: string | null;
  cneReportedAt: string | null;
  cneReportReference: string | null;
  createdAt: string;
}

interface FinanceSummary {
  totalExpenses: number;
  totalIncome: number;
  balance: number;
  limitsConfigured?: boolean;
  maxTotalBudget?: number | null;
  maxPublicityLimit?: number | null;
  remainingBudget?: number | null;
  compliance?: FinanceComplianceSummary;
}

interface FinanceComplianceReadiness {
  ready: boolean;
  missingFields: string[];
  invalidFields: string[];
}

interface FinanceComplianceSummary extends FinanceComplianceReadiness {
  electionName: string | null;
  electionDate: string | null;
  reportScope: FinanceReportScope | null;
  officialLimitsReference: string | null;
  officialLimitsUrl: string | null;
  reportDeadline: string | null;
  financialManagerConfigured: boolean;
  accountantConfigured: boolean;
  uniqueAccountBank: string | null;
  uniqueAccountMasked: string | null;
  cuentasClarasConfigured: boolean;
}

interface FinanceSettings {
  maxTotalBudget: number;
  maxPublicityLimit: number;
  electionName: string | null;
  electionDate: string | null;
  reportScope: FinanceReportScope | null;
  officialLimitsReference: string | null;
  officialLimitsUrl: string | null;
  reportDeadline: string | null;
  financialManagerName: string | null;
  financialManagerDocumentMasked: string | null;
  accountantName: string | null;
  accountantDocumentMasked: string | null;
  uniqueAccountBank: string | null;
  uniqueAccountLastFour: string | null;
  cuentasClarasCode: string | null;
  readiness: FinanceComplianceReadiness;
}

interface FinanceSettingsResponse {
  configured: boolean;
  readiness: FinanceComplianceReadiness;
  settings: FinanceSettings | null;
}

const FINANCE_WRITE_ROLES = new Set<BackendUserRole>([
  "ADMIN",
  "CAMPAIGN_MANAGER",
  "FINANCE_MANAGER",
]);

const FINANCE_REVIEW_ROLES = new Set<BackendUserRole>([
  "ADMIN",
  "FINANCE_MANAGER",
  "COMPLIANCE_OFFICER",
]);

const FINANCE_EVIDENCE_READ_ROLES = new Set<BackendUserRole>([
  "ADMIN",
  "CAMPAIGN_MANAGER",
  "FINANCE_MANAGER",
  "COMPLIANCE_OFFICER",
  "AUDITOR",
]);

const INTERNAL_FINANCE_CATEGORIES: Array<{
  value: CneCode;
  label: string;
}> = [
  { value: "PUBLICIDAD_VALLAS", label: "Publicidad y vallas" },
  { value: "TRANSPORTE", label: "Transporte" },
  { value: "SEDE_CAMPANA", label: "Sede de campaña" },
  { value: "ACTOS_PUBLICOS", label: "Actos públicos" },
  { value: "OTROS", label: "Otros" },
];

const EMPTY_FORM = {
  type: "EXPENSE" as EntryType,
  amount: "",
  date: new Date().toISOString().slice(0, 10),
  cneCode: "OTROS" as CneCode,
  description: "",
  vendorName: "",
  vendorTaxId: "",
};

const EMPTY_SETTINGS_FORM = {
  maxTotalBudget: "",
  maxPublicityLimit: "",
  electionName: "",
  electionDate: "",
  reportScope: "CANDIDATE" as FinanceReportScope,
  officialLimitsReference: "",
  officialLimitsUrl: "",
  reportDeadline: "",
  financialManagerName: "",
  financialManagerDocument: "",
  accountantName: "",
  accountantDocument: "",
  uniqueAccountBank: "",
  uniqueAccountLastFour: "",
  cuentasClarasCode: "",
};

const COMPLIANCE_FIELD_LABELS: Record<string, string> = {
  settings: "expediente financiero",
  maxTotalBudget: "tope total",
  maxPublicityLimit: "tope de publicidad exterior",
  electionName: "nombre de la elección",
  electionDate: "fecha de la elección",
  reportScope: "alcance del informe",
  officialLimitsReference: "resolución o acto oficial de topes",
  officialLimitsUrl: "enlace oficial de topes",
  reportDeadline: "fecha límite del informe",
  financialManagerName: "responsable financiero o gerente",
  financialManagerDocument: "documento del responsable financiero",
  accountantName: "contador",
  accountantDocument: "documento del contador",
  uniqueAccountBank: "banco de la cuenta única",
  uniqueAccountLastFour: "últimos cuatro dígitos de la cuenta única",
  cuentasClarasCode: "código de Cuentas Claras",
};

const STATUS_LABEL: Record<FinanceStatus, string> = {
  PENDING: "Pendiente",
  APPROVED: "Aprobado",
  REJECTED: "Rechazado",
  REPORTED_CNE: "Referencia externa declarada",
};

function formatCop(value: number) {
  return new Intl.NumberFormat("es-CO", {
    style: "currency",
    currency: "COP",
    maximumFractionDigits: 0,
  }).format(value);
}

function formatUtcCalendarDate(value: string) {
  return new Date(value).toLocaleDateString("es-CO", { timeZone: "UTC" });
}

export default function FinancePage() {
  const { user } = useAuth();
  const canWrite = user !== null && FINANCE_WRITE_ROLES.has(user.backendRole);
  const canReview = user !== null && FINANCE_REVIEW_ROLES.has(user.backendRole);
  const canReadEvidence =
    user !== null && FINANCE_EVIDENCE_READ_ROLES.has(user.backendRole);
  const [entries, setEntries] = useState<FinancialEntry[]>([]);
  const [summary, setSummary] = useState<FinanceSummary>({
    totalExpenses: 0,
    totalIncome: 0,
    balance: 0,
  });
  const [loading, setLoading] = useState(true);
  const [hasLoadedFinance, setHasLoadedFinance] = useState(false);
  const [saving, setSaving] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [isOpen, setIsOpen] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [reviewEntry, setReviewEntry] = useState<FinancialEntry | null>(null);
  const [reviewStatus, setReviewStatus] =
    useState<FinanceReviewStatus>("APPROVED");
  const [reviewReason, setReviewReason] = useState("");
  const [reportEntry, setReportEntry] = useState<FinancialEntry | null>(null);
  const [externalReference, setExternalReference] = useState("");
  const [cneReportEvidenceFile, setCneReportEvidenceFile] =
    useState<File | null>(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [settingsForm, setSettingsForm] = useState(EMPTY_SETTINGS_FORM);
  const [protectedSettings, setProtectedSettings] =
    useState<FinanceSettings | null>(null);
  const [evidenceFile, setEvidenceFile] = useState<File | null>(null);
  const [downloadingEntryId, setDownloadingEntryId] = useState<string | null>(
    null,
  );
  const entryDialogRef = useRef<HTMLDivElement>(null);
  const entryTitleRef = useRef<HTMLHeadingElement>(null);
  const reviewDialogRef = useRef<HTMLDivElement>(null);
  const reviewTitleRef = useRef<HTMLHeadingElement>(null);
  const reportDialogRef = useRef<HTMLDivElement>(null);
  const reportTitleRef = useRef<HTMLHeadingElement>(null);
  const settingsDialogRef = useRef<HTMLDivElement>(null);
  const settingsTitleRef = useRef<HTMLHeadingElement>(null);

  useAccessibleDialog({
    open: isOpen,
    containerRef: entryDialogRef,
    initialFocusRef: entryTitleRef,
    onClose: () => {
      if (!saving) {
        setIsOpen(false);
        setError(null);
      }
    },
    closeOnEscape: !saving,
  });
  useAccessibleDialog({
    open: reviewEntry !== null,
    containerRef: reviewDialogRef,
    initialFocusRef: reviewTitleRef,
    onClose: closeReview,
    closeOnEscape: !saving,
  });
  useAccessibleDialog({
    open: reportEntry !== null,
    containerRef: reportDialogRef,
    initialFocusRef: reportTitleRef,
    onClose: closeExternalReport,
    closeOnEscape: !saving,
  });
  useAccessibleDialog({
    open: isSettingsOpen,
    containerRef: settingsDialogRef,
    initialFocusRef: settingsTitleRef,
    onClose: () => {
      if (!saving) {
        setIsSettingsOpen(false);
        setError(null);
      }
    },
    closeOnEscape: !saving,
  });

  const loadFinance = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const [loadedEntries, loadedSummary, loadedSettings] = await Promise.all([
        apiRequest<FinancialEntry[]>("finance"),
        apiRequest<FinanceSummary>("finance/summary"),
        canWrite
          ? apiRequest<FinanceSettingsResponse>("finance/settings")
          : Promise.resolve(null),
      ]);
      setEntries(loadedEntries);
      setSummary(loadedSummary);
      setHasLoadedFinance(true);
      const settings = loadedSettings?.settings ?? null;
      setProtectedSettings(settings);
      setSettingsForm({
        ...EMPTY_SETTINGS_FORM,
        maxTotalBudget:
          settings?.maxTotalBudget.toString() ??
          loadedSummary.maxTotalBudget?.toString() ??
          "",
        maxPublicityLimit:
          settings?.maxPublicityLimit.toString() ??
          loadedSummary.maxPublicityLimit?.toString() ??
          "",
        electionName: settings?.electionName ?? "",
        electionDate: settings?.electionDate?.slice(0, 10) ?? "",
        reportScope: settings?.reportScope ?? "CANDIDATE",
        officialLimitsReference: settings?.officialLimitsReference ?? "",
        officialLimitsUrl: settings?.officialLimitsUrl ?? "",
        reportDeadline: settings?.reportDeadline?.slice(0, 10) ?? "",
        financialManagerName: settings?.financialManagerName ?? "",
        accountantName: settings?.accountantName ?? "",
        uniqueAccountBank: settings?.uniqueAccountBank ?? "",
        uniqueAccountLastFour: settings?.uniqueAccountLastFour ?? "",
        cuentasClarasCode: settings?.cuentasClarasCode ?? "",
      });
    } catch (requestError) {
      setLoadError(
        requestError instanceof ApiError
          ? requestError.message
          : "No fue posible consultar las finanzas de la campaña.",
      );
    } finally {
      setLoading(false);
    }
  }, [canWrite]);

  useEffect(() => {
    void loadFinance();
  }, [loadFinance]);

  const overduePending = useMemo(() => {
    const sevenDaysAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
    return entries.filter(
      (entry) =>
        entry.status === "PENDING" &&
        new Date(entry.date).getTime() < sevenDaysAgo,
    ).length;
  }, [entries]);
  const complianceReady = summary.compliance?.ready === true;
  const missingComplianceLabels = (summary.compliance?.missingFields ?? []).map(
    (field) => COMPLIANCE_FIELD_LABELS[field] ?? field,
  );

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setError(null);
    try {
      const evidence = evidenceFile
        ? await uploadFileDirectlyWithClientDeclaredHash(
            evidenceFile,
            "finance",
          )
        : null;
      await apiRequest<FinancialEntry>("finance", {
        method: "POST",
        body: JSON.stringify({
          ...form,
          amount: Number(form.amount),
          ...(evidence ? { evidenceUrl: evidence.path } : {}),
        }),
      });
      setForm(EMPTY_FORM);
      setEvidenceFile(null);
      setIsOpen(false);
      setNotice("Movimiento registrado y enviado a revisión.");
      window.setTimeout(() => setNotice(null), 4000);
      await loadFinance();
    } catch (requestError) {
      setError(
        requestError instanceof ApiError
          ? requestError.message
          : "No fue posible registrar el movimiento.",
      );
    } finally {
      setSaving(false);
    }
  }

  async function handleSettingsSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (
      new Date(settingsForm.reportDeadline).getTime() <=
      new Date(settingsForm.electionDate).getTime()
    ) {
      setError("La fecha límite del informe debe ser posterior a la elección.");
      return;
    }
    try {
      const sourceUrl = new URL(settingsForm.officialLimitsUrl);
      if (sourceUrl.protocol !== "https:") throw new Error("insecure URL");
    } catch {
      setError("El enlace oficial de topes debe ser una URL HTTPS válida.");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await apiRequest("finance/settings", {
        method: "PUT",
        body: JSON.stringify({
          maxTotalBudget: Number(settingsForm.maxTotalBudget),
          maxPublicityLimit: Number(settingsForm.maxPublicityLimit),
          electionName: settingsForm.electionName.trim(),
          electionDate: settingsForm.electionDate,
          reportScope: settingsForm.reportScope,
          officialLimitsReference: settingsForm.officialLimitsReference.trim(),
          officialLimitsUrl: settingsForm.officialLimitsUrl.trim(),
          reportDeadline: settingsForm.reportDeadline,
          financialManagerName: settingsForm.financialManagerName.trim(),
          financialManagerDocument:
            settingsForm.financialManagerDocument.trim(),
          accountantName: settingsForm.accountantName.trim(),
          accountantDocument: settingsForm.accountantDocument.trim(),
          uniqueAccountBank: settingsForm.uniqueAccountBank.trim(),
          uniqueAccountLastFour: settingsForm.uniqueAccountLastFour.trim(),
          cuentasClarasCode: settingsForm.cuentasClarasCode.trim(),
        }),
      });
      setIsSettingsOpen(false);
      setNotice("Expediente financiero actualizado y auditado.");
      window.setTimeout(() => setNotice(null), 4000);
      await loadFinance();
    } catch (requestError) {
      setError(
        requestError instanceof ApiError
          ? requestError.message
          : "No fue posible guardar el expediente financiero.",
      );
    } finally {
      setSaving(false);
    }
  }

  function openReview(entry: FinancialEntry) {
    setReviewEntry(entry);
    setReviewStatus(entry.hasEvidence ? "APPROVED" : "REJECTED");
    setReviewReason("");
    setError(null);
  }

  async function handleEvidenceOpen(entry: FinancialEntry) {
    setDownloadingEntryId(entry.id);
    setError(null);
    try {
      await openPrivateResource("finance", entry.id);
    } catch (requestError) {
      setError(
        requestError instanceof ApiError || requestError instanceof Error
          ? requestError.message
          : "No fue posible abrir el soporte privado.",
      );
    } finally {
      setDownloadingEntryId(null);
    }
  }

  function closeReview() {
    setReviewEntry(null);
    setReviewStatus("APPROVED");
    setReviewReason("");
    setError(null);
  }

  async function handleReviewSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!reviewEntry) return;

    if (reviewStatus === "APPROVED" && !reviewEntry.hasEvidence) {
      setError(
        "Para aprobar el movimiento primero debe existir un soporte adjunto y vinculado.",
      );
      return;
    }

    const normalizedReason = reviewReason.trim();
    if (normalizedReason.length < 10 || normalizedReason.length > 500) {
      setError("El motivo debe tener entre 10 y 500 caracteres.");
      return;
    }

    setSaving(true);
    setError(null);
    try {
      await apiRequest<FinancialEntry>(`finance/${reviewEntry.id}/review`, {
        method: "PATCH",
        body: JSON.stringify({
          status: reviewStatus,
          reviewReason: normalizedReason,
        }),
      });
      const resultLabel =
        reviewStatus === "APPROVED" ? "aprobado" : "rechazado";
      closeReview();
      setNotice(`Movimiento ${resultLabel} con revisión independiente.`);
      window.setTimeout(() => setNotice(null), 4000);
      await loadFinance();
    } catch (requestError) {
      setError(
        requestError instanceof ApiError
          ? requestError.message
          : "No fue posible completar la revisión.",
      );
    } finally {
      setSaving(false);
    }
  }

  function openExternalReport(entry: FinancialEntry) {
    setReportEntry(entry);
    setExternalReference("");
    setCneReportEvidenceFile(null);
    setError(null);
  }

  function closeExternalReport() {
    setReportEntry(null);
    setExternalReference("");
    setCneReportEvidenceFile(null);
    setError(null);
  }

  async function handleExternalReportSubmit(
    event: React.FormEvent<HTMLFormElement>,
  ) {
    event.preventDefault();
    if (!reportEntry) return;

    const normalizedReference = externalReference.trim();
    if (normalizedReference.length < 5 || normalizedReference.length > 120) {
      setError("La referencia debe tener entre 5 y 120 caracteres.");
      return;
    }
    if (!cneReportEvidenceFile) {
      setError("Adjunta el soporte privado de la referencia externa.");
      return;
    }

    setSaving(true);
    setError(null);
    try {
      const evidence = await uploadFileDirectlyWithClientDeclaredHash(
        cneReportEvidenceFile,
        "finance",
      );
      await apiRequest<FinancialEntry>(`finance/${reportEntry.id}/cne-report`, {
        method: "PATCH",
        body: JSON.stringify({
          externalReference: normalizedReference,
          cneReportEvidenceUrl: evidence.path,
        }),
      });
      closeExternalReport();
      setNotice(
        "Referencia externa declarada y auditada; la plataforma no la verifica.",
      );
      window.setTimeout(() => setNotice(null), 4000);
      await loadFinance();
    } catch (requestError) {
      setError(
        requestError instanceof ApiError
          ? requestError.message
          : "No fue posible guardar la anotación externa.",
      );
    } finally {
      setSaving(false);
    }
  }

  async function handleDownloadCneReviewDraft() {
    setError(null);
    try {
      const draft = await apiDownload("finance/cne-review-draft");
      const objectUrl = URL.createObjectURL(draft);
      const link = document.createElement("a");
      link.href = objectUrl;
      link.download = `borrador-interno-revision-cne-${new Date().toISOString().slice(0, 10)}.csv`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(objectUrl);
    } catch (requestError) {
      setError(
        requestError instanceof ApiError
          ? requestError.message
          : "No fue posible preparar el borrador interno para revisión CNE.",
      );
    }
  }

  return (
    <div className="space-y-8">
      {notice && (
        <div className="fixed right-6 top-6 z-50 flex items-center gap-3 rounded-2xl bg-emerald-600 px-5 py-4 text-sm font-bold text-white shadow-2xl">
          <CheckCircle2 size={18} /> {notice}
        </div>
      )}

      <header className="flex flex-col justify-between gap-5 lg:flex-row lg:items-end">
        <div className="space-y-2">
          <div className="inline-flex items-center gap-2 rounded-full bg-blue-50 px-3 py-1 text-[10px] font-black uppercase tracking-[0.18em] text-blue-700">
            <ReceiptText size={13} /> Preparación y control contable
          </div>
          <h1 className="text-4xl font-black tracking-tight text-slate-950">
            Finanzas de campaña
          </h1>
          <p className="max-w-2xl text-sm leading-6 text-slate-500">
            Registra hechos económicos con soporte, responsable y estado de
            revisión. La plataforma prepara la información; el reporte oficial
            sigue realizándose ante el CNE.
          </p>
        </div>
        <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap">
          <button
            type="button"
            onClick={() => void handleDownloadCneReviewDraft()}
            disabled={!hasLoadedFinance || !complianceReady}
            title={
              complianceReady
                ? undefined
                : "Completa el expediente financiero antes de exportar"
            }
            className="inline-flex items-center gap-2 rounded-2xl border border-slate-200 bg-white px-5 py-3 text-xs font-black uppercase tracking-wider text-slate-600 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <Download size={15} /> Borrador interno para revisión CNE
          </button>
          <button
            type="button"
            onClick={() => void loadFinance()}
            className="inline-flex items-center gap-2 rounded-2xl border border-slate-200 bg-white px-5 py-3 text-xs font-black uppercase tracking-wider text-slate-600 hover:bg-slate-50"
          >
            <RefreshCw size={15} /> Actualizar
          </button>
          {canWrite && (
            <button
              type="button"
              onClick={() => setIsOpen(true)}
              disabled={!complianceReady}
              title={
                complianceReady
                  ? undefined
                  : "Completa el expediente financiero antes de registrar movimientos"
              }
              className="inline-flex items-center gap-2 rounded-2xl bg-slate-950 px-6 py-3 text-xs font-black uppercase tracking-wider text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <Plus size={16} /> Registrar movimiento
            </button>
          )}
        </div>
      </header>

      {loadError && (
        <div
          role="alert"
          className="flex flex-col items-start gap-3 rounded-2xl border border-red-200 bg-red-50 px-5 py-4 text-sm font-semibold text-red-700 sm:flex-row sm:items-center sm:justify-between"
        >
          <div>
            <p>{loadError}</p>
            <p className="mt-1 text-xs">
              {hasLoadedFinance
                ? "Se conserva el último corte financiero disponible."
                : "Los valores financieros no están disponibles; no se sustituyeron por ceros."}
            </p>
          </div>
          <button
            type="button"
            onClick={() => void loadFinance()}
            disabled={loading}
            className="inline-flex min-h-10 shrink-0 items-center gap-2 rounded-xl bg-red-700 px-4 text-xs font-black uppercase tracking-wider text-white disabled:opacity-50"
          >
            <RefreshCw aria-hidden="true" size={15} /> Reintentar
          </button>
        </div>
      )}

      {error && !isOpen && !isSettingsOpen && !reviewEntry && !reportEntry && (
        <div
          role="alert"
          className="rounded-2xl border border-red-200 bg-red-50 px-5 py-4 text-sm font-semibold text-red-700"
        >
          {error}
        </div>
      )}

      {overduePending > 0 && (
        <div className="flex items-start gap-4 rounded-2xl border border-amber-200 bg-amber-50 p-5 text-amber-900">
          <AlertTriangle className="mt-0.5 shrink-0" size={20} />
          <div>
            <p className="font-black">
              {overduePending} movimientos requieren atención semanal
            </p>
            <p className="mt-1 text-sm leading-6 text-amber-800">
              Revisa soportes y clasificación antes de que finalice el periodo
              de registro aplicable.
            </p>
          </div>
        </div>
      )}

      {!loading && hasLoadedFinance && !complianceReady && (
        <div className="flex items-start gap-4 rounded-2xl border border-blue-200 bg-blue-50 p-5 text-blue-950">
          <AlertTriangle className="mt-0.5 shrink-0" size={20} />
          <div>
            <p className="font-black">
              Completa el expediente financiero electoral
            </p>
            <p className="mt-1 text-sm leading-6 text-blue-800">
              Para evitar registros sin contexto legal, el backend bloquea
              movimientos y borradores mientras falten la elección, fuente de
              topes, responsables, cuenta única o plazo del informe.
            </p>
            {missingComplianceLabels.length > 0 && (
              <p className="mt-2 text-xs font-semibold leading-5 text-blue-900">
                Pendiente: {missingComplianceLabels.join(", ")}.
              </p>
            )}
            {(summary.compliance?.invalidFields.length ?? 0) > 0 && (
              <p className="mt-2 text-xs font-semibold leading-5 text-red-800">
                Corrige el enlace oficial o la relación entre fecha electoral y
                fecha límite.
              </p>
            )}
            {canWrite && (
              <button
                type="button"
                onClick={() => {
                  setError(null);
                  setIsSettingsOpen(true);
                }}
                className="mt-4 inline-flex items-center gap-2 rounded-xl bg-blue-700 px-4 py-2 text-xs font-black uppercase tracking-wider text-white"
              >
                <SlidersHorizontal size={15} /> Configurar expediente
              </button>
            )}
          </div>
        </div>
      )}

      {!loading && hasLoadedFinance && complianceReady && (
        <section className="flex flex-col gap-4 rounded-[2rem] border border-emerald-200 bg-white p-6 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-[10px] font-black uppercase tracking-[0.18em] text-emerald-700">
              Expediente habilitado para registro interno
            </p>
            <p className="mt-2 text-sm font-bold text-slate-800">
              {summary.compliance?.electionName}
              {summary.compliance?.electionDate
                ? ` · ${formatUtcCalendarDate(summary.compliance.electionDate)}`
                : ""}{" "}
              · Informe de{" "}
              {summary.compliance?.reportScope === "CANDIDATE"
                ? "candidato"
                : "organización política"}
            </p>
            <p className="mt-1 text-xs text-slate-500">
              Topes: total {formatCop(summary.maxTotalBudget ?? 0)} · publicidad
              exterior {formatCop(summary.maxPublicityLimit ?? 0)} · disponible{" "}
              {formatCop(summary.remainingBudget ?? 0)}
            </p>
            <p className="mt-1 text-xs text-slate-500">
              Fecha límite registrada:{" "}
              {summary.compliance?.reportDeadline
                ? formatUtcCalendarDate(summary.compliance.reportDeadline)
                : "—"}
              {summary.compliance?.uniqueAccountBank &&
              summary.compliance.uniqueAccountMasked
                ? ` · ${summary.compliance.uniqueAccountBank} ${summary.compliance.uniqueAccountMasked}`
                : ""}
            </p>
            {summary.compliance?.officialLimitsUrl && (
              <a
                href={summary.compliance.officialLimitsUrl}
                target="_blank"
                rel="noreferrer"
                className="mt-2 inline-block text-xs font-bold text-blue-700 underline underline-offset-2"
              >
                {summary.compliance.officialLimitsReference ??
                  "Consultar fuente oficial de topes"}
              </a>
            )}
            <div className="mt-3 flex flex-wrap gap-2 text-[10px] font-black uppercase tracking-wider text-emerald-800">
              <span className="rounded-full bg-emerald-50 px-3 py-1">
                Responsable confirmado
              </span>
              <span className="rounded-full bg-emerald-50 px-3 py-1">
                Contador confirmado
              </span>
              <span className="rounded-full bg-emerald-50 px-3 py-1">
                Cuentas Claras identificado
              </span>
            </div>
          </div>
          {canWrite && (
            <button
              type="button"
              onClick={() => {
                setError(null);
                setIsSettingsOpen(true);
              }}
              className="inline-flex items-center justify-center gap-2 rounded-2xl border border-slate-200 px-5 py-3 text-xs font-black uppercase tracking-wider text-slate-700"
            >
              <SlidersHorizontal size={15} /> Editar expediente
            </button>
          )}
        </section>
      )}

      {hasLoadedFinance && (
        <FinanceCloseoutPanel
          financialEntries={entries}
          complianceReady={complianceReady}
        />
      )}

      <section className="grid gap-5 md:grid-cols-3">
        <article className="rounded-[2rem] bg-slate-950 p-7 text-white shadow-xl">
          <WalletCards className="mb-5 text-blue-300" />
          <p className="text-[10px] font-black uppercase tracking-[0.18em] text-slate-400">
            Balance registrado
          </p>
          <p className="mt-2 text-3xl font-black tracking-tight">
            {hasLoadedFinance ? formatCop(summary.balance) : "—"}
          </p>
        </article>
        <article className="rounded-[2rem] border border-slate-200 bg-white p-7">
          <p className="text-[10px] font-black uppercase tracking-[0.18em] text-slate-400">
            Ingresos
          </p>
          <p className="mt-3 text-3xl font-black tracking-tight text-emerald-700">
            {hasLoadedFinance ? formatCop(summary.totalIncome) : "—"}
          </p>
        </article>
        <article className="rounded-[2rem] border border-slate-200 bg-white p-7">
          <p className="text-[10px] font-black uppercase tracking-[0.18em] text-slate-400">
            Gastos
          </p>
          <p className="mt-3 text-3xl font-black tracking-tight text-red-700">
            {hasLoadedFinance ? formatCop(summary.totalExpenses) : "—"}
          </p>
        </article>
      </section>

      <section className="overflow-hidden rounded-[2rem] border border-slate-200 bg-white shadow-sm">
        <div className="flex items-center justify-between border-b border-slate-100 bg-slate-50/60 p-5">
          <div>
            <h2 className="font-black text-slate-900">Libro cronológico</h2>
            <p className="mt-1 text-xs text-slate-500">
              {entries.length} movimientos del tenant autenticado
            </p>
          </div>
          <Clock3 className="text-slate-400" size={20} />
        </div>

        {loading && !hasLoadedFinance ? (
          <div className="flex items-center justify-center gap-3 py-20 text-sm font-bold text-slate-400">
            <Loader2 className="animate-spin" size={20} /> Consultando la API
            segura…
          </div>
        ) : loadError && !hasLoadedFinance ? (
          <div className="px-6 py-20 text-center">
            <AlertTriangle className="mx-auto mb-4 text-amber-500" size={42} />
            <h3 className="font-black text-slate-900">
              Libro financiero no disponible
            </h3>
            <p className="mt-2 text-sm text-slate-500">
              Reintenta la consulta antes de concluir que no existen
              movimientos.
            </p>
          </div>
        ) : entries.length === 0 ? (
          <div className="px-6 py-20 text-center">
            <ReceiptText className="mx-auto mb-4 text-slate-300" size={42} />
            <h3 className="font-black text-slate-900">
              No hay movimientos registrados
            </h3>
            <p className="mt-2 text-sm text-slate-500">
              El tablero no inventa datos de ejemplo: los valores aparecerán al
              registrarlos.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[980px] text-left">
              <thead className="text-[10px] font-black uppercase tracking-[0.16em] text-slate-400">
                <tr>
                  <th className="px-6 py-4">Fecha / concepto</th>
                  <th className="px-6 py-4">Tercero</th>
                  <th className="px-6 py-4">Categoría interna</th>
                  <th className="px-6 py-4">Estado</th>
                  <th className="px-6 py-4 text-right">Monto</th>
                  <th className="px-6 py-4 text-right">Revisión</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {entries.map((entry) => (
                  <tr key={entry.id} className="hover:bg-slate-50/70">
                    <td className="px-6 py-5">
                      <p className="text-sm font-black text-slate-900">
                        {entry.description}
                      </p>
                      <p className="mt-1 text-xs text-slate-400">
                        {new Date(entry.date).toLocaleDateString("es-CO")}
                      </p>
                    </td>
                    <td className="px-6 py-5">
                      <p className="text-xs font-bold text-slate-600">
                        {entry.vendorName}
                      </p>
                      <p className="mt-1 text-[10px] text-slate-400">
                        NIT/ID {entry.vendorTaxId}
                      </p>
                    </td>
                    <td className="px-6 py-5 text-xs font-bold text-slate-600">
                      {INTERNAL_FINANCE_CATEGORIES.find(
                        (code) => code.value === entry.cneCode,
                      )?.label ?? entry.cneCode}
                    </td>
                    <td className="px-6 py-5">
                      <span className="rounded-full bg-slate-100 px-3 py-1 text-[10px] font-black uppercase tracking-wider text-slate-600">
                        {STATUS_LABEL[entry.status]}
                      </span>
                      {entry.status === "REPORTED_CNE" &&
                        entry.cneReportReference && (
                          <div className="mt-2 max-w-[220px] text-[10px] font-bold">
                            <p className="break-words text-blue-800">
                              Referencia declarada {entry.cneReportReference}
                            </p>
                            <p
                              className={
                                entry.hasCneReportEvidence
                                  ? "mt-1 text-emerald-700"
                                  : "mt-1 text-amber-700"
                              }
                            >
                              {entry.hasCneReportEvidence
                                ? "Soporte privado adjunto"
                                : "Sin soporte digital (registro legado)"}
                            </p>
                          </div>
                        )}
                      {entry.hasEvidence && (
                        <div className="mt-2 flex flex-col items-start gap-1.5">
                          <span className="text-[10px] font-bold text-emerald-700">
                            Soporte privado adjunto
                          </span>
                          {canReadEvidence && (
                            <button
                              type="button"
                              disabled={downloadingEntryId === entry.id}
                              onClick={() => void handleEvidenceOpen(entry)}
                              className="inline-flex items-center gap-1 rounded-lg border border-emerald-200 bg-emerald-50 px-2 py-1 text-[10px] font-black text-emerald-800 hover:bg-emerald-100 disabled:opacity-60"
                            >
                              {downloadingEntryId === entry.id ? (
                                <Loader2 className="animate-spin" size={11} />
                              ) : (
                                <Download size={11} />
                              )}
                              Ver soporte
                            </button>
                          )}
                        </div>
                      )}
                    </td>
                    <td
                      className={`px-6 py-5 text-right text-sm font-black ${entry.type === "INCOME" ? "text-emerald-700" : "text-red-700"}`}
                    >
                      {entry.type === "INCOME" ? "+" : "−"}
                      {formatCop(Number(entry.amount))}
                    </td>
                    <td className="px-6 py-5 text-right">
                      {canReview &&
                      entry.status === "PENDING" &&
                      !entry.reportedByMe ? (
                        <button
                          type="button"
                          aria-label={`Revisar ${entry.description}`}
                          onClick={() => openReview(entry)}
                          className="inline-flex items-center justify-center rounded-xl bg-blue-700 px-4 py-2 text-[10px] font-black uppercase tracking-wider text-white hover:bg-blue-800"
                        >
                          Revisar
                        </button>
                      ) : canReview &&
                        entry.status === "PENDING" &&
                        entry.reportedByMe ? (
                        <span className="text-[10px] font-bold text-slate-400">
                          Registrado por ti
                        </span>
                      ) : canReview && entry.status === "APPROVED" ? (
                        <button
                          type="button"
                          aria-label={`Anotar referencia externa declarada de ${entry.description}`}
                          onClick={() => openExternalReport(entry)}
                          className="inline-flex items-center justify-center rounded-xl bg-slate-950 px-4 py-2 text-[10px] font-black uppercase tracking-wider text-white hover:bg-blue-800"
                        >
                          Anotar referencia
                        </button>
                      ) : (
                        <span aria-hidden="true" className="text-slate-300">
                          —
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {isOpen && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-slate-950/70 p-4 backdrop-blur-sm">
          <div
            ref={entryDialogRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby="finance-entry-title"
            className="max-h-[92vh] w-full max-w-2xl overflow-y-auto rounded-[2rem] bg-white shadow-2xl"
          >
            <div className="flex items-start justify-between border-b border-slate-100 p-7">
              <div>
                <h2
                  ref={entryTitleRef}
                  id="finance-entry-title"
                  tabIndex={-1}
                  className="text-2xl font-black text-slate-950"
                >
                  Registrar hecho económico
                </h2>
                <p className="mt-1 text-sm text-slate-500">
                  Quedará pendiente de revisión y aprobación.
                </p>
              </div>
              <button
                type="button"
                aria-label="Cerrar registro de movimiento"
                onClick={() => {
                  setIsOpen(false);
                  setError(null);
                }}
                className="rounded-xl p-2 text-slate-400 hover:bg-slate-100"
              >
                <X aria-hidden="true" />
              </button>
            </div>
            <form onSubmit={handleSubmit} className="space-y-6 p-7">
              {error && (
                <div
                  role="alert"
                  className="rounded-2xl border border-red-200 bg-red-50 px-5 py-4 text-sm font-semibold text-red-700"
                >
                  {error}
                </div>
              )}
              <div className="grid gap-5 md:grid-cols-2">
                <label className="space-y-2 text-xs font-black uppercase tracking-wider text-slate-500">
                  Tipo
                  <select
                    value={form.type}
                    onChange={(event) =>
                      setForm({
                        ...form,
                        type: event.target.value as EntryType,
                      })
                    }
                    className="w-full rounded-2xl border border-slate-200 px-4 py-3 text-sm font-semibold normal-case tracking-normal text-slate-900"
                  >
                    <option value="EXPENSE">Gasto</option>
                    <option value="INCOME">Ingreso</option>
                  </select>
                </label>
                <label className="space-y-2 text-xs font-black uppercase tracking-wider text-slate-500">
                  Fecha
                  <input
                    required
                    type="date"
                    value={form.date}
                    onChange={(event) =>
                      setForm({ ...form, date: event.target.value })
                    }
                    className="w-full rounded-2xl border border-slate-200 px-4 py-3 text-sm font-semibold normal-case tracking-normal text-slate-900"
                  />
                </label>
                <label className="space-y-2 text-xs font-black uppercase tracking-wider text-slate-500">
                  Monto COP
                  <input
                    required
                    type="number"
                    min="1"
                    step="1"
                    value={form.amount}
                    onChange={(event) =>
                      setForm({ ...form, amount: event.target.value })
                    }
                    className="w-full rounded-2xl border border-slate-200 px-4 py-3 text-sm font-semibold normal-case tracking-normal text-slate-900"
                  />
                </label>
                <label className="space-y-2 text-xs font-black uppercase tracking-wider text-slate-500">
                  Categoría operativa
                  <select
                    value={form.cneCode}
                    onChange={(event) =>
                      setForm({
                        ...form,
                        cneCode: event.target.value as CneCode,
                      })
                    }
                    className="w-full rounded-2xl border border-slate-200 px-4 py-3 text-sm font-semibold normal-case tracking-normal text-slate-900"
                  >
                    {INTERNAL_FINANCE_CATEGORIES.map((code) => (
                      <option key={code.value} value={code.value}>
                        {code.label}
                      </option>
                    ))}
                  </select>
                  <span className="block text-[10px] font-semibold normal-case tracking-normal text-slate-400">
                    Clasificación operativa interna; no equivale a un código
                    oficial de Cuentas Claras.
                  </span>
                </label>
                <label className="space-y-2 text-xs font-black uppercase tracking-wider text-slate-500 md:col-span-2">
                  Concepto
                  <input
                    required
                    value={form.description}
                    onChange={(event) =>
                      setForm({ ...form, description: event.target.value })
                    }
                    className="w-full rounded-2xl border border-slate-200 px-4 py-3 text-sm font-semibold normal-case tracking-normal text-slate-900"
                  />
                </label>
                <label className="space-y-2 text-xs font-black uppercase tracking-wider text-slate-500">
                  Tercero / aportante
                  <input
                    required
                    value={form.vendorName}
                    onChange={(event) =>
                      setForm({ ...form, vendorName: event.target.value })
                    }
                    className="w-full rounded-2xl border border-slate-200 px-4 py-3 text-sm font-semibold normal-case tracking-normal text-slate-900"
                  />
                </label>
                <label className="space-y-2 text-xs font-black uppercase tracking-wider text-slate-500">
                  NIT o documento
                  <input
                    required
                    value={form.vendorTaxId}
                    onChange={(event) =>
                      setForm({ ...form, vendorTaxId: event.target.value })
                    }
                    className="w-full rounded-2xl border border-slate-200 px-4 py-3 text-sm font-semibold normal-case tracking-normal text-slate-900"
                  />
                </label>
                <label className="space-y-2 text-xs font-black uppercase tracking-wider text-slate-500 md:col-span-2">
                  Soporte privado (opcional)
                  <span className="flex cursor-pointer items-center gap-3 rounded-2xl border border-dashed border-slate-300 bg-slate-50 px-4 py-4 text-sm font-semibold normal-case tracking-normal text-slate-700">
                    <UploadCloud size={20} className="text-blue-700" />
                    {evidenceFile?.name ??
                      "Seleccionar PDF, imagen, CSV o XLSX"}
                    <input
                      type="file"
                      accept=".pdf,.jpg,.jpeg,.png,.webp,.csv,.xlsx,application/pdf,image/jpeg,image/png,image/webp,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
                      className="sr-only"
                      onChange={(event) =>
                        setEvidenceFile(event.target.files?.[0] ?? null)
                      }
                    />
                  </span>
                  <span className="block text-[10px] font-semibold normal-case tracking-normal text-slate-400">
                    Máximo 20 MB. Se sube directo a Storage; NestJS nunca recibe
                    el binario.
                  </span>
                </label>
              </div>
              <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
                <button
                  type="button"
                  onClick={() => {
                    setIsOpen(false);
                    setError(null);
                  }}
                  className="rounded-2xl border border-slate-200 px-6 py-3 text-xs font-black uppercase tracking-wider text-slate-600"
                >
                  Cancelar
                </button>
                <button
                  disabled={saving}
                  type="submit"
                  className="inline-flex items-center justify-center gap-2 rounded-2xl bg-blue-700 px-7 py-3 text-xs font-black uppercase tracking-wider text-white disabled:opacity-60"
                >
                  {saving ? (
                    <Loader2 className="animate-spin" size={16} />
                  ) : (
                    <ReceiptText size={16} />
                  )}{" "}
                  Registrar para revisión
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {reviewEntry &&
        canReview &&
        reviewEntry.status === "PENDING" &&
        !reviewEntry.reportedByMe && (
          <div
            ref={reviewDialogRef}
            className="fixed inset-0 z-[80] flex items-center justify-center bg-slate-950/70 p-4 backdrop-blur-sm"
            role="dialog"
            aria-modal="true"
            aria-labelledby="finance-review-title"
          >
            <div className="w-full max-w-xl rounded-[2rem] bg-white shadow-2xl">
              <div className="flex items-start justify-between border-b border-slate-100 p-7">
                <div>
                  <p className="text-[10px] font-black uppercase tracking-[0.18em] text-blue-700">
                    Control de cuatro ojos
                  </p>
                  <h2
                    ref={reviewTitleRef}
                    tabIndex={-1}
                    id="finance-review-title"
                    className="mt-2 text-2xl font-black text-slate-950"
                  >
                    Revisar movimiento
                  </h2>
                  <p className="mt-2 text-sm leading-6 text-slate-500">
                    {reviewEntry.description}. La decisión quedará registrada en
                    la auditoría y no puede hacerla quien reportó el movimiento.
                  </p>
                </div>
                <button
                  type="button"
                  aria-label="Cerrar revisión"
                  disabled={saving}
                  onClick={closeReview}
                  className="rounded-xl p-2 text-slate-400 hover:bg-slate-100 disabled:opacity-50"
                >
                  <X />
                </button>
              </div>

              <form onSubmit={handleReviewSubmit} className="space-y-6 p-7">
                {error && (
                  <div
                    role="alert"
                    className="rounded-2xl border border-red-200 bg-red-50 px-5 py-4 text-sm font-semibold text-red-700"
                  >
                    {error}
                  </div>
                )}

                <fieldset>
                  <legend className="text-xs font-black uppercase tracking-wider text-slate-500">
                    Decisión
                  </legend>
                  <div className="mt-3 grid gap-3 sm:grid-cols-2">
                    <label
                      className={`flex items-start gap-3 rounded-2xl border p-4 ${
                        reviewEntry.hasEvidence
                          ? "cursor-pointer"
                          : "cursor-not-allowed opacity-60"
                      } ${
                        reviewStatus === "APPROVED"
                          ? "border-emerald-500 bg-emerald-50"
                          : "border-slate-200 bg-white"
                      }`}
                    >
                      <input
                        type="radio"
                        name="reviewStatus"
                        value="APPROVED"
                        checked={reviewStatus === "APPROVED"}
                        disabled={!reviewEntry.hasEvidence}
                        onChange={() => setReviewStatus("APPROVED")}
                        className="mt-1 accent-emerald-700"
                      />
                      <span>
                        <span className="block text-sm font-black text-slate-900">
                          Aprobar
                        </span>
                        <span className="mt-1 block text-xs leading-5 text-slate-500">
                          {reviewEntry.hasEvidence
                            ? "El soporte y la clasificación son consistentes."
                            : "No disponible: falta un soporte adjunto y vinculado."}
                        </span>
                      </span>
                    </label>
                    <label
                      className={`flex cursor-pointer items-start gap-3 rounded-2xl border p-4 ${
                        reviewStatus === "REJECTED"
                          ? "border-red-500 bg-red-50"
                          : "border-slate-200 bg-white"
                      }`}
                    >
                      <input
                        type="radio"
                        name="reviewStatus"
                        value="REJECTED"
                        checked={reviewStatus === "REJECTED"}
                        onChange={() => setReviewStatus("REJECTED")}
                        className="mt-1 accent-red-700"
                      />
                      <span>
                        <span className="block text-sm font-black text-slate-900">
                          Rechazar
                        </span>
                        <span className="mt-1 block text-xs leading-5 text-slate-500">
                          Requiere corrección o un soporte distinto.
                        </span>
                      </span>
                    </label>
                  </div>
                </fieldset>

                <label
                  htmlFor="finance-review-reason"
                  className="block space-y-2 text-xs font-black uppercase tracking-wider text-slate-500"
                >
                  Motivo de la decisión
                  <textarea
                    id="finance-review-reason"
                    required
                    minLength={10}
                    maxLength={500}
                    rows={4}
                    autoFocus
                    value={reviewReason}
                    onChange={(event) => setReviewReason(event.target.value)}
                    aria-describedby="finance-review-reason-help"
                    className="w-full resize-y rounded-2xl border border-slate-200 px-4 py-3 text-sm font-semibold normal-case tracking-normal text-slate-900"
                  />
                  <span
                    id="finance-review-reason-help"
                    className="flex justify-between text-[10px] font-semibold normal-case tracking-normal text-slate-400"
                  >
                    <span>Explica la verificación realizada (10 a 500).</span>
                    <span>{reviewReason.length}/500</span>
                  </span>
                </label>

                <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
                  <button
                    type="button"
                    disabled={saving}
                    onClick={closeReview}
                    className="rounded-2xl border border-slate-200 px-6 py-3 text-xs font-black uppercase tracking-wider text-slate-600 disabled:opacity-50"
                  >
                    Cancelar
                  </button>
                  <button
                    type="submit"
                    disabled={saving}
                    className={`inline-flex items-center justify-center gap-2 rounded-2xl px-7 py-3 text-xs font-black uppercase tracking-wider text-white disabled:opacity-60 ${
                      reviewStatus === "APPROVED"
                        ? "bg-emerald-700 hover:bg-emerald-800"
                        : "bg-red-700 hover:bg-red-800"
                    }`}
                  >
                    {saving ? (
                      <Loader2 className="animate-spin" size={16} />
                    ) : reviewStatus === "APPROVED" ? (
                      <CheckCircle2 size={16} />
                    ) : (
                      <X size={16} />
                    )}
                    Confirmar{" "}
                    {reviewStatus === "APPROVED" ? "aprobación" : "rechazo"}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

      {reportEntry && canReview && reportEntry.status === "APPROVED" && (
        <div
          ref={reportDialogRef}
          className="fixed inset-0 z-[80] flex items-center justify-center bg-slate-950/70 p-4 backdrop-blur-sm"
          role="dialog"
          aria-modal="true"
          aria-labelledby="finance-cne-report-title"
        >
          <div className="w-full max-w-xl rounded-[2rem] bg-white shadow-2xl">
            <div className="flex items-start justify-between border-b border-slate-100 p-7">
              <div>
                <p className="text-[10px] font-black uppercase tracking-[0.18em] text-blue-700">
                  Anotación interna aportada por el usuario
                </p>
                <h2
                  ref={reportTitleRef}
                  tabIndex={-1}
                  id="finance-cne-report-title"
                  className="mt-2 text-2xl font-black text-slate-950"
                >
                  Anotar referencia externa del movimiento
                </h2>
                <p className="mt-2 text-sm leading-6 text-slate-500">
                  Esta anotación no constituye ni demuestra una presentación,
                  radicación o rendición oficial en Cuentas Claras. El obligado
                  debe cumplir ese trámite fuera de esta plataforma y en la
                  unidad documental exigida por el CNE.
                </p>
              </div>
              <button
                type="button"
                aria-label="Cerrar anotación de referencia externa"
                disabled={saving}
                onClick={closeExternalReport}
                className="rounded-xl p-2 text-slate-400 hover:bg-slate-100 disabled:opacity-50"
              >
                <X aria-hidden="true" />
              </button>
            </div>

            <form
              onSubmit={handleExternalReportSubmit}
              className="space-y-6 p-7"
            >
              {error && (
                <div
                  role="alert"
                  className="rounded-2xl border border-red-200 bg-red-50 px-5 py-4 text-sm font-semibold text-red-700"
                >
                  {error}
                </div>
              )}
              <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm font-semibold leading-6 text-amber-950">
                Movimiento: {reportEntry.description}. Se conservará como
                evidencia declarada por el usuario, sin verificación oficial de
                la plataforma, y no podrá sobrescribirse desde la interfaz.
              </div>
              <label
                htmlFor="finance-cne-external-reference"
                className="block space-y-2 text-xs font-black uppercase tracking-wider text-slate-500"
              >
                Referencia externa declarada
                <input
                  id="finance-cne-external-reference"
                  required
                  autoFocus
                  minLength={5}
                  maxLength={120}
                  value={externalReference}
                  onChange={(event) => setExternalReference(event.target.value)}
                  placeholder="Ej. CC-2026/004219"
                  className="w-full rounded-2xl border border-slate-200 px-4 py-3 text-sm font-semibold normal-case tracking-normal text-slate-900"
                />
                <span className="flex justify-between text-[10px] font-semibold normal-case tracking-normal text-slate-400">
                  <span>
                    Se transcribe del soporte; la plataforma no la verifica.
                  </span>
                  <span>{externalReference.length}/120</span>
                </span>
              </label>
              <label className="block space-y-2 text-xs font-black uppercase tracking-wider text-slate-500">
                Soporte privado de la referencia
                <input
                  type="file"
                  aria-required="true"
                  accept=".pdf,.jpg,.jpeg,.png,.webp"
                  onChange={(event) =>
                    setCneReportEvidenceFile(event.target.files?.[0] ?? null)
                  }
                  className="block w-full rounded-2xl border border-dashed border-slate-300 px-4 py-4 text-xs font-semibold normal-case tracking-normal text-slate-600 file:mr-3 file:rounded-xl file:border-0 file:bg-blue-50 file:px-3 file:py-2 file:font-black file:text-blue-800"
                />
                <span className="block text-[10px] font-semibold normal-case tracking-normal text-slate-400">
                  Se sube directamente al almacenamiento privado. La API solo
                  registra una ruta confirmada y nunca devuelve esa ruta.
                </span>
              </label>
              <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
                <button
                  type="button"
                  disabled={saving}
                  onClick={closeExternalReport}
                  className="rounded-2xl border border-slate-200 px-6 py-3 text-xs font-black uppercase tracking-wider text-slate-600 disabled:opacity-50"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="inline-flex items-center justify-center gap-2 rounded-2xl bg-blue-700 px-7 py-3 text-xs font-black uppercase tracking-wider text-white disabled:opacity-60"
                >
                  {saving ? (
                    <Loader2 className="animate-spin" size={16} />
                  ) : (
                    <CheckCircle2 size={16} />
                  )}
                  Guardar anotación externa
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {isSettingsOpen && canWrite && (
        <div
          ref={settingsDialogRef}
          className="fixed inset-0 z-[70] flex items-center justify-center bg-slate-950/70 p-4 backdrop-blur-sm"
          role="dialog"
          aria-modal="true"
          aria-labelledby="finance-settings-title"
        >
          <div className="max-h-[94vh] w-full max-w-4xl overflow-y-auto rounded-[2rem] bg-white shadow-2xl">
            <div className="flex items-start justify-between border-b border-slate-100 p-7">
              <div>
                <h2
                  ref={settingsTitleRef}
                  tabIndex={-1}
                  id="finance-settings-title"
                  className="text-2xl font-black text-slate-950"
                >
                  Expediente financiero electoral
                </h2>
                <p className="mt-1 text-sm text-slate-500">
                  Identifica la elección, la fuente jurídica, los responsables y
                  la cuenta única antes de habilitar registros.
                </p>
              </div>
              <button
                type="button"
                aria-label="Cerrar expediente financiero"
                disabled={saving}
                onClick={() => {
                  setIsSettingsOpen(false);
                  setError(null);
                }}
                className="rounded-xl p-2 text-slate-400 hover:bg-slate-100 disabled:opacity-50"
              >
                <X aria-hidden="true" />
              </button>
            </div>
            <form onSubmit={handleSettingsSubmit} className="space-y-5 p-7">
              {error && (
                <div
                  role="alert"
                  className="rounded-2xl border border-red-200 bg-red-50 px-5 py-4 text-sm font-semibold text-red-700"
                >
                  {error}
                </div>
              )}
              <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm font-semibold leading-6 text-amber-950">
                Este sistema no presenta ni radica informes ante el CNE. Los
                valores, plazos y códigos deben copiarse de los documentos y
                sistemas oficiales aplicables a esta elección concreta.
              </div>

              <fieldset className="space-y-4 rounded-2xl border border-slate-200 p-5">
                <legend className="px-2 text-xs font-black uppercase tracking-wider text-slate-700">
                  1. Elección y obligación de informar
                </legend>
                <div className="grid gap-4 md:grid-cols-2">
                  <label className="space-y-2 text-xs font-black uppercase tracking-wider text-slate-500 md:col-span-2">
                    Nombre exacto de la elección
                    <input
                      required
                      autoFocus
                      minLength={3}
                      maxLength={200}
                      value={settingsForm.electionName}
                      onChange={(event) =>
                        setSettingsForm({
                          ...settingsForm,
                          electionName: event.target.value,
                        })
                      }
                      placeholder="Ej. Elecciones territoriales 2027 - Alcaldía"
                      className="w-full rounded-2xl border border-slate-200 px-4 py-3 text-sm font-semibold normal-case tracking-normal text-slate-900"
                    />
                  </label>
                  <label className="space-y-2 text-xs font-black uppercase tracking-wider text-slate-500">
                    Fecha de la elección
                    <input
                      required
                      type="date"
                      value={settingsForm.electionDate}
                      onChange={(event) =>
                        setSettingsForm({
                          ...settingsForm,
                          electionDate: event.target.value,
                        })
                      }
                      className="w-full rounded-2xl border border-slate-200 px-4 py-3 text-sm font-semibold normal-case tracking-normal text-slate-900"
                    />
                  </label>
                  <label className="space-y-2 text-xs font-black uppercase tracking-wider text-slate-500">
                    Alcance del informe
                    <select
                      required
                      value={settingsForm.reportScope}
                      onChange={(event) =>
                        setSettingsForm({
                          ...settingsForm,
                          reportScope: event.target.value as FinanceReportScope,
                        })
                      }
                      className="w-full rounded-2xl border border-slate-200 px-4 py-3 text-sm font-semibold normal-case tracking-normal text-slate-900"
                    >
                      <option value="CANDIDATE">Candidato o candidata</option>
                      <option value="POLITICAL_ORGANIZATION">
                        Organización política
                      </option>
                    </select>
                  </label>
                  <label className="space-y-2 text-xs font-black uppercase tracking-wider text-slate-500">
                    Fecha límite del informe
                    <input
                      required
                      type="date"
                      min={settingsForm.electionDate || undefined}
                      value={settingsForm.reportDeadline}
                      onChange={(event) =>
                        setSettingsForm({
                          ...settingsForm,
                          reportDeadline: event.target.value,
                        })
                      }
                      className="w-full rounded-2xl border border-slate-200 px-4 py-3 text-sm font-semibold normal-case tracking-normal text-slate-900"
                    />
                  </label>
                  <label className="space-y-2 text-xs font-black uppercase tracking-wider text-slate-500">
                    Código de Cuentas Claras
                    <input
                      required
                      minLength={3}
                      maxLength={120}
                      value={settingsForm.cuentasClarasCode}
                      onChange={(event) =>
                        setSettingsForm({
                          ...settingsForm,
                          cuentasClarasCode: event.target.value,
                        })
                      }
                      autoComplete="off"
                      className="w-full rounded-2xl border border-slate-200 px-4 py-3 text-sm font-semibold normal-case tracking-normal text-slate-900"
                    />
                  </label>
                  <label className="space-y-2 text-xs font-black uppercase tracking-wider text-slate-500 md:col-span-2">
                    Resolución o referencia oficial de topes
                    <input
                      required
                      minLength={5}
                      maxLength={250}
                      value={settingsForm.officialLimitsReference}
                      onChange={(event) =>
                        setSettingsForm({
                          ...settingsForm,
                          officialLimitsReference: event.target.value,
                        })
                      }
                      placeholder="Número, año y autoridad del acto aplicable"
                      className="w-full rounded-2xl border border-slate-200 px-4 py-3 text-sm font-semibold normal-case tracking-normal text-slate-900"
                    />
                  </label>
                  <label className="space-y-2 text-xs font-black uppercase tracking-wider text-slate-500 md:col-span-2">
                    URL oficial de topes (HTTPS)
                    <input
                      required
                      type="url"
                      maxLength={2048}
                      pattern="https://.*"
                      value={settingsForm.officialLimitsUrl}
                      onChange={(event) =>
                        setSettingsForm({
                          ...settingsForm,
                          officialLimitsUrl: event.target.value,
                        })
                      }
                      placeholder="https://www.cne.gov.co/..."
                      className="w-full rounded-2xl border border-slate-200 px-4 py-3 text-sm font-semibold normal-case tracking-normal text-slate-900"
                    />
                  </label>
                </div>
              </fieldset>

              <fieldset className="space-y-4 rounded-2xl border border-slate-200 p-5">
                <legend className="px-2 text-xs font-black uppercase tracking-wider text-slate-700">
                  2. Responsables
                </legend>
                <div className="grid gap-4 md:grid-cols-2">
                  <label className="space-y-2 text-xs font-black uppercase tracking-wider text-slate-500">
                    Responsable financiero o gerente
                    <input
                      required
                      minLength={3}
                      maxLength={200}
                      value={settingsForm.financialManagerName}
                      onChange={(event) =>
                        setSettingsForm({
                          ...settingsForm,
                          financialManagerName: event.target.value,
                        })
                      }
                      className="w-full rounded-2xl border border-slate-200 px-4 py-3 text-sm font-semibold normal-case tracking-normal text-slate-900"
                    />
                  </label>
                  <label className="space-y-2 text-xs font-black uppercase tracking-wider text-slate-500">
                    Documento del responsable financiero
                    <input
                      required
                      minLength={5}
                      maxLength={32}
                      pattern="[A-Za-z0-9.-]+"
                      autoComplete="off"
                      value={settingsForm.financialManagerDocument}
                      onChange={(event) =>
                        setSettingsForm({
                          ...settingsForm,
                          financialManagerDocument: event.target.value,
                        })
                      }
                      placeholder={
                        protectedSettings?.financialManagerDocumentMasked ??
                        "Documento sin espacios"
                      }
                      className="w-full rounded-2xl border border-slate-200 px-4 py-3 text-sm font-semibold normal-case tracking-normal text-slate-900"
                    />
                    <span className="block text-[10px] font-semibold normal-case tracking-normal text-slate-400">
                      Por privacidad se exige reingresarlo en cada cambio.
                    </span>
                  </label>
                  <label className="space-y-2 text-xs font-black uppercase tracking-wider text-slate-500">
                    Contador responsable
                    <input
                      required
                      minLength={3}
                      maxLength={200}
                      value={settingsForm.accountantName}
                      onChange={(event) =>
                        setSettingsForm({
                          ...settingsForm,
                          accountantName: event.target.value,
                        })
                      }
                      className="w-full rounded-2xl border border-slate-200 px-4 py-3 text-sm font-semibold normal-case tracking-normal text-slate-900"
                    />
                  </label>
                  <label className="space-y-2 text-xs font-black uppercase tracking-wider text-slate-500">
                    Documento del contador
                    <input
                      required
                      minLength={5}
                      maxLength={32}
                      pattern="[A-Za-z0-9.-]+"
                      autoComplete="off"
                      value={settingsForm.accountantDocument}
                      onChange={(event) =>
                        setSettingsForm({
                          ...settingsForm,
                          accountantDocument: event.target.value,
                        })
                      }
                      placeholder={
                        protectedSettings?.accountantDocumentMasked ??
                        "Documento sin espacios"
                      }
                      className="w-full rounded-2xl border border-slate-200 px-4 py-3 text-sm font-semibold normal-case tracking-normal text-slate-900"
                    />
                    <span className="block text-[10px] font-semibold normal-case tracking-normal text-slate-400">
                      El documento completo no se devuelve desde la API.
                    </span>
                  </label>
                </div>
              </fieldset>

              <fieldset className="space-y-4 rounded-2xl border border-slate-200 p-5">
                <legend className="px-2 text-xs font-black uppercase tracking-wider text-slate-700">
                  3. Cuenta única y topes
                </legend>
                <div className="grid gap-4 md:grid-cols-2">
                  <label className="space-y-2 text-xs font-black uppercase tracking-wider text-slate-500">
                    Banco de la cuenta única
                    <input
                      required
                      minLength={2}
                      maxLength={160}
                      value={settingsForm.uniqueAccountBank}
                      onChange={(event) =>
                        setSettingsForm({
                          ...settingsForm,
                          uniqueAccountBank: event.target.value,
                        })
                      }
                      className="w-full rounded-2xl border border-slate-200 px-4 py-3 text-sm font-semibold normal-case tracking-normal text-slate-900"
                    />
                  </label>
                  <label className="space-y-2 text-xs font-black uppercase tracking-wider text-slate-500">
                    Últimos 4 de la cuenta única
                    <input
                      required
                      inputMode="numeric"
                      pattern="[0-9]{4}"
                      minLength={4}
                      maxLength={4}
                      autoComplete="off"
                      value={settingsForm.uniqueAccountLastFour}
                      onChange={(event) =>
                        setSettingsForm({
                          ...settingsForm,
                          uniqueAccountLastFour: event.target.value.replace(
                            /\D/g,
                            "",
                          ),
                        })
                      }
                      className="w-full rounded-2xl border border-slate-200 px-4 py-3 text-sm font-semibold normal-case tracking-normal text-slate-900"
                    />
                    <span className="block text-[10px] font-semibold normal-case tracking-normal text-slate-400">
                      Nunca ingreses el número completo de la cuenta.
                    </span>
                  </label>
                  <label className="space-y-2 text-xs font-black uppercase tracking-wider text-slate-500">
                    Tope total de gastos (COP)
                    <input
                      required
                      type="number"
                      min="1"
                      max="9999999999999.99"
                      step="0.01"
                      value={settingsForm.maxTotalBudget}
                      onChange={(event) =>
                        setSettingsForm({
                          ...settingsForm,
                          maxTotalBudget: event.target.value,
                        })
                      }
                      className="w-full rounded-2xl border border-slate-200 px-4 py-3 text-sm font-semibold normal-case tracking-normal text-slate-900"
                    />
                  </label>
                  <label className="space-y-2 text-xs font-black uppercase tracking-wider text-slate-500">
                    Tope de publicidad exterior (COP)
                    <input
                      required
                      type="number"
                      min="1"
                      max="9999999999999.99"
                      step="0.01"
                      value={settingsForm.maxPublicityLimit}
                      onChange={(event) =>
                        setSettingsForm({
                          ...settingsForm,
                          maxPublicityLimit: event.target.value,
                        })
                      }
                      className="w-full rounded-2xl border border-slate-200 px-4 py-3 text-sm font-semibold normal-case tracking-normal text-slate-900"
                    />
                  </label>
                </div>
              </fieldset>

              <p className="text-xs leading-5 text-slate-500">
                La plataforma aplica controles internos contra estos datos. No
                reemplaza la validación jurídica, la firma electrónica ni el
                reporte oficial en Cuentas Claras.
              </p>
              <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
                <button
                  type="button"
                  onClick={() => {
                    setIsSettingsOpen(false);
                    setError(null);
                  }}
                  className="rounded-2xl border border-slate-200 px-6 py-3 text-xs font-black uppercase tracking-wider text-slate-600"
                >
                  Cancelar
                </button>
                <button
                  disabled={saving}
                  type="submit"
                  className="inline-flex items-center justify-center gap-2 rounded-2xl bg-blue-700 px-7 py-3 text-xs font-black uppercase tracking-wider text-white disabled:opacity-60"
                >
                  {saving ? (
                    <Loader2 className="animate-spin" size={16} />
                  ) : (
                    <SlidersHorizontal size={16} />
                  )}
                  Guardar expediente
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
