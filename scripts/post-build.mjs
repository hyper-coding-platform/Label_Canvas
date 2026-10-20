/**
 * Post-build steps and checks:
 * 1. Prepend "use client" to React entry files (Next.js client boundary).
 * 2. Copy the scoped stylesheet to dist/styles.css.
 * 3. Fail if the /core import graph references React.
 * 4. Import dist/core.js in plain Node (no DOM globals) as an SSR smoke test.
 */
import { copyFileSync, existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const dist = join(root, "dist");
const fail = (msg) => {
  console.error(`post-build: ${msg}`);
  process.exit(1);
};

// 1. "use client" for React entries
for (const entry of ["index.js", "renderer.js", "headless.js"]) {
  const p = join(dist, entry);
  if (!existsSync(p)) continue;
  const src = readFileSync(p, "utf8");
  if (!src.startsWith('"use client";')) writeFileSync(p, `"use client";\n${src}`);
}

// 2. stylesheet
const css = join(root, "src", "styles", "styles.css");
if (existsSync(css)) copyFileSync(css, join(dist, "styles.css"));

// 3. core import graph must not reference react
const seen = new Set();
function visit(file) {
  if (seen.has(file)) return;
  seen.add(file);
  const text = readFileSync(file, "utf8");
  for (const m of text.matchAll(/(?:^|[;\s])(?:import|export)[^"';]*?from\s*["']([^"']+)["']|import\(\s*["']([^"']+)["']\s*\)/g)) {
    const spec = m[1] ?? m[2];
    if (/^react(-dom)?(\/|$)/.test(spec)) fail(`${file} (reachable from core) imports "${spec}".`);
    if (spec.startsWith(".")) visit(join(dirname(file), spec));
  }
}
const coreEntry = join(dist, "core.js");
if (!existsSync(coreEntry)) fail("dist/core.js is missing.");
visit(coreEntry);

// 4. Node import smoke test (SSR-safety: no window/document at import)
if (typeof globalThis.window !== "undefined" || typeof globalThis.document !== "undefined") fail("unexpected DOM globals in build environment");
const core = await import(pathToFileURL(coreEntry).href);
for (const name of ["validateTemplate", "renderLabel", "renderNodeToSvgString", "parseTemplate"]) {
  if (typeof core[name] !== "function") fail(`dist/core.js does not export ${name}()`);
}
console.log(`post-build: OK (core graph: ${seen.size} file(s), no React; Node import succeeded)`);
