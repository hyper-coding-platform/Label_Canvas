import { JSDOM } from "jsdom";
import { describe, expect, it } from "vitest";
import { convertTemplateUnits } from "../../src/core/editor/commands";
import { createDrawingElement, createElement } from "../../src/core/editor/element-factory";
import { walkNodes, type RenderNode } from "../../src/core/render/nodes";
import { renderLabel } from "../../src/core/render/render-label";
import { SHAPE_KINDS, drawingPath, shapePath } from "../../src/core/render/shapes";
import { STYLE_OVERRIDE_KEYS, applyStyleRules } from "../../src/core/render/style-rules";
import { renderNodeToSvgString } from "../../src/core/render/svg-serializer";
import type { LabelElement, LabelTemplate, StyleRule } from "../../src/core/schema/types";
import { getTemplateFieldPaths } from "../../src/core/validation/validate-data";
import { validateTemplate } from "../../src/core/validation/validate-template";
import { baseTemplate, textEl } from "../fixtures/templates";

const parser = new new JSDOM().window.DOMParser();
const find = (root: RenderNode, pred: (n: RenderNode) => boolean) => {
  const out: RenderNode[] = [];
  walkNodes(root, (n) => pred(n) && out.push(n));
  return out;
};
const group = (root: RenderNode, id: string) => find(root, (n) => n.attrs["data-element-id"] === id)[0];
const codes = (input: unknown) => validateTemplate(input).issues.filter((i) => i.severity === "error").map((i) => i.code);

/** The textile size strip: one box per size, highlighted when it matches the record. */
function sizeStrip(): LabelTemplate {
  const sizes = ["S", "M", "L", "XL"];
  return baseTemplate(
    sizes.map((size, i) =>
      textEl({
        id: `size-${size}`,
        x: 2 + i * 11,
        y: 2,
        width: 10,
        height: 6,
        content: { kind: "static", value: size },
        style: { fontFamily: "sans", fontSize: 9, align: "center", verticalAlign: "middle" },
        border: { width: 0.2, color: "#000000" },
        styleRules: [{ when: { field: "variant.size", op: "eq", value: size }, set: { fill: "#000000", color: "#ffffff", fontWeight: "bold" } }],
      }),
    ),
  );
}

