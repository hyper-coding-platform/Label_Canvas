import { JSDOM } from "jsdom";
import { describe, expect, it } from "vitest";
import { renderLabel, prepareTemplate } from "../../src/core/render/render-label";
import { renderNodeToSvgString, escapeText, escapeAttribute } from "../../src/core/render/svg-serializer";
import { node, walkNodes, RenderNodeError, type RenderNode } from "../../src/core/render/nodes";
import { estimateTextMeasurer, layoutText, truncateToWidth, wrapText, type MeasureFont } from "../../src/core/render/text-layout";
import { BUILT_IN_FONTS } from "../../src/core/schema/fonts";
import { TemplateValidationError } from "../../src/core/errors";
import { validateTemplateData, getTemplateFieldPaths } from "../../src/core/validation/validate-data";
import { baseTemplate, barcodeEl, qrEl, textEl, textileRecord, textileTemplate } from "../fixtures/templates";

const parser = new new JSDOM().window.DOMParser();
function parseSvg(svg: string) {
  const doc = parser.parseFromString(svg, "image/svg+xml");
  expect(doc.getElementsByTagName("parsererror").length).toBe(0);
  return doc;
}
const find = (root: RenderNode, pred: (n: RenderNode) => boolean) => {
  const out: RenderNode[] = [];
  walkNodes(root, (n) => pred(n) && out.push(n));
  return out;
};
const elementGroup = (root: RenderNode, id: string) => find(root, (n) => n.attrs["data-element-id"] === id)[0];

