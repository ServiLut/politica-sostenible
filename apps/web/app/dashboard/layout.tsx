"use client";

import { useEffect } from "react";
import { ArrowLeft, ShieldAlert } from "lucide-react";
import { usePathname, useRouter } from "next/navigation";
import { Sidebar } from "@/components/layout/Sidebar";
import { UserNav } from "@/components/UserNav";
import { useAuth } from "@/context/auth";
import {
  canAccessNavigationItem,
  dashboardConfig,
  getDefaultDashboardRoute,
  getRoleLabel,
  getTenantTypeLabel,
  matchesNavigationPath,
} from "@/config/navigation";

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { tenant, user, loading } = useAuth();
  const router = useRouter();
  const pathname = usePathname();

  const stage = (tenant?.config as any)?.operationProfile?.stage;
  const currentRouteConfig = dashboardConfig.find((item) =>
    matchesNavigationPath(pathname, item.href),
  );
  const isPersonalAccountRoute = pathname === "/dashboard/profile";
  const requiresPasswordChange = user?.mustChangePassword === true;
  const hasPermission = Boolean(
    user &&
    tenant &&
    (!requiresPasswordChange || isPersonalAccountRoute) &&
    (isPersonalAccountRoute ||
      (currentRouteConfig &&
        canAccessNavigationItem(currentRouteConfig, user, tenant, stage))),
  );

  useEffect(() => {
    if (!loading && !user) {
      const nextPath = encodeURIComponent(pathname);
      router.replace(`/iniciar-sesion?next=${nextPath}`);
      return;
    }

    if (!loading && user?.mustChangePassword && !isPersonalAccountRoute) {
      router.replace("/dashboard/profile");
      return;
    }

    if (!loading && user && tenant && pathname === "/dashboard") {
      router.replace(getDefaultDashboardRoute(user, tenant, stage));
    }
  }, [
    user,
    tenant,
    loading,
    pathname,
    router,
    isPersonalAccountRoute,
    stage,
  ]);

  if (loading || !user) {
    return (
      <div
        role="status"
        className="flex h-screen items-center justify-center bg-slate-50"
      >
        <div className="flex flex-col items-center gap-4">
          <div
            aria-hidden="true"
            className="h-12 w-12 animate-spin rounded-full border-4 border-slate-200 border-t-blue-600"
          />
          <p className="text-xs font-black uppercase tracking-widest text-slate-500">
            Cargando sistema...
          </p>
        </div>
      </div>
    );
  }

  if (
    pathname === "/dashboard" ||
    (requiresPasswordChange && !isPersonalAccountRoute)
  ) {
    return (
      <div
        role="status"
        aria-label={
          requiresPasswordChange
            ? "Abriendo el cambio de contraseña obligatorio"
            : "Abriendo el panel disponible"
        }
        className="flex h-screen items-center justify-center bg-slate-50"
      >
        <div
          aria-hidden="true"
          className="h-12 w-12 animate-spin rounded-full border-4 border-slate-200 border-t-blue-600"
        />
      </div>
    );
  }

  if (!hasPermission) {
    return (
      <div className="flex min-h-screen bg-slate-50">
        {!requiresPasswordChange && <Sidebar />}
        <main className="flex min-h-screen min-w-0 flex-1 items-center justify-center p-6 pb-24 text-center lg:pb-6">
          <div className="flex max-w-md flex-col items-center gap-6 rounded-[2rem] border border-red-100 bg-red-50 p-8 shadow-xl shadow-red-900/5">
            <div className="flex h-20 w-20 items-center justify-center rounded-3xl bg-red-100 text-red-600">
              <ShieldAlert aria-hidden="true" size={44} />
            </div>
            <div>
              <h1 className="text-2xl font-black tracking-tight text-slate-900">
                Acceso restringido
              </h1>
              <p className="mt-3 font-medium leading-relaxed text-slate-600">
                El rol <strong>{getRoleLabel(user.backendRole)}</strong> no
                tiene permiso para consultar esta sección de la organización.
              </p>
            </div>
            <button
              type="button"
              onClick={() =>
                router.replace(
                  tenant ? getDefaultDashboardRoute(user, tenant, stage) : "/",
                )
              }
              className="flex min-h-12 items-center gap-2 rounded-xl bg-slate-950 px-6 text-xs font-black uppercase tracking-wider text-white shadow-lg transition-colors hover:bg-blue-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 focus-visible:ring-offset-2"
            >
              <ArrowLeft aria-hidden="true" size={16} /> Volver al panel
            </button>
          </div>
        </main>
      </div>
    );
  }

  return (
    <>
      <a
        href="#dashboard-content"
        className="fixed left-4 top-4 z-[120] -translate-y-24 rounded-xl bg-slate-950 px-4 py-3 text-sm font-black text-white transition-transform focus:translate-y-0"
      >
        Saltar al contenido
      </a>
      <div className="flex min-h-screen bg-slate-50">
        {!requiresPasswordChange && <Sidebar />}
        <div className="flex min-h-screen min-w-0 flex-1 flex-col overflow-hidden">
          <header className="flex h-[4.5rem] shrink-0 items-center justify-between border-b border-slate-200 bg-white px-4 sm:px-6 lg:px-8">
            <div className="min-w-0 pr-4">
              <p className="truncate text-sm font-black text-slate-950">
                {tenant?.name ?? "Organización"}
              </p>
              <p className="mt-0.5 truncate text-[10px] font-bold uppercase tracking-[0.16em] text-slate-400">
                {isPersonalAccountRoute
                  ? "Mi cuenta y seguridad"
                  : (currentRouteConfig?.title ?? "Panel")}
                {tenant ? ` · ${getTenantTypeLabel(tenant.type)}` : ""}
              </p>
            </div>
            <div className="flex shrink-0 items-center gap-3 sm:gap-5">
              <span
                role={requiresPasswordChange ? "status" : undefined}
                aria-live={requiresPasswordChange ? "assertive" : undefined}
                className={`items-center gap-2 rounded-full px-3 py-1.5 text-[10px] font-black uppercase tracking-wider ${
                  requiresPasswordChange ? "inline-flex" : "hidden md:inline-flex"
                } ${
                  requiresPasswordChange
                    ? "bg-amber-50 text-amber-800"
                    : "bg-emerald-50 text-emerald-700"
                }`}
              >
                <span
                  aria-hidden="true"
                  className={`h-2 w-2 rounded-full ${
                    requiresPasswordChange ? "bg-amber-500" : "bg-emerald-500"
                  }`}
                />
                {requiresPasswordChange
                  ? "Cambio de clave obligatorio"
                  : "Sesión activa"}
              </span>
              <span className="hidden rounded-full bg-slate-100 px-3 py-1.5 text-xs font-bold text-slate-700 xl:block">
                {getRoleLabel(user.backendRole)}
              </span>
              <UserNav />
            </div>
          </header>
          <main
            id="dashboard-content"
            tabIndex={-1}
            className="flex-1 overflow-y-auto p-4 pb-24 outline-none sm:p-6 sm:pb-24 lg:p-8 lg:pb-8"
          >
            {children}
          </main>
        </div>
      </div>
    </>
  );
}
