import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./apps/web",
  testMatch: "**/*.unit.spec.ts",
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  reporter: "list",
});
