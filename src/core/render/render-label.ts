/**
 * Deterministic label renderer: validated template + one data record →
 * render tree + structured issues. Pure: never mutates inputs, never touches
 * the DOM, no hidden global state (the only cache is a WeakMap keyed by
 * template identity holding validated, frozen copies).
 */
import { defaultBarcodeAdapter } from "../barcode/adapter";
import type { BarcodeAdapter, LinearSymbol, MatrixSymbol } from "../barcode/types";
import { evaluateCondition } from "../binding/conditions";
import { resolveValue, type ResolvedValue } from "../binding/resolve";
import { isLabelStudioError, TemplateValidationError, type Issue } from "../errors";
import { normalizeRotation, type Rect } from "../geometry/rect";
import { formatSvgNumber as n, ptToUnit } from "../geometry/units";
import { DEFAULT_FONT_REGISTRY, getFont, type FontRegistry } from "../schema/fonts";
import { resolveLimits, type TemplateLimits } from "../schema/limits";
import type {
  BarcodeElement,
  DataRecord,
  DrawingElement,
  ImageElement,
  LabelElement,
  LabelTemplate,
  LineElement,
  QrCodeElement,
  RectElement,
  ShapeElement,
  TextElement,
} from "../schema/types";
import { validateTemplate } from "../validation/validate-template";
import { layoutLinear, layoutMatrix } from "./barcode-layout";
import { checkImageSource, type ImagePolicy } from "./image-policy";
import { node, type RenderNode } from "./nodes";
import { drawingPath, shapePath } from "./shapes";
import { applyStyleRules } from "./style-rules";
import { estimateTextMeasurer, layoutText, type MeasureFont, type TextMeasurer } from "./text-layout";

export interface RenderOptions {
  /**
   * `output` (default): what prints. `design`: editor preview; elements that
   * cannot render (e.g. missing barcode data) are drawn as clearly marked
   * placeholders instead of being omitted. Placeholders are never symbols.
   */
  readonly mode?: "output" | "design" | undefined;
  readonly barcodeAdapter?: BarcodeAdapter | undefined;
  readonly textMeasurer?: TextMeasurer | undefined;
  readonly imagePolicy?: ImagePolicy | undefined;
  readonly fonts?: FontRegistry | undefined;
  readonly limits?: Partial<TemplateLimits> | undefined;
  /** Prefix for generated SVG ids (clip paths). Must be unique per document when several labels share one page. */
  readonly idPrefix?: string | undefined;
  /** Accessible label for the root SVG. Defaults to the template name. */
  readonly title?: string | undefined;
  /** Element ids to omit (the editor hides elements it is currently dragging). */
  readonly excludeElementIds?: ReadonlySet<string> | undefined;
}

export interface RenderResult {
  /** True when no `error` issues were produced for this record. */
  readonly ok: boolean;
  readonly root: RenderNode;
  readonly issues: readonly Issue[];
  readonly width: number;
  readonly height: number;
  readonly unit: LabelTemplate["canvas"]["unit"];
}

/* ------------------------------------------------------------ preparation */

const prepared = new WeakMap<object, LabelTemplate>();

function deepFreeze<T>(value: T, seen = new WeakSet<object>()): T {
  if (value && typeof value === "object" && !seen.has(value)) {
    seen.add(value);
    Object.freeze(value);
    for (const v of Object.values(value)) deepFreeze(v, seen);
  }
  return value;
}

/**
 * Validate once and return a frozen, normalized copy. Rendering a prepared
 * template skips re-validation. Templates are treated as immutable: create a
 * new object for every change (the editor does this automatically).
 * Throws `TemplateValidationError` when invalid.
 */
export function prepareTemplate(template: LabelTemplate, options: Pick<RenderOptions, "barcodeAdapter" | "imagePolicy" | "fonts" | "limits"> = {}): LabelTemplate {
  const cached = prepared.get(template);
  if (cached) return cached;
  const result = validateTemplate(template, options);
  if (!result.valid || !result.template) throw new TemplateValidationError(result.issues);
  const frozen = deepFreeze(result.template);
  prepared.set(template, frozen);
  prepared.set(frozen, frozen);
  return frozen;
}

/* -------------------------------------------------------------- rendering */

