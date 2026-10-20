/**
 * GS1 Application Identifier parsing and validation for GS1-128.
 *
 * Input syntax: bracketed element strings, e.g. `(01)09501101530003(17)271231(10)LOT42`.
 * Only the AIs listed in `AI_TABLE` are accepted; unknown AIs are rejected
 * rather than encoded blindly. Data may not contain "(" or ")" because they
 * delimit AIs in this syntax.
 *
 * This validates structure (lengths, character sets, check digits, dates)
 * per the GS1 General Specifications; it does not validate business meaning
 * (e.g. whether a GTIN is allocated).
 */
import { hasValidGs1CheckDigit } from "./checksum";
import { FNC1 } from "./code128";

interface AiSpec {
  readonly title: string;
  readonly charset: "n" | "x";
  readonly min: number;
  readonly max: number;
  readonly check?: boolean;
  readonly date?: boolean;
}

const n = (title: string, len: number, extra: Partial<AiSpec> = {}): AiSpec => ({ title, charset: "n", min: len, max: len, ...extra });
const nv = (title: string, max: number): AiSpec => ({ title, charset: "n", min: 1, max });
const xv = (title: string, max: number): AiSpec => ({ title, charset: "x", min: 1, max });

const FIXED: Record<string, AiSpec> = {
  "00": n("SSCC", 18, { check: true }),
  "01": n("GTIN", 14, { check: true }),
  "02": n("CONTENT", 14, { check: true }),
  "10": xv("BATCH/LOT", 20),
  "11": n("PROD DATE", 6, { date: true }),
  "12": n("DUE DATE", 6, { date: true }),
  "13": n("PACK DATE", 6, { date: true }),
  "15": n("BEST BEFORE or BEST BY", 6, { date: true }),
  "16": n("SELL BY", 6, { date: true }),
  "17": n("USE BY or EXPIRY", 6, { date: true }),
  "20": n("VARIANT", 2),
  "21": xv("SERIAL", 20),
  "22": xv("CPV", 20),
  "240": xv("ADDITIONAL ID", 30),
  "241": xv("CUST. PART No.", 30),
  "250": xv("SECONDARY SERIAL", 30),
  "251": xv("REF. TO SOURCE", 30),
  "30": nv("VAR. COUNT", 8),
  "37": nv("COUNT", 8),
  "400": xv("ORDER NUMBER", 30),
  "401": xv("GINC", 30),
  "402": n("GSIN", 17, { check: true }),
  "403": xv("ROUTE", 30),
  "410": n("SHIP TO LOC", 13, { check: true }),
  "411": n("BILL TO", 13, { check: true }),
  "412": n("PURCHASE FROM", 13, { check: true }),
  "413": n("SHIP FOR LOC", 13, { check: true }),
  "414": n("LOC No.", 13, { check: true }),
  "415": n("PAY TO", 13, { check: true }),
  "420": xv("SHIP TO POST", 20),
  "422": n("ORIGIN", 3),
  "7003": n("EXPIRY TIME", 10),
  "8005": n("PRICE PER UNIT", 6),
  "8020": xv("REF No.", 25),
  "90": xv("INTERNAL", 30),
};

/** AIs ending in a decimal-point indicator digit 0–5 (e.g. 3103 = net weight kg, 3 decimals). */
const DECIMAL_PREFIXES: Record<string, AiSpec> = {
  "310": n("NET WEIGHT (kg)", 6),
  "311": n("LENGTH (m)", 6),
  "312": n("WIDTH (m)", 6),
  "313": n("HEIGHT (m)", 6),
  "314": n("AREA (m²)", 6),
  "315": n("NET VOLUME (l)", 6),
  "316": n("NET VOLUME (m³)", 6),
  "320": n("NET WEIGHT (lb)", 6),
  "330": n("GROSS WEIGHT (kg)", 6),
  "390": nv("AMOUNT", 15),
  "392": nv("PRICE", 15),
};

/** First two digits of AIs whose element strings have a predefined length (no FNC1 separator needed). */
const PREDEFINED_LENGTH_PREFIXES = new Set(["00", "01", "02", "03", "04", "11", "12", "13", "14", "15", "16", "17", "18", "19", "20", "31", "32", "33", "34", "35", "36", "41"]);

export function lookupAi(ai: string): AiSpec | undefined {
  if (FIXED[ai]) return FIXED[ai];
  if (ai.length === 4 && /^\d{3}[0-5]$/.test(ai) && ai.slice(0, 3) in DECIMAL_PREFIXES) {
    const spec = DECIMAL_PREFIXES[ai.slice(0, 3)]!;
    // 390n/392n only allow 0–9 but in practice 0–5; we accept 0–5 consistently.
    return spec;
  }
  if (/^9[1-9]$/.test(ai)) return xv("INTERNAL", 90);
  return undefined;
}

