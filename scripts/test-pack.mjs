/**
 * Release gate G3: test the PACKED tarball, not the workspace.
 *
 * 1. Build and `npm pack` into .pack-test/
 * 2. Verify the tarball file list (only dist + docs; no sources/tests)
 * 3. Clean-install the tarball into examples/nextjs-app
 * 4. Resolve every documented entry point from the consumer (Node ESM),
 *    and confirm internal paths are NOT importable
 * 5. `next build` the consumer (type-checks against the published .d.ts)
 *
 * Flags: --skip-build (reuse dist/), --skip-next (stop after step 4),
 *        --pack-only (stop after creating the tarball; used by `npm run playground`).
 */
import { spawnSync } from "node:child_process";
import { copyFileSync, existsSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const packDir = join(root, ".pack-test");
const example = join(root, "examples", "nextjs-app");
const args = new Set(process.argv.slice(2));

function run(cmd, cwd = root, env = {}) {
  console.log(`\n$ ${cmd}   (in ${cwd.replace(root, ".") || "."})`);
  const r = spawnSync(cmd, { cwd, shell: true, stdio: "inherit", env: { ...process.env, ...env } });
  if (r.status !== 0) {
    console.error(`test-pack: FAILED (${cmd} exited ${r.status})`);
    process.exit(1);
  }
}
function capture(cmd, cwd = root) {
  const r = spawnSync(cmd, { cwd, shell: true, encoding: "utf8" });
  if (r.status !== 0) {
    console.error(r.stdout, r.stderr);
    console.error(`test-pack: FAILED (${cmd})`);
    process.exit(1);
  }
  return r.stdout;
}

if (!args.has("--skip-build")) run("npm run build");

rmSync(packDir, { recursive: true, force: true });
mkdirSync(packDir, { recursive: true });
const packed = JSON.parse(capture(`npm pack --json --pack-destination "${packDir}"`))[0];
const files = packed.files.map((f) => f.path);
console.log(`\npacked ${packed.filename}: ${files.length} files, ${packed.size} bytes (unpacked ${packed.unpackedSize})`);
const allowed = /^(dist\/|README\.md$|LICENSE$|package\.json$|docs\/CHANGELOG\.md$)/;
const unexpected = files.filter((f) => !allowed.test(f));
if (unexpected.length) {
  console.error("test-pack: FAILED unexpected files in tarball:", unexpected);
  process.exit(1);
}
for (const required of ["dist/index.js", "dist/index.d.ts", "dist/core.js", "dist/core.d.ts", "dist/renderer.js", "dist/renderer.d.ts", "dist/headless.js", "dist/headless.d.ts", "dist/styles.css", "LICENSE", "README.md"]) {
  if (!files.includes(required)) {
    console.error(`test-pack: FAILED missing ${required}`);
    process.exit(1);
  }
}
copyFileSync(join(packDir, packed.filename), join(packDir, "your-org-erp-label-studio.tgz"));
if (args.has("--pack-only")) {
  console.log("\ntest-pack: packed to .pack-test/your-org-erp-label-studio.tgz (--pack-only)");
  process.exit(0);
}

// Clean install of the tarball into the consumer.
rmSync(join(example, "node_modules", "@your-org"), { recursive: true, force: true });
rmSync(join(example, "package-lock.json"), { force: true });
rmSync(join(example, ".next"), { recursive: true, force: true });
run("npm install --no-audit --no-fund", example);

// Resolve documented entry points from the consumer's perspective.
const probe = join(example, ".probe-exports.mjs");
writeFileSync(
  probe,
  `
const core = await import("@your-org/erp-label-studio/core");
for (const n of ["validateTemplate","parseTemplate","renderLabel","renderNodeToSvgString","generateLabels","buildPrintDocument","printLabels","createMemoryTemplateStorage","validateTemplateData","cloneTemplate"]) {
  if (typeof core[n] !== "function") throw new Error("core missing " + n);
}
if ("getPresetTemplates" in core) throw new Error("core still exports the preset catalog");
const presets = await import("@your-org/erp-label-studio/presets");
for (const n of ["getPresetSizes","getPresetTemplates","getPresetTemplate","createPresetRegistry"]) {
  if (typeof presets[n] !== "function") throw new Error("presets missing " + n);
}
const t = presets.getPresetTemplate("textile-hang-tag");
const r = core.renderLabel(t, { store:{name:"S"}, product:{ name:"N", barcode:"260042130115" }, pricing:{ mrp: 1 } });
if (!r.ok) throw new Error("render failed: " + JSON.stringify(r.issues));
const main = await import("@your-org/erp-label-studio");
for (const n of ["LabelEditor","BarcodeEditor","LabelRenderer","BarcodePreview","useEditorStore","validateTemplate","generateLabels","printLabels","getPresetSizes","getPresetTemplates"]) {
  if (typeof main[n] !== "function") throw new Error("main missing " + n);
}
const renderer = await import("@your-org/erp-label-studio/renderer");
if (typeof renderer.LabelRenderer !== "function") throw new Error("renderer missing LabelRenderer");
const headless = await import("@your-org/erp-label-studio/headless");
if (typeof headless.useEditorStore !== "function") throw new Error("headless missing useEditorStore");
import.meta.resolve("@your-org/erp-label-studio/styles.css");
for (const internal of ["@your-org/erp-label-studio/dist/core.js", "@your-org/erp-label-studio/src/entries/core"]) {
  try { await import(internal); throw new Error("internal path importable: " + internal); }
  catch (e) { if (e.code !== "ERR_PACKAGE_PATH_NOT_EXPORTED") throw e; }
}
console.log("exports probe: OK (core, presets, root, renderer, headless, styles.css; internals blocked)");
`,
);
run(`node "${probe}"`, example);
rmSync(probe, { force: true });

if (!args.has("--skip-next")) {
  run("npx next build", example, { NEXT_TELEMETRY_DISABLED: "1" });
  if (!existsSync(join(example, ".next", "BUILD_ID"))) {
    console.error("test-pack: FAILED next build produced no BUILD_ID");
    process.exit(1);
  }
}
console.log("\ntest-pack: OK");
