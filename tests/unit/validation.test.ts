import { describe, expect, it } from "vitest";
import { validateTemplate } from "../../src/core/validation/validate-template";
import { parseTemplate, migrateTemplate, serializeTemplate, type TemplateMigration } from "../../src/core/validation/parse-template";
import { createFontRegistry } from "../../src/core/schema/fonts";
import { baseTemplate, barcodeEl, qrEl, textEl, textileTemplate } from "../fixtures/templates";

const PNG_1x1 = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";

function codes(input: unknown, options = {}) {
  return validateTemplate(input, options).issues.map((i) => `${i.severity}:${i.code}`);
}

/** Clone a template and apply a mutation to a plain-object copy. */
function mutate(fn: (t: Record<string, any>) => void, base: unknown = baseTemplate([textEl(), barcodeEl()])): unknown {
  const copy = structuredClone(base) as Record<string, any>;
  fn(copy);
  return copy;
}

describe("validateTemplate: valid templates", () => {
  it("accepts a realistic template and returns a normalized copy", () => {
    const r = validateTemplate(textileTemplate);
    expect(r.issues).toEqual([]);
    expect(r.valid).toBe(true);
    expect(r.template).toEqual(textileTemplate);
    expect(r.template).not.toBe(textileTemplate);
  });

  it("accepts every element type", () => {
    const t = baseTemplate([
      textEl(),
      barcodeEl({ id: "b2", format: "ean13", value: { kind: "static", value: "590123412345" } }),
      qrEl(),
      { id: "img", type: "image", x: 0, y: 0, width: 5, height: 5, src: PNG_1x1, fit: "cover", alt: "Logo" },
      { id: "r", type: "rect", x: 0, y: 0, width: 50, height: 30, stroke: "#000", strokeWidth: 0.3, cornerRadius: 2 },
      { id: "l", type: "line", x: 0, y: 9, width: 50, height: 1, strokeWidth: 0.2, dash: "dashed" },
    ]);
    const r = validateTemplate(t);
    expect(r.issues).toEqual([]);
    expect(r.valid).toBe(true);
  });

  it("does not mutate the input", () => {
    const t = structuredClone(textileTemplate);
    validateTemplate(t);
    expect(t).toEqual(textileTemplate);
  });
});

