# Architecture Decision Record

Each decision lists its context, the choice, and the evidence. Decisions are
append-only: to reverse one, add a new entry that supersedes it.

## D-001 Repository starting point (2026-10-19)

**Context.** Phase 0 inspection found a directory with three user-authored text
files (`initial_prompt.txt`, `initial recommendations.txt`,
`Useful continuation.txt`), no source code, no package manifest and no Git
repository.

**Decision.** Create the package from scratch in place. The three text files are
user notes. They are preserved unmodified and listed in `.gitignore` so that
they are never published or committed by accident.

## D-002 Package manager and runtime (2026-10-19)

**Context.** Available: Node.js 25.9.0, npm 11.12.1, Git 2.52. pnpm and yarn are
not installed.

**Decision.** Use npm with a committed `package-lock.json`. The supported Node.js
range for *development* is `>=20.19` (required for stable `require(esm)` and
the toolchain). The published package has no Node.js runtime requirement beyond
ES2020 support because it runs in browsers and in SSR.

## D-003 TypeScript version (2026-10-19)

**Context.** `typescript@7.0.2` (latest) is the native port and does not expose
the JavaScript compiler API (`require('typescript').createProgram` is
`undefined`, verified in a scratch spike). tsup's declaration build and
`@arethetypeswrong/cli` depend on that API.

**Decision.** Pin `typescript@5.9.3` for building and type-checking. Declarations
are written conservatively so that consumers on TypeScript ≥5.0 can read them.

## D-004 Single package, multiple entry points (2026-10-19)

**Decision.** Publish one npm package with explicit subpath exports:

| Entry | React? | Contents |
| --- | --- | --- |
| `@your-org/erp-label-studio/core` | No | Schema types, validation, migrations, data binding, units, geometry, barcode encoders, renderer, batch generation, print layout, presets, storage adapters, headless editor store |
| `@your-org/erp-label-studio/renderer` | Yes (`"use client"`) | `LabelRenderer`, `BarcodePreview` only |
| `@your-org/erp-label-studio/headless` | Yes (`"use client"`) | React hooks over the headless editor store, no UI components |
| `@your-org/erp-label-studio` | Yes (`"use client"`) | Everything: core + renderer + headless + full editor UI |
| `@your-org/erp-label-studio/styles.css` | — | Scoped editor and preview styles |

Applications that only print labels import `/core` or `/renderer` and never load
editor code. Server code imports `/core`, which contains no React import and no
browser globals at module initialisation.

## D-005 ESM-only output (2026-10-19)

**Context.** Shipping both ESM and CJS duplicates React-context-holding modules
when a consumer loads both formats (dual package hazard). Next.js, Vite, webpack
5 and Node ≥20.19 (`require(esm)`) all consume ESM.

**Decision.** Ship ES modules only, plus `.d.ts` declarations. Revisit if a
supported consumer demonstrably requires CJS.

## D-006 Build tool (2026-10-19)

**Decision.** tsup (esbuild + rollup-plugin-dts) builds the entries with code
splitting, so shared core code lives in shared chunks rather than being
duplicated per entry. React and React DOM are external peers. A post-build
script adds the `"use client"` directive to the React entry files and verifies
that `core` contains no React import.

## D-007 Barcode encoding strategy (2026-10-19)

**Context.** Measured with esbuild (minified + gzip, browser platform):

| Option | gzip |
| --- | --- |
| bwip-js `code128` only (tree-shaken `bwip-js/generic`) | 48.6 KB |
| bwip-js code128 + EAN/UPC + ITF-14 + GS1-128 + QR + Data Matrix | 97.0 KB |
| qrcode-generator | 7.6 KB |

bwip-js is mature but large for an SDK that must stay lightweight. Linear
symbologies (Code 128, GS1-128, EAN-13, EAN-8, UPC-A, ITF-14) are fully specified
by short, public, deterministic encoding tables (ISO/IEC 15417, ISO/IEC 15420,
ISO/IEC 16390, GS1 General Specifications). QR code encoding is substantially
more complex (Reed–Solomon, masking, version selection).

