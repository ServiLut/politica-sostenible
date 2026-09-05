"use client";

import { useEffect, useState, useCallback } from "react";
import { apiRequest } from "@/lib/api-client";
import {
  CreditCard,
  Users,
  CheckCircle2,
  AlertCircle,
  Loader2,
  HardDrive
} from "lucide-react";

export default function BillingPage() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [subscription, setSubscription] = useState<any>(null);
  const [usage, setUsage] = useState<any>(null);

  const loadData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [subRes, usageRes] = await Promise.all([
        apiRequest("/billing/subscription"),
        apiRequest("/billing/usage")
      ]);
      setSubscription(subRes);
      setUsage(usageRes);
    } catch (err: any) {
      setError(err.message || "Error al cargar la información de facturación");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const formatCop = (value: number) => {
    return new Intl.NumberFormat("es-CO", {
      style: "currency",
      currency: "COP",
      maximumFractionDigits: 0
    }).format(value);
  };

  const getPercentage = (current: number, limit: number) => {
    if (limit === 0) return 100;
    return Math.min(100, Math.round((current / limit) * 100));
  };

  if (loading) {
    return (
      <div className="mx-auto max-w-5xl space-y-7">
        <div className="flex items-center gap-3 rounded-[2rem] border border-slate-200 bg-white p-8 text-sm font-semibold text-slate-600">
          <Loader2 className="animate-spin" size={20} />
          Cargando información de facturación...
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="mx-auto max-w-5xl space-y-7">
        <div className="flex items-start gap-3 rounded-2xl border border-red-200 bg-red-50 p-5 text-sm font-semibold text-red-900">
          <AlertCircle size={20} /> {error}
        </div>
      </div>
    );
  }

  const plan = subscription?.plan;

  return (
    <div className="mx-auto max-w-5xl space-y-7">
      <header className="overflow-hidden rounded-[2rem] bg-slate-950 px-6 py-8 text-white shadow-xl sm:px-9">
        <div className="flex flex-col gap-5 md:flex-row md:items-end md:justify-between">
          <div className="max-w-2xl">
            <span className="inline-flex items-center gap-2 rounded-full bg-blue-400/15 px-3 py-1 text-[10px] font-black uppercase tracking-[0.18em] text-blue-300">
              <CreditCard size={14} /> Suscripción
            </span>
            <h1 className="mt-4 text-3xl font-black tracking-tight sm:text-4xl">
              Plan y facturación
            </h1>
            <p className="mt-3 max-w-2xl text-sm leading-6 text-slate-300">
              Administra tu plan actual, revisa los límites de uso de tu organización y contacta a ventas para mejoras.
            </p>
          </div>
          <a
            href="mailto:ventas@abogadosencolombiasas.com"
            className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-white px-4 text-xs font-black uppercase tracking-wider text-slate-950"
          >
            Contactar ventas para cambiar de plan
          </a>
        </div>
      </header>

      <div className="grid gap-6 lg:grid-cols-2">
        <div className="space-y-5 rounded-[2rem] border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
          <div>
            <h2 className="text-xl font-black text-slate-950">Plan actual</h2>
            <p className="mt-2 text-sm leading-6 text-slate-600">
              Detalles de tu suscripción activa.
            </p>
          </div>
          <div className="rounded-2xl bg-slate-50 p-6 border border-slate-100">
            <h3 className="text-2xl font-black text-slate-900">{plan?.name}</h3>
            <p className="mt-2 text-sm text-slate-600">{plan?.description}</p>
            <div className="mt-4 text-3xl font-black text-slate-900">
              {plan ? formatCop(plan.monthlyPriceCop) : "$0"}
              <span className="text-sm font-medium text-slate-500"> / mes</span>
            </div>
          </div>
          
          <ul className="space-y-3 text-sm font-medium text-slate-700">
            {plan?.includesExport && (
              <li className="flex items-center gap-3">
                <CheckCircle2 className="text-emerald-500" size={18} /> Exportación de datos
              </li>
            )}
            {plan?.includesMfa && (
              <li className="flex items-center gap-3">
                <CheckCircle2 className="text-emerald-500" size={18} /> Autenticación de dos factores (MFA)
              </li>
            )}
            {plan?.includesApi && (
              <li className="flex items-center gap-3">
                <CheckCircle2 className="text-emerald-500" size={18} /> Acceso a API
              </li>
            )}
          </ul>
        </div>

        <div className="space-y-5 rounded-[2rem] border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
          <div>
            <h2 className="text-xl font-black text-slate-950">Uso de recursos</h2>
            <p className="mt-2 text-sm leading-6 text-slate-600">
              Monitorea el consumo actual frente a los límites de tu plan.
            </p>
          </div>
          
          {usage && (
            <div className="space-y-6">
              <div>
                <div className="mb-2 flex items-center justify-between text-sm font-semibold">
                  <span className="flex items-center gap-2 text-slate-700"><Users size={16} /> Usuarios</span>
                  <span className="text-slate-900">{usage.current.users} / {usage.limits.users}</span>
                </div>
                <div className="h-2 w-full overflow-hidden rounded-full bg-slate-100">
                  <div 
                    className="h-full bg-blue-500" 
                    style={{ width: `${getPercentage(usage.current.users, usage.limits.users)}%` }}
                  />
                </div>
              </div>

              <div>
                <div className="mb-2 flex items-center justify-between text-sm font-semibold">
                  <span className="flex items-center gap-2 text-slate-700"><Users size={16} /> Votantes</span>
                  <span className="text-slate-900">{usage.current.voters} / {usage.limits.voters}</span>
                </div>
                <div className="h-2 w-full overflow-hidden rounded-full bg-slate-100">
                  <div 
                    className="h-full bg-emerald-500" 
                    style={{ width: `${getPercentage(usage.current.voters, usage.limits.voters)}%` }}
                  />
                </div>
              </div>

              <div>
                <div className="mb-2 flex items-center justify-between text-sm font-semibold">
                  <span className="flex items-center gap-2 text-slate-700"><HardDrive size={16} /> Almacenamiento (MB)</span>
                  <span className="text-slate-900">{usage.current.storageMb} / {usage.limits.storageMb}</span>
                </div>
                <div className="h-2 w-full overflow-hidden rounded-full bg-slate-100">
                  <div 
                    className="h-full bg-amber-500" 
                    style={{ width: `${getPercentage(usage.current.storageMb, usage.limits.storageMb)}%` }}
                  />
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