describe("renderLabel", () => {
  it("renders a well-formed SVG with physical size and viewBox in template units", () => {
    const r = renderLabel(textileTemplate, textileRecord);
    expect(r.ok).toBe(true);
    expect(r.issues.filter((i) => i.severity === "error")).toEqual([]);
    const svg = renderNodeToSvgString(r.root);
    const doc = parseSvg(svg);
    const root = doc.documentElement;
    expect(root.getAttribute("width")).toBe("50mm");
    expect(root.getAttribute("height")).toBe("75mm");
    expect(root.getAttribute("viewBox")).toBe("0 0 50 75");
    expect(svg).toContain("Lakshmi Silks");
    expect(svg).toContain("MRP ₹1,299.00");
    expect(svg).toContain("Offer ₹999.00");
  });

  it("is deterministic and does not mutate inputs", () => {
    const tpl = structuredClone(textileTemplate);
    const rec = structuredClone(textileRecord);
    const a = renderNodeToSvgString(renderLabel(tpl, rec).root);
    const b = renderNodeToSvgString(renderLabel(structuredClone(textileTemplate), structuredClone(textileRecord)).root);
    expect(a).toBe(b);
    expect(tpl).toEqual(textileTemplate);
    expect(rec).toEqual(textileRecord);
  });

  it("throws a structured error for invalid templates", () => {
    expect(() => renderLabel(baseTemplate([textEl({ width: -1 })]), {})).toThrow(TemplateValidationError);
  });

  it("prepareTemplate returns a frozen copy and caches by identity", () => {
    const t = structuredClone(textileTemplate);
    const p = prepareTemplate(t);
    expect(Object.isFrozen(p)).toBe(true);
    expect(Object.isFrozen(p.elements[0])).toBe(true);
    expect(prepareTemplate(t)).toBe(p);
    expect(prepareTemplate(p)).toBe(p);
  });

  it("skips hidden elements and elements whose condition is false", () => {
    const r = renderLabel(textileTemplate, { ...textileRecord, pricing: { mrp: 10 } });
    expect(elementGroup(r.root, "offer")).toBeUndefined();
    const hidden = renderLabel(baseTemplate([textEl({ visible: false })]), { product: { name: "x" } });
    expect(elementGroup(hidden.root, "t1")).toBeUndefined();
  });

  it("applies rotation about the element centre", () => {
    const r = renderLabel(baseTemplate([textEl({ rotation: 90 })]), { product: { name: "x" } });
    expect(elementGroup(r.root, "t1")?.attrs.transform).toBe("rotate(90 25 5)");
  });

  it("omits optional missing text silently and reports required missing text", () => {
    const opt = renderLabel(baseTemplate([textEl()]), {});
    expect(opt.ok).toBe(true);
    expect(opt.issues).toEqual([]);
    expect(elementGroup(opt.root, "t1")).toBeUndefined();
    const req = renderLabel(baseTemplate([textEl({ content: { kind: "field", path: "product.name", required: true } })]), {});
    expect(req.ok).toBe(false);
    expect(req.issues[0]).toMatchObject({ code: "FIELD_REQUIRED_MISSING", elementId: "t1" });
  });

  it("never generates a barcode for missing or invalid data", () => {
    const missing = renderLabel(baseTemplate([barcodeEl()]), {});
    expect(missing.ok).toBe(false);
    expect(missing.issues[0]?.code).toBe("BARCODE_VALUE_MISSING");
    expect(elementGroup(missing.root, "b1")).toBeUndefined();

    const invalid = renderLabel(baseTemplate([barcodeEl({ format: "ean13" })]), { product: { sku: "ABC" } });
    expect(invalid.issues[0]?.code).toBe("BARCODE_VALUE_INVALID");
    expect(find(invalid.root, (n) => n.tag === "path")).toHaveLength(0);

    const hidden = renderLabel(baseTemplate([barcodeEl({ whenMissing: "hide" })]), {});
    expect(hidden.ok).toBe(true);
    expect(elementGroup(hidden.root, "b1")).toBeUndefined();
  });

  it("design mode draws a marked placeholder that is not a symbol", () => {
    const r = renderLabel(baseTemplate([barcodeEl()]), {}, { mode: "design" });
    const g = elementGroup(r.root, "b1")!;
    expect(find(g, (n) => n.attrs["data-placeholder"] === "true")).toHaveLength(1);
    expect(find(g, (n) => n.tag === "path")).toHaveLength(0);
    expect(r.ok).toBe(false);
  });

  it("renders barcodes and QR codes as crisp vector paths", () => {
    const r = renderLabel(baseTemplate([barcodeEl(), qrEl({ x: 2, y: 2, width: 20, height: 20 })], { canvas: { width: 80, height: 40, unit: "mm" } }), { product: { sku: "SKU-1", url: "https://example.com" } });
    expect(r.ok).toBe(true);
    const paths = find(r.root, (n) => n.tag === "path");
    expect(paths).toHaveLength(2);
    for (const p of paths) expect(p.attrs["shape-rendering"]).toBe("crispEdges");
  });

  it("uses unique clip-path ids per idPrefix", () => {
    const svgA = renderNodeToSvgString(renderLabel(textileTemplate, textileRecord, { idPrefix: "a1" }).root);
    const svgB = renderNodeToSvgString(renderLabel(textileTemplate, textileRecord, { idPrefix: "b2" }).root);
    expect(svgA).toContain('id="a1-clip-0"');
    expect(svgB).toContain('id="b2-clip-0"');
    expect(() => renderLabel(textileTemplate, textileRecord, { idPrefix: '"><script>' })).toThrow(TypeError);
  });

  it("reports text overflow", () => {
    const r = renderLabel(baseTemplate([textEl({ width: 10 })]), { product: { name: "A very long product name that cannot fit" } });
    expect(r.issues.map((i) => i.code)).toContain("TEXT_OVERFLOW");
    expect(r.ok).toBe(true); // overflow is a warning
  });

  it("works with px and in units", () => {
    const px = renderLabel(baseTemplate([textEl({ x: 5, y: 5, width: 100, height: 20 })], { canvas: { width: 200, height: 100, unit: "px" } }), { product: { name: "x" } });
    expect(px.root.attrs.width).toBe("200px");
    const inch = renderLabel(baseTemplate([], { canvas: { width: 2, height: 1, unit: "in" } }), {});
    expect(inch.root.attrs.width).toBe("2in");
  });
});

describe("validateTemplateData", () => {
  it("lists template field paths including conditions", () => {
    expect(getTemplateFieldPaths(textileTemplate)).toEqual(["store.name", "product.name", "variant.size", "variant.color", "pricing.mrp", "pricing.offerPrice", "product.sku", "inventory.batchNo"]);
  });

  it("reports record problems and schema mismatches", () => {
    const issues = validateTemplateData(textileTemplate, { product: { sku: "Café" } }, {
      schema: { fields: [{ path: "product.name", label: "Name", required: true }, { path: "product.sku", label: "SKU" }] },
    });
    const codes = issues.map((i) => i.code);
    expect(codes).toContain("FIELD_REQUIRED_MISSING");
    expect(codes).toContain("BARCODE_VALUE_INVALID");
    expect(codes).toContain("SCHEMA_REQUIRED_FIELD_MISSING");
    expect(codes).toContain("FIELD_NOT_IN_SCHEMA");
  });
});

