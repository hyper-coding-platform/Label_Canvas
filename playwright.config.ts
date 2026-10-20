import { defineConfig, devices } from "@playwright/test";

/**
 * Real-browser tests against examples/basic-react-app, which consumes the
 * built dist/ output. `npm run test:browser` builds first.
 */
export default defineConfig({
  testDir: "tests/browser",
  timeout: 30_000,
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: [["list"]],
  use: { baseURL: "http://127.0.0.1:5179", trace: "retain-on-failure" },
  projects: [
    { name: "chromium", use: { ...devices["Desktop Chrome"] } },
    { name: "firefox", use: { ...devices["Desktop Firefox"] } },
    { name: "webkit", use: { ...devices["Desktop Safari"] } },
  ],
  webServer: {
    command: "npx vite --config examples/basic-react-app/vite.config.ts",
    url: "http://127.0.0.1:5179",
    reuseExistingServer: !process.env.CI,
    timeout: 60_000,
  },
});
