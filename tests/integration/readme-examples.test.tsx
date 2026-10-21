// @vitest-environment jsdom
/**
 * The README's code examples, copied (nearly) verbatim so `tsc` type-checks
 * them and this suite executes them. If the README changes, update this file.
 */
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { LabelEditor, getPresetTemplate, type DataSchema, type LabelTemplate } from "../../src/entries/index";
import { LabelRenderer } from "../../src/entries/renderer";
import { generateLabels, parseTemplate, renderLabel, renderNodeToSvgString, serializeTemplate, buildPrintDocument } from "../../src/entries/core";
import { getPresetSizes } from "../../src/entries/presets";

afterEach(cleanup);

const schema: DataSchema = {
  fields: [
    { path: "product.name", label: "Product name", group: "Product", required: true, example: "Cotton Kurta" },
    { path: "product.barcode", label: "Barcode", group: "Product", example: "260042130115" },
    { path: "pricing.mrp", label: "MRP", group: "Pricing", type: "number", example: 1299 },
  ],
};

function TextileLabelDesigner({ saveTemplate }: { saveTemplate: (t: LabelTemplate) => Promise<void> }) {
  return (
    <div style={{ height: 640 }}>
      <LabelEditor initialTemplate={getPresetTemplate("textile-hang-tag")!} dataSchema={schema} onSave={saveTemplate} />
    </div>
  );
}

describe("README examples", () => {
  it("editor example renders with the preset and schema", () => {
    render(<TextileLabelDesigner saveTemplate={vi.fn(async () => undefined)} />);
    expect(screen.getByRole("toolbar", { name: "Label editor tools" })).toBeTruthy();
    expect(screen.getByTestId("els-canvas").textContent).toContain("Cotton Kurta");
  });

  it("renderer-only and core examples", async () => {
    const template = getPresetTemplate("textile-hang-tag")!;
    const record = { store: { name: "S" }, product: { name: "Kurta", barcode: "260042130115" }, pricing: { mrp: 1299 } };
    const { container } = render(<LabelRenderer template={template} data={record} />);
    expect(container.querySelector("svg")?.getAttribute("width")).toBe("50mm");

    let svg = "";
    const result = renderLabel(template, record);
    if (result.ok) svg = renderNodeToSvgString(result.root);
    expect(svg.startsWith("<svg")).toBe(true);
    expect(renderLabel(template, { product: { name: "x" }, pricing: { mrp: 1 } }).issues.map((i) => i.code)).toContain("BARCODE_VALUE_MISSING");

    const parsed = parseTemplate(serializeTemplate(template));
    expect(parsed.ok).toBe(true);

    async function* productsAsyncIterable() {
      yield record;
      yield { ...record, product: { name: "No barcode" } };
    }
    const outcomes: [number, boolean][] = [];
    for await (const label of generateLabels(template, productsAsyncIterable())) outcomes.push([label.index, label.ok]);
    expect(outcomes).toEqual([[0, true], [1, false]]);

    const sheet = getPresetSizes().find((s) => s.id === "a4-21up")!.layout;
    const sticker = getPresetTemplate("a4-product-sticker")!;
    const doc = buildPrintDocument(sticker, [{ product: { name: "A", sku: "A1" } }, { product: { name: "B" } }], { layout: sheet, copies: 2 });
    // Record B has no SKU: it is skipped and reported, never printed.
    expect(doc.labelCount).toBe(2);
    expect(doc.skipped.map((x) => x.recordIndex)).toEqual([1]);
  });
});
