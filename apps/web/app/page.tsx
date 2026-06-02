"use client";

import React from 'react';
import Link from 'next/link';
import { useAuth } from '@/context/auth';
import { Zap, Lock, Database } from 'lucide-react';

export default function LandingPage() {
  const { user } = useAuth();

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-center p-6">
      <div className="max-w-4xl w-full space-y-12">
        {/* Logo & Header */}
        <div className="text-center space-y-4">
          <div className="inline-flex items-center gap-2 px-4 py-2 bg-blue-50 text-blue-700 rounded-full text-xs font-black uppercase tracking-widest border border-blue-100">
            <Zap size={14} fill="currentColor" /> SaaS Político Enterprise 2026
          </div>
          <h1 className="text-5xl md:text-6xl font-black text-slate-900 tracking-tighter">
            Politica Sostenible <span className="text-blue-600">CRM</span>
          </h1>
          <p className="text-slate-500 text-lg max-w-xl mx-auto">
            Plataforma integral para la victoria electoral. Soberanía del dato y control total de la operación política.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <Link
            href={user ? '/dashboard/executive' : '/iniciar-sesion'}
            className="bg-white p-8 rounded-[2.5rem] border-2 border-slate-100 shadow-sm transition-all duration-300 transform hover:-translate-y-2 hover:border-blue-500 group"
          >
            <h3 className="text-2xl font-black text-slate-900 mb-2">Entrar al CRM</h3>
            <p className="text-slate-500 text-sm mb-8 leading-relaxed">
              Acceso seguro con autenticación JWT y aislamiento por tenant.
            </p>
            <div className="w-full py-4 rounded-2xl text-white text-center font-black text-sm transition-all shadow-lg active:scale-95 bg-blue-600 hover:bg-blue-700">
              {user ? 'Ir al panel' : 'Iniciar sesión'}
            </div>
          </Link>
          <Link
            href="/registro"
            className="bg-white p-8 rounded-[2.5rem] border-2 border-slate-100 shadow-sm transition-all duration-300 transform hover:-translate-y-2 hover:border-emerald-500 group"
          >
            <h3 className="text-2xl font-black text-slate-900 mb-2">Crear campaña</h3>
            <p className="text-slate-500 text-sm mb-8 leading-relaxed">
              Registra tu equipo y empieza operación territorial y financiera.
            </p>
            <div className="w-full py-4 rounded-2xl text-white text-center font-black text-sm transition-all shadow-lg active:scale-95 bg-emerald-600 hover:bg-emerald-700">
              Registrarme
            </div>
          </Link>
        </div>

        {/* Footer Info */}
        <div className="pt-12 border-t border-slate-200 grid grid-cols-1 md:grid-cols-3 gap-8">
          <div className="flex items-center gap-3 text-slate-400">
            <Lock size={20} />
            <span className="text-xs font-bold uppercase tracking-widest">Seguridad CNE-Ready</span>
          </div>
          <div className="flex items-center gap-3 text-slate-400">
            <Database size={20} />
            <span className="text-xs font-bold uppercase tracking-widest">Soberanía de Datos</span>
          </div>
          <div className="flex items-center gap-3 text-slate-400 text-right justify-end">
            <span className="text-xs font-black text-slate-900">COLOMBIA 2026 v1.0</span>
          </div>
        </div>
      </div>
    </div>
  );
}
