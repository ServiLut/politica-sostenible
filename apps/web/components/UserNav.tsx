"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import {
  Building2,
  ChevronDown,
  LogOut,
  UsersRound,
} from "lucide-react";
import { useAuth } from "@/context/auth";
import { getRoleLabel, getTenantTypeLabel } from "@/config/navigation";
import { cn } from "@/components/ui/utils";

export function UserNav() {
  const { tenant, user, signOut } = useAuth();
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(event.target as Node)
      ) {
        setIsOpen(false);
      }
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape" && isOpen) {
        setIsOpen(false);
        triggerRef.current?.focus();
      }
    }

    document.addEventListener("mousedown", handleClickOutside);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [isOpen]);

  const userInitial = user?.name?.[0]?.toUpperCase() ?? "U";
  const roleLabel = user ? getRoleLabel(user.backendRole) : "Sin rol";

  function handleSignOut() {
    setIsOpen(false);
    signOut();
  }

  return (
    <div className="relative" ref={dropdownRef}>
      <button
        ref={triggerRef}
        type="button"
        aria-label="Abrir opciones de usuario"
        aria-haspopup="true"
        aria-expanded={isOpen}
        aria-controls="user-navigation-menu"
        onClick={() => setIsOpen((open) => !open)}
        className="flex min-h-11 items-center gap-2 rounded-full border border-transparent p-1 pr-2 transition-colors hover:border-slate-200 hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 focus-visible:ring-offset-2 sm:gap-3 sm:pr-3"
      >
        <span className="flex h-9 w-9 items-center justify-center rounded-full bg-slate-950 text-sm font-black text-white shadow-md">
          {userInitial}
        </span>
        <span className="hidden max-w-40 text-left md:block">
          <span className="block truncate text-xs font-black text-slate-900">
            {user?.name ?? "Usuario"}
          </span>
          <span className="mt-0.5 block truncate text-[10px] font-bold text-blue-700">
            {roleLabel}
          </span>
        </span>
        <ChevronDown
          aria-hidden="true"
          className={cn(
            "h-4 w-4 text-slate-400 transition-transform",
            isOpen && "rotate-180",
          )}
        />
      </button>

      {isOpen && (
        <div
          id="user-navigation-menu"
          aria-label="Opciones de usuario"
          className="absolute right-0 z-50 mt-3 w-[min(20rem,calc(100vw-2rem))] overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl shadow-slate-950/15"
        >
          <div className="border-b border-slate-100 p-5">
            <p className="truncate text-sm font-black text-slate-950">
              {user?.name ?? "Usuario"}
            </p>
            <p className="mt-1 truncate text-xs font-medium text-slate-500">
              {user?.email ?? ""}
            </p>
            <span className="mt-3 inline-flex rounded-full bg-blue-50 px-3 py-1 text-[10px] font-black text-blue-700">
              {roleLabel}
            </span>
          </div>

          {tenant && (
            <div className="flex items-start gap-3 border-b border-slate-100 px-5 py-4">
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-slate-100 text-slate-600">
                <Building2 aria-hidden="true" size={17} />
              </span>
              <div className="min-w-0">
                <p className="truncate text-xs font-black text-slate-900">
                  {tenant.name}
                </p>
                <p className="mt-1 text-[10px] font-bold uppercase tracking-wider text-slate-400">
                  {getTenantTypeLabel(tenant.type)}
                </p>
              </div>
            </div>
          )}

          <div className="space-y-1 p-2">
            {user?.backendRole === "ADMIN" && (
              <Link
                href="/dashboard/team"
                onClick={() => setIsOpen(false)}
                className="flex min-h-11 w-full items-center gap-3 rounded-xl px-3 text-xs font-bold text-slate-600 transition-colors hover:bg-slate-50 hover:text-slate-950 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600"
              >
                <UsersRound aria-hidden="true" size={17} />
                Equipo y accesos
              </Link>
            )}
            <button
              type="button"
              onClick={handleSignOut}
              className="flex min-h-11 w-full items-center gap-3 rounded-xl px-3 text-xs font-black uppercase tracking-wider text-red-600 transition-colors hover:bg-red-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-500"
            >
              <LogOut aria-hidden="true" size={17} />
              Cerrar sesión
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
