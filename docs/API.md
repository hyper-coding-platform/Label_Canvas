# API Reference

`@pythonprakash/erp-label-studio` v0.1.0. All exports are ES modules with TypeScript declarations.

| Entry point | Use it for | React needed | Client boundary |
| --- | --- | --- | --- |
| `@pythonprakash/erp-label-studio/core` | Validation, rendering to SVG, bulk generation, printing, storage, headless store | No | No (safe in server code, workers, Node) |
| `@pythonprakash/erp-label-studio/presets` | Built-in label sizes and industry templates; preset registries | No | No (safe in server code, workers, Node) |
| `@pythonprakash/erp-label-studio/renderer` | `LabelRenderer` and `BarcodePreview` React components only | Yes | `"use client"` |
| `@pythonprakash/erp-label-studio/headless` | React hooks to build your own editor UI | Yes | `"use client"` |
| `@pythonprakash/erp-label-studio` | Everything above (including presets), plus the default editor UI (`LabelEditor`) | Yes | `"use client"` |
| `@pythonprakash/erp-label-studio/styles.css` | Scoped styles for the editor and previews | n/a | Import once |

Anything not listed here is internal and may change without notice. The export lists are
enforced by `tests/unit/public-api.test.ts`.

---

## Errors (core)

Every error the SDK throws is a `LabelStudioError` with a stable `code`. Branch on `code`,
not on `message`.

| Export | Description |
| --- | --- |
| `LabelStudioError` | Base class. `code: ErrorCode`, `details: Record<string, unknown>`, optional `cause`. |
| `TemplateValidationError` | `code: "TEMPLATE_INVALID"`. `issues: Issue[]` lists every problem. |
| `BarcodeValueError` | `code: "BARCODE_VALUE_INVALID"`. `format`, `reason` (`charset`, `length`, `checksum`, `date`, `unknown-ai`, `syntax`, `duplicate-ai`, `empty`). |
| `TemplateConflictError` | `code: "TEMPLATE_CONFLICT"`. `expectedRevision`, `actualRevision`. Thrown by storage adapters. |
| `AbortError` | `code: "ABORTED"`. Thrown when an `AbortSignal` is aborted. |
| `isLabelStudioError(value)` | Type guard. |

`ErrorCode` values: `TEMPLATE_INVALID`, `TEMPLATE_PARSE_FAILED`, `SCHEMA_VERSION_UNSUPPORTED`,
`MIGRATION_FAILED`, `BINDING_PATH_INVALID`, `BARCODE_VALUE_INVALID`, `BARCODE_FORMAT_UNSUPPORTED`,
`RENDER_FAILED`, `LIMIT_EXCEEDED`, `TEMPLATE_CONFLICT`, `TEMPLATE_NOT_FOUND`, `STORAGE_FAILED`,
`STORAGE_QUOTA_EXCEEDED`, `PRINT_FAILED`, `PRINT_UNAVAILABLE`, `ABORTED`, `BATCH_RECORD_FAILED`,
`INVALID_ARGUMENT`.

`Issue` = `{ code, severity: "error" | "warning", path, message, elementId? }`. `path` is a
JSON-pointer-like location such as `/elements/3/width`. Validation and rendering return
issues instead of throwing.

---

## Templates: schema, validation, parsing (core)

Types: `LabelTemplate`, `LabelCanvas`, `LabelElement` (`TextElement`, `BarcodeElement`,
`QrCodeElement`, `ImageElement`, `RectElement`, `LineElement`), `ValueSource`
(`StaticValue | FieldValue`), `ValueFormat`, `Condition`, `TextStyle`, `Border`,
`DataSchema`, `DataField`, `DataRecord`, `LengthUnit`, `BarcodeFormat`. The full format is
specified in [TEMPLATE_FORMAT.md](TEMPLATE_FORMAT.md).

