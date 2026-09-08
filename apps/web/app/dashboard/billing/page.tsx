"use client";

import { useEffect, useState, useCallback } from "react";
import { ApiError, apiRequest } from "@/lib/api-client";
import {
  billingStatusLabel,
  isBillingEntitledForDisplay,
  type BillingEntitlementSnapshot,
} from "@/lib/billing-entitlement";
import {
  Users,
  CheckCircle2,
  AlertCircle,
  Loader2,
  HardDrive,
} from "lucide-react";

interface BillingPlan {
  name: string;
  description: string;
  monthlyPriceCop: number | string;
  includesExport: boolean;
  includesImport: boolean;
  includesMfa: boolean;
  isActive: boolean;
}

interface BillingSubscription extends BillingEntitlementSnapshot {
  plan: BillingPlan;
}

interface BillingUsageValues {
  users: number;
  voters: number;
  storageMb: number;
}

interface BillingUsage {
  limits: BillingUsageValues;
  current: BillingUsageValues;
}

function readableError(error: unknown): string {
  if (error instanceof ApiError) return error.message;
  if (error instanceof Error && error.message) return error.message;
  return "Error al cargar la información del plan y uso";
}

export default function BillingPage() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [subscription, setSubscription] = useState<BillingSubscription | null>(
    null,
  );
  const [usage, setUsage] = useState<BillingUsage | null>(null);

  const loadData = useCallback(async () => {
    setLoading(true);
    setError(null);
    setSubscription(null);
    setUsage(null);
    try {
      const [subRes, usageRes] = await Promise.all([
        apiRequest<BillingSubscription>("/billing/subscription"),
        apiRequest<BillingUsage>("/billing/usage"),
      ]);
      if (!isBillingEntitledForDisplay(subRes)) {
        throw new Error(
          "La API no confirmó una suscripción vigente para esta organización.",
        );
      }
      setSubscription(subRes);
      setUsage(usageRes);
    } catch (requestError: unknown) {
      setError(readableError(requestError));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const formatCop = (value: number | string) => {
    const numericValue = typeof value === "number" ? value : Number(value);
    if (!Number.isFinite(numericValue)) return "$0";

    return new Intl.NumberFormat("es-CO", {
      style: "currency",
      currency: "COP",
      maximumFractionDigits: 0,
    }).format(numericValue);
  };

  const getPercentage = (current: number, limit: number) => {
    if (limit === 0) return 100;
    return Math.min(100, Math.round((current / limit) * 100));
  };

  if (loading) {
    return (
      <div className="mx-auto max-w-5xl space-y-7">
        <div className="flex items-center justify-center gap-3 rounded-2xl border border-slate-200 bg-white p-8 text-sm font-semibold text-slate-600">
          <Loader2 className="animate-spin text-slate-400" size={24} />
          Cargando información del plan y uso...
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="mx-auto max-w-5xl space-y-7">
        <div
          role="alert"
          className="flex items-start gap-3 rounded-2xl border border-red-200 bg-red-50 p-5 text-sm font-semibold text-red-900"
        >
          <AlertCircle className="mt-0.5 shrink-0" size={20} />
          <div>
            <p>{error}</p>
            <button
              type="button"
              onClick={() => void loadData()}
              className="mt-4 min-h-10 rounded-xl bg-red-900 px-4 text-sm font-bold text-white transition hover:bg-red-800"
            >
              Reintentar
            </button>
          </div>
        </div>
      </div>
    );
  }

  const plan = subscription?.plan;
  const statusLabel = subscription
    ? billingStatusLabel(subscription.status)
    : null;

  return (
    <div className="mx-auto max-w-5xl space-y-7">
      <header className="flex flex-col gap-5 md:flex-row md:items-end md:justify-between">
        <div>
          <h1 className="text-3xl font-black tracking-tight text-slate-900 sm:text-4xl">
            Plan y uso
          </h1>
          <p className="mt-2 text-base text-slate-500">
            Consulta tu plan actual y revisa los límites de uso de tu
            organización.
          </p>
        </div>
        <a
          href="mailto:ventas@abogadosencolombiasas.com"
          className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-blue-700 px-5 text-sm font-bold text-white hover:bg-blue-800"
        >
          Contactar ventas
        </a>
      </header>

      <div className="grid gap-6 lg:grid-cols-2">
        <div className="space-y-5 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <div>
            <h2 className="text-xl font-black text-slate-900">Plan actual</h2>
            <p className="mt-2 text-sm leading-6 text-slate-600">
              Detalles del plan autorizado para el periodo vigente.
            </p>
          </div>
          <div className="rounded-2xl bg-slate-50 p-6 border border-slate-100">
            <h3 className="text-2xl font-black text-slate-900">{plan?.name}</h3>
            {statusLabel && (
              <p className="mt-2 inline-flex rounded-full bg-emerald-100 px-3 py-1 text-xs font-bold text-emerald-800">
                {statusLabel}
              </p>
            )}
            <p className="mt-2 text-sm text-slate-600">{plan?.description}</p>
            <div className="mt-4 text-3xl font-black text-slate-900">
              {plan ? formatCop(plan.monthlyPriceCop) : "$0"}
              <span className="text-sm font-medium text-slate-500"> / mes</span>
            </div>
          </div>

          <ul className="space-y-3 text-sm font-medium text-slate-700">
            {plan?.includesExport && (
              <li className="flex items-center gap-3">
                <CheckCircle2 className="text-emerald-500" size={18} />{" "}
                Exportación de datos
              </li>
            )}
            {plan?.includesMfa && (
              <li className="flex items-center gap-3">
                <CheckCircle2 className="text-emerald-500" size={18} />{" "}
                Autenticación de dos factores (MFA)
              </li>
            )}
            {plan?.includesImport && (
              <li className="flex items-center gap-3">
                <CheckCircle2 className="text-emerald-500" size={18} />{" "}
                Importación segura de personas
              </li>
            )}
          </ul>
        </div>

        <div className="space-y-5 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <div>
            <h2 className="text-xl font-black text-slate-900">
              Uso de recursos
            </h2>
            <p className="mt-2 text-sm leading-6 text-slate-600">
              Monitorea el consumo actual frente a los límites de tu plan.
            </p>
          </div>

          {usage && (
            <div className="space-y-6">
              <div>
                <div className="mb-2 flex items-center justify-between text-sm font-semibold">
                  <span className="flex items-center gap-2 text-slate-700">
                    <Users size={16} /> Usuarios
                  </span>
                  <span className="text-slate-900">
                    {usage.current.users} / {usage.limits.users}
                  </span>
                </div>
                <div className="h-2 w-full overflow-hidden rounded-full bg-slate-100">
                  <div
                    className="h-full bg-blue-500"
                    style={{
                      width: `${getPercentage(usage.current.users, usage.limits.users)}%`,
                    }}
                  />
                </div>
              </div>

              <div>
                <div className="mb-2 flex items-center justify-between text-sm font-semibold">
                  <span className="flex items-center gap-2 text-slate-700">
                    <Users size={16} /> Votantes
                  </span>
                  <span className="text-slate-900">
                    {usage.current.voters} / {usage.limits.voters}
                  </span>
                </div>
                <div className="h-2 w-full overflow-hidden rounded-full bg-slate-100">
                  <div
                    className="h-full bg-emerald-500"
                    style={{
                      width: `${getPercentage(usage.current.voters, usage.limits.voters)}%`,
                    }}
                  />
                </div>
              </div>

              <div>
                <div className="mb-2 flex items-center justify-between text-sm font-semibold">
                  <span className="flex items-center gap-2 text-slate-700">
                    <HardDrive size={16} /> Almacenamiento (MB)
                  </span>
                  <span className="text-slate-900">
                    {usage.current.storageMb} / {usage.limits.storageMb}
                  </span>
                </div>
                <div className="h-2 w-full overflow-hidden rounded-full bg-slate-100">
                  <div
                    className="h-full bg-amber-500"
                    style={{
                      width: `${getPercentage(usage.current.storageMb, usage.limits.storageMb)}%`,
                    }}
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
