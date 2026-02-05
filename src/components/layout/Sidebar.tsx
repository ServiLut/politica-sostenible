'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { 
  LayoutDashboard, 
  Users, 
  Map, 
  DollarSign, 
  ShieldAlert, 
  Settings, 
  LogOut,
  Menu,
  X,
  CheckSquare,
  ShieldCheck
} from 'lucide-react';

const ALL_MENU_ITEMS = [
  { name: 'Tablero', href: '/dashboard', icon: LayoutDashboard, roles: ['ADMIN', 'COORDINATOR', 'LEADER'] },
  { name: 'Directorio', href: '/dashboard/directory', icon: Users, roles: ['ADMIN', 'COORDINATOR', 'LEADER'] },
  { name: 'Captura', href: '/capture', icon: Users, roles: ['ADMIN', 'COORDINATOR', 'LEADER'] },
  { name: 'Misiones', href: '/dashboard/tasks', icon: CheckSquare, roles: ['ADMIN', 'COORDINATOR', 'LEADER'] },
  { name: 'Escrutinio', href: '/dashboard/e14', icon: ShieldCheck, roles: ['ADMIN'] },
  { name: 'Equipo', href: '/dashboard/team', icon: Users, roles: ['ADMIN'] },
  { name: 'Solicitudes', href: '/dashboard/requests', icon: ShieldAlert, roles: ['ADMIN'] },
  { name: 'Territorio', href: '/dashboard/territory', icon: Map, roles: ['ADMIN', 'COORDINATOR'] }, // Leader usually focuses on capture, but map might be useful. Prompt didn't explicitly block map for leader in middleware, but typically restricted. I'll allow if not blocked by middleware, but "Equipo" is definitely Admin. 
  // Wait, Middleware blocks /dashboard/users (Equipo), /dashboard/finance, /dashboard/settings, /dashboard/security.
  // /dashboard/territory is NOT in the block list in middleware. So Leader CAN see it.
  // I will follow Middleware logic for visibility to avoid confusion.
  { name: 'Finanzas', href: '/dashboard/finance', icon: DollarSign, roles: ['ADMIN'] },
  { name: 'Seguridad', href: '/dashboard/security/logs', icon: ShieldAlert, roles: ['ADMIN'] },
];

