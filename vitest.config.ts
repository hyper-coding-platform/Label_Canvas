import { defineConfig } from "vitest/config";

const shared = {
  environment: "node" as const,
  restoreMocks: true,
};

export default defineConfig({
  test: {
    coverage: {
      provider: "v8",
      include: ["src/**/*.{ts,tsx}"],
      exclude: ["src/entries/**"],
      reporter: ["text-summary", "html"],
    },
    projects: [
      { extends: true, test: { ...shared, name: "unit", include: ["tests/unit/**/*.test.{ts,tsx}"] } },
      { extends: true, test: { ...shared, name: "integration", include: ["tests/integration/**/*.test.{ts,tsx}"], testTimeout: 30_000 } },
      { extends: true, test: { ...shared, name: "security", include: ["tests/security/**/*.test.{ts,tsx}"] } },
      { extends: true, test: { ...shared, name: "performance", include: ["tests/performance/**/*.test.ts"], testTimeout: 120_000 } },
    ],
  },
});
