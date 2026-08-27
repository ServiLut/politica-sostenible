"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import {
  AlertCircle,
  Check,
  ChevronLeft,
  ChevronRight,
  FileCheck2,
  Loader2,
  MessageSquareText,
  Plus,
  RefreshCw,
  Search,
  ShieldCheck,
  ShieldX,
  X,
} from "lucide-react";
import { useAuth } from "@/context/auth";
import { ApiError } from "@/lib/api-client";
import {
  CommunicationApproval,
  CommunicationApprovalPage,
  CommunicationApprovalStatus,
  CommunicationChannel,
  createCommunicationApproval,
  decideCommunicationApproval,
  listCommunicationApprovals,
} from "@/lib/communications-api";
import { BackendUserRole, Tenant } from "@/types/saas-schema";

const PAGE_SIZE = 10;

const CHANNELS: ReadonlyArray<{
  value: CommunicationChannel;
  label: string;
}> = [
  { value: "SOCIAL_MEDIA", label: "Redes sociales" },
  { value: "WHATSAPP", label: "WhatsApp" },
  { value: "EMAIL", label: "Correo electrónico" },
  { value: "SMS", label: "SMS" },
  { value: "WEB", label: "Sitio web" },
  { value: "LETTER", label: "Carta" },
  { value: "PHONE", label: "Llamada" },
  { value: "IN_PERSON", label: "Presencial" },
  { value: "INTERNAL", label: "Interno" },
];

const STATUS_OPTIONS: ReadonlyArray<{
  value: CommunicationApprovalStatus;
  label: string;
}> = [
  { value: "PENDING", label: "Pendiente" },
  { value: "APPROVED", label: "Aprobada" },
  { value: "REJECTED", label: "Rechazada" },
];

const CAMPAIGN_REQUEST_ROLES: BackendUserRole[] = [
  "ADMIN",
  "CAMPAIGN_MANAGER",
  "COMMUNICATIONS_MANAGER",
];
const PUBLIC_REQUEST_ROLES: BackendUserRole[] = [
  "ADMIN",
  "CONSTITUENT_SERVICES_MANAGER",
  "COMMUNICATIONS_MANAGER",
  "CASE_WORKER",
];
const CAMPAIGN_DECISION_ROLES: BackendUserRole[] = [
  "ADMIN",
  "CAMPAIGN_MANAGER",
  "COMMUNICATIONS_MANAGER",
  "COMPLIANCE_OFFICER",
];
const PUBLIC_DECISION_ROLES: BackendUserRole[] = [
  "ADMIN",
  "CONSTITUENT_SERVICES_MANAGER",
  "COMMUNICATIONS_MANAGER",
  "COMPLIANCE_OFFICER",
];
const CAMPAIGN_CASE_LINK_ROLES: BackendUserRole[] = [
  "ADMIN",
  "CAMPAIGN_MANAGER",
];
const PUBLIC_CASE_LINK_ROLES: BackendUserRole[] = [
  "ADMIN",
  "CONSTITUENT_SERVICES_MANAGER",
  "CASE_WORKER",
];

interface Filters {
  page: number;
  search: string;
  status: "" | CommunicationApprovalStatus;
  channel: "" | CommunicationChannel;
  containsSensitiveData: "" | "true" | "false";
}

interface RequestFormState {
  title: string;
  message: string;
  channel: CommunicationChannel;
  purpose: string;
  containsSensitiveData: boolean;
  issueCaseId: string;
}

const INITIAL_FILTERS: Filters = {
  page: 1,
  search: "",
  status: "",
  channel: "",
  containsSensitiveData: "",
};

const INITIAL_REQUEST: RequestFormState = {
  title: "",
  message: "",
  channel: "SOCIAL_MEDIA",
  purpose: "",
  containsSensitiveData: false,
  issueCaseId: "",
};

function readableError(error: unknown): string {
  if (error instanceof ApiError) return error.message;
  if (error instanceof Error && error.message) return error.message;
  return "Ocurrió un error inesperado. Intenta nuevamente.";
}

