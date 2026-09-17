"use client";

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
import { readEntityDeepLink } from "@/lib/entity-deep-links";
import {
  allowedProposalStatuses,
  createProposal,
  deleteProposal,
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
import { listProposalResponsibles } from "@/lib/proposals-api";
import { UserCombobox } from "@/components/ui/UserCombobox";

const PROPOSAL_MANAGER_ROLES = new Set<BackendUserRole>([
  "ADMIN",
  "CAMPAIGN_MANAGER",
]);

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
  const { user } = useAuth();
  const canMutate =
    user !== null && PROPOSAL_MANAGER_ROLES.has(user.backendRole);
  const [proposals, setProposals] = useState<PoliticalProposal[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<ProposalStatus | "ALL">(
    "ALL",
  );
  const [searchQuery, setSearchQuery] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(searchQuery), 400);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  const [categoryFilter, setCategoryFilter] = useState<
    ProposalCategory | "ALL"
  >("ALL");
  const [searchQuery, setSearchQuery] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(searchQuery), 400);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  const [dialogProposal, setDialogProposal] = useState<
    PoliticalProposal | "new" | null
  >(null);
  const [form, setForm] = useState<ProposalForm>(EMPTY_FORM);
  const [submitting, setSubmitting] = useState(false);
  const [mutationError, setMutationError] = useState<string | null>(null);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [deepLinkProposalId, setDeepLinkProposalId] = useState<string | null>(
    null,
  );
  const [deleteTarget, setDeleteTarget] = useState<PoliticalProposal | null>(
    null,
  );
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
    onClose: () => setDeleteTarget(null),
    closeOnEscape: false,
  });

  const loadProposals = useCallback(async (signal?: AbortSignal) => {
    setLoading(true);
    setFetchError(null);
    try {
      const response = await listProposals(signal);
      setProposals(response.items);
    } catch (error: unknown) {
      if (error instanceof DOMException && error.name === "AbortError") return;
      setFetchError(
        errorMessage(
          error,
          "No se pudieron cargar las propuestas. Intente de nuevo.",
        ),
      );
      setProposals([]);
    } finally {
      if (!signal?.aborted) setLoading(false);
    }
  }, []);

  useEffect(() => {
    setDeepLinkProposalId(readEntityDeepLink(window.location.search));
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    void loadProposals(controller.signal);
    return () => controller.abort();
  }, [loadProposals]);

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
    setForm({ ...EMPTY_FORM });
    setMutationError(null);
    setDialogProposal("new");
  };

  const openEdit = (proposal: PoliticalProposal) => {
    if (!canMutate) return;
    setForm({
      title: proposal.title,
      description: proposal.description,
      category: proposal.category,
      status: proposal.status,
      progressPercent: String(proposal.progressPercent),
      estimatedCost:
        proposal.estimatedCost === null ? "" : String(proposal.estimatedCost),
      internalDistributionFlag: proposal.isPublic,
      ownerId: proposal.ownerId,
    });
    setMutationError(null);
    setDialogProposal(proposal);
  };

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

  const confirmDelete = async () => {
    if (!deleteTarget || !canMutate) return;
    try {
      await deleteProposal(deleteTarget.id);
      setDeleteTarget(null);
      await loadProposals();
    } catch (error: unknown) {
      setFetchError(errorMessage(error, "No se pudo eliminar la propuesta."));
      setDeleteTarget(null);
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
      ownerId: form.ownerId || undefined,
    };

    setSubmitting(true);
    setMutationError(null);
    try {
      if (dialogProposal === "new") {
        await createProposal(payload);
      } else {
        await updateProposal(dialogProposal.id, payload);
      }
      setDialogProposal(null);
      await loadProposals();
    } catch (error: unknown) {
      setMutationError(errorMessage(error, "No se pudo guardar la propuesta."));
    } finally {
      setSubmitting(false);
    }
  };

  const filteredProposals = useMemo(
    () =>
      proposals.filter((proposal) => {
        if (debouncedSearch && !proposal.title.toLowerCase().includes(debouncedSearch.toLowerCase())) return false;
        if (statusFilter !== "ALL" && proposal.status !== statusFilter) {
          return false;
        }
        return categoryFilter === "ALL" || proposal.category === categoryFilter;
      }),
    [categoryFilter, proposals, statusFilter, debouncedSearch],
  );

  const statusCounts = useMemo(() => {
    const counts: Record<ProposalStatus | "ALL", number> = {
      ALL: proposals.length,
      DRAFT: 0,
      PROPOSED: 0,
      IN_PROGRESS: 0,
      COMPLETED: 0,
      WITHDRAWN: 0,
    };
    proposals.forEach((proposal) => {
      counts[proposal.status] += 1;
    });
    return counts;
  }, [proposals]);

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
  const progressInputLocked =
    dialogProposal === "new" ||
    form.status === "DRAFT" ||
    form.status === "PROPOSED" ||
    editedProposal?.status === "COMPLETED" ||
    editedProposal?.status === "WITHDRAWN";

  return (
    <div className="mx-auto max-w-7xl space-y-7 p-6">
      <header className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <h1 className="text-3xl font-black tracking-tight text-slate-900 sm:text-4xl">
            Programa político
          </h1>
          <p className="mt-2 text-sm leading-6 text-slate-600">
            Gestión y seguimiento de propuestas y compromisos.
          </p>
          {!canMutate && user && (
            <p className="mt-3 inline-flex rounded-full bg-slate-100 px-3 py-1 text-xs font-bold text-slate-600">
              Acceso de consulta
            </p>
          )}
          {fetchError && (
            <div className="mt-3 flex items-center gap-3 rounded-2xl border border-red-200 bg-red-50 p-5 text-sm font-semibold text-red-900">
              <AlertCircle size={20} />
              {fetchError}
            </div>
          )}
        </div>
        <div className="flex flex-col gap-3 sm:flex-row">
          <button
            type="button"
            onClick={() => void loadProposals()}
            disabled={loading}
            className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50"
          >
            <RefreshCw className={loading ? "animate-spin" : ""} size={16} />
            Actualizar
          </button>
          {canMutate && (
            <button
              type="button"
              onClick={openCreate}
              className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-blue-700 px-4 text-sm font-semibold text-white hover:bg-blue-800"
            >
              <Plus size={16} /> Nueva propuesta
            </button>
          )}
        </div>
      </header>

      {deepLinkedProposalIsMissing && (
        <p
          role="alert"
          className="rounded-2xl border border-amber-200 bg-amber-50 p-5 text-sm font-bold text-amber-900"
        >
          La propuesta buscada ya no está disponible o queda fuera de tu alcance
          autorizado.
        </p>
      )}

      <div className="flex flex-col gap-4 border-b border-slate-200 pb-4 lg:flex-row lg:items-center lg:justify-between">

        <div className="flex-1 max-w-sm">
          <input
            type="search"
            placeholder="Buscar propuestas..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
          />
        </div>

        <div className="flex gap-4 overflow-x-auto pb-1">
          {(["ALL", ...PROPOSAL_STATUSES] as const).map((status) => (
            <button
              type="button"
              key={status}
              onClick={() => setStatusFilter(status)}
              className={`-mb-[17px] whitespace-nowrap pb-4 text-sm font-semibold transition-colors ${
                statusFilter === status
                  ? "border-b-2 border-blue-700 text-blue-700"
                  : "text-slate-500 hover:text-slate-700"
              }`}
            >
              {status === "ALL" ? "Todas" : STATUS_LABELS[status]}
              <span className="ml-2 rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-600">
                {statusCounts[status]}
              </span>
            </button>
          ))}
        </div>
        <select
          aria-label="Filtrar por categoría"
          value={categoryFilter}
          onChange={(event) =>
            setCategoryFilter(event.target.value as ProposalCategory | "ALL")
          }
          className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
        >
          <option value="ALL">Todas las categorías</option>
          {PROPOSAL_CATEGORIES.map((category) => (
            <option key={category} value={category}>
              {CATEGORY_LABELS[category]}
            </option>
          ))}
        </select>
      </div>

      {loading ? (
        <div className="flex items-center justify-center gap-3 rounded-2xl border border-slate-200 bg-white p-8 text-sm font-semibold text-slate-600">
          <Loader2 className="animate-spin text-slate-400" size={24} />
          Cargando propuestas...
        </div>
      ) : filteredProposals.length === 0 ? (
        <div className="flex h-64 flex-col items-center justify-center gap-3 rounded-2xl border border-dashed border-slate-200 bg-slate-50 px-6 text-center">
          <FileText className="text-slate-400" size={48} />
          <p className="text-sm font-medium text-slate-500">
            {proposals.length === 0
              ? canMutate
                ? "No hay propuestas registradas. Comience definiendo su programa político."
                : "No hay propuestas registradas."
              : "No hay propuestas que coincidan con los filtros."}
          </p>
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {filteredProposals.map((proposal) => (
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
              className={`flex flex-col gap-4 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm outline-none transition-shadow ${
                canMutate
                  ? "cursor-pointer hover:shadow-md focus:outline-none focus:ring-4 focus:ring-blue-100"
                  : ""
              } ${
                proposal.id === deepLinkProposalId
                  ? "ring-2 ring-blue-500 ring-offset-2"
                  : ""
              }`}
            >
              <div className="flex items-start justify-between gap-3">
                <span className="rounded-lg bg-slate-100 px-2.5 py-1 text-xs font-bold text-slate-700">
                  {proposal.referenceCode}
                </span>
                <div className="flex items-center gap-2">
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
                          onClick={(event) => {
                            event.stopPropagation();
                            setDeleteTarget(proposal);
                          }}
                          className="rounded-md p-1 text-slate-400 transition-colors hover:bg-red-50 hover:text-red-600"
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

              <div className="mt-auto space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
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

                <div className="space-y-1">
                  <div className="flex justify-between text-xs font-medium text-slate-600">
                    <span>Progreso</span>
                    <span>{proposal.progressPercent}%</span>
                  </div>
                  <div className="h-2 w-full overflow-hidden rounded-full bg-slate-100">
                    <div
                      className="h-full rounded-full bg-blue-600"
                      style={{
                        width: `${Math.min(
                          100,
                          Math.max(0, proposal.progressPercent),
                        )}%`,
                      }}
                    />
                  </div>
                </div>

                <div className="mt-4 border-t border-slate-100 pt-3">
                  <label className="block text-xs font-black text-slate-700 mb-1">
                    Cambiar estado rápido
                  </label>
                  <select
                    value=""
                    onChange={(e) => {
                      const newStatus = e.target.value as ProposalStatus;
                      if (!newStatus) return;
                      // Optimistic update
                      setProposals(prev => prev.map(p => p.id === proposal.id ? { ...p, status: newStatus } : p));
                      updateProposal(proposal.id, { status: newStatus }).catch(() => {
                         // Revert
                         void loadProposals();
                      });
                    }}
                    disabled={!canMutate}
                    className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs font-semibold outline-none focus:border-blue-500 disabled:opacity-50"
                  >
                    <option value="">Seleccionar transición...</option>
                    {allowedProposalStatuses(proposal.status).map((st) => (
                      <option key={st} value={st}>{STATUS_LABELS[st]}</option>
                    ))}
                  </select>
                </div>

              </div>
            </article>
          ))}
        </div>
      )}

      {dialogProposal && canMutate && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-4 backdrop-blur-sm">
          <section
            ref={proposalDialogRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby="proposal-dialog-title"
            className="max-h-[92vh] w-full max-w-2xl overflow-y-auto rounded-3xl bg-white shadow-2xl"
          >
            <header className="sticky top-0 z-10 flex items-center justify-between border-b border-slate-100 bg-white px-6 py-5">
              <div>
                <h2
                  ref={proposalDialogTitleRef}
                  tabIndex={-1}
                  id="proposal-dialog-title"
                  className="text-xl font-black text-slate-950"
                >
                  {dialogProposal === "new"
                    ? "Nueva propuesta"
                    : "Editar propuesta"}
                </h2>
                <p className="mt-1 text-xs text-slate-500">
                  Creador: {dialogProposal === "new" ? user.name : dialogProposal.owner.name}
                </p>
              </div>
              <button
                type="button"
                aria-label="Cerrar"
                onClick={() => setDialogProposal(null)}
                className="rounded-full p-2 text-slate-500 hover:bg-slate-100"
              >
                <X size={21} />
              </button>
            </header>
            <form onSubmit={submitForm} className="space-y-5 p-6">
              {mutationError && (
                <div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm font-bold text-red-900">
                  {mutationError}
                </div>
              )}
              {committedContentLocked && (
                <p className="rounded-2xl border border-blue-200 bg-blue-50 p-4 text-sm font-semibold leading-6 text-blue-950">
                  El texto, categoría, fuente y costo comprometidos quedan
                  bloqueados al salir de borrador. Para corregirlos, retire esta
                  propuesta y registre una nueva versión trazable.
                </p>
              )}
              <label className="block text-sm font-black text-slate-800">
                Título
                <input
                  required
                  maxLength={200}
                  disabled={committedContentLocked}
                  value={form.title}
                  onChange={(event) =>
                    setForm({ ...form, title: event.target.value })
                  }
                  className="mt-2 min-h-12 w-full rounded-2xl border border-slate-200 px-4 font-normal outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-100 disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-500"
                />
              </label>
              <label className="block text-sm font-black text-slate-800">
                Descripción (opcional)
                <textarea
                  rows={3}
                  maxLength={2000}
                  disabled={committedContentLocked}
                  value={form.description}
                  onChange={(event) =>
                    setForm({ ...form, description: event.target.value })
                  }
                  className="mt-2 w-full rounded-2xl border border-slate-200 px-4 py-3 font-normal outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-100 disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-500"
                />
              </label>
              <div className="grid gap-4 sm:grid-cols-2">

                <label className="block text-sm font-black text-slate-800">
                  Responsable
                  <div className="mt-2">
                    <UserCombobox
                      value={form.ownerId}
                      onChange={(val) => setForm({ ...form, ownerId: val })}
                      fetchItems={(search, signal) => listProposalResponsibles({ search, limit: 10 }, signal)}
                    />
                  </div>
                </label>

                <label className="block text-sm font-black text-slate-800">
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
                    className="mt-2 min-h-12 w-full rounded-2xl border border-slate-200 bg-white px-4 font-normal outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-100 disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-500"
                  >
                    {PROPOSAL_CATEGORIES.map((category) => (
                      <option key={category} value={category}>
                        {CATEGORY_LABELS[category]}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="block text-sm font-black text-slate-800">
                  Estado
                  <select
                    value={form.status}
                    onChange={(event) => {
                      const status = event.target.value as ProposalStatus;
                      setForm({
                        ...form,
                        status,
                        progressPercent:
                          status === "DRAFT" || status === "PROPOSED"
                            ? "0"
                            : status === "COMPLETED"
                              ? "100"
                              : form.progressPercent,
                      });
                    }}
                    className="mt-2 min-h-12 w-full rounded-2xl border border-slate-200 bg-white px-4 font-normal outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-100"
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
                <label className="block text-sm font-black text-slate-800">
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
                    className="mt-2 min-h-12 w-full rounded-2xl border border-slate-200 px-4 font-normal outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-100 disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-500"
                  />
                </label>
                <label className="block text-sm font-black text-slate-800">
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
                    className="mt-2 min-h-12 w-full rounded-2xl border border-slate-200 px-4 font-normal outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-100 disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-500"
                  />
                </label>
              </div>
              <label className="flex cursor-pointer items-start gap-3 text-sm font-black text-slate-800">
                <input
                  type="checkbox"
                  checked={form.internalDistributionFlag}
                  onChange={(event) =>
                    setForm({
                      ...form,
                      internalDistributionFlag: event.target.checked,
                    })
                  }
                  className="mt-0.5 h-5 w-5 rounded border-slate-300 text-blue-600 focus:ring-blue-600"
                />
                <span>
                  Marcar para evaluación interna de difusión
                  <span className="mt-1 block text-xs font-medium leading-5 text-slate-500">
                    Es una clasificación interna. No publica la propuesta en
                    internet ni cambia sus permisos de acceso.
                  </span>
                </span>
              </label>

              <footer className="mt-8 flex justify-end gap-3 border-t border-slate-100 pt-4">
                <button
                  type="button"
                  onClick={() => setDialogProposal(null)}
                  className="rounded-xl px-5 py-3 text-sm font-bold text-slate-600 hover:bg-slate-100"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="inline-flex min-h-12 items-center justify-center gap-2 rounded-xl bg-blue-700 px-6 text-sm font-black text-white hover:bg-blue-800 disabled:opacity-50"
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
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-950/60 p-4 backdrop-blur-sm">
          <div
            ref={deleteDialogRef}
            tabIndex={-1}
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="delete-proposal-title"
            className="w-full max-w-sm rounded-2xl bg-white p-6 shadow-2xl"
          >
            <h2
              ref={deleteDialogTitleRef}
              tabIndex={-1}
              id="delete-proposal-title"
              className="text-lg font-black text-slate-900"
            >
              ¿Eliminar propuesta?
            </h2>
            <p className="mt-2 text-sm text-slate-500">
              Se eliminará “{deleteTarget.title}”. Esta acción no se puede
              deshacer.
            </p>
            <div className="mt-6 flex justify-end gap-3">
              <button
                type="button"
                onClick={() => setDeleteTarget(null)}
                className="rounded-xl px-4 py-2 text-sm font-bold text-slate-600 hover:bg-slate-100"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={() => void confirmDelete()}
                className="rounded-xl bg-red-600 px-4 py-2 text-sm font-bold text-white hover:bg-red-700"
              >
                Eliminar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
