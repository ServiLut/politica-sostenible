"use client";

import React, { useState, useRef, useEffect } from "react";
import { useAuth } from "@/context/auth";
import { useToast } from "@/context/ToastContext";
import Link from "next/link";
import { 
  User, 
  Settings, 
  LogOut, 
  ChevronDown,
  Shield,
  Bell,
  X,
  Lock,
  Mail,
  ShieldAlert,
  AlertCircle,
  Info,
  Check
} from "lucide-react";
import { cn } from "@/components/ui/utils";

export function UserNav() {
  const { user, role, signOut } = useAuth();
  const { success, error: toastError } = useToast();
  const [isOpen, setIsOpen] = useState(false);
  const [isNotificationsOpen, setIsNotificationsOpen] = useState(false);
  const [hasUnread, setHasUnread] = useState(true);
  const [isProfileOpen, setIsProfileOpen] = useState(false);
  const [isChangingPassword, setIsChangingPassword] = useState(false);
  const [passwords, setPasswords] = useState({ old: "", new: "", confirm: "" });
  const dropdownRef = useRef<HTMLDivElement>(null);
  const notificationsRef = useRef<HTMLDivElement>(null);

  // Mock Notifications Data
  const notifications = [
    { id: 1, title: "Alerta CNE", message: "Tope de gastos al 85%. Se requiere revisión inmediata.", time: "Hace 10m", type: "critical", date: "2026-02-24" },
    { id: 2, title: "Nuevo Reporte SIT", message: "Puesto 'Liceo Antioqueño' ha completado el 100% de mesas.", time: "Hace 45m", type: "success", date: "2026-02-24" },
    { id: 3, title: "Misión Asignada", message: "Tienes una nueva misión de campo en la Comuna 13.", time: "Hace 2h", type: "info", date: "2026-02-24" },
    { id: 4, title: "Inteligencia Táctica", message: "Incremento del 15% en simpatizantes detectado en Zona Norte.", time: "Hace 5h", type: "warning", date: "2026-02-23" },
  ];

  // Robust Scroll Lock for Dashboard
  useEffect(() => {
    const mainContent = document.querySelector('main');
    if (isProfileOpen) {
      document.body.style.overflow = 'hidden';
      if (mainContent) {
        mainContent.style.overflow = 'hidden';
        mainContent.style.paddingRight = '0px'; // Prevent layout shift
      }
    } else {
      document.body.style.overflow = 'unset';
      if (mainContent) mainContent.style.overflow = 'auto';
    }
    return () => {
      document.body.style.overflow = 'unset';
      if (mainContent) mainContent.style.overflow = 'auto';
    };
  }, [isProfileOpen]);

  // Close dropdowns when clicking outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
      if (notificationsRef.current && !notificationsRef.current.contains(event.target as Node)) {
        setIsNotificationsOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const userInitial = user?.name?.[0].toUpperCase() ?? user?.email?.[0].toUpperCase() ?? "U";
  const userEmail = user?.email ?? "usuario@politicasostenible.co";
  const userName = user?.name ?? "Usuario del Sistema";

  const handleUpdatePassword = (e: React.FormEvent) => {
    e.preventDefault();
    if (passwords.new !== passwords.confirm) {
      toastError("Las contraseñas nuevas no coinciden");
      return;
    }
    if (passwords.old.length < 4) {
      toastError("La contraseña anterior es obligatoria y debe ser válida");
      return;
    }
    success("Credenciales actualizadas correctamente");
    setIsChangingPassword(false);
    setPasswords({ old: "", new: "", confirm: "" });
  };

  return (
    <div className="flex items-center gap-2 md:gap-4">
      {/* Notifications Popover */}
      <div className="relative" ref={notificationsRef}>
        <button 
          onClick={() => {
            const newState = !isNotificationsOpen;
            setIsNotificationsOpen(newState);
            if (newState) setHasUnread(false);
            setIsOpen(false);
          }}
          className={cn(
            "h-10 w-10 flex items-center justify-center rounded-xl transition-all relative group",
            isNotificationsOpen ? "bg-teal-50 text-teal-600 border border-teal-100 shadow-inner" : "text-slate-400 hover:text-slate-900 hover:bg-slate-50"
          )}
        >
          <Bell className={cn("h-5 w-5 transition-transform", isNotificationsOpen && "scale-110")} />
          {hasUnread && (
            <span className="absolute top-2 right-2 h-2 w-2 bg-rose-500 rounded-full border-2 border-white animate-pulse" />
          )}
        </button>

        {isNotificationsOpen && (
          <div className="absolute right-0 mt-4 w-[320px] md:w-96 bg-white rounded-[2rem] shadow-2xl border border-slate-100 overflow-hidden z-50 animate-in fade-in slide-in-from-top-2 duration-200">
            <div className="px-8 py-6 border-b border-slate-50 flex justify-between items-center bg-slate-50/50">
              <div>
                <h3 className="text-sm font-black text-slate-900 uppercase tracking-tighter">Centro de Mensajes</h3>
                <p className="text-[8px] font-black text-slate-400 uppercase tracking-[0.2em] mt-0.5">Alertas de Campaña SIT</p>
              </div>
              <span className="bg-teal-600 text-white text-[8px] font-black px-2 py-0.5 rounded-full uppercase">4 Nuevas</span>
            </div>

            <div className="max-h-[400px] overflow-y-auto custom-scrollbar">
              {notifications.map((n) => (
                <div key={n.id} className="p-6 border-b border-slate-50 hover:bg-slate-50/50 transition-all group cursor-pointer relative">
                  <div className="flex gap-4">
                    <div className={cn(
                      "h-10 w-10 rounded-2xl flex items-center justify-center shrink-0 border transition-all group-hover:scale-110 shadow-sm",
                      n.type === 'critical' ? "bg-rose-50 text-rose-600 border-rose-100" :
                      n.type === 'success' ? "bg-emerald-50 text-emerald-600 border-emerald-100" :
                      n.type === 'warning' ? "bg-amber-50 text-amber-600 border-amber-100" :
                      "bg-teal-50 text-teal-600 border-teal-100"
                    )}>
                      {n.type === 'critical' ? <ShieldAlert size={18} /> : 
                       n.type === 'success' ? <Check size={18} /> : 
                       n.type === 'warning' ? <AlertCircle size={18} /> : <Info size={18} />}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex justify-between items-start mb-1 gap-2">
                        <p className="text-[10px] font-black text-slate-900 uppercase leading-none truncate">{n.title}</p>
                        <span className="text-[8px] font-bold text-slate-400 whitespace-nowrap bg-white px-1.5 py-0.5 rounded border border-slate-100">{n.time}</span>
                      </div>
                      <p className="text-[11px] text-slate-500 leading-relaxed font-medium line-clamp-2">{n.message}</p>
                      <p className="text-[7px] font-black text-slate-300 uppercase mt-2 tracking-widest">{n.date}</p>
                    </div>
                  </div>
                </div>
              ))}
            </div>

            <button className="w-full py-4 bg-white text-[9px] font-black text-slate-400 uppercase tracking-widest hover:text-teal-600 hover:bg-slate-50 transition-all border-t border-slate-50">
              Ver todo el historial de misiones
            </button>
          </div>
        )}
      </div>

      <div className="relative" ref={dropdownRef}>
        <button 
          onClick={() => {
            setIsOpen(!isOpen);
            setIsNotificationsOpen(false);
          }}
          className="flex items-center gap-3 p-1 pr-3 rounded-full hover:bg-slate-50 transition-all border border-transparent hover:border-slate-200"
        >
          <div className="h-9 w-9 rounded-xl bg-teal-50 text-teal-600 border border-teal-100 flex items-center justify-center font-black text-sm shadow-sm transition-all">
            {userInitial}
          </div>
          <div className="hidden md:block text-left">
            <p className="text-[10px] font-black text-slate-900 uppercase tracking-tighter leading-none">
              {userName}
            </p>
            <p className="text-[8px] font-bold text-teal-600 uppercase tracking-widest">
              {role || "Estratega Demo"}
            </p>
          </div>
          <ChevronDown className={cn("h-4 w-4 text-slate-400 transition-transform", isOpen && "rotate-180")} />
        </button>

        {isOpen && (
          <div className="absolute right-0 mt-4 w-64 bg-white rounded-[1.5rem] shadow-2xl border border-slate-100 py-3 z-50 animate-in fade-in zoom-in-95 duration-200">
            <div className="px-6 py-4 border-b border-slate-50 mb-2">
              <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Identidad</p>
              <p className="text-sm font-bold text-slate-900 truncate">{userEmail}</p>
            </div>
            
            <div className="px-2 space-y-1">
              <button 
                onClick={() => {
                  setIsProfileOpen(true);
                  setIsOpen(false);
                }}
                className="w-full flex items-center gap-3 px-4 py-3 text-xs font-bold text-slate-600 hover:bg-slate-50 hover:text-slate-900 rounded-xl transition-all"
              >
                <User className="h-4 w-4" />
                Mi Perfil Político
              </button>
              <Link href="/dashboard/settings" className="w-full flex items-center gap-3 px-4 py-3 text-xs font-bold text-slate-600 hover:bg-slate-50 hover:text-slate-900 rounded-xl transition-all">
                <Settings className="h-4 w-4" />
                Configuración
              </Link>
              <Link href="/dashboard/security" className="w-full flex items-center gap-3 px-4 py-3 text-xs font-bold text-slate-600 hover:bg-slate-50 hover:text-slate-900 rounded-xl transition-all">
                <Shield className="h-4 w-4" />
                Integridad & Seguridad
              </Link>
            </div>
            
            <div className="h-px bg-slate-100 my-2 mx-4" />
            
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

      {/* Profile Modal */}
      {isProfileOpen && (
        <div 
          className="fixed inset-0 bg-slate-900/40 backdrop-blur-md z-[200] flex items-center justify-center p-4 animate-in fade-in duration-300"
          onClick={() => {
            setIsProfileOpen(false);
            setIsChangingPassword(false);
          }}
        >
          <div 
            className="bg-white w-full max-w-md rounded-[3rem] shadow-2xl overflow-hidden animate-in zoom-in-95 duration-300 relative border border-white/20"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header / Identity Card */}
            <div className="relative h-32 bg-gradient-to-br from-teal-500 to-teal-700 overflow-hidden">
              <div className="absolute inset-0 opacity-10">
                <Shield size={200} className="absolute -right-10 -top-10 rotate-12 text-white" />
              </div>
              <button
                onClick={() => {
                  setIsProfileOpen(false);
                  setIsChangingPassword(false);
                }}
                className="absolute top-6 right-6 z-10 p-2 bg-white/10 hover:bg-white/20 text-white rounded-xl transition-all backdrop-blur-md"
              >
                <X size={18} />
              </button>
            </div>

            <div className="px-10 pb-10 -mt-12 relative">
              <div className="flex flex-col items-center text-center mb-8">
                <div className="h-24 w-24 rounded-[2rem] bg-white p-1.5 shadow-xl mb-4">
                  <div className="h-full w-full rounded-[1.6rem] bg-teal-50 text-teal-600 flex items-center justify-center text-3xl font-black border border-teal-100">
                    {userInitial}
                  </div>
                </div>
                <h3 className="text-2xl font-black text-slate-900 tracking-tighter uppercase">{userName}</h3>
                <p className="text-[10px] font-black text-teal-600 uppercase tracking-[0.2em] bg-teal-50 px-3 py-1 rounded-full mt-2">
                  {role || "Estratega Electoral"}
                </p>
              </div>

              {!isChangingPassword ? (
                <div className="space-y-6">
                  <div className="space-y-4">
                    <div className="flex items-center gap-4 p-4 rounded-2xl bg-slate-50 border border-slate-100 group transition-all">
                      <div className="h-10 w-10 rounded-xl bg-white flex items-center justify-center text-slate-400 border border-slate-100">
                        <Mail size={18} />
                      </div>
                      <div className="flex-1 overflow-hidden text-left">
                        <p className="text-[8px] font-black text-slate-400 uppercase tracking-widest">Correo Electrónico</p>
                        <p className="text-sm font-bold text-slate-700 truncate">{userEmail}</p>
                      </div>
                    </div>

                    <div className="flex items-center gap-4 p-4 rounded-2xl bg-slate-50 border border-slate-100 group transition-all">
                      <div className="h-10 w-10 rounded-xl bg-white flex items-center justify-center text-teal-600 border border-slate-100">
                        <Lock size={18} />
                      </div>
                      <div className="flex-1 text-left">
                        <p className="text-[8px] font-black text-slate-400 uppercase tracking-widest">Seguridad de Acceso</p>
                        <p className="text-sm font-bold text-slate-700">••••••••••••</p>
                      </div>
                      <button 
                        onClick={() => setIsChangingPassword(true)}
                        className="text-[10px] font-black text-teal-600 uppercase tracking-widest hover:underline px-2"
                      >
                        Cambiar
                      </button>
                    </div>
                  </div>

                  <div className="pt-2 flex flex-col gap-3">
                    <button 
                      onClick={() => setIsProfileOpen(false)}
                      className="w-full py-4 bg-slate-900 text-white rounded-[1.5rem] font-black text-[10px] uppercase tracking-[0.2em] shadow-xl hover:bg-teal-600 transition-all"
                    >
                      Cerrar Vista
                    </button>
                    <button className="text-[9px] font-black text-slate-400 uppercase tracking-widest hover:text-teal-600 transition-colors">
                      ¿Problemas con el acceso? Contactar soporte
                    </button>
                  </div>
                </div>
              ) : (
                <form onSubmit={handleUpdatePassword} className="space-y-4 animate-in slide-in-from-right-4 duration-300">
                  <div className="space-y-4 text-left">
                    <div>
                      <label className="text-[9px] font-black uppercase text-slate-400 tracking-widest block mb-1.5 px-1">Contraseña Anterior</label>
                      <input 
                        required
                        type="password"
                        placeholder="••••••••"
                        className="w-full px-5 py-3.5 bg-slate-50 border-2 border-slate-100 rounded-2xl text-sm font-bold focus:border-teal-500 focus:bg-white outline-none transition-all" 
                        value={passwords.old}
                        onChange={e => setPasswords({...passwords, old: e.target.value})}
                      />
                    </div>
                    <div>
                      <label className="text-[9px] font-black uppercase text-slate-400 tracking-widest block mb-1.5 px-1">Nueva Contraseña</label>
                      <input 
                        required
                        type="password"
                        placeholder="Mínimo 8 caracteres"
                        className="w-full px-5 py-3.5 bg-teal-50/30 border-2 border-slate-200 rounded-2xl text-sm font-bold focus:border-teal-500 focus:bg-white outline-none transition-all" 
                        value={passwords.new}
                        onChange={e => setPasswords({...passwords, new: e.target.value})}
                      />
                    </div>
                    <div>
                      <label className="text-[9px] font-black uppercase text-slate-400 tracking-widest block mb-1.5 px-1">Confirmar Nueva</label>
                      <input 
                        required
                        type="password"
                        placeholder="Repite la contraseña"
                        className="w-full px-5 py-3.5 bg-teal-50/30 border-2 border-slate-200 rounded-2xl text-sm font-bold focus:border-teal-500 focus:bg-white outline-none transition-all" 
                        value={passwords.confirm}
                        onChange={e => setPasswords({...passwords, confirm: e.target.value})}
                      />
                    </div>
                  </div>

                  <div className="pt-4 flex flex-col gap-3">
                    <button 
                      type="submit"
                      className="w-full py-4 bg-teal-600 text-white rounded-[1.5rem] font-black text-[10px] uppercase tracking-[0.2em] shadow-xl shadow-teal-100 hover:bg-teal-700 transition-all"
                    >
                      Actualizar Credenciales
                    </button>
                    <button 
                      type="button"
                      onClick={() => setIsChangingPassword(false)}
                      className="w-full py-3 text-[10px] font-black text-slate-400 uppercase tracking-widest hover:text-slate-900 transition-colors"
                    >
                      Cancelar Cambio
                    </button>
                  </div>
                </form>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
