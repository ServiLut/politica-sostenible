"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";
import {
  AlertCircle,
  CheckCircle2,
  ExternalLink,
  Loader2,
  RefreshCw,
  ShieldCheck,
} from "lucide-react";
import { useAuth } from "@/context/auth";
import { ApiError } from "@/lib/api-client";
import {
  activateConsentNotice,
  getCurrentConsentNotice,
  type ActivateConsentNoticeInput,
  type ConsentNoticeContext,
} from "@/lib/consent-notices-api";

const EMPTY_FORM: ActivateConsentNoticeInput = {
  version: "",
  title: "",
  content: "",
  controllerName: "",
  contactEmail: "",
  privacyPolicyUrl: "",
};

function readableError(error: unknown): string {
  if (error instanceof ApiError) return error.message;
  if (error instanceof Error && error.message) return error.message;
  return "No fue posible consultar la configuración de privacidad.";
}

function purposeLabel(purpose: ConsentNoticeContext["purpose"]): string {
  return purpose === "POLITICAL_COMMUNICATION"
    ? "Comunicaciones políticas"
    : "Seguimiento de solicitudes ciudadanas";
}

export default function ConsentSettingsPage() {
  const { user, tenant } = useAuth();
  const canEdit = user?.backendRole === "ADMIN";
  const [context, setContext] = useState<ConsentNoticeContext | null>(null);
  const [form, setForm] = useState<ActivateConsentNoticeInput>(EMPTY_FORM);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [reload, setReload] = useState(0);

  const load = useCallback(
    async (signal: AbortSignal) => {
      setLoading(true);
      setError(null);
      try {
        const response = await getCurrentConsentNotice(signal);
        if (signal.aborted) return;
        setContext(response);
        if (response.notice) {
          setForm({
            version: response.notice.version,
            title: response.notice.title,
            content: response.notice.content,
            controllerName: response.notice.controllerName,
            contactEmail: response.notice.contactEmail,
            privacyPolicyUrl: response.notice.privacyPolicyUrl ?? "",
          });
        } else {
          setForm((current) => ({
            ...EMPTY_FORM,
            controllerName: current.controllerName || tenant?.name || "",
          }));
        }
      } catch (requestError: unknown) {
        if (!signal.aborted) {
          setContext(null);
          setError(readableError(requestError));
        }
      } finally {
        if (!signal.aborted) setLoading(false);
      }
    },
    [tenant?.name],
  );

  useEffect(() => {
    const controller = new AbortController();
    void load(controller.signal);
    return () => controller.abort();
  }, [load, reload]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!canEdit) return;

    setSaving(true);
    setError(null);
    setNotice(null);
    try {
      const response = await activateConsentNotice({
        version: form.version.trim(),
        title: form.title.trim(),
        content: form.content.trim(),
        controllerName: form.controllerName.trim(),
        contactEmail: form.contactEmail.trim(),
        ...(form.privacyPolicyUrl?.trim()
          ? { privacyPolicyUrl: form.privacyPolicyUrl.trim() }
          : {}),
      });
      setContext(response);
      setNotice(
        `Aviso ${response.notice?.version ?? ""} activo. Las capturas usarán esta versión desde ahora.`,
      );
    } catch (requestError: unknown) {
      setError(readableError(requestError));
    } finally {
      setSaving(false);
    }
  }

  const current = context?.notice;

  return (
    <div className="mx-auto max-w-5xl space-y-7">
      <header className="overflow-hidden rounded-[2rem] bg-slate-950 px-6 py-8 text-white shadow-xl sm:px-9">
        <div className="flex flex-col gap-5 md:flex-row md:items-end md:justify-between">
          <div className="max-w-2xl">
            <span className="inline-flex items-center gap-2 rounded-full bg-emerald-400/15 px-3 py-1 text-[10px] font-black uppercase tracking-[0.18em] text-emerald-300">
              <ShieldCheck aria-hidden="true" size={14} /> Gobierno de datos
            </span>
            <h1 className="mt-4 text-3xl font-black tracking-tight sm:text-4xl">
              Aviso de privacidad de la organización
            </h1>
            <p className="mt-3 max-w-2xl text-sm leading-6 text-slate-300">
              El equipo solo podrá registrar autorizaciones después de activar
              un aviso propio. Cada nueva versión conserva la anterior y obliga
              a confirmar nuevamente el consentimiento.
            </p>
          </div>
          <button
            type="button"
            onClick={() => setReload((value) => value + 1)}
            disabled={loading}
            className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-slate-700 px-4 text-xs font-black uppercase tracking-wider text-slate-200 disabled:opacity-50"
          >
            <RefreshCw
              aria-hidden="true"
              size={15}
              className={loading ? "animate-spin" : undefined}
            />
            Actualizar
          </button>
        </div>
      </header>

      {notice && (
        <div
          role="status"
          className="flex items-start gap-3 rounded-2xl border border-emerald-200 bg-emerald-50 p-5 text-sm font-semibold text-emerald-950"
        >
          <CheckCircle2 aria-hidden="true" size={20} /> {notice}
        </div>
      )}
      {error && (
        <div
          role="alert"
          className="flex items-start gap-3 rounded-2xl border border-red-200 bg-red-50 p-5 text-sm font-semibold text-red-900"
        >
          <AlertCircle aria-hidden="true" size={20} /> {error}
        </div>
      )}

      {loading ? (
        <div
          role="status"
          className="flex items-center gap-3 rounded-[2rem] border border-slate-200 bg-white p-8 text-sm font-semibold text-slate-600"
        >
          <Loader2 aria-hidden="true" className="animate-spin" size={20} />
          Consultando el aviso vigente…
        </div>
      ) : (
        <div className="grid gap-6 lg:grid-cols-[0.8fr_1.2fr]">
          <aside className="space-y-5 rounded-[2rem] border border-slate-200 bg-white p-6 shadow-sm">
            <div>
              <p className="text-[10px] font-black uppercase tracking-[0.18em] text-slate-400">
                Estado actual
              </p>
              <p
                className={`mt-3 inline-flex rounded-full px-3 py-1 text-xs font-black ${
                  current
                    ? "bg-emerald-50 text-emerald-800"
                    : "bg-amber-50 text-amber-900"
                }`}
              >
                {current ? `Activo · ${current.version}` : "Sin configurar"}
              </p>
            </div>
            <dl className="space-y-4 text-sm">
              <div>
                <dt className="text-xs font-black uppercase tracking-wider text-slate-400">
                  Finalidad
                </dt>
                <dd className="mt-1 font-semibold text-slate-800">
                  {context ? purposeLabel(context.purpose) : "No disponible"}
                </dd>
              </div>
              {current && (
                <>
                  <div>
                    <dt className="text-xs font-black uppercase tracking-wider text-slate-400">
                      Responsable
                    </dt>
                    <dd className="mt-1 font-semibold text-slate-800">
                      {current.controllerName}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-xs font-black uppercase tracking-wider text-slate-400">
                      Canal de derechos
                    </dt>
                    <dd className="mt-1 break-all font-semibold text-slate-800">
                      {current.contactEmail}
                    </dd>
                  </div>
                  {current.privacyPolicyUrl && (
                    <a
                      href={current.privacyPolicyUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center gap-2 text-sm font-black text-blue-700 underline"
                    >
                      Ver política publicada
                      <ExternalLink aria-hidden="true" size={14} />
                    </a>
                  )}
                </>
              )}
            </dl>
            {!current && (
              <p className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-xs font-semibold leading-5 text-amber-950">
                La captura de datos y las autorizaciones están bloqueadas hasta
                que una persona administradora complete esta configuración.
              </p>
            )}
            {!canEdit && (
              <p className="rounded-2xl bg-slate-100 p-4 text-xs font-semibold leading-5 text-slate-700">
                Tu rol puede verificar el aviso vigente. Solo Administración
                puede activar una versión nueva.
              </p>
            )}
          </aside>

          <form
            onSubmit={handleSubmit}
            className="space-y-5 rounded-[2rem] border border-slate-200 bg-white p-6 shadow-sm sm:p-8"
          >
            <div>
              <h2 className="text-xl font-black text-slate-950">
                {current ? "Activar una versión nueva" : "Configurar el aviso"}
              </h2>
              <p className="mt-2 text-sm leading-6 text-slate-600">
                Si cambia cualquier texto, usa un identificador de versión
                nuevo. El servidor fija fecha, organización y responsable.
              </p>
            </div>

            <div className="grid gap-5 sm:grid-cols-2">
              <label className="space-y-2 text-xs font-black uppercase tracking-wider text-slate-500">
                Versión
                <input
                  required
                  disabled={!canEdit || saving}
                  maxLength={32}
                  value={form.version}
                  onChange={(event) =>
                    setForm({ ...form, version: event.target.value })
                  }
                  placeholder="Ej. 2026-09-v1"
                  className="min-h-12 w-full rounded-xl border border-slate-200 px-4 text-sm font-semibold normal-case tracking-normal text-slate-900 disabled:bg-slate-100"
                />
              </label>
              <label className="space-y-2 text-xs font-black uppercase tracking-wider text-slate-500">
                Responsable del tratamiento
                <input
                  required
                  disabled={!canEdit || saving}
                  minLength={2}
                  maxLength={200}
                  value={form.controllerName}
                  onChange={(event) =>
                    setForm({ ...form, controllerName: event.target.value })
                  }
                  className="min-h-12 w-full rounded-xl border border-slate-200 px-4 text-sm font-semibold normal-case tracking-normal text-slate-900 disabled:bg-slate-100"
                />
              </label>
            </div>

            <label className="block space-y-2 text-xs font-black uppercase tracking-wider text-slate-500">
              Título
              <input
                required
                disabled={!canEdit || saving}
                minLength={5}
                maxLength={160}
                value={form.title}
                onChange={(event) =>
                  setForm({ ...form, title: event.target.value })
                }
                className="min-h-12 w-full rounded-xl border border-slate-200 px-4 text-sm font-semibold normal-case tracking-normal text-slate-900 disabled:bg-slate-100"
              />
            </label>

            <label className="block space-y-2 text-xs font-black uppercase tracking-wider text-slate-500">
              Texto comunicado antes de autorizar
              <textarea
                required
                disabled={!canEdit || saving}
                minLength={80}
                maxLength={4_000}
                rows={9}
                value={form.content}
                onChange={(event) =>
                  setForm({ ...form, content: event.target.value })
                }
                placeholder="Explica responsable, finalidad, datos tratados, derechos y cómo retirar la autorización."
                className="w-full resize-y rounded-xl border border-slate-200 px-4 py-3 text-sm font-semibold leading-6 normal-case tracking-normal text-slate-900 disabled:bg-slate-100"
              />
              <span className="block text-[11px] font-medium normal-case tracking-normal text-slate-400">
                {form.content.length}/4.000 caracteres
              </span>
            </label>

            <div className="grid gap-5 sm:grid-cols-2">
              <label className="space-y-2 text-xs font-black uppercase tracking-wider text-slate-500">
                Correo para ejercer derechos
                <input
                  required
                  type="email"
                  disabled={!canEdit || saving}
                  maxLength={254}
                  value={form.contactEmail}
                  onChange={(event) =>
                    setForm({ ...form, contactEmail: event.target.value })
                  }
                  className="min-h-12 w-full rounded-xl border border-slate-200 px-4 text-sm font-semibold normal-case tracking-normal text-slate-900 disabled:bg-slate-100"
                />
              </label>
              <label className="space-y-2 text-xs font-black uppercase tracking-wider text-slate-500">
                URL de política (opcional)
                <input
                  type="url"
                  disabled={!canEdit || saving}
                  maxLength={2_048}
                  pattern="https://.*"
                  title="Usa una URL HTTPS completa"
                  value={form.privacyPolicyUrl ?? ""}
                  onChange={(event) =>
                    setForm({ ...form, privacyPolicyUrl: event.target.value })
                  }
                  placeholder="https://..."
                  className="min-h-12 w-full rounded-xl border border-slate-200 px-4 text-sm font-semibold normal-case tracking-normal text-slate-900 disabled:bg-slate-100"
                />
              </label>
            </div>

            {canEdit && (
              <button
                type="submit"
                disabled={saving}
                className="inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-emerald-700 px-6 text-xs font-black uppercase tracking-wider text-white shadow-lg shadow-emerald-900/10 disabled:opacity-50"
              >
                {saving ? (
                  <Loader2
                    aria-hidden="true"
                    className="animate-spin"
                    size={17}
                  />
                ) : (
                  <ShieldCheck aria-hidden="true" size={17} />
                )}
                Activar y exigir esta versión
              </button>
            )}
          </form>
        </div>
      )}
    </div>
  );
}
