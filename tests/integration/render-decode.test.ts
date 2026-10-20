/**
 * Release gate G9: barcodes rendered by the *full renderer* (as printed)
 * decode with an independent decoder, including dot-snapped, rotated,
 * bearer-framed and HRI variants.
 */
import { describe, expect, it } from "vitest";
import { renderLabel } from "../../src/core/render/render-label";
import { renderNodeToSvgString } from "../../src/core/render/svg-serializer";
import type { BarcodeFormat, LabelElement } from "../../src/core/schema/types";
import { baseTemplate, textileRecord, textileTemplate } from "../fixtures/templates";
import { decodeSvg } from "./decode-helpers";

const zxingName: Record<BarcodeFormat, "Code128" | "EAN-13" | "EAN-8" | "UPC-A" | "ITF"> = {
  code128: "Code128",
  "gs1-128": "Code128",
  ean13: "EAN-13",
  ean8: "EAN-8",
  upca: "UPC-A",
  itf14: "ITF",
};

function render(el: LabelElement, canvas = { width: 80, height: 40, unit: "mm" as const }, record: Record<string, unknown> = {}) {
  const r = renderLabel(baseTemplate([el], { canvas }), record);
  expect(r.issues.filter((i) => i.severity === "error")).toEqual([]);
  return renderNodeToSvgString(r.root);
}

describe("rendered labels decode (zxing-cpp)", () => {
  it.each<[BarcodeFormat, string, string]>([
    ["code128", "KRT-IND-042-M", "KRT-IND-042-M"],
    ["gs1-128", "(01)09501101530003(10)B2026", "(01)09501101530003(10)B2026"],
    ["ean13", "890103086527", "8901030865275"],
    ["ean8", "9638507", "96385074"],
    ["upca", "03600029145", "036000291452"],
    ["itf14", "1540014128876", "15400141288763"],
  ])("%s via data binding", async (format, value, expected) => {
    const width = format === "itf14" || format === "gs1-128" ? 76 : 60;
    const svg = render(
      { id: "bc", type: "barcode", x: 2, y: 2, width, height: 30, format, value: { kind: "field", path: "code" } },
      { width: 80, height: 40, unit: "mm" },
      { code: value },
    );
    const res = await decodeSvg(svg, [zxingName[format]], 4);
    expect(res.length).toBeGreaterThan(0);
    const text = format === "upca" ? res[0]!.text.replace(/^0(?=\d{12}$)/, "") : res[0]!.text;
    expect(text).toBe(expected);
  });

  it.each([203, 300])("dot-snapped output at %d dpi decodes", async (dpi) => {
    const svg = render(
      { id: "bc", type: "barcode", x: 2, y: 2, width: 46, height: 20, format: "code128", value: { kind: "static", value: "SNAP-203" } },
      { width: 50, height: 25, unit: "mm", printerDpi: dpi } as never,
    );
    expect((await decodeSvg(svg, ["Code128"], 4))[0]?.text).toBe("SNAP-203");
  });

  it("ITF-14 with bearer frame decodes", async () => {
    const svg = render({ id: "bc", type: "barcode", x: 2, y: 2, width: 140, height: 40, format: "itf14", bearer: "frame", value: { kind: "static", value: "15400141288763" } }, { width: 150, height: 50, unit: "mm" });
    expect((await decodeSvg(svg, ["ITF"], 3))[0]?.text).toBe("15400141288763");
  });

  it("rotated barcodes decode", async () => {
    const svg = render({ id: "bc", type: "barcode", x: 0, y: 25, width: 60, height: 20, rotation: 90, format: "code128", value: { kind: "static", value: "ROT-90" } }, { width: 70, height: 70, unit: "mm" });
    expect((await decodeSvg(svg, ["Code128"], 4))[0]?.text).toBe("ROT-90");
  });

  it("inch and px templates decode", async () => {
    const inch = render({ id: "bc", type: "barcode", x: 0.1, y: 0.1, width: 2.8, height: 1, format: "ean13", value: { kind: "static", value: "4006381333931" } }, { width: 3, height: 1.2, unit: "in" } as never);
    expect((await decodeSvg(inch, ["EAN-13"], 4))[0]?.text).toBe("4006381333931");
    const px = render({ id: "bc", type: "barcode", x: 10, y: 10, width: 300, height: 100, format: "code128", value: { kind: "static", value: "PX-1" } }, { width: 320, height: 130, unit: "px" } as never);
    expect((await decodeSvg(px, ["Code128"], 3))[0]?.text).toBe("PX-1");
  });

  it("QR inside a label decodes (UTF-8)", async () => {
    const value = "https://shop.example/p/KRT-042?size=M&c=₹999";
    const svg = render({ id: "qr", type: "qrcode", x: 5, y: 5, width: 30, height: 30, errorCorrection: "Q", value: { kind: "static", value } }, { width: 40, height: 40, unit: "mm" });
    expect((await decodeSvg(svg, ["QRCode"], 6))[0]?.text).toBe(value);
  });

  it("the full textile hang tag barcode decodes amid other content", async () => {
    const svg = renderNodeToSvgString(renderLabel(textileTemplate, textileRecord).root);
    expect((await decodeSvg(svg, ["Code128"], 5))[0]?.text).toBe(textileRecord.product.sku);
  });
});