| Export | Signature | Notes |
| --- | --- | --- |
| `CURRENT_SCHEMA_VERSION` | `1` | |
| `validateTemplate` | `(input: unknown, options?: ValidateOptions) => ValidationResult` | `{ valid, issues, template? }`. `template` is a normalized copy with only known properties, present when valid. Never throws for bad input. |
| `parseTemplate` | `(input: string \| unknown, options?: ParseOptions) => ParseResult` | Use for **all untrusted input** (imports, storage, API bodies): size check → JSON parse → migrations → validation. `{ ok: true, template, warnings, migratedFrom? }` or `{ ok: false, issues }`. |
| `migrateTemplate` | `(input, migrations?) => …` | Low-level migration runner. Unknown or newer versions are rejected and never reinterpreted. |
| `BUILT_IN_MIGRATIONS` | `readonly TemplateMigration[]` | Empty: schema v1 is the first version. |
| `serializeTemplate` | `(template, space?) => string` | Stable JSON for export or storage. |
| `validateTemplateData` | `(template, record, options?: { schema?, …renderOptions }) => Issue[]` | Dry-run a record: required fields, barcode data, formatting, symbology rules, and schema conformance (`FIELD_NOT_IN_SCHEMA`, `SCHEMA_REQUIRED_FIELD_MISSING`). |
| `getTemplateFieldPaths` | `(template) => string[]` | Every binding path used (values, conditions and style rules). |
| `DEFAULT_LIMITS` | `TemplateLimits` | Resource limits; override any via `options.limits`. See [SECURITY.md](SECURITY.md). |
| `BUILT_IN_FONTS` | `FontDefinition[]` | `sans`, `serif`, `mono`, `condensed` (system font stacks; nothing is downloaded). |
| `createFontRegistry` | `(extra?: FontDefinition[]) => FontRegistry` | Register host font ids (validated ids and stacks). Pass as `fonts` to validate/render/editor. |

`ValidateOptions`: `{ limits?, barcodeAdapter?, imagePolicy?, fonts? }`.
`ParseOptions` adds `migrations?`.

## Data binding (core)

See [DATA_BINDING.md](DATA_BINDING.md).

| Export | Signature | Notes |
| --- | --- | --- |
| `parsePath` | `(path, maxSegments?) => ParsePathResult` | Validates a binding path. Rejects `__proto__`, `prototype` and `constructor`. |
| `resolveValue` | `(source, record, options?) => ResolvedValue` | `{ status: "ok", text } \| { status: "missing", required } \| { status: "invalid", message }`. |
| `evaluateCondition` | `(condition, record) => boolean` | Declarative only; no expressions. |
| `applyStyleRules` | `(element, record, unit) => { element, opacity }` | Applies an element's `styleRules` for one record (later rules win). Returns the same element when nothing matches. `renderLabel` calls it for every element. See [DATA_BINDING.md](DATA_BINDING.md#conditional-styles). |
| `STYLE_OVERRIDE_KEYS` | `Record<ElementType, (keyof StyleOverride)[]>` | Override keys each element type accepts in a style rule's `set`. |
| `sampleRecordFromSchema` | `(schema) => DataRecord` | Builds a preview record from `DataField.example` values. |
| `inferDataSchema` | `(record, options?) => DataSchema` | Field discovery from a sample ERP record (bounded, cycle-safe, skips unsafe keys). |

## Units and geometry (core)

| Export | Notes |
| --- | --- |
| `convertLength(value, from, to)` | `mm`, `in`, `px` (CSS px = 1/96 in). |
| `toMm(value, unit)`, `fromMm(mm, unit)` | |
| `ptToUnit(pt, unit)`, `unitToPt(value, unit)` | Typographic points (1/72 in). |
| `roundTo(value, decimals)` | Half away from zero, no `-0`. |
| `rotatedBounds(rect, degrees)` | Axis-aligned bounds of a rect rotated about its centre. |
| `normalizeRotation(degrees)` | Into `[0, 360)`. |
| `SHAPE_KINDS` | Outlines of the `shape` element: `ellipse`, `triangle`, `diamond`, `pentagon`, `hexagon`, `octagon`, `star`, `arrow`. |

## Barcodes (core)

See [BARCODES.md](BARCODES.md) for per-format rules.

| Export | Notes |
| --- | --- |
| `defaultBarcodeAdapter` | Built-in `BarcodeAdapter`: Code 128, GS1-128, EAN-13, EAN-8, UPC-A, ITF-14 (built-in encoders) and QR (qrcode-generator). |
| `SUPPORTED_SYMBOLOGIES` | `["code128", "gs1-128", "ean13", "ean8", "upca", "itf14", "qrcode"]`. |
| `SYMBOLOGIES` | Per-format info: label, minimum/nominal X-dimension, nominal bar height, description. |
| `validateBarcodeValue(format, value, options?)` | `{ ok: true, normalized } \| { ok: false, reason, message }`. EAN/UPC/ITF check digits are computed when omitted and verified when present. |
| `gs1CheckDigit(digits)` | GS1 mod-10. |
| `createCachingBarcodeAdapter(adapter, { maxEntries? })` | Bounded LRU around an adapter (the editor uses one). Output is unchanged. |

