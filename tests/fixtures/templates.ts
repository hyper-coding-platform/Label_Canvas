import type { LabelElement, LabelTemplate } from "../../src/core/schema/types";

export function baseTemplate(elements: LabelElement[] = [], overrides: Partial<LabelTemplate> = {}): LabelTemplate {
  return {
    schemaVersion: 1,
    id: "tpl-test",
    name: "Test label",
    canvas: { width: 50, height: 30, unit: "mm" },
    elements,
    ...overrides,
  };
}

export const textEl = (over: Partial<Extract<LabelElement, { type: "text" }>> = {}): LabelElement => ({
  id: "t1",
  type: "text",
  x: 2,
  y: 2,
  width: 46,
  height: 6,
  content: { kind: "field", path: "product.name" },
  style: { fontFamily: "sans", fontSize: 10 },
  ...over,
});

export const barcodeEl = (over: Partial<Extract<LabelElement, { type: "barcode" }>> = {}): LabelElement => ({
  id: "b1",
  type: "barcode",
  x: 2,
  y: 10,
  width: 46,
  height: 18,
  format: "code128",
  value: { kind: "field", path: "product.sku" },
  ...over,
});

export const qrEl = (over: Partial<Extract<LabelElement, { type: "qrcode" }>> = {}): LabelElement => ({
  id: "q1",
  type: "qrcode",
  x: 30,
  y: 5,
  width: 18,
  height: 18,
  value: { kind: "field", path: "product.url" },
  ...over,
});

/** A realistic textile retail label used across suites. */
export const textileTemplate: LabelTemplate = {
  schemaVersion: 1,
  id: "textile-hang-tag",
  name: "Textile hang tag",
  category: "textile",
  canvas: { width: 50, height: 75, unit: "mm", printerDpi: 203 },
  elements: [
    { id: "store", type: "text", x: 3, y: 3, width: 44, height: 6, content: { kind: "field", path: "store.name", fallback: "STORE" }, style: { fontFamily: "sans", fontSize: 11, fontWeight: "bold", align: "center" } },
    { id: "rule", type: "line", x: 3, y: 10, width: 44, height: 1, strokeWidth: 0.3 },
    { id: "name", type: "text", x: 3, y: 12, width: 44, height: 10, content: { kind: "field", path: "product.name", required: true }, style: { fontFamily: "sans", fontSize: 9, overflow: "wrap", maxLines: 2 } },
    { id: "size", type: "text", x: 3, y: 23, width: 20, height: 6, content: { kind: "field", path: "variant.size", prefix: "Size: " }, style: { fontFamily: "sans", fontSize: 9 } },
    { id: "color", type: "text", x: 25, y: 23, width: 22, height: 6, content: { kind: "field", path: "variant.color", prefix: "Colour: " }, style: { fontFamily: "sans", fontSize: 9, align: "right" } },
    {
      id: "mrp",
      type: "text",
      x: 3,
      y: 30,
      width: 44,
      height: 8,
      content: { kind: "field", path: "pricing.mrp", prefix: "MRP ₹", format: { type: "number", decimals: 2, grouping: true } },
      style: { fontFamily: "sans", fontSize: 13, fontWeight: "bold", align: "center" },
    },
    {
      id: "offer",
      type: "text",
      x: 3,
      y: 38,
      width: 44,
      height: 5,
      content: { kind: "field", path: "pricing.offerPrice", prefix: "Offer ₹", format: { type: "number", decimals: 2 } },
      style: { fontFamily: "sans", fontSize: 8, align: "center" },
      condition: { field: "pricing.offerPrice", op: "exists" },
    },
    { id: "barcode", type: "barcode", x: 3, y: 45, width: 44, height: 18, format: "code128", value: { kind: "field", path: "product.sku" } },
    { id: "batch", type: "text", x: 3, y: 66, width: 44, height: 5, content: { kind: "field", path: "inventory.batchNo", prefix: "Batch " }, style: { fontFamily: "mono", fontSize: 7, align: "center" } },
  ],
};

export const textileRecord = {
  store: { name: "Lakshmi Silks" },
  product: { name: "Cotton Kurta – Indigo Block Print", sku: "KRT-IND-042-M" },
  variant: { size: "M", color: "Indigo" },
  pricing: { mrp: 1299, offerPrice: 999 },
  inventory: { batchNo: "B2026-10" },
};
