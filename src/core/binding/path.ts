/**
 * Safe binding paths. A path is a dot-separated list of identifier segments or
 * non-negative integer indices, e.g. `product.sku`, `variants.0.size`.
 *
 * Paths are data, never code: they are parsed with fixed regular expressions
 * and resolved by walking own properties only. Prototype-related segments are
 * always rejected.
 */

export type PathSegment = string | number;

export const MAX_PATH_LENGTH = 256;
const IDENTIFIER = /^[A-Za-z_$][A-Za-z0-9_$-]{0,63}$/;
const INDEX = /^(?:0|[1-9][0-9]{0,5})$/;
export const FORBIDDEN_SEGMENTS: ReadonlySet<string> = new Set(["__proto__", "prototype", "constructor"]);

export type ParsePathResult =
  | { readonly ok: true; readonly segments: readonly PathSegment[] }
  | { readonly ok: false; readonly code: "BINDING_PATH_INVALID" | "BINDING_PATH_FORBIDDEN"; readonly message: string };

export function parsePath(path: unknown, maxSegments = 8): ParsePathResult {
  if (typeof path !== "string" || path.length === 0) {
    return { ok: false, code: "BINDING_PATH_INVALID", message: "Binding path must be a non-empty string." };
  }
  if (path.length > MAX_PATH_LENGTH) {
    return { ok: false, code: "BINDING_PATH_INVALID", message: `Binding path exceeds ${MAX_PATH_LENGTH} characters.` };
  }
  const parts = path.split(".");
  if (parts.length > maxSegments) {
    return { ok: false, code: "BINDING_PATH_INVALID", message: `Binding path has more than ${maxSegments} segments.` };
  }
  const segments: PathSegment[] = [];
  for (const part of parts) {
    if (FORBIDDEN_SEGMENTS.has(part)) {
      return { ok: false, code: "BINDING_PATH_FORBIDDEN", message: `Binding path segment "${part}" is not allowed.` };
    }
    if (INDEX.test(part)) {
      if (segments.length === 0) {
        return { ok: false, code: "BINDING_PATH_INVALID", message: "Binding path must start with a field name." };
      }
      segments.push(Number(part));
    } else if (IDENTIFIER.test(part)) {
      segments.push(part);
    } else {
      return {
        ok: false,
        code: "BINDING_PATH_INVALID",
        message: `Invalid binding path segment "${truncateForMessage(part)}". Use letters, digits, "_", "$" or "-", or an array index.`,
      };
    }
  }
  return { ok: true, segments };
}

export type LookupResult = { readonly found: true; readonly value: unknown } | { readonly found: false };

const hasOwn = (obj: object, key: PropertyKey): boolean => Object.prototype.hasOwnProperty.call(obj, key);

/**
 * Walks `segments` through own properties of `record`. Never reads inherited
 * properties, never calls functions, and never indexes non-arrays by number.
 */
export function lookupPath(record: unknown, segments: readonly PathSegment[]): LookupResult {
  let current: unknown = record;
  for (const seg of segments) {
    if (current === null || typeof current !== "object") return { found: false };
    if (typeof seg === "number") {
      if (!Array.isArray(current) || seg >= current.length) return { found: false };
      current = current[seg];
    } else {
      if (Array.isArray(current) || FORBIDDEN_SEGMENTS.has(seg) || !hasOwn(current, seg)) return { found: false };
      current = (current as Record<string, unknown>)[seg];
    }
    if (typeof current === "function") return { found: false };
  }
  return { found: true, value: current };
}

function truncateForMessage(s: string): string {
  return s.length > 40 ? `${s.slice(0, 40)}…` : s;
}
