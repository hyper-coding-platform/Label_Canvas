import { JSDOM } from "jsdom";
import { describe, expect, it } from "vitest";
import { buildCalibrationDocument } from "../../src/core/print/calibration";
import { buildPrintDocument, printCss } from "../../src/core/print/document";
import { computePageSpec, paginate } from "../../src/core/print/layout";
import { printLabels } from "../../src/core/print/browser-print";
import { getPresetSizes } from "../../src/core/presets/registry";
import type { SheetLayout } from "../../src/core/print/layout-types";
import { baseTemplate, barcodeEl, textEl, textileRecord, textileTemplate } from "../fixtures/templates";

const a4_21 = getPresetSizes().find((s) => s.id === "a4-21up")!;
const sheet = a4_21.layout as SheetLayout;
const label = { width: 63.5, height: 38.1, unit: "mm" as const };

describe("computePageSpec", () => {
  it("lays out an A4 21-up sheet row-major with exact positions", () => {
    const { page, issues } = computePageSpec(label, sheet);
    expect(issues.filter((i) => i.severity === "error")).toEqual([]);
    expect(page.slots).toHaveLength(21);
    expect(page.slots[0]).toMatchObject({ x: 7.25, y: 15.15, width: 63.5, height: 38.1 });
    expect(page.slots[1]!.x).toBeCloseTo(7.25 + 63.5 + 2.5, 9);
    expect(page.slots[3]!.y).toBeCloseTo(15.15 + 38.1, 9);
    const last = page.slots[20]!;
    expect(last.x + last.width + sheet.margins.right).toBeCloseTo(210, 6);
    expect(last.y + last.height + sheet.margins.bottom).toBeCloseTo(297, 6);
  });

  it("centres a smaller label in a larger cell and converts units", () => {
    const { page } = computePageSpec({ width: 2, height: 1, unit: "in" }, { ...sheet, cell: { width: 63.5, height: 38.1 } });
    expect(page.slots[0]!.width).toBeCloseTo(50.8, 9);
    expect(page.slots[0]!.x).toBeCloseTo(7.25 + (63.5 - 50.8) / 2, 9);
  });

  it("rejects grids that overflow the page and labels larger than cells", () => {
    expect(computePageSpec(label, { ...sheet, rows: 8 }).issues.map((i) => i.code)).toContain("PRINT_LAYOUT_OVERFLOW");
    expect(computePageSpec({ ...label, width: 70 }, sheet).issues.map((i) => i.code)).toContain("PRINT_LABEL_EXCEEDS_CELL");
    expect(computePageSpec(label, { ...sheet, gapX: -1 }).issues.map((i) => i.code)).toContain("PRINT_LAYOUT_INVALID");
  });

  it("warns when labels reach the printer's unprintable border", () => {
    const tight = { ...sheet, margins: { top: 2, right: 2, bottom: 2, left: 2 }, columns: 1, rows: 1 };
    expect(computePageSpec(label, tight).issues).toEqual([expect.objectContaining({ code: "PRINT_UNPRINTABLE_AREA", severity: "warning" })]);
  });

  it("roll layouts: page equals the label; landscape rotates", () => {
    const { page } = computePageSpec({ width: 50, height: 30, unit: "mm" }, { kind: "roll", unit: "mm" });
    expect(page).toMatchObject({ width: 50, height: 30, slots: [{ x: 0, y: 0, width: 50, height: 30, rotated: false }] });
    const rot = computePageSpec({ width: 50, height: 30, unit: "mm" }, { kind: "roll", unit: "mm", orientation: "landscape" }).page;
    expect(rot).toMatchObject({ width: 30, height: 50, slots: [{ rotated: true, width: 30, height: 50 }] });
  });

  it("landscape sheets swap the page dimensions", () => {
    const { page } = computePageSpec({ width: 60, height: 40, unit: "mm" }, { kind: "sheet", unit: "mm", page: { width: 210, height: 297 }, orientation: "landscape", margins: { top: 5, right: 5, bottom: 5, left: 5 }, columns: 4, rows: 5, gapX: 2, gapY: 0 });
    expect([page.width, page.height]).toEqual([297, 210]);
  });
});

