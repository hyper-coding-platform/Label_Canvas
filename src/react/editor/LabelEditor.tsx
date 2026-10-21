import { useCallback, useEffect, useId, useMemo, useRef, useState, type CSSProperties, type KeyboardEvent } from "react";
import { defaultBarcodeAdapter } from "../../core/barcode/adapter";
import { createCachingBarcodeAdapter } from "../../core/barcode/cache";
import type { BarcodeAdapter } from "../../core/barcode/types";
import { sampleRecordFromSchema } from "../../core/binding/sample";
import { panBy } from "../../core/geometry/viewport";
import { createBlankTemplate } from "../../core/editor/element-factory";
import type { EditorSettings, EditorStore } from "../../core/editor/editor-store";
import type { Issue } from "../../core/errors";
import type { ImagePolicy } from "../../core/render/image-policy";
import { estimateTextMeasurer, type TextMeasurer } from "../../core/render/text-layout";
import { DEFAULT_FONT_REGISTRY, type FontRegistry } from "../../core/schema/fonts";
import type { TemplateLimits } from "../../core/schema/limits";
import type { DataRecord, DataSchema, LabelTemplate } from "../../core/schema/types";
import { validateTemplate } from "../../core/validation/validate-template";
import { useControlledTemplate, useEditorSelector, useEditorStore } from "../headless/hooks";
import { resolveUiConfig, type EditorUiConfig } from "./config";
import { EditorContext, type EditorContextValue, type SaveStatus } from "./context";
import { EditorCanvas } from "./EditorCanvas";
import { EditorToolbar, setTool } from "./EditorToolbar";
import { LayersPanel } from "./LayersPanel";
import { PrintDialog } from "./PrintDialog";
import { PropertiesPanel } from "./PropertiesPanel";
import { Ruler } from "./Rulers";
import { DEFAULT_COMPONENTS, type EditorComponents } from "./slots";
import { StatusBar } from "./StatusBar";
import { themeToCssVariables, type EditorTheme } from "./theme";

export interface LabelEditorProps {
  /** Controlled template. Edits are reported through `onTemplateChange`; a new value from the host replaces the editor's template (and clears undo history). */
  readonly template?: LabelTemplate | undefined;
  /** Uncontrolled initial template (read once on mount). */
  readonly defaultTemplate?: LabelTemplate | undefined;
  /** Alias of `defaultTemplate`. */
  readonly initialTemplate?: LabelTemplate | undefined;
  readonly onTemplateChange?: ((template: LabelTemplate) => void) | undefined;
  /**
   * Persist the template. May return the stored template (e.g. with a new id);
   * it replaces the editor state when no edits happened during the save.
   * A rejected promise is shown as a save error; the template stays dirty.
   */
  readonly onSave?: ((template: LabelTemplate) => void | LabelTemplate | Promise<void | LabelTemplate>) | undefined;
  /**
   * Replaces the built-in print preview: called by the toolbar print action
   * with the current template and preview record. Omit to use the built-in
   * print preview dialog (browser printing).
   */
  readonly onPrint?: ((template: LabelTemplate, record: DataRecord | undefined) => void) | undefined;
  readonly onSelectionChange?: ((ids: readonly string[]) => void) | undefined;
  /** Errors from host callbacks (onSave/onPrint) and rejected external templates. */
  readonly onError?: ((error: unknown) => void) | undefined;
  /** Fields the host can supply; drives the field picker. */
  readonly dataSchema?: DataSchema | undefined;
  /** Preview record(s). Defaults to a record built from `dataSchema` examples. */
  readonly sampleData?: DataRecord | readonly DataRecord[] | undefined;
  readonly theme?: EditorTheme | undefined;
  readonly ui?: EditorUiConfig | undefined;
  readonly components?: Partial<EditorComponents> | undefined;
  readonly readOnly?: boolean | undefined;
  readonly fonts?: FontRegistry | undefined;
  readonly imagePolicy?: ImagePolicy | undefined;
  readonly barcodeAdapter?: BarcodeAdapter | undefined;
  readonly textMeasurer?: TextMeasurer | undefined;
  readonly limits?: Partial<TemplateLimits> | undefined;
  readonly settings?: Partial<EditorSettings> | undefined;
  /** Use an externally created store (headless + default UI hybrid). Template props are then ignored. */
  readonly store?: EditorStore | undefined;
  readonly className?: string | undefined;
  readonly style?: CSSProperties | undefined;
  readonly "aria-label"?: string | undefined;
}

/**
 * The embeddable label editor. Renders only inside its own root element:
 * no global styles, no portals to <body>, no routing, no persistence of its own.
 */
