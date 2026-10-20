import type { Issue } from "../errors";
import type { TemplateLimits } from "../schema/limits";

/** Mutable accumulator used while decoding untrusted input. */
export class DecodeContext {
  readonly issues: Issue[] = [];
  constructor(readonly limits: TemplateLimits) {}

  error(path: string, code: string, message: string, elementId?: string): void {
    this.issues.push(elementId === undefined ? { code, severity: "error", path, message } : { code, severity: "error", path, message, elementId });
  }

  warn(path: string, code: string, message: string, elementId?: string): void {
    this.issues.push(elementId === undefined ? { code, severity: "warning", path, message } : { code, severity: "warning", path, message, elementId });
  }

  get hasErrors(): boolean {
    return this.issues.some((i) => i.severity === "error");
  }
}

export type Obj = Record<string, unknown>;

export function isPlainObject(value: unknown): value is Obj {
  if (value === null || typeof value !== "object" || Array.isArray(value)) return false;
  const proto: unknown = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
}

const hasOwn = (o: object, k: string) => Object.prototype.hasOwnProperty.call(o, k);

/** Report keys not in `allowed` (including `__proto__` own keys from JSON.parse). */
export function checkKeys(ctx: DecodeContext, obj: Obj, allowed: ReadonlySet<string>, path: string, elementId?: string): void {
  for (const key of Object.keys(obj)) {
    if (!allowed.has(key)) {
      ctx.error(`${path}/${escapePointer(key)}`, "UNKNOWN_PROPERTY", `Unknown property "${truncate(key, 40)}".`, elementId);
    }
  }
}

export function escapePointer(key: string): string {
  return key.replace(/~/g, "~0").replace(/\//g, "~1");
}

export function truncate(s: string, max: number): string {
  return s.length > max ? `${s.slice(0, max)}…` : s;
}

export function get(obj: Obj, key: string): unknown {
  return hasOwn(obj, key) ? obj[key] : undefined;
}

export function has(obj: Obj, key: string): boolean {
  return hasOwn(obj, key) && obj[key] !== undefined;
}

// Control characters other than tab/newline are rejected in text; none at all in identifiers.
// eslint-disable-next-line no-control-regex
const CONTROL_EXCEPT_TAB_NL = /[\u0000-\u0008\u000B-\u001F\u007F]/;
// eslint-disable-next-line no-control-regex
const ANY_CONTROL = /[\u0000-\u001F\u007F]/;

export function codePointLength(s: string): number {
  let n = 0;
  for (const _ of s) n += 1;
  return n;
}

export interface StringRules {
  readonly max: number;
  readonly min?: number;
  readonly allowNewlines?: boolean;
  readonly pattern?: RegExp;
  readonly patternMessage?: string;
}

export function decodeString(ctx: DecodeContext, value: unknown, path: string, rules: StringRules, elementId?: string): string | undefined {
  if (typeof value !== "string") {
    ctx.error(path, "TYPE_MISMATCH", "Expected a string.", elementId);
    return undefined;
  }
  // Cheap pre-check before counting code points on huge strings.
  if (value.length > rules.max * 2 || codePointLength(value) > rules.max) {
    ctx.error(path, "TEXT_TOO_LONG", `Text exceeds ${rules.max} characters.`, elementId);
    return undefined;
  }
  if ((rules.min ?? 0) > 0 && value.length < (rules.min ?? 0)) {
    ctx.error(path, "STRING_EMPTY", "Value must not be empty.", elementId);
    return undefined;
  }
  if ((rules.allowNewlines ? CONTROL_EXCEPT_TAB_NL : ANY_CONTROL).test(value)) {
    ctx.error(path, "STRING_CONTROL_CHARACTERS", "Text contains control characters.", elementId);
    return undefined;
  }
  if (rules.pattern && !rules.pattern.test(value)) {
    ctx.error(path, "STRING_INVALID", rules.patternMessage ?? "Invalid value.", elementId);
    return undefined;
  }
  return value;
}

export interface NumberRules {
  readonly min?: number;
  readonly max?: number;
  readonly exclusiveMin?: number;
  readonly integer?: boolean;
}

export function decodeNumber(ctx: DecodeContext, value: unknown, path: string, rules: NumberRules, elementId?: string): number | undefined {
  if (typeof value !== "number") {
    ctx.error(path, "TYPE_MISMATCH", "Expected a number.", elementId);
    return undefined;
  }
  if (!Number.isFinite(value)) {
    ctx.error(path, "NUMBER_NOT_FINITE", "Number must be finite (NaN and Infinity are not allowed).", elementId);
    return undefined;
  }
  if (rules.integer && !Number.isInteger(value)) {
    ctx.error(path, "NUMBER_NOT_INTEGER", "Expected an integer.", elementId);
    return undefined;
  }
  if (rules.exclusiveMin !== undefined && !(value > rules.exclusiveMin)) {
    ctx.error(path, "NUMBER_OUT_OF_RANGE", `Must be greater than ${rules.exclusiveMin}.`, elementId);
    return undefined;
  }
  if ((rules.min !== undefined && value < rules.min) || (rules.max !== undefined && value > rules.max)) {
    ctx.error(path, "NUMBER_OUT_OF_RANGE", `Must be between ${rules.min ?? "-∞"} and ${rules.max ?? "∞"}.`, elementId);
    return undefined;
  }
  return value === 0 ? 0 : value; // normalize -0
}

export function decodeBoolean(ctx: DecodeContext, value: unknown, path: string, elementId?: string): boolean | undefined {
  if (typeof value !== "boolean") {
    ctx.error(path, "TYPE_MISMATCH", "Expected true or false.", elementId);
    return undefined;
  }
  return value;
}

export function decodeEnum<T extends string>(ctx: DecodeContext, value: unknown, path: string, allowed: readonly T[], elementId?: string): T | undefined {
  if (typeof value !== "string" || !(allowed as readonly string[]).includes(value)) {
    ctx.error(path, "ENUM_INVALID", `Expected one of: ${allowed.join(", ")}.`, elementId);
    return undefined;
  }
  return value as T;
}

const COLOR = /^(?:#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{4}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})|transparent)$/;

export function isColor(value: unknown): value is string {
  return typeof value === "string" && COLOR.test(value);
}

export function decodeColor(ctx: DecodeContext, value: unknown, path: string, elementId?: string): string | undefined {
  if (!isColor(value)) {
    ctx.error(path, "COLOR_INVALID", 'Colour must be "#rgb", "#rgba", "#rrggbb", "#rrggbbaa" or "transparent".', elementId);
    return undefined;
  }
  return value;
}
