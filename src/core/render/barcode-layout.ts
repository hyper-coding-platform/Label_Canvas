/**
 * Physical layout of barcode symbols inside an element box.
 *
 * Rules (docs/PRINTING.md, "Barcode geometry"):
 * - Modules are scaled uniformly; a symbol is never stretched non-uniformly
 *   and quiet zones are always reserved inside the element box.
 * - With `moduleWidth`, the X-dimension is fixed; if the symbol plus quiet
 *   zones does not fit the box, layout fails instead of squeezing.
 * - With `printerDpi`, X snaps down to whole printer dots so every bar edge
 *   lands on a dot boundary; ITF wide elements become whole dots with the
 *   wide:narrow ratio kept within 2.25–3.0.
 * - QR codes are square, centred, with a quiet zone (default 4 modules).
 */
import { SYMBOLOGIES } from "../barcode/adapter";
import { ITF_MAX_RATIO, ITF_MIN_RATIO } from "../barcode/itf";
import type { LinearSymbol, MatrixSymbol } from "../barcode/types";
import type { Rect } from "../geometry/rect";
import { dotsToUnit, toMm, unitToDots } from "../geometry/units";
import type { LengthUnit } from "../schema/types";

export interface LayoutIssue {
  readonly code: string;
  readonly severity: "error" | "warning";
  readonly message: string;
}

export interface LinearLayout {
  readonly bars: readonly Rect[];
  /** Full symbol extent including quiet zones. */
  readonly symbol: Rect;
  /** Narrow module width in template units. */
  readonly moduleWidth: number;
  readonly barTop: number;
  readonly barHeight: number;
}

export interface LinearLayoutInput {
  readonly symbol: LinearSymbol;
  readonly box: Rect;
  readonly unit: LengthUnit;
  readonly moduleWidth?: number;
  readonly printerDpi?: number;
  /** Space reserved below bars for HRI text (template units). */
  readonly textBand: number;
  readonly bearer: "none" | "frame" | "top-bottom";
}

const EPS = 1e-6;

export function layoutLinear(input: LinearLayoutInput): { layout?: LinearLayout; issues: LayoutIssue[] } {
  const { symbol, box, unit, printerDpi } = input;
  const issues: LayoutIssue[] = [];
  const info = SYMBOLOGIES[symbol.format];
  let bars = [...symbol.bars];
  const qz = symbol.quietZoneLeft + symbol.quietZoneRight;
  const totalModules = () => qz + bars.reduce((a, b) => a + b, 0);

  let x = input.moduleWidth ?? box.width / totalModules();
  if (printerDpi) {
    const dots = Math.floor(unitToDots(x, printerDpi, unit) + EPS);
    if (dots < 1) {
      issues.push({ code: "BARCODE_TOO_SMALL_FOR_PRINTER", severity: "error", message: `Bars would be narrower than one printer dot at ${printerDpi} dpi. Widen the barcode.` });
      return { issues };
    }
    if (symbol.wideRatio) {
      let wideDots = Math.round(symbol.wideRatio * dots);
      if (wideDots / dots < ITF_MIN_RATIO) wideDots = Math.ceil(ITF_MIN_RATIO * dots);
      if (wideDots / dots > ITF_MAX_RATIO) wideDots = Math.floor(ITF_MAX_RATIO * dots);
      const ratio = wideDots / dots;
      bars = bars.map((w) => (w === 1 ? 1 : ratio));
    }
    x = dotsToUnit(dots, printerDpi, unit);
  }

  const symbolWidth = totalModules() * x;
  if (symbolWidth > box.width + EPS) {
    issues.push({
      code: "BARCODE_DOES_NOT_FIT",
      severity: "error",
      message: `Barcode needs ${symbolWidth.toFixed(2)}${unit} including quiet zones but the element is ${box.width.toFixed(2)}${unit} wide.`,
    });
    return { issues };
  }

  const bearerT = input.bearer === "none" ? 0 : 2 * x;
  const barTop = box.y + bearerT;
  const barHeight = box.height - input.textBand - bearerT * 2;
  if (barHeight <= EPS) {
    issues.push({ code: "BARCODE_TOO_SHORT", severity: "error", message: "Element is too short for the bars and human-readable text." });
    return { issues };
  }

  const xMm = toMm(x, unit);
  if (xMm + EPS < info.minModuleMm) {
    issues.push({ code: "BARCODE_MODULE_TOO_SMALL", severity: "warning", message: `${info.label} X-dimension is ${xMm.toFixed(3)} mm; at least ${info.minModuleMm} mm is recommended for reliable scanning.` });
  }
  if (info.nominalBarHeightMm && info.nominalModuleMm) {
    const nominalHeightMm = info.nominalBarHeightMm * (xMm / info.nominalModuleMm);
    if (toMm(barHeight, unit) < nominalHeightMm * 0.5) {
      issues.push({ code: "BARCODE_TRUNCATED", severity: "warning", message: `${info.label} bars are less than half the nominal height for this size; truncated symbols may not scan omnidirectionally.` });
    }
  }

  const left = box.x + (box.width - symbolWidth) / 2;
  const rects: Rect[] = [];
  let cursor = left + symbol.quietZoneLeft * x;
  bars.forEach((w, i) => {
    const width = w * x;
    if (i % 2 === 0) rects.push({ x: cursor, y: barTop, width, height: barHeight });
    cursor += width;
  });
  const symbolRect = { x: left, y: box.y, width: symbolWidth, height: box.height - input.textBand };
  if (bearerT > 0) {
    rects.push({ x: left, y: box.y, width: symbolWidth, height: bearerT }, { x: left, y: barTop + barHeight, width: symbolWidth, height: bearerT });
    if (input.bearer === "frame") {
      rects.push({ x: left, y: box.y, width: bearerT, height: barHeight + bearerT * 2 }, { x: left + symbolWidth - bearerT, y: box.y, width: bearerT, height: barHeight + bearerT * 2 });
    }
  }
  return { layout: { bars: rects, symbol: symbolRect, moduleWidth: x, barTop, barHeight }, issues };
}

