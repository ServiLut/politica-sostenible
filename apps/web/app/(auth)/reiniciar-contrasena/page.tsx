import Link from "next/link";
import { ArrowLeft, LockKeyhole } from "lucide-react";
import { Button } from "@/components/ui";

export default function ResetPasswordPage() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-50 p-6">
      <section className="w-full max-w-xl rounded-[2rem] border border-slate-200 bg-white p-8 text-center shadow-xl shadow-slate-900/5 sm:p-12">
        <div className="mx-auto mb-8 flex h-20 w-20 items-center justify-center rounded-3xl bg-slate-950 text-white">
          <LockKeyhole className="h-10 w-10" aria-hidden="true" />
        </div>

        <h1 className="text-4xl font-black tracking-tight text-slate-950">
          Este enlace no puede procesarse
        </h1>
        <p className="mt-5 text-lg leading-relaxed text-slate-600">
          No existe todavía un endpoint de NestJS para validar enlaces y cambiar
          la contraseña. Esta pantalla no usa Supabase Auth ni acepta una nueva
          clave sin una verificación emitida por el backend oficial.
        </p>
        <p className="mt-4 text-sm font-medium text-slate-500">
          Solicita asistencia por el canal verificado de tu campaña y no
          compartas claves o códigos recibidos por terceros.
        </p>

        <Button asChild className="mt-8 w-full rounded-xl" size="lg">
          <Link href="/iniciar-sesion">
            <ArrowLeft className="h-4 w-4" aria-hidden="true" />
            Volver a iniciar sesión
          </Link>
        </Button>
      </section>
    </main>
  );
}
