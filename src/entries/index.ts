/**
 * @pythonprakash/erp-label-studio
 *
 * Full client entry: core + renderer + headless + default editor UI.
 * Import "@pythonprakash/erp-label-studio/styles.css" once in the host app.
 */
export * from "./core";
export * from "./renderer";
export * from "./headless";
export * from "./presets";
export { LabelEditor, BarcodeEditor } from "../react/editor/LabelEditor";
export type { LabelEditorProps } from "../react/editor/LabelEditor";
export type { EditorUiConfig } from "../react/editor/config";
export type { EditorTheme } from "../react/editor/theme";
export { darkTheme, themeToCssVariables } from "../react/editor/theme";
export { DEFAULT_COMPONENTS } from "../react/editor/slots";
export type {
  EditorComponents,
  ButtonSlotProps,
  TextInputSlotProps,
  NumberInputSlotProps,
  SelectSlotProps,
  SelectOption,
  CheckboxSlotProps,
  ColorInputSlotProps,
  FieldSlotProps,
  SectionSlotProps,
} from "../react/editor/slots";