interface Ctx {
  readonly template: LabelTemplate;
  readonly record: DataRecord | undefined;
  readonly mode: "output" | "design";
  readonly adapter: BarcodeAdapter;
  readonly measurer: TextMeasurer;
  readonly imagePolicy: ImagePolicy | undefined;
  readonly fonts: FontRegistry;
  readonly limits: TemplateLimits;
  readonly idPrefix: string;
  readonly issues: Issue[];
  readonly defs: RenderNode[];
}

const ID_PREFIX = /^[A-Za-z][A-Za-z0-9_-]{0,63}$/;

export function renderLabel(template: LabelTemplate, record?: DataRecord, options: RenderOptions = {}): RenderResult {
  const t = prepareTemplate(template, options);
  const idPrefix = options.idPrefix ?? "els";
  if (!ID_PREFIX.test(idPrefix)) throw new TypeError("idPrefix must start with a letter and contain only letters, digits, '_' or '-'.");
  const ctx: Ctx = {
    template: t,
    record,
    mode: options.mode ?? "output",
    adapter: options.barcodeAdapter ?? defaultBarcodeAdapter,
    measurer: options.textMeasurer ?? estimateTextMeasurer,
    imagePolicy: options.imagePolicy,
    fonts: options.fonts ?? DEFAULT_FONT_REGISTRY,
    limits: resolveLimits(options.limits),
    idPrefix,
    issues: [],
    defs: [],
  };
  const { width, height, unit } = t.canvas;
  const children: RenderNode[] = [];
  children.push(node("title", {}, [], options.title ?? t.name));
  children.push(node("rect", { x: "0", y: "0", width: n(width), height: n(height), fill: t.canvas.background ?? "#ffffff" }));

  const content: RenderNode[] = [];
  t.elements.forEach((source, index) => {
    if (source.visible === false || options.excludeElementIds?.has(source.id)) return;
    if (source.condition && !evaluateCondition(source.condition, record)) return;
    const { element: el, opacity } = applyStyleRules(source, record, unit);
    try {
      const rendered = renderElement(ctx, el, index);
      if (rendered) content.push(wrapElement(el, rendered, opacity));
    } catch (e) {
      ctx.issues.push(issue("error", "RENDER_FAILED", el, index, isLabelStudioError(e) || e instanceof Error ? e.message : "Element failed to render."));
    }
  });
  if (ctx.defs.length > 0) children.push(node("defs", {}, ctx.defs));
  children.push(...content);

  const root = node(
    "svg",
    {
      xmlns: "http://www.w3.org/2000/svg",
      width: `${n(width)}${unit}`,
      height: `${n(height)}${unit}`,
      viewBox: `0 0 ${n(width)} ${n(height)}`,
      role: "img",
      "aria-label": options.title ?? t.name,
    },
    children,
  );
  return { ok: !ctx.issues.some((i) => i.severity === "error"), root, issues: ctx.issues, width, height, unit };
}

function issue(severity: "error" | "warning", code: string, el: LabelElement, index: number, message: string): Issue {
  return { code, severity, path: `/elements/${index}`, message, elementId: el.id };
}

function wrapElement(el: LabelElement, inner: RenderNode[], opacity: number | undefined): RenderNode {
  const rot = normalizeRotation(el.rotation ?? 0);
  const transform = rot === 0 ? undefined : `rotate(${n(rot)} ${n(el.x + el.width / 2)} ${n(el.y + el.height / 2)})`;
  return node("g", { "data-element-id": el.id, "data-element-type": el.type, transform, opacity: opacity === undefined || opacity === 1 ? undefined : n(opacity) }, inner);
}

function renderElement(ctx: Ctx, el: LabelElement, index: number): RenderNode[] | null {
  switch (el.type) {
    case "text":
      return renderText(ctx, el, index);
    case "barcode":
      return renderBarcode(ctx, el, index);
    case "qrcode":
      return renderQr(ctx, el, index);
    case "image":
      return renderImage(ctx, el, index);
    case "rect":
      return renderRect(el);
    case "line":
      return renderLine(el);
    case "shape":
      return renderShape(el);
    case "drawing":
      return renderDrawing(el);
  }
}

const box = (el: LabelElement): Rect => ({ x: el.x, y: el.y, width: el.width, height: el.height });

function resolve(ctx: Ctx, source: TextElement["content"]): ResolvedValue {
  return resolveValue(source, ctx.record, { maxPathSegments: ctx.limits.maxPathSegments, maxValueLength: ctx.limits.maxValueLength });
}

