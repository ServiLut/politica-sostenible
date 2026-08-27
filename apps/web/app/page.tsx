"use client";

import React from "react";
import Link from "next/link";
import { useAuth } from "@/context/auth";
import { getDefaultDashboardRoute } from "@/config/navigation";
import {
  Shield,
  MapPin,
  Eye,
  Zap,
  Lock,
  Database,
  CheckCircle2,
} from "lucide-react";

export default function LandingPage() {
  const { tenant, user, loading } = useAuth();

  const capabilities = [
    {
      title: "Dirección de campaña",
      description:
        "Prioridades, equipo, agenda, finanzas y cumplimiento desde un solo centro de mando.",
      icon: <Shield className="text-blue-500" size={40} />,
      color: "hover:border-blue-500",
    },
    {
      title: "Operación territorial",
      description:
        "Relacionamiento con consentimiento verificable, responsables y seguimiento en territorio.",
      icon: <MapPin className="text-emerald-500" size={40} />,
      color: "hover:border-emerald-500",
    },
    {
      title: "Control electoral",
      description:
        "Coordinación de testigos, incidentes y actas E-14 con trazabilidad de cada reporte.",
      icon: <Eye className="text-red-500" size={40} />,
      color: "hover:border-red-500",
    },
  ];

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-center p-6">
      <div className="max-w-4xl w-full space-y-12">
        {/* Logo & Header */}
        <div className="text-center space-y-4">
          <div className="inline-flex items-center gap-2 px-4 py-2 bg-blue-50 text-blue-700 rounded-full text-xs font-black uppercase tracking-widest border border-blue-100">
            <Zap size={14} fill="currentColor" /> Operación política responsable
          </div>
          <h1 className="text-5xl md:text-6xl font-black text-slate-900 tracking-tighter">
            Política Sostenible
          </h1>
          <p className="text-slate-500 text-lg max-w-xl mx-auto">
            Convierte territorio, equipo y cumplimiento en una operación
            coordinada, medible y respetuosa de los datos ciudadanos.
          </p>
        </div>

        {/* Platform capabilities */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {capabilities.map((capability) => (
            <div
              key={capability.title}
              className={`bg-white p-8 rounded-[2.5rem] border-2 border-slate-100 shadow-sm transition-all duration-300 transform hover:-translate-y-2 ${capability.color} group`}
            >
              <div className="mb-6 bg-slate-50 w-20 h-20 rounded-3xl flex items-center justify-center transition-transform group-hover:scale-110">
                {capability.icon}
              </div>
              <h3 className="text-2xl font-black text-slate-900 mb-2">
                {capability.title}
              </h3>
              <p className="text-slate-500 text-sm leading-relaxed">
                {capability.description}
              </p>
            </div>
          ))}
        </div>

        <div className="grid gap-3 rounded-3xl border border-slate-200 bg-white p-6 text-sm font-semibold text-slate-600 shadow-sm sm:grid-cols-3">
          <p className="flex items-center gap-2">
            <CheckCircle2 className="text-emerald-600" size={18} /> Campaña y
            ejercicio del cargo separados
          </p>
          <p className="flex items-center gap-2">
            <CheckCircle2 className="text-emerald-600" size={18} /> Datos
            aislados por organización
          </p>
          <p className="flex items-center gap-2">
            <CheckCircle2 className="text-emerald-600" size={18} /> Decisiones
            basadas en datos registrados
          </p>
        </div>

        <div className="flex flex-col items-center justify-center gap-4 sm:flex-row">
          {!loading && user && tenant ? (
            <Link
              href={getDefaultDashboardRoute(user, tenant)}
              className="rounded-2xl bg-blue-600 px-8 py-4 text-sm font-black text-white shadow-lg transition-colors hover:bg-blue-700"
            >
              Ir a mi panel
            </Link>
          ) : (
            <>
              <Link
                href="/iniciar-sesion"
                className="rounded-2xl bg-blue-600 px-8 py-4 text-sm font-black text-white shadow-lg transition-colors hover:bg-blue-700"
              >
                Iniciar sesión
              </Link>
              <Link
                href="/registro"
                className="rounded-2xl border-2 border-slate-200 bg-white px-8 py-4 text-sm font-black text-slate-900 transition-colors hover:border-blue-500"
              >
                Crear organización
              </Link>
            </>
          )}
        </div>

        {/* Footer Info */}
        <div className="pt-12 border-t border-slate-200 grid grid-cols-1 md:grid-cols-3 gap-8">
          <div className="flex items-center gap-3 text-slate-400">
            <Lock size={20} />
            <span className="text-xs font-bold uppercase tracking-widest">
              Acceso autenticado
            </span>
          </div>
          <div className="flex items-center gap-3 text-slate-400">
            <Database size={20} />
            <span className="text-xs font-bold uppercase tracking-widest">
              Aislamiento por organización
            </span>
          </div>
          <div className="flex items-center gap-4 text-right text-xs font-black text-slate-700 md:justify-end">
            <Link href="/privacidad" className="hover:text-blue-600">
              Privacidad
            </Link>
            <Link href="/terminos" className="hover:text-blue-600">
              Términos
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
