/**
 * Ready-made, editable industry templates. All are original designs created
 * for this package (no third-party artwork). Hosts receive deep copies, so
 * customisations never alter these defaults (and changes to these defaults in
 * future versions never alter a host's saved templates).
 */
import type { DataRecord, DataSchema, LabelElement, LabelTemplate, TextStyle, ValueSource } from "../schema/types";

export interface PresetTemplate {
  readonly id: string;
  readonly name: string;
  readonly category: string;
  /** Matching preset size id. */
  readonly sizeId: string;
  readonly description: string;
  readonly template: LabelTemplate;
  /** Fields this template binds, for the editor's field picker. */
  readonly dataSchema: DataSchema;
  /** A realistic record for previews and tests. */
  readonly sampleData: DataRecord;
}

const f = (path: string, extra: Partial<Extract<ValueSource, { kind: "field" }>> = {}): ValueSource => ({ kind: "field", path, ...extra });
const s = (value: string): ValueSource => ({ kind: "static", value });
const style = (fontSize: number, extra: Partial<TextStyle> = {}): TextStyle => ({ fontFamily: "sans", fontSize, ...extra });
const text = (id: string, x: number, y: number, width: number, height: number, content: ValueSource, st: TextStyle, extra: Partial<LabelElement> = {}): LabelElement =>
  ({ id, type: "text", x, y, width, height, content, style: st, ...extra }) as LabelElement;
const money = { type: "number", decimals: 2, grouping: true } as const;

const tpl = (id: string, name: string, category: string, width: number, height: number, unit: "mm" | "in", printerDpi: number | undefined, elements: LabelElement[]): LabelTemplate => ({
  schemaVersion: 1,
  id,
  name,
  category,
  canvas: { width, height, unit, ...(printerDpi ? { printerDpi } : {}) },
  elements,
});

/* Built lazily (no module-level calls) so renderer-only bundles exclude preset data. */
let templatesCache: readonly PresetTemplate[] | undefined;

export function builtInTemplates(): readonly PresetTemplate[] {
  return (templatesCache ??= buildTemplates());
}

