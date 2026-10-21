// Demo preset for the 0.1.0 features: conditional styles (size highlight), shapes and data binding.
// Types come from the published package, so this template is checked against the real schema.
import type { LabelElement, StyleRule } from "@pythonprakash/erp-label-studio/core";
import type { PresetTemplate } from "@pythonprakash/erp-label-studio/presets";

export const SIZES = ["S", "M", "L", "XL"] as const;

/** One box per size: white with a black border, black with white bold text when it is the record's size. */
const sizeBox = (size: (typeof SIZES)[number], i: number): LabelElement => {
  const highlight: StyleRule = { when: { field: "variant.size", op: "eq", value: size }, set: { fill: "#000000", color: "#ffffff", fontWeight: "bold" } };
  return {
    id: `size-${size}`,
    name: `Size ${size}`,
    type: "text",
    x: 4 + i * 11,
    y: 13,
    width: 10,
    height: 7,
    content: { kind: "static", value: size },
    style: { fontFamily: "sans", fontSize: 10, align: "center", verticalAlign: "middle" },
    border: { width: 0.25, color: "#000000", radius: 1 },
    styleRules: [highlight],
  };
};

export const SIZE_DEMO: PresetTemplate = {
  id: "demo-size-highlight",
  name: "★ Demo: size highlight (conditional style)",
  category: "textile",
  sizeId: "",
  description: "Highlights the record's size, marks sale items with a star, and dims discontinued items.",
  template: {
    schemaVersion: 1,
    id: "demo-size-highlight",
    name: "Size highlight demo",
    canvas: { width: 60, height: 40, unit: "mm" },
    elements: [
      { id: "title", type: "text", x: 4, y: 3, width: 40, height: 7, content: { kind: "field", path: "product.name", fallback: "Product" }, style: { fontFamily: "sans", fontSize: 10, fontWeight: "bold" } },
      // A shape that changes with the data: outlined normally, filled gold when there is an offer price.
      {
        id: "sale-star",
        name: "Sale star",
        type: "shape",
        shape: "star",
        x: 48,
        y: 2,
        width: 9,
        height: 9,
        stroke: "#9a6700",
        strokeWidth: 0.3,
        styleRules: [{ when: { field: "pricing.offerPrice", op: "exists" }, set: { fill: "#ffcc00" } }],
      },
      ...SIZES.map(sizeBox),
      { id: "size-label", type: "text", x: 49, y: 14, width: 10, height: 5, content: { kind: "static", value: "SIZE" }, style: { fontFamily: "sans", fontSize: 6, align: "center", color: "#555555" } },
      {
        id: "price",
        type: "text",
        x: 4,
        y: 22,
        width: 52,
        height: 5,
        content: { kind: "field", path: "pricing.mrp", prefix: "MRP ₹", format: { type: "number", decimals: 2, grouping: true } },
        style: { fontFamily: "sans", fontSize: 8 },
        // Several rules on one element: bold for sale items, red for low stock.
        styleRules: [
          { when: { field: "pricing.offerPrice", op: "exists" }, set: { fontWeight: "bold" } },
          { when: { field: "stock.qty", op: "lt", value: 5 }, set: { color: "#c62828" } },
        ],
      },
      {
        id: "barcode",
        type: "barcode",
        x: 4,
        y: 27,
        width: 52,
        height: 11,
        format: "code128",
        value: { kind: "field", path: "product.sku" },
        textSize: 6,
        // Discontinued items print faded.
        styleRules: [{ when: { field: "product.discontinued", op: "eq", value: true }, set: { opacity: 0.35 } }],
      },
    ],
  },
  dataSchema: {
    fields: [
      { path: "product.name", label: "Name", group: "Product", example: "Cotton Kurta" },
      { path: "product.sku", label: "SKU", group: "Product", example: "KRT-042-M" },
      { path: "product.discontinued", label: "Discontinued", group: "Product", type: "boolean", example: false },
      { path: "variant.size", label: "Size", group: "Variant", example: "M" },
      { path: "pricing.mrp", label: "MRP", group: "Pricing", type: "number", example: 1299 },
      { path: "pricing.offerPrice", label: "Offer price", group: "Pricing", type: "number", example: 999 },
      { path: "stock.qty", label: "Stock", group: "Stock", type: "number", example: 12 },
    ],
  },
  sampleData: {
    product: { name: "Cotton Kurta", sku: "KRT-042-M", discontinued: false },
    variant: { size: "M" },
    pricing: { mrp: 1299, offerPrice: 999 },
    stock: { qty: 12 },
  },
};
