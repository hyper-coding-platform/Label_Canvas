/**
 * @suriyaprakashm14/erp-label-studio/core
 *
 * Framework-independent engine: no React, no DOM access at import time.
 * Safe to import from server code, workers and Node.js.
 */

// Errors
export { LabelStudioError, TemplateValidationError, BarcodeValueError, TemplateConflictError, AbortError, isLabelStudioError } from "../core/errors";
export type { ErrorCode, Issue } from "../core/errors";

// Schema
export { CURRENT_SCHEMA_VERSION } from "../core/schema/types";
export type * from "../core/schema/types";
export { DEFAULT_LIMITS } from "../core/schema/limits";
export type { TemplateLimits } from "../core/schema/limits";
export { BUILT_IN_FONTS, createFontRegistry } from "../core/schema/fonts";
export type { FontDefinition, FontMetrics, FontRegistry } from "../core/schema/fonts";

// Validation, parsing, migration
export { validateTemplate } from "../core/validation/validate-template";
export type { ValidateOptions, ValidationResult } from "../core/validation/validate-template";
export { parseTemplate, migrateTemplate, serializeTemplate, BUILT_IN_MIGRATIONS } from "../core/validation/parse-template";
export type { ParseOptions, ParseResult, TemplateMigration } from "../core/validation/parse-template";
export { validateTemplateData, getTemplateFieldPaths } from "../core/validation/validate-data";
export type { DataValidationOptions } from "../core/validation/validate-data";

// Binding
export { parsePath } from "../core/binding/path";
export { resolveValue } from "../core/binding/resolve";
export type { ResolvedValue } from "../core/binding/resolve";
export { evaluateCondition } from "../core/binding/conditions";
export { sampleRecordFromSchema } from "../core/binding/sample";

// Geometry and units
export { convertLength, toMm, fromMm, ptToUnit, unitToPt, roundTo } from "../core/geometry/units";
export { rotatedBounds, normalizeRotation } from "../core/geometry/rect";
export type { Point, Rect } from "../core/geometry/rect";

// Barcodes
export { defaultBarcodeAdapter, validateBarcodeValue, SYMBOLOGIES, SUPPORTED_SYMBOLOGIES } from "../core/barcode/adapter";
export { gs1CheckDigit } from "../core/barcode/checksum";
export type { BarcodeAdapter, BarcodeValidation, EncodedSymbol, LinearSymbol, MatrixSymbol, SymbologyId, SymbologyInfo, EncodeOptions } from "../core/barcode/types";

// Rendering
export { renderLabel, prepareTemplate } from "../core/render/render-label";
export { applyStyleRules, STYLE_OVERRIDE_KEYS } from "../core/render/style-rules";
export type { StyledElement } from "../core/render/style-rules";
export { SHAPE_KINDS } from "../core/render/shapes";
export type { RenderOptions, RenderResult } from "../core/render/render-label";
export { renderNodeToSvgString } from "../core/render/svg-serializer";
export type { RenderNode, SvgTag } from "../core/render/nodes";
export { estimateTextMeasurer } from "../core/render/text-layout";
export type { TextMeasurer, MeasureFont } from "../core/render/text-layout";
export type { ImagePolicy } from "../core/render/image-policy";

// Templates (the preset catalog lives in the /presets entry so that /core stays small)
export { cloneTemplate } from "../core/validation/clone-template";
export { inferDataSchema } from "../core/binding/infer-schema";
export type { InferSchemaOptions } from "../core/binding/infer-schema";

// Print layout types
export type { PrintLayout, RollLayout, SheetLayout } from "../core/print/layout-types";

// Bulk generation
export { generateLabels, generateLabelsToArray } from "../core/batch/generate";
export type { GenerateOptions, GeneratedLabel, BatchProgress } from "../core/batch/generate";

// Printing
export { computePageSpec, paginate } from "../core/print/layout";
export type { PageSpec, Slot, Placement, LabelSize, PaginateOptions } from "../core/print/layout";
export { buildPrintDocument, printCss } from "../core/print/document";
export type { PrintDocument, PrintDocumentOptions } from "../core/print/document";
export { printLabels, printHtml } from "../core/print/browser-print";
export type { PrintOptions, PrintResult } from "../core/print/browser-print";
export { buildCalibrationDocument } from "../core/print/calibration";

// Persistence
export { createMemoryTemplateStorage, createLocalStorageTemplateStorage, duplicateStoredTemplate } from "../core/storage/storage";
export type { TemplateStorage, StoredTemplate, TemplateSummary, ListOptions, ListResult, StorageOptions, LocalStorageOptions } from "../core/storage/storage";
export { createCachingBarcodeAdapter } from "../core/barcode/cache";
