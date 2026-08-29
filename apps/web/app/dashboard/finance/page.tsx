"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
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
import { uploadFileDirectly } from "@/lib/direct-storage-upload";
import { openPrivateResource } from "@/lib/private-storage";
import { useAuth } from "@/context/auth";
import type { BackendUserRole } from "@/types/saas-schema";

type EntryType = "INCOME" | "EXPENSE";
type FinanceStatus = "PENDING" | "APPROVED" | "REJECTED" | "REPORTED_CNE";
type FinanceReviewStatus = "APPROVED" | "REJECTED";
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
  status: FinanceStatus;
  reportedByMe: boolean;
  reviewedAt: string | null;
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

const CNE_CODES: Array<{ value: CneCode; label: string }> = [
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

const STATUS_LABEL: Record<FinanceStatus, string> = {
  PENDING: "Pendiente",
  APPROVED: "Aprobado",
  REJECTED: "Rechazado",
  REPORTED_CNE: "Reportado CNE",
};

function formatCop(value: number) {
  return new Intl.NumberFormat("es-CO", {
    style: "currency",
    currency: "COP",
    maximumFractionDigits: 0,
  }).format(value);
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
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [isOpen, setIsOpen] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [reviewEntry, setReviewEntry] = useState<FinancialEntry | null>(null);
  const [reviewStatus, setReviewStatus] =
    useState<FinanceReviewStatus>("APPROVED");
  const [reviewReason, setReviewReason] = useState("");
  const [form, setForm] = useState(EMPTY_FORM);
  const [settingsForm, setSettingsForm] = useState({
    maxTotalBudget: "",
    maxPublicityLimit: "",
  });
  const [evidenceFile, setEvidenceFile] = useState<File | null>(null);
  const [downloadingEntryId, setDownloadingEntryId] = useState<string | null>(
    null,
  );

  const loadFinance = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [loadedEntries, loadedSummary] = await Promise.all([
        apiRequest<FinancialEntry[]>("finance"),
        apiRequest<FinanceSummary>("finance/summary"),
      ]);
      setEntries(loadedEntries);
      setSummary(loadedSummary);
      setSettingsForm({
        maxTotalBudget: loadedSummary.maxTotalBudget?.toString() ?? "",
        maxPublicityLimit: loadedSummary.maxPublicityLimit?.toString() ?? "",
      });
    } catch (requestError) {
      setError(
        requestError instanceof ApiError
          ? requestError.message
          : "No fue posible consultar las finanzas de la campaña.",
      );
    } finally {
      setLoading(false);
    }
  }, []);

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

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setError(null);
    try {
      const evidence = evidenceFile
        ? await uploadFileDirectly(evidenceFile, "finance")
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
    setSaving(true);
    setError(null);
    try {
      await apiRequest("finance/settings", {
        method: "PUT",
        body: JSON.stringify({
          maxTotalBudget: Number(settingsForm.maxTotalBudget),
          maxPublicityLimit: Number(settingsForm.maxPublicityLimit),
        }),
      });
      setIsSettingsOpen(false);
      setNotice("Topes actualizados y registrados en la auditoría.");
      window.setTimeout(() => setNotice(null), 4000);
      await loadFinance();
    } catch (requestError) {
      setError(
        requestError instanceof ApiError
          ? requestError.message
          : "No fue posible guardar los topes.",
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
        "Para aprobar el movimiento primero debe existir un soporte verificado.",
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

  async function handleDownloadReport() {
    setError(null);
    try {
      const report = await apiDownload("finance/cne-report");
      const objectUrl = URL.createObjectURL(report);
      const link = document.createElement("a");
      link.href = objectUrl;
      link.download = `reporte-cuentas-claras-${new Date().toISOString().slice(0, 10)}.csv`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(objectUrl);
    } catch (requestError) {
      setError(
        requestError instanceof ApiError
          ? requestError.message
          : "No fue posible preparar el informe.",
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
        <div className="flex gap-3">
          <button
            type="button"
            onClick={() => void handleDownloadReport()}
            className="inline-flex items-center gap-2 rounded-2xl border border-slate-200 bg-white px-5 py-3 text-xs font-black uppercase tracking-wider text-slate-600 hover:bg-slate-50"
          >
            <Download size={15} /> Exportar CSV
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
              className="inline-flex items-center gap-2 rounded-2xl bg-slate-950 px-6 py-3 text-xs font-black uppercase tracking-wider text-white hover:bg-blue-700"
            >
              <Plus size={16} /> Registrar movimiento
            </button>
          )}
        </div>
      </header>

      {error && !isOpen && !isSettingsOpen && !reviewEntry && (
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

      {!loading && summary.limitsConfigured === false && (
        <div className="flex items-start gap-4 rounded-2xl border border-blue-200 bg-blue-50 p-5 text-blue-950">
          <AlertTriangle className="mt-0.5 shrink-0" size={20} />
          <div>
            <p className="font-black">Configura los topes de esta elección</p>
            <p className="mt-1 text-sm leading-6 text-blue-800">
              Los movimientos se conservan, pero el sistema no afirmará que
              cumplen un tope hasta que el responsable configure los límites
              oficiales aplicables.
            </p>
            {canWrite && (
              <button
                type="button"
                onClick={() => setIsSettingsOpen(true)}
                className="mt-4 inline-flex items-center gap-2 rounded-xl bg-blue-700 px-4 py-2 text-xs font-black uppercase tracking-wider text-white"
              >
                <SlidersHorizontal size={15} /> Configurar topes
              </button>
            )}
          </div>
        </div>
      )}

      {!loading && summary.limitsConfigured && (
        <section className="flex flex-col gap-4 rounded-[2rem] border border-slate-200 bg-white p-6 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-[10px] font-black uppercase tracking-[0.18em] text-slate-400">
              Topes configurados para esta elección
            </p>
            <p className="mt-2 text-sm font-bold text-slate-800">
              Total {formatCop(summary.maxTotalBudget ?? 0)} · Publicidad
              exterior {formatCop(summary.maxPublicityLimit ?? 0)}
            </p>
            <p className="mt-1 text-xs text-slate-500">
              Saldo disponible frente al tope:{" "}
              {formatCop(summary.remainingBudget ?? 0)}
            </p>
          </div>
          {canWrite && (
            <button
              type="button"
              onClick={() => setIsSettingsOpen(true)}
              className="inline-flex items-center justify-center gap-2 rounded-2xl border border-slate-200 px-5 py-3 text-xs font-black uppercase tracking-wider text-slate-700"
            >
              <SlidersHorizontal size={15} /> Editar topes
            </button>
          )}
        </section>
      )}

      <section className="grid gap-5 md:grid-cols-3">
        <article className="rounded-[2rem] bg-slate-950 p-7 text-white shadow-xl">
          <WalletCards className="mb-5 text-blue-300" />
          <p className="text-[10px] font-black uppercase tracking-[0.18em] text-slate-400">
            Balance registrado
          </p>
          <p className="mt-2 text-3xl font-black tracking-tight">
            {formatCop(summary.balance)}
          </p>
        </article>
        <article className="rounded-[2rem] border border-slate-200 bg-white p-7">
          <p className="text-[10px] font-black uppercase tracking-[0.18em] text-slate-400">
            Ingresos
          </p>
          <p className="mt-3 text-3xl font-black tracking-tight text-emerald-700">
            {formatCop(summary.totalIncome)}
          </p>
        </article>
        <article className="rounded-[2rem] border border-slate-200 bg-white p-7">
          <p className="text-[10px] font-black uppercase tracking-[0.18em] text-slate-400">
            Gastos
          </p>
          <p className="mt-3 text-3xl font-black tracking-tight text-red-700">
            {formatCop(summary.totalExpenses)}
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

        {loading ? (
          <div className="flex items-center justify-center gap-3 py-20 text-sm font-bold text-slate-400">
            <Loader2 className="animate-spin" size={20} /> Consultando la API
            segura…
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
                  <th className="px-6 py-4">Rubro</th>
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
                      {CNE_CODES.find((code) => code.value === entry.cneCode)
                        ?.label ?? entry.cneCode}
                    </td>
                    <td className="px-6 py-5">
                      <span className="rounded-full bg-slate-100 px-3 py-1 text-[10px] font-black uppercase tracking-wider text-slate-600">
                        {STATUS_LABEL[entry.status]}
                      </span>
                      {entry.hasEvidence && (
                        <div className="mt-2 flex flex-col items-start gap-1.5">
                          <span className="text-[10px] font-bold text-emerald-700">
                            Soporte verificado
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
          <div className="max-h-[92vh] w-full max-w-2xl overflow-y-auto rounded-[2rem] bg-white shadow-2xl">
            <div className="flex items-start justify-between border-b border-slate-100 p-7">
              <div>
                <h2 className="text-2xl font-black text-slate-950">
                  Registrar hecho económico
                </h2>
                <p className="mt-1 text-sm text-slate-500">
                  Quedará pendiente de revisión y aprobación.
                </p>
              </div>
              <button
                type="button"
                onClick={() => {
                  setIsOpen(false);
                  setError(null);
                }}
                className="rounded-xl p-2 text-slate-400 hover:bg-slate-100"
              >
                <X />
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
                    {CNE_CODES.map((code) => (
                      <option key={code.value} value={code.value}>
                        {code.label}
                      </option>
                    ))}
                  </select>
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
            className="fixed inset-0 z-[80] flex items-center justify-center bg-slate-950/70 p-4 backdrop-blur-sm"
            role="dialog"
            aria-modal="true"
            aria-labelledby="finance-review-title"
            onKeyDown={(event) => {
              if (event.key === "Escape" && !saving) closeReview();
            }}
          >
            <div className="w-full max-w-xl rounded-[2rem] bg-white shadow-2xl">
              <div className="flex items-start justify-between border-b border-slate-100 p-7">
                <div>
                  <p className="text-[10px] font-black uppercase tracking-[0.18em] text-blue-700">
                    Control de cuatro ojos
                  </p>
                  <h2
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
                            : "No disponible: falta un soporte verificado."}
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

      {isSettingsOpen && canWrite && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-slate-950/70 p-4 backdrop-blur-sm">
          <div className="w-full max-w-xl rounded-[2rem] bg-white shadow-2xl">
            <div className="flex items-start justify-between border-b border-slate-100 p-7">
              <div>
                <h2 className="text-2xl font-black text-slate-950">
                  Topes de la elección
                </h2>
                <p className="mt-1 text-sm text-slate-500">
                  Registra los valores oficiales aplicables. Cada cambio queda
                  auditado.
                </p>
              </div>
              <button
                type="button"
                aria-label="Cerrar configuración de topes"
                onClick={() => {
                  setIsSettingsOpen(false);
                  setError(null);
                }}
                className="rounded-xl p-2 text-slate-400 hover:bg-slate-100"
              >
                <X />
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
              <label className="block space-y-2 text-xs font-black uppercase tracking-wider text-slate-500">
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
              <label className="block space-y-2 text-xs font-black uppercase tracking-wider text-slate-500">
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
              <p className="text-xs leading-5 text-slate-500">
                La plataforma controla contra estos valores, pero no reemplaza
                la validación jurídica ni el reporte oficial ante el CNE.
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
                  Guardar topes
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