`BarcodeAdapter` = `{ id, formats, validate(format, value, options?), encode(format, value, options?) }`.
`encode` returns a `LinearSymbol` (bar/space module widths and quiet zones) or a `MatrixSymbol`
(module matrix), and must throw `BarcodeValueError` for invalid input. Custom adapters can
add formats or replace encoders without changing package code.

## Rendering (core)

| Export | Signature | Notes |
| --- | --- | --- |
| `renderLabel` | `(template, record?, options?: RenderOptions) => RenderResult` | Deterministic and pure. `{ ok, root: RenderNode, issues, width, height, unit }`. `ok` is false when the record has errors (for example a missing barcode value). Invalid templates throw `TemplateValidationError`. |
| `prepareTemplate` | `(template, options?) => LabelTemplate` | Validate once and get a frozen copy (cached by object identity). `renderLabel` calls it automatically. |
| `renderNodeToSvgString` | `(node) => string` | Escaping serializer; re-checks the attribute allowlist. |
| `estimateTextMeasurer` | `TextMeasurer` | Default deterministic, DOM-free text width estimator. |

`RenderOptions`: `mode` (`"output"` default, or `"design"` to draw marked placeholders for
elements that cannot render), `barcodeAdapter`, `textMeasurer`, `imagePolicy`, `fonts`,
`limits`, `idPrefix` (unique per document), `title`, `excludeElementIds`.

`ImagePolicy`: `{ allowUrl?(url: URL): boolean, maxBytes? }`. By default only PNG, JPEG,
GIF or WebP data URIs (≤ 512 KiB) are accepted.

## Bulk generation (core)

| Export | Signature | Notes |
| --- | --- | --- |
| `generateLabels` | `(template, records: Iterable \| AsyncIterable, options?) => AsyncGenerator<GeneratedLabel, BatchProgress>` | Pull-based (bounded memory), ordered, yields to the event loop every `chunkSize` (50). Options: `signal`, `output` (`"svg"` or `"node"`), `errorPolicy` (`"include"` default, `"skip"`, `"fail-fast"`), `chunkSize`, `maxRecords` (100 000), `onProgress`, `idPrefix`. |
| `generateLabelsToArray` | `(template, records, options?) => Promise<GeneratedLabel[]>` | Small batches only (`maxRecords` default 5000). |

`GeneratedLabel` = `{ index, ok, svg?, node?, issues }`.

## Printing (core)

See [PRINTING.md](PRINTING.md).

| Export | Signature | Notes |
| --- | --- | --- |
| `computePageSpec` | `(labelSize, layout: PrintLayout) => { page, issues }` | Pure layout math: slot positions and fit checks (`PRINT_LAYOUT_OVERFLOW`, `PRINT_LABEL_EXCEEDS_CELL`, `PRINT_UNPRINTABLE_AREA`). |
| `paginate` | `(count, page, { copies?, skipSlots? }) => { placements, pageCount }` | |
| `buildPrintDocument` | `(template, records, options?) => PrintDocument` | Self-contained HTML (`@page` size, zero margins, physical units, no scripts). Invalid records are skipped and listed in `skipped`, or fail the job with `invalidRecords: "fail"`. `maxLabels` defaults to 2000. |
| `printCss` | `(page) => string` | The print CSS used by documents. |
| `printLabels` | `(template, records, options?) => Promise<PrintResult>` | Browser only. Builds the document and opens the browser print dialog through a sandboxed hidden iframe. Throws `PRINT_UNAVAILABLE` on the server. |
| `printHtml` | `(html, options?) => Promise<void>` | Print an already-built document. |
| `buildCalibrationDocument` | `(labelSize, layout) => string` | Rulers, label outlines and centre marks for printer calibration. |

`PrintLayout` = `RollLayout` (`{ kind: "roll", unit, gap?, orientation?, unprintableMargin? }`)
or `SheetLayout` (`{ kind: "sheet", unit, page, orientation?, margins, columns, rows, gapX, gapY, cell?, unprintableMargin? }`).

## Presets (`/presets`)

