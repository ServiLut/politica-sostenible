import type {
  BillingCapabilities,
  BillingFeature,
} from "@/lib/billing-api";

export type PlanCapabilityStatus =
  | "checking"
  | "available"
  | "unavailable"
  | "error";

export interface PlanCapabilityView {
  enabled: boolean;
  planName: string | null;
  reason: string | null;
  status: PlanCapabilityStatus;
}

const FEATURE_LABELS: Record<BillingFeature, string> = {
  export: "la exportación de datos",
  import: "la importación masiva",
  mfa: "la autenticación de dos factores",
};

export function resolvePlanCapability(
  feature: BillingFeature,
  snapshot: BillingCapabilities | null,
  loading: boolean,
  error: string | null,
): PlanCapabilityView {
  if (loading) {
    return {
      enabled: false,
      planName: snapshot?.plan.name ?? null,
      reason: "Estamos validando las funciones incluidas en tu plan.",
      status: "checking",
    };
  }

  if (error || !snapshot) {
    return {
      enabled: false,
      planName: snapshot?.plan.name ?? null,
      reason:
        error ??
        "No fue posible comprobar las funciones del plan. Intenta nuevamente.",
      status: "error",
    };
  }

  if (!snapshot.features[feature]) {
    return {
      enabled: false,
      planName: snapshot.plan.name,
      reason: `El plan ${snapshot.plan.name} no incluye ${FEATURE_LABELS[feature]}.`,
      status: "unavailable",
    };
  }

  return {
    enabled: true,
    planName: snapshot.plan.name,
    reason: null,
    status: "available",
  };
}