const buildTemplates = (): readonly PresetTemplate[] => [
  {
    id: "textile-hang-tag",
    name: "Textile hang tag",
    category: "textile",
    sizeId: "apparel-hangtag-50x75",
    description: "Store, product, size, colour, MRP with optional offer price, Code 128 item code, SKU and batch. Numeric item codes give the widest bars (Code 128 set C).",
    template: tpl("textile-hang-tag", "Textile hang tag", "textile", 50, 75, "mm", 203, [
      text("store", 3, 3, 44, 6, f("store.name", { fallback: "STORE" }), style(11, { fontWeight: "bold", align: "center" })),
      { id: "rule", type: "line", x: 3, y: 10, width: 44, height: 1, strokeWidth: 0.3 },
      text("name", 3, 12, 44, 10, f("product.name", { required: true }), style(9, { overflow: "wrap", maxLines: 2 })),
      text("size", 3, 23, 20, 6, f("variant.size", { prefix: "Size: " }), style(9)),
      text("color", 25, 23, 22, 6, f("variant.color", { prefix: "Colour: " }), style(9, { align: "right", overflow: "ellipsis" })),
      text("mrp", 3, 30, 44, 8, f("pricing.mrp", { prefix: "MRP ₹", format: money, required: true }), style(13, { fontWeight: "bold", align: "center" })),
      text("offer", 3, 38, 44, 5, f("pricing.offerPrice", { prefix: "Offer ₹", format: money }), style(8, { align: "center" }), { condition: { field: "pricing.offerPrice", op: "exists" } }),
      { id: "barcode", type: "barcode", x: 3, y: 44, width: 44, height: 18, format: "code128", value: f("product.barcode") },
      text("sku", 3, 63, 44, 4.5, f("product.sku"), { ...style(7, { align: "center", overflow: "ellipsis" }), fontFamily: "mono" }),
      text("batch", 3, 68, 44, 4.5, f("inventory.batchNo", { prefix: "Batch " }), { ...style(7, { align: "center" }), fontFamily: "mono" }),
    ]),
    dataSchema: {
      fields: [
        { path: "store.name", label: "Store name", group: "Store" },
        { path: "product.name", label: "Product name", group: "Product", required: true },
        { path: "product.sku", label: "SKU", group: "Product" },
        { path: "product.barcode", label: "Barcode (item code)", group: "Product", required: true, description: "Numeric codes of up to 12 digits fit best." },
        { path: "variant.size", label: "Size", group: "Variant" },
        { path: "variant.color", label: "Colour", group: "Variant" },
        { path: "pricing.mrp", label: "MRP", group: "Pricing", type: "number", required: true },
        { path: "pricing.offerPrice", label: "Offer price", group: "Pricing", type: "number" },
        { path: "inventory.batchNo", label: "Batch number", group: "Inventory" },
      ],
    },
    sampleData: {
      store: { name: "Lakshmi Silks" },
      product: { name: "Cotton Kurta – Indigo Block Print", sku: "KRT-IND-042-M", barcode: "260042130115" },
      variant: { size: "M", color: "Indigo" },
      pricing: { mrp: 1299, offerPrice: 999 },
      inventory: { batchNo: "B2026-10" },
    },
  },
  {
    id: "retail-price-label",
    name: "Retail price label",
    category: "retail",
    sizeId: "retail-50x25",
    description: "Product name, price and EAN-13. Small labels truncate bar height; a scanner test is recommended.",
    template: tpl("retail-price-label", "Retail price label", "retail", 50, 25, "mm", 203, [
      text("name", 2, 1.5, 46, 4, f("product.name"), style(7, { overflow: "ellipsis" })),
      text("price", 2, 5.5, 46, 5, f("pricing.price", { prefix: "₹ ", format: money, required: true }), style(11, { fontWeight: "bold" })),
      { id: "ean", type: "barcode", x: 2, y: 11, width: 46, height: 13, format: "ean13", value: f("product.gtin") },
    ]),
    dataSchema: {
      fields: [
        { path: "product.name", label: "Product name", group: "Product" },
        { path: "product.gtin", label: "GTIN-13 / EAN", group: "Product", required: true },
        { path: "pricing.price", label: "Price", group: "Pricing", type: "number", required: true },
      ],
    },
    sampleData: { product: { name: "Basmati Rice 1 kg", gtin: "890103086527" }, pricing: { price: 145 } },
  },
  {
    id: "shelf-label",
    name: "Shelf label",
    category: "shelf",
    sizeId: "shelf-70x38",
    description: "Shelf-edge label with large price, unit price and EAN-13.",
    template: tpl("shelf-label", "Shelf label", "shelf", 70, 38, "mm", 203, [
      text("name", 3, 2, 64, 9, f("product.name", { required: true }), style(9, { overflow: "wrap", maxLines: 2, fontWeight: "bold" })),
      text("price", 47, 12, 21, 11, f("pricing.price", { prefix: "₹", format: money, required: true }), style(18, { fontWeight: "bold", align: "right", overflow: "shrink" })),
      text("unit", 47, 23, 21, 5, f("pricing.unitPrice", { prefix: "₹", suffix: " / kg", format: money }), style(6.5, { align: "right", overflow: "shrink" })),
      { id: "ean", type: "barcode", x: 2, y: 12, width: 44, height: 24, format: "ean13", value: f("product.gtin"), whenMissing: "hide" },
      text("date", 47, 30, 21, 5, f("meta.printedOn", { prefix: "Printed ", format: { type: "date", pattern: "DD MMM YYYY" } }), style(6, { align: "right", color: "#555555" })),
    ]),
    dataSchema: {
      fields: [
        { path: "product.name", label: "Product name", group: "Product", required: true },
        { path: "product.gtin", label: "GTIN-13 / EAN", group: "Product" },
        { path: "pricing.price", label: "Price", group: "Pricing", type: "number", required: true },
        { path: "pricing.unitPrice", label: "Unit price", group: "Pricing", type: "number" },
        { path: "meta.printedOn", label: "Print date", group: "Meta", type: "date" },
      ],
    },
    sampleData: { product: { name: "Organic Toor Dal 500 g", gtin: "4006381333931" }, pricing: { price: 98, unitPrice: 196 }, meta: { printedOn: "2026-10-19" } },
  },
  {
    id: "inventory-bin-label",
    name: "Inventory bin label",
    category: "inventory",
    sizeId: "inventory-60x40",
    description: "Large SKU, description, location and Code 128.",
    template: tpl("inventory-bin-label", "Inventory bin label", "inventory", 60, 40, "mm", 203, [
      text("sku", 3, 2, 54, 8, f("item.sku", { required: true }), { ...style(14, { fontWeight: "bold", overflow: "shrink" }), fontFamily: "mono" }),
      text("desc", 3, 10, 54, 8, f("item.description"), style(7.5, { overflow: "wrap", maxLines: 2 })),
      text("loc", 3, 18, 54, 5, f("location.code", { prefix: "Location: " }), style(8, { fontWeight: "bold" })),
      { id: "code", type: "barcode", x: 3, y: 24, width: 54, height: 14, format: "code128", value: f("item.sku") },
    ]),
    dataSchema: {
      fields: [
        { path: "item.sku", label: "SKU", group: "Item", required: true },
        { path: "item.description", label: "Description", group: "Item" },
        { path: "location.code", label: "Bin location", group: "Location" },
      ],
    },
    sampleData: { item: { sku: "FAB-CTN-60-WHT", description: "Cotton poplin 60s, white, 58 inch width" }, location: { code: "A-12-03" } },
  },
  {
    id: "warehouse-carton-label",
    name: "Warehouse carton label",
    category: "inventory",
    sizeId: "inventory-100x50",
    description: "SKU, quantity, QR code link and Code 128 for cartons.",
    template: tpl("warehouse-carton-label", "Warehouse carton label", "inventory", 100, 50, "mm", 203, [
      text("sku", 3, 3, 62, 9, f("item.sku", { required: true }), { ...style(18, { fontWeight: "bold", overflow: "shrink" }), fontFamily: "mono" }),
      text("desc", 3, 12, 62, 9, f("item.description"), style(8, { overflow: "wrap", maxLines: 2 })),
      text("qty", 3, 21, 62, 6, f("carton.quantity", { prefix: "Qty: ", suffix: " pcs" }), style(10, { fontWeight: "bold" })),
      { id: "qr", type: "qrcode", x: 68, y: 3, width: 29, height: 29, value: f("item.url"), errorCorrection: "M", whenMissing: "hide" },
      { id: "code", type: "barcode", x: 3, y: 30, width: 94, height: 17, format: "code128", value: f("item.sku") },
    ]),
    dataSchema: {
      fields: [
        { path: "item.sku", label: "SKU", group: "Item", required: true },
        { path: "item.description", label: "Description", group: "Item" },
        { path: "item.url", label: "Product URL", group: "Item" },
        { path: "carton.quantity", label: "Quantity per carton", group: "Carton", type: "number" },
      ],
    },
    sampleData: { item: { sku: "KRT-IND-042", description: "Cotton kurta, indigo block print, assorted sizes", url: "https://erp.example.com/i/KRT-IND-042" }, carton: { quantity: 24 } },
  },
  {
    id: "fabric-roll-label",
    name: "Fabric roll label",
    category: "textile",
    sizeId: "textile-roll-100x50",
    description: "Fabric, width, length, roll number and GS1-128 (GTIN + lot). The host supplies the bracketed GS1 element string.",
    template: tpl("fabric-roll-label", "Fabric roll label", "textile", 100, 50, "mm", 203, [
      text("fabric", 3, 2, 94, 8, f("fabric.name", { required: true }), style(13, { fontWeight: "bold", overflow: "ellipsis" })),
      text("width", 3, 10, 30, 6, f("fabric.widthCm", { prefix: "Width ", suffix: " cm" }), style(9)),
      text("length", 35, 10, 30, 6, f("roll.lengthM", { prefix: "Length ", suffix: " m", format: { type: "number", decimals: 1 } }), style(9, { fontWeight: "bold" })),
      text("roll", 67, 10, 30, 6, f("roll.number", { prefix: "Roll " }), style(9, { align: "right" })),
      { id: "gs1", type: "barcode", x: 3, y: 18, width: 94, height: 29, format: "gs1-128", value: f("roll.gs1") },
    ]),
    dataSchema: {
      fields: [
        { path: "fabric.name", label: "Fabric", group: "Fabric", required: true },
        { path: "fabric.widthCm", label: "Width (cm)", group: "Fabric", type: "number" },
        { path: "roll.lengthM", label: "Length (m)", group: "Roll", type: "number" },
        { path: "roll.number", label: "Roll number", group: "Roll" },
        { path: "roll.gs1", label: "GS1 element string", group: "Roll", description: "e.g. (01)09501101530003(10)R114" },
      ],
    },
    sampleData: { fabric: { name: "Mulmul Cotton – Natural", widthCm: 112 }, roll: { lengthM: 45.5, number: "R-114", gs1: "(01)09501101530003(10)R114" } },
  },
  {
    id: "jewellery-tag",
    name: "Jewellery tag",
    category: "jewellery",
    sizeId: "jewellery-70x12",
    description: "Folded tag: left wing with code, weight and purity; right wing with price and Code 128.",
    template: tpl("jewellery-tag", "Jewellery tag", "jewellery", 70, 12, "mm", 300, [
      text("code", 1, 0.8, 29, 3.4, f("item.code", { required: true }), style(6.5, { fontWeight: "bold" })),
      text("weight", 1, 4.3, 29, 3.4, f("item.weightG", { suffix: " g", format: { type: "number", decimals: 3 } }), style(6)),
      text("purity", 1, 7.8, 29, 3.4, f("item.purity"), style(6)),
      { id: "fold", type: "line", x: 34, y: 5.5, width: 12, height: 1, strokeWidth: 0.15, rotation: 90, dash: "dotted" },
      text("price", 40, 0.6, 29, 3.4, f("pricing.price", { prefix: "₹", format: money }), style(6.5, { fontWeight: "bold", align: "right" })),
      { id: "code128", type: "barcode", x: 40, y: 4.4, width: 29, height: 7, format: "code128", value: f("item.code"), showText: false },
    ]),
    dataSchema: {
      fields: [
        { path: "item.code", label: "Item code", group: "Item", required: true },
        { path: "item.weightG", label: "Net weight (g)", group: "Item", type: "number" },
        { path: "item.purity", label: "Purity", group: "Item" },
        { path: "pricing.price", label: "Price", group: "Pricing", type: "number" },
      ],
    },
    sampleData: { item: { code: "JW1234", weightG: 8.25, purity: "22K (916)" }, pricing: { price: 61850 } },
  },
  {
    id: "garment-size-label",
    name: "Garment size label",
    category: "apparel",
    sizeId: "apparel-size-30x20",
    description: "Large size marker with SKU.",
    template: tpl("garment-size-label", "Garment size label", "apparel", 30, 20, "mm", 300, [
      { id: "frame", type: "rect", x: 0.5, y: 0.5, width: 29, height: 19, stroke: "#000000", strokeWidth: 0.3, cornerRadius: 1.5 },
      text("size", 1, 1.5, 28, 12, f("variant.size", { required: true }), style(28, { fontWeight: "bold", align: "center", verticalAlign: "middle", overflow: "shrink" })),
      text("sku", 1, 14, 28, 4.5, f("product.sku"), { ...style(6, { align: "center", overflow: "ellipsis" }), fontFamily: "mono" }),
    ]),
    dataSchema: { fields: [{ path: "variant.size", label: "Size", group: "Variant", required: true }, { path: "product.sku", label: "SKU", group: "Product" }] },
    sampleData: { variant: { size: "XL" }, product: { sku: "SHR-LIN-SND-XL" } },
  },
  {
    id: "shipping-label",
    name: "Shipping label 4 × 6 in",
    category: "shipping",
    sizeId: "shipping-4x6in",
    description: "Ship-from/ship-to blocks, order number, tracking QR and GS1-128 SSCC (AI 00).",
    template: tpl("shipping-label", "Shipping label 4 × 6 in", "shipping", 4, 6, "in", 203, [
      text("fromTitle", 0.15, 0.12, 3.7, 0.2, s("FROM"), style(7, { fontWeight: "bold", color: "#444444" })),
      text("from", 0.15, 0.32, 3.7, 0.7, f("shipFrom.address", { required: true }), style(8, { overflow: "wrap", maxLines: 4 })),
      { id: "rule1", type: "line", x: 0.1, y: 1.08, width: 3.8, height: 0.04, strokeWidth: 0.02 },
      text("toTitle", 0.15, 1.17, 3.7, 0.22, s("SHIP TO"), style(8, { fontWeight: "bold" })),
      text("to", 0.15, 1.4, 3.7, 1.2, f("shipTo.address", { required: true }), style(12, { overflow: "wrap", maxLines: 5, fontWeight: "bold" })),
      { id: "rule2", type: "line", x: 0.1, y: 2.66, width: 3.8, height: 0.04, strokeWidth: 0.02 },
      text("order", 0.15, 2.75, 2.2, 0.3, f("order.number", { prefix: "Order " }), style(10, { fontWeight: "bold" })),
      text("weight", 0.15, 3.05, 2.2, 0.3, f("parcel.weightKg", { prefix: "Weight ", suffix: " kg", format: { type: "number", decimals: 2 } }), style(9)),
      { id: "qr", type: "qrcode", x: 2.6, y: 2.75, width: 1.25, height: 1.25, value: f("tracking.url"), whenMissing: "hide" },
      { id: "sscc", type: "barcode", x: 0.15, y: 4.15, width: 3.7, height: 1.65, format: "gs1-128", value: f("parcel.ssccElement") },
    ]),
    dataSchema: {
      fields: [
        { path: "shipFrom.address", label: "Ship-from address", group: "Addresses", required: true },
        { path: "shipTo.address", label: "Ship-to address", group: "Addresses", required: true },
        { path: "order.number", label: "Order number", group: "Order" },
        { path: "parcel.weightKg", label: "Weight (kg)", group: "Parcel", type: "number" },
        { path: "parcel.ssccElement", label: "SSCC element string", group: "Parcel", description: "e.g. (00)106141411234567897" },
        { path: "tracking.url", label: "Tracking URL", group: "Tracking" },
      ],
    },
    sampleData: {
      shipFrom: { address: "Lakshmi Silks Warehouse\n14 Mill Road, Ambattur\nChennai 600058" },
      shipTo: { address: "Asha Retail\n221 MG Road\nBengaluru 560001" },
      order: { number: "SO-2026-001842" },
      parcel: { weightKg: 4.2, ssccElement: "(00)106141411234567897" },
      tracking: { url: "https://track.example.com/SO-2026-001842" },
    },
  },
  {
    id: "a4-product-sticker",
    name: "Product sticker (A4 21-up)",
    category: "sheet",
    sizeId: "a4-21up",
    description: "Office-printer sticker for A4 21-up sheets: name, price, Code 128.",
    template: tpl("a4-product-sticker", "Product sticker (A4 21-up)", "sheet", 63.5, 38.1, "mm", undefined, [
      text("name", 3, 3, 57.5, 9, f("product.name", { required: true }), style(9, { fontWeight: "bold", overflow: "wrap", maxLines: 2 })),
      text("price", 3, 12, 57.5, 6, f("pricing.mrp", { prefix: "MRP ₹", format: money }), style(10)),
      { id: "code", type: "barcode", x: 3, y: 19, width: 57.5, height: 16, format: "code128", value: f("product.sku") },
    ]),
    dataSchema: {
      fields: [
        { path: "product.name", label: "Product name", group: "Product", required: true },
        { path: "product.sku", label: "SKU", group: "Product" },
        { path: "pricing.mrp", label: "MRP", group: "Pricing", type: "number" },
      ],
    },
    sampleData: { product: { name: "Handloom Cotton Saree – Maroon", sku: "SAR-HL-MRN-001" }, pricing: { mrp: 2899 } },
  },
];
