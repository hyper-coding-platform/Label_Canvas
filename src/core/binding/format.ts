import type { CurrencyFormat, DateFormat, NumberFormat, TextFormat, ValueFormat } from "../schema/types";
import { roundTo } from "../geometry/units";

export type FormatResult = { readonly ok: true; readonly text: string } | { readonly ok: false; readonly message: string };

/** Scalar values a record may supply for a binding. */
export type ScalarValue = string | number | boolean | Date | bigint;

export function isScalarValue(value: unknown): value is ScalarValue {
  const t = typeof value;
  return t === "string" || t === "number" || t === "boolean" || t === "bigint" || value instanceof Date;
}

/** Locale-independent default conversion of a scalar to text. */
export function scalarToText(value: ScalarValue): FormatResult {
  if (typeof value === "string") return { ok: true, text: value };
  if (typeof value === "number") {
    if (!Number.isFinite(value)) return { ok: false, message: "Number is not finite." };
    return { ok: true, text: String(value) };
  }
  if (typeof value === "bigint") return { ok: true, text: value.toString() };
  if (typeof value === "boolean") return { ok: true, text: value ? "true" : "false" };
  if (Number.isNaN(value.getTime())) return { ok: false, message: "Invalid date." };
  return { ok: true, text: value.toISOString() };
}

export function formatValue(value: ScalarValue, format: ValueFormat | undefined): FormatResult {
  if (!format) return scalarToText(value);
  switch (format.type) {
    case "text":
      return formatText(value, format);
    case "number":
      return formatNumber(value, format);
    case "currency":
      return formatCurrency(value, format);
    case "date":
      return formatDate(value, format);
  }
}

function formatText(value: ScalarValue, format: TextFormat): FormatResult {
  const base = scalarToText(value);
  if (!base.ok) return base;
  let text = base.text;
  if (format.case === "upper") text = text.toUpperCase();
  else if (format.case === "lower") text = text.toLowerCase();
  else if (format.case === "title") text = text.toLowerCase().replace(/(^|[\s\-/])(\p{L})/gu, (_m, sep: string, ch: string) => sep + ch.toUpperCase());
  if (format.maxLength !== undefined) {
    const cps = Array.from(text);
    if (cps.length > format.maxLength) text = cps.slice(0, format.maxLength).join("");
  }
  return { ok: true, text };
}

const NUMERIC_STRING = /^\s*-?(?:\d+\.?\d*|\.\d+)(?:[eE][-+]?\d+)?\s*$/;

