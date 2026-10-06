"use client";

import Link from "next/link";
import {
  ArrowRight,
  Check,
  CheckCircle2,
  ChevronDown,
  LoaderCircle,
} from "lucide-react";
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
          <LoaderCircle className="animate-spin" size={18} /> Consultando los
          primeros pasos…
        </div>
      </article>
    );
  }

  if (!briefing) {
    return (
      <article className="border border-slate-200 bg-white p-5 shadow-sm sm:p-7">
        <p className="py-6 text-sm text-slate-500">
          No pudimos consultar los primeros pasos. Actualiza esta pantalla para
          reintentar.
        </p>
      </article>
    );
  }

  const isCampaign = briefing.tenant.mode === "CAMPAIGN";
  const { ready, completedSteps, totalSteps, steps } = briefing.activation;
  const progress =
    totalSteps > 0 ? Math.round((completedSteps / totalSteps) * 100) : 0;

  function renderStep(step: ActivationStep) {
    const index = steps.indexOf(step);
    const guidance = getActivationStepGuidance(
      step.code,
      step.complete,
      user?.backendRole,
    );
    const content = (
      <>
        <span
          className={`grid place-items-center rounded-lg text-xs font-semibold ${
            step.complete
              ? "h-7 w-7 bg-slate-100 text-slate-600"
              : "h-8 w-8 border border-slate-300 text-slate-500"
          }`}
        >
          {step.complete ? <Check size={15} /> : index + 1}
        </span>
        <span className="min-w-0 [overflow-wrap:anywhere]">
          <span
            className={`block text-sm ${step.complete ? "font-medium text-slate-700" : "font-semibold text-slate-900"}`}
          >
            {step.title}
          </span>
          <span
            className={`mt-1 block text-slate-500 ${step.complete ? "text-xs leading-5" : "text-sm leading-6"}`}
          >
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
      <li key={step.code} className="border-b border-slate-100 last:border-0">
        {guidance.linkLabel ? (
          <Link
            href={step.href}
            className={`group grid min-w-0 grid-cols-[34px_minmax(0,1fr)] gap-x-3 gap-y-2 rounded-lg focus-ring ${step.complete ? "py-3" : "py-4"}`}
          >
            {content}
          </Link>
        ) : (
          <div
            className={`grid min-w-0 grid-cols-[34px_minmax(0,1fr)] gap-x-3 gap-y-2 ${step.complete ? "py-3" : "py-4"}`}
          >
            {content}
          </div>
        )}
      </li>
    );
  }

  return (
    <article
      className={`min-w-0 rounded-2xl border border-slate-200 bg-white ${ready ? "p-4" : "p-5 shadow-sm sm:p-6"}`}
    >
      {ready ? (
        <div className="flex min-w-0 items-start gap-2.5">
          <CheckCircle2
            aria-hidden="true"
            size={20}
            className={`mt-0.5 shrink-0 ${
              isCampaign ? "text-emerald-700" : "text-blue-700"
            }`}
          />
          <div className="min-w-0">
            <h2 className="text-sm font-semibold text-slate-900">
              Configuración inicial completa
            </h2>
            <p className="mt-1 text-sm leading-5 text-slate-600">
              Revisa el alistamiento antes de cambiar de etapa.
            </p>
          </div>
        </div>
      ) : (
        <>
          <div className="mb-4">
            <p
              className={`text-xs font-semibold ${
                isCampaign ? "text-emerald-700" : "text-blue-700"
              }`}
            >
              Primeros pasos
            </p>
            <h2 className="mt-1 text-lg font-semibold tracking-tight text-slate-950">
              {isCampaign ? "Prepara tu campaña" : "Prepara tu despacho"}
            </h2>
          </div>
          <div className="mb-4">
            <div className="mb-2 flex flex-wrap items-center justify-between gap-x-3 gap-y-1 text-sm">
              <span className="text-slate-600">Configuración inicial</span>
              <span className="font-semibold text-slate-900">
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
              aria-valuetext={`${completedSteps} de ${totalSteps} pasos completados`}
            >
              <div
                className={`h-full transition-all duration-500 motion-reduce:transition-none ${
                  isCampaign ? "bg-emerald-600" : "bg-blue-500"
                }`}
                style={{ width: `${progress}%` }}
              />
            </div>
          </div>

          <ul className="space-y-1">
            {steps.filter((step) => !step.complete).map(renderStep)}
          </ul>
        </>
      )}
      {steps.some((step) => step.complete) && (
        <details className="group mt-3 border-t border-slate-200 pt-1">
          <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-3 rounded-lg py-2 text-sm font-medium text-slate-600 focus-ring [&::-webkit-details-marker]:hidden">
            <span className="min-w-0">
              Ver pasos completados (
              {steps.filter((step) => step.complete).length})
            </span>
            <ChevronDown
              aria-hidden="true"
              size={18}
              className="shrink-0 transition-transform group-open:rotate-180 motion-reduce:transition-none"
            />
          </summary>
          <ul className="mt-1">
            {steps.filter((step) => step.complete).map(renderStep)}
          </ul>
        </details>
      )}
    </article>
  );
}
