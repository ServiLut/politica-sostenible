"use client";

import {
  type FormEvent,
  type ReactNode,
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";
import {
  AlertTriangle,
  CheckCircle2,
  Download,
  Loader2,
  RefreshCw,
  Scale,
  ShieldCheck,
} from "lucide-react";
import { UserCombobox } from "@/components/ui/UserCombobox";
import { listScrutinyParticipants } from "@/lib/scrutiny-api";
import { useAuth } from "@/context/auth";
import { ApiError } from "@/lib/api-client";
import { uploadFileDirectly } from "@/lib/direct-storage-upload";
import {
  SCRUTINY_DOCUMENT_TYPES,
  SCRUTINY_EVIDENCE_LABELS,
  addScrutinyActionVersion,
  approveScrutinyAction,
  configureScrutinyRequirement,
  createScrutinyAction,
  createScrutinyCommission,
  createScrutinyCoverage,
  createScrutinyDeclaration,
  createScrutinyDiscrepancy,
  createScrutinyDocument,
  fileScrutinyAction,
  getScrutinyDocumentDownload,
  getScrutinyOverview,
  recordScrutinyCustody,
  recordScrutinyDecision,
  recordScrutinySessionEvent,
  resolveScrutinyDiscrepancy,
  reviewScrutinyDecision,
  reviewScrutinyDeclaration,
  reviewScrutinyDocument,
  sha256File,
  type ScrutinyAction,
  type ScrutinyDocument,
  type ScrutinyEvidenceState,
  type ScrutinyOverview,
} from "@/lib/scrutiny-api";
import type { BackendUserRole } from "@/types/saas-schema";

const LEGAL_ROLES = new Set<BackendUserRole>([
  "ADMIN",
  "CAMPAIGN_MANAGER",
  "COMPLIANCE_OFFICER",
]);
const FIELD_ROLES = new Set<BackendUserRole>([
  ...LEGAL_ROLES,
  "ZONE_COORDINATOR",
  "WITNESS",
]);
const DOWNLOAD_ROLES = new Set<BackendUserRole>([...LEGAL_ROLES, "AUDITOR"]);

const inputClass =
  "mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-950 shadow-sm focus:border-blue-600 focus:outline-none focus:ring-2 focus:ring-blue-200 disabled:bg-slate-100";
const buttonClass =
  "inline-flex min-h-10 items-center justify-center gap-2 rounded-lg bg-blue-700 px-4 py-2 text-sm font-bold text-white shadow-sm hover:bg-blue-800 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50";
const secondaryButtonClass =
  "inline-flex min-h-10 items-center justify-center gap-2 rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-bold text-slate-800 hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50";

const DOCUMENT_LABELS: Record<string, string> = {
  E14_CLAVEROS: "E-14 Claveros",
  E16_CREDENTIAL: "E-16 · credencial de comisión",
  E23: "E-23 · constancia de comisión",
  E24: "E-24 · cuadro de resultados",
  E25: "E-25 · formulario de mesa",
  E26: "E-26 · acta parcial/general",
  GENERAL_ACT: "Acta general",
  RESOLUTION: "Resolución",
  APPEAL: "Recurso o apelación",
  NOTICE: "Notificación",
  DECLARATION_CREDENTIAL: "Declaración o credencial",
  OTHER: "Otro soporte",
};

const ACTION_LABELS: Record<string, string> = {
  REQUEST: "Solicitud",
  CLAIM: "Reclamación",
  APPEAL: "Apelación",
  NULLITY_REQUEST: "Solicitud de nulidad",
};

const ACTION_STATUS_LABELS: Record<string, string> = {
  DRAFT: "Borrador interno · no radicado",
  APPROVED_INTERNAL: "Aprobado internamente · no radicado",
  FILED_EXTERNAL: "Radicado ante la autoridad",
  DECIDED_EXTERNAL: "Decisión externa incorporada",
  APPEALED_EXTERNAL: "Decisión apelada externamente",
  CLOSED: "Actuación cerrada",
  WITHDRAWN: "Retirada",
};

function readableError(error: unknown): string {
  if (error instanceof ApiError) return error.message;
  if (error instanceof Error && error.message) return error.message;
  return "No fue posible completar la operación.";
}

function value(form: FormData, name: string): string {
  return String(form.get(name) ?? "").trim();
}

function optionalValue(form: FormData, name: string): string | undefined {
  return value(form, name) || undefined;
}

function instant(local: string): string {
  const parsed = new Date(local);
  if (!Number.isFinite(parsed.getTime()))
    throw new Error("Completa una fecha y hora válidas.");
  return parsed.toISOString();
}

function localNow(offsetMinutes = 5): string {
  const date = new Date(Date.now() + offsetMinutes * 60_000);
  return new Date(date.getTime() - date.getTimezoneOffset() * 60_000)
    .toISOString()
    .slice(0, 16);
}

function formatInstant(input: string, timeZone = "America/Bogota"): string {
  return new Intl.DateTimeFormat("es-CO", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone,
  }).format(new Date(input));
}

function Field({
  label,
  children,
  hint,
}: {
  label: string;
  children: ReactNode;
  hint?: string;
}) {
  return (
    <label className="block text-sm font-semibold text-slate-800">
      {label}
      {children}
      {hint ? (
        <span className="mt-1 block text-xs font-normal text-slate-500">
          {hint}
        </span>
      ) : null}
    </label>
  );
}

function Workflow({
  title,
  description,
  children,
  open = false,
}: {
  title: string;
  description: string;
  children: ReactNode;
  open?: boolean;
}) {
  return (
    <details
      open={open}
      className="group rounded-xl border border-slate-200 bg-white shadow-sm"
    >
      <summary className="cursor-pointer list-none px-4 py-4 focus:outline-none focus:ring-2 focus:ring-inset focus:ring-blue-600 md:px-5">
        <span className="flex items-start justify-between gap-3">
          <span>
            <span className="block font-black text-slate-950">{title}</span>
            <span className="mt-1 block text-sm font-normal text-slate-600">
              {description}
            </span>
          </span>
          <span
            aria-hidden="true"
            className="text-xl font-black text-blue-700 group-open:rotate-45"
          >
            +
          </span>
        </span>
      </summary>
      <div className="border-t border-slate-200 p-4 md:p-5">{children}</div>
    </details>
  );
}

function EvidenceBadge({ state }: { state: ScrutinyEvidenceState }) {
  const styles: Record<ScrutinyEvidenceState, string> = {
    INTERNAL: "bg-slate-100 text-slate-800",
    FILED: "bg-blue-100 text-blue-900",
    DECIDED: "bg-violet-100 text-violet-900",
    OFFICIAL: "bg-emerald-100 text-emerald-900",
  };
  return (
    <span
      className={`inline-flex rounded-full px-2.5 py-1 text-xs font-bold ${styles[state]}`}
    >
      {SCRUTINY_EVIDENCE_LABELS[state]}
    </span>
  );
}

function SubmitButton({ busy, label }: { busy: boolean; label: string }) {
  return (
    <button type="submit" disabled={busy} className={buttonClass}>
      {busy ? (
        <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
      ) : null}
      {label}
    </button>
  );
}


function UserSelect({ name, initialValue = "" }: { name: string; initialValue?: string }) {
  const [value, setValue] = useState(initialValue);
  return (
    <UserCombobox
      name={name}
      value={value}
      onChange={setValue}
      fetchItems={(search, signal) => listScrutinyParticipants({ search, limit: 10 }, signal)}
    />
  );
}