describe("paginate", () => {
  const { page } = computePageSpec(label, sheet);
  it("applies copies consecutively and paginates", () => {
    const { placements, pageCount } = paginate(10, page, { copies: 3 });
    expect(placements).toHaveLength(30);
    expect(placements.slice(0, 4).map((p) => p.recordIndex)).toEqual([0, 0, 0, 1]);
    expect(pageCount).toBe(2);
    expect(placements[21]!.page).toBe(1);
    expect(placements[21]!.slot).toBe(page.slots[0]);
  });

  it("skips used positions on the first sheet only", () => {
    const { placements } = paginate(3, page, { skipSlots: 19 });
    expect(placements.map((p) => [p.page, page.slots.indexOf(p.slot)])).toEqual([[0, 19], [0, 20], [1, 0]]);
  });

  it("handles empty input", () => {
    expect(paginate(0, page)).toEqual({ placements: [], pageCount: 0 });
  });
});

describe("buildPrintDocument", () => {
  const parse = (html: string) => new JSDOM(html).window.document;

  it("builds a roll document: one page per label with exact @page size", () => {
    const doc = buildPrintDocument(textileTemplate, [textileRecord, textileRecord]);
    expect(doc.pageCount).toBe(2);
    expect(doc.html).toContain("@page { size: 50mm 75mm; margin: 0; }");
    const d = parse(doc.html);
    expect(d.querySelectorAll("section.page")).toHaveLength(2);
    expect(d.querySelectorAll(".label svg")).toHaveLength(2);
    expect(d.querySelectorAll("script")).toHaveLength(0);
  });

  it("places labels on sheets with copies, skipping and reporting invalid records", () => {
    const t = baseTemplate([textEl({ width: 50, height: 6 }), barcodeEl({ width: 55, height: 20 })], { canvas: { width: 63.5, height: 38.1, unit: "mm" } });
    const recs = [{ product: { name: "A", sku: "A1" } }, { product: { name: "B" } }, { product: { name: "C", sku: "C1" } }];
    const doc = buildPrintDocument(t, recs, { layout: sheet, copies: 11 });
    expect(doc.skipped).toEqual([{ recordIndex: 1, issues: [expect.objectContaining({ code: "BARCODE_VALUE_MISSING" })] }]);
    expect(doc.labelCount).toBe(22);
    expect(doc.pageCount).toBe(2);
    const d = parse(doc.html);
    const first = d.querySelector(".label") as HTMLElement;
    expect(first.getAttribute("style")).toBe("left:7.25mm;top:15.15mm;width:63.5mm;height:38.1mm");
    expect(() => buildPrintDocument(t, recs, { layout: sheet, invalidRecords: "fail" })).toThrow(/cannot be printed/);
  });

  it("rotates labels for landscape roll feeding", () => {
    const doc = buildPrintDocument(textileTemplate, [textileRecord], { layout: { kind: "roll", unit: "mm", orientation: "landscape" } });
    expect(doc.html).toContain("@page { size: 75mm 50mm; margin: 0; }");
    expect(doc.html).toContain("rotate(90deg)");
  });

  it("enforces the per-document label limit and escapes the title", () => {
    expect(() => buildPrintDocument(textileTemplate, Array.from({ length: 11 }, () => textileRecord), { maxLabels: 10 })).toThrow(/limit/);
    const doc = buildPrintDocument(textileTemplate, [textileRecord], { title: "</title><script>x</script>" });
    expect(parse(doc.html).querySelectorAll("script")).toHaveLength(0);
    expect(parse(doc.html).title).toBe("</title><script>x</script>");
  });

  it("rejects impossible layouts", () => {
    expect(() => buildPrintDocument(textileTemplate, [textileRecord], { layout: sheet })).toThrow(/larger than the sheet cell/);
  });

  it("print CSS disables browser margins and uses physical units", () => {
    const css = printCss({ width: 4, height: 6, unit: "in" });
    expect(css).toContain("@page { size: 4in 6in; margin: 0; }");
    expect(css).toContain("print-color-adjust: exact");
  });
});

describe("calibration and environment", () => {
  it("builds a calibration page with a 100 mm ruler and label outlines", () => {
    const html = buildCalibrationDocument(label, sheet);
    const d = new JSDOM(html).window.document;
    expect(d.querySelectorAll("svg rect")).toHaveLength(21);
    expect(html).toContain("Horizontal ruler: 100 mm");
    const roll = buildCalibrationDocument({ width: 50, height: 25, unit: "mm" }, { kind: "roll", unit: "mm" });
    expect(roll).toContain("Horizontal ruler: 20 mm");
  });

  it("printLabels fails clearly outside a browser", async () => {
    await expect(printLabels(textileTemplate, [textileRecord])).rejects.toMatchObject({ code: "PRINT_UNAVAILABLE" });
  });
});
