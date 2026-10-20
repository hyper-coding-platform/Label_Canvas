// Stand-in for the host ERP's own data layer. The label SDK never knows this shape;
// the host maps it to records and declares the fields in a DataSchema.
import type { DataSchema } from "@your-org/erp-label-studio/core";

export interface Product {
  id: string;
  name: string;
  sku: string;
  barcode: string;
  size: string;
  color: string;
  mrp: number;
  offerPrice?: number;
  batchNo: string;
}

export const PRODUCTS: Product[] = [
  { id: "p1", name: "Cotton Kurta – Indigo Block Print", sku: "KRT-IND-042-M", barcode: "260042130115", size: "M", color: "Indigo", mrp: 1299, offerPrice: 999, batchNo: "B2026-10" },
  { id: "p2", name: "Linen Shirt – Sand", sku: "SHR-LIN-SND-XL", barcode: "260042130122", size: "XL", color: "Sand", mrp: 2499, batchNo: "B2026-11" },
  { id: "p3", name: "Silk Dupatta – Maroon Zari", sku: "DUP-SLK-MRN", barcode: "260042130139", size: "Free", color: "Maroon", mrp: 3899, offerPrice: 3299, batchNo: "B2026-09" },
];

export const STORE = { name: "Lakshmi Silks", branch: "Chennai" };

/** Map an ERP product to the record shape the templates bind to. */
export function toLabelRecord(p: Product) {
  return {
    store: { name: STORE.name },
    product: { name: p.name, sku: p.sku, barcode: p.barcode },
    variant: { size: p.size, color: p.color },
    pricing: { mrp: p.mrp, ...(p.offerPrice !== undefined ? { offerPrice: p.offerPrice } : {}) },
    inventory: { batchNo: p.batchNo },
  };
}

export const productSchema: DataSchema = {
  fields: [
    { path: "store.name", label: "Store name", group: "Store", example: STORE.name },
    { path: "product.name", label: "Product name", group: "Product", required: true, example: PRODUCTS[0]!.name },
    { path: "product.sku", label: "SKU", group: "Product", example: PRODUCTS[0]!.sku },
    { path: "product.barcode", label: "Barcode (item code)", group: "Product", required: true, example: PRODUCTS[0]!.barcode },
    { path: "variant.size", label: "Size", group: "Variant", example: "M" },
    { path: "variant.color", label: "Colour", group: "Variant", example: "Indigo" },
    { path: "pricing.mrp", label: "MRP", group: "Pricing", type: "number", required: true, example: 1299 },
    { path: "pricing.offerPrice", label: "Offer price", group: "Pricing", type: "number" },
    { path: "inventory.batchNo", label: "Batch number", group: "Inventory", example: "B2026-10" },
  ],
};
