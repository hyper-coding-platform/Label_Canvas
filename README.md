# @suriyaprakashm14/erp-label-studio

A label designer, deterministic label renderer and barcode SDK for React and Next.js ERP
applications. It is built for textile, retail, warehouse, inventory, jewellery and POS
systems, and makes no assumptions about your data model, backend or UI framework.

> **Status: 0.1.0, first release.** Automated gates pass (see
> [docs/IMPLEMENTATION_PLAN.md](https://github.com/hyper-coding-platform/Label_Canvas/blob/main/docs/IMPLEMENTATION_PLAN.md)). Physical printer and scanner
> validation has **not** been performed yet. Do not claim hardware compatibility until the
> [physical checklist](https://github.com/hyper-coding-platform/Label_Canvas/blob/main/docs/PRINTING.md#physical-validation-checklist) is complete.

> **Adding this to a Next.js app?** Follow [docs/QUICKSTART_NEXTJS.md](https://github.com/hyper-coding-platform/Label_Canvas/blob/main/docs/QUICKSTART_NEXTJS.md):
> install the package, add 3 files, and test (about 10 minutes).

## What you get

* **An embeddable editor** (`LabelEditor`) that lives inside your page. It does not take over
  your navbar, sidebar, fonts or theme. It provides drag, resize, rotate, rulers, grid,
  snapping, layers, undo/redo, numeric property editing and keyboard access. It also has
  **Cursor** and **Hand** tools (V/H): Hand drags or arrow keys move the view around a zoomed
  label without ever selecting or editing, and Space+drag pans with any tool. Shapes, a
  pencil, and conditional styles (for example, highlight the record's size) are included.
* **Physical units** (mm, in, px), 19 preset sizes (thermal rolls, hang tags, shelf, shipping
  4×6 in, jewellery, A4/Letter sheets) and 10 editable industry templates.
* **Safe data binding**: `product.sku`, `pricing.mrp` and so on, with formatting, fallbacks
  and conditions. No expression evaluation, ever.
* **Barcodes**: Code 128, GS1-128, EAN-13, EAN-8, UPC-A, ITF-14 and QR. Every format is
  verified by decoding the rendered output with an independent decoder. Invalid or missing
  data never produces a symbol.
* **A deterministic renderer** usable without the editor: SVG strings on the server, React
  components in the browser.
* **Bulk generation** that is streaming, ordered, cancellable and memory-bounded.
* **Browser printing** for rolls and sheets, with print preview and a calibration page.
* **Persistence through your API**: a `TemplateStorage` contract with revisions and conflict
  detection. There is no mandatory backend.
* **Customization at four levels**: default UI, theme tokens, your own components (for
  example Ant Design) through slots, or fully headless hooks.

## Requirements

* React **18.2+ or 19** (peer dependency; verified with React 19.3.1. React 18 is allowed by
  the peer range but not yet tested).
* Next.js App Router supported (verified with Next.js 16.4.2). Any React bundler that handles
  ESM works.
* Modern evergreen browsers (Chromium, Firefox and WebKit are tested). `/core` also runs in
  Node.js ≥ 20.19 and in Web Workers.
* ES modules only (no CommonJS build).

## Install

```bash
npm install @suriyaprakashm14/erp-label-studio
```

To try an unreleased build, install a packed tarball instead (`npm run pack:local`).
See [docs/USING_IN_OTHER_APPS.md](https://github.com/hyper-coding-platform/Label_Canvas/blob/main/docs/USING_IN_OTHER_APPS.md) for every install option,
bundler setup, TypeScript settings and a checklist to confirm your app still builds.

```tsx
import "@suriyaprakashm14/erp-label-studio/styles.css"; // once, for example in app/layout.tsx
```

## Editor

```tsx
"use client";
import { LabelEditor, getPresetTemplate, type LabelTemplate, type DataSchema } from "@suriyaprakashm14/erp-label-studio";

const schema: DataSchema = {
  fields: [
    { path: "product.name", label: "Product name", group: "Product", required: true, example: "Cotton Kurta" },
    { path: "product.barcode", label: "Barcode", group: "Product", example: "260042130115" },
    { path: "pricing.mrp", label: "MRP", group: "Pricing", type: "number", example: 1299 },
  ],
};

export function TextileLabelDesigner({ saveTemplate }: { saveTemplate: (t: LabelTemplate) => Promise<void> }) {
  return (
    <div style={{ height: 640 }}>
      <LabelEditor
        initialTemplate={getPresetTemplate("textile-hang-tag")!}
        dataSchema={schema}
        onSave={saveTemplate}
      />
    </div>
  );
}
```

Controlled mode: `template={t} onTemplateChange={setT}`. Theming:
`theme={{ colorAccent: "#0f3d3e", fontFamily: "inherit" }}`. Your own controls:
`components={{ Button: MyButton, Select: MySelect }}`. Layout:
`ui={{ layersPanel: "hidden", toolbar: "bottom" }}`.
See [docs/CUSTOMIZATION.md](https://github.com/hyper-coding-platform/Label_Canvas/blob/main/docs/CUSTOMIZATION.md).

## Renderer only (no editor code loaded)

```tsx
"use client";
import { LabelRenderer } from "@suriyaprakashm14/erp-label-studio/renderer";
<LabelRenderer template={template} data={record} />;   // physical size, e.g. 50mm × 75mm
```

On the server, or with no React at all:

```ts
import { renderLabel, renderNodeToSvgString } from "@suriyaprakashm14/erp-label-studio/core";
const result = renderLabel(template, record);
if (result.ok) svg = renderNodeToSvgString(result.root);
else console.warn(result.issues); // e.g. BARCODE_VALUE_MISSING: no barcode is generated
```

## Templates and saving

```ts
import { parseTemplate, serializeTemplate, validateTemplate } from "@suriyaprakashm14/erp-label-studio/core";
const parsed = parseTemplate(untrustedJson);   // size check → migrate → validate
if (!parsed.ok) showErrors(parsed.issues);
const json = serializeTemplate(template);      // store this
```

Wire persistence through `onSave`, or implement `TemplateStorage` over your API and use
`useTemplateStorage(storage, id)`. It handles loading and error states, and revision checks
that reject concurrent overwrites. Validate again on your server.
See [docs/INTEGRATION.md](https://github.com/hyper-coding-platform/Label_Canvas/blob/main/docs/INTEGRATION.md).

## Bulk generation and printing

```ts
import { generateLabels, printLabels } from "@suriyaprakashm14/erp-label-studio/core";
import { getPresetSizes } from "@suriyaprakashm14/erp-label-studio/presets";

for await (const label of generateLabels(template, productsAsyncIterable, { signal, onProgress })) {
  if (label.ok) archive(label.svg!); else report(label.index, label.issues);
}

const sheet = getPresetSizes().find((s) => s.id === "a4-21up")!.layout;
const { document } = await printLabels(template, records, { layout: sheet, copies: 2 });
document.skipped; // records not printed (invalid or missing data)
```

## Known limitations

* **Browsers always show a print dialog.** Silent or direct thermal printing needs a print
  agent you provide.
* Physical print accuracy depends on driver settings (scale 100%, no margins). Calibrate per
  printer. Automated tests verify page geometry in Chromium, not real printers.
* Data Matrix, PDF417, UPC-E and EAN add-ons are not supported by the built-in adapter.
* The editor's interaction target is ≤ 500 elements per template. Up to 1,000 are accepted,
  with drag frames at the 16 ms limit on the reference machine.
* Text fitting uses estimated font metrics by default (deterministic, approximate). Inject
  `createCanvasTextMeasurer` for real metrics, and use it for both preview and print.
* The canvas is not navigable element by element with a screen reader; the Layers list and
  Properties panel provide full non-pointer access.
* Panning is not bounded: the view can be moved away from the label. **Fit to screen** brings
  it back. Pan and zoom are not saved with the template.

## Documentation

| Topic | |
| --- | --- |
| Quick start for Next.js apps | [docs/QUICKSTART_NEXTJS.md](https://github.com/hyper-coding-platform/Label_Canvas/blob/main/docs/QUICKSTART_NEXTJS.md) |
| Using the SDK in another app (install, build check) | [docs/USING_IN_OTHER_APPS.md](https://github.com/hyper-coding-platform/Label_Canvas/blob/main/docs/USING_IN_OTHER_APPS.md) |
| How it is implemented | [docs/IMPLEMENTATION.md](https://github.com/hyper-coding-platform/Label_Canvas/blob/main/docs/IMPLEMENTATION.md) |
| API reference | [docs/API.md](https://github.com/hyper-coding-platform/Label_Canvas/blob/main/docs/API.md) |
| Template format | [docs/TEMPLATE_FORMAT.md](https://github.com/hyper-coding-platform/Label_Canvas/blob/main/docs/TEMPLATE_FORMAT.md) |
| Data binding | [docs/DATA_BINDING.md](https://github.com/hyper-coding-platform/Label_Canvas/blob/main/docs/DATA_BINDING.md) |
| Barcodes | [docs/BARCODES.md](https://github.com/hyper-coding-platform/Label_Canvas/blob/main/docs/BARCODES.md) |
| Printing and calibration | [docs/PRINTING.md](https://github.com/hyper-coding-platform/Label_Canvas/blob/main/docs/PRINTING.md) |
| Embedding in an ERP and persistence | [docs/INTEGRATION.md](https://github.com/hyper-coding-platform/Label_Canvas/blob/main/docs/INTEGRATION.md) |
| Theme, slots, headless | [docs/CUSTOMIZATION.md](https://github.com/hyper-coding-platform/Label_Canvas/blob/main/docs/CUSTOMIZATION.md) |
| Next.js | [docs/NEXTJS_INTEGRATION.md](https://github.com/hyper-coding-platform/Label_Canvas/blob/main/docs/NEXTJS_INTEGRATION.md) |
| Performance (measured) | [docs/PERFORMANCE.md](https://github.com/hyper-coding-platform/Label_Canvas/blob/main/docs/PERFORMANCE.md) |
| Security | [docs/SECURITY.md](https://github.com/hyper-coding-platform/Label_Canvas/blob/main/docs/SECURITY.md) |
| Accessibility | [docs/ACCESSIBILITY.md](https://github.com/hyper-coding-platform/Label_Canvas/blob/main/docs/ACCESSIBILITY.md) |
| Troubleshooting | [docs/TROUBLESHOOTING.md](https://github.com/hyper-coding-platform/Label_Canvas/blob/main/docs/TROUBLESHOOTING.md) |
| Architecture and decisions | [docs/ARCHITECTURE.md](https://github.com/hyper-coding-platform/Label_Canvas/blob/main/docs/ARCHITECTURE.md), [docs/DECISIONS.md](https://github.com/hyper-coding-platform/Label_Canvas/blob/main/docs/DECISIONS.md) |
| Tests and release | [docs/TEST_STRATEGY.md](https://github.com/hyper-coding-platform/Label_Canvas/blob/main/docs/TEST_STRATEGY.md), [docs/RELEASE.md](https://github.com/hyper-coding-platform/Label_Canvas/blob/main/docs/RELEASE.md), [docs/CHANGELOG.md](https://github.com/hyper-coding-platform/Label_Canvas/blob/main/docs/CHANGELOG.md) |

## License

[MIT](https://github.com/hyper-coding-platform/Label_Canvas/blob/main/LICENSE) © 2026 suriyaprakashm14
