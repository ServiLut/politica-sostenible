"use client";

import React from 'react';
import { useAuth } from '@/context/auth';
import { UserRole } from '@/types/saas-schema';
import { Shield, MapPin, Eye, Zap, Lock, Database } from 'lucide-react';

export default function LandingPage() {
  const { loginAs } = useAuth();

  const demoRoles = [
    {
      role: UserRole.AdminCampana,
      title: 'Admin Campaña',
      description: 'Acceso total: Finanzas, Estrategia, CRM y Control Territorial.',
      icon: <Shield className="text-blue-500" size={40} />,
      color: 'hover:border-blue-500',
      btnColor: 'bg-blue-600 hover:bg-blue-700'
    },
    {
      role: UserRole.Lider,
      title: 'Líder Territorial',
      description: 'Gestión de bases, misiones en barrio y reporte de simpatizantes.',
      icon: <MapPin className="text-emerald-500" size={40} />,
      color: 'hover:border-emerald-500',
      btnColor: 'bg-emerald-600 hover:bg-emerald-700'
    },
    {
      role: UserRole.Testigo,
      title: 'Testigo Día D',
      description: 'Módulo de escrutinio, reporte de E14 y alertas de fraude.',
      icon: <Eye className="text-red-500" size={40} />,
      color: 'hover:border-red-500',
      btnColor: 'bg-red-600 hover:bg-red-700'
    }
  ];

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

        {/* Demo Access Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {demoRoles.map((demo) => (
            <div 
              key={demo.role}
              className={`bg-white p-8 rounded-[2.5rem] border-2 border-slate-100 shadow-sm transition-all duration-300 transform hover:-translate-y-2 ${demo.color} group`}
            >
              <div className="mb-6 bg-slate-50 w-20 h-20 rounded-3xl flex items-center justify-center transition-transform group-hover:scale-110">
                {demo.icon}
              </div>
              <h3 className="text-2xl font-black text-slate-900 mb-2">{demo.title}</h3>
              <p className="text-slate-500 text-sm mb-8 leading-relaxed">
                {demo.description}
              </p>
              <button 
                onClick={() => loginAs(demo.role)}
                className={`w-full py-4 rounded-2xl text-white font-black text-sm transition-all shadow-lg active:scale-95 ${demo.btnColor}`}
              >
                Acceder como {demo.title.split(' ')[0]}
              </button>
            </div>
          ))}
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
