/**
 * Entry point for untrusted template input (imports, storage loads, API payloads):
 * size check → JSON parse → explicit migrations → strict validation.
 */
import type { Issue } from "../errors";
import { resolveLimits } from "../schema/limits";
import { CURRENT_SCHEMA_VERSION, type LabelTemplate } from "../schema/types";
import { isPlainObject } from "./context";
import { validateTemplate, type ValidateOptions } from "./validate-template";

/**
 * A migration upgrades a template object from exactly `from` to exactly `to`
 * (`to === from + 1`). Migrations receive a structured clone and must return a
 * new object; they must not guess at unknown properties.
 */
export interface TemplateMigration {
  readonly from: number;
  readonly to: number;
  readonly migrate: (template: Record<string, unknown>) => Record<string, unknown>;
}

/**
 * Built-in migrations. Schema version 1 is the first published version, so
 * this list is empty. Future versions append entries here; each must ship
 * with tests (tests/unit/migrations.test.ts).
 */
export const BUILT_IN_MIGRATIONS: readonly TemplateMigration[] = Object.freeze([]);

export interface ParseOptions extends ValidateOptions {
  /** Override the migration chain (primarily for testing and forward-compat tooling). */
  readonly migrations?: readonly TemplateMigration[] | undefined;
}

export type ParseResult =
  | { readonly ok: true; readonly template: LabelTemplate; readonly warnings: readonly Issue[]; readonly migratedFrom?: number }
  | { readonly ok: false; readonly issues: readonly Issue[] };

const fail = (code: string, message: string, path = ""): ParseResult => ({ ok: false, issues: [{ code, severity: "error", path, message }] });

export function migrateTemplate(
  input: Record<string, unknown>,
  migrations: readonly TemplateMigration[] = BUILT_IN_MIGRATIONS,
): { ok: true; template: Record<string, unknown>; from: number } | { ok: false; code: string; message: string } {
  const version = input.schemaVersion;
  if (typeof version !== "number" || !Number.isInteger(version) || version < 0) {
    return { ok: false, code: version === undefined ? "SCHEMA_VERSION_MISSING" : "SCHEMA_VERSION_UNSUPPORTED", message: "schemaVersion must be a non-negative integer." };
  }
  if (version > CURRENT_SCHEMA_VERSION) {
    return { ok: false, code: "SCHEMA_VERSION_UNSUPPORTED", message: `Schema version ${version} is newer than this SDK supports (${CURRENT_SCHEMA_VERSION}). Upgrade the SDK.` };
  }
  let current = input;
  let v = version;
  while (v < CURRENT_SCHEMA_VERSION) {
    const step = migrations.find((m) => m.from === v);
    if (!step || step.to !== v + 1) {
      return { ok: false, code: "SCHEMA_VERSION_UNSUPPORTED", message: `No migration is available from schema version ${v}.` };
    }
    try {
      const next = step.migrate(structuredClone(current));
      if (!isPlainObject(next) || next.schemaVersion !== step.to) {
        return { ok: false, code: "MIGRATION_FAILED", message: `Migration ${step.from}→${step.to} did not produce schemaVersion ${step.to}.` };
      }
      current = next;
    } catch (e) {
      return { ok: false, code: "MIGRATION_FAILED", message: `Migration ${step.from}→${step.to} failed: ${(e as Error).message}` };
    }
    v = step.to;
  }
  return { ok: true, template: current, from: version };
}

/** Parse, migrate and validate untrusted template input (JSON string or already-parsed value). */
export function parseTemplate(input: unknown, options: ParseOptions = {}): ParseResult {
  const limits = resolveLimits(options.limits);
  let value: unknown = input;
  if (typeof input === "string") {
    if (input.length > limits.maxTemplateBytes) {
      return fail("TEMPLATE_TOO_LARGE", `Template JSON is ${input.length} characters; the limit is ${limits.maxTemplateBytes}.`);
    }
    try {
      value = JSON.parse(input);
    } catch (e) {
      return fail("JSON_INVALID", `Template is not valid JSON: ${(e as Error).message}`);
    }
  }
  if (!isPlainObject(value)) return fail("NOT_OBJECT", "Template must be a JSON object.");

  const migrated = migrateTemplate(value, options.migrations);
  if (!migrated.ok) return fail(migrated.code, migrated.message, "/schemaVersion");

  const result = validateTemplate(migrated.template, options);
  if (!result.valid || !result.template) return { ok: false, issues: result.issues };
  const warnings = result.issues.filter((i) => i.severity === "warning");
  return migrated.from !== CURRENT_SCHEMA_VERSION
    ? { ok: true, template: result.template, warnings, migratedFrom: migrated.from }
    : { ok: true, template: result.template, warnings };
}

/** Serialize a template for export/storage (stable key order as produced by validation). */
export function serializeTemplate(template: LabelTemplate, space?: number): string {
  return JSON.stringify(template, null, space);
}
