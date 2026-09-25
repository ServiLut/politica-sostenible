import { defineConfig, devices } from "@playwright/test";

// This configuration never starts local services or imports the mocked suite.
// An operator must explicitly enable it and provide the dedicated role accounts.
if (
  process.env.POLITICA_PRODUCTION_ROLE_AUDIT_CONFIRM !==
  "READ_ONLY_PRODUCTION_ROLE_AUDIT"
) {
  throw new Error(
    "La auditoría de producción requiere confirmación explícita READ_ONLY_PRODUCTION_ROLE_AUDIT.",
  );
}

const target = new URL(
  process.env.POLITICA_PRODUCTION_ROLE_AUDIT_BASE_URL ?? "",
);
if (
  target.protocol !== "https:" ||
  target.username ||
  target.password ||
  target.search ||
  target.hash ||
  target.pathname !== "/"
) {
  throw new Error(
    "La auditoría requiere un origen HTTPS sin credenciales, ruta, query ni fragmento.",
  );
}

export default defineConfig({
  testDir: "./e2e-production",
  testMatch: "**/*.production.spec.ts",
  fullyParallel: false,
  workers: 1,
  retries: 0,
  forbidOnly: true,
  timeout: 120_000,
  reporter: "list",
  preserveOutput: "never",
  outputDir: ".artifacts/production-role-audit",
  use: {
    ...devices["Desktop Chrome"],
    baseURL: target.origin,
    storageState: { cookies: [], origins: [] },
    serviceWorkers: "block",
    ignoreHTTPSErrors: false,
    trace: "off",
    screenshot: "off",
    video: "off",
  },
});