export function LabelEditor(props: LabelEditorProps) {
  const initial = props.store ? props.store.getState().template : (props.template ?? props.defaultTemplate ?? props.initialTemplate ?? null);
  const validation = useMemo(
    () => (initial ? validateTemplate(initial, { ...(props.fonts ? { fonts: props.fonts } : {}), ...(props.imagePolicy ? { imagePolicy: props.imagePolicy } : {}), ...(props.barcodeAdapter ? { barcodeAdapter: props.barcodeAdapter } : {}), ...(props.limits ? { limits: props.limits } : {}) }) : null),
    // Only the initial template decides whether the editor can mount.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );
  if (validation && !validation.valid) return <EditorError issues={validation.issues} className={props.className} style={props.style} />;
  return props.store ? <ExternalStoreEditor {...props} store={props.store} /> : <OwnedStoreEditor {...props} initial={initial ?? createBlankTemplate()} />;
}

/** `BarcodeEditor` is an alias of `LabelEditor`. */
export const BarcodeEditor = LabelEditor;

/** Host callbacks must never break the editor: exceptions go to onError (or the console). */
function safeTemplateChange(props: LabelEditorProps): ((t: LabelTemplate) => void) | undefined {
  const { onTemplateChange, onError } = props;
  if (!onTemplateChange) return undefined;
  return (t) => {
    try {
      onTemplateChange(t);
    } catch (e) {
      if (onError) onError(e);
      else console.error("LabelEditor: onTemplateChange threw", e);
    }
  };
}

function OwnedStoreEditor(props: LabelEditorProps & { initial: LabelTemplate }) {
  const onTemplateChange = safeTemplateChange(props);
  const store = useEditorStore(props.initial, {
    ...(props.template ? { template: props.template } : {}),
    ...(onTemplateChange ? { onTemplateChange } : {}),
    ...(props.fonts ? { fonts: props.fonts } : {}),
    ...(props.imagePolicy ? { imagePolicy: props.imagePolicy } : {}),
    ...(props.barcodeAdapter ? { barcodeAdapter: props.barcodeAdapter } : {}),
    ...(props.limits ? { limits: props.limits } : {}),
    ...(props.settings ? { settings: props.settings } : {}),
  });
  return <EditorShell {...props} store={store} />;
}

function ExternalStoreEditor(props: LabelEditorProps & { store: EditorStore }) {
  useControlledTemplate(props.store, undefined, safeTemplateChange(props));
  return <EditorShell {...props} />;
}

function EditorError({ issues, className, style }: { issues: readonly Issue[]; className?: string | undefined; style?: CSSProperties | undefined }) {
  const errors = issues.filter((i) => i.severity === "error");
  return (
    <div className={["els-root", "els-root--error", className].filter(Boolean).join(" ")} style={style} role="alert" data-testid="els-error">
      <h2 className="els-error__title">This label template cannot be opened</h2>
      <p>The template failed validation. Fix the problems below or load another template.</p>
      <ul className="els-error__list">
        {errors.slice(0, 20).map((i, k) => (
          <li key={k}>
            <code>{i.path || "/"}</code> {i.message}
          </li>
        ))}
        {errors.length > 20 && <li>…and {errors.length - 20} more</li>}
      </ul>
    </div>
  );
}

const isEditableTarget = (t: EventTarget | null) => t instanceof Element && !!t.closest("input, textarea, select, [contenteditable='true']");

function EditorShell(props: LabelEditorProps & { store: EditorStore }) {
  const { store, onSave, onPrint, onError, onSelectionChange, readOnly = false } = props;
  const ui = useMemo(() => resolveUiConfig(props.ui), [props.ui]);
  const c = useMemo(() => ({ ...DEFAULT_COMPONENTS, ...props.components }), [props.components]);
  const idBase = `els${useId().replace(/[^A-Za-z0-9_-]/g, "")}`;
  const fonts = props.fonts ?? DEFAULT_FONT_REGISTRY;

  const records = useMemo<readonly DataRecord[]>(() => {
    const s = props.sampleData;
    if (Array.isArray(s)) return s.length ? (s as readonly DataRecord[]) : [sampleRecordFromSchema(props.dataSchema)];
    if (s && typeof s === "object") return [s as DataRecord];
    return [sampleRecordFromSchema(props.dataSchema)];
  }, [props.sampleData, props.dataSchema]);
  const [recordIndex, setRecordIndex] = useState(0);
  const safeIndex = Math.min(recordIndex, records.length - 1);

  // Per-editor bounded encoding cache: the canvas re-renders the same symbols after every edit.
  const barcodeAdapter = useMemo(() => createCachingBarcodeAdapter(props.barcodeAdapter ?? defaultBarcodeAdapter, { maxEntries: 512 }), [props.barcodeAdapter]);
  const renderOptions = useMemo(
    () => ({
      fonts,
      textMeasurer: props.textMeasurer ?? estimateTextMeasurer,
      barcodeAdapter,
      ...(props.imagePolicy ? { imagePolicy: props.imagePolicy } : {}),
      ...(props.limits ? { limits: props.limits } : {}),
    }),
    [fonts, props.textMeasurer, props.imagePolicy, barcodeAdapter, props.limits],
  );

  // Live region for screen-reader announcements.
  const [announcement, setAnnouncement] = useState("");
  const announce = useCallback((m: string) => {
    setAnnouncement("");
    // Re-set on the next frame so repeated identical messages are announced.
    requestAnimationFrame(() => setAnnouncement(m));
  }, []);

  // Callbacks are read through refs so stale closures are never invoked after re-render.
  const cb = useRef({ onSave, onPrint, onError, onSelectionChange });
  useEffect(() => {
    cb.current = { onSave, onPrint, onError, onSelectionChange };
  });
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  const selection = useEditorSelector(store, (s) => s.selection);
  useEffect(() => {
    try {
      cb.current.onSelectionChange?.(selection);
    } catch (e) {
      cb.current.onError?.(e);
    }
  }, [selection]);

  const [saveStatus, setSaveStatus] = useState<SaveStatus>({ state: "idle" });
  const saving = useRef(false);
  const runSave = useCallback(async () => {
    const handler = cb.current.onSave;
    if (!handler || saving.current || readOnly) return;
    saving.current = true;
    setSaveStatus({ state: "saving" });
    const snapshot = store.getState().template;
    try {
      const result = await handler(snapshot);
      if (!mounted.current) return;
      if (result && typeof result === "object" && "schemaVersion" in result && store.getState().template === snapshot) {
        const r = store.replaceTemplate(result, { markSaved: true });
        if (!r.ok) throw new Error("The template returned by onSave is invalid.");
      } else {
        store.markSaved(snapshot);
      }
      setSaveStatus({ state: "saved" });
      announce("Saved");
    } catch (e) {
      if (!mounted.current) return;
      setSaveStatus({ state: "error", message: e instanceof Error ? e.message : "Unknown error" });
      announce("Save failed");
      cb.current.onError?.(e);
    } finally {
      saving.current = false;
    }
  }, [store, readOnly, announce]);

  const [printOpen, setPrintOpen] = useState(false);
  const runPrint = useCallback(() => {
    if (!cb.current.onPrint) {
      setPrintOpen(true);
      return;
    }
    try {
      cb.current.onPrint(store.getState().template, records[safeIndex]);
    } catch (e) {
      cb.current.onError?.(e);
    }
  }, [store, records, safeIndex]);

  const ctx: EditorContextValue = useMemo(
    () => ({
      store,
      ui,
      c,
      dataSchema: props.dataSchema,
      records,
      recordIndex: safeIndex,
      setRecordIndex,
      renderOptions,
      fonts,
      idBase,
      announce,
      readOnly,
      save: { status: saveStatus, available: !!onSave, run: () => void runSave() },
      print: { available: true, run: runPrint },
    }),
    [store, ui, c, props.dataSchema, records, safeIndex, renderOptions, fonts, idBase, announce, readOnly, saveStatus, onSave, runSave, runPrint],
  );

  const settings = useEditorSelector(store, (s) => s.settings);
  const unit = useEditorSelector(store, (s) => s.template.canvas.unit);

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.defaultPrevented) return;
    const mod = e.ctrlKey || e.metaKey;
    const key = e.key.toLowerCase();
    if (mod && key === "s" && onSave) {
      e.preventDefault();
      void runSave();
      return;
    }
    if (isEditableTarget(e.target)) return;
    const s = store.getState();
    if (mod && key === "z") {
      e.preventDefault();
      if (readOnly) return;
      const done = e.shiftKey ? store.redo() : store.undo();
      if (done) announce(e.shiftKey ? "Redone" : "Undone");
    } else if (mod && key === "y") {
      e.preventDefault();
      if (!readOnly && store.redo()) announce("Redone");
    } else if (mod && key === "d") {
      e.preventDefault();
      if (!readOnly && s.selection.length) store.dispatch({ type: "duplicateElements", ids: s.selection, offset: unit === "mm" ? 2 : unit === "in" ? 0.08 : 8 });
    } else if (mod && key === "a") {
      e.preventDefault();
      store.select(s.template.elements.filter((x) => x.visible !== false).map((x) => x.id));
    } else if ((e.key === "Delete" || e.key === "Backspace") && s.selection.length && !readOnly) {
      e.preventDefault();
      const n = s.selection.length;
      if (store.dispatch({ type: "removeElements", ids: s.selection }).ok) announce(`${n} element${n === 1 ? "" : "s"} deleted`);
    } else if (!mod && !e.altKey && (key === "v" || key === "h")) {
      setTool(store, key === "h" ? "hand" : "select", announce);
    } else if (e.key === "Escape" && s.settings.tool !== "select") {
      setTool(store, "select", announce);
    } else if (e.key.startsWith("Arrow") && s.settings.tool === "hand") {
      // Keyboard alternative to dragging with the Hand tool: arrows reveal the content in that direction.
      e.preventDefault();
      const step = e.shiftKey ? 200 : 50;
      store.setViewport(panBy(s.viewport, e.key === "ArrowLeft" ? step : e.key === "ArrowRight" ? -step : 0, e.key === "ArrowUp" ? step : e.key === "ArrowDown" ? -step : 0));
    } else if (e.key === "Escape" && s.selection.length) {
      store.select([]);
    } else if (e.key.startsWith("Arrow") && s.selection.length && !readOnly) {
      e.preventDefault();
      const base = settings.snapToGrid ? settings.gridSize : unit === "mm" ? 0.1 : unit === "in" ? 0.01 : 1;
      const step = base * (e.shiftKey ? 10 : 1);
      const dx = e.key === "ArrowLeft" ? -step : e.key === "ArrowRight" ? step : 0;
      const dy = e.key === "ArrowUp" ? -step : e.key === "ArrowDown" ? step : 0;
      const r = store.dispatch({ type: "updateElements", updates: s.template.elements.filter((x) => s.selection.includes(x.id) && !x.locked).map((x) => ({ id: x.id, patch: { x: Math.round((x.x + dx) * 1e4) / 1e4, y: Math.round((x.y + dy) * 1e4) / 1e4 } })) }, { coalesceKey: "nudge" });
      if (!r.ok) announce("Move rejected: the result would be invalid");
    }
  };

  const viewportId = `${idBase}-viewport`;
  const helpId = `${idBase}-help`;
  const showRulers = ui.rulers && settings.showRulers;
  const panel = (which: "layers" | "properties") => (
    <aside key={which} className={`els-panel els-panel--${which}`} aria-label={which === "layers" ? "Layers" : "Properties"} data-testid={`els-panel-${which}`}>
      {which === "layers" ? <LayersPanel /> : <PropertiesPanel />}
    </aside>
  );
  const left = [ui.layersPanel === "left" && panel("layers"), ui.propertiesPanel === "left" && panel("properties")];
  const right = [ui.propertiesPanel === "right" && panel("properties"), ui.layersPanel === "right" && panel("layers")];

  const style = { ...themeToCssVariables(props.theme), "--els-panel-width": ui.panelWidth, "--els-min-height": ui.minHeight, ...props.style } as CSSProperties;
  return (
    <EditorContext.Provider value={ctx}>
      <div
        className={["els-root", `els-density-${props.theme?.density ?? "comfortable"}`, props.className].filter(Boolean).join(" ")}
        data-color-scheme={props.theme?.colorScheme}
        style={style}
        role="group"
        aria-label={props["aria-label"] ?? "Label editor"}
        onKeyDown={onKeyDown}
        data-testid="els-root"
      >
        {ui.toolbar === "top" && <EditorToolbar canvasViewportId={viewportId} />}
        <div className="els-body">
          {left}
          <div className={`els-workspace${showRulers ? " els-workspace--rulers" : ""}`}>
            {showRulers && (
              <>
                <div className="els-ruler-corner" aria-hidden="true">{unit}</div>
                <Ruler orientation="horizontal" />
                <Ruler orientation="vertical" />
              </>
            )}
            <EditorCanvas viewportId={viewportId} describedBy={helpId} />
          </div>
          {right}
        </div>
        {ui.toolbar === "bottom" && <EditorToolbar canvasViewportId={viewportId} />}
        {ui.statusBar && <StatusBar />}
        <p id={helpId} className="els-visually-hidden">
          Click an element to select it, drag to move, drag handles to resize. Arrow keys move the selection (Shift for larger steps), Delete removes it, Ctrl+Z undoes, Ctrl+Shift+Z redoes, Ctrl+D duplicates. Press H for the Hand tool (drag or arrow keys pan the view; hold Space to pan with any tool), V for the Cursor tool, Escape to return to the Cursor. Use the Layers list to select elements with the keyboard and the
          Properties panel to set exact positions and sizes.
        </p>
        <div className="els-visually-hidden" role="status" aria-live="polite" data-testid="els-announcer">
          {announcement}
        </div>
        {printOpen && <PrintDialog onClose={() => setPrintOpen(false)} />}
      </div>
    </EditorContext.Provider>
  );
}
