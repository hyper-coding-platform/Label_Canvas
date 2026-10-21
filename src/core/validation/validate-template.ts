/**
 * Strict runtime validation of label templates.
 *
 * Validation is a *decoder*: it walks untrusted input, reports every issue it
 * finds, and (when there are no errors) returns a freshly constructed
 * template containing only known properties. Unknown properties, unknown
 * element types and unsupported versions are errors, never ignored.
 */
import { defaultBarcodeAdapter, isBarcodeFormat } from "../barcode/adapter";
import type { BarcodeAdapter } from "../barcode/types";
import { parsePath } from "../binding/path";
import type { Issue } from "../errors";
import { normalizeRotation, rectsIntersect, rectContains, rotatedBounds } from "../geometry/rect";
import { LENGTH_UNITS, toMm } from "../geometry/units";
import { checkImageSource, type ImagePolicy } from "../render/image-policy";
import { SHAPE_KINDS } from "../render/shapes";
import { STYLE_OVERRIDE_KEYS } from "../render/style-rules";
import { DEFAULT_FONT_REGISTRY, FONT_ID_PATTERN, type FontRegistry } from "../schema/fonts";
import { resolveLimits, type TemplateLimits } from "../schema/limits";
import { CURRENT_SCHEMA_VERSION, type ElementType, type LabelTemplate, type LengthUnit } from "../schema/types";
import {
  DecodeContext,
  checkKeys,
  decodeBoolean,
  decodeColor,
  decodeEnum,
  decodeNumber,
  decodeString,
  get,
  has,
  isPlainObject,
  type Obj,
} from "./context";

export interface ValidateOptions {
  readonly limits?: Partial<TemplateLimits> | undefined;
  readonly barcodeAdapter?: BarcodeAdapter | undefined;
  readonly imagePolicy?: ImagePolicy | undefined;
  readonly fonts?: FontRegistry | undefined;
}

export interface ValidationResult {
  /** True when there are no `error` issues. Warnings do not invalidate a template. */
  readonly valid: boolean;
  readonly issues: readonly Issue[];
  /** Normalized copy (only known properties). Present only when `valid`. */
  readonly template?: LabelTemplate | undefined;
}

export const ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]*$/;

const TEMPLATE_KEYS = new Set(["schemaVersion", "id", "name", "description", "category", "tags", "canvas", "elements"]);
const CANVAS_KEYS = new Set(["width", "height", "unit", "background", "cornerRadius", "printerDpi"]);
const BASE_KEYS = ["id", "type", "name", "x", "y", "width", "height", "rotation", "visible", "locked", "condition", "styleRules"];
const ELEMENT_KEYS: Record<string, ReadonlySet<string>> = {
  text: new Set([...BASE_KEYS, "content", "style", "background", "border", "padding"]),
  barcode: new Set([...BASE_KEYS, "format", "value", "showText", "textSize", "color", "background", "moduleWidth", "bearer", "whenMissing"]),
  qrcode: new Set([...BASE_KEYS, "value", "errorCorrection", "quietZone", "color", "background", "whenMissing"]),
  image: new Set([...BASE_KEYS, "src", "fit", "alt"]),
  rect: new Set([...BASE_KEYS, "fill", "stroke", "strokeWidth", "cornerRadius"]),
  line: new Set([...BASE_KEYS, "stroke", "strokeWidth", "dash"]),
  shape: new Set([...BASE_KEYS, "shape", "fill", "stroke", "strokeWidth"]),
  drawing: new Set([...BASE_KEYS, "points", "stroke", "strokeWidth"]),
};
const STYLE_RULE_KEYS = new Set(["when", "set"]);
export const ELEMENT_TYPES = Object.freeze(Object.keys(ELEMENT_KEYS)) as readonly string[];
const STYLE_KEYS = new Set(["fontFamily", "fontSize", "fontWeight", "fontStyle", "color", "align", "verticalAlign", "lineHeight", "letterSpacing", "overflow", "maxLines", "minFontSize"]);
const BORDER_KEYS = new Set(["width", "color", "radius"]);
const STATIC_KEYS = new Set(["kind", "value"]);
const FIELD_KEYS = new Set(["kind", "path", "prefix", "suffix", "fallback", "format", "required"]);
const FORMAT_KEYS: Record<string, ReadonlySet<string>> = {
  text: new Set(["type", "case", "maxLength"]),
  number: new Set(["type", "decimals", "grouping", "locale"]),
  currency: new Set(["type", "currency", "decimals", "display", "locale"]),
  date: new Set(["type", "pattern", "timeZone"]),
};
const PRESENCE_OPS = ["exists", "missing", "empty", "notEmpty"] as const;
const COMPARISON_OPS = ["eq", "neq", "gt", "gte", "lt", "lte", "contains", "startsWith"] as const;
const LOCALE_PATTERN = /^[A-Za-z]{2,3}(?:-[A-Za-z0-9]{2,8}){0,3}$/;

