"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  ArchiveRestore,
  CalendarDays,
  ChevronDown,
  ClipboardList,
  CreditCard,
  FileCheck2,
  FileSignature,
  Inbox,
  Landmark,
  LayoutDashboard,
  ListTodo,
  LogOut,
  MapPinned,
  MessageSquareText,
  MoreHorizontal,
  PackageCheck,
  ShieldCheck,
  Scroll,
  SlidersHorizontal,
  Siren,
  UserCog,
  UsersRound,
  WalletCards,
  X,
  type LucideIcon,
} from "lucide-react";
import { useAuth } from "@/context/auth";
import { useAccessibleDialog } from "@/lib/use-accessible-dialog";
import { MOBILE_NAVIGATION_OPEN_EVENT } from "@/lib/mobile-navigation";
import {
  getNavigationGroupsForRole,
  getRoleLabel,
  getTenantTypeLabel,
  getVisibleNavigationItems,
  getMatchingNavigationItem,
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
  signature: FileSignature,
  election: FileCheck2,
  logistics: PackageCheck,
  handover: ArchiveRestore,
  commitments: Scroll,
  settings: SlidersHorizontal,
  billing: CreditCard,
};

const MOBILE_ROUTES_BY_WORKSPACE = {
  DIRECTION: [
    "/dashboard/executive",
    "/dashboard/public-office",
    "/dashboard/inbox",
    "/dashboard/territory",
    "/dashboard/events",
  ],
  COORDINATION: [
    "/dashboard/inbox",
    "/dashboard/captura-territorial",
    "/dashboard/territory",
    "/dashboard/events",
  ],
  FIELD: [
    "/dashboard/captura-territorial",
    "/dashboard/war-room",
    "/dashboard/witness-planning",
    "/dashboard/signatures",
    "/dashboard/logistics",
    "/dashboard/tasks",
    "/dashboard/events",
  ],
  REVIEW: [
    "/dashboard/transition",
    "/dashboard/inbox",
    "/dashboard/communications",
    "/dashboard/finance",
    "/dashboard/integrity-signatures",
    "/dashboard/audit",
  ],
} as const;

const DESKTOP_COORDINATION_PRIORITY = [
  "/dashboard/tasks",
  "/dashboard/events",
  "/dashboard/votantes",
  "/dashboard/inbox",
];

type ActiveNavItem = NavItem & { isActive: boolean };

