import { resolve } from "node:path";
import { defineConfig } from "vite";

const here = import.meta.dirname;
const root = resolve(here, "../..");

/**
 * Browser-test harness. Package imports resolve to the BUILT dist/ output
 * (run `npm run build` first), so tests exercise what is published.
 */
export default defineConfig({
  root: here,
  resolve: {
    alias: [
      { find: /^@pythonprakash\/erp-label-studio\/styles\.css$/, replacement: resolve(root, "dist/styles.css") },
      { find: /^@pythonprakash\/erp-label-studio\/(core|renderer|headless|presets)$/, replacement: resolve(root, "dist/$1.js") },
      { find: /^@pythonprakash\/erp-label-studio$/, replacement: resolve(root, "dist/index.js") },
    ],
  },
  oxc: { jsx: { runtime: "automatic" } },
  // Bind IPv4 explicitly: "localhost" may resolve to ::1 for some browsers (Firefox) and refuse connections.
  server: { host: "127.0.0.1", port: 5179, strictPort: true },
  preview: { host: "127.0.0.1", port: 5179, strictPort: true },
});