interface Env {
  readonly ctx: DecodeContext;
  readonly limits: TemplateLimits;
  readonly adapter: BarcodeAdapter;
  readonly imagePolicy: ImagePolicy | undefined;
  readonly fonts: FontRegistry;
}

export function validateTemplate(input: unknown, options: ValidateOptions = {}): ValidationResult {
  const limits = resolveLimits(options.limits);
  const ctx = new DecodeContext(limits);
  const env: Env = {
    ctx,
    limits,
    adapter: options.barcodeAdapter ?? defaultBarcodeAdapter,
    imagePolicy: options.imagePolicy,
    fonts: options.fonts ?? DEFAULT_FONT_REGISTRY,
  };
  const template = decodeTemplate(env, input);
  const valid = !ctx.hasErrors && template !== undefined;
  return valid ? { valid, issues: ctx.issues, template } : { valid: false, issues: ctx.issues };
}

function decodeTemplate(env: Env, input: unknown): LabelTemplate | undefined {
  const { ctx, limits } = env;
  if (!isPlainObject(input)) {
    ctx.error("", "NOT_OBJECT", "Template must be a JSON object.");
    return undefined;
  }
  checkKeys(ctx, input, TEMPLATE_KEYS, "");

  const version = get(input, "schemaVersion");
  if (version === undefined) {
    ctx.error("/schemaVersion", "SCHEMA_VERSION_MISSING", "schemaVersion is required.");
    return undefined;
  }
  if (version !== CURRENT_SCHEMA_VERSION) {
    ctx.error("/schemaVersion", "SCHEMA_VERSION_UNSUPPORTED", `Schema version ${JSON.stringify(version)} is not supported; expected ${CURRENT_SCHEMA_VERSION}. Use parseTemplate() to migrate older versions.`);
    return undefined;
  }

  const out: Obj = { schemaVersion: CURRENT_SCHEMA_VERSION };
  out.id = required(env, input, "id", "", (v, p) => decodeString(ctx, v, p, { max: limits.maxIdLength, min: 1, pattern: ID_PATTERN, patternMessage: "IDs may contain letters, digits, '.', '_', ':' and '-', and must start with a letter or digit." }));
  out.name = required(env, input, "name", "", (v, p) => decodeString(ctx, v, p, { max: limits.maxNameLength, min: 1 }));
  optional(env, input, out, "description", "", (v, p) => decodeString(ctx, v, p, { max: limits.maxDescriptionLength, allowNewlines: true }));
  optional(env, input, out, "category", "", (v, p) => decodeString(ctx, v, p, { max: 64, min: 1 }));
  optional(env, input, out, "tags", "", (v, p) => decodeTags(env, v, p));

  const canvas = required(env, input, "canvas", "", (v, p) => decodeCanvas(env, v, p));
  out.canvas = canvas;

  const elements = get(input, "elements");
  if (!Array.isArray(elements)) {
    ctx.error("/elements", elements === undefined ? "REQUIRED_PROPERTY_MISSING" : "TYPE_MISMATCH", "elements must be an array.");
  } else if (elements.length > limits.maxElements) {
    ctx.error("/elements", "TOO_MANY_ELEMENTS", `Template has ${elements.length} elements; the limit is ${limits.maxElements}.`);
  } else {
    const seen = new Set<string>();
    const decoded: Obj[] = [];
    elements.forEach((el, i) => {
      const d = decodeElement(env, el, `/elements/${i}`, canvas as CanvasInfo | undefined);
      if (d) {
        const id = d.id as string;
        if (seen.has(id)) ctx.error(`/elements/${i}/id`, "ELEMENT_ID_DUPLICATE", `Duplicate element id "${id}".`, id);
        seen.add(id);
        decoded.push(d);
      }
    });
    out.elements = decoded;
  }
  return ctx.hasErrors ? undefined : (out as unknown as LabelTemplate);
}

function required<T>(env: Env, obj: Obj, key: string, base: string, decode: (v: unknown, path: string) => T | undefined, elementId?: string): T | undefined {
  if (!has(obj, key)) {
    env.ctx.error(`${base}/${key}`, "REQUIRED_PROPERTY_MISSING", `"${key}" is required.`, elementId);
    return undefined;
  }
  return decode(get(obj, key), `${base}/${key}`);
}

function optional<T>(env: Env, obj: Obj, out: Obj, key: string, base: string, decode: (v: unknown, path: string) => T | undefined): void {
  if (!has(obj, key)) return;
  const v = decode(get(obj, key), `${base}/${key}`);
  if (v !== undefined) out[key] = v;
}

