import { ApiError, apiRequest } from "@/lib/api-client";

export const BILLING_FEATURES = ["export", "import", "mfa"] as const;

export type BillingFeature = (typeof BILLING_FEATURES)[number];

export interface BillingCapabilities {
  plan: {
    code: string;
    name: string;
  };
  features: Record<BillingFeature, boolean>;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function hasOnlyKeys(value: Record<string, unknown>, keys: string[]): boolean {
  const allowed = new Set(keys);
  return Object.keys(value).every((key) => allowed.has(key));
}

export function isBillingCapabilities(
  value: unknown,
): value is BillingCapabilities {
  if (!isRecord(value) || !isRecord(value.plan) || !isRecord(value.features)) {
    return false;
  }
  const plan = value.plan;
  const features = value.features;

  return (
    hasOnlyKeys(value, ["plan", "features"]) &&
    hasOnlyKeys(plan, ["code", "name"]) &&
    hasOnlyKeys(features, [...BILLING_FEATURES]) &&
    typeof plan.code === "string" &&
    plan.code.trim().length > 0 &&
    typeof plan.name === "string" &&
    plan.name.trim().length > 0 &&
    BILLING_FEATURES.every(
      (feature) => typeof features[feature] === "boolean",
    )
  );
}

export async function getBillingCapabilities(
  signal?: AbortSignal,
): Promise<BillingCapabilities> {
  const response = await apiRequest<unknown>("billing/capabilities", {
    method: "GET",
    signal,
  });

  if (!isBillingCapabilities(response)) {
    throw new ApiError(
      "El servidor devolvió una configuración de plan no válida.",
      502,
      response,
    );
  }

  return response;
}
