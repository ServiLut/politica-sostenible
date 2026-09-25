import Link from "next/link";
import { ArrowRight, SlidersHorizontal } from "lucide-react";

export function OperationProfileRequired({ title, description }: {
  title: string;
  description: string;
}) {
  return (
    <section className="mx-auto w-full min-w-0 max-w-3xl space-y-5">
      <h1 className="text-2xl font-semibold tracking-tight text-slate-950 sm:text-3xl">{title}</h1>
      <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-8">
        <span className="mb-4 inline-flex h-12 w-12 items-center justify-center rounded-xl bg-blue-50 text-blue-700">
          <SlidersHorizontal aria-hidden="true" size={24} />
        </span>
        <h2 className="text-lg font-semibold text-slate-950">Completa el perfil de operación</h2>
        <p className="mt-2 max-w-xl text-sm leading-6 text-slate-600">{description}</p>
        <p className="mt-2 text-sm leading-6 text-slate-500">Administración o la gerencia de campaña debe registrar los datos y la etapa vigente.</p>
        <Link href="/dashboard/operation-profile" className="mt-5 inline-flex min-h-11 max-w-full items-center justify-center gap-2 rounded-xl bg-blue-700 px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-blue-800 focus-ring">
          Revisar perfil de operación <ArrowRight aria-hidden="true" className="shrink-0" size={17} />
        </Link>
      </div>
    </section>
  );
}
