/**
 * QR Code (ISO/IEC 18004) via `qrcode-generator`.
 *
 * Text is encoded as UTF-8 in byte mode, or numeric/alphanumeric mode when
 * the whole value fits those character sets (denser symbols). No ECI header
 * is emitted; mainstream decoders detect UTF-8 heuristically.
 *
 * The library's global `stringToBytes` is not modified. UTF-8 bytes are
 * passed as a binary string whose char codes are the byte values, which the
 * library's default conversion preserves.
 */
import qrcode from "qrcode-generator";
import type { BarcodeValidation, MatrixSymbol } from "./types";

/** Byte-mode capacity of version 40 at each level (ISO/IEC 18004 table 7). */
const MAX_BYTES: Record<"L" | "M" | "Q" | "H", number> = { L: 2953, M: 2331, Q: 1663, H: 1273 };
/** Practical cap: larger symbols are rarely scannable at label sizes. */
export const QR_MAX_INPUT_BYTES = 1024;

const NUMERIC = /^\d+$/;
const ALPHANUMERIC = /^[0-9A-Z $%*+\-./:]+$/;

function utf8Bytes(value: string): Uint8Array {
  return new TextEncoder().encode(value);
}

export function validateQr(value: string, level: "L" | "M" | "Q" | "H" = "M"): BarcodeValidation {
  if (value.length === 0) return { ok: false, reason: "empty", message: "QR code value is empty." };
  if (/[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/.test(value)) {
    return { ok: false, reason: "charset", message: "QR code value contains an unpaired surrogate (invalid Unicode)." };
  }
  const bytes = utf8Bytes(value).length;
  const limit = Math.min(QR_MAX_INPUT_BYTES, MAX_BYTES[level]);
  if (bytes > limit) {
    return { ok: false, reason: "length", message: `QR code value is ${bytes} bytes; the limit at level ${level} is ${limit} bytes.` };
  }
  return { ok: true, normalized: value };
}

export function encodeQr(value: string, level: "L" | "M" | "Q" | "H" = "M"): MatrixSymbol {
  const qr = qrcode(0, level);
  if (NUMERIC.test(value)) qr.addData(value, "Numeric");
  else if (ALPHANUMERIC.test(value)) qr.addData(value, "Alphanumeric");
  else {
    let binary = "";
    for (const b of utf8Bytes(value)) binary += String.fromCharCode(b);
    qr.addData(binary, "Byte");
  }
  qr.make();
  const size = qr.getModuleCount();
  const modules = new Uint8Array(size * size);
  for (let r = 0; r < size; r += 1) {
    for (let c = 0; c < size; c += 1) if (qr.isDark(r, c)) modules[r * size + c] = 1;
  }
  return { kind: "matrix", format: "qrcode", size, modules, data: value };
}
