import { defineConfig, devices } from "@playwright/test";

const localBrowser = process.env.CI ? {} : { channel: "chrome" as const };

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  // A release gate must expose flakes instead of making them disappear on retry.
  retries: 0,
  reporter: [["list"], ["html", { open: "never" }]],
  use: {
    baseURL: "http://127.0.0.1:3000",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  projects: [
    {
      name: "desktop-chrome",
      use: { ...devices["Desktop Chrome"], ...localBrowser },
    },
    {
      name: "mobile-chrome",
      use: { ...devices["Pixel 7"], ...localBrowser },
    },
  ],
  webServer: {
    // Build and run the same standalone artifact topology used by Docker.
    // `next start` is intentionally unsupported when `output: "standalone"`.
    command: "pnpm --filter web build && node deploy/run-web-standalone.mjs",
    url: "http://127.0.0.1:3000",
    reuseExistingServer: process.env.PLAYWRIGHT_REUSE_SERVER === "true",
    timeout: 120_000,
    env: {
      HOSTNAME: "127.0.0.1",
      PORT: "3000",
      NEXT_TELEMETRY_DISABLED: "1",
      NEXT_PUBLIC_SUPABASE_URL: "http://127.0.0.1:3000/mock-supabase",
      NEXT_PUBLIC_SUPABASE_ANON_KEY: "e2e-anon-key",
    },
  },
});
