# How It Is Implemented

This document explains how each part of `@pythonprakash/erp-label-studio` works internally: what
each module does, the rules it follows, and where the code lives. It is meant for developers
who maintain the SDK or need to understand how it behaves before relying on it.

* What to call: [API.md](API.md).
* Why it was built this way: [DECISIONS.md](DECISIONS.md) (referenced below as D-0xx).
* How to install it in another application: [USING_IN_OTHER_APPS.md](USING_IN_OTHER_APPS.md).

## 1. The big picture

Everything is built around one pipeline. A template (JSON) and a data record go in. A neutral
render tree comes out, and every output format is produced from that tree.

```
untrusted JSON ─► parseTemplate ─► migrate ─► validateTemplate ─► LabelTemplate (frozen)
                                                                    │
data record ────────────────────────────────────────┐               │
                                                    ▼               ▼
                                         renderLabel(template, record, options)
                                           1. resolve bindings (safe paths, formats, fallbacks)
                                           2. evaluate conditions (declarative, no eval)
                                           3. encode barcodes (BarcodeAdapter)
                                           4. lay out text (TextMeasurer) and symbols (physical units)
                                                    ▼
                                    RenderResult { ok, root: RenderNode, issues }
                        ┌───────────────────────────┼──────────────────────────────┐
                        ▼                           ▼                              ▼
              renderNodeToSvgString        renderNodeToReact             buildPrintDocument
              (server, export, batch)      (LabelRenderer, editor)       (print iframe HTML)
```

There is exactly one layout implementation. The editor canvas, the preview component, bulk
generation, server SVG and printing all call `renderLabel`, so what you design is exactly
what prints (D-009).

### Package layers

| Layer | Folder | Entry point | Depends on |
| --- | --- | --- | --- |
| Core engine | `src/core/**` | `/core` | `qrcode-generator` only. No React, no DOM at import time |
| React renderer | `src/react/renderer/**` | `/renderer` | core, React |
| Headless hooks | `src/react/headless/**` | `/headless` | core, renderer, React |
| Default editor UI | `src/react/editor/**` | `.` (root) | all of the above |

Lower layers never import higher ones. `tests/unit/architecture.test.ts` enforces this, and
`scripts/post-build.mjs` checks it again on the built output: it walks the import graph of
`dist/core.js`, fails if React appears, and imports the file in plain Node to prove it has
no DOM side effects at load time.

## 2. Template model — `src/core/schema/`

* `types.ts` defines schema version 1: `LabelTemplate` = `{ schemaVersion, id, name,
  canvas, elements, … }`. There are six element types: `text`, `barcode`, `qrcode`,
  `image`, `rect` and `line`.
* All geometry is stored in the template's own unit (`mm`, `in` or `px`, where px = 1/96 in).
  Font sizes are always in points. The editor zoom never changes stored geometry (D-008).
* An element's content is a `ValueSource`: either `{ kind: "static", value }` or
  `{ kind: "field", path, format?, fallback?, prefix?, suffix?, required? }`.
* `limits.ts` holds resource limits, all overridable per call. Defaults: 5 MiB template,
  1,000 elements, 1–2,000 mm canvas, 8 path segments, condition depth 4 / 64 nodes, 512 KiB
  images, 4,096-character bound values.
* `fonts.ts` defines four built-in system font stacks (`sans`, `serif`, `mono`,
  `condensed`). Nothing is downloaded. Hosts can register more ids with
  `createFontRegistry`.

The full format is specified in [TEMPLATE_FORMAT.md](TEMPLATE_FORMAT.md).

## 3. Validation and parsing — `src/core/validation/`

**`validateTemplate` is a decoder, not a checker** (`validate-template.ts`). It walks the
untrusted input and builds a new object that contains only known properties. It never
mutates or returns the input. Specifically:

* Unknown properties, unknown element types and unsupported versions are errors, not
  silently ignored.
* Every problem is collected in one pass as an `Issue` (`{ code, severity, path, message,
  elementId? }`), where `path` is a JSON-pointer such as `/elements/3/width`. Validation
  never throws for bad input.
* It checks numbers (finite, ranges), ids (`ID_PATTERN`), uniqueness, element bounds
  (allowing up to one canvas-width of overhang), styles, locales, formats, conditions
  (depth and node limits), binding paths, barcode settings against the barcode adapter,
  and image sources against the image policy.
