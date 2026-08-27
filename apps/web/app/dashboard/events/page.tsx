"use client";

import {
  FormEvent,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  AlertCircle,
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  Clock3,
  Loader2,
  MapPin,
  Pencil,
  Plus,
  RefreshCw,
  Trash2,
  UserRound,
  UsersRound,
  X,
} from "lucide-react";
import { useAuth } from "@/context/auth";
import { ApiError } from "@/lib/api-client";
import {
  CampaignEvent,
  CampaignEventStatus,
  createEvent,
  deleteEvent,
  EventPage,
  EventResponsible,
  listEventResponsibles,
  listEvents,
  transitionEvent,
  updateEvent,
} from "@/lib/events-api";

const PAGE_SIZE = 9;

const STATUSES: ReadonlyArray<{
  value: CampaignEventStatus;
  label: string;
}> = [
  { value: "DRAFT", label: "Borrador" },
  { value: "SCHEDULED", label: "Programado" },
  { value: "IN_PROGRESS", label: "En curso" },
  { value: "COMPLETED", label: "Finalizado" },
  { value: "CANCELLED", label: "Cancelado" },
];

const TRANSITIONS: Readonly<
  Record<CampaignEventStatus, readonly CampaignEventStatus[]>
> = {
  DRAFT: ["SCHEDULED", "CANCELLED"],
  SCHEDULED: ["IN_PROGRESS", "CANCELLED"],
  IN_PROGRESS: ["COMPLETED", "CANCELLED"],
  COMPLETED: [],
  CANCELLED: [],
};

const CAMPAIGN_WRITE_ROLES = new Set([
  "ADMIN",
  "CAMPAIGN_MANAGER",
  "COMMUNICATIONS_MANAGER",
  "ZONE_COORDINATOR",
]);
const PUBLIC_OFFICE_WRITE_ROLES = new Set([
  "ADMIN",
  "CONSTITUENT_SERVICES_MANAGER",
]);

interface Filters {
  page: number;
  search: string;
  status: "" | CampaignEventStatus;
}

interface EventFormState {
  name: string;
  description: string;
  startsAt: string;
  endsAt: string;
  location: string;
  capacity: string;
  responsibleId: string;
}

const EMPTY_FORM: EventFormState = {
  name: "",
  description: "",
  startsAt: "",
  endsAt: "",
  location: "",
  capacity: "",
  responsibleId: "",
};

function readableError(error: unknown): string {
  if (error instanceof ApiError) return error.message;
  if (error instanceof Error && error.message) return error.message;
  return "Ocurrió un error inesperado. Intenta nuevamente.";
}

function statusLabel(status: CampaignEventStatus): string {
  return STATUSES.find((item) => item.value === status)?.label ?? status;
}

function statusStyle(status: CampaignEventStatus): string {
  switch (status) {
    case "SCHEDULED":
      return "border-blue-200 bg-blue-50 text-blue-800";
    case "IN_PROGRESS":
      return "border-amber-200 bg-amber-50 text-amber-800";
    case "COMPLETED":
      return "border-emerald-200 bg-emerald-50 text-emerald-800";
    case "CANCELLED":
      return "border-red-200 bg-red-50 text-red-800";
    default:
      return "border-slate-200 bg-slate-100 text-slate-700";
  }
}

function formatSchedule(startsAt: string, endsAt: string): string {
  const start = new Date(startsAt);
  const end = new Date(endsAt);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
    return "Horario no disponible";
  }

  const date = new Intl.DateTimeFormat("es-CO", {
    weekday: "short",
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(start);
  const time = new Intl.DateTimeFormat("es-CO", {
    hour: "2-digit",
    minute: "2-digit",
  });
  return `${date}, ${time.format(start)} – ${time.format(end)}`;
}

function toLocalInput(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 16);
}

function toIso(value: string): string {
  return new Date(value).toISOString();
}