export default function Sidebar() {
  const router = useRouter();
  const pathname = usePathname();
  const [isOpen, setIsOpen] = React.useState(false);
  const [userData, setUserData] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
      fetch('/api/auth/me')
        .then(res => {
            if (res.ok) return res.json();
            throw new Error('No session');
        })
        .then(data => {
            setUserData(data);
            setLoading(false);
        })
        .catch(() => {
            setLoading(false);
        });
  }, []);

  const handleLogout = async () => {
    try {
      await fetch('/api/auth/logout', { method: 'POST' });
      router.push('/login');
      router.refresh();
    } catch (error) {
      console.error('Logout failed:', error);
    }
  };

  // Filter Menu
  const visibleItems = ALL_MENU_ITEMS.filter(item => 
    loading ? false : item.roles.includes(userData?.role)
  );

  const getInitials = (name: string) => {
    if (!name) return '??';
    return name.split(' ').map(n => n[0]).join('').substring(0, 2).toUpperCase();
  };

  const getRoleColor = (role: string) => {
    switch (role) {
      case 'ADMIN': return 'bg-red-100 text-red-700 border-red-200';
      case 'COORDINATOR': return 'bg-blue-100 text-blue-700 border-blue-200';
      case 'LEADER': return 'bg-green-100 text-green-700 border-green-200';
      default: return 'bg-slate-100 text-slate-700 border-slate-200';
    }
  };

  return (
    <>
      {/* Mobile Trigger - Use Friendly Black */}
      <button 
        onClick={() => setIsOpen(!isOpen)}
        className="md:hidden fixed top-4 right-4 z-50 p-3 bg-brand-black text-white rounded-2xl shadow-soft-xl"
      >
        {isOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
      </button>

      {/* Sidebar Container - Light Professional Theme */}
      <aside className={`
        fixed top-0 left-0 z-40 h-screen w-64 bg-white border-r border-brand-gray-100 transition-transform duration-300 ease-in-out
        ${isOpen ? 'translate-x-0' : '-translate-x-full md:translate-x-0'}
      `}>
        <div className="flex flex-col h-full">
          
          {/* Logo Area - Green Accent */}
          <div className="h-24 flex flex-col items-center justify-center border-b border-brand-gray-100 bg-brand-gray-50/50 px-4">
            <div className="flex items-center gap-2 max-w-full">
                <ShieldCheck className="w-6 h-6 text-brand-green-600 shrink-0" />
                <h1 className="text-base font-black tracking-tighter text-brand-black leading-none uppercase">
                  POLÍTICA <span className="text-brand-green-600 font-bold">SOSTENIBLE</span>
                </h1>
            </div>
          </div>

          {/* Navigation Links */}
          <nav className="flex-1 px-4 py-8 space-y-1.5 overflow-y-auto">
            {loading ? (
                <div className="space-y-3 p-4">
                    {[1,2,3,4,5].map(i => <div key={i} className="h-10 bg-brand-gray-50 rounded-xl animate-pulse" />)}
                </div>
            ) : (
                visibleItems.map((item) => {
                const isActive = pathname === item.href;
                const Icon = item.icon;
                
                return (
                    <Link 
                    key={item.href} 
                    href={item.href}
                    onClick={() => setIsOpen(false)}
                    className={`flex items-center gap-3 px-4 py-3.5 rounded-xl transition-all font-semibold text-sm
                        ${isActive 
                        ? 'bg-brand-black text-white shadow-lg' 
                        : 'text-brand-gray-500 hover:bg-brand-green-50 hover:text-brand-green-700'}
                    `}
                    >
                    <Icon className={`w-5 h-5 ${isActive ? 'text-brand-green-500' : ''}`} />
                    <span>{item.name}</span>
                    </Link>
                );
                })
            )}
          </nav>

          {/* User Profile Card & Footer Actions */}
          <div className="p-4 border-t border-brand-gray-100 space-y-3">
            {loading ? (
                <div className="flex items-center gap-3 p-2 bg-brand-gray-50 rounded-2xl animate-pulse">
                    <div className="w-10 h-10 bg-brand-gray-200 rounded-full" />
                    <div className="flex-1 space-y-2">
                        <div className="h-3 bg-brand-gray-200 rounded w-24" />
                        <div className="h-2 bg-brand-gray-200 rounded w-16" />
                    </div>
                </div>
            ) : userData && (
                <div className="p-3 bg-brand-gray-50/80 rounded-2xl border border-brand-gray-100 flex items-center gap-3">
                    <div className="w-10 h-10 bg-brand-black text-white rounded-full flex items-center justify-center text-xs font-black shadow-sm shrink-0">
                        {getInitials(userData.fullName)}
                    </div>
                    <div className="flex-1 min-w-0">
                        <p className="text-xs font-black text-brand-black truncate">{userData.fullName}</p>
                        <span className={`text-[9px] font-black px-1.5 py-0.5 rounded border uppercase tracking-tighter ${getRoleColor(userData.role)}`}>
                            {userData.role}
                        </span>
                    </div>
                    <button 
                        onClick={handleLogout}
                        className="p-2 text-brand-gray-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-all"
                        title="Cerrar Sesión"
                    >
                        <LogOut className="w-4 h-4" />
                    </button>
                </div>
            )}

            {userData?.role === 'ADMIN' && (
                <Link 
                href="/dashboard/settings"
                className="flex items-center gap-3 px-4 py-2.5 text-brand-gray-500 hover:bg-brand-gray-100 transition-all rounded-xl text-xs font-bold"
                onClick={() => setIsOpen(false)}
                >
                <Settings className="w-4 h-4" />
                <span>Configuración Sistema</span>
                </Link>
            )}
          </div>
        </div>
      </aside>

      {/* Overlay for Mobile */}
      {isOpen && (
        <div 
          className="fixed inset-0 bg-brand-black/20 z-30 md:hidden backdrop-blur-sm"
          onClick={() => setIsOpen(false)}
        />
      )}
    </>
  );
}
