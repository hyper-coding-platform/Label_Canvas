/**
 * Framework-independent editing session (DECISIONS D-011).
 *
 * - Single source of truth: template, selection, viewport, settings, history.
 * - Validation gate: every command result is validated before it is
 *   committed; invalid results are rejected and reported via `lastRejection`,
 *   so no UI (default or custom) can put the template into an invalid state.
 * - History stores template snapshots. Unchanged elements are shared between
 *   snapshots, so memory grows with the size of edits, not template size.
 *   Entries with the same `coalesceKey` within `coalesceMs` merge (typing,
 *   nudging), and the stack is capped at `historyLimit`.
 * - `replaceTemplate` (external change) clears history: undo never crosses an
 *   external replacement.
 */
import { TemplateValidationError, type Issue } from "../errors";
import type { Viewport } from "../geometry/viewport";
import type { LabelTemplate } from "../schema/types";
import { validateTemplate, type ValidateOptions } from "../validation/validate-template";
import { applyCommand, type EditorCommand } from "./commands";

export type EditorTool = "select" | "hand" | "pencil";

export interface EditorSettings {
  readonly gridSize: number;
  readonly showGrid: boolean;
  readonly snapToGrid: boolean;
  readonly snapToElements: boolean;
  readonly showRulers: boolean;
  /**
   * Active canvas tool: `select` (cursor: select, move, resize, marquee), `hand`
   * (drag pans the view; never edits) or `pencil` (freehand drawing). A view
   * setting only: switching tools never changes the template or history.
   */
  readonly tool: EditorTool;
}

export interface EditorState {
  readonly template: LabelTemplate;
  readonly selection: readonly string[];
  readonly viewport: Viewport;
  readonly settings: EditorSettings;
  /** Warnings for the current template (errors are never committed). */
  readonly warnings: readonly Issue[];
  /** Issues of the most recently rejected command, cleared by the next successful one. */
  readonly lastRejection: readonly Issue[] | null;
  readonly canUndo: boolean;
  readonly canRedo: boolean;
  /** True when the template differs from the last `markSaved` baseline. */
  readonly dirty: boolean;
  /** Increments on every committed template change (useful as a cheap change token). */
  readonly version: number;
}

export interface DispatchOptions {
  /** Merge with the previous history entry when keys match within `coalesceMs`. */
  readonly coalesceKey?: string;
  /** Do not change the selection even if the command suggests one. */
  readonly keepSelection?: boolean;
}

export interface DispatchResult {
  readonly ok: boolean;
  readonly issues: readonly Issue[];
}

export interface EditorStoreOptions extends ValidateOptions {
  readonly historyLimit?: number;
  readonly coalesceMs?: number;
  readonly settings?: Partial<EditorSettings>;
  /** Clock for coalescing (injectable for tests). */
  readonly now?: () => number;
}

export interface EditorStore {
  getState(): EditorState;
  subscribe(listener: () => void): () => void;
  dispatch(command: EditorCommand, options?: DispatchOptions): DispatchResult;
  undo(): boolean;
  redo(): boolean;
  select(ids: readonly string[], mode?: "replace" | "add" | "toggle"): void;
  setViewport(viewport: Viewport): void;
  updateSettings(patch: Partial<EditorSettings>): void;
  /** Replace the whole template (external change). Validates; clears history; keeps surviving selection. */
  replaceTemplate(template: LabelTemplate, options?: { markSaved?: boolean }): DispatchResult;
  /** Record the given (or current) template as the saved baseline. */
  markSaved(template?: LabelTemplate): void;
  /** Stop accepting changes and drop listeners. */
  destroy(): void;
}

export const DEFAULT_SETTINGS: EditorSettings = Object.freeze({
  gridSize: 1,
  showGrid: true,
  snapToGrid: true,
  snapToElements: true,
  showRulers: true,
  tool: "select",
});

interface HistoryEntry {
  readonly template: LabelTemplate;
  readonly selection: readonly string[];
  readonly key: string | undefined;
  readonly at: number;
}

