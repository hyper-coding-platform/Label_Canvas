# Architecture

## Goals

A label design and barcode SDK for React/Next.js ERP applications that is

* **embeddable**: the host keeps its own shell, theme and data
* **layered**: core engine → React bindings → default UI → customisation → headless
* **deterministic**: the same template and the same record give the same output
* **lightweight**: renderer-only consumers never load editor code

## Layers and entry points

```
┌───────────────────────────────────────────────────────────────┐
│ @your-org/erp-label-studio            (default UI, "use client")│
│   LabelEditor / BarcodeEditor, panels, slots, theme             │
├───────────────────────────────────────────────────────────────┤
│ /headless   useEditorStore, useEditorSelector, useEditorCommands │
│ /renderer   LabelRenderer, BarcodePreview (React, no editor)     │
├───────────────────────────────────────────────────────────────┤
│ /core   (no React, no DOM at import time)                       │
│   schema · validation · migrations · units · geometry           │
│   binding · conditions · formatting                             │
│   barcode encoders + adapter · render tree · SVG serialiser     │
│   batch generation · print layout + print document              │
│   presets · storage adapters · EditorStore (headless state)     │
└───────────────────────────────────────────────────────────────┘
```

Dependency rule: lower layers never import higher layers. `src/core/**` must
not import `react`, `react-dom` or anything under `src/react/**`. This is
enforced by a test (`tests/unit/architecture.test.ts`) and by a post-build check.

## Source layout (as built)

```
src/
  core/                       framework-independent; no React, no DOM at import time
    schema/                   types.ts (schema v1), limits.ts, fonts.ts
    validation/               validate-template.ts (decoder), parse-template.ts (+ migrations),
                              validate-data.ts, context.ts (decode helpers)
    binding/                  path.ts, resolve.ts, format.ts, conditions.ts, sample.ts, infer-schema.ts
    geometry/                 units.ts, rect.ts, viewport.ts
    barcode/                  code128.ts, ean-upc.ts, itf.ts, gs1.ts, qr.ts, checksum.ts,
                              adapter.ts (default adapter + symbology info), cache.ts, types.ts
    render/                   nodes.ts (allowlist), svg-serializer.ts, render-label.ts,
                              barcode-layout.ts, text-layout.ts, image-policy.ts
    batch/                    generate.ts
    print/                    layout-types.ts, layout.ts, document.ts, browser-print.ts, calibration.ts
    presets/                  sizes.ts, templates.ts, registry.ts
    storage/                  storage.ts (contract, memory + localStorage adapters)
    editor/                   editor-store.ts, commands.ts, element-factory.ts, interactions.ts
    errors.ts
  react/
    renderer/                 LabelRenderer, BarcodePreview, to-react, canvas-measurer
    headless/                 hooks.ts, use-template-storage.ts
    editor/                   LabelEditor (shell, save flow, keyboard), EditorToolbar, EditorCanvas,
                              Rulers, LayersPanel, PropertiesPanel, PrintDialog, StatusBar,
                              slots.tsx, theme.ts, config.ts, context.ts, icons.tsx
  entries/                    core.ts, renderer.ts, headless.ts, index.ts (public surface)
  styles/styles.css           scoped stylesheet → dist/styles.css
scripts/                      post-build.mjs, test-pack.mjs, bench.mjs, check-licenses.mjs
tests/                        unit · integration · security · browser · browser-perf · nextjs · fixtures
examples/
  basic-react-app/            Vite harness (ERP shell, scenarios) consuming dist/ (browser tests)
  nextjs-app/                 Next.js App Router consumer installing the packed tarball
```

Folder names differ from the spec's illustrative layout where a simpler grouping was
clearer. For example, interactions live in `core/editor/interactions.ts` (pure,
testable without React), and element rendering is one module (`render-label.ts`) rather
than one folder per element type, because the element renderers share layout helpers.

## Data flow

```
JSON (untrusted) ──parseTemplate──► migrate ──► validateTemplate ──► LabelTemplate (trusted shape)
                                                               │
record (untrusted) ──────────────────────────────┐             │
                                                 ▼             ▼
                                        renderLabel(template, record, options)
                                                 │  bind values (safe paths)
                                                 │  evaluate conditions
                                                 │  encode barcodes (adapter)
                                                 │  layout text (TextMeasurer)
                                                 ▼
                                   RenderResult { root: RenderNode, issues }
                          ┌──────────────────────┼─────────────────────────┐
                          ▼                      ▼                         ▼
                renderNodeToSvgString     <LabelRenderer> (React)   buildPrintDocument
                (export / server)         (preview / editor)        (print iframe)
```

`generateLabels` iterates records lazily, calls `renderLabel` per record, and
yields results one at a time. Nothing in it accumulates all output in memory.

## Editor architecture

* `EditorStore` (core) is the single source of truth for the editing session:
  `{ template, selection, viewport, history, dirty, saveState }`. Commands are
  pure functions `(template, args) → template` that the store applies through
  `apply(command)`, which validates the result before committing it and pushes
  a history entry (structural sharing: unchanged elements keep their object
  identity).
* Drag and resize update a transient *preview* (a ref plus requestAnimationFrame)
  and commit a single command on pointer-up. Pointer moves never create history
  entries.
* Controlled mode: when the `template` prop changes to a value the editor did
  not emit, the store replaces the template, clears history and preserves the
  selection of ids that still exist. This is documented as "external
  replacement".
* Panels subscribe to slices with `useEditorSelector`, so moving an element
  re-renders the canvas overlay and the properties of that element only.

## Extension points

| Extension | Mechanism |
| --- | --- |
| Theme | `theme` prop (typed tokens → `--els-*` custom properties) or plain CSS variables |
| Layout | `ui` prop: toolbar position, panel visibility and widths, rulers, status bar |
| Components | `components` prop slots: `Button`, `IconButton`, `TextInput`, `NumberInput`, `Select`, `Checkbox`, `FieldPicker`, `PropertySection`, `Toolbar`, `SaveButton`, `StatusBar` |
| Headless | `/headless` hooks + `/core` `EditorStore` |
| Barcode | `BarcodeAdapter` interface |
| Text metrics | `TextMeasurer` interface |
| Images | `ImagePolicy` |
| Persistence | `TemplateStorage` interface or `onSave` callback |
| Presets | `registerPresetSize`, `registerPresetTemplate` (per registry instance) |

Custom components receive the same props contract as the defaults (value,
onChange, label, id, disabled, invalid, describedBy). All edits still pass
through store commands, so a replaced component cannot bypass validation.

## Error model

All thrown errors extend `LabelStudioError` with a stable `code`
(`TEMPLATE_INVALID`, `SCHEMA_VERSION_UNSUPPORTED`, `BINDING_PATH_INVALID`,
`BARCODE_VALUE_INVALID`, `RENDER_FAILED`, `TEMPLATE_CONFLICT`,
`LIMIT_EXCEEDED`, `ABORTED`, …) and structured `details`. Validation returns
`ValidationIssue[]` (`{ code, severity, path, message }`) instead of throwing, and
`assertValidTemplate` throws a `TemplateValidationError` that carries those
issues.

See [DECISIONS.md](DECISIONS.md) for the reasoning behind each choice.
