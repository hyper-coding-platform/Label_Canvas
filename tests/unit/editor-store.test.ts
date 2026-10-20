import { describe, expect, it } from "vitest";
import { applyCommand, convertTemplateUnits, generateElementId } from "../../src/core/editor/commands";
import { createBlankTemplate, createElement } from "../../src/core/editor/element-factory";
import { createEditorStore } from "../../src/core/editor/editor-store";
import { alignRects, resizeRect, snapMove } from "../../src/core/editor/interactions";
import { TemplateValidationError } from "../../src/core/errors";
import { rotatedCorners } from "../../src/core/geometry/rect";
import { validateTemplate } from "../../src/core/validation/validate-template";
import { baseTemplate, barcodeEl, textEl, textileTemplate } from "../fixtures/templates";

function clockStore(t = baseTemplate([textEl(), barcodeEl()])) {
  let time = 0;
  const store = createEditorStore(t, { now: () => time });
  return { store, tick: (ms: number) => (time += ms) };
}

describe("commands", () => {
  it("adds elements with unique ids and selects them", () => {
    const t = baseTemplate([textEl()]);
    const r = applyCommand(t, { type: "addElements", elements: [textEl()] });
    expect(r.template.elements.map((e) => e.id)).toEqual(["t1", "text-1"]);
    expect(r.select).toEqual(["text-1"]);
  });

  it("keeps identity of untouched elements (structural sharing)", () => {
    const t = baseTemplate([textEl(), barcodeEl()]);
    const r = applyCommand(t, { type: "moveElements", ids: ["t1"], dx: 1, dy: 0 });
    expect(r.template.elements[1]).toBe(t.elements[1]);
    expect(r.template.elements[0]).not.toBe(t.elements[0]);
    expect(applyCommand(t, { type: "moveElements", ids: ["t1"], dx: 0, dy: 0 }).template).toBe(t);
  });

  it("does not move locked elements", () => {
    const t = baseTemplate([textEl({ locked: true })]);
    expect(applyCommand(t, { type: "moveElements", ids: ["t1"], dx: 5, dy: 5 }).template).toBe(t);
  });

  it("patches remove properties set to undefined", () => {
    const t = baseTemplate([textEl({ rotation: 45 })]);
    const r = applyCommand(t, { type: "updateElement", id: "t1", patch: { rotation: undefined } });
    expect(r.template.elements[0]).not.toHaveProperty("rotation");
  });

  it("duplicates after the original with offset and unlocked", () => {
    const t = baseTemplate([textEl({ locked: true, name: "Title" }), barcodeEl()]);
    const r = applyCommand(t, { type: "duplicateElements", ids: ["t1"], offset: 2 });
    expect(r.template.elements.map((e) => e.id)).toEqual(["t1", "text-1", "b1"]);
    expect(r.template.elements[1]).toMatchObject({ x: 4, y: 4, name: "Title copy" });
    expect(r.template.elements[1]).not.toHaveProperty("locked");
  });

  it("reorders front/back/forward/backward/index", () => {
    const t = baseTemplate([textEl({ id: "a" }), textEl({ id: "b" }), textEl({ id: "c" })]);
    const order = (to: Parameters<typeof applyCommand>[1] & { type: "reorderElement" }) => applyCommand(t, to).template.elements.map((e) => e.id).join("");
    expect(order({ type: "reorderElement", id: "a", to: "front" })).toBe("bca");
    expect(order({ type: "reorderElement", id: "c", to: "back" })).toBe("cab");
    expect(order({ type: "reorderElement", id: "a", to: "forward" })).toBe("bac");
    expect(order({ type: "reorderElement", id: "a", to: "backward" })).toBe("abc");
    expect(order({ type: "reorderElement", id: "c", to: 1 })).toBe("acb");
  });

  it("converts units for all lengths, keeping points", () => {
    const t = convertTemplateUnits(textileTemplate, "in");
    expect(t.canvas.width).toBeCloseTo(50 / 25.4, 12);
    const name = t.elements.find((e) => e.id === "name")!;
    expect(name.x).toBeCloseTo(3 / 25.4, 12);
    expect(name.type === "text" && name.style.fontSize).toBe(9);
    expect(validateTemplate(t).valid).toBe(true);
  });

  it("unit conversion applies explicit canvas values in the new unit", () => {
    const t = applyCommand(textileTemplate, { type: "setCanvas", patch: { unit: "in", width: 4, height: 6 }, convertUnits: true }).template;
    expect(t.canvas).toMatchObject({ unit: "in", width: 4, height: 6 });
    expect(t.elements[0]!.x).toBeCloseTo(3 / 25.4, 12);
  });

  it("generates the smallest free id", () => {
    expect(generateElementId(new Set(["text-1", "text-3"]), "text")).toBe("text-2");
  });

  it("creates valid elements of every type in every unit", () => {
    for (const unit of ["mm", "in", "px"] as const) {
      const blank = createBlankTemplate({ unit, width: unit === "mm" ? 50 : unit === "in" ? 2 : 200, height: unit === "mm" ? 30 : unit === "in" ? 1.2 : 120 });
      let t = blank;
      for (const type of ["text", "barcode", "qrcode", "image", "rect", "line"] as const) {
        t = { ...t, elements: [...t.elements, createElement(t, type)] };
      }
      const r = validateTemplate(t);
      expect(r.issues.filter((i) => i.severity === "error"), unit).toEqual([]);
    }
  });
});