function selectMobilePrimaryNavigation(
  navigation: ActiveNavItem[],
  workspace: keyof typeof MOBILE_ROUTES_BY_WORKSPACE,
) {
  const preferredRoutes = MOBILE_ROUTES_BY_WORKSPACE[workspace];
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
      className={`group relative flex min-h-11 items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400 ${
        item.isActive
          ? "bg-blue-700 text-white ring-1 ring-inset ring-blue-500/50"
          : "text-slate-300 hover:bg-white/5 hover:text-white"
      }`}
    >
      <Icon
        aria-hidden="true"
        className={item.isActive ? "text-white" : "text-slate-400"}
        size={18}
      />
      <span className="min-w-0 flex-1 break-words">{item.title}</span>
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
  const restoreDrawerFocusRef = useRef(true);

  const stage = tenant?.operationStage;
  const visibleNavigation =
    user && tenant ? getVisibleNavigationItems(user, tenant, stage) : [];
  const activeHref = getMatchingNavigationItem(
    pathname,
    visibleNavigation,
  )?.href;
  const navigation: ActiveNavItem[] = visibleNavigation.map((item) => ({
    ...item,
    isActive: item.href === activeHref,
  }));

  const roleNavigationGroups = user
    ? getNavigationGroupsForRole(user.backendRole)
    : [];
  const groupedNavigation = roleNavigationGroups
    .map((group) => {
      const items = navigation.filter((item) => item.group === group.id);
      return {
        ...group,
        items:
          group.id === "COORDINATION"
            ? [
                ...DESKTOP_COORDINATION_PRIORITY.flatMap((href) =>
                  items.filter((item) => item.href === href),
                ),
                ...items.filter(
                  (item) => !DESKTOP_COORDINATION_PRIORITY.includes(item.href),
                ),
              ]
            : items,
      };
    })
    .filter((group) => group.items.length > 0);
  const mobilePrimary = selectMobilePrimaryNavigation(
    navigation,
    roleNavigationGroups[0]?.id ?? "COORDINATION",
  );
  const mobilePrimaryHrefs = new Set(mobilePrimary.map((item) => item.href));
  const mobileSecondary = navigation.filter(
    (item) => !mobilePrimaryHrefs.has(item.href),
  );
  const groupedMobileSecondary = roleNavigationGroups
    .map((group) => ({
      ...group,
      items: mobileSecondary.filter((item) => item.group === group.id),
    }))
    .filter((group) => group.items.length > 0);
  const secondaryRouteIsActive = mobileSecondary.some((item) => item.isActive);
  const userInitial = user?.name?.[0]?.toUpperCase() ?? "U";

  function closeMobileMenu(restoreFocus = true) {
    restoreDrawerFocusRef.current = restoreFocus;
    setMobileMenuOpen(false);
  }

  function handleSignOut() {
    closeMobileMenu(false);
    signOut();
  }

  useAccessibleDialog({
    open: mobileMenuOpen,
    containerRef: drawerRef,
    initialFocusRef: closeButtonRef,
    returnFocusRef: moreButtonRef,
    restoreFocusRef: restoreDrawerFocusRef,
    onClose: () => closeMobileMenu(),
  });

  useEffect(() => {
    function openFromHeader() {
      if (
        window.matchMedia("(min-width: 1024px)").matches ||
        document.querySelector('[aria-modal="true"]')
      )
        return;
      restoreDrawerFocusRef.current = true;
      setMobileMenuOpen(true);
    }
    window.addEventListener(MOBILE_NAVIGATION_OPEN_EVENT, openFromHeader);
    return () =>
      window.removeEventListener(MOBILE_NAVIGATION_OPEN_EVENT, openFromHeader);
  }, []);

  useEffect(() => {
    if (!mobileMenuOpen) return;
    const desktop = window.matchMedia("(min-width: 1024px)");
    function closeHiddenDrawer(event: MediaQueryListEvent) {
      if (event.matches) closeMobileMenu(false);
    }
    desktop.addEventListener("change", closeHiddenDrawer);
    return () => desktop.removeEventListener("change", closeHiddenDrawer);
  }, [mobileMenuOpen]);

  return (
    <>
      <aside className="workspace-sidebar hidden h-full min-h-0 w-64 shrink-0 flex-col text-white lg:flex xl:w-[17rem]">
        <div className="border-b border-white/10 px-5 py-4">
          <Link
            href="/dashboard"
            aria-label="Ir al panel principal"
            className="flex items-center gap-3 rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400"
          >
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-white/15 bg-white/10 text-blue-200">
              <ShieldCheck aria-hidden="true" size={21} />
            </span>
            <span>
              <span className="block text-base font-semibold tracking-tight text-white">
                Política Sostenible
              </span>
              <span className="block text-xs font-medium text-slate-400">
                Tu equipo, conectado
              </span>
            </span>
          </Link>

          {tenant && (
            <div className="mt-3 rounded-xl border border-white/10 bg-white/5 px-3 py-2.5">
              <div className="flex flex-wrap items-center justify-between gap-x-2 gap-y-1 text-xs font-medium">
                <span className="text-slate-400">Organización activa</span>
                <span className="text-blue-200">
                  {getTenantTypeLabel(tenant.type)}
                </span>
              </div>
              <p
                title={tenant.name}
                className="mt-1 truncate text-sm font-semibold text-slate-100"
              >
                {tenant.name}
              </p>
            </div>
          )}
        </div>

        <nav
          aria-label="Navegación principal"
          className="workspace-scroll min-h-0 flex-1 space-y-6 overflow-y-auto overscroll-contain px-3 py-5"
        >
          {groupedNavigation.map((group) => {
            const headingId = `desktop-navigation-${group.id.toLowerCase()}`;
            const canCollapse =
              group.id === "REVIEW" &&
              roleNavigationGroups[0]?.id !== "REVIEW" &&
              !group.items.some((item) => item.isActive);
            const links = (
              <div className="space-y-1">
                {group.items.map((item) => (
                  <NavigationLink key={item.href} item={item} />
                ))}
              </div>
            );

            if (canCollapse) {
              return (
                <details key={group.id} className="group/review">
                  <summary className="flex min-h-11 cursor-pointer list-none items-center gap-2 rounded-xl px-3 text-xs font-semibold text-slate-300 hover:bg-white/5 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400 [&::-webkit-details-marker]:hidden">
                    <span className="min-w-0 flex-1">{group.title}</span>
                    <span
                      aria-label={`${group.items.length} secciones`}
                      className="rounded-md bg-white/10 px-1.5 py-0.5 text-xs tabular-nums text-slate-300"
                    >
                      {group.items.length}
                    </span>
                    <ChevronDown
                      aria-hidden="true"
                      size={16}
                      className="shrink-0 transition-transform group-open/review:rotate-180 motion-reduce:transition-none"
                    />
                  </summary>
                  <div className="mt-1">{links}</div>
                </details>
              );
            }

            return (
              <section key={group.id} aria-labelledby={headingId}>
                <h2
                  id={headingId}
                  className="mb-2 px-3 text-[11px] font-semibold uppercase tracking-[0.08em] text-slate-400"
                >
                  {group.title}
                </h2>
                {links}
              </section>
            );
          })}
        </nav>

        {user && (
          <div className="border-t border-white/10 px-4 py-3">
            <p className="px-3 text-xs font-medium text-slate-400">
              Tu espacio de trabajo
            </p>
            <p className="mt-1 px-3 text-xs font-semibold text-slate-300">
              {getRoleLabel(user.backendRole)}
            </p>
          </div>
        )}
      </aside>

      <nav
        aria-label="Navegación principal móvil"
        className="fixed inset-x-0 bottom-0 z-[80] grid auto-cols-fr grid-flow-col border-t border-slate-200 bg-white px-2 pt-2 pb-[max(0.5rem,env(safe-area-inset-bottom))] shadow-[0_-4px_16px_rgba(15,23,42,0.04)] lg:hidden"
      >
        {mobilePrimary.map((item) => {
          const Icon = NAV_ICONS[item.icon];
          return (
            <Link
              key={item.href}
              href={item.href}
              aria-label={item.title}
              aria-current={item.isActive ? "page" : undefined}
              className={`flex min-h-14 min-w-0 flex-col items-center justify-center gap-1 rounded-xl px-1 text-[11px] font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 ${
                item.isActive ? "bg-blue-50 text-blue-800" : "text-slate-500"
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
          onClick={() => {
            restoreDrawerFocusRef.current = true;
            setMobileMenuOpen(true);
          }}
          className={`flex min-h-14 min-w-0 flex-col items-center justify-center gap-1 rounded-xl px-1 text-[11px] font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 ${
            secondaryRouteIsActive || mobileMenuOpen
              ? "bg-blue-50 text-blue-800"
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
            className="absolute inset-0 h-full w-full bg-slate-950/65"
          />
          <aside
            ref={drawerRef}
            id="mobile-navigation-drawer"
            role="dialog"
            aria-modal="true"
            aria-labelledby="mobile-navigation-title"
            tabIndex={-1}
            className="absolute inset-x-0 bottom-0 max-h-[calc(100dvh-var(--app-banner-height)-1rem)] overflow-y-auto overscroll-contain rounded-t-2xl bg-white shadow-2xl"
          >
            <div className="sticky top-0 z-10 flex items-start justify-between border-b border-slate-100 bg-white px-5 py-5">
              <div className="min-w-0 pr-4">
                <p className="text-xs font-semibold text-blue-700">
                  Navegación
                </p>
                <h2
                  id="mobile-navigation-title"
                  className="mt-1 text-xl font-semibold text-slate-950"
                >
                  Más opciones
                </h2>
                {tenant && (
                  <div className="mt-1 text-xs font-semibold text-slate-500">
                    <p className="truncate">
                      {tenant.name} · {getTenantTypeLabel(tenant.type)}
                    </p>
                    {roleNavigationGroups[0] && (
                      <p className="mt-1 text-xs font-semibold text-blue-700">
                        Tu espacio · {roleNavigationGroups[0].title}
                      </p>
                    )}
                  </div>
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
                        className="mb-2 px-1 text-xs font-semibold text-slate-500"
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
                                  ? "border-blue-700 bg-blue-50 text-blue-800"
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
                    className="text-xs font-semibold text-slate-500"
                  >
                    Perfil
                  </h3>
                  <div className="mt-3 flex items-center gap-3">
                    <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-slate-950 text-sm font-semibold text-white">
                      {userInitial}
                    </span>
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold text-slate-900">
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
                    className="mt-4 flex min-h-11 w-full items-center justify-center gap-2 rounded-xl border border-red-200 bg-white px-4 text-xs font-semibold uppercase tracking-wider text-red-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-500"
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
