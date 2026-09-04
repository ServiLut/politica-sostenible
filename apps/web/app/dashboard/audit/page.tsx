"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";
import {
  AlertCircle,
  ChevronLeft,
  ChevronRight,
  ClipboardList,
  Filter,
  Loader2,
  RefreshCw,
  ShieldCheck,
  UserRound,
} from "lucide-react";
import {
  AuditEvent,
  AuditEventPage,
  AuditOutcome,
  listAuditEvents,
} from "@/lib/audit-events-api";
import { ApiError } from "@/lib/api-client";
import { getRoleLabel } from "@/config/navigation";

const PAGE_SIZE = 20;

interface AuditFilters {
  action: string;
  resourceType: string;
  outcome: "" | AuditOutcome;
  occurredFrom: string;
  occurredTo: string;
}

const EMPTY_FILTERS: AuditFilters = {
  action: "",
  resourceType: "",
  outcome: "",
  occurredFrom: "",
  occurredTo: "",
};

const OUTCOME_LABELS: Record<AuditOutcome, string> = {
  SUCCESS: "Exitosa",
  DENIED: "Denegada",
  FAILURE: "Fallida",
};

const OUTCOME_STYLES: Record<AuditOutcome, string> = {
  SUCCESS: "bg-emerald-50 text-emerald-800 ring-emerald-200",
  DENIED: "bg-amber-50 text-amber-800 ring-amber-200",
  FAILURE: "bg-red-50 text-red-800 ring-red-200",
};

const ACTION_LABELS: Record<string, string> = {
  ACCOUNT_PASSWORD_CHANGED: "Contraseña de cuenta actualizada",
  ACCOUNT_TERMS_ACCEPTED: "Términos de cuenta aceptados",
  CAMPAIGN_EVENT_CREATED: "Evento creado",
  CAMPAIGN_EVENT_DRAFT_DELETED: "Borrador de evento eliminado",
  CAMPAIGN_EVENT_STATUS_CHANGED: "Estado de evento actualizado",
  CAMPAIGN_EVENT_UPDATED: "Evento actualizado",
  CAMPAIGN_FINANCE_SETTINGS_UPSERTED: "Configuración financiera actualizada",
  CAMPAIGN_CNE_REVIEW_DRAFT_EXPORTED:
    "Borrador financiero para revisión exportado",
  CAMPAIGN_FINANCIAL_ENTRY_CREATED: "Movimiento financiero registrado",
  CAMPAIGN_FINANCIAL_ENTRY_REVIEWED: "Movimiento financiero revisado",
  CASE_FOLLOW_UP_CONSENT_GRANTED: "Autorización de seguimiento registrada",
  CASE_FOLLOW_UP_CONSENT_REVOKED: "Autorización de seguimiento revocada",
  COMMUNICATION_REVIEW_DECIDED: "Comunicación revisada",
  COMMUNICATION_REVIEW_REQUESTED: "Comunicación enviada a revisión",
  COMMITMENT_CREATED: "Compromiso creado",
  COMMITMENT_UPDATED: "Compromiso actualizado",
  E14_POLLING_PLACE_PROFILE_UPDATED: "Cobertura esperada del puesto actualizada",
  E14_REPORT_ACCEPTED: "Reporte E-14 aceptado",
  E14_REPORT_REJECTED: "Reporte E-14 rechazado",
  E14_REPORT_SUBMITTED: "Reporte E-14 radicado",
  E14_REPORT_SUPERSEDED: "Reporte E-14 reemplazado",
  INTERACTION_RECORDED: "Gestión de contacto registrada",
  ISSUE_CASE_CREATED: "Caso creado",
  ISSUE_CASE_UPDATED: "Caso actualizado",
  CASE_UPDATED: "Caso actualizado",
  POLITICAL_DIVISION_CREATED: "División territorial creada",
  POLITICAL_GEOGRAPHY_SYNCHRONIZED: "Geografía oficial sincronizada",
  STORAGE_DOWNLOAD_AUTHORIZED: "Descarga de soporte autorizada",
  STORAGE_UPLOAD_CONFIRMED: "Carga de soporte confirmada",
  TEAM_INVITATION_ACCEPTED: "Invitación de equipo aceptada",
  TEAM_INVITATION_CREATED: "Invitación de equipo creada",
  TEAM_MEMBER_ACTIVATED: "Integrante activado",
  TEAM_MEMBER_DEACTIVATED: "Integrante desactivado",
  TEAM_MEMBER_DIVISION_CHANGED: "Asignación territorial actualizada",
  TEAM_MEMBER_ACCESS_RESET: "Acceso de integrante restablecido",
  TEAM_MEMBER_ROLE_CHANGED: "Rol de integrante actualizado",
  TASK_CREATED: "Tarea creada",
  TASK_UPDATED: "Tarea actualizada",
  VOTER_CONSENT_REVOKED: "Consentimiento electoral revocado",
  VOTER_CONSENT_REAUTHORIZED: "Consentimiento electoral reautorizado",
  CONSENT_NOTICE_ACTIVATED: "Nueva versión del aviso de privacidad activada",
  VOTER_DATA_CORRECTED: "Datos personales corregidos",
  VOTER_DATA_EXPORTED: "Ficha personal exportada",
  VOTER_PII_VIEWED: "Datos personales consultados",
  VOTER_REGISTERED_WITH_CONSENT:
    "Persona registrada con autorización verificable",
};

