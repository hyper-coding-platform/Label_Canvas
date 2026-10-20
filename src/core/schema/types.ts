/**
 * Versioned label template format (schema version 1).
 *
 * Conventions (see docs/TEMPLATE_FORMAT.md):
 * - Origin is the label's top-left corner; +x right, +y down.
 * - Every length in a template uses `canvas.unit`, except typographic sizes
 *   (`fontSize`, `letterSpacing`), which are always in points (1pt = 1/72 in).
 * - `rotation` is degrees clockwise about the element's box centre, in [0, 360).
 * - Array order of `elements` is paint order: index 0 is painted first (bottom).
 */

export const CURRENT_SCHEMA_VERSION = 1 as const;

export type LengthUnit = "mm" | "in" | "px";

/** `#rgb`, `#rrggbb`, `#rrggbbaa` or the keyword `transparent`. */
export type Color = string;

export interface LabelTemplate {
  readonly schemaVersion: typeof CURRENT_SCHEMA_VERSION;
  readonly id: string;
  readonly name: string;
  readonly description?: string;
  /** Free-form industry/category, e.g. `textile`, `retail`, `warehouse`. */
  readonly category?: string;
  readonly tags?: readonly string[];
  readonly canvas: LabelCanvas;
  readonly elements: readonly LabelElement[];
}

export interface LabelCanvas {
  readonly width: number;
  readonly height: number;
  readonly unit: LengthUnit;
  /** Label background. Omitted = white. */
  readonly background?: Color;
  /** Corner radius of die-cut labels; used for preview outline only. */
  readonly cornerRadius?: number;
  /**
   * Target printer resolution in dots per inch (e.g. 203, 300, 600). When set,
   * barcode module widths snap to whole printer dots.
   */
  readonly printerDpi?: number;
}

/* ------------------------------------------------------------------ values */

/** Where an element's value comes from. */
export type ValueSource = StaticValue | FieldValue;

export interface StaticValue {
  readonly kind: "static";
  readonly value: string;
}

export interface FieldValue {
  readonly kind: "field";
  /** Safe dotted path into the data record, e.g. `product.sku` or `variants.0.size`. */
  readonly path: string;
  /** Prepended only when the resolved value is present. */
  readonly prefix?: string;
  /** Appended only when the resolved value is present. */
  readonly suffix?: string;
  /** Used (without prefix/suffix) when the value is missing, null or empty. */
  readonly fallback?: string;
  readonly format?: ValueFormat;
  /** Missing value is a record error rather than an empty output. */
  readonly required?: boolean;
}

export type ValueFormat = TextFormat | NumberFormat | CurrencyFormat | DateFormat;

export interface TextFormat {
  readonly type: "text";
  readonly case?: "upper" | "lower" | "title";
  /** Truncate to at most this many characters (Unicode code points). */
  readonly maxLength?: number;
}

export interface NumberFormat {
  readonly type: "number";
  /** Fixed number of fraction digits (0–6). Omitted = as-is. */
  readonly decimals?: number;
  /** Group thousands. Default false. */
  readonly grouping?: boolean;
  /** BCP 47 locale. Omitted = deterministic built-in format (`1234.5`, `1,234.50`). */
  readonly locale?: string;
}

export interface CurrencyFormat {
  readonly type: "currency";
  /** ISO 4217 code, e.g. `INR`, `USD`. */
  readonly currency: string;
  readonly decimals?: number;
  /**
   * `code` (default without locale): `INR 1,299.00`.
   * `symbol`: requires `locale`; uses Intl (`₹1,299.00`).
   * `none`: number only.
   */
  readonly display?: "code" | "symbol" | "none";
  readonly locale?: string;
}

export interface DateFormat {
  readonly type: "date";
  /** Tokens: YYYY YY MMMM MMM MM M DD D HH mm. Other characters are literal. */
  readonly pattern: string;
  /** Default `UTC`. */
  readonly timeZone?: "UTC" | "local";
}

/* -------------------------------------------------------------- conditions */

export type Condition = AllCondition | AnyCondition | NotCondition | FieldCondition;

export interface AllCondition {
  readonly all: readonly Condition[];
}
export interface AnyCondition {
  readonly any: readonly Condition[];
}
export interface NotCondition {
  readonly not: Condition;
}

export type PresenceOperator = "exists" | "missing" | "empty" | "notEmpty";
export type ComparisonOperator = "eq" | "neq" | "gt" | "gte" | "lt" | "lte" | "contains" | "startsWith";

export type FieldCondition =
  | { readonly field: string; readonly op: PresenceOperator }
  | { readonly field: string; readonly op: ComparisonOperator; readonly value: string | number | boolean };

/* ---------------------------------------------------------------- elements */

export type ElementType = LabelElement["type"];

