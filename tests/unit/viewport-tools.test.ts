import { describe, expect, it } from "vitest";
import { createEditorStore } from "../../src/core/editor/editor-store";
import { labelToScreen, panBy, screenToLabel, zoomAt, type Viewport } from "../../src/core/geometry/viewport";
import { baseTemplate, textEl } from "../fixtures/templates";

describe("panBy (Hand tool, Space+drag, keyboard pan)", () => {
  const vp: Viewport = { zoom: 2.5, panX: 10, panY: -20 };

  it("moves the view by a screen delta and keeps the zoom", () => {
    expect(panBy(vp, 30, -45)).toEqual({ zoom: 2.5, panX: 40, panY: -65 });
  });

  it("returns the same viewport for zero or non-finite deltas (no spurious store updates)", () => {
    expect(panBy(vp, 0, 0)).toBe(vp);
    expect(panBy(vp, Number.NaN, 5)).toBe(vp);
    expect(panBy(vp, 5, Number.POSITIVE_INFINITY)).toBe(vp);
  });

  it("shifts label↔screen mapping by exactly the pan delta at any zoom", () => {
    for (const zoom of [0.25, 1, 4, 16]) {
      const before: Viewport = { zoom, panX: 7, panY: 3 };
      const after = panBy(before, 120, -80);
      const p = { x: 12.5, y: 30 };
      const a = labelToScreen(p, before, "mm");
      const b = labelToScreen(p, after, "mm");
      expect(b.x - a.x).toBeCloseTo(120, 9);
      expect(b.y - a.y).toBeCloseTo(-80, 9);
      // Round trip stays exact, so pointer hits remain aligned after panning.
      const back = screenToLabel(b, after, "mm");
      expect(back.x).toBeCloseTo(p.x, 9);
      expect(back.y).toBeCloseTo(p.y, 9);
    }
  });

  it("composes with zoomAt: zooming after a pan keeps the anchor point fixed", () => {
    const panned = panBy({ zoom: 1, panX: 0, panY: 0 }, -300, -150);
    const anchor = { x: 200, y: 100 };
    const under = screenToLabel(anchor, panned, "mm");
    const zoomed = zoomAt(panned, "mm", 4, anchor);
    const still = screenToLabel(anchor, zoomed, "mm");
    expect(still.x).toBeCloseTo(under.x, 9);
    expect(still.y).toBeCloseTo(under.y, 9);
  });
});

describe("viewport and tool changes are view-only", () => {
  it("never change the template, history, dirty state or listeners' template", () => {
    const store = createEditorStore(baseTemplate([textEl()]));
    const template = store.getState().template;
    let templateChanges = 0;
    store.subscribe(() => {
      if (store.getState().template !== template) templateChanges += 1;
    });
    expect(store.getState().settings.tool).toBe("select");
    for (const tool of ["hand", "pencil", "select", "hand"] as const) store.updateSettings({ tool });
    let v = store.getState().viewport;
    for (let i = 0; i < 50; i += 1) {
      v = panBy(v, 13, -7);
      store.setViewport(v);
    }
    store.setViewport(zoomAt(v, "mm", 6, { x: 50, y: 50 }));
    const s = store.getState();
    expect(s.settings.tool).toBe("hand");
    expect(s.viewport.zoom).toBe(6);
    expect(s.template).toBe(template);
    expect(s.dirty).toBe(false);
    expect(s.canUndo).toBe(false);
    expect(templateChanges).toBe(0);
    // Real edits still record history as before.
    expect(store.dispatch({ type: "moveElements", ids: ["t1"], dx: 1, dy: 0 }).ok).toBe(true);
    expect(store.getState().canUndo).toBe(true);
    expect(store.getState().dirty).toBe(true);
  });
});
