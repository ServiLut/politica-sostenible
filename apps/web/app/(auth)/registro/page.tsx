"use client";

import React, { useState } from "react";
import Link from "next/link";
import { Button, Input, Label, Select } from "@/components/ui";
import {
  UserPlus,
  User,
  Mail,
  Lock,
  Phone,
  CreditCard,
  Sparkles,
  CheckCircle2,
  ArrowRight,
  Loader2,
  ShieldCheck,
  Zap,
  Users,
} from "lucide-react";

export default function RegisterPage() {
  const [formData, setFormData] = useState({
    email: "",
    password: "",
    nombre: "",
    apellido: "",
    telefono: "",
    tipoDocumento: "",
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
      const response = await fetch("/api/auth/register", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(formData),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.message || "Error al registrar usuario");
      }

      setSuccess(true);
    } catch (err: unknown) {
      if (err instanceof Error) {
        setError(err.message);
      } else {
        setError("Ocurrió un error inesperado");
      }
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
                      placeholder="Juan"
                      value={formData.nombre}
                      onChange={handleChange}
                      required
                      className="rounded-2xl"
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
                      placeholder="Pérez"
                      value={formData.apellido}
                      onChange={handleChange}
                      required
                      className="rounded-2xl"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
                  <div className="space-y-2">
                    <Label
                      htmlFor="tipoDocumento"
                      className="ml-3 text-[9px] font-black uppercase tracking-widest text-zinc-700 dark:text-zinc-200"
                    >
                      Documento
                    </Label>
                    <Select
                      id="tipoDocumento"
                      name="tipoDocumento"
                      value={formData.tipoDocumento}
                      onChange={handleChange}
                      showIcon={false}
                      className="rounded-2xl appearance-none bg-none"
                      style={{
                        appearance: "none",
                        WebkitAppearance: "none",
                        MozAppearance: "none",
                        backgroundImage: "none",
                      }}
                    >
                      <option value="">Seleccione...</option>
                      <option value="CC">C.C.</option>
                      <option value="CE">C.E.</option>
                      <option value="NIT">NIT</option>
                      <option value="PP">Pasaporte</option>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label
                      htmlFor="numeroDocumento"
                      className="ml-3 text-[9px] font-black uppercase tracking-widest text-zinc-700 dark:text-zinc-200"
                    >
                      Número
                    </Label>
                    <div className="relative group">
                      <CreditCard className="absolute top-1/2 left-5 h-4 w-4 -translate-y-1/2 text-zinc-300 group-focus-within:text-zinc-900 transition-colors" />
                      <Input
                        id="numeroDocumento"
                        name="numeroDocumento"
                        placeholder="12345678"
                        value={formData.numeroDocumento}
                        onChange={handleChange}
                        className="pl-14 rounded-2xl"
                      />
                    </div>
                  </div>
                </div>
              </section>
            )}

            {/* Sección: Acceso */}
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
                      Email Corporativo
                    </Label>
                    <div className="relative group">
                      <Mail className="absolute top-1/2 left-5 h-4 w-4 -translate-y-1/2 text-zinc-300 group-focus-within:text-zinc-900 transition-colors" />
                      <Input
                        id="email"
                        name="email"
                        type="email"
                        placeholder="hola@empresa.com"
                        value={formData.email}
                        onChange={handleChange}
                        required
                        className="pl-14 rounded-2xl"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
                    <div className="space-y-2">
                      <Label
                        htmlFor="telefono"
                        className="ml-3 text-[9px] font-black uppercase tracking-widest text-zinc-700 dark:text-zinc-200"
                      >
                        Teléfono
                      </Label>
                      <div className="relative group">
                        <Phone className="absolute top-1/2 left-5 h-4 w-4 -translate-y-1/2 text-zinc-300 group-focus-within:text-zinc-900 transition-colors" />
                        <Input
                          id="telefono"
                          name="telefono"
                          type="tel"
                          placeholder="+57..."
                          value={formData.telefono}
                          onChange={handleChange}
                          className="pl-14 rounded-2xl"
                        />
                      </div>
                    </div>
                    <div className="space-y-2">
                      <Label
                        htmlFor="password"
                        className="ml-3 text-[9px] font-black uppercase tracking-widest text-zinc-700 dark:text-zinc-200"
                      >
                        Password
                      </Label>
                      <div className="relative group">
                        <Lock className="absolute top-1/2 left-5 h-4 w-4 -translate-y-1/2 text-zinc-300 group-focus-within:text-zinc-900 transition-colors" />
                        <Input
                          id="password"
                          name="password"
                          type="password"
                          placeholder="••••••••"
                          value={formData.password}
                          onChange={handleChange}
                          required
                          className="pl-14 rounded-2xl"
                        />
                      </div>
                    </div>
                  </div>
                </div>
              </section>
            )}

            <div className="flex items-center justify-end gap-4 pt-4">
              {step === 2 && (
                <Button
                  type="button"
                  variant="outline"
                  onClick={handlePrevStep}
                  className="rounded-2xl px-10 h-14"
                >
                  Volver
                </Button>
              )}

              {step === 1 ? (
                <Button
                  type="button"
                  onClick={handleNextStep}
                  size="lg"
                  className="group rounded-2xl bg-zinc-900 text-white hover:bg-zinc-800 dark:bg-zinc-50 dark:text-zinc-900 dark:hover:bg-white shadow-xl px-12"
                >
                  <span className="flex items-center gap-3">
                    Continuar
                    <ArrowRight className="h-5 w-5 transition-transform group-hover:translate-x-1" />
                  </span>
                </Button>
              ) : (
                <Button
                  type="submit"
                  disabled={loading}
                  size="lg"
                  className="group rounded-2xl bg-zinc-900 text-white hover:bg-zinc-800 dark:bg-zinc-50 dark:text-zinc-900 dark:hover:bg-white shadow-xl px-12"
                >
                  {loading ? (
                    <div className="flex items-center gap-3">
                      <Loader2 className="h-5 w-5 animate-spin" />
                      <span>Creando...</span>
                    </div>
                  ) : (
                    <span className="flex items-center gap-3">
                      Empezar ahora
                      <UserPlus className="h-5 w-5" />
                    </span>
                  )}
                </Button>
              )}
            </div>

            <p className="text-center text-[9px] font-black uppercase tracking-[0.2em] text-zinc-400 leading-relaxed max-w-xs mx-auto">
              Al registrarte, aceptas los{" "}
              <Link
                href="/terminos"
                className="text-zinc-900 dark:text-zinc-100 underline"
              >
                Términos
              </Link>{" "}
              y la{" "}
              <Link
                href="/privacidad"
                className="text-zinc-900 dark:text-zinc-100 underline"
              >
                Privacidad
              </Link>
              .
            </p>
          </form>

          <div className="border-t border-zinc-200 pt-8 text-center dark:border-zinc-800">
            <p className="text-zinc-400 font-bold text-lg">
              ¿Ya estás dentro?{" "}
              <Button
                asChild
                variant="link"
                className="p-0 h-auto font-black text-zinc-900 dark:text-zinc-50 hover:no-underline underline underline-offset-[12px] decoration-4"
              >
                <Link href="/iniciar-sesion">Inicia sesión</Link>
              </Button>
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
