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
          El acceso se restablece de forma administrada
        </h1>
        <p className="mt-5 text-lg leading-relaxed text-slate-600">
          Política Sostenible no solicita nuevas contraseñas mediante enlaces.
          Pide a un administrador de tu organización que verifique tu identidad
          y genere una nueva contraseña desde Equipo y accesos.
        </p>
        <p className="mt-4 text-sm font-medium text-slate-500">
          Recíbela por un canal verificado, úsala para iniciar sesión y cámbiala
          inmediatamente desde Mi perfil. El valor generado solo se muestra una
          vez en la pantalla del administrador.
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
