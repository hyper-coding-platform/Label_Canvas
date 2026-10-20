# Implementation Plan

Status legend: `[ ]` not started · `[~]` in progress · `[x]` done and verified ·
`[!]` blocked (see note). A task is `[x]` only when its code exists **and** its
verification command has been run and passed. Record the evidence (command +
result) in the "Verification log" at the bottom.

## Step A — Inspect  ✅
- [x] A1 Inspect repo, toolchain, registry access. *Done: see DECISIONS D-001..D-003.*
- [x] A2 Dependency spikes (bwip-js size, TS7 API, resvg+zxing decode). *Done: D-003, D-007.*

## Step B — Plan  ✅
- [x] B1 README, AGENTS, ARCHITECTURE, IMPLEMENTATION_PLAN, ACCEPTANCE_CRITERIA, TEST_STRATEGY, DECISIONS.

## Step C — Foundation
- [x] C1 `package.json` (name, exports, peers, scripts, files, sideEffects), lockfile.
- [x] C2 `tsconfig.json` strict, tsup config, post-build check script.
- [x] C3 Vitest config (node + jsdom projects), ESLint flat config.
- [x] C4 `errors.ts` structured error classes.
- [x] C5 Template schema types + limits + constants.
  *Exit: `npm run typecheck`, `npm run lint`, `npm test`, `npm run build` all exit 0.*

