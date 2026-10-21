# Troubleshooting

## Integration and build

| Symptom | Cause | Fix |
| --- | --- | --- |
| "You're importing a component that needs `useState`…" or a server-component error | Imported the main entry, `/renderer` or `/headless` in a server component and *called* something from it | Render editor and preview components inside a `"use client"` component; use `/core` in server code |
| Editor looks unstyled | Stylesheet not imported | `import "@pythonprakash/erp-label-studio/styles.css"` once (for example in `app/layout.tsx`) |
| Next.js dev overlay: "Hydration failed because the server rendered HTML didn't match the client", with an extension `<img>` or element in the diff (for example `chrome-extension://…` / `colorpick-eyedropper-input-trigger`) | A browser extension changed the editor's server-rendered HTML before React hydrated (ColorPick Eyedropper adds an icon next to every colour input). React recovers by re-rendering on the client; nothing breaks | Render the editor client-only: `const LabelEditor = dynamic(() => import("@pythonprakash/erp-label-studio").then((m) => m.LabelEditor), { ssr: false })` (see `examples/nextjs-playground/app/playground.tsx`). Or disable the extension for the site. `LabelRenderer` previews can stay server-rendered |
| Editor collapses to 480 px or has no height | The container has no height | Give the parent a height, or set `ui={{ minHeight: "70vh" }}` |
| `ERR_REQUIRE_ESM` / `require() of ES Module` | The package is ESM-only | Use `import` / dynamic `import()`; Node ≥ 20.19 supports `require(esm)` |
| `ERR_PACKAGE_PATH_NOT_EXPORTED` | Importing an internal path (`…/dist/x.js`) | Use only the documented entry points |
| Two copies of React, invalid hook call | A bundler alias resolves React twice | React is a peer dependency: dedupe it in your package manager, or alias `react` to one copy |
| Next.js warns about multiple lockfiles / workspace root | Monorepo | Set `turbopack.root` in `next.config` |
| TypeScript cannot find types for `…/styles.css` | No CSS module declaration | Add `declare module "*.css";` (or rely on your framework's CSS types) |
| Custom slot causes React Compiler lint errors (`react-hooks/refs`) | Reading props after passing `p.setElement` to `ref` | Destructure: `({ setElement, ...p }) => <button ref={setElement} …/>` |

## Templates and binding

| Symptom | Cause | Fix |
| --- | --- | --- |
| "This label template cannot be opened" | The template failed validation | Read the listed issues (`path` points at the property); validate with `validateTemplate` before saving |
| `UNKNOWN_PROPERTY` after upgrading or hand-editing | Extra keys are errors by design | Remove them, or migrate older versions through `parseTemplate` |
| `SCHEMA_VERSION_UNSUPPORTED` | Template from a newer SDK, or an unmigratable version | Upgrade the SDK; versions are never guessed |
| Text field shows nothing | The value is missing (`undefined`, `null` or `""`) and the field is optional | Add `fallback`, or `required: true` to treat it as an error |
| `BINDING_PATH_FORBIDDEN` / `INVALID` | The path uses `__proto__` or brackets (`a[0]`) | Use dot paths with indices: `variants.0.size` |
| Numbers formatted as `1299.5` | No format set | `format: { type: "number", decimals: 2, grouping: true }` |
| Currency symbol missing | `display: "symbol"` requires `locale` | Set `locale: "en-IN"`, or use `prefix: "₹"` with a number format |
| Date shows the previous day | `timeZone: "local"`, or a timestamp without a time zone | Use `YYYY-MM-DD` dates (interpreted as UTC) or keep the default `UTC` |
| Text clipped (`TEXT_OVERFLOW`) | It does not fit the box | Use `overflow: "shrink"`, `"wrap"` or `"ellipsis"`, or enlarge the element |

## Barcodes

| Symptom | Cause | Fix |
| --- | --- | --- |
| Red "No barcode data" box in the editor; record skipped in print | The bound value is missing | Supply the field, add `fallback`, or `whenMissing: "hide"` |
| "check digit is X but should be Y" | Wrong check digit in your data | Fix the source data. The SDK never replaces a supplied check digit. Supply 12/7/11/13 digits to have it computed |
| `BARCODE_MODULE_TOO_SMALL` | Too much data for the width (common with long alphanumeric Code 128) | Widen the element, shorten the value, use numeric codes (Code 128 set C), or print at 300 dpi |
| `BARCODE_TOO_SMALL_FOR_PRINTER` | Bars would be narrower than one printer dot | Widen the element, or remove/raise `printerDpi` |
| `BARCODE_DOES_NOT_FIT` | Fixed `moduleWidth` too large for the element | Reduce `moduleWidth` or widen the element |
| `BARCODE_TRUNCATED` (EAN/UPC) | Bars shorter than half the nominal height | Make the element taller if retail POS scanning matters; otherwise test with your scanners |
| GS1-128 rejected with `unknown-ai` | AI not in the supported table | See [BARCODES.md](BARCODES.md); use a custom adapter if you need more AIs |
| Scans on screen but not on paper | Print scaling, darkness or dot gain | Calibrate ([PRINTING.md](PRINTING.md)); set `printerDpi`; increase X-dimension; adjust printer darkness |

## Printing

| Symptom | Cause | Fix |
| --- | --- | --- |
| Labels slightly too small or large | Driver scaling ("Fit to page") | Scale 100% / Actual size; measure the calibration ruler |
| Content shifted on sheets | Sheet margins differ from the preset | Print the calibration page on plain paper, overlay it, and adjust a custom `SheetLayout` |
| Blank pages between labels on a thermal printer | Driver media size larger than the label | Set the driver's label size to the template size (gap media) |
| `PRINT_UNAVAILABLE` | `printLabels` called on the server | Call it from a client component |
| `PRINT_LABEL_EXCEEDS_CELL` | The template is larger than the sheet's label positions | Choose a matching sheet preset or change the label size |
| Print dialog does not open | Browser blocked printing from the frame, or a popup policy | Trigger printing from a user click; check the browser console |
| Need silent / direct thermal printing | Browsers cannot do this | Use a local print agent; send it SVG from `generateLabels` or your own printer commands |

## Performance

| Symptom | Fix |
| --- | --- |
| Editor sluggish with hundreds of elements | Keep templates ≤ 500 elements ([PERFORMANCE.md](PERFORMANCE.md)); avoid many QR codes |
| UI freezes during bulk generation | Use `generateLabels` (it yields every 50 labels), run it in a Web Worker, or reduce `chunkSize` |
| Print preview slow for big jobs | Print in batches of ≤ 2,000 labels (`maxLabels`) |
