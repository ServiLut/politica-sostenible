'use client';

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Lock, Loader2, AlertCircle, CheckCircle2, ArrowLeft } from 'lucide-react';
import { createClient } from '@/utils/supabase/client';
import Image from 'next/image';

export default function ResetPasswordPage() {
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isSuccess, setIsSuccess] = useState(false);
  const router = useRouter();
  
  const supabase = React.useMemo(() => createClient(), []);

  // Basic check to see if we have a session (Supabase sets it automatically from the URL fragment)
  useEffect(() => {
    const checkSession = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        // If no session is found after a few seconds, it might be an invalid or expired link
        // But we'll let the update attempt fail gracefully if needed.
      }
    };
    checkSession();
  }, [supabase]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setError(null);

    if (password !== confirmPassword) {
      setError('Las contraseñas no coinciden');
      setIsLoading(false);
      return;
    }

    if (password.length < 6) {
      setError('La contraseña debe tener al menos 6 caracteres');
      setIsLoading(false);
      return;
    }

    try {
      const { error } = await supabase.auth.updateUser({
        password: password
      });

      if (error) throw error;

      setIsSuccess(true);
      // Wait a bit and redirect to login
      setTimeout(() => {
        router.push('/login');
      }, 3000);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Error al restablecer la contraseña';
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
          <h2 className="text-4xl font-serif font-bold mb-4">Nueva etapa, nueva clave.</h2>
          <p className="text-lg opacity-80 font-medium">Asegura tu cuenta con una contraseña fuerte y sigue explorando nuestra colección.</p>
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
              Restablecer contraseña
            </h1>
            <p className="mt-3 text-muted text-lg">
              Ingresa tu nueva contraseña a continuación.
            </p>
          </div>

          {isSuccess ? (
            <div className="rounded-xl bg-secondary/10 p-8 border border-secondary/20 text-center space-y-4">
              <div className="flex justify-center">
                <CheckCircle2 className="h-12 w-12 text-secondary" />
              </div>
              <h2 className="text-xl font-bold text-body">¡Contraseña actualizada!</h2>
              <p className="text-muted">
                Tu contraseña ha sido restablecida con éxito. Serás redirigido al inicio de sesión en unos segundos.
              </p>
              <div className="pt-4">
                <Link
                  href="/login"
                  className="inline-block font-bold text-primary hover:underline"
                >
                  Ir al inicio de sesión ahora
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
                <div className="space-y-5">
                  <div className="space-y-2">
                    <label className="text-sm font-bold text-body">Nueva contraseña</label>
                    <div className="relative">
                      <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3.5 text-muted">
                        <Lock className="h-5 w-5" />
                      </div>
                      <input
                        type="password"
                        required
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        className="block w-full rounded-xl border border-theme bg-base py-3.5 pl-11 pr-4 text-body placeholder:text-muted/70 focus:border-primary focus:bg-surface focus:outline-none focus:ring-1 focus:ring-primary transition-all"
                        placeholder="••••••••"
                      />
                    </div>
                  </div>

                  <div className="space-y-2">
                    <label className="text-sm font-bold text-body">Confirmar nueva contraseña</label>
                    <div className="relative">
                      <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3.5 text-muted">
                        <Lock className="h-5 w-5" />
                      </div>
                      <input
                        type="password"
                        required
                        value={confirmPassword}
                        onChange={(e) => setConfirmPassword(e.target.value)}
                        className="block w-full rounded-xl border border-theme bg-base py-3.5 pl-11 pr-4 text-body placeholder:text-muted/70 focus:border-primary focus:bg-surface focus:outline-none focus:ring-1 focus:ring-primary transition-all"
                        placeholder="••••••••"
                      />
                    </div>
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
                      Actualizando...
                    </>
                  ) : (
                    'Restablecer contraseña'
                  )}
                </button>
              </form>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