describe("conditional styles", () => {
  it("highlights only the matching size (black box, white bold text)", () => {
    const t = sizeStrip();
    expect(validateTemplate(t).valid).toBe(true);
    const r = renderLabel(t, { variant: { size: "M" } });
    expect(r.ok).toBe(true);
    for (const size of ["S", "M", "L", "XL"]) {
      const g = group(r.root, `size-${size}`)!;
      const box = find(g, (n) => n.tag === "rect")[0]!;
      const text = find(g, (n) => n.tag === "text")[0]!;
      if (size === "M") {
        expect(box.attrs.fill).toBe("#000000");
        expect(text.attrs.fill).toBe("#ffffff");
        expect(text.attrs["font-weight"]).toBe("bold");
      } else {
        expect(box.attrs.fill).toBe("none");
        expect(text.attrs.fill).toBe("#000000");
        expect(text.attrs["font-weight"]).toBeUndefined();
      }
    }
    // No record / unmatched value: nothing is highlighted, and the SVG stays well-formed.
    const none = renderLabel(t, { variant: { size: "XXL" } });
    expect(find(none.root, (n) => n.tag === "rect" && n.attrs.fill === "#000000")).toEqual([]);
    const doc = parser.parseFromString(renderNodeToSvgString(r.root), "image/svg+xml");
    expect(doc.getElementsByTagName("parsererror").length).toBe(0);
  });

  it("applies matching rules in order (later wins) and returns the same element when none match", () => {
    const rules: StyleRule[] = [
      { when: { field: "qty", op: "gt", value: 0 }, set: { fill: "#00ff00", color: "#111111" } },
      { when: { field: "qty", op: "gt", value: 10 }, set: { fill: "#ff0000", opacity: 0.5 } },
    ];
    const el = textEl({ styleRules: rules });
    const big = applyStyleRules(el, { qty: 20 }, "mm");
    expect(big.element).toMatchObject({ background: "#ff0000", style: { color: "#111111" } });
    expect(big.opacity).toBe(0.5);
    expect(applyStyleRules(el, { qty: 5 }, "mm").element).toMatchObject({ background: "#00ff00" });
    const none = applyStyleRules(el, { qty: 0 }, "mm");
    expect(none.element).toBe(el);
    expect(none.opacity).toBeUndefined();
    // Opacity is applied to the element group.
    const r = renderLabel(baseTemplate([el]), { qty: 20, product: { name: "Kurta" } });
    expect(group(r.root, "t1")!.attrs.opacity).toBe("0.5");
  });

  it("gives a hairline border when only a border colour is set, and keeps minFontSize ≤ fontSize", () => {
    const el = textEl({ style: { fontFamily: "sans", fontSize: 10, overflow: "shrink", minFontSize: 8 }, styleRules: [{ when: { field: "x", op: "exists" }, set: { stroke: "#ff0000", fontSize: 6 } }] });
    const { element } = applyStyleRules(el, { x: 1 }, "mm");
    if (element.type !== "text") throw new Error("expected text");
    expect(element.border?.color).toBe("#ff0000");
    expect(element.border!.width).toBeGreaterThan(0);
    expect(element.style).toMatchObject({ fontSize: 6, minFontSize: 6 });
  });

  it("styles shapes, lines, drawings and barcodes with the keys they support", () => {
    const when = { field: "flag", op: "eq", value: true } as const;
    const t = baseTemplate([
      { id: "s", type: "shape", shape: "star", x: 2, y: 2, width: 10, height: 10, styleRules: [{ when, set: { fill: "#ffcc00", stroke: "#000000" } }] },
      { id: "l", type: "line", x: 2, y: 14, width: 20, height: 1, strokeWidth: 0.3, styleRules: [{ when, set: { stroke: "#ff0000", strokeWidth: 0.6 } }] },
      { id: "d", type: "drawing", x: 2, y: 16, width: 10, height: 5, points: [0, 0, 1, 1], strokeWidth: 0.5, styleRules: [{ when, set: { stroke: "#0000ff" } }] },
      { id: "q", type: "qrcode", x: 30, y: 2, width: 15, height: 15, value: { kind: "static", value: "x" }, styleRules: [{ when, set: { color: "#333333", fill: "#eeeeee" } }] },
    ]);
    expect(validateTemplate(t).issues).toEqual([]);
    const r = renderLabel(t, { flag: true });
    const path = (id: string) => find(group(r.root, id)!, (n) => n.tag === "path")[0]!;
    expect(path("s").attrs).toMatchObject({ fill: "#ffcc00", stroke: "#000000" });
    expect(Number(path("s").attrs["stroke-width"])).toBeGreaterThan(0);
    expect(find(group(r.root, "l")!, (n) => n.tag === "line")[0]!.attrs).toMatchObject({ stroke: "#ff0000", "stroke-width": "0.6" });
    expect(path("d").attrs.stroke).toBe("#0000ff");
    expect(path("q").attrs.fill).toBe("#333333");
  });

  it("validates rules strictly: per-type keys, values, counts and conditions", () => {
    const rule = (set: Record<string, unknown>, when: unknown = { field: "a", op: "exists" }) => ({ when, set });
    const withRules = (el: Record<string, unknown>, styleRules: unknown) => baseTemplate([{ ...el, styleRules } as unknown as LabelElement]);
    const rect = { id: "r", type: "rect", x: 1, y: 1, width: 10, height: 10 };
    expect(codes(withRules(rect, [rule({ fontSize: 12 })]))).toContain("UNKNOWN_PROPERTY");
    expect(codes(withRules(rect, [rule({ fill: "red;stroke:url(x)" })]))).toContain("COLOR_INVALID");
    expect(codes(withRules(rect, [rule({ opacity: 1.5 })]))).toContain("NUMBER_OUT_OF_RANGE");
    expect(codes(withRules(rect, [rule({ strokeWidth: 6 })]))).toContain("NUMBER_OUT_OF_RANGE");
    expect(codes(withRules(rect, [rule({ fill: "#000" }, { field: "__proto__.x", op: "exists" })]))).toContain("BINDING_PATH_FORBIDDEN");
    expect(codes(withRules(rect, [rule({ fill: "#000" }, { field: "a", op: "regex", value: ".*" })]))).toContain("CONDITION_INVALID");
    expect(codes(withRules(rect, [{ when: { field: "a", op: "exists" } }]))).toContain("REQUIRED_PROPERTY_MISSING");
    expect(codes(withRules(rect, [{ ...rule({}), extra: 1 }]))).toContain("UNKNOWN_PROPERTY");
    expect(codes(withRules(rect, Array.from({ length: 17 }, () => rule({ fill: "#000" }))))).toContain("TOO_MANY_STYLE_RULES");
    expect(codes(withRules(rect, {}))).toContain("TYPE_MISMATCH");
    const line = { id: "l", type: "line", x: 1, y: 1, width: 10, height: 1, strokeWidth: 0.3 };
    expect(codes(withRules(line, [rule({ strokeWidth: 0 })]))).toContain("NUMBER_OUT_OF_RANGE");
    // Own __proto__ keys from untrusted JSON are unknown properties, never merged.
    expect(codes(withRules(rect, [JSON.parse('{"when":{"field":"a","op":"exists"},"set":{"__proto__":{"fill":"#000"}}}')]))).toContain("UNKNOWN_PROPERTY");
    // Every element type accepts its documented keys.
    for (const type of Object.keys(STYLE_OVERRIDE_KEYS) as (keyof typeof STYLE_OVERRIDE_KEYS)[]) {
      const el = createElement(baseTemplate([]), type);
      const set = Object.fromEntries(STYLE_OVERRIDE_KEYS[type].map((k) => [k, k === "opacity" ? 0.5 : k === "fontWeight" ? "bold" : k === "fontStyle" ? "italic" : k === "fontSize" ? 8 : k === "strokeWidth" ? 0.2 : "#123456"]));
      expect(validateTemplate(baseTemplate([{ ...el, styleRules: [rule(set)] } as LabelElement])).issues, type).toEqual([]);
    }
  });

  it("reports rule fields as template bindings and converts rule stroke widths with units", () => {
    const t = baseTemplate([textEl({ content: { kind: "static", value: "S" }, styleRules: [{ when: { any: [{ field: "variant.size", op: "eq", value: "S" }, { field: "variant.fit", op: "exists" }] }, set: { strokeWidth: 0.5 } }] })]);
    expect(getTemplateFieldPaths(t).sort()).toEqual(["variant.fit", "variant.size"]);
    const inches = convertTemplateUnits(t, "in");
    expect(inches.elements[0]!.styleRules![0]!.set.strokeWidth).toBeCloseTo(0.5 / 25.4, 10);
    expect(validateTemplate(inches).valid).toBe(true);
  });
});

