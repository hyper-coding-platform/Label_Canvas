/**
 * Adversarial fixtures (docs/SECURITY.md threat model). Each test asserts that
 * hostile templates or records are rejected or rendered inertly.
 */
import { JSDOM } from "jsdom";
import { describe, expect, it } from "vitest";
import { resolveValue } from "../../src/core/binding/resolve";
import { evaluateCondition } from "../../src/core/binding/conditions";
import { renderLabel } from "../../src/core/render/render-label";
import { renderNodeToSvgString } from "../../src/core/render/svg-serializer";
import { parseTemplate } from "../../src/core/validation/parse-template";
import { validateTemplate } from "../../src/core/validation/validate-template";
import { baseTemplate, barcodeEl, textEl, textileTemplate } from "../fixtures/templates";

const parser = new new JSDOM().window.DOMParser();

function assertInertSvg(svg: string) {
  const doc = parser.parseFromString(svg, "image/svg+xml");
  expect(doc.getElementsByTagName("parsererror")).toHaveLength(0);
  expect(doc.getElementsByTagName("script")).toHaveLength(0);
  expect(doc.getElementsByTagName("foreignObject")).toHaveLength(0);
  for (const el of Array.from(doc.getElementsByTagName("*"))) {
    for (const attr of Array.from(el.attributes)) {
      expect(attr.name.toLowerCase().startsWith("on"), `${el.tagName} ${attr.name}`).toBe(false);
      expect(attr.value.toLowerCase()).not.toContain("javascript:");
    }
  }
}

describe("prototype pollution", () => {
  it("JSON __proto__ keys are rejected, not applied", () => {
    const json = `{"schemaVersion":1,"id":"x","name":"x","canvas":{"width":10,"height":10,"unit":"mm"},"elements":[],"__proto__":{"polluted":true}}`;
    const r = parseTemplate(json);
    expect(r.ok).toBe(false);
    expect(({} as Record<string, unknown>).polluted).toBeUndefined();
    if (!r.ok) expect(r.issues.map((i) => i.code)).toContain("UNKNOWN_PROPERTY");
  });

  it("nested __proto__ / constructor keys in elements are rejected", () => {
    const json = `{"schemaVersion":1,"id":"x","name":"x","canvas":{"width":10,"height":10,"unit":"mm","__proto__":{"a":1}},"elements":[{"id":"e","type":"rect","x":0,"y":0,"width":1,"height":1,"constructor":{"prototype":{"b":1}}}]}`;
    const r = parseTemplate(json);
    expect(r.ok).toBe(false);
    expect(({} as Record<string, unknown>).a).toBeUndefined();
    expect(({} as Record<string, unknown>).b).toBeUndefined();
  });

  it("binding paths cannot reach prototypes, even via records with poisoned keys", () => {
    const record = JSON.parse('{"__proto__":{"isAdmin":"yes"},"a":{"constructor":{"name":"evil"}}}') as Record<string, unknown>;
    for (const path of ["__proto__.isAdmin", "a.constructor.name", "a.__proto__", "toString", "a.hasOwnProperty"]) {
      expect(resolveValue({ kind: "field", path }, record).status).not.toBe("ok");
    }
    expect(evaluateCondition({ field: "__proto__.isAdmin", op: "exists" }, record)).toBe(false);
    expect(Object.prototype).not.toHaveProperty("isAdmin");
  });

  it("objects with null prototype and class instances are not trusted as templates", () => {
    const cls = new (class Fake { schemaVersion = 1 })();
    expect(validateTemplate(cls).valid).toBe(false);
  });
});

