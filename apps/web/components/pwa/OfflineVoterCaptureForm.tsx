"use client";

import { useState, type FormEvent } from "react";
import { AlertCircle, CheckCircle2, LockKeyhole, UserPlus } from "lucide-react";
import { useOfflineVault } from "@/context/offline-vault";
import type { CapturableConsentCollectionChannel } from "@/lib/interactions-api";
import type { CreateVoterInput } from "@/lib/voters-api";

const EMPTY_FORM = {
  documentId: "",
  firstName: "",
  lastName: "",
  phone: "",
  email: "",
  mesa: "",
  puestoId: "",
  collectionChannel: "",
  consentAccepted: false,
};

const CHANNELS: ReadonlyArray<{
  value: CapturableConsentCollectionChannel;
  label: string;
}> = [
  { value: "IN_PERSON", label: "Presencial" },
  { value: "PHONE", label: "Llamada" },
  { value: "PAPER", label: "Formato físico" },
  { value: "WEB_FORM", label: "Formulario web" },
];

export function OfflineVoterCaptureForm() {
  const { captureContext, enqueueVoter, busy } = useOfflineVault();
  const [form, setForm] = useState(EMPTY_FORM);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const puestos = captureContext?.puestos ?? [];
  const notice = captureContext?.consentNotice ?? null;
  const selectedPuestoId = puestos.some((puesto) => puesto.id === form.puestoId)
    ? form.puestoId
    : puestos.length === 1
      ? puestos[0].id
      : "";

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setSaved(false);

    if (!notice || !selectedPuestoId) {
      setError(
        "Falta un contexto territorial y un aviso vigentes provisionados.",
      );
      return;
    }
    if (!form.consentAccepted || !form.collectionChannel) {
      setError(
        "Registra el canal y confirma que la persona autorizó el aviso mostrado.",
      );
      return;
    }

    const input: CreateVoterInput = {
      documentId: form.documentId.trim(),
      firstName: form.firstName.trim(),
      lastName: form.lastName.trim(),
      puestoId: selectedPuestoId,
      consentAccepted: true,
      termsVersion: notice.version,
      collectionChannel:
        form.collectionChannel as CapturableConsentCollectionChannel,
      ...(form.phone.trim() ? { phone: form.phone.trim() } : {}),
      ...(form.email.trim() ? { email: form.email.trim() } : {}),
      ...(form.mesa ? { mesa: Number(form.mesa) } : {}),
    };

    try {
      await enqueueVoter(input, new Date().toISOString());
      setForm(EMPTY_FORM);
      setSaved(true);
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "No fue posible cifrar la captura.",
      );
    }
  }

  if (!captureContext || !notice || puestos.length === 0) {
    return (
      <div
        role="note"
        className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-xs leading-5 text-amber-950"
      >
        <div className="flex items-start gap-3">
          <LockKeyhole
            aria-hidden="true"
            className="mt-0.5 shrink-0"
            size={17}
          />
          <p>
            La captura offline está bloqueada porque esta bóveda aún no tiene un
            contexto territorial y aviso de privacidad provisionados desde la
            API.
          </p>
        </div>
      </div>
    );
  }

  return (
    <details className="rounded-2xl border border-emerald-200 bg-emerald-50/60">
      <summary className="flex min-h-12 cursor-pointer list-none items-center gap-2 px-4 text-xs font-black text-emerald-950 marker:content-none">
        <UserPlus aria-hidden="true" size={17} />
        Nueva captura cifrada de votante
      </summary>
      <form
        onSubmit={handleSubmit}
        className="space-y-4 border-t border-emerald-200 px-4 py-5"
      >
        <p className="text-xs leading-5 text-slate-700">
          Se conservará cifrada en este dispositivo con la hora actual. No se
          presentará como recibida hasta obtener un recibo de la API.
        </p>

        {error && (
          <p
            role="alert"
            className="flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 p-3 text-xs font-semibold text-red-800"
          >
            <AlertCircle
              aria-hidden="true"
              className="mt-0.5 shrink-0"
              size={15}
            />
            {error}
          </p>
        )}
        {saved && (
          <p
            aria-live="polite"
            className="flex items-start gap-2 rounded-xl border border-emerald-200 bg-white p-3 text-xs font-semibold text-emerald-800"
          >
            <CheckCircle2
              aria-hidden="true"
              className="mt-0.5 shrink-0"
              size={15}
            />
            Captura cifrada. Sigue pendiente de sincronización manual.
          </p>
        )}

        <div className="grid gap-3 sm:grid-cols-2">
          <label className="space-y-1 text-[11px] font-black uppercase tracking-wide text-slate-600">
            Nombres
            <input
              required
              maxLength={100}
              autoComplete="off"
              value={form.firstName}
              onChange={(event) =>
                setForm((current) => ({
                  ...current,
                  firstName: event.target.value,
                }))
              }
              className="min-h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm font-semibold normal-case tracking-normal text-slate-950"
            />
          </label>
          <label className="space-y-1 text-[11px] font-black uppercase tracking-wide text-slate-600">
            Apellidos
            <input
              required
              maxLength={100}
              autoComplete="off"
              value={form.lastName}
              onChange={(event) =>
                setForm((current) => ({
                  ...current,
                  lastName: event.target.value,
                }))
              }
              className="min-h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm font-semibold normal-case tracking-normal text-slate-950"
            />
          </label>
          <label className="space-y-1 text-[11px] font-black uppercase tracking-wide text-slate-600">
            Documento
            <input
              required
              inputMode="numeric"
              pattern="[0-9]{5,15}"
              maxLength={15}
              autoComplete="off"
              value={form.documentId}
              onChange={(event) =>
                setForm((current) => ({
                  ...current,
                  documentId: event.target.value,
                }))
              }
              className="min-h-11 w-full rounded-xl border border-slate-200 bg-white px-3 font-mono text-sm font-semibold normal-case tracking-normal text-slate-950"
            />
          </label>
          <label className="space-y-1 text-[11px] font-black uppercase tracking-wide text-slate-600">
            Puesto
            <select
              required
              value={selectedPuestoId}
              onChange={(event) =>
                setForm((current) => ({
                  ...current,
                  puestoId: event.target.value,
                }))
              }
              className="min-h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm font-semibold normal-case tracking-normal text-slate-950"
            >
              <option value="">Selecciona un puesto</option>
              {puestos.map((puesto) => (
                <option key={puesto.id} value={puesto.id}>
                  {puesto.name} · {puesto.code}
                </option>
              ))}
            </select>
          </label>
          <label className="space-y-1 text-[11px] font-black uppercase tracking-wide text-slate-600">
            Celular opcional
            <input
              inputMode="tel"
              maxLength={24}
              autoComplete="off"
              value={form.phone}
              onChange={(event) =>
                setForm((current) => ({
                  ...current,
                  phone: event.target.value,
                }))
              }
              className="min-h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm font-semibold normal-case tracking-normal text-slate-950"
            />
          </label>
          <label className="space-y-1 text-[11px] font-black uppercase tracking-wide text-slate-600">
            Correo opcional
            <input
              type="email"
              maxLength={254}
              autoComplete="off"
              value={form.email}
              onChange={(event) =>
                setForm((current) => ({
                  ...current,
                  email: event.target.value,
                }))
              }
              className="min-h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm font-semibold normal-case tracking-normal text-slate-950"
            />
          </label>
          <label className="space-y-1 text-[11px] font-black uppercase tracking-wide text-slate-600">
            Mesa opcional
            <input
              type="number"
              min={1}
              max={99999}
              inputMode="numeric"
              value={form.mesa}
              onChange={(event) =>
                setForm((current) => ({
                  ...current,
                  mesa: event.target.value,
                }))
              }
              className="min-h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm font-semibold normal-case tracking-normal text-slate-950"
            />
          </label>
          <label className="space-y-1 text-[11px] font-black uppercase tracking-wide text-slate-600">
            Canal de autorización
            <select
              required
              value={form.collectionChannel}
              onChange={(event) =>
                setForm((current) => ({
                  ...current,
                  collectionChannel: event.target.value,
                }))
              }
              className="min-h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm font-semibold normal-case tracking-normal text-slate-950"
            >
              <option value="">Selecciona el canal</option>
              {CHANNELS.map((channel) => (
                <option key={channel.value} value={channel.value}>
                  {channel.label}
                </option>
              ))}
            </select>
          </label>
        </div>

        <section className="rounded-xl border border-blue-200 bg-blue-50 p-3 text-xs leading-5 text-blue-950">
          <p className="font-black">
            Aviso provisionado · {notice.version} · {notice.title}
          </p>
          <p className="mt-1 whitespace-pre-line">{notice.content}</p>
          <p className="mt-2 font-semibold">
            Responsable: {notice.controllerName} · {notice.contactEmail}
          </p>
        </section>

        <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-emerald-200 bg-white p-3 text-xs leading-5 text-slate-700">
          <input
            type="checkbox"
            checked={form.consentAccepted}
            onChange={(event) =>
              setForm((current) => ({
                ...current,
                consentAccepted: event.target.checked,
              }))
            }
            className="mt-0.5 h-5 w-5 shrink-0 accent-emerald-700"
          />
          Confirmo que comuniqué íntegramente este aviso y que la persona
          autorizó el tratamiento por el canal registrado.
        </label>

        <button
          type="submit"
          disabled={
            busy ||
            !form.consentAccepted ||
            !form.collectionChannel ||
            !selectedPuestoId
          }
          className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-xl bg-emerald-700 px-4 text-xs font-black text-white disabled:cursor-not-allowed disabled:opacity-50"
        >
          <LockKeyhole aria-hidden="true" size={16} />
          Guardar cifrado para sincronizar
        </button>
      </form>
    </details>
  );
}
