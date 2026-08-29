"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  CalendarDays,
  ClipboardList,
  FileCheck2,
  Inbox,
  Landmark,
  LayoutDashboard,
  ListTodo,
  LogOut,
  MapPinned,
  MessageSquareText,
  MoreHorizontal,
  ShieldCheck,
  Siren,
  UserCog,
  UsersRound,
  WalletCards,
  X,
  type LucideIcon,
} from "lucide-react";
import { useAuth } from "@/context/auth";
import {
  canAccessNavigationItem,
  dashboardConfig,
  getRoleLabel,
  getTenantTypeLabel,
  matchesNavigationPath,
  navigationGroups,
  type NavItem,
  type NavigationIcon,
} from "@/config/navigation";

const NAV_ICONS: Record<NavigationIcon, LucideIcon> = {
  dashboard: LayoutDashboard,
  siren: Siren,
  publicOffice: Landmark,
  territory: MapPinned,
  relationships: UsersRound,
  cases: Inbox,
  tasks: ListTodo,
  events: CalendarDays,
  team: UserCog,
  communications: MessageSquareText,
  audit: ClipboardList,
  finance: WalletCards,
  election: FileCheck2,
};

const CAMPAIGN_MOBILE_ROUTES = [
  "/dashboard/executive",
  "/dashboard/territory",
  "/dashboard/tasks",
  "/dashboard/events",
];

const PUBLIC_OFFICE_MOBILE_ROUTES = [
  "/dashboard/public-office",
  "/dashboard/cases",
  "/dashboard/tasks",
  "/dashboard/events",
];

type ActiveNavItem = NavItem & { isActive: boolean };

function selectMobilePrimaryNavigation(
  navigation: ActiveNavItem[],
  isPublicOffice: boolean,
) {
  const preferredRoutes = isPublicOffice
    ? PUBLIC_OFFICE_MOBILE_ROUTES
    : CAMPAIGN_MOBILE_ROUTES;
  const selected = preferredRoutes
    .map((href) => navigation.find((item) => item.href === href))
    .filter((item): item is ActiveNavItem => Boolean(item));

  for (const item of navigation) {
    if (selected.length >= 4) break;
    if (!selected.some((selectedItem) => selectedItem.href === item.href)) {
      selected.push(item);
    }
  }

  return selected.slice(0, 4);
}

function NavigationLink({
  item,
  onNavigate,
}: {
  item: ActiveNavItem;
  onNavigate?: () => void;
}) {
  const Icon = NAV_ICONS[item.icon];

  return (
    <Link
      href={item.href}
      aria-current={item.isActive ? "page" : undefined}
      onClick={onNavigate}
      className={`group flex min-h-11 items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400 ${
        item.isActive
          ? "bg-blue-600 text-white shadow-lg shadow-blue-950/20"
          : "text-slate-300 hover:bg-slate-800 hover:text-white"
      }`}
    >
      <Icon
        aria-hidden="true"
        className={item.isActive ? "text-white" : "text-slate-500"}
        size={18}
      />
      <span>{item.title}</span>
    </Link>
  );
}

