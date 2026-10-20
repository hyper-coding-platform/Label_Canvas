import { defineConfig, devices } from "@playwright/test";

/**
 * Browser tests against the Next.js App Router example running as a
 * PRODUCTION server with the PACKED package installed (`npm run test:pack` first).
 */
export default defineConfig({
  testDir: "tests/nextjs",
  timeout: 45_000,
  workers: 1,
  reporter: [["list"]],
  use: { baseURL: "http://localhost:3100", trace: "retain-on-failure" },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    command: "npm --prefix examples/nextjs-app run start",
    url: "http://localhost:3100",
    reuseExistingServer: false,
    timeout: 120_000,
    env: { NEXT_TELEMETRY_DISABLED: "1" },
  },
});
