import { expect, test } from "@playwright/test";
import {
  billingStatusLabel,
  isBillingEntitledForDisplay,
  type BillingEntitlementSnapshot,
} from "./billing-entitlement";

const NOW = Date.parse("2026-09-07T12:00:00.000Z");

function subscription(
  overrides: Partial<BillingEntitlementSnapshot> = {},
): BillingEntitlementSnapshot {
  return {
    status: "ACTIVE",
    currentPeriodStart: "2026-09-01T00:00:00.000Z",
    currentPeriodEnd: "2026-10-01T00:00:00.000Z",
    trialEndsAt: null,
    plan: { isActive: true },
    ...overrides,
  };
}

test("solo presenta ACTIVE o TRIAL vigentes con un plan activo", () => {
  expect(isBillingEntitledForDisplay(subscription(), NOW)).toBe(true);
  expect(
    isBillingEntitledForDisplay(
      subscription({
        status: "TRIAL",
        trialEndsAt: "2026-09-15T00:00:00.000Z",
      }),
      NOW,
    ),
  ).toBe(true);
});

for (const status of ["CANCELLED", "EXPIRED", "PAST_DUE"]) {
  test(`no presenta ${status} como una suscripción activa`, () => {
    expect(isBillingEntitledForDisplay(subscription({ status }), NOW)).toBe(
      false,
    );
  });
}

test("falla cerrado ante plan inactivo, periodo vencido o prueba vencida", () => {
  expect(
    isBillingEntitledForDisplay(
      subscription({ plan: { isActive: false } }),
      NOW,
    ),
  ).toBe(false);
  expect(
    isBillingEntitledForDisplay(
      subscription({ currentPeriodEnd: "2026-09-07T12:00:00.000Z" }),
      NOW,
    ),
  ).toBe(false);
  expect(
    isBillingEntitledForDisplay(
      subscription({
        status: "TRIAL",
        trialEndsAt: "2026-09-07T12:00:00.000Z",
      }),
      NOW,
    ),
  ).toBe(false);
});

test("distingue visualmente un periodo de prueba de una suscripción activa", () => {
  expect(billingStatusLabel("TRIAL")).toBe("Periodo de prueba vigente");
  expect(billingStatusLabel("ACTIVE")).toBe("Activa");
  expect(billingStatusLabel("CANCELLED")).toBe("No habilitada");
});
