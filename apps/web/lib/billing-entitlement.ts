export interface BillingEntitlementSnapshot {
  status: string;
  currentPeriodStart: string;
  currentPeriodEnd: string;
  trialEndsAt: string | null;
  plan: {
    isActive: boolean;
  };
}

function timestamp(value: string): number | null {
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : null;
}

/**
 * Presentation-level fail-closed check. The API remains authoritative, but a
 * stale or incompatible response must never be labelled as an active plan.
 */
export function isBillingEntitledForDisplay(
  subscription: BillingEntitlementSnapshot,
  now = Date.now(),
): boolean {
  const periodStart = timestamp(subscription.currentPeriodStart);
  const periodEnd = timestamp(subscription.currentPeriodEnd);

  if (
    !subscription.plan.isActive ||
    periodStart === null ||
    periodEnd === null ||
    periodStart > periodEnd ||
    periodStart > now ||
    periodEnd <= now
  ) {
    return false;
  }

  if (subscription.status === "TRIAL") {
    if (!subscription.trialEndsAt) return false;
    const trialEndsAt = timestamp(subscription.trialEndsAt);
    return trialEndsAt !== null && trialEndsAt > now;
  }

  return subscription.status === "ACTIVE";
}

export function billingStatusLabel(
  status: BillingEntitlementSnapshot["status"],
): string {
  if (status === "TRIAL") return "Periodo de prueba vigente";
  if (status === "ACTIVE") return "Activa";
  return "No habilitada";
}
