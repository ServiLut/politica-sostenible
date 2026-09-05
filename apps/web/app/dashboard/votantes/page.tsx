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
  UserCheck,
  UserMinus,
  UserPlus,
  X,
} from "lucide-react";
import { VoterDetailPanel } from "@/components/voters/VoterDetailPanel";
import { useAuth } from "@/context/auth";
import { ApiError } from "@/lib/api-client";
import {
  getConsentNoticePresentationKey,
  getCurrentConsentNotice,
  type ConsentNoticeContext,
} from "@/lib/consent-notices-api";
import type { CapturableConsentCollectionChannel } from "@/lib/interactions-api";
import {
  createVoter,
  CreateVoterInput,
  grantVoterConsent,
  listVoters,
  revokeVoterConsent,
  VoterListItem,
  VoterPage,
} from "@/lib/voters-api";
import { BackendUserRole } from "@/types/saas-schema";

import { ExportButton } from "@/components/ui/ExportButton";

const PAGE_SIZE = 25;
const CREATE_ROLES = new Set<BackendUserRole>(["ADMIN", "CAMPAIGN_MANAGER"]);
const TERRITORIAL_CAPTURE_ROLES = new Set<BackendUserRole>([
  "ZONE_COORDINATOR",
  "VOLUNTEER",
]);
const REVOKE_ROLES = new Set<BackendUserRole>([
  "ADMIN",
  "CAMPAIGN_MANAGER",
  "COMPLIANCE_OFFICER",
]);
const REAUTHORIZE_ROLES = new Set<BackendUserRole>([
  "ADMIN",
  "CAMPAIGN_MANAGER",
  "COMPLIANCE_OFFICER",
  "ZONE_COORDINATOR",
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
  collectionChannel: "",
  consentAccepted: false,
};

const CONSENT_CHANNEL_OPTIONS: ReadonlyArray<{
  value: CapturableConsentCollectionChannel;
  label: string;
}> = [
  { value: "IN_PERSON", label: "Presencial" },
  { value: "PHONE", label: "Llamada" },
  { value: "PAPER", label: "Formato físico" },
  { value: "WEB_FORM", label: "Formulario web diligenciado por la persona" },
];

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
  const canReauthorize =
    user !== null && REAUTHORIZE_ROLES.has(user.backendRole);
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
  const [createAcceptedNoticeKey, setCreateAcceptedNoticeKey] = useState<
    string | null
  >(null);
  const [revokeTarget, setRevokeTarget] = useState<VoterListItem | null>(null);
  const [revocationReason, setRevocationReason] = useState("");
  const [revocationConfirmed, setRevocationConfirmed] = useState(false);
  const [revoking, setRevoking] = useState(false);
  const [grantTarget, setGrantTarget] = useState<VoterListItem | null>(null);
  const [grantConfirmed, setGrantConfirmed] = useState(false);
  const [grantChannel, setGrantChannel] = useState<
    "" | CapturableConsentCollectionChannel
  >("");
  const [grantAcceptedNoticeKey, setGrantAcceptedNoticeKey] = useState<
    string | null
  >(null);
  const [granting, setGranting] = useState(false);
  const [detailVoterId, setDetailVoterId] = useState<string | null>(null);
  const [consentContext, setConsentContext] =
    useState<ConsentNoticeContext | null>(null);
  const [consentConfigError, setConsentConfigError] = useState<string | null>(
    null,
  );
  const currentConsentNoticeKey = getConsentNoticePresentationKey(
    consentContext?.notice,
  );
  const createConsentAcceptedForCurrentNotice =
    currentConsentNoticeKey !== null &&
    form.consentAccepted &&
    createAcceptedNoticeKey === currentConsentNoticeKey;
  const grantConfirmedForCurrentNotice =
    currentConsentNoticeKey !== null &&
    grantConfirmed &&
    grantAcceptedNoticeKey === currentConsentNoticeKey;

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
              "No fue posible cargar las personas autorizadas.",
            ),
          );
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });

    return () => controller.abort();
  }, [loadVoters, reload]);

  useEffect(() => {
    const controller = new AbortController();
    setConsentConfigError(null);
    void getCurrentConsentNotice(controller.signal)
      .then((response) => {
        if (!controller.signal.aborted) setConsentContext(response);
      })
      .catch((requestError: unknown) => {
        if (!controller.signal.aborted) {
          setConsentContext(null);
          setConsentConfigError(
            readableError(
              requestError,
              "No fue posible verificar el aviso de privacidad vigente.",
            ),
          );
        }
      });
    return () => controller.abort();
  }, [reload]);

  useEffect(() => {
    setForm((current) => {
      if (!current.consentAccepted && !current.collectionChannel) {
        return current;
      }
      return {
        ...current,
        collectionChannel: "",
        consentAccepted: false,
      };
    });
    setCreateAcceptedNoticeKey(null);
    setGrantConfirmed(false);
    setGrantChannel("");
    setGrantAcceptedNoticeKey(null);
  }, [currentConsentNoticeKey, reload]);

  function submitSearch(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPage(1);
    setSearch(searchDraft.trim());
  }

  function resetCreateConsentConfirmation() {
    setForm((current) => ({
      ...current,
      collectionChannel: "",
      consentAccepted: false,
    }));
    setCreateAcceptedNoticeKey(null);
  }

  function openCreate() {
    setMutationError(null);
    resetCreateConsentConfirmation();
    setIsCreateOpen(true);
  }

  function closeCreate() {
    if (saving) return;
    setIsCreateOpen(false);
    setMutationError(null);
    resetCreateConsentConfirmation();
  }

  async function handleCreate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMutationError(null);

    if (!consentContext?.notice) {
      setMutationError(
        "La organizacion debe activar su aviso de privacidad antes de registrar autorizaciones.",
      );
      return;
    }
    const submittedNoticeKey = getConsentNoticePresentationKey(
      consentContext.notice,
    );
    if (
      !form.consentAccepted ||
      !submittedNoticeKey ||
      createAcceptedNoticeKey !== submittedNoticeKey
    ) {
      setMutationError(
        "Debes registrar la autorizacion explicita para el aviso de privacidad mostrado antes de guardar datos sensibles.",
      );
      return;
    }
    if (!form.collectionChannel) {
      setMutationError(
        "Selecciona el canal real usado para obtener la autorizacion.",
      );
      return;
    }

    const payload: CreateVoterInput = {
      documentId: form.documentId.trim(),
      firstName: form.firstName.trim(),
      lastName: form.lastName.trim(),
      consentAccepted: true,
      termsVersion: consentContext.notice.version,
      collectionChannel:
        form.collectionChannel as CapturableConsentCollectionChannel,
      ...(form.phone.trim() ? { phone: form.phone.trim() } : {}),
      ...(form.email.trim() ? { email: form.email.trim() } : {}),
      ...(form.mesa ? { mesa: Number(form.mesa) } : {}),
    };

    setSaving(true);
    try {
      await createVoter(payload);
      setForm(EMPTY_FORM);
      setCreateAcceptedNoticeKey(null);
      setIsCreateOpen(false);
      setSearchDraft("");
      setSearch("");
      setPage(1);
      setNotice("Persona registrada con autorización y trazabilidad.");
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

  function openGrant(voter: VoterListItem) {
    setMutationError(null);
    setGrantConfirmed(false);
    setGrantChannel("");
    setGrantAcceptedNoticeKey(null);
    setGrantTarget(voter);
  }

  function closeGrant() {
    if (granting) return;
    setGrantTarget(null);
    setGrantConfirmed(false);
    setGrantChannel("");
    setGrantAcceptedNoticeKey(null);
    setMutationError(null);
  }

  async function handleGrant(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!grantTarget) return;
    if (!consentContext?.notice) {
      setMutationError(
        "No hay un aviso de privacidad activo para registrar la nueva autorizacion.",
      );
      return;
    }
    const submittedNoticeKey = getConsentNoticePresentationKey(
      consentContext.notice,
    );
    if (
      !grantConfirmed ||
      !submittedNoticeKey ||
      grantAcceptedNoticeKey !== submittedNoticeKey
    ) {
      setMutationError(
        "Confirma que la persona otorgo una nueva autorizacion expresa para el aviso mostrado.",
      );
      return;
    }
    if (!grantChannel) {
      setMutationError("Selecciona el canal real de la nueva autorizacion.");
      return;
    }

    setGranting(true);
    setMutationError(null);
    try {
      const granted = await grantVoterConsent(grantTarget.id, {
        noticeVersion: consentContext.notice.version,
        collectionChannel: grantChannel,
      });
      setResult((current) =>
        current
          ? {
              ...current,
              items: current.items.map((voter) =>
                voter.id === granted.voterId
                  ? {
                      ...voter,
                      consentAccepted: true,
                      consentTimestamp: granted.grantedAt,
                    }
                  : voter,
              ),
            }
          : current,
      );
      setNotice(
        "Nueva autorizacion registrada; la revocacion historica fue conservada.",
      );
      setGrantTarget(null);
      setGrantConfirmed(false);
      setGrantChannel("");
      setGrantAcceptedNoticeKey(null);
    } catch (requestError: unknown) {
      setMutationError(
        readableError(
          requestError,
          "No fue posible registrar la nueva autorizacion.",
        ),
      );
    } finally {
      setGranting(false);
    }
  }

  const totalPages = Math.max(1, result?.pagination.totalPages ?? 1);

  return (
    <main id="main-content" className="space-y-8">
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
              <ShieldCheck size={13} /> Relacionamiento autorizado
          </div>
          <h1 className="text-3xl font-black tracking-tight text-slate-900 sm:text-4xl">
            Personas
          </h1>
          <p className="max-w-2xl text-sm leading-6 text-slate-500">
            Gestiona únicamente datos entregados y autorizados por cada
            persona. Este espacio no clasifica intención de voto, ideología ni
            características sensibles.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <ExportButton moduleName="personas" />
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
              disabled={!consentContext?.notice}
              onClick={openCreate}
              className="inline-flex items-center gap-2 rounded-2xl bg-slate-900 px-6 py-3 text-xs font-black uppercase tracking-wider text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <UserPlus size={16} /> Registrar persona
            </button>
          )}
          {usesTerritorialCapture && (
            <Link
              href="/dashboard/captura-territorial"
              className="inline-flex items-center gap-2 rounded-2xl bg-blue-700 px-6 py-3 text-xs font-black uppercase tracking-wider text-white hover:bg-blue-800"
            >
              <UserPlus size={16} /> Jornada territorial
            </Link>
          )}
        </div>
      </header>

      {!consentContext?.notice && (
        <div
          role="alert"
          className="flex flex-col gap-4 rounded-2xl border border-amber-200 bg-amber-50 p-5 text-sm font-semibold leading-6 text-amber-950 sm:flex-row sm:items-center sm:justify-between"
        >
          <div className="flex items-start gap-3">
            <AlertCircle
              aria-hidden="true"
              className="mt-0.5 shrink-0"
              size={20}
            />
            <p>
              {consentConfigError ??
                "No hay un aviso de privacidad activo. Los nuevos registros y las reautorizaciones permanecen bloqueados para no guardar un consentimiento sin información verificable."}
            </p>
          </div>
          {user?.backendRole === "ADMIN" && (
            <Link
              href="/dashboard/settings"
              className="inline-flex min-h-11 shrink-0 items-center justify-center rounded-xl bg-amber-900 px-4 text-xs font-black uppercase tracking-wider text-white"
            >
              Configurar aviso
            </Link>
          )}
        </div>
      )}

      <section
        aria-busy={loading}
        aria-live="polite"
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
              className="rounded-2xl bg-slate-900 px-5 py-3 text-xs font-black uppercase tracking-wider text-white hover:bg-blue-700"
            >
              Buscar
            </button>
          </form>
          <p className="shrink-0 text-xs font-bold text-slate-500">
            {result ? result.pagination.total : "—"} personas · datos
            minimizados
          </p>
        </div>

        {listError && (
          <div
            role="alert"
            className="m-5 flex items-center gap-3 rounded-2xl border border-red-200 bg-red-50 p-5 text-sm font-semibold text-red-900"
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
          <div className="flex items-center justify-center gap-3 p-20 text-sm font-semibold text-slate-600">
            <Loader2 className="animate-spin text-slate-400" size={24} />
            Consultando la API segura...
          </div>
        ) : listError && !result ? (
          <div className="px-6 py-20 text-center text-sm font-semibold text-slate-500">
            Consulta no disponible. Usa Reintentar para recuperar el listado.
          </div>
        ) : !result?.items.length ? (
          <div className="m-5 rounded-2xl border-2 border-dashed border-slate-200 p-12 text-center">
            <ShieldCheck className="mx-auto mb-4 text-slate-300" size={42} />
            <h2 className="font-black text-slate-900">
              No hay registros para mostrar
            </h2>
            <p className="mt-2 text-sm text-slate-500">
              Ajusta la búsqueda o registra una persona después de obtener su
              autorización correspondiente.
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
                  {(canRevoke ||
                    canReauthorize ||
                    canManageSensitiveDetail) && (
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
                          <UserMinus size={13} /> No vigente
                        </span>
                      )}
                    </td>
                    {(canRevoke ||
                      canReauthorize ||
                      canManageSensitiveDetail) && (
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
                          {canRevoke && voter.consentAccepted && (
                            <button
                              type="button"
                              onClick={() => openRevocation(voter)}
                              className="rounded-xl border border-red-200 px-3 py-2 text-[10px] font-black uppercase tracking-wider text-red-700 hover:bg-red-50"
                            >
                              Revocar
                            </button>
                          )}
                          {canReauthorize && !voter.consentAccepted && (
                            <button
                              type="button"
                              onClick={() => openGrant(voter)}
                              className="inline-flex min-h-9 items-center gap-2 rounded-xl border border-emerald-200 px-3 py-2 text-[10px] font-black uppercase tracking-wider text-emerald-800 transition hover:bg-emerald-50 focus:outline-none focus:ring-2 focus:ring-emerald-600 focus:ring-offset-2"
                            >
                              <UserCheck aria-hidden="true" size={14} />
                              Reautorizar
                            </button>
                          )}
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
                  Registrar persona autorizada
                </h2>
                <p className="mt-1 text-sm text-slate-500">
                  La finalidad y la version de terminos quedaran trazadas.
                </p>
              </div>
              <button
                type="button"
                aria-label="Cerrar"
                disabled={saving}
                onClick={closeCreate}
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

              {consentContext?.notice && (
                <section className="rounded-2xl border border-blue-200 bg-blue-50 p-5 text-sm leading-6 text-blue-950">
                  <p className="text-[10px] font-black uppercase tracking-wider text-blue-700">
                    Aviso {consentContext.notice.version}
                  </p>
                  <h3 className="mt-1 font-black">
                    {consentContext.notice.title}
                  </h3>
                  <p className="mt-2 whitespace-pre-line">
                    {consentContext.notice.content}
                  </p>
                  <p className="mt-3 text-xs font-semibold">
                    Responsable: {consentContext.notice.controllerName} ·
                    Derechos: {consentContext.notice.contactEmail}
                  </p>
                </section>
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

              <label className="block space-y-2 text-xs font-black uppercase tracking-wider text-slate-500">
                Canal real de la autorizacion
                <select
                  required
                  disabled={!consentContext?.notice || saving}
                  value={form.collectionChannel}
                  onChange={(event) =>
                    setForm({ ...form, collectionChannel: event.target.value })
                  }
                  className="min-h-12 w-full rounded-2xl border border-slate-200 bg-white px-4 text-sm font-semibold normal-case tracking-normal text-slate-900"
                >
                  <option value="">Selecciona cómo autorizó la persona</option>
                  {CONSENT_CHANNEL_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </label>

              <label className="flex cursor-pointer items-start gap-4 rounded-2xl border border-emerald-200 bg-emerald-50/60 p-5">
                <input
                  type="checkbox"
                  disabled={!consentContext?.notice || saving}
                  checked={createConsentAcceptedForCurrentNotice}
                  onChange={(event) => {
                    const checked = event.target.checked;
                    setForm({
                      ...form,
                      consentAccepted: checked,
                    });
                    setCreateAcceptedNoticeKey(
                      checked && currentConsentNoticeKey
                        ? currentConsentNoticeKey
                        : null,
                    );
                  }}
                  className="mt-1 h-5 w-5 accent-emerald-600"
                />
                <span className="text-sm leading-6 text-slate-700">
                  Confirmo que comuniqué el aviso{" "}
                  {consentContext?.notice?.version} completo, registré el canal
                  real y la persona autorizó expresamente el tratamiento.
                </span>
              </label>

              <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
                <button
                  type="button"
                  aria-label="Cerrar registro de persona"
                  disabled={saving}
                  onClick={closeCreate}
                  className="rounded-2xl border border-slate-200 px-6 py-3 text-xs font-black uppercase tracking-wider text-slate-600"
                >
                  Cancelar
                </button>
                <button
                  disabled={
                    saving ||
                    !consentContext?.notice ||
                    !form.collectionChannel ||
                    !createConsentAcceptedForCurrentNotice
                  }
                  type="submit"
                  className="inline-flex items-center justify-center gap-2 rounded-2xl bg-emerald-700 px-7 py-3 text-xs font-black uppercase tracking-wider text-white disabled:opacity-60"
                >
                  {saving ? (
                    <Loader2 className="animate-spin" size={16} role="status" aria-label="Cargando" />
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

      {grantTarget && (
        <div className="fixed inset-0 z-[80] flex items-center justify-center bg-slate-950/75 p-4 backdrop-blur-sm">
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="grant-consent-title"
            className="max-h-[92vh] w-full max-w-xl overflow-y-auto rounded-[2rem] bg-white shadow-2xl"
          >
            <div className="flex items-start justify-between border-b border-slate-100 p-7">
              <div>
                <div className="mb-3 inline-flex rounded-xl bg-emerald-50 p-2 text-emerald-700">
                  <UserCheck aria-hidden="true" size={20} />
                </div>
                <h2
                  id="grant-consent-title"
                  className="text-2xl font-black text-slate-950"
                >
                  Reautorizar consentimiento
                </h2>
                <p className="mt-2 text-sm text-slate-500">
                  {grantTarget.firstName} {grantTarget.lastName} ·{" "}
                  {grantTarget.documentIdMasked}
                </p>
              </div>
              <button
                type="button"
                aria-label="Cerrar"
                disabled={granting}
                onClick={closeGrant}
                className="rounded-xl p-2 text-slate-400 hover:bg-slate-100 disabled:opacity-50"
              >
                <X aria-hidden="true" />
              </button>
            </div>

            <form onSubmit={handleGrant} className="space-y-5 p-7">
              <p className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-sm leading-6 text-emerald-950">
                Esta operacion crea una nueva evidencia con fecha, responsable y
                versión {consentContext?.notice?.version ?? "no disponible"}. La
                evidencia histórica anterior permanece intacta.
              </p>
              {mutationError && (
                <div
                  role="alert"
                  className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm font-semibold text-red-700"
                >
                  {mutationError}
                </div>
              )}
              {consentContext?.notice && (
                <div className="rounded-2xl border border-blue-200 bg-blue-50 p-4 text-sm leading-6 text-blue-950">
                  <strong className="block">
                    {consentContext.notice.title}
                  </strong>
                  <p className="mt-2 whitespace-pre-line">
                    {consentContext.notice.content}
                  </p>
                  <p className="mt-2 text-xs font-semibold">
                    {consentContext.notice.controllerName} ·{" "}
                    {consentContext.notice.contactEmail}
                  </p>
                </div>
              )}
              <label className="block space-y-2 text-xs font-black uppercase tracking-wider text-slate-500">
                Canal real de la nueva autorizacion
                <select
                  required
                  disabled={!consentContext?.notice || granting}
                  value={grantChannel}
                  onChange={(event) =>
                    setGrantChannel(
                      event.target.value as CapturableConsentCollectionChannel,
                    )
                  }
                  className="min-h-12 w-full rounded-2xl border border-slate-200 bg-white px-4 text-sm font-semibold normal-case tracking-normal text-slate-900"
                >
                  <option value="">Selecciona el canal</option>
                  {CONSENT_CHANNEL_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </label>
              <label className="flex cursor-pointer items-start gap-4 rounded-2xl border border-emerald-200 bg-emerald-50/60 p-5">
                <input
                  type="checkbox"
                  disabled={!consentContext?.notice || granting}
                  checked={grantConfirmedForCurrentNotice}
                  onChange={(event) => {
                    const checked = event.target.checked;
                    setGrantConfirmed(checked);
                    setGrantAcceptedNoticeKey(
                      checked && currentConsentNoticeKey
                        ? currentConsentNoticeKey
                        : null,
                    );
                  }}
                  className="mt-1 h-5 w-5 accent-emerald-700"
                />
                <span className="text-sm font-semibold leading-6 text-slate-700">
                  Confirmo que comuniqué nuevamente el aviso vigente completo y
                  que la persona otorgó una nueva autorización expresa.
                </span>
              </label>
              <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
                <button
                  type="button"
                  disabled={granting}
                  onClick={closeGrant}
                  className="rounded-2xl border border-slate-200 px-6 py-3 text-xs font-black uppercase tracking-wider text-slate-600 disabled:opacity-50"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={
                    granting ||
                    !grantConfirmedForCurrentNotice ||
                    !grantChannel ||
                    !consentContext?.notice
                  }
                  className="inline-flex items-center justify-center gap-2 rounded-2xl bg-emerald-700 px-7 py-3 text-xs font-black uppercase tracking-wider text-white disabled:opacity-50"
                >
                  {granting ? (
                    <Loader2 className="animate-spin" size={16} role="status" aria-label="Cargando" />
                  ) : (
                    <UserCheck aria-hidden="true" size={16} />
                  )}
                  Confirmar nueva autorizacion
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
            className="max-h-[92vh] w-full max-w-xl overflow-y-auto rounded-[2rem] bg-white shadow-2xl"
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
                    <Loader2 className="animate-spin" size={16} role="status" aria-label="Cargando" />
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
    </main>
  );
}