/** Dashed outline + caption used only in design mode. Never resembles a symbol. */
function placeholder(ctx: Ctx, el: LabelElement, caption: string): RenderNode[] | null {
  if (ctx.mode !== "design") return null;
  const unit = ctx.template.canvas.unit;
  const sw = ptToUnit(0.75, unit);
  const fs = Math.min(ptToUnit(7, unit), el.height * 0.6);
  return [
    node("rect", { x: n(el.x), y: n(el.y), width: n(el.width), height: n(el.height), fill: "#fff4f4", stroke: "#c62828", "stroke-width": n(sw), "stroke-dasharray": `${n(sw * 4)} ${n(sw * 3)}`, "data-placeholder": "true" }),
    node("text", { x: n(el.x + el.width / 2), y: n(el.y + el.height / 2 + fs * 0.35), "font-family": getFont(ctx.fonts, "sans").stack, "font-size": n(fs), "text-anchor": "middle", fill: "#c62828" }, [], caption),
  ];
}

/* ------------------------------------------------------------------ text */

function renderText(ctx: Ctx, el: TextElement, index: number): RenderNode[] | null {
  const v = resolve(ctx, el.content);
  if (v.status === "missing") {
    if (v.required) {
      ctx.issues.push(issue("error", "FIELD_REQUIRED_MISSING", el, index, `Required field "${v.path}" is missing.`));
      return placeholder(ctx, el, `Missing: ${v.path}`);
    }
    return decorations(ctx, el);
  }
  if (v.status === "invalid") {
    ctx.issues.push(issue("error", "FIELD_VALUE_INVALID", el, index, v.message));
    return placeholder(ctx, el, "Invalid value");
  }
  const unit = ctx.template.canvas.unit;
  const s = el.style;
  const font = getFont(ctx.fonts, s.fontFamily);
  const pad = el.padding ?? 0;
  const inner = { x: el.x + pad, y: el.y + pad, width: el.width - pad * 2, height: el.height - pad * 2 };
  const mf: MeasureFont = {
    font,
    size: ptToUnit(s.fontSize, unit),
    bold: s.fontWeight === "bold",
    italic: s.fontStyle === "italic",
    letterSpacing: ptToUnit(s.letterSpacing ?? 0, unit),
  };
  const lineHeight = s.lineHeight ?? 1.2;
  const overflow = s.overflow ?? "clip";
  const layout = layoutText(
    { text: v.text, font: mf, width: inner.width, height: inner.height, lineHeight, overflow, minSize: ptToUnit(s.minFontSize ?? 4, unit), ...(s.maxLines !== undefined ? { maxLines: s.maxLines } : {}) },
    ctx.measurer,
  );
  if (layout.overflowed) {
    ctx.issues.push(issue("warning", layout.truncated ? "TEXT_TRUNCATED" : "TEXT_OVERFLOW", el, index, layout.truncated ? "Text was truncated to fit." : "Text does not fit and is clipped at the element boundary."));
  }
  const size = layout.size;
  const lh = size * lineHeight;
  const blockH = layout.lines.length * lh;
  const vAlign = s.verticalAlign ?? "top";
  const top = vAlign === "top" ? inner.y : vAlign === "bottom" ? inner.y + inner.height - blockH : inner.y + (inner.height - blockH) / 2;
  const align = s.align ?? "left";
  const anchor = align === "left" ? "start" : align === "center" ? "middle" : "end";
  const x = align === "left" ? inner.x : align === "center" ? inner.x + inner.width / 2 : inner.x + inner.width;
  const tspans = layout.lines.map((line, i) => node("tspan", { x: n(x), y: n(top + i * lh + (lh - size) / 2 + font.metrics.ascent * size) }, [], line));

  const clipId = `${ctx.idPrefix}-clip-${index}`;
  ctx.defs.push(node("clipPath", { id: clipId }, [node("rect", { x: n(el.x), y: n(el.y), width: n(el.width), height: n(el.height) })]));
  const textNode = node(
    "text",
    {
      "font-family": font.stack,
      "font-size": n(size),
      "font-weight": s.fontWeight === "bold" ? "bold" : undefined,
      "font-style": s.fontStyle === "italic" ? "italic" : undefined,
      "text-anchor": anchor,
      "letter-spacing": s.letterSpacing ? n(mf.letterSpacing) : undefined,
      fill: s.color ?? "#000000",
      "xml:space": "preserve",
    },
    tspans,
  );
  return [...(decorations(ctx, el) ?? []), node("g", { "clip-path": `url(#${clipId})` }, [textNode])];
}