describe("validateTemplate: rejects", () => {
  it.each<[string, unknown, string]>([
    ["non-object", 42, "NOT_OBJECT"],
    ["array", [], "NOT_OBJECT"],
    ["missing version", mutate((t) => delete t.schemaVersion), "SCHEMA_VERSION_MISSING"],
    ["future version", mutate((t) => (t.schemaVersion = 2)), "SCHEMA_VERSION_UNSUPPORTED"],
    ["string version", mutate((t) => (t.schemaVersion = "1")), "SCHEMA_VERSION_UNSUPPORTED"],
    ["missing id", mutate((t) => delete t.id), "REQUIRED_PROPERTY_MISSING"],
    ["bad id", mutate((t) => (t.id = "has space")), "STRING_INVALID"],
    ["empty name", mutate((t) => (t.name = "")), "STRING_EMPTY"],
    ["control chars in name", mutate((t) => (t.name = "a\u0000b")), "STRING_CONTROL_CHARACTERS"],
    ["unknown top-level property", mutate((t) => (t.script = "x")), "UNKNOWN_PROPERTY"],
    ["invalid unit", mutate((t) => (t.canvas.unit = "cm")), "UNIT_INVALID"],
    ["NaN width", mutate((t) => (t.canvas.width = Number.NaN)), "NUMBER_NOT_FINITE"],
    ["zero height", mutate((t) => (t.canvas.height = 0)), "NUMBER_OUT_OF_RANGE"],
    ["huge canvas", mutate((t) => (t.canvas.width = 3000)), "CANVAS_TOO_LARGE"],
    ["tiny canvas", mutate((t) => { t.canvas.width = 0.01; t.elements = []; }), "CANVAS_TOO_SMALL"],
    ["bad dpi", mutate((t) => (t.canvas.printerDpi = 203.5)), "NUMBER_NOT_INTEGER"],
    ["elements not array", mutate((t) => (t.elements = {})), "TYPE_MISMATCH"],
    ["unknown element type", mutate((t) => (t.elements[0].type = "video")), "ELEMENT_TYPE_UNKNOWN"],
    ["duplicate ids", mutate((t) => (t.elements[1].id = t.elements[0].id)), "ELEMENT_ID_DUPLICATE"],
    ["missing element id", mutate((t) => delete t.elements[0].id), "REQUIRED_PROPERTY_MISSING"],
    ["negative width", mutate((t) => (t.elements[0].width = -1)), "NUMBER_OUT_OF_RANGE"],
    ["infinite x", mutate((t) => (t.elements[0].x = Number.POSITIVE_INFINITY)), "NUMBER_NOT_FINITE"],
    ["rotation 360", mutate((t) => (t.elements[0].rotation = 360)), "ROTATION_INVALID"],
    ["negative rotation", mutate((t) => (t.elements[0].rotation = -10)), "ROTATION_INVALID"],
    ["far out of bounds", mutate((t) => (t.elements[0].x = 500)), "ELEMENT_FAR_OUT_OF_BOUNDS"],
    ["bad colour", mutate((t) => (t.elements[0].style.color = "red")), "COLOR_INVALID"],
    ["css injection colour", mutate((t) => (t.elements[0].style.color = "#000;fill:url(x)")), "COLOR_INVALID"],
    ["bad font id", mutate((t) => (t.elements[0].style.fontFamily = "Arial; x")), "STRING_INVALID"],
    ["font size zero", mutate((t) => (t.elements[0].style.fontSize = 0)), "NUMBER_OUT_OF_RANGE"],
    ["font size huge", mutate((t) => (t.elements[0].style.fontSize = 10000)), "NUMBER_OUT_OF_RANGE"],
    ["bad enum", mutate((t) => (t.elements[0].style.align = "justify")), "ENUM_INVALID"],
    ["unknown style prop", mutate((t) => (t.elements[0].style.onclick = "x")), "UNKNOWN_PROPERTY"],
    ["text too long", mutate((t) => (t.elements[0].content = { kind: "static", value: "x".repeat(2001) })), "TEXT_TOO_LONG"],
    ["bad source kind", mutate((t) => (t.elements[0].content = { kind: "expr", value: "1+1" })), "ENUM_INVALID"],
    ["forbidden path", mutate((t) => (t.elements[0].content = { kind: "field", path: "__proto__.x" })), "BINDING_PATH_FORBIDDEN"],
    ["invalid path", mutate((t) => (t.elements[0].content = { kind: "field", path: "a[0]" })), "BINDING_PATH_INVALID"],
    ["unsupported barcode", mutate((t) => (t.elements[1].format = "pdf417")), "BARCODE_FORMAT_UNSUPPORTED"],
    ["qrcode as barcode format", mutate((t) => (t.elements[1].format = "qrcode")), "BARCODE_FORMAT_UNSUPPORTED"],
    ["invalid static barcode", mutate((t) => { t.elements[1].format = "ean13"; t.elements[1].value = { kind: "static", value: "5901234123458" }; }), "BARCODE_VALUE_INVALID"],
    ["bad format type", mutate((t) => (t.elements[0].content = { kind: "field", path: "a", format: { type: "eval" } })), "ENUM_INVALID"],
    ["bad currency", mutate((t) => (t.elements[0].content = { kind: "field", path: "a", format: { type: "currency", currency: "inr" } })), "STRING_INVALID"],
    ["symbol without locale", mutate((t) => (t.elements[0].content = { kind: "field", path: "a", format: { type: "currency", currency: "INR", display: "symbol" } })), "FORMAT_INVALID"],
    ["bad locale", mutate((t) => (t.elements[0].content = { kind: "field", path: "a", format: { type: "number", locale: "../../etc" } })), "STRING_INVALID"],
    ["too many decimals", mutate((t) => (t.elements[0].content = { kind: "field", path: "a", format: { type: "number", decimals: 12 } })), "NUMBER_OUT_OF_RANGE"],
    ["bad condition op", mutate((t) => (t.elements[0].condition = { field: "a", op: "regex", value: ".*" })), "CONDITION_INVALID"],
    ["condition with extra keys", mutate((t) => (t.elements[0].condition = { all: [{ field: "a", op: "exists" }], any: [] })), "CONDITION_INVALID"],
    ["empty all", mutate((t) => (t.elements[0].condition = { all: [] })), "CONDITION_INVALID"],
    ["condition object value", mutate((t) => (t.elements[0].condition = { field: "a", op: "eq", value: { $gt: 1 } })), "CONDITION_INVALID"],
    ["image svg data uri", mutate((t) => t.elements.push({ id: "i", type: "image", x: 0, y: 0, width: 5, height: 5, src: "data:image/svg+xml;base64,PHN2Zy8+" })), "IMAGE_SOURCE_INVALID"],
    ["image javascript url", mutate((t) => t.elements.push({ id: "i", type: "image", x: 0, y: 0, width: 5, height: 5, src: "javascript:alert(1)" })), "IMAGE_URL_NOT_ALLOWED"],
    ["image http url", mutate((t) => t.elements.push({ id: "i", type: "image", x: 0, y: 0, width: 5, height: 5, src: "http://example.com/a.png" })), "IMAGE_URL_NOT_ALLOWED"],
    ["image https url without policy", mutate((t) => t.elements.push({ id: "i", type: "image", x: 0, y: 0, width: 5, height: 5, src: "https://example.com/a.png" })), "IMAGE_URL_NOT_ALLOWED"],
    ["image content mismatch", mutate((t) => t.elements.push({ id: "i", type: "image", x: 0, y: 0, width: 5, height: 5, src: "data:image/png;base64,R0lGODlhAQABAAAAACw=" })), "IMAGE_CONTENT_MISMATCH"],
    ["line without strokeWidth", mutate((t) => t.elements.push({ id: "l", type: "line", x: 0, y: 0, width: 5, height: 1 })), "REQUIRED_PROPERTY_MISSING"],
    ["qr quiet zone out of range", mutate((t) => t.elements.push({ ...qrEl(), quietZone: 50 })), "NUMBER_OUT_OF_RANGE"],
  ])("%s", (_name, input, code) => {
    const r = validateTemplate(input);
    expect(r.valid).toBe(false);
    expect(r.template).toBeUndefined();
    expect(r.issues.map((i) => i.code)).toContain(code);
  });

  it("enforces element count limits", () => {
    const els = Array.from({ length: 11 }, (_, i) => ({ ...textEl(), id: `e${i}` }));
    expect(codes(baseTemplate(els), { limits: { maxElements: 10 } })).toContain("error:TOO_MANY_ELEMENTS");
  });

  it("limits condition depth and node count", () => {
    let c: unknown = { field: "a", op: "exists" };
    for (let i = 0; i < 6; i += 1) c = { not: c };
    expect(codes(mutate((t) => (t.elements[0].condition = c)))).toContain("error:CONDITION_TOO_DEEP");
    const wide = { any: Array.from({ length: 32 }, () => ({ all: [{ field: "a", op: "exists" }, { field: "b", op: "exists" }] })) };
    expect(codes(mutate((t) => (t.elements[0].condition = wide)))).toContain("error:CONDITION_TOO_COMPLEX");
  });

  it("reports all issues, with element ids and JSON pointer paths", () => {
    const r = validateTemplate(mutate((t) => { t.elements[0].width = -1; t.elements[1].format = "x"; }));
    expect(r.issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ path: "/elements/0/width", elementId: "t1", severity: "error" }),
        expect.objectContaining({ path: "/elements/1/format", elementId: "b1", code: "BARCODE_FORMAT_UNSUPPORTED" }),
      ]),
    );
  });
});

