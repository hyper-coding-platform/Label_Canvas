import type { LengthUnit } from "../schema/types";

/** Millimetres per unit. `px` is the CSS reference pixel: exactly 1/96 inch. */
const MM_PER_UNIT: Readonly<Record<LengthUnit, number>> = Object.freeze({
  mm: 1,
  in: 25.4,
  px: 25.4 / 96,
});

export const LENGTH_UNITS: readonly LengthUnit[] = Object.freeze(["mm", "in", "px"]);

export function isLengthUnit(value: unknown): value is LengthUnit {
  return value === "mm" || value === "in" || value === "px";
}

export function mmPerUnit(unit: LengthUnit): number {
  return MM_PER_UNIT[unit];
}

export function toMm(value: number, unit: LengthUnit): number {
  return value * MM_PER_UNIT[unit];
}

export function fromMm(valueMm: number, unit: LengthUnit): number {
  return valueMm / MM_PER_UNIT[unit];
}

export function convertLength(value: number, from: LengthUnit, to: LengthUnit): number {
  if (from === to) return value;
  return (value * MM_PER_UNIT[from]) / MM_PER_UNIT[to];
}

/** Typographic points (1/72 in) to a template unit. */
export function ptToUnit(pt: number, unit: LengthUnit): number {
  return convertLength(pt / 72, "in", unit);
}

export function unitToPt(value: number, unit: LengthUnit): number {
  return convertLength(value, unit, "in") * 72;
}

/** Printer dots (at `dpi`) to a template unit. */
export function dotsToUnit(dots: number, dpi: number, unit: LengthUnit): number {
  return convertLength(dots / dpi, "in", unit);
}

export function unitToDots(value: number, dpi: number, unit: LengthUnit): number {
  return convertLength(value, unit, "in") * dpi;
}

/**
 * Round half away from zero to `decimals` places. Avoids `-0` and
 * binary-representation drift (e.g. 1.005 → 1.01).
 */
export function roundTo(value: number, decimals: number): number {
  if (!Number.isFinite(value)) return value;
  const factor = 10 ** decimals;
  const scaled = Math.abs(value) * factor;
  const rounded = Math.round(scaled + Number.EPSILON * scaled) / factor;
  const result = value < 0 ? -rounded : rounded;
  return result === 0 ? 0 : result;
}

/** Display precision used by the editor for each unit. */
export function displayDecimals(unit: LengthUnit): number {
  return unit === "in" ? 3 : 2;
}

/** Output precision for SVG coordinates. */
export const SVG_DECIMALS = 4;

/** Format a number for SVG output: rounded, no exponent, no trailing zeros. */
export function formatSvgNumber(value: number): string {
  if (!Number.isFinite(value)) throw new RangeError(`Non-finite SVG number: ${value}`);
  const r = roundTo(value, SVG_DECIMALS);
  // toFixed avoids exponent notation for small/large magnitudes within our limits.
  let s = r.toFixed(SVG_DECIMALS);
  if (s.includes(".")) s = s.replace(/0+$/, "").replace(/\.$/, "");
  return s === "-0" ? "0" : s;
}
