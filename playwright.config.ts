import { defineConfig, devices } from "@playwright/test";

const localBrowser = process.env.CI ? {} : { channel: "chrome" as const };

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 2 : 0,
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
    command: "pnpm --filter web dev --hostname 127.0.0.1",
    url: "http://127.0.0.1:3000",
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
    env: {
      NEXT_PUBLIC_SUPABASE_URL: "http://127.0.0.1:3000/mock-supabase",
      NEXT_PUBLIC_SUPABASE_ANON_KEY: "e2e-anon-key",
    },
  },
});
