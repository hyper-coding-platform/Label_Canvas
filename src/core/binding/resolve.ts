import type { DataRecord, ValueSource } from "../schema/types";
import { formatValue, isScalarValue } from "./format";
import { lookupPath, parsePath } from "./path";

/**
 * Outcome of resolving a `ValueSource` against a data record.
 *
 * - `ok`: `text` is the final display/encode string (prefix + formatted value + suffix, or the fallback).
 * - `missing`: the field is absent, `undefined`, `null` or `""` and no fallback is defined.
 * - `invalid`: the path is unsafe, the value is not a scalar, or formatting failed.
 */
export type ResolvedValue =
  | { readonly status: "ok"; readonly text: string; readonly usedFallback: boolean }
  | { readonly status: "missing"; readonly path: string; readonly required: boolean }
  | { readonly status: "invalid"; readonly path: string; readonly message: string };

export interface ResolveOptions {
  readonly maxPathSegments?: number;
  readonly maxValueLength?: number;
}

/** Deterministic, side-effect-free resolution. Never mutates `record`. */
export function resolveValue(source: ValueSource, record: DataRecord | undefined, options: ResolveOptions = {}): ResolvedValue {
  if (source.kind === "static") return { status: "ok", text: source.value, usedFallback: false };

  const parsed = parsePath(source.path, options.maxPathSegments);
  if (!parsed.ok) return { status: "invalid", path: source.path, message: parsed.message };

  const found = record === undefined ? { found: false as const } : lookupPath(record, parsed.segments);
  const value = found.found ? found.value : undefined;

  if (value === undefined || value === null || value === "") {
    if (source.fallback !== undefined) return { status: "ok", text: source.fallback, usedFallback: true };
    return { status: "missing", path: source.path, required: source.required === true };
  }
  if (!isScalarValue(value)) {
    return { status: "invalid", path: source.path, message: `Field "${source.path}" is not a text, number, boolean or date value.` };
  }
  const formatted = formatValue(value, source.format);
  if (!formatted.ok) return { status: "invalid", path: source.path, message: `Field "${source.path}": ${formatted.message}` };

  const text = (source.prefix ?? "") + formatted.text + (source.suffix ?? "");
  const max = options.maxValueLength ?? 4096;
  if (text.length > max * 2 || Array.from(text).length > max) {
    return { status: "invalid", path: source.path, message: `Field "${source.path}" exceeds ${max} characters.` };
  }
  return { status: "ok", text, usedFallback: false };
}

/** Collect every binding path referenced by a value source list (deduplicated, in order). */
export function collectPaths(sources: Iterable<ValueSource>): string[] {
  const seen = new Set<string>();
  for (const s of sources) if (s.kind === "field") seen.add(s.path);
  return [...seen];
}
