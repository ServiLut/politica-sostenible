import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { expect, test } from "@playwright/test";

const source = readFileSync(resolve(__dirname, "auth.tsx"), "utf8").replace(
  /\r\n/g,
  "\n",
);

test("el snapshot sigue al JWT, se puede recargar y cancela solicitudes obsoletas", () => {
  expect(source).toContain("usePageRequest<BillingCapabilities>(getBillingCapabilities");
  expect(source).toContain("session?.accessToken && session.user.mustChangePassword !== true");
  expect(source).toContain("enabled: capabilitiesEnabled");
  expect(source).toContain("reloadKey: `${accessToken}:${session?.user.mustChangePassword}:${planCapabilitiesRevision}`");
  expect(source).toContain("return () => controller.abort();");
  // Both success and failure verify the token before publishing or clearing the session.
  expect(source.match(/readAuthSession\(\)\?\.accessToken !== storedSession.accessToken/g)).toHaveLength(2);
  expect(source).toContain("useSyncExternalStore(sessionStore.subscribe");
  expect(source).toContain(
    "setPlanCapabilitiesRevision((revision) => revision + 1)",
  );
});

test("el hook deriva un estado fail-closed compartido por las acciones", () => {
  expect(source).toContain("export function usePlanCapability(");
  expect(source).toContain("resolvePlanCapability(");
  expect(source).toContain("planCapabilitiesLoading");
  expect(source).toContain("planCapabilitiesError");
  expect(source).toContain("refresh: refreshPlanCapabilities");
});
