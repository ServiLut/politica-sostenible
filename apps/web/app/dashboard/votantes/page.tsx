"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";
import Link from "next/link";
import {
  AlertCircle,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Eye,
  Loader2,
  RefreshCw,
  Search,
  ShieldCheck,
  UserMinus,
  UserPlus,
  X,
} from "lucide-react";
import { VoterDetailPanel } from "@/components/voters/VoterDetailPanel";
import { useAuth } from "@/context/auth";
import { ApiError } from "@/lib/api-client";
import {
  createVoter,
  CreateVoterInput,
  listVoters,
  revokeVoterConsent,
  VoterListItem,
  VoterPage,
} from "@/lib/voters-api";
import { BackendUserRole } from "@/types/saas-schema";

const PAGE_SIZE = 25;
const CREATE_ROLES = new Set<BackendUserRole>([
  "ADMIN",
  "CAMPAIGN_MANAGER",
]);
const TERRITORIAL_CAPTURE_ROLES = new Set<BackendUserRole>([
  "ZONE_COORDINATOR",
  "VOLUNTEER",
]);
const REVOKE_ROLES = new Set<BackendUserRole>([
  "ADMIN",
  "CAMPAIGN_MANAGER",
  "COMPLIANCE_OFFICER",
]);
const SENSITIVE_DETAIL_ROLES = new Set<BackendUserRole>([
  "ADMIN",
  "COMPLIANCE_OFFICER",
]);

const EMPTY_FORM = {
  documentId: "",
  firstName: "",
  lastName: "",
  phone: "",
  email: "",
  mesa: "",
  consentAccepted: false,
};

function readableError(error: unknown, fallback: string) {
  if (error instanceof ApiError) return error.message;
  if (error instanceof Error && error.message) return error.message;
  return fallback;
}

