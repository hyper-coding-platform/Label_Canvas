import type { LengthUnit } from "../schema/types";
import type { Point } from "./rect";
import { convertLength } from "./units";

/**
 * Maps label coordinates (template units) to screen CSS pixels and back.
 * The viewport is purely a view concern: it never changes saved geometry.
 */
export interface Viewport {
  /** Screen CSS pixels per label unit at zoom 1 is derived from the unit; `zoom` multiplies it. */
  readonly zoom: number;
  /** Screen-space offset (CSS px) of the label origin within the canvas container. */
  readonly panX: number;
  readonly panY: number;
}

export const MIN_ZOOM = 0.1;
export const MAX_ZOOM = 16;

/** CSS pixels per template unit at zoom 1 (physical size on a 96-dpi reference screen). */
export function basePixelsPerUnit(unit: LengthUnit): number {
  return convertLength(1, unit, "px");
}

export function pixelsPerUnit(viewport: Viewport, unit: LengthUnit): number {
  return basePixelsPerUnit(unit) * viewport.zoom;
}

export function labelToScreen(point: Point, viewport: Viewport, unit: LengthUnit): Point {
  const s = pixelsPerUnit(viewport, unit);
  return { x: point.x * s + viewport.panX, y: point.y * s + viewport.panY };
}

export function screenToLabel(point: Point, viewport: Viewport, unit: LengthUnit): Point {
  const s = pixelsPerUnit(viewport, unit);
  return { x: (point.x - viewport.panX) / s, y: (point.y - viewport.panY) / s };
}

/** Screen-pixel delta → label-unit delta. */
export function screenDeltaToLabel(dx: number, dy: number, viewport: Viewport, unit: LengthUnit): Point {
  const s = pixelsPerUnit(viewport, unit);
  return { x: dx / s, y: dy / s };
}

export function clampZoom(zoom: number): number {
  if (!Number.isFinite(zoom)) return 1;
  return Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, zoom));
}

/** Zoom that fits a label of `width × height` units into a container of the given CSS size with padding. */
export function fitZoom(
  label: { width: number; height: number; unit: LengthUnit },
  container: { width: number; height: number },
  padding = 24,
): number {
  const base = basePixelsPerUnit(label.unit);
  const availW = Math.max(1, container.width - padding * 2);
  const availH = Math.max(1, container.height - padding * 2);
  return clampZoom(Math.min(availW / (label.width * base), availH / (label.height * base)));
}

/** Move the view by a screen-pixel delta (Hand tool, Space+drag, keyboard). Non-finite deltas are ignored. */
export function panBy(viewport: Viewport, dx: number, dy: number): Viewport {
  if (!Number.isFinite(dx) || !Number.isFinite(dy) || (dx === 0 && dy === 0)) return viewport;
  return { zoom: viewport.zoom, panX: viewport.panX + dx, panY: viewport.panY + dy };
}

/** Zoom around a fixed screen point (e.g. the cursor), keeping that label point under it. */
export function zoomAt(viewport: Viewport, unit: LengthUnit, newZoom: number, anchor: Point): Viewport {
  const zoom = clampZoom(newZoom);
  const labelPoint = screenToLabel(anchor, viewport, unit);
  const s = basePixelsPerUnit(unit) * zoom;
  return { zoom, panX: anchor.x - labelPoint.x * s, panY: anchor.y - labelPoint.y * s };
}
