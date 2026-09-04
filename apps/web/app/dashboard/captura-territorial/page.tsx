"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";
import {
  AlertCircle,
  CheckCircle2,
  Loader2,
  MapPin,
  RefreshCw,
  ShieldCheck,
  UserPlus,
} from "lucide-react";
import { ApiError } from "@/lib/api-client";
import { getConsentNoticePresentationKey } from "@/lib/consent-notices-api";
import type { CapturableConsentCollectionChannel } from "@/lib/interactions-api";
import {
  createVoter,
  getVoterCaptureContext,
  type CreateVoterInput,
  type VoterCaptureContext,
} from "@/lib/voters-api";

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

export default function CapturaTerritorialPage() {
  const [context, setContext] = useState<VoterCaptureContext | null>(null);
  const [selectedPuestoId, setSelectedPuestoId] = useState("");
  const [form, setForm] = useState(EMPTY_FORM);
  const [loadingContext, setLoadingContext] = useState(true);
  const [contextError, setContextError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [reload, setReload] = useState(0);
  const [acceptedNoticeKey, setAcceptedNoticeKey] = useState<string | null>(
    null,
  );

  const loadContext = useCallback(async (signal: AbortSignal) => {
    setLoadingContext(true);
    setContextError(null);
    setAcceptedNoticeKey(null);
    setForm((current) => ({
      ...current,
      collectionChannel: "",
      consentAccepted: false,
    }));

    try {
      const response = await getVoterCaptureContext(signal);
      if (signal.aborted) return;

      setContext(response);
      setSelectedPuestoId((current) => {
        if (response.puestos.some(({ id }) => id === current)) return current;
        return response.puestos.length === 1 ? response.puestos[0].id : "";
      });
    } catch (error: unknown) {
      if (signal.aborted) return;
      setContext(null);
      setSelectedPuestoId("");
      setContextError(
        readableError(
          error,
          "No fue posible consultar tu asignación territorial.",
        ),
      );
    } finally {
      if (!signal.aborted) setLoadingContext(false);
    }
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    void loadContext(controller.signal);
    return () => controller.abort();
  }, [loadContext, reload]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFormError(null);
    setNotice(null);

    const puestoIsAllowed = context?.puestos.some(
      ({ id }) => id === selectedPuestoId,
    );
    if (!puestoIsAllowed) {
      setFormError(
        "Selecciona un puesto habilitado dentro de tu asignación territorial.",
      );
      return;
    }

    if (!context?.consentNotice) {
      setFormError(
        "La organización debe activar su aviso de privacidad antes de capturar datos.",
      );
      return;
    }
    const submittedNoticeKey = getConsentNoticePresentationKey(
      context.consentNotice,
    );
    if (
      !form.consentAccepted ||
      !submittedNoticeKey ||
      acceptedNoticeKey !== submittedNoticeKey
    ) {
      setFormError(
        "Confirma la autorización expresa para el aviso de privacidad mostrado antes de guardar.",
      );
      return;
    }
    if (!form.collectionChannel) {
      setFormError(
        "Selecciona el canal real usado para obtener la autorización.",
      );
      return;
    }

    const payload: CreateVoterInput = {
      documentId: form.documentId.trim(),
      firstName: form.firstName.trim(),
      lastName: form.lastName.trim(),
      puestoId: selectedPuestoId,
      consentAccepted: true,
      termsVersion: context.consentNotice.version,
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
      setAcceptedNoticeKey(null);
      setNotice(
        "Nueva vinculacion guardada con trazabilidad. Puedes registrar a la siguiente persona.",
      );
    } catch (error: unknown) {
      setFormError(
        readableError(error, "No fue posible guardar la captura territorial."),
      );
    } finally {
      setSaving(false);
    }
  }

  const puestos = context?.puestos ?? [];
  const hasPuestos = puestos.length > 0;
  const consentNotice = context?.consentNotice ?? null;
  const displayedNoticeKey = getConsentNoticePresentationKey(consentNotice);
  const consentAcceptedForDisplayedNotice =
    displayedNoticeKey !== null &&
    form.consentAccepted &&
    acceptedNoticeKey === displayedNoticeKey;

  return (
    <div className="mx-auto max-w-5xl space-y-7">
      <header className="overflow-hidden rounded-[2rem] bg-slate-950 px-6 py-8 text-white shadow-xl sm:px-9">
        <div className="flex flex-col gap-6 md:flex-row md:items-end md:justify-between">
          <div className="max-w-2xl">
            <span className="inline-flex items-center gap-2 rounded-full bg-emerald-400/15 px-3 py-1 text-[10px] font-black uppercase tracking-[0.18em] text-emerald-300">
              <ShieldCheck aria-hidden="true" size={14} /> Captura autorizada
            </span>
            <h1 className="mt-4 text-3xl font-black tracking-tight sm:text-4xl">
              Vinculación en territorio
            </h1>
            <p className="mt-3 max-w-xl text-sm leading-6 text-slate-300">
              Registra únicamente información entregada por la persona y
              confirma su autorización. El sistema fija la organización, el
              responsable y el alcance territorial desde tu sesión.
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-3 rounded-2xl border border-slate-700 bg-slate-900 px-4 py-3 text-xs font-bold text-slate-200">
            <MapPin aria-hidden="true" className="text-emerald-400" size={19} />
            Puestos verificados por la API
          </div>
        </div>
      </header>

      {notice && (
        <div
          role="status"
          className="flex items-start gap-3 rounded-2xl border border-emerald-200 bg-emerald-50 p-5 text-sm font-semibold text-emerald-900"
        >
          <CheckCircle2
            aria-hidden="true"
            className="mt-0.5 shrink-0 text-emerald-700"
            size={20}
          />
          {notice}
        </div>
      )}

      <section className="rounded-[2rem] border border-slate-200 bg-white shadow-sm">
        <div className="border-b border-slate-100 px-6 py-6 sm:px-8">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-[10px] font-black uppercase tracking-[0.18em] text-emerald-700">
                Paso 1 · Alcance operativo
              </p>
              <h2 className="mt-1 text-xl font-black text-slate-950">
                Puesto de votación asignado
              </h2>
            </div>
            <button
              type="button"
              onClick={() => setReload((value) => value + 1)}
              disabled={loadingContext}
              className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-slate-200 px-4 text-xs font-black uppercase tracking-wider text-slate-600 disabled:opacity-50"
            >
              <RefreshCw
                aria-hidden="true"
                className={loadingContext ? "animate-spin" : undefined}
                size={15}
              />
              Actualizar asignación
            </button>
          </div>

          {loadingContext ? (
            <div
              role="status"
              className="mt-5 flex items-center gap-3 rounded-2xl bg-slate-50 p-5 text-sm font-semibold text-slate-600"
            >
              <Loader2 aria-hidden="true" className="animate-spin" size={18} />
              Consultando tu alcance territorial vigente...
            </div>
          ) : contextError ? (
            <div
              role="alert"
              className="mt-5 flex items-start gap-3 rounded-2xl border border-red-200 bg-red-50 p-5 text-sm font-semibold text-red-800"
            >
              <AlertCircle aria-hidden="true" className="mt-0.5" size={19} />
              {contextError}
            </div>
          ) : !hasPuestos ? (
            <div
              role="alert"
              className="mt-5 flex items-start gap-3 rounded-2xl border border-amber-200 bg-amber-50 p-5 text-sm leading-6 text-amber-900"
            >
              <AlertCircle
                aria-hidden="true"
                className="mt-0.5 shrink-0"
                size={19}
              />
              No tienes puestos de votación habilitados. Solicita a la
              administración que revise tu asignación antes de capturar datos.
            </div>
          ) : puestos.length === 1 ? (
            <div className="mt-5 flex items-center gap-4 rounded-2xl border border-emerald-200 bg-emerald-50/70 p-5">
              <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-emerald-700 text-white">
                <MapPin aria-hidden="true" size={20} />
              </span>
              <div>
                <p className="text-sm font-black text-slate-950">
                  {puestos[0].name}
                </p>
                <p className="mt-1 text-xs font-semibold text-slate-500">
                  Código {puestos[0].code} · selección automática
                </p>
              </div>
            </div>
          ) : (
            <label className="mt-5 block space-y-2 text-xs font-black uppercase tracking-wider text-slate-500">
              Puesto habilitado
              <select
                required
                value={selectedPuestoId}
                onChange={(event) => setSelectedPuestoId(event.target.value)}
                className="min-h-12 w-full rounded-2xl border border-slate-200 bg-white px-4 text-sm font-semibold normal-case tracking-normal text-slate-900 focus:border-emerald-600 focus:outline-none focus:ring-2 focus:ring-emerald-100"
              >
                <option value="">Selecciona un puesto</option>
                {puestos.map((puesto) => (
                  <option key={puesto.id} value={puesto.id}>
                    {puesto.name} · {puesto.code}
                  </option>
                ))}
              </select>
              <span className="block text-[11px] font-medium normal-case tracking-normal text-slate-500">
                Solo aparecen puestos incluidos en tu asignación vigente.
              </span>
            </label>
          )}
        </div>

        <form onSubmit={handleSubmit} className="space-y-7 px-6 py-7 sm:px-8">
          <div>
            <p className="text-[10px] font-black uppercase tracking-[0.18em] text-emerald-700">
              Paso 2 · Datos consentidos
            </p>
            <h2 className="mt-1 text-xl font-black text-slate-950">
              Información de la persona
            </h2>
          </div>

          {formError && (
            <div
              role="alert"
              className="flex items-start gap-3 rounded-2xl border border-red-200 bg-red-50 p-5 text-sm font-semibold text-red-800"
            >
              <AlertCircle aria-hidden="true" className="mt-0.5" size={19} />
              {formError}
            </div>
          )}

          <div className="grid gap-5 md:grid-cols-2">
            <label className="space-y-2 text-xs font-black uppercase tracking-wider text-slate-500">
              Nombres
              <input
                required
                maxLength={100}
                autoComplete="off"
                value={form.firstName}
                onChange={(event) =>
                  setForm({ ...form, firstName: event.target.value })
                }
                className="min-h-12 w-full rounded-2xl border border-slate-200 px-4 text-sm font-semibold normal-case tracking-normal text-slate-900 focus:border-emerald-600 focus:outline-none focus:ring-2 focus:ring-emerald-100"
              />
            </label>
            <label className="space-y-2 text-xs font-black uppercase tracking-wider text-slate-500">
              Apellidos
              <input
                required
                maxLength={100}
                autoComplete="off"
                value={form.lastName}
                onChange={(event) =>
                  setForm({ ...form, lastName: event.target.value })
                }
                className="min-h-12 w-full rounded-2xl border border-slate-200 px-4 text-sm font-semibold normal-case tracking-normal text-slate-900 focus:border-emerald-600 focus:outline-none focus:ring-2 focus:ring-emerald-100"
              />
            </label>
            <label className="space-y-2 text-xs font-black uppercase tracking-wider text-slate-500">
              Documento
              <input
                required
                inputMode="numeric"
                pattern="[0-9]{5,15}"
                maxLength={15}
                autoComplete="off"
                value={form.documentId}
                onChange={(event) =>
                  setForm({ ...form, documentId: event.target.value })
                }
                className="min-h-12 w-full rounded-2xl border border-slate-200 px-4 font-mono text-sm font-semibold normal-case tracking-normal text-slate-900 focus:border-emerald-600 focus:outline-none focus:ring-2 focus:ring-emerald-100"
              />
            </label>
            <label className="space-y-2 text-xs font-black uppercase tracking-wider text-slate-500">
              Celular opcional
              <input
                inputMode="tel"
                maxLength={24}
                autoComplete="off"
                value={form.phone}
                onChange={(event) =>
                  setForm({ ...form, phone: event.target.value })
                }
                className="min-h-12 w-full rounded-2xl border border-slate-200 px-4 text-sm font-semibold normal-case tracking-normal text-slate-900 focus:border-emerald-600 focus:outline-none focus:ring-2 focus:ring-emerald-100"
              />
            </label>
            <label className="space-y-2 text-xs font-black uppercase tracking-wider text-slate-500">
              Correo opcional
              <input
                type="email"
                maxLength={254}
                autoComplete="off"
                value={form.email}
                onChange={(event) =>
                  setForm({ ...form, email: event.target.value })
                }
                className="min-h-12 w-full rounded-2xl border border-slate-200 px-4 text-sm font-semibold normal-case tracking-normal text-slate-900 focus:border-emerald-600 focus:outline-none focus:ring-2 focus:ring-emerald-100"
              />
            </label>
            <label className="space-y-2 text-xs font-black uppercase tracking-wider text-slate-500">
              Mesa opcional
              <input
                type="number"
                min={1}
                max={99999}
                inputMode="numeric"
                value={form.mesa}
                onChange={(event) =>
                  setForm({ ...form, mesa: event.target.value })
                }
                className="min-h-12 w-full rounded-2xl border border-slate-200 px-4 text-sm font-semibold normal-case tracking-normal text-slate-900 focus:border-emerald-600 focus:outline-none focus:ring-2 focus:ring-emerald-100"
              />
            </label>
          </div>

          {consentNotice ? (
            <section className="rounded-2xl border border-blue-200 bg-blue-50 p-5 text-sm leading-6 text-blue-950">
              <p className="text-[10px] font-black uppercase tracking-wider text-blue-700">
                Aviso vigente · {consentNotice.version}
              </p>
              <h3 className="mt-1 font-black">{consentNotice.title}</h3>
              <p className="mt-2 whitespace-pre-line">
                {consentNotice.content}
              </p>
              <p className="mt-3 text-xs font-semibold">
                Responsable: {consentNotice.controllerName} · Derechos:{" "}
                {consentNotice.contactEmail}
              </p>
            </section>
          ) : (
            <div
              role="alert"
              className="rounded-2xl border border-amber-200 bg-amber-50 p-5 text-sm font-semibold leading-6 text-amber-950"
            >
              No hay un aviso de privacidad activo. La captura está bloqueada;
              solicita a Administración que configure el texto que debe
              comunicarse a la persona.
            </div>
          )}

          <label className="block space-y-2 text-xs font-black uppercase tracking-wider text-slate-500">
            Canal real de la autorización
            <select
              required
              disabled={!consentNotice || loadingContext}
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
              disabled={!consentNotice || loadingContext}
              checked={consentAcceptedForDisplayedNotice}
              onChange={(event) => {
                const checked = event.target.checked;
                setForm({ ...form, consentAccepted: checked });
                setAcceptedNoticeKey(
                  checked && displayedNoticeKey ? displayedNoticeKey : null,
                );
              }}
              className="mt-1 h-5 w-5 shrink-0 accent-emerald-700"
            />
            <span className="text-sm leading-6 text-slate-700">
              Confirmo que comuniqué el aviso vigente completo, registré el
              canal real y la persona autorizó expresamente este tratamiento.
            </span>
          </label>

          <div className="flex flex-col gap-3 border-t border-slate-100 pt-6 sm:flex-row sm:items-center sm:justify-between">
            <p className="max-w-xl text-xs leading-5 text-slate-500">
              Si el documento ya esta vinculado, el sistema no crea ni altera
              datos y solicita revisar su estado con un rol autorizado. Cada
              alta conserva fecha, version del aviso, responsable y evidencia
              tecnica del consentimiento.
            </p>
            <button
              type="submit"
              disabled={
                saving ||
                loadingContext ||
                !hasPuestos ||
                !consentNotice ||
                !form.collectionChannel ||
                !consentAcceptedForDisplayedNotice
              }
              className="inline-flex min-h-12 shrink-0 items-center justify-center gap-2 rounded-2xl bg-emerald-700 px-7 text-xs font-black uppercase tracking-wider text-white shadow-lg shadow-emerald-900/15 transition hover:bg-emerald-800 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {saving ? (
                <Loader2
                  aria-hidden="true"
                  className="animate-spin"
                  size={17}
                />
              ) : (
                <UserPlus aria-hidden="true" size={17} />
              )}
              Guardar con trazabilidad
            </button>
          </div>
        </form>
      </section>
    </div>
  );
}
