"use client";

import { useEffect } from "react";
import { ArrowLeft, Menu, Search, ShieldAlert } from "lucide-react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { Sidebar } from "@/components/layout/Sidebar";
import { UserNav } from "@/components/UserNav";
import { useAuth } from "@/context/auth";
import {
  canAccessNavigationItem,
  dashboardConfig,
  getDefaultDashboardRoute,
  getRoleLabel,
  getTenantTypeLabel,
  getMatchingNavigationItem,
} from "@/config/navigation";

import { CommandPalette } from "@/components/ui/CommandPalette";
import { buildLoginRedirectHref } from "@/lib/post-login-navigation";
import { DashboardErrorBoundary } from "@/components/DashboardErrorBoundary";
import { openGlobalSearch } from "@/lib/global-search";
import { openMobileNavigation } from "@/lib/mobile-navigation";

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { tenant, user, loading } = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const stage = tenant?.operationStage;
  const currentRouteConfig = getMatchingNavigationItem(
    pathname,
    dashboardConfig,
  );
  const isPersonalAccountRoute = pathname === "/dashboard/profile";
  const requiresPasswordChange = user?.mustChangePassword === true;
  const isCurrentStageAllowed =
    !currentRouteConfig?.allowedStages ||
    Boolean(stage && currentRouteConfig.allowedStages.includes(stage));
  const hasPermission = Boolean(
    user &&
    tenant &&
    (!requiresPasswordChange || isPersonalAccountRoute) &&
    (isPersonalAccountRoute ||
      (currentRouteConfig &&
        isCurrentStageAllowed &&
        canAccessNavigationItem(currentRouteConfig, user, tenant))),
  );

  useEffect(() => {
    if (!loading && !user) {
      router.replace(
        buildLoginRedirectHref(
          pathname,
          searchParams.toString() ? `?${searchParams.toString()}` : "",
        ),
      );
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
    searchParams,
  ]);

  if (loading || !user) {
    return (
      <div
        id="dashboard-content"
        tabIndex={-1}
        role="status"
        className="flex h-[calc(100dvh-var(--app-banner-height))] items-center justify-center bg-slate-50 outline-none"
      >
        <div className="flex flex-col items-center gap-4">
          <div
            aria-hidden="true"
            className="h-12 w-12 animate-spin rounded-full border-4 border-slate-200 border-t-blue-600"
          />
          <p className="text-sm font-medium text-slate-500">
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
        id="dashboard-content"
        tabIndex={-1}
        role="status"
        aria-label={
          requiresPasswordChange
            ? "Abriendo el cambio de contraseña obligatorio"
            : "Abriendo el panel disponible"
        }
        className="flex h-[calc(100dvh-var(--app-banner-height))] items-center justify-center bg-slate-50 outline-none"
      >
        <div
          aria-hidden="true"
          className="h-12 w-12 animate-spin rounded-full border-4 border-slate-200 border-t-blue-600"
        />
      </div>
    );
  }

  if (!hasPermission) {
    const profileRoute = getMatchingNavigationItem(
      "/dashboard/operation-profile",
      dashboardConfig,
    );
    const canReviewStage = Boolean(
      !isCurrentStageAllowed &&
      tenant &&
      profileRoute &&
      canAccessNavigationItem(profileRoute, user, tenant),
    );
    return (
      <div className="flex h-[calc(100dvh-var(--app-banner-height))] min-h-0 bg-canvas">
        {!requiresPasswordChange && <Sidebar />}
        <main
          id="dashboard-content"
          tabIndex={-1}
          className="flex min-h-0 min-w-0 flex-1 items-center justify-center overflow-y-auto p-4 pb-28 text-center outline-none sm:p-6 lg:pb-6"
        >
          <div className="flex max-w-md flex-col items-center gap-5 rounded-2xl border border-slate-200 bg-white p-5 shadow-panel sm:p-8">
            <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-blue-50 text-blue-700">
              <ShieldAlert aria-hidden="true" size={28} />
            </div>
            <div>
              <h1 className="text-2xl font-semibold tracking-tight text-slate-900">
                {canReviewStage
                  ? "Esta sección se habilita más adelante"
                  : "Acceso restringido"}
              </h1>
              <p className="mt-3 font-medium leading-relaxed text-slate-600">
                {currentRouteConfig?.allowedStages && !isCurrentStageAllowed ? (
                  <>
                    Esta sección no está habilitada durante la etapa operativa
                    actual. Usa el perfil operativo para consultar el avance
                    permitido.
                  </>
                ) : (
                  <>
                    El rol <strong>{getRoleLabel(user.backendRole)}</strong> no
                    tiene permiso para consultar esta sección de la
                    organización.
                  </>
                )}
              </p>
            </div>
            {canReviewStage && (
              <Link
                href="/dashboard/operation-profile"
                className="inline-flex min-h-11 items-center justify-center rounded-xl bg-blue-700 px-5 text-sm font-semibold text-white hover:bg-blue-800"
              >
                Consultar etapas y requisitos
              </Link>
            )}
            <button
              type="button"
              onClick={() =>
                router.replace(
                  tenant ? getDefaultDashboardRoute(user, tenant, stage) : "/",
                )
              }
              className="flex min-h-11 items-center gap-2 rounded-xl border border-slate-200 bg-white px-5 text-sm font-semibold text-slate-700 transition-colors hover:bg-blue-50 focus-ring"
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
      <div className="flex h-[calc(100dvh-var(--app-banner-height))] min-h-0 bg-canvas">
        {!requiresPasswordChange && <Sidebar />}
        <div className="flex min-h-0 min-w-0 flex-1 flex-col">
          <header className="relative z-30 flex h-16 shrink-0 items-center justify-between gap-2 border-b border-slate-200/80 bg-white px-3 sm:px-6 lg:h-[4.5rem] lg:px-8">
            <div className="flex min-w-0 items-center gap-2 sm:gap-3">
              {!requiresPasswordChange && (
                <button
                  type="button"
                  onClick={openMobileNavigation}
                  aria-label="Abrir menú de navegación"
                  aria-haspopup="dialog"
                  aria-controls="mobile-navigation-drawer"
                  className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-slate-600 transition-colors hover:bg-slate-100 focus-ring lg:hidden"
                >
                  <Menu aria-hidden="true" size={21} />
                </button>
              )}
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold text-slate-950">
                  {isPersonalAccountRoute
                    ? "Mi cuenta y seguridad"
                    : (currentRouteConfig?.title ?? "Panel")}
                </p>
                <p
                  className="mt-0.5 truncate text-xs text-slate-600"
                  title={tenant?.name}
                >
                  {tenant?.name ?? "Organización"}
                  {tenant ? ` · ${getTenantTypeLabel(tenant.type)}` : ""}
                </p>
              </div>
            </div>
            <div className="flex shrink-0 items-center gap-1 sm:gap-3 lg:gap-5">
              <button
                type="button"
                onClick={openGlobalSearch}
                aria-label="Buscar en la organización"
                aria-haspopup="dialog"
                className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-slate-600 transition-colors hover:bg-slate-100 focus-ring lg:hidden"
              >
                <Search aria-hidden="true" size={20} />
              </button>
              <button
                type="button"
                onClick={openGlobalSearch}
                aria-label="Buscar en la organización"
                aria-haspopup="dialog"
                className="hidden min-h-11 items-center gap-3 rounded-xl border border-slate-200 bg-slate-50 px-3.5 text-sm text-slate-600 transition-colors hover:border-blue-300 hover:bg-white focus-ring lg:inline-flex"
              >
                <Search aria-hidden="true" size={17} />
                <span>Buscar en tu equipo</span>
                <kbd
                  aria-hidden="true"
                  className="ml-4 rounded border border-slate-200 bg-white px-1.5 py-0.5 text-[11px] text-slate-500"
                >
                  Ctrl/⌘ K
                </kbd>
              </button>
              {requiresPasswordChange && (
                <span
                  role="status"
                  aria-live="assertive"
                  className="inline-flex items-center gap-2 rounded-full bg-amber-50 px-3 py-1.5 text-xs font-medium text-amber-800"
                >
                  Cambio de clave obligatorio
                </span>
              )}
              <UserNav />
            </div>
          </header>
          <main
            id="dashboard-content"
            tabIndex={-1}
            className="workspace-scroll min-h-0 min-w-0 flex-1 overflow-y-auto overscroll-contain p-4 outline-none sm:p-6 lg:p-8"
          >
            <DashboardErrorBoundary key={pathname}>
              {children}
            </DashboardErrorBoundary>
          </main>
          <footer className="shrink-0 border-t border-slate-200/80 bg-white px-4 pt-1 pb-[calc(4.5rem+env(safe-area-inset-bottom))] sm:px-6 lg:px-8 lg:py-1">
            <div id="pwa-workspace-controls" />
          </footer>
        </div>
      </div>
      <CommandPalette />
    </>
  );
}
