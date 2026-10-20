/**
 * Pure interaction geometry used by the editor canvas (and available to
 * headless UIs): snapping with alignment guides, and rotation-aware resizing.
 * All values are in template units.
 */
import { rectCenter, rotatePoint, snapToGrid, type Point, type Rect } from "../geometry/rect";

export interface Guide {
  readonly orientation: "vertical" | "horizontal";
  /** x for vertical guides, y for horizontal guides. */
  readonly position: number;
  readonly from: number;
  readonly to: number;
}

export interface SnapOptions {
  readonly canvas: Rect;
  /** Other elements' bounds to align with (already excluding the moving ones). */
  readonly targets: readonly Rect[];
  /** Max distance (template units) at which edges snap to targets. */
  readonly threshold: number;
  readonly gridSize?: number;
  readonly snapToGrid: boolean;
  readonly snapToElements: boolean;
}

export interface SnapResult {
  readonly dx: number;
  readonly dy: number;
  readonly guides: readonly Guide[];
}

function axisSnap(lines: readonly number[], targets: readonly number[], threshold: number): { delta: number; at: number } | null {
  let best: { delta: number; at: number } | null = null;
  for (const l of lines) {
    for (const t of targets) {
      const d = t - l;
      if (Math.abs(d) <= threshold && (best === null || Math.abs(d) < Math.abs(best.delta))) best = { delta: d, at: t };
    }
  }
  return best;
}

/**
 * Snap a moving rect (already offset by the raw drag delta). Element/canvas
 * alignment (edges and centres) takes priority over the grid. Returns the
 * extra correction to apply plus guides to display.
 */
export function snapMove(moving: Rect, o: SnapOptions): SnapResult {
  const xs = [moving.x, moving.x + moving.width / 2, moving.x + moving.width];
  const ys = [moving.y, moving.y + moving.height / 2, moving.y + moving.height];
  const all = o.snapToElements ? [o.canvas, ...o.targets] : [];
  const tx = all.flatMap((r) => [r.x, r.x + r.width / 2, r.x + r.width]);
  const ty = all.flatMap((r) => [r.y, r.y + r.height / 2, r.y + r.height]);
  const guides: Guide[] = [];

  let dx = 0;
  let dy = 0;
  const sx = o.snapToElements ? axisSnap(xs, tx, o.threshold) : null;
  if (sx) {
    dx = sx.delta;
    guides.push({ orientation: "vertical", position: sx.at, from: o.canvas.y, to: o.canvas.y + o.canvas.height });
  } else if (o.snapToGrid && o.gridSize && o.gridSize > 0) {
    dx = snapToGrid(moving.x, o.gridSize) - moving.x;
  }
  const sy = o.snapToElements ? axisSnap(ys, ty, o.threshold) : null;
  if (sy) {
    dy = sy.delta;
    guides.push({ orientation: "horizontal", position: sy.at, from: o.canvas.x, to: o.canvas.x + o.canvas.width });
  } else if (o.snapToGrid && o.gridSize && o.gridSize > 0) {
    dy = snapToGrid(moving.y, o.gridSize) - moving.y;
  }
  return { dx, dy, guides };
}

export type ResizeHandle = "n" | "s" | "e" | "w" | "ne" | "nw" | "se" | "sw";
export const RESIZE_HANDLES: readonly ResizeHandle[] = ["nw", "n", "ne", "e", "se", "s", "sw", "w"];

export interface ResizeOptions {
  /** Element rotation in degrees (clockwise). */
  readonly rotation: number;
  readonly minSize: number;
  /** Preserve aspect ratio (QR codes, shift-drag). */
  readonly keepRatio: boolean;
  readonly gridSize?: number;
  readonly snapToGrid?: boolean;
}

/**
 * Resize `rect` by dragging `handle` by the world-space delta (dx, dy).
 * The edge/corner opposite the handle stays fixed in world space, including
 * for rotated elements.
 */
export function resizeRect(rect: Rect, handle: ResizeHandle, dx: number, dy: number, o: ResizeOptions): Rect {
  const sx = handle.includes("e") ? 1 : handle.includes("w") ? -1 : 0;
  const sy = handle.includes("s") ? 1 : handle.includes("n") ? -1 : 0;
  const local = rotatePoint({ x: dx, y: dy }, { x: 0, y: 0 }, -o.rotation);
  let w = rect.width + sx * local.x;
  let h = rect.height + sy * local.y;
  if (o.snapToGrid && o.gridSize && o.gridSize > 0 && o.rotation === 0) {
    // Snap the moving edges (unrotated only; rotated grid snapping is ill-defined).
    if (sx === 1) w = snapToGrid(rect.x + w, o.gridSize) - rect.x;
    if (sx === -1) w = rect.x + rect.width - snapToGrid(rect.x + rect.width - w, o.gridSize);
    if (sy === 1) h = snapToGrid(rect.y + h, o.gridSize) - rect.y;
    if (sy === -1) h = rect.y + rect.height - snapToGrid(rect.y + rect.height - h, o.gridSize);
  }
  if (o.keepRatio && rect.width > 0 && rect.height > 0) {
    const ratio = rect.width / rect.height;
    if (sx !== 0 && sy !== 0) {
      // Corner: follow the dominant axis.
      if (Math.abs(w / rect.width) >= Math.abs(h / rect.height)) h = w / ratio;
      else w = h * ratio;
    } else if (sx !== 0) h = w / ratio;
    else w = h * ratio;
  }
  w = Math.max(o.minSize, w);
  h = Math.max(o.minSize, h);
  if (o.keepRatio && rect.width > 0 && rect.height > 0) {
    const ratio = rect.width / rect.height;
    if (w / h > ratio) h = w / ratio;
    else w = h * ratio;
  }
  // Centre shift in local space; for keepRatio on an edge handle, grow symmetrically on the other axis.
  const shiftLocal: Point = { x: sx * (w - rect.width) / 2, y: sy * (h - rect.height) / 2 };
  const shift = rotatePoint(shiftLocal, { x: 0, y: 0 }, o.rotation);
  const c = rectCenter(rect);
  const nc = { x: c.x + shift.x, y: c.y + shift.y };
  return { x: nc.x - w / 2, y: nc.y - h / 2, width: w, height: h };
}

/** Align/distribute helpers for multi-selection. Returns per-rect deltas. */
export function alignRects(rects: readonly Rect[], mode: "left" | "hcenter" | "right" | "top" | "vcenter" | "bottom", reference?: Rect): Point[] {
  if (rects.length === 0) return [];
  const ref =
    reference ??
    rects.reduce((acc, r) => ({
      x: Math.min(acc.x, r.x),
      y: Math.min(acc.y, r.y),
      width: Math.max(acc.x + acc.width, r.x + r.width) - Math.min(acc.x, r.x),
      height: Math.max(acc.y + acc.height, r.y + r.height) - Math.min(acc.y, r.y),
    }));
  return rects.map((r) => {
    switch (mode) {
      case "left": return { x: ref.x - r.x, y: 0 };
      case "hcenter": return { x: ref.x + ref.width / 2 - (r.x + r.width / 2), y: 0 };
      case "right": return { x: ref.x + ref.width - (r.x + r.width), y: 0 };
      case "top": return { x: 0, y: ref.y - r.y };
      case "vcenter": return { x: 0, y: ref.y + ref.height / 2 - (r.y + r.height / 2) };
      case "bottom": return { x: 0, y: ref.y + ref.height - (r.y + r.height) };
    }
  });
}
