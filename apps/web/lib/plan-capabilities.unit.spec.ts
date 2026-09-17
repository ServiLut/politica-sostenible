import { expect, test } from "@playwright/test";
import type { BillingCapabilities } from "./billing-api";
import { resolvePlanCapability } from "./plan-capabilities";

const snapshot: BillingCapabilities = {
  plan: { code: "STARTER", name: "Inicial" },
  features: { export: true, import: false, mfa: false },
};

test("habilita solo las funciones confirmadas por el servidor", () => {
  expect(resolvePlanCapability("export", snapshot, false, null)).toEqual({
    enabled: true,
    planName: "Inicial",
    reason: null,
    status: "available",
  });

  expect(resolvePlanCapability("import", snapshot, false, null)).toEqual({
    enabled: false,
    planName: "Inicial",
    reason: "El plan Inicial no incluye la importación masiva.",
    status: "unavailable",
  });
});

test("falla cerrado mientras valida o ante un error", () => {
  expect(resolvePlanCapability("mfa", snapshot, true, null)).toMatchObject({
    enabled: false,
    status: "checking",
  });
  expect(
    resolvePlanCapability(
      "mfa",
      snapshot,
      false,
      "No fue posible validar el plan.",
    ),
  ).toMatchObject({
    enabled: false,
    reason: "No fue posible validar el plan.",
    status: "error",
  });
  expect(resolvePlanCapability("mfa", null, false, null)).toMatchObject({
    enabled: false,
    status: "error",
  });
});
