"use client";

import { usePageRequest } from "@/lib/use-page-request";

import { getRoleLabel } from "@/config/navigation";
import { PageHeader } from "@/components/ui/PageHeader";
import { ApiError } from "@/lib/api-client";
import {
  AuditEvent,
  AuditOutcome,
  listAuditEvents,
} from "@/lib/audit-events-api";
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
import { FormEvent, useCallback, useState } from "react";

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
  ACCOUNT_SESSIONS_REVOKED: "Sesiones de la cuenta cerradas",
  PROPOSAL_CREATED: "Propuesta creada",
  MFA_VERIFICATION_FAILED: "Verificación de doble factor rechazada",
  ORGANIZATION_NAME_CHANGED: "Nombre de organización actualizado",
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
  E14_POLLING_PLACE_PROFILE_UPDATED:
    "Cobertura esperada del puesto actualizada",
  E14_REPORT_ACCEPTED: "Reporte E-14 aceptado",
  E14_REPORT_REJECTED: "Reporte E-14 rechazado",
  E14_REPORT_SUBMITTED: "Reporte E-14 registrado internamente",
  E14_REPORT_SUPERSEDED: "Reporte E-14 reemplazado",
  INTERACTION_RECORDED: "Gestión de contacto registrada",
  ISSUE_CASE_CREATED: "Caso creado",
  ISSUE_CASE_UPDATED: "Caso de atención actualizado",
  CASE_UPDATED: "Caso actualizado (CASE_UPDATED)",
  PERSON_IMPORT_REQUESTED: "Archivo de personas recibido para revisión",
  PERSON_IMPORT_VALIDATED: "Revisión del archivo de personas terminada",
  PERSON_IMPORT_EXECUTION_REQUESTED: "Importación de personas solicitada",
  PERSON_IMPORT_BATCH_COMMITTED: "Grupo de personas importado",
  PERSON_IMPORT_COMPLETED: "Importación de personas terminada",
  PERSON_IMPORT_ERRORS_EXPORTED: "Errores de importación descargados",
  POLITICAL_DIVISION_CREATED: "División territorial creada",
  POLITICAL_GEOGRAPHY_SYNCHRONIZED: "Geografía oficial sincronizada",
  STORAGE_DOWNLOAD_AUTHORIZED: "Descarga de soporte autorizada",
  STORAGE_UPLOAD_CONFIRMED: "Carga de soporte confirmada",
  STORAGE_CONTENT_INTEGRITY_VERIFIED: "Integridad del archivo verificada",
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
  PersonImportJob: "Importación de personas",
  PoliticalDivision: "División territorial",
  PoliticalProposal: "Propuesta",
  StorageObject: "Archivo",
  TeamInvitation: "Invitación",
  Task: "Tarea",
  User: "Integrante",
  Voter: "Persona vinculada",
  WitnessReport: "Reporte E-14",
};

function actionLabel(action: string) {
  return Object.hasOwn(ACTION_LABELS, action) ? ACTION_LABELS[action] : action;
}

function resourceTypeLabel(resourceType: string) {
  return Object.hasOwn(RESOURCE_LABELS, resourceType)
    ? RESOURCE_LABELS[resourceType]
    : resourceType;
}

