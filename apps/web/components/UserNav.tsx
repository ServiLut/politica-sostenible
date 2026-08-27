"use client";

import React, { useState, useRef, useEffect } from "react";
import { useAuth } from "@/context/auth";
import Link from "next/link";
import { Settings, LogOut, ChevronDown } from "lucide-react";
import { cn } from "@/components/ui/utils";

export function UserNav() {
  const { user, role, signOut } = useAuth();
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Close dropdown when clicking outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(event.target as Node)
      ) {
        setIsOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const userInitial = user?.name?.[0]?.toUpperCase() ?? "U";
  const userEmail = user?.email ?? "";

  return (
    <div className="flex items-center gap-4">
      <div className="relative" ref={dropdownRef}>
        <button
          onClick={() => setIsOpen(!isOpen)}
          className="flex items-center gap-3 p-1 pr-3 rounded-full hover:bg-zinc-50 transition-all border border-transparent hover:border-zinc-200"
        >
          <div className="h-9 w-9 rounded-full bg-[#111827] text-white flex items-center justify-center font-black text-sm shadow-lg">
            {userInitial}
          </div>
          <div className="hidden md:block text-left">
            <p className="text-[10px] font-black text-[#111827] uppercase tracking-tighter leading-none">
              {user?.name ?? "Usuario"}
            </p>
            <p className="text-[8px] font-bold text-[#0047AB] uppercase tracking-widest">
              {role ?? "Sin rol"}
            </p>
          </div>
          <ChevronDown
            className={cn(
              "h-4 w-4 text-zinc-400 transition-transform",
              isOpen && "rotate-180",
            )}
          />
        </button>

        {isOpen && (
          <div className="absolute right-0 mt-4 w-64 bg-white rounded-[1.5rem] shadow-2xl border border-zinc-100 py-3 z-50 animate-in fade-in zoom-in-95 duration-200">
            <div className="px-6 py-4 border-b border-zinc-50 mb-2">
              <p className="text-[10px] font-black text-zinc-400 uppercase tracking-widest mb-1">
                Identidad
              </p>
              <p className="text-sm font-bold text-[#111827] truncate">
                {userEmail}
              </p>
            </div>

            <div className="px-2 space-y-1">
              {user?.backendRole === "ADMIN" && (
                <Link
                  href="/dashboard/team"
                  className="w-full flex items-center gap-3 px-4 py-3 text-xs font-bold text-zinc-600 hover:bg-zinc-50 hover:text-[#111827] rounded-xl transition-all"
                >
                  <Settings className="h-4 w-4" />
                  Configuración
                </Link>
              )}
            </div>

            <div className="h-px bg-zinc-100 my-2 mx-4" />

            <div className="px-2">
              <button
                onClick={() => signOut()}
                className="w-full flex items-center gap-3 px-4 py-3 text-xs font-black text-red-500 hover:bg-red-50 rounded-xl transition-all uppercase tracking-widest"
              >
                <LogOut className="h-4 w-4" />
                Cerrar Sesión
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