export function Sidebar() {
  const pathname = usePathname();
  const { tenant, user, signOut } = useAuth();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const drawerRef = useRef<HTMLElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const moreButtonRef = useRef<HTMLButtonElement>(null);

  const navigation: ActiveNavItem[] = dashboardConfig
    .filter((item) => {
      if (!user || !tenant) return false;
      return canAccessNavigationItem(item, user, tenant);
    })
    .map((item) => ({
      ...item,
      isActive: matchesNavigationPath(pathname, item.href),
    }));

  const groupedNavigation = navigationGroups
    .map((group) => ({
      ...group,
      items: navigation.filter((item) => item.group === group.id),
    }))
    .filter((group) => group.items.length > 0);
  const mobilePrimary = selectMobilePrimaryNavigation(
    navigation,
    tenant?.type === "PUBLIC_OFFICE",
  );
  const mobilePrimaryHrefs = new Set(
    mobilePrimary.map((item) => item.href),
  );
  const mobileSecondary = navigation.filter(
    (item) => !mobilePrimaryHrefs.has(item.href),
  );
  const groupedMobileSecondary = navigationGroups
    .map((group) => ({
      ...group,
      items: mobileSecondary.filter((item) => item.group === group.id),
    }))
    .filter((group) => group.items.length > 0);
  const secondaryRouteIsActive = mobileSecondary.some(
    (item) => item.isActive,
  );
  const userInitial = user?.name?.[0]?.toUpperCase() ?? "U";

  function closeMobileMenu(restoreFocus = true) {
    setMobileMenuOpen(false);
    if (restoreFocus) {
      window.requestAnimationFrame(() => moreButtonRef.current?.focus());
    }
  }

  function handleSignOut() {
    setMobileMenuOpen(false);
    signOut();
  }

  useEffect(() => {
    if (!mobileMenuOpen) return;

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const focusFrame = window.requestAnimationFrame(() =>
      closeButtonRef.current?.focus(),
    );

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.preventDefault();
        closeMobileMenu();
        return;
      }

      if (event.key !== "Tab" || !drawerRef.current) return;
      const focusableElements = Array.from(
        drawerRef.current.querySelectorAll<HTMLElement>(
          'a[href], button:not([disabled]), [tabindex]:not([tabindex="-1"])',
        ),
      );
      const firstElement = focusableElements[0];
      const lastElement = focusableElements.at(-1);
      if (!firstElement || !lastElement) return;

      if (event.shiftKey && document.activeElement === firstElement) {
        event.preventDefault();
        lastElement.focus();
      } else if (!event.shiftKey && document.activeElement === lastElement) {
        event.preventDefault();
        firstElement.focus();
      }
    }

    document.addEventListener("keydown", handleKeyDown);
    return () => {
      window.cancelAnimationFrame(focusFrame);
      document.body.style.overflow = previousOverflow;
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [mobileMenuOpen]);

  return (
    <>
      <aside className="sticky top-0 hidden h-screen w-72 shrink-0 flex-col bg-slate-950 text-white lg:flex">
        <div className="border-b border-slate-800 p-5">
          <Link
            href="/dashboard"
            aria-label="Ir al panel principal"
            className="flex items-center gap-3 rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400"
          >
            <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-600 text-white shadow-lg shadow-blue-950/30">
              <ShieldCheck aria-hidden="true" size={21} />
            </span>
            <span>
              <span className="block text-base font-black tracking-tight text-white">
                Política Sostenible
              </span>
              <span className="block text-[10px] font-bold uppercase tracking-[0.18em] text-slate-500">
                Operación verificable
              </span>
            </span>
          </Link>

          {tenant && (
            <div className="mt-5 rounded-2xl border border-slate-800 bg-slate-900/80 p-4">
              <p className="text-[9px] font-black uppercase tracking-[0.2em] text-slate-500">
                Organización activa
              </p>
              <p className="mt-1 truncate text-sm font-bold text-slate-100">
                {tenant.name}
              </p>
              <p className="mt-1 text-xs font-medium text-blue-300">
                {getTenantTypeLabel(tenant.type)}
              </p>
            </div>
          )}
        </div>

        <nav
          aria-label="Navegación principal"
          className="flex-1 space-y-6 overflow-y-auto px-4 py-5"
        >
          {groupedNavigation.map((group) => {
            const headingId = `desktop-navigation-${group.id.toLowerCase()}`;
            return (
              <section key={group.id} aria-labelledby={headingId}>
                <h2
                  id={headingId}
                  className="mb-2 px-3 text-[9px] font-black uppercase tracking-[0.22em] text-slate-600"
                >
                  {group.title}
                </h2>
                <div className="space-y-1">
                  {group.items.map((item) => (
                    <NavigationLink key={item.href} item={item} />
                  ))}
                </div>
              </section>
            );
          })}
        </nav>

        {user && (
          <div className="border-t border-slate-800 p-4">
            <p className="px-3 text-[9px] font-black uppercase tracking-[0.18em] text-slate-600">
              Acceso según rol
            </p>
            <p className="mt-1 px-3 text-xs font-semibold text-slate-300">
              {getRoleLabel(user.backendRole)}
            </p>
          </div>
        )}
      </aside>

      <nav
        aria-label="Navegación principal móvil"
        className="fixed inset-x-0 bottom-0 z-[80] grid auto-cols-fr grid-flow-col border-t border-slate-200 bg-white/95 px-2 py-2 shadow-[0_-12px_32px_rgba(15,23,42,0.12)] backdrop-blur lg:hidden"
      >
        {mobilePrimary.map((item) => {
          const Icon = NAV_ICONS[item.icon];
          return (
            <Link
              key={item.href}
              href={item.href}
              aria-label={item.title}
              aria-current={item.isActive ? "page" : undefined}
              className={`flex min-h-14 min-w-0 flex-col items-center justify-center gap-1 rounded-xl px-1 text-[9px] font-black uppercase tracking-wide focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 ${
                item.isActive ? "bg-blue-700 text-white" : "text-slate-500"
              }`}
            >
              <Icon aria-hidden="true" size={18} />
              <span className="w-full truncate text-center">
                {item.mobileTitle}
              </span>
            </Link>
          );
        })}
        <button
          ref={moreButtonRef}
          type="button"
          aria-haspopup="dialog"
          aria-expanded={mobileMenuOpen}
          aria-controls="mobile-navigation-drawer"
          aria-label="Abrir más opciones"
          onClick={() => setMobileMenuOpen(true)}
          className={`flex min-h-14 min-w-0 flex-col items-center justify-center gap-1 rounded-xl px-1 text-[9px] font-black uppercase tracking-wide focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 ${
            secondaryRouteIsActive || mobileMenuOpen
              ? "bg-blue-700 text-white"
              : "text-slate-500"
          }`}
        >
          <MoreHorizontal aria-hidden="true" size={19} />
          <span>Más</span>
        </button>
      </nav>

      {mobileMenuOpen && (
        <div className="fixed inset-0 z-[100] lg:hidden">
          <button
            type="button"
            tabIndex={-1}
            aria-label="Cerrar más opciones"
            onClick={() => closeMobileMenu()}
            className="absolute inset-0 h-full w-full bg-slate-950/65 backdrop-blur-sm"
          />
          <aside
            ref={drawerRef}
            id="mobile-navigation-drawer"
            role="dialog"
            aria-modal="true"
            aria-labelledby="mobile-navigation-title"
            className="absolute inset-x-0 bottom-0 max-h-[88vh] overflow-y-auto rounded-t-[2rem] bg-white shadow-2xl"
          >
            <div className="sticky top-0 z-10 flex items-start justify-between border-b border-slate-100 bg-white/95 px-5 py-5 backdrop-blur">
              <div className="min-w-0 pr-4">
                <p className="text-[9px] font-black uppercase tracking-[0.2em] text-blue-700">
                  Navegación
                </p>
                <h2
                  id="mobile-navigation-title"
                  className="mt-1 text-xl font-black text-slate-950"
                >
                  Más opciones
                </h2>
                {tenant && (
                  <p className="mt-1 truncate text-xs font-semibold text-slate-500">
                    {tenant.name} · {getTenantTypeLabel(tenant.type)}
                  </p>
                )}
              </div>
              <button
                ref={closeButtonRef}
                type="button"
                aria-label="Cerrar menú"
                onClick={() => closeMobileMenu()}
                className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-slate-100 text-slate-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600"
              >
                <X aria-hidden="true" size={20} />
              </button>
            </div>

            <div className="space-y-6 px-5 py-6">
              {groupedMobileSecondary.length > 0 ? (
                groupedMobileSecondary.map((group) => {
                  const headingId = `mobile-navigation-${group.id.toLowerCase()}`;
                  return (
                    <section key={group.id} aria-labelledby={headingId}>
                      <h3
                        id={headingId}
                        className="mb-2 px-1 text-[9px] font-black uppercase tracking-[0.2em] text-slate-400"
                      >
                        {group.title}
                      </h3>
                      <div className="grid gap-2 sm:grid-cols-2">
                        {group.items.map((item) => {
                          const Icon = NAV_ICONS[item.icon];
                          return (
                            <Link
                              key={item.href}
                              href={item.href}
                              aria-current={item.isActive ? "page" : undefined}
                              onClick={() => closeMobileMenu(false)}
                              className={`flex min-h-14 items-center gap-3 rounded-2xl border px-4 py-3 text-sm font-bold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 ${
                                item.isActive
                                  ? "border-blue-700 bg-blue-700 text-white"
                                  : "border-slate-200 bg-white text-slate-700"
                              }`}
                            >
                              <Icon aria-hidden="true" size={19} />
                              {item.title}
                            </Link>
                          );
                        })}
                      </div>
                    </section>
                  );
                })
              ) : (
                <p className="rounded-2xl bg-slate-50 p-4 text-sm font-medium text-slate-600">
                  No hay más módulos disponibles para este rol.
                </p>
              )}

              {user && (
                <section
                  aria-labelledby="mobile-profile-title"
                  className="rounded-2xl border border-slate-200 bg-slate-50 p-4"
                >
                  <h3
                    id="mobile-profile-title"
                    className="text-[9px] font-black uppercase tracking-[0.2em] text-slate-400"
                  >
                    Perfil
                  </h3>
                  <div className="mt-3 flex items-center gap-3">
                    <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-slate-950 text-sm font-black text-white">
                      {userInitial}
                    </span>
                    <div className="min-w-0">
                      <p className="truncate text-sm font-black text-slate-900">
                        {user.name}
                      </p>
                      <p className="truncate text-xs font-medium text-slate-500">
                        {getRoleLabel(user.backendRole)}
                      </p>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={handleSignOut}
                    className="mt-4 flex min-h-11 w-full items-center justify-center gap-2 rounded-xl border border-red-200 bg-white px-4 text-xs font-black uppercase tracking-wider text-red-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-500"
                  >
                    <LogOut aria-hidden="true" size={17} />
                    Cerrar sesión
                  </button>
                </section>
              )}
            </div>
          </aside>
        </div>
      )}
    </>
  );
}
