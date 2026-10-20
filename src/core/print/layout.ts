/**
 * Pure print-layout arithmetic: where each label goes on which page.
 * All outputs are in the layout's unit. No DOM access.
 */
import type { Issue } from "../errors";
import { convertLength } from "../geometry/units";
import type { LengthUnit } from "../schema/types";
import type { PrintLayout } from "./layout-types";

export interface LabelSize {
  readonly width: number;
  readonly height: number;
  readonly unit: LengthUnit;
}

export interface Slot {
  /** Position of the label's top-left corner on the page (layout unit). */
  readonly x: number;
  readonly y: number;
  /** Label box on the page (rotated labels have swapped width/height). */
  readonly width: number;
  readonly height: number;
  /** Label rotated 90° clockwise on the page. */
  readonly rotated: boolean;
}

export interface PageSpec {
  readonly width: number;
  readonly height: number;
  readonly unit: LengthUnit;
  /** Slot positions available on one page, in fill order (row-major). */
  readonly slots: readonly Slot[];
}

export interface Placement {
  /** Index into the expanded (copies-applied) label sequence. */
  readonly sequence: number;
  /** Index of the source record. */
  readonly recordIndex: number;
  readonly page: number;
  readonly slot: Slot;
}

const EPS = 1e-6;

/** Compute page geometry and validate that labels fit the media. */
export function computePageSpec(label: LabelSize, layout: PrintLayout): { page: PageSpec; issues: Issue[] } {
  const issues: Issue[] = [];
  const u = layout.unit;
  const lw = convertLength(label.width, label.unit, u);
  const lh = convertLength(label.height, label.unit, u);
  const err = (code: string, message: string) => issues.push({ code, severity: "error", path: "", message });
  const warn = (code: string, message: string) => issues.push({ code, severity: "warning", path: "", message });

  if (layout.kind === "roll") {
    const rotated = layout.orientation === "landscape";
    const width = rotated ? lh : lw;
    const height = rotated ? lw : lh;
    if (layout.unprintableMargin && layout.unprintableMargin > 0) {
      warn("PRINT_UNPRINTABLE_AREA", `Content within ${layout.unprintableMargin}${u} of the label edge may not print on this printer.`);
    }
    return { page: { width, height, unit: u, slots: [{ x: 0, y: 0, width, height, rotated }] }, issues };
  }

  const landscape = layout.orientation === "landscape";
  const pageW = landscape ? layout.page.height : layout.page.width;
  const pageH = landscape ? layout.page.width : layout.page.height;
  if (!(layout.columns >= 1 && layout.rows >= 1 && Number.isInteger(layout.columns) && Number.isInteger(layout.rows))) err("PRINT_LAYOUT_INVALID", "Sheet layouts need at least one whole row and column.");
  if ([layout.gapX, layout.gapY, layout.margins.top, layout.margins.left, layout.margins.right, layout.margins.bottom].some((v) => !(v >= 0) || !Number.isFinite(v))) err("PRINT_LAYOUT_INVALID", "Margins and gaps must be finite and non-negative.");
  const cellW = layout.cell?.width ?? lw;
  const cellH = layout.cell?.height ?? lh;
  if (lw > cellW + EPS || lh > cellH + EPS) err("PRINT_LABEL_EXCEEDS_CELL", `Label ${lw.toFixed(2)}×${lh.toFixed(2)}${u} is larger than the sheet cell ${cellW.toFixed(2)}×${cellH.toFixed(2)}${u}.`);
  const usedW = layout.margins.left + layout.columns * cellW + (layout.columns - 1) * layout.gapX + layout.margins.right;
  const usedH = layout.margins.top + layout.rows * cellH + (layout.rows - 1) * layout.gapY + layout.margins.bottom;
  if (usedW > pageW + 1e-3 || usedH > pageH + 1e-3) {
    err("PRINT_LAYOUT_OVERFLOW", `The label grid (${usedW.toFixed(2)}×${usedH.toFixed(2)}${u}) does not fit the page (${pageW}×${pageH}${u}).`);
  }
  const m = layout.unprintableMargin ?? 0;
  if (m > 0 && (layout.margins.left + (cellW - lw) / 2 < m - EPS || layout.margins.top + (cellH - lh) / 2 < m - EPS || layout.margins.right < m - EPS || layout.margins.bottom < m - EPS)) {
    warn("PRINT_UNPRINTABLE_AREA", `Labels reach into the printer's unprintable border (${m}${u}); edge content may be cut off.`);
  }
  const slots: Slot[] = [];
  if (!issues.some((i) => i.severity === "error")) {
    for (let r = 0; r < layout.rows; r += 1) {
      for (let c = 0; c < layout.columns; c += 1) {
        const cx = layout.margins.left + c * (cellW + layout.gapX);
        const cy = layout.margins.top + r * (cellH + layout.gapY);
        slots.push({ x: cx + (cellW - lw) / 2, y: cy + (cellH - lh) / 2, width: lw, height: lh, rotated: false });
      }
    }
  }
  return { page: { width: pageW, height: pageH, unit: u, slots }, issues };
}

export interface PaginateOptions {
  /** Copies of each record, printed consecutively. Default 1. */
  readonly copies?: number;
  /** Skip this many slots on the first page (partially used sheets). Default 0. */
  readonly skipSlots?: number;
}

/** Assign `recordCount × copies` labels to pages and slots. */
export function paginate(recordCount: number, page: PageSpec, options: PaginateOptions = {}): { placements: Placement[]; pageCount: number } {
  const copies = Math.max(1, Math.floor(options.copies ?? 1));
  const perPage = page.slots.length;
  if (perPage === 0) return { placements: [], pageCount: 0 };
  const skip = Math.max(0, Math.min(perPage - 1, Math.floor(options.skipSlots ?? 0)));
  const placements: Placement[] = [];
  let seq = 0;
  for (let r = 0; r < recordCount; r += 1) {
    for (let k = 0; k < copies; k += 1) {
      const position = seq + skip;
      placements.push({ sequence: seq, recordIndex: r, page: Math.floor(position / perPage), slot: page.slots[position % perPage]! });
      seq += 1;
    }
  }
  const pageCount = placements.length ? placements[placements.length - 1]!.page + 1 : 0;
  return { placements, pageCount };
}