function decodeTags(env: Env, value: unknown, path: string): string[] | undefined {
  if (!Array.isArray(value)) {
    env.ctx.error(path, "TYPE_MISMATCH", "tags must be an array of strings.");
    return undefined;
  }
  if (value.length > env.limits.maxTags) {
    env.ctx.error(path, "TOO_MANY_TAGS", `At most ${env.limits.maxTags} tags are allowed.`);
    return undefined;
  }
  const tags: string[] = [];
  value.forEach((t, i) => {
    const s = decodeString(env.ctx, t, `${path}/${i}`, { max: 64, min: 1 });
    if (s !== undefined) tags.push(s);
  });
  return tags;
}

interface CanvasInfo {
  width: number;
  height: number;
  unit: LengthUnit;
}

function decodeCanvas(env: Env, value: unknown, path: string): Obj | undefined {
  const { ctx, limits } = env;
  if (!isPlainObject(value)) {
    ctx.error(path, "TYPE_MISMATCH", "canvas must be an object.");
    return undefined;
  }
  checkKeys(ctx, value, CANVAS_KEYS, path);
  const unit = required(env, value, "unit", path, (v, p) => {
    if (typeof v !== "string" || !(LENGTH_UNITS as readonly string[]).includes(v)) {
      ctx.error(p, "UNIT_INVALID", 'unit must be "mm", "in" or "px".');
      return undefined;
    }
    return v as LengthUnit;
  });
  const dim = (key: "width" | "height") =>
    required(env, value, key, path, (v, p) => {
      const n = decodeNumber(ctx, v, p, { exclusiveMin: 0 });
      if (n === undefined || unit === undefined) return n;
      const mm = toMm(n, unit);
      if (mm > limits.maxCanvasMm) {
        ctx.error(p, "CANVAS_TOO_LARGE", `Canvas ${key} ${n}${unit} exceeds the maximum of ${limits.maxCanvasMm} mm.`);
        return undefined;
      }
      if (mm < limits.minCanvasMm) {
        ctx.error(p, "CANVAS_TOO_SMALL", `Canvas ${key} ${n}${unit} is below the minimum of ${limits.minCanvasMm} mm.`);
        return undefined;
      }
      return n;
    });
  const width = dim("width");
  const height = dim("height");
  const out: Obj = { width, height, unit };
  optional(env, value, out, "background", path, (v, p) => decodeColor(ctx, v, p));
  optional(env, value, out, "cornerRadius", path, (v, p) => decodeNumber(ctx, v, p, { min: 0, max: Math.min(width ?? Infinity, height ?? Infinity) / 2 }));
  optional(env, value, out, "printerDpi", path, (v, p) => decodeNumber(ctx, v, p, { integer: true, min: 72, max: 2400 }));
  return width === undefined || height === undefined || unit === undefined ? undefined : out;
}

