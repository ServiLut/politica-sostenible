import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { expect, test } from "@playwright/test";

const source = readFileSync(resolve(__dirname, "auth.tsx"), "utf8");

test("el snapshot sigue al JWT, se puede recargar y cancela solicitudes obsoletas", () => {
  expect(source).toContain("getBillingCapabilities(controller.signal)");
  expect(source).toContain(
    "!session?.accessToken || session.user.mustChangePassword === true",
  );
  expect(source).toContain(
    "session?.user.mustChangePassword,\n    planCapabilitiesRevision",
  );
  expect(source).toContain("return () => controller.abort();");
  expect(source).toContain("setPlanCapabilities(null)");
  expect(source).toContain("setPlanCapabilitiesRevision((revision) => revision + 1)");
});

test("el hook deriva un estado fail-closed compartido por las acciones", () => {
  expect(source).toContain("export function usePlanCapability(");
  expect(source).toContain("resolvePlanCapability(");
  expect(source).toContain("planCapabilitiesLoading");
  expect(source).toContain("planCapabilitiesError");
  expect(source).toContain("refresh: refreshPlanCapabilities");
});
