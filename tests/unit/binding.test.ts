import { describe, expect, it } from "vitest";
import { evaluateCondition } from "../../src/core/binding/conditions";
import { formatPlainNumber, formatValue, toDate } from "../../src/core/binding/format";
import { lookupPath, parsePath } from "../../src/core/binding/path";
import { resolveValue } from "../../src/core/binding/resolve";
import type { Condition, FieldValue } from "../../src/core/schema/types";

const record = {
  store: { name: "Lakshmi Silks" },
  product: { name: "Kurta", sku: "KRT-1", width: 44.5, tags: ["cotton", "summer"], empty: "", nil: null, zero: 0, active: true, nested: { deep: { value: "x" } } },
  variants: [{ size: "S" }, { size: "M" }],
  pricing: { mrp: 1299, offerPrice: "999.5" },
  dates: { mfg: "2026-03-07", ts: "2026-03-07T23:30:00Z" },
};

const field = (path: string, extra: Partial<FieldValue> = {}): FieldValue => ({ kind: "field", path, ...extra });

describe("parsePath", () => {
  it("accepts dotted identifiers and indices", () => {
    expect(parsePath("product.sku")).toEqual({ ok: true, segments: ["product", "sku"] });
    expect(parsePath("variants.1.size")).toEqual({ ok: true, segments: ["variants", 1, "size"] });
    expect(parsePath("$meta.batch-no_2")).toEqual({ ok: true, segments: ["$meta", "batch-no_2"] });
  });

  it.each(["", ".a", "a.", "a..b", "0.a", "a.01", "a[0]", "a b", "a.b()", "a.-b", "x".repeat(300), "a.b.c.d.e.f.g.h.i"])("rejects invalid path %j", (p) => {
    const r = parsePath(p);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.code).toBe("BINDING_PATH_INVALID");
  });

  it.each(["__proto__", "a.__proto__", "constructor.prototype", "a.prototype.x", "constructor"])("rejects forbidden path %j", (p) => {
    const r = parsePath(p);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.code).toBe("BINDING_PATH_FORBIDDEN");
  });

  it("rejects non-strings", () => {
    expect(parsePath(42).ok).toBe(false);
    expect(parsePath(null).ok).toBe(false);
  });
});

describe("lookupPath", () => {
  it("walks own properties only", () => {
    expect(lookupPath(record, ["product", "nested", "deep", "value"])).toEqual({ found: true, value: "x" });
    expect(lookupPath(record, ["product", "toString"])).toEqual({ found: false });
    expect(lookupPath(record, ["product", "hasOwnProperty"])).toEqual({ found: false });
    const inherited = Object.create({ secret: "inherited" }) as object;
    expect(lookupPath({ a: inherited }, ["a", "secret"])).toEqual({ found: false });
  });

  it("indexes arrays only by number and objects only by name", () => {
    expect(lookupPath(record, ["variants", 1, "size"])).toEqual({ found: true, value: "M" });
    expect(lookupPath(record, ["variants", 5])).toEqual({ found: false });
    expect(lookupPath(record, ["variants", "length"])).toEqual({ found: false });
    expect(lookupPath({ a: { 0: "x" } }, ["a", 0])).toEqual({ found: false });
  });

  it("never invokes functions", () => {
    let called = false;
    const r = { a: () => { called = true; return "x"; } };
    expect(lookupPath(r, ["a"])).toEqual({ found: false });
    expect(called).toBe(false);
  });
});

describe("resolveValue", () => {
  it("resolves static values and nested fields", () => {
    expect(resolveValue({ kind: "static", value: "Hello" }, record)).toEqual({ status: "ok", text: "Hello", usedFallback: false });
    expect(resolveValue(field("store.name"), record)).toMatchObject({ status: "ok", text: "Lakshmi Silks" });
    expect(resolveValue(field("variants.0.size"), record)).toMatchObject({ status: "ok", text: "S" });
  });

  it("applies prefix and suffix only to present values", () => {
    expect(resolveValue(field("variants.1.size", { prefix: "Size: ", suffix: " (EU)" }), record)).toMatchObject({ text: "Size: M (EU)" });
    expect(resolveValue(field("product.missing", { prefix: "Size: ", fallback: "N/A" }), record)).toEqual({ status: "ok", text: "N/A", usedFallback: true });
  });

  it("treats undefined, null and empty string as missing; keeps 0 and false", () => {
    for (const p of ["product.missing", "product.nil", "product.empty", "nope.deeper"]) {
      expect(resolveValue(field(p), record)).toEqual({ status: "missing", path: p, required: false });
    }
    expect(resolveValue(field("product.zero"), record)).toMatchObject({ status: "ok", text: "0" });
    expect(resolveValue(field("product.active"), record)).toMatchObject({ status: "ok", text: "true" });
    expect(resolveValue(field("product.missing", { required: true }), record)).toMatchObject({ status: "missing", required: true });
    expect(resolveValue(field("product.sku"), undefined)).toMatchObject({ status: "missing" });
  });

  it("rejects non-scalar values, unsafe paths and oversize output", () => {
    expect(resolveValue(field("product.tags"), record).status).toBe("invalid");
    expect(resolveValue(field("product.nested"), record).status).toBe("invalid");
    expect(resolveValue(field("__proto__.polluted"), record).status).toBe("invalid");
    expect(resolveValue(field("product.name"), { product: { name: "x".repeat(50) } }, { maxValueLength: 10 }).status).toBe("invalid");
  });

  it("formats numbers deterministically", () => {
    expect(resolveValue(field("pricing.mrp", { format: { type: "number", decimals: 2, grouping: true } }), record)).toMatchObject({ text: "1,299.00" });
    expect(resolveValue(field("pricing.offerPrice", { format: { type: "number", decimals: 0 } }), record)).toMatchObject({ text: "1000" });
    expect(resolveValue(field("product.name", { format: { type: "number" } }), record).status).toBe("invalid");
  });

  it("does not mutate the record", () => {
    const copy = structuredClone(record);
    resolveValue(field("product.name", { format: { type: "text", case: "upper" } }), record);
    expect(record).toEqual(copy);
  });
});

