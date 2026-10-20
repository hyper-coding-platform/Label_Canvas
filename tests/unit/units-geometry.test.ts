import { describe, expect, it } from "vitest";
import {
  convertLength,
  dotsToUnit,
  formatSvgNumber,
  fromMm,
  ptToUnit,
  roundTo,
  toMm,
  unitToDots,
  unitToPt,
} from "../../src/core/geometry/units";
import {
  boundsOfPoints,
  clamp,
  fitContain,
  normalizeRotation,
  pointInRotatedRect,
  rectContains,
  rectsIntersect,
  rotatePoint,
  rotatedBounds,
  snapToGrid,
  unionRects,
} from "../../src/core/geometry/rect";
import { clampZoom, fitZoom, labelToScreen, screenDeltaToLabel, screenToLabel, zoomAt, MAX_ZOOM, MIN_ZOOM } from "../../src/core/geometry/viewport";

describe("units", () => {
  it("converts between mm, in and px exactly", () => {
    expect(convertLength(25.4, "mm", "in")).toBe(1);
    expect(convertLength(1, "in", "px")).toBeCloseTo(96, 12);
    expect(convertLength(96, "px", "mm")).toBeCloseTo(25.4, 12);
    expect(toMm(2, "in")).toBeCloseTo(50.8, 12);
    expect(fromMm(50.8, "in")).toBeCloseTo(2, 12);
    expect(convertLength(7, "mm", "mm")).toBe(7);
  });

  it("round-trips through every unit pair", () => {
    for (const a of ["mm", "in", "px"] as const)
      for (const b of ["mm", "in", "px"] as const) expect(convertLength(convertLength(123.456, a, b), b, a)).toBeCloseTo(123.456, 9);
  });

  it("converts points and printer dots", () => {
    expect(ptToUnit(72, "in")).toBe(1);
    expect(ptToUnit(12, "px")).toBeCloseTo(16, 12);
    expect(unitToPt(25.4, "mm")).toBeCloseTo(72, 12);
    expect(dotsToUnit(203, 203, "in")).toBe(1);
    expect(unitToDots(25.4, 300, "mm")).toBeCloseTo(300, 9);
  });

  it("rounds half away from zero without binary drift and never returns -0", () => {
    expect(roundTo(1.005, 2)).toBe(1.01);
    expect(roundTo(-1.005, 2)).toBe(-1.01);
    expect(roundTo(2.675, 2)).toBe(2.68);
    expect(Object.is(roundTo(-0.00001, 2), 0)).toBe(true);
    expect(roundTo(Number.NaN, 2)).toBeNaN();
  });

  it("formats SVG numbers with fixed precision and no exponent", () => {
    expect(formatSvgNumber(1)).toBe("1");
    expect(formatSvgNumber(0.1 + 0.2)).toBe("0.3");
    expect(formatSvgNumber(1e-7)).toBe("0");
    expect(formatSvgNumber(-0)).toBe("0");
    expect(formatSvgNumber(12.345678)).toBe("12.3457");
    expect(() => formatSvgNumber(Number.POSITIVE_INFINITY)).toThrow(RangeError);
  });
});

