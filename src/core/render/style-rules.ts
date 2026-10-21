/**
 * Conditional styles: per-record appearance overrides (DECISIONS D-023).
 * Rules are declarative (condition + flat override); evaluation is pure and
 * produces a new element object, never mutating the (frozen) template.
 */
import { evaluateCondition } from "../binding/conditions";
import { ptToUnit } from "../geometry/units";
import type { DataRecord, ElementType, LabelElement, LengthUnit, StyleOverride, StyleRule, TextStyle } from "../schema/types";

/** Override keys each element type accepts. Validation rejects any other key. */
export const STYLE_OVERRIDE_KEYS: Readonly<Record<ElementType, readonly (keyof StyleOverride)[]>> = Object.freeze({
  text: ["fill", "color", "stroke", "strokeWidth", "fontWeight", "fontStyle", "fontSize", "opacity"],
  barcode: ["fill", "color", "opacity"],
  qrcode: ["fill", "color", "opacity"],
  image: ["opacity"],
  rect: ["fill", "stroke", "strokeWidth", "opacity"],
  shape: ["fill", "stroke", "strokeWidth", "opacity"],
  line: ["stroke", "strokeWidth", "opacity"],
  drawing: ["stroke", "strokeWidth", "opacity"],
});

export interface StyledElement {
  readonly element: LabelElement;
  /** Group opacity from the matched rules; `undefined` = unchanged. */
  readonly opacity: number | undefined;
}

/** Merge every rule whose condition holds for the record (later rules win). `null` when none match. */
function matchedOverride(rules: readonly StyleRule[], record: DataRecord | undefined): StyleOverride | null {
  const out: StyleOverride[] = [];
  for (const rule of rules) if (evaluateCondition(rule.when, record)) out.push(rule.set);
  return out.length === 0 ? null : out.length === 1 ? out[0]! : Object.assign({}, ...out);
}

/**
 * Apply an element's `styleRules` for one record. Returns the element itself
 * (same identity) when it has no rules or none match.
 */
export function applyStyleRules(el: LabelElement, record: DataRecord | undefined, unit: LengthUnit): StyledElement {
  const o = el.styleRules && el.styleRules.length > 0 ? matchedOverride(el.styleRules, record) : null;
  if (!o) return { element: el, opacity: undefined };
  // Setting only a colour on an element without a stroke gives a visible hairline.
  const hairline = Math.min(ptToUnit(0.75, unit), Math.min(el.width, el.height) / 2);
  const strokeWidth = (current: number | undefined) => o.strokeWidth ?? (o.stroke !== undefined && !current ? hairline : current);
  let element: LabelElement;
  switch (el.type) {
    case "text": {
      const style: { -readonly [K in keyof TextStyle]: TextStyle[K] } = { ...el.style };
      if (o.color !== undefined) style.color = o.color;
      if (o.fontWeight !== undefined) style.fontWeight = o.fontWeight;
      if (o.fontStyle !== undefined) style.fontStyle = o.fontStyle;
      if (o.fontSize !== undefined) {
        style.fontSize = o.fontSize;
        if (style.minFontSize !== undefined && style.minFontSize > o.fontSize) style.minFontSize = o.fontSize;
      }
      const next: Record<string, unknown> = { ...el, style };
      if (o.fill !== undefined) next.background = o.fill;
      if (o.stroke !== undefined || o.strokeWidth !== undefined) {
        const width = strokeWidth(el.border?.width) ?? 0;
        if (width > 0) next.border = { ...el.border, width, color: o.stroke ?? el.border?.color ?? "#000000" };
        else delete next.border;
      }
      element = next as unknown as LabelElement;
      break;
    }
    case "barcode":
    case "qrcode":
      element = { ...el, ...(o.fill !== undefined ? { background: o.fill } : {}), ...(o.color !== undefined ? { color: o.color } : {}) };
      break;
    case "rect":
    case "shape": {
      const sw = strokeWidth(el.strokeWidth);
      element = { ...el, ...(o.fill !== undefined ? { fill: o.fill } : {}), ...(o.stroke !== undefined ? { stroke: o.stroke } : {}), ...(sw !== undefined ? { strokeWidth: sw } : {}) };
      break;
    }
    case "line":
    case "drawing":
      element = { ...el, ...(o.stroke !== undefined ? { stroke: o.stroke } : {}), ...(o.strokeWidth !== undefined ? { strokeWidth: o.strokeWidth } : {}) };
      break;
    case "image":
      element = el;
      break;
  }
  return { element, opacity: o.opacity };
}
