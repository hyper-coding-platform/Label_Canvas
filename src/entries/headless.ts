/**
 * @your-org/erp-label-studio/headless
 *
 * React hooks over the framework-independent EditorStore, for hosts that
 * build their own editor UI. No UI components are included.
 */
export { useEditorStore, useEditorState, useEditorSelector, useEditorCommands, useControlledTemplate, shallowArrayEqual } from "../react/headless/hooks";
export type { UseEditorStoreOptions } from "../react/headless/hooks";
export { createEditorStore, DEFAULT_SETTINGS } from "../core/editor/editor-store";
export type { EditorStore, EditorState, EditorSettings, EditorTool, EditorStoreOptions, DispatchOptions, DispatchResult } from "../core/editor/editor-store";
export { applyCommand, convertTemplateUnits } from "../core/editor/commands";
export type { EditorCommand, ElementPatch, TemplateMetaPatch, CommandResult } from "../core/editor/commands";
export { createElement, createBlankTemplate, createDrawingElement } from "../core/editor/element-factory";
export type { CreateElementOptions, DrawingStrokeOptions } from "../core/editor/element-factory";
export { snapMove, resizeRect, alignRects, RESIZE_HANDLES } from "../core/editor/interactions";
export type { Guide, ResizeHandle, SnapOptions, ResizeOptions } from "../core/editor/interactions";
export { screenToLabel, labelToScreen, screenDeltaToLabel, pixelsPerUnit, fitZoom, zoomAt, clampZoom, panBy } from "../core/geometry/viewport";
export type { Viewport } from "../core/geometry/viewport";
export { useTemplateStorage } from "../react/headless/use-template-storage";
export type { UseTemplateStorageResult, TemplateStorageState } from "../react/headless/use-template-storage";
export { LabelRenderer } from "../react/renderer/LabelRenderer";
export type { LabelRendererProps } from "../react/renderer/LabelRenderer";
