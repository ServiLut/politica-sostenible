"use client";
import { PageHeader } from "@/components/ui/PageHeader";

import { usePageRequest } from "@/lib/use-page-request";

import { useAuth } from "@/context/auth";
import { ApiError } from "@/lib/api-client";
import {
  activateConsentNotice,
  getCurrentConsentNotice,
  type ActivateConsentNoticeInput,
  type ConsentNoticeContext,
} from "@/lib/consent-notices-api";
import {
  AlertCircle,
  CheckCircle2,
  ExternalLink,
  Loader2,
  RefreshCw,
  ShieldCheck,
} from "lucide-react";
import { FormEvent, useState } from "react";

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
  const [formDraft, setFormDraft] = useState<{
    source: ConsentNoticeContext | null;
    value: ActivateConsentNoticeInput;
  } | null>(null);
  const [saving, setSaving] = useState(false);
  const [actionError, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [reload, setReload] = useState(0);

  const {
    data: context,
    loading,
    error: requestError,
    setData: setContext,
  } = usePageRequest(getCurrentConsentNotice, { reloadKey: reload });
  const error =
    actionError ?? (requestError ? readableError(requestError) : null);
  const form =
    formDraft?.source === context
      ? formDraft.value
      : context?.notice
        ? {
            version: context.notice.version,
            title: context.notice.title,
            content: context.notice.content,
            controllerName: context.notice.controllerName,
            contactEmail: context.notice.contactEmail,
            privacyPolicyUrl: context.notice.privacyPolicyUrl ?? "",
          }
        : { ...EMPTY_FORM, controllerName: tenant?.name ?? "" };
  function setForm(value: ActivateConsentNoticeInput) {
    setFormDraft({ source: context, value });
  }

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
        `Aviso ${response.notice?.version ?? ""} activo. El historial anterior se conservó y las autorizaciones de otras versiones requerirán una nueva confirmación.`,
      );
    } catch (requestError: unknown) {
      setError(readableError(requestError));
    } finally {
      setSaving(false);
    }
  }

  const current = context?.notice;

  return (
    <div className="mx-auto max-w-5xl space-y-7 min-w-0">
      <PageHeader
        title="Aviso de privacidad"
        description="Activa el aviso propio de tu organización antes de registrar autorizaciones. Una nueva versión requiere confirmar nuevamente el consentimiento."
        icon={ShieldCheck}
        actions={
          <button
            type="button"
            onClick={() => setReload((value) => value + 1)}
            disabled={loading || saving}
            className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-blue-700 px-5 text-sm font-bold text-white hover:bg-blue-800 disabled:opacity-50 max-w-full whitespace-normal"
          >
            <RefreshCw
              aria-hidden="true"
              size={15}
              className={loading ? "animate-spin" : undefined}
            />
            Actualizar
          </button>
        }
      />

      {notice && (
        <div
          role="status"
          className="flex items-start gap-3 rounded-2xl border border-emerald-200 bg-emerald-50 p-5 text-sm font-semibold text-emerald-950 min-w-0"
        >
          <CheckCircle2 aria-hidden="true" size={20} /> {notice}
        </div>
      )}
      {error && (
        <div
          role="alert"
          className="flex items-center gap-3 rounded-2xl border border-red-200 bg-red-50 p-5 text-sm font-semibold text-red-900 min-w-0"
        >
          <AlertCircle aria-hidden="true" size={20} /> {error}
        </div>
      )}

      {loading ? (
        <div className="flex items-center justify-center gap-3 rounded-2xl border border-slate-200 bg-white p-8 text-sm font-semibold text-slate-600 min-w-0">
          <Loader2 className="animate-spin text-slate-400" size={24} />
          Consultando el aviso vigente…
        </div>
      ) : (
        <div className="grid gap-6 lg:grid-cols-[minmax(0,0.8fr)_minmax(0,1.2fr)] min-w-0">
          <aside className="space-y-5 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
            <div>
              <p className="text-xs font-semibold text-slate-400">
                Estado actual
              </p>
              <p
                className={`mt-3 inline-flex rounded-full px-3 py-1 text-xs font-semibold ${
                  current
                    ? "bg-emerald-50 text-emerald-800"
                    : "bg-amber-50 text-amber-900"
                }`}
              >
                {current ? `Activo · ${current.version}` : "Sin configurar"}
              </p>
            </div>
            <dl className="space-y-4 text-sm min-w-0">
              <div>
                <dt className="text-xs font-semibold text-slate-400">
                  Finalidad
                </dt>
                <dd className="mt-1 font-semibold text-slate-800">
                  {context ? purposeLabel(context.purpose) : "No disponible"}
                </dd>
              </div>
              {current && (
                <>
                  <div>
                    <dt className="text-xs font-semibold text-slate-400">
                      Responsable
                    </dt>
                    <dd className="mt-1 font-semibold text-slate-800">
                      {current.controllerName}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-xs font-semibold text-slate-400">
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
                      className="inline-flex items-center gap-2 text-sm font-semibold text-blue-700 underline max-w-full whitespace-normal"
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
            className="space-y-5 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8 min-w-0"
          >
            <div>
              <h2 className="text-xl font-semibold text-slate-950">
                {current ? "Activar una versión nueva" : "Configurar el aviso"}
              </h2>
              <p className="mt-2 text-sm leading-6 text-slate-600">
                Si cambia cualquier texto, usa un identificador de versión
                nuevo. El servidor fija fecha, organización y responsable.
              </p>
            </div>

            <div className="grid gap-5 sm:grid-cols-2 min-w-0">
              <label className="space-y-2 text-sm font-semibold text-slate-500 min-w-0">
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
                  className="min-h-12 w-full rounded-xl border border-slate-200 px-4 text-sm font-semibold normal-case tracking-normal text-slate-900 disabled:bg-slate-100 min-w-0 max-w-full"
                />
              </label>
              <label className="space-y-2 text-sm font-semibold text-slate-500 min-w-0">
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
                  className="min-h-12 w-full rounded-xl border border-slate-200 px-4 text-sm font-semibold normal-case tracking-normal text-slate-900 disabled:bg-slate-100 min-w-0 max-w-full"
                />
              </label>
            </div>

            <label className="block space-y-2 text-sm font-semibold text-slate-500 min-w-0">
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
                className="min-h-12 w-full rounded-xl border border-slate-200 px-4 text-sm font-semibold normal-case tracking-normal text-slate-900 disabled:bg-slate-100 min-w-0 max-w-full"
              />
            </label>

            <label className="block space-y-2 text-sm font-semibold text-slate-500 min-w-0">
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
                className="w-full resize-y rounded-xl border border-slate-200 px-4 py-3 text-sm font-semibold leading-6 normal-case tracking-normal text-slate-900 disabled:bg-slate-100 min-w-0 max-w-full"
              />
              <span className="block text-xs font-medium normal-case tracking-normal text-slate-400">
                {form.content.length}/4.000 caracteres
              </span>
            </label>

            <div className="grid gap-5 sm:grid-cols-2 min-w-0">
              <label className="space-y-2 text-sm font-semibold text-slate-500 min-w-0">
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
                  className="min-h-12 w-full rounded-xl border border-slate-200 px-4 text-sm font-semibold normal-case tracking-normal text-slate-900 disabled:bg-slate-100 min-w-0 max-w-full"
                />
              </label>
              <label className="space-y-2 text-sm font-semibold text-slate-500 min-w-0">
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
                  className="min-h-12 w-full rounded-xl border border-slate-200 px-4 text-sm font-semibold normal-case tracking-normal text-slate-900 disabled:bg-slate-100 min-w-0 max-w-full"
                />
              </label>
            </div>

            {canEdit && (
              <button
                type="submit"
                disabled={saving}
                className="inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-emerald-700 px-6 text-sm font-semibold text-white shadow-lg shadow-emerald-900/10 disabled:opacity-50 max-w-full whitespace-normal"
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
