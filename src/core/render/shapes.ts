/**
 * Path geometry for `shape` and `drawing` elements. Pure functions of the
 * element box: outlines are defined in a unit square and scaled, so resizing
 * an element never distorts anything but its own box.
 */
import type { Point, Rect } from "../geometry/rect";
import { formatSvgNumber as n } from "../geometry/units";
import type { ShapeKind } from "../schema/types";

export const SHAPE_KINDS: readonly ShapeKind[] = ["ellipse", "triangle", "diamond", "pentagon", "hexagon", "octagon", "star", "arrow"];

/** Regular polygon (or star when `inner` is set) normalized so its bounding box is the unit square. */
function radial(count: number, startDeg: number, inner?: number): Point[] {
  const steps = inner === undefined ? count : count * 2;
  const pts: Point[] = [];
  for (let i = 0; i < steps; i += 1) {
    const r = inner !== undefined && i % 2 === 1 ? inner : 1;
    const a = ((startDeg + (360 / steps) * i) * Math.PI) / 180;
    pts.push({ x: r * Math.cos(a), y: r * Math.sin(a) });
  }
  const minX = Math.min(...pts.map((p) => p.x));
  const minY = Math.min(...pts.map((p) => p.y));
  const w = Math.max(...pts.map((p) => p.x)) - minX;
  const h = Math.max(...pts.map((p) => p.y)) - minY;
  return pts.map((p) => ({ x: (p.x - minX) / w, y: (p.y - minY) / h }));
}

function unitOutline(kind: Exclude<ShapeKind, "ellipse">): Point[] {
  switch (kind) {
    case "triangle":
      return [{ x: 0.5, y: 0 }, { x: 1, y: 1 }, { x: 0, y: 1 }];
    case "diamond":
      return [{ x: 0.5, y: 0 }, { x: 1, y: 0.5 }, { x: 0.5, y: 1 }, { x: 0, y: 0.5 }];
    case "pentagon":
      return radial(5, -90);
    case "hexagon":
      return radial(6, 0);
    case "octagon":
      return radial(8, 22.5);
    case "star":
      return radial(5, -90, 0.382);
    case "arrow":
      return [{ x: 0, y: 0.3 }, { x: 0.6, y: 0.3 }, { x: 0.6, y: 0 }, { x: 1, y: 0.5 }, { x: 0.6, y: 1 }, { x: 0.6, y: 0.7 }, { x: 0, y: 0.7 }];
  }
}

/** Box inset by half the stroke width, so strokes stay inside the element (like `rect`). */
function inset(box: Rect, strokeWidth: number): Rect {
  const s = Math.min(strokeWidth, box.width, box.height) / 2;
  return { x: box.x + s, y: box.y + s, width: box.width - s * 2, height: box.height - s * 2 };
}

/** SVG path data for a shape filling `box`. */
export function shapePath(kind: ShapeKind, box: Rect, strokeWidth = 0): string {
  const b = inset(box, strokeWidth);
  if (kind === "ellipse") {
    const rx = b.width / 2;
    const ry = b.height / 2;
    return `M${n(b.x)} ${n(b.y + ry)}a${n(rx)} ${n(ry)} 0 1 0 ${n(b.width)} 0a${n(rx)} ${n(ry)} 0 1 0 ${n(-b.width)} 0z`;
  }
  return `${unitOutline(kind)
    .map((p, i) => `${i === 0 ? "M" : "L"}${n(b.x + p.x * b.width)} ${n(b.y + p.y * b.height)}`)
    .join("")}z`;
}

/** Smoothed SVG path through normalized drawing points (quadratic curves through segment midpoints). */
export function drawingPath(points: readonly number[], box: Rect, strokeWidth: number): string {
  const b = inset(box, strokeWidth);
  const pts: Point[] = [];
  for (let i = 0; i + 1 < points.length; i += 2) pts.push({ x: b.x + points[i]! * b.width, y: b.y + points[i + 1]! * b.height });
  if (pts.length === 0) return "";
  let d = `M${n(pts[0]!.x)} ${n(pts[0]!.y)}`;
  for (let i = 1; i < pts.length - 1; i += 1) {
    const p = pts[i]!;
    const q = pts[i + 1]!;
    d += `Q${n(p.x)} ${n(p.y)} ${n((p.x + q.x) / 2)} ${n((p.y + q.y) / 2)}`;
  }
  const last = pts[pts.length - 1]!;
  return `${d}L${n(last.x)} ${n(last.y)}`;
}
