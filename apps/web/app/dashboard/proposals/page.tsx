"use client";

import { usePageRequest } from "@/lib/use-page-request";

import { useRouter, useSearchParams } from "next/navigation";

import {
  type FormEvent,
  type KeyboardEvent,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  AlertCircle,
  FileText,
  Loader2,
  Megaphone,
  Pencil,
  Plus,
  RefreshCw,
  Trash2,
  X,
} from "lucide-react";
import { useAuth } from "@/context/auth";
import { buildSearchResultHref, readEntityDeepLink } from "@/lib/entity-deep-links";
import {
  allowedProposalStatuses,
  createProposal,
  deleteProposal,
  getProposal,
  ProposalPage,
  PROPOSALS_PAGE_SIZE,
  listProposals,
  listProposalResponsibles,
  PoliticalProposal,
  PROPOSAL_CATEGORIES,
  ProposalCategory,
  PROPOSAL_STATUSES,
  ProposalStatus,
  SaveProposalInput,
  updateProposal,
} from "@/lib/proposals-api";
import type { BackendUserRole } from "@/types/saas-schema";
import { useAccessibleDialog } from "@/lib/use-accessible-dialog";
import { UserCombobox } from "@/components/ui/UserCombobox";
import { PageHeader } from "@/components/ui/PageHeader";

const PROPOSAL_MANAGER_ROLES = new Set<BackendUserRole>([
  "ADMIN",
  "CAMPAIGN_MANAGER",
]);

const searchProposalResponsibles = (
  search: string,
  signal: AbortSignal,
  page = 1,
) => listProposalResponsibles({ search, page, limit: 10 }, signal);

const CATEGORY_LABELS: Record<ProposalCategory, string> = {
  EDUCATION: "Educación",
  HEALTH: "Salud",
  INFRASTRUCTURE: "Infraestructura",
  SECURITY: "Seguridad",
  ECONOMY: "Economía",
  ENVIRONMENT: "Medio ambiente",
  CULTURE: "Cultura",
  SOCIAL: "Social",
  GOVERNANCE: "Gobernanza",
  OTHER: "Otra",
};

const STATUS_LABELS: Record<ProposalStatus, string> = {
  DRAFT: "Borrador",
  PROPOSED: "Propuesta",
  IN_PROGRESS: "En ejecución",
  COMPLETED: "Completada",
  WITHDRAWN: "Retirada",
};

const COST_FORMATTER = new Intl.NumberFormat("es-CO", {
  style: "currency",
  currency: "COP",
  minimumFractionDigits: 0,
  maximumFractionDigits: 2,
});

interface ProposalForm {
  title: string;
  description: string;
  category: ProposalCategory;
  status: ProposalStatus;
  progressPercent: string;
  estimatedCost: string;
  internalDistributionFlag: boolean;
  ownerId: string;
}

interface StatusFeedback {
  kind: "success" | "error";
  message: string;
}

const EMPTY_FORM: ProposalForm = {
  title: "",
  description: "",
  category: "OTHER",
  status: "DRAFT",
  progressPercent: "0",
  estimatedCost: "",
  internalDistributionFlag: false,
  ownerId: "",
};

function errorMessage(error: unknown, fallback: string): string {
  return error instanceof Error && error.message ? error.message : fallback;
}

function statusTone(status: ProposalStatus): string {
  switch (status) {
    case "DRAFT":
      return "bg-amber-50 text-amber-800";
    case "PROPOSED":
      return "bg-blue-50 text-blue-800";
    case "IN_PROGRESS":
      return "bg-indigo-50 text-indigo-800";
    case "COMPLETED":
      return "bg-emerald-50 text-emerald-800";
    case "WITHDRAWN":
      return "bg-slate-100 text-slate-600";
  }
}

export default function ProposalsPage() {
  const { user, tenant } = useAuth();
  const scopeKey = user && tenant ? `${tenant.id}:${user.id}:${user.backendRole}` : "";
  // Keep drafts, saved-record notices and pending actions inside the same scope.
  return <ProposalsWorkspace key={scopeKey} scopeKey={scopeKey} />;
}

