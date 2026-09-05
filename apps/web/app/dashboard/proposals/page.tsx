"use client";

import { useEffect, useState } from "react";
import {
  FileText,
  Search,
  Plus,
  RefreshCw,
  Lock,
  Globe,
  Loader2,
  Trash2,
  Pencil,
  X
} from "lucide-react";
import { apiRequest } from "@/lib/api-client";

type ProposalStatus = "DRAFT" | "PUBLISHED" | "ARCHIVED";

type Proposal = {
  id: string;
  referenceCode: string;
  title: string;
  description?: string;
  category: string;
  estimatedCost?: number;
  status: ProposalStatus;
  progressPercent: number;
  isPublic: boolean;
  ownerName: string;
};

const CATEGORIES = [
  "INFRASTRUCTURE",
  "EDUCATION",
  "HEALTH",
  "SECURITY",
  "ENVIRONMENT",
  "ECONOMY",
  "SOCIAL",
  "CULTURE",
  "GOVERNANCE",
  "OTHER"
];

const EMPTY_FORM = {
  title: "",
  description: "",
  category: "OTHER",
  estimatedCost: "",
  isPublic: false
};

export default function ProposalsPage() {
  const [proposals, setProposals] = useState<Proposal[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<ProposalStatus | "ALL">("ALL");
  const [categoryFilter, setCategoryFilter] = useState<string>("ALL");
  const [dialogProposal, setDialogProposal] = useState<Proposal | "new" | null>(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [submitting, setSubmitting] = useState(false);
  const [mutationError, setMutationError] = useState<string | null>(null);

  const loadProposals = async () => {
    setLoading(true);
    try {
      const res = await apiRequest<{ items: Proposal[] }>("/proposals");
      setProposals(res.items || []);
    } catch (error) {
      console.error(error);
      setProposals([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadProposals();
  }, []);

  const openCreate = () => {
    setForm(EMPTY_FORM);
    setMutationError(null);
    setDialogProposal("new");
  };

  const openEdit = (p: Proposal) => {
    setForm({
      title: p.title,
      description: p.description || "",
      category: p.category || "OTHER",
      estimatedCost: p.estimatedCost ? String(p.estimatedCost) : "",
      isPublic: p.isPublic
    });
    setMutationError(null);
    setDialogProposal(p);
  };

  const handleDelete = async (id: string) => {
    if (!window.confirm("¿Seguro que deseas eliminar esta propuesta?")) return;
    try {
      await apiRequest(`/proposals/${id}`, { method: "DELETE" });
      loadProposals();
    } catch (error: any) {
      alert(error.message || "Error al eliminar");
    }
  };

  const submitForm = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!dialogProposal) return;
    setSubmitting(true);
    setMutationError(null);
    try {
      const payload = {
        title: form.title,
        description: form.description || undefined,
        category: form.category,
        estimatedCost: form.estimatedCost ? Number(form.estimatedCost) : undefined,
        isPublic: form.isPublic
      };

      if (dialogProposal === "new") {
        await apiRequest("/proposals", { method: "POST", body: JSON.stringify(payload) });
      } else {
        await apiRequest(`/proposals/${dialogProposal.id}`, { method: "PATCH", body: JSON.stringify(payload) });
      }
      setDialogProposal(null);
      loadProposals();
    } catch (error: any) {
      setMutationError(error.message || "Error al guardar la propuesta");
    } finally {
      setSubmitting(false);
    }
  };

  const filteredProposals = proposals.filter((p) => {
    if (statusFilter !== "ALL" && p.status !== statusFilter) return false;
    if (categoryFilter !== "ALL" && p.category !== categoryFilter) return false;
    return true;
  });

  const categories = Array.from(new Set(proposals.map(p => p.category)));

  const statusCounts = {
    ALL: proposals.length,
    DRAFT: proposals.filter(p => p.status === "DRAFT").length,
    PUBLISHED: proposals.filter(p => p.status === "PUBLISHED").length,
    ARCHIVED: proposals.filter(p => p.status === "ARCHIVED").length,
  };

  return (
    <div className="mx-auto max-w-7xl space-y-7 p-6">
      <header className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <h1 className="text-3xl font-black tracking-tight text-slate-950 sm:text-4xl">
            Programa político
          </h1>
          <p className="mt-2 text-sm leading-6 text-slate-600">
            Gestión y seguimiento de propuestas y compromisos.
          </p>
        </div>
        <div className="flex flex-col gap-3 sm:flex-row">
          <button
            onClick={loadProposals}
            disabled={loading}
            className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50"
          >
            <RefreshCw className={loading ? "animate-spin" : ""} size={16} />
            Actualizar
          </button>
          <button onClick={openCreate} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-blue-700 px-4 text-sm font-semibold text-white hover:bg-blue-800">
            <Plus size={16} /> Nueva Propuesta
          </button>
        </div>
      </header>

      {/* Filters */}
      <div className="flex flex-col gap-4 border-b border-slate-200 pb-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex gap-4">
          {(["ALL", "DRAFT", "PUBLISHED", "ARCHIVED"] as const).map((status) => (
            <button
              key={status}
              onClick={() => setStatusFilter(status)}
              className={`pb-4 -mb-[17px] text-sm font-semibold transition-colors ${
                statusFilter === status
                  ? "border-b-2 border-blue-700 text-blue-700"
                  : "text-slate-500 hover:text-slate-700"
              }`}
            >
              {status === "ALL" ? "Todas" : status === "DRAFT" ? "Borradores" : status === "PUBLISHED" ? "Publicadas" : "Archivadas"}
              <span className="ml-2 rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-600">
                {statusCounts[status]}
              </span>
            </button>
          ))}
        </div>
        <div>
          <select
            value={categoryFilter}
            onChange={(e) => setCategoryFilter(e.target.value)}
            className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
          >
            <option value="ALL">Todas las categorías</option>
            {categories.map(c => (
              <option key={c} value={c}>{c}</option>
            ))}
          </select>
        </div>
      </div>

      {loading ? (
        <div className="flex h-64 flex-col items-center justify-center gap-3 rounded-2xl border border-slate-200 border-dashed">
          <Loader2 className="animate-spin text-blue-600" size={32} />
          <p className="text-sm font-medium text-slate-500">Cargando propuestas...</p>
        </div>
      ) : filteredProposals.length === 0 ? (
        <div className="flex h-64 flex-col items-center justify-center gap-3 rounded-2xl border border-slate-200 border-dashed bg-slate-50">
          <FileText className="text-slate-400" size={48} />
          <p className="text-sm font-medium text-slate-500">
            No hay propuestas registradas. Comience definiendo su programa político.
          </p>
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {filteredProposals.map((proposal) => (
            <div key={proposal.id} onClick={() => openEdit(proposal)} className="cursor-pointer flex flex-col gap-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm transition-shadow hover:shadow-md">
              <div className="flex items-start justify-between">
                <span className="rounded-lg bg-slate-100 px-2.5 py-1 text-xs font-bold text-slate-700">
                  {proposal.referenceCode}
                </span>
                <div className="flex items-center gap-3">
                  {proposal.isPublic ? (
                    <Globe size={16} className="text-emerald-600" />
                  ) : (
                    <Lock size={16} className="text-slate-400" />
                  )}
                  <button 
                    onClick={(e) => { e.stopPropagation(); handleDelete(proposal.id); }} 
                    className="p-1 rounded-md text-slate-400 hover:bg-red-50 hover:text-red-600 transition-colors"
                  >
                    <Trash2 size={16} />
                  </button>
                </div>
              </div>
              
              <div>
                <h3 className="font-bold text-slate-900 line-clamp-2">{proposal.title}</h3>
                <p className="mt-1 text-xs font-medium text-slate-500">{proposal.category}</p>
              </div>

              <div className="mt-auto space-y-3">
                <div className="flex items-center justify-between text-xs">
                  <span className={`font-semibold ${
                    proposal.status === "PUBLISHED" ? "text-emerald-700" :
                    proposal.status === "DRAFT" ? "text-amber-700" : "text-slate-500"
                  }`}>
                    {proposal.status === "PUBLISHED" ? "Publicada" :
                     proposal.status === "DRAFT" ? "Borrador" : "Archivada"}
                  </span>
                  <span className="font-medium text-slate-500">{proposal.ownerName}</span>
                </div>
                
                <div className="space-y-1">
                  <div className="flex justify-between text-xs font-medium text-slate-600">
                    <span>Progreso</span>
                    <span>{proposal.progressPercent}%</span>
                  </div>
                  <div className="h-2 w-full overflow-hidden rounded-full bg-slate-100">
                    <div
                      className="h-full rounded-full bg-blue-600"
                      style={{ width: `${proposal.progressPercent}%` }}
                    />
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {dialogProposal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-4 backdrop-blur-sm">
          <section className="max-h-[92vh] w-full max-w-2xl overflow-y-auto rounded-3xl bg-white shadow-2xl">
            <header className="sticky top-0 z-10 flex items-center justify-between border-b border-slate-100 bg-white px-6 py-5">
              <h2 className="text-xl font-black text-slate-950">
                {dialogProposal === "new" ? "Nueva Propuesta" : "Editar Propuesta"}
              </h2>
              <button
                type="button"
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
              <label className="block text-sm font-black text-slate-800">
                Título
                <input
                  required
                  value={form.title}
                  onChange={(e) => setForm({ ...form, title: e.target.value })}
                  className="mt-2 min-h-12 w-full rounded-2xl border border-slate-200 px-4 font-normal outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-100"
                />
              </label>
              <label className="block text-sm font-black text-slate-800">
                Descripción (opcional)
                <textarea
                  rows={3}
                  value={form.description}
                  onChange={(e) => setForm({ ...form, description: e.target.value })}
                  className="mt-2 w-full rounded-2xl border border-slate-200 px-4 py-3 font-normal outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-100"
                />
              </label>
              <div className="grid gap-4 sm:grid-cols-2">
                <label className="block text-sm font-black text-slate-800">
                  Categoría
                  <select
                    value={form.category}
                    onChange={(e) => setForm({ ...form, category: e.target.value })}
                    className="mt-2 min-h-12 w-full rounded-2xl border border-slate-200 bg-white px-4 font-normal outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-100"
                  >
                    {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
                  </select>
                </label>
                <label className="block text-sm font-black text-slate-800">
                  Costo Estimado (opcional)
                  <input
                    type="number"
                    min="0"
                    value={form.estimatedCost}
                    onChange={(e) => setForm({ ...form, estimatedCost: e.target.value })}
                    className="mt-2 min-h-12 w-full rounded-2xl border border-slate-200 px-4 font-normal outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-100"
                  />
                </label>
              </div>
              <label className="flex items-center gap-3 text-sm font-black text-slate-800 cursor-pointer">
                <input
                  type="checkbox"
                  checked={form.isPublic}
                  onChange={(e) => setForm({ ...form, isPublic: e.target.checked })}
                  className="h-5 w-5 rounded border-slate-300 text-blue-600 focus:ring-blue-600"
                />
                Es Pública
              </label>

              <footer className="mt-8 flex justify-end gap-3 pt-4 border-t border-slate-100">
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
    </div>
  );
}
