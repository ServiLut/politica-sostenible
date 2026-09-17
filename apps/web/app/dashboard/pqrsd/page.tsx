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
  FileLock2,
  Loader2,
  RefreshCw,
  ShieldCheck,
} from "lucide-react";
import { useAuth } from "@/context/auth";
import { ApiError } from "@/lib/api-client";
import {
  uploadFileDirectlyWithClientDeclaredHash,
} from "@/lib/direct-storage-upload";
import { readEntityDeepLink } from "@/lib/entity-deep-links";
import {
  PQRSD_DOCUMENT_TYPES,
  attachPqrsdDocument,
  authorizePqrsdResponse,
  closePqrsdDossier,
  createPqrsdDossier,
  createPqrsdResponseVersion,
  createPqrsdRulePackage,
  getPqrsdDetail,
  getPqrsdDocumentDownload,
  getPqrsdOverview,
  proposePqrsdClassification,
  proposePqrsdExtension,
  proposePqrsdTransfer,
  recordPqrsdAcknowledgement,
  recordPqrsdAssignment,
  recordPqrsdDeliveryAttempt,
  recordPqrsdTransferAttempt,
  reopenPqrsdDossier,
  reviewPqrsdClassification,
  reviewPqrsdDocument,
  reviewPqrsdExtension,
  reviewPqrsdResponse,
  reviewPqrsdRulePackage,
  reviewPqrsdTransfer,
  type PqrsdDetail,
  type PqrsdOverview,
} from "@/lib/pqrsd-api";
import type { BackendUserRole } from "@/types/saas-schema";

const READ_ROLES = new Set<BackendUserRole>([
  "ADMIN",
  "CONSTITUENT_SERVICES_MANAGER",
  "CASE_WORKER",
  "COMPLIANCE_OFFICER",
  "AUDITOR",
]);
const INTAKE_ROLES = new Set<BackendUserRole>([
  "ADMIN",
  "CONSTITUENT_SERVICES_MANAGER",
  "CASE_WORKER",
]);
const REVIEW_ROLES = new Set<BackendUserRole>([
  "ADMIN",
  "CONSTITUENT_SERVICES_MANAGER",
  "COMPLIANCE_OFFICER",
]);
const AUTH_ROLES = new Set<BackendUserRole>(["ADMIN", "COMPLIANCE_OFFICER"]);

const inputClass =
  "mt-1 min-h-11 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-950 shadow-sm focus:border-blue-600 focus:outline-none focus:ring-2 focus:ring-blue-200 disabled:bg-slate-100";
const buttonClass =
  "inline-flex min-h-11 items-center justify-center gap-2 rounded-lg bg-blue-700 px-4 py-2 text-sm font-bold text-white shadow-sm hover:bg-blue-800 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50";
const secondaryButtonClass =
  "inline-flex min-h-11 items-center justify-center gap-2 rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-bold text-slate-800 hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50";

const DOCUMENT_LABELS: Record<string, string> = {
  INTAKE_ATTACHMENT: "Anexo de recepcion",
  RECEIPT_ACKNOWLEDGEMENT: "Acuse de recibo",
  CLASSIFICATION_SUPPORT: "Soporte de clasificacion",
  TRANSFER_SUPPORT: "Soporte para traslado",
  TRANSFER_PROOF: "Constancia de traslado",
  EXTENSION_SUPPORT: "Soporte de prorroga",
  RESPONSE_ATTACHMENT: "Anexo de respuesta",
  AUTHORIZATION_ARTIFACT: "Artefacto de autorizacion",
  DELIVERY_PROOF: "Constancia de entrega",
  CLOSURE_SUPPORT: "Soporte de cierre",
  REOPENING_SUPPORT: "Soporte de reapertura",
  OTHER: "Otro soporte",
};

const STATUS_LABELS: Record<string, string> = {
  RECEIVED: "Recibido internamente",
  CLASSIFICATION_PENDING: "Clasificacion pendiente",
  CLASSIFIED: "Clasificado",
  ASSIGNED: "Asignado con suplencia",
  IN_PROGRESS: "En gestion",
  TRANSFER_PENDING: "Traslado pendiente",
  WAITING_ON_PETITIONER: "Esperando a peticionario",
  EXTENSION_PROPOSED: "Prorroga propuesta · no vigente",
  DRAFT_RESPONSE: "Borrador de respuesta · no autorizado",
  RETURNED_FOR_CHANGES: "Devuelto para ajustes",
  REVIEWED: "Revisado · pendiente de autorizacion",
  AUTHORIZED: "Autorizado · no entregado",
  DELIVERY_PENDING: "Entrega pendiente",
  DELIVERED: "Entrega externa verificada",
  CLOSED: "Cerrado · solo lectura",
  REOPENED: "Reabierto con soporte",
  CANCELLED: "Cancelado documentado",
};

type WorkflowAction =
  | "DOCUMENT"
  | "DOCUMENT_REVIEW"
  | "ACK"
  | "CLASSIFY"
  | "CLASSIFY_REVIEW"
  | "ASSIGN"
  | "TRANSFER"
  | "TRANSFER_REVIEW"
  | "TRANSFER_ATTEMPT"
  | "EXTENSION"
  | "EXTENSION_REVIEW"
  | "RESPONSE"
  | "RESPONSE_REVIEW"
  | "AUTHORIZE"
  | "DELIVERY"
  | "CLOSE"
  | "REOPEN";

function readableError(error: unknown): string {
  if (error instanceof ApiError) return error.message;
  if (error instanceof Error && error.message) return error.message;
  return "No fue posible completar la operacion.";
}

function value(form: FormData, name: string): string {
  return String(form.get(name) ?? "").trim();
}

function optionalValue(form: FormData, name: string): string | undefined {
  return value(form, name) || undefined;
}

function instant(input: string): string {
  const date = new Date(input);
  if (!Number.isFinite(date.getTime())) {
    throw new Error("Completa una fecha y hora valida.");
  }
  return date.toISOString();
}

function localNow(offsetMinutes = 1): string {
  const date = new Date(Date.now() + offsetMinutes * 60_000);
  return new Date(date.getTime() - date.getTimezoneOffset() * 60_000)
    .toISOString()
    .slice(0, 16);
}

function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: ReactNode;
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
    <details open={open} className="rounded-xl border border-slate-200 bg-white shadow-sm">
      <summary className="cursor-pointer list-none px-4 py-4 focus:outline-none focus:ring-2 focus:ring-inset focus:ring-blue-600">
        <span className="block font-black text-slate-950">{title}</span>
        <span className="mt-1 block text-sm text-slate-600">{description}</span>
      </summary>
      <div className="border-t border-slate-200 p-4">{children}</div>
    </details>
  );
}

function SubmitButton({ busy, label }: { busy: boolean; label: string }) {
  return (
    <button type="submit" className={buttonClass} disabled={busy}>
      {busy ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : null}
      {label}
    </button>
  );
}

function DocumentSelect({
  documents,
  name,
  types,
  optional = false,
  label,
}: {
  documents: PqrsdDetail["documents"];
  name: string;
  types?: readonly string[];
  optional?: boolean;
  label: string;
}) {
  const options = types
    ? documents.filter((item) => types.includes(String(item.type)))
    : documents;
  return (
    <Field label={label}>
      <select name={name} required={!optional} className={inputClass}>
        {optional ? <option value="">Sin documento</option> : null}
        {options.map((item) => (
          <option key={item.id} value={item.id}>
            {DOCUMENT_LABELS[String(item.type)] ?? String(item.type)} · {item.id.slice(0, 8)}
          </option>
        ))}
      </select>
    </Field>
  );
}