describe("validateTemplate: warnings do not invalidate", () => {
  it("warns about partially and fully out-of-canvas elements", () => {
    expect(codes(mutate((t) => (t.elements[0].x = 40)))).toContain("warning:ELEMENT_EXCEEDS_CANVAS");
    expect(codes(mutate((t) => (t.elements[0].x = 51)))).toContain("warning:ELEMENT_OUTSIDE_CANVAS");
    expect(validateTemplate(mutate((t) => (t.elements[0].x = 40))).valid).toBe(true);
  });

  it("warns about unknown fonts and accepts registered ones", () => {
    const t = mutate((t) => (t.elements[0].style.fontFamily = "brand"));
    expect(codes(t)).toContain("warning:FONT_UNKNOWN");
    const fonts = createFontRegistry([{ id: "brand", label: "Brand", stack: '"Brand Sans", sans-serif', metrics: { narrow: 0.25, lower: 0.5, upper: 0.65, digit: 0.55, space: 0.28, wide: 0.85, other: 0.6, ascent: 0.8, boldFactor: 1.05 } }]);
    expect(codes(t, { fonts })).toEqual([]);
  });

  it("warns on small QR quiet zones and ignored bearer bars", () => {
    expect(codes(mutate((t) => t.elements.push({ ...qrEl(), quietZone: 2 })))).toContain("warning:QR_QUIET_ZONE_SMALL");
    expect(codes(mutate((t) => (t.elements[1].bearer = "frame")))).toContain("warning:BEARER_IGNORED");
  });

  it("accepts https images only when the host policy allows them", () => {
    const t = mutate((t) => t.elements.push({ id: "i", type: "image", x: 0, y: 0, width: 5, height: 5, src: "https://cdn.example.com/logo.png" }));
    expect(validateTemplate(t, { imagePolicy: { allowUrl: (u: URL) => u.hostname === "cdn.example.com" } }).valid).toBe(true);
    expect(validateTemplate(t, { imagePolicy: { allowUrl: (u: URL) => u.hostname === "other.example" } }).valid).toBe(false);
  });
});

