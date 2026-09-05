"use client";

import { useEffect, useState } from "react";
import {
  FileText,
  Search,
  Plus,
  RefreshCw,
  Lock,
  Globe,
  Loader2
} from "lucide-react";
import { apiRequest } from "@/lib/api-client";

type ProposalStatus = "DRAFT" | "PUBLISHED" | "ARCHIVED";

type Proposal = {
  id: string;
  referenceCode: string;
  title: string;
  category: string;
  status: ProposalStatus;
  progressPercent: number;
  isPublic: boolean;
  ownerName: string;
};

export default function ProposalsPage() {
  const [proposals, setProposals] = useState<Proposal[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<ProposalStatus | "ALL">("ALL");
  const [categoryFilter, setCategoryFilter] = useState<string>("ALL");

  const loadProposals = async () => {
    setLoading(true);
    try {
      const res = await apiRequest<{ items: Proposal[] }>("/proposals");
      setProposals(res.items || []);
    } catch (error) {
      console.error(error);
      // fallback for demo
      setProposals([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadProposals();
  }, []);

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
          <button className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-blue-700 px-4 text-sm font-semibold text-white hover:bg-blue-800">
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
            <div key={proposal.id} className="flex flex-col gap-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm transition-shadow hover:shadow-md">
              <div className="flex items-start justify-between">
                <span className="rounded-lg bg-slate-100 px-2.5 py-1 text-xs font-bold text-slate-700">
                  {proposal.referenceCode}
                </span>
                {proposal.isPublic ? (
                  <Globe size={16} className="text-emerald-600" />
                ) : (
                  <Lock size={16} className="text-slate-400" />
                )}
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
    </div>
  );
}
