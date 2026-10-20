# Performance

All numbers below were **measured**, not estimated. Re-run with `npm run bench` (core, Node)
and `npm run bench:editor` (editor, Chromium). Raw results are written to `.bench-results/`.

## Reference environment

| | |
| --- | --- |
| CPU | Intel Core i7-4790 @ 3.60 GHz (4 cores / 8 threads, 2014) |
| RAM | 16 GB |
| OS | Windows 10 Pro 10.0.19045 x64 |
| Node.js | 25.9.0 (`--expose-gc` for memory sampling) |
| Browser | Playwright Chromium 1248 (headless, software compositing), 1440×900 viewport |
| Build | Production builds (`dist/` for core; `vite build` of the harness for the editor) |
| Date | 2026-10-20 |

This is an older desktop CPU. Typical current office hardware will be faster. CI runners vary,
so CI assertions use generous ceilings and precise numbers come only from the reference machine.

## Budgets and results

| Budget (ACCEPTANCE_CRITERIA.md) | Target | Measured | Status |
| --- | --- | --- | --- |
| `/core`, **all** exports, min + brotli | ≤ 35 kB | **36.88 kB** (incl. qrcode-generator) | ⚠️ documented exception (below) |
| `/core`, render-only import (`renderLabel` + serializer) | ≤ 30 kB | **25.51 kB** | ✅ |
| `/renderer` (React excluded) | ≤ 40 kB | **26.45 kB** | ✅ |
| `/headless` (React excluded) | ≤ 45 kB | **30.11 kB** | ✅ |
| Full editor (React excluded) | ≤ 90 kB | **59.48 kB** | ✅ |
| `styles.css` | ≤ 6 kB | **2.40 kB** | ✅ |
| Render a 10-element label (warm) | ≤ 2 ms median | **0.46 ms** median, 0.72 ms p95 | ✅ |
| 1,000 records → SVG | ≤ 2 s | **379 ms** (2,638 labels/s) | ✅ |
| 10,000 records, incremental | bounded heap | **3.43 s**; heap 6.32 → peak 6.47 → 6.42 MB | ✅ |
| Drag frame at 100 elements | ≤ 16 ms main thread per move | **4.6–5.4 ms** | ✅ |
| Drag frame at 500 elements | ≤ 16 ms | **10.4–11.1 ms** | ✅ |
| Drag frame at 1,000 elements | ≤ 16 ms | **15.6–16.5 ms** | ⚠️ at the limit (documented exception) |
| Max elements per template | 1,000 (hard limit) | enforced by validation | ✅ |

Sizes come from `npm run size` (size-limit with esbuild, minified + brotli), measured
2026-10-20 after Steps H–K. Package footprint: the tarball is about 300 KB, about 1.2 MB
unpacked, mostly source maps (re-measured by `npm run test:pack`). The only production
dependency is qrcode-generator.

### Exception: `/core` "import everything" size

* **Measured:** 36.88 kB min + brotli when an app imports every `/core` export, against a 35 kB
  budget estimated in Phase 0.
* **Root cause:** the sum of all features. Brotli sizes per module: validation 5.1 kB,
  renderer 3.3 kB, preset data (10 templates + 19 sizes) 4.8 kB, print layout/documents/
  calibration 4.0 kB, headless editor store and interactions 4.0 kB, storage adapters
  1.6 kB, GS1 1.6 kB, Code 128 1.2 kB, plus qrcode-generator. Analysis found no duplicated
  or dead code.
* **Defect found and fixed during this analysis:** preset data was built by module-level
  function calls, which bundlers must keep, so every render-only app shipped all preset
  templates (30.17 kB). Presets are now built lazily: the render-only import fell to
  **25.51 kB**.
* **Mitigation:** real applications import subsets and tree-shake; every subset budget
  passes. CI enforces 37 kB for this entry so that further growth fails.
* **Disposition:** awaiting owner approval. The alternative is to move presets to a separate
  `/presets` entry (a breaking change to the `/core` export list).

## Core engine (Node, `npm run bench`)

The workload mix is 70% text, 10% Code 128, 10% rectangles, 5% lines and 5% QR, with field
bindings.