describe("parseTemplate", () => {
  it("parses, validates and round-trips JSON", () => {
    const json = serializeTemplate(textileTemplate, 2);
    const r = parseTemplate(json);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.template).toEqual(textileTemplate);
      // Canonical key order: serialization of a parsed template is a fixed point.
      const canonical = serializeTemplate(r.template, 2);
      const again = parseTemplate(canonical);
      expect(again.ok && serializeTemplate(again.template, 2)).toBe(canonical);
    }
  });

  it.each<[string, string, string]>([
    ["invalid JSON", "{", "JSON_INVALID"],
    ["JSON array", "[]", "NOT_OBJECT"],
    ["JSON null", "null", "NOT_OBJECT"],
    ["newer version", JSON.stringify({ ...textileTemplate, schemaVersion: 99 }), "SCHEMA_VERSION_UNSUPPORTED"],
    ["missing version", JSON.stringify({ ...textileTemplate, schemaVersion: undefined }), "SCHEMA_VERSION_MISSING"],
  ])("rejects %s", (_n, json, code) => {
    const r = parseTemplate(json);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.issues[0]?.code).toBe(code);
  });

  it("rejects oversized input before parsing", () => {
    const r = parseTemplate(" ".repeat(101), { limits: { maxTemplateBytes: 100 } });
    expect(!r.ok && r.issues[0]?.code).toBe("TEMPLATE_TOO_LARGE");
  });
});

describe("migrations", () => {
  const v0: TemplateMigration = {
    from: 0,
    to: 1,
    migrate: (t) => {
      const { size, ...rest } = t as { size: { w: number; h: number } } & Record<string, unknown>;
      return { ...rest, schemaVersion: 1, canvas: { width: size.w, height: size.h, unit: "mm" } };
    },
  };
  const legacy = { schemaVersion: 0, id: "old", name: "Old", size: { w: 40, h: 20 }, elements: [] };

  it("applies explicit migrations step by step and reports the source version", () => {
    const r = parseTemplate(legacy, { migrations: [v0] });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.migratedFrom).toBe(0);
      expect(r.template.canvas).toEqual({ width: 40, height: 20, unit: "mm" });
    }
    expect(legacy).toHaveProperty("size"); // input untouched
  });

  it("never reinterprets versions without a migration", () => {
    const r = parseTemplate(legacy);
    expect(!r.ok && r.issues[0]?.code).toBe("SCHEMA_VERSION_UNSUPPORTED");
  });

  it("reports failing or misbehaving migrations", () => {
    expect(migrateTemplate(legacy, [{ from: 0, to: 1, migrate: () => { throw new Error("boom"); } }])).toMatchObject({ ok: false, code: "MIGRATION_FAILED" });
    expect(migrateTemplate(legacy, [{ from: 0, to: 1, migrate: (t) => t }])).toMatchObject({ ok: false, code: "MIGRATION_FAILED" });
    expect(migrateTemplate(legacy, [{ from: 0, to: 2, migrate: (t) => t }])).toMatchObject({ ok: false, code: "SCHEMA_VERSION_UNSUPPORTED" });
    expect(migrateTemplate({ schemaVersion: -1 })).toMatchObject({ ok: false });
  });

  it("migrated output must still pass validation", () => {
    const bad: TemplateMigration = { from: 0, to: 1, migrate: (t) => ({ ...t, schemaVersion: 1 }) };
    const r = parseTemplate(legacy, { migrations: [bad] });
    expect(r.ok).toBe(false);
  });
});
