import { describe, expect, it, vi } from "vitest";
import { defaultBarcodeAdapter, SYMBOLOGIES, SUPPORTED_SYMBOLOGIES } from "../../src/core/barcode/adapter";
import { gs1CheckDigit, hasValidGs1CheckDigit } from "../../src/core/barcode/checksum";
import { code128ValuesToBars, encodeCode128Values, FNC1, stringToCode128Items } from "../../src/core/barcode/code128";
import { encodeEanUpcBars } from "../../src/core/barcode/ean-upc";
import { gs1ToCode128Items, parseGs1 } from "../../src/core/barcode/gs1";
import { encodeItfBars } from "../../src/core/barcode/itf";
import type { LinearSymbol, MatrixSymbol } from "../../src/core/barcode/types";
import { layoutLinear, layoutMatrix } from "../../src/core/render/barcode-layout";
import { unitToDots } from "../../src/core/geometry/units";

const sum = (a: readonly number[]) => a.reduce((x, y) => x + y, 0);

describe("check digits", () => {
  it.each([
    ["590123412345", 7],
    ["03600029145", 2],
    ["9638507", 4],
    ["1540014128876", 3],
    ["10614141123456789", 7],
  ])("gs1CheckDigit(%s) = %d", (d, c) => expect(gs1CheckDigit(d)).toBe(c));

  it("validates complete numbers", () => {
    expect(hasValidGs1CheckDigit("5901234123457")).toBe(true);
    expect(hasValidGs1CheckDigit("5901234123458")).toBe(false);
    expect(hasValidGs1CheckDigit("1")).toBe(false);
    expect(() => gs1CheckDigit("12a")).toThrow(TypeError);
  });
});

describe("Code 128", () => {
  it("encodes the canonical 'Wikipedia' example in set B with correct checksum", () => {
    // Start B(104), W=55, i=73, k=75, i=73, p=80, e=69, d=68, i=73, a=65 → (104+55·1+73·2+…+65·9) mod 103 = 3281 mod 103 = 88
    expect(encodeCode128Values(stringToCode128Items("Wikipedia"))).toEqual([104, 55, 73, 75, 73, 80, 69, 68, 73, 65, 88, 106]);
  });

  it("uses set C for digit runs", () => {
    const v = encodeCode128Values(stringToCode128Items("123456"));
    expect(v[0]).toBe(105);
    expect(v.slice(1, 4)).toEqual([12, 34, 56]);
    expect(v).toHaveLength(6);
  });

  it("chooses an optimal mix for alphanumeric + digit runs", () => {
    // "AB12345678": B A B, switch to C, 4 pairs → start + 2 + switch + 4 + check + stop = 10
    expect(encodeCode128Values(stringToCode128Items("AB12345678"))).toHaveLength(10);
    // odd digit count: one digit in B, rest in C
    expect(encodeCode128Values(stringToCode128Items("12345"))).toHaveLength(7);
  });

  it("every symbol is 11 modules; stop 13; bars alternate starting with a bar", () => {
    const values = encodeCode128Values(stringToCode128Items("ABC-123"));
    const bars = code128ValuesToBars(values);
    expect(sum(bars)).toBe((values.length - 1) * 11 + 13);
    expect(bars.length % 2).toBe(1); // ends on a bar
  });

  it("places FNC1 directly after start for GS1-128", () => {
    const parsed = parseGs1("(01)09501101530003(10)LOT");
    if (!parsed.ok) throw new Error("parse failed");
    const items = gs1ToCode128Items(parsed.elements);
    expect(items[0]).toBe(FNC1);
    const values = encodeCode128Values(items);
    expect(values[0]).toBe(105);
    expect(values[1]).toBe(102);
  });

  it("inserts FNC1 separators after variable-length AIs only", () => {
    const parsed = parseGs1("(10)AB(21)CD(17)270101");
    if (!parsed.ok) throw new Error("parse failed");
    const items = gs1ToCode128Items(parsed.elements);
    expect(items.filter((i) => i === FNC1)).toHaveLength(3); // leading + after (10) + after (21)
    const fixedFirst = parseGs1("(17)270101(10)AB");
    if (!fixedFirst.ok) throw new Error("parse failed");
    expect(gs1ToCode128Items(fixedFirst.elements).filter((i) => i === FNC1)).toHaveLength(1);
  });
});

