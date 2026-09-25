"use client";

import Link from "next/link";
import { ArrowRight, Check, CheckCircle2, LoaderCircle } from "lucide-react";
import { useAuth } from "@/context/auth";
import { getActivationStepGuidance } from "@/lib/role-action-guidance";

export interface ActivationStep {
  code: string;
  title: string;
  detail: string;
  href: string;
  complete: boolean;
}

export interface ActivationBriefing {
  tenant: {
    mode: "CAMPAIGN" | "PUBLIC_OFFICE";
  };
  activation: {
    ready: boolean;
    completedSteps: number;
    totalSteps: number;
    steps: ActivationStep[];
  };
}

export interface ActivationChecklistProps {
  briefing: ActivationBriefing | null;
  loading?: boolean;
}

export function ActivationChecklist({
  briefing,
  loading,
}: ActivationChecklistProps) {
  const { user } = useAuth();

  if (loading && !briefing) {
    return (
      <article className="border border-slate-200 bg-white p-5 shadow-sm sm:p-7">
        <div className="flex items-center gap-3 py-8 text-sm text-slate-500">
          <LoaderCircle className="animate-spin" size={18} /> Cargando ruta…
        </div>
      </article>
    );
  }

  if (!briefing) {
    return (
      <article className="border border-slate-200 bg-white p-5 shadow-sm sm:p-7">
        <p className="py-6 text-sm text-slate-500">
          La ruta de activación no está disponible. Reintenta la consulta.
        </p>
      </article>
    );
  }

  const isCampaign = briefing.tenant.mode === "CAMPAIGN";
  const { ready, completedSteps, totalSteps, steps } = briefing.activation;
  const progress =
    totalSteps > 0 ? Math.round((completedSteps / totalSteps) * 100) : 0;

  return (
    <article className="min-w-0 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
      <div className="mb-6">
        <p
          className={`text-xs font-semibold ${
            isCampaign ? "text-emerald-700" : "text-blue-700"
          }`}
        >
          Ruta de activación
        </p>
        <h2 className="mt-1 text-xl font-semibold tracking-tight text-slate-950">
          {isCampaign
            ? "De cero a una operación útil"
            : "Del primer caso a la rendición"}
        </h2>
      </div>

      {ready ? (
        <div
          className={`rounded-lg border p-6 text-center ${
            isCampaign
              ? "border-emerald-100 bg-emerald-50"
              : "border-blue-100 bg-blue-50"
          }`}
        >
          <CheckCircle2
            className={`mx-auto mb-3 h-12 w-12 ${
              isCampaign ? "text-emerald-600" : "text-blue-600"
            }`}
          />
          <h3
            className={`text-lg font-black ${
              isCampaign ? "text-emerald-950" : "text-blue-950"
            }`}
          >
            Configuración inicial completa
          </h3>
          <p
            className={`mt-2 text-sm ${
              isCampaign ? "text-emerald-700" : "text-blue-700"
            }`}
          >
            Los controles iniciales medidos están completos. Revisa el
            alistamiento antes de cambiar de etapa.
          </p>
        </div>
      ) : (
        <>
          <div className="mb-6">
            <div className="mb-2 flex justify-between text-sm">
              <span className="font-semibold text-slate-700">Progreso</span>
              <span className="font-bold text-slate-900">
                {completedSteps} de {totalSteps} pasos
              </span>
            </div>
            <div
              className="h-2 w-full overflow-hidden rounded-full bg-slate-100"
              role="progressbar"
              aria-label="Progreso de activación"
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={progress}
            >
              <div
                className={`h-full transition-all duration-500 ${
                  isCampaign ? "bg-emerald-500" : "bg-blue-500"
                }`}
                style={{ width: `${progress}%` }}
              />
            </div>
          </div>

          <ul className="space-y-1">
            {steps.map((step, index) => {
              const guidance = getActivationStepGuidance(
                step.code,
                step.complete,
                user?.backendRole,
              );
              const content = (
                <>
                  <span
                    className={`grid h-8 w-8 place-items-center rounded-lg text-xs font-semibold ${
                      step.complete
                        ? isCampaign
                          ? "bg-emerald-600 text-white"
                          : "bg-blue-700 text-white"
                        : "border border-slate-300 text-slate-500"
                    }`}
                  >
                    {step.complete ? <Check size={15} /> : index + 1}
                  </span>
                  <span className="min-w-0 [overflow-wrap:anywhere]">
                    <span className="block text-sm font-semibold text-slate-900">
                      {step.title}
                    </span>
                    <span className="mt-1 block text-sm leading-6 text-slate-500">
                      {step.detail}
                    </span>
                  </span>
                  {guidance.linkLabel ? (
                    <div className="col-start-2 flex min-w-0 items-center gap-2">
                      <span className="text-xs font-semibold text-slate-500 transition-colors group-hover:text-slate-900">
                        {step.complete ? "Completado · " : ""}
                        {guidance.linkLabel}
                      </span>
                      <ArrowRight
                        aria-hidden="true"
                        className="text-slate-300 transition group-hover:translate-x-1 group-hover:text-slate-700"
                        size={16}
                      />
                    </div>
                  ) : (
                    <span className="col-start-2 text-xs font-medium leading-5 text-amber-800">
                      {guidance.advice}
                    </span>
                  )}
                </>
              );

              return (
                <li
                  key={step.code}
                  className="border-b border-slate-100 last:border-0"
                >
                  {guidance.linkLabel ? (
                    <Link
                      href={step.href}
                      className="group grid min-w-0 grid-cols-[34px_minmax(0,1fr)] gap-x-3 gap-y-2 rounded-lg py-4 focus-ring"
                    >
                      {content}
                    </Link>
                  ) : (
                    <div className="grid min-w-0 grid-cols-[34px_minmax(0,1fr)] gap-x-3 gap-y-2 py-4">
                      {content}
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        </>
      )}
    </article>
  );
}