function ProposalsWorkspace({ scopeKey }: { scopeKey: string }) {
  const { user } = useAuth();
  const router = useRouter();
  const canMutate =
    user !== null && PROPOSAL_MANAGER_ROLES.has(user.backendRole);
  const [statusFilter, setStatusFilter] = useState<ProposalStatus | "ALL">(
    "ALL",
  );
  const [page, setPage] = useState(1);
  const [searchQuery, setSearchQuery] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");

  useEffect(() => {
    if (searchQuery.trim() === debouncedSearch) return;
    const timer = setTimeout(() => {
      setDebouncedSearch(searchQuery.trim());
      setPage(1);
    }, 400);
    return () => clearTimeout(timer);
  }, [searchQuery, debouncedSearch]);

  const [categoryFilter, setCategoryFilter] = useState<
    ProposalCategory | "ALL"
  >("ALL");

  const [dialogProposal, setDialogProposal] = useState<
    PoliticalProposal | "new" | null
  >(null);
  const [form, setForm] = useState<ProposalForm>(EMPTY_FORM);
  const [submitting, setSubmitting] = useState(false);
  const [mutationError, setMutationError] = useState<string | null>(null);
  const [completionConfirmed, setCompletionConfirmed] = useState(false);
  const [savedProposal, setSavedProposal] = useState<PoliticalProposal | null>(null);
  const progressBeforeCompletion = useRef("0");
  const statusRequests = useRef(new Set<string>());
  const [savingStatuses, setSavingStatuses] = useState<Set<string>>(new Set());
  const [statusFeedback, setStatusFeedback] = useState<
    Record<string, StatusFeedback>
  >({});
  const searchParams = useSearchParams();
  const deepLinkProposalId = readEntityDeepLink(searchParams.toString());
  const [deleteTarget, setDeleteTarget] = useState<PoliticalProposal | null>(
    null,
  );
  const [deleting, setDeleting] = useState(false);
  const proposalDialogRef = useRef<HTMLElement>(null);
  const proposalDialogTitleRef = useRef<HTMLHeadingElement>(null);
  const deleteDialogRef = useRef<HTMLDivElement>(null);
  const deleteDialogTitleRef = useRef<HTMLHeadingElement>(null);

  useAccessibleDialog({
    open: dialogProposal !== null,
    containerRef: proposalDialogRef,
    initialFocusRef: proposalDialogTitleRef,
    onClose: () => {
      if (!submitting) setDialogProposal(null);
    },
    closeOnEscape: !submitting,
  });
  useAccessibleDialog({
    open: deleteTarget !== null,
    containerRef: deleteDialogRef,
    initialFocusRef: deleteDialogTitleRef,
    onClose: () => { if (!deleting) setDeleteTarget(null); },
    closeOnEscape: false,
  });

  const request = useCallback(
    async (signal: AbortSignal): Promise<ProposalPage> => {
      if (!scopeKey) throw new Error("Inicia sesión para consultar las propuestas.");
      if (deepLinkProposalId) {
        const proposal = await getProposal(deepLinkProposalId, signal);
        return {
          items: proposal ? [proposal] : [],
          pagination: { page: 1, limit: 1, total: proposal ? 1 : 0, totalPages: proposal ? 1 : 0 },
        };
      }
      return listProposals({
        page, limit: PROPOSALS_PAGE_SIZE, search: debouncedSearch,
        status: statusFilter === "ALL" ? undefined : statusFilter,
        category: categoryFilter === "ALL" ? undefined : categoryFilter,
      }, signal);
    },
    [scopeKey, page, statusFilter, categoryFilter, debouncedSearch, deepLinkProposalId],
  );
  const {
    data: proposalsData,
    loading,
    error: requestError,
    refresh,
    setData,
  } = usePageRequest(request, { enabled: Boolean(scopeKey), retainDataOnRefresh: true });
  const proposals = useMemo(() => proposalsData?.items ?? [], [proposalsData]);
  // A mutation may finish after the user changes page/filters. Reconcile the
  // active query, never the stale query captured when the PATCH started.
  const activeList = useRef<{ scopeKey: string; refresh: typeof refresh; setData: typeof setData } | null>(null);
  useEffect(() => {
    const current = { scopeKey, refresh, setData };
    activeList.current = current;
    return () => { if (activeList.current === current) activeList.current = null; };
  }, [scopeKey, refresh, setData]);
  const setProposals = (update: (items: PoliticalProposal[]) => PoliticalProposal[]) => {
    const current = activeList.current;
    if (current?.scopeKey !== scopeKey) return;
    current.setData((snapshot) => snapshot ? { ...snapshot, items: update(snapshot.items) } : null);
  };
  const loadProposals = () => {
    const current = activeList.current;
    return current?.scopeKey === scopeKey ? current.refresh() : Promise.resolve(undefined);
  };
  const isCurrentProposalScope = () => activeList.current?.scopeKey === scopeKey;
  // A concurrent deletion can empty the last page. Return to the last valid page.
  useEffect(() => {
    if (deepLinkProposalId || !proposalsData || loading || requestError) return;
    const lastPage = Math.max(1, proposalsData.pagination.totalPages);
    if (page > lastPage) setPage(lastPage);
  }, [deepLinkProposalId, proposalsData, loading, requestError, page]);
  const fetchError = requestError
    ? errorMessage(
        requestError,
        "No se pudieron cargar las propuestas. Intente de nuevo.",
      )
    : null;

  useEffect(() => {
    if (!deepLinkProposalId || loading || fetchError) return;
    const target = document.getElementById(
      `proposal-result-${deepLinkProposalId}`,
    );
    if (!target) return;
    target.scrollIntoView({ block: "center" });
    target.focus({ preventScroll: true });
  }, [deepLinkProposalId, fetchError, loading, proposals]);

  const openCreate = () => {
    if (!canMutate) return;
    progressBeforeCompletion.current = EMPTY_FORM.progressPercent;
    setForm({ ...EMPTY_FORM, ownerId: user.id });
    setMutationError(null);
    setCompletionConfirmed(false);
    setDialogProposal("new");
  };

  const openEdit = (proposal: PoliticalProposal, status = proposal.status) => {
    if (!canMutate || statusRequests.current.has(proposal.id)) return;
    progressBeforeCompletion.current = String(proposal.progressPercent);
    setForm({
      title: proposal.title,
      description: proposal.description,
      category: proposal.category,
      status,
      progressPercent: status === "COMPLETED" ? "100" : String(proposal.progressPercent),
      estimatedCost:
        proposal.estimatedCost === null ? "" : String(proposal.estimatedCost),
      internalDistributionFlag: proposal.isPublic,
      ownerId: proposal.ownerId,
    });
    setMutationError(null);
    setCompletionConfirmed(false);
    setDialogProposal(proposal);
  };

  function changeFormStatus(status: ProposalStatus) {
    if (status === "COMPLETED" && form.status !== "COMPLETED") {
      progressBeforeCompletion.current = form.progressPercent;
    }
    setCompletionConfirmed(false);
    setForm({
      ...form,
      status,
      progressPercent:
        status === "DRAFT" || status === "PROPOSED"
          ? "0"
          : status === "COMPLETED"
            ? "100"
            : form.status === "COMPLETED"
              ? progressBeforeCompletion.current
              : form.progressPercent,
    });
  }

  const handleCardKeyDown = (
    event: KeyboardEvent<HTMLElement>,
    proposal: PoliticalProposal,
  ) => {
    if (!canMutate || event.target !== event.currentTarget) return;
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      openEdit(proposal);
    }
  };

  async function handleStatusChange(
    proposal: PoliticalProposal,
    status: ProposalStatus,
  ) {
    if (
      !canMutate ||
      statusRequests.current.has(proposal.id) ||
      status === proposal.status ||
      !allowedProposalStatuses(proposal.status).includes(status)
    ) {
      return;
    }

    // Completing is a final declaration of 100% progress. Review and confirm
    // it in the editor instead of sending a status-only PATCH that the API rejects.
    if (status === "COMPLETED") {
      openEdit(proposal, status);
      return;
    }

    statusRequests.current.add(proposal.id);
    setSavingStatuses(new Set(statusRequests.current));
    setStatusFeedback((current) => {
      const next = { ...current };
      delete next[proposal.id];
      return next;
    });
    try {
      const confirmed = await updateProposal(proposal.id, { status });
      if (!isCurrentProposalScope()) return;
      // Only an API-confirmed record replaces the last known state. This also
      // cancels an older GET so it cannot overwrite the confirmed change.
      setProposals((current) =>
        (current ?? []).map((item) =>
          item.id === confirmed.id ? confirmed : item,
        ),
      );
      setStatusFeedback((current) => ({
        ...current,
        [proposal.id]: {
          kind: "success",
          message: `«${proposal.title}»: estado guardado como ${STATUS_LABELS[confirmed.status]}.`,
        },
      }));
      await loadProposals();
    } catch (error: unknown) {
      if (!isCurrentProposalScope()) return;
      setStatusFeedback((current) => ({
        ...current,
        [proposal.id]: {
          kind: "error",
          message: `No se pudo confirmar el cambio de «${proposal.title}». ${errorMessage(error, "Intenta actualizar el listado.")} Comprueba su estado con Actualizar antes de repetir el cambio.`,
        },
      }));
    } finally {
      statusRequests.current.delete(proposal.id);
      setSavingStatuses(new Set(statusRequests.current));
    }
  }

  const confirmDelete = async () => {
    if (!deleteTarget || !canMutate || deleting) return;
    setDeleting(true);
    try {
      await deleteProposal(deleteTarget.id);
      if (!isCurrentProposalScope()) return;
      if (savedProposal?.id === deleteTarget.id) setSavedProposal(null);
      if (deepLinkProposalId === deleteTarget.id) router.replace("/dashboard/proposals");
      setDeleteTarget(null);
      await loadProposals();
    } catch (error: unknown) {
      if (!isCurrentProposalScope()) return;
      setMutationError(
        errorMessage(error, "No se pudo eliminar la propuesta."),
      );
      setDeleteTarget(null);
    } finally {
      setDeleting(false);
    }
  };

  const submitForm = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!dialogProposal || !canMutate) return;

    const title = form.title.trim();
    if (!title) {
      setMutationError("El título es obligatorio.");
      return;
    }
    if (!form.ownerId) {
      setMutationError("Selecciona el responsable de la propuesta.");
      return;
    }
    if (form.status === "COMPLETED" && dialogProposal !== "new" &&
        dialogProposal.status !== "COMPLETED" && !completionConfirmed) {
      setMutationError("Confirma que la propuesta alcanzó el 100 % antes de completarla.");
      return;
    }

    const progressPercent = Number(form.progressPercent);
    const estimatedCost = form.estimatedCost.trim()
      ? Number(form.estimatedCost)
      : null;
    const payload: SaveProposalInput = {
      title,
      description: form.description.trim(),
      category: form.category,
      status: form.status,
      progressPercent,
      estimatedCost,
      isPublic: form.internalDistributionFlag,
      ownerId: form.ownerId,
    };

    setSubmitting(true);
    setMutationError(null);
    try {
      const confirmed = dialogProposal === "new"
        ? await createProposal(payload)
        : await updateProposal(dialogProposal.id, payload);
      if (!isCurrentProposalScope()) return;
      setProposals((current) => current.map((item) => item.id === confirmed.id ? confirmed : item));
      setSavedProposal(confirmed);
      setDialogProposal(null);
      await loadProposals();
    } catch (error: unknown) {
      if (!isCurrentProposalScope()) return;
      setMutationError(errorMessage(error, "No se pudo guardar la propuesta."));
    } finally {
      setSubmitting(false);
    }
  };

  const hasFilters = Boolean(debouncedSearch || statusFilter !== "ALL" || categoryFilter !== "ALL");
  const pagination = proposalsData?.pagination;
  const changePage = (nextPage: number) => {
    setPage(nextPage);
    document.getElementById("proposal-list-navigation")?.scrollIntoView({ block: "start" });
  };

  const deepLinkedProposalIsMissing = Boolean(
    deepLinkProposalId &&
    !loading &&
    !fetchError &&
    !proposals.some((proposal) => proposal.id === deepLinkProposalId),
  );
  const editedProposal =
    dialogProposal !== null && dialogProposal !== "new" ? dialogProposal : null;
  const committedContentLocked =
    editedProposal !== null && editedProposal.status !== "DRAFT";
  const terminalProposal = editedProposal?.status === "COMPLETED" || editedProposal?.status === "WITHDRAWN";
  const progressInputLocked =
    dialogProposal === "new" ||
    form.status === "DRAFT" ||
    form.status === "PROPOSED" ||
    form.status === "COMPLETED" ||
    editedProposal?.status === "COMPLETED" ||
    editedProposal?.status === "WITHDRAWN";

  return (
    <div className="mx-auto max-w-7xl space-y-7 min-w-0">
      <PageHeader
        title="Programa político"
        description="Gestión y seguimiento de propuestas y compromisos."
        icon={FileText}
        meta={
          !canMutate && user ? (
            <p className="mt-3 inline-flex rounded-full bg-slate-100 px-3 py-1 text-xs font-bold text-slate-600">
              Acceso de consulta
            </p>
          ) : undefined
        }
        actions={
          <div className="flex flex-col gap-3 sm:flex-row min-w-0">
            <button
              type="button"
              onClick={() => void loadProposals()}
              disabled={loading}
              className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50 max-w-full whitespace-normal"
            >
              <RefreshCw className={loading ? "animate-spin" : ""} size={16} />
              Actualizar
            </button>
            {canMutate && (
              <button
                type="button"
                onClick={openCreate}
                className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-blue-700 px-4 text-sm font-semibold text-white hover:bg-blue-800 max-w-full whitespace-normal"
              >
                <Plus size={16} /> Nueva propuesta
              </button>
            )}
          </div>
        }
      />

      {fetchError && (
        <div role="alert" className="flex items-start gap-3 rounded-2xl border border-red-200 bg-red-50 p-5 text-sm text-red-900 min-w-0">
          <AlertCircle size={20} className="shrink-0" />
          <p>{fetchError}{proposalsData !== null && " Se conserva el último listado recibido; puede estar desactualizado."}</p>
        </div>
      )}
      {mutationError && !dialogProposal && (
        <p role="alert" className="rounded-2xl border border-red-200 bg-red-50 p-5 text-sm text-red-900">{mutationError}</p>
      )}
      {savedProposal && (
        <div role="status" className="flex min-w-0 flex-wrap items-center justify-between gap-3 rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-900">
          <p className="min-w-0 break-words">
            <strong>Propuesta guardada:</strong> «{savedProposal.title}» · {STATUS_LABELS[savedProposal.status]}.
            {" "}Puedes abrirla aunque no coincida con tus filtros.
          </p>
          <button type="button" onClick={() => router.push(buildSearchResultHref("Proposals", savedProposal.id))}
            className="inline-flex min-h-11 items-center justify-center rounded-xl border border-emerald-300 bg-white px-4 font-semibold hover:bg-emerald-100">
            Ver propuesta guardada
          </button>
        </div>
      )}
      {Object.entries(statusFeedback).map(([id, feedback]) => (
        <div
          key={id}
          role={feedback.kind === "error" ? "alert" : "status"}
          className={`flex min-w-0 items-start gap-3 rounded-2xl border p-4 text-sm ${feedback.kind === "error" ? "border-red-200 bg-red-50 text-red-900" : "border-emerald-200 bg-emerald-50 text-emerald-900"}`}
        >
          <p className="min-w-0 flex-1 break-words">{feedback.message}</p>
          <button
            type="button"
            aria-label="Cerrar aviso de cambio de estado"
            className="inline-flex min-h-11 min-w-11 shrink-0 items-center justify-center rounded-lg hover:bg-black/5 focus-visible:outline-2 focus-visible:outline-offset-2"
            onClick={() => setStatusFeedback((current) => {
              const next = { ...current };
              delete next[id];
              return next;
            })}
          ><X size={18} aria-hidden="true" /></button>
        </div>
      ))}

      {deepLinkedProposalIsMissing && (
        <p
          role="alert"
          className="rounded-2xl border border-amber-200 bg-amber-50 p-5 text-sm font-bold text-amber-900"
        >
          La propuesta buscada ya no está disponible o queda fuera de tu alcance
          autorizado.
        </p>
      )}

      {deepLinkProposalId ? (
        <div className="flex min-w-0 flex-wrap items-center justify-between gap-3 rounded-2xl border border-blue-200 bg-blue-50 p-4 text-sm text-blue-950">
          <p>Estás viendo una propuesta específica. Tu búsqueda y tus filtros se conservan al volver al listado.</p>
          <button type="button" onClick={() => router.push("/dashboard/proposals")}
            className="inline-flex min-h-11 items-center justify-center rounded-xl border border-blue-300 bg-white px-4 font-semibold hover:bg-blue-100">
            Volver al listado
          </button>
        </div>
      ) : <div className="flex flex-col gap-4 border-b border-slate-200 pb-4 lg:flex-row lg:items-center lg:justify-between min-w-0">
        <div className="flex-1 max-w-sm min-w-0">
          <label htmlFor="proposal-search" className="mb-1 block text-sm font-semibold text-slate-700">Buscar propuestas</label>
          <input
            id="proposal-search"
            type="search"
            placeholder="Título, código o descripción"
            value={searchQuery}
            maxLength={200}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="min-h-11 w-full rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 min-w-0 max-w-full"
          />
        </div>

        <div role="group" aria-label="Filtrar propuestas por estado" className="flex flex-wrap gap-2 min-w-0 max-w-full">
          {(["ALL", ...PROPOSAL_STATUSES] as const).map((status) => (
            <button
              type="button"
              key={status}
              aria-pressed={statusFilter === status}
              onClick={() => { setStatusFilter(status); setPage(1); }}
              className={`min-h-11 rounded-xl border px-3 py-2 text-sm font-semibold transition-colors ${
                statusFilter === status
                  ? "border-blue-700 bg-blue-50 text-blue-700"
                  : "border-slate-200 text-slate-600 hover:bg-slate-50"
              }`}
            >
              {status === "ALL" ? "Todas" : STATUS_LABELS[status]}
            </button>
          ))}
        </div>
        <div className="min-w-0">
        <label htmlFor="proposal-category-filter" className="mb-1 block text-sm font-semibold text-slate-700">Filtrar por categoría</label>
        <select
          id="proposal-category-filter"
          value={categoryFilter}
          onChange={(event) => {
            setCategoryFilter(event.target.value as ProposalCategory | "ALL");
            setPage(1);
          }}
          className="min-h-11 rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 min-w-0 max-w-full"
        >
          <option value="ALL">Todas las categorías</option>
          {PROPOSAL_CATEGORIES.map((category) => (
            <option key={category} value={category}>
              {CATEGORY_LABELS[category]}
            </option>
          ))}
        </select>
        </div>
      </div>}

      {!deepLinkProposalId && pagination && (
        <nav id="proposal-list-navigation" aria-label="Paginación de propuestas" className="flex min-w-0 scroll-mt-20 flex-wrap items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-white p-4">
          <p role="status" className="text-sm text-slate-700">
            {loading ? "Actualizando propuestas…" : pagination.total === 0 ? "0 propuestas encontradas" : proposals.length === 0 ? "Actualizando página…" :
              `${(pagination.page - 1) * pagination.limit + 1}–${Math.min(pagination.page * pagination.limit, pagination.total)} de ${pagination.total} ${pagination.total === 1 ? "propuesta" : "propuestas"}`}
            {hasFilters && " · filtros aplicados"}
          </p>
          <div className="flex flex-wrap items-center gap-2">
            <button type="button" disabled={loading || page <= 1} onClick={() => changePage(page - 1)}
              className="min-h-11 rounded-xl border border-slate-200 px-4 text-sm font-semibold disabled:opacity-50">Anterior</button>
            <span className="text-sm text-slate-600">Página {pagination.page} de {Math.max(1, pagination.totalPages)}</span>
            <button type="button" disabled={loading || page >= pagination.totalPages} onClick={() => changePage(page + 1)}
              className="min-h-11 rounded-xl border border-slate-200 px-4 text-sm font-semibold disabled:opacity-50">Siguiente</button>
          </div>
        </nav>
      )}

      {loading && proposalsData === null ? (
        <div className="flex items-center justify-center gap-3 rounded-2xl border border-slate-200 bg-white p-8 text-sm font-semibold text-slate-600 min-w-0">
          <Loader2 className="animate-spin text-slate-400" size={24} />
          Cargando propuestas...
        </div>
      ) : (fetchError && proposalsData === null) || deepLinkedProposalIsMissing ? null : proposals.length === 0 ? (
        <div className="flex h-64 flex-col items-center justify-center gap-3 rounded-2xl border border-dashed border-slate-200 bg-slate-50 px-6 text-center min-w-0">
          <FileText className="text-slate-400" size={48} />
          <p className="text-sm font-medium text-slate-500">
            {!hasFilters
              ? canMutate
                ? "No hay propuestas registradas. Comience definiendo su programa político."
                : "No hay propuestas registradas."
              : "No hay propuestas que coincidan con los filtros."}
          </p>
          {hasFilters && (
            <button type="button" onClick={() => {
              setSearchQuery(""); setDebouncedSearch(""); setStatusFilter("ALL"); setCategoryFilter("ALL"); setPage(1);
            }} className="min-h-11 rounded-xl border border-slate-300 bg-white px-4 text-sm font-semibold text-slate-700">
              Limpiar filtros
            </button>
          )}
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3 min-w-0">
          {proposals.map((proposal) => (
            <article
              key={proposal.id}
              id={`proposal-result-${proposal.id}`}
              onClick={canMutate ? () => openEdit(proposal) : undefined}
              onKeyDown={(event) => handleCardKeyDown(event, proposal)}
              role={canMutate ? "button" : undefined}
              tabIndex={
                canMutate
                  ? 0
                  : proposal.id === deepLinkProposalId
                    ? -1
                    : undefined
              }
              aria-current={
                proposal.id === deepLinkProposalId ? "true" : undefined
              }
              aria-label={
                canMutate ? `Editar propuesta ${proposal.title}` : undefined
              }
              aria-disabled={canMutate && savingStatuses.has(proposal.id) ? true : undefined}
              className={`flex flex-col gap-4 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm outline-none transition-shadow ${
                canMutate
                  ? "cursor-pointer hover:shadow-md focus:outline-none focus:ring-4 focus:ring-blue-100"
                  : ""
              }  ${
                proposal.id === deepLinkProposalId
                  ? "ring-2 ring-blue-500 ring-offset-2"
                  : ""
              }`}
            >
              <div className="flex items-start justify-between gap-3 min-w-0 flex-wrap">
                <span className="rounded-lg bg-slate-100 px-2.5 py-1 text-xs font-bold text-slate-700">
                  {proposal.referenceCode}
                </span>
                <div className="flex items-center gap-2 min-w-0 flex-wrap">
                  <span
                    title={
                      proposal.isPublic
                        ? "Marcada internamente para evaluar su difusión"
                        : "Sin marca interna de difusión"
                    }
                    aria-label={
                      proposal.isPublic
                        ? "Marcada internamente para evaluar su difusión"
                        : "Sin marca interna de difusión"
                    }
                  >
                    {proposal.isPublic ? (
                      <Megaphone size={16} className="text-emerald-600" />
                    ) : (
                      <FileText size={16} className="text-slate-400" />
                    )}
                  </span>
                  {canMutate && (
                    <>
                      <Pencil size={15} className="text-slate-400" />
                      {proposal.status === "DRAFT" && (
                        <button
                          type="button"
                          aria-label={`Eliminar borrador ${proposal.title}`}
                          disabled={savingStatuses.has(proposal.id)}
                          onClick={(event) => {
                            event.stopPropagation();
                            setDeleteTarget(proposal);
                          }}
                          className="inline-flex size-11 shrink-0 items-center justify-center rounded-xl text-slate-600 transition-colors hover:bg-red-50 hover:text-red-700"
                        >
                          <Trash2 size={16} />
                        </button>
                      )}
                    </>
                  )}
                </div>
              </div>

              <div>
                <h2 className="line-clamp-2 font-bold text-slate-900">
                  {proposal.title}
                </h2>
                <p className="mt-1 text-xs font-medium text-slate-500">
                  {CATEGORY_LABELS[proposal.category]}
                </p>
                {proposal.description && (
                  <p className="mt-3 line-clamp-3 text-sm leading-6 text-slate-600">
                    {proposal.description}
                  </p>
                )}
              </div>

              <div className="mt-auto space-y-3 min-w-0">
                <div className="flex flex-wrap items-center justify-between gap-2 text-xs min-w-0">
                  <span
                    className={`rounded-full px-2.5 py-1 font-bold ${statusTone(proposal.status)}`}
                  >
                    {STATUS_LABELS[proposal.status]}
                  </span>
                  <span className="font-medium text-slate-500">
                    {proposal.owner.name}
                  </span>
                </div>

                {proposal.estimatedCost !== null && (
                  <p className="text-xs text-slate-500">
                    Costo estimado:{" "}
                    <span className="font-bold text-slate-700">
                      {COST_FORMATTER.format(proposal.estimatedCost)}
                    </span>
                  </p>
                )}

                <div className="space-y-1 min-w-0">
                  <div className="flex justify-between text-xs font-medium text-slate-600 min-w-0 flex-wrap gap-3">
                    <span>Progreso</span>
                    <span>{proposal.progressPercent}%</span>
                  </div>
                  <div className="h-2 w-full overflow-hidden rounded-full bg-slate-100 min-w-0">
                    <div
                      className="h-full rounded-full bg-blue-600 min-w-0"
                      style={{
                        width: `${Math.min(
                          100,
                          Math.max(0, proposal.progressPercent),
                        )}%`,
                      }}
                    />
                  </div>
                </div>

                <div className="mt-4 border-t border-slate-100 pt-3 min-w-0" onClick={(event) => event.stopPropagation()}>
                  <label htmlFor={`proposal-status-${proposal.id}`} className="block text-sm font-semibold text-slate-700 mb-1 min-w-0">
                    Cambiar estado <span className="sr-only">de {proposal.title}</span>
                  </label>
                  <select
                    id={`proposal-status-${proposal.id}`}
                    value=""
                    onChange={(e) => {
                      const newStatus = e.target.value as ProposalStatus;
                      if (!newStatus) return;
                      void handleStatusChange(proposal, newStatus);
                    }}
                    disabled={!canMutate || savingStatuses.has(proposal.id) || allowedProposalStatuses(proposal.status).length < 2}
                    className="min-h-11 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm font-semibold outline-none focus:border-blue-500 disabled:opacity-50 min-w-0 max-w-full"
                  >
                    <option value="">{savingStatuses.has(proposal.id) ? "Guardando estado..." : allowedProposalStatuses(proposal.status).length < 2 ? "Estado final" : "Seleccionar estado..."}</option>
                    {allowedProposalStatuses(proposal.status).filter((st) => st !== proposal.status).map((st) => (
                      <option key={st} value={st}>
                        {STATUS_LABELS[st]}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            </article>
          ))}
        </div>
      )}

      {!deepLinkProposalId && pagination && pagination.totalPages > 1 && proposals.length > 0 && (
        <nav aria-label="Cambiar página al final de propuestas" className="flex min-w-0 flex-wrap items-center justify-center gap-3 rounded-2xl border border-slate-200 bg-white p-4">
          <button type="button" disabled={loading || page <= 1} onClick={() => changePage(page - 1)}
            className="min-h-11 rounded-xl border border-slate-200 px-4 text-sm font-semibold disabled:opacity-50">Anterior</button>
          <span className="text-sm text-slate-600">Página {pagination.page} de {pagination.totalPages}</span>
          <button type="button" disabled={loading || page >= pagination.totalPages} onClick={() => changePage(page + 1)}
            className="min-h-11 rounded-xl border border-slate-200 px-4 text-sm font-semibold disabled:opacity-50">Siguiente</button>
        </nav>
      )}

      {dialogProposal && canMutate && (
        <div className="fixed inset-0 flex items-center justify-center bg-slate-950/60 p-4 backdrop-blur-sm min-w-0 z-[150] overflow-y-auto flex-wrap">
          <section
            ref={proposalDialogRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby="proposal-dialog-title"
            className="flex max-h-[calc(100dvh-2rem)] w-full max-w-2xl flex-col overflow-hidden rounded-3xl bg-white shadow-2xl min-w-0"
          >
            <header className="grid shrink-0 grid-cols-[minmax(0,1fr)_auto] items-start gap-3 border-b border-slate-100 bg-white px-4 py-4 sm:px-6 min-w-0">
              <div className="min-w-0 break-words">
                <h2
                  ref={proposalDialogTitleRef}
                  tabIndex={-1}
                  id="proposal-dialog-title"
                  className="text-xl font-semibold text-slate-950"
                >
                  {dialogProposal === "new"
                    ? "Nueva propuesta"
                    : "Editar propuesta"}
                </h2>
                <p className="mt-1 text-xs text-slate-500">
                  Creador:{" "}
                  {dialogProposal === "new"
                    ? user.name
                    : dialogProposal.owner.name}
                </p>
              </div>
              <button
                type="button"
                aria-label="Cerrar"
                disabled={submitting}
                onClick={() => setDialogProposal(null)}
                className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-slate-600 hover:bg-slate-100"
              >
                <X size={21} />
              </button>
            </header>
            <form onSubmit={submitForm} className="flex min-h-0 min-w-0 flex-col">
              <div className="min-h-0 overflow-y-auto overscroll-contain space-y-5 px-4 py-5 sm:px-6">
              {mutationError && (
                <div role="alert" className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm font-bold text-red-900 min-w-0">
                  {mutationError}
                </div>
              )}
              {committedContentLocked && (
                <p className="rounded-2xl border border-blue-200 bg-blue-50 p-4 text-sm font-semibold leading-6 text-blue-950">
                  {terminalProposal
                    ? "Esta propuesta está finalizada. Se conservan su contenido, responsable y progreso."
                    : "El texto, categoría, fuente y costo comprometidos quedan bloqueados al salir de borrador. Para corregirlos, retire esta propuesta y registre una nueva versión trazable."}
                </p>
              )}
              <label className="block text-sm font-semibold text-slate-800 min-w-0">
                Título
                <input
                  required
                  maxLength={200}
                  disabled={committedContentLocked}
                  value={form.title}
                  onChange={(event) =>
                    setForm({ ...form, title: event.target.value })
                  }
                  className="mt-2 min-h-12 w-full rounded-2xl border border-slate-200 px-4 font-normal outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-100 disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-500 min-w-0 max-w-full"
                />
              </label>
              <label className="block text-sm font-semibold text-slate-800 min-w-0">
                Descripción (opcional)
                <textarea
                  rows={3}
                  maxLength={2000}
                  disabled={committedContentLocked}
                  value={form.description}
                  onChange={(event) =>
                    setForm({ ...form, description: event.target.value })
                  }
                  className="mt-2 w-full rounded-2xl border border-slate-200 px-4 py-3 font-normal outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-100 disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-500 min-w-0 max-w-full"
                />
              </label>
              <div className="grid gap-4 sm:grid-cols-2 min-w-0">
                <label className="block text-sm font-semibold text-slate-800 min-w-0">
                  Responsable
                  <div className="mt-2 min-w-0">
                    <UserCombobox
                      ariaLabel="Responsable de la propuesta"
                      value={form.ownerId}
                      allowUnassigned={false}
                      paginated
                      disabled={submitting || terminalProposal}
                      selectedLabel={form.ownerId === user.id ? user.name : form.ownerId === editedProposal?.ownerId ? editedProposal.owner.name : undefined}
                      onChange={(val) => setForm({ ...form, ownerId: val })}
                      fetchItems={searchProposalResponsibles}
                    />
                  </div>
                </label>

                <label className="block text-sm font-semibold text-slate-800 min-w-0">
                  Categoría
                  <select
                    value={form.category}
                    disabled={committedContentLocked}
                    onChange={(event) =>
                      setForm({
                        ...form,
                        category: event.target.value as ProposalCategory,
                      })
                    }
                    className="mt-2 min-h-12 w-full rounded-2xl border border-slate-200 bg-white px-4 font-normal outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-100 disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-500 min-w-0 max-w-full"
                  >
                    {PROPOSAL_CATEGORIES.map((category) => (
                      <option key={category} value={category}>
                        {CATEGORY_LABELS[category]}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="block text-sm font-semibold text-slate-800 min-w-0">
                  Estado
                  <select
                    value={form.status}
                    onChange={(event) => changeFormStatus(event.target.value as ProposalStatus)}
                    className="mt-2 min-h-12 w-full rounded-2xl border border-slate-200 bg-white px-4 font-normal outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-100 min-w-0 max-w-full"
                  >
                    {(dialogProposal === "new"
                      ? (["DRAFT"] as const)
                      : allowedProposalStatuses(dialogProposal.status)
                    ).map((status) => (
                      <option key={status} value={status}>
                        {STATUS_LABELS[status]}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="block text-sm font-semibold text-slate-800 min-w-0">
                  Progreso (%)
                  <input
                    required
                    type="number"
                    min="0"
                    max="100"
                    step="1"
                    disabled={progressInputLocked}
                    value={form.progressPercent}
                    onChange={(event) =>
                      setForm({
                        ...form,
                        progressPercent: event.target.value,
                      })
                    }
                    className="mt-2 min-h-12 w-full rounded-2xl border border-slate-200 px-4 font-normal outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-100 disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-500 min-w-0 max-w-full"
                  />
                </label>
                <label className="block text-sm font-semibold text-slate-800 min-w-0">
                  Costo estimado (opcional)
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    disabled={committedContentLocked}
                    value={form.estimatedCost}
                    onChange={(event) =>
                      setForm({ ...form, estimatedCost: event.target.value })
                    }
                    className="mt-2 min-h-12 w-full rounded-2xl border border-slate-200 px-4 font-normal outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-100 disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-500 min-w-0 max-w-full"
                  />
                </label>
              </div>
              {form.status === "COMPLETED" && editedProposal?.status !== "COMPLETED" && (
                <div className="space-y-3 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-950">
                  <p>Completar registra el progreso en 100 %. Este estado es final: después no podrás cambiar el contenido, responsable ni progreso.</p>
                  <label className="flex items-start gap-3 font-semibold">
                    <input type="checkbox" required checked={completionConfirmed}
                      onChange={(event) => setCompletionConfirmed(event.target.checked)}
                      className="mt-0.5 h-5 w-5 shrink-0 rounded border-amber-400" />
                    Confirmo que la propuesta alcanzó el 100 % y puede darse por completada.
                  </label>
                </div>
              )}
              <label className="flex cursor-pointer items-start gap-3 text-sm font-semibold text-slate-800 min-w-0">
                <input
                  type="checkbox"
                  checked={form.internalDistributionFlag}
                  onChange={(event) =>
                    setForm({
                      ...form,
                      internalDistributionFlag: event.target.checked,
                    })
                  }
                  className="mt-0.5 h-5 w-5 rounded border-slate-300 text-blue-600 focus:ring-blue-600 min-w-0 max-w-full"
                />
                <span>
                  Marcar para evaluación interna de difusión
                  <span className="mt-1 block text-xs font-medium leading-5 text-slate-500">
                    Es una clasificación interna. No publica la propuesta en
                    internet ni cambia sus permisos de acceso.
                  </span>
                </span>
              </label>
              </div>
              <footer className="flex shrink-0 flex-wrap justify-end gap-3 border-t border-slate-100 bg-white px-4 py-4 sm:px-6 min-w-0">
                <button
                  type="button"
                  disabled={submitting}
                  onClick={() => setDialogProposal(null)}
                  className="rounded-xl px-5 py-3 text-sm font-bold text-slate-600 hover:bg-slate-100 max-w-full whitespace-normal"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="inline-flex min-h-12 items-center justify-center gap-2 rounded-xl bg-blue-700 px-6 text-sm font-semibold text-white hover:bg-blue-800 disabled:opacity-50 max-w-full whitespace-normal"
                >
                  {submitting && <Loader2 className="animate-spin" size={18} />}
                  Guardar
                </button>
              </footer>
            </form>
          </section>
        </div>
      )}

      {deleteTarget && canMutate && (
        <div className="fixed inset-0 flex items-center justify-center bg-slate-950/60 p-4 backdrop-blur-sm min-w-0 z-[150] overflow-y-auto flex-wrap">
          <div
            ref={deleteDialogRef}
            tabIndex={-1}
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="delete-proposal-title"
            className="w-full max-w-sm rounded-2xl bg-white p-6 shadow-2xl min-w-0"
          >
            <h2
              ref={deleteDialogTitleRef}
              tabIndex={-1}
              id="delete-proposal-title"
              className="text-lg font-semibold text-slate-900"
            >
              ¿Eliminar propuesta?
            </h2>
            <p className="mt-2 text-sm text-slate-500">
              Se eliminará “{deleteTarget.title}”. Esta acción no se puede
              deshacer.
            </p>
            <div className="mt-6 flex justify-end gap-3 min-w-0 flex-wrap">
              <button
                type="button"
                disabled={deleting}
                onClick={() => setDeleteTarget(null)}
                className="rounded-xl px-4 py-2 text-sm font-bold text-slate-600 hover:bg-slate-100 max-w-full whitespace-normal"
              >
                Cancelar
              </button>
              <button
                type="button"
                disabled={deleting}
                onClick={() => void confirmDelete()}
                className="rounded-xl bg-red-600 px-4 py-2 text-sm font-bold text-white hover:bg-red-700 max-w-full whitespace-normal"
              >
                {deleting ? "Eliminando…" : "Eliminar"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
