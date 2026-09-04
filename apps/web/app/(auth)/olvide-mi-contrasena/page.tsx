import Link from "next/link";
import { ArrowLeft, LifeBuoy, ShieldAlert } from "lucide-react";
import { Button } from "@/components/ui";

export default function ForgotPasswordPage() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-50 p-6">
      <section className="w-full max-w-xl rounded-[2rem] border border-slate-200 bg-white p-8 shadow-xl shadow-slate-900/5 sm:p-12">
        <div className="mb-8 flex h-16 w-16 items-center justify-center rounded-2xl bg-amber-50 text-amber-700">
          <ShieldAlert className="h-8 w-8" aria-hidden="true" />
        </div>

        <div className="space-y-4">
          <p className="text-xs font-black uppercase tracking-[0.25em] text-blue-700">
            Protección de la cuenta
          </p>
          <h1 className="text-4xl font-black tracking-tight text-slate-950">
            Recupera el acceso con tu administrador
          </h1>
          <p className="text-lg leading-relaxed text-slate-600">
            El restablecimiento se realiza dentro de tu organización. Un
            administrador puede verificar tu identidad y generar una nueva
            contraseña sin usar enlaces externos ni servicios alternos.
          </p>
        </div>

        <div className="my-8 rounded-2xl border border-blue-100 bg-blue-50 p-5 text-sm leading-relaxed text-blue-950">
          <div className="mb-2 flex items-center gap-2 font-bold">
            <LifeBuoy className="h-5 w-5" aria-hidden="true" />
            Solicita ayuda al administrador de tu campaña
          </div>
          <p>
            Usa únicamente el canal interno que tu organización ya haya
            verificado. El valor generado se muestra una sola vez al
            administrador. Inicia sesión con esa contraseña y cámbiala
            inmediatamente desde Mi perfil. Nunca compartas el token de tu
            sesión.
          </p>
        </div>

        <Button asChild className="w-full rounded-xl" size="lg">
          <Link href="/iniciar-sesion">
            <ArrowLeft className="h-4 w-4" aria-hidden="true" />
            Volver a iniciar sesión
          </Link>
        </Button>
      </section>
    </main>
  );
}