describe("EAN/UPC/ITF structure", () => {
  it("EAN-13 and UPC-A have 95 modules, EAN-8 has 67", () => {
    expect(sum(encodeEanUpcBars("ean13", "5901234123457"))).toBe(95);
    expect(sum(encodeEanUpcBars("upca", "036000291452"))).toBe(95);
    expect(sum(encodeEanUpcBars("ean8", "96385074"))).toBe(67);
  });

  it("UPC-A equals EAN-13 with a leading zero", () => {
    expect(encodeEanUpcBars("upca", "036000291452")).toEqual(encodeEanUpcBars("ean13", "0036000291452"));
  });

  it("ITF-14 has the expected element count and ratio", () => {
    const bars = encodeItfBars("15400141288763");
    expect(bars).toHaveLength(4 + 14 * 5 + 3);
    expect(new Set(bars)).toEqual(new Set([1, 2.5]));
    expect(() => encodeItfBars("123")).toThrow(TypeError);
  });

  it("GS1 HRI normalisation", () => {
    expect(defaultBarcodeAdapter.validate("gs1-128", "(01)09501101530003(10)A")).toEqual({ ok: true, normalized: "(01)09501101530003(10)A" });
    expect(parseGs1("(3103)001250").ok).toBe(true);
    expect(parseGs1("(3106)001250").ok).toBe(false);
    expect(parseGs1("(17)270100").ok).toBe(true); // day 00 permitted
    expect(parseGs1("(17)270229").ok).toBe(false); // 2027 is not a leap year
    expect(parseGs1("(17)280229").ok).toBe(true);
    expect(parseGs1(`(10)${"A".repeat(20)}(21)${"B".repeat(20)}(240)${"C".repeat(10)}`)).toMatchObject({ ok: false, reason: "length" });
  });

  it("lists exactly the verified formats", () => {
    expect(SUPPORTED_SYMBOLOGIES).toEqual(["code128", "gs1-128", "ean13", "ean8", "upca", "itf14", "qrcode"]);
    expect(Object.keys(SYMBOLOGIES).sort()).toEqual([...SUPPORTED_SYMBOLOGIES].sort());
  });
});

