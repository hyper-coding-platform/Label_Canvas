import { convertLength } from "../geometry/units";
import type { ElementType, LabelElement, LabelTemplate, LengthUnit } from "../schema/types";
import { generateElementId } from "./commands";

/** Default element sizes in millimetres; converted to the template unit on creation. */
const DEFAULT_SIZE_MM: Record<ElementType, { width: number; height: number }> = {
  text: { width: 30, height: 6 },
  barcode: { width: 40, height: 15 },
  qrcode: { width: 18, height: 18 },
  image: { width: 15, height: 15 },
  rect: { width: 20, height: 10 },
  line: { width: 30, height: 1 },
};

/** 1×1 transparent PNG used as the initial image source (valid under the default image policy). */
export const EMPTY_PNG = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAAC0lEQVR4nGNgAAIAAAUAAXpeqz8AAAAASUVORK5CYII=";

export interface CreateElementOptions {
  /** Top-left position in template units. Defaults to a centred placement. */
  readonly x?: number;
  readonly y?: number;
}

/** Create a new, valid element of `type` sized for `template`'s unit and clamped to the canvas. */
export function createElement(template: LabelTemplate, type: ElementType, options: CreateElementOptions = {}): LabelElement {
  const unit: LengthUnit = template.canvas.unit;
  const mm = (v: number) => convertLength(v, "mm", unit);
  const size = DEFAULT_SIZE_MM[type];
  const width = Math.min(mm(size.width), template.canvas.width);
  const height = type === "qrcode" ? Math.min(width, template.canvas.height) : Math.min(mm(size.height), template.canvas.height);
  const w = type === "qrcode" ? Math.min(width, height) : width;
  const x = options.x ?? (template.canvas.width - w) / 2;
  const y = options.y ?? (template.canvas.height - height) / 2;
  const id = generateElementId(new Set(template.elements.map((e) => e.id)), type);
  const base = { id, x, y, width: w, height };
  switch (type) {
    case "text":
      return { ...base, type, content: { kind: "static", value: "Text" }, style: { fontFamily: "sans", fontSize: 10 } };
    case "barcode":
      return { ...base, type, format: "code128", value: { kind: "static", value: "123456" } };
    case "qrcode":
      return { ...base, type, value: { kind: "static", value: "https://example.com" } };
    case "image":
      return { ...base, type, src: EMPTY_PNG, fit: "contain" };
    case "rect":
      return { ...base, type, stroke: "#000000", strokeWidth: mm(0.3) };
    case "line":
      return { ...base, type, strokeWidth: mm(0.3) };
  }
}

export function createBlankTemplate(options: { id?: string; name?: string; width?: number; height?: number; unit?: LengthUnit } = {}): LabelTemplate {
  return {
    schemaVersion: 1,
    id: options.id ?? "untitled",
    name: options.name ?? "Untitled label",
    canvas: { width: options.width ?? 50, height: options.height ?? 30, unit: options.unit ?? "mm" },
    elements: [],
  };
}