describe("EditorStore", () => {
  it("rejects invalid initial templates with a structured error", () => {
    expect(() => createEditorStore(baseTemplate([textEl({ width: 0 })]))).toThrow(TemplateValidationError);
  });

  it("validates every command and rejects invalid results without changing state", () => {
    const { store } = clockStore();
    const before = store.getState();
    const r = store.dispatch({ type: "updateElement", id: "t1", patch: { width: -5 } });
    expect(r.ok).toBe(false);
    expect(store.getState().template).toBe(before.template);
    expect(store.getState().lastRejection?.[0]?.code).toBe("NUMBER_OUT_OF_RANGE");
    expect(store.getState().canUndo).toBe(false);
    // Custom UIs cannot inject unknown properties either.
    expect(store.dispatch({ type: "updateElement", id: "t1", patch: { onclick: "x" } as never }).ok).toBe(false);
    // Barcode correctness checks apply to edits.
    expect(store.dispatch({ type: "updateElement", id: "b1", patch: { format: "ean13", value: { kind: "static", value: "123" } } }).ok).toBe(false);
  });

  it("undo/redo restores templates and selection; new edits clear redo", () => {
    const { store, tick } = clockStore();
    const t0 = store.getState().template;
    store.select(["t1"]);
    store.dispatch({ type: "moveElements", ids: ["t1"], dx: 1, dy: 0 });
    tick(5000);
    store.dispatch({ type: "removeElements", ids: ["t1"] });
    expect(store.getState().template.elements.map((e) => e.id)).toEqual(["b1"]);
    expect(store.undo()).toBe(true);
    expect(store.getState().template.elements[0]!.x).toBe(3);
    expect(store.getState().selection).toEqual(["t1"]);
    expect(store.undo()).toBe(true);
    expect(store.getState().template).toBe(t0);
    expect(store.undo()).toBe(false);
    expect(store.redo()).toBe(true);
    expect(store.getState().template.elements[0]!.x).toBe(3);
    store.dispatch({ type: "moveElements", ids: ["b1"], dx: 1, dy: 1 });
    expect(store.getState().canRedo).toBe(false);
  });

  it("coalesces same-key edits within the window into one history entry", () => {
    const { store, tick } = clockStore();
    for (let i = 0; i < 10; i += 1) {
      store.dispatch({ type: "moveElements", ids: ["t1"], dx: 0.1, dy: 0 }, { coalesceKey: "nudge" });
      tick(100);
    }
    tick(2000);
    store.dispatch({ type: "moveElements", ids: ["t1"], dx: 0.1, dy: 0 }, { coalesceKey: "nudge" });
    store.undo();
    expect(store.getState().template.elements[0]!.x).toBeCloseTo(3, 9);
    store.undo();
    expect(store.getState().template.elements[0]!.x).toBe(2);
    expect(store.getState().canUndo).toBe(false);
  });

  it("caps history length", () => {
    let time = 0;
    const store = createEditorStore(baseTemplate([textEl()]), { historyLimit: 5, now: () => (time += 10_000) });
    for (let i = 0; i < 20; i += 1) store.dispatch({ type: "moveElements", ids: ["t1"], dx: 0.01, dy: 0 });
    let undos = 0;
    while (store.undo()) undos += 1;
    expect(undos).toBe(5);
  });

  it("tracks dirty state against the saved baseline, including undo back to it", () => {
    const { store } = clockStore();
    expect(store.getState().dirty).toBe(false);
    store.dispatch({ type: "moveElements", ids: ["t1"], dx: 1, dy: 0 });
    expect(store.getState().dirty).toBe(true);
    store.undo();
    expect(store.getState().dirty).toBe(false);
    store.redo();
    store.markSaved();
    expect(store.getState().dirty).toBe(false);
  });

  it("external replacement validates, clears history and keeps surviving selection", () => {
    const { store } = clockStore();
    store.select(["t1", "b1"]);
    store.dispatch({ type: "moveElements", ids: ["t1"], dx: 1, dy: 0 });
    expect(store.replaceTemplate(baseTemplate([textEl({ width: -1 })])).ok).toBe(false);
    const r = store.replaceTemplate(baseTemplate([barcodeEl()]), { markSaved: true });
    expect(r.ok).toBe(true);
    expect(store.getState().canUndo).toBe(false);
    expect(store.getState().selection).toEqual(["b1"]);
    expect(store.getState().dirty).toBe(false);
  });

  it("selection modes ignore unknown ids", () => {
    const { store } = clockStore();
    store.select(["t1", "nope"]);
    expect(store.getState().selection).toEqual(["t1"]);
    store.select(["b1"], "add");
    expect(store.getState().selection).toEqual(["t1", "b1"]);
    store.select(["t1"], "toggle");
    expect(store.getState().selection).toEqual(["b1"]);
  });

  it("notifies subscribers and stops after destroy", () => {
    const { store } = clockStore();
    let calls = 0;
    const unsub = store.subscribe(() => (calls += 1));
    store.select(["t1"]);
    store.select(["t1"]); // no-op: no notification
    expect(calls).toBe(1);
    unsub();
    store.select(["b1"]);
    expect(calls).toBe(1);
    store.subscribe(() => (calls += 1));
    store.destroy();
    expect(store.dispatch({ type: "removeElements", ids: ["t1"] }).ok).toBe(false);
    expect(calls).toBe(1);
  });

  it("view state changes do not create history or mark dirty", () => {
    const { store } = clockStore();
    store.setViewport({ zoom: 2, panX: 10, panY: 10 });
    store.updateSettings({ gridSize: 0.5 });
    expect(store.getState().canUndo).toBe(false);
    expect(store.getState().dirty).toBe(false);
  });
});