function TechnicalDetails({ event }: { event: AuditEvent }) {
  return (
    <details className="mt-2 text-xs text-slate-600">
      <summary className="cursor-pointer py-2 font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600">
        Ver códigos del registro
      </summary>
      <dl className="mt-1 space-y-2 break-all">
        <div>
          <dt>Acción</dt>
          <dd className="font-mono">{event.action}</dd>
        </div>
        <div>
          <dt>Tipo de registro</dt>
          <dd className="font-mono">{event.resourceType}</dd>
        </div>
        {event.resourceId && (
          <div>
            <dt>Identificador del registro</dt>
            <dd className="font-mono">{event.resourceId}</dd>
          </div>
        )}
      </dl>
    </details>
  );
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
        <p className="text-sm font-semibold text-slate-950">
          {actionLabel(event.action)}
        </p>
        <p className="mt-1 text-xs font-semibold text-slate-500">
          {resourceTypeLabel(event.resourceType)}
        </p>
        <TechnicalDetails event={event} />
      </td>
      <td className="px-4 py-4">
        {event.actor ? (
          <div className="flex items-start gap-2 min-w-0">
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
          className={`inline-flex rounded-full px-3 py-1 text-xs font-semibold ring-1 ${OUTCOME_STYLES[event.outcome]}`}
        >
          {OUTCOME_LABELS[event.outcome]}
        </span>
      </td>
    </tr>
  );
}

function AuditCard({ event }: { event: AuditEvent }) {
  const resourceLabel = resourceTypeLabel(event.resourceType);

  return (
    <li data-testid={`audit-card-${event.id}`} className="px-4 py-5 min-w-0">
      <article aria-label={`${actionLabel(event.action)}: ${resourceLabel}`}>
        <div className="flex items-start justify-between gap-3 min-w-0 flex-wrap">
          <div className="min-w-0">
            <h3 className="text-sm font-semibold leading-5 text-slate-950">
              {actionLabel(event.action)}
            </h3>
          </div>
          <span
            className={`inline-flex shrink-0 rounded-full px-3 py-1 text-xs font-semibold ring-1 ${OUTCOME_STYLES[event.outcome]}`}
          >
            {OUTCOME_LABELS[event.outcome]}
          </span>
        </div>

        <dl className="mt-4 grid gap-3 text-sm min-w-0">
          <div>
            <dt className="text-xs font-semibold text-slate-500">Fecha</dt>
            <dd className="mt-0.5 font-semibold text-slate-700">
              <time dateTime={event.occurredAt}>
                {formatTimestamp(event.occurredAt)}
              </time>
            </dd>
          </div>
          <div>
            <dt className="text-xs font-semibold text-slate-500">
              Tipo de registro
            </dt>
            <dd className="mt-0.5 font-semibold text-slate-700">
              {resourceLabel}
            </dd>
          </div>
          <div>
            <dt className="text-xs font-semibold text-slate-500">
              Realizado por
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
        <TechnicalDetails event={event} />
      </article>
    </li>
  );
}

export default function AuditPage() {
  const [draftFilters, setDraftFilters] = useState<AuditFilters>(EMPTY_FILTERS);
  const [filters, setFilters] = useState<AuditFilters>(EMPTY_FILTERS);
  const [page, setPage] = useState(1);
  const [filterError, setError] = useState<string | null>(null);
  const request = useCallback(
    (signal: AbortSignal) =>
      listAuditEvents(
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
      ),
    [filters, page],
  );
  const {
    data: result,
    loading,
    error: requestError,
    refresh: loadEvents,
  } = usePageRequest(request);
  const error =
    filterError ?? (requestError ? readableError(requestError) : null);

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
    setError(null);
    setPage(1);
    setFilters({ ...draftFilters });
  }

  function clearFilters() {
    setError(null);
    setDraftFilters(EMPTY_FILTERS);
    setPage(1);
    setFilters(EMPTY_FILTERS);
  }

  const pagination = result?.pagination;
  const items = result?.items ?? [];

  return (
    <div className="mx-auto w-full max-w-7xl space-y-6 min-w-0">
      <PageHeader
        title="Historial de actividad"
        eyebrow="Auditoría"
        icon={ShieldCheck}
        description="Consulta quién hizo cada acción, cuándo ocurrió y qué resultado quedó registrado. Los códigos e identificadores se conservan en el detalle de cada evento."
        actions={
          <button
            type="button"
            onClick={() => void loadEvents()}
            disabled={loading}
            className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-700 disabled:opacity-50 max-w-full whitespace-normal"
          >
            <RefreshCw
              aria-hidden="true"
              className={loading ? "animate-spin" : ""}
              size={16}
            />
            Actualizar
          </button>
        }
      />

      <form
        onSubmit={applyFilters}
        className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm min-w-0"
      >
        <div className="mb-4 flex items-center gap-2 min-w-0">
          <Filter aria-hidden="true" className="text-blue-700" size={18} />
          <h2 className="text-sm font-semibold text-slate-800">Filtros</h2>
        </div>
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-5 min-w-0">
          <label className="space-y-1 text-sm font-semibold text-slate-600 min-w-0">
            Acción
            <select
              value={draftFilters.action}
              onChange={(event) =>
                setDraftFilters((current) => ({
                  ...current,
                  action: event.target.value,
                }))
              }
              className="min-h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-900 min-w-0 max-w-full"
            >
              <option value="">Todas las acciones</option>
              {Object.entries(ACTION_LABELS)
                .sort((a, b) => a[1].localeCompare(b[1], "es"))
                .map(([code, label]) => (
                  <option key={code} value={code}>
                    {label}
                  </option>
                ))}
              {draftFilters.action &&
                !Object.hasOwn(ACTION_LABELS, draftFilters.action) && (
                  <option value={draftFilters.action}>
                    {draftFilters.action}
                  </option>
                )}
            </select>
          </label>
          <label className="space-y-1 text-sm font-semibold text-slate-600 min-w-0">
            Tipo de registro
            <select
              value={draftFilters.resourceType}
              onChange={(event) =>
                setDraftFilters((current) => ({
                  ...current,
                  resourceType: event.target.value,
                }))
              }
              className="min-h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-900 min-w-0 max-w-full"
            >
              <option value="">Todos los registros</option>
              {Object.entries(RESOURCE_LABELS)
                .sort((a, b) => a[1].localeCompare(b[1], "es"))
                .map(([code, label]) => (
                  <option key={code} value={code}>
                    {label}
                  </option>
                ))}
              {draftFilters.resourceType &&
                !Object.hasOwn(RESOURCE_LABELS, draftFilters.resourceType) && (
                  <option value={draftFilters.resourceType}>
                    {draftFilters.resourceType}
                  </option>
                )}
            </select>
          </label>
          <label className="space-y-1 text-sm font-semibold text-slate-600 min-w-0">
            Resultado
            <select
              value={draftFilters.outcome}
              onChange={(event) =>
                setDraftFilters((current) => ({
                  ...current,
                  outcome: event.target.value as "" | AuditOutcome,
                }))
              }
              className="min-h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-900 min-w-0 max-w-full"
            >
              <option value="">Todos</option>
              <option value="SUCCESS">Exitosa</option>
              <option value="DENIED">Denegada</option>
              <option value="FAILURE">Fallida</option>
            </select>
          </label>
          <label className="space-y-1 text-sm font-semibold text-slate-600 min-w-0">
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
              className="min-h-11 w-full rounded-xl border border-slate-200 px-3 text-sm font-semibold text-slate-900 min-w-0 max-w-full"
            />
          </label>
          <label className="space-y-1 text-sm font-semibold text-slate-600 min-w-0">
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
              className="min-h-11 w-full rounded-xl border border-slate-200 px-3 text-sm font-semibold text-slate-900 min-w-0 max-w-full"
            />
          </label>
        </div>
        <details className="mt-4 rounded-xl border border-slate-200 p-3 text-sm text-slate-600">
          <summary className="cursor-pointer py-1 font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600">
            Buscar por un código que no aparece en la lista
          </summary>
          <p className="mt-2">
            Copia el código exacto desde «Ver códigos del registro». Los códigos
            desconocidos se muestran sin traducir.
          </p>
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            <label className="space-y-1">
              Código exacto de la acción
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
                className="min-h-11 w-full min-w-0 rounded-xl border border-slate-200 px-3 text-sm text-slate-900"
              />
            </label>
            <label className="space-y-1">
              Código exacto del tipo de registro
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
                className="min-h-11 w-full min-w-0 rounded-xl border border-slate-200 px-3 text-sm text-slate-900"
              />
            </label>
          </div>
        </details>
        <div className="mt-4 flex flex-wrap justify-end gap-3 min-w-0">
          <button
            type="button"
            onClick={clearFilters}
            className="min-h-11 rounded-xl border border-slate-200 px-4 text-sm font-semibold text-slate-600 max-w-full whitespace-normal"
          >
            Limpiar
          </button>
          <button
            type="submit"
            className="min-h-11 rounded-xl bg-blue-700 px-5 text-sm font-semibold text-white max-w-full whitespace-normal"
          >
            Aplicar filtros
          </button>
        </div>
      </form>

      {error && (
        <div
          role="alert"
          className="flex items-start gap-3 rounded-2xl border border-red-200 bg-red-50 p-4 text-sm font-bold text-red-800 min-w-0"
        >
          <AlertCircle aria-hidden="true" className="shrink-0" size={20} />
          {error}
        </div>
      )}

      <section
        aria-labelledby="audit-results-title"
        className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm min-w-0"
      >
        <div className="flex items-center justify-between gap-4 border-b border-slate-100 px-5 py-4 min-w-0 flex-wrap">
          <div>
            <h2
              id="audit-results-title"
              className="text-lg font-semibold text-slate-950"
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
          <div className="flex flex-col items-center gap-3 px-6 py-16 text-center min-w-0">
            <ClipboardList
              aria-hidden="true"
              className="text-slate-300"
              size={42}
            />
            <p className="font-semibold text-slate-800">
              No hay eventos para estos filtros
            </p>
            <p className="max-w-md text-sm font-medium text-slate-500">
              Ajusta el intervalo o limpia los filtros para ampliar la consulta.
            </p>
          </div>
        ) : (
          <>
            <ul className="divide-y divide-slate-100 md:hidden min-w-0">
              {items.map((event) => (
                <AuditCard key={event.id} event={event} />
              ))}
            </ul>
            <div
              className="hidden overflow-x-auto md:block min-w-0 max-w-full rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
              role="region"
              aria-label="Registro de auditoría: tabla con desplazamiento horizontal"
              tabIndex={0}
            >
              <table className="min-w-full text-left">
                <thead className="bg-slate-50 text-xs font-semibold text-slate-500">
                  <tr>
                    <th scope="col" className="px-4 py-3">
                      Fecha
                    </th>
                    <th scope="col" className="px-4 py-3">
                      Acción y registro
                    </th>
                    <th scope="col" className="px-4 py-3">
                      Realizado por
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
            className="flex items-center justify-between gap-4 border-t border-slate-100 px-5 py-4 min-w-0 flex-wrap"
          >
            <button
              type="button"
              disabled={loading || page <= 1}
              onClick={() => setPage((current) => Math.max(1, current - 1))}
              className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-slate-200 px-4 text-sm font-semibold text-slate-700 disabled:opacity-40 max-w-full whitespace-normal"
            >
              <ChevronLeft aria-hidden="true" size={16} /> Anterior
            </button>
            <span className="text-xs font-semibold text-slate-500">
              Página {pagination.page} de {pagination.totalPages}
            </span>
            <button
              type="button"
              disabled={loading || page >= pagination.totalPages}
              onClick={() => setPage((current) => current + 1)}
              className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-slate-200 px-4 text-sm font-semibold text-slate-700 disabled:opacity-40 max-w-full whitespace-normal"
            >
              Siguiente <ChevronRight aria-hidden="true" size={16} />
            </button>
          </nav>
        )}
      </section>
    </div>
  );
}
