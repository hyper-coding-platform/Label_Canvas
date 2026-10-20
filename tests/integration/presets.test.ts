import { describe, expect, it } from "vitest";
import { inferDataSchema } from "../../src/core/binding/infer-schema";
import { convertLength } from "../../src/core/geometry/units";
import { cloneTemplate, createPresetRegistry, getPresetSizes, getPresetTemplate, getPresetTemplates } from "../../src/core/presets/registry";
import { renderLabel } from "../../src/core/render/render-label";
import { renderNodeToSvgString } from "../../src/core/render/svg-serializer";
import { validateTemplate } from "../../src/core/validation/validate-template";
import { validateTemplateData } from "../../src/core/validation/validate-data";
import type { LabelTemplate } from "../../src/core/schema/types";
import { decodeSvg } from "./decode-helpers";

const ZXING = { code128: "Code128", "gs1-128": "Code128", ean13: "EAN-13", ean8: "EAN-8", upca: "UPC-A", itf14: "ITF" } as const;

describe("preset templates", () => {
  const presets = getPresetTemplates();

  it("ships at least one template per required industry", () => {
    const cats = new Set(presets.map((p) => p.category));
    for (const c of ["textile", "retail", "inventory", "jewellery", "shelf", "shipping", "apparel", "sheet"]) expect(cats.has(c), c).toBe(true);
  });

  it.each(presets.map((p) => [p.id, p] as const))("%s validates, matches its size preset, and renders its sample data without errors", (_id, p) => {
    const v = validateTemplate(p.template);
    expect(v.issues.filter((i) => i.severity === "error")).toEqual([]);
    const size = getPresetSizes().find((s) => s.id === p.sizeId)!;
    expect(size, p.sizeId).toBeDefined();
    expect([p.template.canvas.width, p.template.canvas.height, p.template.canvas.unit]).toEqual([size.width, size.height, size.unit]);
    const r = renderLabel(p.template, p.sampleData);
    expect(r.issues.filter((i) => i.severity === "error")).toEqual([]);
    // Every element warning is a known, documented layout advisory (no overflow surprises).
    for (const w of r.issues) expect(["BARCODE_TRUNCATED"]).toContain(w.code);
    expect(validateTemplateData(p.template, p.sampleData, { schema: p.dataSchema }).filter((i) => i.severity === "error")).toEqual([]);
  });

  it.each(presets.flatMap((p) => p.template.elements.filter((e) => e.type === "barcode" || e.type === "qrcode").map((e) => [`${p.id}/${e.id}`, p, e.id] as const)))(
    "%s decodes with zxing-cpp",
    async (_name, p, elementId) => {
      const el = p.template.elements.find((e) => e.id === elementId)!;
      // Render only this symbol so the decoder sees one code; same geometry as the full label.
      const solo: LabelTemplate = { ...p.template, elements: [el] };
      const svg = renderNodeToSvgString(renderLabel(solo, p.sampleData).root);
      const format = el.type === "qrcode" ? "QRCode" : el.type === "barcode" ? ZXING[el.format] : "QRCode";
      const scale = p.template.canvas.unit === "in" ? 2 : 6;
      const res = await decodeSvg(svg, [format], scale);
      expect(res.length, `${p.id}/${elementId}`).toBeGreaterThan(0);
    },
  );
});

describe("preset sizes", () => {
  it.each(getPresetSizes().map((s) => [s.id, s] as const))("%s has consistent geometry", (_id, s) => {
    expect(s.width).toBeGreaterThan(0);
    expect(s.height).toBeGreaterThan(0);
    const L = s.layout;
    if (L.kind === "sheet") {
      const w = convertLength(s.width, s.unit, L.unit);
      const h = convertLength(s.height, s.unit, L.unit);
      expect(L.margins.left + L.columns * w + (L.columns - 1) * L.gapX + L.margins.right).toBeCloseTo(L.page.width, 3);
      expect(L.margins.top + L.rows * h + (L.rows - 1) * L.gapY + L.margins.bottom).toBeCloseTo(L.page.height, 3);
      expect(L.margins.left).toBeGreaterThanOrEqual(0);
      expect(L.margins.top).toBeGreaterThanOrEqual(0);
    }
  });

  it("filters by category", () => {
    expect(getPresetSizes({ category: "sheet" }).every((s) => s.layout.kind === "sheet")).toBe(true);
  });
});

