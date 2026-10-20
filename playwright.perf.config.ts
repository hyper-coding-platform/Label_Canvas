import { defineConfig, devices } from "@playwright/test";

/** Editor performance measurements against the PRODUCTION build of the harness (Chromium + CDP metrics). */
export default defineConfig({
  testDir: "tests/browser-perf",
  timeout: 120_000,
  workers: 1,
  reporter: [["list"]],
  use: { baseURL: "http://127.0.0.1:5180", viewport: { width: 1440, height: 900 } },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"], viewport: { width: 1440, height: 900 } } }],
  webServer: {
    command: "npx vite build --config examples/basic-react-app/vite.config.ts --outDir ../../.perf-build --emptyOutDir && npx vite preview --config examples/basic-react-app/vite.config.ts --outDir ../../.perf-build --host 127.0.0.1 --port 5180 --strictPort",
    url: "http://127.0.0.1:5180",
    reuseExistingServer: false,
    timeout: 180_000,
  },
});
