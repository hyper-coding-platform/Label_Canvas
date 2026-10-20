/**
 * Independent decoding pipeline for tests: SVG → PNG (resvg) → zxing-cpp (zxing-wasm).
 * Neither library shares code with the package's encoders.
 */
import { Resvg } from "@resvg/resvg-js";
import { readBarcodes, type ReadInputBarcodeFormat, type ReadResult } from "zxing-wasm/reader";

export async function decodeSvg(svg: string, formats: ReadInputBarcodeFormat[], pixelsPerUnit = 8): Promise<ReadResult[]> {
  const png = new Resvg(svg, { background: "white", fitTo: { mode: "zoom", value: pixelsPerUnit } }).render().asPng();
  return readBarcodes(new Uint8Array(png), { formats, tryHarder: true, maxNumberOfSymbols: 4 });
}

/** Build a minimal SVG from module widths (bars[0] = bar). Units: modules. */
export function barsToSvg(bars: readonly number[], quiet: number, height = 60): string {
  const total = bars.reduce((a, b) => a + b, 0) + quiet * 2;
  let x = quiet;
  let d = "";
  bars.forEach((w, i) => {
    if (i % 2 === 0) d += `M${x} 0h${w}v${height}h${-w}z`;
    x += w;
  });
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${total} ${height}" width="${total}" height="${height}"><rect width="100%" height="100%" fill="#fff"/><path d="${d}" fill="#000"/></svg>`;
}

export function matrixToSvg(size: number, modules: Uint8Array, quiet = 4): string {
  const total = size + quiet * 2;
  let d = "";
  for (let r = 0; r < size; r += 1) for (let c = 0; c < size; c += 1) if (modules[r * size + c]) d += `M${c + quiet} ${r + quiet}h1v1h-1z`;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${total} ${total}" width="${total}" height="${total}"><rect width="100%" height="100%" fill="#fff"/><path d="${d}" fill="#000"/></svg>`;
}