The catalog has its own entry so `/core` consumers do not ship it (about 4.6 kB min + brotli; see
[PERFORMANCE.md](PERFORMANCE.md)). The root entry re-exports it. **Migration from earlier 0.1.0
builds:** change `import { getPresetTemplate } from "@pythonprakash/erp-label-studio/core"` to
`from "@pythonprakash/erp-label-studio/presets"`. `cloneTemplate` stays in `/core`.

| Export | Notes |
| --- | --- |
| `getPresetSizes(filter?)` | 19 label and media presets: roll, thermal, shipping, jewellery, and A4/Letter sheets. Each includes a suggested `layout`. |
| `getPresetTemplates(filter?)` | 10 industry templates, each with `template`, `dataSchema` and `sampleData`. Read-only. |
| `getPresetTemplate(id, overrides?)` | An **editable deep copy** of a built-in template. |
| `createPresetRegistry()` | An isolated registry with `addSize`, `addTemplate` (validated), `listSizes`, `listTemplates`, `getTemplate`. Built-ins cannot be replaced. |
| `cloneTemplate(template, { id?, name? })` | (`/core`) Deep copy under a new id. |

## Persistence (core)

See the "Persistence" section of [INTEGRATION.md](INTEGRATION.md).

| Export | Notes |
| --- | --- |
| `TemplateStorage` (type) | `get(id)`, `save(template, { expectedRevision })`, `delete(id, { expectedRevision? })`, `list({ cursor, limit, category, search })`. `expectedRevision: null` creates the template; a mismatch throws `TemplateConflictError`. |
| `createMemoryTemplateStorage(options?)` | Process memory (tests, demos, server caches). |
| `createLocalStorageTemplateStorage(options?)` | Browser localStorage with quota (2 MiB), count limit and validation on read. Single browser and non-authoritative: not a substitute for server storage. |
| `duplicateStoredTemplate(storage, id, newId, newName?)` | Copies a stored template under a new id at revision 1. |

---

## Renderer components (`/renderer`)

| Export | Notes |
| --- | --- |
| `LabelRenderer` | `<LabelRenderer template data? size? className? style? onRender? fallback? …RenderOptions />`. `size`: `"physical"` (default, for example `50mm`), `"fill"`, or `{ width }`. Invalid templates render `fallback` (default: an inline alert). |
| `BarcodePreview` | `<BarcodePreview format value width? height? unit? showText? errorCorrection? printerDpi? />`. A single symbol, rendered by the core renderer. |
| `renderNodeToReact` | `(node, { elementTransform?, rootProps? }) => ReactElement`. Text becomes React text (escaped); no `dangerouslySetInnerHTML`. |
| `createCanvasTextMeasurer` | `(fallback, maxEntries?) => TextMeasurer`. Browser canvas measurements with a bounded cache. Use the same measurer for preview and print so they match. |

## Headless editor (`/headless`)

| Export | Notes |
| --- | --- |
| `createEditorStore` | `(template, options?) => EditorStore`. Framework-independent session: `getState`, `subscribe`, `dispatch(command, { coalesceKey?, keepSelection? })`, `undo`, `redo`, `select(ids, mode)`, `setViewport`, `updateSettings`, `replaceTemplate`, `markSaved`, `destroy`. **Every command result is validated**; invalid results are rejected (`lastRejection`). |
| `DEFAULT_SETTINGS` | Grid 1 unit, grid/snap/rulers on, `tool: "select"` (Cursor). `"hand"` pans the view and never edits; `"pencil"` draws freehand strokes. `EditorTool` is the type. |
| `applyCommand` | Pure command reducer (`addElements`, `updateElement`, `updateElements`, `moveElements`, `removeElements`, `duplicateElements`, `reorderElement`, `setCanvas`, `setMeta`). |
| `convertTemplateUnits` | Converts every length to another unit (font sizes stay in points). |
| `createElement` | `(template, type, { x?, y? })`: a valid new element sized for the template's unit. |
| `createDrawingElement` | `(template, points, { strokeWidth, stroke?, tolerance?, maxPoints? }) => DrawingElement | null`: turns a freehand stroke in label coordinates into a valid `drawing` element (simplified, normalized to its box). `null` for strokes without extent. |
| `createBlankTemplate` | `({ id?, name?, width?, height?, unit? })`. |
| `useEditorStore` | `(initialTemplate, { template?, onTemplateChange?, …storeOptions })`: creates and owns a store. StrictMode-safe. |
| `useControlledTemplate` | `(store, template, onTemplateChange)`: controlled-template semantics for any store. |
| `useEditorState` | `(store) => EditorState`. |
| `useEditorSelector` | `(store, selector, isEqual?)`: re-renders only when the selected slice changes. |
| `shallowArrayEqual` | Equality helper for array selectors. |
| `useEditorCommands` | `(store)`: `addElement`, `updateElement`, `moveSelection`, `removeSelection`, `duplicateSelection`, `reorder`, `select`, `undo`, `redo`. |
| `useTemplateStorage` | `(storage, id) => { state, save, reload }`. Loading, not-found and error states; aborts stale loads; `save` uses revision checks. |
| `snapMove`, `resizeRect`, `alignRects`, `RESIZE_HANDLES` | Pure interaction geometry (snapping guides, rotation-aware resize, alignment). |
| `screenToLabel`, `labelToScreen`, `screenDeltaToLabel`, `pixelsPerUnit`, `fitZoom`, `zoomAt`, `clampZoom` | Viewport transforms. The zoom never changes saved geometry. |
| `panBy` | `(viewport, dx, dy) => Viewport`: moves the view by a screen-pixel delta (Hand tool, Space+drag, arrow keys in Hand mode). Never touches the template, history or dirty state. |
| `LabelRenderer` | Re-exported for convenience. |