* Warnings (for example text that may overflow) do not make a template invalid.

**`parseTemplate`** (`parse-template.ts`) is the single entry for untrusted input such as
imports, storage loads and API bodies. Its steps:

1. Size check against `maxTemplateBytes`, done before parsing.
2. `JSON.parse`, with errors reported as `TEMPLATE_PARSE_FAILED`.
3. Explicit migrations. Each migration upgrades exactly version `n` to `n + 1` and receives
   a structured clone. Unknown or newer versions are rejected and never guessed.
   `BUILT_IN_MIGRATIONS` is empty because v1 is the first version.
4. Validation.

**`validateTemplateData`** (`validate-data.ts`) dry-runs a record through the renderer and
reports missing required fields, bad barcode data and fields that are not in the schema.
Hosts use it to show problems before printing.

## 4. Data binding — `src/core/binding/`

Binding is deliberately not an expression language (D-012). There is no `eval`, no
`new Function` and no template strings.

* `path.ts` parses dot paths such as `product.variants.0.size`. It rejects `__proto__`,
  `prototype`, `constructor`, brackets and paths longer than `maxPathSegments`.
* `resolve.ts` walks the record using own properties only and returns
  `ok | missing | invalid`. Missing means `undefined`, `null` or `""` with no fallback.
  Objects and arrays are not scalars, so they are `invalid`. It never mutates the record.
* `format.ts` formats values: text (upper/lower/title case, `maxLength`), numbers (deterministic, locale-independent
  by default, with `Intl` only when a locale is given), currency, and dates. Dates use
  `YYYY-MM-DD` strings interpreted as UTC, and impossible dates such as 2026-02-30 are
  rejected rather than rolled over.
* `conditions.ts` evaluates declarative conditions: presence (`exists`, `missing`, `empty`,
  `notEmpty`), comparisons (`eq` … `startsWith`) and `all`/`any`/`not` groups.
* `infer-schema.ts` builds a `DataSchema` from a sample ERP record. It is bounded and
  cycle-safe, and skips unsafe keys. `sample.ts` builds a preview record from schema
  examples.

See [DATA_BINDING.md](DATA_BINDING.md).

## 5. Barcodes — `src/core/barcode/`

Linear encoders are written in-house. QR uses `qrcode-generator`, the package's only runtime
dependency (D-007).

| File | Implementation |
| --- | --- |
| `code128.ts` | Chooses start and set switches (A/B/C) by dynamic programming to minimise symbol length; computes the check character; max 80 data items |
| `gs1.ts` | GS1-128: an AI table with per-AI length and charset rules, FNC1 separators after variable-length AIs, GTIN/SSCC check digits, date validation, duplicate-AI detection |
| `ean-upc.ts` | EAN-13, EAN-8, UPC-A. Check digit computed when omitted, verified when supplied (never silently replaced) |
| `itf.ts` | ITF-14 with check digit and optional bearer bars |
| `qr.ts` | Wraps `qrcode-generator`: byte mode UTF-8, EC levels L/M/Q/H |
| `adapter.ts` | `defaultBarcodeAdapter` (`validate` + `encode`) and per-format metadata (`SYMBOLOGIES`) |
| `cache.ts` | `createCachingBarcodeAdapter`: an opt-in bounded LRU, one per wrapper instance (D-021) |

Encoders return abstract symbols: a `LinearSymbol` (module widths plus quiet zones) or a
`MatrixSymbol` (a module grid). Invalid input throws `BarcodeValueError` with a `reason`.
**Invalid or missing data never produces a symbol.** Instead, the renderer reports an issue,
and in design mode draws a placeholder that cannot be mistaken for a barcode.

Every supported format is verified by rendering to SVG, rasterising with resvg and decoding
with zxing-wasm, which is an independent decoder (`tests/integration/`). A custom
`BarcodeAdapter` can add formats without changing package code.

## 6. Rendering — `src/core/render/`

* **`render-label.ts`** is pure and deterministic. `prepareTemplate` validates once and
  caches a deep-frozen copy in a `WeakMap` keyed by template identity, which is the only
  cache. `renderLabel` then renders each visible element whose condition passes, wraps it
  in a group with its rotation transform, and collects issues. `ok` is false when any
  record-level error occurred, such as a missing required field or invalid barcode data.
  It has two modes: `output`, which omits elements that cannot render, and `design`, which
  draws marked placeholders.
