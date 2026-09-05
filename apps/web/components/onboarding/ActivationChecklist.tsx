import Link from "next/link";
import { ArrowRight, Check, CheckCircle2, LoaderCircle } from "lucide-react";

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
  if (loading && !briefing) {
    return (
      <article className="border border-slate-200 bg-white p-5 shadow-sm sm:p-7">
        <div className="flex items-center gap-3 py-8 text-sm text-slate-500">
          <LoaderCircle className="animate-spin" size={18} /> Cargando
          ruta…
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
    <article className="border border-slate-200 bg-white p-5 shadow-sm sm:p-7">
      <div className="mb-6">
        <p
          className={`text-[11px] font-black uppercase tracking-[0.18em] ${
            isCampaign ? "text-emerald-700" : "text-blue-700"
          }`}
        >
          Ruta de activación
        </p>
        <h2 className="mt-1 text-2xl font-black tracking-tight text-slate-950">
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
            ¡Operación activada!
          </h3>
          <p
            className={`mt-2 text-sm ${
              isCampaign ? "text-emerald-700" : "text-blue-700"
            }`}
          >
            Has completado todos los pasos de configuración inicial.
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
            <div className="h-2 w-full overflow-hidden rounded-full bg-slate-100">
              <div
                className={`h-full transition-all duration-500 ${
                  isCampaign ? "bg-emerald-500" : "bg-blue-500"
                }`}
                style={{ width: `${progress}%` }}
              />
            </div>
          </div>

          <div className="space-y-1">
            {steps.map((step, index) => (
              <Link
                key={step.code}
                href={step.href}
                className="group grid grid-cols-[34px_1fr_auto] gap-3 border-b border-slate-100 py-4 last:border-0"
              >
                <span
                  className={`grid h-8 w-8 place-items-center text-xs font-black ${
                    step.complete
                      ? isCampaign
                        ? "bg-emerald-600 text-white"
                        : "bg-blue-700 text-white"
                      : "border border-slate-300 text-slate-500"
                  }`}
                >
                  {step.complete ? <Check size={15} /> : index + 1}
                </span>
                <span>
                  <span className="block text-sm font-black text-slate-900">
                    {step.title}
                  </span>
                  <span className="mt-1 block text-xs leading-5 text-slate-500">
                    {step.detail}
                  </span>
                </span>
                <div className="flex items-center gap-2">
                  <span className="text-xs font-semibold text-slate-500 transition-colors group-hover:text-slate-900">
                    {step.complete ? "Completado" : "Configurar"}
                  </span>
                  <ArrowRight
                    className="text-slate-300 transition group-hover:translate-x-1 group-hover:text-slate-700"
                    size={16}
                  />
                </div>
              </Link>
            ))}
          </div>
        </>
      )}
    </article>
  );
}