describe("barcode layout", () => {
  const ean = defaultBarcodeAdapter.encode("ean13", "5901234123457") as LinearSymbol;
  const box = { x: 0, y: 0, width: 40, height: 20 };

  it("fits uniformly including quiet zones and centres the symbol", () => {
    const { layout, issues } = layoutLinear({ symbol: ean, box, unit: "mm", textBand: 3, bearer: "none" });
    expect(layout).toBeDefined();
    expect(layout!.moduleWidth).toBeCloseTo(40 / (95 + 18), 9);
    expect(layout!.symbol.width).toBeCloseTo(40, 9);
    expect(layout!.bars[0]!.x).toBeCloseTo(11 * layout!.moduleWidth, 9);
    expect(layout!.barHeight).toBeCloseTo(17, 9);
    expect(issues).toEqual([]);
    const short = layoutLinear({ symbol: ean, box: { ...box, height: 8 }, unit: "mm", textBand: 0, bearer: "none" });
    expect(short.issues.map((i) => i.code)).toEqual(["BARCODE_TRUNCATED"]);
  });

  it("never squeezes a fixed X-dimension", () => {
    const { layout, issues } = layoutLinear({ symbol: ean, box, unit: "mm", textBand: 0, bearer: "none", moduleWidth: 0.4 });
    expect(layout).toBeUndefined();
    expect(issues[0]?.code).toBe("BARCODE_DOES_NOT_FIT");
    const ok = layoutLinear({ symbol: ean, box: { ...box, width: 50 }, unit: "mm", textBand: 0, bearer: "none", moduleWidth: 0.33 });
    expect(ok.layout?.symbol.width).toBeCloseTo(113 * 0.33, 9);
  });

  it("snaps modules to whole printer dots", () => {
    const { layout } = layoutLinear({ symbol: ean, box, unit: "mm", textBand: 0, bearer: "none", printerDpi: 203 });
    const dots = unitToDots(layout!.moduleWidth, 203, "mm");
    expect(Math.abs(dots - Math.round(dots))).toBeLessThan(1e-9);
    for (const b of layout!.bars) {
      const w = unitToDots(b.width, 203, "mm");
      const x = unitToDots(b.x - layout!.symbol.x, 203, "mm");
      expect(Math.abs(w - Math.round(w))).toBeLessThan(1e-6);
      expect(Math.abs(x - Math.round(x))).toBeLessThan(1e-6);
    }
  });

  it("keeps ITF wide:narrow ratio within 2.25–3 when snapping", () => {
    const itf = defaultBarcodeAdapter.encode("itf14", "1540014128876") as LinearSymbol;
    for (const dpi of [203, 300, 600]) {
      const { layout } = layoutLinear({ symbol: itf, box: { x: 0, y: 0, width: 140, height: 40 }, unit: "mm", textBand: 0, bearer: "frame", printerDpi: dpi });
      const widths = layout!.bars.slice(0, -4).map((b) => b.width / layout!.moduleWidth);
      const wide = Math.max(...widths);
      expect(wide).toBeGreaterThanOrEqual(2.25 - 1e-9);
      expect(wide).toBeLessThanOrEqual(3 + 1e-9);
    }
  });

  it("errors when bars would be narrower than a printer dot or too short", () => {
    expect(layoutLinear({ symbol: ean, box: { ...box, width: 10 }, unit: "mm", textBand: 0, bearer: "none", printerDpi: 203 }).issues[0]?.code).toBe("BARCODE_TOO_SMALL_FOR_PRINTER");
    expect(layoutLinear({ symbol: ean, box: { ...box, height: 2 }, unit: "mm", textBand: 3, bearer: "none" }).issues[0]?.code).toBe("BARCODE_TOO_SHORT");
  });

  it("warns when the X-dimension is below the recommended minimum", () => {
    const { issues } = layoutLinear({ symbol: ean, box: { ...box, width: 25 }, unit: "mm", textBand: 0, bearer: "none" });
    expect(issues.map((i) => i.code)).toContain("BARCODE_MODULE_TOO_SMALL");
  });

  it("lays out QR codes square, centred, with quiet zone", () => {
    const qr = defaultBarcodeAdapter.encode("qrcode", "HELLO") as MatrixSymbol;
    const { layout } = layoutMatrix(qr, { x: 0, y: 0, width: 30, height: 20 }, "mm", 4);
    expect(layout!.symbol.width).toBeCloseTo(20, 9);
    expect(layout!.symbol.x).toBeCloseTo(5, 9);
    expect(layout!.moduleSize).toBeCloseTo(20 / (qr.size + 8), 9);
    const darkModules = qr.modules.reduce((a, b) => a + b, 0);
    expect(layout!.runs.reduce((a, r) => a + r.width / layout!.moduleSize, 0)).toBeCloseTo(darkModules, 6);
  });
});

describe("createCachingBarcodeAdapter", () => {
  it("returns identical results, reuses encodings, is bounded, and never caches failures", async () => {
    const { createCachingBarcodeAdapter } = await import("../../src/core/barcode/cache");
    const inner = { ...defaultBarcodeAdapter, encode: vi.fn(defaultBarcodeAdapter.encode) };
    const cached = createCachingBarcodeAdapter(inner, { maxEntries: 2 });
    const a = cached.encode("qrcode", "HELLO", { errorCorrection: "M" });
    expect(cached.encode("qrcode", "HELLO", { errorCorrection: "M" })).toBe(a);
    expect(inner.encode).toHaveBeenCalledTimes(1);
    expect(a).toEqual(defaultBarcodeAdapter.encode("qrcode", "HELLO", { errorCorrection: "M" }));
    cached.encode("qrcode", "HELLO", { errorCorrection: "H" }); // different options → different entry
    cached.encode("code128", "X1");
    expect(cached.cacheSize()).toBe(2);
    expect(() => cached.encode("ean13", "bad")).toThrow();
    expect(() => cached.encode("ean13", "bad")).toThrow();
    expect(cached.cacheSize()).toBe(2);
    expect(Object.isFrozen(cached.encode("code128", "X1"))).toBe(true);
  });
});
