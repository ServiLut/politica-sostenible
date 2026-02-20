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
        fixed inset-y-0 left-0 z-50 w-72 bg-white border-r border-slate-200 text-slate-600 flex flex-col h-screen transition-transform duration-300 ease-in-out lg:translate-x-0 lg:sticky lg:top-0 lg:h-screen
        ${isOpen ? 'translate-x-0' : '-translate-x-full'}
      `}>
        <div className="flex items-center justify-between p-8 border-b border-slate-100">
          <Link href="/" onClick={onClose} className="block group">
            <h1 className="text-xl font-black text-slate-900 tracking-tighter uppercase flex items-center gap-2">
               <div className="w-8 h-8 bg-teal-600 rounded-lg flex items-center justify-center shadow-lg shadow-teal-500/20 group-hover:scale-110 transition-transform">
                  <div className="w-4 h-4 bg-white rounded-sm rotate-45" />
               </div>
               CRM <span className="text-teal-600">2026</span>
            </h1>
            <p className="text-[10px] font-black text-slate-400 mt-2 uppercase tracking-[0.3em]">Mando Táctico</p>
          </Link>
          <button 
            onClick={onClose}
            className="lg:hidden text-slate-400 hover:text-slate-600 p-2 bg-slate-50 rounded-xl"
          >
            <X size={20} />
          </button>
        </div>

        <nav className="flex-1 overflow-y-auto p-6 space-y-1 custom-scrollbar">
          <div className="text-[10px] font-black text-slate-400 uppercase tracking-[0.3em] mb-4 px-4">Operaciones</div>
          {filteredNav.map((item) => {
            const isActive = pathname === item.href;
            return (
              <Link
                key={item.href}
                href={item.href}
                onClick={onClose}
                className={`flex items-center gap-3 px-4 py-3 rounded-xl transition-all duration-200 group ${
                  isActive
                    ? 'bg-teal-50 text-teal-700 border border-teal-100 shadow-sm'
                    : 'text-slate-500 hover:bg-slate-50 hover:text-slate-900'
                }`}
              >
                <span className={`text-[11px] font-black uppercase tracking-widest ${isActive ? 'text-teal-700' : 'group-hover:text-teal-600'}`}>
                  {item.title}
                </span>
                {isActive && <div className="ml-auto w-1.5 h-1.5 rounded-full bg-teal-600 shadow-[0_0_8px_rgba(13,148,136,0.4)]" />}
              </Link>
            );
          })}
        </nav>

        <div className="p-6 border-t border-slate-100 space-y-6 bg-slate-50/50">
          {/* Role Switcher */}
          <div className="space-y-3">
            <label className="text-[10px] uppercase font-black text-slate-400 px-1 tracking-widest">
              Autorización
            </label>
            <select
              className="w-full bg-white text-[11px] font-black uppercase tracking-widest border border-slate-200 rounded-xl px-4 py-2.5 text-slate-600 focus:ring-1 focus:ring-teal-500 outline-none cursor-pointer shadow-sm"
              value={user?.role || ''}
              onChange={(e) => loginAs(e.target.value as UserRole)}
            >
              {Object.values(UserRole).map((role) => (
                <option key={role} value={role}>
                  {role.replace(/([A-Z])/g, ' $1').trim()}
                </option>
              ))}
            </select>
          </div>

          <div className="flex items-center gap-4 bg-white p-4 rounded-2xl border border-slate-200 shadow-sm">
            <div className="w-10 h-10 rounded-xl bg-teal-50 text-teal-600 border border-teal-100 flex items-center justify-center text-sm font-black shadow-sm transition-all">
              {user?.name.charAt(0)}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-xs font-black text-slate-900 uppercase tracking-tight truncate">{user?.name}</p>
              <p className="text-[9px] font-black text-teal-600 uppercase tracking-widest truncate">{user?.role}</p>
            </div>
          </div>

          <button
            onClick={signOut}
            className="w-full flex items-center justify-center gap-2 px-4 py-3 text-[10px] font-black uppercase tracking-widest text-slate-400 hover:text-rose-500 hover:bg-rose-50 rounded-xl transition-all"
          >
            Cerrar Sesión <X size={14} />
          </button>
        </div>
      </aside>
    </>
  );
}