export function createEditorStore(initial: LabelTemplate, options: EditorStoreOptions = {}): EditorStore {
  const limit = Math.max(1, options.historyLimit ?? 200);
  const coalesceMs = options.coalesceMs ?? 1000;
  const now = options.now ?? (() => Date.now());
  const validate = (t: unknown) => validateTemplate(t, options);

  const first = validate(initial);
  if (!first.valid || !first.template) {
    throw new TemplateValidationError(first.issues);
  }

  let past: HistoryEntry[] = [];
  let future: HistoryEntry[] = [];
  let savedTemplate: LabelTemplate = first.template;
  let destroyed = false;
  const listeners = new Set<() => void>();

  let state: EditorState = {
    template: first.template,
    selection: [],
    viewport: { zoom: 1, panX: 0, panY: 0 },
    settings: { ...DEFAULT_SETTINGS, ...options.settings },
    warnings: first.issues,
    lastRejection: null,
    canUndo: false,
    canRedo: false,
    dirty: false,
    version: 0,
  };

  /**
   * Notify every listener even if one throws; the first error is rethrown
   * asynchronously so it still reaches the host's error reporting without
   * corrupting the store's state or skipping other subscribers.
   */
  const emit = () => {
    let failure: { error: unknown } | null = null;
    for (const l of [...listeners]) {
      try {
        l();
      } catch (error) {
        failure ??= { error };
      }
    }
    if (failure) {
      const { error } = failure;
      queueMicrotask(() => {
        throw error;
      });
    }
  };
  const set = (patch: Partial<EditorState>) => {
    state = { ...state, ...patch, canUndo: past.length > 0, canRedo: future.length > 0 };
    emit();
  };
  const surviving = (t: LabelTemplate, ids: readonly string[]) => {
    const exists = new Set(t.elements.map((e) => e.id));
    return ids.filter((id) => exists.has(id));
  };

  const store: EditorStore = {
    getState: () => state,
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },

    dispatch(command, opts = {}) {
      if (destroyed) return { ok: false, issues: [] };
      let result;
      try {
        result = applyCommand(state.template, command);
      } catch (e) {
        const issues: Issue[] = [{ code: "COMMAND_FAILED", severity: "error", path: "", message: e instanceof Error ? e.message : "Command failed." }];
        set({ lastRejection: issues });
        return { ok: false, issues };
      }
      if (result.template === state.template) {
        if (result.select && !opts.keepSelection) set({ selection: surviving(state.template, result.select) });
        return { ok: true, issues: [] };
      }
      const checked = validate(result.template);
      if (!checked.valid || !checked.template) {
        set({ lastRejection: checked.issues });
        return { ok: false, issues: checked.issues };
      }
      const at = now();
      const top = past[past.length - 1];
      const coalesce = opts.coalesceKey !== undefined && top !== undefined && top.key === opts.coalesceKey && at - top.at <= coalesceMs && future.length === 0;
      if (coalesce) {
        past[past.length - 1] = { ...top, key: opts.coalesceKey, at };
      } else {
        past.push({ template: state.template, selection: state.selection, key: opts.coalesceKey, at });
        if (past.length > limit) past = past.slice(past.length - limit);
      }
      future = [];
      // Commit the command's own result (not the validator's normalized copy) to keep structural sharing.
      const template = result.template;
      const selection = opts.keepSelection || !result.select ? surviving(template, state.selection) : result.select;
      set({ template, selection, warnings: checked.issues, lastRejection: null, dirty: template !== savedTemplate, version: state.version + 1 });
      return { ok: true, issues: checked.issues };
    },

    undo() {
      const entry = past.pop();
      if (!entry || destroyed) return false;
      future.push({ template: state.template, selection: state.selection, key: undefined, at: now() });
      set({ template: entry.template, selection: surviving(entry.template, entry.selection), warnings: validate(entry.template).issues, lastRejection: null, dirty: entry.template !== savedTemplate, version: state.version + 1 });
      return true;
    },

    redo() {
      const entry = future.pop();
      if (!entry || destroyed) return false;
      past.push({ template: state.template, selection: state.selection, key: undefined, at: now() });
      set({ template: entry.template, selection: surviving(entry.template, entry.selection), warnings: validate(entry.template).issues, lastRejection: null, dirty: entry.template !== savedTemplate, version: state.version + 1 });
      return true;
    },

    select(ids, mode = "replace") {
      if (destroyed) return;
      const valid = surviving(state.template, ids);
      let next: string[];
      if (mode === "replace") next = [...new Set(valid)];
      else if (mode === "add") next = [...new Set([...state.selection, ...valid])];
      else {
        const s = new Set(state.selection);
        for (const id of valid) {
          if (s.has(id)) s.delete(id);
          else s.add(id);
        }
        next = [...s];
      }
      if (next.length === state.selection.length && next.every((id, i) => id === state.selection[i])) return;
      set({ selection: next });
    },

    setViewport(viewport) {
      if (destroyed) return;
      const v = state.viewport;
      if (v.zoom === viewport.zoom && v.panX === viewport.panX && v.panY === viewport.panY) return;
      set({ viewport });
    },

    updateSettings(patch) {
      if (destroyed) return;
      set({ settings: { ...state.settings, ...patch } });
    },

    replaceTemplate(template, opts = {}) {
      if (destroyed) return { ok: false, issues: [] };
      const checked = validate(template);
      if (!checked.valid || !checked.template) {
        set({ lastRejection: checked.issues });
        return { ok: false, issues: checked.issues };
      }
      past = [];
      future = [];
      if (opts.markSaved) savedTemplate = template;
      set({ template, selection: surviving(template, state.selection), warnings: checked.issues, lastRejection: null, dirty: template !== savedTemplate, version: state.version + 1 });
      return { ok: true, issues: checked.issues };
    },

    markSaved(template) {
      savedTemplate = template ?? state.template;
      set({ dirty: state.template !== savedTemplate });
    },

    destroy() {
      destroyed = true;
      listeners.clear();
      past = [];
      future = [];
    },
  };
  return store;
}
