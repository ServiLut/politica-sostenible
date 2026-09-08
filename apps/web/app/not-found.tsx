import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft, LayoutDashboard, MapPinOff } from "lucide-react";

export const metadata: Metadata = {
  title: "Página no encontrada | Política Sostenible",
  description: "La dirección solicitada no existe.",
};

export default function NotFound() {
  return (
    <main
      id="main-content"
      tabIndex={-1}
      className="flex min-h-screen items-center justify-center bg-slate-50 p-5 text-center outline-none sm:p-8"
    >
      <section className="w-full max-w-lg rounded-[2rem] border border-slate-200 bg-white p-7 shadow-xl shadow-slate-950/5 sm:p-10">
        <span className="mx-auto flex h-20 w-20 items-center justify-center rounded-3xl bg-blue-50 text-blue-700">
          <MapPinOff aria-hidden="true" size={38} />
        </span>
        <p className="mt-7 text-[10px] font-black uppercase tracking-[0.2em] text-blue-700">
          Error 404
        </p>
        <h1 className="mt-2 text-3xl font-black tracking-tight text-slate-950">
          Página no encontrada
        </h1>
        <p className="mx-auto mt-3 max-w-sm text-sm font-medium leading-6 text-slate-600">
          La dirección no corresponde a una página disponible. Puede que el
          enlace esté incompleto o que el contenido haya cambiado de ubicación.
        </p>
        <div className="mt-7 flex flex-col justify-center gap-3 sm:flex-row">
          <Link
            href="/"
            className="inline-flex min-h-12 items-center justify-center gap-2 rounded-xl border-2 border-slate-200 bg-white px-5 text-sm font-black text-slate-800 transition hover:border-slate-300 hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 focus-visible:ring-offset-2"
          >
            <ArrowLeft aria-hidden="true" size={17} />
            Volver al inicio
          </Link>
          <Link
            href="/dashboard"
            className="inline-flex min-h-12 items-center justify-center gap-2 rounded-xl bg-slate-950 px-5 text-sm font-black text-white transition hover:bg-blue-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 focus-visible:ring-offset-2"
          >
            <LayoutDashboard aria-hidden="true" size={17} />
            Ir al panel
          </Link>
        </div>
      </section>
    </main>
  );
}
