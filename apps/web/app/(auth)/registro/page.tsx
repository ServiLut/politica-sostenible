"use client";

import React, { useState } from "react";
import Link from "next/link";
import { Button, Input, Label, Select } from "@/components/ui";
import {
  UserPlus,
  Mail,
  Lock,
  Phone,
  Sparkles,
  CheckCircle2,
  ArrowRight,
  Loader2,
  ShieldCheck,
  Zap,
} from "lucide-react";

export default function RegisterPage() {
  const [formData, setFormData] = useState({
    email: "",
    password: "",
    nombre: "",
    apellido: "",
    telefono: "",
    tipoDocumento: "CC",
    numeroDocumento: "",
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [step, setStep] = useState(1);
  const [stepError, setStepError] = useState<string | null>(null);

  const handleChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>,
  ) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
    setStepError(null);
  };

  const isStepValid = (currentStep: number) => {
    if (currentStep === 1) {
      return Boolean(
        formData.nombre.trim() &&
        formData.apellido.trim() &&
        formData.tipoDocumento.trim() &&
        formData.numeroDocumento.trim(),
      );
    }
    return Boolean(formData.email.trim() && formData.password.trim());
  };

  const handleNextStep = () => {
    if (!isStepValid(1)) {
      setStepError("Completa todos los campos obligatorios para continuar.");
      return;
    }
    setStep(2);
  };

  const handlePrevStep = () => {
    setStepError(null);
    setStep(1);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isStepValid(2)) {
      setStepError("Completa email y password para crear tu cuenta.");
      return;
    }
    setLoading(true);
    setError(null);

    try {
      const res = await fetch("/api/auth/register", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          email: formData.email,
          password: formData.password,
          name: `${formData.nombre} ${formData.apellido}`.trim(),
          phone: formData.telefono || undefined,
          documentId: formData.numeroDocumento,
        }),
      });

      const payload = await res.json();
      if (!res.ok) {
        const backendMessage =
          payload?.error?.message ||
          payload?.message ||
          "Error al registrar usuario";
        throw new Error(
          Array.isArray(backendMessage)
            ? backendMessage.join(", ")
            : backendMessage,
        );
      }

      const data = payload?.data ?? payload;
      if (!data?.userId) {
        throw new Error("Registro incompleto: no se recibió userId");
      }

      setSuccess(true);
    } catch (err: any) {
      console.error("Registration error:", err);
      setError(err.message || "Error al registrar usuario");
    } finally {
      setLoading(false);
    }
  };

  if (success) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-zinc-50 p-6 dark:bg-zinc-950">
        <div className="w-full max-w-lg space-y-10 rounded-[3rem] border-4 border-white bg-white p-12 text-center shadow-[0_32px_64px_-15px_rgba(0,0,0,0.1)] dark:border-zinc-800 dark:bg-zinc-900/50">
          <div className="mx-auto flex h-28 w-28 items-center justify-center rounded-[2rem] bg-zinc-900 text-white dark:bg-white dark:text-black shadow-2xl">
            <CheckCircle2 className="h-16 w-16" />
          </div>
          <div className="space-y-4">
            <h1 className="text-5xl font-black text-zinc-900 dark:text-zinc-50 tracking-tighter">
              ¡Éxito total!
            </h1>
            <p className="text-2xl text-zinc-500 dark:text-zinc-400 leading-relaxed font-medium">
              Ya eres parte de la élite Politica Sostenible. Tu viaje comienza ahora.
            </p>
          </div>
          <Button asChild size="lg" className="w-full rounded-[2rem]">
            <Link
              href="/iniciar-sesion"
              className="flex items-center justify-center w-full h-full"
            >
              <span>Entrar a mi panel</span>
              <ArrowRight className="ml-3 h-6 w-6" />
            </Link>
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-screen overflow-hidden bg-white dark:bg-zinc-950">
      {/* Left side: Content/Marketing (Scrollable) */}
      <div className="relative hidden h-full w-1/2 flex-col bg-zinc-900 p-12 text-white lg:flex dark:bg-zinc-900">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_30%_20%,rgba(39,39,42,1)_0%,rgba(9,9,11,1)_100%)]" />
        <div className="absolute inset-0 bg-[url('https://www.transparenttextures.com/patterns/carbon-fibre.png')] opacity-10" />

        <div className="relative z-10">
          <Link href="/" className="flex items-center gap-4">
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-white text-black shadow-2xl">
              <Sparkles className="h-6 w-6" />
            </div>
            <span className="text-3xl font-black tracking-tighter">
              Politica Sostenible
            </span>
          </Link>
        </div>

        <div className="relative z-10 my-auto space-y-12">
          <div className="space-y-6">
            <h2 className="text-6xl font-black leading-[1] tracking-tighter">
              El poder de la <br />
              <span className="text-zinc-600">simplicidad.</span>
            </h2>
            <p className="max-w-md text-xl leading-relaxed text-zinc-400 font-medium">
              La plataforma multitenant más intuitiva y potente del mercado.
            </p>
          </div>

          <div className="grid gap-8">
            <div className="flex items-center gap-5 group">
              <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-[1.25rem] bg-zinc-800 border-2 border-zinc-700 shadow-2xl transition-transform group-hover:scale-110">
                <ShieldCheck className="h-7 w-7 text-zinc-100" />
              </div>
              <div>
                <h3 className="font-black text-zinc-100 uppercase tracking-widest text-[10px]">
                  Aislamiento Total
                </h3>
                <p className="text-zinc-400 text-base">
                  Seguridad grado bancario para cada tenant.
                </p>
              </div>
            </div>
            <div className="flex items-center gap-5 group">
              <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-[1.25rem] bg-zinc-800 border-2 border-zinc-700 shadow-2xl transition-transform group-hover:scale-110">
                <Zap className="h-7 w-7 text-zinc-100" />
              </div>
              <div>
                <h3 className="font-black text-zinc-100 uppercase tracking-widest text-[10px]">
                  Rendimiento Extremo
                </h3>
                <p className="text-zinc-400 text-base">
                  Arquitectura optimizada para la velocidad.
                </p>
              </div>
            </div>
          </div>
        </div>

        <div className="relative z-10 flex items-center justify-between text-xs font-black uppercase tracking-[0.3em] text-zinc-600">
          <span>POLITICA SOSTENIBLE © 2026</span>
          <div className="flex gap-10">
            <Link
              href="/privacidad"
              className="hover:text-white transition-colors"
            >
              Privacidad
            </Link>
            <Link
              href="/terminos"
              className="hover:text-white transition-colors"
            >
              Términos
            </Link>
          </div>
        </div>
      </div>

      {/* Right side: Register Form (Scrollable but hidden scrollbar) */}
      <div className="flex h-full w-full flex-col p-8 lg:w-1/2 xl:p-12 bg-zinc-50/30 dark:bg-transparent overflow-y-auto [ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:display-none">
        <div className="mx-auto w-full max-w-xl space-y-8 my-auto">
          <div className="space-y-2 lg:text-left text-center">
            <h1 className="text-5xl font-black tracking-tighter text-zinc-900 dark:text-zinc-50">
              Únete hoy
            </h1>
            <p className="text-xl text-zinc-400 dark:text-zinc-500 font-medium italic">
              Empieza a escalar tu negocio en segundos.
            </p>
          </div>

          {error && (
            <div className="rounded-[2.5rem] border-4 border-red-50 bg-red-50 p-6 text-sm text-red-700 dark:border-red-900/50 dark:bg-red-900/20 dark:text-red-400 shadow-2xl animate-in fade-in zoom-in-95">
              <div className="flex items-center gap-4">
                <div className="h-3 w-3 rounded-full bg-red-500 animate-ping" />
                <p className="font-bold text-lg">{error}</p>
              </div>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-6">
            <div className="space-y-3">
              <div className="flex items-center justify-between text-[10px] font-black uppercase tracking-[0.35em] text-zinc-400">
                <span>Paso {step} de 2</span>
                <span>{step === 1 ? "Tus Datos" : "Seguridad"}</span>
              </div>
              <div className="h-1.5 w-full rounded-full bg-zinc-200 dark:bg-zinc-800">
                <div
                  className={`h-1.5 rounded-full bg-zinc-900 transition-all dark:bg-zinc-50 ${
                    step === 1 ? "w-1/2" : "w-full"
                  }`}
                />
              </div>
            </div>

            {stepError && (
              <div className="rounded-[1.5rem] border-2 border-amber-100 bg-amber-50 p-4 text-sm text-amber-800 dark:border-amber-900/50 dark:bg-amber-900/20 dark:text-amber-200 shadow-sm animate-in zoom-in-95">
                <div className="flex items-center gap-3">
                  <div className="h-2 w-2 rounded-full bg-amber-500 animate-pulse" />
                  <span className="font-bold text-xs">{stepError}</span>
                </div>
              </div>
            )}

            {/* Sección: Datos */}
            {step === 1 && (
              <section className="space-y-6">
                <div className="flex items-center gap-4">
                  <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-zinc-900 text-white dark:bg-zinc-50 dark:text-zinc-900 text-base font-black shadow-xl">
                    1
                  </div>
                  <h2 className="text-[10px] font-black uppercase tracking-[0.4em] text-zinc-400">
                    Tus Datos
                  </h2>
                </div>

                <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
                  <div className="space-y-2">
                    <Label
                      htmlFor="nombre"
                      className="ml-3 text-[9px] font-black uppercase tracking-widest text-zinc-700 dark:text-zinc-200"
                    >
                      Nombre
                    </Label>
                    <Input
                      id="nombre"
                      name="nombre"
                      placeholder="Tu nombre"
                      value={formData.nombre}
                      onChange={handleChange}
                      className="h-12 rounded-2xl"
                      required
                    />
                  </div>

                  <div className="space-y-2">
                    <Label
                      htmlFor="apellido"
                      className="ml-3 text-[9px] font-black uppercase tracking-widest text-zinc-700 dark:text-zinc-200"
                    >
                      Apellido
                    </Label>
                    <Input
                      id="apellido"
                      name="apellido"
                      placeholder="Tu apellido"
                      value={formData.apellido}
                      onChange={handleChange}
                      className="h-12 rounded-2xl"
                      required
                    />
                  </div>

                  <div className="space-y-2">
                    <Label
                      htmlFor="tipoDocumento"
                      className="ml-3 text-[9px] font-black uppercase tracking-widest text-zinc-700 dark:text-zinc-200"
                    >
                      Tipo documento
                    </Label>
                    <Select
                      id="tipoDocumento"
                      name="tipoDocumento"
                      value={formData.tipoDocumento}
                      onChange={handleChange}
                      className="h-12 rounded-2xl"
                    >
                      <option value="CC">CC</option>
                      <option value="CE">CE</option>
                      <option value="TI">TI</option>
                      <option value="PP">PP</option>
                    </Select>
                  </div>

                  <div className="space-y-2">
                    <Label
                      htmlFor="numeroDocumento"
                      className="ml-3 text-[9px] font-black uppercase tracking-widest text-zinc-700 dark:text-zinc-200"
                    >
                      Número documento
                    </Label>
                    <Input
                      id="numeroDocumento"
                      name="numeroDocumento"
                      placeholder="Ej: 1012345678"
                      value={formData.numeroDocumento}
                      onChange={handleChange}
                      className="h-12 rounded-2xl"
                      required
                    />
                  </div>
                </div>

                <div className="flex justify-end">
                  <Button
                    type="button"
                    onClick={handleNextStep}
                    className="rounded-2xl px-8"
                  >
                    Continuar
                  </Button>
                </div>
              </section>
            )}

            {/* Sección: Seguridad */}
            {step === 2 && (
              <section className="space-y-6">
                <div className="flex items-center gap-4">
                  <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-zinc-900 text-white dark:bg-zinc-50 dark:text-zinc-900 text-base font-black shadow-xl">
                    2
                  </div>
                  <h2 className="text-[10px] font-black uppercase tracking-[0.4em] text-zinc-400">
                    Seguridad
                  </h2>
                </div>

                <div className="space-y-6">
                  <div className="space-y-2">
                    <Label
                      htmlFor="email"
                      className="ml-3 text-[9px] font-black uppercase tracking-widest text-zinc-700 dark:text-zinc-200"
                    >
                      Email
                    </Label>
                    <div className="relative">
                      <Mail className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 text-zinc-400" />
                      <Input
                        id="email"
                        name="email"
                        type="email"
                        placeholder="tu@correo.com"
                        value={formData.email}
                        onChange={handleChange}
                        className="h-12 rounded-2xl pl-11"
                        required
                      />
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label
                      htmlFor="password"
                      className="ml-3 text-[9px] font-black uppercase tracking-widest text-zinc-700 dark:text-zinc-200"
                    >
                      Contraseña
                    </Label>
                    <div className="relative">
                      <Lock className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 text-zinc-400" />
                      <Input
                        id="password"
                        name="password"
                        type="password"
                        placeholder="Mínimo 6 caracteres"
                        value={formData.password}
                        onChange={handleChange}
                        className="h-12 rounded-2xl pl-11"
                        minLength={6}
                        required
                      />
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label
                      htmlFor="telefono"
                      className="ml-3 text-[9px] font-black uppercase tracking-widest text-zinc-700 dark:text-zinc-200"
                    >
                      Teléfono (opcional)
                    </Label>
                    <div className="relative">
                      <Phone className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 text-zinc-400" />
                      <Input
                        id="telefono"
                        name="telefono"
                        placeholder="3001234567"
                        value={formData.telefono}
                        onChange={handleChange}
                        className="h-12 rounded-2xl pl-11"
                      />
                    </div>
                  </div>
                </div>

                <div className="flex items-center justify-between gap-3">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={handlePrevStep}
                    className="rounded-2xl px-8"
                  >
                    Volver
                  </Button>
                  <Button
                    type="submit"
                    disabled={loading}
                    className="rounded-2xl px-8"
                  >
                    {loading ? (
                      <>
                        <Loader2 className="h-4 w-4 animate-spin" />
                        Creando...
                      </>
                    ) : (
                      <>
                        <UserPlus className="h-4 w-4" />
                        Crear cuenta
                      </>
                    )}
                  </Button>
                </div>
              </section>
            )}
          </form>
        </div>
      </div>
    </div>
  );
}
