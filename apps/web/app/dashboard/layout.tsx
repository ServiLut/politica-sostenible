"use client";

import React, { useEffect } from 'react';
import { Sidebar } from '@/components/layout/Sidebar';
import { UserNav } from '@/components/UserNav';
import { useAuth } from '@/context/auth';
import { useRouter, usePathname } from 'next/navigation';
import { dashboardConfig } from '@/config/navigation';
import { ShieldAlert, ArrowLeft } from 'lucide-react';

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { user, loading } = useAuth();
  const router = useRouter();
  const pathname = usePathname();

  // Find config for current route to check permissions
  const currentRouteConfig = dashboardConfig.find(item => pathname.startsWith(item.href));
  const hasPermission = !currentRouteConfig || (user && currentRouteConfig.allowedRoles.includes(user.role));

  useEffect(() => {
    if (!loading && !user) {
      router.push('/');
    }
  }, [user, loading, router]);

  if (loading || !user) {
    return (
      <div className="flex h-screen items-center justify-center bg-slate-50">
        <div className="flex flex-col items-center gap-4">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
          <p className="text-slate-500 font-black text-xs uppercase tracking-widest">Cargando Sistema...</p>
        </div>
      </div>
    );
  }

  // Permission Denied View
  if (!hasPermission) {
    return (
      <div className="flex min-h-screen bg-slate-50">
        <Sidebar />
        <div className="flex-1 flex flex-col items-center justify-center p-8 text-center">
          <div className="bg-red-50 p-8 rounded-[3rem] border border-red-100 flex flex-col items-center gap-6 max-w-md shadow-xl shadow-red-900/5">
            <div className="h-20 w-20 bg-red-100 rounded-[1.5rem] flex items-center justify-center text-red-600">
              <ShieldAlert size={48} />
            </div>
            <div>
              <h2 className="text-2xl font-black text-slate-900 tracking-tighter mb-2">Acceso Restringido</h2>
              <p className="text-slate-500 font-medium leading-relaxed">
                Tu rol actual (<span className="font-bold text-red-600">{user.role}</span>) no tiene los permisos necesarios para visualizar esta sección del despliegue táctico.
              </p>
            </div>
            <button 
              onClick={() => router.push('/dashboard/executive')}
              className="flex items-center gap-2 bg-[#111827] text-white px-6 py-3 rounded-2xl font-black uppercase tracking-widest text-xs hover:bg-blue-600 transition-all shadow-lg"
            >
              <ArrowLeft size={16} /> Volver al Centro de Comando
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen bg-slate-50">
      <Sidebar />
      <div className="flex-1 flex flex-col min-h-screen overflow-hidden">
        <header className="h-16 border-b border-slate-200 bg-white flex items-center px-8 justify-between">
          <div className="text-xs font-black text-slate-400 uppercase tracking-widest">
            Infraestructura Segura <span className="text-emerald-500">● Online</span>
          </div>
          <div className="flex items-center gap-6">
            <div className="text-xs font-bold text-slate-900 bg-slate-100 px-3 py-1 rounded-full hidden md:block">
              Colombia 2026
            </div>
            <UserNav />
          </div>
        </header>
        <main className="flex-1 p-8 overflow-y-auto">
          {children}
        </main>
      </div>
    </div>
  );
}
