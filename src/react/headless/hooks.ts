/**
 * Headless React bindings over the framework-independent EditorStore.
 * Build a fully custom editor UI with these hooks; every change still goes
 * through store commands and therefore through template validation.
 */
import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import type { ElementPatch, EditorCommand } from "../../core/editor/commands";
import { createElement } from "../../core/editor/element-factory";
import { createEditorStore, type DispatchOptions, type EditorState, type EditorStore, type EditorStoreOptions } from "../../core/editor/editor-store";
import type { ElementType, LabelTemplate } from "../../core/schema/types";

export interface UseEditorStoreOptions extends EditorStoreOptions {
  /**
   * Controlled template. When it changes to a value the store did not emit,
   * the store replaces its template (history is cleared).
   */
  readonly template?: LabelTemplate;
  /** Called with every committed template change (commands, undo, redo). Not called for external replacement. */
  readonly onTemplateChange?: (template: LabelTemplate) => void;
}

/**
 * Create (once) and own an EditorStore for the component lifetime.
 * `initialTemplate` is read only on first render.
 *
 * The store is intentionally not destroyed in an effect cleanup: React
 * StrictMode (and future offscreen rendering) runs cleanups and then re-uses
 * the same state, so a destroyed store would reject every later edit.
 * Subscriptions are released by useSyncExternalStore and the store is
 * garbage-collected with the component.
 */
export function useEditorStore(initialTemplate: LabelTemplate, options: UseEditorStoreOptions = {}): EditorStore {
  const [store] = useState(() => createEditorStore(options.template ?? initialTemplate, options));
  useControlledTemplate(store, options.template, options.onTemplateChange);
  return store;
}

/**
 * Wire controlled-template semantics onto any store: emit changes, and adopt
 * external template props that differ from what was last emitted.
 */
export function useControlledTemplate(store: EditorStore, template: LabelTemplate | undefined, onTemplateChange: ((t: LabelTemplate) => void) | undefined): void {
  const lastEmitted = useRef<LabelTemplate | undefined>(template);
  const callback = useRef(onTemplateChange);
  useEffect(() => {
    callback.current = onTemplateChange;
  });

  useEffect(() => {
    let previousVersion = store.getState().version;
    let previousTemplate = store.getState().template;
    return store.subscribe(() => {
      const s = store.getState();
      if (s.version === previousVersion) return;
      previousVersion = s.version;
      if (s.template === previousTemplate) return;
      previousTemplate = s.template;
      if (s.template === lastEmitted.current) return; // our own external replacement
      lastEmitted.current = s.template;
      callback.current?.(s.template);
    });
  }, [store]);

  useEffect(() => {
    if (template === undefined || template === lastEmitted.current || template === store.getState().template) return;
    lastEmitted.current = template;
    store.replaceTemplate(template);
  }, [template, store]);
}

/** Subscribe to the whole editor state. Prefer `useEditorSelector` to limit re-renders. */
export function useEditorState(store: EditorStore): EditorState {
  return useSyncExternalStore(store.subscribe, store.getState, store.getState);
}

/**
 * Subscribe to a derived slice. The component re-renders only when the
 * selected value changes according to `isEqual` (default `Object.is`).
 */
export function useEditorSelector<T>(store: EditorStore, selector: (s: EditorState) => T, isEqual: (a: T, b: T) => boolean = Object.is): T {
  const cache = useRef<{ state: EditorState; value: T } | null>(null);
  const get = useCallback(() => {
    const state = store.getState();
    const c = cache.current;
    if (c && c.state === state) return c.value;
    const value = selector(state);
    if (c && isEqual(c.value, value)) {
      cache.current = { state, value: c.value };
      return c.value;
    }
    cache.current = { state, value };
    return value;
  }, [store, selector, isEqual]);
  return useSyncExternalStore(store.subscribe, get, get);
}

export const shallowArrayEqual = <T>(a: readonly T[], b: readonly T[]) => a.length === b.length && a.every((v, i) => Object.is(v, b[i]));

/** Typed convenience commands bound to a store. */
export function useEditorCommands(store: EditorStore) {
  return useMemo(
    () => ({
      dispatch: (cmd: EditorCommand, o?: DispatchOptions) => store.dispatch(cmd, o),
      addElement: (type: ElementType, at?: { x: number; y: number }) => store.dispatch({ type: "addElements", elements: [createElement(store.getState().template, type, at ?? {})] }),
      updateElement: (id: string, patch: ElementPatch, coalesceKey?: string) => store.dispatch({ type: "updateElement", id, patch }, coalesceKey ? { coalesceKey } : {}),
      moveSelection: (dx: number, dy: number, coalesceKey?: string) => store.dispatch({ type: "moveElements", ids: store.getState().selection, dx, dy }, coalesceKey ? { coalesceKey } : {}),
      removeSelection: () => store.dispatch({ type: "removeElements", ids: store.getState().selection }),
      duplicateSelection: (offset: number) => store.dispatch({ type: "duplicateElements", ids: store.getState().selection, offset }),
      reorder: (id: string, to: "front" | "back" | "forward" | "backward" | number) => store.dispatch({ type: "reorderElement", id, to }),
      select: (ids: readonly string[], mode?: "replace" | "add" | "toggle") => store.select(ids, mode),
      undo: () => store.undo(),
      redo: () => store.redo(),
    }),
    [store],
  );
}