const RESOURCE_LABELS: Record<string, string> = {
  CampaignEvent: "Evento",
  CneReviewDraft: "Borrador financiero",
  Commitment: "Compromiso",
  CommunicationApproval: "Comunicación",
  ConsentRecord: "Consentimiento",
  ConsentNotice: "Aviso de privacidad",
  FinancialEntry: "Movimiento financiero",
  IssueCase: "Caso",
  PoliticalDivision: "División territorial",
  StorageObject: "Archivo",
  TeamInvitation: "Invitación",
  Task: "Tarea",
  User: "Integrante",
  Voter: "Persona vinculada",
  WitnessReport: "Reporte E-14",
};

function actionLabel(action: string) {
  return ACTION_LABELS[action] ?? action.replaceAll("_", " ").toLowerCase();
}

function readableError(error: unknown) {
  if (error instanceof ApiError) return error.message;
  if (error instanceof Error && error.message) return error.message;
  return "No fue posible consultar la bitácora. Intenta nuevamente.";
}

function formatTimestamp(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Fecha no disponible";
  return new Intl.DateTimeFormat("es-CO", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "America/Bogota",
  }).format(date);
}

function startOfBogotaDay(value: string) {
  return value ? `${value}T00:00:00.000-05:00` : undefined;
}

function endOfBogotaDay(value: string) {
  return value ? `${value}T23:59:59.999-05:00` : undefined;
}

function AuditRow({ event }: { event: AuditEvent }) {
  return (
    <tr
      data-testid={`audit-row-${event.id}`}
      className="border-t border-slate-100 align-top"
    >
      <td className="whitespace-nowrap px-4 py-4 text-sm font-semibold text-slate-600">
        {formatTimestamp(event.occurredAt)}
      </td>
      <td className="px-4 py-4">
        <p className="text-sm font-black text-slate-950">
          {actionLabel(event.action)}
        </p>
        <p className="mt-1 font-mono text-[10px] font-bold uppercase tracking-wide text-slate-400">
          {event.action}
        </p>
        <p className="mt-1 text-xs font-semibold text-slate-500">
          {RESOURCE_LABELS[event.resourceType] ?? event.resourceType}
          {event.resourceId ? ` · ${event.resourceId}` : ""}
        </p>
      </td>
      <td className="px-4 py-4">
        {event.actor ? (
          <div className="flex items-start gap-2">
            <UserRound
              aria-hidden="true"
              className="mt-0.5 shrink-0 text-slate-400"
              size={16}
            />
            <div>
              <p className="text-sm font-bold text-slate-800">
                {event.actor.name}
              </p>
              <p className="text-xs font-semibold text-slate-500">
                {getRoleLabel(event.actor.role)}
              </p>
            </div>
          </div>
        ) : (
          <span className="text-sm font-semibold text-slate-500">
            Sistema o servicio
          </span>
        )}
      </td>
      <td className="px-4 py-4">
        <span
          className={`inline-flex rounded-full px-3 py-1 text-[10px] font-black uppercase tracking-wider ring-1 ${OUTCOME_STYLES[event.outcome]}`}
        >
          {OUTCOME_LABELS[event.outcome]}
        </span>
      </td>
    </tr>
  );
}