* **`text-layout.ts`** handles text measurement and layout. The default
  `estimateTextMeasurer` uses per-font character-class width averages: it needs no DOM, is
  deterministic, and is accurate to roughly ±10% for Latin text (D-010). Overflow policies
  are `clip`, `ellipsis`, `wrap` (greedy, breaking overlong words by character) and
  `shrink` (down to `minFontSize`).
* **`barcode-layout.ts`** converts symbols to physical geometry. Modules are scaled
  uniformly, never stretched, and quiet zones are reserved inside the box. A fixed
  `moduleWidth` that does not fit is an error, not a squeeze. With `printerDpi`, the
  X-dimension snaps down to whole printer dots so bar edges land on dot boundaries, and ITF
  wide:narrow stays within 2.25–3.0. QR codes are square and centred, with a 4-module quiet
  zone. Dark bars are merged into one SVG `path` per symbol.
* **`nodes.ts`** defines the neutral render tree. Every node is built through `node()`,
  which enforces a per-tag attribute allowlist (`svg`, `g`, `rect`, `path`, `line`, `text`,
  `tspan`, `image`, `clipPath`, `defs`, `title`) and value rules (ids, `url(#…)` clip
  references, no markup characters).
* **`svg-serializer.ts`** re-checks the allowlist and escapes every attribute and text node,
  so even a hand-built tree cannot inject markup.
* **`image-policy.ts`** accepts by default only base64 PNG/JPEG/GIF/WebP data URIs whose
  leading bytes match the declared type, up to 512 KiB. SVG images are never accepted.
  Remote URLs are allowed only if the host supplies `allowUrl`, and then only over
  `https:`. The policy is checked again at render time.

## 7. Bulk generation — `src/core/batch/generate.ts`

`generateLabels` is a pull-based async generator, so memory stays bounded at any dataset
size:

* A record is read and rendered only when the consumer asks for the next label. Nothing
  accumulates unless the caller collects it.
* Output follows input order. Input can be any `Iterable` or `AsyncIterable`, for example
  pages streamed from an ERP API.
* Every `chunkSize` labels (default 50) it yields to the event loop, so a browser UI stays
  responsive.
* It can be cancelled with an `AbortSignal` (throws `AbortError`) or by `break`ing out of the
  loop, which closes the source iterator.
* Error policies are `include` (default; failed records are yielded with `ok: false`),
  `skip`, and `fail-fast`. Template errors are fatal before the first record.
* `maxRecords` (default 100,000) guards against runaway jobs.

Measured on the reference machine: 1,000 records in 363 ms, and 10,000 in 3.66 s with a flat
heap (about 6.4 MB). See [PERFORMANCE.md](PERFORMANCE.md).

## 8. Printing — `src/core/print/`

* `layout.ts` (`computePageSpec`, `paginate`) is pure layout maths for **roll** layouts (one
  label per page, sized to the label) and **sheet** layouts (page, margins, columns × rows,
  gaps, cell size). It reports `PRINT_LAYOUT_OVERFLOW`, `PRINT_LABEL_EXCEEDS_CELL` and
  `PRINT_UNPRINTABLE_AREA`, and supports copies and skipping slots on partly used sheets.
* `document.ts` (`buildPrintDocument`) produces a self-contained HTML document: an `@page`
  size equal to the media, zero margins, physical units and no scripts. Markup comes only
  from the escaping serializer and from numbers this module formats. Each record is
  rendered once and copies reuse that markup. Invalid records are skipped and listed in
  `skipped`, or fail the whole job when `invalidRecords: "fail"` is set. `maxLabels` defaults
  to 2,000.
* `browser-print.ts` (`printLabels`, `printHtml`) creates an off-screen iframe sandboxed with
  `allow-same-origin allow-modals` only (no scripts), filled via `srcdoc`. It waits for
  fonts, calls `print()`, and removes the iframe on `afterprint`, on timeout or on abort. On
  the server it throws `PRINT_UNAVAILABLE`.
* `calibration.ts` builds a page with rulers, label outlines and centre marks for
  calibrating a real printer.

Browsers always show a print dialog. Silent thermal printing needs a print agent that the
host provides (D-015). See [PRINTING.md](PRINTING.md).

