'use client';

import Link from 'next/link';
import Image from 'next/image';
import { AlertCircle, ArrowLeft, LifeBuoy } from 'lucide-react';

export default function ResetPasswordPage() {
  return (
    <div className="flex min-h-screen w-full bg-surface">
      <div className="hidden lg:block w-1/2 bg-secondary/10 relative overflow-hidden">
        <Image
          src="/tote_bag_lifestyle.png"
          alt="Restablecimiento de acceso"
          fill
          className="object-cover"
          priority
        />
        <div className="absolute inset-0 bg-black/5 z-10" />
        <div className="absolute bottom-12 left-12 right-12 z-20 text-[#111111]">
          <h2 className="text-4xl font-serif font-bold mb-4">Acceso seguro.</h2>
          <p className="text-lg opacity-80 font-medium">
            El restablecimiento se está migrando al flujo central del backend.
          </p>
        </div>
      </div>

      <div className="w-full lg:w-1/2 flex items-center justify-center p-8 relative">
        <div className="absolute top-8 left-8">
          <Link href="/iniciar-sesion" className="flex items-center gap-2 text-sm text-muted hover:text-primary transition-colors font-medium">
            <ArrowLeft className="w-4 h-4" />
            Volver al inicio de sesión
          </Link>
        </div>

        <div className="w-full max-w-md space-y-8">
          <div className="text-center lg:text-left">
            <h1 className="text-4xl font-serif font-bold text-body tracking-tight">
              Restablecimiento en actualización
            </h1>
            <p className="mt-3 text-muted text-lg">
              Esta pantalla ya no usa Supabase Auth. El restablecimiento definitivo se centralizará en NestJS.
            </p>
          </div>

          <div className="rounded-xl bg-amber-50 p-8 border border-amber-100 text-amber-900 space-y-4">
            <div className="flex items-center gap-3">
              <AlertCircle className="h-6 w-6 shrink-0" />
              <h2 className="text-lg font-bold">Acción temporalmente deshabilitada</h2>
            </div>
            <p className="text-sm leading-relaxed">
              Si necesitas recuperar el acceso, registra la solicitud desde “Olvidé mi contraseña” y coordina el cambio con soporte o con la administración de la campaña.
            </p>
          </div>

          <div className="flex flex-col gap-3">
            <Link
              href="/olvide-mi-contraseña"
              className="flex items-center justify-center gap-2 rounded-xl bg-primary px-4 py-4 text-sm font-bold text-base-color uppercase tracking-widest hover:opacity-90 transition-all shadow-lg"
            >
              <LifeBuoy className="h-4 w-4" />
              Solicitar soporte
            </Link>
            <Link
              href="/iniciar-sesion"
              className="flex items-center justify-center rounded-xl border border-theme bg-base px-4 py-4 text-sm font-bold text-body uppercase tracking-widest hover:bg-surface transition-all"
            >
              Volver al inicio de sesión
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