function decodeElement(env: Env, value: unknown, path: string, canvas: CanvasInfo | undefined): Obj | undefined {
  const { ctx, limits } = env;
  if (!isPlainObject(value)) {
    ctx.error(path, "TYPE_MISMATCH", "Element must be an object.");
    return undefined;
  }
  const rawId = get(value, "id");
  const id = typeof rawId === "string" ? rawId : undefined;
  const type = get(value, "type");
  if (typeof type !== "string" || !ELEMENT_KEYS[type]) {
    ctx.error(`${path}/type`, "ELEMENT_TYPE_UNKNOWN", `Unknown element type ${JSON.stringify(typeof type === "string" ? type.slice(0, 40) : type)}. Expected one of: ${ELEMENT_TYPES.join(", ")}.`, id);
    return undefined;
  }
  checkKeys(ctx, value, ELEMENT_KEYS[type]!, path, id);
  const before = ctx.issues.length;

  const out: Obj = {};
  out.id = required(env, value, "id", path, (v, p) => decodeString(ctx, v, p, { max: limits.maxIdLength, min: 1, pattern: ID_PATTERN, patternMessage: "Element ids may contain letters, digits, '.', '_', ':' and '-'." }), id);
  out.type = type;
  optional(env, value, out, "name", path, (v, p) => decodeString(ctx, v, p, { max: limits.maxNameLength }));
  const num = (key: string, rules: Parameters<typeof decodeNumber>[3]) => required(env, value, key, path, (v, p) => decodeNumber(ctx, v, p, rules, id), id);
  const x = num("x", {});
  const y = num("y", {});
  const width = num("width", { exclusiveMin: 0 });
  const height = num("height", { exclusiveMin: 0 });
  Object.assign(out, { x, y, width, height });
  optional(env, value, out, "rotation", path, (v, p) => {
    const r = decodeNumber(ctx, v, p, {}, id);
    if (r === undefined) return undefined;
    if (r < 0 || r >= 360) {
      ctx.error(p, "ROTATION_INVALID", "rotation must be in the range [0, 360).", id);
      return undefined;
    }
    return r;
  });
  optional(env, value, out, "visible", path, (v, p) => decodeBoolean(ctx, v, p, id));
  optional(env, value, out, "locked", path, (v, p) => decodeBoolean(ctx, v, p, id));
  optional(env, value, out, "condition", path, (v, p) => decodeCondition(env, v, p, 1, { count: 0 }, id));

  const minSide = Math.min(width ?? Infinity, height ?? Infinity);
  switch (type) {
    case "text":
      decodeText(env, value, out, path, minSide, id);
      break;
    case "barcode":
      decodeBarcode(env, value, out, path, id);
      break;
    case "qrcode":
      decodeQr(env, value, out, path, id);
      break;
    case "image":
      out.src = required(env, value, "src", path, (v, p) => {
        if (typeof v !== "string") {
          ctx.error(p, "TYPE_MISMATCH", "src must be a string.", id);
          return undefined;
        }
        const check = checkImageSource(v, env.imagePolicy, limits.maxImageBytes);
        if (!check.ok) {
          ctx.error(p, check.code, check.message, id);
          return undefined;
        }
        return v;
      }, id);
      optional(env, value, out, "fit", path, (v, p) => decodeEnum(ctx, v, p, ["contain", "cover", "fill"], id));
      optional(env, value, out, "alt", path, (v, p) => decodeString(ctx, v, p, { max: 200 }, id));
      break;
    case "rect":
      optional(env, value, out, "fill", path, (v, p) => decodeColor(ctx, v, p, id));
      optional(env, value, out, "stroke", path, (v, p) => decodeColor(ctx, v, p, id));
      optional(env, value, out, "strokeWidth", path, (v, p) => decodeNumber(ctx, v, p, strokeRules(type, width, height), id));
      optional(env, value, out, "cornerRadius", path, (v, p) => decodeNumber(ctx, v, p, { min: 0, max: minSide / 2 }, id));
      break;
    case "line":
      out.strokeWidth = required(env, value, "strokeWidth", path, (v, p) => decodeNumber(ctx, v, p, strokeRules(type, width, height), id), id);
      optional(env, value, out, "stroke", path, (v, p) => decodeColor(ctx, v, p, id));
      optional(env, value, out, "dash", path, (v, p) => decodeEnum(ctx, v, p, ["solid", "dashed", "dotted"], id));
      break;
    case "shape":
      out.shape = required(env, value, "shape", path, (v, p) => decodeEnum(ctx, v, p, SHAPE_KINDS, id), id);
      optional(env, value, out, "fill", path, (v, p) => decodeColor(ctx, v, p, id));
      optional(env, value, out, "stroke", path, (v, p) => decodeColor(ctx, v, p, id));
      optional(env, value, out, "strokeWidth", path, (v, p) => decodeNumber(ctx, v, p, strokeRules(type, width, height), id));
      break;
    case "drawing":
      out.points = required(env, value, "points", path, (v, p) => decodeDrawingPoints(env, v, p, id), id);
      out.strokeWidth = required(env, value, "strokeWidth", path, (v, p) => decodeNumber(ctx, v, p, strokeRules(type, width, height), id), id);
      optional(env, value, out, "stroke", path, (v, p) => decodeColor(ctx, v, p, id));
      break;
  }
  // Decoded after the type-specific properties: override limits depend on the element's size.
  optional(env, value, out, "styleRules", path, (v, p) => decodeStyleRules(env, v, p, type as ElementType, width, height, id));

  if (canvas && x !== undefined && y !== undefined && width !== undefined && height !== undefined) {
    checkBounds(env, { x, y, width, height }, normalizeRotation((out.rotation as number | undefined) ?? 0), canvas, path, id);
  }
  return ctx.issues.slice(before).some((i) => i.severity === "error") ? undefined : out;
}

function checkBounds(env: Env, rect: { x: number; y: number; width: number; height: number }, rotation: number, canvas: CanvasInfo, path: string, id: string | undefined) {
  const bounds = rotatedBounds(rect, rotation);
  const f = env.limits.maxOverhangFactor;
  const canvasRect = { x: 0, y: 0, width: canvas.width, height: canvas.height };
  if (bounds.x < -canvas.width * f || bounds.y < -canvas.height * f || bounds.x + bounds.width > canvas.width * (1 + f) || bounds.y + bounds.height > canvas.height * (1 + f)) {
    env.ctx.error(path, "ELEMENT_FAR_OUT_OF_BOUNDS", "Element extends too far beyond the canvas.", id);
  } else if (!rectsIntersect(bounds, canvasRect)) {
    env.ctx.warn(path, "ELEMENT_OUTSIDE_CANVAS", "Element lies entirely outside the canvas and will not print.", id);
  } else if (!rectContains(canvasRect, bounds, 1e-6)) {
    env.ctx.warn(path, "ELEMENT_EXCEEDS_CANVAS", "Element extends beyond the canvas edge and will be clipped.", id);
  }
}