describe("geometry", () => {
  it("normalizes rotation into [0, 360)", () => {
    expect(normalizeRotation(0)).toBe(0);
    expect(normalizeRotation(360)).toBe(0);
    expect(normalizeRotation(-90)).toBe(270);
    expect(normalizeRotation(725)).toBe(5);
    expect(normalizeRotation(Number.NaN)).toBe(0);
  });

  it("rotates points clockwise in screen coordinates", () => {
    const p = rotatePoint({ x: 1, y: 0 }, { x: 0, y: 0 }, 90);
    expect(p.x).toBeCloseTo(0, 12);
    expect(p.y).toBeCloseTo(1, 12);
  });

  it("computes rotated bounding boxes about the centre", () => {
    const r = { x: 0, y: 0, width: 40, height: 10 };
    expect(rotatedBounds(r, 0)).toEqual(r);
    const b90 = rotatedBounds(r, 90);
    expect(b90.x).toBeCloseTo(15, 9);
    expect(b90.y).toBeCloseTo(-15, 9);
    expect(b90.width).toBeCloseTo(10, 9);
    expect(b90.height).toBeCloseTo(40, 9);
    const b45 = rotatedBounds({ x: 0, y: 0, width: 10, height: 10 }, 45);
    expect(b45.width).toBeCloseTo(10 * Math.SQRT2, 9);
  });

  it("hit-tests rotated rects", () => {
    const r = { x: 0, y: 0, width: 40, height: 10 };
    expect(pointInRotatedRect({ x: 20, y: -10 }, r, 90)).toBe(true);
    expect(pointInRotatedRect({ x: 2, y: 5 }, r, 90)).toBe(false);
    expect(pointInRotatedRect({ x: 2, y: 5 }, r, 0)).toBe(true);
  });

  it("intersects, contains, unions, snaps, clamps, fits", () => {
    const a = { x: 0, y: 0, width: 10, height: 10 };
    expect(rectsIntersect(a, { x: 5, y: 5, width: 10, height: 10 })).toBe(true);
    expect(rectsIntersect(a, { x: 10, y: 0, width: 5, height: 5 })).toBe(false);
    expect(rectContains(a, { x: 1, y: 1, width: 9, height: 9 })).toBe(true);
    expect(rectContains(a, { x: 1, y: 1, width: 10, height: 9 })).toBe(false);
    expect(unionRects([a, { x: 20, y: -5, width: 1, height: 1 }])).toEqual({ x: 0, y: -5, width: 21, height: 15 });
    expect(unionRects([])).toBeNull();
    expect(boundsOfPoints([{ x: 3, y: 4 }])).toEqual({ x: 3, y: 4, width: 0, height: 0 });
    expect(snapToGrid(7.4, 2.5)).toBe(7.5);
    expect(snapToGrid(7.4, 0)).toBe(7.4);
    expect(clamp(5, 0, 3)).toBe(3);
    expect(fitContain(2, 1, { x: 0, y: 0, width: 10, height: 10 })).toEqual({ x: 0, y: 2.5, width: 10, height: 5 });
  });
});

describe("viewport transforms", () => {
  it("maps label↔screen and back without changing geometry", () => {
    const vp = { zoom: 2.5, panX: 30, panY: -12 };
    for (const unit of ["mm", "in", "px"] as const) {
      const p = { x: 12.34, y: 5.67 };
      const back = screenToLabel(labelToScreen(p, vp, unit), vp, unit);
      expect(back.x).toBeCloseTo(p.x, 9);
      expect(back.y).toBeCloseTo(p.y, 9);
    }
    // 1 mm at zoom 1 = 96/25.4 CSS px
    expect(labelToScreen({ x: 1, y: 0 }, { zoom: 1, panX: 0, panY: 0 }, "mm").x).toBeCloseTo(96 / 25.4, 12);
    expect(screenDeltaToLabel(96, 0, { zoom: 1, panX: 0, panY: 0 }, "in").x).toBeCloseTo(1, 12);
  });

  it("clamps zoom and fits labels to containers", () => {
    expect(clampZoom(100)).toBe(MAX_ZOOM);
    expect(clampZoom(0)).toBe(MIN_ZOOM);
    expect(clampZoom(Number.NaN)).toBe(1);
    const z = fitZoom({ width: 100, height: 50, unit: "mm" }, { width: 800, height: 600 }, 0);
    expect(100 * (96 / 25.4) * z).toBeCloseTo(800, 6);
  });

  it("zooms about an anchor keeping the anchored label point fixed", () => {
    const vp = { zoom: 1, panX: 10, panY: 10 };
    const anchor = { x: 200, y: 150 };
    const before = screenToLabel(anchor, vp, "mm");
    const next = zoomAt(vp, "mm", 3, anchor);
    const after = screenToLabel(anchor, next, "mm");
    expect(after.x).toBeCloseTo(before.x, 9);
    expect(after.y).toBeCloseTo(before.y, 9);
  });
});
