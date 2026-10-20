# Acceptance Criteria (Release Gates)

The package is ready for release review only when every **mandatory** gate
passes. Each gate names the evidence that proves it. A gate whose evidence was
not produced counts as **NOT VERIFIED**, not as passing.

| # | Gate | Evidence | Mandatory |
| --- | --- | --- | --- |
| G1 | Builds from a clean install (`npm ci && npm run build`) | CI log / local run | ✅ |
| G2 | Type declarations correct for all entries | `npm run check:package` (attw + publint) | ✅ |
| G3 | Every documented import resolves from the packed tarball | `npm run test:pack` | ✅ |
| G4 | `/core` imports no React and touches no DOM globals at import | architecture test + post-build check + Node import smoke | ✅ |
| G5 | Templates are validated before render/print/edit; invalid → structured errors | unit + security suites | ✅ |
| G6 | Unit conversion and geometry tests pass | unit suite | ✅ |
| G7 | Dynamic fields resolve correctly incl. missing/null/empty/fallback/conditions | unit suite | ✅ |
| G8 | Missing/invalid barcode values never produce a symbol | unit + security suites | ✅ |
| G9 | Every supported symbology decodes via independent decoder (zxing-cpp) | `tests/integration/barcode-decode.test.ts` | ✅ |
| G10 | Editor workflows pass in a real browser (create, add, drag, resize, edit X/Y/W/H, undo/redo, save/reload, preview, print preview, keyboard, small viewport, mount/unmount) | Playwright suite | ✅ |
| G11 | Undo/redo semantics (grouping, deletion restore, external replace) | unit + browser | ✅ |
| G12 | Print layouts pass automated geometry checks | unit suite + browser print-preview test | ✅ |
| G13 | Physical print validation on representative printers | signed checklist in `docs/PRINTING.md` | ✅ for any release claiming hardware compatibility |
| G14 | Physical scanner validation of printed symbols | signed checklist | ✅ for any release claiming scanner compatibility |
| G15 | Bulk generation is bounded, ordered on request, progress-reporting and cancellable | unit + performance suites | ✅ |
| G16 | Security fixtures produce no unsafe output/binding behaviour | security suite | ✅ |
| G17 | Next.js App Router integration: build + SSR page load without errors/hydration warnings | `examples/nextjs-app` build + Playwright | ✅ |
| G18 | Host shell preserved and no style leakage | Playwright host-shell tests | ✅ |
| G19 | Works with default UI, custom theme, replaced components, and headless API without package changes | Playwright + RTL | ✅ |
| G20 | Bundle budgets met or documented exception | `npm run size` | ✅ |
| G21 | Performance budgets met or documented exception | `npm run bench` + PERFORMANCE.md | ✅ |
| G22 | No critical/high unresolved issues without approved disposition | `npm audit`, issue list | ✅ |
| G23 | All public APIs documented | docs/API.md review against export list (`tests/unit/public-api.test.ts`) | ✅ |
| G24 | No placeholder/unimplemented exports | public-api test + grep for TODO/FIXME in `src` | ✅ |
| G25 | CI workflow defined and passes | CI run | ✅ (NOT VERIFIED until it runs on a CI host) |

## Initial budgets (subject to measurement; changes must be recorded in PERFORMANCE.md)

| Budget | Target |
| --- | --- |
| `/core` gzip (all exports) | ≤ 35 KB |
| `/renderer` gzip incl. core deps it pulls | ≤ 40 KB |
| full entry gzip (editor) | ≤ 90 KB |
| Render single 10-element label (warm, Node, reference machine) | ≤ 2 ms median |
| 1,000 records → SVG strings | ≤ 2 s on reference machine |
| 10,000 records incremental | completes; heap growth bounded (no linear retention) |
| Editor drag frame (100 elements) | ≤ 16 ms scripting per pointer-move frame (Chromium trace) |
| Max elements per template (hard limit, configurable) | 1,000 |

## Gate status — 2026-10-20 (v0.1.0, unreleased)

| # | Status | Evidence / note |
| --- | --- | --- |
| G1 | ✅ | `npm run verify` exit 0; clean clone `npm ci && npm run build` (see plan log) |
| G2 | ✅ | `npm run check:package`: publint "All good"; attw green for node16-ESM + bundler on all entries (CJS/node10 intentionally unsupported, D-005) |
| G3 | ✅ | `npm run test:pack`: tarball contents checked; clean install; all entries resolve; internals blocked |
| G4 | ✅ | architecture test + post-build graph check + Node import smoke |
| G5–G8 | ✅ | unit/integration/security suites (422 tests) |
| G9 | ✅ | zxing-cpp decodes every format (encoder, renderer, presets, on-screen in Chromium, server SVG in Next.js) |
| G10–G11 | ✅ | Playwright: Chromium, Firefox, WebKit — 79 passed / 8 explicitly skipped (Chromium-only CDP/PDF); one unexplained 2-test failure in 1 of 6 three-browser runs under load (see plan "Open defects") |
| G12 | ✅ (automated) | PDF page sizes and A4 label positions verified in Chromium |
| G13 | ❌ NOT PERFORMED | no physical printers available — release must not claim hardware compatibility |
| G14 | ❌ NOT PERFORMED | no scanners/verifier available — release must not claim scanner compatibility |
| G15–G16 | ✅ | batch + security suites; bench: 10k records heap flat |
| G17 | ✅ (Next 16.4.2 + React 19.3.1) | production server tests 8/8; React 18 **not verified** |
| G18–G19 | ✅ | host-shell, CSS-scope, theme, Ant Design slots, headless tests |
| G20 | ⚠️ exception | core "all exports" 36.88 kB vs 35 kB — documented in PERFORMANCE.md, **awaiting owner approval**; all other size budgets pass |
| G21 | ⚠️ exception | 1,000-element drag 15.6–16.5 ms (at limit); supported interaction target documented as ≤ 500 elements — **awaiting owner approval** |
| G22 | ✅ | `npm audit` 0 vulnerabilities (prod and dev); no known critical/high issues |
| G23–G24 | ✅ | public-api test (exports ⇔ docs/API.md); architecture test (no TODO/placeholders) |
| G25 | ❌ NOT VERIFIED | `.github/workflows/ci.yml` defined; never run on a CI host |

**Readiness: NOT YET VERIFIED** — CI has not run, two budget exceptions need approval, and physical print/scan validation has not been performed.