## Default editor UI (`@pythonprakash/erp-label-studio`)

### `LabelEditor` (alias `BarcodeEditor`)

```tsx
<LabelEditor
  template={t} onTemplateChange={setT}        // controlled, or
  defaultTemplate={t}                         // uncontrolled (alias: initialTemplate)
  onSave={async (t) => storedTemplate}        // optional; may return the stored template
  onPrint={(t, record) => {}}                 // optional; replaces the built-in print preview
  onSelectionChange={(ids) => {}}
  onError={(e) => {}}                         // host callback failures, rejected external templates
  dataSchema={schema} sampleData={records}
  theme={tokens} ui={layout} components={slots}
  readOnly fonts imagePolicy barcodeAdapter textMeasurer limits settings
  store={externalStore}                       // hybrid: your store + default UI
  className style aria-label
/>
```

Behaviour contract:

* **Controlled.** Every committed change calls `onTemplateChange`. When `template` changes to a
  value the editor did not emit, the editor replaces its template and clears undo history.
  If the host does not update `template` after a change, the editor keeps its own state; it
  does not revert.
* **Uncontrolled.** `defaultTemplate` is read once on mount.
* **Invalid initial template.** An accessible error panel listing the issues is shown instead
  of the editor.
* **Saving.** Only one save runs at a time; extra clicks are ignored. A rejected or throwing
  `onSave` shows "Save failed: …", calls `onError`, and the template stays dirty. If
  `onSave` returns a template and no edits happened during the save, it replaces the
  editor's template (for example to pick up a server-assigned id). Results that arrive after
  unmount are ignored.
* **Callbacks.** Exceptions thrown by host callbacks are caught and passed to `onError`;
  they never break the editor.
* **Keyboard.** Arrows nudge (Shift ×10), Delete removes, Ctrl/Cmd+Z undoes, Ctrl+Shift+Z or
  Ctrl+Y redoes, Ctrl+D duplicates, Ctrl+A selects all, Ctrl+S saves, Escape clears the
  selection or cancels a drag. See [ACCESSIBILITY.md](ACCESSIBILITY.md).

### Customization exports

| Export | Notes |
| --- | --- |
| `EditorTheme` (type), `darkTheme`, `themeToCssVariables` | Theme tokens → scoped `--els-*` custom properties. See [CUSTOMIZATION.md](CUSTOMIZATION.md). |
| `EditorUiConfig` (type) | `toolbar` (`top`, `bottom`, `hidden`), `propertiesPanel`, `layersPanel`, `rulers`, `statusBar`, `panelWidth`, `minHeight`, `elementTypes`, `saveButton`, `printButton`, `templateSettings`. |
| `EditorComponents` (type), `DEFAULT_COMPONENTS` | Slots: `Button`, `TextInput`, `NumberInput`, `Select`, `Checkbox`, `ColorInput`, `Field`, `Section`. Slot prop types: `ButtonSlotProps`, `TextInputSlotProps`, `NumberInputSlotProps`, `SelectSlotProps`, `SelectOption`, `CheckboxSlotProps`, `ColorInputSlotProps`, `FieldSlotProps`, `SectionSlotProps`. |
