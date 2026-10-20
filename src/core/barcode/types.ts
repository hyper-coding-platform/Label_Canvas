import type { BarcodeFormat } from "../schema/types";

/** Every format the SDK can render. Matrix formats are listed separately. */
export type SymbologyId = BarcodeFormat | "qrcode";

/**
 * A linear (1D) symbol as a run-length list of module widths.
 * `bars[0]` is a bar, `bars[1]` a space, alternating. Widths are in units of
 * the narrow module X (ITF wide elements may be fractional, e.g. 2.5).
 */
export interface LinearSymbol {
  readonly kind: "linear";
  readonly format: BarcodeFormat;
  readonly bars: readonly number[];
  /** Minimum quiet zones in X modules. */
  readonly quietZoneLeft: number;
  readonly quietZoneRight: number;
  /** Human-readable interpretation. */
  readonly hri: string;
  /** Data actually encoded (normalized; includes computed check digits). */
  readonly data: string;
  /**
   * Two-width symbologies (ITF): the wide:narrow ratio used in `bars`. Lets
   * printer-dot snapping recompute wide elements as whole dots while keeping
   * the ratio inside the permitted range.
   */
  readonly wideRatio?: number;
}

/** A 2D symbol as a square module matrix (row-major, 1 = dark). */
export interface MatrixSymbol {
  readonly kind: "matrix";
  readonly format: "qrcode";
  readonly size: number;
  readonly modules: Uint8Array;
  readonly data: string;
}

export type EncodedSymbol = LinearSymbol | MatrixSymbol;

export type BarcodeValidation =
  | { readonly ok: true; readonly normalized: string }
  | { readonly ok: false; readonly reason: string; readonly message: string };

export interface EncodeOptions {
  /** QR error correction level. */
  readonly errorCorrection?: "L" | "M" | "Q" | "H";
}

/**
 * Pluggable barcode implementation. Implementations must be pure and
 * deterministic, must reject (never "repair") invalid input, and must throw
 * `BarcodeValueError` from `encode` for invalid values.
 */
export interface BarcodeAdapter {
  readonly id: string;
  readonly formats: readonly SymbologyId[];
  validate(format: SymbologyId, value: string, options?: EncodeOptions): BarcodeValidation;
  encode(format: SymbologyId, value: string, options?: EncodeOptions): EncodedSymbol;
}

/** Physical guidance per format (millimetres). Used for warnings, not hard limits. */
export interface SymbologyInfo {
  readonly id: SymbologyId;
  readonly label: string;
  readonly kind: "linear" | "matrix";
  /** Smallest recommended X-dimension (mm). Below this a warning is issued. */
  readonly minModuleMm: number;
  /** Nominal X-dimension (mm), if the standard defines one. */
  readonly nominalModuleMm?: number;
  /** Nominal bar height at nominal X (mm), if the standard defines one. */
  readonly nominalBarHeightMm?: number;
  readonly description: string;
}
