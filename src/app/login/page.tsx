'use client';

import React, { useState, useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { Lock, User, ShieldCheck, AlertCircle } from 'lucide-react';

import { toast } from 'sonner';

export default function LoginView() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [formData, setFormData] = useState({ fullName: '', pin: '' });
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (searchParams.get('reason') === 'inactivity') {
      toast.error('Sesión Expirada', { 
        description: 'Se ha cerrado la sesión por inactividad para proteger sus datos.' 
      });
    }
  }, [searchParams]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Acceso denegado');
      
      toast.success('Identidad Verificada', { description: 'Iniciando sesión en el sistema maestro.' });
      router.push('/dashboard');
      router.refresh();
    } catch (err: any) {
      toast.error('Fallo de Autenticación', { description: err.message });
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-brand-gray-50 flex items-center justify-center p-6 font-sans">
      <div className="max-w-[450px] w-full flex flex-col gap-8 animate-in fade-in slide-in-from-bottom-4 duration-1000">
        
        {/* LOGO & BRANDING */}
        <div className="flex flex-col items-center text-center">
            <div className="w-20 h-20 bg-brand-black rounded-[2.5rem] flex items-center justify-center shadow-2xl mb-6 group transition-all hover:rotate-12">
                <ShieldCheck className="w-10 h-10 text-brand-green-500" />
            </div>
            <h1 className="text-3xl md:text-4xl font-black text-brand-black tracking-tighter uppercase break-words px-2">
              POLÍTICA <span className="text-brand-green-600">SOSTENIBLE</span>
            </h1>
            <p className="text-[10px] font-black text-brand-gray-400 uppercase tracking-[0.4em] mt-3 bg-white px-4 py-1 rounded-full shadow-sm border border-brand-gray-100">Inteligencia Electoral Segura</p>
        </div>

        {/* LOGIN CARD */}
        <div className="card-friendly p-10 bg-white">
          <div className="mb-10">
              <h2 className="text-xl font-black text-brand-black">Acceso Maestro</h2>
              <p className="text-sm text-brand-gray-400 font-bold mt-1">Identifíquese para iniciar sesión</p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-8">
            <div className="space-y-2">
              <label className="text-[10px] font-black text-brand-gray-500 uppercase tracking-widest ml-1">Nombre de Usuario</label>
              <div className="relative group">
                <div className="absolute inset-y-0 left-5 flex items-center pointer-events-none">
                  <User className="h-5 w-5 text-brand-gray-300 group-focus-within:text-brand-black transition-colors" />
                </div>
                <input type="text" required className="block w-full pl-14 pr-5 py-4 bg-brand-gray-50 border-2 border-brand-gray-100 rounded-2xl focus:ring-0 focus:border-brand-black focus:bg-white text-brand-black font-bold transition-all outline-none" placeholder="Ej. Admin Sistemas" value={formData.fullName} onChange={(e) => setFormData({ ...formData, fullName: e.target.value })} />
              </div>
            </div>

            <div className="space-y-2">
              <label className="text-[10px] font-black text-brand-gray-500 uppercase tracking-widest ml-1">PIN de Seguridad</label>
              <div className="relative group">
                <div className="absolute inset-y-0 left-5 flex items-center pointer-events-none">
                  <Lock className="h-5 w-5 text-brand-gray-300 group-focus-within:text-brand-black transition-colors" />
                </div>
                <input type="password" inputMode="numeric" pattern="[0-9]*" required className="block w-full pl-14 pr-5 py-4 bg-brand-gray-50 border-2 border-brand-gray-100 rounded-2xl focus:ring-0 focus:border-brand-black focus:bg-white text-brand-black font-black text-2xl tracking-[0.6em] transition-all outline-none" placeholder="••••" value={formData.pin} onChange={(e) => setFormData({ ...formData, pin: e.target.value })} />
              </div>
            </div>

            <button type="submit" disabled={loading} className="btn-primary-friendly w-full h-[65px] text-sm uppercase tracking-[0.2em] shadow-2xl shadow-brand-black/20">
              {loading ? 'Verificando...' : 'Autenticar'}
            </button>

            <div className="text-center">
              <Link 
                href="/recovery" 
                className="text-[10px] font-black text-brand-gray-400 uppercase tracking-widest hover:text-brand-green-600 transition-colors"
              >
                ¿Olvidó sus credenciales? Recuperar Cuenta
              </Link>
            </div>
          </form>
        </div>
        
        <div className="flex items-center justify-center gap-6">
            <span className="h-px bg-brand-gray-200 flex-1" />
            <div className="text-[9px] font-black text-brand-gray-300 uppercase tracking-widest italic">Encrypted Connection</div>
            <span className="h-px bg-brand-gray-200 flex-1" />
        </div>
      </div>
    </div>
  );
}