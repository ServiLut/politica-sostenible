"use client";

import { FormEvent, useCallback, useEffect, useRef, useState } from "react";
import {
  AlertCircle,
  ArrowDownLeft,
  ArrowUpRight,
  BadgeCheck,
  Ban,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Clock3,
  Inbox,
  Loader2,
  MessageSquarePlus,
  RefreshCw,
  ShieldCheck,
  UserRound,
  X,
} from "lucide-react";
import type { CommunicationChannel, IssueCase } from "@/lib/cases-api";
import { ApiError } from "@/lib/api-client";
import { getConsentNoticePresentationKey } from "@/lib/consent-notices-api";
import {
  createInteraction,
  CaseConsentStatus,
  CapturableConsentCollectionChannel,
  getCaseConsentStatus,
  grantCaseConsent,
  Interaction,
  InteractionDirection,
  InteractionPage,
  InteractionSentiment,
  listInteractions,
  revokeCaseConsent,
} from "@/lib/interactions-api";

const PAGE_SIZE = 10;

const CONSENT_CHANNEL_OPTIONS: ReadonlyArray<{
  value: CapturableConsentCollectionChannel;
  label: string;
}> = [
  { value: "IN_PERSON", label: "Autorización presencial" },
  { value: "PHONE", label: "Autorización por llamada" },
  { value: "WEB_FORM", label: "Formulario web" },
  { value: "PAPER", label: "Formato físico" },
];

const CHANNEL_OPTIONS: ReadonlyArray<{
  value: CommunicationChannel;
  label: string;
}> = [
  { value: "IN_PERSON", label: "Presencial" },
  { value: "PHONE", label: "Llamada" },
  { value: "WHATSAPP", label: "WhatsApp" },
  { value: "EMAIL", label: "Correo electrónico" },
  { value: "SMS", label: "SMS" },
  { value: "WEB", label: "Formulario web" },
  { value: "SOCIAL_MEDIA", label: "Red social" },
  { value: "LETTER", label: "Carta" },
  { value: "INTERNAL", label: "Gestión interna" },
];

const DIRECTION_OPTIONS: ReadonlyArray<{
  value: InteractionDirection;
  label: string;
}> = [
  { value: "INBOUND", label: "Recibida del ciudadano" },
  { value: "OUTBOUND", label: "Realizada por el equipo" },
  { value: "INTERNAL", label: "Gestión interna" },
];

const SENTIMENT_OPTIONS: ReadonlyArray<{
  value: InteractionSentiment;
  label: string;
}> = [
  { value: "POSITIVE", label: "Positivo" },
  { value: "NEUTRAL", label: "Neutral" },
  { value: "NEGATIVE", label: "Negativo" },
  { value: "MIXED", label: "Mixto" },
  { value: "UNKNOWN", label: "No determinado" },
];

interface InteractionFormState {
  channel: CommunicationChannel;
  direction: InteractionDirection;
  summary: string;
  outcome: string;
  sentiment: "" | InteractionSentiment;
  occurredAt: string;
}

const INITIAL_FORM: InteractionFormState = {
  channel: "PHONE",
  direction: "INBOUND",
  summary: "",
  outcome: "",
  sentiment: "",
  occurredAt: "",
};

function readableError(error: unknown): string {
  if (error instanceof ApiError) return error.message;
  if (error instanceof Error && error.message) return error.message;
  return "Ocurrió un error inesperado. Intenta nuevamente.";
}

function optionLabel<T extends string>(
  value: T,
  options: ReadonlyArray<{ value: T; label: string }>,
): string {
  return options.find((option) => option.value === value)?.label ?? value;
}

