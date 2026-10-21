/**
 * Performance benchmarks for the core engine (Node, built dist/).
 * Run: `npm run bench` (builds first via the script) — results go to
 * .bench-results/core.json and stdout. Workloads are fixed; do not change
 * them to make numbers look better (AGENTS.md).
 */
import { mkdirSync, writeFileSync } from "node:fs";
import os from "node:os";
import { dirname, join, resolve } from "node:path";
import { performance } from "node:perf_hooks";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const core = await import(pathToFileURL(join(root, "dist", "core.js")).href);
const { getPresetTemplate } = await import(pathToFileURL(join(root, "dist", "presets.js")).href);
const { validateTemplate, parseTemplate, renderLabel, renderNodeToSvgString, generateLabels, buildPrintDocument } = core;
const gc = globalThis.gc ?? null;

function stats(samples) {
  const s = [...samples].sort((a, b) => a - b);
  const q = (p) => s[Math.min(s.length - 1, Math.floor(p * s.length))];
  return { n: s.length, median: +q(0.5).toFixed(3), p95: +q(0.95).toFixed(3), min: +s[0].toFixed(3), max: +s[s.length - 1].toFixed(3) };
}
function time(fn, iterations, warmup = 3) {
  for (let i = 0; i < warmup; i += 1) fn();
  const out = [];
  for (let i = 0; i < iterations; i += 1) {
    const t0 = performance.now();
    fn();
    out.push(performance.now() - t0);
  }
  return stats(out);
}
const heapMb = () => +(process.memoryUsage().heapUsed / 1048576).toFixed(2);

/** Deterministic mixed workload: 70% text, 10% barcode, 10% rect, 5% line, 5% QR. */
function makeTemplate(count) {
  const cols = Math.ceil(Math.sqrt(count));
  const cellW = 45;
  const cellH = 22;
  const elements = [];
  for (let i = 0; i < count; i += 1) {
    const x = (i % cols) * cellW + 1;
    const y = Math.floor(i / cols) * cellH + 1;
    const k = i % 20;
    const id = `e${i}`;
    if (k < 14) elements.push({ id, type: "text", x, y, width: 40, height: 6, content: { kind: "field", path: "product.name", prefix: `${i} ` }, style: { fontFamily: "sans", fontSize: 8, overflow: k % 2 ? "wrap" : "ellipsis" } });
    else if (k < 16) elements.push({ id, type: "barcode", x, y, width: 43, height: 20, format: "code128", value: { kind: "field", path: "product.sku" } });
    else if (k < 18) elements.push({ id, type: "rect", x, y, width: 40, height: 18, stroke: "#000000", strokeWidth: 0.3 });
    else if (k < 19) elements.push({ id, type: "line", x, y: y + 5, width: 40, height: 1, strokeWidth: 0.3 });
    else elements.push({ id, type: "qrcode", x, y, width: 20, height: 20, value: { kind: "field", path: "product.url" } });
  }
  return { schemaVersion: 1, id: `perf-${count}`, name: `Perf ${count}`, canvas: { width: Math.min(2000, cols * cellW + 2), height: Math.min(2000, Math.ceil(count / cols) * cellH + 2), unit: "mm" }, elements };
}
const record = (i) => ({ product: { name: `Cotton Kurta ${i} – Indigo Block Print`, sku: `KRT-${String(i).padStart(6, "0")}`, url: `https://erp.example.com/p/${i}` } });

const env = {
  date: new Date().toISOString(),
  node: process.version,
  platform: `${os.type()} ${os.release()} ${os.arch()}`,
  cpu: os.cpus()[0]?.model ?? "unknown",
  cores: os.cpus().length,
  memoryGb: +(os.totalmem() / 1073741824).toFixed(1),
  gcExposed: !!gc,
};
const results = { env, elements: {}, import: {}, batch: {}, memory: {} };
console.log("Environment:", env);

