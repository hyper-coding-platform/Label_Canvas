import type { Point } from "../geometry/rect";
import { convertLength } from "../geometry/units";
import { DEFAULT_LIMITS } from "../schema/limits";
import type { DrawingElement, ElementType, LabelElement, LabelTemplate, LengthUnit } from "../schema/types";
import { generateElementId } from "./commands";

/** Default element sizes in millimetres; converted to the template unit on creation. */
const DEFAULT_SIZE_MM: Record<ElementType, { width: number; height: number }> = {
  text: { width: 30, height: 6 },
  barcode: { width: 40, height: 15 },
  qrcode: { width: 18, height: 18 },
  image: { width: 15, height: 15 },
  rect: { width: 20, height: 10 },
  line: { width: 30, height: 1 },
  shape: { width: 12, height: 12 },
  drawing: { width: 20, height: 8 },
};

/** Gentle wave used for a drawing created from the toolbar (pencil strokes use `createDrawingElement`). */
const DEFAULT_DRAWING_POINTS = [0, 0.5, 0.25, 0, 0.5, 0.5, 0.75, 1, 1, 0.5];

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
    case "shape":
      return { ...base, type, shape: "ellipse", stroke: "#000000", strokeWidth: mm(0.3) };
    case "drawing":
      return { ...base, type, points: DEFAULT_DRAWING_POINTS, strokeWidth: mm(0.5) };
  }
}

export interface DrawingStrokeOptions {
  /** Template units. */
  readonly strokeWidth: number;
  readonly stroke?: string | undefined;
  /** Points closer than this to the simplified line are dropped (template units). Default: stroke width / 4. */
  readonly tolerance?: number | undefined;
  /** Default 2000 (`DEFAULT_LIMITS.maxDrawingPoints`). */
  readonly maxPoints?: number | undefined;
}

/** Ramer–Douglas–Peucker simplification (iterative: no recursion depth on long strokes). */
function simplify(pts: readonly Point[], tolerance: number): Point[] {
  if (pts.length <= 2) return [...pts];
  const keep = new Uint8Array(pts.length);
  keep[0] = 1;
  keep[pts.length - 1] = 1;
  const stack: [number, number][] = [[0, pts.length - 1]];
  while (stack.length) {
    const [a, b] = stack.pop()!;
    const p = pts[a]!;
    const q = pts[b]!;
    const len = Math.hypot(q.x - p.x, q.y - p.y);
    let max = -1;
    let at = -1;
    for (let i = a + 1; i < b; i += 1) {
      const r = pts[i]!;
      const d = len === 0 ? Math.hypot(r.x - p.x, r.y - p.y) : Math.abs((q.x - p.x) * (p.y - r.y) - (p.x - r.x) * (q.y - p.y)) / len;
      if (d > max) {
        max = d;
        at = i;
      }
    }
    if (max > tolerance && at > 0) {
      keep[at] = 1;
      stack.push([a, at], [at, b]);
    }
  }
  return pts.filter((_, i) => keep[i] === 1);
}

/**
 * Turn a freehand stroke (label coordinates) into a valid `drawing` element:
 * simplified, bounded by its points plus the stroke, with points normalized
 * to that box. Returns `null` when fewer than two distinct points remain.
 */
export function createDrawingElement(template: LabelTemplate, points: readonly Point[], options: DrawingStrokeOptions): DrawingElement | null {
  const sw = options.strokeWidth;
  if (!(sw > 0) || !Number.isFinite(sw)) return null;
  const clean = points.filter((p) => Number.isFinite(p.x) && Number.isFinite(p.y));
  let pts = simplify(clean, options.tolerance ?? sw / 4);
  const max = options.maxPoints ?? DEFAULT_LIMITS.maxDrawingPoints;
  // Keep the shape when a stroke is still too long: sample evenly, always keeping the end point.
  if (pts.length > max) pts = Array.from({ length: max }, (_, i) => pts[Math.round((i * (pts.length - 1)) / (max - 1))]!);
  if (pts.length < 2) return null;
  const minX = Math.min(...pts.map((p) => p.x));
  const minY = Math.min(...pts.map((p) => p.y));
  const spanX = Math.max(...pts.map((p) => p.x)) - minX;
  const spanY = Math.max(...pts.map((p) => p.y)) - minY;
  if (spanX === 0 && spanY === 0) return null;
  const r4 = (v: number) => Math.round(v * 1e4) / 1e4;
  const norm = (v: number, min: number, span: number) => (span === 0 ? 0.5 : Math.min(1, Math.max(0, r4((v - min) / span))));
  const id = generateElementId(new Set(template.elements.map((e) => e.id)), "drawing");
  return {
    id,
    type: "drawing",
    x: r4(minX - sw / 2),
    y: r4(minY - sw / 2),
    width: r4(spanX + sw),
    height: r4(spanY + sw),
    points: pts.flatMap((p) => [norm(p.x, minX, spanX), norm(p.y, minY, spanY)]),
    strokeWidth: sw,
    ...(options.stroke && options.stroke !== "#000000" ? { stroke: options.stroke } : {}),
  };
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