export interface MatrixLayout {
  /** Horizontal runs of dark modules. */
  readonly runs: readonly Rect[];
  readonly symbol: Rect;
  readonly moduleSize: number;
}

export function layoutMatrix(symbol: MatrixSymbol, box: Rect, unit: LengthUnit, quietZone: number, printerDpi?: number): { layout?: MatrixLayout; issues: LayoutIssue[] } {
  const issues: LayoutIssue[] = [];
  const total = symbol.size + quietZone * 2;
  let m = Math.min(box.width, box.height) / total;
  if (printerDpi) {
    const dots = Math.floor(unitToDots(m, printerDpi, unit) + EPS);
    if (dots < 1) {
      issues.push({ code: "BARCODE_TOO_SMALL_FOR_PRINTER", severity: "error", message: `QR modules would be smaller than one printer dot at ${printerDpi} dpi. Enlarge the QR code or shorten its content.` });
      return { issues };
    }
    m = dotsToUnit(dots, printerDpi, unit);
  }
  const mMm = toMm(m, unit);
  if (mMm + EPS < SYMBOLOGIES.qrcode.minModuleMm) {
    issues.push({ code: "BARCODE_MODULE_TOO_SMALL", severity: "warning", message: `QR module size is ${mMm.toFixed(3)} mm; at least ${SYMBOLOGIES.qrcode.minModuleMm} mm is recommended.` });
  }
  const side = total * m;
  const left = box.x + (box.width - side) / 2;
  const top = box.y + (box.height - side) / 2;
  const runs: Rect[] = [];
  for (let r = 0; r < symbol.size; r += 1) {
    let c = 0;
    while (c < symbol.size) {
      if (!symbol.modules[r * symbol.size + c]) {
        c += 1;
        continue;
      }
      const start = c;
      while (c < symbol.size && symbol.modules[r * symbol.size + c]) c += 1;
      runs.push({ x: left + (start + quietZone) * m, y: top + (r + quietZone) * m, width: (c - start) * m, height: m });
    }
  }
  return { layout: { runs, symbol: { x: left, y: top, width: side, height: side }, moduleSize: m }, issues };
}
