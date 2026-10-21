import type { DataSchema, LabelTemplate } from "@pythonprakash/erp-label-studio/core";

export const dataSchema: DataSchema = {
  fields: [
    { path: "store.name", label: "Store name", group: "Store", example: "Lakshmi Silks" },
    { path: "product.name", label: "Product name", group: "Product", required: true, example: "Cotton Kurta" },
    { path: "product.sku", label: "SKU", group: "Product", example: "KRT-IND-042-M" },
    { path: "variant.size", label: "Size", group: "Variant", example: "M" },
    { path: "variant.color", label: "Colour", group: "Variant", example: "Indigo" },
    { path: "pricing.mrp", label: "MRP", group: "Pricing", type: "number", example: 1299 },
    { path: "pricing.offerPrice", label: "Offer price", group: "Pricing", type: "number" },
    { path: "inventory.batchNo", label: "Batch", group: "Inventory", example: "B2026-10" },
  ],
};

export const sampleRecords = [
  {
    store: { name: "Lakshmi Silks" },
    product: { name: "Cotton Kurta – Indigo Block Print", sku: "KRT-IND-042-M" },
    variant: { size: "M", color: "Indigo" },
    pricing: { mrp: 1299, offerPrice: 999 },
    inventory: { batchNo: "B2026-10" },
  },
  {
    store: { name: "Lakshmi Silks" },
    product: { name: "Linen Shirt" },
    variant: { size: "XL", color: "Sand" },
    pricing: { mrp: 2499 },
    inventory: { batchNo: "B2026-11" },
  },
];

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
    { id: "mrp", type: "text", x: 3, y: 30, width: 44, height: 8, content: { kind: "field", path: "pricing.mrp", prefix: "MRP ₹", format: { type: "number", decimals: 2, grouping: true } }, style: { fontFamily: "sans", fontSize: 13, fontWeight: "bold", align: "center" } },
    { id: "barcode", type: "barcode", x: 3, y: 45, width: 44, height: 18, format: "code128", value: { kind: "field", path: "product.sku" } },
  ],
};

/** Deterministic large template for performance tests (same mix as scripts/bench.mjs). */
export function makePerfTemplate(count: number): LabelTemplate {
  const cols = Math.ceil(Math.sqrt(count));
  const elements: LabelTemplate["elements"][number][] = [];
  for (let i = 0; i < count; i += 1) {
    const x = (i % cols) * 45 + 1;
    const y = Math.floor(i / cols) * 22 + 1;
    const k = i % 20;
    const id = `e${i}`;
    if (k < 14) elements.push({ id, type: "text", x, y, width: 40, height: 6, content: { kind: "field", path: "product.name", prefix: `${i} ` }, style: { fontFamily: "sans", fontSize: 8, overflow: k % 2 ? "wrap" : "ellipsis" } });
    else if (k < 16) elements.push({ id, type: "barcode", x, y, width: 43, height: 20, format: "code128", value: { kind: "field", path: "product.sku" } });
    else if (k < 18) elements.push({ id, type: "rect", x, y, width: 40, height: 18, stroke: "#000000", strokeWidth: 0.3 });
    else if (k < 19) elements.push({ id, type: "line", x, y: y + 5, width: 40, height: 1, strokeWidth: 0.3 });
    else elements.push({ id, type: "qrcode", x, y, width: 20, height: 20, value: { kind: "static", value: "https://erp.example.com/p/1" } });
  }
  return { schemaVersion: 1, id: `perf-${count}`, name: `Perf ${count}`, canvas: { width: Math.min(2000, cols * 45 + 2), height: Math.min(2000, Math.ceil(count / cols) * 22 + 2), unit: "mm" }, elements };
}