export default function PqrsdPage() {
  const { user } = useAuth();
  const role = user?.backendRole;
  const canRead = Boolean(role && READ_ROLES.has(role));
  const canIntake = Boolean(role && INTAKE_ROLES.has(role));
  const canReview = Boolean(role && REVIEW_ROLES.has(role));
  const canAuthorize = Boolean(role && AUTH_ROLES.has(role));
  const [overview, setOverview] = useState<PqrsdOverview | null>(null);
  const [detail, setDetail] = useState<PqrsdDetail | null>(null);
  const [purpose, setPurpose] = useState(
    "Gestion del expediente solicitada por el usuario autorizado",
  );
  const [action, setAction] = useState<WorkflowAction>("DOCUMENT");
  const [loading, setLoading] = useState(true);
  const [detailLoading, setDetailLoading] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [revision, setRevision] = useState(0);
  const [download, setDownload] = useState<{ url: string; expiresAt: string } | null>(null);

  const load = useCallback(async (signal?: AbortSignal) => {
    const data = await getPqrsdOverview(signal);
    if (!signal?.aborted) setOverview(data);
    return data;
  }, []);

  const openDetail = useCallback(
    async (dossierId: string, accessPurpose: string) => {
      setDetailLoading(true);
      setError(null);
      try {
        const result = await getPqrsdDetail(dossierId, accessPurpose);
        setDetail(result);
      } catch (cause: unknown) {
        setError(readableError(cause));
      } finally {
        setDetailLoading(false);
      }
    },
    [],
  );

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError(null);
    void load(controller.signal)
      .then((data) => {
        const linked = readEntityDeepLink(window.location.search);
        if (linked && data.dossiers.some(({ id }) => id === linked)) {
          return openDetail(
            linked,
            "Revision operativa iniciada desde una alerta exacta del centro de gestion publica",
          );
        }
      })
      .catch((cause: unknown) => {
        if (!(cause instanceof DOMException && cause.name === "AbortError")) {
          setError(readableError(cause));
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [load, openDetail, revision]);

  async function run(
    key: string,
    operation: () => Promise<unknown>,
    success: string,
  ) {
    setBusy(key);
    setError(null);
    setNotice(null);
    try {
      await operation();
      setNotice(success);
      setRevision((current) => current + 1);
      if (detail) {
        await openDetail(
          detail.id,
          "Continuidad de gestion luego de una operacion registrada en el expediente",
        );
      }
    } catch (cause: unknown) {
      setError(readableError(cause));
    } finally {
      setBusy(null);
    }
  }

  const activePackages = useMemo(
    () => overview?.packages.filter(({ status }) => status === "ACTIVE") ?? [],
    [overview],
  );
  const draftPackages = useMemo(
    () => overview?.packages.filter(({ status }) => status === "DRAFT") ?? [],
    [overview],
  );
  if (!canRead) {
    return (
      <main className="p-6" aria-labelledby="pqrsd-title">
        <h1 id="pqrsd-title" className="text-2xl font-black text-slate-950">
          Expedientes formales PQRSD
        </h1>
        <p className="mt-3 rounded-lg border border-amber-300 bg-amber-50 p-4 text-amber-950">
          Tu rol no tiene acceso al expediente PQRSD sensible.
        </p>
      </main>
    );
  }

  return (
    <main className="space-y-6 p-4 md:p-6" aria-labelledby="pqrsd-title">
      <header className="rounded-2xl bg-slate-950 p-5 text-white md:p-7">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.18em] text-blue-200">
              Gestion publica · separado de CAS-GP y de campana
            </p>
            <h1 id="pqrsd-title" className="mt-2 text-2xl font-black md:text-3xl">
              Expediente PQRSD con control probatorio
            </h1>
            <p className="mt-2 max-w-3xl text-sm text-slate-200">
              Plazos desde paquetes aprobados, cuatro ojos y entrega externa solo con constancia.
              Los listados ocultan identidad y todo acceso al detalle queda auditado.
            </p>
          </div>
          <button
            type="button"
            className={secondaryButtonClass}
            onClick={() => setRevision((current) => current + 1)}
            disabled={loading}
          >
            <RefreshCw className="h-4 w-4" aria-hidden="true" />
            Reintentar carga
          </button>
        </div>
      </header>

      {error ? (
        <div role="alert" className="rounded-xl border border-red-300 bg-red-50 p-4 text-red-950">
          <p className="font-bold">No se completo la operacion</p>
          <p className="mt-1 text-sm">{error}</p>
        </div>
      ) : null}
      {notice ? (
        <div role="status" className="rounded-xl border border-emerald-300 bg-emerald-50 p-4 text-emerald-950">
          {notice}
        </div>
      ) : null}
      {download ? (
        <div role="status" className="rounded-xl border border-blue-300 bg-blue-50 p-4 text-blue-950">
          <a className="font-bold underline" href={download.url} target="_blank" rel="noreferrer">
            Abrir archivo privado
          </a>{" "}
          <span className="text-sm">(enlace temporal hasta {new Date(download.expiresAt).toLocaleTimeString("es-CO")})</span>
        </div>
      ) : null}

      {loading ? (
        <div role="status" className="flex min-h-40 items-center justify-center gap-3 text-slate-600">
          <Loader2 className="h-5 w-5 animate-spin" aria-hidden="true" />
          Cargando configuracion y expedientes…
        </div>
      ) : overview ? (
        <>
          <section
            className={`rounded-xl border p-4 ${overview.configurationReady ? "border-emerald-300 bg-emerald-50" : "border-amber-300 bg-amber-50"}`}
            aria-label="Estado institucional PQRSD"
          >
            <div className="flex items-start gap-3">
              {overview.configurationReady ? (
                <ShieldCheck className="mt-0.5 h-5 w-5 text-emerald-800" aria-hidden="true" />
              ) : (
                <AlertTriangle className="mt-0.5 h-5 w-5 text-amber-800" aria-hidden="true" />
              )}
              <div>
                <h2 className="font-black text-slate-950">
                  {overview.configurationReady
                    ? "Sistema interno configurado · entrega externa no automatizada"
                    : "Configuracion aprobada pendiente · recepcion formal bloqueada"}
                </h2>
                <p className="mt-1 text-sm text-slate-700">{overview.institutionalMessage}</p>
              </div>
            </div>
          </section>

          <section className="grid gap-4 md:grid-cols-3" aria-label="Resumen PQRSD">
            <article className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
              <p className="text-sm text-slate-600">Expedientes visibles</p>
              <p className="mt-1 text-3xl font-black text-slate-950">{overview.dossiers.length}</p>
            </article>
            <article className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
              <p className="text-sm text-slate-600">Alertas exactas</p>
              <p className="mt-1 text-3xl font-black text-slate-950">{overview.alerts.length}</p>
            </article>
            <article className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
              <p className="text-sm text-slate-600">Paquetes activos</p>
              <p className="mt-1 text-3xl font-black text-slate-950">{activePackages.length}</p>
            </article>
          </section>

          {canReview ? (
            <Workflow
              title="1. Paquete normativo y calendario"
              description="No existen plazos 10/15/30 por defecto. Registre fuente, vigencia, zona, metodo y regla explicita."
              open={!overview.configurationReady}
            >
              <RulePackageForm
                busy={busy === "package-create"}
                onSubmit={(input) =>
                  run(
                    "package-create",
                    () => createPqrsdRulePackage(input),
                    "Paquete creado como borrador. Otra persona debe decidirlo.",
                  )
                }
              />
              {draftPackages.length > 0 ? (
                <div className="mt-5 space-y-3 border-t border-slate-200 pt-5">
                  <h3 className="font-black text-slate-950">Borradores pendientes de cuatro ojos</h3>
                  {draftPackages.map((item) => (
                    <form
                      key={item.id}
                      className="grid gap-3 rounded-lg border border-slate-200 p-3 md:grid-cols-[1fr_2fr_auto]"
                      onSubmit={(event) => {
                        event.preventDefault();
                        const form = new FormData(event.currentTarget);
                        void run(
                          `package-review-${item.id}`,
                          () =>
                            reviewPqrsdRulePackage(item.id, {
                              decision: value(form, "decision"),
                              rationale: value(form, "rationale"),
                              expectedRevision: item.revision,
                            }),
                          "Decision independiente registrada.",
                        );
                      }}
                    >
                      <div>
                        <p className="font-bold">{item.scopeKey} · {item.versionLabel}</p>
                        <p className="text-xs text-slate-600">Preparado por {item.createdById}</p>
                      </div>
                      <div className="grid gap-2 sm:grid-cols-2">
                        <select name="decision" className={inputClass} aria-label={`Decision para ${item.versionLabel}`}>
                          <option value="APPROVE_ACTIVATE">Aprobar y activar</option>
                          <option value="REJECT">Rechazar</option>
                        </select>
                        <input name="rationale" required minLength={10} maxLength={2000} className={inputClass} aria-label={`Fundamento para ${item.versionLabel}`} placeholder="Fundamento independiente verificable" />
                      </div>
                      <SubmitButton busy={busy === `package-review-${item.id}`} label="Registrar decision" />
                    </form>
                  ))}
                </div>
              ) : null}
            </Workflow>
          ) : null}

          {canIntake ? (
            <Workflow
              title="2. Recepcion interna"
              description="Crea expediente e identidad privada solo si existe paquete activo y vigente. La referencia PQRSD-INT no finge radicado externo."
              open={overview.configurationReady && overview.dossiers.length === 0}
            >
              <DossierForm
                packages={activePackages}
                disabled={!overview.configurationReady}
                busy={busy === "dossier-create"}
                onSubmit={(input) =>
                  run(
                    "dossier-create",
                    () => createPqrsdDossier(input),
                    "Recepcion interna registrada. No se presume acuse ni entrega externa.",
                  )
                }
              />
            </Workflow>
          ) : null}

          <section className="space-y-3" aria-labelledby="dossiers-title">
            <div className="flex flex-wrap items-end justify-between gap-3">
              <div>
                <h2 id="dossiers-title" className="text-xl font-black text-slate-950">
                  Expedientes · identidad enmascarada
                </h2>
                <p className="text-sm text-slate-600">CAS-GP simple permanece en Casos y no se mezcla con este registro.</p>
              </div>
              <Field label="Proposito para abrir detalle" hint="Se registra en auditoria.">
                <input className={inputClass} value={purpose} minLength={10} maxLength={1000} onChange={(event) => setPurpose(event.target.value)} />
              </Field>
            </div>
            {overview.dossiers.length === 0 ? (
              <div className="rounded-xl border border-dashed border-slate-300 bg-white p-8 text-center text-slate-600">
                No hay expedientes PQRSD. La ausencia no equivale a cero vencimientos ni certifica cumplimiento.
              </div>
            ) : (
              <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-sm">
                <table className="min-w-full text-left text-sm">
                  <thead className="bg-slate-100 text-slate-700">
                    <tr>
                      <th className="px-4 py-3">Referencia interna</th>
                      <th className="px-4 py-3">Peticionario</th>
                      <th className="px-4 py-3">Estado real</th>
                      <th className="px-4 py-3">Plazo</th>
                      <th className="px-4 py-3">Responsables</th>
                      <th className="px-4 py-3">Accion</th>
                    </tr>
                  </thead>
                  <tbody>
                    {overview.dossiers.map((item) => (
                      <tr key={item.id} className="border-t border-slate-200 align-top">
                        <td className="px-4 py-3 font-bold">{item.reference}</td>
                        <td className="px-4 py-3">
                          <p>{item.petitioner?.maskedFullName ?? "Identidad no disponible"}</p>
                          <p className="text-xs text-slate-500">{item.petitioner?.maskedEmail ?? item.petitioner?.maskedPhone ?? "Contacto protegido"}</p>
                        </td>
                        <td className="px-4 py-3">{STATUS_LABELS[item.status] ?? item.status}</td>
                        <td className="px-4 py-3">
                          {item.deadlines[0]?.calculationStatus === "CALCULATION_REQUIRES_REVIEW"
                            ? "Requiere revision · no es cero"
                            : item.deadlines[0]?.currentDueLocalDate
                              ? new Date(item.deadlines[0].currentDueLocalDate).toLocaleDateString("es-CO", { timeZone: "UTC" })
                              : "Aun no calculado"}
                        </td>
                        <td className="px-4 py-3 text-xs">
                          <p>Principal: {item.currentPrimaryAssignee?.name ?? "Falta"}</p>
                          <p>Suplente: {item.currentBackupAssignee?.name ?? "Falta"}</p>
                        </td>
                        <td className="px-4 py-3">
                          <button type="button" className={secondaryButtonClass} disabled={detailLoading || purpose.trim().length < 10} onClick={() => void openDetail(item.id, purpose.trim())}>
                            <FileLock2 className="h-4 w-4" aria-hidden="true" />
                            Abrir y auditar
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          {overview.alerts.length > 0 ? (
            <section aria-labelledby="alerts-title">
              <h2 id="alerts-title" className="text-xl font-black text-slate-950">Alertas reproducibles</h2>
              <div className="mt-3 grid gap-3 md:grid-cols-2">
                {overview.alerts.map((alert) => (
                  <button
                    key={`${alert.code}-${alert.dossierId}`}
                    type="button"
                    className="rounded-xl border border-amber-300 bg-amber-50 p-4 text-left focus:outline-none focus:ring-2 focus:ring-amber-600"
                    onClick={() => void openDetail(alert.dossierId, `Revision de alerta ${alert.code} en centro PQRSD`)}
                  >
                    <span className="font-black text-amber-950">{alert.reference}</span>
                    <span className="mt-1 block text-sm text-amber-900">{alert.message}</span>
                  </button>
                ))}
              </div>
            </section>
          ) : null}

          {detailLoading ? (
            <div role="status" className="flex items-center gap-2 text-slate-600">
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> Abriendo detalle protegido…
            </div>
          ) : null}
          {detail ? (
            <DetailWorkspace
              detail={detail}
              overview={overview}
              action={action}
              setAction={setAction}
              canIntake={canIntake}
              canReview={canReview}
              canAuthorize={canAuthorize}
              busy={busy}
              run={run}
              setDownload={setDownload}
            />
          ) : null}
        </>
      ) : null}
    </main>
  );
}

function RulePackageForm({
  busy,
  onSubmit,
}: {
  busy: boolean;
  onSubmit: (input: Record<string, unknown>) => void;
}) {
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const exceptionField = event.currentTarget.elements.namedItem(
      "exceptions",
    ) as HTMLTextAreaElement;
    let exceptions: Array<{
      localDate: string;
      type: string;
      label: string;
      sourceReference: string;
    }>;
    try {
      exceptions = value(form, "exceptions")
        .split(/\r?\n/u)
        .map((line) => line.trim())
        .filter(Boolean)
        .map((line) => {
          const [localDate, type, label, sourceReference, extra] = line
            .split("|")
            .map((part) => part.trim());
          if (!localDate || !type || !label || !sourceReference || extra) {
            throw new Error("invalid exception row");
          }
          return { localDate, type, label, sourceReference };
        });
      exceptionField.setCustomValidity("");
    } catch {
      exceptionField.setCustomValidity(
        "Cada excepcion debe usar exactamente fecha|tipo|nombre|fuente.",
      );
      exceptionField.reportValidity();
      exceptionField.focus();
      return;
    }
    const weekdays = value(form, "weekdays")
      .split(",")
      .map((day) => day.trim())
      .filter(Boolean)
      .map(Number);
    onSubmit({
      scopeKey: value(form, "scopeKey"),
      versionLabel: value(form, "versionLabel"),
      sourceUrl: value(form, "sourceUrl"),
      sourceReference: value(form, "sourceReference"),
      sourceSha256: value(form, "sourceSha256").toLowerCase(),
      timeZone: value(form, "timeZone"),
      effectiveFrom: value(form, "effectiveFrom"),
      effectiveTo: optionalValue(form, "effectiveTo"),
      nonWorkingWeekdays: weekdays,
      computationMethodNote: value(form, "computationMethodNote"),
      rules: [
        {
          classificationKey: value(form, "classificationKey"),
          label: value(form, "ruleLabel"),
          durationDays: Number(value(form, "durationDays")),
          dayMethod: value(form, "dayMethod"),
          startRule: value(form, "startRule"),
          legalBasis: value(form, "legalBasis"),
          highRisk: form.get("highRisk") === "on",
        },
      ],
      exceptions,
    });
  }

  return (
    <form className="grid gap-4 md:grid-cols-2" onSubmit={submit}>
      <Field label="Ambito normativo">
        <input name="scopeKey" required defaultValue="GENERAL" minLength={2} maxLength={120} className={inputClass} />
      </Field>
      <Field label="Version del paquete">
        <input name="versionLabel" required placeholder="2026.1" maxLength={80} className={inputClass} />
      </Field>
      <Field label="Fuente HTTPS">
        <input name="sourceUrl" type="url" required pattern="https://.*" placeholder="https://entidad.gov.co/norma" className={inputClass} />
      </Field>
      <Field label="Referencia normativa exacta">
        <input name="sourceReference" required minLength={5} maxLength={500} placeholder="Norma, articulo, acto y fecha" className={inputClass} />
      </Field>
      <Field label="SHA-256 de la fuente" hint="64 caracteres hexadecimales; no se calcula desde una URL remota.">
        <input name="sourceSha256" required pattern="[a-fA-F0-9]{64}" className={inputClass} />
      </Field>
      <Field label="Zona IANA">
        <input name="timeZone" required placeholder="Ej. America/Bogota, según la fuente" className={inputClass} />
      </Field>
      <Field label="Vigente desde">
        <input name="effectiveFrom" type="date" required className={inputClass} />
      </Field>
      <Field label="Vigente hasta (opcional)">
        <input name="effectiveTo" type="date" className={inputClass} />
      </Field>
      <Field label="Dias semanales no laborables" hint="0=domingo … 6=sabado. Lista explicita; por ejemplo 0,6.">
        <input name="weekdays" required placeholder="Ej. 0,6, según la fuente" pattern="[0-6](,[0-6])*" className={inputClass} />
      </Field>
      <Field label="Metodo de computo documentado">
        <input name="computationMethodNote" required minLength={10} maxLength={1000} placeholder="Como se incluyen y excluyen dias" className={inputClass} />
      </Field>
      <div className="md:col-span-2 rounded-lg border border-slate-200 bg-slate-50 p-4">
        <h3 className="font-black text-slate-950">Primera regla explicita</h3>
        <div className="mt-3 grid gap-3 md:grid-cols-2">
          <Field label="Clave de clasificacion">
            <input name="classificationKey" required placeholder="PETICION_GENERAL" className={inputClass} />
          </Field>
          <Field label="Nombre legible">
            <input name="ruleLabel" required minLength={3} maxLength={240} placeholder="Peticion general" className={inputClass} />
          </Field>
          <Field label="Duracion configurada">
            <input name="durationDays" type="number" min={1} max={365} required className={inputClass} />
          </Field>
          <Field label="Unidad de dias">
            <select name="dayMethod" className={inputClass}>
              <option value="WORKING_DAYS">Dias habiles configurados</option>
              <option value="CALENDAR_DAYS">Dias calendario</option>
            </select>
          </Field>
          <Field label="Regla de inicio">
            <select name="startRule" className={inputClass}>
              <option value="NEXT_WORKING_DATE">Siguiente dia habil</option>
              <option value="NEXT_CALENDAR_DATE">Siguiente dia calendario</option>
              <option value="RECEIPT_DATE">Fecha de recepcion</option>
              <option value="MANUAL_REVIEW">Requiere determinacion humana</option>
            </select>
          </Field>
          <Field label="Fundamento juridico de la regla">
            <textarea name="legalBasis" required minLength={10} maxLength={2000} rows={3} className={inputClass} />
          </Field>
          <label className="flex items-center gap-2 text-sm font-semibold text-slate-800">
            <input name="highRisk" type="checkbox" className="h-5 w-5" />
            Clasificacion de alto riesgo
          </label>
        </div>
      </div>
      <Field label="Festivos/excepciones" hint="Una linea: AAAA-MM-DD|NON_WORKING o WORKING_OVERRIDE|nombre|fuente. Puede quedar vacio.">
        <textarea name="exceptions" rows={4} className={inputClass} placeholder="2026-12-08|NON_WORKING|Festivo|Acto oficial 123" onInput={(event) => event.currentTarget.setCustomValidity("")} />
      </Field>
      <div className="flex items-end">
        <SubmitButton busy={busy} label="Crear borrador versionado" />
      </div>
    </form>
  );
}

function DossierForm({
  packages,
  disabled,
  busy,
  onSubmit,
}: {
  packages: PqrsdOverview["packages"];
  disabled: boolean;
  busy: boolean;
  onSubmit: (input: Record<string, unknown>) => void;
}) {
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    onSubmit({
      scopeKey: value(form, "scopeKey"),
      receivedAt: instant(value(form, "receivedAt")),
      receivedTimeZone: value(form, "receivedTimeZone"),
      receivedChannel: value(form, "receivedChannel"),
      externalReceiptNumber: optionalValue(form, "externalReceiptNumber"),
      subject: value(form, "subject"),
      description: value(form, "description"),
      acknowledgementRequired: form.get("acknowledgementRequired") === "on",
      riskLevel: value(form, "riskLevel"),
      petitioner: {
        fullName: value(form, "fullName"),
        documentType: optionalValue(form, "documentType"),
        documentNumber: optionalValue(form, "documentNumber"),
        email: optionalValue(form, "email"),
        phone: optionalValue(form, "phone"),
        postalAddress: optionalValue(form, "postalAddress"),
        preferredChannel: value(form, "preferredChannel"),
      },
    });
  }
  return (
    <form className="grid gap-4 md:grid-cols-2" onSubmit={submit}>
      <Field label="Ambito aprobado">
        <select name="scopeKey" required disabled={disabled} className={inputClass}>
          {packages.map((item) => (
            <option key={item.id} value={item.scopeKey}>{item.scopeKey} · {item.versionLabel}</option>
          ))}
        </select>
      </Field>
      <Field label="Fecha/hora de recepcion">
        <input name="receivedAt" type="datetime-local" required defaultValue={localNow(0)} disabled={disabled} className={inputClass} />
      </Field>
      <Field label="Zona IANA del paquete">
        <input name="receivedTimeZone" required defaultValue={packages[0]?.timeZone ?? ""} disabled={disabled} className={inputClass} />
      </Field>
      <Field label="Canal de recepcion">
        <input name="receivedChannel" required minLength={2} maxLength={120} placeholder="Ventanilla, correo institucional…" disabled={disabled} className={inputClass} />
      </Field>
      <Field label="Radicado externo existente (opcional)" hint="No se genera ni inventa desde esta pantalla.">
        <input name="externalReceiptNumber" maxLength={160} disabled={disabled} className={inputClass} />
      </Field>
      <Field label="Riesgo">
        <select name="riskLevel" disabled={disabled} className={inputClass}>
          <option value="NORMAL">Normal</option>
          <option value="HIGH">Alto</option>
        </select>
      </Field>
      <Field label="Asunto sensible">
        <input name="subject" required minLength={3} maxLength={500} disabled={disabled} className={inputClass} />
      </Field>
      <Field label="Hechos/descripcion">
        <textarea name="description" required minLength={10} maxLength={20000} rows={4} disabled={disabled} className={inputClass} />
      </Field>
      <Field label="Nombre completo">
        <input name="fullName" required minLength={2} maxLength={240} disabled={disabled} className={inputClass} />
      </Field>
      <Field label="Documento">
        <span className="grid grid-cols-[1fr_2fr] gap-2">
          <input name="documentType" placeholder="CC" maxLength={40} disabled={disabled} className={inputClass} aria-label="Tipo de documento" />
          <input name="documentNumber" maxLength={80} disabled={disabled} className={inputClass} aria-label="Numero de documento" />
        </span>
      </Field>
      <Field label="Correo">
        <input name="email" type="email" maxLength={320} disabled={disabled} className={inputClass} />
      </Field>
      <Field label="Telefono">
        <input name="phone" minLength={7} maxLength={60} disabled={disabled} className={inputClass} />
      </Field>
      <Field label="Direccion postal">
        <input name="postalAddress" maxLength={500} disabled={disabled} className={inputClass} />
      </Field>
      <Field label="Canal preferido">
        <input name="preferredChannel" required defaultValue="Correo electronico" disabled={disabled} className={inputClass} />
      </Field>
      <label className="flex items-center gap-2 text-sm font-semibold text-slate-800">
        <input name="acknowledgementRequired" type="checkbox" defaultChecked disabled={disabled} className="h-5 w-5" />
        Acuse documental requerido antes de clasificar
      </label>
      <div className="flex items-end">
        <SubmitButton busy={busy} label="Registrar recepcion interna" />
      </div>
    </form>
  );
}

function DetailWorkspace({
  detail,
  overview,
  action,
  setAction,
  canIntake,
  canReview,
  canAuthorize,
  busy,
  run,
  setDownload,
}: {
  detail: PqrsdDetail;
  overview: PqrsdOverview;
  action: WorkflowAction;
  setAction: (value: WorkflowAction) => void;
  canIntake: boolean;
  canReview: boolean;
  canAuthorize: boolean;
  busy: string | null;
  run: (
    key: string,
    operation: () => Promise<unknown>,
    success: string,
  ) => Promise<void>;
  setDownload: (value: { url: string; expiresAt: string } | null) => void;
}) {
  const permittedActions = useMemo(
    () =>
      [
        ...(canIntake
          ? [
              ["DOCUMENT", "Adjuntar documento directo a Storage"],
              ["ACK", "Registrar acuse"],
              ["CLASSIFY", "Proponer clasificacion"],
              ["TRANSFER", "Proponer traslado"],
              ["TRANSFER_ATTEMPT", "Registrar intento de traslado"],
              ["EXTENSION", "Proponer prorroga"],
              ["RESPONSE", "Crear version de respuesta"],
              ["DELIVERY", "Registrar intento/constancia de entrega"],
            ]
          : []),
        ...(canReview
          ? [
              ["DOCUMENT_REVIEW", "Revisar documento"],
              ["CLASSIFY_REVIEW", "Revisar clasificacion y plazo"],
              ["ASSIGN", "Asignar principal y suplente"],
              ["TRANSFER_REVIEW", "Revisar traslado"],
              ["RESPONSE_REVIEW", "Revisar respuesta"],
            ]
          : []),
        ...(canAuthorize
          ? [
              ["EXTENSION_REVIEW", "Decidir prorroga"],
              ["AUTHORIZE", "Autorizar respuesta"],
              ["CLOSE", "Cerrar expediente"],
              ["REOPEN", "Reabrir expediente"],
            ]
          : []),
      ] as Array<[WorkflowAction, string]>,
    [canAuthorize, canIntake, canReview],
  );

  useEffect(() => {
    if (
      permittedActions.length > 0 &&
      !permittedActions.some(([candidate]) => candidate === action)
    ) {
      setAction(permittedActions[0][0]);
    }
  }, [action, permittedActions, setAction]);

  return (
    <section className="space-y-4 rounded-2xl border-2 border-blue-200 bg-blue-50/30 p-4 md:p-6" aria-labelledby="detail-title">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs font-bold uppercase tracking-wider text-blue-800">Detalle sensible · acceso auditado</p>
          <h2 id="detail-title" className="mt-1 text-xl font-black text-slate-950">{detail.reference}</h2>
          <p className="mt-1 text-sm text-slate-700">{detail.privacyNotice}</p>
        </div>
        <span className="rounded-full bg-slate-950 px-3 py-1.5 text-xs font-bold text-white">
          {STATUS_LABELS[detail.status] ?? detail.status} · v{detail.version}
        </span>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <article className="rounded-xl border border-slate-200 bg-white p-4">
          <h3 className="font-black text-slate-950">Solicitud</h3>
          <p className="mt-2 font-semibold">{detail.subject}</p>
          <p className="mt-2 whitespace-pre-wrap text-sm text-slate-700">{detail.description}</p>
        </article>
        <article className="rounded-xl border border-slate-200 bg-white p-4">
          <h3 className="font-black text-slate-950">Identidad protegida</h3>
          <dl className="mt-2 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-sm">
            <dt className="font-semibold">Nombre</dt><dd>{detail.petitioner?.fullName ?? "No disponible"}</dd>
            <dt className="font-semibold">Documento</dt><dd>{detail.petitioner?.documentType ?? "—"} {detail.petitioner?.documentNumber ?? "—"}</dd>
            <dt className="font-semibold">Correo</dt><dd>{detail.petitioner?.email ?? "—"}</dd>
            <dt className="font-semibold">Telefono</dt><dd>{detail.petitioner?.phone ?? "—"}</dd>
            <dt className="font-semibold">Canal</dt><dd>{detail.petitioner?.preferredChannel ?? "—"}</dd>
          </dl>
        </article>
      </div>

      <article className="rounded-xl border border-slate-200 bg-white p-4">
        <h3 className="font-black text-slate-950">Documentos y revisiones</h3>
        {detail.documents.length === 0 ? (
          <p className="mt-2 text-sm text-slate-600">Sin documentos. No se presume acuse, autorizacion ni entrega.</p>
        ) : (
          <ul className="mt-3 divide-y divide-slate-200">
            {detail.documents.map((document) => (
              <li key={document.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
                <div>
                  <p className="font-bold">{DOCUMENT_LABELS[String(document.type)] ?? String(document.type)}</p>
                  <p className="text-xs text-slate-600">{document.reviews[0]?.decision === "APPROVE" ? "Revisado y aprobado" : document.reviews[0]?.decision === "REJECT" ? "Rechazado" : "Pendiente de segunda persona"}</p>
                </div>
                <button
                  type="button"
                  className={secondaryButtonClass}
                  onClick={() =>
                    void run(
                      `download-${document.id}`,
                      async () => setDownload(await getPqrsdDocumentDownload(document.id)),
                      "Enlace privado temporal autorizado.",
                    )
                  }
                  disabled={busy === `download-${document.id}`}
                >
                  Abrir soporte
                </button>
              </li>
            ))}
          </ul>
        )}
      </article>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)]">
        <article className="rounded-xl border border-slate-200 bg-white p-4">
          <h3 className="font-black text-slate-950">Linea probatoria</h3>
          <ol className="mt-3 space-y-2 text-sm">
            {detail.statusEvents.map((event) => (
              <li key={event.id} className="border-l-2 border-blue-300 pl-3">
                <span className="font-bold">{STATUS_LABELS[event.toStatus] ?? event.toStatus}</span>
                {typeof event.reason === "string" ? <span className="block text-slate-600">{event.reason}</span> : null}
              </li>
            ))}
          </ol>
        </article>
        <article className="rounded-xl border border-slate-200 bg-white p-4">
          <h3 className="font-black text-slate-950">Controles del expediente</h3>
          <ul className="mt-3 space-y-2 text-sm text-slate-700">
            <li>Clasificaciones: {detail.classifications.length}</li>
            <li>Snapshots de plazo: {detail.deadlines.length}</li>
            <li>Asignaciones: {detail.assignments.length}</li>
            <li>Traslados: {detail.transfers.length}</li>
            <li>Prorrogas: {detail.extensions.length}</li>
            <li>Versiones de respuesta: {detail.responses.length}</li>
            <li>Cierres / reaperturas: {detail.closures.length} / {detail.reopenings.length}</li>
          </ul>
        </article>
      </div>

      {permittedActions.length > 0 ? (
        <article className="rounded-xl border border-slate-300 bg-white p-4 md:p-5">
          <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_2fr] md:items-end">
            <Field label="Operacion controlada">
              <select className={inputClass} value={action} onChange={(event) => setAction(event.target.value as WorkflowAction)}>
                {permittedActions.map(([key, label]) => (
                  <option key={key} value={key}>{label}</option>
                ))}
              </select>
            </Field>
            <p className="text-sm text-slate-600">
              Cada envio usa UUID idempotente, SHA canonico y la version {detail.version}. Si otra persona cambia el expediente, debe recargar.
            </p>
          </div>
          <ActionForm
            key={`${detail.id}-${detail.version}-${action}`}
            action={action}
            detail={detail}
            overview={overview}
            busy={busy === `action-${action}`}
            run={(operation, success) => run(`action-${action}`, operation, success)}
          />
        </article>
      ) : null}
    </section>
  );
}

function ActionForm({
  action,
  detail,
  overview,
  busy,
  run,
}: {
  action: WorkflowAction;
  detail: PqrsdDetail;
  overview: PqrsdOverview;
  busy: boolean;
  run: (operation: () => Promise<unknown>, success: string) => Promise<void>;
}) {
  const approvedDocuments = detail.documents.filter(
    (document) => document.reviews[0]?.decision === "APPROVE",
  );
  const pendingDocuments = detail.documents.filter(
    (document) => document.reviews.length === 0,
  );
  const pendingClassifications = detail.classifications.filter(
    (item) => !item.review,
  );
  const pendingTransfers = detail.transfers.filter((item) => !item.review);
  const approvedTransfers = detail.transfers.filter(
    (item) => item.review?.decision === "APPROVE",
  );
  const pendingExtensions = detail.extensions.filter((item) => !item.review);
  const pendingResponseReviews = detail.responses.filter((item) => !item.review);
  const approvedResponses = detail.responses.filter(
    (item) => item.review?.decision === "APPROVE" && !item.authorization,
  );
  const authorizedResponses = detail.responses.filter(
    (item) => item.authorization?.decision === "AUTHORIZE",
  );
  const rules = detail.rulePackage?.rules ?? overview.packages.flatMap((item) => item.rules);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const expectedVersion = detail.version;

    switch (action) {
      case "DOCUMENT": {
        const file = form.get("file");
        if (!(file instanceof File) || file.size === 0) {
          throw new Error("Selecciona un archivo PDF o imagen.");
        }
        await run(async () => {
          const upload = await uploadFileDirectlyWithClientDeclaredHash(
            file,
            "pqrsd",
          );
          return attachPqrsdDocument({
            dossierId: detail.id,
            storagePath: upload.path,
            type: value(form, "documentType"),
            fileName: file.name,
            sha256: upload.sha256,
            sourceReference: optionalValue(form, "sourceReference"),
            expectedVersion,
          });
        }, "Archivo confirmado en Storage y asociado; aun requiere segunda revision.");
        return;
      }
      case "DOCUMENT_REVIEW":
        await run(
          () =>
            reviewPqrsdDocument(value(form, "documentId"), {
              decision: value(form, "decision"),
              rationale: value(form, "rationale"),
              expectedVersion,
            }),
          "Revision documental inmutable registrada.",
        );
        return;
      case "ACK":
        await run(
          () =>
            recordPqrsdAcknowledgement(detail.id, {
              documentId: value(form, "documentId"),
              acknowledgementNumber: value(form, "acknowledgementNumber"),
              channel: value(form, "channel"),
              issuedAt: instant(value(form, "issuedAt")),
              expectedVersion,
            }),
          "Acuse documentado; no se invento un radicado externo.",
        );
        return;
      case "CLASSIFY":
        await run(
          () =>
            proposePqrsdClassification(detail.id, {
              ruleDefinitionId: value(form, "ruleDefinitionId"),
              categoryKey: value(form, "categoryKey"),
              categoryLabel: value(form, "categoryLabel"),
              competence: value(form, "competence"),
              department: value(form, "department"),
              competentAuthority: value(form, "competentAuthority"),
              rationale: value(form, "rationale"),
              expectedVersion,
            }),
          "Clasificacion propuesta; pendiente de revision independiente.",
        );
        return;
      case "CLASSIFY_REVIEW":
        await run(
          () =>
            reviewPqrsdClassification(value(form, "classificationId"), {
              decision: value(form, "decision"),
              rationale: value(form, "rationale"),
              manualDueLocalDate: optionalValue(form, "manualDueLocalDate"),
              manualDeadlineReason: optionalValue(form, "manualDeadlineReason"),
              manualDeadlineAuthority: optionalValue(form, "manualDeadlineAuthority"),
              expectedVersion,
            }),
          "Revision registrada. El plazo quedo calculado o marcado expresamente para revision.",
        );
        return;
      case "ASSIGN":
        await run(
          () =>
            recordPqrsdAssignment(detail.id, {
              primaryAssigneeId: value(form, "primaryAssigneeId"),
              backupAssigneeId: value(form, "backupAssigneeId"),
              reason: value(form, "reason"),
              effectiveAt: instant(value(form, "effectiveAt")),
              expectedVersion,
            }),
          "Responsable principal y suplente registrados.",
        );
        return;
      case "TRANSFER":
        await run(
          () =>
            proposePqrsdTransfer(detail.id, {
              destination: value(form, "destination"),
              destinationReference: optionalValue(form, "destinationReference"),
              reason: value(form, "reason"),
              legalAuthority: value(form, "legalAuthority"),
              dueLocalDate: value(form, "dueLocalDate"),
              timeZone: value(form, "timeZone"),
              supportDocumentId: value(form, "supportDocumentId"),
              expectedVersion,
            }),
          "Traslado propuesto; aun no se considera enviado.",
        );
        return;
      case "TRANSFER_REVIEW":
        await run(
          () =>
            reviewPqrsdTransfer(value(form, "transferId"), {
              decision: value(form, "decision"),
              rationale: value(form, "rationale"),
              expectedVersion,
            }),
          "Revision independiente del traslado registrada.",
        );
        return;
      case "TRANSFER_ATTEMPT":
        await run(
          () =>
            recordPqrsdTransferAttempt(value(form, "transferId"), {
              outcome: value(form, "outcome"),
              attemptedAt: instant(value(form, "attemptedAt")),
              externalReference: optionalValue(form, "externalReference"),
              evidenceDocumentId: optionalValue(form, "evidenceDocumentId"),
              failureReason: optionalValue(form, "failureReason"),
              expectedVersion,
            }),
          "Intento de traslado registrado con su resultado real.",
        );
        return;
      case "EXTENSION":
        await run(
          () =>
            proposePqrsdExtension(detail.id, {
              requestedDueLocalDate: value(form, "requestedDueLocalDate"),
              reason: value(form, "reason"),
              legalAuthority: value(form, "legalAuthority"),
              supportDocumentId: value(form, "supportDocumentId"),
              expectedVersion,
            }),
          "Prorroga propuesta; el plazo vigente no cambio todavia.",
        );
        return;
      case "EXTENSION_REVIEW":
        await run(
          () =>
            reviewPqrsdExtension(value(form, "extensionId"), {
              decision: value(form, "decision"),
              rationale: value(form, "rationale"),
              expectedVersion,
            }),
          "Decision independiente de prorroga registrada.",
        );
        return;
      case "RESPONSE":
        await run(
          () =>
            createPqrsdResponseVersion(detail.id, {
              body: value(form, "body"),
              attachmentDocumentId: optionalValue(form, "attachmentDocumentId"),
              expectedVersion,
            }),
          "Version inmutable creada como borrador; no esta autorizada ni entregada.",
        );
        return;
      case "RESPONSE_REVIEW":
        await run(
          () =>
            reviewPqrsdResponse(value(form, "responseId"), {
              decision: value(form, "decision"),
              rationale: value(form, "rationale"),
              expectedVersion,
            }),
          "Revision de respuesta registrada.",
        );
        return;
      case "AUTHORIZE":
        await run(
          () =>
            authorizePqrsdResponse(value(form, "responseId"), {
              decision: value(form, "decision"),
              rationale: value(form, "rationale"),
              authorizationReference: optionalValue(form, "authorizationReference"),
              authorizationDocumentId: optionalValue(form, "authorizationDocumentId"),
              expectedVersion,
            }),
          "Decision de autorizacion registrada; esto no acredita entrega externa.",
        );
        return;
      case "DELIVERY":
        await run(
          () =>
            recordPqrsdDeliveryAttempt(value(form, "responseId"), {
              channel: value(form, "channel"),
              outcome: value(form, "outcome"),
              attemptedAt: instant(value(form, "attemptedAt")),
              externalReference: optionalValue(form, "externalReference"),
              evidenceDocumentId: optionalValue(form, "evidenceDocumentId"),
              failureReason: optionalValue(form, "failureReason"),
              expectedVersion,
            }),
          "Intento registrado; DELIVERED solo se acepta con constancia revisada.",
        );
        return;
      case "CLOSE":
        await run(
          () =>
            closePqrsdDossier(detail.id, {
              cause: value(form, "cause"),
              rationale: value(form, "rationale"),
              legalAuthority: value(form, "legalAuthority"),
              supportDocumentId: optionalValue(form, "supportDocumentId"),
              closedAt: instant(value(form, "closedAt")),
              expectedVersion,
            }),
          "Cierre documentado; el expediente queda en solo lectura.",
        );
        return;
      case "REOPEN":
        await run(
          () =>
            reopenPqrsdDossier(detail.id, {
              reason: value(form, "reason"),
              legalAuthority: value(form, "legalAuthority"),
              supportDocumentId: value(form, "supportDocumentId"),
              reopenedAt: instant(value(form, "reopenedAt")),
              expectedVersion,
            }),
          "Reapertura excepcional autorizada y documentada.",
        );
        return;
    }
  }

  let fields: ReactNode;
  let label = "Registrar operacion";
  switch (action) {
    case "DOCUMENT":
      label = "Subir y asociar documento";
      fields = (
        <>
          <Field label="Tipo de documento">
            <select name="documentType" className={inputClass}>
              {PQRSD_DOCUMENT_TYPES.map((type) => (
                <option key={type} value={type}>{DOCUMENT_LABELS[type]}</option>
              ))}
            </select>
          </Field>
          <Field label="Archivo" hint="Viaja navegador → Supabase Storage; nunca atraviesa Nest.">
            <input name="file" type="file" accept="application/pdf,image/jpeg,image/png,image/webp" required className={inputClass} />
          </Field>
          <Field label="Referencia de origen (opcional)">
            <input name="sourceReference" maxLength={1000} className={inputClass} />
          </Field>
        </>
      );
      break;
    case "DOCUMENT_REVIEW":
      label = "Registrar revision documental";
      fields = (
        <>
          <Field label="Documento pendiente">
            <select name="documentId" required className={inputClass}>
              {pendingDocuments.map((item) => <option key={item.id} value={item.id}>{DOCUMENT_LABELS[String(item.type)] ?? String(item.type)} · {item.id.slice(0, 8)}</option>)}
            </select>
          </Field>
          <DecisionSelect />
          <Rationale />
        </>
      );
      break;
    case "ACK":
      label = "Registrar acuse documentado";
      fields = (
        <>
          <DocumentSelect documents={approvedDocuments} name="documentId" types={["RECEIPT_ACKNOWLEDGEMENT"]} label="Acuse aprobado" />
          <Field label="Numero de acuse/radicado constatado"><input name="acknowledgementNumber" required minLength={2} maxLength={160} className={inputClass} /></Field>
          <Field label="Canal"><input name="channel" required defaultValue="Correo institucional" className={inputClass} /></Field>
          <Field label="Fecha/hora emitida"><input name="issuedAt" type="datetime-local" required defaultValue={localNow(0)} className={inputClass} /></Field>
        </>
      );
      break;
    case "CLASSIFY":
      label = "Proponer clasificacion";
      fields = (
        <>
          <Field label="Regla del paquete congelado">
            <select name="ruleDefinitionId" required className={inputClass}>
              {rules.map((rule) => <option key={rule.id} value={rule.id}>{rule.label} · {rule.durationDays} {rule.dayMethod === "WORKING_DAYS" ? "habiles" : "calendario"}</option>)}
            </select>
          </Field>
          <Field label="Clave de categoria"><input name="categoryKey" required defaultValue={rules[0]?.classificationKey} className={inputClass} /></Field>
          <Field label="Nombre de categoria"><input name="categoryLabel" required minLength={3} maxLength={240} defaultValue={rules[0]?.label} className={inputClass} /></Field>
          <Field label="Competencia">
            <select name="competence" className={inputClass}><option value="COMPETENT">Competente</option><option value="TRANSFER_REQUIRED">Requiere traslado</option><option value="REQUIRES_REVIEW">Competencia por determinar</option></select>
          </Field>
          <Field label="Dependencia"><input name="department" required minLength={2} maxLength={240} className={inputClass} /></Field>
          <Field label="Autoridad competente"><input name="competentAuthority" required minLength={3} maxLength={500} className={inputClass} /></Field>
          <Rationale />
        </>
      );
      break;
    case "CLASSIFY_REVIEW":
      label = "Revisar y calcular plazo";
      fields = (
        <>
          <Field label="Clasificacion pendiente"><select name="classificationId" required className={inputClass}>{pendingClassifications.map((item) => <option key={item.id} value={item.id}>Version {item.versionNumber} · {item.id.slice(0, 8)}</option>)}</select></Field>
          <DecisionSelect />
          <Rationale />
          <Field label="Fecha manual (solo si la regla falla cerrada)"><input name="manualDueLocalDate" type="date" className={inputClass} /></Field>
          <Field label="Motivo de determinacion manual"><input name="manualDeadlineReason" minLength={10} maxLength={1500} className={inputClass} /></Field>
          <Field label="Autoridad para determinacion manual"><input name="manualDeadlineAuthority" minLength={5} maxLength={1000} className={inputClass} /></Field>
        </>
      );
      break;
    case "ASSIGN":
      label = "Asignar con suplencia";
      fields = (
        <>
          <Field label="Responsable principal"><select name="primaryAssigneeId" required className={inputClass}>{overview.team.map((item) => <option key={item.id} value={item.id}>{item.name} · {item.role}</option>)}</select></Field>
          <Field label="Suplente distinto"><select name="backupAssigneeId" required className={inputClass}>{overview.team.map((item) => <option key={item.id} value={item.id}>{item.name} · {item.role}</option>)}</select></Field>
          <Field label="Motivo"><input name="reason" required minLength={5} maxLength={1500} className={inputClass} /></Field>
          <Field label="Vigente desde"><input name="effectiveAt" type="datetime-local" required defaultValue={localNow(0)} className={inputClass} /></Field>
        </>
      );
      break;
    case "TRANSFER":
      label = "Proponer traslado";
      fields = (
        <>
          <Field label="Entidad destino"><input name="destination" required minLength={3} maxLength={500} className={inputClass} /></Field>
          <Field label="Referencia de destino"><input name="destinationReference" maxLength={500} className={inputClass} /></Field>
          <Rationale name="reason" label="Hechos y razon del traslado" />
          <Field label="Fundamento juridico"><textarea name="legalAuthority" required minLength={5} maxLength={1500} className={inputClass} /></Field>
          <Field label="Fecha limite documentada"><input name="dueLocalDate" type="date" required className={inputClass} /></Field>
          <Field label="Zona IANA"><input name="timeZone" required defaultValue={detail.rulePackage?.timeZone ?? "America/Bogota"} className={inputClass} /></Field>
          <DocumentSelect documents={approvedDocuments} name="supportDocumentId" types={["TRANSFER_SUPPORT"]} label="Soporte aprobado" />
        </>
      );
      break;
    case "TRANSFER_REVIEW":
      label = "Revisar traslado";
      fields = (
        <><Field label="Traslado pendiente"><select name="transferId" required className={inputClass}>{pendingTransfers.map((item) => <option key={item.id} value={item.id}>{String(item.destination ?? "Destino")} · {item.id.slice(0, 8)}</option>)}</select></Field><DecisionSelect /><Rationale /></>
      );
      break;
    case "TRANSFER_ATTEMPT":
      label = "Registrar resultado real del traslado";
      fields = (
        <>
          <Field label="Traslado aprobado"><select name="transferId" required className={inputClass}>{approvedTransfers.map((item) => <option key={item.id} value={item.id}>{String(item.destination ?? "Destino")} · {item.id.slice(0, 8)}</option>)}</select></Field>
          <DeliveryOutcome />
          <Field label="Fecha/hora del intento"><input name="attemptedAt" type="datetime-local" required defaultValue={localNow(0)} className={inputClass} /></Field>
          <Field label="Referencia externa (obligatoria si entregado)"><input name="externalReference" maxLength={500} className={inputClass} /></Field>
          <DocumentSelect documents={approvedDocuments} name="evidenceDocumentId" types={["TRANSFER_PROOF"]} optional label="Constancia aprobada (solo si entregado)" />
          <Field label="Causal de falla/rebote"><input name="failureReason" maxLength={1500} className={inputClass} /></Field>
        </>
      );
      break;
    case "EXTENSION":
      label = "Proponer prorroga";
      fields = (
        <>
          <Field label="Nueva fecha solicitada"><input name="requestedDueLocalDate" type="date" required className={inputClass} /></Field>
          <Rationale name="reason" label="Necesidad excepcional" />
          <Field label="Fundamento juridico"><textarea name="legalAuthority" required minLength={5} maxLength={1500} className={inputClass} /></Field>
          <DocumentSelect documents={approvedDocuments} name="supportDocumentId" types={["EXTENSION_SUPPORT"]} label="Soporte aprobado" />
        </>
      );
      break;
    case "EXTENSION_REVIEW":
      label = "Decidir prorroga";
      fields = (
        <><Field label="Prorroga pendiente"><select name="extensionId" required className={inputClass}>{pendingExtensions.map((item) => <option key={item.id} value={item.id}>{String(item.requestedDueLocalDate ?? "Nueva fecha")} · {item.id.slice(0, 8)}</option>)}</select></Field><DecisionSelect /><Rationale /></>
      );
      break;
    case "RESPONSE":
      label = "Crear version de respuesta";
      fields = (
        <>
          <Field label="Contenido de la respuesta"><textarea name="body" required minLength={20} maxLength={50000} rows={8} className={inputClass} /></Field>
          <DocumentSelect documents={approvedDocuments} name="attachmentDocumentId" types={["RESPONSE_ATTACHMENT"]} optional label="Anexo aprobado (opcional)" />
        </>
      );
      break;
    case "RESPONSE_REVIEW":
      label = "Revisar respuesta";
      fields = (
        <><Field label="Version pendiente"><select name="responseId" required className={inputClass}>{pendingResponseReviews.map((item) => <option key={item.id} value={item.id}>Version {item.versionNumber} · {item.id.slice(0, 8)}</option>)}</select></Field><Field label="Decision"><select name="decision" className={inputClass}><option value="APPROVE">Aprobar revision</option><option value="RETURN_FOR_CHANGES">Devolver para cambios</option></select></Field><Rationale /></>
      );
      break;
    case "AUTHORIZE":
      label = "Registrar decision de autorizacion";
      fields = (
        <>
          <Field label="Respuesta revisada"><select name="responseId" required className={inputClass}>{approvedResponses.map((item) => <option key={item.id} value={item.id}>Version {item.versionNumber} · {item.id.slice(0, 8)}</option>)}</select></Field>
          <Field label="Decision"><select name="decision" className={inputClass}><option value="AUTHORIZE">Autorizar</option><option value="RETURN_FOR_CHANGES">Devolver para cambios</option></select></Field>
          <Rationale />
          <Field label="Referencia de autorizacion"><input name="authorizationReference" maxLength={500} className={inputClass} /></Field>
          <DocumentSelect documents={approvedDocuments} name="authorizationDocumentId" types={["AUTHORIZATION_ARTIFACT"]} optional label="Artefacto aprobado (obligatorio para autorizar)" />
        </>
      );
      break;
    case "DELIVERY":
      label = "Registrar intento o entrega verificada";
      fields = (
        <>
          <Field label="Respuesta autorizada"><select name="responseId" required className={inputClass}>{authorizedResponses.map((item) => <option key={item.id} value={item.id}>Version {item.versionNumber} · {item.id.slice(0, 8)}</option>)}</select></Field>
          <Field label="Canal"><input name="channel" required defaultValue="Correo institucional" className={inputClass} /></Field>
          <DeliveryOutcome />
          <Field label="Fecha/hora"><input name="attemptedAt" type="datetime-local" required defaultValue={localNow(0)} className={inputClass} /></Field>
          <Field label="Referencia externa"><input name="externalReference" maxLength={500} className={inputClass} /></Field>
          <DocumentSelect documents={approvedDocuments} name="evidenceDocumentId" types={["DELIVERY_PROOF"]} optional label="Constancia aprobada (obligatoria si entregado)" />
          <Field label="Causal de falla/rebote"><input name="failureReason" maxLength={1500} className={inputClass} /></Field>
        </>
      );
      break;
    case "CLOSE":
      label = "Cerrar expediente";
      fields = (
        <>
          <Field label="Causal"><select name="cause" className={inputClass}><option value="RESPONSE_DELIVERED">Respuesta entregada</option><option value="TRANSFER_COMPLETED">Traslado completado</option><option value="WITHDRAWN">Desistimiento documentado</option><option value="DUPLICATE">Duplicado documentado</option><option value="NO_ACTION_LEGAL_BASIS">Sin accion por fundamento legal</option><option value="OTHER">Otra causal documentada</option></select></Field>
          <Rationale />
          <Field label="Fundamento juridico"><textarea name="legalAuthority" required minLength={5} maxLength={1500} className={inputClass} /></Field>
          <DocumentSelect documents={approvedDocuments} name="supportDocumentId" types={["CLOSURE_SUPPORT"]} optional label="Soporte aprobado para causal alternativa" />
          <Field label="Fecha/hora de cierre"><input name="closedAt" type="datetime-local" required defaultValue={localNow(0)} className={inputClass} /></Field>
        </>
      );
      break;
    case "REOPEN":
      label = "Autorizar reapertura";
      fields = (
        <>
          <Rationale name="reason" label="Hecho nuevo o causal" />
          <Field label="Fundamento juridico"><textarea name="legalAuthority" required minLength={5} maxLength={1500} className={inputClass} /></Field>
          <DocumentSelect documents={approvedDocuments} name="supportDocumentId" types={["REOPENING_SUPPORT"]} label="Soporte de reapertura aprobado" />
          <Field label="Fecha/hora de reapertura"><input name="reopenedAt" type="datetime-local" required defaultValue={localNow(0)} className={inputClass} /></Field>
        </>
      );
      break;
  }

  return (
    <form className="mt-5 grid gap-4 md:grid-cols-2" onSubmit={(event) => void submit(event)}>
      {fields}
      <div className="flex items-end md:col-span-2">
        <SubmitButton busy={busy} label={label} />
      </div>
    </form>
  );
}

function DecisionSelect() {
  return (
    <Field label="Decision">
      <select name="decision" className={inputClass}>
        <option value="APPROVE">Aprobar</option>
        <option value="REJECT">Rechazar</option>
      </select>
    </Field>
  );
}

function DeliveryOutcome() {
  return (
    <Field label="Resultado real">
      <select name="outcome" className={inputClass}>
        <option value="PENDING_CONFIRMATION">Pendiente de confirmacion</option>
        <option value="DELIVERED">Entregado con constancia</option>
        <option value="BOUNCED">Rebotado</option>
        <option value="FAILED">Fallido</option>
      </select>
    </Field>
  );
}

function Rationale({
  name = "rationale",
  label = "Fundamento",
}: {
  name?: string;
  label?: string;
}) {
  return (
    <Field label={label}>
      <textarea name={name} required minLength={10} maxLength={2000} rows={3} className={inputClass} />
    </Field>
  );
}
