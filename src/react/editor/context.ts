import { createContext, useContext } from "react";
import type { EditorStore } from "../../core/editor/editor-store";
import type { RenderOptions } from "../../core/render/render-label";
import type { DataRecord, DataSchema } from "../../core/schema/types";
import type { FontRegistry } from "../../core/schema/fonts";
import type { ResolvedUiConfig } from "./config";
import type { EditorComponents } from "./slots";

export type SaveStatus = { readonly state: "idle" | "saving" | "saved" } | { readonly state: "error"; readonly message: string };

export interface EditorContextValue {
  readonly store: EditorStore;
  readonly ui: ResolvedUiConfig;
  readonly c: EditorComponents;
  readonly dataSchema: DataSchema | undefined;
  readonly records: readonly DataRecord[];
  readonly recordIndex: number;
  readonly setRecordIndex: (i: number) => void;
  readonly renderOptions: Omit<RenderOptions, "mode" | "idPrefix" | "title" | "excludeElementIds">;
  readonly fonts: FontRegistry;
  /** Prefix for DOM ids inside this editor instance. */
  readonly idBase: string;
  readonly announce: (message: string) => void;
  readonly readOnly: boolean;
  readonly save: { readonly status: SaveStatus; readonly available: boolean; readonly run: () => void };
  readonly print: { readonly available: boolean; readonly run: () => void };
}

export const EditorContext = createContext<EditorContextValue | null>(null);

export function useEditorContext(): EditorContextValue {
  const ctx = useContext(EditorContext);
  if (!ctx) throw new Error("Editor components must be rendered inside <LabelEditor>.");
  return ctx;
}