describe("formatValue", () => {
  it("formats text case and length by code points", () => {
    expect(formatValue("cotton kurta-set", { type: "text", case: "title" })).toEqual({ ok: true, text: "Cotton Kurta-Set" });
    expect(formatValue("Abc", { type: "text", case: "upper" })).toEqual({ ok: true, text: "ABC" });
    expect(formatValue("😀😀😀", { type: "text", maxLength: 2 })).toEqual({ ok: true, text: "😀😀" });
  });

  it("formats plain numbers", () => {
    expect(formatPlainNumber(1234567.891, 2, true)).toBe("1,234,567.89");
    expect(formatPlainNumber(-1234.5, 2, true)).toBe("-1,234.50");
    expect(formatPlainNumber(-0.001, 2, false)).toBe("0.00");
    expect(formatPlainNumber(0.0000001, undefined, false)).toBe("0.0000001");
    expect(formatPlainNumber(12, undefined, false)).toBe("12");
  });

  it("formats currency with code by default and symbol with a locale", () => {
    expect(formatValue(1299, { type: "currency", currency: "INR" })).toEqual({ ok: true, text: "INR 1,299.00" });
    expect(formatValue(1299, { type: "currency", currency: "INR", display: "none", decimals: 0 })).toEqual({ ok: true, text: "1,299" });
    const sym = formatValue(1299, { type: "currency", currency: "INR", locale: "en-IN" });
    expect(sym.ok && sym.text).toBe("₹1,299.00");
    expect(formatValue(1234567, { type: "number", locale: "en-IN", grouping: true })).toEqual({ ok: true, text: "12,34,567" });
    expect(formatValue(1, { type: "currency", currency: "INR", display: "symbol" }).ok).toBe(false);
  });

  it("formats dates in UTC by default", () => {
    expect(formatValue("2026-03-07", { type: "date", pattern: "DD/MM/YYYY" })).toEqual({ ok: true, text: "07/03/2026" });
    expect(formatValue("2026-03-07T23:30:00Z", { type: "date", pattern: "D MMM YY HH:mm" })).toEqual({ ok: true, text: "7 Mar 26 23:30" });
    expect(formatValue(Date.UTC(2026, 0, 31), { type: "date", pattern: "MMMM YYYY" })).toEqual({ ok: true, text: "January 2026" });
    expect(formatValue("07/03/2026", { type: "date", pattern: "YYYY" }).ok).toBe(false);
    expect(formatValue("2026-02-30", { type: "date", pattern: "YYYY-MM-DD" }).ok).toBe(false);
    expect(formatValue("2028-02-29", { type: "date", pattern: "YYYY-MM-DD" })).toEqual({ ok: true, text: "2028-02-29" });
    expect(toDate("not a date")).toBeNull();
  });

  it("rejects non-finite numbers and invalid dates", () => {
    expect(formatValue(Number.NaN, undefined).ok).toBe(false);
    expect(formatValue(new Date("x"), undefined).ok).toBe(false);
    expect(formatValue(10n, undefined)).toEqual({ ok: true, text: "10" });
  });
});

describe("evaluateCondition", () => {
  const cases: [Condition, boolean][] = [
    [{ field: "product.sku", op: "exists" }, true],
    [{ field: "product.nil", op: "exists" }, false],
    [{ field: "product.nil", op: "missing" }, true],
    [{ field: "product.empty", op: "empty" }, true],
    [{ field: "product.tags", op: "notEmpty" }, true],
    [{ field: "pricing.mrp", op: "gt", value: 1000 }, true],
    [{ field: "pricing.offerPrice", op: "lte", value: 999.5 }, true],
    [{ field: "pricing.mrp", op: "eq", value: "1299" }, true],
    [{ field: "product.name", op: "gt", value: 1 }, false],
    [{ field: "product.active", op: "eq", value: true }, true],
    [{ field: "product.name", op: "contains", value: "urt" }, true],
    [{ field: "product.sku", op: "startsWith", value: "KRT" }, true],
    [{ field: "product.missing", op: "neq", value: "x" }, false],
    [{ all: [{ field: "product.sku", op: "exists" }, { not: { field: "product.nil", op: "exists" } }] }, true],
    [{ any: [{ field: "product.missing", op: "exists" }, { field: "pricing.mrp", op: "lt", value: 100 }] }, false],
    [{ field: "__proto__", op: "exists" }, false],
  ];
  it.each(cases)("%j → %s", (c, expected) => {
    expect(evaluateCondition(c, record)).toBe(expected);
  });
});
