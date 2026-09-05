"use client";

import { useState, useEffect } from "react";
import { ShieldCheck, ShieldAlert, KeyRound, Loader2, Copy, Check } from "lucide-react";
import { Button, Input, Label } from "@/components/ui";
import { getMfaStatus, setupMfa, verifyMfa, disableMfa } from "@/lib/mfa-api";
import { ApiError } from "@/lib/api-client";
import Image from "next/image";

type MfaState = "loading" | "not_enabled" | "setup" | "enabled" | "disabling";

export function MfaSetup() {
  const [state, setState] = useState<MfaState>("loading");
  const [qrCodeUrl, setQrCodeUrl] = useState<string | null>(null);
  const [secret, setSecret] = useState<string | null>(null);
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    fetchStatus();
  }, []);

  async function fetchStatus() {
    try {
      const { enabled } = await getMfaStatus();
      setState(enabled ? "enabled" : "not_enabled");
    } catch (err) {
      // If fetching fails, we keep it as not enabled but log error
      console.error(err);
      setState("not_enabled");
    }
  }

  async function handleEnable() {
    setIsSubmitting(true);
    setError(null);
    try {
      const data = await setupMfa();
      setQrCodeUrl(data.qrCodeDataUrl);
      setSecret(data.secret);
      setCode("");
      setState("setup");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Error al configurar 2FA");
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleVerify(e: React.FormEvent) {
    e.preventDefault();
    if (code.length !== 6) return;
    
    setIsSubmitting(true);
    setError(null);
    try {
      await verifyMfa(code);
      setState("enabled");
      setCode("");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Código inválido");
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleDisable(e: React.FormEvent) {
    e.preventDefault();
    if (code.length !== 6) return;

    setIsSubmitting(true);
    setError(null);
    try {
      await disableMfa(code);
      setState("not_enabled");
      setCode("");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Código inválido");
    } finally {
      setIsSubmitting(false);
    }
  }

  const copySecret = () => {
    if (secret) {
      navigator.clipboard.writeText(secret);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  if (state === "loading") {
    return (
      <section className="rounded-[2rem] border border-slate-200 bg-white p-6 shadow-sm sm:p-8 flex justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-slate-400" />
      </section>
    );
  }

  return (
    <section className="rounded-[2rem] border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
      <div className="flex items-start gap-4">
        <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-slate-50 text-slate-700">
          <ShieldCheck aria-hidden="true" size={23} />
        </span>
        <div className="flex-1">
          <h2 className="text-xl font-black text-slate-950">
            Autenticación de dos factores
          </h2>
          <p className="mt-1 text-sm leading-6 text-slate-500">
            Protege tu cuenta con un segundo factor de autenticación usando una aplicación como Google Authenticator o Authy.
          </p>

          <div className="mt-7">
            {error && (
              <p className="mb-4 rounded-xl bg-red-50 p-4 text-sm font-bold text-red-700">
                {error}
              </p>
            )}

            {state === "not_enabled" && (
              <Button
                onClick={handleEnable}
                disabled={isSubmitting}
              >
                {isSubmitting ? "Cargando..." : "Habilitar 2FA"}
              </Button>
            )}

            {state === "setup" && (
              <div className="space-y-6 rounded-2xl border border-slate-100 bg-slate-50 p-6">
                <div className="flex flex-col sm:flex-row gap-6 items-start">
                  <div className="bg-white p-2 rounded-xl shadow-sm border border-slate-200">
                    {qrCodeUrl ? (
                      <Image src={qrCodeUrl} alt="Código QR 2FA" width={160} height={160} className="w-40 h-40" />
                    ) : (
                      <div className="w-40 h-40 bg-slate-100 rounded animate-pulse" />
                    )}
                  </div>
                  <div className="flex-1 space-y-4">
                    <div>
                      <h3 className="text-sm font-bold text-slate-900 mb-1">1. Escanea el código QR</h3>
                      <p className="text-sm text-slate-600">Abre tu aplicación de autenticación y escanea este código.</p>
                    </div>
                    <div>
                      <h3 className="text-sm font-bold text-slate-900 mb-1">¿No puedes escanearlo?</h3>
                      <p className="text-sm text-slate-600 mb-2">Ingresa esta clave manualmente:</p>
                      <div className="flex items-center gap-2">
                        <code className="bg-slate-200 px-2 py-1 rounded text-sm font-mono tracking-widest text-slate-800 break-all">
                          {secret}
                        </code>
                        <Button type="button" variant="ghost" size="sm" onClick={copySecret} className="shrink-0 h-8 px-2">
                          {copied ? <Check className="h-4 w-4 text-emerald-600" /> : <Copy className="h-4 w-4" />}
                        </Button>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="border-t border-slate-200 pt-6">
                  <h3 className="text-sm font-bold text-slate-900 mb-3">2. Ingresa el código</h3>
                  <form onSubmit={handleVerify} className="flex flex-col sm:flex-row gap-3">
                    <Input
                      type="text"
                      inputMode="numeric"
                      pattern="[0-9]*"
                      maxLength={6}
                      placeholder="000000"
                      value={code}
                      onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
                      className="w-full sm:w-48 text-center tracking-widest font-mono text-lg"
                      required
                    />
                    <div className="flex gap-2">
                      <Button type="submit" disabled={isSubmitting || code.length !== 6}>
                        {isSubmitting ? "Verificando..." : "Verificar y activar"}
                      </Button>
                      <Button type="button" variant="outline" onClick={() => { setState("not_enabled"); setCode(""); setError(null); }} disabled={isSubmitting}>
                        Cancelar
                      </Button>
                    </div>
                  </form>
                </div>
              </div>
            )}

            {state === "enabled" && (
              <div className="space-y-4">
                <div className="inline-flex items-center gap-2 rounded-full bg-emerald-100 px-4 py-2 text-sm font-bold text-emerald-800">
                  <ShieldCheck className="h-4 w-4" />
                  ✓ Activo
                </div>
                <div>
                  <Button variant="outline" onClick={() => setState("disabling")}>
                    Deshabilitar
                  </Button>
                </div>
              </div>
            )}

            {state === "disabling" && (
              <div className="space-y-4 rounded-2xl border border-amber-100 bg-amber-50 p-6">
                <div className="flex items-start gap-3">
                  <ShieldAlert className="h-5 w-5 text-amber-600 shrink-0 mt-0.5" />
                  <div>
                    <h3 className="text-sm font-bold text-amber-900">Desactivar autenticación de dos factores</h3>
                    <p className="text-sm text-amber-700 mt-1 mb-4">Ingresa el código actual de tu aplicación para confirmar la desactivación.</p>
                  </div>
                </div>
                
                <form onSubmit={handleDisable} className="flex flex-col sm:flex-row gap-3">
                  <Input
                    type="text"
                    inputMode="numeric"
                    pattern="[0-9]*"
                    maxLength={6}
                    placeholder="000000"
                    value={code}
                    onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
                    className="w-full sm:w-48 text-center tracking-widest font-mono text-lg bg-white"
                    required
                  />
                  <div className="flex gap-2">
                    <Button type="submit" variant="destructive" disabled={isSubmitting || code.length !== 6}>
                      {isSubmitting ? "Procesando..." : "Confirmar desactivación"}
                    </Button>
                    <Button type="button" variant="outline" onClick={() => { setState("enabled"); setCode(""); setError(null); }} disabled={isSubmitting}>
                      Cancelar
                    </Button>
                  </div>
                </form>
              </div>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}
