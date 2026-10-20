/**
 * Preset label sizes. These are common *starting points*, not standards:
 * label stock varies by supplier, and sheet geometry must be checked against
 * the supplier's specification (docs/PRINTING.md, "Calibration"). No preset
 * claims compatibility with a specific brand or product code.
 */
import type { LengthUnit } from "../schema/types";
import type { PrintLayout } from "../print/layout-types";

export type PresetCategory = "retail" | "apparel" | "textile" | "shelf" | "inventory" | "shipping" | "jewellery" | "sheet" | "continuous";

export interface PresetSize {
  readonly id: string;
  readonly name: string;
  readonly category: PresetCategory;
  /** Label (canvas) size. */
  readonly width: number;
  readonly height: number;
  readonly unit: LengthUnit;
  /** Typical printer resolution for this media, if relevant. */
  readonly printerDpi?: number;
  /** Suggested print layout for this media. */
  readonly layout: PrintLayout;
  readonly description: string;
}

const roll = (gap = 3): PrintLayout => ({ kind: "roll", unit: "mm", gap });

const a4 = (columns: number, rows: number, w: number, h: number, gapX: number, gapY: number): PrintLayout => {
  const left = (210 - columns * w - (columns - 1) * gapX) / 2;
  const top = (297 - rows * h - (rows - 1) * gapY) / 2;
  const r = (v: number) => Math.round(v * 1000) / 1000;
  return { kind: "sheet", unit: "mm", page: { width: 210, height: 297 }, margins: { top: r(top), right: r(left), bottom: r(top), left: r(left) }, columns, rows, gapX, gapY, cell: { width: w, height: h }, unprintableMargin: 4 };
};

/*
 * Presets are built lazily (no module-level function calls), so bundlers can
 * drop them entirely from applications that never use presets.
 */
let sizesCache: readonly PresetSize[] | undefined;

export function builtInSizes(): readonly PresetSize[] {
  return (sizesCache ??= buildSizes());
}

const buildSizes = (): readonly PresetSize[] => [
  { id: "retail-38x25", name: "Small price label 38 × 25 mm", category: "retail", width: 38, height: 25, unit: "mm", printerDpi: 203, layout: roll(), description: "Small thermal price label for shelves and small goods." },
  { id: "retail-50x25", name: "Retail price label 50 × 25 mm", category: "retail", width: 50, height: 25, unit: "mm", printerDpi: 203, layout: roll(), description: "Thermal price label with room for an EAN-13." },
  { id: "retail-50x30", name: "Product label 50 × 30 mm", category: "retail", width: 50, height: 30, unit: "mm", printerDpi: 203, layout: roll(), description: "General-purpose thermal product label." },
  { id: "apparel-hangtag-50x75", name: "Garment hang tag 50 × 75 mm", category: "apparel", width: 50, height: 75, unit: "mm", printerDpi: 203, layout: roll(), description: "Swing/hang tag for garments: brand, product, size, MRP and barcode." },
  { id: "apparel-hangtag-60x100", name: "Large hang tag 60 × 100 mm", category: "apparel", width: 60, height: 100, unit: "mm", printerDpi: 203, layout: roll(), description: "Large hang tag with space for care details." },
  { id: "apparel-size-30x20", name: "Clothing size label 30 × 20 mm", category: "apparel", width: 30, height: 20, unit: "mm", printerDpi: 300, layout: roll(2), description: "Small size marker; prefer 300 dpi for small text." },
  { id: "textile-roll-100x50", name: "Fabric roll label 100 × 50 mm", category: "textile", width: 100, height: 50, unit: "mm", printerDpi: 203, layout: roll(), description: "Roll/bolt label: fabric, width, length, lot and GS1-128." },
  { id: "shelf-70x38", name: "Shelf label 70 × 38 mm", category: "shelf", width: 70, height: 38, unit: "mm", printerDpi: 203, layout: roll(), description: "Shelf-edge price label with unit price." },
  { id: "inventory-60x40", name: "Inventory label 60 × 40 mm", category: "inventory", width: 60, height: 40, unit: "mm", printerDpi: 203, layout: roll(), description: "Stock/bin label with SKU, location and Code 128." },
  { id: "inventory-100x50", name: "Warehouse label 100 × 50 mm", category: "inventory", width: 100, height: 50, unit: "mm", printerDpi: 203, layout: roll(), description: "Warehouse/carton label with large SKU and QR." },
  { id: "shipping-4x6in", name: "Shipping label 4 × 6 in", category: "shipping", width: 4, height: 6, unit: "in", printerDpi: 203, layout: { kind: "roll", unit: "in", gap: 0.125 }, description: "Common courier/shipping label size." },
  { id: "jewellery-70x12", name: "Jewellery tag 70 × 12 mm", category: "jewellery", width: 70, height: 12, unit: "mm", printerDpi: 300, layout: roll(2), description: "Folded jewellery tag (print area of one wing ≈ 30 mm). Use 300 dpi." },
  { id: "continuous-58mm", name: "Continuous 58 mm × 40 mm", category: "continuous", width: 58, height: 40, unit: "mm", printerDpi: 203, layout: { kind: "roll", unit: "mm", gap: 0 }, description: "Continuous media cut to a fixed length; adjust height to your cut length." },
  { id: "a4-21up", name: "A4 sheet, 21 labels (3 × 7, 63.5 × 38.1 mm)", category: "sheet", width: 63.5, height: 38.1, unit: "mm", layout: a4(3, 7, 63.5, 38.1, 2.5, 0), description: "Common 21-up A4 layout. Verify margins against your sheet supplier." },
  { id: "a4-24up", name: "A4 sheet, 24 labels (3 × 8, 63.5 × 33.9 mm)", category: "sheet", width: 63.5, height: 33.9, unit: "mm", layout: a4(3, 8, 63.5, 33.9, 2.5, 0), description: "Common 24-up A4 layout. Verify margins against your sheet supplier." },
  { id: "a4-14up", name: "A4 sheet, 14 labels (2 × 7, 99.1 × 38.1 mm)", category: "sheet", width: 99.1, height: 38.1, unit: "mm", layout: a4(2, 7, 99.1, 38.1, 2.5, 0), description: "Common 14-up A4 layout." },
  { id: "a4-40up", name: "A4 sheet, 40 labels (4 × 10, 48.5 × 25.4 mm)", category: "sheet", width: 48.5, height: 25.4, unit: "mm", layout: a4(4, 10, 48.5, 25.4, 0, 0), description: "Common 40-up A4 layout without gaps." },
  { id: "a4-65up", name: "A4 sheet, 65 labels (5 × 13, 38.1 × 21.2 mm)", category: "sheet", width: 38.1, height: 21.2, unit: "mm", layout: a4(5, 13, 38.1, 21.2, 2.5, 0), description: "Common 65-up mini label sheet." },
  {
    id: "letter-30up",
    name: "US Letter, 30 labels (3 × 10, 2.625 × 1 in)",
    category: "sheet",
    width: 2.625,
    height: 1,
    unit: "in",
    layout: { kind: "sheet", unit: "in", page: { width: 8.5, height: 11 }, margins: { top: 0.5, right: 0.1875, bottom: 0.5, left: 0.1875 }, columns: 3, rows: 10, gapX: 0.125, gapY: 0, cell: { width: 2.625, height: 1 }, unprintableMargin: 0.16 },
    description: "Common 30-up Letter address-label layout.",
  },
];