/** Stroke width rules shared by element properties and style overrides. Text applies them to the border. */
function strokeRules(type: string, width: number | undefined, height: number | undefined): Parameters<typeof decodeNumber>[3] {
  const minSide = Math.min(width ?? Infinity, height ?? Infinity);
  if (type === "line") return { exclusiveMin: 0, max: height ?? Infinity };
  if (type === "drawing") return { exclusiveMin: 0, max: minSide };
  return { min: 0, max: minSide / 2 };
}

function decodeDrawingPoints(env: Env, value: unknown, path: string, id: string | undefined): number[] | undefined {
  const { ctx, limits } = env;
  if (!Array.isArray(value) || value.length < 4 || value.length % 2 !== 0 || value.length > limits.maxDrawingPoints * 2) {
    ctx.error(path, "DRAWING_POINTS_INVALID", `points must be a flat array of 2–${limits.maxDrawingPoints} x/y pairs.`, id);
    return undefined;
  }
  for (let i = 0; i < value.length; i += 1) {
    const v: unknown = value[i];
    if (typeof v !== "number" || !Number.isFinite(v) || v < 0 || v > 1) {
      ctx.error(`${path}/${i}`, "DRAWING_POINTS_INVALID", "Drawing coordinates must be numbers between 0 and 1.", id);
      return undefined;
    }
  }
  return (value as number[]).map((v) => (v === 0 ? 0 : v));
}

function decodeStyleRules(env: Env, value: unknown, path: string, type: ElementType, width: number | undefined, height: number | undefined, id: string | undefined): Obj[] | undefined {
  const { ctx, limits } = env;
  if (!Array.isArray(value)) {
    ctx.error(path, "TYPE_MISMATCH", "styleRules must be an array.", id);
    return undefined;
  }
  if (value.length > limits.maxStyleRules) {
    ctx.error(path, "TOO_MANY_STYLE_RULES", `At most ${limits.maxStyleRules} style rules are allowed per element.`, id);
    return undefined;
  }
  const allowed = new Set<string>(STYLE_OVERRIDE_KEYS[type]);
  const rules = value.map((rule, i): Obj | undefined => {
    const p = `${path}/${i}`;
    if (!isPlainObject(rule)) {
      ctx.error(p, "TYPE_MISMATCH", "A style rule must be an object with \"when\" and \"set\".", id);
      return undefined;
    }
    checkKeys(ctx, rule, STYLE_RULE_KEYS, p, id);
    const when = required(env, rule, "when", p, (v, pp) => decodeCondition(env, v, pp, 1, { count: 0 }, id), id);
    const set = required(env, rule, "set", p, (v, pp) => {
      if (!isPlainObject(v)) {
        ctx.error(pp, "TYPE_MISMATCH", "set must be an object.", id);
        return undefined;
      }
      // Keys that do not apply to this element type are errors (e.g. fontSize on a rectangle).
      checkKeys(ctx, v, allowed, pp, id);
      const o: Obj = {};
      for (const key of ["fill", "color", "stroke"]) optional(env, v, o, key, pp, (c, cp) => decodeColor(ctx, c, cp, id));
      optional(env, v, o, "strokeWidth", pp, (w, wp) => decodeNumber(ctx, w, wp, strokeRules(type, width, height), id));
      optional(env, v, o, "opacity", pp, (w, wp) => decodeNumber(ctx, w, wp, { min: 0, max: 1 }, id));
      optional(env, v, o, "fontWeight", pp, (w, wp) => decodeEnum(ctx, w, wp, ["normal", "bold"], id));
      optional(env, v, o, "fontStyle", pp, (w, wp) => decodeEnum(ctx, w, wp, ["normal", "italic"], id));
      optional(env, v, o, "fontSize", pp, (w, wp) => decodeNumber(ctx, w, wp, { min: 0.5, max: limits.maxFontSizePt }, id));
      return o;
    }, id);
    return when === undefined || set === undefined ? undefined : { when, set };
  });
  return rules.every((r) => r !== undefined) ? (rules as Obj[]) : undefined;
}

function decodeText(env: Env, value: Obj, out: Obj, path: string, minSide: number, id: string | undefined) {
  const { ctx } = env;
  out.content = required(env, value, "content", path, (v, p) => decodeValueSource(env, v, p, true, id), id);
  out.style = required(env, value, "style", path, (v, p) => decodeTextStyle(env, v, p, id), id);
  optional(env, value, out, "background", path, (v, p) => decodeColor(ctx, v, p, id));
  optional(env, value, out, "padding", path, (v, p) => decodeNumber(ctx, v, p, { min: 0, max: minSide / 2 }, id));
  optional(env, value, out, "border", path, (v, p) => {
    if (!isPlainObject(v)) {
      ctx.error(p, "TYPE_MISMATCH", "border must be an object.", id);
      return undefined;
    }
    checkKeys(ctx, v, BORDER_KEYS, p, id);
    const b: Obj = {};
    b.width = required(env, v, "width", p, (w, pp) => decodeNumber(ctx, w, pp, { min: 0, max: minSide / 2 }, id), id);
    b.color = required(env, v, "color", p, (c, pp) => decodeColor(ctx, c, pp, id), id);
    optional(env, v, b, "radius", p, (r, pp) => decodeNumber(ctx, r, pp, { min: 0, max: minSide / 2 }, id));
    return b;
  });
}

