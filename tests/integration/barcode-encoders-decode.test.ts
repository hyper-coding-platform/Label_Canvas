import { describe, expect, it } from "vitest";
import { defaultBarcodeAdapter } from "../../src/core/barcode/adapter";
import type { LinearSymbol, MatrixSymbol } from "../../src/core/barcode/types";
import { barsToSvg, decodeSvg, matrixToSvg } from "./decode-helpers";

const linear = (format: Parameters<typeof defaultBarcodeAdapter.encode>[0], value: string) =>
  defaultBarcodeAdapter.encode(format, value) as LinearSymbol;

describe("encoders decode with an independent decoder (zxing-cpp)", () => {
  it.each([
    "ABC-123",
    "1234567890",
    "abc123XYZ",
    "Hello, World!",
    "12345abc67890",
    "A",
    "00",
    "SKU/2026/TX-0042",
  ])("Code 128 %s", async (value) => {
    const s = linear("code128", value);
    const res = await decodeSvg(barsToSvg(s.bars, s.quietZoneLeft), ["Code128"]);
    expect(res[0]?.text).toBe(value);
    expect(res[0]?.isValid).toBe(true);
  });

  it("Code 128 encodes ASCII control characters via set A", async () => {
    const value = "AB\tCD";
    const s = linear("code128", value);
    const res = await decodeSvg(barsToSvg(s.bars, 10), ["Code128"]);
    expect(res[0]?.text).toBe(value);
  });

  it.each([
    ["590123412345", "5901234123457"],
    ["5901234123457", "5901234123457"],
    ["4006381333931", "4006381333931"],
    ["890103086527", "8901030865275"],
  ])("EAN-13 %s", async (input, expected) => {
    const s = linear("ean13", input);
    const res = await decodeSvg(barsToSvg(s.bars, 11), ["EAN-13"]);
    expect(res[0]?.text).toBe(expected);
  });

  it.each([
    ["9638507", "96385074"],
    ["55123457", "55123457"],
  ])("EAN-8 %s", async (input, expected) => {
    const s = linear("ean8", input);
    const res = await decodeSvg(barsToSvg(s.bars, 7), ["EAN-8"]);
    expect(res[0]?.text).toBe(expected);
  });

  it.each([
    ["03600029145", "036000291452"],
    ["042100005264", "042100005264"],
  ])("UPC-A %s", async (input, expected) => {
    const s = linear("upca", input);
    const res = await decodeSvg(barsToSvg(s.bars, 9), ["UPC-A"]);
    expect(res[0]?.format).toBe("UPCA");
    // zxing-cpp reports UPC-A content in its 13-digit EAN form (leading 0).
    expect(res[0]?.text.replace(/^0(?=\d{12}$)/, "")).toBe(expected);
  });

  it.each([
    ["1540014128876", "15400141288763"],
    ["00012345678905", "00012345678905"],
  ])("ITF-14 %s", async (input, expected) => {
    const s = linear("itf14", input);
    const res = await decodeSvg(barsToSvg(s.bars, 10), ["ITF"]);
    expect(res[0]?.text).toBe(expected);
  });

  it.each([
    ["(01)09501101530003(17)271231(10)LOT42", "]C1"],
    ["(00)106141411234567897", "]C1"],
    ["(10)ABC(21)S123", "]C1"],
    ["(01)09501101530003(3103)001250(21)XYZ", "]C1"],
  ])("GS1-128 %s", async (input, symId) => {
    const s = linear("gs1-128", input);
    const res = await decodeSvg(barsToSvg(s.bars, 10), ["Code128"]);
    expect(res[0]?.symbologyIdentifier).toBe(symId);
    // zxing-cpp default text mode renders GS1 as HRI: it must re-segment our AIs identically.
    expect(res[0]?.text).toBe(input);
  });

  it.each([
    ["https://example.com/p/SKU-1?x=1", "L"],
    ["Cotton Kurta – Size M / ₹1,299", "M"],
    ["0123456789", "Q"],
    ["HELLO WORLD 123", "H"],
    ["絹のサリー", "M"],
  ] as const)("QR %s (EC %s)", async (value, level) => {
    const s = defaultBarcodeAdapter.encode("qrcode", value, { errorCorrection: level }) as MatrixSymbol;
    const res = await decodeSvg(matrixToSvg(s.size, s.modules), ["QRCode"], 6);
    expect(res[0]?.text).toBe(value);
    expect(res[0]?.ecLevel).toBe(level);
  });

  it.each([
    ["ean13", "8901030865278", "checksum"],
    ["ean13", "59012341234", "length"],
    ["ean13", "59012341234A", "charset"],
    ["upca", "036000291453", "checksum"],
    ["ean8", "96385075", "checksum"],
    ["itf14", "15400141288764", "checksum"],
    ["code128", "", "empty"],
    ["code128", "Café", "charset"],
    ["gs1-128", "(01)09501101530004", "checksum"],
    ["gs1-128", "(17)271331", "date"],
    ["gs1-128", "(99)", "length"],
    ["gs1-128", "(01)0950110153000", "length"],
    ["gs1-128", "(10)LOT 1", "charset"],
    ["gs1-128", "(555)X", "unknown-ai"],
    ["gs1-128", "01095011015300", "syntax"],
    ["gs1-128", "(10)A(10)B", "duplicate-ai"],
  ] as const)("rejects %s %j (%s) and never produces a symbol", (format, value, reason) => {
    const v = defaultBarcodeAdapter.validate(format, value);
    expect(v.ok).toBe(false);
    if (!v.ok) expect(v.reason).toBe(reason);
    expect(() => defaultBarcodeAdapter.encode(format, value)).toThrowError(expect.objectContaining({ code: "BARCODE_VALUE_INVALID", reason }));
  });
});