export default function ScrutinyPage() {
  const { user } = useAuth();
  const role = user?.backendRole;
  const [overview, setOverview] = useState<ScrutinyOverview | null>(null);
  const [selectedCommissionId, setSelectedCommissionId] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [downloadLink, setDownloadLink] = useState<{
    documentId: string;
    url: string;
    expiresAt: string;
  } | null>(null);
  const [revision, setRevision] = useState(0);

  const canLegal = Boolean(
    role && LEGAL_ROLES.has(role) && !overview?.readOnly,
  );
  const canField = Boolean(
    role && FIELD_ROLES.has(role) && !overview?.readOnly,
  );
  const canDownload = Boolean(role && DOWNLOAD_ROLES.has(role));

  const load = useCallback(async (signal?: AbortSignal) => {
    const data = await getScrutinyOverview(signal);
    if (!signal?.aborted) setOverview(data);
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError(null);
    void load(controller.signal)
      .catch((cause: unknown) => {
        if (!(cause instanceof DOMException && cause.name === "AbortError")) {
          setError(readableError(cause));
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [load, revision]);

  useEffect(() => {
    if (!overview?.commissions.length) {
      setSelectedCommissionId("");
      return;
    }
    if (!overview.commissions.some(({ id }) => id === selectedCommissionId)) {
      setSelectedCommissionId(overview.commissions[0].id);
    }
  }, [overview, selectedCommissionId]);

  const selectedCommission = useMemo(
    () =>
      overview?.commissions.find(({ id }) => id === selectedCommissionId) ??
      null,
    [overview, selectedCommissionId],
  );
  const commissionDocuments = useMemo(
    () =>
      overview?.documents.filter(
        ({ commissionId }) => commissionId === selectedCommissionId,
      ) ?? [],
    [overview, selectedCommissionId],
  );
  const approvedDocuments = commissionDocuments.filter(
    ({ reviewStatus }) => reviewStatus === "APPROVED",
  );
  const pendingDecisions =
    overview?.actions
      .map(({ decision }) => decision)
      .filter((item): item is NonNullable<typeof item> =>
        Boolean(item && item.reviewStatus === "PENDING"),
      ) ?? [];

  async function run<T>(
    key: string,
    operation: () => Promise<T>,
    success: string,
    updater?: (current: ScrutinyOverview, result: T) => ScrutinyOverview,
  ) {
    setBusy(key);
    setError(null);
    setNotice(null);
    try {
      const result = await operation();
      setNotice(success);
      if (updater) {
        setOverview((current) => current ? updater(current, result) : current);
      } else {
        setRevision((current) => current + 1);
      }
      return true;
    } catch (cause: unknown) {
      setError(readableError(cause));
      return false;
    } finally {
      setBusy(null);
    }
  }

  function submitCommission(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formElement = event.currentTarget;
    const data = new FormData(formElement);
    void run(
      "commission",
      () =>
        createScrutinyCommission({
          code: value(data, "code").toUpperCase(),
          level: value(data, "level"),
          name: value(data, "name"),
          scopeCode: value(data, "scopeCode"),
          scopeName: value(data, "scopeName"),
          venue: value(data, "venue"),
          timeZone: value(data, "timeZone"),
          scheduledStartsAt: instant(value(data, "scheduledStartsAt")),
          scheduledEndsAt: instant(value(data, "scheduledEndsAt")),
          calendarSourceUrl: value(data, "calendarSourceUrl"),
          calendarSourceReference: value(data, "calendarSourceReference"),
          legalLeadUserId: value(data, "legalLeadUserId"),
          escalationRoute: value(data, "escalationRoute"),
          contingencyPlan: value(data, "contingencyPlan"),
          ...(optionalValue(data, "offlineDrillAt")
            ? { offlineDrillAt: instant(value(data, "offlineDrillAt")) }
            : {}),
        }),
      "Comisión creada. Debes decidir expresamente la aplicabilidad de cada documento.",
    ).then((succeeded) => {
      if (succeeded) formElement.reset();
    });
  }

  function submitDocument(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formElement = event.currentTarget;
    const data = new FormData(formElement);
    const file = data.get("file");
    if (!(file instanceof File) || file.size === 0) {
      setError("Selecciona un PDF o una imagen para incorporar.");
      return;
    }
    const state = value(data, "evidenceState") as ScrutinyEvidenceState;
    void run(
      "document",
      async () => {
        const sha256 = await sha256File(file);
        const uploaded = await uploadFileDirectly(file, "scrutiny", sha256);
        return createScrutinyDocument({
          commissionId: value(data, "commissionId"),
          type: value(data, "type"),
          evidenceState: state,
          storagePath: uploaded.path,
          sha256,
          size: file.size,
          contentType: file.type,
          declaredIssuer: value(data, "declaredIssuer"),
          authorityInstance: value(data, "authorityInstance"),
          versionLabel: value(data, "versionLabel"),
          cutoffAt: instant(value(data, "cutoffAt")),
          ...(state === "INTERNAL"
            ? {}
            : {
                externalAt: instant(value(data, "externalAt")),
                externalChannel: value(data, "externalChannel"),
                externalReference: value(data, "externalReference"),
              }),
        });
      },
      "Archivo subido directamente a Storage e incorporado como evidencia pendiente de segunda revisión.",
    ).then((succeeded) => {
      if (succeeded) formElement.reset();
    });
  }

  if (loading && !overview) {
    return (
      <div
        className="flex min-h-[50vh] items-center justify-center gap-3"
        role="status"
      >
        <Loader2
          className="h-7 w-7 animate-spin text-blue-700"
          aria-hidden="true"
        />
        <span>Cargando expediente de escrutinio…</span>
      </div>
    );
  }

  return (
    <main className="mx-auto max-w-7xl space-y-6 p-4 md:p-8">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-sm font-bold uppercase tracking-[0.18em] text-blue-700">
            Control poselectoral
          </p>
          <h1 className="mt-1 text-3xl font-black tracking-tight text-slate-950">
            Escrutinios, reclamaciones y declaración
          </h1>
          <p className="mt-2 max-w-4xl text-sm leading-6 text-slate-600">
            Expediente operativo con trazabilidad de comisiones, cobertura E-16,
            custodia, diferencias y términos. Una captura interna nunca se
            presenta como decisión ni como resultado oficial.
          </p>
        </div>
        <button
          type="button"
          className={secondaryButtonClass}
          disabled={loading}
          onClick={() => setRevision((current) => current + 1)}
        >
          <RefreshCw
            className={`h-4 w-4 ${loading ? "animate-spin" : ""}`}
            aria-hidden="true"
          />
          Actualizar expediente
        </button>
      </header>

      {error ? (
        <section
          role="alert"
          className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-red-300 bg-red-50 p-4 text-sm text-red-900"
        >
          <span>
            <strong>No se completó la operación.</strong> {error}
          </span>
          <button
            type="button"
            className={secondaryButtonClass}
            onClick={() => setRevision((current) => current + 1)}
          >
            Reintentar carga
          </button>
        </section>
      ) : null}
      {notice ? (
        <p
          role="status"
          className="rounded-xl border border-emerald-300 bg-emerald-50 p-4 text-sm font-semibold text-emerald-950"
        >
          {notice}
        </p>
      ) : null}

      {overview?.readOnly ? (
        <section
          className="rounded-xl border border-slate-300 bg-slate-100 p-4"
          role="status"
        >
          <p className="font-black text-slate-950">
            Operación cerrada: expediente en solo lectura
          </p>
          <p className="mt-1 text-sm text-slate-700">
            Se preservan documentos, eventos y decisiones. Ningún control de
            mutación está habilitado.
          </p>
        </section>
      ) : null}

      {overview ? (
        <>
          <section
            aria-labelledby="state-contract-title"
            className="rounded-xl border border-blue-200 bg-blue-50 p-4 md:p-5"
          >
            <h2 id="state-contract-title" className="font-black text-blue-950">
              Contrato de evidencia: cuatro estados que no se confunden
            </h2>
            <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
              {(
                Object.keys(SCRUTINY_EVIDENCE_LABELS) as ScrutinyEvidenceState[]
              ).map((state) => (
                <div key={state} className="rounded-lg bg-white p-3 shadow-sm">
                  <EvidenceBadge state={state} />
                  <p className="mt-2 text-xs leading-5 text-slate-600">
                    {overview.stateContract[state]}
                  </p>
                </div>
              ))}
            </div>
          </section>

          <section
            aria-labelledby="readiness-title"
            className={`rounded-xl border p-4 md:p-5 ${overview.readiness.ready ? "border-emerald-300 bg-emerald-50" : "border-amber-300 bg-amber-50"}`}
          >
            <div className="flex items-start gap-3">
              {overview.readiness.ready ? (
                <CheckCircle2
                  className="mt-0.5 h-6 w-6 text-emerald-700"
                  aria-hidden="true"
                />
              ) : (
                <AlertTriangle
                  className="mt-0.5 h-6 w-6 text-amber-700"
                  aria-hidden="true"
                />
              )}
              <div className="min-w-0 flex-1">
                <h2 id="readiness-title" className="font-black text-slate-950">
                  {overview.readiness.ready
                    ? "Expediente sin bloqueos detectados"
                    : `${overview.readiness.summary.blockerCount} controles pendientes antes del cierre ordinario`}
                </h2>
                <p className="mt-1 text-xs text-slate-600">
                  Evaluación: {formatInstant(overview.readiness.evaluatedAt)}.
                  La ausencia legal de un documento exige marcar “No aplica” con
                  justificación.
                </p>
                {overview.readiness.blockers.length ? (
                  <ul className="mt-3 space-y-2">
                    {overview.readiness.blockers.map((blocker) => (
                      <li
                        key={blocker.code}
                        className="rounded-lg border border-amber-200 bg-white px-3 py-2 text-sm text-slate-800"
                      >
                        <strong>{blocker.count}:</strong> {blocker.detail}
                      </li>
                    ))}
                  </ul>
                ) : null}
              </div>
            </div>
          </section>

          <section
            aria-label="Resumen del expediente"
            className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4"
          >
            {[
              ["Comisiones", overview.readiness.summary.commissionCount],
              ["Documentos", overview.readiness.summary.documentCount],
              [
                "Diferencias abiertas",
                overview.discrepancies.filter(
                  ({ status }) =>
                    status === "OPEN" || status === "UNDER_REVIEW",
                ).length,
              ],
              [
                "Declaraciones oficiales",
                overview.readiness.summary.officialDeclarationCount,
              ],
            ].map(([label, count]) => (
              <div
                key={String(label)}
                className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm"
              >
                <p className="text-xs font-bold uppercase tracking-wide text-slate-500">
                  {label}
                </p>
                <p className="mt-2 text-3xl font-black text-slate-950">
                  {count}
                </p>
              </div>
            ))}
          </section>

          {overview.commissions.length ? (
            <Field label="Comisión de trabajo activa">
              <select
                className={inputClass}
                value={selectedCommissionId}
                onChange={(event) =>
                  setSelectedCommissionId(event.target.value)
                }
              >
                {overview.commissions.map((commission) => (
                  <option key={commission.id} value={commission.id}>
                    {commission.code} · {commission.name} · {commission.status}
                  </option>
                ))}
              </select>
            </Field>
          ) : (
            <section className="rounded-xl border border-dashed border-slate-300 bg-white p-8 text-center">
              <Scale
                className="mx-auto h-9 w-9 text-slate-400"
                aria-hidden="true"
              />
              <h2 className="mt-3 font-black text-slate-950">
                Aún no hay comisiones documentadas
              </h2>
              <p className="mt-1 text-sm text-slate-600">
                Registra el calendario oficial, responsable jurídico y
                contingencia para iniciar el expediente.
              </p>
            </section>
          )}

          {canLegal ? (
            <Workflow
              title="1. Crear comisión y audiencia"
              description="Parte del calendario oficial vigente; deja sede, horario, responsable, escalamiento y contingencia verificables."
              open={!overview.commissions.length}
            >
              <form
                className="grid gap-4 md:grid-cols-2"
                onSubmit={submitCommission}
              >
                <Field label="Código oficial">
                  <input
                    className={inputClass}
                    name="code"
                    required
                    minLength={2}
                    maxLength={64}
                    placeholder="AUX-BOG-01"
                  />
                </Field>
                <Field label="Nivel">
                  <select
                    className={inputClass}
                    name="level"
                    defaultValue="MUNICIPAL"
                  >
                    <option value="AUXILIARY">Auxiliar</option>
                    <option value="MUNICIPAL">Municipal</option>
                    <option value="DISTRICT">Distrital</option>
                    <option value="DEPARTMENTAL">Departamental</option>
                    <option value="GENERAL_NATIONAL">General/nacional</option>
                  </select>
                </Field>
                <Field label="Nombre">
                  <input
                    className={inputClass}
                    name="name"
                    required
                    minLength={3}
                    maxLength={200}
                  />
                </Field>
                <Field label="Sede">
                  <input
                    className={inputClass}
                    name="venue"
                    required
                    minLength={3}
                    maxLength={300}
                  />
                </Field>
                <Field label="Código del ámbito">
                  <input
                    className={inputClass}
                    name="scopeCode"
                    required
                    maxLength={80}
                  />
                </Field>
                <Field label="Nombre del ámbito">
                  <input
                    className={inputClass}
                    name="scopeName"
                    required
                    minLength={2}
                    maxLength={200}
                  />
                </Field>
                <Field label="Inicio programado">
                  <input
                    className={inputClass}
                    name="scheduledStartsAt"
                    type="datetime-local"
                    defaultValue={localNow(60)}
                    required
                  />
                </Field>
                <Field label="Fin programado">
                  <input
                    className={inputClass}
                    name="scheduledEndsAt"
                    type="datetime-local"
                    defaultValue={localNow(240)}
                    required
                  />
                </Field>
                <Field label="Zona horaria IANA">
                  <input
                    className={inputClass}
                    name="timeZone"
                    defaultValue="America/Bogota"
                    required
                  />
                </Field>
                <Field label="Responsable jurídico">
                  <UserSelect name="legalLeadUserId" initialValue={user?.id ?? ""} />
                </Field>
                <Field label="URL HTTPS del calendario">
                  <input
                    className={inputClass}
                    name="calendarSourceUrl"
                    type="url"
                    required
                    placeholder="https://…"
                  />
                </Field>
                <Field label="Referencia del calendario">
                  <input
                    className={inputClass}
                    name="calendarSourceReference"
                    required
                    minLength={5}
                    maxLength={500}
                    placeholder="Resolución, enlace o corte consultado"
                  />
                </Field>
                <Field
                  label="Ruta de escalamiento"
                  hint="Mínimo 50 caracteres: responsables, canal y tiempos."
                >
                  <textarea
                    className={inputClass}
                    name="escalationRoute"
                    required
                    minLength={50}
                    maxLength={4000}
                    rows={4}
                  />
                </Field>
                <Field
                  label="Plan de contingencia sin conexión"
                  hint="Mínimo 50 caracteres: formatos, custodia, digitación posterior y reconciliación."
                >
                  <textarea
                    className={inputClass}
                    name="contingencyPlan"
                    required
                    minLength={50}
                    maxLength={4000}
                    rows={4}
                  />
                </Field>
                <Field label="Simulacro de contingencia">
                  <input
                    className={inputClass}
                    name="offlineDrillAt"
                    type="datetime-local"
                  />
                </Field>
                <div className="flex items-end">
                  <SubmitButton
                    busy={busy === "commission"}
                    label="Crear comisión trazable"
                  />
                </div>
              </form>
            </Workflow>
          ) : null}

          {selectedCommission ? (
            <>
              <Workflow
                title="2. Alistamiento documental y audiencia"
                description="Decide aplicabilidad documento por documento y registra la secuencia real de apertura, suspensión, reanudación o cierre."
              >
                <div className="grid gap-6 xl:grid-cols-2">
                  <section>
                    <h3 className="font-black text-slate-950">
                      Matriz de documentos esenciales
                    </h3>
                    <div className="mt-3 overflow-x-auto">
                      <table className="w-full min-w-[520px] text-left text-sm">
                        <thead>
                          <tr className="border-b text-xs uppercase text-slate-500">
                            <th className="p-2">Documento</th>
                            <th className="p-2">Decisión</th>
                            <th className="p-2">Versión</th>
                          </tr>
                        </thead>
                        <tbody>
                          {selectedCommission.requirements.map(
                            (requirement) => (
                              <tr
                                key={requirement.id}
                                className="border-b border-slate-100"
                              >
                                <td className="p-2 font-semibold">
                                  {DOCUMENT_LABELS[requirement.documentType]}
                                </td>
                                <td className="p-2">
                                  {requirement.applicability === "PENDING"
                                    ? "Pendiente"
                                    : requirement.applicability === "REQUIRED"
                                      ? "Obligatorio"
                                      : "No aplica (justificado)"}
                                </td>
                                <td className="p-2">v{requirement.version}</td>
                              </tr>
                            ),
                          )}
                        </tbody>
                      </table>
                    </div>
                    {canLegal ? (
                      <form
                        className="mt-4 grid gap-3"
                        onSubmit={(event) => {
                          event.preventDefault();
                          const data = new FormData(event.currentTarget);
                          const requirement =
                            selectedCommission.requirements.find(
                              ({ id }) => id === value(data, "requirementId"),
                            );
                          if (!requirement) return;
                          void run(
                            "requirement",
                            () =>
                              configureScrutinyRequirement(
                                selectedCommission.id,
                                {
                                  documentType: requirement.documentType,
                                  applicability: value(data, "applicability"),
                                  rationale: value(data, "rationale"),
                                  expectedVersion: requirement.version,
                                },
                              ),
                            "Aplicabilidad documental actualizada con justificación.",
                          );
                        }}
                      >
                        <Field label="Requisito">
                          <select
                            className={inputClass}
                            name="requirementId"
                            required
                          >
                            {selectedCommission.requirements.map((item) => (
                              <option key={item.id} value={item.id}>
                                {DOCUMENT_LABELS[item.documentType]} ·{" "}
                                {item.applicability}
                              </option>
                            ))}
                          </select>
                        </Field>
                        <Field label="Aplicabilidad">
                          <select
                            className={inputClass}
                            name="applicability"
                            required
                          >
                            <option value="REQUIRED">
                              Obligatorio en esta comisión
                            </option>
                            <option value="NOT_APPLICABLE">
                              No aplica jurídicamente
                            </option>
                          </select>
                        </Field>
                        <Field label="Fundamento de la decisión">
                          <textarea
                            className={inputClass}
                            name="rationale"
                            required
                            minLength={20}
                            maxLength={2000}
                            rows={3}
                          />
                        </Field>
                        <SubmitButton
                          busy={busy === "requirement"}
                          label="Guardar decisión expresa"
                        />
                      </form>
                    ) : null}
                  </section>
                  <section>
                    <h3 className="font-black text-slate-950">
                      Bitácora de audiencia
                    </h3>
                    <p className="mt-1 text-sm text-slate-600">
                      Estado actual:{" "}
                      <strong>{selectedCommission.status}</strong> · versión{" "}
                      {selectedCommission.version}
                    </p>
                    {selectedCommission.events.length ? (
                      <ol className="mt-3 space-y-2">
                        {selectedCommission.events.map((item) => (
                          <li
                            key={item.id}
                            className="rounded-lg bg-slate-50 p-3 text-sm"
                          >
                            <strong>{item.type}</strong> ·{" "}
                            {formatInstant(
                              item.occurredAt,
                              selectedCommission.timeZone,
                            )}
                            <p className="mt-1 text-slate-600">{item.notes}</p>
                          </li>
                        ))}
                      </ol>
                    ) : (
                      <p className="mt-3 rounded-lg border border-dashed p-4 text-sm text-slate-500">
                        No hay eventos de audiencia.
                      </p>
                    )}
                    {canField ? (
                      <form
                        className="mt-4 grid gap-3"
                        onSubmit={(event) => {
                          event.preventDefault();
                          const data = new FormData(event.currentTarget);
                          void run(
                            "event",
                            () =>
                              recordScrutinySessionEvent(
                                selectedCommission.id,
                                {
                                  expectedVersion: selectedCommission.version,
                                  type: value(data, "type"),
                                  occurredAt: instant(
                                    value(data, "occurredAt"),
                                  ),
                                  notes: value(data, "notes"),
                                },
                              ),
                            "Evento agregado a la bitácora inmutable.",
                            (current, result) => {
                              const newCommissions = current.commissions.map((c) => {
                                if (c.id !== selectedCommission.id) return c;
                                // Basic optimistic state update logic depending on the event
                                const eventType = value(data, "type");
                                let newStatus = c.status;
                                if (eventType === "OPENED" || eventType === "RESUMED") newStatus = "ACTIVE";
                                if (eventType === "SUSPENDED") newStatus = "SUSPENDED";
                                if (eventType === "CLOSED") newStatus = "CLOSED";
                                return {
                                  ...c,
                                  status: newStatus,
                                  version: c.version + 1,
                                  events: [...c.events, result]
                                };
                              });
                              return { ...current, commissions: newCommissions };
                            }
                          );
                        }}
                      >
                        <Field label="Evento">
                          <select className={inputClass} name="type">
                            <option value="OPENED">Apertura</option>
                            <option value="SUSPENDED">Suspensión</option>
                            <option value="RESUMED">Reanudación</option>
                            <option value="CLOSED">Cierre de audiencia</option>
                          </select>
                        </Field>
                        <Field label="Fecha y hora">
                          <input
                            className={inputClass}
                            name="occurredAt"
                            type="datetime-local"
                            defaultValue={localNow()}
                            required
                          />
                        </Field>
                        <Field label="Nota de contexto">
                          <textarea
                            className={inputClass}
                            name="notes"
                            minLength={10}
                            maxLength={2000}
                            required
                            rows={3}
                          />
                        </Field>
                        <SubmitButton
                          busy={busy === "event"}
                          label="Registrar evento"
                        />
                      </form>
                    ) : null}
                  </section>
                </div>
              </Workflow>

              <Workflow
                title="3. Cobertura temporal E-16"
                description="Sólo cuenta un testigo WITNESS activo, con credencial E-16 aprobada y turno íntegro dentro de la audiencia."
              >
                <div className="rounded-lg border p-4">
                  <p className="font-black text-slate-950">
                    {selectedCommission.temporalCoverage?.complete
                      ? "Cobertura completa"
                      : "Cobertura incompleta"}
                  </p>
                  <p className="mt-1 text-sm text-slate-600">
                    {selectedCommission.temporalCoverage?.gaps.length ?? 0}{" "}
                    brechas temporales detectadas. Los solapamientos no inflan
                    el tiempo cubierto.
                  </p>
                  {selectedCommission.temporalCoverage?.gaps.length ? (
                    <ul className="mt-2 space-y-1 text-sm text-amber-900">
                      {selectedCommission.temporalCoverage.gaps.map((gap) => (
                        <li key={`${gap.startsAt}-${gap.endsAt}`}>
                          {formatInstant(
                            gap.startsAt,
                            selectedCommission.timeZone,
                          )}{" "}
                          —{" "}
                          {formatInstant(
                            gap.endsAt,
                            selectedCommission.timeZone,
                          )}
                        </li>
                      ))}
                    </ul>
                  ) : null}
                </div>
                {canLegal ? (
                  <form
                    className="mt-4 grid gap-4 md:grid-cols-2"
                    onSubmit={(event) => {
                      event.preventDefault();
                      const data = new FormData(event.currentTarget);
                      void run(
                        "coverage",
                        () =>
                          createScrutinyCoverage(selectedCommission.id, {
                            witnessId: value(data, "witnessId"),
                            credentialDocumentId: value(
                              data,
                              "credentialDocumentId",
                            ),
                            credentialReference: value(
                              data,
                              "credentialReference",
                            ),
                            validFrom: instant(value(data, "validFrom")),
                            validUntil: instant(value(data, "validUntil")),
                            shiftStartsAt: instant(
                              value(data, "shiftStartsAt"),
                            ),
                            shiftEndsAt: instant(value(data, "shiftEndsAt")),
                            status: "CONFIRMED",
                          }),
                        "Turno E-16 incorporado; la cobertura temporal fue recalculada.",
                      );
                    }}
                  >
                    <Field label="Testigo activo">
                      <UserSelect name="witnessId" />
                    </Field>
                    <Field label="Credencial E-16 aprobada">
                      <select
                        className={inputClass}
                        name="credentialDocumentId"
                        required
                      >
                        <option value="">Selecciona…</option>
                        {approvedDocuments
                          .filter(({ type }) => type === "E16_CREDENTIAL")
                          .map((document) => (
                            <option key={document.id} value={document.id}>
                              {document.versionLabel} ·{" "}
                              {document.sha256.slice(0, 12)}
                            </option>
                          ))}
                      </select>
                    </Field>
                    <Field label="Referencia de credencial">
                      <input
                        className={inputClass}
                        name="credentialReference"
                        required
                        minLength={3}
                        maxLength={200}
                      />
                    </Field>
                    <span />
                    <Field label="Vigente desde">
                      <input
                        className={inputClass}
                        name="validFrom"
                        type="datetime-local"
                        required
                      />
                    </Field>
                    <Field label="Vigente hasta">
                      <input
                        className={inputClass}
                        name="validUntil"
                        type="datetime-local"
                        required
                      />
                    </Field>
                    <Field label="Inicio del turno">
                      <input
                        className={inputClass}
                        name="shiftStartsAt"
                        type="datetime-local"
                        required
                      />
                    </Field>
                    <Field label="Fin del turno">
                      <input
                        className={inputClass}
                        name="shiftEndsAt"
                        type="datetime-local"
                        required
                      />
                    </Field>
                    <SubmitButton
                      busy={busy === "coverage"}
                      label="Asignar cobertura E-16"
                    />
                  </form>
                ) : null}
              </Workflow>

              {canLegal ? (
                <Workflow
                  title="4. Incorporar documento"
                  description="Calcula SHA-256 local, sube el binario directo a Supabase y notifica a Nest sólo con ruta y metadatos."
                >
                  <form
                    className="grid gap-4 md:grid-cols-2"
                    onSubmit={submitDocument}
                  >
                    <input
                      type="hidden"
                      name="commissionId"
                      value={selectedCommission.id}
                    />
                    <Field
                      label="Archivo privado"
                      hint="PDF, JPG, PNG o WebP; máximo 25 MB."
                    >
                      <input
                        className={inputClass}
                        name="file"
                        type="file"
                        accept="application/pdf,image/jpeg,image/png,image/webp"
                        required
                      />
                    </Field>
                    <Field label="Tipo documental">
                      <select className={inputClass} name="type">
                        {SCRUTINY_DOCUMENT_TYPES.map((type) => (
                          <option key={type} value={type}>
                            {DOCUMENT_LABELS[type]}
                          </option>
                        ))}
                      </select>
                    </Field>
                    <Field label="Estado probatorio">
                      <select
                        className={inputClass}
                        name="evidenceState"
                        defaultValue="INTERNAL"
                      >
                        <option value="INTERNAL">Interno · no oficial</option>
                        <option value="FILED">Radicado externamente</option>
                        <option value="DECIDED">Decisión externa</option>
                        <option value="OFFICIAL">
                          Documento oficial expedido
                        </option>
                      </select>
                    </Field>
                    <Field label="Versión/corte">
                      <input
                        className={inputClass}
                        name="versionLabel"
                        defaultValue="Original"
                        required
                        maxLength={80}
                      />
                    </Field>
                    <Field label="Emisor declarado">
                      <input
                        className={inputClass}
                        name="declaredIssuer"
                        required
                        minLength={2}
                        maxLength={300}
                      />
                    </Field>
                    <Field label="Instancia/autoridad">
                      <input
                        className={inputClass}
                        name="authorityInstance"
                        required
                        minLength={2}
                        maxLength={300}
                      />
                    </Field>
                    <Field label="Fecha de corte">
                      <input
                        className={inputClass}
                        name="cutoffAt"
                        type="datetime-local"
                        defaultValue={localNow()}
                        required
                      />
                    </Field>
                    <Field
                      label="Fecha externa"
                      hint="Obligatoria salvo para estado interno."
                    >
                      <input
                        className={inputClass}
                        name="externalAt"
                        type="datetime-local"
                      />
                    </Field>
                    <Field label="Canal externo">
                      <input
                        className={inputClass}
                        name="externalChannel"
                        maxLength={120}
                        placeholder="Ventanilla, audiencia, sistema…"
                      />
                    </Field>
                    <Field label="Radicado/referencia externa">
                      <input
                        className={inputClass}
                        name="externalReference"
                        maxLength={300}
                      />
                    </Field>
                    <div className="md:col-span-2">
                      <SubmitButton
                        busy={busy === "document"}
                        label="Subir e incorporar evidencia"
                      />
                    </div>
                  </form>
                </Workflow>
              ) : null}

              <Workflow
                title="5. Revisión y cadena de custodia"
                description="La revisión exige una persona distinta. La custodia es append-only y conserva tiempo ocurrido y tiempo recibido."
              >
                {commissionDocuments.length ? (
                  <div className="grid gap-3">
                    {commissionDocuments.map((document) => (
                      <article
                        key={document.id}
                        className="rounded-lg border border-slate-200 p-4"
                      >
                        <div className="flex flex-wrap items-start justify-between gap-3">
                          <div>
                            <p className="font-black text-slate-950">
                              {DOCUMENT_LABELS[document.type]}
                            </p>
                            <p className="mt-1 text-xs text-slate-500">
                              {document.versionLabel} · SHA{" "}
                              {document.sha256.slice(0, 16)}… · revisión{" "}
                              {document.reviewStatus}
                            </p>
                          </div>
                          <EvidenceBadge state={document.evidenceState} />
                        </div>
                        <p className="mt-2 text-xs text-slate-600">
                          Custodia: {document.custodyEvents.length} eventos
                        </p>
                        {canDownload ? (
                          <button
                            type="button"
                            className={`${secondaryButtonClass} mt-3`}
                            disabled={busy === `download-${document.id}`}
                            onClick={() =>
                              void run(
                                `download-${document.id}`,
                                async () => {
                                  const signed =
                                    await getScrutinyDocumentDownload(
                                      document.id,
                                    );
                                  setDownloadLink({
                                    documentId: document.id,
                                    ...signed,
                                  });
                                },
                                "URL privada preparada. Ábrela desde el enlace que aparece junto al documento.",
                              )
                            }
                          >
                            <Download className="h-4 w-4" aria-hidden="true" />
                            Preparar copia privada
                          </button>
                        ) : null}
                        {downloadLink?.documentId === document.id ? (
                          <p className="mt-3 text-xs text-slate-700">
                            <a
                              className="font-bold text-blue-700 underline underline-offset-2"
                              href={downloadLink.url}
                              target="_blank"
                              rel="noreferrer"
                            >
                              Descargar archivo autorizado
                            </a>{" "}
                            · vence el{" "}
                            {new Date(downloadLink.expiresAt).toLocaleString(
                              "es-CO",
                            )}
                          </p>
                        ) : null}
                      </article>
                    ))}
                  </div>
                ) : (
                  <p className="rounded-lg border border-dashed p-5 text-sm text-slate-500">
                    Esta comisión todavía no tiene documentos.
                  </p>
                )}
                <div className="mt-5 grid gap-6 xl:grid-cols-2">
                  {canLegal ? (
                    <form
                      className="grid content-start gap-3"
                      onSubmit={(event) => {
                        event.preventDefault();
                        const data = new FormData(event.currentTarget);
                        const document = commissionDocuments.find(
                          ({ id }) => id === value(data, "documentId"),
                        );
                        if (!document) return;
                        void run(
                          "document-review",
                          () =>
                            reviewScrutinyDocument(document.id, {
                              decision: value(data, "decision"),
                              reason: value(data, "reason"),
                              expectedVersion: document.version,
                            }),
                          "Revisión documental final registrada.",
                        );
                      }}
                    >
                      <h3 className="font-black">
                        Segunda revisión documental
                      </h3>
                      <Field label="Documento pendiente">
                        <select
                          className={inputClass}
                          name="documentId"
                          required
                        >
                          <option value="">Selecciona…</option>
                          {commissionDocuments
                            .filter(
                              ({ reviewStatus, createdById }) =>
                                reviewStatus === "PENDING" &&
                                createdById !== user?.id,
                            )
                            .map((document) => (
                              <option key={document.id} value={document.id}>
                                {DOCUMENT_LABELS[document.type]} ·{" "}
                                {document.versionLabel}
                              </option>
                            ))}
                        </select>
                      </Field>
                      <Field label="Decisión">
                        <select className={inputClass} name="decision">
                          <option value="APPROVE">Aprobar evidencia</option>
                          <option value="REJECT">Rechazar evidencia</option>
                        </select>
                      </Field>
                      <Field label="Motivo verificable">
                        <textarea
                          className={inputClass}
                          name="reason"
                          required
                          minLength={20}
                          maxLength={2000}
                          rows={3}
                        />
                      </Field>
                      <SubmitButton
                        busy={busy === "document-review"}
                        label="Registrar segunda revisión"
                      />
                    </form>
                  ) : null}
                  {canField ? (
                    <form
                      className="grid content-start gap-3"
                      onSubmit={(event) => {
                        event.preventDefault();
                        const data = new FormData(event.currentTarget);
                        const documentId = value(data, "documentId");
                        void run(
                          "custody",
                          () =>
                            recordScrutinyCustody(documentId, {
                              type: value(data, "type"),
                              occurredAt: instant(value(data, "occurredAt")),
                              ...(optionalValue(data, "fromCustodian")
                                ? {
                                    fromCustodian: value(data, "fromCustodian"),
                                  }
                                : {}),
                              toCustodian: value(data, "toCustodian"),
                              notes: value(data, "notes"),
                            }),
                          "Evento agregado a la cadena de custodia inmutable.",
                        );
                      }}
                    >
                      <h3 className="font-black">Evento de custodia</h3>
                      <Field label="Documento">
                        <select
                          className={inputClass}
                          name="documentId"
                          required
                        >
                          <option value="">Selecciona…</option>
                          {commissionDocuments.map((document) => (
                            <option key={document.id} value={document.id}>
                              {DOCUMENT_LABELS[document.type]} ·{" "}
                              {document.versionLabel}
                            </option>
                          ))}
                        </select>
                      </Field>
                      <Field label="Evento">
                        <select className={inputClass} name="type">
                          <option value="RECEIVED">Recibido</option>
                          <option value="VERIFIED">Verificado</option>
                          <option value="TRANSFERRED">Transferido</option>
                          <option value="SEALED">Sellado</option>
                          <option value="UNSEALED">Abierto</option>
                          <option value="DIGITIZED">Digitalizado</option>
                          <option value="SUBMITTED">Entregado</option>
                          <option value="RETURNED">Devuelto</option>
                        </select>
                      </Field>
                      <Field label="Fecha y hora ocurrida">
                        <input
                          className={inputClass}
                          name="occurredAt"
                          type="datetime-local"
                          defaultValue={localNow()}
                          required
                        />
                      </Field>
                      <Field label="Custodio anterior">
                        <input
                          className={inputClass}
                          name="fromCustodian"
                          maxLength={200}
                        />
                      </Field>
                      <Field label="Nuevo custodio">
                        <input
                          className={inputClass}
                          name="toCustodian"
                          required
                          minLength={2}
                          maxLength={200}
                        />
                      </Field>
                      <Field label="Observación">
                        <textarea
                          className={inputClass}
                          name="notes"
                          required
                          minLength={10}
                          maxLength={2000}
                          rows={3}
                        />
                      </Field>
                      <SubmitButton
                        busy={busy === "custody"}
                        label="Añadir evento de custodia"
                      />
                    </form>
                  ) : null}
                </div>
              </Workflow>

              <Workflow
                title="6. Diferencias entre fuentes"
                description="Conserva ambos valores, documentos aprobados, responsable y vencimiento; nunca reemplaza silenciosamente una cifra."
              >
                {overview.discrepancies.filter(
                  ({ commissionId }) => commissionId === selectedCommission.id,
                ).length ? (
                  <ul className="space-y-2">
                    {overview.discrepancies
                      .filter(
                        ({ commissionId }) =>
                          commissionId === selectedCommission.id,
                      )
                      .map((item) => (
                        <li
                          key={item.id}
                          className="rounded-lg border p-3 text-sm"
                        >
                          <div className="flex flex-wrap justify-between gap-2">
                            <strong>
                              {item.scopeReference} · {item.candidacyReference}
                            </strong>
                            <span>
                              {item.status} · {item.severity}
                            </span>
                          </div>
                          <p className="mt-1">
                            Valores preservados:{" "}
                            <strong>{item.sourceValue}</strong> vs.{" "}
                            <strong>{item.comparisonValue}</strong>. Vence{" "}
                            {formatInstant(item.dueAt)}.
                          </p>
                          {item.resolution ? (
                            <p className="mt-1 text-slate-600">
                              {item.resolution}
                            </p>
                          ) : null}
                        </li>
                      ))}
                  </ul>
                ) : (
                  <p className="rounded-lg border border-dashed p-4 text-sm text-slate-500">
                    No hay diferencias registradas para esta comisión.
                  </p>
                )}
                {canLegal ? (
                  <div className="mt-5 grid gap-6 xl:grid-cols-2">
                    <form
                      className="grid content-start gap-3"
                      onSubmit={(event) => {
                        event.preventDefault();
                        const data = new FormData(event.currentTarget);
                        void run(
                          "discrepancy",
                          () =>
                            createScrutinyDiscrepancy({
                              commissionId: selectedCommission.id,
                              sourceDocumentId: value(data, "sourceDocumentId"),
                              comparisonDocumentId: value(
                                data,
                                "comparisonDocumentId",
                              ),
                              scopeReference: value(data, "scopeReference"),
                              candidacyReference: value(
                                data,
                                "candidacyReference",
                              ),
                              sourceValue: Number(value(data, "sourceValue")),
                              comparisonValue: Number(
                                value(data, "comparisonValue"),
                              ),
                              classification: value(data, "classification"),
                              severity: value(data, "severity"),
                              responsibleUserId: value(
                                data,
                                "responsibleUserId",
                              ),
                              dueAt: instant(value(data, "dueAt")),
                            }),
                          "Diferencia registrada sin alterar ninguna de las fuentes.",
                        );
                      }}
                    >
                      <h3 className="font-black">Registrar diferencia</h3>
                      <Field label="Fuente A aprobada">
                        <select
                          className={inputClass}
                          name="sourceDocumentId"
                          required
                        >
                          <option value="">Selecciona…</option>
                          {approvedDocuments.map((document) => (
                            <option key={document.id} value={document.id}>
                              {DOCUMENT_LABELS[document.type]} ·{" "}
                              {document.versionLabel}
                            </option>
                          ))}
                        </select>
                      </Field>
                      <Field label="Fuente B aprobada">
                        <select
                          className={inputClass}
                          name="comparisonDocumentId"
                          required
                        >
                          <option value="">Selecciona…</option>
                          {approvedDocuments.map((document) => (
                            <option key={document.id} value={document.id}>
                              {DOCUMENT_LABELS[document.type]} ·{" "}
                              {document.versionLabel}
                            </option>
                          ))}
                        </select>
                      </Field>
                      <Field label="Ámbito/mesa">
                        <input
                          className={inputClass}
                          name="scopeReference"
                          required
                        />
                      </Field>
                      <Field label="Candidatura/opción">
                        <input
                          className={inputClass}
                          name="candidacyReference"
                          required
                        />
                      </Field>
                      <Field label="Valor A">
                        <input
                          className={inputClass}
                          name="sourceValue"
                          type="number"
                          min={0}
                          required
                        />
                      </Field>
                      <Field label="Valor B">
                        <input
                          className={inputClass}
                          name="comparisonValue"
                          type="number"
                          min={0}
                          required
                        />
                      </Field>
                      <Field label="Clasificación">
                        <input
                          className={inputClass}
                          name="classification"
                          required
                          minLength={3}
                          maxLength={120}
                        />
                      </Field>
                      <Field label="Severidad">
                        <select className={inputClass} name="severity">
                          <option value="LOW">Baja</option>
                          <option value="MEDIUM">Media</option>
                          <option value="HIGH">Alta</option>
                          <option value="CRITICAL">Crítica</option>
                        </select>
                      </Field>
                      <Field label="Responsable">
                        <UserSelect name="responsibleUserId" />
                      </Field>
                      <Field label="Término">
                        <input
                          className={inputClass}
                          name="dueAt"
                          type="datetime-local"
                          required
                        />
                      </Field>
                      <SubmitButton
                        busy={busy === "discrepancy"}
                        label="Registrar diferencia"
                      />
                    </form>
                    <form
                      className="grid content-start gap-3"
                      onSubmit={(event) => {
                        event.preventDefault();
                        const data = new FormData(event.currentTarget);
                        const discrepancy = overview.discrepancies.find(
                          ({ id }) => id === value(data, "discrepancyId"),
                        );
                        if (!discrepancy) return;
                        void run(
                          "resolve-discrepancy",
                          () =>
                            resolveScrutinyDiscrepancy(discrepancy.id, {
                              status: value(data, "status"),
                              resolution: value(data, "resolution"),
                              resolutionDocumentId: value(
                                data,
                                "resolutionDocumentId",
                              ),
                              expectedVersion: discrepancy.version,
                            }),
                          "Diferencia cerrada con soporte externo aprobado.",
                        );
                      }}
                    >
                      <h3 className="font-black">Resolver diferencia</h3>
                      <Field label="Diferencia abierta">
                        <select
                          className={inputClass}
                          name="discrepancyId"
                          required
                        >
                          <option value="">Selecciona…</option>
                          {overview.discrepancies
                            .filter(
                              ({ commissionId, status }) =>
                                commissionId === selectedCommission.id &&
                                (status === "OPEN" ||
                                  status === "UNDER_REVIEW"),
                            )
                            .map((item) => (
                              <option key={item.id} value={item.id}>
                                {item.scopeReference} · {item.sourceValue}/
                                {item.comparisonValue}
                              </option>
                            ))}
                        </select>
                      </Field>
                      <Field label="Conclusión">
                        <select className={inputClass} name="status">
                          <option value="EXPLAINED">Explicada</option>
                          <option value="DISMISSED">Descartada</option>
                        </select>
                      </Field>
                      <Field label="Soporte de decisión aprobado">
                        <select
                          className={inputClass}
                          name="resolutionDocumentId"
                          required
                        >
                          <option value="">Selecciona…</option>
                          {approvedDocuments
                            .filter(
                              ({ evidenceState }) =>
                                evidenceState === "DECIDED" ||
                                evidenceState === "OFFICIAL",
                            )
                            .map((document) => (
                              <option key={document.id} value={document.id}>
                                {DOCUMENT_LABELS[document.type]} ·{" "}
                                {
                                  SCRUTINY_EVIDENCE_LABELS[
                                    document.evidenceState
                                  ]
                                }
                              </option>
                            ))}
                        </select>
                      </Field>
                      <Field label="Explicación final">
                        <textarea
                          className={inputClass}
                          name="resolution"
                          minLength={30}
                          maxLength={3000}
                          rows={5}
                          required
                        />
                      </Field>
                      <SubmitButton
                        busy={busy === "resolve-discrepancy"}
                        label="Cerrar diferencia"
                      />
                    </form>
                  </div>
                ) : null}
              </Workflow>

              <Workflow
                title="7. Solicitudes, reclamaciones y apelaciones"
                description="Legitimación, causal, hechos, fundamento, autoridad, término, versiones, revisión y radicación separadas por actor."
              >
                {overview.actions.filter(
                  ({ commissionId }) => commissionId === selectedCommission.id,
                ).length ? (
                  <div className="grid gap-3">
                    {overview.actions
                      .filter(
                        ({ commissionId }) =>
                          commissionId === selectedCommission.id,
                      )
                      .map((action) => (
                        <article
                          key={action.id}
                          className="rounded-lg border p-4"
                        >
                          <div className="flex flex-wrap items-start justify-between gap-2">
                            <div>
                              <p className="font-black">
                                {ACTION_LABELS[action.type]} ·{" "}
                                {action.legalGroundCode}
                              </p>
                              <p className="text-xs text-slate-500">
                                v{action.currentVersion} / control{" "}
                                {action.version} · vence{" "}
                                {formatInstant(action.deadlineAt)}
                              </p>
                            </div>
                            <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-bold">
                              {ACTION_STATUS_LABELS[action.status]}
                            </span>
                          </div>
                          <p className="mt-2 text-sm text-slate-700">
                            {action.facts}
                          </p>
                          {action.decision ? (
                            <p className="mt-2 rounded bg-violet-50 p-2 text-sm">
                              <strong>Decisión incorporada:</strong>{" "}
                              {action.decision.outcome}; revisión{" "}
                              {action.decision.reviewStatus}. Esto no equivale
                              por sí solo a una declaración de resultado
                              oficial.
                            </p>
                          ) : null}
                        </article>
                      ))}
                  </div>
                ) : (
                  <p className="rounded-lg border border-dashed p-4 text-sm text-slate-500">
                    No existen actuaciones jurídicas en esta comisión.
                  </p>
                )}
                {canLegal ? (
                  <div className="mt-5 grid gap-6 xl:grid-cols-2">
                    <form
                      className="grid content-start gap-3"
                      onSubmit={(event) => {
                        event.preventDefault();
                        const data = new FormData(event.currentTarget);
                        const type = value(data, "type");
                        void run(
                          "action-create",
                          () =>
                            createScrutinyAction({
                              commissionId: selectedCommission.id,
                              type,
                              ...(type === "APPEAL"
                                ? {
                                    parentActionId: value(
                                      data,
                                      "parentActionId",
                                    ),
                                  }
                                : {}),
                              standingType: value(data, "standingType"),
                              standingBasis: value(data, "standingBasis"),
                              ...(optionalValue(data, "accreditedCoverageId")
                                ? {
                                    accreditedCoverageId: value(
                                      data,
                                      "accreditedCoverageId",
                                    ),
                                  }
                                : {}),
                              legalGroundCode: value(
                                data,
                                "legalGroundCode",
                              ).toUpperCase(),
                              legalGroundVersion: value(
                                data,
                                "legalGroundVersion",
                              ),
                              legalGroundSourceUrl: value(
                                data,
                                "legalGroundSourceUrl",
                              ),
                              facts: value(data, "facts"),
                              legalBasis: value(data, "legalBasis"),
                              affectedReferences: value(
                                data,
                                "affectedReferences",
                              )
                                .split("\n")
                                .map((item) => item.trim())
                                .filter(Boolean),
                              authority: value(data, "authority"),
                              deadlineAt: instant(value(data, "deadlineAt")),
                              deadlineRule: value(data, "deadlineRule"),
                              timeZone: value(data, "timeZone"),
                              text: value(data, "text"),
                            }),
                          "Borrador jurídico creado. Todavía no está radicado ni decidido.",
                        );
                      }}
                    >
                      <h3 className="font-black">Redactar actuación interna</h3>
                      <Field label="Tipo">
                        <select className={inputClass} name="type">
                          <option value="REQUEST">Solicitud</option>
                          <option value="CLAIM">Reclamación</option>
                          <option value="APPEAL">Apelación</option>
                          <option value="NULLITY_REQUEST">
                            Solicitud de nulidad
                          </option>
                        </select>
                      </Field>
                      <Field label="Actuación padre (sólo apelación)">
                        <select className={inputClass} name="parentActionId">
                          <option value="">No aplica</option>
                          {overview.actions
                            .filter(
                              ({ commissionId, status }) =>
                                commissionId === selectedCommission.id &&
                                status === "DECIDED_EXTERNAL",
                            )
                            .map((action) => (
                              <option key={action.id} value={action.id}>
                                {ACTION_LABELS[action.type]} ·{" "}
                                {action.legalGroundCode}
                              </option>
                            ))}
                        </select>
                      </Field>
                      <Field label="Legitimación">
                        <select className={inputClass} name="standingType">
                          <option value="CANDIDATE">Candidatura</option>
                          <option value="ATTORNEY">Apoderado</option>
                          <option value="ACCREDITED_WITNESS">
                            Testigo acreditado
                          </option>
                          <option value="PARTY_MOVEMENT">
                            Partido/movimiento
                          </option>
                          <option value="OTHER">Otra</option>
                        </select>
                      </Field>
                      <Field label="Fundamento de legitimación">
                        <textarea
                          className={inputClass}
                          name="standingBasis"
                          minLength={10}
                          maxLength={1000}
                          required
                          rows={2}
                        />
                      </Field>
                      <Field label="Cobertura E-16 acreditada">
                        <select
                          className={inputClass}
                          name="accreditedCoverageId"
                        >
                          <option value="">No aplica</option>
                          {selectedCommission.coverage
                            .filter(({ status }) => status === "CONFIRMED")
                            .map((coverage) => (
                              <option key={coverage.id} value={coverage.id}>
                                {coverage.witness?.name ?? coverage.witnessId} ·{" "}
                                {coverage.credentialReference}
                              </option>
                            ))}
                        </select>
                      </Field>
                      <Field label="Código de causal">
                        <input
                          className={inputClass}
                          name="legalGroundCode"
                          required
                        />
                      </Field>
                      <Field label="Versión normativa">
                        <input
                          className={inputClass}
                          name="legalGroundVersion"
                          required
                          minLength={2}
                        />
                      </Field>
                      <Field label="Fuente jurídica HTTPS">
                        <input
                          className={inputClass}
                          name="legalGroundSourceUrl"
                          type="url"
                          required
                        />
                      </Field>
                      <Field label="Hechos">
                        <textarea
                          className={inputClass}
                          name="facts"
                          minLength={30}
                          maxLength={8000}
                          rows={4}
                          required
                        />
                      </Field>
                      <Field label="Fundamento jurídico">
                        <textarea
                          className={inputClass}
                          name="legalBasis"
                          minLength={30}
                          maxLength={8000}
                          rows={4}
                          required
                        />
                      </Field>
                      <Field
                        label="Referencias afectadas"
                        hint="Una mesa, zona, candidatura o documento por línea."
                      >
                        <textarea
                          className={inputClass}
                          name="affectedReferences"
                          required
                          rows={3}
                        />
                      </Field>
                      <Field label="Autoridad competente">
                        <input
                          className={inputClass}
                          name="authority"
                          required
                        />
                      </Field>
                      <Field label="Vencimiento">
                        <input
                          className={inputClass}
                          name="deadlineAt"
                          type="datetime-local"
                          required
                        />
                      </Field>
                      <Field label="Regla de cómputo del término">
                        <textarea
                          className={inputClass}
                          name="deadlineRule"
                          minLength={20}
                          maxLength={2000}
                          required
                          rows={3}
                        />
                      </Field>
                      <Field label="Zona horaria">
                        <input
                          className={inputClass}
                          name="timeZone"
                          defaultValue="America/Bogota"
                          required
                        />
                      </Field>
                      <Field label="Texto íntegro del escrito">
                        <textarea
                          className={inputClass}
                          name="text"
                          minLength={50}
                          maxLength={12000}
                          required
                          rows={7}
                        />
                      </Field>
                      <SubmitButton
                        busy={busy === "action-create"}
                        label="Crear borrador interno"
                      />
                    </form>
                    <ActionProgressForms
                      actions={overview.actions.filter(
                        ({ commissionId }) =>
                          commissionId === selectedCommission.id,
                      )}
                      documents={approvedDocuments}
                      busy={busy}
                      run={run}
                      pendingDecisions={pendingDecisions}
                    />
                  </div>
                ) : null}
              </Workflow>

              <Workflow
                title="8. Declaración y resultado documentado"
                description="Sólo una fuente OFFICIAL aprobada puede sustentar la declaración; una segunda persona debe confirmarla antes de mostrarla como oficial."
              >
                {overview.declarations.length ? (
                  <div className="grid gap-3">
                    {overview.declarations.map((declaration) => (
                      <article
                        key={declaration.id}
                        className={`rounded-lg border p-4 ${declaration.status === "OFFICIAL" ? "border-emerald-300 bg-emerald-50" : "border-slate-200"}`}
                      >
                        <div className="flex flex-wrap justify-between gap-2">
                          <p className="font-black">
                            {declaration.scopeReference}
                          </p>
                          <span className="text-xs font-bold">
                            {declaration.status === "OFFICIAL"
                              ? "Resultado oficial documentado"
                              : declaration.status === "DRAFT_INTERNAL"
                                ? "Borrador interno · no es resultado oficial"
                                : "Borrador rechazado · no oficial"}
                          </span>
                        </div>
                        <p className="mt-1 text-sm">
                          {declaration.authority} ·{" "}
                          {declaration.authorityReference}
                        </p>
                        <ul className="mt-3 grid gap-2 sm:grid-cols-2">
                          {declaration.lines.map((line) => (
                            <li
                              key={line.id}
                              className="rounded bg-white p-2 text-sm"
                            >
                              <strong>{line.optionLabel}</strong>
                              <br />
                              {line.votes ?? "Sin cifra declarada"} votos ·{" "}
                              {line.seats ?? "—"} curules ·{" "}
                              {line.declaredStatus}
                            </li>
                          ))}
                        </ul>
                      </article>
                    ))}
                  </div>
                ) : (
                  <p className="rounded-lg border border-dashed p-4 text-sm text-slate-500">
                    No se ha incorporado ninguna declaración. No hay un
                    resultado oficial dentro del sistema.
                  </p>
                )}
                {canLegal ? (
                  <div className="mt-5 grid gap-6 xl:grid-cols-2">
                    <form
                      className="grid content-start gap-3"
                      onSubmit={(event) => {
                        event.preventDefault();
                        const data = new FormData(event.currentTarget);
                        const lines = value(data, "lines")
                          .split("\n")
                          .filter(Boolean)
                          .map((raw) => {
                            const [
                              optionCode,
                              optionLabel,
                              votes,
                              seats,
                              declaredStatus,
                            ] = raw.split("|").map((part) => part.trim());
                            return {
                              optionCode,
                              optionLabel,
                              ...(votes ? { votes: Number(votes) } : {}),
                              ...(seats ? { seats: Number(seats) } : {}),
                              declaredStatus,
                            };
                          });
                        void run(
                          "declaration",
                          () =>
                            createScrutinyDeclaration({
                              commissionId: selectedCommission.id,
                              scopeReference: value(data, "scopeReference"),
                              authority: value(data, "authority"),
                              authorityReference: value(
                                data,
                                "authorityReference",
                              ),
                              declaredAt: instant(value(data, "declaredAt")),
                              officialDocumentId: value(
                                data,
                                "officialDocumentId",
                              ),
                              lines,
                            }),
                          "Borrador de declaración incorporado. Aún no es un resultado oficial hasta la segunda revisión.",
                        );
                      }}
                    >
                      <h3 className="font-black">
                        Incorporar borrador desde fuente oficial
                      </h3>
                      <Field label="Documento OFFICIAL aprobado">
                        <select
                          className={inputClass}
                          name="officialDocumentId"
                          required
                        >
                          <option value="">Selecciona…</option>
                          {approvedDocuments
                            .filter(
                              ({ evidenceState, type }) =>
                                evidenceState === "OFFICIAL" &&
                                (type === "DECLARATION_CREDENTIAL" ||
                                  type === "RESOLUTION"),
                            )
                            .map((document) => (
                              <option key={document.id} value={document.id}>
                                {DOCUMENT_LABELS[document.type]} ·{" "}
                                {document.externalReference}
                              </option>
                            ))}
                        </select>
                      </Field>
                      <Field label="Ámbito declarado">
                        <input
                          className={inputClass}
                          name="scopeReference"
                          required
                        />
                      </Field>
                      <Field label="Autoridad que declara">
                        <input
                          className={inputClass}
                          name="authority"
                          required
                        />
                      </Field>
                      <Field label="Referencia oficial">
                        <input
                          className={inputClass}
                          name="authorityReference"
                          required
                        />
                      </Field>
                      <Field label="Fecha declarada">
                        <input
                          className={inputClass}
                          name="declaredAt"
                          type="datetime-local"
                          required
                        />
                      </Field>
                      <Field
                        label="Líneas declaradas"
                        hint="Una por línea: código | nombre | votos (opcional) | curules (opcional) | estado."
                      >
                        <textarea
                          className={inputClass}
                          name="lines"
                          required
                          rows={5}
                          placeholder="001 | Candidatura A | 1234 | 1 | ELECTO"
                        />
                      </Field>
                      <SubmitButton
                        busy={busy === "declaration"}
                        label="Crear borrador no oficial"
                      />
                    </form>
                    <form
                      className="grid content-start gap-3"
                      onSubmit={(event) => {
                        event.preventDefault();
                        const data = new FormData(event.currentTarget);
                        const declaration = overview.declarations.find(
                          ({ id }) => id === value(data, "declarationId"),
                        );
                        if (!declaration) return;
                        void run(
                          "declaration-review",
                          () =>
                            reviewScrutinyDeclaration(declaration.id, {
                              expectedVersion: declaration.version,
                              decision: value(data, "decision"),
                              reviewNote: value(data, "reviewNote"),
                            }),
                          "Segunda revisión de la declaración registrada.",
                        );
                      }}
                    >
                      <h3 className="font-black">
                        Segunda revisión de declaración
                      </h3>
                      <Field label="Borrador ajeno pendiente">
                        <select
                          className={inputClass}
                          name="declarationId"
                          required
                        >
                          <option value="">Selecciona…</option>
                          {overview.declarations
                            .filter(
                              ({ status, recordedById }) =>
                                status === "DRAFT_INTERNAL" &&
                                recordedById !== user?.id,
                            )
                            .map((declaration) => (
                              <option
                                key={declaration.id}
                                value={declaration.id}
                              >
                                {declaration.scopeReference} ·{" "}
                                {declaration.authorityReference}
                              </option>
                            ))}
                        </select>
                      </Field>
                      <Field label="Decisión">
                        <select className={inputClass} name="decision">
                          <option value="APPROVE">
                            Confirmar como oficial documentado
                          </option>
                          <option value="REJECT">Rechazar como interno</option>
                        </select>
                      </Field>
                      <Field label="Nota de revisión">
                        <textarea
                          className={inputClass}
                          name="reviewNote"
                          required
                          minLength={20}
                          maxLength={2000}
                          rows={4}
                        />
                      </Field>
                      <SubmitButton
                        busy={busy === "declaration-review"}
                        label="Registrar revisión independiente"
                      />
                    </form>
                  </div>
                ) : null}
              </Workflow>
            </>
          ) : null}

          {!canLegal && !canField ? (
            <section className="rounded-xl border border-slate-200 bg-white p-4 text-sm text-slate-700">
              <ShieldCheck
                className="mb-2 h-6 w-6 text-blue-700"
                aria-hidden="true"
              />
              <strong>Vista especializada de consulta.</strong> Tu rol puede
              auditar el expediente, sus estados y bloqueos, pero no
              modificarlo.
            </section>
          ) : null}
        </>
      ) : null}
    </main>
  );
}

function ActionProgressForms({
  actions,
  documents,
  pendingDecisions,
  busy,
  run,
}: {
  actions: ScrutinyAction[];
  documents: ScrutinyDocument[];
  pendingDecisions: NonNullable<ScrutinyAction["decision"]>[];
  busy: string | null;
  run: (
    key: string,
    operation: () => Promise<unknown>,
    success: string,
  ) => Promise<boolean>;
}) {
  const drafts = actions.filter(({ status }) => status === "DRAFT");
  const approved = actions.filter(
    ({ status }) => status === "APPROVED_INTERNAL",
  );
  const filed = actions.filter(({ status }) => status === "FILED_EXTERNAL");
  return (
    <div className="grid content-start gap-5">
      <form
        className="grid gap-3 rounded-lg border p-4"
        onSubmit={(event) => {
          event.preventDefault();
          const data = new FormData(event.currentTarget);
          const action = drafts.find(
            ({ id }) => id === value(data, "actionId"),
          );
          if (!action) return;
          void run(
            "action-version",
            () =>
              addScrutinyActionVersion(action.id, {
                expectedVersion: action.version,
                text: value(data, "text"),
              }),
            "Nueva versión inmutable del borrador registrada.",
          );
        }}
      >
        <h3 className="font-black">Nueva versión de borrador</h3>
        <ActionSelect name="actionId" actions={drafts} />
        <Field label="Texto íntegro revisado">
          <textarea
            className={inputClass}
            name="text"
            minLength={50}
            maxLength={12000}
            rows={4}
            required
          />
        </Field>
        <SubmitButton
          busy={busy === "action-version"}
          label="Agregar versión"
        />
      </form>
      <form
        className="grid gap-3 rounded-lg border p-4"
        onSubmit={(event) => {
          event.preventDefault();
          const data = new FormData(event.currentTarget);
          const action = drafts.find(
            ({ id }) => id === value(data, "actionId"),
          );
          if (!action) return;
          void run(
            "action-approve",
            () =>
              approveScrutinyAction(action.id, {
                expectedVersion: action.version,
                reviewNote: value(data, "reviewNote"),
              }),
            "Borrador aprobado internamente por segunda persona; aún no está radicado.",
          );
        }}
      >
        <h3 className="font-black">Aprobar borrador por cuatro ojos</h3>
        <ActionSelect name="actionId" actions={drafts} />
        <Field label="Nota jurídica">
          <textarea
            className={inputClass}
            name="reviewNote"
            minLength={20}
            maxLength={2000}
            rows={3}
            required
          />
        </Field>
        <SubmitButton
          busy={busy === "action-approve"}
          label="Aprobar internamente"
        />
      </form>
      <form
        className="grid gap-3 rounded-lg border p-4"
        onSubmit={(event) => {
          event.preventDefault();
          const data = new FormData(event.currentTarget);
          const action = approved.find(
            ({ id }) => id === value(data, "actionId"),
          );
          if (!action) return;
          void run(
            "action-file",
            () =>
              fileScrutinyAction(action.id, {
                expectedVersion: action.version,
                supportDocumentId: value(data, "supportDocumentId"),
                filedAt: instant(value(data, "filedAt")),
                channel: value(data, "channel"),
                filingReference: value(data, "filingReference"),
              }),
            "Radicación externa registrada con soporte FILED aprobado.",
          );
        }}
      >
        <h3 className="font-black">Registrar radicación externa</h3>
        <ActionSelect name="actionId" actions={approved} />
        <Field label="Soporte FILED aprobado">
          <DocumentSelect
            name="supportDocumentId"
            documents={documents.filter(
              ({ evidenceState }) => evidenceState === "FILED",
            )}
          />
        </Field>
        <Field label="Fecha de radicación">
          <input
            className={inputClass}
            name="filedAt"
            type="datetime-local"
            required
          />
        </Field>
        <Field label="Canal">
          <input
            className={inputClass}
            name="channel"
            minLength={2}
            maxLength={120}
            required
          />
        </Field>
        <Field label="Radicado">
          <input
            className={inputClass}
            name="filingReference"
            minLength={2}
            maxLength={300}
            required
          />
        </Field>
        <SubmitButton
          busy={busy === "action-file"}
          label="Marcar como radicada"
        />
      </form>
      <form
        className="grid gap-3 rounded-lg border p-4"
        onSubmit={(event) => {
          event.preventDefault();
          const data = new FormData(event.currentTarget);
          const action = filed.find(({ id }) => id === value(data, "actionId"));
          if (!action) return;
          const notificationDocumentId = optionalValue(
            data,
            "notificationDocumentId",
          );
          const notifiedAt = optionalValue(data, "notifiedAt");
          void run(
            "decision",
            () =>
              recordScrutinyDecision(action.id, {
                expectedVersion: action.version,
                outcome: value(data, "outcome"),
                authority: value(data, "authority"),
                decidedAt: instant(value(data, "decidedAt")),
                decisionDocumentId: value(data, "decisionDocumentId"),
                ...(notificationDocumentId && notifiedAt
                  ? { notificationDocumentId, notifiedAt: instant(notifiedAt) }
                  : {}),
                reasoning: value(data, "reasoning"),
              }),
            "Decisión externa incorporada y pendiente de segunda revisión.",
          );
        }}
      >
        <h3 className="font-black">Incorporar decisión externa</h3>
        <ActionSelect name="actionId" actions={filed} />
        <Field label="Resultado">
          <select className={inputClass} name="outcome">
            <option value="GRANTED">Concedida</option>
            <option value="PARTIALLY_GRANTED">Concedida parcialmente</option>
            <option value="DENIED">Negada</option>
            <option value="REJECTED_INADMISSIBLE">
              Rechazada por inadmisible
            </option>
            <option value="DISMISSED">Desestimada</option>
            <option value="OTHER">Otra</option>
          </select>
        </Field>
        <Field label="Autoridad">
          <input className={inputClass} name="authority" required />
        </Field>
        <Field label="Fecha de decisión">
          <input
            className={inputClass}
            name="decidedAt"
            type="datetime-local"
            required
          />
        </Field>
        <Field label="Documento DECIDED/OFFICIAL aprobado">
          <DocumentSelect
            name="decisionDocumentId"
            documents={documents.filter(
              ({ evidenceState }) =>
                evidenceState === "DECIDED" || evidenceState === "OFFICIAL",
            )}
          />
        </Field>
        <Field label="Documento de notificación (opcional)">
          <DocumentSelect
            name="notificationDocumentId"
            documents={documents.filter(
              ({ evidenceState }) =>
                evidenceState === "DECIDED" || evidenceState === "OFFICIAL",
            )}
            optional
          />
        </Field>
        <Field label="Fecha de notificación (si hay documento)">
          <input
            className={inputClass}
            name="notifiedAt"
            type="datetime-local"
          />
        </Field>
        <Field label="Motivación de la decisión">
          <textarea
            className={inputClass}
            name="reasoning"
            minLength={30}
            maxLength={4000}
            rows={4}
            required
          />
        </Field>
        <SubmitButton busy={busy === "decision"} label="Incorporar decisión" />
      </form>
      <form
        className="grid gap-3 rounded-lg border p-4"
        onSubmit={(event) => {
          event.preventDefault();
          const data = new FormData(event.currentTarget);
          const decision = pendingDecisions.find(
            ({ id }) => id === value(data, "decisionId"),
          );
          if (!decision) return;
          void run(
            "decision-review",
            () =>
              reviewScrutinyDecision(decision.id, {
                expectedVersion: decision.version,
                decision: value(data, "decision"),
                reviewNote: value(data, "reviewNote"),
              }),
            "Segunda revisión de decisión registrada.",
          );
        }}
      >
        <h3 className="font-black">Segunda revisión de decisión</h3>
        <Field label="Decisión pendiente">
          <select className={inputClass} name="decisionId" required>
            <option value="">Selecciona…</option>
            {pendingDecisions.map((decision) => (
              <option key={decision.id} value={decision.id}>
                {decision.authority} · {decision.outcome}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Control">
          <select className={inputClass} name="decision">
            <option value="APPROVE">Aprobar incorporación</option>
            <option value="REJECT">Rechazar incorporación</option>
          </select>
        </Field>
        <Field label="Nota de revisión">
          <textarea
            className={inputClass}
            name="reviewNote"
            minLength={20}
            maxLength={2000}
            rows={3}
            required
          />
        </Field>
        <SubmitButton
          busy={busy === "decision-review"}
          label="Registrar revisión"
        />
      </form>
    </div>
  );
}

function ActionSelect({
  name,
  actions,
}: {
  name: string;
  actions: ScrutinyAction[];
}) {
  return (
    <Field label="Actuación">
      <select className={inputClass} name={name} required>
        <option value="">Selecciona…</option>
        {actions.map((action) => (
          <option key={action.id} value={action.id}>
            {ACTION_LABELS[action.type]} · {action.legalGroundCode} · v
            {action.version}
          </option>
        ))}
      </select>
    </Field>
  );
}

function DocumentSelect({
  name,
  documents,
  optional = false,
}: {
  name: string;
  documents: ScrutinyDocument[];
  optional?: boolean;
}) {
  return (
    <select className={inputClass} name={name} required={!optional}>
      <option value="">{optional ? "Sin documento" : "Selecciona…"}</option>
      {documents.map((document) => (
        <option key={document.id} value={document.id}>
          {DOCUMENT_LABELS[document.type]} ·{" "}
          {SCRUTINY_EVIDENCE_LABELS[document.evidenceState]} ·{" "}
          {document.versionLabel}
        </option>
      ))}
    </select>
  );
}