| Elements | Validate (median / p95) | Render + serialize (median / p95) | Cold (incl. validation) |
| --- | --- | --- | --- |
| 10 | 0.06 / 0.19 ms | 0.46 / 0.72 ms | 0.85 ms |
| 100 | 0.27 / 0.46 ms | 11.6 / 14.2 ms | 13.5 ms |
| 500 | 1.34 / 2.00 ms | 57.5 / 65.0 ms | 61.6 ms |
| 1,000 | 2.49 / 3.57 ms | 114.7 / 155.8 ms | 115.8 ms |

* Importing a 1,000-element template (166 KiB JSON: parse, migrate and validate): 3.7 ms median.
* Print document for 100 labels: 32.7 ms median.
* 200 start/abort cycles of a 1,000-record batch: heap 6.37 → 6.47 MB (no accumulation).

**Profile.** QR encoding dominates: about **1 ms per QR symbol** in qrcode-generator, which
evaluates all 8 masks. That compares with about 0.009 ms per Code 128 encoding and about
0.03 ms per text element. Labels with one QR each still render at about 1–2 ms.

## Editor (Chromium, `npm run bench:editor`, three runs)

Main-thread time comes from the Chrome DevTools Protocol metric `TaskDuration` per pointer
move during a 60-move drag. It includes script, style, layout and paint work.

| Elements | Startup to interactive | Per drag move: total (script) | One committed edit (full re-render) | JS heap |
| --- | --- | --- | --- | --- |
| 100 | ~260 ms | 4.6–5.4 ms (0.65–0.70 ms) | 19–20 ms | 9 MB |
| 500 | ~410 ms | 10.4–11.1 ms (0.92 ms) | 65–71 ms | 14 MB |
| 1,000 | ~620 ms | 15.6–16.5 ms (1.17–1.20 ms) | 102–105 ms | 15–28 MB |

### Optimization history (measured, same workload)

| Change | Per-move at 1,000 elements: total (script) |
| --- | --- |
| Initial: every move rebuilt the whole label React tree with a transform | 25.7 ms (8.3 ms) |
| Label and hit layers memoized; dragged groups moved imperatively | 18.5 ms (1.2 ms) |
| Dragged groups cloned into a separate layer moved by CSS transform; static and dynamic overlays split; no hit testing while dragging | 15.6–16.5 ms (1.2 ms) |
| Per-editor bounded barcode encoding cache (`createCachingBarcodeAdapter`) | (reduces edit re-render cost for QR-heavy labels) |

Other decisions:

* Transient pointer state lives in refs and rAF-throttled local state. Only pointer-up commits
  one history entry; pointer moves never touch the store.
* Panels subscribe to store slices (`useEditorSelector`), so dragging does not re-render the
  layers or properties panels.
* Plain hover moves cost 0.5 ms (100 elements) and 1.2 ms (1,000 elements). This diagnostic
  run showed that the remaining drag cost at 1,000 elements is browser rendering work, not
  script.

### Exception: 1,000-element interaction

At 1,000 elements, drag moves cost 15.6–16.5 ms on the reference machine, at the edge of a
60 Hz frame. Script is only 1.2 ms of that; the rest is browser rendering of a very large
SVG. **The supported interaction target is ≤ 500 elements.** Templates of 501–1,000 elements
are accepted and work, with about 60 fps on typical current hardware and possible frame
drops on older machines. Real labels rarely exceed 50 elements.

A committed edit (move, nudge, property change) re-renders the whole label: about 105 ms at
1,000 elements and about 20 ms at 100. That cost is paid once per user action. The follow-up
optimization would be per-element render caching keyed by element identity, which the store
already provides through structural sharing.

## Bulk generation guidance

* `generateLabels` is pull-based: memory does not grow with dataset size unless your code
  keeps the output. At about 2,900 labels/s on the reference machine, 10,000 labels take
  about 3.4 s of CPU time. In a browser, the generator yields every 50 labels; for jobs
  above a few thousand labels, run it in a Web Worker or on the server.
* `buildPrintDocument` is capped at 2,000 labels per document (`maxLabels`), because browsers
  print very large documents slowly and unreliably. Split jobs into batches.
* Browser-side processing of unlimited datasets is **not** supported. Use server-side rendering
  (`/core` in Node) and chunked output for very large runs.
