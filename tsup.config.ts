import { defineConfig } from "tsup";

export default defineConfig({
  entry: {
    index: "src/entries/index.ts",
    core: "src/entries/core.ts",
    renderer: "src/entries/renderer.ts",
    headless: "src/entries/headless.ts",
    presets: "src/entries/presets.ts",
  },
  format: ["esm"],
  target: "es2020",
  platform: "neutral",
  splitting: true,
  treeshake: true,
  sourcemap: true,
  clean: true,
  dts: { compilerOptions: { types: [] } },
  tsconfig: "tsconfig.build.json",
  external: ["react", "react-dom", "react/jsx-runtime", "qrcode-generator"],
  outDir: "dist",
});