## 9. Presets — `src/core/presets/`

The SDK ships 19 media presets (`sizes.ts`) and 10 industry templates (`templates.ts`), each
with a `dataSchema` and `sampleData`. They are built lazily on first use: building them at
module load defeated tree-shaking (found by `npm run size`). `getPresetTemplate` always
returns an editable deep copy, so later changes to built-ins never alter a user's saved
templates. `createPresetRegistry` gives an isolated registry for host-specific presets, and
built-ins cannot be replaced.

## 10. Persistence — `src/core/storage/storage.ts`

The SDK never calls a backend by itself (D-014). `TemplateStorage` is a four-method contract
(`get`, `save`, `delete`, `list`) with **optimistic concurrency**:

* Each stored template has a `revision` that starts at 1 and increases by 1 per save.
* `save(template, { expectedRevision })` throws `TemplateConflictError` when the stored
  revision differs, and `expectedRevision: null` means create.
* Adapters validate before saving and on read.

There are two bundled adapters: in-memory (tests, demos, server caches), and `localStorage`
(drafts only; 2 MiB / 200 templates by default; corrupted entries are skipped and reported).
Production apps implement the contract over their own API. The server must validate again
with `parseTemplate`.

## 11. Editor state — `src/core/editor/`

The editing session is framework-independent and uses no state-management library (D-011).

* **`editor-store.ts`** (`createEditorStore`) holds `{ template, selection, viewport,
  settings, history, dirty, saveState, lastRejection, revision }`.
  * **Validation gate:** every command result is validated before it is committed. Invalid
    results are rejected and reported in `lastRejection`, so no UI, default or custom, can
    put the template into an invalid state.
  * **History** stores template snapshots with structural sharing, so unchanged elements
    keep their identity and memory grows with the size of edits, not the template. Entries
    with the same `coalesceKey` merge within `coalesceMs`, which groups typing and nudging.
    The stack is capped at 200 entries by default.
  * `replaceTemplate` (an external change) clears history, so undo never crosses an
    external replacement.
  * Listeners are isolated: if one throws, the others still run, and the error is rethrown
    asynchronously.
* **`commands.ts`** holds pure reducers: `addElements`, `updateElement(s)`, `moveElements`,
  `removeElements`, `duplicateElements`, `reorderElement`, `setCanvas` and `setMeta`.
* **`interactions.ts`** holds pure geometry for snapping to grid, edges and centres
  (returning guide lines), rotation-aware resize from 8 handles, and alignment.
* **`element-factory.ts`** creates valid new elements sized for the template's unit.

## 12. React renderer — `src/react/renderer/`

* `to-react.tsx` (`renderNodeToReact`) converts the render tree into React SVG elements. Text
  becomes React text children, which React escapes. `dangerouslySetInnerHTML` is never used.
* `LabelRenderer.tsx` renders one label for one record at physical size (for example
  `50mm`), at `fill`, or at a fixed width. Invalid templates render `fallback`, and
  `onRender` receives the issues.
* `BarcodePreview.tsx` renders a single symbol through the same core renderer.
* `canvas-measurer.ts` (`createCanvasTextMeasurer`) measures text with real installed fonts
  through `CanvasRenderingContext2D.measureText`. It measures at a 100 px reference size,
  uses an LRU cache, and falls back to the estimator during SSR. Use the same measurer for
  preview and print.

## 13. Headless hooks — `src/react/headless/`

* `useEditorStore` creates and owns a store for the component's lifetime. It deliberately
  does not destroy the store in effect cleanup, because React StrictMode re-runs effects on
  the same state (D-018).
* `useEditorSelector` uses `useSyncExternalStore` with a selector and equality function, so
  a panel re-renders only when its slice changes.
* `useControlledTemplate` provides controlled-mode semantics: it emits committed changes and
  adopts a new `template` prop only when it differs from what the editor last emitted.
* `useTemplateStorage` handles loading, not-found and error states, aborts stale loads, and
  saves with revision checks.

## 14. Default editor UI — `src/react/editor/`

* **`LabelEditor.tsx`** is the shell. It renders only inside its own root (`.els-root`): no
  portals to `<body>`, no routing, no global listeners left behind. It owns:
  * the save flow: one save at a time, errors shown inline and passed to `onError`, the
    template stays dirty, and late results are ignored after unmount;
  * keyboard shortcuts;
  * an `aria-live` announcer;
  * a per-editor caching barcode adapter.

  All host callbacks are wrapped so an exception never breaks the editor.
