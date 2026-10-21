# Printing

Browser printing is the supported baseline. The SDK builds an HTML print document sized in
physical units and opens the **browser's print dialog**.

> **JavaScript cannot print silently, choose a printer, or bypass the print dialog.**
> Unattended or direct thermal printing (ZPL, EPL, TSPL, ESC/POS) needs a print agent you
> provide, such as a local service, native app or device bridge. The core package does not
> depend on one: send it the SVG from `generateLabels`, or your own printer commands.

## Terms

| Term | Where it lives |
| --- | --- |
| **Label size** | `template.canvas` (width, height, unit) |
| **Media/page size** | `PrintLayout`: a roll page equals one label; a sheet has `page.width × page.height` |
| **Margins** | `SheetLayout.margins`: distance from the sheet edge to the first label |
| **Gaps** | `SheetLayout.gapX/gapY`: between labels on a sheet. `RollLayout.gap` documents the liner gap (the printer produces it) |
| **Cell** | `SheetLayout.cell`: the stock's label position; a smaller label is centred, a larger one is an error |
| **Printable area** | `unprintableMargin`: hardware limit, validation only (`PRINT_UNPRINTABLE_AREA`) |
| **Rows / columns** | `SheetLayout.rows/columns`, filled row by row |
| **Thermal settings** | `canvas.printerDpi` (dot snapping); darkness and speed are set on the printer or driver |

## API

```ts
import { printLabels, buildPrintDocument } from "@pythonprakash/erp-label-studio/core";
import { getPresetSizes } from "@pythonprakash/erp-label-studio/presets";

// Thermal roll: one label per page, page size = label size.
await printLabels(template, records, { copies: 2 });

// A4 sheet (21-up), starting at position 5 of a partly used sheet.
const sheet = getPresetSizes().find((s) => s.id === "a4-21up")!.layout;
const result = await printLabels(template, records, { layout: sheet, skipSlots: 4 });
result.document.skipped; // records not printed (missing or invalid data), with issues

// Build without printing (preview, PDF services, archiving):
const doc = buildPrintDocument(template, records, { layout: sheet, showOutlines: true });
doc.html; doc.pageCount; doc.warnings;
```

* **Invalid records are never printed.** They are skipped and reported (`invalidRecords:
  "skip"`, the default), or the whole job fails with `invalidRecords: "fail"`.
* At most 2000 labels per document (`maxLabels`). Print larger jobs in batches.
* Landscape roll feeding (`orientation: "landscape"`) rotates each label 90° on the page.
* The editor toolbar's **Print preview** opens a dialog showing the exact document (sandboxed
  iframe) with media, records, copies, skipped positions and outlines. Pass `onPrint` to
  `LabelEditor` to replace it with your own pipeline.

## Print CSS

Documents use `@page { size: W H; margin: 0 }`, `html, body { margin: 0 }`, absolute
positioning in `mm` or `in`, `print-color-adjust: exact`, and one `section.page` per page
with `break-after: page`. In Chromium this was verified automatically: generated PDF pages
measured exactly 50×75 mm and 210×297 mm, and all 21 A4 label positions were within 0.5 CSS
px (about 0.13 mm) of the computed layout (`tests/browser/print.spec.ts`).

**Automated checks do not cover your printer's driver.** Drivers can still scale, shift or
crop output. In the print dialog:

1. Set **Scale** to 100% or "Actual size" (disable "Fit to page" and "Shrink to fit").
2. Set **Margins** to None (or Minimum).
3. Set the **paper or media size** to the page size shown in the preview (for roll media,
   the label size).
4. Disable headers and footers.
5. For thermal printers, set the media type (gap, black-mark or continuous), the label size
   and darkness in the driver or printer.

## Calibration

`buildCalibrationDocument(labelSize, layout)` (also on the **Print calibration page** button)
prints a page with:

* a 100 mm horizontal ruler and a vertical ruler (shorter on small labels), with millimetre
  ticks;
* the outline of every label position, with centre crosses.

Procedure:

1. Print the calibration page on **plain paper** (sheets) or on your **label stock** (roll),
   using the settings above.
2. Measure the 100 mm ruler. If it is not 100 ± 0.5 mm, the driver is scaling: fix the scale
   setting. Do not compensate in templates.
3. For sheets, hold the plain-paper print over a label sheet against the light. The outlines
   should sit on the label edges. Correct `margins` or `gapX/gapY` in a custom `SheetLayout`
   by the measured offset, then repeat.
4. For rolls, check that the content is centred on the label. Fix offsets with the printer's
   label-top or offset adjustment, not in templates.

## Barcode print quality

* Set `canvas.printerDpi` for thermal printers (203 dpi = 8 dots/mm, 300 dpi = 11.8 dots/mm)
  so bars align to the dot grid.
* Use bar widths of at least the recommended X-dimension in [BARCODES.md](BARCODES.md).
  The editor shows `BARCODE_MODULE_TOO_SMALL` warnings.
* Print dark bars on light backgrounds; avoid coloured media for retail symbols.

## Physical validation checklist

Release gates G13 and G14 in [ACCEPTANCE_CRITERIA.md](ACCEPTANCE_CRITERIA.md) require this
checklist for **every printer and scanner** a release claims to support. The status in
this repository is **not yet performed**: no physical printers or scanners were available
when this was written.

| Step | Pass criterion | Result |
| --- | --- | --- |
| A4 laser/inkjet: calibration page | 100 mm ruler measures 100 ± 0.5 mm | ☐ |
| A4 21-up: plain-paper overlay | Outlines within ± 0.5 mm of label edges | ☐ |
| 203 dpi thermal: 50 × 30 mm calibration page | Content centred within ± 0.5 mm | ☐ |
| 300 dpi thermal: jewellery tag | Text legible, Code 128 scans | ☐ |
| Each supported symbology printed at the minimum recommended X | Scans first time on each listed scanner (20 attempts, ≥ 19 successes) | ☐ |
| EAN-13 on retail label | Verifier grade ≥ 1.5 / C (ISO/IEC 15416) at the target size | ☐ |
| QR at the smallest used size | Scans with each listed scanner and a phone camera | ☐ |

Record the printer model, driver version, media, darkness and speed settings, the scanner
model, and the date for each row in the release notes.