**Decision.**
1. Implement the linear encoders in the package as a pure module that returns
   module-level geometry (bar/space widths), not images.
2. Use `qrcode-generator` (MIT) for QR code matrices.
3. Data Matrix is **not** supported by the default adapter. It may be added
   later as an optional adapter backed by bwip-js (optional peer dependency).
4. All encoders sit behind a `BarcodeAdapter` interface, so ERPs can swap in a
   different implementation.
5. Every supported format is verified by decoding the package's own SVG output
   with an independent decoder (zxing-cpp via `zxing-wasm`) after rasterisation
   with `@resvg/resvg-js`. Both are dev dependencies only. The pipeline was
   proven in a scratch spike (Code 128 "ABC-123" decoded, `isValid: true`).

## D-008 Coordinate system and units (2026-10-19)

* The origin is the top-left corner of the label, +x right, +y down (same as
  SVG and CSS).
* All geometry in a template is expressed in the template's single declared unit
  (`mm`, `in` or `px`). `px` means a CSS pixel (1/96 in). Units are never mixed
  inside a template.
* Rotation is in degrees, clockwise, about the element's box centre, normalised
  to `[0, 360)`.
* Internal calculations use IEEE doubles. Values are rounded only at output
  boundaries: SVG coordinates to 4 decimal places, and editor display to 2
  decimal places for mm/px and 3 for inches.
* Screen↔label conversion happens only inside the editor viewport transform.
  Zoom never changes saved geometry.

## D-009 One render model, two serialisers (2026-10-19)

**Decision.** The core renderer produces a neutral, immutable `RenderNode` tree
(element name + allow-listed attributes + children/text). Two consumers read it:
`renderNodeToSvgString()` (core, used for export, print and server rendering)
and a React converter (renderer entry, used for preview and the editor canvas
background). There is one layout implementation, and neither consumer uses
`dangerouslySetInnerHTML`. The attribute allowlist is enforced at node
construction and again at serialisation.

## D-010 Text measurement (2026-10-19)

**Context.** Core must run without a DOM, but text overflow detection needs
widths.

**Decision.** Core uses a pluggable `TextMeasurer`. The default is a
deterministic, DOM-free estimator based on per-family average advance widths, so
the same input gives the same output on every platform. Browser integrations
may inject a canvas-based measurer for higher accuracy. The overflow policy per
text element is `clip` (default), `shrink` (down to a minimum font size),
`ellipsis` or `wrap`, and overflow is always reported as a render issue. The
estimator is approximate, and this is documented.

## D-011 Editor state without state-management libraries (2026-10-19)

**Decision.** A framework-independent `EditorStore` (core) holds the template,
selection, viewport and history, and exposes `getState`, `subscribe` and
commands. React binds to it with `useSyncExternalStore` and selector hooks, so
panels re-render only when their slice changes. Transient pointer-drag state is
kept in refs and committed once per animation frame as a preview transform.
Only the pointer-up commits a history entry.

## D-012 Safe bindings and conditions (2026-10-19)

**Decision.** Bindings are structured objects, not expression strings. A path
is a dot-separated list of identifier segments (`/^[A-Za-z_$][A-Za-z0-9_$-]{0,63}$/`)
or non-negative integer indices, at most 8 segments deep. `__proto__`,
`prototype` and `constructor` are rejected at validation and at resolution.
Resolution walks only own properties (`Object.hasOwn`). Conditions are a
declarative tree (`all` / `any` / `not` / comparison leaves) with a depth limit
of 4. No `eval`, `Function` or template-string evaluation exists anywhere.

## D-013 Images (2026-10-19)

**Decision.** Default image policy accepts only `data:` URIs with MIME types
`image/png`, `image/jpeg`, `image/gif` or `image/webp`, base64 encoded, up to
512 KiB decoded. SVG data URIs are rejected (they may contain script). Remote
URLs are rejected unless the host supplies an `imagePolicy.allowUrl(url)`
predicate, and even then only `https:` URLs are accepted. Images are emitted as
`<image href>` and never inlined as markup.