/** The set of AI strings (and patterns) supported, for documentation and the editor. */
export function supportedAis(): string[] {
  return [...Object.keys(FIXED), ...Object.keys(DECIMAL_PREFIXES).map((p) => `${p}n`), "91–99"];
}

/** GS1 character set 82 (excluding "(" and ")", which delimit AIs in bracketed input). */
const CSET82 = /^[!"%&'*+,\-./0-9:;<=>?A-Z_a-z]*$/;

export interface Gs1Element {
  readonly ai: string;
  readonly data: string;
}

export type Gs1ParseResult =
  | { readonly ok: true; readonly elements: readonly Gs1Element[] }
  | { readonly ok: false; readonly reason: string; readonly message: string };

const MAX_GS1_DATA_CHARS = 48;

function isValidYymmdd(s: string): boolean {
  const mm = Number(s.slice(2, 4));
  const dd = Number(s.slice(4, 6));
  if (mm < 1 || mm > 12) return false;
  if (dd === 0) return true; // "00" = last day of month, permitted for date AIs
  // Century per GS1 sliding window is irrelevant for day-in-month except Feb 29;
  // accept 29 Feb in any year divisible by 4 (2000 is a leap year).
  const yy = Number(s.slice(0, 2));
  const daysInMonth = [31, yy % 4 === 0 ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][mm - 1]!;
  return dd <= daysInMonth;
}

export function parseGs1(value: string): Gs1ParseResult {
  if (value.length === 0) return { ok: false, reason: "empty", message: "GS1-128 value is empty." };
  const re = /\((\d{2,4})\)([^()]*)/y;
  const elements: Gs1Element[] = [];
  let pos = 0;
  while (pos < value.length) {
    re.lastIndex = pos;
    const m = re.exec(value);
    if (!m) {
      return { ok: false, reason: "syntax", message: 'GS1-128 values must use bracketed AIs, e.g. "(01)09501101530003(10)LOT1".' };
    }
    const ai = m[1]!;
    const data = m[2]!;
    const spec = lookupAi(ai);
    if (!spec) return { ok: false, reason: "unknown-ai", message: `Application Identifier (${ai}) is not supported.` };
    if (data.length < spec.min || data.length > spec.max) {
      const range = spec.min === spec.max ? `${spec.min}` : `${spec.min}–${spec.max}`;
      return { ok: false, reason: "length", message: `AI (${ai}) ${spec.title} requires ${range} characters; got ${data.length}.` };
    }
    if (spec.charset === "n" ? !/^\d+$/.test(data) : !CSET82.test(data)) {
      return {
        ok: false,
        reason: "charset",
        message: `AI (${ai}) ${spec.title} contains characters outside ${spec.charset === "n" ? "digits" : "GS1 character set 82"}.`,
      };
    }
    if (spec.check && !hasValidGs1CheckDigit(data)) {
      return { ok: false, reason: "checksum", message: `AI (${ai}) ${spec.title} has an invalid check digit.` };
    }
    if (spec.date && !isValidYymmdd(data)) {
      return { ok: false, reason: "date", message: `AI (${ai}) ${spec.title} is not a valid YYMMDD date.` };
    }
    elements.push({ ai, data });
    pos = re.lastIndex;
  }
  const seen = new Set<string>();
  for (const e of elements) {
    if (seen.has(e.ai)) return { ok: false, reason: "duplicate-ai", message: `AI (${e.ai}) appears more than once.` };
    seen.add(e.ai);
  }
  const dataChars = elements.reduce((sum, e) => sum + e.ai.length + e.data.length, 0);
  if (dataChars > MAX_GS1_DATA_CHARS) {
    return { ok: false, reason: "length", message: `GS1-128 symbols may encode at most ${MAX_GS1_DATA_CHARS} data characters; got ${dataChars}.` };
  }
  return { ok: true, elements };
}

/** Code 128 items for a GS1-128 symbol: leading FNC1, FNC1 after each variable-length element except the last. */
export function gs1ToCode128Items(elements: readonly Gs1Element[]): number[] {
  const items: number[] = [FNC1];
  elements.forEach((e, i) => {
    for (const ch of e.ai + e.data) items.push(ch.charCodeAt(0));
    const isLast = i === elements.length - 1;
    if (!isLast && !PREDEFINED_LENGTH_PREFIXES.has(e.ai.slice(0, 2))) items.push(FNC1);
  });
  return items;
}

export function gs1Hri(elements: readonly Gs1Element[]): string {
  return elements.map((e) => `(${e.ai})${e.data}`).join("");
}
