import { expect, test } from "@playwright/test";
import { buildPrintDocument, computePageSpec, buildCalibrationDocument } from "../../src/entries/core";
import { getPresetTemplate, getPresetSizes } from "../../src/entries/presets";
import { waitForEditor } from "./helpers";

const MM_TO_PT = 72 / 25.4;
const MM_TO_PX = 96 / 25.4;

/** Extract /MediaBox entries from a PDF (Chromium writes them uncompressed). */
function mediaBoxes(pdf: Buffer): number[][] {
  return [...pdf.toString("latin1").matchAll(/\/MediaBox\s*\[\s*([\d.\s-]+)\]/g)].map((m) => m[1]!.trim().split(/\s+/).map(Number));
}

test.describe("print document in a real browser", () => {
  test("roll document: PDF pages are exactly the label size", async ({ page, browserName }) => {
    test.skip(browserName !== "chromium", "page.pdf() is Chromium-only.");
    const tpl = getPresetTemplate("textile-hang-tag")!;
    const sample = { store: { name: "S" }, product: { name: "Kurta", sku: "K1", barcode: "260042130115" }, pricing: { mrp: 10 } };
    const doc = buildPrintDocument(tpl, [sample, sample, sample]);
    await page.setContent(doc.html);
    const pdf = await page.pdf({ preferCSSPageSize: true, printBackground: true });
    const boxes = mediaBoxes(pdf);
    expect(boxes).toHaveLength(3);
    for (const [x0, y0, x1, y1] of boxes) {
      expect(x1! - x0!).toBeCloseTo(50 * MM_TO_PT, 0);
      expect(y1! - y0!).toBeCloseTo(75 * MM_TO_PT, 0);
    }
  });

  test("A4 sheet document: page size and every label position match the layout", async ({ page, browserName }) => {
    test.skip(browserName !== "chromium", "page.pdf() is Chromium-only.");
    const tpl = getPresetTemplate("a4-product-sticker")!;
    const sheet = getPresetSizes().find((s) => s.id === "a4-21up")!.layout;
    const records = Array.from({ length: 25 }, (_, i) => ({ product: { name: `Item ${i}`, sku: `SKU-${i}` }, pricing: { mrp: 100 + i } }));
    const doc = buildPrintDocument(tpl, records, { layout: sheet });
    expect(doc.pageCount).toBe(2);
    await page.setContent(doc.html);
    const pdf = await page.pdf({ preferCSSPageSize: true });
    const boxes = mediaBoxes(pdf);
    expect(boxes).toHaveLength(2);
    expect(boxes[0]![2]! - boxes[0]![0]!).toBeCloseTo(210 * MM_TO_PT, 0);
    expect(boxes[0]![3]! - boxes[0]![1]!).toBeCloseTo(297 * MM_TO_PT, 0);

    await page.emulateMedia({ media: "print" });
    const rects = await page.$$eval("section.page:first-child .label", (els) =>
      els.map((e) => {
        const r = e.getBoundingClientRect();
        const p = (e.parentElement as HTMLElement).getBoundingClientRect();
        return { x: r.left - p.left, y: r.top - p.top, w: r.width, h: r.height };
      }),
    );
    const { page: spec } = computePageSpec(tpl.canvas, sheet);
    expect(rects).toHaveLength(21);
    rects.forEach((r, i) => {
      const s = spec.slots[i]!;
      expect(r.x).toBeCloseTo(s.x * MM_TO_PX, 0);
      expect(r.y).toBeCloseTo(s.y * MM_TO_PX, 0);
      expect(r.w).toBeCloseTo(s.width * MM_TO_PX, 0);
      expect(r.h).toBeCloseTo(s.height * MM_TO_PX, 0);
    });
  });

  test("calibration page renders at the page size", async ({ page, browserName }) => {
    test.skip(browserName !== "chromium", "page.pdf() is Chromium-only.");
    const sheet = getPresetSizes().find((s) => s.id === "a4-21up")!.layout;
    await page.setContent(buildCalibrationDocument({ width: 63.5, height: 38.1, unit: "mm" }, sheet));
    const boxes = mediaBoxes(await page.pdf({ preferCSSPageSize: true }));
    expect(boxes).toHaveLength(1);
    expect(boxes[0]![2]! - boxes[0]![0]!).toBeCloseTo(210 * MM_TO_PT, 0);
  });
});

test.describe("print preview dialog in the editor", () => {
  test("opens as an accessible modal, previews, reports layout errors, and returns focus", async ({ page }) => {
    await page.goto("/?s=editor");
    await waitForEditor(page);
    const trigger = page.getByRole("button", { name: "Print preview" });
    await trigger.click();
    const dialog = page.getByRole("dialog", { name: "Print preview" });
    await expect(dialog).toBeVisible();
    await expect(dialog.getByTestId("els-print-summary")).toHaveText(/1 label on 1 page · page 50 × 75 mm/);
    await expect(dialog.getByTestId("els-print-frame")).toHaveAttribute("srcdoc", /@page \{ size: 50mm 75mm; margin: 0; \}/);
    await expect(dialog.getByTestId("els-print-frame")).toHaveAttribute("sandbox", "");

    await dialog.getByLabel("Records").selectOption("all");
    const copies = dialog.getByLabel("Copies of each label");
    await copies.fill("3");
    await copies.press("Enter");
    // Record 2 has no barcode value: it is skipped and reported, never printed.
    await expect(dialog.getByTestId("els-print-summary")).toHaveText(/3 labels on 3 pages/);
    await expect(dialog.getByText("1 record(s) will not print")).toBeVisible();

    await dialog.getByLabel("Media").selectOption("a4-21up");
    await expect(dialog.getByTestId("els-print-error")).toContainText("larger than the sheet cell");

    // Focus is contained: Tab from the last control wraps to the first.
    await page.keyboard.press("Shift+Tab");
    await expect(dialog.locator(":focus")).toHaveCount(1);
    await page.keyboard.press("Escape");
    await expect(dialog).toBeHidden();
    await expect(trigger).toBeFocused();
  });

  test("Print creates a sandboxed print frame from the same document", async ({ page }) => {
    await page.goto("/?s=editor");
    await waitForEditor(page);
    await page.getByRole("button", { name: "Print preview" }).click();
    await page.getByTestId("els-print-go").click();
    const frame = page.locator('iframe[title="Label print job"]');
    await expect(page.getByTestId("els-print-status")).toHaveText(/Sent 1 label\(s\) to the browser print dialog|Opening print dialog/);
    // The job frame (if still present) is sandboxed without scripts.
    if ((await frame.count()) > 0) await expect(frame).toHaveAttribute("sandbox", "allow-same-origin allow-modals");
  });
});
