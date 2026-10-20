import type { ElementType } from "../../core/schema/types";

/** Layout configuration for the default editor UI. Every part can be shown, hidden or resized independently. */
export interface EditorUiConfig {
  /** Toolbar placement. Default `top`. */
  readonly toolbar?: "top" | "bottom" | "hidden" | undefined;
  /** Properties (inspector) panel. Default `right`. */
  readonly propertiesPanel?: "right" | "left" | "hidden" | undefined;
  /** Layers panel. Default `left`. */
  readonly layersPanel?: "left" | "right" | "hidden" | undefined;
  readonly rulers?: boolean | undefined;
  readonly statusBar?: boolean | undefined;
  /** CSS width of side panels. Default `280px`. */
  readonly panelWidth?: string | undefined;
  /** Minimum editor height (CSS). Default `480px`. */
  readonly minHeight?: string | undefined;
  /** Element types offered in the toolbar. Default: all. */
  readonly elementTypes?: readonly ElementType[] | undefined;
  /** Show the save button (requires `onSave`). Default true. */
  readonly saveButton?: boolean | undefined;
  /** Show the print button. Default true. */
  readonly printButton?: boolean | undefined;
  /** Show template-level settings (size, unit, DPI) when nothing is selected. Default true. */
  readonly templateSettings?: boolean | undefined;
}

export interface ResolvedUiConfig {
  readonly toolbar: "top" | "bottom" | "hidden";
  readonly propertiesPanel: "right" | "left" | "hidden";
  readonly layersPanel: "left" | "right" | "hidden";
  readonly rulers: boolean;
  readonly statusBar: boolean;
  readonly panelWidth: string;
  readonly minHeight: string;
  readonly elementTypes: readonly ElementType[];
  readonly saveButton: boolean;
  readonly printButton: boolean;
  readonly templateSettings: boolean;
}

export const ALL_ELEMENT_TYPES: readonly ElementType[] = ["text", "barcode", "qrcode", "image", "rect", "line"];

export function resolveUiConfig(ui: EditorUiConfig | undefined): ResolvedUiConfig {
  return {
    toolbar: ui?.toolbar ?? "top",
    propertiesPanel: ui?.propertiesPanel ?? "right",
    layersPanel: ui?.layersPanel ?? "left",
    rulers: ui?.rulers ?? true,
    statusBar: ui?.statusBar ?? true,
    panelWidth: ui?.panelWidth ?? "280px",
    minHeight: ui?.minHeight ?? "480px",
    elementTypes: ui?.elementTypes ?? ALL_ELEMENT_TYPES,
    saveButton: ui?.saveButton ?? true,
    printButton: ui?.printButton ?? true,
    templateSettings: ui?.templateSettings ?? true,
  };
}
