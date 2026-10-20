/**
 * EAN-13, EAN-8 and UPC-A (ISO/IEC 15420).
 *
 * Accepted input: digits only, with or without the check digit. When the
 * check digit is supplied it must be correct; it is never silently replaced.
 * Add-on symbols (EAN-2/EAN-5) and UPC-E are not supported.
 */
import { gs1CheckDigit } from "./checksum";
import type { BarcodeValidation } from "./types";

/** Number set A (odd parity, "L") widths: space, bar, space, bar. Set C ("R") uses the same widths starting with a bar. */
const L_WIDTHS = ["3211", "2221", "2122", "1411", "1132", "1231", "1114", "1312", "1213", "3112"] as const;
/** Number set B (even parity, "G"): reversed L widths. */
const G_WIDTHS = L_WIDTHS.map((w) => [...w].reverse().join(""));
/** Parity pattern for the six left-hand digits of EAN-13, keyed by the leading (implied) digit. */
const EAN13_PARITY = ["LLLLLL", "LLGLGG", "LLGGLG", "LLGGGL", "LGLLGG", "LGGLLG", "LGGGLL", "LGLGLG", "LGLGGL", "LGGLGL"] as const;

const GUARD = [1, 1, 1];
const CENTER = [1, 1, 1, 1, 1];

export type EanUpcFormat = "ean13" | "ean8" | "upca";

const SPEC: Record<EanUpcFormat, { dataLength: number; name: string }> = {
  ean13: { dataLength: 12, name: "EAN-13" },
  ean8: { dataLength: 7, name: "EAN-8" },
  upca: { dataLength: 11, name: "UPC-A" },
};

export function validateEanUpc(format: EanUpcFormat, value: string): BarcodeValidation {
  const { dataLength, name } = SPEC[format];
  if (!/^\d+$/.test(value)) {
    return { ok: false, reason: "charset", message: `${name} accepts digits only.` };
  }
  if (value.length === dataLength) {
    return { ok: true, normalized: value + String(gs1CheckDigit(value)) };
  }
  if (value.length === dataLength + 1) {
    const expected = gs1CheckDigit(value.slice(0, dataLength));
    if (expected !== Number(value[dataLength])) {
      return { ok: false, reason: "checksum", message: `${name} check digit is ${value[dataLength]} but should be ${expected}.` };
    }
    return { ok: true, normalized: value };
  }
  return {
    ok: false,
    reason: "length",
    message: `${name} requires ${dataLength} digits (check digit computed) or ${dataLength + 1} digits (check digit verified); got ${value.length}.`,
  };
}

function pushDigit(bars: number[], digit: number, set: "L" | "G" | "R") {
  const widths = set === "G" ? G_WIDTHS[digit]! : L_WIDTHS[digit]!;
  for (const ch of widths) bars.push(ch.charCodeAt(0) - 48);
}

/**
 * Module widths for a normalized (check-digit-included) value. The output
 * alternates bar/space starting with the start-guard bar: guards end in a
 * bar, left digits are space-first, the centre guard starts and ends with a
 * space, and right digits are bar-first.
 */
export function encodeEanUpcBars(format: EanUpcFormat, normalized: string): number[] {
  const digits = [...normalized].map(Number);
  const raw: number[] = [...GUARD];
  let left: number[];
  let right: number[];
  let parity: string;
  if (format === "ean8") {
    left = digits.slice(0, 4);
    right = digits.slice(4);
    parity = "LLLL";
  } else {
    const d13 = format === "upca" ? [0, ...digits] : digits;
    left = d13.slice(1, 7);
    right = d13.slice(7);
    parity = EAN13_PARITY[d13[0]!]!;
  }
  left.forEach((d, i) => pushDigit(raw, d, parity[i] as "L" | "G"));
  raw.push(...CENTER);
  right.forEach((d) => pushDigit(raw, d, "R"));
  raw.push(...GUARD);
  return raw;
}

export const EAN_UPC_QUIET_ZONES: Record<EanUpcFormat, { left: number; right: number }> = {
  ean13: { left: 11, right: 7 },
  ean8: { left: 7, right: 7 },
  upca: { left: 9, right: 9 },
};