function formatDateTime(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Fecha no disponible";

  return new Intl.DateTimeFormat("es-CO", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}

function consentStatusLabel(consent: CaseConsentStatus | null): string {
  if (!consent?.status) return "Sin autorización registrada";
  if (consent.active) return "Autorización vigente";
  if (consent.requiresReconsent) return "Requiere nueva autorización";
  if (consent.status === "REVOKED") return "Autorización revocada";
  if (consent.status === "EXPIRED") return "Autorización vencida";
  return "Autorización no otorgada";
}

function consentPurposeLabel(consent: CaseConsentStatus | null): string {
  return consent?.purpose === "POLITICAL_COMMUNICATION"
    ? "Comunicaciones políticas"
    : "Seguimiento del servicio";
}

function consentChannelLabel(consent: CaseConsentStatus): string {
  if (consent.collectionChannel === "IMPORT") {
    return "Importado con evidencia";
  }
  if (!consent.collectionChannel) return "No disponible";
  return optionLabel(consent.collectionChannel, CONSENT_CHANNEL_OPTIONS);
}

function sentimentLabel(value: InteractionSentiment | null): string | null {
  if (!value) return null;
  return optionLabel(value, SENTIMENT_OPTIONS);
}

function directionIcon(direction: InteractionDirection) {
  if (direction === "INBOUND") {
    return <ArrowDownLeft aria-hidden="true" size={16} />;
  }
  if (direction === "OUTBOUND") {
    return <ArrowUpRight aria-hidden="true" size={16} />;
  }
  return <ShieldCheck aria-hidden="true" size={16} />;
}

function InteractionTimelineItem({
  interaction,
}: {
  interaction: Interaction;
}) {
  const sentiment = sentimentLabel(interaction.sentiment);

  return (
    <li className="relative pl-10">
      <span className="absolute left-0 top-0.5 flex h-8 w-8 items-center justify-center rounded-full border-4 border-white bg-blue-100 text-blue-800 ring-1 ring-blue-200">
        {directionIcon(interaction.direction)}
      </span>
      <article className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
          <div className="flex flex-wrap items-center gap-2">
            <span className="rounded-full bg-blue-50 px-2.5 py-1 text-[10px] font-black uppercase tracking-wider text-blue-800">
              {optionLabel(interaction.channel, CHANNEL_OPTIONS)}
            </span>
            <span className="rounded-full bg-slate-100 px-2.5 py-1 text-[10px] font-black uppercase tracking-wider text-slate-700">
              {optionLabel(interaction.direction, DIRECTION_OPTIONS)}
            </span>
            {sentiment && (
              <span className="rounded-full bg-amber-50 px-2.5 py-1 text-[10px] font-black uppercase tracking-wider text-amber-800">
                {sentiment}
              </span>
            )}
          </div>
          <time
            dateTime={interaction.occurredAt}
            className="inline-flex shrink-0 items-center gap-1.5 text-xs font-bold text-slate-500"
          >
            <Clock3 aria-hidden="true" size={14} />
            {formatDateTime(interaction.occurredAt)}
          </time>
        </div>

        <p className="mt-3 whitespace-pre-wrap text-sm font-semibold leading-6 text-slate-800">
          {interaction.summary}
        </p>

        {interaction.outcome && (
          <div className="mt-3 rounded-xl bg-emerald-50 px-3 py-2 text-sm text-emerald-950">
            <span className="font-black">Resultado: </span>
            <span className="whitespace-pre-wrap">{interaction.outcome}</span>
          </div>
        )}

        <div className="mt-3 flex items-center gap-2 border-t border-slate-100 pt-3 text-xs font-semibold text-slate-500">
          <UserRound aria-hidden="true" size={14} />
          <span>
            {interaction.actor?.name ?? "Usuario no disponible"}
            {interaction.actor?.role
              ? ` · ${interaction.actor.role.replaceAll("_", " ")}`
              : ""}
          </span>
        </div>
      </article>
    </li>
  );
}

export function CaseInteractionsPanel({
  issueCase,
  canCreate,
  canGrantConsent,
  canRevokeConsent,
  allowSentiment,
  onCreated,
  onClose,
}: {
  issueCase: IssueCase;
  canCreate: boolean;
  canGrantConsent: boolean;
  canRevokeConsent: boolean;
  allowSentiment?: boolean;
  onCreated: (interaction: Interaction) => void;
  onClose: () => void;
}) {
  const dialogRef = useRef<HTMLElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const closePanelRef = useRef(onClose);
  const savingRef = useRef(false);
  const [page, setPage] = useState(1);
  const [result, setResult] = useState<InteractionPage | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [reloadVersion, setReloadVersion] = useState(0);
  const [form, setForm] = useState<InteractionFormState>(INITIAL_FORM);
  const [saving, setSaving] = useState(false);
  const [mutationError, setMutationError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [consent, setConsent] = useState<CaseConsentStatus | null>(null);
  const [consentLoading, setConsentLoading] = useState(true);
  const [consentLoadError, setConsentLoadError] = useState<string | null>(null);
  const [consentMutation, setConsentMutation] = useState<
    "grant" | "revoke" | null
  >(null);
  const [consentMutationError, setConsentMutationError] = useState<
    string | null
  >(null);
  const [consentNotice, setConsentNotice] = useState<string | null>(null);
  const [consentAccepted, setConsentAccepted] = useState(false);
  const [acceptedConsentNoticeKey, setAcceptedConsentNoticeKey] = useState<
    string | null
  >(null);
  const [consentChannel, setConsentChannel] = useState<
    "" | CapturableConsentCollectionChannel
  >("");
  const [revocationReason, setRevocationReason] = useState("");
  const canCaptureSentiment =
    allowSentiment ?? issueCase.mode === "PUBLIC_OFFICE";
  const currentConsentNoticeKey = getConsentNoticePresentationKey(
    consent?.currentNotice,
  );
  const consentAcceptedForCurrentNotice =
    currentConsentNoticeKey !== null &&
    consentAccepted &&
    acceptedConsentNoticeKey === currentConsentNoticeKey;

  const closePanel = useCallback(() => {
    if (savingRef.current) return;
    setConsentAccepted(false);
    setAcceptedConsentNoticeKey(null);
    setConsentChannel("");
    onClose();
  }, [onClose]);

  useEffect(() => {
    closePanelRef.current = closePanel;
  }, [closePanel]);

  useEffect(() => {
    savingRef.current = saving || consentMutation !== null;
  }, [consentMutation, saving]);

  useEffect(() => {
    setConsentAccepted(false);
    setAcceptedConsentNoticeKey(null);
    setConsentChannel("");
  }, [currentConsentNoticeKey, issueCase.id, reloadVersion]);

  const loadInteractions = useCallback(
    (signal: AbortSignal) =>
      listInteractions(
        {
          issueCaseId: issueCase.id,
          page,
          limit: PAGE_SIZE,
        },
        signal,
      ),
    [issueCase.id, page],
  );

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setLoadError(null);

    void loadInteractions(controller.signal)
      .then((response) => {
        if (!controller.signal.aborted) setResult(response);
      })
      .catch((error: unknown) => {
        if (error instanceof DOMException && error.name === "AbortError")
          return;
        if (!controller.signal.aborted) setLoadError(readableError(error));
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });

    return () => controller.abort();
  }, [loadInteractions, reloadVersion]);

  useEffect(() => {
    const controller = new AbortController();
    setConsentLoading(true);
    setConsentLoadError(null);

    void getCaseConsentStatus(issueCase.id, controller.signal)
      .then((response) => {
        if (!controller.signal.aborted) setConsent(response);
      })
      .catch((error: unknown) => {
        if (error instanceof DOMException && error.name === "AbortError")
          return;
        if (!controller.signal.aborted) {
          setConsent(null);
          setConsentLoadError(readableError(error));
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) setConsentLoading(false);
      });

    return () => controller.abort();
  }, [issueCase.id, reloadVersion]);

  useEffect(() => {
    const previousOverflow = document.body.style.overflow;
    const previousFocus =
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null;
    document.body.style.overflow = "hidden";
    closeButtonRef.current?.focus();

    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !savingRef.current) {
        closePanelRef.current();
      }

      if (event.key !== "Tab" || !dialogRef.current) return;
      const focusable = Array.from(
        dialogRef.current.querySelectorAll<HTMLElement>(
          'button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [href], [tabindex]:not([tabindex="-1"])',
        ),
      ).filter((element) => element.getAttribute("aria-hidden") !== "true");
      const first = focusable[0];
      const last = focusable.at(-1);
      if (!first || !last) return;

      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    window.addEventListener("keydown", closeOnEscape);

    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", closeOnEscape);
      if (previousFocus?.isConnected) previousFocus.focus();
    };
  }, []);

  async function handleCreate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setMutationError(null);
    setNotice(null);

    try {
      const occurredAt = form.occurredAt
        ? new Date(form.occurredAt).toISOString()
        : undefined;
      const created = await createInteraction({
        issueCaseId: issueCase.id,
        channel: form.channel,
        direction: form.direction,
        summary: form.summary.trim(),
        outcome: form.outcome.trim() || undefined,
        sentiment: canCaptureSentiment
          ? form.sentiment || undefined
          : undefined,
        occurredAt,
      });

      setForm(INITIAL_FORM);
      setNotice("Gestión registrada y vinculada al caso.");
      setPage(1);
      setReloadVersion((value) => value + 1);
      onCreated(created);
    } catch (error: unknown) {
      setMutationError(readableError(error));
    } finally {
      setSaving(false);
    }
  }

  async function handleGrantConsent(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setConsentMutationError(null);
    setConsentNotice(null);

    if (!consent?.currentNotice) {
      setConsentMutationError(
        "La organización debe activar su aviso de privacidad antes de registrar autorizaciones.",
      );
      return;
    }
    const submittedNoticeKey = getConsentNoticePresentationKey(
      consent.currentNotice,
    );
    if (
      !consentAccepted ||
      !submittedNoticeKey ||
      acceptedConsentNoticeKey !== submittedNoticeKey
    ) {
      setConsentMutationError(
        "Confirma que la persona autorizó de forma previa, expresa e informada el aviso mostrado.",
      );
      return;
    }
    if (!consentChannel) {
      setConsentMutationError(
        "Selecciona el canal real en el que se obtuvo la autorización.",
      );
      return;
    }

    setConsentMutation("grant");
    try {
      const nextConsent = await grantCaseConsent({
        issueCaseId: issueCase.id,
        collectionChannel: consentChannel,
        noticeVersion: consent.currentNotice.version,
      });
      setConsent(nextConsent);
      setConsentAccepted(false);
      setAcceptedConsentNoticeKey(null);
      setConsentChannel("");
      setConsentNotice(
        "Autorización registrada con trazabilidad. Ya se permiten gestiones salientes mientras siga vigente.",
      );
    } catch (error: unknown) {
      setConsentMutationError(readableError(error));
    } finally {
      setConsentMutation(null);
    }
  }

  async function handleRevokeConsent(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setConsentMutationError(null);
    setConsentNotice(null);
    const reason = revocationReason.trim();
    if (reason.length < 10) {
      setConsentMutationError(
        "Describe el motivo de la revocación con al menos 10 caracteres.",
      );
      return;
    }

    setConsentMutation("revoke");
    try {
      const nextConsent = await revokeCaseConsent({
        issueCaseId: issueCase.id,
        reason,
      });
      setConsent(nextConsent);
      setRevocationReason("");
      setConsentNotice(
        "Autorización revocada. Las nuevas gestiones salientes quedaron bloqueadas.",
      );
    } catch (error: unknown) {
      setConsentMutationError(readableError(error));
    } finally {
      setConsentMutation(null);
    }
  }

  const interactions = result?.items ?? [];
  const totalPages = Math.max(1, result?.pagination.totalPages ?? 1);
  const outboundWithoutContact =
    form.direction === "OUTBOUND" &&
    !issueCase.voterId &&
    !issueCase.externalContactRef;
  const outboundWithoutConsent =
    form.direction === "OUTBOUND" &&
    !outboundWithoutContact &&
    (consentLoading || Boolean(consentLoadError) || !consent?.active);
  const outboundBlocked = outboundWithoutContact || outboundWithoutConsent;
  const busy = saving || consentMutation !== null;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-950/70 p-3 backdrop-blur-sm sm:p-5">
      <section
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="case-interactions-title"
        className="flex max-h-[95vh] w-full max-w-7xl flex-col overflow-hidden rounded-3xl bg-slate-50 shadow-2xl"
      >
        <header className="flex items-start justify-between gap-4 border-b border-slate-200 bg-white px-5 py-5 sm:px-7">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <span className="rounded-full bg-blue-50 px-3 py-1 text-[10px] font-black uppercase tracking-[0.18em] text-blue-800">
                {issueCase.reference}
              </span>
              <span className="rounded-full bg-slate-100 px-3 py-1 text-[10px] font-black uppercase tracking-wider text-slate-600">
                {result?.pagination.total ?? issueCase._count.interactions}{" "}
                gestiones
              </span>
            </div>
            <h2
              id="case-interactions-title"
              className="mt-2 truncate text-2xl font-black tracking-tight text-slate-950"
            >
              Bitácora del caso
            </h2>
            <p className="mt-1 truncate text-sm font-semibold text-slate-500">
              {issueCase.title}
            </p>
          </div>
          <button
            ref={closeButtonRef}
            type="button"
            aria-label="Cerrar bitácora del caso"
            disabled={busy}
            onClick={closePanel}
            className="shrink-0 rounded-xl p-2 text-slate-500 transition hover:bg-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-600 disabled:opacity-40"
          >
            <X aria-hidden="true" />
          </button>
        </header>

        <div className="grid min-h-0 flex-1 overflow-y-auto xl:grid-cols-[minmax(0,1.35fr)_minmax(360px,0.65fr)]">
          <div className="min-w-0 p-5 sm:p-7" aria-busy={loading}>
            <div className="mb-5 flex items-center justify-between gap-4">
              <div>
                <h3 className="text-lg font-black text-slate-950">
                  Historial de contacto
                </h3>
                <p className="mt-1 text-xs font-semibold text-slate-500">
                  Ordenado de la gestión más reciente a la más antigua.
                </p>
              </div>
              {!loading && !loadError && (
                <button
                  type="button"
                  aria-label="Actualizar historial"
                  onClick={() => setReloadVersion((value) => value + 1)}
                  className="rounded-xl border border-slate-200 bg-white p-2.5 text-slate-600 hover:text-blue-700"
                >
                  <RefreshCw aria-hidden="true" size={16} />
                </button>
              )}
            </div>

            {loading ? (
              <div
                role="status"
                className="flex min-h-72 flex-col items-center justify-center gap-3 rounded-2xl border border-slate-200 bg-white text-sm font-bold text-slate-500"
              >
                <Loader2
                  className="animate-spin text-blue-700"
                  aria-hidden="true"
                />
                Consultando la bitácora segura…
              </div>
            ) : loadError ? (
              <div
                role="alert"
                className="flex min-h-72 flex-col items-center justify-center gap-4 rounded-2xl border border-red-200 bg-red-50 p-7 text-center text-red-800"
              >
                <AlertCircle aria-hidden="true" size={30} />
                <div>
                  <p className="font-black">
                    No fue posible cargar la bitácora
                  </p>
                  <p className="mt-1 max-w-md text-sm font-semibold">
                    {loadError}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setReloadVersion((value) => value + 1)}
                  className="inline-flex min-h-10 items-center gap-2 rounded-xl bg-red-700 px-4 text-xs font-black uppercase tracking-wider text-white"
                >
                  <RefreshCw aria-hidden="true" size={15} /> Reintentar
                </button>
              </div>
            ) : interactions.length === 0 ? (
              <div className="flex min-h-72 flex-col items-center justify-center rounded-2xl border border-dashed border-slate-300 bg-white p-7 text-center">
                <Inbox
                  className="text-slate-300"
                  aria-hidden="true"
                  size={40}
                />
                <p className="mt-3 font-black text-slate-900">
                  Este caso aún no tiene gestiones
                </p>
                <p className="mt-1 max-w-md text-sm font-semibold text-slate-500">
                  La bitácora comenzará cuando el equipo registre el primer
                  contacto real.
                </p>
              </div>
            ) : (
              <ol className="relative space-y-4 before:absolute before:bottom-4 before:left-4 before:top-4 before:w-px before:bg-blue-200">
                {interactions.map((interaction) => (
                  <InteractionTimelineItem
                    key={interaction.id}
                    interaction={interaction}
                  />
                ))}
              </ol>
            )}

            {!loading && !loadError && result && totalPages > 1 && (
              <nav
                aria-label="Paginación de la bitácora"
                className="mt-5 flex items-center justify-between gap-3"
              >
                <button
                  type="button"
                  disabled={page <= 1}
                  onClick={() => setPage((value) => value - 1)}
                  className="inline-flex min-h-10 items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 text-xs font-black uppercase tracking-wider text-slate-700 disabled:opacity-40"
                >
                  <ChevronLeft aria-hidden="true" size={15} /> Anterior
                </button>
                <span className="text-xs font-bold text-slate-500">
                  Página {page} de {totalPages}
                </span>
                <button
                  type="button"
                  disabled={page >= totalPages}
                  onClick={() => setPage((value) => value + 1)}
                  className="inline-flex min-h-10 items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 text-xs font-black uppercase tracking-wider text-slate-700 disabled:opacity-40"
                >
                  Siguiente <ChevronRight aria-hidden="true" size={15} />
                </button>
              </nav>
            )}
          </div>

          <aside className="border-t border-slate-200 bg-white p-5 sm:p-7 xl:border-l xl:border-t-0">
            <div className="space-y-7 xl:sticky xl:top-0">
              <section
                aria-labelledby="case-consent-title"
                className="rounded-2xl border border-slate-200 bg-slate-50 p-4"
              >
                <div className="flex items-start gap-3">
                  <span
                    className={`rounded-xl p-2 ${
                      consent?.active
                        ? "bg-emerald-100 text-emerald-800"
                        : "bg-amber-100 text-amber-800"
                    }`}
                  >
                    {consent?.active ? (
                      <BadgeCheck aria-hidden="true" size={20} />
                    ) : (
                      <Ban aria-hidden="true" size={20} />
                    )}
                  </span>
                  <div className="min-w-0">
                    <h3
                      id="case-consent-title"
                      className="text-base font-black text-slate-950"
                    >
                      Permiso de contacto
                    </h3>
                    <p className="mt-1 text-xs font-semibold leading-5 text-slate-600">
                      {consentPurposeLabel(consent)}. El estado se consulta en
                      la API y no muestra datos personales.
                    </p>
                  </div>
                </div>

                {consentLoading ? (
                  <div
                    role="status"
                    className="mt-4 flex items-center gap-2 rounded-xl bg-white p-3 text-xs font-bold text-slate-600"
                  >
                    <Loader2
                      className="animate-spin"
                      aria-hidden="true"
                      size={15}
                    />
                    Verificando autorización vigente…
                  </div>
                ) : consentLoadError ? (
                  <div
                    role="alert"
                    className="mt-4 rounded-xl border border-red-200 bg-red-50 p-3 text-xs font-semibold leading-5 text-red-900"
                  >
                    <strong className="block font-black">
                      No se pudo verificar el permiso
                    </strong>
                    {consentLoadError}
                    <button
                      type="button"
                      onClick={() => setReloadVersion((value) => value + 1)}
                      className="mt-3 inline-flex min-h-9 items-center gap-2 rounded-lg bg-red-700 px-3 text-[10px] font-black uppercase tracking-wider text-white"
                    >
                      <RefreshCw aria-hidden="true" size={14} /> Reintentar
                    </button>
                  </div>
                ) : (
                  <div
                    role="status"
                    className={`mt-4 rounded-xl border p-3 ${
                      consent?.active
                        ? "border-emerald-200 bg-emerald-50 text-emerald-950"
                        : "border-amber-200 bg-amber-50 text-amber-950"
                    }`}
                  >
                    <p className="text-sm font-black">
                      {consentStatusLabel(consent)}
                    </p>
                    {consent?.recordedAt && (
                      <dl className="mt-2 grid gap-1 text-xs font-semibold leading-5">
                        <div className="flex flex-wrap justify-between gap-2">
                          <dt>Registrado</dt>
                          <dd>{formatDateTime(consent.recordedAt)}</dd>
                        </div>
                        {consent.collectionChannel && (
                          <div className="flex flex-wrap justify-between gap-2">
                            <dt>Canal</dt>
                            <dd>{consentChannelLabel(consent)}</dd>
                          </div>
                        )}
                        {consent.expiresAt && (
                          <div className="flex flex-wrap justify-between gap-2">
                            <dt>Vence</dt>
                            <dd>{formatDateTime(consent.expiresAt)}</dd>
                          </div>
                        )}
                        <div className="flex flex-wrap justify-between gap-2">
                          <dt>Aviso</dt>
                          <dd>{consent.noticeVersion ?? "No disponible"}</dd>
                        </div>
                      </dl>
                    )}
                  </div>
                )}

                {(consentNotice || consentMutationError) && (
                  <div
                    role={consentMutationError ? "alert" : "status"}
                    aria-live="polite"
                    className={`mt-4 rounded-xl border p-3 text-xs font-bold leading-5 ${
                      consentMutationError
                        ? "border-red-200 bg-red-50 text-red-900"
                        : "border-emerald-200 bg-emerald-50 text-emerald-900"
                    }`}
                  >
                    {consentMutationError ?? consentNotice}
                  </div>
                )}

                {!consentLoading &&
                  !consentLoadError &&
                  consent !== null &&
                  !consent.active &&
                  canGrantConsent && (
                    <form
                      onSubmit={handleGrantConsent}
                      className="mt-4 space-y-3 border-t border-slate-200 pt-4"
                    >
                      <p className="text-xs font-semibold leading-5 text-slate-700">
                        Registra la autorización solo después de explicar la
                        finalidad, los canales de contacto y cómo revocarla. La
                        hora la fija el servidor.
                      </p>
                      {consent.currentNotice ? (
                        <div className="rounded-xl border border-blue-200 bg-blue-50 p-3 text-xs font-semibold leading-5 text-blue-950">
                          <p className="font-black">
                            {consent.currentNotice.title} · versión{" "}
                            {consent.currentNotice.version}
                          </p>
                          <p className="mt-2 whitespace-pre-line">
                            {consent.currentNotice.content}
                          </p>
                          <p className="mt-2">
                            Responsable: {consent.currentNotice.controllerName}{" "}
                            · {consent.currentNotice.contactEmail}
                          </p>
                        </div>
                      ) : (
                        <div
                          role="alert"
                          className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs font-semibold leading-5 text-amber-950"
                        >
                          No hay un aviso de privacidad activo. Administración
                          debe configurarlo antes de continuar.
                        </div>
                      )}
                      <label className="block space-y-1.5 text-[10px] font-black uppercase tracking-wider text-slate-600">
                        Canal de autorización
                        <select
                          required
                          aria-label="Canal de autorización"
                          disabled={!consent.currentNotice}
                          value={consentChannel}
                          onChange={(event) =>
                            setConsentChannel(
                              event.target
                                .value as CapturableConsentCollectionChannel,
                            )
                          }
                          className="min-h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm font-semibold normal-case tracking-normal text-slate-900"
                        >
                          <option value="">Selecciona el canal</option>
                          {CONSENT_CHANNEL_OPTIONS.map((option) => (
                            <option key={option.value} value={option.value}>
                              {option.label}
                            </option>
                          ))}
                        </select>
                      </label>
                      <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-blue-200 bg-blue-50 p-3 text-xs font-semibold leading-5 text-blue-950">
                        <input
                          required
                          type="checkbox"
                          disabled={!consent.currentNotice}
                          checked={consentAcceptedForCurrentNotice}
                          onChange={(event) => {
                            const checked = event.target.checked;
                            setConsentAccepted(checked);
                            setAcceptedConsentNoticeKey(
                              checked && currentConsentNoticeKey
                                ? currentConsentNoticeKey
                                : null,
                            );
                          }}
                          className="mt-0.5 h-4 w-4 shrink-0 accent-blue-700"
                        />
                        <span>
                          Confirmo que la persona autorizó de forma previa,
                          expresa e informada el{" "}
                          {consentPurposeLabel(consent).toLowerCase()} y conoció
                          el aviso de privacidad versión{" "}
                          {consent.currentNotice?.version ?? "no configurada"}.
                        </span>
                      </label>
                      <button
                        type="submit"
                        disabled={
                          consentMutation !== null ||
                          !consentAcceptedForCurrentNotice ||
                          !consentChannel ||
                          !consent.currentNotice
                        }
                        className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-xl bg-emerald-700 px-4 text-[10px] font-black uppercase tracking-wider text-white transition hover:bg-emerald-800 disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        {consentMutation === "grant" ? (
                          <Loader2
                            className="animate-spin"
                            aria-hidden="true"
                            size={15}
                          />
                        ) : (
                          <BadgeCheck aria-hidden="true" size={16} />
                        )}
                        Registrar autorización
                      </button>
                    </form>
                  )}

                {!consentLoading &&
                  !consentLoadError &&
                  consent?.active &&
                  canRevokeConsent && (
                    <form
                      onSubmit={handleRevokeConsent}
                      className="mt-4 space-y-3 border-t border-slate-200 pt-4"
                    >
                      <label className="block space-y-1.5 text-[10px] font-black uppercase tracking-wider text-slate-600">
                        Motivo de revocación
                        <textarea
                          required
                          minLength={10}
                          maxLength={500}
                          rows={3}
                          value={revocationReason}
                          onChange={(event) =>
                            setRevocationReason(event.target.value)
                          }
                          placeholder="Ej. Solicitud expresa recibida por la persona"
                          className="w-full resize-y rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold leading-5 normal-case tracking-normal text-slate-900"
                        />
                      </label>
                      <button
                        type="submit"
                        disabled={
                          consentMutation !== null ||
                          revocationReason.trim().length < 10
                        }
                        className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-xl border border-red-300 bg-white px-4 text-[10px] font-black uppercase tracking-wider text-red-800 transition hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        {consentMutation === "revoke" ? (
                          <Loader2
                            className="animate-spin"
                            aria-hidden="true"
                            size={15}
                          />
                        ) : (
                          <Ban aria-hidden="true" size={16} />
                        )}
                        Revocar autorización
                      </button>
                    </form>
                  )}
              </section>

              {canCreate && (
                <section aria-labelledby="register-interaction-title">
                  <div className="mb-5 flex items-start gap-3">
                    <span className="rounded-xl bg-blue-100 p-2 text-blue-800">
                      <MessageSquarePlus aria-hidden="true" size={20} />
                    </span>
                    <div>
                      <h3
                        id="register-interaction-title"
                        className="text-lg font-black text-slate-950"
                      >
                        Registrar gestión
                      </h3>
                      <p className="mt-1 text-xs font-semibold leading-5 text-slate-500">
                        Documenta únicamente información necesaria para atender
                        este caso.
                      </p>
                    </div>
                  </div>

                  {(notice || mutationError) && (
                    <div
                      role={mutationError ? "alert" : "status"}
                      className={`mb-4 flex items-start gap-2 rounded-xl border p-3 text-sm font-bold ${
                        mutationError
                          ? "border-red-200 bg-red-50 text-red-800"
                          : "border-emerald-200 bg-emerald-50 text-emerald-800"
                      }`}
                    >
                      {mutationError ? (
                        <AlertCircle
                          className="mt-0.5 shrink-0"
                          aria-hidden="true"
                          size={16}
                        />
                      ) : (
                        <CheckCircle2
                          className="mt-0.5 shrink-0"
                          aria-hidden="true"
                          size={16}
                        />
                      )}
                      {mutationError ?? notice}
                    </div>
                  )}

                  <form onSubmit={handleCreate} className="space-y-4">
                    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-1 2xl:grid-cols-2">
                      <label className="space-y-1.5 text-xs font-black uppercase tracking-wider text-slate-600">
                        Canal
                        <select
                          required
                          value={form.channel}
                          onChange={(event) => {
                            const channel = event.target
                              .value as CommunicationChannel;
                            setForm((current) => ({
                              ...current,
                              channel,
                              direction:
                                channel === "INTERNAL"
                                  ? "INTERNAL"
                                  : current.direction === "INTERNAL"
                                    ? "INBOUND"
                                    : current.direction,
                            }));
                          }}
                          className="min-h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm font-semibold normal-case tracking-normal text-slate-900"
                        >
                          {CHANNEL_OPTIONS.map((option) => (
                            <option key={option.value} value={option.value}>
                              {option.label}
                            </option>
                          ))}
                        </select>
                      </label>
                      <label className="space-y-1.5 text-xs font-black uppercase tracking-wider text-slate-600">
                        Dirección
                        <select
                          required
                          value={form.direction}
                          onChange={(event) => {
                            const direction = event.target
                              .value as InteractionDirection;
                            setForm((current) => ({
                              ...current,
                              direction,
                              channel:
                                direction === "INTERNAL"
                                  ? "INTERNAL"
                                  : current.channel === "INTERNAL"
                                    ? "PHONE"
                                    : current.channel,
                            }));
                          }}
                          className="min-h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm font-semibold normal-case tracking-normal text-slate-900"
                        >
                          {DIRECTION_OPTIONS.map((option) => (
                            <option key={option.value} value={option.value}>
                              {option.label}
                            </option>
                          ))}
                        </select>
                      </label>
                    </div>

                    <label className="block space-y-1.5 text-xs font-black uppercase tracking-wider text-slate-600">
                      Resumen de la gestión
                      <textarea
                        required
                        minLength={3}
                        maxLength={5000}
                        rows={5}
                        value={form.summary}
                        onChange={(event) =>
                          setForm((current) => ({
                            ...current,
                            summary: event.target.value,
                          }))
                        }
                        placeholder="Qué informó el ciudadano y qué gestión realizó el equipo"
                        className="w-full resize-y rounded-xl border border-slate-200 px-4 py-3 text-sm font-semibold leading-6 normal-case tracking-normal text-slate-900 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                      />
                      <span className="block text-right text-[10px] font-bold text-slate-400">
                        {form.summary.length}/5000
                      </span>
                    </label>

                    <label className="block space-y-1.5 text-xs font-black uppercase tracking-wider text-slate-600">
                      Resultado (opcional)
                      <textarea
                        maxLength={1000}
                        rows={3}
                        value={form.outcome}
                        onChange={(event) =>
                          setForm((current) => ({
                            ...current,
                            outcome: event.target.value,
                          }))
                        }
                        placeholder="Ej. Información entregada; ciudadano enviará soporte"
                        className="w-full resize-y rounded-xl border border-slate-200 px-4 py-3 text-sm font-semibold leading-6 normal-case tracking-normal text-slate-900 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                      />
                    </label>

                    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-1 2xl:grid-cols-2">
                      {canCaptureSentiment && (
                        <label className="space-y-1.5 text-xs font-black uppercase tracking-wider text-slate-600">
                          Percepción (opcional)
                          <select
                            value={form.sentiment}
                            onChange={(event) =>
                              setForm((current) => ({
                                ...current,
                                sentiment: event.target
                                  .value as InteractionFormState["sentiment"],
                              }))
                            }
                            className="min-h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm font-semibold normal-case tracking-normal text-slate-900"
                          >
                            <option value="">No registrar</option>
                            {SENTIMENT_OPTIONS.map((option) => (
                              <option key={option.value} value={option.value}>
                                {option.label}
                              </option>
                            ))}
                          </select>
                        </label>
                      )}
                      <label className="space-y-1.5 text-xs font-black uppercase tracking-wider text-slate-600">
                        Fecha y hora
                        <input
                          type="datetime-local"
                          value={form.occurredAt}
                          onChange={(event) =>
                            setForm((current) => ({
                              ...current,
                              occurredAt: event.target.value,
                            }))
                          }
                          className="min-h-11 w-full rounded-xl border border-slate-200 px-3 text-sm font-semibold normal-case tracking-normal text-slate-900"
                        />
                      </label>
                    </div>

                    <p className="rounded-xl bg-slate-50 p-3 text-xs font-semibold leading-5 text-slate-600">
                      Si queda una acción pendiente, regístrala en el módulo de
                      Tareas para asignar responsable y vencimiento.
                    </p>

                    {form.direction === "OUTBOUND" && (
                      <div
                        id="outbound-consent-control"
                        role={outboundBlocked ? "alert" : "status"}
                        className={`rounded-xl border p-3 text-xs font-semibold leading-5 ${
                          outboundBlocked
                            ? "border-red-200 bg-red-50 text-red-900"
                            : "border-emerald-200 bg-emerald-50 text-emerald-950"
                        }`}
                      >
                        <strong className="block font-black">
                          Control obligatorio de consentimiento
                        </strong>
                        {outboundWithoutContact
                          ? "Este caso no tiene un ciudadano o contacto externo relacionado. Vincúlalo antes de registrar una gestión saliente."
                          : consentLoading
                            ? "Estamos verificando el permiso vigente antes de habilitar esta gestión."
                            : consentLoadError
                              ? "No fue posible verificar el permiso. Reintenta la consulta antes de contactar a la persona."
                              : consent?.active
                                ? "Autorización vigente verificada. La API volverá a validarla al guardar."
                                : "No hay una autorización vigente. Regístrala arriba antes de contactar a la persona."}
                      </div>
                    )}

                    <button
                      type="submit"
                      aria-describedby={
                        form.direction === "OUTBOUND"
                          ? "outbound-consent-control"
                          : undefined
                      }
                      disabled={saving || outboundBlocked}
                      className="inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-blue-700 px-5 text-xs font-black uppercase tracking-wider text-white transition hover:bg-slate-950 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      {saving ? (
                        <Loader2
                          className="animate-spin"
                          aria-hidden="true"
                          size={17}
                        />
                      ) : (
                        <MessageSquarePlus aria-hidden="true" size={17} />
                      )}
                      Guardar en bitácora
                    </button>
                  </form>
                </section>
              )}
            </div>
          </aside>
        </div>
      </section>
    </div>
  );
}
