import type { Condition, DataRecord } from "../schema/types";
import { isScalarValue, scalarToText, toNumber } from "./format";
import { lookupPath, parsePath } from "./path";

/**
 * Evaluate a declarative condition. Conditions are validated (depth, size,
 * paths) before rendering; evaluation additionally guards depth so a
 * hand-built unvalidated condition cannot recurse without bound.
 *
 * Semantics:
 * - `exists`: field present and not `undefined`/`null`.
 * - `missing`: negation of `exists`.
 * - `empty`: missing, `""`, or empty array.
 * - `notEmpty`: negation of `empty`.
 * - `eq`/`neq`: numeric comparison when both sides are numeric, otherwise string comparison.
 * - `gt`/`gte`/`lt`/`lte`: numeric only; non-numeric or missing → false.
 * - `contains`/`startsWith`: case-sensitive string tests; missing → false.
 */
export function evaluateCondition(condition: Condition, record: DataRecord | undefined, depth = 0): boolean {
  if (depth > 16) return false;
  if ("all" in condition) return condition.all.every((c) => evaluateCondition(c, record, depth + 1));
  if ("any" in condition) return condition.any.some((c) => evaluateCondition(c, record, depth + 1));
  if ("not" in condition) return !evaluateCondition(condition.not, record, depth + 1);

  const parsed = parsePath(condition.field);
  if (!parsed.ok) return false;
  const found = record === undefined ? { found: false as const } : lookupPath(record, parsed.segments);
  const value = found.found ? found.value : undefined;
  const exists = value !== undefined && value !== null;
  const empty = !exists || value === "" || (Array.isArray(value) && value.length === 0);

  switch (condition.op) {
    case "exists":
      return exists;
    case "missing":
      return !exists;
    case "empty":
      return empty;
    case "notEmpty":
      return !empty;
  }

  if (!exists || !isScalarValue(value)) return false;
  const expected = condition.value;
  const leftNum = toNumber(value);
  const rightNum = typeof expected === "boolean" ? null : toNumber(expected);
  const leftText = scalarToText(value);
  if (!leftText.ok) return false;
  const rightText = typeof expected === "boolean" ? (expected ? "true" : "false") : String(expected);

  switch (condition.op) {
    case "eq":
      return leftNum !== null && rightNum !== null ? leftNum === rightNum : leftText.text === rightText;
    case "neq":
      return leftNum !== null && rightNum !== null ? leftNum !== rightNum : leftText.text !== rightText;
    case "gt":
      return leftNum !== null && rightNum !== null && leftNum > rightNum;
    case "gte":
      return leftNum !== null && rightNum !== null && leftNum >= rightNum;
    case "lt":
      return leftNum !== null && rightNum !== null && leftNum < rightNum;
    case "lte":
      return leftNum !== null && rightNum !== null && leftNum <= rightNum;
    case "contains":
      return leftText.text.includes(rightText);
    case "startsWith":
      return leftText.text.startsWith(rightText);
  }
}

/** Every field path referenced by a condition tree. */
export function conditionPaths(condition: Condition, out: Set<string> = new Set(), depth = 0): Set<string> {
  if (depth > 16) return out;
  if ("all" in condition) condition.all.forEach((c) => conditionPaths(c, out, depth + 1));
  else if ("any" in condition) condition.any.forEach((c) => conditionPaths(c, out, depth + 1));
  else if ("not" in condition) conditionPaths(condition.not, out, depth + 1);
  else out.add(condition.field);
  return out;
}
