"use client";

import { AlertTriangle, RefreshCcw, Home, Sparkles } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  DASHBOARD_CONTENT_ID,
  isDashboardPath,
  MAIN_CONTENT_ID,
} from "@/lib/skip-navigation";

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const pathname = usePathname();

  return (
    <div
      id={isDashboardPath(pathname) ? DASHBOARD_CONTENT_ID : MAIN_CONTENT_ID}
      tabIndex={-1}
      className="min-h-screen bg-zinc-50 flex items-center justify-center p-6 outline-none"
    >
      <div className="max-w-md w-full bg-white rounded-[2.5rem] border border-zinc-100 shadow-2xl p-10 text-center space-y-8 animate-in fade-in zoom-in-95 duration-500">
        <div className="flex justify-center">
          <div className="h-20 w-20 rounded-3xl bg-red-50 text-accent flex items-center justify-center shadow-lg shadow-red-100">
            <AlertTriangle aria-hidden="true" className="h-10 w-10" />
          </div>
        </div>

        <div className="space-y-2">
          <div className="flex items-center justify-center gap-2 mb-2">
            <Sparkles aria-hidden="true" className="h-4 w-4 text-primary" />
            <span className="text-[10px] font-black text-zinc-400 uppercase tracking-[0.2em]">
              Sistema Politica Sostenible
            </span>
          </div>
          <h1 className="text-3xl font-black text-secondary tracking-tighter">
            Ups, algo salió mal
          </h1>
          <p className="text-zinc-500 font-medium italic leading-relaxed">
            Esta pantalla no puede confirmar si la última operación terminó ni
            si produjo cambios. Intenta cargarla de nuevo y, antes de repetir
            un envío, verifica su estado para evitar duplicados.
          </p>
        </div>

        <div className="flex flex-col gap-3">
          <button
            type="button"
            onClick={() => reset()}
            className="h-14 w-full bg-primary text-white rounded-2xl flex items-center justify-center gap-3 font-black text-xs uppercase tracking-widest hover:bg-primary/90 transition-all shadow-xl shadow-primary/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-700 focus-visible:ring-offset-2"
          >
            <RefreshCcw aria-hidden="true" className="h-4 w-4" />
            Intentar de nuevo
          </button>

          <Link
            href="/dashboard"
            className="h-14 w-full bg-zinc-100 text-secondary rounded-2xl flex items-center justify-center gap-3 font-black text-xs uppercase tracking-widest hover:bg-zinc-200 transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-700 focus-visible:ring-offset-2"
          >
            <Home aria-hidden="true" className="h-4 w-4" />
            Volver al Inicio
          </Link>
        </div>

        <p className="text-[10px] font-bold text-zinc-300 uppercase tracking-widest pt-4">
          Error ID: {error.digest || "unknown"}
        </p>
      </div>
    </div>
  );
}