describe("registry and cloning", () => {
  it("returns independent deep copies; defaults are frozen", () => {
    const a = getPresetTemplate("textile-hang-tag", { id: "my-tag", name: "My tag" })!;
    expect(a.id).toBe("my-tag");
    (a.elements as unknown as { x: number }[])[0]!.x = 99;
    expect(getPresetTemplate("textile-hang-tag")!.elements[0]!.x).toBe(3);
    expect(Object.isFrozen(getPresetTemplates()[0]!.template.elements[0])).toBe(true);
  });

  it("cloneTemplate assigns a new id and copies deeply", () => {
    const src = getPresetTemplates()[0]!.template;
    const c = cloneTemplate(src);
    expect(c.id).toBe(`${src.id}-copy`);
    expect(c.elements).not.toBe(src.elements);
    expect(c.elements).toEqual(src.elements);
    expect(() => cloneTemplate(src, { id: "bad id" })).toThrow();
  });

  it("custom presets are validated, isolated per registry, and cannot replace built-ins", () => {
    const r1 = createPresetRegistry();
    const r2 = createPresetRegistry();
    const base = getPresetTemplates()[0]!;
    r1.addTemplate({ ...base, id: "custom-tag", template: { ...base.template, id: "custom-tag" } });
    expect(r1.listTemplates().some((t) => t.id === "custom-tag")).toBe(true);
    expect(r2.listTemplates().some((t) => t.id === "custom-tag")).toBe(false);
    expect(() => r1.addTemplate({ ...base, id: "broken", template: { ...base.template, canvas: { width: -1, height: 1, unit: "mm" } } })).toThrow(/invalid/);
    expect(() => r1.addTemplate(base)).toThrow(/cannot be replaced/);
    expect(() => r1.addSize(getPresetSizes()[0]!)).toThrow(/cannot be replaced/);
    r1.addSize({ ...getPresetSizes()[0]!, id: "my-roll-40x20", width: 40, height: 20 });
    expect(r1.getSize("my-roll-40x20")?.width).toBe(40);
  });
});

describe("field discovery", () => {
  it("infers bindable fields from an ERP record, skipping unsafe keys", () => {
    const record = JSON.parse('{"product":{"name":"Kurta","sku":"K1","mrp":1299,"active":true,"launched":"2026-01-02","tags":[{"label":"new"}]},"bad key":1,"__proto__":{"x":1},"store":null}');
    const schema = inferDataSchema(record);
    const paths = schema.fields.map((f) => f.path);
    expect(paths).toEqual(["product.name", "product.sku", "product.mrp", "product.active", "product.launched", "product.tags.0.label", "store"]);
    expect(schema.fields.find((f) => f.path === "product.mrp")).toMatchObject({ type: "number", label: "Mrp", group: "Product", example: 1299 });
    expect(schema.fields.find((f) => f.path === "product.launched")?.type).toBe("date");
  });

  it("is bounded for huge or cyclic records", () => {
    const big: Record<string, unknown> = {};
    for (let i = 0; i < 2000; i += 1) big[`f${i}`] = i;
    expect(inferDataSchema(big, { maxFields: 100 }).fields).toHaveLength(100);
    const cyclic: Record<string, unknown> = { a: 1 };
    cyclic.self = cyclic;
    expect(inferDataSchema(cyclic).fields.map((f) => f.path)).toEqual(["a"]);
  });
});
