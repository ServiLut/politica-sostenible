"use client";

import Link from "next/link";
import { ArrowRight, LogIn } from "lucide-react";
import { getDefaultDashboardRoute } from "@/config/navigation";
import { useAuth } from "@/context/auth";

export function LandingAuthCta() {
  const { tenant, user, loading } = useAuth();

  if (!loading && user && tenant) {
    return (
      <div aria-live="polite">
        <Link
          href={getDefaultDashboardRoute(user, tenant)}
          className="inline-flex items-center gap-3 rounded-full bg-emerald-300 px-6 py-3.5 text-sm font-black text-emerald-950 shadow-[0_12px_35px_rgba(110,231,183,0.18)] transition hover:bg-emerald-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-4 focus-visible:ring-offset-[#0b1f1c]"
        >
          Ir a mi panel
          <ArrowRight className="h-4 w-4" aria-hidden="true" />
        </Link>
      </div>
    );
  }

  return (
    <div
      className="flex flex-col gap-3 sm:flex-row"
      aria-live="polite"
      aria-busy={loading}
    >
      <Link
        href="/iniciar-sesion"
        className="inline-flex items-center justify-center gap-2.5 rounded-full bg-emerald-300 px-6 py-3.5 text-sm font-black text-emerald-950 shadow-[0_12px_35px_rgba(110,231,183,0.18)] transition hover:bg-emerald-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-4 focus-visible:ring-offset-[#0b1f1c]"
      >
        <LogIn className="h-4 w-4" aria-hidden="true" />
        Iniciar sesión
      </Link>
      <Link
        href="/registro"
        className="inline-flex items-center justify-center gap-2.5 rounded-full border border-white/20 bg-white/10 px-6 py-3.5 text-sm font-black text-white transition hover:border-white/30 hover:bg-white/15 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-300 focus-visible:ring-offset-4 focus-visible:ring-offset-[#0b1f1c]"
      >
        Crear organización
        <ArrowRight className="h-4 w-4" aria-hidden="true" />
      </Link>
    </div>
  );
}
