"use client";

import React from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useAuth } from '@/context/auth';
import { dashboardConfig } from '@/config/navigation';
import { UserRole } from '@/types/saas-schema';
import { X } from 'lucide-react';

interface SidebarProps {
  isOpen?: boolean;
  onClose?: () => void;
}

export function Sidebar({ isOpen, onClose }: SidebarProps) {
  const pathname = usePathname();
  const { user, loginAs, signOut } = useAuth();

  const filteredNav = dashboardConfig.filter((item) => {
    if (!user) return false;
    return item.allowedRoles.includes(user.role);
  });

  return (
    <>
      {/* Overlay for mobile */}
      {isOpen && (
        <div 
          className="fixed inset-0 bg-black/50 z-40 lg:hidden" 
          onClick={onClose}
        />
      )}

      <aside className={`
        fixed inset-y-0 left-0 z-50 w-64 bg-slate-900 text-white flex flex-col h-screen transition-transform duration-300 ease-in-out lg:translate-x-0 lg:static lg:inset-auto
        ${isOpen ? 'translate-x-0' : '-translate-x-full'}
      `}>
        <div className="flex items-center justify-between p-6 border-b border-slate-800">
          <Link href="/" onClick={onClose} className="block">
            <h1 className="text-xl font-bold text-blue-400">CRM Político</h1>
            <p className="text-xs text-slate-400 mt-1">SaaS Enterprise 2026</p>
          </Link>
          <button 
            onClick={onClose}
            className="lg:hidden text-slate-400 hover:text-white"
          >
            <X size={24} />
          </button>
        </div>

        <nav className="flex-1 overflow-y-auto p-4 space-y-2">
          {filteredNav.map((item) => {
            const isActive = pathname === item.href;
            return (
              <Link
                key={item.href}
                href={item.href}
                onClick={onClose}
                className={`block px-4 py-2 rounded-md transition-colors ${
                  isActive
                    ? 'bg-blue-600 text-white'
                    : 'text-slate-300 hover:bg-slate-800 hover:text-white'
                }`}
              >
                {item.title}
              </Link>
            );
          })}
        </nav>

      <div className="p-4 border-t border-slate-800 space-y-4">
        {/* Role Switcher (Dev Mode) */}
        <div className="space-y-2">
          <label className="text-[10px] uppercase font-bold text-slate-500 px-2">
            Simulador de Roles
          </label>
          <select
            className="w-full bg-slate-800 text-sm border-none rounded px-2 py-1 text-slate-200 focus:ring-1 focus:ring-blue-500"
            value={user?.role || ''}
            onChange={(e) => loginAs(e.target.value as UserRole)}
          >
            {Object.values(UserRole).map((role) => (
              <option key={role} value={role}>
                {role}
              </option>
            ))}
          </select>
        </div>

        <div className="flex items-center gap-3 px-2">
          <div className="w-8 h-8 rounded-full bg-blue-500 flex items-center justify-center text-xs font-bold">
            {user?.name.charAt(0)}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium truncate">{user?.name}</p>
            <p className="text-[10px] text-slate-400 truncate">{user?.role}</p>
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
    </>
  );
}