## D-014 Persistence (2026-10-19)

**Decision.** No backend. A `TemplateStorage` interface with optimistic
concurrency (`expectedRevision` → `TemplateConflictError`). The package ships
`createMemoryTemplateStorage()` (tests/demos) and
`createLocalStorageTemplateStorage()` (bounded quota, validation on load,
documented as single-browser and non-authoritative). Authorisation and tenant
isolation remain the responsibility of the host ERP.

## D-015 Printing (2026-10-19)

**Decision.** Baseline printing = browser print of a generated HTML document in
a hidden, sandboxed same-origin iframe using `@page { size; margin: 0 }` and
physical CSS units. Layout calculation (`computePrintLayout`) is a pure function
tested independently. Silent or direct thermal printing is out of scope for the
core and is documented as requiring a host-provided print agent.

## D-016 Styling (2026-10-19)

**Decision.** One stylesheet, every rule scoped under `.els-root` (or
`.els-preview`), with all values from `--els-*` custom properties. It has no
element-only selectors, no resets on `html`/`body`, and no font imports. A
`theme` prop maps typed tokens to inline custom properties on the root
element. The editor inherits `font-family` from the host unless a token
overrides it.

## D-017 React is an optional peer (2026-10-20)

`react`/`react-dom` are marked optional peers so server-only and worker consumers of
`/core` do not need React installed. The React entries require them at runtime.

## D-018 Owned stores are not destroyed in effect cleanup (2026-10-20)

**Context.** Browser tests in React StrictMode showed every edit being rejected: StrictMode
runs effect cleanups and then re-uses state, and the cleanup had destroyed the store.
**Decision.** `useEditorStore` never destroys its store. Subscriptions are released by
`useSyncExternalStore`, and the store is garbage-collected with the component.
`store.destroy()` remains for host-managed stores.

## D-019 Button slot uses `setElement` instead of `buttonRef` (2026-10-20)

Props whose names end in `Ref` make the React Compiler lint treat the whole props object as
ref-like, so host slot implementations failed lint. The callback is named `setElement`,
and slot implementations destructure it.

## D-020 Drag feedback outside React (2026-10-20)

**Evidence.** At 1,000 elements, rebuilding the label tree per pointer move cost 25.7 ms per
move. **Decision.** The label and hit layers are memoized independently of drag state, and
dragged groups are cloned once into a separate layer moved by a CSS transform, with the
originals hidden. Only pointer-up commits to the store. Result: 15.6–16.5 ms per move at
1,000 elements (script 1.2 ms). See PERFORMANCE.md.

## D-021 Opt-in encoding cache (2026-10-20)

QR encoding costs about 1 ms per symbol. The editor wraps its adapter with
`createCachingBarcodeAdapter` (a bounded LRU per editor instance). The core renderer keeps
no global cache, so batch jobs and server rendering are unaffected.

## D-022 Development on Node 25, CI on LTS (2026-10-20)

jsdom 30 and Vitest 5 declare engines `^22 || ^24 || >=26`; Node 25 prints engine warnings
but every suite passes locally. CI and releases use Node 22/24 LTS.

## D-023 Conditional styles as declarative override rules (2026-10-21)

**Context.** Labels need per-record appearance, not only visibility. The motivating case is a
size strip (S, M, L, XL) where the record's size is drawn as white text on black, and hosts
need the same for arbitrary fields.

