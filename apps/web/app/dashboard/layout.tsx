"use client";

import React, { useEffect, useState } from 'react';
import { Sidebar } from '@/components/layout/Sidebar';
import { UserNav } from '@/components/UserNav';
import { useAuth } from '@/context/auth';
import { useRouter, usePathname } from 'next/navigation';
import { dashboardConfig } from '@/config/navigation';
import { ShieldAlert, ArrowLeft, Menu } from 'lucide-react';

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { user, loading } = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  // Find config for current route to check permissions
  const currentRouteConfig = dashboardConfig.find(item => pathname.startsWith(item.href));
  const hasPermission = !currentRouteConfig || (user && currentRouteConfig.allowedRoles.includes(user.role));

  useEffect(() => {
    if (mounted && !loading && !user) {
      router.push('/');
    }
  }, [user, loading, router, mounted]);

  if (!mounted || loading || !user) {
    return (
      <div className="flex h-screen items-center justify-center bg-[#f8fafc]">
        <div className="flex flex-col items-center gap-4">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-teal-600"></div>
          <p className="text-slate-500 font-black text-[10px] uppercase tracking-widest">Sincronizando Mando Táctico...</p>
        </div>
      </div>
    );
  }

  // Permission Denied View
  if (!hasPermission) {
    return (
      <div className="flex h-screen bg-[#f8fafc] overflow-hidden">
        <Sidebar isOpen={isSidebarOpen} onClose={() => setIsSidebarOpen(false)} />
        <div className="flex-1 flex flex-col h-screen overflow-hidden items-center justify-center p-8 text-center relative">
          <div className="lg:hidden absolute top-4 left-4">
            <button 
              onClick={() => setIsSidebarOpen(true)}
              className="p-2 text-slate-600 hover:bg-slate-100 rounded-lg"
            >
              <Menu size={24} />
            </button>
          </div>
          <div className="bg-white p-12 rounded-[3rem] border border-slate-200 flex flex-col items-center gap-6 max-w-md shadow-2xl shadow-slate-200">
            <div className="h-20 w-20 bg-rose-50 rounded-[1.5rem] flex items-center justify-center text-rose-500">
              <ShieldAlert size={48} />
            </div>
            <div>
              <h2 className="text-2xl font-black text-slate-900 tracking-tighter mb-2">Acceso Restringido</h2>
              <p className="text-slate-500 font-medium leading-relaxed text-sm">
                Tu rol actual (<span className="font-bold text-rose-600">{user.role}</span>) no tiene los permisos necesarios para visualizar esta sección del despliegue táctico.
              </p>
            </div>
            <button 
              onClick={() => router.push('/dashboard/executive')}
              className="flex items-center gap-2 bg-teal-600 text-white px-8 py-4 rounded-2xl font-black uppercase tracking-widest text-[10px] hover:bg-teal-700 transition-all shadow-xl shadow-teal-100"
            >
              <ArrowLeft size={16} /> Volver al Centro de Comando
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-screen bg-[#f8fafc] overflow-hidden font-sans">
      <Sidebar isOpen={isSidebarOpen} onClose={() => setIsSidebarOpen(false)} />
      <div className="flex-1 flex flex-col h-screen overflow-hidden">
        <header className="h-16 border-b border-slate-100 bg-white flex items-center px-4 lg:px-8 justify-between shadow-sm z-30">
          <div className="flex items-center gap-4">
            <button 
              onClick={() => setIsSidebarOpen(true)}
              className="lg:hidden p-2 text-slate-600 hover:bg-slate-100 rounded-lg"
            >
              <Menu size={24} />
            </button>
            <div className="flex items-center gap-2">
               <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
               <div className="text-[10px] font-black text-slate-400 uppercase tracking-widest">
                  Infraestructura Segura <span className="text-slate-300">●</span> <span className="text-slate-600">Online</span>
               </div>
            </div>
          </div>
          <div className="flex items-center gap-6">
            <div className="text-[10px] font-black text-teal-600 bg-teal-50 px-4 py-1.5 rounded-full hidden md:block uppercase tracking-widest">
              Colombia 2026
            </div>
            <UserNav />
          </div>
        </header>
        <main className="flex-1 p-4 lg:p-10 overflow-y-auto custom-scrollbar">
          {children}
        </main>
      </div>
    </div>
  );
}