describe("shapes", () => {
  it("validates and renders every shape kind as a closed path inside its box", () => {
    for (const shape of SHAPE_KINDS) {
      const t = baseTemplate([{ id: "s", type: "shape", shape, x: 5, y: 5, width: 20, height: 10, fill: "#cccccc", stroke: "#000000", strokeWidth: 0.5 }]);
      expect(validateTemplate(t).issues, shape).toEqual([]);
      const d = find(renderLabel(t).root, (n) => n.tag === "path")[0]!.attrs.d!;
      expect(d, shape).toMatch(/^M.*z$/);
      // Coordinates (absolute commands only) stay within the stroke-inset box.
      if (shape !== "ellipse") {
        const nums = d.match(/-?\d+(\.\d+)?/g)!.map(Number);
        const xs = nums.filter((_, i) => i % 2 === 0);
        const ys = nums.filter((_, i) => i % 2 === 1);
        expect(Math.min(...xs)).toBeCloseTo(5.25, 4);
        expect(Math.max(...xs)).toBeCloseTo(24.75, 4);
        expect(Math.min(...ys)).toBeCloseTo(5.25, 4);
        expect(Math.max(...ys)).toBeCloseTo(14.75, 4);
      }
    }
    expect(shapePath("ellipse", { x: 0, y: 0, width: 10, height: 4 })).toBe("M0 2a5 2 0 1 0 10 0a5 2 0 1 0 -10 0z");
  });

  it("rejects unknown shapes and invalid stroke widths", () => {
    const shape = (over: Record<string, unknown>) => baseTemplate([{ id: "s", type: "shape", shape: "ellipse", x: 1, y: 1, width: 10, height: 10, ...over } as unknown as LabelElement]);
    expect(codes(shape({ shape: "<script>" }))).toContain("ENUM_INVALID");
    expect(codes(shape({ shape: undefined }))).toContain("REQUIRED_PROPERTY_MISSING");
    expect(codes(shape({ strokeWidth: 6 }))).toContain("NUMBER_OUT_OF_RANGE");
    expect(codes(shape({ points: [0, 0, 1, 1] }))).toContain("UNKNOWN_PROPERTY");
  });
});