describe("interactions", () => {
  const canvas = { x: 0, y: 0, width: 50, height: 30 };

  it("snaps to element edges/centres before the grid and reports guides", () => {
    const r = snapMove({ x: 9.7, y: 3.2, width: 10, height: 5 }, { canvas, targets: [{ x: 20, y: 20, width: 5, height: 5 }], threshold: 0.5, gridSize: 1, snapToGrid: true, snapToElements: true });
    expect(r.dx).toBeCloseTo(0.3, 9); // right edge 19.7 → 20
    expect(r.dy).toBeCloseTo(-0.2, 9); // grid
    expect(r.guides).toEqual([{ orientation: "vertical", position: 20, from: 0, to: 30 }]);
    const centred = snapMove({ x: 19.8, y: 0, width: 10, height: 5 }, { canvas, targets: [], threshold: 0.5, snapToGrid: false, snapToElements: true });
    expect(centred.dx).toBeCloseTo(0.2, 9); // centre 24.8 → canvas centre 25
  });

  it("resizes from each handle keeping the opposite side fixed", () => {
    const r = { x: 10, y: 10, width: 20, height: 10 };
    const o = { rotation: 0, minSize: 1, keepRatio: false };
    expect(resizeRect(r, "se", 5, 2, o)).toEqual({ x: 10, y: 10, width: 25, height: 12 });
    expect(resizeRect(r, "nw", 5, 2, o)).toEqual({ x: 15, y: 12, width: 15, height: 8 });
    expect(resizeRect(r, "e", 5, 99, o)).toEqual({ x: 10, y: 10, width: 25, height: 10 });
    expect(resizeRect(r, "w", 50, 0, o).width).toBe(1); // min size
  });

  it("keeps aspect ratio when requested", () => {
    const sq = { x: 0, y: 0, width: 10, height: 10 };
    const out = resizeRect(sq, "se", 5, 1, { rotation: 0, minSize: 1, keepRatio: true });
    expect(out.width).toBeCloseTo(15, 9);
    expect(out.height).toBeCloseTo(15, 9);
  });

  it("keeps the opposite corner fixed in world space for rotated elements", () => {
    const r = { x: 10, y: 10, width: 20, height: 10 };
    const rot = 30;
    const before = rotatedCorners(r, rot);
    // Drag the se corner along its own local +x axis by 5 units.
    const d = { x: 5 * Math.cos((rot * Math.PI) / 180), y: 5 * Math.sin((rot * Math.PI) / 180) };
    const out = resizeRect(r, "se", d.x, d.y, { rotation: rot, minSize: 1, keepRatio: false });
    expect(out.width).toBeCloseTo(25, 9);
    expect(out.height).toBeCloseTo(10, 9);
    const after = rotatedCorners(out, rot);
    expect(after[0].x).toBeCloseTo(before[0].x, 9); // nw corner fixed
    expect(after[0].y).toBeCloseTo(before[0].y, 9);
  });

  it("snaps resized edges to the grid", () => {
    const out = resizeRect({ x: 0, y: 0, width: 10, height: 10 }, "se", 2.3, 2.6, { rotation: 0, minSize: 1, keepRatio: false, gridSize: 1, snapToGrid: true });
    expect(out).toEqual({ x: 0, y: 0, width: 12, height: 13 });
  });

  it("aligns rects to the selection bounds", () => {
    const rects = [{ x: 0, y: 0, width: 10, height: 10 }, { x: 20, y: 5, width: 4, height: 4 }];
    expect(alignRects(rects, "right")).toEqual([{ x: 14, y: 0 }, { x: 0, y: 0 }]);
    expect(alignRects(rects, "vcenter")).toEqual([{ x: 0, y: 0 }, { x: 0, y: -2 }]);
  });
});
