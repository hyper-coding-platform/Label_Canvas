import type { DataRecord, DataSchema } from "../schema/types";
import { parsePath } from "./path";

/**
 * Build a preview record from schema `example` values. Paths are parsed with
 * the safe path parser; objects are created with own properties only, and
 * array-index segments create arrays.
 */
export function sampleRecordFromSchema(schema: DataSchema | undefined): DataRecord {
  const root: Record<string, unknown> = {};
  if (!schema) return root;
  for (const field of schema.fields) {
    if (field.example === undefined) continue;
    const parsed = parsePath(field.path);
    if (!parsed.ok) continue;
    let node: Record<string | number, unknown> = root;
    parsed.segments.forEach((seg, i) => {
      const last = i === parsed.segments.length - 1;
      if (last) {
        node[seg] = field.example;
        return;
      }
      const nextIsIndex = typeof parsed.segments[i + 1] === "number";
      const existing = Object.prototype.hasOwnProperty.call(node, seg) ? node[seg] : undefined;
      if (existing === null || typeof existing !== "object") node[seg] = nextIsIndex ? [] : {};
      node = node[seg] as Record<string | number, unknown>;
    });
  }
  return root;
}