describe("drawings (pencil)", () => {
  it("validates point arrays", () => {
    const drawing = (points: unknown, over: Record<string, unknown> = {}) => baseTemplate([{ id: "d", type: "drawing", x: 1, y: 1, width: 10, height: 10, strokeWidth: 0.5, points, ...over } as unknown as LabelElement]);
    expect(codes(drawing([0, 0, 1, 1]))).toEqual([]);
    expect(codes(drawing([0, 0]))).toContain("DRAWING_POINTS_INVALID");
    expect(codes(drawing([0, 0, 1]))).toContain("DRAWING_POINTS_INVALID");
    expect(codes(drawing([0, 0, 1.5, 1]))).toContain("DRAWING_POINTS_INVALID");
    expect(codes(drawing([0, 0, Number.NaN, 1]))).toContain("DRAWING_POINTS_INVALID");
    expect(codes(drawing([0, 0, "1", 1]))).toContain("DRAWING_POINTS_INVALID");
    expect(codes(drawing("0,0,1,1"))).toContain("DRAWING_POINTS_INVALID");
    expect(codes(drawing(new Array(4002).fill(0.5)))).toContain("DRAWING_POINTS_INVALID");
    expect(codes(drawing([0, 0, 1, 1], { strokeWidth: 0 }))).toContain("NUMBER_OUT_OF_RANGE");
    expect(codes(drawing([0, 0, 1, 1], { strokeWidth: undefined }))).toContain("REQUIRED_PROPERTY_MISSING");
  });

  it("renders a smoothed round-capped path through the normalized points", () => {
    expect(drawingPath([0, 0, 0.5, 1, 1, 0], { x: 0, y: 0, width: 11, height: 11 }, 1)).toBe("M0.5 0.5Q5.5 10.5 8 5.5L10.5 0.5");
    const t = baseTemplate([{ id: "d", type: "drawing", x: 1, y: 1, width: 10, height: 10, strokeWidth: 0.5, stroke: "#ff0000", points: [0, 0, 1, 1] }]);
    const p = find(renderLabel(t).root, (n) => n.tag === "path")[0]!;
    expect(p.attrs).toMatchObject({ fill: "none", stroke: "#ff0000", "stroke-linecap": "round", "stroke-linejoin": "round" });
  });

  it("builds a valid, simplified drawing from a raw pencil stroke", () => {
    const t = baseTemplate([]);
    // A straight line sampled densely plus a corner: collinear samples are dropped.
    const raw = [...Array.from({ length: 50 }, (_, i) => ({ x: 5 + i * 0.2, y: 5 })), { x: 15, y: 15 }];
    const el = createDrawingElement(t, raw, { strokeWidth: 0.5, stroke: "#ff0000" })!;
    expect(el.points.length / 2).toBe(3);
    expect(el).toMatchObject({ type: "drawing", x: 4.75, y: 4.75, width: 10.5, height: 10.5, stroke: "#ff0000", strokeWidth: 0.5 });
    expect(el.points.every((v) => v >= 0 && v <= 1)).toBe(true);
    expect(validateTemplate(baseTemplate([el])).issues).toEqual([]);
    // Horizontal stroke: zero vertical span is centred, the box still has the stroke's height.
    const flat = createDrawingElement(t, [{ x: 1, y: 3 }, { x: 9, y: 3 }], { strokeWidth: 0.4 })!;
    expect(flat.height).toBe(0.4);
    expect(flat.points).toEqual([0, 0.5, 1, 0.5]);
    expect(flat.stroke).toBeUndefined();
    // Clicks without movement and invalid stroke widths produce nothing.
    expect(createDrawingElement(t, [{ x: 1, y: 1 }], { strokeWidth: 0.5 })).toBeNull();
    expect(createDrawingElement(t, [{ x: 1, y: 1 }, { x: 1, y: 1 }], { strokeWidth: 0.5 })).toBeNull();
    expect(createDrawingElement(t, raw, { strokeWidth: 0 })).toBeNull();
    // Very long strokes are capped at maxPoints.
    const zigzag = Array.from({ length: 5000 }, (_, i) => ({ x: i * 0.01, y: i % 2 }));
    expect(createDrawingElement(t, zigzag, { strokeWidth: 0.2, maxPoints: 100 })!.points.length).toBe(200);
  });
});