describe("render nodes and serializer", () => {
  it("rejects attributes outside the allowlist", () => {
    expect(() => node("rect", { onload: "alert(1)" })).toThrow(RenderNodeError);
    expect(() => node("image", { href: "javascript:alert(1)" })).toThrow(RenderNodeError);
    expect(() => node("g", { "clip-path": "url(javascript:x)" })).toThrow(RenderNodeError);
    expect(() => node("rect", { fill: "<script>" })).toThrow(RenderNodeError);
    expect(() => node("rect", {}, [], "text")).toThrow(RenderNodeError);
  });

  it("re-validates hand-built trees at serialization", () => {
    const forged = { tag: "rect", attrs: { onclick: "x" }, children: [] } as unknown as RenderNode;
    expect(() => renderNodeToSvgString(forged)).toThrow(RenderNodeError);
  });

  it("escapes text and attributes", () => {
    expect(escapeText('<script>&"')).toBe('&lt;script&gt;&amp;"');
    expect(escapeText("a\u0000b\u0008c")).toBe("abc");
    expect(escapeAttribute(`"'<>&`)).toBe("&quot;&#39;&lt;&gt;&amp;");
  });
});

describe("text layout", () => {
  const sans = BUILT_IN_FONTS[0]!;
  const f: MeasureFont = { font: sans, size: 4, bold: false, italic: false, letterSpacing: 0 };
  const base = { font: f, width: 30, height: 10, lineHeight: 1.2, minSize: 1 } as const;

  it("estimates widths deterministically and scales with size, bold and spacing", () => {
    const w = estimateTextMeasurer.measure("Hello", f);
    expect(w).toBeGreaterThan(0);
    expect(estimateTextMeasurer.measure("Hello", { ...f, size: 8 })).toBeCloseTo(w * 2, 9);
    expect(estimateTextMeasurer.measure("Hello", { ...f, bold: true })).toBeGreaterThan(w);
    expect(estimateTextMeasurer.measure("Hello", { ...f, letterSpacing: 1 })).toBeCloseTo(w + 5, 9);
    expect(estimateTextMeasurer.measure("iiii", f)).toBeLessThan(estimateTextMeasurer.measure("WWWW", f));
  });

  it("wraps words, breaks overlong words, and keeps paragraphs", () => {
    const lines = wrapText("the quick brown fox jumps over the lazy dog", 30, f, estimateTextMeasurer);
    expect(lines.length).toBeGreaterThan(1);
    for (const l of lines) expect(estimateTextMeasurer.measure(l, f)).toBeLessThanOrEqual(30 + 1e-9);
    expect(lines.join(" ")).toBe("the quick brown fox jumps over the lazy dog");
    const long = wrapText("X".repeat(40), 30, f, estimateTextMeasurer);
    expect(long.join("")).toBe("X".repeat(40));
    expect(wrapText("a\nb", 30, f, estimateTextMeasurer)).toEqual(["a", "b"]);
  });

  it("truncates with an ellipsis to fit", () => {
    const t = truncateToWidth("Extraordinarily long product title", 20, f, estimateTextMeasurer);
    expect(t.endsWith("…")).toBe(true);
    expect(estimateTextMeasurer.measure(t, f)).toBeLessThanOrEqual(20);
  });

  it("applies each overflow policy", () => {
    const long = "Handloom Banarasi silk saree with zari border";
    expect(layoutText({ ...base, text: long, overflow: "clip" }, estimateTextMeasurer)).toMatchObject({ overflowed: true, truncated: false });
    const e = layoutText({ ...base, text: long, overflow: "ellipsis" }, estimateTextMeasurer);
    expect(e.truncated).toBe(true);
    expect(e.lines[0]!.endsWith("…")).toBe(true);
    const s = layoutText({ ...base, text: long, overflow: "shrink" }, estimateTextMeasurer);
    expect(s.size).toBeLessThan(4);
    expect(s.overflowed).toBe(false);
    expect(estimateTextMeasurer.measure(long, { ...f, size: s.size })).toBeLessThanOrEqual(30 + 1e-6);
    const w = layoutText({ ...base, text: long, overflow: "wrap", maxLines: 2 }, estimateTextMeasurer);
    expect(w.lines.length).toBeLessThanOrEqual(2);
    expect(layoutText({ ...base, text: "short", overflow: "shrink" }, estimateTextMeasurer)).toMatchObject({ size: 4, overflowed: false });
    expect(layoutText({ ...base, minSize: 3.9, text: long, overflow: "shrink" }, estimateTextMeasurer).overflowed).toBe(true);
  });
});
