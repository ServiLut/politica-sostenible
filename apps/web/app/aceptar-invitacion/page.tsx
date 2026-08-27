"use client";

import Link from "next/link";
import { FormEvent, useEffect, useRef, useState } from "react";
import { AlertCircle, CheckCircle2, Loader2, ShieldCheck } from "lucide-react";
import { ApiError } from "@/lib/api-client";
import { acceptTeamInvitation } from "@/lib/team-api";

function readableError(error: unknown): string {
  if (error instanceof ApiError) return error.message;
  if (error instanceof Error && error.message) return error.message;
  return "No fue posible aceptar la invitación. Intenta nuevamente.";
}

export default function AcceptInvitationPage() {
  const tokenProcessed = useRef(false);
  const [token, setToken] = useState<string | null>(null);
  const [tokenReady, setTokenReady] = useState(false);
  const [name, setName] = useState("");
  const [documentId, setDocumentId] = useState("");
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [termsAccepted, setTermsAccepted] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [completed, setCompleted] = useState(false);

  useEffect(() => {
    if (tokenProcessed.current) return;
    tokenProcessed.current = true;
    const hash = window.location.hash.startsWith("#")
      ? window.location.hash.slice(1)
      : window.location.hash;
    const secret = new URLSearchParams(hash).get("token");
    setToken(secret && /^[A-Za-z0-9_-]{43}$/.test(secret) ? secret : null);
    setTokenReady(true);
    // El secreto sigue en memoria solo durante este formulario y se retira de
    // la barra para evitar capturas accidentales o copias posteriores.
    window.history.replaceState(null, "", window.location.pathname);
  }, []);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    if (!token) {
      setError("El enlace de invitación no es válido.");
      return;
    }
    if (password !== confirmation) {
      setError("Las contraseñas no coinciden.");
      return;
    }
    if (new TextEncoder().encode(password).byteLength > 72) {
      setError("La contraseña no puede superar 72 bytes en UTF-8.");
      return;
    }

    setSaving(true);
    try {
      await acceptTeamInvitation({
        token,
        password,
        name: name.trim(),
        documentId: documentId.trim(),
        phone: phone.trim() || undefined,
        termsAccepted: true,
        termsVersion: "2026.1",
      });
      setCompleted(true);
      setToken(null);
      setPassword("");
      setConfirmation("");
    } catch (cause: unknown) {
      setError(readableError(cause));
    } finally {
      setSaving(false);
    }
  }

  return (
    <main className="min-h-screen bg-slate-950 px-4 py-10 sm:py-16">
      <div className="mx-auto max-w-xl">
        <Link
          href="/"
          className="mb-6 inline-flex text-sm font-black text-blue-300 hover:text-white"
        >
          Política Sostenible
        </Link>
        <section className="rounded-[2rem] bg-white p-6 shadow-2xl sm:p-9">
          {completed ? (
            <div className="py-8 text-center" role="status">
              <CheckCircle2
                className="mx-auto text-emerald-600"
                size={56}
                aria-hidden="true"
              />
              <h1 className="mt-5 text-3xl font-black tracking-tight text-slate-950">
                Acceso activado
              </h1>
              <p className="mx-auto mt-3 max-w-md text-sm font-medium leading-6 text-slate-600">
                Tu cuenta quedó vinculada a la organización con el rol que
                autorizó su administración.
              </p>
              <Link
                href="/iniciar-sesion"
                className="mt-7 inline-flex min-h-12 items-center justify-center rounded-xl bg-blue-700 px-6 text-sm font-black text-white hover:bg-blue-800"
              >
                Iniciar sesión
              </Link>
            </div>
          ) : !tokenReady ? (
            <div
              role="status"
              className="flex min-h-72 items-center justify-center gap-3 font-bold text-slate-600"
            >
              <Loader2
                className="animate-spin text-blue-700"
                aria-hidden="true"
              />
              Verificando enlace…
            </div>
          ) : !token ? (
            <div className="py-8 text-center" role="alert">
              <AlertCircle
                className="mx-auto text-red-600"
                size={52}
                aria-hidden="true"
              />
              <h1 className="mt-5 text-2xl font-black text-slate-950">
                Enlace no válido
              </h1>
              <p className="mt-3 text-sm font-medium leading-6 text-slate-600">
                Solicita a la administración un enlace vigente. Los enlaces
                vencen y solo pueden utilizarse una vez.
              </p>
              <Link
                href="/iniciar-sesion"
                className="mt-6 inline-flex font-black text-blue-700"
              >
                Ir al inicio de sesión
              </Link>
            </div>
          ) : (
            <>
              <div className="flex items-center gap-3">
                <span className="rounded-2xl bg-blue-50 p-3 text-blue-700">
                  <ShieldCheck size={24} aria-hidden="true" />
                </span>
                <div>
                  <p className="text-xs font-black uppercase tracking-[0.18em] text-blue-700">
                    Invitación protegida
                  </p>
                  <h1 className="text-2xl font-black text-slate-950">
                    Activa tu acceso
                  </h1>
                </div>
              </div>
              <p className="mt-5 text-sm font-medium leading-6 text-slate-600">
                Completa tus datos personales. El correo, la organización y el
                rol provienen del enlace autorizado y no pueden modificarse.
              </p>

              <form onSubmit={handleSubmit} className="mt-7 space-y-4">
                <label className="block space-y-2 text-sm font-black text-slate-700">
                  Nombre completo
                  <input
                    required
                    minLength={1}
                    maxLength={120}
                    autoComplete="name"
                    value={name}
                    onChange={(event) => setName(event.target.value)}
                    className="min-h-12 w-full rounded-xl border border-slate-200 px-4 font-semibold outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-100"
                  />
                </label>
                <label className="block space-y-2 text-sm font-black text-slate-700">
                  Número de documento
                  <input
                    required
                    maxLength={30}
                    autoComplete="off"
                    pattern="[A-Za-zÀ-ÿ0-9.\-]+"
                    value={documentId}
                    onChange={(event) => setDocumentId(event.target.value)}
                    className="min-h-12 w-full rounded-xl border border-slate-200 px-4 font-semibold outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-100"
                  />
                </label>
                <label className="block space-y-2 text-sm font-black text-slate-700">
                  Teléfono{" "}
                  <span className="font-medium text-slate-400">(opcional)</span>
                  <input
                    type="tel"
                    inputMode="tel"
                    maxLength={16}
                    autoComplete="tel"
                    pattern="\+?[0-9]{7,15}"
                    value={phone}
                    onChange={(event) => setPhone(event.target.value)}
                    className="min-h-12 w-full rounded-xl border border-slate-200 px-4 font-semibold outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-100"
                  />
                </label>
                <label className="block space-y-2 text-sm font-black text-slate-700">
                  Contraseña
                  <input
                    required
                    type="password"
                    aria-label={"Contrase\u00f1a"}
                    minLength={12}
                    maxLength={128}
                    autoComplete="new-password"
                    value={password}
                    onChange={(event) => setPassword(event.target.value)}
                    className="min-h-12 w-full rounded-xl border border-slate-200 px-4 font-semibold outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-100"
                  />
                  <span className="block text-xs font-semibold text-slate-400">
                    Mínimo 12 caracteres y máximo 72 bytes UTF-8.
                  </span>
                </label>
                <label className="block space-y-2 text-sm font-black text-slate-700">
                  Confirmar contraseña
                  <input
                    required
                    type="password"
                    minLength={12}
                    maxLength={128}
                    autoComplete="new-password"
                    value={confirmation}
                    onChange={(event) => setConfirmation(event.target.value)}
                    className="min-h-12 w-full rounded-xl border border-slate-200 px-4 font-semibold outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-100"
                  />
                </label>
                <label className="flex items-start gap-3 rounded-2xl border border-slate-200 bg-slate-50 p-4 text-sm font-semibold leading-6 text-slate-700">
                  <input
                    required
                    type="checkbox"
                    checked={termsAccepted}
                    onChange={(event) => setTermsAccepted(event.target.checked)}
                    className="mt-1 h-4 w-4 shrink-0"
                  />
                  <span>
                    Acepto los{" "}
                    <Link
                      href="/terminos"
                      target="_blank"
                      className="font-black text-blue-700 underline"
                    >
                      términos versión 2026.1
                    </Link>{" "}
                    y confirmo que estos datos son míos.
                  </span>
                </label>

                {error && (
                  <p
                    role="alert"
                    className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm font-bold text-red-800"
                  >
                    {error}
                  </p>
                )}

                <button
                  type="submit"
                  disabled={saving || !termsAccepted}
                  className="inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-blue-700 px-5 text-sm font-black text-white hover:bg-blue-800 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {saving && (
                    <Loader2
                      className="animate-spin"
                      size={18}
                      aria-hidden="true"
                    />
                  )}
                  Activar acceso
                </button>
              </form>
            </>
          )}
        </section>
      </div>
    </main>
  );
}
