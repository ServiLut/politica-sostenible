"use client";

import React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useAuth } from "@/context/auth";
import { canAccessNavigationItem, dashboardConfig } from "@/config/navigation";

export function Sidebar() {
  const pathname = usePathname();
  const { tenant, user, signOut } = useAuth();

  const filteredNav = dashboardConfig.filter((item) => {
    if (!user || !tenant) return false;
    return canAccessNavigationItem(item, user, tenant);
  });

  const navigation = filteredNav.map((item) => {
    const isActive = pathname === item.href;
    return { ...item, isActive };
  });

  return (
    <>
      <aside className="hidden w-64 bg-slate-900 text-white lg:flex flex-col h-screen sticky top-0">
        <Link href="/">
          <div className="p-6 border-b border-slate-800">
            <h1 className="text-xl font-bold text-blue-400">
              Política Sostenible
            </h1>
            <p className="text-xs text-slate-400 mt-1">Operación verificable</p>
          </div>
        </Link>

        <nav className="flex-1 overflow-y-auto p-4 space-y-2">
          {navigation.map((item) => {
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`block px-4 py-2 rounded-md transition-colors ${
                  item.isActive
                    ? "bg-blue-600 text-white"
                    : "text-slate-300 hover:bg-slate-800 hover:text-white"
                }`}
              >
                {item.title}
              </Link>
            );
          })}
        </nav>

        <div className="p-4 border-t border-slate-800 space-y-4">
          <div className="flex items-center gap-3 px-2">
            <div className="w-8 h-8 rounded-full bg-blue-500 flex items-center justify-center text-xs font-bold">
              {user?.name.charAt(0).toUpperCase()}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium truncate">{user?.name}</p>
              <p className="text-[10px] text-slate-400 truncate">
                {user?.role}
              </p>
            </div>
          </div>

          <button
            onClick={signOut}
            className="w-full text-left px-2 py-1 text-xs text-red-400 hover:text-red-300 transition-colors"
          >
            Cerrar Sesión
          </button>
        </div>
      </aside>
      <nav
        aria-label="Navegación móvil"
        className="fixed inset-x-0 bottom-0 z-[80] flex gap-2 overflow-x-auto border-t border-slate-200 bg-white/95 px-3 py-3 shadow-2xl backdrop-blur lg:hidden"
      >
        {navigation.map((item) => (
          <Link
            key={item.href}
            href={item.href}
            className={`shrink-0 rounded-xl px-4 py-2 text-[10px] font-black uppercase tracking-wider ${item.isActive ? "bg-blue-700 text-white" : "bg-slate-100 text-slate-600"}`}
          >
            {item.title}
          </Link>
        ))}
      </nav>
    </>
  );
}