export function toNumber(value: ScalarValue): number | null {
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value === "bigint") {
    const n = Number(value);
    return Number.isFinite(n) ? n : null;
  }
  if (typeof value === "string" && NUMERIC_STRING.test(value)) {
    const n = Number(value);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

function groupThousands(intDigits: string): string {
  return intDigits.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
}

/** Deterministic, locale-independent number formatting: `.` decimal separator, optional `,` grouping. */
export function formatPlainNumber(n: number, decimals: number | undefined, grouping: boolean): string {
  let s: string;
  if (decimals === undefined) {
    s = String(n);
    // Tiny magnitudes stringify with an exponent; expand them. (|n| >= 1e21 keeps
    // its exponent: such values exceed any meaningful label quantity.)
    if (/e-/i.test(s)) s = n.toFixed(20).replace(/\.?0+$/, "");
  } else {
    s = roundTo(n, decimals).toFixed(decimals);
  }
  if (s === "-0" || /^-0\.0*$/.test(s)) s = s.slice(1);
  if (!grouping) return s;
  const negative = s.startsWith("-");
  const body = negative ? s.slice(1) : s;
  const [intPart, frac] = body.split(".");
  return (negative ? "-" : "") + groupThousands(intPart ?? "") + (frac !== undefined ? `.${frac}` : "");
}

function intlNumber(n: number, locale: string, options: Intl.NumberFormatOptions): FormatResult {
  try {
    return { ok: true, text: new Intl.NumberFormat(locale, options).format(n) };
  } catch (e) {
    return { ok: false, message: `Number formatting failed for locale "${locale}": ${(e as Error).message}` };
  }
}

function formatNumber(value: ScalarValue, format: NumberFormat): FormatResult {
  const n = toNumber(value);
  if (n === null) return { ok: false, message: "Value is not a number." };
  if (format.locale) {
    const opts: Intl.NumberFormatOptions = { useGrouping: format.grouping ?? false };
    if (format.decimals !== undefined) {
      opts.minimumFractionDigits = format.decimals;
      opts.maximumFractionDigits = format.decimals;
    }
    return intlNumber(n, format.locale, opts);
  }
  return { ok: true, text: formatPlainNumber(n, format.decimals, format.grouping ?? false) };
}

function formatCurrency(value: ScalarValue, format: CurrencyFormat): FormatResult {
  const n = toNumber(value);
  if (n === null) return { ok: false, message: "Value is not a number." };
  const decimals = format.decimals ?? 2;
  const display = format.display ?? (format.locale ? "symbol" : "code");
  if (display === "symbol") {
    if (!format.locale) return { ok: false, message: 'Currency display "symbol" requires a locale.' };
    return intlNumber(n, format.locale, {
      style: "currency",
      currency: format.currency,
      currencyDisplay: "narrowSymbol",
      minimumFractionDigits: decimals,
      maximumFractionDigits: decimals,
    });
  }
  let num: FormatResult;
  if (format.locale) {
    num = intlNumber(n, format.locale, { minimumFractionDigits: decimals, maximumFractionDigits: decimals, useGrouping: true });
  } else {
    num = { ok: true, text: formatPlainNumber(n, decimals, true) };
  }
  if (!num.ok) return num;
  return { ok: true, text: display === "code" ? `${format.currency} ${num.text}` : num.text };
}

const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const DATE_ONLY = /^(\d{4})-(\d{2})-(\d{2})$/;
const ISO_DATETIME = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d{1,3})?)?(?:Z|[+-]\d{2}:\d{2})$/;

export function toDate(value: ScalarValue): Date | null {
  let d: Date;
  if (value instanceof Date) d = value;
  else if (typeof value === "number") d = new Date(value);
  else if (typeof value === "string") {
    const s = value.trim();
    const m = DATE_ONLY.exec(s);
    if (m) {
      const [y, mo, day] = [Number(m[1]), Number(m[2]), Number(m[3])];
      d = new Date(Date.UTC(y, mo - 1, day));
      // Reject impossible calendar dates (e.g. 2026-02-30) instead of rolling over.
      if (d.getUTCFullYear() !== y || d.getUTCMonth() !== mo - 1 || d.getUTCDate() !== day) return null;
    } else if (ISO_DATETIME.test(s)) d = new Date(s);
    else return null;
  } else return null;
  return Number.isNaN(d.getTime()) ? null : d;
}

const DATE_TOKEN = /YYYY|YY|MMMM|MMM|MM|M|DD|D|HH|mm/g;

function formatDate(value: ScalarValue, format: DateFormat): FormatResult {
  const d = toDate(value);
  if (!d) return { ok: false, message: "Value is not a valid date (expected ISO 8601 string, epoch milliseconds or Date)." };
  const utc = (format.timeZone ?? "UTC") === "UTC";
  const Y = utc ? d.getUTCFullYear() : d.getFullYear();
  const Mo = utc ? d.getUTCMonth() : d.getMonth();
  const D = utc ? d.getUTCDate() : d.getDate();
  const H = utc ? d.getUTCHours() : d.getHours();
  const Mi = utc ? d.getUTCMinutes() : d.getMinutes();
  const pad = (n: number) => String(n).padStart(2, "0");
  const text = format.pattern.replace(DATE_TOKEN, (tok) => {
    switch (tok) {
      case "YYYY": return String(Y).padStart(4, "0");
      case "YY": return pad(Y % 100);
      case "MMMM": return MONTHS[Mo]!;
      case "MMM": return MONTHS[Mo]!.slice(0, 3);
      case "MM": return pad(Mo + 1);
      case "M": return String(Mo + 1);
      case "DD": return pad(D);
      case "D": return String(D);
      case "HH": return pad(H);
      default: return pad(Mi);
    }
  });
  return { ok: true, text };
}
