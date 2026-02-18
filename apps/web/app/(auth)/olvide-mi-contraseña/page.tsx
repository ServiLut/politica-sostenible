'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { Mail, Loader2, AlertCircle, ArrowLeft, CheckCircle2 } from 'lucide-react';
import Image from 'next/image';

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isSubmitted, setIsSubmitted] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setError(null);

    try {
      const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000';
      
      const res = await fetch(`${API_URL}/auth/forgot-password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      });

      if (!res.ok) {
        const errData = await res.json();
        throw new Error(errData.message || 'Error al enviar el correo de recuperación');
      }

      setIsSubmitted(true);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Error al procesar la solicitud';
      setError(message);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen w-full bg-surface">
      {/* Left: Decorative Image */}
      <div className="hidden lg:block w-1/2 bg-secondary/10 relative overflow-hidden">
        <Image
          src="/tote_bag_lifestyle.png"
          alt="Tote Bag Lifestyle"
          fill
          className="object-cover"
          priority
        />
        <div className="absolute inset-0 bg-black/5 z-10" />
        <div className="absolute bottom-12 left-12 right-12 z-20 text-[#111111]">
          <h2 className="text-4xl font-serif font-bold mb-4">No te preocupes.</h2>
          <p className="text-lg opacity-80 font-medium">Recupera el acceso a tu cuenta en unos simples pasos y sigue disfrutando de tus beneficios.</p>
        </div>
      </div>

      {/* Right: Form */}
      <div className="w-full lg:w-1/2 flex items-center justify-center p-8 relative">
        <div className="absolute top-8 left-8">
          <Link href="/login" className="flex items-center gap-2 text-sm text-muted hover:text-primary transition-colors font-medium">
            <ArrowLeft className="w-4 h-4" />
            Volver al inicio de sesión
          </Link>
        </div>

        <div className="w-full max-w-md space-y-10">
          <div className="text-center lg:text-left">
            <h1 className="text-4xl font-serif font-bold text-body tracking-tight">
              ¿Olvidaste tu contraseña?
            </h1>
            <p className="mt-3 text-muted text-lg">
              Ingresa tu correo electrónico y te enviaremos un enlace para restablecerla.
            </p>
          </div>

          {isSubmitted ? (
            <div className="rounded-xl bg-secondary/10 p-8 border border-secondary/20 text-center space-y-4">
              <div className="flex justify-center">
                <CheckCircle2 className="h-12 w-12 text-secondary" />
              </div>
              <h2 className="text-xl font-bold text-body">¡Correo enviado!</h2>
              <p className="text-muted">
                Hemos enviado un enlace de recuperación a <strong>{email}</strong>. 
                Por favor revisa tu bandeja de entrada y sigue las instrucciones.
              </p>
              <div className="pt-4">
                <Link
                  href="/login"
                  className="inline-block font-bold text-primary hover:underline"
                >
                  Regresar al inicio de sesión
                </Link>
              </div>
            </div>
          ) : (
            <>
              {error && (
                <div className="flex items-center gap-3 rounded-lg bg-red-50 p-4 text-sm text-red-700 border border-red-100 dark:bg-red-950/30 dark:text-red-400 dark:border-red-900/50">
                  <AlertCircle className="h-5 w-5 shrink-0" />
                  <p>{error}</p>
                </div>
              )}

              <form className="space-y-6" onSubmit={handleSubmit}>
                <div className="space-y-2">
                  <label className="text-sm font-bold text-body">Correo electrónico</label>
                  <div className="relative">
                    <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3.5 text-muted">
                      <Mail className="h-5 w-5" />
                    </div>
                    <input
                      type="email"
                      required
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      className="block w-full rounded-xl border border-theme bg-base py-3.5 pl-11 pr-4 text-body placeholder:text-muted/70 focus:border-primary focus:bg-surface focus:outline-none focus:ring-1 focus:ring-primary transition-all"
                      placeholder="nombre@ejemplo.com"
                    />
                  </div>
                </div>

                <button
                  type="submit"
                  disabled={isLoading}
                  className="flex w-full items-center justify-center rounded-xl bg-primary px-4 py-4 text-sm font-bold text-base-color uppercase tracking-widest hover:opacity-90 focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-70 transition-all shadow-lg hover:shadow-xl hover:-translate-y-0.5 duration-200"
                >
                  {isLoading ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Enviando...
                    </>
                  ) : (
                    'Enviar enlace'
                  )}
                </button>
              </form>
            </>
          )}

          <div className="text-center pt-4">
            <p className="text-muted">
              ¿Recordaste tu contraseña?{' '}
              <Link
                href="/login"
                className="font-bold text-primary hover:underline"
              >
                Inicia sesión
              </Link>
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