function decorations(_ctx: Ctx, el: TextElement): RenderNode[] | null {
  if (!el.background && !el.border) return null;
  const bw = el.border?.width ?? 0;
  const r = el.border?.radius;
  return [
    node("rect", {
      x: n(el.x + bw / 2),
      y: n(el.y + bw / 2),
      width: n(Math.max(0, el.width - bw)),
      height: n(Math.max(0, el.height - bw)),
      rx: r !== undefined ? n(r) : undefined,
      fill: el.background ?? "none",
      stroke: bw > 0 ? el.border!.color : undefined,
      "stroke-width": bw > 0 ? n(bw) : undefined,
    }),
  ];
}

/* --------------------------------------------------------------- barcodes */

function barcodeValue(ctx: Ctx, el: BarcodeElement | QrCodeElement, index: number): string | null | "hidden" {
  const v = resolve(ctx, el.value);
  if (v.status === "ok") return v.text;
  if (v.status === "missing") {
    if (el.whenMissing === "hide") return "hidden";
    ctx.issues.push(issue("error", "BARCODE_VALUE_MISSING", el, index, `Barcode data field "${v.path}" is missing; no barcode was generated.`));
    return null;
  }
  ctx.issues.push(issue("error", "BARCODE_VALUE_INVALID", el, index, v.message));
  return null;
}

function rectsToPath(rects: readonly Rect[]): string {
  let d = "";
  for (const r of rects) d += `M${n(r.x)} ${n(r.y)}h${n(r.width)}v${n(r.height)}h${n(-r.width)}z`;
  return d;
}

function renderBarcode(ctx: Ctx, el: BarcodeElement, index: number): RenderNode[] | null {
  const value = barcodeValue(ctx, el, index);
  if (value === "hidden") return null;
  if (value === null) return placeholder(ctx, el, "No barcode data");
  let symbol: LinearSymbol;
  try {
    const encoded = ctx.adapter.encode(el.format, value);
    if (encoded.kind !== "linear") throw new TypeError("Adapter returned a non-linear symbol for a linear format.");
    symbol = encoded;
  } catch (e) {
    ctx.issues.push(issue("error", "BARCODE_VALUE_INVALID", el, index, e instanceof Error ? e.message : "Invalid barcode value."));
    return placeholder(ctx, el, "Invalid barcode data");
  }
  const unit = ctx.template.canvas.unit;
  const showText = el.showText ?? true;
  const textSize = ptToUnit(el.textSize ?? 8, unit);
  const textBand = showText ? textSize * 1.25 : 0;
  const { layout, issues } = layoutLinear({
    symbol,
    box: box(el),
    unit,
    textBand,
    bearer: el.format === "itf14" ? (el.bearer ?? "none") : "none",
    ...(el.moduleWidth !== undefined ? { moduleWidth: el.moduleWidth } : {}),
    ...(ctx.template.canvas.printerDpi !== undefined ? { printerDpi: ctx.template.canvas.printerDpi } : {}),
  });
  for (const i of issues) ctx.issues.push(issue(i.severity, i.code, el, index, i.message));
  if (!layout) return placeholder(ctx, el, "Barcode does not fit");

  const out: RenderNode[] = [];
  if (el.background) out.push(node("rect", { x: n(el.x), y: n(el.y), width: n(el.width), height: n(el.height), fill: el.background }));
  out.push(node("path", { d: rectsToPath(layout.bars), fill: el.color ?? "#000000", "shape-rendering": "crispEdges" }));
  if (showText) {
    out.push(
      node(
        "text",
        {
          x: n(layout.symbol.x + layout.symbol.width / 2),
          y: n(el.y + el.height - textSize * 0.2),
          "font-family": getFont(ctx.fonts, "sans").stack,
          "font-size": n(textSize),
          "text-anchor": "middle",
          fill: el.color ?? "#000000",
          "xml:space": "preserve",
        },
        [],
        symbol.hri,
      ),
    );
  }
  return out;
}