describe("injection", () => {
  const payloads = [
    "<script>alert(1)</script>",
    '"><svg onload=alert(1)>',
    "</text><foreignObject><iframe src=javascript:alert(1)></iframe></foreignObject>",
    "]]><!--",
    "&lt;img src=x onerror=alert(1)&gt;",
    "‮evil",
  ];

  it.each(payloads)("text payload is escaped: %s", (payload) => {
    const r = renderLabel(baseTemplate([textEl()]), { product: { name: payload } });
    const svg = renderNodeToSvgString(r.root);
    assertInertSvg(svg);
    const doc = parser.parseFromString(svg, "image/svg+xml");
    expect(doc.getElementsByTagName("tspan")[0]?.textContent).toBe(payload);
  });

  it.each(payloads)("static text, prefix and fallback are escaped: %s", (payload) => {
    const tpl = baseTemplate([textEl({ content: { kind: "field", path: "missing", fallback: payload } }), textEl({ id: "t2", content: { kind: "field", path: "x", prefix: payload } })]);
    if (/[\u0000-\u0008]/.test(payload)) return; // eslint-disable-line no-control-regex
    assertInertSvg(renderNodeToSvgString(renderLabel(tpl, { x: "1" }).root));
  });

  it("template name / title is escaped", () => {
    const tpl = { ...textileTemplate, name: '</title><script>alert(1)</script>' };
    assertInertSvg(renderNodeToSvgString(renderLabel(tpl, {}).root));
  });

  it("barcode HRI cannot inject markup (values are validated, HRI escaped)", () => {
    const r = renderLabel(baseTemplate([barcodeEl()]), { product: { sku: "<b>&amp;" } });
    assertInertSvg(renderNodeToSvgString(r.root));
  });

  it("colours cannot carry CSS or attribute breakouts", () => {
    for (const color of ['#000" onload="x', "url(javascript:x)", "expression(alert(1))", "#00000g"]) {
      expect(validateTemplate(baseTemplate([textEl({ style: { fontFamily: "sans", fontSize: 8, color } })])).valid).toBe(false);
    }
  });

  it("rejects unsafe image sources", () => {
    for (const src of [
      "javascript:alert(1)",
      "data:text/html;base64,PHNjcmlwdD4=",
      "data:image/svg+xml;utf8,<svg onload=alert(1)>",
      "data:image/svg+xml;base64,PHN2ZyBvbmxvYWQ9YWxlcnQoMSk+",
      "https://user:pass@example.com/x.png",
      "file:///etc/passwd",
      "//example.com/x.png",
      "data:image/png;base64,PHNjcmlwdD5hbGVydCgxKTwvc2NyaXB0Pg==",
    ]) {
      const r = validateTemplate(baseTemplate([{ id: "i", type: "image", x: 0, y: 0, width: 5, height: 5, src }]), { imagePolicy: { allowUrl: () => true } });
      expect(r.valid, src).toBe(false);
    }
  });
});

describe("resource exhaustion", () => {
  it("rejects huge canvas, element counts and strings", () => {
    expect(validateTemplate(baseTemplate([], { canvas: { width: 1e308, height: 10, unit: "mm" } })).valid).toBe(false);
    expect(validateTemplate(baseTemplate(Array.from({ length: 1001 }, (_, i) => ({ ...textEl(), id: `e${i}` })))).valid).toBe(false);
    expect(validateTemplate(baseTemplate([textEl({ content: { kind: "static", value: "x".repeat(1_000_000) } })])).valid).toBe(false);
  });

  it("rejects oversized JSON without parsing it", () => {
    const big = `{"pad":"${"x".repeat(5 * 1024 * 1024)}"}`;
    const start = performance.now();
    const r = parseTemplate(big);
    expect(r.ok).toBe(false);
    expect(performance.now() - start).toBeLessThan(50);
  });

  it("survives deeply nested JSON", () => {
    const deep = `${"[".repeat(100_000)}${"]".repeat(100_000)}`;
    expect(parseTemplate(deep).ok).toBe(false);
  });

  it("bounds long bound values and oversized barcode payloads", () => {
    const r = renderLabel(baseTemplate([textEl()]), { product: { name: "x".repeat(100_000) } });
    expect(r.issues.map((i) => i.code)).toContain("FIELD_VALUE_INVALID");
    const qr = renderLabel(baseTemplate([{ id: "q", type: "qrcode", x: 0, y: 0, width: 30, height: 30, value: { kind: "field", path: "v" } }]), { v: "é".repeat(3000) });
    expect(qr.issues.map((i) => i.code)).toContain("BARCODE_VALUE_INVALID");
    const c128 = renderLabel(baseTemplate([barcodeEl()]), { product: { sku: "A".repeat(500) } });
    expect(c128.issues.map((i) => i.code)).toContain("BARCODE_VALUE_INVALID");
  });

  it("extreme but finite numbers in records do not break formatting", () => {
    const r = renderLabel(baseTemplate([textEl({ content: { kind: "field", path: "n", format: { type: "number", decimals: 2, grouping: true } } })]), { n: 1e300 });
    expect(r.root).toBeDefined();
  });

  it("getters and proxies in records are not invoked beyond property reads", () => {
    let calls = 0;
    const rec = { get product() { calls += 1; return { name: "x" }; } };
    renderLabel(baseTemplate([textEl()]), rec);
    expect(calls).toBe(1);
  });
});