function decodeTextStyle(env: Env, value: unknown, path: string, id: string | undefined): Obj | undefined {
  const { ctx, limits } = env;
  if (!isPlainObject(value)) {
    ctx.error(path, "TYPE_MISMATCH", "style must be an object.", id);
    return undefined;
  }
  checkKeys(ctx, value, STYLE_KEYS, path, id);
  const out: Obj = {};
  out.fontFamily = required(env, value, "fontFamily", path, (v, p) => {
    const s = decodeString(ctx, v, p, { max: 32, min: 1, pattern: FONT_ID_PATTERN, patternMessage: "fontFamily must be a font id such as sans, serif, mono or condensed." }, id);
    if (s !== undefined && !env.fonts.has(s)) ctx.warn(p, "FONT_UNKNOWN", `Font "${s}" is not registered; the sans-serif fallback will be used.`, id);
    return s;
  }, id);
  const fontSize = required(env, value, "fontSize", path, (v, p) => decodeNumber(ctx, v, p, { min: 0.5, max: limits.maxFontSizePt }, id), id);
  out.fontSize = fontSize;
  optional(env, value, out, "fontWeight", path, (v, p) => decodeEnum(ctx, v, p, ["normal", "bold"], id));
  optional(env, value, out, "fontStyle", path, (v, p) => decodeEnum(ctx, v, p, ["normal", "italic"], id));
  optional(env, value, out, "color", path, (v, p) => decodeColor(ctx, v, p, id));
  optional(env, value, out, "align", path, (v, p) => decodeEnum(ctx, v, p, ["left", "center", "right"], id));
  optional(env, value, out, "verticalAlign", path, (v, p) => decodeEnum(ctx, v, p, ["top", "middle", "bottom"], id));
  optional(env, value, out, "lineHeight", path, (v, p) => decodeNumber(ctx, v, p, { min: 0.5, max: 5 }, id));
  optional(env, value, out, "letterSpacing", path, (v, p) => decodeNumber(ctx, v, p, { min: -10, max: 100 }, id));
  optional(env, value, out, "overflow", path, (v, p) => decodeEnum(ctx, v, p, ["clip", "shrink", "ellipsis", "wrap"], id));
  optional(env, value, out, "maxLines", path, (v, p) => decodeNumber(ctx, v, p, { integer: true, min: 1, max: 100 }, id));
  optional(env, value, out, "minFontSize", path, (v, p) => decodeNumber(ctx, v, p, { min: 0.5, max: fontSize ?? limits.maxFontSizePt }, id));
  return out;
}

function decodeValueSource(env: Env, value: unknown, path: string, allowNewlines: boolean, id: string | undefined): Obj | undefined {
  const { ctx, limits } = env;
  if (!isPlainObject(value)) {
    ctx.error(path, "TYPE_MISMATCH", 'Value source must be an object with kind "static" or "field".', id);
    return undefined;
  }
  const kind = get(value, "kind");
  if (kind === "static") {
    checkKeys(ctx, value, STATIC_KEYS, path, id);
    const v = required(env, value, "value", path, (s, p) => decodeString(ctx, s, p, { max: limits.maxTextLength, allowNewlines }, id), id);
    return v === undefined ? undefined : { kind, value: v };
  }
  if (kind !== "field") {
    ctx.error(`${path}/kind`, "ENUM_INVALID", 'kind must be "static" or "field".', id);
    return undefined;
  }
  checkKeys(ctx, value, FIELD_KEYS, path, id);
  const out: Obj = { kind };
  out.path = required(env, value, "path", path, (v, p) => decodeBindingPath(env, v, p, id), id);
  const text = (key: string) => optional(env, value, out, key, path, (v, p) => decodeString(ctx, v, p, { max: limits.maxTextLength, allowNewlines }, id));
  text("prefix");
  text("suffix");
  text("fallback");
  optional(env, value, out, "required", path, (v, p) => decodeBoolean(ctx, v, p, id));
  optional(env, value, out, "format", path, (v, p) => decodeFormat(env, v, p, id));
  return out;
}

function decodeBindingPath(env: Env, value: unknown, path: string, id: string | undefined): string | undefined {
  const parsed = parsePath(value, env.limits.maxPathSegments);
  if (!parsed.ok) {
    env.ctx.error(path, parsed.code, parsed.message, id);
    return undefined;
  }
  return value as string;
}

