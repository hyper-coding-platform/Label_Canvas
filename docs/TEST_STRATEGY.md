# Test Strategy

## Commands

| Category | Location | Runner | Command |
| --- | --- | --- | --- |
| Unit | `tests/unit` | Vitest (node; jsdom per file) | `npm run test:unit` |
| Integration | `tests/integration` | Vitest (node + jsdom) | `npm run test:integration` |
| Security | `tests/security` | Vitest | `npm run test:security` |
| All of the above | | | `npm test` |
| Coverage | | Vitest + v8 | `npm run test:coverage` |
| Browser (harness, built `dist/`) | `tests/browser` | Playwright | `npm run test:browser` (Chromium), `npm run test:browser:all` (+ Firefox, WebKit) |
| Next.js (packed tarball, production server) | `tests/nextjs` | `scripts/test-pack.mjs` + Playwright | `npm run test:nextjs` |
| Package contents and exports | `scripts/test-pack.mjs` | Node | `npm run test:pack` |
| Package metadata and types | | publint + attw | `npm run check:package` |
| Bundle budgets | `.size-limit.json` | size-limit | `npm run size` |
| Core benchmarks | `scripts/bench.mjs` | Node `--expose-gc` | `npm run bench` |
| Editor benchmarks | `tests/browser-perf` | Playwright + CDP (production build) | `npm run bench:editor` |
| Licenses / audit | `scripts/check-licenses.mjs` | Node / npm | `npm run check:licenses`, `npm run audit:prod` |
| Lint / types | | ESLint 10, tsc 5.9 | `npm run lint`, `npm run typecheck` |
| Pre-commit gate | | | `npm run verify` (lint → typecheck → test → build → check:package → size) |

## Coverage by category

**Unit (`tests/unit`):** units, geometry and viewport transforms; every validation issue
class; migrations; parsing; binding (paths, own-property resolution, formatting, missing
values, conditions); check digits, Code 128 set selection, EAN/UPC/ITF structure, GS1 rules;
barcode layout (quiet zones, fixed X, dot snapping, ITF ratio, truncation, QR);
render tree, allowlist, escaping, SVG well-formedness, determinism, immutability; text layout
policies; EditorStore (validation gate, undo/redo, coalescing, limits, dirty tracking,
external replacement, listeners); interactions (snapping, rotated resize, align); batch
(order, policies, progress, abort, consumer break, async sources, limits); print layout and
documents; storage contract (memory and localStorage); architecture boundaries; public API
contract.

**Integration (`tests/integration`):** **independent decoding** of every symbology,
encoder-level and full-renderer (zxing-cpp/wasm after resvg rasterization), including dot
snapping, rotation, bearer bars, inch/px units and UTF-8 QR; every preset template validated,
rendered and decoded; React editor flows (RTL): add, edit, validation errors, keyboard,
layers, external replacement, invalid templates, save concurrency, failure and unmount,
slots, theme, headless, renderer components, storage conflicts; jsdom axe scan; README
examples.

**Security (`tests/security`):** prototype pollution, injection (text, attributes, titles,
HRI, colours), unsafe image sources, oversized and deep input, bound-value limits, getters,
throwing host callbacks, and listener isolation.

**Browser (`tests/browser`, real Chromium; Firefox/WebKit optional):** create, drag, resize,
numeric X/Y/W/H, invalid numeric input, undo/redo shortcuts, save + reload, save failure,
sample-data switching, missing-data placeholder, **on-screen barcode decoded**, host print
callback, keyboard-only flow, axe with colour contrast, invalid-template error, host shell
unchanged, CSS scoping, 375 px viewport, themed + custom UI kit, headless, renderer-only
bundle, 20× mount/unmount listener check, zoom/fit/ctrl+wheel, multi-select/group
drag/align, marquee; print: **PDF page size**, **A4 label positions**, calibration page,
print dialog (modal, focus, Escape), sandboxed print frame.

**Next.js (`tests/nextjs`, production server, packed tarball):** SSR markup, hydration
without console errors, API persistence with revisions, 409 conflicts, server-side 422
validation, Ant Design slots, unchanged host shell, server-rendered SVG decoded, batch check.

**Performance:** see [PERFORMANCE.md](PERFORMANCE.md). CI assertions use generous ceilings;
precise numbers come from the reference machine.

## Environment-dependent gates

| Gate | Requirement | Status |
| --- | --- | --- |
| Browser tests | Playwright browsers (`npx playwright install`) | Run locally (Chromium, Firefox, WebKit) |
| Next.js tests | Network for `npm install` in the example | Run locally |
| CI pipeline | GitHub Actions runner | Workflow defined (`.github/workflows/ci.yml`); **not yet run on a CI host** |
| React 18 compatibility | React 18 install in a consumer | **Not yet verified** |
| Physical printing | Representative printers | **Not yet performed**: see [PRINTING.md](PRINTING.md#physical-validation-checklist) |
| Physical scanning / verifier grades | Scanners, verifier | **Not yet performed** |
| Manual screen-reader pass | NVDA/VoiceOver | **Not yet performed**: see [ACCESSIBILITY.md](ACCESSIBILITY.md) |

Missing browsers or tools cause a test to **fail**, never to skip silently. The only
skipped tests are the Chromium-only CDP checks (listener leaks, PDF), which are explicitly
skipped on Firefox/WebKit with a reason.

## Release gates

All mandatory gates in [ACCEPTANCE_CRITERIA.md](ACCEPTANCE_CRITERIA.md).