function AuditCard({ event }: { event: AuditEvent }) {
  const resourceLabel =
    RESOURCE_LABELS[event.resourceType] ?? event.resourceType;

  return (
    <li data-testid={`audit-card-${event.id}`} className="px-4 py-5">
      <article aria-label={`${actionLabel(event.action)}: ${resourceLabel}`}>
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h3 className="text-sm font-black leading-5 text-slate-950">
              {actionLabel(event.action)}
            </h3>
            <p className="mt-1 break-all font-mono text-[10px] font-bold uppercase tracking-wide text-slate-500">
              {event.action}
            </p>
          </div>
          <span
            className={`inline-flex shrink-0 rounded-full px-3 py-1 text-[10px] font-black uppercase tracking-wider ring-1 ${OUTCOME_STYLES[event.outcome]}`}
          >
            {OUTCOME_LABELS[event.outcome]}
          </span>
        </div>

        <dl className="mt-4 grid gap-3 text-sm">
          <div>
            <dt className="text-[10px] font-black uppercase tracking-wider text-slate-500">
              Fecha
            </dt>
            <dd className="mt-0.5 font-semibold text-slate-700">
              <time dateTime={event.occurredAt}>
                {formatTimestamp(event.occurredAt)}
              </time>
            </dd>
          </div>
          <div>
            <dt className="text-[10px] font-black uppercase tracking-wider text-slate-500">
              Recurso
            </dt>
            <dd className="mt-0.5 font-semibold text-slate-700">
              {resourceLabel}
              {event.resourceId ? (
                <span className="block break-all text-xs text-slate-500">
                  {event.resourceId}
                </span>
              ) : null}
            </dd>
          </div>
          <div>
            <dt className="text-[10px] font-black uppercase tracking-wider text-slate-500">
              Actor
            </dt>
            <dd className="mt-1 flex items-start gap-2 text-slate-700">
              <UserRound
                aria-hidden="true"
                className="mt-0.5 shrink-0 text-slate-400"
                size={16}
              />
              {event.actor ? (
                <span>
                  <span className="block font-bold">{event.actor.name}</span>
                  <span className="block text-xs font-semibold text-slate-500">
                    {getRoleLabel(event.actor.role)}
                  </span>
                </span>
              ) : (
                <span className="font-semibold text-slate-500">
                  Sistema o servicio
                </span>
              )}
            </dd>
          </div>
        </dl>
      </article>
    </li>
  );
}