for (const n of [10, 100, 500, 1000]) {
  const t = makeTemplate(n);
  const iters = n <= 100 ? 200 : n <= 500 ? 40 : 20;
  const validate = time(() => validateTemplate(t), iters);
  const prepared = core.prepareTemplate(t);
  const render = time(() => renderNodeToSvgString(renderLabel(prepared, record(1)).root), iters);
  const coldStart = performance.now();
  renderNodeToSvgString(renderLabel(makeTemplate(n), record(2)).root); // includes validation of a fresh object
  const cold = +(performance.now() - coldStart).toFixed(3);
  results.elements[n] = { validateMs: validate, renderAndSerializeMs: render, coldRenderIncludingValidationMs: cold };
  console.log(`${n} elements: validate median ${validate.median} ms (p95 ${validate.p95}); render+serialize median ${render.median} ms (p95 ${render.p95}); cold ${cold} ms`);
}

{
  const json = JSON.stringify(makeTemplate(1000));
  const r = time(() => {
    const p = parseTemplate(json);
    if (!p.ok) throw new Error("parse failed");
  }, 20);
  results.import = { bytes: json.length, parseValidateMs: r };
  console.log(`import 1000-element template (${(json.length / 1024).toFixed(0)} KiB): median ${r.median} ms`);
}

{
  const tag = getPresetTemplate("textile-hang-tag");
  const rec = (i) => ({ store: { name: "Lakshmi Silks" }, product: { name: `Cotton Kurta ${i}`, sku: `KRT-${i}`, barcode: String(260000000000 + i) }, variant: { size: "M", color: "Indigo" }, pricing: { mrp: 1299 + (i % 50) }, inventory: { batchNo: "B2026-10" } });
  for (const n of [1000, 10000]) {
    gc?.();
    const heapStart = heapMb();
    let peak = heapStart;
    let bytes = 0;
    let ok = 0;
    const t0 = performance.now();
    // Records are produced lazily; output is consumed (measured) and discarded, as a streaming caller would.
    function* records() {
      for (let i = 0; i < n; i += 1) yield rec(i);
    }
    for await (const l of generateLabels(tag, records(), { chunkSize: 200 })) {
      if (l.ok) {
        ok += 1;
        bytes += l.svg.length;
      }
      if (l.index % 1000 === 999) {
        gc?.();
        peak = Math.max(peak, heapMb());
      }
    }
    const ms = performance.now() - t0;
    gc?.();
    const heapEnd = heapMb();
    results.batch[n] = { ms: +ms.toFixed(1), labelsPerSecond: Math.round((n / ms) * 1000), ok, avgSvgBytes: Math.round(bytes / n), heapStartMb: heapStart, heapPeakSampledMb: peak, heapEndMb: heapEnd };
    console.log(`batch ${n}: ${ms.toFixed(0)} ms (${Math.round((n / ms) * 1000)} labels/s), ok ${ok}, heap start ${heapStart} MB, sampled peak ${peak} MB, end ${heapEnd} MB`);
  }

  // Repeated start/abort cycles must not accumulate memory.
  gc?.();
  const before = heapMb();
  for (let c = 0; c < 200; c += 1) {
    const ac = new AbortController();
    try {
      for await (const l of generateLabels(tag, Array.from({ length: 1000 }, (_, i) => rec(i)), { signal: ac.signal, chunkSize: 5 })) if (l.index === 9) ac.abort();
    } catch (e) {
      if (e.code !== "ABORTED") throw e;
    }
  }
  gc?.();
  const after = heapMb();
  results.memory.abortCycles = { cycles: 200, heapBeforeMb: before, heapAfterMb: after };
  console.log(`200 abort cycles: heap ${before} MB → ${after} MB`);

  const doc = time(() => buildPrintDocument(tag, Array.from({ length: 100 }, (_, i) => rec(i))), 10, 1);
  results.batch.printDocument100 = doc;
  console.log(`print document, 100 labels: median ${doc.median} ms`);
}

mkdirSync(join(root, ".bench-results"), { recursive: true });
writeFileSync(join(root, ".bench-results", "core.json"), JSON.stringify(results, null, 2));
console.log("\nWrote .bench-results/core.json");
