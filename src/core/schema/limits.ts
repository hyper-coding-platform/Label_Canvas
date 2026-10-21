/**
 * Resource limits. All limits are configurable per call; these defaults are
 * safe for interactive browser use. See docs/SECURITY.md.
 */
export interface TemplateLimits {
  /** Maximum serialized template size accepted by `parseTemplate` (bytes, UTF-16 length used as approximation). */
  readonly maxTemplateBytes: number;
  readonly maxElements: number;
  /** Largest canvas side in millimetres (converted from the template unit). */
  readonly maxCanvasMm: number;
  /** Smallest canvas side in millimetres. */
  readonly minCanvasMm: number;
  /** Elements may extend this many canvas-widths/heights beyond the canvas before it is an error. */
  readonly maxOverhangFactor: number;
  readonly maxIdLength: number;
  readonly maxNameLength: number;
  readonly maxDescriptionLength: number;
  readonly maxTags: number;
  /** Max length of static text, prefix, suffix, fallback (code points). */
  readonly maxTextLength: number;
  /** Max length of a resolved (bound) value (code points). Longer values are a record error. */
  readonly maxValueLength: number;
  readonly maxConditionDepth: number;
  readonly maxConditionNodes: number;
  /** Style rules per element. */
  readonly maxStyleRules: number;
  /** Points per drawing element. */
  readonly maxDrawingPoints: number;
  readonly maxPathSegments: number;
  readonly maxImageBytes: number;
  readonly maxFontSizePt: number;
}

export const DEFAULT_LIMITS: TemplateLimits = Object.freeze({
  maxTemplateBytes: 5 * 1024 * 1024,
  maxElements: 1000,
  maxCanvasMm: 2000,
  minCanvasMm: 1,
  maxOverhangFactor: 1,
  maxIdLength: 128,
  maxNameLength: 200,
  maxDescriptionLength: 2000,
  maxTags: 32,
  maxTextLength: 2000,
  maxValueLength: 4096,
  maxConditionDepth: 4,
  maxConditionNodes: 64,
  maxStyleRules: 16,
  maxDrawingPoints: 2000,
  maxPathSegments: 8,
  maxImageBytes: 512 * 1024,
  maxFontSizePt: 400,
});

export function resolveLimits(overrides?: Partial<TemplateLimits>): TemplateLimits {
  return overrides ? Object.freeze({ ...DEFAULT_LIMITS, ...overrides }) : DEFAULT_LIMITS;
}
