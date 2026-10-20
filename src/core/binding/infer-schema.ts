import type { DataField, DataFieldType, DataRecord, DataSchema } from "../schema/types";
import { FORBIDDEN_SEGMENTS } from "./path";

const IDENT = /^[A-Za-z_$][A-Za-z0-9_$-]{0,63}$/;

export interface InferSchemaOptions {
  /** Max path depth (default 8, the binding limit). */
  readonly maxDepth?: number;
  /** Max number of fields returned (default 500). */
  readonly maxFields?: number;
  /** Include array index 0 paths for arrays of objects (default true). */
  readonly includeFirstArrayItem?: boolean;
}

/**
 * Field discovery: derive a DataSchema from a sample ERP record by walking
 * own enumerable properties. Keys that are not valid binding segments (or are
 * prototype-related) are skipped, so every discovered path is bindable.
 * Labels are humanised from keys; hosts usually refine them.
 */
export function inferDataSchema(record: DataRecord, options: InferSchemaOptions = {}): DataSchema {
  const maxDepth = options.maxDepth ?? 8;
  const maxFields = options.maxFields ?? 500;
  const fields: DataField[] = [];
  const seen = new WeakSet<object>();

  const visit = (value: unknown, path: string[], group: string | undefined) => {
    if (fields.length >= maxFields) return;
    if (value === null || value === undefined) {
      if (path.length) fields.push(field(path, undefined, group));
      return;
    }
    if (value instanceof Date || typeof value !== "object") {
      if (path.length && typeof value !== "function" && typeof value !== "symbol") fields.push(field(path, scalarType(value), group, value));
      return;
    }
    if (seen.has(value) || path.length >= maxDepth) return;
    seen.add(value);
    if (Array.isArray(value)) {
      if ((options.includeFirstArrayItem ?? true) && value.length > 0) visit(value[0], [...path, "0"], group);
      return;
    }
    for (const key of Object.keys(value)) {
      if (!IDENT.test(key) || FORBIDDEN_SEGMENTS.has(key)) continue;
      visit((value as Record<string, unknown>)[key], [...path, key], path.length === 0 ? humanize(key) : group);
    }
  };
  visit(record, [], undefined);
  return { fields };
}

function scalarType(v: unknown): DataFieldType | undefined {
  if (typeof v === "number" || typeof v === "bigint") return "number";
  if (typeof v === "boolean") return "boolean";
  if (v instanceof Date || (typeof v === "string" && /^\d{4}-\d{2}-\d{2}(T|$)/.test(v))) return "date";
  if (typeof v === "string") return "string";
  return undefined;
}

function field(path: string[], type: DataFieldType | undefined, group: string | undefined, example?: unknown): DataField {
  const out: { -readonly [K in keyof DataField]?: DataField[K] } = { path: path.join("."), label: humanize(path.filter((p) => !/^\d+$/.test(p)).slice(-1)[0] ?? path.join(".")) };
  if (type) out.type = type;
  if (group && path.length > 1) out.group = group;
  if (typeof example === "string" || typeof example === "number" || typeof example === "boolean") out.example = typeof example === "string" && example.length > 80 ? `${example.slice(0, 80)}…` : example;
  return out as DataField;
}

function humanize(key: string): string {
  const spaced = key.replace(/[_-]+/g, " ").replace(/([a-z0-9])([A-Z])/g, "$1 $2").trim();
  return spaced.charAt(0).toUpperCase() + spaced.slice(1).toLowerCase();
}
