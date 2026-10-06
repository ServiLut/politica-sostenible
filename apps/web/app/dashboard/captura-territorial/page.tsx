"use client";
import { PageHeader } from "@/components/ui/PageHeader";

import { usePageRequest } from "@/lib/use-page-request";

import { useAuth } from "@/context/auth";
import { useOfflineVault } from "@/context/offline-vault";
import { ApiError } from "@/lib/api-client";
import { getConsentNoticePresentationKey } from "@/lib/consent-notices-api";
import type { CapturableConsentCollectionChannel } from "@/lib/interactions-api";
import {
  createVoter,
  getVoterCaptureContext,
  type CreateVoterInput,
} from "@/lib/voters-api";
import {
  AlertCircle,
  CheckCircle2,
  Loader2,
  LockKeyhole,
  MapPin,
  RefreshCw,
  ShieldCheck,
  UserPlus,
} from "lucide-react";
import { FormEvent, useEffect, useState } from "react";

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
  const { tenant } = useAuth();
  const {
    captureContext: offlineCaptureContext,
    enqueueVoter,
    isOnline,
    phase: vaultPhase,
    provisionCaptureContext,
  } = useOfflineVault();
  const [puestoDraft, setSelectedPuestoId] = useState("");
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [reload, setReload] = useState(0);
  const [acceptedNoticeKey, setAcceptedNoticeKey] = useState<string | null>(
    null,
  );
  const [encryptedSaveOffered, setEncryptedSaveOffered] = useState(false);

  const remote = usePageRequest(getVoterCaptureContext, {
    enabled: isOnline,
    reloadKey: reload,
  });
  const useProvisioned =
    !isOnline ||
    (remote.error instanceof ApiError && remote.error.status === 0);
  const context = useProvisioned ? offlineCaptureContext : remote.data;
  const loadingContext = isOnline && remote.loading;
  const contextError = useProvisioned
    ? context
      ? null
      : vaultPhase === "UNLOCKED"
        ? "Esta bóveda no tiene un contexto territorial provisionado. Conéctate y actualiza la asignación antes de capturar."
        : "Sin conexión: desbloquea la bóveda offline para recuperar el contexto territorial cifrado."
    : remote.error
      ? readableError(
          remote.error,
          "No fue posible consultar tu asignación territorial.",
        )
      : null;
  const selectedPuestoId = context?.puestos.some(({ id }) => id === puestoDraft)
    ? puestoDraft
    : context?.puestos.length === 1
      ? context.puestos[0].id
      : "";

  useEffect(() => {
    if (!context || !isOnline || vaultPhase !== "UNLOCKED") return;
    void provisionCaptureContext(context).catch(() => {
      // El panel de bóveda presenta el fallo sin copiar contexto o PII a logs.
    });
  }, [context, isOnline, provisionCaptureContext, vaultPhase]);

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
      acceptedNoticeKey !== `${isOnline}:${reload}:${submittedNoticeKey}`
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
      if (!isOnline || encryptedSaveOffered) {
        await enqueueVoter(payload, new Date().toISOString());
        setForm(EMPTY_FORM);
        setAcceptedNoticeKey(null);
        setEncryptedSaveOffered(false);
        setNotice(
          "Captura guardada cifrada en este dispositivo. Sigue pendiente y no se considera recibida hasta sincronizarla manualmente.",
        );
        return;
      }

      await createVoter(payload);
      setForm(EMPTY_FORM);
      setAcceptedNoticeKey(null);
      setEncryptedSaveOffered(false);
      setNotice(
        "Solicitud recibida y procesada con trazabilidad. Puedes continuar con la siguiente persona.",
      );
    } catch (error: unknown) {
      if (error instanceof ApiError && error.status === 0) {
        setEncryptedSaveOffered(true);
        setFormError(
          "La API no confirmó la recepción. Revisa la información y elige “Guardar cifrado para sincronizar”; no se encoló automáticamente.",
        );
        return;
      }
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
    acceptedNoticeKey === `${isOnline}:${reload}:${displayedNoticeKey}`;

  return (
    <div className="mx-auto max-w-5xl space-y-7 min-w-0">
      <PageHeader
        title="Vinculación en territorio"
        icon={ShieldCheck}
        description={
          <>
            Registra la información que cada persona entregue y autorice. El
            acceso queda limitado a tu organización y territorio.
          </>
        }
      />

      {tenant?.type === "GSC" && (
        <div
          role="note"
          className="flex items-start gap-3 rounded-2xl border border-amber-200 bg-amber-50 p-5 text-sm font-semibold leading-6 text-amber-950 min-w-0"
        >
          <AlertCircle
            aria-hidden="true"
            className="mt-0.5 shrink-0 text-amber-700"
            size={20}
          />
          <p>
            <strong>Esta captura no recoge firmas electorales.</strong> Registra
            contactos con autorización de datos; no sustituye formularios,
            requisitos, radicación ni validación de apoyos ante la
            Registraduría.
          </p>
        </div>
      )}

      {notice && (
        <div
          role="status"
          className="flex items-start gap-3 rounded-2xl border border-emerald-200 bg-emerald-50 p-5 text-sm font-semibold text-emerald-900 min-w-0"
        >
          <CheckCircle2
            aria-hidden="true"
            className="mt-0.5 shrink-0 text-emerald-700"
            size={20}
          />
          {notice}
        </div>
      )}

      <section className="rounded-[2rem] border border-slate-200 bg-white shadow-sm min-w-0">
        <div className="border-b border-slate-100 px-6 py-6 sm:px-8 min-w-0">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between min-w-0">
            <div>
              <p className="text-xs font-semibold text-emerald-700">
                Paso 1 · Alcance operativo
              </p>
              <h2 className="mt-1 text-xl font-semibold text-slate-950">
                Puesto de votación asignado
              </h2>
            </div>
            <button
              type="button"
              onClick={() => setReload((value) => value + 1)}
              disabled={loadingContext}
              className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-slate-200 px-4 text-sm font-semibold text-slate-600 disabled:opacity-50 max-w-full whitespace-normal"
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
              className="mt-5 flex items-center gap-3 rounded-2xl bg-slate-50 p-5 text-sm font-semibold text-slate-600 min-w-0"
            >
              <Loader2 aria-hidden="true" className="animate-spin" size={18} />
              Consultando tu alcance territorial vigente...
            </div>
          ) : contextError ? (
            <div
              role="alert"
              className="mt-5 flex items-start gap-3 rounded-2xl border border-red-200 bg-red-50 p-5 text-sm font-semibold text-red-800 min-w-0"
            >
              <AlertCircle aria-hidden="true" className="mt-0.5" size={19} />
              {contextError}
            </div>
          ) : !hasPuestos ? (
            <div
              role="alert"
              className="mt-5 flex items-start gap-3 rounded-2xl border border-amber-200 bg-amber-50 p-5 text-sm leading-6 text-amber-900 min-w-0"
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
            <div className="mt-5 flex items-center gap-4 rounded-2xl border border-emerald-200 bg-emerald-50/70 p-5 min-w-0">
              <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-emerald-700 text-white">
                <MapPin aria-hidden="true" size={20} />
              </span>
              <div>
                <p className="text-sm font-semibold text-slate-950">
                  {puestos[0].name}
                </p>
                <p className="mt-1 text-xs font-semibold text-slate-500">
                  Código {puestos[0].code} · selección automática
                </p>
              </div>
            </div>
          ) : (
            <label className="mt-5 block space-y-2 text-sm font-semibold text-slate-500 min-w-0">
              Puesto habilitado
              <select
                required
                value={selectedPuestoId}
                onChange={(event) => setSelectedPuestoId(event.target.value)}
                className="min-h-12 w-full rounded-2xl border border-slate-200 bg-white px-4 text-sm font-semibold normal-case tracking-normal text-slate-900 focus:border-emerald-600 focus:outline-none focus:ring-2 focus:ring-emerald-100 min-w-0 max-w-full"
              >
                <option value="">Selecciona un puesto</option>
                {puestos.map((puesto) => (
                  <option key={puesto.id} value={puesto.id}>
                    {puesto.name} · {puesto.code}
                  </option>
                ))}
              </select>
              <span className="block text-xs font-medium normal-case tracking-normal text-slate-500">
                Solo aparecen puestos incluidos en tu asignación vigente.
              </span>
            </label>
          )}
        </div>

        <form
          onSubmit={handleSubmit}
          className="space-y-7 px-6 py-7 sm:px-8 min-w-0"
        >
          <div>
            <p className="text-xs font-semibold text-emerald-700">
              Paso 2 · Datos consentidos
            </p>
            <h2 className="mt-1 text-xl font-semibold text-slate-950">
              Información de la persona
            </h2>
          </div>

          {formError && (
            <div
              role="alert"
              className="flex items-start gap-3 rounded-2xl border border-red-200 bg-red-50 p-5 text-sm font-semibold text-red-800 min-w-0"
            >
              <AlertCircle aria-hidden="true" className="mt-0.5" size={19} />
              {formError}
            </div>
          )}

          {(!isOnline || encryptedSaveOffered) && (
            <div
              role="note"
              className="flex items-start gap-3 rounded-2xl border border-amber-200 bg-amber-50 p-5 text-sm font-semibold leading-6 text-amber-950 min-w-0"
            >
              <LockKeyhole
                aria-hidden="true"
                className="mt-0.5 shrink-0"
                size={19}
              />
              Esta acción cifra la captura en la bóveda local. No la marca como
              recibida ni intenta sincronizarla en segundo plano.
            </div>
          )}

          <div className="grid gap-5 md:grid-cols-2 min-w-0">
            <label className="space-y-2 text-sm font-semibold text-slate-500 min-w-0">
              Nombres
              <input
                required
                maxLength={100}
                autoComplete="off"
                value={form.firstName}
                onChange={(event) =>
                  setForm({ ...form, firstName: event.target.value })
                }
                className="min-h-12 w-full rounded-2xl border border-slate-200 px-4 text-sm font-semibold normal-case tracking-normal text-slate-900 focus:border-emerald-600 focus:outline-none focus:ring-2 focus:ring-emerald-100 min-w-0 max-w-full"
              />
            </label>
            <label className="space-y-2 text-sm font-semibold text-slate-500 min-w-0">
              Apellidos
              <input
                required
                maxLength={100}
                autoComplete="off"
                value={form.lastName}
                onChange={(event) =>
                  setForm({ ...form, lastName: event.target.value })
                }
                className="min-h-12 w-full rounded-2xl border border-slate-200 px-4 text-sm font-semibold normal-case tracking-normal text-slate-900 focus:border-emerald-600 focus:outline-none focus:ring-2 focus:ring-emerald-100 min-w-0 max-w-full"
              />
            </label>
            <label className="space-y-2 text-sm font-semibold text-slate-500 min-w-0">
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
                className="min-h-12 w-full rounded-2xl border border-slate-200 px-4 font-mono text-sm font-semibold normal-case tracking-normal text-slate-900 focus:border-emerald-600 focus:outline-none focus:ring-2 focus:ring-emerald-100 min-w-0 max-w-full"
              />
            </label>
            <label className="space-y-2 text-sm font-semibold text-slate-500 min-w-0">
              Celular opcional
              <input
                inputMode="tel"
                maxLength={24}
                autoComplete="off"
                value={form.phone}
                onChange={(event) =>
                  setForm({ ...form, phone: event.target.value })
                }
                className="min-h-12 w-full rounded-2xl border border-slate-200 px-4 text-sm font-semibold normal-case tracking-normal text-slate-900 focus:border-emerald-600 focus:outline-none focus:ring-2 focus:ring-emerald-100 min-w-0 max-w-full"
              />
            </label>
            <label className="space-y-2 text-sm font-semibold text-slate-500 min-w-0">
              Correo opcional
              <input
                type="email"
                maxLength={254}
                autoComplete="off"
                value={form.email}
                onChange={(event) =>
                  setForm({ ...form, email: event.target.value })
                }
                className="min-h-12 w-full rounded-2xl border border-slate-200 px-4 text-sm font-semibold normal-case tracking-normal text-slate-900 focus:border-emerald-600 focus:outline-none focus:ring-2 focus:ring-emerald-100 min-w-0 max-w-full"
              />
            </label>
            <label className="space-y-2 text-sm font-semibold text-slate-500 min-w-0">
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
                className="min-h-12 w-full rounded-2xl border border-slate-200 px-4 text-sm font-semibold normal-case tracking-normal text-slate-900 focus:border-emerald-600 focus:outline-none focus:ring-2 focus:ring-emerald-100 min-w-0 max-w-full"
              />
            </label>
          </div>

          {consentNotice ? (
            <section className="rounded-2xl border border-blue-200 bg-blue-50 p-5 text-sm leading-6 text-blue-950 min-w-0">
              <p className="text-xs font-semibold text-blue-700">
                Aviso vigente · {consentNotice.version}
              </p>
              <h3 className="mt-1 font-semibold">{consentNotice.title}</h3>
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
              className="rounded-2xl border border-amber-200 bg-amber-50 p-5 text-sm font-semibold leading-6 text-amber-950 min-w-0"
            >
              No hay un aviso de privacidad activo. La captura está bloqueada;
              solicita a Administración que configure el texto que debe
              comunicarse a la persona.
            </div>
          )}

          <label className="block space-y-2 text-sm font-semibold text-slate-500 min-w-0">
            Canal real de la autorización
            <select
              required
              disabled={!consentNotice || loadingContext}
              value={form.collectionChannel}
              onChange={(event) =>
                setForm({ ...form, collectionChannel: event.target.value })
              }
              className="min-h-12 w-full rounded-2xl border border-slate-200 bg-white px-4 text-sm font-semibold normal-case tracking-normal text-slate-900 min-w-0 max-w-full"
            >
              <option value="">Selecciona cómo autorizó la persona</option>
              {CONSENT_CHANNEL_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>

          <label className="flex cursor-pointer items-start gap-4 rounded-2xl border border-emerald-200 bg-emerald-50/60 p-5 min-w-0">
            <input
              type="checkbox"
              disabled={!consentNotice || loadingContext}
              checked={consentAcceptedForDisplayedNotice}
              onChange={(event) => {
                const checked = event.target.checked;
                setForm({ ...form, consentAccepted: checked });
                setAcceptedNoticeKey(
                  checked && displayedNoticeKey
                    ? `${isOnline}:${reload}:${displayedNoticeKey}`
                    : null,
                );
              }}
              className="mt-1 h-5 w-5 shrink-0 accent-emerald-700 min-w-0 max-w-full"
            />
            <span className="text-sm leading-6 text-slate-700">
              Confirmo que comuniqué el aviso vigente completo, registré el
              canal real y la persona autorizó expresamente este tratamiento.
            </span>
          </label>

          <div className="flex flex-col gap-3 border-t border-slate-100 pt-6 sm:flex-row sm:items-center sm:justify-between min-w-0">
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
              className="inline-flex min-h-12 shrink-0 items-center justify-center gap-2 rounded-2xl bg-emerald-700 px-7 text-sm font-semibold text-white shadow-lg shadow-emerald-900/15 transition hover:bg-emerald-800 disabled:cursor-not-allowed disabled:opacity-50 max-w-full whitespace-normal"
            >
              {saving ? (
                <Loader2
                  aria-hidden="true"
                  className="animate-spin"
                  size={17}
                />
              ) : !isOnline || encryptedSaveOffered ? (
                <LockKeyhole aria-hidden="true" size={17} />
              ) : (
                <UserPlus aria-hidden="true" size={17} />
              )}
              {!isOnline || encryptedSaveOffered
                ? "Guardar cifrado para sincronizar"
                : "Guardar con trazabilidad"}
            </button>
          </div>
        </form>
      </section>
    </div>
  );
}