**Decision.** Every element may carry `styleRules: { when: Condition, set: StyleOverride }[]`.
`when` reuses the existing condition language (D-012), so no new expression syntax exists.
`set` is one flat, cross-type key set (`fill`, `color`, `stroke`, `strokeWidth`, `opacity`,
`fontWeight`, `fontStyle`, `fontSize`). Each element type accepts only the keys that apply to
it (`STYLE_OVERRIDE_KEYS`), and other keys are `UNKNOWN_PROPERTY` errors, consistent with the
strict schema. `renderLabel` merges matching rules into a fresh element before the element
renderer runs (`applyStyleRules`), so batch, print, preview and the editor share the single
render path. Override values reuse the element's own decoders and limits (for example stroke
widths), so an override can never produce an element that would fail validation. Limit:
16 rules per element (`maxStyleRules`).

**Alternatives rejected.** Per-type nested overrides mirroring each element's properties
(heavier for users and the editor, and more validation surface). A separate "variant"
element per case (duplicates geometry and breaks when the layout moves).

## D-024 Shape and drawing element types; schema stays at version 1 (2026-10-21)

**Decision.** Add `shape` (eight outlines defined in a unit square and scaled to the box) and
`drawing` (a pencil stroke whose points are normalized to `[0, 1]` of its box, so move,
resize, rotate, duplicate and unit conversion work unchanged). Both render to a single
`<path>` through the existing allowlist; `stroke-linejoin` was added to it. The editor's
pencil tool (`settings.tool = "pencil"`) captures pointer points in a ref, previews them in
the overlay, and commits one `addElements` command on pointer-up. `createDrawingElement`
simplifies strokes with Ramer–Douglas–Peucker (tolerance about 0.75 screen px) and caps them at
2,000 points (`maxDrawingPoints`).

**Schema version.** These are additive: every existing v1 template stays valid and renders
identically, so `schemaVersion` stays 1 (TEMPLATE_FORMAT "Migrations and compatibility").
Templates that use the new features are rejected by older 0.1.x builds with structured
errors (`ELEMENT_TYPE_UNKNOWN`, `UNKNOWN_PROPERTY`), never misrendered.

## D-025 Hand and Cursor tools reuse the existing viewport pan (2026-10-22)

**Context.** Users zoom into a label and then need to move around it without risking an edit.
The canvas already panned with the middle button or Space+drag through `store.viewport`. That
viewport is a CSS transform on the stage, not a native scroll container.

**Decision.** Add `"hand"` to `EditorSettings.tool` next to `select` (Cursor) and `pencil`. A
Hand pointer-down starts the existing pan gesture at once, with no hit testing, selection,
handles or drag threshold, so the label never jumps. Moves call `setViewport(panBy(start, dx, dy))`.
Pointer capture, `pointercancel` and `lostpointercapture` end it the same way as other
gestures, and changing the tool cancels any gesture in progress. Keyboard: V/H switch tools,
Escape returns to the Cursor, and arrows pan in Hand mode (outside text fields). Hand stays
enabled in read-only mode. Native scrolling was rejected: it would add a second source of
truth for pan, and zoom-at-cursor, rulers and fit already depend on `viewport`. Pan is
unbounded, as it was before, and **Fit to screen** recovers the view.

**Consequences.** No template, history, dirty-state or save changes from navigation (tested
at store, RTL and Playwright level). No new dependency. The label layer is memoized on
zoom, not pan, so a pan frame re-renders only the stage transform, overlays and rulers.

## D-026 Preset catalog in its own `/presets` entry (2026-10-22)

**Context.** `/core` "import everything" measured 38.57 kB against a 37 kB ceiling (35 kB
budget). About 4.6 kB of that is the preset catalog, which most server and render-only users
never need.

**Decision.** Move `getPresetSizes`, `getPresetTemplates`, `getPresetTemplate` and
`createPresetRegistry` (and their types) to `@your-org/erp-label-studio/presets`, a React-free
entry checked by post-build like `/core`. The root entry re-exports it, so editor users change
nothing. `cloneTemplate` moved to `core/validation/clone-template.ts` and stays in `/core`
(storage depends on it). This is a breaking change for `/core` imports of the catalog. It is
acceptable because 0.1.0 has not been published, and the migration is one import line
(CHANGELOG, API.md). Budgets were not changed. A new budget was added for the new entry.
