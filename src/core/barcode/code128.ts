/**
 * Code 128 (ISO/IEC 15417) encoder with optimal code-set selection.
 *
 * Input: ASCII 0–127 plus FNC1 markers (used by GS1-128). Extended (FNC4)
 * characters are not supported and are rejected. The encoder chooses start
 * code and set switches (A/B/C) by dynamic programming to minimise symbol
 * length; it never emits SHIFT (output is valid but not always the absolute
 * shortest when a single A/B character would warrant a shift).
 */

/** Bar/space widths for symbol values 0–106 (106 = stop, 7 elements). */
const PATTERNS: readonly string[] = [
  "212222", "222122", "222221", "121223", "121322", "131222", "122213", "122312", "132212", "221213",
  "221312", "231212", "112232", "122132", "122231", "113222", "123122", "123221", "223211", "221132",
  "221231", "213212", "223112", "312131", "311222", "321122", "321221", "312212", "322112", "322211",
  "212123", "212321", "232121", "111323", "131123", "131321", "112313", "132113", "132311", "211313",
  "231113", "231311", "112133", "112331", "132131", "113123", "113321", "133121", "313121", "211331",
  "231131", "213113", "213311", "213131", "311123", "311321", "331121", "312113", "312311", "332111",
  "314111", "221411", "431111", "111224", "111422", "121124", "121421", "141122", "141221", "112214",
  "112412", "122114", "122411", "142112", "142211", "241211", "221114", "413111", "241112", "134111",
  "111242", "121142", "121241", "114212", "124112", "124211", "411212", "421112", "421211", "212141",
  "214121", "412121", "111143", "111341", "131141", "114113", "114311", "411113", "411311", "113141",
  "114131", "311141", "411131", "211412", "211214", "211232", "2331112",
];

const START = { A: 103, B: 104, C: 105 } as const;
const STOP = 106;
const FNC1_VALUE = 102;
/** Code-switch symbol values, indexed [fromSet][toSet]. */
const SWITCH: Record<CodeSet, Partial<Record<CodeSet, number>>> = {
  A: { B: 100, C: 99 },
  B: { A: 101, C: 99 },
  C: { A: 101, B: 100 },
};

type CodeSet = "A" | "B" | "C";
const SETS: readonly CodeSet[] = ["A", "B", "C"];

/** An input item: a character code 0–127, or FNC1. */
export const FNC1 = -1;
export type Code128Item = number;

function valueInSet(code: number, set: "A" | "B"): number | null {
  if (code === FNC1) return FNC1_VALUE;
  if (set === "A") {
    if (code >= 32 && code <= 95) return code - 32;
    if (code >= 0 && code < 32) return code + 64;
    return null;
  }
  if (code >= 32 && code <= 127) return code - 32;
  return null;
}

const isDigit = (c: number | undefined): boolean => c !== undefined && c >= 48 && c <= 57;

export function validateCode128Items(items: readonly Code128Item[]): string | null {
  if (items.length === 0) return "Value is empty.";
  for (const c of items) {
    if (c !== FNC1 && (c < 0 || c > 127 || !Number.isInteger(c))) {
      return "Code 128 supports ASCII characters (0–127) only.";
    }
  }
  return null;
}

/**
 * Encode items into Code 128 symbol values (start, data, check, stop).
 * Throws TypeError on unsupported characters; callers validate first.
 */
export function encodeCode128Values(items: readonly Code128Item[]): number[] {
  const err = validateCode128Items(items);
  if (err) throw new TypeError(err);
  const n = items.length;
  // dp[i][s] = min symbols to encode items[0..i) with current set s; back-pointers for reconstruction.
  const INF = Number.POSITIVE_INFINITY;
  const cost: Record<CodeSet, number>[] = Array.from({ length: n + 1 }, () => ({ A: INF, B: INF, C: INF }));
  type Step = { prevI: number; prevSet: CodeSet | null; values: number[] };
  const back: Record<CodeSet, Step | undefined>[] = Array.from({ length: n + 1 }, () => ({ A: undefined, B: undefined, C: undefined }));

  // Starting in each set costs one symbol (the start code).
  for (const s of SETS) {
    cost[0]![s] = 1;
    back[0]![s] = { prevI: -1, prevSet: null, values: [START[s]] };
  }

  for (let i = 0; i <= n; i += 1) {
    // Relax set switches at position i (a switch can follow any state).
    for (let round = 0; round < 2; round += 1) {
      for (const from of SETS) {
        const c = cost[i]![from];
        if (c === INF) continue;
        for (const to of SETS) {
          if (to === from) continue;
          if (c + 1 < cost[i]![to]) {
            cost[i]![to] = c + 1;
            back[i]![to] = { prevI: i, prevSet: from, values: [SWITCH[from][to]!] };
          }
        }
      }
    }
    if (i === n) break;
    const item = items[i]!;
    for (const s of SETS) {
      const c = cost[i]![s];
      if (c === INF) continue;
      if (s === "C") {
        if (item === FNC1) {
          relax(i + 1, s, c + 1, i, s, [FNC1_VALUE]);
        } else if (isDigit(item) && isDigit(items[i + 1])) {
          relax(i + 2, s, c + 1, i, s, [(item - 48) * 10 + (items[i + 1]! - 48)]);
        }
      } else {
        const v = valueInSet(item, s);
        if (v !== null) relax(i + 1, s, c + 1, i, s, [v]);
      }
    }
  }

  function relax(j: number, s: CodeSet, c: number, prevI: number, prevSet: CodeSet, values: number[]) {
    if (c < cost[j]![s]) {
      cost[j]![s] = c;
      back[j]![s] = { prevI, prevSet, values };
    }
  }

  let best: CodeSet = "B";
  for (const s of SETS) if (cost[n]![s] < cost[n]![best]) best = s;

  // Reconstruct.
  const chunks: number[][] = [];
  let i = n;
  let s: CodeSet | null = best;
  while (s !== null) {
    const step: Step = back[i]![s]!;
    chunks.push(step.values);
    if (step.prevI < 0) break;
    i = step.prevI;
    s = step.prevSet;
  }
  const values = chunks.reverse().flat();

  let checksum = values[0]!;
  for (let k = 1; k < values.length; k += 1) checksum += values[k]! * k;
  values.push(checksum % 103, STOP);
  return values;
}

/** Convert symbol values to alternating bar/space module widths. */
export function code128ValuesToBars(values: readonly number[]): number[] {
  const bars: number[] = [];
  for (const v of values) {
    const pattern = PATTERNS[v];
    if (pattern === undefined) throw new RangeError(`Invalid Code 128 value ${v}.`);
    for (const ch of pattern) bars.push(ch.charCodeAt(0) - 48);
  }
  return bars;
}

export function stringToCode128Items(value: string): Code128Item[] {
  const items: number[] = [];
  for (let k = 0; k < value.length; k += 1) items.push(value.charCodeAt(k));
  return items;
}

/** Maximum number of data items accepted (keeps symbol length practical). */
export const CODE128_MAX_ITEMS = 80;