export default function EventsPage() {
  const { tenant, user } = useAuth();
  const [filters, setFilters] = useState<Filters>({
    page: 1,
    search: "",
    status: "",
  });
  const [searchDraft, setSearchDraft] = useState("");
  const [result, setResult] = useState<EventPage | null>(null);
  const [responsibles, setResponsibles] = useState<EventResponsible[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [dialogEvent, setDialogEvent] = useState<CampaignEvent | "new" | null>(
    null,
  );
  const [form, setForm] = useState<EventFormState>(EMPTY_FORM);
  const [mutation, setMutation] = useState<string | null>(null);
  const [mutationError, setMutationError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const dialogTitleRef = useRef<HTMLHeadingElement>(null);

  const isPublicOffice = tenant?.type === "PUBLIC_OFFICE";
  const canManage = Boolean(
    user &&
    (isPublicOffice
      ? PUBLIC_OFFICE_WRITE_ROLES.has(user.backendRole)
      : CAMPAIGN_WRITE_ROLES.has(user.backendRole)),
  );

  const loadEvents = useCallback(
    async (signal?: AbortSignal) => {
      setLoading(true);
      setLoadError(null);
      try {
        const data = await listEvents(
          {
            page: filters.page,
            limit: PAGE_SIZE,
            search: filters.search || undefined,
            status: filters.status || undefined,
          },
          signal,
        );
        setResult(data);
      } catch (error) {
        if (error instanceof DOMException && error.name === "AbortError")
          return;
        setLoadError(readableError(error));
      } finally {
        if (!signal?.aborted) setLoading(false);
      }
    },
    [filters],
  );

  useEffect(() => {
    const controller = new AbortController();
    void loadEvents(controller.signal);
    return () => controller.abort();
  }, [loadEvents, reloadKey]);

  useEffect(() => {
    if (!canManage) {
      setResponsibles([]);
      return;
    }
    const controller = new AbortController();
    void listEventResponsibles(controller.signal)
      .then(setResponsibles)
      .catch((error) => {
        if (!(error instanceof DOMException && error.name === "AbortError")) {
          setLoadError(readableError(error));
        }
      });
    return () => controller.abort();
  }, [canManage]);

  useEffect(() => {
    if (dialogEvent) dialogTitleRef.current?.focus();
  }, [dialogEvent]);

  const modeLabel = useMemo(() => {
    const mode = result?.items[0]?.mode;
    if (mode === "PUBLIC_OFFICE" || isPublicOffice) return "Gestión pública";
    if (mode === "CAMPAIGN") return "Campaña";
    return isPublicOffice ? "Gestión pública" : "Campaña";
  }, [isPublicOffice, result?.items]);

  function openCreate() {
    setForm(EMPTY_FORM);
    setMutationError(null);
    setDialogEvent("new");
  }

  function openEdit(event: CampaignEvent) {
    setForm({
      name: event.name,
      description: event.description ?? "",
      startsAt: toLocalInput(event.startsAt),
      endsAt: toLocalInput(event.endsAt),
      location: event.location ?? "",
      capacity: event.capacity?.toString() ?? "",
      responsibleId: event.responsibleId ?? "",
    });
    setMutationError(null);
    setDialogEvent(event);
  }

  async function submitEvent(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!dialogEvent || mutation) return;
    setMutationError(null);
    setNotice(null);

    const startsAt = toIso(form.startsAt);
    const endsAt = toIso(form.endsAt);
    if (new Date(endsAt) <= new Date(startsAt)) {
      setMutationError("La hora final debe ser posterior a la hora de inicio.");
      return;
    }

    const payload = {
      name: form.name.trim(),
      description: form.description.trim() || undefined,
      startsAt,
      endsAt,
      location: form.location.trim() || undefined,
      capacity: form.capacity ? Number(form.capacity) : undefined,
      responsibleId: form.responsibleId || undefined,
    };

    try {
      if (dialogEvent === "new") {
        setMutation("create");
        await createEvent(payload);
        setNotice("Evento creado como borrador.");
      } else {
        setMutation(`edit-${dialogEvent.id}`);
        await updateEvent(dialogEvent.id, {
          ...payload,
          description: payload.description ?? null,
          location: payload.location ?? null,
          capacity: payload.capacity ?? null,
          responsibleId: payload.responsibleId ?? null,
        });
        setNotice(`“${form.name.trim()}” fue actualizado.`);
      }
      setDialogEvent(null);
      setReloadKey((current) => current + 1);
    } catch (error) {
      setMutationError(readableError(error));
    } finally {
      setMutation(null);
    }
  }

  async function changeStatus(
    event: CampaignEvent,
    status: CampaignEventStatus,
  ) {
    if (mutation) return;
    setMutation(`status-${event.id}`);
    setMutationError(null);
    setNotice(null);
    try {
      await transitionEvent(event.id, status);
      setNotice(
        `Estado de “${event.name}” actualizado a ${statusLabel(status)}.`,
      );
      setReloadKey((current) => current + 1);
    } catch (error) {
      setMutationError(readableError(error));
    } finally {
      setMutation(null);
    }
  }

  async function removeDraft(event: CampaignEvent) {
    if (mutation) return;
    const confirmed = window.confirm(
      `¿Eliminar el borrador “${event.name}”? Esta acción no elimina la evidencia de auditoría.`,
    );
    if (!confirmed) return;

    setMutation(`delete-${event.id}`);
    setMutationError(null);
    setNotice(null);
    try {
      await deleteEvent(event.id);
      setNotice(`Borrador “${event.name}” eliminado.`);
      setReloadKey((current) => current + 1);
    } catch (error) {
      setMutationError(readableError(error));
    } finally {
      setMutation(null);
    }
  }

  const totalPages = Math.max(1, result?.pagination.totalPages ?? 1);
  const isEmpty = !loading && !loadError && (result?.items.length ?? 0) === 0;

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <header className="flex flex-col gap-5 rounded-3xl bg-slate-950 p-6 text-white shadow-xl sm:flex-row sm:items-end sm:justify-between md:p-8">
        <div>
          <div className="mb-3 flex flex-wrap items-center gap-2 text-xs font-black uppercase tracking-[0.18em] text-blue-300">
            <CalendarDays aria-hidden="true" size={17} /> Agenda operativa
            <span className="rounded-full bg-white/10 px-3 py-1 text-white">
              {modeLabel}
            </span>
          </div>
          <h1 className="text-3xl font-black tracking-tight md:text-4xl">
            Eventos y territorio
          </h1>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-300">
            Coordina horarios, lugares, aforo y responsables con estados
            verificables. La organización y el modo provienen de tu sesión.
          </p>
        </div>
        {canManage && (
          <button
            type="button"
            onClick={openCreate}
            className="inline-flex min-h-12 shrink-0 items-center justify-center gap-2 rounded-2xl bg-blue-600 px-5 text-sm font-black text-white transition hover:bg-blue-500"
          >
            <Plus aria-hidden="true" size={18} /> Nuevo evento
          </button>
        )}
      </header>

      <section
        aria-label="Filtros de agenda"
        className="grid gap-3 rounded-3xl border border-slate-200 bg-white p-4 sm:grid-cols-[minmax(0,1fr)_13rem_auto]"
      >
        <label className="text-sm font-black text-slate-800">
          Buscar
          <input
            type="search"
            value={searchDraft}
            onChange={(event) => setSearchDraft(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                setFilters((current) => ({
                  ...current,
                  page: 1,
                  search: searchDraft.trim(),
                }));
              }
            }}
            placeholder="Nombre, lugar o descripción"
            className="mt-1 min-h-11 w-full rounded-xl border border-slate-200 px-3 font-normal outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-100"
          />
        </label>
        <label className="text-sm font-black text-slate-800">
          Estado
          <select
            value={filters.status}
            onChange={(event) =>
              setFilters((current) => ({
                ...current,
                page: 1,
                status: event.target.value as "" | CampaignEventStatus,
              }))
            }
            className="mt-1 min-h-11 w-full rounded-xl border border-slate-200 bg-white px-3 font-normal outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-100"
          >
            <option value="">Todos</option>
            {STATUSES.map((status) => (
              <option key={status.value} value={status.value}>
                {status.label}
              </option>
            ))}
          </select>
        </label>
        <button
          type="button"
          onClick={() =>
            setFilters((current) => ({
              ...current,
              page: 1,
              search: searchDraft.trim(),
            }))
          }
          className="min-h-11 self-end rounded-xl bg-slate-900 px-5 text-sm font-black text-white hover:bg-blue-700"
        >
          Aplicar filtros
        </button>
      </section>

      {notice && (
        <p
          role="status"
          className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-sm font-bold text-emerald-900"
        >
          {notice}
        </p>
      )}
      {mutationError && !dialogEvent && (
        <p
          role="alert"
          className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm font-bold text-red-900"
        >
          {mutationError}
        </p>
      )}

      {loading && (
        <div
          role="status"
          className="flex min-h-72 flex-col items-center justify-center gap-3 rounded-3xl border border-slate-200 bg-white text-slate-500"
        >
          <Loader2 className="animate-spin text-blue-600" size={30} />
          <span className="font-semibold">Cargando agenda…</span>
        </div>
      )}

      {!loading && loadError && (
        <div
          role="alert"
          className="flex min-h-72 flex-col items-center justify-center gap-4 rounded-3xl border border-red-200 bg-red-50 p-8 text-center"
        >
          <AlertCircle className="text-red-600" size={34} />
          <div>
            <h2 className="font-black text-slate-950">
              No pudimos cargar la agenda
            </h2>
            <p className="mt-1 max-w-xl text-sm text-slate-600">{loadError}</p>
          </div>
          <button
            type="button"
            onClick={() => setReloadKey((current) => current + 1)}
            className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-slate-900 px-4 text-sm font-black text-white hover:bg-blue-700"
          >
            <RefreshCw size={17} /> Reintentar
          </button>
        </div>
      )}

      {isEmpty && (
        <div className="flex min-h-72 flex-col items-center justify-center rounded-3xl border border-dashed border-slate-300 bg-white p-8 text-center">
          <CalendarDays className="mb-4 text-slate-300" size={48} />
          <h2 className="text-lg font-black text-slate-950">
            No hay eventos para estos filtros
          </h2>
          <p className="mt-1 max-w-lg text-sm text-slate-500">
            {canManage
              ? "Crea un borrador para definir horario, responsable y capacidad antes de programarlo."
              : "Cuando el equipo programe actividades aparecerán aquí."}
          </p>
        </div>
      )}

      {!loading && !loadError && result && result.items.length > 0 && (
        <>
          <section
            aria-label="Eventos"
            className="grid gap-5 md:grid-cols-2 xl:grid-cols-3"
          >
            {result.items.map((event) => {
              const transitions = TRANSITIONS[event.status];
              const terminal = transitions.length === 0;
              return (
                <article
                  key={event.id}
                  data-testid={`event-card-${event.id}`}
                  className="flex min-h-80 flex-col rounded-3xl border border-slate-200 bg-white p-5 shadow-sm transition hover:border-blue-200 hover:shadow-md"
                >
                  <div className="flex items-start justify-between gap-3">
                    <span
                      className={`rounded-full border px-3 py-1 text-xs font-black ${statusStyle(event.status)}`}
                    >
                      {statusLabel(event.status)}
                    </span>
                    {canManage && !terminal && (
                      <div className="flex gap-1">
                        <button
                          type="button"
                          onClick={() => openEdit(event)}
                          disabled={Boolean(mutation)}
                          aria-label={`Editar ${event.name}`}
                          className="rounded-xl p-2 text-slate-500 hover:bg-blue-50 hover:text-blue-700 disabled:opacity-50"
                        >
                          <Pencil size={17} />
                        </button>
                        {event.status === "DRAFT" && (
                          <button
                            type="button"
                            onClick={() => void removeDraft(event)}
                            disabled={Boolean(mutation)}
                            aria-label={`Eliminar ${event.name}`}
                            className="rounded-xl p-2 text-slate-500 hover:bg-red-50 hover:text-red-700 disabled:opacity-50"
                          >
                            {mutation === `delete-${event.id}` ? (
                              <Loader2 className="animate-spin" size={17} />
                            ) : (
                              <Trash2 size={17} />
                            )}
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                  <h2 className="mt-4 text-xl font-black leading-tight text-slate-950">
                    {event.name}
                  </h2>
                  {event.description && (
                    <p className="mt-2 line-clamp-3 text-sm leading-6 text-slate-600">
                      {event.description}
                    </p>
                  )}
                  <dl className="mt-5 space-y-3 border-t border-slate-100 pt-4 text-sm text-slate-700">
                    <div className="flex gap-3">
                      <Clock3
                        className="mt-0.5 shrink-0 text-blue-600"
                        size={17}
                      />
                      <div>
                        <dt className="sr-only">Horario</dt>
                        <dd className="font-semibold">
                          {formatSchedule(event.startsAt, event.endsAt)}
                        </dd>
                      </div>
                    </div>
                    <div className="flex gap-3">
                      <MapPin
                        className="mt-0.5 shrink-0 text-blue-600"
                        size={17}
                      />
                      <div>
                        <dt className="sr-only">Lugar</dt>
                        <dd>{event.location || "Lugar por confirmar"}</dd>
                      </div>
                    </div>
                    <div className="flex gap-3">
                      <UserRound
                        className="mt-0.5 shrink-0 text-blue-600"
                        size={17}
                      />
                      <div>
                        <dt className="sr-only">Responsable</dt>
                        <dd>
                          {event.responsible?.name || "Responsable por asignar"}
                        </dd>
                      </div>
                    </div>
                    <div className="flex gap-3">
                      <UsersRound
                        className="mt-0.5 shrink-0 text-blue-600"
                        size={17}
                      />
                      <div>
                        <dt className="sr-only">Capacidad</dt>
                        <dd>
                          {event.capacity
                            ? `Capacidad: ${event.capacity.toLocaleString("es-CO")}`
                            : "Capacidad por definir"}
                        </dd>
                      </div>
                    </div>
                  </dl>
                  {canManage && transitions.length > 0 && (
                    <label className="mt-auto block pt-5 text-xs font-black text-slate-700">
                      Siguiente estado de {event.name}
                      <span className="relative mt-1 block">
                        <select
                          aria-label={`Siguiente estado de ${event.name}`}
                          defaultValue=""
                          disabled={Boolean(mutation)}
                          onChange={(change) => {
                            const status = change.target
                              .value as CampaignEventStatus;
                            if (status) void changeStatus(event, status);
                            change.target.value = "";
                          }}
                          className="min-h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm font-semibold outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-100 disabled:opacity-60"
                        >
                          <option value="">Seleccionar transición</option>
                          {transitions.map((status) => (
                            <option key={status} value={status}>
                              {statusLabel(status)}
                            </option>
                          ))}
                        </select>
                        {mutation === `status-${event.id}` && (
                          <Loader2
                            aria-label="Actualizando estado"
                            className="absolute right-8 top-3 animate-spin text-blue-600"
                            size={17}
                          />
                        )}
                      </span>
                    </label>
                  )}
                </article>
              );
            })}
          </section>

          <nav
            aria-label="Paginación"
            className="flex items-center justify-end gap-3"
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
              className="inline-flex min-h-10 items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 text-sm font-bold text-slate-700 disabled:opacity-40"
            >
              <ChevronLeft size={16} /> Anterior
            </button>
            <span className="text-sm font-semibold text-slate-600">
              Página {filters.page} de {totalPages}
            </span>
            <button
              type="button"
              disabled={filters.page >= totalPages}
              onClick={() =>
                setFilters((current) => ({
                  ...current,
                  page: current.page + 1,
                }))
              }
              className="inline-flex min-h-10 items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 text-sm font-bold text-slate-700 disabled:opacity-40"
            >
              Siguiente <ChevronRight size={16} />
            </button>
          </nav>
        </>
      )}

      {dialogEvent && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-4 backdrop-blur-sm">
          <section
            role="dialog"
            aria-modal="true"
            aria-labelledby="event-dialog-title"
            className="max-h-[92vh] w-full max-w-2xl overflow-y-auto rounded-3xl bg-white shadow-2xl"
          >
            <header className="sticky top-0 z-10 flex items-center justify-between border-b border-slate-100 bg-white px-6 py-5">
              <div>
                <h2
                  id="event-dialog-title"
                  ref={dialogTitleRef}
                  tabIndex={-1}
                  className="text-xl font-black text-slate-950 outline-none"
                >
                  {dialogEvent === "new" ? "Crear evento" : "Editar evento"}
                </h2>
                <p className="mt-1 text-sm text-slate-500">
                  Los borradores deben programarse mediante una transición
                  explícita.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setDialogEvent(null)}
                disabled={Boolean(mutation)}
                aria-label="Cerrar formulario"
                className="rounded-full p-2 text-slate-500 hover:bg-slate-100 disabled:opacity-50"
              >
                <X size={21} />
              </button>
            </header>
            <form onSubmit={submitEvent} className="space-y-5 p-6">
              <label className="block text-sm font-black text-slate-800">
                Nombre
                <input
                  required
                  minLength={3}
                  maxLength={200}
                  autoComplete="off"
                  value={form.name}
                  onChange={(event) =>
                    setForm((current) => ({
                      ...current,
                      name: event.target.value,
                    }))
                  }
                  className="mt-2 min-h-12 w-full rounded-2xl border border-slate-200 px-4 font-normal outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-100"
                />
              </label>
              <label className="block text-sm font-black text-slate-800">
                Descripción{" "}
                <span className="font-normal text-slate-400">(opcional)</span>
                <textarea
                  rows={3}
                  maxLength={5000}
                  value={form.description}
                  onChange={(event) =>
                    setForm((current) => ({
                      ...current,
                      description: event.target.value,
                    }))
                  }
                  className="mt-2 w-full rounded-2xl border border-slate-200 px-4 py-3 font-normal outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-100"
                />
              </label>
              <div className="grid gap-4 sm:grid-cols-2">
                <label className="block text-sm font-black text-slate-800">
                  Inicio
                  <input
                    required
                    type="datetime-local"
                    value={form.startsAt}
                    onChange={(event) =>
                      setForm((current) => ({
                        ...current,
                        startsAt: event.target.value,
                      }))
                    }
                    className="mt-2 min-h-12 w-full rounded-2xl border border-slate-200 px-4 font-normal outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-100"
                  />
                </label>
                <label className="block text-sm font-black text-slate-800">
                  Fin
                  <input
                    required
                    type="datetime-local"
                    value={form.endsAt}
                    onChange={(event) =>
                      setForm((current) => ({
                        ...current,
                        endsAt: event.target.value,
                      }))
                    }
                    className="mt-2 min-h-12 w-full rounded-2xl border border-slate-200 px-4 font-normal outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-100"
                  />
                </label>
              </div>
              <label className="block text-sm font-black text-slate-800">
                Lugar{" "}
                <span className="font-normal text-slate-400">(opcional)</span>
                <input
                  maxLength={300}
                  autoComplete="street-address"
                  value={form.location}
                  onChange={(event) =>
                    setForm((current) => ({
                      ...current,
                      location: event.target.value,
                    }))
                  }
                  className="mt-2 min-h-12 w-full rounded-2xl border border-slate-200 px-4 font-normal outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-100"
                />
              </label>
              <div className="grid gap-4 sm:grid-cols-2">
                <label className="block text-sm font-black text-slate-800">
                  Responsable{" "}
                  <span className="font-normal text-slate-400">(opcional)</span>
                  <select
                    value={form.responsibleId}
                    onChange={(event) =>
                      setForm((current) => ({
                        ...current,
                        responsibleId: event.target.value,
                      }))
                    }
                    className="mt-2 min-h-12 w-full rounded-2xl border border-slate-200 bg-white px-4 font-normal outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-100"
                  >
                    <option value="">Por asignar</option>
                    {responsibles.map((responsible) => (
                      <option key={responsible.id} value={responsible.id}>
                        {responsible.name}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="block text-sm font-black text-slate-800">
                  Capacidad{" "}
                  <span className="font-normal text-slate-400">(opcional)</span>
                  <input
                    type="number"
                    min={1}
                    max={1_000_000}
                    step={1}
                    value={form.capacity}
                    onChange={(event) =>
                      setForm((current) => ({
                        ...current,
                        capacity: event.target.value,
                      }))
                    }
                    className="mt-2 min-h-12 w-full rounded-2xl border border-slate-200 px-4 font-normal outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-100"
                  />
                </label>
              </div>
              {mutationError && (
                <p
                  role="alert"
                  className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm font-bold text-red-900"
                >
                  {mutationError}
                </p>
              )}
              <div className="flex justify-end gap-3 border-t border-slate-100 pt-5">
                <button
                  type="button"
                  onClick={() => setDialogEvent(null)}
                  disabled={Boolean(mutation)}
                  className="min-h-11 rounded-xl border border-slate-200 px-5 text-sm font-black text-slate-700 disabled:opacity-50"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={Boolean(mutation)}
                  className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-blue-600 px-5 text-sm font-black text-white hover:bg-blue-700 disabled:opacity-60"
                >
                  {mutation && <Loader2 className="animate-spin" size={17} />}
                  {dialogEvent === "new" ? "Crear borrador" : "Guardar cambios"}
                </button>
              </div>
            </form>
          </section>
        </div>
      )}
    </div>
  );
}