export default function AuditPage() {
  const [draftFilters, setDraftFilters] = useState<AuditFilters>(EMPTY_FILTERS);
  const [filters, setFilters] = useState<AuditFilters>(EMPTY_FILTERS);
  const [page, setPage] = useState(1);
  const [result, setResult] = useState<AuditEventPage | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadEvents = useCallback(
    async (signal?: AbortSignal) => {
      setLoading(true);
      setError(null);
      try {
        const data = await listAuditEvents(
          {
            page,
            limit: PAGE_SIZE,
            action: filters.action.trim() || undefined,
            resourceType: filters.resourceType.trim() || undefined,
            outcome: filters.outcome || undefined,
            occurredFrom: startOfBogotaDay(filters.occurredFrom),
            occurredTo: endOfBogotaDay(filters.occurredTo),
          },
          signal,
        );
        setResult(data);
      } catch (caught) {
        if (caught instanceof DOMException && caught.name === "AbortError") {
          return;
        }
        setError(readableError(caught));
      } finally {
        if (!signal?.aborted) setLoading(false);
      }
    },
    [filters, page],
  );

  useEffect(() => {
    const controller = new AbortController();
    void loadEvents(controller.signal);
    return () => controller.abort();
  }, [loadEvents]);

  function applyFilters(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (
      draftFilters.occurredFrom &&
      draftFilters.occurredTo &&
      draftFilters.occurredFrom > draftFilters.occurredTo
    ) {
      setError("La fecha inicial no puede ser posterior a la fecha final.");
      return;
    }
    setPage(1);
    setFilters({ ...draftFilters });
  }

  function clearFilters() {
    setDraftFilters(EMPTY_FILTERS);
    setPage(1);
    setFilters(EMPTY_FILTERS);
  }

  const pagination = result?.pagination;
  const items = result?.items ?? [];

  return (
    <div className="mx-auto w-full max-w-7xl space-y-6">
      <header className="overflow-hidden rounded-3xl bg-slate-950 p-6 text-white shadow-xl md:p-8">
        <div className="flex flex-col gap-5 md:flex-row md:items-center md:justify-between">
          <div>
            <div className="mb-3 flex items-center gap-2 text-xs font-black uppercase tracking-[0.2em] text-blue-300">
              <ShieldCheck aria-hidden="true" size={18} /> Control interno
            </div>
            <h1 className="text-3xl font-black tracking-tight md:text-4xl">
              Bitácora de auditoría
            </h1>
            <p className="mt-3 max-w-3xl text-sm font-medium leading-6 text-slate-300">
              Consulta eventos del modo operativo activo. Esta vista excluye
              datos técnicos, direcciones de red y contenido anterior o
              posterior de los registros.
            </p>
          </div>
          <button
            type="button"
            onClick={() => void loadEvents()}
            disabled={loading}
            className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-white px-4 text-xs font-black uppercase tracking-wider text-slate-950 disabled:opacity-50"
          >
            <RefreshCw
              aria-hidden="true"
              className={loading ? "animate-spin" : ""}
              size={16}
            />
            Actualizar
          </button>
        </div>
      </header>

      <form
        onSubmit={applyFilters}
        className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm"
      >
        <div className="mb-4 flex items-center gap-2">
          <Filter aria-hidden="true" className="text-blue-700" size={18} />
          <h2 className="text-sm font-black uppercase tracking-wider text-slate-800">
            Filtros
          </h2>
        </div>
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
          <label className="space-y-1 text-xs font-black text-slate-600">
            Acción
            <input
              value={draftFilters.action}
              onChange={(event) =>
                setDraftFilters((current) => ({
                  ...current,
                  action: event.target.value,
                }))
              }
              maxLength={120}
              placeholder="Ej. CASE_UPDATED"
              className="min-h-11 w-full rounded-xl border border-slate-200 px-3 text-sm font-semibold text-slate-900"
            />
          </label>
          <label className="space-y-1 text-xs font-black text-slate-600">
            Tipo de recurso
            <input
              value={draftFilters.resourceType}
              onChange={(event) =>
                setDraftFilters((current) => ({
                  ...current,
                  resourceType: event.target.value,
                }))
              }
              maxLength={120}
              placeholder="Ej. IssueCase"
              className="min-h-11 w-full rounded-xl border border-slate-200 px-3 text-sm font-semibold text-slate-900"
            />
          </label>
          <label className="space-y-1 text-xs font-black text-slate-600">
            Resultado
            <select
              value={draftFilters.outcome}
              onChange={(event) =>
                setDraftFilters((current) => ({
                  ...current,
                  outcome: event.target.value as "" | AuditOutcome,
                }))
              }
              className="min-h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-900"
            >
              <option value="">Todos</option>
              <option value="SUCCESS">Exitosa</option>
              <option value="DENIED">Denegada</option>
              <option value="FAILURE">Fallida</option>
            </select>
          </label>
          <label className="space-y-1 text-xs font-black text-slate-600">
            Desde
            <input
              type="date"
              value={draftFilters.occurredFrom}
              onChange={(event) =>
                setDraftFilters((current) => ({
                  ...current,
                  occurredFrom: event.target.value,
                }))
              }
              className="min-h-11 w-full rounded-xl border border-slate-200 px-3 text-sm font-semibold text-slate-900"
            />
          </label>
          <label className="space-y-1 text-xs font-black text-slate-600">
            Hasta
            <input
              type="date"
              value={draftFilters.occurredTo}
              onChange={(event) =>
                setDraftFilters((current) => ({
                  ...current,
                  occurredTo: event.target.value,
                }))
              }
              className="min-h-11 w-full rounded-xl border border-slate-200 px-3 text-sm font-semibold text-slate-900"
            />
          </label>
        </div>
        <div className="mt-4 flex flex-wrap justify-end gap-3">
          <button
            type="button"
            onClick={clearFilters}
            className="min-h-11 rounded-xl border border-slate-200 px-4 text-xs font-black uppercase tracking-wider text-slate-600"
          >
            Limpiar
          </button>
          <button
            type="submit"
            className="min-h-11 rounded-xl bg-blue-700 px-5 text-xs font-black uppercase tracking-wider text-white"
          >
            Aplicar filtros
          </button>
        </div>
      </form>

      {error && (
        <div
          role="alert"
          className="flex items-start gap-3 rounded-2xl border border-red-200 bg-red-50 p-4 text-sm font-bold text-red-800"
        >
          <AlertCircle aria-hidden="true" className="shrink-0" size={20} />
          {error}
        </div>
      )}

      <section
        aria-labelledby="audit-results-title"
        className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm"
      >
        <div className="flex items-center justify-between gap-4 border-b border-slate-100 px-5 py-4">
          <div>
            <h2
              id="audit-results-title"
              className="text-lg font-black text-slate-950"
            >
              Eventos registrados
            </h2>
            <p className="text-xs font-semibold text-slate-500">
              {pagination ? `${pagination.total} eventos` : "Consultando…"}
            </p>
          </div>
          {loading && (
            <Loader2
              aria-label="Cargando eventos"
              className="animate-spin text-blue-700"
              size={22}
            />
          )}
        </div>

        {!loading && !error && items.length === 0 ? (
          <div className="flex flex-col items-center gap-3 px-6 py-16 text-center">
            <ClipboardList
              aria-hidden="true"
              className="text-slate-300"
              size={42}
            />
            <p className="font-black text-slate-800">
              No hay eventos para estos filtros
            </p>
            <p className="max-w-md text-sm font-medium text-slate-500">
              Ajusta el intervalo o limpia los filtros para ampliar la consulta.
            </p>
          </div>
        ) : (
          <>
            <ul className="divide-y divide-slate-100 md:hidden">
              {items.map((event) => (
                <AuditCard key={event.id} event={event} />
              ))}
            </ul>
            <div className="hidden overflow-x-auto md:block">
              <table className="min-w-full text-left">
                <thead className="bg-slate-50 text-[10px] font-black uppercase tracking-wider text-slate-500">
                  <tr>
                    <th scope="col" className="px-4 py-3">
                      Fecha
                    </th>
                    <th scope="col" className="px-4 py-3">
                      Evento y recurso
                    </th>
                    <th scope="col" className="px-4 py-3">
                      Actor
                    </th>
                    <th scope="col" className="px-4 py-3">
                      Resultado
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((event) => (
                    <AuditRow key={event.id} event={event} />
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}

        {pagination && pagination.totalPages > 1 && (
          <nav
            aria-label="Paginación de auditoría"
            className="flex items-center justify-between gap-4 border-t border-slate-100 px-5 py-4"
          >
            <button
              type="button"
              disabled={loading || page <= 1}
              onClick={() => setPage((current) => Math.max(1, current - 1))}
              className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-slate-200 px-4 text-xs font-black text-slate-700 disabled:opacity-40"
            >
              <ChevronLeft aria-hidden="true" size={16} /> Anterior
            </button>
            <span className="text-xs font-black text-slate-500">
              Página {pagination.page} de {pagination.totalPages}
            </span>
            <button
              type="button"
              disabled={loading || page >= pagination.totalPages}
              onClick={() => setPage((current) => current + 1)}
              className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-slate-200 px-4 text-xs font-black text-slate-700 disabled:opacity-40"
            >
              Siguiente <ChevronRight aria-hidden="true" size={16} />
            </button>
          </nav>
        )}
      </section>
    </div>
  );
}