export default function VotantesPage() {
  const { user } = useAuth();
  const canCreate = user !== null && CREATE_ROLES.has(user.backendRole);
  const usesTerritorialCapture =
    user !== null && TERRITORIAL_CAPTURE_ROLES.has(user.backendRole);
  const canRevoke = user !== null && REVOKE_ROLES.has(user.backendRole);
  const canManageSensitiveDetail =
    user !== null && SENSITIVE_DETAIL_ROLES.has(user.backendRole);
  const [result, setResult] = useState<VoterPage | null>(null);
  const [page, setPage] = useState(1);
  const [searchDraft, setSearchDraft] = useState("");
  const [search, setSearch] = useState("");
  const [reload, setReload] = useState(0);
  const [loading, setLoading] = useState(true);
  const [listError, setListError] = useState<string | null>(null);
  const [mutationError, setMutationError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [revokeTarget, setRevokeTarget] = useState<VoterListItem | null>(null);
  const [revocationReason, setRevocationReason] = useState("");
  const [revocationConfirmed, setRevocationConfirmed] = useState(false);
  const [revoking, setRevoking] = useState(false);
  const [detailVoterId, setDetailVoterId] = useState<string | null>(null);

  const loadVoters = useCallback(
    (signal: AbortSignal) =>
      listVoters(page, PAGE_SIZE, search || undefined, signal),
    [page, search],
  );

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setListError(null);

    void loadVoters(controller.signal)
      .then((response) => {
        if (!controller.signal.aborted) setResult(response);
      })
      .catch((requestError: unknown) => {
        if (!controller.signal.aborted) {
          setListError(
            readableError(
              requestError,
              "No fue posible cargar las personas vinculadas.",
            ),
          );
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });

    return () => controller.abort();
  }, [loadVoters, reload]);

  function submitSearch(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPage(1);
    setSearch(searchDraft.trim());
  }

  async function handleCreate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMutationError(null);

    if (!form.consentAccepted) {
      setMutationError(
        "Debes registrar la autorizacion explicita antes de guardar datos sensibles.",
      );
      return;
    }

    const payload: CreateVoterInput = {
      documentId: form.documentId.trim(),
      firstName: form.firstName.trim(),
      lastName: form.lastName.trim(),
      consentAccepted: true,
      termsVersion: "2026.1",
      ...(form.phone.trim() ? { phone: form.phone.trim() } : {}),
      ...(form.email.trim() ? { email: form.email.trim() } : {}),
      ...(form.mesa ? { mesa: Number(form.mesa) } : {}),
    };

    setSaving(true);
    try {
      await createVoter(payload);
      setForm(EMPTY_FORM);
      setIsCreateOpen(false);
      setSearchDraft("");
      setSearch("");
      setPage(1);
      setNotice(
        "Solicitud recibida. Fue procesada sin revelar si el documento ya existía.",
      );
      setReload((value) => value + 1);
    } catch (requestError: unknown) {
      setMutationError(
        readableError(requestError, "No fue posible enviar la solicitud."),
      );
    } finally {
      setSaving(false);
    }
  }

  function openRevocation(voter: VoterListItem) {
    setMutationError(null);
    setRevocationReason("");
    setRevocationConfirmed(false);
    setRevokeTarget(voter);
  }

  function closeRevocation() {
    if (revoking) return;
    setRevokeTarget(null);
    setRevocationReason("");
    setRevocationConfirmed(false);
    setMutationError(null);
  }

  async function handleRevocation(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!revokeTarget) return;

    const reason = revocationReason.trim();
    if (reason.length < 10) {
      setMutationError("La razon debe contener al menos 10 caracteres.");
      return;
    }
    if (!revocationConfirmed) {
      setMutationError(
        "Confirma expresamente que verificaste la solicitud del titular.",
      );
      return;
    }

    setRevoking(true);
    setMutationError(null);
    try {
      const revoked = await revokeVoterConsent(revokeTarget.id, reason);
      setResult((current) =>
        current
          ? {
              ...current,
              items: current.items.map((voter) =>
                voter.id === revoked.voterId
                  ? { ...voter, consentAccepted: false }
                  : voter,
              ),
            }
          : current,
      );
      setNotice("Consentimiento revocado; el historial legal fue conservado.");
      setRevokeTarget(null);
      setRevocationReason("");
      setRevocationConfirmed(false);
    } catch (requestError: unknown) {
      setMutationError(
        readableError(
          requestError,
          "No fue posible revocar el consentimiento.",
        ),
      );
    } finally {
      setRevoking(false);
    }
  }

  const totalPages = Math.max(1, result?.pagination.totalPages ?? 1);

  return (
    <div className="space-y-8">
      {notice && (
        <div
          role="status"
          className="fixed right-6 top-6 z-[90] flex items-center gap-3 rounded-2xl bg-emerald-600 px-5 py-4 text-sm font-bold text-white shadow-2xl"
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

      <header className="flex flex-col justify-between gap-5 lg:flex-row lg:items-end">
        <div className="space-y-2">
          <div className="inline-flex items-center gap-2 rounded-full bg-emerald-50 px-3 py-1 text-[10px] font-black uppercase tracking-[0.18em] text-emerald-700">
            <ShieldCheck size={13} /> Habeas data verificable
          </div>
          <h1 className="text-4xl font-black tracking-tight text-slate-950">
            Relacionamiento territorial
          </h1>
          <p className="max-w-2xl text-sm leading-6 text-slate-500">
            Consulta datos minimizados y conserva una trazabilidad inmutable de
            cada autorizacion o revocacion electoral.
          </p>
        </div>
        <div className="flex flex-wrap gap-3">
          <button
            type="button"
            onClick={() => setReload((value) => value + 1)}
            className="inline-flex items-center gap-2 rounded-2xl border border-slate-200 bg-white px-5 py-3 text-xs font-black uppercase tracking-wider text-slate-600 hover:bg-slate-50"
          >
            <RefreshCw size={15} /> Actualizar
          </button>
          {canCreate && (
            <button
              type="button"
              onClick={() => {
                setMutationError(null);
                setIsCreateOpen(true);
              }}
              className="inline-flex items-center gap-2 rounded-2xl bg-slate-950 px-6 py-3 text-xs font-black uppercase tracking-wider text-white hover:bg-emerald-700"
            >
              <UserPlus size={16} /> Nueva vinculacion
            </button>
          )}
          {usesTerritorialCapture && (
            <Link
              href="/dashboard/captura-territorial"
              className="inline-flex items-center gap-2 rounded-2xl bg-emerald-700 px-6 py-3 text-xs font-black uppercase tracking-wider text-white hover:bg-emerald-800"
            >
              <UserPlus size={16} /> Capturar en territorio
            </Link>
          )}
        </div>
      </header>

      <section
        aria-busy={loading}
        className="overflow-hidden rounded-[2rem] border border-slate-200 bg-white shadow-sm"
      >
        <div className="flex flex-col gap-4 border-b border-slate-100 bg-slate-50/60 p-5 md:flex-row md:items-center md:justify-between">
          <form
            onSubmit={submitSearch}
            className="flex w-full max-w-2xl flex-col gap-3 sm:flex-row"
          >
            <label className="relative flex-1">
              <span className="sr-only">Buscar personas</span>
              <Search
                className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400"
                size={18}
              />
              <input
                value={searchDraft}
                maxLength={100}
                onChange={(event) => setSearchDraft(event.target.value)}
                placeholder="Buscar por nombre, documento o celular"
                className="w-full rounded-2xl border border-slate-200 bg-white py-3 pl-12 pr-4 text-sm outline-none focus:border-emerald-500 focus:ring-4 focus:ring-emerald-50"
              />
            </label>
            <button
              type="submit"
              className="rounded-2xl bg-slate-950 px-5 py-3 text-xs font-black uppercase tracking-wider text-white"
            >
              Buscar
            </button>
          </form>
          <p className="shrink-0 text-xs font-bold text-slate-500">
            {result ? result.pagination.total : "—"} registros · datos minimizados
          </p>
        </div>

        {listError && (
          <div
            role="alert"
            className="m-5 flex items-start gap-3 rounded-2xl border border-red-200 bg-red-50 px-5 py-4 text-sm font-semibold text-red-700"
          >
            <AlertCircle className="mt-0.5 shrink-0" size={18} />
            <div className="flex-1">
              <p>{listError}</p>
              <p className="mt-1 text-xs">
                {result
                  ? "Se conserva el último resultado disponible."
                  : "Los registros no están disponibles; no se sustituyeron por un total de cero."}
              </p>
            </div>
            <button
              type="button"
              onClick={() => setReload((value) => value + 1)}
              disabled={loading}
              className="min-h-10 shrink-0 rounded-xl bg-red-700 px-4 text-xs font-black uppercase tracking-wider text-white disabled:opacity-50"
            >
              Reintentar
            </button>
          </div>
        )}

        {loading ? (
          <div
            role="status"
            className="flex items-center justify-center gap-3 py-20 text-sm font-bold text-slate-400"
          >
            <Loader2 className="animate-spin" size={20} /> Consultando la API
            segura...
          </div>
        ) : listError && !result ? (
          <div className="px-6 py-20 text-center text-sm font-semibold text-slate-500">
            Consulta no disponible. Usa Reintentar para recuperar el listado.
          </div>
        ) : !result?.items.length ? (
          <div className="px-6 py-20 text-center">
            <ShieldCheck className="mx-auto mb-4 text-slate-300" size={42} />
            <h2 className="font-black text-slate-900">
              No hay registros para mostrar
            </h2>
            <p className="mt-2 text-sm text-slate-500">
              Ajusta la busqueda o crea un registro despues de obtener la
              autorizacion correspondiente.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[900px] text-left">
              <thead className="text-[10px] font-black uppercase tracking-[0.16em] text-slate-400">
                <tr>
                  <th className="px-6 py-4">Persona</th>
                  <th className="px-6 py-4">Documento</th>
                  <th className="px-6 py-4">Contacto</th>
                  <th className="px-6 py-4">Puesto / mesa</th>
                  <th className="px-6 py-4">Consentimiento</th>
                  {(canRevoke || canManageSensitiveDetail) && (
                    <th className="px-6 py-4">Acciones autorizadas</th>
                  )}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {result.items.map((voter) => (
                  <tr key={voter.id} className="hover:bg-slate-50/70">
                    <td className="px-6 py-5">
                      <p className="text-sm font-black text-slate-900">
                        {voter.firstName} {voter.lastName}
                      </p>
                      <p className="mt-1 text-xs text-slate-400">
                        Registro por{" "}
                        {voter.registrar?.name ?? "equipo autorizado"}
                      </p>
                    </td>
                    <td className="px-6 py-5 font-mono text-xs font-bold text-slate-600">
                      {voter.documentIdMasked}
                    </td>
                    <td className="px-6 py-5 font-mono text-xs font-semibold text-slate-500">
                      {voter.phoneMasked ?? "Sin telefono"}
                    </td>
                    <td className="px-6 py-5 text-xs font-bold text-slate-600">
                      {voter.puesto?.name ?? "Sin asignar"} /{" "}
                      {voter.mesa ?? "—"}
                    </td>
                    <td className="px-6 py-5">
                      {voter.consentAccepted ? (
                        <span className="inline-flex items-center gap-2 rounded-full bg-emerald-50 px-3 py-1 text-[10px] font-black uppercase tracking-wider text-emerald-700">
                          <CheckCircle2 size={13} /> Vigente
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-2 rounded-full bg-red-50 px-3 py-1 text-[10px] font-black uppercase tracking-wider text-red-700">
                          <UserMinus size={13} /> Revocado
                        </span>
                      )}
                    </td>
                    {(canRevoke || canManageSensitiveDetail) && (
                      <td className="px-6 py-5">
                        <div className="flex flex-wrap gap-2">
                          {canManageSensitiveDetail && (
                            <button
                              type="button"
                              aria-label={`Ver datos protegidos de ${voter.firstName} ${voter.lastName}`}
                              onClick={() => setDetailVoterId(voter.id)}
                              className="inline-flex min-h-9 items-center gap-2 rounded-xl border border-slate-300 px-3 py-2 text-[10px] font-black uppercase tracking-wider text-slate-700 transition hover:border-emerald-600 hover:bg-emerald-50 hover:text-emerald-800 focus:outline-none focus:ring-2 focus:ring-emerald-600 focus:ring-offset-2"
                            >
                              <Eye aria-hidden="true" size={14} /> Ver datos
                            </button>
                          )}
                          {canRevoke && voter.consentAccepted ? (
                          <button
                            type="button"
                            onClick={() => openRevocation(voter)}
                            className="rounded-xl border border-red-200 px-3 py-2 text-[10px] font-black uppercase tracking-wider text-red-700 hover:bg-red-50"
                          >
                            Revocar
                          </button>
                          ) : canRevoke ? (
                          <span className="text-xs font-semibold text-slate-400">
                            Sin consentimiento activo
                          </span>
                          ) : null}
                        </div>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {!loading && result && result.pagination.total > 0 && (
          <nav
            aria-label="Paginacion de personas"
            className="flex items-center justify-end gap-3 border-t border-slate-100 p-5"
          >
            <span className="mr-auto text-xs font-bold text-slate-500">
              Pagina {page} de {totalPages}
            </span>
            <button
              type="button"
              disabled={page <= 1}
              onClick={() => setPage((value) => value - 1)}
              className="inline-flex min-h-10 items-center gap-2 rounded-xl border border-slate-200 px-4 text-xs font-black uppercase tracking-wider text-slate-600 disabled:opacity-40"
            >
              <ChevronLeft size={15} /> Anterior
            </button>
            <button
              type="button"
              disabled={page >= totalPages}
              onClick={() => setPage((value) => value + 1)}
              className="inline-flex min-h-10 items-center gap-2 rounded-xl border border-slate-200 px-4 text-xs font-black uppercase tracking-wider text-slate-600 disabled:opacity-40"
            >
              Siguiente <ChevronRight size={15} />
            </button>
          </nav>
        )}
      </section>

      {isCreateOpen && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-slate-950/70 p-4 backdrop-blur-sm">
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="new-voter-title"
            className="max-h-[92vh] w-full max-w-2xl overflow-y-auto rounded-[2rem] bg-white shadow-2xl"
          >
            <div className="flex items-start justify-between border-b border-slate-100 p-7">
              <div>
                <h2
                  id="new-voter-title"
                  className="text-2xl font-black text-slate-950"
                >
                  Nueva vinculacion consentida
                </h2>
                <p className="mt-1 text-sm text-slate-500">
                  La finalidad y la version de terminos quedaran trazadas.
                </p>
              </div>
              <button
                type="button"
                aria-label="Cerrar"
                onClick={() => {
                  setIsCreateOpen(false);
                  setMutationError(null);
                }}
                className="rounded-xl p-2 text-slate-400 hover:bg-slate-100"
              >
                <X />
              </button>
            </div>

            <form onSubmit={handleCreate} className="space-y-6 p-7">
              {mutationError && (
                <div
                  role="alert"
                  className="rounded-2xl border border-red-200 bg-red-50 px-5 py-4 text-sm font-semibold text-red-700"
                >
                  {mutationError}
                </div>
              )}

              <div className="grid gap-5 md:grid-cols-2">
                <label className="space-y-2 text-xs font-black uppercase tracking-wider text-slate-500">
                  Nombres
                  <input
                    required
                    value={form.firstName}
                    onChange={(event) =>
                      setForm({ ...form, firstName: event.target.value })
                    }
                    className="w-full rounded-2xl border border-slate-200 px-4 py-3 text-sm font-semibold normal-case tracking-normal text-slate-900"
                  />
                </label>
                <label className="space-y-2 text-xs font-black uppercase tracking-wider text-slate-500">
                  Apellidos
                  <input
                    required
                    value={form.lastName}
                    onChange={(event) =>
                      setForm({ ...form, lastName: event.target.value })
                    }
                    className="w-full rounded-2xl border border-slate-200 px-4 py-3 text-sm font-semibold normal-case tracking-normal text-slate-900"
                  />
                </label>
                <label className="space-y-2 text-xs font-black uppercase tracking-wider text-slate-500">
                  Documento
                  <input
                    required
                    inputMode="numeric"
                    pattern="[0-9]{5,15}"
                    value={form.documentId}
                    onChange={(event) =>
                      setForm({ ...form, documentId: event.target.value })
                    }
                    className="w-full rounded-2xl border border-slate-200 px-4 py-3 text-sm font-semibold normal-case tracking-normal text-slate-900"
                  />
                </label>
                <label className="space-y-2 text-xs font-black uppercase tracking-wider text-slate-500">
                  Celular
                  <input
                    inputMode="tel"
                    value={form.phone}
                    onChange={(event) =>
                      setForm({ ...form, phone: event.target.value })
                    }
                    className="w-full rounded-2xl border border-slate-200 px-4 py-3 text-sm font-semibold normal-case tracking-normal text-slate-900"
                  />
                </label>
                <label className="space-y-2 text-xs font-black uppercase tracking-wider text-slate-500">
                  Correo opcional
                  <input
                    type="email"
                    value={form.email}
                    onChange={(event) =>
                      setForm({ ...form, email: event.target.value })
                    }
                    className="w-full rounded-2xl border border-slate-200 px-4 py-3 text-sm font-semibold normal-case tracking-normal text-slate-900"
                  />
                </label>
                <label className="space-y-2 text-xs font-black uppercase tracking-wider text-slate-500">
                  Mesa opcional
                  <input
                    type="number"
                    min="1"
                    value={form.mesa}
                    onChange={(event) =>
                      setForm({ ...form, mesa: event.target.value })
                    }
                    className="w-full rounded-2xl border border-slate-200 px-4 py-3 text-sm font-semibold normal-case tracking-normal text-slate-900"
                  />
                </label>
              </div>

              <label className="flex cursor-pointer items-start gap-4 rounded-2xl border border-emerald-200 bg-emerald-50/60 p-5">
                <input
                  type="checkbox"
                  checked={form.consentAccepted}
                  onChange={(event) =>
                    setForm({
                      ...form,
                      consentAccepted: event.target.checked,
                    })
                  }
                  className="mt-1 h-5 w-5 accent-emerald-600"
                />
                <span className="text-sm leading-6 text-slate-700">
                  Confirmo que la persona recibio informacion sobre finalidad
                  electoral, responsable y derechos, y autorizo expresamente el
                  tratamiento.
                </span>
              </label>

              <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
              <button
                type="button"
                aria-label="Cerrar registro de persona"
                onClick={() => {
                    setIsCreateOpen(false);
                    setMutationError(null);
                  }}
                  className="rounded-2xl border border-slate-200 px-6 py-3 text-xs font-black uppercase tracking-wider text-slate-600"
                >
                  Cancelar
                </button>
                <button
                  disabled={saving}
                  type="submit"
                  className="inline-flex items-center justify-center gap-2 rounded-2xl bg-emerald-700 px-7 py-3 text-xs font-black uppercase tracking-wider text-white disabled:opacity-60"
                >
                  {saving ? (
                    <Loader2 className="animate-spin" size={16} />
                  ) : (
                    <ShieldCheck size={16} />
                  )}
                  Guardar con trazabilidad
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {revokeTarget && (
        <div className="fixed inset-0 z-[80] flex items-center justify-center bg-slate-950/75 p-4 backdrop-blur-sm">
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="revoke-consent-title"
            className="w-full max-w-xl rounded-[2rem] bg-white shadow-2xl"
          >
            <div className="flex items-start justify-between border-b border-slate-100 p-7">
              <div>
                <div className="mb-3 inline-flex rounded-xl bg-red-50 p-2 text-red-700">
                  <UserMinus size={20} />
                </div>
                <h2
                  id="revoke-consent-title"
                  className="text-2xl font-black text-slate-950"
                >
                  Revocar consentimiento
                </h2>
                <p className="mt-2 text-sm text-slate-500">
                  {revokeTarget.firstName} {revokeTarget.lastName} ·{" "}
                  {revokeTarget.documentIdMasked}
                </p>
              </div>
              <button
                type="button"
                aria-label="Cerrar"
                disabled={revoking}
                onClick={closeRevocation}
                className="rounded-xl p-2 text-slate-400 hover:bg-slate-100 disabled:opacity-50"
              >
                <X aria-hidden="true" />
              </button>
            </div>

            <form onSubmit={handleRevocation} className="space-y-5 p-7">
              <p className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm leading-6 text-amber-900">
                Esta accion detiene el consentimiento vigente. No elimina al
                ciudadano ni sobrescribe la evidencia historica.
              </p>
              {mutationError && (
                <div
                  role="alert"
                  className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm font-semibold text-red-700"
                >
                  {mutationError}
                </div>
              )}
              <label className="block space-y-2 text-xs font-black uppercase tracking-wider text-slate-500">
                Motivo verificado
                <textarea
                  required
                  minLength={10}
                  maxLength={500}
                  rows={4}
                  value={revocationReason}
                  onChange={(event) => setRevocationReason(event.target.value)}
                  placeholder="Describe como se recibio y verifico la solicitud"
                  className="w-full resize-y rounded-2xl border border-slate-200 px-4 py-3 text-sm font-semibold normal-case tracking-normal text-slate-900"
                />
                <span className="block text-right text-[10px] text-slate-400">
                  {revocationReason.length}/500
                </span>
              </label>
              <label className="flex cursor-pointer items-start gap-4 rounded-2xl border border-red-200 bg-red-50/60 p-5">
                <input
                  type="checkbox"
                  checked={revocationConfirmed}
                  onChange={(event) =>
                    setRevocationConfirmed(event.target.checked)
                  }
                  className="mt-1 h-5 w-5 accent-red-600"
                />
                <span className="text-sm font-semibold leading-6 text-slate-700">
                  Confirmo que verifique una solicitud expresa del titular y
                  comprendo que esta operacion quedara auditada.
                </span>
              </label>
              <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
                <button
                  type="button"
                  disabled={revoking}
                  onClick={closeRevocation}
                  className="rounded-2xl border border-slate-200 px-6 py-3 text-xs font-black uppercase tracking-wider text-slate-600 disabled:opacity-50"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={revoking || !revocationConfirmed}
                  className="inline-flex items-center justify-center gap-2 rounded-2xl bg-red-700 px-7 py-3 text-xs font-black uppercase tracking-wider text-white disabled:opacity-50"
                >
                  {revoking ? (
                    <Loader2 className="animate-spin" size={16} />
                  ) : (
                    <UserMinus size={16} />
                  )}
                  Confirmar revocacion
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {detailVoterId && canManageSensitiveDetail && (
        <VoterDetailPanel
          key={detailVoterId}
          voterId={detailVoterId}
          onClose={() => setDetailVoterId(null)}
          onUpdated={() => setReload((value) => value + 1)}
        />
      )}
    </div>
  );
}