function checkLocale(env: Env, value: unknown, path: string, id: string | undefined): string | undefined {
  const s = decodeString(env.ctx, value, path, { max: 35, min: 2, pattern: LOCALE_PATTERN, patternMessage: "locale must be a BCP 47 tag such as en-IN." }, id);
  if (s === undefined) return undefined;
  try {
    new Intl.NumberFormat(s);
  } catch {
    env.ctx.error(path, "LOCALE_INVALID", `Locale "${s}" is not supported by this runtime.`, id);
    return undefined;
  }
  return s;
}

function decodeFormat(env: Env, value: unknown, path: string, id: string | undefined): Obj | undefined {
  const { ctx, limits } = env;
  if (!isPlainObject(value)) {
    ctx.error(path, "TYPE_MISMATCH", "format must be an object.", id);
    return undefined;
  }
  const type = decodeEnum(ctx, get(value, "type"), `${path}/type`, ["text", "number", "currency", "date"], id);
  if (!type) return undefined;
  checkKeys(ctx, value, FORMAT_KEYS[type]!, path, id);
  const out: Obj = { type };
  const decimals = () => optional(env, value, out, "decimals", path, (v, p) => decodeNumber(ctx, v, p, { integer: true, min: 0, max: 6 }, id));
  const locale = () => optional(env, value, out, "locale", path, (v, p) => checkLocale(env, v, p, id));
  switch (type) {
    case "text":
      optional(env, value, out, "case", path, (v, p) => decodeEnum(ctx, v, p, ["upper", "lower", "title"], id));
      optional(env, value, out, "maxLength", path, (v, p) => decodeNumber(ctx, v, p, { integer: true, min: 1, max: limits.maxValueLength }, id));
      break;
    case "number":
      decimals();
      optional(env, value, out, "grouping", path, (v, p) => decodeBoolean(ctx, v, p, id));
      locale();
      break;
    case "currency":
      out.currency = required(env, value, "currency", path, (v, p) => decodeString(ctx, v, p, { max: 3, min: 3, pattern: /^[A-Z]{3}$/, patternMessage: "currency must be an ISO 4217 code such as INR." }, id), id);
      decimals();
      optional(env, value, out, "display", path, (v, p) => decodeEnum(ctx, v, p, ["code", "symbol", "none"], id));
      locale();
      if (out.display === "symbol" && out.locale === undefined) ctx.error(`${path}/display`, "FORMAT_INVALID", 'Currency display "symbol" requires a locale.', id);
      break;
    case "date":
      out.pattern = required(env, value, "pattern", path, (v, p) => decodeString(ctx, v, p, { max: 64, min: 1 }, id), id);
      optional(env, value, out, "timeZone", path, (v, p) => decodeEnum(ctx, v, p, ["UTC", "local"], id));
      break;
  }
  return out;
}

function decodeCondition(env: Env, value: unknown, path: string, depth: number, counter: { count: number }, id: string | undefined): Obj | undefined {
  const { ctx, limits } = env;
  counter.count += 1;
  if (counter.count > limits.maxConditionNodes) {
    if (counter.count === limits.maxConditionNodes + 1) ctx.error(path, "CONDITION_TOO_COMPLEX", `Conditions may contain at most ${limits.maxConditionNodes} nodes.`, id);
    return undefined;
  }
  if (depth > limits.maxConditionDepth) {
    ctx.error(path, "CONDITION_TOO_DEEP", `Conditions may be nested at most ${limits.maxConditionDepth} levels.`, id);
    return undefined;
  }
  if (!isPlainObject(value)) {
    ctx.error(path, "CONDITION_INVALID", "Condition must be an object.", id);
    return undefined;
  }
  const keys = Object.keys(value);
  for (const group of ["all", "any"] as const) {
    if (has(value, group)) {
      if (keys.length !== 1) ctx.error(path, "CONDITION_INVALID", `A "${group}" condition must have no other properties.`, id);
      const list = get(value, group);
      if (!Array.isArray(list) || list.length === 0 || list.length > 32) {
        ctx.error(`${path}/${group}`, "CONDITION_INVALID", `"${group}" must be an array of 1–32 conditions.`, id);
        return undefined;
      }
      const items = list.map((c, i) => decodeCondition(env, c, `${path}/${group}/${i}`, depth + 1, counter, id));
      return items.every((i) => i !== undefined) ? { [group]: items } : undefined;
    }
  }
  if (has(value, "not")) {
    if (keys.length !== 1) ctx.error(path, "CONDITION_INVALID", 'A "not" condition must have no other properties.', id);
    const inner = decodeCondition(env, get(value, "not"), `${path}/not`, depth + 1, counter, id);
    return inner === undefined ? undefined : { not: inner };
  }
  const op = get(value, "op");
  const field = decodeBindingPath(env, get(value, "field"), `${path}/field`, id);
  if (typeof op === "string" && (PRESENCE_OPS as readonly string[]).includes(op)) {
    checkKeys(ctx, value, new Set(["field", "op"]), path, id);
    return field === undefined ? undefined : { field, op };
  }
  if (typeof op === "string" && (COMPARISON_OPS as readonly string[]).includes(op)) {
    checkKeys(ctx, value, new Set(["field", "op", "value"]), path, id);
    const v = get(value, "value");
    let cv: string | number | boolean | undefined;
    if (typeof v === "boolean") cv = v;
    else if (typeof v === "number") cv = decodeNumber(ctx, v, `${path}/value`, {}, id);
    else if (typeof v === "string") cv = decodeString(ctx, v, `${path}/value`, { max: limits.maxTextLength }, id);
    else ctx.error(`${path}/value`, "CONDITION_INVALID", "Comparison value must be a string, number or boolean.", id);
    return field === undefined || cv === undefined ? undefined : { field, op, value: cv };
  }
  ctx.error(`${path}/op`, "CONDITION_INVALID", `Unknown condition operator. Expected one of: ${[...PRESENCE_OPS, ...COMPARISON_OPS].join(", ")}, or all/any/not.`, id);
  return undefined;
}