## Step D — Core engine
- [x] D1 Units + geometry (conversion, rect ops, rotation bounds, snapping). Unit tests.
- [x] D2 Template validation (all spec'd rule classes) + `parseTemplate` for untrusted JSON. Unit + security fixtures.
- [x] D3 Schema migrations framework (explicit, tested; unknown versions rejected).
- [x] D4 Binding: path parsing, safe resolution, formatting, fallback, conditions. Unit + security tests.
- [x] D5 Render tree + SVG serialiser with attribute allowlist + escaping. Unit tests incl. well-formedness.
- [x] D6 Element renderers: text (measurer, overflow policies), rect, line, image (policy).
  *Exit: core coverage ≥ 90% lines for D1–D6 modules; no React import in core (architecture test).*

## Step E — Barcode engine
- [x] E1 Code 128 encoder (auto subset A/B/C, optimal switching, check char).
- [x] E2 EAN-13, EAN-8, UPC-A (check digit compute/verify).
- [x] E3 ITF-14 (check digit, bearer bars option).
- [x] E4 GS1-128 (AI table, FNC1, check digits for GTIN/SSCC, variable-length FNC1 separators).
- [x] E5 QR via qrcode-generator (EC levels, byte mode UTF-8).
- [x] E6 Barcode element renderer (module geometry, quiet zones, min X-dimension, dot snapping, HRI text).
- [x] E7 Independent decode tests (resvg → zxing-wasm) for every format, valid + invalid inputs.
  *Exit: every supported format decodes to the expected payload; invalid input → structured error, never a symbol.*

## Step F — Basic editor
- [x] F1 EditorStore: commands, selection, history (coalescing, limits), validation gate.
- [x] F2 React bindings (`/headless` hooks), `LabelRenderer`, `BarcodePreview` (`/renderer`).
- [x] F3 `LabelEditor` shell: toolbar, canvas (SVG, viewport transform), properties panel, layers panel.
- [x] F4 Drag-move with pointer events, add/delete/duplicate/hide/lock/reorder.
- [x] F5 Component tests (RTL, jsdom).
- [x] F6 Playwright harness app (`examples/basic-react-app`) + first browser tests.
  *Exit: RTL + Playwright suites pass.*

## Step G — Professional editing
- [x] G1 Resize handles (8), rotation input, keep-ratio for QR.
- [x] G2 Rulers, grid, snap-to-grid, alignment guides (edges/centres), canvas bounds.
- [x] G3 Zoom (buttons, ctrl+wheel), fit-to-screen, pan.
- [x] G4 Keyboard: arrows/shift-arrows, Delete, Ctrl+Z/Y/Shift+Z, Ctrl+D, Escape, Tab order; toolbar roving tabindex.
- [x] G5 Multi-selection (shift-click) with group move.
- [x] G6 Accessibility: axe checks (jsdom + Playwright), focus styles, live region announcements.

## Step H — Presets and dynamic fields
- [x] H1 Preset sizes (retail, hang tag, size label, fabric roll, shelf, inventory, shipping, A4 sheets, continuous).
- [x] H2 Industry templates (textile, retail, warehouse, jewellery, POS, inventory), all validated + rendered in tests.
- [x] H3 Field schema (`DataSchema`) + FieldPicker + sample data preview.
- [x] H4 Clone template, custom preset registry.

## Step I — Batch and printing
- [x] I1 `generateLabels` async iterator: bounded concurrency, ordering, progress, AbortSignal, error policies.
- [x] I2 `computePrintLayout` (roll + sheet; margins, gaps, rows/cols, orientation, copies, pagination).
- [x] I3 `buildPrintDocument` + print CSS + `printLabels` (hidden iframe lifecycle, cleanup).
- [x] I4 Calibration test page generator.
- [x] I5 Print preview component in editor.

## Step J — ERP integration
- [x] J1 Storage interface + memory + localStorage adapters (revisions, conflicts, quota).
- [x] J2 Editor save flow: concurrent save guard, error surfaces, unmount safety.
- [x] J3 Theme tokens, `ui` layout config, component slots, headless example.
- [x] J4 Next.js App Router example with ERP shell (navbar + sidebar) + `/stickers` page, installed from packed tarball.
- [x] J5 Alternative-UI consumer (custom control slots built with a different UI kit).

## Step K — Hardening
- [~] K1 Security suite (prototype pollution, SVG/HTML injection, URLs, oversize).
- [x] K2 Performance benchmarks (10/100/500/1000 elements; 1k/10k records; cancellation loops) + PERFORMANCE.md.
- [x] K3 Bundle-size budgets (size-limit) per entry.
- [x] K4 Style-leak and host-shell browser tests; mount/unmount leak test.
- [x] K5 Dependency audit + license check.

## Step L — Release preparation
- [x] L1 publint + attw + export resolution check.
- [x] L2 `npm pack` → clean install into example apps → build + browser smoke.
- [~] L3 CI workflow (GitHub Actions). *Defined in `.github/workflows/ci.yml`; not yet run on a CI host.*
- [x] L4 Remaining docs: API, TEMPLATE_FORMAT, DATA_BINDING, PRINTING, NEXTJS_INTEGRATION, PERFORMANCE, SECURITY, ACCESSIBILITY, TROUBLESHOOTING, RELEASE, CHANGELOG.
- [x] L5 Implementation description (`IMPLEMENTATION.md`) and consumer guide (`USING_IN_OTHER_APPS.md`), with consumer builds verified from the packed tarball.

## Step M — Final report
- [x] M1 Final engineering report delivered (2026-10-20).

## Open defects / follow-ups
- Intermittent: in 1 of 6 three-browser Playwright runs (after the IPv4 fix) 2 tests failed ("Target page, context or browser has been closed"; one deep-equality mismatch) — not reproduced in 5 further full runs or in isolation; likely browser overload (3 browsers × 8 workers on 4 cores). CI uses 1 retry; investigate if it recurs on CI.
- Budget exceptions awaiting owner approval: core "all exports" size (36.88 vs 35 kB); 1,000-element drag at the 16 ms limit.
- Not verified: React 18; CI host run; physical printing/scanning; manual screen-reader pass.
- Follow-up optimisation: per-element render caching to cut full re-render cost of committed edits on large templates (≈105 ms at 1,000 elements).
- Owner decisions before publish: package scope (`@your-org`), license (MIT placeholder), repository URLs.

## Verification log

| Date | Step | Command | Result |
| --- | --- | --- | --- |
| 2026-10-19 | A2 | scratch spike: esbuild bundle sizes | bwip-js code128 48.6 KB gz; all formats 97.0 KB gz; qrcode-generator 7.6 KB gz |
| 2026-10-19 | A2 | scratch spike: `require('typescript').createProgram` on 7.0.2 | `undefined` → pin 5.9.3 |
| 2026-10-19 | A2 | scratch spike: bwip-js SVG → resvg → zxing-wasm | decoded `Code128 "ABC-123" valid` |
| 2026-10-19 | E7 | `npx vitest run --project integration` (encoder-level decode) | 44/44 pass. Found: wrong EAN test vector (encoder correctly rejected it); zxing reports UPC-A as 13 digits and GS1 as HRI text |
| 2026-10-19 | D–E | `npx vitest run` (unit + integration + security) | 272/272 pass. Defects found and fixed: impossible dates rolled over (2026-02-30); render crash when template name contains `<` |
| 2026-10-19 | D | `vitest --coverage` | 92.43% lines overall (errors.ts 66.7%: conflict/abort paths exercised in steps I–J) |
| 2026-10-19 | C | `npx tsc --noEmit -p tsconfig.json` and `npx eslint .` | exit 0 |
| 2026-10-19 | C | `npm run build` | exit 0; post-build: core graph React-free, Node import OK |
| 2026-10-19 | K3 | `npx size-limit` | core 26.75 kB minified + brotli, all deps (limit 35 kB) |
| 2026-10-20 | F | `npx vitest run` | 317/317 pass (incl. 20 RTL editor tests + jsdom axe scan) |
| 2026-10-20 | F6/G | `npx playwright test --project=chromium` | 24/24 pass (drag, resize, numeric edit, undo/redo, save+reload, save failure, sample data, missing barcode placeholder, on-screen barcode decoded by zxing, keyboard-only, axe incl. contrast, host shell unchanged, CSS scoping, 375px viewport, themed + custom UI kit, headless, renderer-only bundle, 20x mount/unmount listener check, zoom/fit, multi-select/group drag/align, marquee) |
| 2026-10-20 | F6 | `npx playwright test --project=firefox --project=webkit` | 40 passed, 2 skipped (CDP listener test is Chromium-only) — run before viewport/multi-select tests were added |
| 2026-10-20 | F | defects found by tests | StrictMode destroyed owned store (all edits rejected in dev); nested-interactive buttons in layers listbox (axe); "Add qr code" label; missing React keys; slot prop `buttonRef` tripped React Compiler lint → renamed `setElement` |
| 2026-10-20 | K3 | `npx size-limit` | core 26.89 kB; renderer 26.42 kB; headless 29.76 kB; full editor 47.59 kB; css 2.17 kB (min+brotli, React excluded) — all within budget |
| 2026-10-20 | H | `npx vitest run tests/integration/presets.test.ts` | 47/47 pass: 10 industry templates validate + render sample data without errors; every preset barcode/QR decodes with zxing-cpp; sheet geometry sums to page size; registry isolation; field discovery |
| 2026-10-20 | H | defects found by tests | shelf-label EAN-13 snapped to 1 dot (0.125 mm) → widened to 44 mm (0.375 mm X); textile tag Code 128 of 13-char SKU snapped to 1 dot → encode numeric item code; deepFreeze skipped already-frozen containers; size preset in other unit reinterpreted coordinates |
| 2026-10-20 | I | `npx vitest run` | 391/391 pass (batch: order, policies, progress, abort before/mid, consumer break closes source, async sources, limits; print: A4 slot coordinates, overflow/cell/unprintable checks, roll/landscape, copies, skip slots, invalid-record skipping, title escaping, calibration) |
| 2026-10-20 | I | `npx playwright test --project=chromium` | 29/29 pass incl. Chromium PDF MediaBox = 50×75 mm and 210×297 mm; all 21 A4 label rects within 0.5 CSS px of layout; print dialog modal/focus/escape; sandboxed print frame |
| 2026-10-20 | I | defect found | sheet presets lacked cell size → mismatched labels reported only as generic overflow; added `cell` |
| 2026-10-20 | J | `npx vitest run` | storage contract (memory + localStorage): revisions, conflicts, pagination, quota, corrupted entries; useTemplateStorage + LabelEditor conflict flow |
| 2026-10-20 | L2 | `node scripts/test-pack.mjs` | OK: tarball 29 files / 283,099 B (unpacked 1,170,700 B incl. source maps); no non-dist files; clean install into Next example; all entry points resolve in Node; internal paths blocked (ERR_PACKAGE_PATH_NOT_EXPORTED); `next build` (Next 16.4.2, Turbopack) compiled, type-checked and prerendered /stickers and /stickers/antd |
| 2026-10-20 | J4/J5 | `npx playwright test -c playwright.nextjs.config.ts` | 8/8 pass on production server: SSR markup, hydration without console errors, API persistence + revisions, 409 conflict surfaced, server-side 422 validation, Ant Design 6.6.6 slots, host shell unchanged, server SVG decoded by zxing, batch check |
| 2026-10-20 | K1 | `npx vitest run --project security` | callback hardening: host callback exceptions routed to onError; store listener isolation (defect: a throwing listener aborted the emit loop) |
| 2026-10-20 | K5 | `npm run check:licenses`, `npm audit --omit=dev`, `npm audit` | production closure qrcode-generator (MIT) only; 0 vulnerabilities (prod and all) |
| 2026-10-20 | L1 | `npm run check:package` | publint All good; attw green (node16-ESM, bundler) for all entries |
| 2026-10-20 | K3 | `npm run size` | defect found: preset data built at module level defeated tree-shaking (render-only 30.17 kB) → lazy presets → 25.51 kB; core all-exports 36.88 kB documented exception |
| 2026-10-20 | L | `npm run verify` | exit 0 (lint, typecheck, 422 tests, build, check:package, size) |
| 2026-10-20 | L | `npx playwright test` (3 browsers) ×6 after IPv4 fix | 5 runs: 79 passed / 8 skipped; 1 run: 2 failed (see open defects). Root cause of earlier Firefox failures: NS_ERROR_CONNECTION_REFUSED → servers bound to 127.0.0.1 |
| 2026-10-20 | L2 | `npm run test:nextjs` | tarball 30 files / 291,007 B (unpacked 1,194,602 B); next build OK; 8/8 production tests |
| 2026-10-20 | K2 | `node --expose-gc scripts/bench.mjs` (final code) | 10 el 0.457 ms; 1k records 363 ms; 10k records 3.66 s, heap 6.31→6.45→6.41 MB |
| 2026-10-20 | G1 | fresh `git clone` → `npm ci` → `npm run build` → `npx vitest run` → lint → typecheck | all pass (338 packages; 422/422 tests) — committed tree is self-sufficient |
| 2026-10-20 | L5 | `npm run pack:local`; fresh Vite 8.3.4 + React 19.3.1 app outside the repo: `npm install <tgz>`, `tsc -b && vite build` (strict, skipLibCheck false), `vite preview` + Chromium smoke | pass: editor + preview rendered, 0 console errors; 130 kB gz app total |
| 2026-10-20 | L5 | consumer `tsc --noEmit` under moduleResolution bundler / node16 / nodenext (ESM + CJS) / node10 | first four pass; node10 fails with TS2307 (expected: `exports`-only package), documented |
| 2026-10-20 | L5 | consumer Node: ESM import of `/core` (render, SVG, batch), CJS `require("/core")` on Node 25.9, documented `check-label-sdk.mjs` | all pass |
| 2026-10-20 | L5 | `npm run test:pack -- --skip-build`; `npx next build --webpack` in examples/nextjs-app | both pass (Turbopack and webpack) |
| 2026-10-20 | L5 | `npm run lint`, `typecheck`, `test`, `build`, `check:package` (pre-commit) | all exit 0; 422/422 tests |
