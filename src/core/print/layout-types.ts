import type { LengthUnit } from "../schema/types";

/**
 * Print media description. Kept separate from the label template: the same
 * label design can print on a thermal roll or on an A4 sheet.
 *
 * Terminology (docs/PRINTING.md):
 * - Label size: the template canvas (`template.canvas.width × height`).
 * - Media/page size: the physical sheet or the roll page the driver feeds.
 * - Margins: unprintable/unused border of a sheet before the first label.
 * - Gaps: space between adjacent labels on a sheet.
 * - Printable area: what the printer can physically mark (hardware limit).
 */
export type PrintLayout = RollLayout | SheetLayout;

/**
 * Thermal / continuous roll: one label per printed page. The driver's media
 * size must be set to the label size; `gap` documents the liner gap for
 * calibration but is produced by the printer, not by the page.
 */
export interface RollLayout {
  readonly kind: "roll";
  readonly unit: LengthUnit;
  /** Liner gap between labels on the roll (informational, for calibration). */
  readonly gap?: number;
  /** Rotate the label 90° on the page (for printers that feed in the other direction). */
  readonly orientation?: "portrait" | "landscape";
  /** Edge distance the printer cannot mark (validation only). */
  readonly unprintableMargin?: number;
}

/** Multiple labels per sheet (e.g. A4 or Letter). */
export interface SheetLayout {
  readonly kind: "sheet";
  readonly unit: LengthUnit;
  readonly page: { readonly width: number; readonly height: number };
  readonly orientation?: "portrait" | "landscape";
  readonly margins: { readonly top: number; readonly right: number; readonly bottom: number; readonly left: number };
  readonly columns: number;
  readonly rows: number;
  /** Horizontal gap between columns. */
  readonly gapX: number;
  /** Vertical gap between rows. */
  readonly gapY: number;
  /** Label cell size if it differs from the template canvas (label is centred in the cell). */
  readonly cell?: { readonly width: number; readonly height: number };
  /** Edge distance the printer cannot mark (validation only; typical lasers ≈ 4 mm). */
  readonly unprintableMargin?: number;
}
