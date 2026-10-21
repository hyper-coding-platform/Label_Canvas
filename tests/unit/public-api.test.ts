/**
 * Public API contract (release gates G23/G24). Changing an entry's exports
 * must be deliberate: update this list, docs/API.md and docs/CHANGELOG.md.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import * as core from "../../src/entries/core";
import * as headless from "../../src/entries/headless";
import * as main from "../../src/entries/index";
import * as presets from "../../src/entries/presets";
import * as renderer from "../../src/entries/renderer";

const CORE = [
  "AbortError", "BUILT_IN_FONTS", "BUILT_IN_MIGRATIONS", "BarcodeValueError", "CURRENT_SCHEMA_VERSION", "DEFAULT_LIMITS", "LabelStudioError",
  "SHAPE_KINDS", "STYLE_OVERRIDE_KEYS", "SUPPORTED_SYMBOLOGIES", "SYMBOLOGIES", "applyStyleRules", "TemplateConflictError", "TemplateValidationError", "buildCalibrationDocument", "buildPrintDocument",
  "cloneTemplate", "computePageSpec", "convertLength", "createCachingBarcodeAdapter", "createFontRegistry", "createLocalStorageTemplateStorage",
  "createMemoryTemplateStorage", "defaultBarcodeAdapter", "duplicateStoredTemplate", "estimateTextMeasurer",
  "evaluateCondition", "fromMm", "generateLabels", "generateLabelsToArray",
  "getTemplateFieldPaths", "gs1CheckDigit", "inferDataSchema", "isLabelStudioError", "migrateTemplate", "normalizeRotation", "paginate",
  "parsePath", "parseTemplate", "prepareTemplate", "printCss", "printHtml", "printLabels", "ptToUnit", "renderLabel", "renderNodeToSvgString",
  "resolveValue", "rotatedBounds", "roundTo", "sampleRecordFromSchema", "serializeTemplate", "toMm", "unitToPt", "validateBarcodeValue",
  "validateTemplate", "validateTemplateData",
];
/** Preset catalog: a separate entry so /core does not ship it (re-exported by the root entry). */
const PRESETS = ["createPresetRegistry", "getPresetSizes", "getPresetTemplate", "getPresetTemplates"];
const RENDERER = ["BarcodePreview", "LabelRenderer", "createCanvasTextMeasurer", "renderNodeToReact"];
const HEADLESS = [
  "DEFAULT_SETTINGS", "LabelRenderer", "RESIZE_HANDLES", "alignRects", "applyCommand", "clampZoom", "convertTemplateUnits", "createBlankTemplate",
  "createDrawingElement", "createEditorStore", "createElement", "fitZoom", "panBy", "labelToScreen", "pixelsPerUnit", "resizeRect", "screenDeltaToLabel", "screenToLabel",
  "shallowArrayEqual", "snapMove", "useControlledTemplate", "useEditorCommands", "useEditorSelector", "useEditorState", "useEditorStore",
  "useTemplateStorage", "zoomAt",
];
const MAIN_ONLY = ["BarcodeEditor", "DEFAULT_COMPONENTS", "LabelEditor", "darkTheme", "themeToCssVariables"];

describe("public API", () => {
  it.each([
    ["core", core, CORE],
    ["presets", presets, PRESETS],
    ["renderer", renderer, RENDERER],
    ["headless", headless, HEADLESS],
    ["index", main, [...new Set([...CORE, ...PRESETS, ...RENDERER, ...HEADLESS, ...MAIN_ONLY])]],
  ] as const)("%s exports exactly the documented names, none undefined", (_name, mod, expected) => {
    expect(Object.keys(mod).sort()).toEqual([...expected].sort());
    for (const [k, v] of Object.entries(mod)) expect(v, k).not.toBeUndefined();
  });

  it("every runtime export is documented in docs/API.md", () => {
    const doc = readFileSync(join(__dirname, "..", "..", "docs", "API.md"), "utf8");
    // Documented as `name` or `name(…)`.
    const missing = [...new Set([...CORE, ...PRESETS, ...RENDERER, ...HEADLESS, ...MAIN_ONLY])].filter((n) => !doc.includes(`\`${n}\``) && !doc.includes(`\`${n}(`));
    expect(missing).toEqual([]);
  });
});
