import { conditionPaths } from "../binding/conditions";
import type { Issue } from "../errors";
import type { DataRecord, DataSchema, LabelTemplate, ValueSource } from "../schema/types";
import { lookupPath, parsePath } from "../binding/path";
import { renderLabel, type RenderOptions } from "../render/render-label";

export interface DataValidationOptions extends Omit<RenderOptions, "mode" | "idPrefix" | "title"> {
  /** When provided, bindings to undeclared fields and missing required schema fields are reported. */
  readonly schema?: DataSchema | undefined;
}

/** Every binding path a template references (value sources, conditions and style rules), deduplicated. */
export function getTemplateFieldPaths(template: LabelTemplate): string[] {
  const out = new Set<string>();
  const add = (s: ValueSource | undefined) => {
    if (s?.kind === "field") out.add(s.path);
  };
  for (const el of template.elements) {
    if (el.type === "text") add(el.content);
    else if (el.type === "barcode" || el.type === "qrcode") add(el.value);
    if (el.condition) conditionPaths(el.condition, out);
    for (const rule of el.styleRules ?? []) conditionPaths(rule.when, out);
  }
  return [...out];
}

/**
 * Check one data record against a template without producing output:
 * required fields, missing/invalid barcode data, formatting failures,
 * symbology constraints, and (optionally) schema conformance.
 * Template errors throw `TemplateValidationError` (validate templates first).
 */
export function validateTemplateData(template: LabelTemplate, record: DataRecord | undefined, options: DataValidationOptions = {}): Issue[] {
  const { schema, ...renderOptions } = options;
  const issues = [...renderLabel(template, record, { ...renderOptions, mode: "output" }).issues];
  if (schema) {
    const declared = new Set(schema.fields.map((f) => f.path));
    for (const path of getTemplateFieldPaths(template)) {
      if (!declared.has(path)) issues.push({ code: "FIELD_NOT_IN_SCHEMA", severity: "warning", path: "", message: `Template binds "${path}", which the data schema does not declare.` });
    }
    for (const f of schema.fields) {
      if (!f.required) continue;
      const parsed = parsePath(f.path);
      const found = parsed.ok && record !== undefined ? lookupPath(record, parsed.segments) : { found: false as const };
      if (!found.found || found.value === undefined || found.value === null || found.value === "") {
        issues.push({ code: "SCHEMA_REQUIRED_FIELD_MISSING", severity: "error", path: "", message: `Required field "${f.path}" (${f.label}) is missing from the record.` });
      }
    }
  }
  return issues;
}