export interface ElementBase {
  readonly id: string;
  /** Display name in the layers panel. */
  readonly name?: string;
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
  readonly rotation?: number;
  /** Default true. Hidden elements are neither rendered nor printed. */
  readonly visible?: boolean;
  /** Locked elements cannot be moved or resized in the editor. */
  readonly locked?: boolean;
  /** Element renders only when the condition holds for the record. */
  readonly condition?: Condition;
}

export interface Border {
  readonly width: number;
  readonly color: Color;
  readonly radius?: number;
}

export type TextOverflow = "clip" | "shrink" | "ellipsis" | "wrap";

export interface TextStyle {
  /** Font id: `sans`, `serif`, `mono`, `condensed`, or a host-registered id. */
  readonly fontFamily: string;
  /** Points. */
  readonly fontSize: number;
  readonly fontWeight?: "normal" | "bold";
  readonly fontStyle?: "normal" | "italic";
  readonly color?: Color;
  readonly align?: "left" | "center" | "right";
  readonly verticalAlign?: "top" | "middle" | "bottom";
  /** Multiple of fontSize. Default 1.2. */
  readonly lineHeight?: number;
  /** Points. Default 0. */
  readonly letterSpacing?: number;
  /** Default `clip`. */
  readonly overflow?: TextOverflow;
  /** Max lines for `wrap`. */
  readonly maxLines?: number;
  /** Lower bound in points for `shrink`. Default 4. */
  readonly minFontSize?: number;
}

export interface TextElement extends ElementBase {
  readonly type: "text";
  readonly content: ValueSource;
  readonly style: TextStyle;
  readonly background?: Color;
  readonly border?: Border;
  /** Inner padding in template units. */
  readonly padding?: number;
}

export type LinearBarcodeFormat = "code128" | "gs1-128" | "ean13" | "ean8" | "upca" | "itf14";
export type BarcodeFormat = LinearBarcodeFormat;

export interface BarcodeElement extends ElementBase {
  readonly type: "barcode";
  readonly format: BarcodeFormat;
  readonly value: ValueSource;
  /** Show human-readable interpretation below the bars. Default true. */
  readonly showText?: boolean;
  /** HRI font size in points. Default 8. */
  readonly textSize?: number;
  readonly color?: Color;
  readonly background?: Color;
  /**
   * Fixed X-dimension (narrow module width) in template units. Omitted = fit
   * the element width (including quiet zones) with uniform module scaling.
   */
  readonly moduleWidth?: number;
  /** ITF-14 bearer bars. Default `none`. */
  readonly bearer?: "none" | "frame" | "top-bottom";
  /** Behaviour when the bound value is missing. Default `error`. */
  readonly whenMissing?: "error" | "hide";
}

export interface QrCodeElement extends ElementBase {
  readonly type: "qrcode";
  readonly value: ValueSource;
  /** Default `M`. */
  readonly errorCorrection?: "L" | "M" | "Q" | "H";
  /** Quiet zone in modules. Default 4 (the QR specification minimum). */
  readonly quietZone?: number;
  readonly color?: Color;
  readonly background?: Color;
  readonly whenMissing?: "error" | "hide";
}

export interface ImageElement extends ElementBase {
  readonly type: "image";
  /** `data:image/(png|jpeg|gif|webp);base64,...` or an https URL allowed by the host image policy. */
  readonly src: string;
  /** Default `contain`. */
  readonly fit?: "contain" | "cover" | "fill";
  readonly alt?: string;
}

export interface RectElement extends ElementBase {
  readonly type: "rect";
  readonly fill?: Color;
  readonly stroke?: Color;
  /** Template units. Default 0 (no stroke). */
  readonly strokeWidth?: number;
  readonly cornerRadius?: number;
}

/** A straight line drawn horizontally through the vertical centre of its box; use rotation for other angles. */
export interface LineElement extends ElementBase {
  readonly type: "line";
  readonly stroke?: Color;
  /** Template units. */
  readonly strokeWidth: number;
  readonly dash?: "solid" | "dashed" | "dotted";
}

export type LabelElement = TextElement | BarcodeElement | QrCodeElement | ImageElement | RectElement | LineElement;

/* ------------------------------------------------------------- data schema */

export type DataFieldType = "string" | "number" | "boolean" | "date";

/** Describes a field the host ERP can supply; drives the editor's field picker. */
export interface DataField {
  readonly path: string;
  readonly label: string;
  readonly type?: DataFieldType;
  readonly description?: string;
  readonly group?: string;
  readonly required?: boolean;
  /** Example value shown in the editor preview. */
  readonly example?: string | number | boolean | null;
}

export interface DataSchema {
  readonly fields: readonly DataField[];
}

/** A data record supplied by the host. Treated as untrusted. */
export type DataRecord = Readonly<Record<string, unknown>>;
