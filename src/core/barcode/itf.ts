/**
 * ITF-14 (Interleaved 2 of 5 carrying a GTIN-14, ISO/IEC 16390 + GS1 rules).
 *
 * Accepted input: 13 digits (check digit computed) or 14 digits (check digit
 * verified). Wide:narrow ratio defaults to 2.5 (permitted 2.25–3.0).
 */
import { gs1CheckDigit } from "./checksum";
import type { BarcodeValidation } from "./types";

/** N = narrow, W = wide, five elements per digit. */
const PATTERNS = ["NNWWN", "WNNNW", "NWNNW", "WWNNN", "NNWNW", "WNWNN", "NWWNN", "NNNWW", "WNNWN", "NWNWN"] as const;

export const ITF_DEFAULT_RATIO = 2.5;
export const ITF_MIN_RATIO = 2.25;
export const ITF_MAX_RATIO = 3;
export const ITF14_QUIET_ZONE = 10;

export function validateItf14(value: string): BarcodeValidation {
  if (!/^\d+$/.test(value)) return { ok: false, reason: "charset", message: "ITF-14 accepts digits only." };
  if (value.length === 13) return { ok: true, normalized: value + String(gs1CheckDigit(value)) };
  if (value.length === 14) {
    const expected = gs1CheckDigit(value.slice(0, 13));
    if (expected !== Number(value[13])) {
      return { ok: false, reason: "checksum", message: `ITF-14 check digit is ${value[13]} but should be ${expected}.` };
    }
    return { ok: true, normalized: value };
  }
  return { ok: false, reason: "length", message: `ITF-14 requires 13 or 14 digits; got ${value.length}.` };
}

/** Alternating bar/space widths in narrow-module units for an even-length digit string. */
export function encodeItfBars(digits: string, ratio = ITF_DEFAULT_RATIO): number[] {
  if (digits.length % 2 !== 0 || !/^\d*$/.test(digits)) throw new TypeError("ITF requires an even number of digits.");
  const w = (c: string) => (c === "W" ? ratio : 1);
  const bars: number[] = [1, 1, 1, 1]; // start: narrow bar, narrow space, narrow bar, narrow space
  for (let i = 0; i < digits.length; i += 2) {
    const barPattern = PATTERNS[digits.charCodeAt(i) - 48]!;
    const spacePattern = PATTERNS[digits.charCodeAt(i + 1) - 48]!;
    for (let k = 0; k < 5; k += 1) bars.push(w(barPattern[k]!), w(spacePattern[k]!));
  }
  bars.push(ratio, 1, 1); // stop: wide bar, narrow space, narrow bar
  return bars;
}
