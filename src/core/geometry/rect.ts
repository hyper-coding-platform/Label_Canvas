export interface Point {
  readonly x: number;
  readonly y: number;
}

export interface Rect {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

/** Normalize degrees to [0, 360). */
export function normalizeRotation(degrees: number): number {
  if (!Number.isFinite(degrees)) return 0;
  const r = degrees % 360;
  const n = r < 0 ? r + 360 : r;
  return n === 360 || Object.is(n, -0) ? 0 : n;
}

export function rectCenter(rect: Rect): Point {
  return { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 };
}

/** Rotate `point` clockwise (screen coordinates, +y down) by `degrees` around `center`. */
export function rotatePoint(point: Point, center: Point, degrees: number): Point {
  if (degrees === 0) return point;
  const rad = (degrees * Math.PI) / 180;
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);
  const dx = point.x - center.x;
  const dy = point.y - center.y;
  return { x: center.x + dx * cos - dy * sin, y: center.y + dx * sin + dy * cos };
}

/** The four corners of a rect rotated about its centre (clockwise from top-left). */
export function rotatedCorners(rect: Rect, degrees: number): readonly [Point, Point, Point, Point] {
  const c = rectCenter(rect);
  const r = rect.x + rect.width;
  const b = rect.y + rect.height;
  return [
    rotatePoint({ x: rect.x, y: rect.y }, c, degrees),
    rotatePoint({ x: r, y: rect.y }, c, degrees),
    rotatePoint({ x: r, y: b }, c, degrees),
    rotatePoint({ x: rect.x, y: b }, c, degrees),
  ];
}

/** Axis-aligned bounding box of a rect rotated about its centre. */
export function rotatedBounds(rect: Rect, degrees: number): Rect {
  const rot = normalizeRotation(degrees);
  if (rot === 0) return rect;
  return boundsOfPoints(rotatedCorners(rect, rot));
}

export function boundsOfPoints(points: readonly Point[]): Rect {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const p of points) {
    if (p.x < minX) minX = p.x;
    if (p.y < minY) minY = p.y;
    if (p.x > maxX) maxX = p.x;
    if (p.y > maxY) maxY = p.y;
  }
  return { x: minX, y: minY, width: maxX - minX, height: maxY - minY };
}

export function unionRects(rects: readonly Rect[]): Rect | null {
  if (rects.length === 0) return null;
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const r of rects) {
    minX = Math.min(minX, r.x);
    minY = Math.min(minY, r.y);
    maxX = Math.max(maxX, r.x + r.width);
    maxY = Math.max(maxY, r.y + r.height);
  }
  return { x: minX, y: minY, width: maxX - minX, height: maxY - minY };
}

export function rectsIntersect(a: Rect, b: Rect): boolean {
  return a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;
}

/** True when `inner` lies entirely within `outer` (with tolerance `epsilon`). */
export function rectContains(outer: Rect, inner: Rect, epsilon = 1e-9): boolean {
  return (
    inner.x >= outer.x - epsilon &&
    inner.y >= outer.y - epsilon &&
    inner.x + inner.width <= outer.x + outer.width + epsilon &&
    inner.y + inner.height <= outer.y + outer.height + epsilon
  );
}

export function pointInRect(p: Point, rect: Rect): boolean {
  return p.x >= rect.x && p.x <= rect.x + rect.width && p.y >= rect.y && p.y <= rect.y + rect.height;
}

/** Hit test against a rotated rect. */
export function pointInRotatedRect(p: Point, rect: Rect, degrees: number): boolean {
  const local = rotatePoint(p, rectCenter(rect), -normalizeRotation(degrees));
  return pointInRect(local, rect);
}

export function clamp(value: number, min: number, max: number): number {
  return value < min ? min : value > max ? max : value;
}

export function snapToGrid(value: number, grid: number): number {
  if (!(grid > 0)) return value;
  return Math.round(value / grid) * grid;
}

/** Fit a `w × h` box into `box`, preserving aspect ratio. */
export function fitContain(w: number, h: number, box: Rect): Rect {
  const scale = Math.min(box.width / w, box.height / h);
  const fw = w * scale;
  const fh = h * scale;
  return { x: box.x + (box.width - fw) / 2, y: box.y + (box.height - fh) / 2, width: fw, height: fh };
}
