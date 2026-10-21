import { useRef, type KeyboardEvent } from "react";
import type { LabelElement } from "../../core/schema/types";
import { shallowArrayEqual, useEditorSelector } from "../headless/hooks";
import { useEditorContext } from "./context";
import { Icon } from "./icons";

const TYPE_LABEL: Record<LabelElement["type"], string> = { text: "Text", barcode: "Barcode", qrcode: "QR code", image: "Image", rect: "Rectangle", line: "Line", shape: "Shape", drawing: "Drawing" };

export function elementDisplayName(el: LabelElement): string {
  if (el.name) return el.name;
  if (el.type === "text") {
    const src = el.content;
    const t = src.kind === "static" ? src.value : `{${src.path}}`;
    return t.length > 24 ? `${t.slice(0, 24)}…` : t || TYPE_LABEL.text;
  }
  if (el.type === "barcode") return `${el.format.toUpperCase()} ${el.value.kind === "field" ? `{${el.value.path}}` : el.value.value}`;
  if (el.type === "qrcode") return `QR ${el.value.kind === "field" ? `{${el.value.path}}` : ""}`.trim();
  if (el.type === "shape") return `${el.shape.charAt(0).toUpperCase()}${el.shape.slice(1)}`;
  return TYPE_LABEL[el.type];
}

/**
 * Accessible, non-canvas way to inspect and select elements (listbox).
 * Top of the list = front-most element. Arrow keys move selection,
 * Space toggles multi-selection, Alt+Arrow reorders.
 */
export function LayersPanel() {
  const { store, c, readOnly, idBase, announce } = useEditorContext();
  const elements = useEditorSelector(store, (s) => s.template.elements);
  const selection = useEditorSelector(store, (s) => s.selection, shallowArrayEqual);
  const listRef = useRef<HTMLUListElement>(null);
  const ordered = [...elements].reverse();
  const activeId = selection[selection.length - 1];
  const active = elements.find((x) => x.id === activeId);
  const toggleVisible = (el: LabelElement) => store.dispatch({ type: "updateElement", id: el.id, patch: { visible: el.visible === false ? undefined : false } });
  const toggleLocked = (el: LabelElement) => store.dispatch({ type: "updateElement", id: el.id, patch: { locked: el.locked ? undefined : true } });

  const onKeyDown = (e: KeyboardEvent<HTMLUListElement>) => {
    if (ordered.length === 0) return;
    const idx = Math.max(0, ordered.findIndex((x) => x.id === activeId));
    const go = (i: number) => {
      const target = ordered[Math.max(0, Math.min(ordered.length - 1, i))]!;
      store.select([target.id], e.shiftKey ? "add" : "replace");
      e.preventDefault();
    };
    if (e.altKey && (e.key === "ArrowUp" || e.key === "ArrowDown") && activeId && !readOnly) {
      store.dispatch({ type: "reorderElement", id: activeId, to: e.key === "ArrowUp" ? "forward" : "backward" });
      announce(e.key === "ArrowUp" ? "Moved forward" : "Moved backward");
      e.preventDefault();
    } else if (e.key === "ArrowDown") go(idx + 1);
    else if (e.key === "ArrowUp") go(idx - 1);
    else if (e.key === "Home") go(0);
    else if (e.key === "End") go(ordered.length - 1);
    else if (e.key === " " && activeId) {
      store.select([activeId], "toggle");
      e.preventDefault();
    }
  };

  return (
    <div className="els-layers">
      <h3 className="els-section__title" id={`${idBase}-layers-title`}>
        Layers
      </h3>
      {ordered.length === 0 ? (
        <p className="els-empty">No elements yet. Use the toolbar to add text, barcodes and shapes.</p>
      ) : (
        <ul
          ref={listRef}
          className="els-layers__list"
          role="listbox"
          aria-multiselectable="true"
          aria-labelledby={`${idBase}-layers-title`}
          aria-activedescendant={activeId ? `${idBase}-layer-${activeId}` : undefined}
          tabIndex={0}
          onKeyDown={onKeyDown}
          data-testid="els-layers"
        >
          {ordered.map((el) => {
            const selected = selection.includes(el.id);
            const hidden = el.visible === false;
            return (
              <li
                key={el.id}
                id={`${idBase}-layer-${el.id}`}
                role="option"
                aria-selected={selected}
                className={`els-layer${selected ? " els-layer--selected" : ""}${hidden ? " els-layer--hidden" : ""}`}
                onClick={(e) => store.select([el.id], e.shiftKey || e.ctrlKey || e.metaKey ? "toggle" : "replace")}
                data-testid={`els-layer-${el.id}`}
              >
                <span className="els-layer__type" aria-hidden="true">
                  <Icon name={el.type === "qrcode" ? "qrcode" : el.type} />
                </span>
                <span className="els-layer__name">
                  {elementDisplayName(el)}
                  <span className="els-visually-hidden">
                    {`, ${TYPE_LABEL[el.type]}`}
                    {hidden ? ", hidden" : ""}
                    {el.locked ? ", locked" : ""}
                  </span>
                </span>
                {/* Mouse shortcuts only; options must not contain interactive controls.
                    Keyboard/AT users use the Show/Hide and Lock buttons below the list. */}
                <span className="els-layer__flags" aria-hidden="true">
                  <span className="els-layer__flag" title={hidden ? "Show" : "Hide"} onClick={(e) => { e.stopPropagation(); if (!readOnly) toggleVisible(el); }}>
                    <Icon name={hidden ? "eyeOff" : "eye"} />
                  </span>
                  <span className="els-layer__flag" title={el.locked ? "Unlock" : "Lock"} onClick={(e) => { e.stopPropagation(); if (!readOnly) toggleLocked(el); }}>
                    <Icon name={el.locked ? "lock" : "unlock"} />
                  </span>
                </span>
              </li>
            );
          })}
        </ul>
      )}
      {active && !readOnly && (
        <div className="els-layers__order" role="group" aria-label={`Layer actions for ${elementDisplayName(active)}`}>
          <c.Button variant="ghost" icon={<Icon name={active.visible === false ? "eye" : "eyeOff"} />} pressed={active.visible === false} onClick={() => toggleVisible(active)} data-testid="els-layer-toggle-visible">
            {active.visible === false ? "Show" : "Hide"}
          </c.Button>
          <c.Button variant="ghost" icon={<Icon name={active.locked ? "unlock" : "lock"} />} pressed={!!active.locked} onClick={() => toggleLocked(active)} data-testid="els-layer-toggle-lock">
            {active.locked ? "Unlock" : "Lock"}
          </c.Button>
          <c.Button variant="ghost" icon={<Icon name="up" />} aria-label="Bring forward" onClick={() => store.dispatch({ type: "reorderElement", id: active.id, to: "forward" })} />
          <c.Button variant="ghost" icon={<Icon name="down" />} aria-label="Send backward" onClick={() => store.dispatch({ type: "reorderElement", id: active.id, to: "backward" })} />
          <c.Button variant="ghost" onClick={() => store.dispatch({ type: "reorderElement", id: active.id, to: "front" })}>
            To front
          </c.Button>
          <c.Button variant="ghost" onClick={() => store.dispatch({ type: "reorderElement", id: active.id, to: "back" })}>
            To back
          </c.Button>
        </div>
      )}
    </div>
  );
}
