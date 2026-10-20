import { useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import { createElement } from "../../core/editor/element-factory";
import { basePixelsPerUnit, clampZoom, fitZoom, type Viewport } from "../../core/geometry/viewport";
import type { ElementType } from "../../core/schema/types";
import { shallowArrayEqual, useEditorSelector } from "../headless/hooks";
import { useEditorContext } from "./context";
import { Icon, type IconName } from "./icons";

const ELEMENT_LABELS: Record<ElementType, { label: string; add: string; icon: IconName }> = {
  text: { label: "Text", add: "Add text", icon: "text" },
  barcode: { label: "Barcode", add: "Add barcode", icon: "barcode" },
  qrcode: { label: "QR code", add: "Add QR code", icon: "qrcode" },
  image: { label: "Image", add: "Add image", icon: "image" },
  rect: { label: "Rectangle", add: "Add rectangle", icon: "rect" },
  line: { label: "Line", add: "Add line", icon: "line" },
};

interface ToolDef {
  readonly key: string;
  readonly label: string;
  readonly icon: IconName;
  readonly onClick: () => void;
  readonly disabled?: boolean;
  readonly pressed?: boolean;
  readonly showLabel?: boolean;
  readonly variant?: "default" | "primary" | "danger" | "ghost";
  readonly group: string;
}

/** Fit the label into the canvas viewport element (if mounted). */
export function fitToScreen(store: ReturnType<typeof useEditorContext>["store"], container: HTMLElement | null): Viewport | undefined {
  if (!container) return undefined;
  const { template } = store.getState();
  const rect = container.getBoundingClientRect();
  const zoom = fitZoom(template.canvas, { width: rect.width, height: rect.height }, 32);
  const ppu = basePixelsPerUnit(template.canvas.unit) * zoom;
  if (rect.width === 0 || rect.height === 0) return undefined;
  store.setViewport({ zoom, panX: (rect.width - template.canvas.width * ppu) / 2, panY: (rect.height - template.canvas.height * ppu) / 2 });
  return store.getState().viewport;
}

export function EditorToolbar({ canvasViewportId, extra }: { readonly canvasViewportId: string; readonly extra?: ReactNode }) {
  const ctx = useEditorContext();
  const { store, c, ui, readOnly, announce } = ctx;
  const canUndo = useEditorSelector(store, (s) => s.canUndo);
  const canRedo = useEditorSelector(store, (s) => s.canRedo);
  const selection = useEditorSelector(store, (s) => s.selection, shallowArrayEqual);
  const settings = useEditorSelector(store, (s) => s.settings);
  const zoom = useEditorSelector(store, (s) => s.viewport.zoom);
  const dirty = useEditorSelector(store, (s) => s.dirty);

  const add = (type: ElementType) => {
    const r = store.dispatch({ type: "addElements", elements: [createElement(store.getState().template, type)] });
    if (r.ok) announce(`${ELEMENT_LABELS[type].label} added`);
  };
  const zoomBy = (f: number) => {
    const s = store.getState();
    const el = document.getElementById(canvasViewportId);
    const rect = el?.getBoundingClientRect();
    const cx = rect ? rect.width / 2 : 0;
    const cy = rect ? rect.height / 2 : 0;
    const nz = clampZoom(s.viewport.zoom * f);
    const k = nz / s.viewport.zoom;
    store.setViewport({ zoom: nz, panX: cx - (cx - s.viewport.panX) * k, panY: cy - (cy - s.viewport.panY) * k });
  };

  const tools: ToolDef[] = [
    ...ui.elementTypes.map((t) => ({ key: `add-${t}`, label: ELEMENT_LABELS[t].add, icon: ELEMENT_LABELS[t].icon, onClick: () => add(t), disabled: readOnly, group: "add" })),
    { key: "undo", label: "Undo", icon: "undo", onClick: () => store.undo() && announce("Undone"), disabled: readOnly || !canUndo, group: "history" },
    { key: "redo", label: "Redo", icon: "redo", onClick: () => store.redo() && announce("Redone"), disabled: readOnly || !canRedo, group: "history" },
    { key: "duplicate", label: "Duplicate selection", icon: "duplicate", onClick: () => store.dispatch({ type: "duplicateElements", ids: store.getState().selection, offset: dupOffset(store) }), disabled: readOnly || selection.length === 0, group: "edit" },
    {
      key: "delete",
      label: "Delete selection",
      icon: "trash",
      onClick: () => {
        const n = store.getState().selection.length;
        if (store.dispatch({ type: "removeElements", ids: store.getState().selection }).ok) announce(`${n} element${n === 1 ? "" : "s"} deleted`);
      },
      disabled: readOnly || selection.length === 0,
      group: "edit",
    },
    { key: "zoom-out", label: "Zoom out", icon: "zoomOut", onClick: () => zoomBy(1 / 1.25), group: "view" },
    { key: "zoom-in", label: "Zoom in", icon: "zoomIn", onClick: () => zoomBy(1.25), group: "view" },
    { key: "fit", label: "Fit to screen", icon: "fit", onClick: () => fitToScreen(store, document.getElementById(canvasViewportId)), group: "view" },
    { key: "grid", label: "Show grid", icon: "grid", pressed: settings.showGrid, onClick: () => store.updateSettings({ showGrid: !settings.showGrid }), group: "view" },
    { key: "snap", label: "Snap to grid and guides", icon: "snap", pressed: settings.snapToGrid, onClick: () => store.updateSettings({ snapToGrid: !settings.snapToGrid, snapToElements: !settings.snapToGrid }), group: "view" },
    ...(ui.rulers ? [{ key: "rulers", label: "Show rulers", icon: "ruler" as IconName, pressed: settings.showRulers, onClick: () => store.updateSettings({ showRulers: !settings.showRulers }), group: "view" }] : []),
    ...(ui.printButton && ctx.print.available ? [{ key: "print", label: "Print preview", icon: "print" as IconName, onClick: ctx.print.run, group: "output", showLabel: true }] : []),
    ...(ui.saveButton && ctx.save.available
      ? [{ key: "save", label: ctx.save.status.state === "saving" ? "Saving…" : "Save", icon: "save" as IconName, onClick: ctx.save.run, disabled: readOnly || ctx.save.status.state === "saving" || !dirty, group: "output", showLabel: true, variant: "primary" as const }]
      : []),
  ];

  // Roving tabindex: exactly one enabled tool is tabbable; arrows move focus.
  const [active, setActive] = useState(0);
  const refs = useRef<(HTMLButtonElement | null)[]>([]);
  const enabled = tools.map((t, i) => (t.disabled ? -1 : i)).filter((i) => i >= 0);
  const current = enabled.includes(active) ? active : (enabled[0] ?? 0);
  const onKeyDown = (e: KeyboardEvent<HTMLElement>) => {
    const pos = enabled.indexOf(current);
    let next: number | undefined;
    if (e.key === "ArrowRight" || e.key === "ArrowDown") next = enabled[(pos + 1) % enabled.length];
    else if (e.key === "ArrowLeft" || e.key === "ArrowUp") next = enabled[(pos - 1 + enabled.length) % enabled.length];
    else if (e.key === "Home") next = enabled[0];
    else if (e.key === "End") next = enabled[enabled.length - 1];
    if (next === undefined) return;
    e.preventDefault();
    setActive(next);
    refs.current[next]?.focus();
  };

  let lastGroup = "";
  return (
    <div className="els-toolbar" role="toolbar" aria-label="Label editor tools" aria-orientation="horizontal">
      {tools.map((t, i) => {
        const sep = lastGroup !== "" && t.group !== lastGroup;
        lastGroup = t.group;
        return (
          <span key={t.key} className="els-toolbar__item">
            {sep && <span className="els-toolbar__sep" role="separator" aria-orientation="vertical" />}
            <c.Button
              setElement={(el) => {
                refs.current[i] = el;
              }}
              icon={<Icon name={t.icon} />}
              aria-label={t.label}
              title={t.label}
              onClick={() => {
                setActive(i);
                t.onClick();
              }}
              disabled={t.disabled}
              {...(t.pressed !== undefined ? { pressed: t.pressed } : {})}
              variant={t.variant ?? "ghost"}
              tabIndex={i === current ? 0 : -1}
              onKeyDown={onKeyDown}
              data-testid={`els-tool-${t.key}`}
            >
              {t.showLabel ? t.label : undefined}
            </c.Button>
          </span>
        );
      })}
      <span className="els-toolbar__zoom" aria-live="polite" data-testid="els-zoom">
        {Math.round(zoom * 100)}%
      </span>
      {extra}
    </div>
  );
}

function dupOffset(store: ReturnType<typeof useEditorContext>["store"]) {
  const unit = store.getState().template.canvas.unit;
  return unit === "mm" ? 2 : unit === "in" ? 0.08 : 8;
}