function renderQr(ctx: Ctx, el: QrCodeElement, index: number): RenderNode[] | null {
  const value = barcodeValue(ctx, el, index);
  if (value === "hidden") return null;
  if (value === null) return placeholder(ctx, el, "No QR data");
  let symbol: MatrixSymbol;
  try {
    const encoded = ctx.adapter.encode("qrcode", value, { errorCorrection: el.errorCorrection ?? "M" });
    if (encoded.kind !== "matrix") throw new TypeError("Adapter returned a non-matrix symbol for QR.");
    symbol = encoded;
  } catch (e) {
    ctx.issues.push(issue("error", "BARCODE_VALUE_INVALID", el, index, e instanceof Error ? e.message : "Invalid QR value."));
    return placeholder(ctx, el, "Invalid QR data");
  }
  const { layout, issues } = layoutMatrix(symbol, box(el), ctx.template.canvas.unit, el.quietZone ?? 4, ctx.template.canvas.printerDpi);
  for (const i of issues) ctx.issues.push(issue(i.severity, i.code, el, index, i.message));
  if (!layout) return placeholder(ctx, el, "QR does not fit");
  const out: RenderNode[] = [];
  if (el.background) out.push(node("rect", { x: n(layout.symbol.x), y: n(layout.symbol.y), width: n(layout.symbol.width), height: n(layout.symbol.height), fill: el.background }));
  out.push(node("path", { d: rectsToPath(layout.runs), fill: el.color ?? "#000000", "shape-rendering": "crispEdges" }));
  return out;
}

/* ------------------------------------------------------- image and shapes */

function renderImage(ctx: Ctx, el: ImageElement, index: number): RenderNode[] | null {
  // Re-check at render time: the host image policy may be stricter than at validation.
  const check = checkImageSource(el.src, ctx.imagePolicy, ctx.limits.maxImageBytes);
  if (!check.ok) {
    ctx.issues.push(issue("error", check.code, el, index, check.message));
    return placeholder(ctx, el, "Image blocked");
  }
  const par = el.fit === "fill" ? "none" : el.fit === "cover" ? "xMidYMid slice" : "xMidYMid meet";
  const clipId = `${ctx.idPrefix}-clip-${index}`;
  ctx.defs.push(node("clipPath", { id: clipId }, [node("rect", { x: n(el.x), y: n(el.y), width: n(el.width), height: n(el.height) })]));
  return [node("image", { x: n(el.x), y: n(el.y), width: n(el.width), height: n(el.height), href: el.src, preserveAspectRatio: par, "clip-path": `url(#${clipId})` })];
}

function renderRect(el: RectElement): RenderNode[] {
  const sw = el.strokeWidth ?? 0;
  return [
    node("rect", {
      x: n(el.x + sw / 2),
      y: n(el.y + sw / 2),
      width: n(Math.max(0, el.width - sw)),
      height: n(Math.max(0, el.height - sw)),
      rx: el.cornerRadius !== undefined ? n(el.cornerRadius) : undefined,
      fill: el.fill ?? "none",
      stroke: sw > 0 ? (el.stroke ?? "#000000") : undefined,
      "stroke-width": sw > 0 ? n(sw) : undefined,
    }),
  ];
}

function renderLine(el: LineElement): RenderNode[] {
  const y = el.y + el.height / 2;
  const sw = el.strokeWidth;
  const dash = el.dash === "dashed" ? `${n(sw * 3)} ${n(sw * 2)}` : el.dash === "dotted" ? `${n(sw)} ${n(sw * 1.5)}` : undefined;
  return [
    node("line", {
      x1: n(el.x),
      y1: n(y),
      x2: n(el.x + el.width),
      y2: n(y),
      stroke: el.stroke ?? "#000000",
      "stroke-width": n(sw),
      "stroke-dasharray": dash,
      "stroke-linecap": el.dash === "dotted" ? "round" : "butt",
    }),
  ];
}

function renderShape(el: ShapeElement): RenderNode[] {
  const sw = el.strokeWidth ?? 0;
  return [
    node("path", {
      d: shapePath(el.shape, box(el), sw),
      fill: el.fill ?? "none",
      stroke: sw > 0 ? (el.stroke ?? "#000000") : undefined,
      "stroke-width": sw > 0 ? n(sw) : undefined,
      "stroke-linejoin": sw > 0 ? "round" : undefined,
    }),
  ];
}

function renderDrawing(el: DrawingElement): RenderNode[] {
  return [
    node("path", {
      d: drawingPath(el.points, box(el), el.strokeWidth),
      fill: "none",
      stroke: el.stroke ?? "#000000",
      "stroke-width": n(el.strokeWidth),
      "stroke-linecap": "round",
      "stroke-linejoin": "round",
    }),
  ];
}
