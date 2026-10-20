import { useCallback, useEffect, useId, useLayoutEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { RESIZE_HANDLES, resizeRect, snapMove, type Guide, type ResizeHandle } from "../../core/editor/interactions";
import { normalizeRotation, rectsIntersect, rotatedBounds, unionRects, type Point, type Rect } from "../../core/geometry/rect";
import { roundTo } from "../../core/geometry/units";
import { pixelsPerUnit, screenToLabel, zoomAt, type Viewport } from "../../core/geometry/viewport";
import { renderLabel } from "../../core/render/render-label";
import type { LabelElement } from "../../core/schema/types";
import { shallowArrayEqual, useEditorSelector } from "../headless/hooks";
import { renderNodeToReact } from "../renderer/to-react";
import { useEditorContext } from "./context";
import { fitToScreen } from "./EditorToolbar";

type Drag =
  | { readonly kind: "move"; readonly ids: readonly string[]; readonly dx: number; readonly dy: number; readonly guides: readonly Guide[] }
  | { readonly kind: "resize"; readonly id: string; readonly rect: Rect }
  | { readonly kind: "marquee"; readonly rect: Rect };

interface Gesture {
  readonly kind: "move" | "resize" | "marquee" | "pan";
  readonly pointerId: number;
  readonly startScreen: Point;
  readonly startLabel: Point;
  readonly startViewport: Viewport;
  readonly ids: readonly string[];
  readonly handle?: ResizeHandle;
  readonly origin?: Rect;
  readonly additive: boolean;
  started: boolean;
}

const DRAG_THRESHOLD_PX = 3;
const HANDLE_PX = 8;
const SNAP_PX = 6;

const CURSORS: Record<ResizeHandle, string> = { n: "ns-resize", s: "ns-resize", e: "ew-resize", w: "ew-resize", ne: "nesw-resize", sw: "nesw-resize", nw: "nwse-resize", se: "nwse-resize" };

function handlePoint(h: ResizeHandle, r: Rect): Point {
  const x = h.includes("w") ? r.x : h.includes("e") ? r.x + r.width : r.x + r.width / 2;
  const y = h.includes("n") ? r.y : h.includes("s") ? r.y + r.height : r.y + r.height / 2;
  return { x, y };
}

const box = (e: LabelElement): Rect => ({ x: e.x, y: e.y, width: e.width, height: e.height });
const rotation = (e: LabelElement) => normalizeRotation(e.rotation ?? 0);

export function EditorCanvas({ viewportId, describedBy }: { readonly viewportId: string; readonly describedBy?: string }) {
  const { store, renderOptions, records, recordIndex, readOnly, announce } = useEditorContext();
  const template = useEditorSelector(store, (s) => s.template);
  const selection = useEditorSelector(store, (s) => s.selection, shallowArrayEqual);
  const viewport = useEditorSelector(store, (s) => s.viewport);
  const settings = useEditorSelector(store, (s) => s.settings);
  const idPrefix = `elsc${useId().replace(/[^A-Za-z0-9_-]/g, "")}`;
  const containerRef = useRef<HTMLDivElement>(null);
  const [drag, setDrag] = useState<Drag | null>(null);
  const gesture = useRef<Gesture | null>(null);
  const pending = useRef<Drag | null>(null);
  const frame = useRef<number | null>(null);
  /** Viewport set by the last automatic fit; auto-refit on resize stops once the user changes it. */
  const autoFit = useRef<Viewport | null>(null);
  const spaceDown = useRef(false);

  const { unit, width: W, height: H } = template.canvas;
  const ppu = pixelsPerUnit(viewport, unit);
  const record = records[recordIndex];

  const rendered = useMemo(() => {
    try {
      return renderLabel(template, record, { ...renderOptions, mode: "design", idPrefix });
    } catch {
      return null;
    }
  }, [template, record, renderOptions, idPrefix]);

  // Fit on first layout and keep fitting on container resize until the user zooms/pans.
  useEffect(() => {
    const el = containerRef.current;
    const refit = () => {
      const current = store.getState().viewport;
      if (autoFit.current === null || autoFit.current === current) autoFit.current = fitToScreen(store, el) ?? null;
    };
    if (!el || typeof ResizeObserver === "undefined") {
      refit();
      return;
    }
    const ro = new ResizeObserver(refit);
    ro.observe(el);
    return () => ro.disconnect();
  }, [store]);

  // Non-passive wheel listener (React's onWheel is passive and cannot preventDefault).
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const s = store.getState();
      const rect = el.getBoundingClientRect();
      if (e.ctrlKey || e.metaKey) {
        const factor = Math.exp(-e.deltaY * 0.0015);
        store.setViewport(zoomAt(s.viewport, s.template.canvas.unit, s.viewport.zoom * factor, { x: e.clientX - rect.left, y: e.clientY - rect.top }));
      } else {
        store.setViewport({ ...s.viewport, panX: s.viewport.panX - e.deltaX, panY: s.viewport.panY - e.deltaY });
      }
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, [store]);

  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.code === "Space") spaceDown.current = true;
    };
    const up = (e: KeyboardEvent) => {
      if (e.code === "Space") spaceDown.current = false;
    };
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    return () => {
      window.removeEventListener("keydown", down);
      window.removeEventListener("keyup", up);
      if (frame.current !== null) cancelAnimationFrame(frame.current);
    };
  }, []);

  const schedule = useCallback((d: Drag | null) => {
    pending.current = d;
    if (frame.current !== null) return;
    frame.current = requestAnimationFrame(() => {
      frame.current = null;
      setDrag(pending.current);
    });
  }, []);

  const local = (e: { clientX: number; clientY: number }): Point => {
    const r = containerRef.current!.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  };

  const onPointerDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (e.button !== 0 && e.button !== 1) return;
    const el = containerRef.current;
    if (!el) return;
    el.focus({ preventScroll: true });
    const s = store.getState();
    const screen = local(e);
    const labelPt = screenToLabel(screen, s.viewport, s.template.canvas.unit);
    const target = e.target as Element;
    const handle = target.closest("[data-handle]")?.getAttribute("data-handle") as ResizeHandle | null;
    const hitId = target.closest("[data-hit-id]")?.getAttribute("data-hit-id") ?? null;
    const base = { pointerId: e.pointerId, startScreen: screen, startLabel: labelPt, startViewport: s.viewport, started: false, additive: e.shiftKey || e.ctrlKey || e.metaKey };

    if (e.button === 1 || spaceDown.current) {
      gesture.current = { ...base, kind: "pan", ids: [] };
    } else if (handle && !readOnly && s.selection.length === 1) {
      const elx = s.template.elements.find((x) => x.id === s.selection[0]);
      if (!elx || elx.locked) return;
      gesture.current = { ...base, kind: "resize", ids: [elx.id], handle, origin: box(elx) };
    } else if (hitId) {
      let ids = s.selection;
      if (base.additive) {
        store.select([hitId], "toggle");
        ids = store.getState().selection;
      } else if (!s.selection.includes(hitId)) {
        store.select([hitId]);
        ids = [hitId];
      }
      const movable = ids.filter((id) => !s.template.elements.find((x) => x.id === id)?.locked);
      // Locked elements and read-only mode allow selection but no movement.
      gesture.current = readOnly || movable.length === 0 ? null : { ...base, kind: "move", ids: movable };
    } else {
      gesture.current = { ...base, kind: "marquee", ids: [] };
    }
    if (gesture.current) {
      try {
        el.setPointerCapture?.(e.pointerId);
      } catch {
        /* pointer capture is best-effort (unsupported in some environments) */
      }
      e.preventDefault();
    }
  };

  const onPointerMove = (e: ReactPointerEvent<HTMLDivElement>) => {
    const g = gesture.current;
    if (!g || e.pointerId !== g.pointerId) return;
    const screen = local(e);
    const dxs = screen.x - g.startScreen.x;
    const dys = screen.y - g.startScreen.y;
    if (!g.started) {
      if (Math.hypot(dxs, dys) < DRAG_THRESHOLD_PX) return;
      g.started = true;
    }
    const s = store.getState();
    const u = s.template.canvas.unit;
    const p = pixelsPerUnit(g.startViewport, u);
    const dx = dxs / p;
    const dy = dys / p;
    const canvasRect = { x: 0, y: 0, width: s.template.canvas.width, height: s.template.canvas.height };

    if (g.kind === "pan") {
      store.setViewport({ ...g.startViewport, panX: g.startViewport.panX + dxs, panY: g.startViewport.panY + dys });
    } else if (g.kind === "move") {
      const moving = s.template.elements.filter((x) => g.ids.includes(x.id));
      const bounds = unionRects(moving.map((m) => rotatedBounds(box(m), rotation(m))));
      if (!bounds) return;
      const snapping = s.settings.snapToGrid || s.settings.snapToElements;
      const snap = snapping && !e.altKey
        ? snapMove(
            { ...bounds, x: bounds.x + dx, y: bounds.y + dy },
            {
              canvas: canvasRect,
              targets: s.template.elements.filter((x) => !g.ids.includes(x.id) && x.visible !== false).map((x) => rotatedBounds(box(x), rotation(x))),
              threshold: SNAP_PX / p,
              gridSize: s.settings.gridSize,
              snapToGrid: s.settings.snapToGrid,
              snapToElements: s.settings.snapToElements,
            },
          )
        : { dx: 0, dy: 0, guides: [] };
      schedule({ kind: "move", ids: g.ids, dx: dx + snap.dx, dy: dy + snap.dy, guides: snap.guides });
    } else if (g.kind === "resize" && g.origin && g.handle) {
      const elx = s.template.elements.find((x) => x.id === g.ids[0]);
      if (!elx) return;
      const keepRatio = elx.type === "qrcode" || e.shiftKey;
      const rect = resizeRect(g.origin, g.handle, dx, dy, {
        rotation: rotation(elx),
        minSize: 2 / p,
        keepRatio,
        gridSize: s.settings.gridSize,
        snapToGrid: s.settings.snapToGrid && !e.altKey,
      });
      schedule({ kind: "resize", id: elx.id, rect });
    } else if (g.kind === "marquee") {
      const a = g.startLabel;
      const b = screenToLabel(screen, g.startViewport, u);
      schedule({ kind: "marquee", rect: { x: Math.min(a.x, b.x), y: Math.min(a.y, b.y), width: Math.abs(a.x - b.x), height: Math.abs(a.y - b.y) } });
    }
  };

  /**
   * Drag feedback without re-rendering or repainting the label: dragged groups
   * are cloned once into a small separate layer that moves with a CSS transform
   * (compositor-only); the originals are hidden until the drag ends.
   * Maps each hidden original to its previous visibility attribute.
   */
  const dragged = useRef(new Map<Element, string | null>());
  const dragLayerRef = useRef<HTMLDivElement>(null);
  const dragSvgRef = useRef<SVGSVGElement>(null);
  const restoreDragged = useCallback(() => {
    for (const [node, original] of dragged.current) {
      if (original === null) node.removeAttribute("visibility");
      else node.setAttribute("visibility", original);
    }
    dragged.current.clear();
    dragSvgRef.current?.replaceChildren();
    if (dragLayerRef.current) dragLayerRef.current.style.transform = "";
  }, []);

  const finish = (commit: boolean) => {
    const g = gesture.current;
    gesture.current = null;
    // Put the DOM back exactly as React rendered it before committing, so reconciliation stays correct.
    restoreDragged();
    if (frame.current !== null) {
      cancelAnimationFrame(frame.current);
      frame.current = null;
    }
    const d = pending.current;
    pending.current = null;
    setDrag(null);
    if (!g) return;
    const s = store.getState();
    if (!g.started) {
      if (g.kind === "marquee" && !g.additive) store.select([]);
      return;
    }
    if (!commit || !d) return;
    if (d.kind === "move" && (d.dx !== 0 || d.dy !== 0)) {
      const updates = s.template.elements
        .filter((x) => d.ids.includes(x.id) && !x.locked)
        .map((x) => ({ id: x.id, patch: { x: roundTo(x.x + d.dx, 4), y: roundTo(x.y + d.dy, 4) } }));
      const r = store.dispatch({ type: "updateElements", updates });
      announce(r.ok ? `Moved ${updates.length} element${updates.length === 1 ? "" : "s"}` : "Move rejected: the result would be invalid");
    } else if (d.kind === "resize") {
      const r = store.dispatch({ type: "updateElement", id: d.id, patch: { x: roundTo(d.rect.x, 4), y: roundTo(d.rect.y, 4), width: roundTo(d.rect.width, 4), height: roundTo(d.rect.height, 4) } });
      announce(r.ok ? "Resized" : "Resize rejected: the result would be invalid");
    } else if (d.kind === "marquee") {
      const hits = s.template.elements.filter((x) => x.visible !== false && rectsIntersect(rotatedBounds(box(x), rotation(x)), d.rect)).map((x) => x.id);
      store.select(hits, g.additive ? "add" : "replace");
    }
  };

  const moving = drag?.kind === "move" ? drag : null;
  const movingSet = useMemo(() => new Set(moving?.ids ?? []), [moving]);
  const stageRef = useRef<HTMLDivElement>(null);

  // The label layer does not depend on drag state: during a drag React skips it entirely.
  const labelLayer = useMemo(() => {
    if (!rendered) return null;
    return renderNodeToReact(rendered.root, {
      rootProps: { width: W * ppu, height: H * ppu, className: "els-canvas__label", "aria-hidden": true, focusable: "false" },
    });
  }, [rendered, W, H, ppu]);

  useLayoutEffect(() => {
    if (!moving) return;
    const label = stageRef.current?.querySelector(".els-canvas__label");
    const layer = dragSvgRef.current;
    if (!label || !layer) return;
    if (dragged.current.size === 0) {
      for (const id of moving.ids) {
        const node = label.querySelector(`g[data-element-id="${id}"]`);
        if (!node) continue;
        layer.appendChild(node.cloneNode(true));
        dragged.current.set(node, node.getAttribute("visibility"));
        node.setAttribute("visibility", "hidden");
      }
    }
    if (dragLayerRef.current) dragLayerRef.current.style.transform = `translate(${moving.dx * ppu}px, ${moving.dy * ppu}px)`;
  }, [moving, ppu]);
  useEffect(() => restoreDragged, [restoreDragged]);

  // Hit targets depend only on element geometry; the pointer is captured during drags, so they never move.
  const hitLayer = useMemo(
    () =>
      template.elements.map((x) =>
        x.visible === false ? null : (
          <rect
            key={x.id}
            data-hit-id={x.id}
            className={`els-hit${x.locked ? " els-hit--locked" : ""}`}
            x={x.x}
            y={x.y}
            width={x.width}
            height={x.height}
            transform={`rotate(${rotation(x)} ${x.x + x.width / 2} ${x.y + x.height / 2})`}
          />
        ),
      ),
    [template.elements],
  );

  const handleSize = HANDLE_PX / ppu;
  const selectedEls = template.elements.filter((x) => selection.includes(x.id));
  const single = selectedEls.length === 1 && !selectedEls[0]!.locked && !readOnly ? selectedEls[0]! : null;
  const gridVisible = settings.showGrid && settings.gridSize * ppu >= 4;

  return (
    <div
      id={viewportId}
      ref={containerRef}
      className={`els-canvas${drag ? " els-canvas--dragging" : ""}`}
      tabIndex={0}
      role="region"
      aria-label="Label canvas"
      aria-describedby={describedBy}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={() => finish(true)}
      onPointerCancel={() => finish(false)}
      onLostPointerCapture={() => gesture.current && finish(true)}
      onKeyDown={(e) => {
        if (e.key === "Escape" && gesture.current) {
          e.stopPropagation();
          finish(false);
        }
      }}
      data-testid="els-canvas"
      data-zoom={viewport.zoom}
    >
      <div ref={stageRef} className="els-canvas__stage" style={{ transform: `translate(${viewport.panX}px, ${viewport.panY}px)`, width: W * ppu, height: H * ppu }}>
        {labelLayer ?? <div className="els-canvas__error" role="alert">Preview unavailable</div>}
        <div ref={dragLayerRef} className="els-canvas__drag" aria-hidden="true">
          {/* Clip paths referenced by cloned groups resolve against the label SVG's <defs> (same document). */}
          <svg ref={dragSvgRef} width={W * ppu} height={H * ppu} viewBox={`0 0 ${W} ${H}`} overflow="visible" focusable="false" />
        </div>
        <svg className="els-canvas__overlay" width={W * ppu} height={H * ppu} viewBox={`0 0 ${W} ${H}`} overflow="visible" data-testid="els-overlay">
          {gridVisible && (
            <>
              <defs>
                <pattern id={`${idPrefix}-grid`} width={settings.gridSize} height={settings.gridSize} patternUnits="userSpaceOnUse">
                  <path d={`M ${settings.gridSize} 0 L 0 0 0 ${settings.gridSize}`} fill="none" className="els-grid-line" strokeWidth={1 / ppu} />
                </pattern>
              </defs>
              <rect x={0} y={0} width={W} height={H} fill={`url(#${idPrefix}-grid)`} pointerEvents="none" />
            </>
          )}
          <rect className="els-canvas__bounds" x={0} y={0} width={W} height={H} fill="none" vectorEffect="non-scaling-stroke" pointerEvents="none" />
          {hitLayer}
        </svg>
        {/* Small dynamic layer: only this repaints while dragging (the static layer above holds all hit targets). */}
        <svg className="els-canvas__overlay els-canvas__overlay--dynamic" width={W * ppu} height={H * ppu} viewBox={`0 0 ${W} ${H}`} overflow="visible">
          {selectedEls.map((x) => (
            <rect
              key={`sel-${x.id}`}
              className="els-selection"
              x={x.x}
              y={x.y}
              width={x.width}
              height={x.height}
              transform={`${movingSet.has(x.id) && moving ? `translate(${moving.dx} ${moving.dy}) ` : ""}rotate(${rotation(x)} ${x.x + x.width / 2} ${x.y + x.height / 2})`}
              vectorEffect="non-scaling-stroke"
              pointerEvents="none"
              data-testid={`els-selection-${x.id}`}
            />
          ))}
          {single && !moving && drag?.kind !== "resize" && (
            <g transform={`rotate(${rotation(single)} ${single.x + single.width / 2} ${single.y + single.height / 2})`}>
              {RESIZE_HANDLES.map((h) => {
                const pt = handlePoint(h, box(single));
                return (
                  <rect
                    key={h}
                    data-handle={h}
                    className="els-handle"
                    x={pt.x - handleSize / 2}
                    y={pt.y - handleSize / 2}
                    width={handleSize}
                    height={handleSize}
                    vectorEffect="non-scaling-stroke"
                    style={{ cursor: CURSORS[h] }}
                    data-testid={`els-handle-${h}`}
                  />
                );
              })}
            </g>
          )}
          {drag?.kind === "resize" &&
            (() => {
              const x = template.elements.find((e) => e.id === drag.id);
              if (!x) return null;
              const r = drag.rect;
              return <rect className="els-resize-preview" x={r.x} y={r.y} width={r.width} height={r.height} transform={`rotate(${rotation(x)} ${r.x + r.width / 2} ${r.y + r.height / 2})`} vectorEffect="non-scaling-stroke" pointerEvents="none" />;
            })()}
          {moving?.guides.map((g, i) =>
            g.orientation === "vertical" ? (
              <line key={i} className="els-guide" x1={g.position} x2={g.position} y1={g.from} y2={g.to} vectorEffect="non-scaling-stroke" />
            ) : (
              <line key={i} className="els-guide" y1={g.position} y2={g.position} x1={g.from} x2={g.to} vectorEffect="non-scaling-stroke" />
            ),
          )}
          {drag?.kind === "marquee" && <rect className="els-marquee" x={drag.rect.x} y={drag.rect.y} width={drag.rect.width} height={drag.rect.height} vectorEffect="non-scaling-stroke" pointerEvents="none" />}
        </svg>
      </div>
    </div>
  );
}