function channelLabel(channel: CommunicationChannel): string {
  return CHANNELS.find((item) => item.value === channel)?.label ?? channel;
}

function statusLabel(status: CommunicationApprovalStatus): string {
  return STATUS_OPTIONS.find((item) => item.value === status)?.label ?? status;
}

function messageFromContent(content: CommunicationApproval["content"]): string {
  return typeof content?.message === "string"
    ? content.message
    : "Contenido no disponible";
}

function formatDate(value: string | null): string {
  if (!value) return "Sin fecha";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Fecha no disponible";
  return new Intl.DateTimeFormat("es-CO", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}

function isCampaignTenant(type: Tenant["type"] | undefined): boolean {
  return type === "CANDIDACY" || type === "PARTY" || type === "GSC";
}

export default function CommunicationsPage() {
  const { user, tenant } = useAuth();
  const [filters, setFilters] = useState<Filters>(INITIAL_FILTERS);
  const [result, setResult] = useState<CommunicationApprovalPage | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [reloadVersion, setReloadVersion] = useState(0);
  const [requestOpen, setRequestOpen] = useState(false);
  const [requestForm, setRequestForm] =
    useState<RequestFormState>(INITIAL_REQUEST);
  const [decision, setDecision] = useState<{
    approval: CommunicationApproval;
    status: "APPROVED" | "REJECTED";
  } | null>(null);
  const [decisionReason, setDecisionReason] = useState("");
  const [saving, setSaving] = useState<"request" | "decision" | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [mutationError, setMutationError] = useState<string | null>(null);

  const canRequest = useMemo(() => {
    if (!user || !tenant) return false;
    const roles = isCampaignTenant(tenant.type)
      ? CAMPAIGN_REQUEST_ROLES
      : PUBLIC_REQUEST_ROLES;
    return roles.includes(user.backendRole);
  }, [tenant, user]);

  const canDecide = useMemo(() => {
    if (!user || !tenant) return false;
    const roles = isCampaignTenant(tenant.type)
      ? CAMPAIGN_DECISION_ROLES
      : PUBLIC_DECISION_ROLES;
    return roles.includes(user.backendRole);
  }, [tenant, user]);
  const canLinkCase = useMemo(() => {
    if (!user || !tenant) return false;
    const roles = isCampaignTenant(tenant.type)
      ? CAMPAIGN_CASE_LINK_ROLES
      : PUBLIC_CASE_LINK_ROLES;
    return roles.includes(user.backendRole);
  }, [tenant, user]);
  const caseLinkRequired = user?.backendRole === "CASE_WORKER";

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setLoadError(null);
    listCommunicationApprovals(
      {
        page: filters.page,
        limit: PAGE_SIZE,
        search: filters.search.trim() || undefined,
        status: filters.status || undefined,
        channel: filters.channel || undefined,
        containsSensitiveData: filters.containsSensitiveData || undefined,
      },
      controller.signal,
    )
      .then(setResult)
      .catch((error: unknown) => {
        if (error instanceof DOMException && error.name === "AbortError")
          return;
        setLoadError(readableError(error));
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });

    return () => controller.abort();
  }, [filters, reloadVersion]);

  async function handleCreate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving("request");
    setMutationError(null);
    setNotice(null);
    try {
      await createCommunicationApproval({
        title: requestForm.title.trim(),
        message: requestForm.message.trim(),
        channel: requestForm.channel,
        purpose: requestForm.purpose.trim(),
        containsSensitiveData: requestForm.containsSensitiveData,
        issueCaseId: requestForm.issueCaseId.trim() || undefined,
      });
      setRequestForm(INITIAL_REQUEST);
      setRequestOpen(false);
      setNotice("Solicitud enviada a revisión. No se publicó ningún mensaje.");
      setFilters((current) => ({ ...current, page: 1 }));
      setReloadVersion((value) => value + 1);
    } catch (error: unknown) {
      setMutationError(readableError(error));
    } finally {
      setSaving(null);
    }
  }

  async function handleDecision(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!decision) return;
    setSaving("decision");
    setMutationError(null);
    setNotice(null);
    try {
      await decideCommunicationApproval(decision.approval.id, {
        status: decision.status,
        decisionReason: decisionReason.trim(),
      });
      setNotice(
        decision.status === "APPROVED"
          ? "Comunicación aprobada. La plataforma no la publicó ni la envió."
          : "Comunicación rechazada y devuelta para corrección.",
      );
      setDecision(null);
      setDecisionReason("");
      setReloadVersion((value) => value + 1);
    } catch (error: unknown) {
      setMutationError(readableError(error));
    } finally {
      setSaving(null);
    }
  }

  const items = result?.items ?? [];
  const totalPages = Math.max(1, result?.pagination.totalPages ?? 1);

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <header className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <div className="mb-2 flex items-center gap-2 text-xs font-black uppercase tracking-[0.2em] text-blue-700">
            <ShieldCheck size={16} aria-hidden="true" /> Control editorial
          </div>
          <h1 className="text-3xl font-black tracking-tight text-slate-950">
            Aprobaciones de comunicaciones
          </h1>
          <p className="mt-2 max-w-3xl text-sm font-medium leading-6 text-slate-600">
            Revisión humana de cuatro ojos para mensajes de campaña o gestión
            pública. La organización y el modo se obtienen de tu sesión segura.
          </p>
        </div>
        {canRequest && (
          <button
            type="button"
            onClick={() => {
              setMutationError(null);
              setRequestOpen(true);
            }}
            className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-blue-700 px-5 text-sm font-black text-white transition hover:bg-blue-800"
          >
            <Plus size={18} aria-hidden="true" /> Nueva solicitud
          </button>
        )}
      </header>

      <section
        aria-label="Límite del flujo"
        className="flex gap-3 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-950"
      >
        <AlertCircle className="mt-0.5 shrink-0" size={19} aria-hidden="true" />
        <p>
          <strong>Este módulo no envía, programa ni publica mensajes.</strong>{" "}
          Registra una decisión independiente sobre una versión exacta,
          identificada por su huella SHA-256.
        </p>
      </section>

      {(notice || mutationError) && (
        <div
          role={mutationError ? "alert" : "status"}
          className={`rounded-2xl border p-4 text-sm font-bold ${
            mutationError
              ? "border-red-200 bg-red-50 text-red-800"
              : "border-emerald-200 bg-emerald-50 text-emerald-800"
          }`}
        >
          {mutationError ?? notice}
        </div>
      )}

      <section className="rounded-3xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
          <label className="relative md:col-span-2">
            <span className="sr-only">Buscar por título o finalidad</span>
            <Search
              className="absolute left-3 top-3.5 text-slate-400"
              size={18}
              aria-hidden="true"
            />
            <input
              value={filters.search}
              maxLength={100}
              onChange={(event) =>
                setFilters((current) => ({
                  ...current,
                  page: 1,
                  search: event.target.value,
                }))
              }
              placeholder="Buscar título o finalidad"
              className="min-h-11 w-full rounded-xl border border-slate-200 pl-10 pr-4 text-sm font-semibold text-slate-900"
            />
          </label>
          <label>
            <span className="sr-only">Filtrar por estado</span>
            <select
              aria-label="Filtrar por estado"
              value={filters.status}
              onChange={(event) =>
                setFilters((current) => ({
                  ...current,
                  page: 1,
                  status: event.target.value as Filters["status"],
                }))
              }
              className="min-h-11 w-full rounded-xl border border-slate-200 px-3 text-sm font-bold text-slate-700"
            >
              <option value="">Todos los estados</option>
              {STATUS_OPTIONS.map((status) => (
                <option key={status.value} value={status.value}>
                  {status.label}
                </option>
              ))}
            </select>
          </label>
          <label>
            <span className="sr-only">Filtrar por canal</span>
            <select
              aria-label="Filtrar por canal"
              value={filters.channel}
              onChange={(event) =>
                setFilters((current) => ({
                  ...current,
                  page: 1,
                  channel: event.target.value as Filters["channel"],
                }))
              }
              className="min-h-11 w-full rounded-xl border border-slate-200 px-3 text-sm font-bold text-slate-700"
            >
              <option value="">Todos los canales</option>
              {CHANNELS.map((channel) => (
                <option key={channel.value} value={channel.value}>
                  {channel.label}
                </option>
              ))}
            </select>
          </label>
          <label>
            <span className="sr-only">Filtrar por datos sensibles</span>
            <select
              aria-label="Filtrar por datos sensibles"
              value={filters.containsSensitiveData}
              onChange={(event) =>
                setFilters((current) => ({
                  ...current,
                  page: 1,
                  containsSensitiveData: event.target
                    .value as Filters["containsSensitiveData"],
                }))
              }
              className="min-h-11 w-full rounded-xl border border-slate-200 px-3 text-sm font-bold text-slate-700"
            >
              <option value="">Cualquier sensibilidad</option>
              <option value="true">Con datos sensibles</option>
              <option value="false">Sin datos sensibles</option>
            </select>
          </label>
        </div>
      </section>

      {loading ? (
        <div
          role="status"
          className="flex min-h-72 items-center justify-center gap-3 rounded-3xl border border-slate-200 bg-white text-slate-600"
        >
          <Loader2 className="animate-spin text-blue-700" aria-hidden="true" />
          Cargando cola de revisión…
        </div>
      ) : loadError ? (
        <div
          role="alert"
          className="flex min-h-72 flex-col items-center justify-center gap-4 rounded-3xl border border-red-200 bg-red-50 p-8 text-center text-red-800"
        >
          <AlertCircle size={32} aria-hidden="true" />
          <p className="font-bold">{loadError}</p>
          <button
            type="button"
            onClick={() => setReloadVersion((value) => value + 1)}
            className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-red-700 px-4 text-sm font-black text-white"
          >
            <RefreshCw size={16} aria-hidden="true" /> Reintentar
          </button>
        </div>
      ) : items.length === 0 ? (
        <div className="flex min-h-72 flex-col items-center justify-center gap-3 rounded-3xl border border-dashed border-slate-300 bg-white p-8 text-center">
          <MessageSquareText
            size={34}
            className="text-slate-400"
            aria-hidden="true"
          />
          <h2 className="text-lg font-black text-slate-900">
            No hay solicitudes
          </h2>
          <p className="max-w-lg text-sm text-slate-500">
            Ajusta los filtros o crea una solicitud para iniciar una revisión
            independiente.
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {items.map((approval) => {
            const ownRequest = approval.requestedById === user?.id;
            const needsSensitiveReviewer =
              approval.containsSensitiveData &&
              user?.backendRole !== "ADMIN" &&
              user?.backendRole !== "COMPLIANCE_OFFICER";
            return (
              <article
                key={approval.id}
                data-testid={`communication-card-${approval.id}`}
                className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm"
              >
                <div className="flex flex-col gap-5 lg:flex-row lg:justify-between">
                  <div className="min-w-0 flex-1 space-y-4">
                    <div className="flex flex-wrap items-center gap-2">
                      <span
                        className={`rounded-full px-3 py-1 text-xs font-black ${
                          approval.status === "APPROVED"
                            ? "bg-emerald-100 text-emerald-800"
                            : approval.status === "REJECTED"
                              ? "bg-red-100 text-red-800"
                              : "bg-amber-100 text-amber-900"
                        }`}
                      >
                        {statusLabel(approval.status)}
                      </span>
                      <span className="rounded-full bg-blue-50 px-3 py-1 text-xs font-black text-blue-800">
                        {channelLabel(approval.channel)}
                      </span>
                      {approval.containsSensitiveData && (
                        <span className="rounded-full bg-violet-100 px-3 py-1 text-xs font-black text-violet-800">
                          Datos sensibles declarados
                        </span>
                      )}
                    </div>
                    <div>
                      <h2 className="text-xl font-black text-slate-950">
                        {approval.title}
                      </h2>
                      <p className="mt-1 text-sm font-semibold text-slate-500">
                        Finalidad: {approval.purpose}
                      </p>
                    </div>
                    <blockquote className="whitespace-pre-wrap rounded-2xl border-l-4 border-blue-500 bg-slate-50 p-4 text-sm leading-6 text-slate-800">
                      {messageFromContent(approval.content)}
                    </blockquote>
                    <dl className="grid gap-2 text-xs text-slate-500 sm:grid-cols-2">
                      <div>
                        <dt className="font-black uppercase tracking-wider">
                          Solicitó
                        </dt>
                        <dd className="mt-1 font-semibold text-slate-700">
                          {approval.requestedBy.name} ·{" "}
                          {formatDate(approval.createdAt)}
                        </dd>
                      </div>
                      <div>
                        <dt className="font-black uppercase tracking-wider">
                          Huella de versión
                        </dt>
                        <dd
                          className="mt-1 overflow-hidden font-mono text-slate-700"
                          title={approval.contentHash}
                        >
                          {approval.contentHash.slice(0, 16)}…
                        </dd>
                      </div>
                    </dl>
                    {approval.issueCase && (
                      <p className="text-xs font-bold text-slate-600">
                        Caso relacionado: {approval.issueCase.reference}
                      </p>
                    )}
                    {approval.decisionReason && (
                      <div className="rounded-2xl border border-slate-200 p-4 text-sm text-slate-700">
                        <p className="font-black">Motivo de la decisión</p>
                        <p className="mt-1 whitespace-pre-wrap">
                          {approval.decisionReason}
                        </p>
                        <p className="mt-2 text-xs text-slate-500">
                          {approval.decidedBy?.name ?? "Revisor no disponible"}{" "}
                          · {formatDate(approval.decidedAt)}
                        </p>
                      </div>
                    )}
                  </div>
                  {approval.status === "PENDING" && canDecide && (
                    <div className="flex shrink-0 flex-col gap-2 lg:w-48">
                      {ownRequest ? (
                        <p className="rounded-2xl bg-amber-50 p-3 text-xs font-bold leading-5 text-amber-900">
                          Requiere revisión de otra persona por la regla de
                          cuatro ojos.
                        </p>
                      ) : needsSensitiveReviewer ? (
                        <p className="rounded-2xl bg-violet-50 p-3 text-xs font-bold leading-5 text-violet-900">
                          Los datos sensibles requieren revisión de
                          administración o cumplimiento.
                        </p>
                      ) : (
                        <>
                          <button
                            type="button"
                            aria-label={`Aprobar ${approval.title}`}
                            onClick={() => {
                              setMutationError(null);
                              setDecision({ approval, status: "APPROVED" });
                            }}
                            className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-emerald-700 px-4 text-sm font-black text-white"
                          >
                            <Check size={17} aria-hidden="true" /> Aprobar
                          </button>
                          <button
                            type="button"
                            aria-label={`Rechazar ${approval.title}`}
                            onClick={() => {
                              setMutationError(null);
                              setDecision({ approval, status: "REJECTED" });
                            }}
                            className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-red-200 bg-red-50 px-4 text-sm font-black text-red-800"
                          >
                            <ShieldX size={17} aria-hidden="true" /> Rechazar
                          </button>
                        </>
                      )}
                    </div>
                  )}
                </div>
              </article>
            );
          })}
        </div>
      )}

      {!loading && !loadError && result && (
        <nav
          aria-label="Paginación"
          className="flex items-center justify-end gap-3"
        >
          <button
            type="button"
            disabled={filters.page <= 1}
            onClick={() =>
              setFilters((current) => ({ ...current, page: current.page - 1 }))
            }
            className="inline-flex min-h-10 items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 text-sm font-bold disabled:opacity-40"
          >
            <ChevronLeft size={16} aria-hidden="true" /> Anterior
          </button>
          <span className="text-sm font-semibold text-slate-600">
            Página {filters.page} de {totalPages}
          </span>
          <button
            type="button"
            disabled={filters.page >= totalPages}
            onClick={() =>
              setFilters((current) => ({ ...current, page: current.page + 1 }))
            }
            className="inline-flex min-h-10 items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 text-sm font-bold disabled:opacity-40"
          >
            Siguiente <ChevronRight size={16} aria-hidden="true" />
          </button>
        </nav>
      )}

      {requestOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-950/60 p-4">
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="request-title"
            className="max-h-[92vh] w-full max-w-2xl overflow-y-auto rounded-3xl bg-white p-6 shadow-2xl"
          >
            <div className="mb-5 flex items-start justify-between gap-4">
              <div>
                <h2
                  id="request-title"
                  className="text-2xl font-black text-slate-950"
                >
                  Solicitar revisión
                </h2>
                <p className="mt-1 text-sm text-slate-500">
                  Se guardará esta versión exacta; no se enviará ni publicará.
                </p>
              </div>
              <button
                type="button"
                aria-label="Cerrar solicitud"
                onClick={() => setRequestOpen(false)}
                className="rounded-xl p-2 text-slate-500 hover:bg-slate-100"
              >
                <X aria-hidden="true" />
              </button>
            </div>
            <form onSubmit={handleCreate} className="space-y-4">
              {mutationError && (
                <p
                  role="alert"
                  className="rounded-xl bg-red-50 p-3 text-sm font-bold text-red-800"
                >
                  {mutationError}
                </p>
              )}
              <label className="block space-y-2 text-sm font-black text-slate-700">
                Título
                <input
                  required
                  minLength={3}
                  maxLength={180}
                  value={requestForm.title}
                  onChange={(event) =>
                    setRequestForm((current) => ({
                      ...current,
                      title: event.target.value,
                    }))
                  }
                  className="min-h-11 w-full rounded-xl border border-slate-200 px-4 font-semibold"
                />
              </label>
              <label className="block space-y-2 text-sm font-black text-slate-700">
                Mensaje a revisar
                <textarea
                  required
                  maxLength={5000}
                  rows={8}
                  value={requestForm.message}
                  onChange={(event) =>
                    setRequestForm((current) => ({
                      ...current,
                      message: event.target.value,
                    }))
                  }
                  className="w-full rounded-xl border border-slate-200 px-4 py-3 font-medium"
                />
                <span className="block text-right text-xs font-semibold text-slate-400">
                  {requestForm.message.length}/5000
                </span>
              </label>
              <div className="grid gap-4 md:grid-cols-2">
                <label className="block space-y-2 text-sm font-black text-slate-700">
                  Canal
                  <select
                    required
                    value={requestForm.channel}
                    onChange={(event) =>
                      setRequestForm((current) => ({
                        ...current,
                        channel: event.target.value as CommunicationChannel,
                      }))
                    }
                    className="min-h-11 w-full rounded-xl border border-slate-200 px-3 font-semibold"
                  >
                    {CHANNELS.map((channel) => (
                      <option key={channel.value} value={channel.value}>
                        {channel.label}
                      </option>
                    ))}
                  </select>
                </label>
                {canLinkCase && (
                  <label className="block space-y-2 text-sm font-black text-slate-700">
                    ID interno del caso {caseLinkRequired ? "" : "(opcional)"}
                    <input
                      required={caseLinkRequired}
                      maxLength={128}
                      value={requestForm.issueCaseId}
                      onChange={(event) =>
                        setRequestForm((current) => ({
                          ...current,
                          issueCaseId: event.target.value,
                        }))
                      }
                      className="min-h-11 w-full rounded-xl border border-slate-200 px-4 font-semibold"
                    />
                  </label>
                )}
              </div>
              <label className="block space-y-2 text-sm font-black text-slate-700">
                Finalidad legítima
                <textarea
                  required
                  minLength={3}
                  maxLength={500}
                  rows={3}
                  value={requestForm.purpose}
                  onChange={(event) =>
                    setRequestForm((current) => ({
                      ...current,
                      purpose: event.target.value,
                    }))
                  }
                  className="w-full rounded-xl border border-slate-200 px-4 py-3 font-medium"
                />
              </label>
              <label className="flex items-start gap-3 rounded-2xl border border-violet-200 bg-violet-50 p-4 text-sm font-bold text-violet-950">
                <input
                  type="checkbox"
                  checked={requestForm.containsSensitiveData}
                  onChange={(event) =>
                    setRequestForm((current) => ({
                      ...current,
                      containsSensitiveData: event.target.checked,
                    }))
                  }
                  className="mt-0.5 h-4 w-4"
                />
                <span>
                  El mensaje contiene datos personales sensibles y requiere
                  revisión reforzada.
                </span>
              </label>
              <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
                <button
                  type="button"
                  onClick={() => setRequestOpen(false)}
                  className="min-h-11 rounded-xl border border-slate-200 px-5 text-sm font-black text-slate-700"
                >
                  Cancelar
                </button>
                <button
                  disabled={saving === "request"}
                  type="submit"
                  className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-blue-700 px-5 text-sm font-black text-white disabled:opacity-50"
                >
                  {saving === "request" ? (
                    <Loader2 className="animate-spin" size={17} />
                  ) : (
                    <FileCheck2 size={17} />
                  )}{" "}
                  Enviar a revisión
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {decision && (
        <div className="fixed inset-0 z-[110] flex items-center justify-center bg-slate-950/60 p-4">
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="decision-title"
            className="w-full max-w-lg rounded-3xl bg-white p-6 shadow-2xl"
          >
            <div className="mb-5 flex items-start justify-between gap-4">
              <div>
                <h2
                  id="decision-title"
                  className="text-2xl font-black text-slate-950"
                >
                  {decision.status === "APPROVED"
                    ? "Aprobar comunicación"
                    : "Rechazar comunicación"}
                </h2>
                <p className="mt-1 text-sm text-slate-500">
                  {decision.approval.title}
                </p>
              </div>
              <button
                type="button"
                aria-label="Cerrar decisión"
                onClick={() => {
                  setDecision(null);
                  setDecisionReason("");
                }}
                className="rounded-xl p-2 text-slate-500 hover:bg-slate-100"
              >
                <X aria-hidden="true" />
              </button>
            </div>
            <form onSubmit={handleDecision} className="space-y-4">
              {mutationError && (
                <p
                  role="alert"
                  className="rounded-xl bg-red-50 p-3 text-sm font-bold text-red-800"
                >
                  {mutationError}
                </p>
              )}
              <label className="block space-y-2 text-sm font-black text-slate-700">
                Motivo de la decisión
                <textarea
                  autoFocus
                  required
                  minLength={3}
                  maxLength={1000}
                  rows={5}
                  value={decisionReason}
                  onChange={(event) => setDecisionReason(event.target.value)}
                  className="w-full rounded-xl border border-slate-200 px-4 py-3 font-medium"
                />
              </label>
              <p className="rounded-2xl bg-slate-50 p-3 text-xs font-semibold leading-5 text-slate-600">
                La decisión queda auditada sin copiar el mensaje ni el motivo al
                evento de auditoría. Aprobar tampoco publica el contenido.
              </p>
              <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
                <button
                  type="button"
                  onClick={() => {
                    setDecision(null);
                    setDecisionReason("");
                  }}
                  className="min-h-11 rounded-xl border border-slate-200 px-5 text-sm font-black text-slate-700"
                >
                  Cancelar
                </button>
                <button
                  disabled={saving === "decision"}
                  type="submit"
                  className={`inline-flex min-h-11 items-center justify-center gap-2 rounded-xl px-5 text-sm font-black text-white disabled:opacity-50 ${decision.status === "APPROVED" ? "bg-emerald-700" : "bg-red-700"}`}
                >
                  {saving === "decision" ? (
                    <Loader2 className="animate-spin" size={17} />
                  ) : decision.status === "APPROVED" ? (
                    <Check size={17} />
                  ) : (
                    <ShieldX size={17} />
                  )}{" "}
                  Confirmar decisión
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
