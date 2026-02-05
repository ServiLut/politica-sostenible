'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { ShieldCheck, User, Lock, UserPlus, CheckCircle2, ArrowRight, Loader2, AlertCircle, Mail } from 'lucide-react';
import { registerUser } from '@/app/actions/auth';
import { toast } from 'sonner';

export default function SignupPage() {
  const [formData, setFormData] = useState({ fullName: '', pin: '', email: '' });
  const [loading, setLoading] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      const res = await registerUser(formData);
      if (res.success) {
        setIsSuccess(true);
        toast.success('Solicitud enviada correctamente');
      } else {
        toast.error('Error en el registro', { description: res.error });
      }
    } catch (error) {
      toast.error('Error de conexión');
    } finally {
      setLoading(false);
    }
  };

  if (isSuccess) {
    return (
      <div className="min-h-screen bg-brand-gray-50 flex items-center justify-center p-6">
        <div className="max-w-[500px] w-full bg-white card-friendly p-10 text-center animate-in fade-in zoom-in duration-500">
          <div className="w-20 h-20 bg-brand-green-100 rounded-full flex items-center justify-center mx-auto mb-6">
            <CheckCircle2 className="w-10 h-10 text-brand-green-600" />
          </div>
          <h2 className="text-2xl font-black text-brand-black mb-4">¡Solicitud Enviada!</h2>
          <p className="text-brand-gray-500 font-medium mb-8">
            Tu cuenta ha sido creada con éxito, pero está **pendiente de aprobación** por el Administrador. 
            Recibirás acceso una vez que tu identidad sea verificada.
          </p>
          <div className="space-y-4">
            <Link 
              href="/" 
              className="btn-primary-friendly w-full h-[55px] flex items-center justify-center gap-2"
            >
              Volver al Inicio
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-brand-gray-50 flex items-center justify-center p-6">
      <div className="max-w-[450px] w-full flex flex-col gap-8 animate-in fade-in slide-in-from-bottom-4 duration-700">
        
        {/* LOGO & BRANDING */}
        <div className="flex flex-col items-center text-center">
            <div className="w-16 h-16 bg-brand-black rounded-2xl flex items-center justify-center shadow-xl mb-4">
                <ShieldCheck className="w-8 h-8 text-brand-green-500" />
            </div>
            <h1 className="text-3xl font-black text-brand-black tracking-tight uppercase">Únete al Equipo</h1>
            <p className="text-[10px] font-black text-brand-gray-400 uppercase tracking-widest mt-2 bg-white px-4 py-1 rounded-full shadow-sm border border-brand-gray-100">Registro de Nuevo Líder</p>
        </div>

        <div className="card-friendly p-10 bg-white shadow-soft-xl">
          <div className="mb-8">
              <h2 className="text-xl font-black text-brand-black">Solicitar Acceso</h2>
              <p className="text-sm text-brand-gray-400 font-bold mt-1">Complete sus datos para la verificación</p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-6">
            <div className="space-y-2">
              <label className="text-[10px] font-black text-brand-gray-500 uppercase tracking-widest ml-1">Nombre Completo</label>
              <div className="relative group">
                <div className="absolute inset-y-0 left-5 flex items-center pointer-events-none">
                  <User className="h-5 w-5 text-brand-gray-300 group-focus-within:text-brand-black transition-colors" />
                </div>
                <input 
                  type="text" 
                  required 
                  className="block w-full pl-14 pr-5 py-4 bg-brand-gray-50 border-2 border-brand-gray-100 rounded-2xl focus:ring-0 focus:border-brand-black focus:bg-white text-brand-black font-bold transition-all outline-none" 
                  placeholder="Ej. Juan Pérez" 
                  value={formData.fullName} 
                  onChange={(e) => setFormData({ ...formData, fullName: e.target.value })} 
                />
              </div>
            </div>

            <div className="space-y-2">
              <label className="text-[10px] font-black text-brand-gray-500 uppercase tracking-widest ml-1">Correo Electrónico</label>
              <div className="relative group">
                <div className="absolute inset-y-0 left-5 flex items-center pointer-events-none">
                  <Mail className="h-5 w-5 text-brand-gray-300 group-focus-within:text-brand-black transition-colors" />
                </div>
                <input 
                  type="email" 
                  required 
                  className="block w-full pl-14 pr-5 py-4 bg-brand-gray-50 border-2 border-brand-gray-100 rounded-2xl focus:ring-0 focus:border-brand-black focus:bg-white text-brand-black font-bold transition-all outline-none" 
                  placeholder="usuario@ejemplo.com" 
                  value={formData.email} 
                  onChange={(e) => setFormData({ ...formData, email: e.target.value })} 
                />
              </div>
            </div>

            <div className="space-y-2">
              <label className="text-[10px] font-black text-brand-gray-500 uppercase tracking-widest ml-1">Definir PIN (Mín. 4 dígitos)</label>
              <div className="relative group">
                <div className="absolute inset-y-0 left-5 flex items-center pointer-events-none">
                  <Lock className="h-5 w-5 text-brand-gray-300 group-focus-within:text-brand-black transition-colors" />
                </div>
                <input 
                  type="password" 
                  inputMode="numeric" 
                  pattern="[0-9]*" 
                  required 
                  className="block w-full pl-14 pr-5 py-4 bg-brand-gray-50 border-2 border-brand-gray-100 rounded-2xl focus:ring-0 focus:border-brand-black focus:bg-white text-brand-black font-black text-2xl tracking-[0.6em] transition-all outline-none" 
                  placeholder="••••" 
                  value={formData.pin} 
                  onChange={(e) => setFormData({ ...formData, pin: e.target.value })} 
                />
              </div>
            </div>

            <div className="p-4 bg-amber-50 rounded-2xl border border-amber-100 flex gap-3">
              <AlertCircle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
              <p className="text-[11px] font-bold text-amber-800 leading-tight">
                Importante: Todas las solicitudes pasan por un proceso de revisión manual antes de ser activadas.
              </p>
            </div>

            <button 
              type="submit" 
              disabled={loading} 
              className="btn-primary-friendly w-full h-[60px] text-sm uppercase tracking-[0.2em] shadow-xl hover:shadow-2xl disabled:bg-brand-gray-400 disabled:scale-100"
            >
              {loading ? (
                <div className="flex items-center gap-2">
                  <Loader2 className="w-5 h-5 animate-spin" />
                  Procesando...
                </div>
              ) : (
                'Solicitar Acceso'
              )}
            </button>
          </form>

          <div className="mt-8 pt-8 border-t border-brand-gray-100 text-center">
            <p className="text-xs text-brand-gray-400 font-bold uppercase tracking-widest">
              ¿Ya tienes cuenta?{' '}
              <Link href="/login" className="text-brand-green-600 hover:text-brand-green-700 underline transition-colors">
                Inicia Sesión
              </Link>
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
