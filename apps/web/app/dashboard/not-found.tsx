import Link from "next/link";
import { ArrowLeft, MapPinOff } from "lucide-react";

export default function DashboardNotFound() {
  return (
    <section className="flex min-h-[65vh] items-center justify-center py-8 text-center">
      <div className="w-full max-w-lg rounded-[2rem] border border-slate-200 bg-white p-7 shadow-xl shadow-slate-950/5 sm:p-10">
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
          La dirección no corresponde a un módulo disponible. Puede que el
          enlace esté incompleto o que la página haya cambiado de ubicación.
        </p>
        <Link
          href="/dashboard"
          className="mt-7 inline-flex min-h-12 items-center justify-center gap-2 rounded-xl bg-slate-950 px-6 text-sm font-black text-white transition hover:bg-blue-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 focus-visible:ring-offset-2"
        >
          <ArrowLeft aria-hidden="true" size={17} />
          Volver al panel disponible
        </Link>
      </div>
    </section>
  );
}