* **`EditorCanvas.tsx`** handles the SVG canvas, viewport (fit, zoom at cursor, pan) and
  pointer interactions. Drag performance (D-020): the label layer and hit layer are
  memoized independently of drag state. On drag start, the dragged elements are cloned
  once into a separate layer moved by a CSS transform, and pointer-up commits a single
  command. This gives about 16 ms per move at 1,000 elements. A non-passive wheel listener
  enables Ctrl+wheel zoom.
* **`PropertiesPanel.tsx`, `LayersPanel.tsx`, `EditorToolbar.tsx`, `Rulers.tsx` and
  `StatusBar.tsx`** subscribe to store slices and dispatch commands. They never mutate the
  template.
* **`PrintDialog.tsx`** is a modal inside the editor root with focus containment. It shows a
  fully sandboxed preview iframe of the exact print document.
* **`slots.tsx`** defines replaceable primitives (`Button`, `TextInput`, `NumberInput`,
  `Select`, `Checkbox`, `ColorInput`, `Field`, `Section`). Hosts pass their own components,
  for example Ant Design, and edits still go through store commands.
* **`theme.ts`** maps typed tokens to scoped `--els-*` CSS custom properties. Values are
  sanitised so they cannot break out of a declaration.
* **`src/styles/styles.css`**: every rule is scoped under `.els-root` or `.els-preview`.
  There are no resets, fonts or `html`/`body` rules. Layout uses container queries, so it
  responds to the editor's container rather than the window.

## 15. Build and packaging

| Step | Tool | Result |
| --- | --- | --- |
| Bundle | `tsup` (`tsup.config.ts`) | ESM only, target ES2020, `platform: "neutral"`, code splitting across the 4 entries, React and `qrcode-generator` external, source maps |
| Types | tsup `dts` | `dist/*.d.ts` per entry, plus shared chunks |
| Post-build | `scripts/post-build.mjs` | Prepends `"use client"` to `index.js`, `renderer.js` and `headless.js`; copies `styles.css`; checks that core is React-free; does a Node import smoke test |
| Package checks | `publint --strict`, `attw` (`npm run check:package`) | `exports` map valid; types resolve under node16-ESM and bundler resolution |
| Size budgets | `size-limit` (`npm run size`) | Per-entry minified + brotli budgets ([PERFORMANCE.md](PERFORMANCE.md)) |
| Tarball gate | `scripts/test-pack.mjs` (`npm run test:pack`) | `npm pack` → file allowlist → clean install into `examples/nextjs-app` → resolves every entry point → confirms internal paths are blocked → `next build` |

The `exports` map in `package.json` is the public contract. `sideEffects: ["**/*.css"]` lets
bundlers tree-shake all JavaScript while keeping the stylesheet import. React and React DOM
are optional peer dependencies, so `/core`-only consumers (servers, workers) do not need them
(D-017).

## 16. Quality gates

| Suite | Command | Covers |
| --- | --- | --- |
| Unit | `npm run test:unit` | Core modules, store, hooks, RTL component tests, jsdom axe, public API snapshot, architecture boundaries |
| Integration | `npm run test:integration` | Independent barcode decoding (resvg + zxing-wasm), presets, storage contract |
| Security | `npm run test:security` | Prototype pollution, SVG/HTML injection, URL schemes, oversize input, callback hardening |
| Browser | `npm run test:browser` (`:all` for 3 browsers) | Drag/resize/keyboard, on-screen barcode decode, PDF page geometry, style leak, 375 px layout, mount/unmount leaks, axe |
| Next.js | `npm run test:nextjs` | Packed tarball in a real App Router app: SSR, hydration, API persistence, 409 conflicts, Ant Design slots |
| Benchmarks | `npm run bench`, `npm run bench:editor` | Render, batch and editor drag timings |

`npm run verify` runs lint, typecheck, tests, build, package checks and size budgets in one
command. CI (`.github/workflows/ci.yml`) runs everything on Node 22 and 24. Current status and
open items are in [IMPLEMENTATION_PLAN.md](IMPLEMENTATION_PLAN.md).
