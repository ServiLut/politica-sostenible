"use client";

import { usePageRequest } from "@/lib/use-page-request";

import { useSearchParams } from "next/navigation";

import { CaseInteractionsPanel } from "@/components/cases/CaseInteractionsPanel";
import { IncidentMunicipalitySelector } from "@/components/territory/IncidentMunicipalitySelector";
import { UserCombobox } from "@/components/ui/UserCombobox";
import { useAuth } from "@/context/auth";
import { ApiError } from "@/lib/api-client";
import {
  CommunicationChannel,
  createIssueCase,
  getIssueCase,
  IssueCase,
  IssueCaseStatus,
  listCaseAssignees,
  listIssueCases,
  updateIssueCase,
  UpdateIssueCaseInput,
  WorkPriority,
} from "@/lib/cases-api";
import { useAccessibleDialog } from "@/lib/use-accessible-dialog";
import { type IncidentMunicipality } from "@/lib/incident-municipalities";
import { BackendUserRole } from "@/types/saas-schema";
import {
  AlertCircle,
  AlertTriangle,
  CalendarClock,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  FileLock2,
  History,
  Inbox,
  MapPin,
  Loader2,
  Plus,
  RefreshCw,
  Search,
  ShieldCheck,
  UserRoundCheck,
  X,
} from "lucide-react";
import {
  FormEvent,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

const PAGE_SIZE = 12;
const searchIncidentAssignees = (search: string, signal: AbortSignal) =>
  listCaseAssignees({ search, limit: 20 }, signal);

const INCIDENT_WRITE_ROLES = new Set<BackendUserRole>([
  "ADMIN",
  "CAMPAIGN_MANAGER",
]);
const INCIDENT_CONSENT_REVOKE_ROLES = new Set<BackendUserRole>([
  ...INCIDENT_WRITE_ROLES,
  "COMPLIANCE_OFFICER",
]);

const STATUS_OPTIONS: ReadonlyArray<{
  value: IssueCaseStatus;
  label: string;
}> = [
  { value: "OPEN", label: "Reportado" },
  { value: "TRIAGED", label: "Validado y clasificado" },
  { value: "IN_PROGRESS", label: "Respuesta en curso" },
  { value: "WAITING_ON_CITIZEN", label: "Esperando al reportante" },
  { value: "WAITING_ON_EXTERNAL_ENTITY", label: "Esperando a tercero" },
  { value: "RESOLVED", label: "Resuelto" },
  { value: "CLOSED", label: "Cerrado" },
  { value: "CANCELLED", label: "Descartado" },
];

const PRIORITY_OPTIONS: ReadonlyArray<{
  value: WorkPriority;
  label: string;
}> = [
  { value: "LOW", label: "Baja" },
  { value: "MEDIUM", label: "Media" },
  { value: "HIGH", label: "Alta" },
  { value: "URGENT", label: "Crítica" },
];

const CHANNEL_OPTIONS: ReadonlyArray<{
  value: CommunicationChannel;
  label: string;
}> = [
  { value: "INTERNAL", label: "Equipo interno" },
  { value: "IN_PERSON", label: "Reporte presencial" },
  { value: "PHONE", label: "Llamada" },
  { value: "WHATSAPP", label: "WhatsApp" },
  { value: "EMAIL", label: "Correo" },
  { value: "SOCIAL_MEDIA", label: "Red social" },
  { value: "WEB", label: "Formulario web" },
  { value: "SMS", label: "SMS" },
  { value: "LETTER", label: "Documento físico" },
];

const INCIDENT_CATEGORIES = [
  "Seguridad",
  "Jurídico y electoral",
  "Logística",
  "Comunicaciones",
  "Tecnología",
  "Orden público",
  "Bienestar del equipo",
  "Otro",
] as const;

const TRANSITIONS: Readonly<Record<IssueCaseStatus, IssueCaseStatus[]>> = {
  OPEN: ["TRIAGED", "IN_PROGRESS", "CANCELLED"],
  TRIAGED: [
    "IN_PROGRESS",
    "WAITING_ON_CITIZEN",
    "WAITING_ON_EXTERNAL_ENTITY",
    "RESOLVED",
    "CANCELLED",
  ],
  IN_PROGRESS: [
    "WAITING_ON_CITIZEN",
    "WAITING_ON_EXTERNAL_ENTITY",
    "RESOLVED",
    "CANCELLED",
  ],
  WAITING_ON_CITIZEN: ["IN_PROGRESS", "RESOLVED", "CANCELLED"],
  WAITING_ON_EXTERNAL_ENTITY: ["IN_PROGRESS", "RESOLVED", "CANCELLED"],
  RESOLVED: ["CLOSED", "IN_PROGRESS"],
  CLOSED: ["IN_PROGRESS"],
  CANCELLED: ["OPEN"],
};

const TERMINAL_STATUSES = new Set<IssueCaseStatus>([
  "RESOLVED",
  "CLOSED",
  "CANCELLED",
]);

interface Filters {
  page: number;
  search: string;
  status: "" | IssueCaseStatus;
  priority: "" | WorkPriority;
}

const INITIAL_FILTERS: Filters = {
  page: 1,
  search: "",
  status: "",
  priority: "",
};

function optionLabel<T extends string>(
  value: T,
  options: ReadonlyArray<{ value: T; label: string }>,
) {
  return options.find((option) => option.value === value)?.label ?? value;
}

function readableError(error: unknown) {
  if (error instanceof ApiError) return error.message;
  if (error instanceof Error && error.message) return error.message;
  return "Ocurrió un error inesperado. Intenta nuevamente.";
}

function toDateInput(value: string | null) {
  return value ? value.slice(0, 10) : "";
}

function toApiDate(value: string) {
  return new Date(`${value}T12:00:00`).toISOString();
}

function formatDate(value: string | null) {
  if (!value) return "Sin vencimiento";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Fecha no disponible";
  return new Intl.DateTimeFormat("es-CO", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(date);
}

function isOverdue(issueCase: IssueCase) {
  return (
    Boolean(issueCase.dueAt) &&
    !TERMINAL_STATUSES.has(issueCase.status) &&
    new Date(issueCase.dueAt as string).getTime() < Date.now()
  );
}

function severityClasses(priority: WorkPriority) {
  if (priority === "URGENT") return "bg-red-100 text-red-800";
  if (priority === "HIGH") return "bg-orange-100 text-orange-800";
  if (priority === "MEDIUM") return "bg-amber-100 text-amber-800";
  return "bg-slate-100 text-slate-700";
}

function IncidentCard({
  incident,
  canMutate,
  saving,
  onSave,
  onOpenInteractions,
}: {
  incident: IssueCase;
  canMutate: boolean;
  saving: boolean;
  onSave: (incident: IssueCase, input: UpdateIssueCaseInput) => Promise<void>;
  onOpenInteractions: (incident: IssueCase) => void;
}) {
  const [status, setStatus] = useState(incident.status);
  const [priority, setPriority] = useState(incident.priority);
  const [assigneeId, setAssigneeId] = useState(incident.assigneeId ?? "");
  const [dueDate, setDueDate] = useState(toDateInput(incident.dueAt));
  const [municipality, setMunicipality] = useState<IncidentMunicipality | null>(
    incident.division ??
      (incident.divisionId
        ? { id: incident.divisionId, name: "Territorio vinculado" }
        : null),
  );
  const nextStatuses = useMemo(
    () => [incident.status, ...TRANSITIONS[incident.status]],
    [incident.status],
  );
  const hasChanges =
    status !== incident.status ||
    priority !== incident.priority ||
    assigneeId !== (incident.assigneeId ?? "") ||
    dueDate !== toDateInput(incident.dueAt) ||
    (municipality?.id ?? null) !== incident.divisionId;
  const overdue = isOverdue(incident);

  function save() {
    const input: UpdateIssueCaseInput = {};
    if (status !== incident.status) input.status = status;
    if (priority !== incident.priority) input.priority = priority;
    if (assigneeId !== (incident.assigneeId ?? "")) {
      input.assigneeId = assigneeId || null;
    }
    if (dueDate !== toDateInput(incident.dueAt)) {
      input.dueAt = dueDate ? toApiDate(dueDate) : null;
    }
    if ((municipality?.id ?? null) !== incident.divisionId) {
      input.divisionId = municipality?.id ?? null;
    }
    void onSave(incident, input);
  }

  return (
    <article
      data-testid={`incident-card-${incident.id}`}
      className={`flex h-full flex-col rounded-3xl border bg-white p-6 shadow-sm ${
        incident.priority === "URGENT"
          ? "border-red-200 shadow-red-950/5"
          : "border-slate-200"
      }`}
    >
      <div className="flex items-start justify-between gap-4 min-w-0 flex-wrap">
        <div className="min-w-0">
          <p className="text-xs font-semibold text-blue-700">
            {incident.reference}
          </p>
          <h2 className="mt-2 text-lg font-semibold leading-tight text-slate-950">
            {incident.title}
          </h2>
          <p className="mt-1 text-xs font-bold text-slate-500">
            {incident.category} ·{" "}
            {optionLabel(incident.sourceChannel, CHANNEL_OPTIONS)}
          </p>
        </div>
        {incident.confidential && (
          <span
            title="Clasificación operativa; el acceso sigue los permisos generales del rol y la asignación del incidente"
            className="inline-flex shrink-0 items-center gap-1.5 rounded-xl bg-violet-50 px-2.5 py-2 text-xs font-semibold text-violet-700"
          >
            <FileLock2 aria-hidden="true" size={17} />
            Manejo especial
          </span>
        )}
      </div>

      <p className="mt-4 line-clamp-3 text-sm leading-6 text-slate-600">
        {incident.description}
      </p>

      <div className="mt-5 flex flex-wrap gap-2 text-xs font-semibold min-w-0">
        <span className="rounded-full bg-blue-50 px-3 py-1 text-blue-800">
          {optionLabel(incident.status, STATUS_OPTIONS)}
        </span>
        <span
          className={`rounded-full px-3 py-1 ${severityClasses(incident.priority)}`}
        >
          Severidad {optionLabel(incident.priority, PRIORITY_OPTIONS)}
        </span>
        {overdue && (
          <span className="rounded-full bg-red-700 px-3 py-1 text-white">
            Vencido
          </span>
        )}
      </div>

      <dl className="mt-5 grid gap-3 text-xs sm:grid-cols-2 min-w-0">
        <div className="rounded-2xl bg-slate-50 p-3 min-w-0 sm:col-span-2">
          <dt className="flex items-center gap-1 font-bold text-slate-500">
            <MapPin aria-hidden="true" size={14} /> Territorio vinculado
          </dt>
          <dd className="mt-1 break-words font-semibold text-slate-700">
            {incident.division?.name ??
              (incident.divisionId ? "Territorio vinculado" : "Sin municipio vinculado")}
          </dd>
        </div>
        <div className="rounded-2xl bg-slate-50 p-3 min-w-0">
          <dt className="flex items-center gap-1 font-bold text-slate-400">
            <UserRoundCheck aria-hidden="true" size={14} /> Responsable
          </dt>
          <dd className="mt-1 font-semibold text-slate-700">
            {incident.assignee?.name ?? "Sin asignar"}
          </dd>
        </div>
        <div className="rounded-2xl bg-slate-50 p-3 min-w-0">
          <dt className="flex items-center gap-1 font-bold text-slate-400">
            <CalendarClock aria-hidden="true" size={14} /> Vencimiento
          </dt>
          <dd
            className={`mt-1 font-semibold ${overdue ? "text-red-700" : "text-slate-700"}`}
          >
            {formatDate(incident.dueAt)}
          </dd>
        </div>
      </dl>

      <button
        type="button"
        aria-label={`Abrir bitácora de ${incident.reference}`}
        onClick={() => onOpenInteractions(incident)}
        className="mt-5 inline-flex min-h-10 w-full items-center justify-center gap-2 rounded-xl border border-blue-200 bg-blue-50 px-4 text-sm font-semibold text-blue-800 transition hover:border-blue-700 hover:bg-blue-700 hover:text-white focus:outline-none focus:ring-2 focus:ring-blue-600 focus:ring-offset-2 max-w-full whitespace-normal"
      >
        <History aria-hidden="true" size={16} />
        Ver bitácora · {incident._count.interactions}
      </button>

      {canMutate && (
        <div className="mt-6 space-y-3 border-t border-slate-100 pt-5 min-w-0">
          <div className="grid gap-3 sm:grid-cols-2 min-w-0">
            <div className="min-w-0 sm:col-span-2">
              <p className="mb-1 text-sm font-semibold text-slate-500">
                Municipio (opcional)
              </p>
              <IncidentMunicipalitySelector
                ariaLabel={`Municipio de ${incident.reference}`}
                value={municipality}
                onChange={setMunicipality}
                disabled={saving}
              />
            </div>
            <label className="text-sm font-semibold text-slate-500 min-w-0">
              Estado operativo
              <select
                aria-label={`Estado operativo de ${incident.reference}`}
                value={status}
                onChange={(event) =>
                  setStatus(event.target.value as IssueCaseStatus)
                }
                className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-bold normal-case tracking-normal text-slate-800 min-w-0 max-w-full"
              >
                {STATUS_OPTIONS.filter(({ value }) =>
                  nextStatuses.includes(value),
                ).map((option) => (
                  <option
                    key={option.value}
                    value={option.value}
                    disabled={
                      option.value === "RESOLVED" &&
                      incident.status !== "RESOLVED" &&
                      !incident.resolutionReady
                    }
                  >
                    {option.label}
                    {option.value === "RESOLVED" && !incident.resolutionReady
                      ? " · requiere resultado en bitácora"
                      : ""}
                  </option>
                ))}
              </select>
            </label>
            <label className="text-sm font-semibold text-slate-500 min-w-0">
              Severidad / prioridad
              <select
                aria-label={`Severidad de ${incident.reference}`}
                value={priority}
                onChange={(event) =>
                  setPriority(event.target.value as WorkPriority)
                }
                className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-bold normal-case tracking-normal text-slate-800 min-w-0 max-w-full"
              >
                {PRIORITY_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="text-sm font-semibold text-slate-500 min-w-0">
              Responsable
              <UserCombobox
                ariaLabel={`Responsable de ${incident.reference}`}
                value={assigneeId}
                selectedLabel={assigneeId === incident.assignee?.id ? incident.assignee.name : undefined}
                onChange={setAssigneeId}
                fetchItems={searchIncidentAssignees}
                disabled={saving}
                className="mt-1"
              />
            </label>
            <label className="text-sm font-semibold text-slate-500 min-w-0">
              Vencimiento
              <input
                aria-label={`Vencimiento de ${incident.reference}`}
                type="date"
                value={dueDate}
                onChange={(event) => setDueDate(event.target.value)}
                className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-bold normal-case tracking-normal text-slate-800 min-w-0 max-w-full"
              />
            </label>
          </div>
          {!incident.resolutionReady &&
            TRANSITIONS[incident.status].includes("RESOLVED") && (
              <p className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-semibold leading-5 text-amber-900">
                Para resolver este incidente, abre la Bitácora y registra
                primero una gestión con el campo Resultado.
              </p>
            )}
          <button
            type="button"
            disabled={!hasChanges || saving}
            onClick={save}
            className="inline-flex min-h-10 w-full items-center justify-center gap-2 rounded-xl bg-slate-950 px-4 text-sm font-semibold text-white transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-40 max-w-full whitespace-normal"
          >
            {saving ? (
              <Loader2 className="animate-spin" size={15} />
            ) : (
              <CheckCircle2 size={15} />
            )}
            Guardar respuesta
          </button>
        </div>
      )}
    </article>
  );
}

export default function IncidentsPage() {
  const { user } = useAuth();
  const canMutate = user !== null && INCIDENT_WRITE_ROLES.has(user.backendRole);
  const [filters, setFilters] = useState<Filters>(INITIAL_FILTERS);
  const [searchDraft, setSearchDraft] = useState("");
  const [reload, setReload] = useState(0);
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [saving, setSaving] = useState<string | null>(null);
  const [actionError, setMutationError] = useState<string | null>(null);
  const searchParams = useSearchParams();
  const entityId =
    searchParams.get("view") === "detail"
      ? (searchParams.get("entityId")?.trim() ?? "")
      : "";
  const mutationError =
    actionError ??
    (entityId.length > 128
      ? "El vínculo recibido no tiene un identificador de incidente válido."
      : null);
  const [notice, setNotice] = useState<string | null>(null);
  const [selectedIncident, setSelectedIncident] = useState<IssueCase | null>(
    null,
  );
  const [form, setForm] = useState({
    title: "",
    description: "",
    category: INCIDENT_CATEGORIES[0] as string,
    sourceChannel: "INTERNAL" as CommunicationChannel,
    priority: "HIGH" as WorkPriority,
    externalContactRef: "",
    assigneeId: "",
    dueDate: "",
    confidential: false,
    municipality: null as IncidentMunicipality | null,
  });
  const createDialogRef = useRef<HTMLDivElement>(null);
  const createDialogTitleRef = useRef<HTMLHeadingElement>(null);

  useAccessibleDialog({
    open: isCreateOpen,
    containerRef: createDialogRef,
    initialFocusRef: createDialogTitleRef,
    onClose: () => {
      if (saving !== "create") setIsCreateOpen(false);
    },
    closeOnEscape: saving !== "create",
  });

  useEffect(() => {
    if (!entityId || entityId.length > 128) return;
    const controller = new AbortController();
    void getIssueCase(entityId, controller.signal)
      .then((issueCase) => {
        if (!controller.signal.aborted) setSelectedIncident(issueCase);
      })
      .catch((requestError: unknown) => {
        if (!controller.signal.aborted) {
          setMutationError(
            `No fue posible abrir el incidente solicitado. ${readableError(requestError)}`,
          );
        }
      });

    return () => controller.abort();
  }, [entityId]);

  const loadIncidents = useCallback(
    (signal: AbortSignal) =>
      listIssueCases(
        {
          page: filters.page,
          limit: PAGE_SIZE,
          search: filters.search || undefined,
          status: filters.status || undefined,
          priority: filters.priority || undefined,
        },
        signal,
      ),
    [filters],
  );

  const {
    data: result,
    loading,
    error: requestError,
    setData: setResult,
  } = usePageRequest(loadIncidents, { reloadKey: reload });
  const error = requestError ? readableError(requestError) : null;

  function submitSearch(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFilters((current) => ({
      ...current,
      page: 1,
      search: searchDraft.trim(),
    }));
  }

  async function handleCreate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving("create");
    setMutationError(null);

    try {
      await createIssueCase({
        title: form.title,
        description: form.description,
        category: form.category,
        sourceChannel: form.sourceChannel,
        priority: form.priority,
        externalContactRef: form.externalContactRef || undefined,
        assigneeId: form.assigneeId || undefined,
        divisionId: form.municipality?.id,
        confidential: form.confidential,
        dueAt: form.dueDate ? toApiDate(form.dueDate) : undefined,
      });
      setForm({
        title: "",
        description: "",
        category: INCIDENT_CATEGORIES[0],
        sourceChannel: "INTERNAL",
        priority: "HIGH",
        externalContactRef: "",
        assigneeId: "",
        dueDate: "",
        confidential: false,
        municipality: null,
      });
      setIsCreateOpen(false);
      setNotice("Incidente registrado con trazabilidad de auditoría.");
      setFilters((current) => ({ ...current, page: 1 }));
      setReload((value) => value + 1);
    } catch (requestError: unknown) {
      setMutationError(readableError(requestError));
    } finally {
      setSaving(null);
    }
  }

  async function handleUpdate(
    incident: IssueCase,
    input: UpdateIssueCaseInput,
  ) {
    setSaving(incident.id);
    setMutationError(null);

    try {
      const updated = await updateIssueCase(incident.id, input);
      setResult((current) =>
        current
          ? {
              ...current,
              items: current.items.map((item) =>
                item.id === updated.id ? updated : item,
              ),
            }
          : current,
      );
      setNotice(`${updated.reference} actualizado y auditado.`);
      setSelectedIncident((current) => current?.id === updated.id ? updated : current);
    } catch (requestError: unknown) {
      setMutationError(readableError(requestError));
    } finally {
      setSaving(null);
    }
  }

  const totalPages = Math.max(1, result?.pagination.totalPages ?? 1);

  return (
    <div className="space-y-7 min-w-0">
      {notice && (
        <div
          role="status"
          className="fixed right-4 top-4 z-[90] flex max-w-[calc(100vw-2rem)] items-center gap-3 rounded-2xl bg-emerald-600 px-5 py-4 text-sm font-bold text-white shadow-2xl sm:right-6 sm:top-6 min-w-0 flex-wrap"
        >
          <CheckCircle2 size={18} /> {notice}
          <button
            type="button"
            aria-label="Cerrar aviso"
            onClick={() => setNotice(null)}
          >
            <X size={16} />
          </button>
        </div>
      )}

      <header className="flex flex-col justify-between gap-5 lg:flex-row lg:items-end min-w-0">
        <div>
          <div className="inline-flex items-center gap-2 rounded-full bg-red-50 px-3 py-1 text-xs font-semibold text-red-700 min-w-0">
            <ShieldCheck size={13} /> Operación de campaña
          </div>
          <h1 className="mt-3 font-semibold tracking-tight text-slate-950 text-2xl sm:text-3xl break-words">
            Incidentes y respuesta de crisis
          </h1>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-500">
            Registra hechos, asigna un responsable, fija vencimientos y conserva
            el historial de seguimiento de tu organización.
          </p>
        </div>
        {canMutate && (
          <button
            type="button"
            onClick={() => {
              setMutationError(null);
              setIsCreateOpen(true);
            }}
            className="inline-flex min-h-12 items-center justify-center gap-2 rounded-2xl bg-red-700 px-6 text-sm font-semibold text-white transition hover:bg-slate-950 max-w-full whitespace-normal"
          >
            <Plus size={17} /> Reportar incidente
          </button>
        )}
      </header>

      <section
        aria-label="Alcance del módulo"
        className="flex items-start gap-3 rounded-2xl border border-blue-200 bg-blue-50 p-4 text-sm leading-6 text-blue-950 min-w-0"
      >
        <AlertTriangle className="mt-0.5 shrink-0 text-blue-700" size={19} />
        <p>
          <strong>Seguimiento del equipo.</strong> Clasifica la severidad,
          asigna un responsable y registra la respuesta. Cada cambio se conserva
          en la bitácora del incidente.
        </p>
      </section>

      {!canMutate && (
        <section className="rounded-2xl border border-violet-200 bg-violet-50 p-4 text-sm font-semibold text-violet-900 min-w-0">
          Acceso de cumplimiento en modo consulta: puedes revisar la
          trazabilidad, pero no crear, asignar ni transicionar incidentes.
        </section>
      )}

      <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm min-w-0">
        <form
          onSubmit={submitSearch}
          className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_210px_180px_auto] min-w-0"
        >
          <label className="relative min-w-0">
            <span className="sr-only">Buscar incidentes</span>
            <Search
              className="absolute left-4 top-3.5 text-slate-400"
              size={17}
            />
            <input
              value={searchDraft}
              onChange={(event) => setSearchDraft(event.target.value)}
              placeholder="Referencia, hecho, categoría o descripción"
              className="min-h-11 w-full rounded-xl border border-slate-200 pl-11 pr-4 text-sm font-semibold text-slate-800 outline-none focus:border-blue-500 min-w-0 max-w-full"
            />
          </label>
          <select
            aria-label="Filtrar incidentes por estado"
            value={filters.status}
            onChange={(event) =>
              setFilters((current) => ({
                ...current,
                page: 1,
                status: event.target.value as Filters["status"],
              }))
            }
            className="min-h-11 rounded-xl border border-slate-200 px-3 text-sm font-bold text-slate-700 min-w-0 max-w-full"
          >
            <option value="">Todos los estados</option>
            {STATUS_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
          <select
            aria-label="Filtrar incidentes por severidad"
            value={filters.priority}
            onChange={(event) =>
              setFilters((current) => ({
                ...current,
                page: 1,
                priority: event.target.value as Filters["priority"],
              }))
            }
            className="min-h-11 rounded-xl border border-slate-200 px-3 text-sm font-bold text-slate-700 min-w-0 max-w-full"
          >
            <option value="">Toda severidad</option>
            {PRIORITY_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
          <button
            type="submit"
            className="min-h-11 rounded-xl bg-slate-950 px-5 text-sm font-semibold text-white hover:bg-blue-700 max-w-full whitespace-normal"
          >
            Buscar
          </button>
        </form>
      </section>

      {mutationError && (
        <div
          role="alert"
          className="flex items-start gap-3 rounded-2xl border border-red-200 bg-red-50 p-4 text-sm font-semibold text-red-700 min-w-0"
        >
          <AlertCircle className="mt-0.5 shrink-0" size={18} /> {mutationError}
        </div>
      )}

      {loading ? (
        <div
          role="status"
          className="flex min-h-80 flex-col items-center justify-center gap-3 rounded-3xl border border-slate-200 bg-white text-slate-500 min-w-0"
        >
          <Loader2 className="animate-spin text-blue-700" size={30} />
          <span className="font-bold">Consultando incidentes de campaña…</span>
        </div>
      ) : error ? (
        <div
          role="alert"
          className="flex min-h-80 flex-col items-center justify-center gap-4 rounded-3xl border border-red-200 bg-red-50 p-8 text-center min-w-0"
        >
          <AlertCircle className="text-red-600" size={34} />
          <div>
            <h2 className="font-semibold text-slate-950">
              No fue posible cargar los incidentes
            </h2>
            <p className="mt-1 max-w-xl text-sm text-slate-600">{error}</p>
          </div>
          <button
            type="button"
            onClick={() => setReload((value) => value + 1)}
            className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-slate-950 px-5 text-sm font-semibold text-white max-w-full whitespace-normal"
          >
            <RefreshCw size={16} /> Reintentar
          </button>
        </div>
      ) : !result?.items.length ? (
        <div className="flex min-h-80 flex-col items-center justify-center rounded-3xl border border-dashed border-slate-300 bg-white p-8 text-center min-w-0">
          <Inbox className="mb-4 text-slate-300" size={48} />
          <h2 className="font-semibold text-slate-950">
            No hay incidentes para estos filtros
          </h2>
          <p className="mt-2 max-w-xl text-sm text-slate-500">
            No se agregan datos ficticios. Ajusta los filtros o registra el
            primer hecho verificado por el equipo.
          </p>
        </div>
      ) : (
        <>
          <div className="flex flex-col gap-1 text-xs font-bold text-slate-500 sm:flex-row sm:items-center sm:justify-between min-w-0">
            <span>{result.pagination.total} incidentes encontrados</span>
            <span>
              Página {filters.page} de {totalPages}
            </span>
          </div>
          <section
            aria-label="Listado de incidentes"
            className="grid gap-5 xl:grid-cols-2 2xl:grid-cols-3 min-w-0"
          >
            {result.items.map((incident) => (
              <IncidentCard
                key={`${incident.id}:${incident.updatedAt}`}
                incident={incident}
                canMutate={canMutate}
                saving={saving === incident.id}
                onSave={handleUpdate}
                onOpenInteractions={setSelectedIncident}
              />
            ))}
          </section>
          <nav
            aria-label="Paginación de incidentes"
            className="flex justify-end gap-3 min-w-0 flex-wrap"
          >
            <button
              type="button"
              disabled={filters.page <= 1}
              onClick={() =>
                setFilters((current) => ({
                  ...current,
                  page: current.page - 1,
                }))
              }
              className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-700 disabled:opacity-40 max-w-full whitespace-normal"
            >
              <ChevronLeft size={16} /> Anterior
            </button>
            <button
              type="button"
              disabled={filters.page >= totalPages}
              onClick={() =>
                setFilters((current) => ({
                  ...current,
                  page: current.page + 1,
                }))
              }
              className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-700 disabled:opacity-40 max-w-full whitespace-normal"
            >
              Siguiente <ChevronRight size={16} />
            </button>
          </nav>
        </>
      )}

      {isCreateOpen && (
        <div className="fixed inset-0 flex items-center justify-center bg-slate-950/70 p-4 backdrop-blur-sm min-w-0 z-[150] overflow-y-auto flex-wrap">
          <div
            ref={createDialogRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby="new-incident-title"
            className="max-h-[calc(100dvh-2rem)] w-full max-w-3xl overflow-y-auto rounded-3xl bg-white shadow-2xl min-w-0"
          >
            <div className="flex items-start justify-between border-b border-slate-100 p-5 sm:p-7 min-w-0 flex-wrap gap-3">
              <div>
                <h2
                  ref={createDialogTitleRef}
                  tabIndex={-1}
                  id="new-incident-title"
                  className="text-2xl font-semibold text-slate-950"
                >
                  Reportar incidente
                </h2>
                <p className="mt-1 text-sm text-slate-500">
                  Describe lo ocurrido. La referencia se asignará al guardar.
                </p>
              </div>
              <button
                type="button"
                aria-label="Cerrar"
                disabled={saving === "create"}
                onClick={() => setIsCreateOpen(false)}
                className="rounded-xl p-2 text-slate-400 hover:bg-slate-100 max-w-full whitespace-normal"
              >
                <X />
              </button>
            </div>
            <form
              onSubmit={handleCreate}
              className="space-y-5 p-5 sm:p-7 min-w-0"
            >
              {mutationError && (
                <div
                  role="alert"
                  className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm font-semibold text-red-700 min-w-0"
                >
                  {mutationError}
                </div>
              )}
              <div className="grid gap-5 md:grid-cols-2 min-w-0">
                <label className="space-y-2 text-sm font-semibold text-slate-500 md:col-span-2 min-w-0">
                  Hecho reportado
                  <input
                    required
                    maxLength={200}
                    value={form.title}
                    onChange={(event) =>
                      setForm({ ...form, title: event.target.value })
                    }
                    className="w-full rounded-xl border border-slate-200 px-4 py-3 text-sm font-semibold normal-case tracking-normal text-slate-900 min-w-0 max-w-full"
                  />
                </label>
                <label className="space-y-2 text-sm font-semibold text-slate-500 md:col-span-2 min-w-0">
                  Descripción verificable
                  <textarea
                    required
                    maxLength={5000}
                    rows={5}
                    value={form.description}
                    onChange={(event) =>
                      setForm({ ...form, description: event.target.value })
                    }
                    placeholder="Qué ocurrió, dónde, cuándo y qué evidencia conoce el equipo. Evita datos personales innecesarios."
                    className="w-full resize-y rounded-xl border border-slate-200 px-4 py-3 text-sm font-semibold normal-case tracking-normal text-slate-900 min-w-0 max-w-full"
                  />
                </label>
                <label className="space-y-2 text-sm font-semibold text-slate-500 min-w-0">
                  Categoría
                  <select
                    value={form.category}
                    onChange={(event) =>
                      setForm({ ...form, category: event.target.value })
                    }
                    className="w-full rounded-xl border border-slate-200 px-4 py-3 text-sm font-semibold normal-case tracking-normal text-slate-900 min-w-0 max-w-full"
                  >
                    {INCIDENT_CATEGORIES.map((category) => (
                      <option key={category} value={category}>
                        {category}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="space-y-2 text-sm font-semibold text-slate-500 min-w-0">
                  Canal del reporte
                  <select
                    value={form.sourceChannel}
                    onChange={(event) =>
                      setForm({
                        ...form,
                        sourceChannel: event.target
                          .value as CommunicationChannel,
                      })
                    }
                    className="w-full rounded-xl border border-slate-200 px-4 py-3 text-sm font-semibold normal-case tracking-normal text-slate-900 min-w-0 max-w-full"
                  >
                    {CHANNEL_OPTIONS.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="space-y-2 text-sm font-semibold text-slate-500 min-w-0">
                  Severidad / prioridad
                  <select
                    value={form.priority}
                    onChange={(event) =>
                      setForm({
                        ...form,
                        priority: event.target.value as WorkPriority,
                      })
                    }
                    className="w-full rounded-xl border border-slate-200 px-4 py-3 text-sm font-semibold normal-case tracking-normal text-slate-900 min-w-0 max-w-full"
                  >
                    {PRIORITY_OPTIONS.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="space-y-2 text-sm font-semibold text-slate-500 min-w-0">
                  Responsable
                  <UserCombobox
                    ariaLabel="Responsable del nuevo incidente"
                    value={form.assigneeId}
                    onChange={(assigneeId) =>
                      setForm({ ...form, assigneeId })
                    }
                    fetchItems={searchIncidentAssignees}
                    disabled={saving === "create"}
                  />
                </label>
                <label className="space-y-2 text-sm font-semibold text-slate-500 min-w-0">
                  Vencimiento
                  <input
                    type="date"
                    value={form.dueDate}
                    onChange={(event) =>
                      setForm({ ...form, dueDate: event.target.value })
                    }
                    className="w-full rounded-xl border border-slate-200 px-4 py-3 text-sm font-semibold normal-case tracking-normal text-slate-900 min-w-0 max-w-full"
                  />
                </label>
                <label className="space-y-2 text-sm font-semibold text-slate-500 md:col-span-2 min-w-0">
                  Fuente o folio mínimo (opcional)
                  <input
                    maxLength={200}
                    value={form.externalContactRef}
                    onChange={(event) =>
                      setForm({
                        ...form,
                        externalContactRef: event.target.value,
                      })
                    }
                    placeholder="Código de reporte; no copies datos sensibles innecesarios"
                    className="w-full rounded-xl border border-slate-200 px-4 py-3 text-sm font-semibold normal-case tracking-normal text-slate-900 min-w-0 max-w-full"
                  />
                </label>
                <div className="min-w-0 space-y-2 md:col-span-2">
                  <p className="text-sm font-semibold text-slate-600">
                    Municipio (opcional)
                  </p>
                  <IncidentMunicipalitySelector
                    ariaLabel="Municipio del nuevo incidente"
                    value={form.municipality}
                    onChange={(municipality) => setForm((current) => ({ ...current, municipality }))}
                    disabled={saving === "create"}
                  />
                  <p className="text-xs leading-5 text-slate-600">
                    Vincula el incidente con un municipio de la organización para consultarlo en el mapa territorial.
                  </p>
                </div>
                <label className="flex items-start gap-3 rounded-2xl border border-violet-100 bg-violet-50 p-4 text-sm font-bold text-violet-900 md:col-span-2 min-w-0">
                  <input
                    type="checkbox"
                    checked={form.confidential}
                    onChange={(event) =>
                      setForm({ ...form, confidential: event.target.checked })
                    }
                    className="mt-0.5 h-4 w-4 shrink-0 min-w-0 max-w-full"
                  />
                  <FileLock2
                    aria-hidden="true"
                    className="mt-0.5 shrink-0"
                    size={18}
                  />
                  <span>
                    <span className="block">
                      Aplicar etiqueta de manejo especial
                    </span>
                    <span className="mt-1 block text-xs font-semibold normal-case leading-5 tracking-normal text-violet-700">
                      Es una clasificación operativa. No restringe el acceso: la
                      visibilidad sigue los permisos generales del rol y la
                      asignación del incidente.
                    </span>
                  </span>
                </label>
              </div>
              <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end min-w-0 flex-wrap">
                <button
                  type="button"
                  disabled={saving === "create"}
                  onClick={() => setIsCreateOpen(false)}
                  className="min-h-11 rounded-xl border border-slate-200 px-5 text-sm font-semibold text-slate-600 max-w-full whitespace-normal"
                >
                  Cancelar
                </button>
                <button
                  disabled={saving === "create"}
                  type="submit"
                  className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-red-700 px-6 text-sm font-semibold text-white disabled:opacity-50 max-w-full whitespace-normal"
                >
                  {saving === "create" ? (
                    <Loader2 className="animate-spin" size={16} />
                  ) : (
                    <Plus size={16} />
                  )}
                  Registrar incidente
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {selectedIncident && (
        <CaseInteractionsPanel
          key={selectedIncident.id}
          issueCase={selectedIncident}
          territoryLabel={selectedIncident.division?.name ??
            (selectedIncident.divisionId ? "Territorio vinculado" : "Sin municipio vinculado")}
          canCreate={canMutate}
          canGrantConsent={canMutate}
          canRevokeConsent={
            user !== null && INCIDENT_CONSENT_REVOKE_ROLES.has(user.backendRole)
          }
          allowSentiment={false}
          onClose={() => setSelectedIncident(null)}
          onCreated={(interaction) => {
            setResult((current) =>
              current
                ? {
                    ...current,
                    items: current.items.map((item) =>
                      item.id === selectedIncident.id
                        ? {
                            ...item,
                            resolutionReady:
                              item.resolutionReady ||
                              Boolean(interaction.outcome),
                            _count: {
                              ...item._count,
                              interactions: item._count.interactions + 1,
                            },
                          }
                        : item,
                    ),
                  }
                : current,
            );
            setSelectedIncident((current) =>
              current
                ? {
                    ...current,
                    resolutionReady:
                      current.resolutionReady || Boolean(interaction.outcome),
                    _count: {
                      ...current._count,
                      interactions: current._count.interactions + 1,
                    },
                  }
                : current,
            );
            setNotice(
              "Gestión registrada y auditada en la bitácora del incidente.",
            );
          }}
        />
      )}
    </div>
  );
}