function decodeBarcode(env: Env, value: Obj, out: Obj, path: string, id: string | undefined) {
  const { ctx } = env;
  const format = required(env, value, "format", path, (v, p) => {
    if (!isBarcodeFormat(v) || !env.adapter.formats.includes(v)) {
      const hint = v === "qrcode" ? ' Use an element of type "qrcode" for QR codes.' : "";
      ctx.error(p, "BARCODE_FORMAT_UNSUPPORTED", `Barcode format ${JSON.stringify(typeof v === "string" ? v.slice(0, 40) : v)} is not supported.${hint}`, id);
      return undefined;
    }
    return v;
  }, id);
  out.format = format;
  out.value = required(env, value, "value", path, (v, p) => {
    const src = decodeValueSource(env, v, p, false, id);
    if (src?.kind === "static" && format !== undefined) {
      const check = env.adapter.validate(format, src.value as string);
      if (!check.ok) ctx.error(`${p}/value`, "BARCODE_VALUE_INVALID", check.message, id);
    }
    return src;
  }, id);
  optional(env, value, out, "showText", path, (v, p) => decodeBoolean(ctx, v, p, id));
  optional(env, value, out, "textSize", path, (v, p) => decodeNumber(ctx, v, p, { min: 2, max: 72 }, id));
  optional(env, value, out, "color", path, (v, p) => decodeColor(ctx, v, p, id));
  optional(env, value, out, "background", path, (v, p) => decodeColor(ctx, v, p, id));
  optional(env, value, out, "moduleWidth", path, (v, p) => decodeNumber(ctx, v, p, { exclusiveMin: 0, max: (out.width as number | undefined) ?? Infinity }, id));
  optional(env, value, out, "bearer", path, (v, p) => {
    const b = decodeEnum(ctx, v, p, ["none", "frame", "top-bottom"], id);
    if (b !== undefined && b !== "none" && format !== undefined && format !== "itf14") ctx.warn(p, "BEARER_IGNORED", "Bearer bars apply to ITF-14 only and are ignored for this format.", id);
    return b;
  });
  optional(env, value, out, "whenMissing", path, (v, p) => decodeEnum(ctx, v, p, ["error", "hide"], id));
}

function decodeQr(env: Env, value: Obj, out: Obj, path: string, id: string | undefined) {
  const { ctx } = env;
  optional(env, value, out, "errorCorrection", path, (v, p) => decodeEnum(ctx, v, p, ["L", "M", "Q", "H"], id));
  out.value = required(env, value, "value", path, (v, p) => {
    const src = decodeValueSource(env, v, p, true, id);
    if (src?.kind === "static") {
      const check = env.adapter.validate("qrcode", src.value as string, { errorCorrection: (out.errorCorrection as "L" | "M" | "Q" | "H" | undefined) ?? "M" });
      if (!check.ok) ctx.error(`${p}/value`, "BARCODE_VALUE_INVALID", check.message, id);
    }
    return src;
  }, id);
  optional(env, value, out, "quietZone", path, (v, p) => {
    const q = decodeNumber(ctx, v, p, { integer: true, min: 0, max: 20 }, id);
    if (q !== undefined && q < 4) ctx.warn(p, "QR_QUIET_ZONE_SMALL", "QR codes require a quiet zone of at least 4 modules unless the surrounding area is guaranteed blank.", id);
    return q;
  });
  optional(env, value, out, "color", path, (v, p) => decodeColor(ctx, v, p, id));
  optional(env, value, out, "background", path, (v, p) => decodeColor(ctx, v, p, id));
  optional(env, value, out, "whenMissing", path, (v, p) => decodeEnum(ctx, v, p, ["error", "hide"], id));
}
