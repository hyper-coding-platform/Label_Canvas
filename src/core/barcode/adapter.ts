import { BarcodeValueError, LabelStudioError } from "../errors";
import type { BarcodeFormat } from "../schema/types";
import { CODE128_MAX_ITEMS, code128ValuesToBars, encodeCode128Values, stringToCode128Items, validateCode128Items } from "./code128";
import { EAN_UPC_QUIET_ZONES, encodeEanUpcBars, validateEanUpc } from "./ean-upc";
import { gs1Hri, gs1ToCode128Items, parseGs1 } from "./gs1";
import { ITF14_QUIET_ZONE, ITF_DEFAULT_RATIO, encodeItfBars, validateItf14 } from "./itf";
import { encodeQr, validateQr } from "./qr";
import type { BarcodeAdapter, BarcodeValidation, EncodeOptions, EncodedSymbol, LinearSymbol, SymbologyId, SymbologyInfo } from "./types";

export const SYMBOLOGIES: Readonly<Record<SymbologyId, SymbologyInfo>> = Object.freeze({
  code128: {
    id: "code128",
    label: "Code 128",
    kind: "linear",
    minModuleMm: 0.19,
    description: "General-purpose alphanumeric (ASCII 0–127). Not a GS1 symbol: use GS1-128 for AI data.",
  },
  "gs1-128": {
    id: "gs1-128",
    label: "GS1-128",
    kind: "linear",
    minModuleMm: 0.25,
    nominalModuleMm: 0.495,
    description: "GS1 Application Identifier data in Code 128 with FNC1. Input uses bracketed AIs: (01)…(10)….",
  },
  ean13: {
    id: "ean13",
    label: "EAN-13",
    kind: "linear",
    minModuleMm: 0.264,
    nominalModuleMm: 0.33,
    nominalBarHeightMm: 22.85,
    description: "GTIN-13 retail point-of-sale. 12 digits (+ computed check digit) or 13 digits (verified).",
  },
  ean8: {
    id: "ean8",
    label: "EAN-8",
    kind: "linear",
    minModuleMm: 0.264,
    nominalModuleMm: 0.33,
    nominalBarHeightMm: 18.23,
    description: "GTIN-8 for small items. 7 digits (+ check) or 8 digits (verified).",
  },
  upca: {
    id: "upca",
    label: "UPC-A",
    kind: "linear",
    minModuleMm: 0.264,
    nominalModuleMm: 0.33,
    nominalBarHeightMm: 22.85,
    description: "GTIN-12 retail point-of-sale (North America). 11 digits (+ check) or 12 digits (verified).",
  },
  itf14: {
    id: "itf14",
    label: "ITF-14",
    kind: "linear",
    minModuleMm: 0.264,
    nominalModuleMm: 1.016,
    description: "GTIN-14 on outer cases/cartons. 13 digits (+ check) or 14 digits (verified).",
  },
  qrcode: {
    id: "qrcode",
    label: "QR Code",
    kind: "matrix",
    minModuleMm: 0.25,
    description: "2D symbol for URLs and free text (UTF-8). Error correction L/M/Q/H.",
  },
});

export const LINEAR_FORMATS: readonly BarcodeFormat[] = Object.freeze(["code128", "gs1-128", "ean13", "ean8", "upca", "itf14"]);
export const SUPPORTED_SYMBOLOGIES: readonly SymbologyId[] = Object.freeze([...LINEAR_FORMATS, "qrcode"]);

export function isBarcodeFormat(value: unknown): value is BarcodeFormat {
  return typeof value === "string" && (LINEAR_FORMATS as readonly string[]).includes(value);
}

function validate(format: SymbologyId, value: string, options?: EncodeOptions): BarcodeValidation {
  switch (format) {
    case "code128": {
      if (value.length > CODE128_MAX_ITEMS) {
        return { ok: false, reason: "length", message: `Code 128 values are limited to ${CODE128_MAX_ITEMS} characters.` };
      }
      const err = validateCode128Items(stringToCode128Items(value));
      return err ? { ok: false, reason: value.length === 0 ? "empty" : "charset", message: err } : { ok: true, normalized: value };
    }
    case "gs1-128": {
      const parsed = parseGs1(value);
      return parsed.ok ? { ok: true, normalized: gs1Hri(parsed.elements) } : parsed;
    }
    case "ean13":
    case "ean8":
    case "upca":
      return validateEanUpc(format, value);
    case "itf14":
      return validateItf14(value);
    case "qrcode":
      return validateQr(value, options?.errorCorrection);
    default:
      return { ok: false, reason: "format", message: `Unsupported barcode format "${String(format)}".` };
  }
}

function fail(format: string, v: Extract<BarcodeValidation, { ok: false }>): never {
  throw new BarcodeValueError(format, v.reason, v.message);
}

function encode(format: SymbologyId, value: string, options?: EncodeOptions): EncodedSymbol {
  const v = validate(format, value, options);
  if (!v.ok) fail(format, v);
  switch (format) {
    case "code128": {
      const bars = code128ValuesToBars(encodeCode128Values(stringToCode128Items(value)));
      return linear(format, bars, 10, 10, value, value);
    }
    case "gs1-128": {
      const parsed = parseGs1(value);
      if (!parsed.ok) fail(format, parsed);
      const bars = code128ValuesToBars(encodeCode128Values(gs1ToCode128Items(parsed.elements)));
      return linear(format, bars, 10, 10, v.normalized, v.normalized);
    }
    case "ean13":
    case "ean8":
    case "upca": {
      const qz = EAN_UPC_QUIET_ZONES[format];
      return linear(format, encodeEanUpcBars(format, v.normalized), qz.left, qz.right, v.normalized, v.normalized);
    }
    case "itf14":
      return { ...linear(format, encodeItfBars(v.normalized), ITF14_QUIET_ZONE, ITF14_QUIET_ZONE, v.normalized, v.normalized), wideRatio: ITF_DEFAULT_RATIO };
    case "qrcode":
      return encodeQr(value, options?.errorCorrection);
    default:
      throw new LabelStudioError("BARCODE_FORMAT_UNSUPPORTED", `Unsupported barcode format "${String(format)}".`, { format });
  }
}

function linear(format: BarcodeFormat, bars: number[], qzL: number, qzR: number, hri: string, data: string): LinearSymbol {
  return { kind: "linear", format, bars, quietZoneLeft: qzL, quietZoneRight: qzR, hri, data };
}

/** The built-in adapter: linear encoders in this package + qrcode-generator. */
export const defaultBarcodeAdapter: BarcodeAdapter = Object.freeze({
  id: "erp-label-studio/builtin",
  formats: SUPPORTED_SYMBOLOGIES,
  validate,
  encode,
});

/** Convenience: validate a value for a format with the default adapter. */
export function validateBarcodeValue(format: SymbologyId, value: string, options?: EncodeOptions): BarcodeValidation {
  return validate(format, value, options);
}
