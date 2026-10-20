/**
 * Printable calibration page: rulers of known length, label outlines with
 * centre crosses, and instructions. Print it on plain paper (sheet layouts)
 * or on label stock (roll layouts) with scaling set to 100% / "Actual size",
 * then measure. See docs/PRINTING.md, "Calibration".
 */
import { LabelStudioError } from "../errors";
import { convertLength, formatSvgNumber as n } from "../geometry/units";
import type { LengthUnit } from "../schema/types";
import { printCss } from "./document";
import { computePageSpec, type LabelSize } from "./layout";
import type { PrintLayout } from "./layout-types";

export function buildCalibrationDocument(label: LabelSize, layout: PrintLayout): string {
  const { page, issues } = computePageSpec(label, layout);
  const err = issues.find((i) => i.severity === "error");
  if (err) throw new LabelStudioError("PRINT_FAILED", err.message, { issues });
  const u: LengthUnit = page.unit;
  const mm = (v: number) => convertLength(v, "mm", u);
  // Ruler length: largest of 100/50/20/10 mm that fits the page width with a 5 mm inset.
  const usable = convertLength(page.width, u, "mm") - 10;
  const rulerMm = [100, 50, 20, 10].find((l) => l <= usable) ?? Math.max(5, Math.floor(usable));
  const ticks: string[] = [];
  for (let i = 0; i <= rulerMm; i += 1) {
    const len = i % 10 === 0 ? 4 : i % 5 === 0 ? 2.5 : 1.5;
    ticks.push(`<line x1="${n(mm(5 + i))}" y1="${n(mm(5))}" x2="${n(mm(5 + i))}" y2="${n(mm(5 + len))}" stroke="#000" stroke-width="${n(mm(0.15))}"/>`);
  }
  const vRulerMm = Math.min(rulerMm, Math.max(5, Math.floor(convertLength(page.height, u, "mm") - 20)));
  const vticks: string[] = [];
  for (let i = 0; i <= vRulerMm; i += 1) {
    const len = i % 10 === 0 ? 4 : i % 5 === 0 ? 2.5 : 1.5;
    vticks.push(`<line x1="${n(mm(5))}" y1="${n(mm(12 + i))}" x2="${n(mm(5 + len))}" y2="${n(mm(12 + i))}" stroke="#000" stroke-width="${n(mm(0.15))}"/>`);
  }
  const cells = page.slots
    .map((s) => {
      const cx = s.x + s.width / 2;
      const cy = s.y + s.height / 2;
      const c = mm(2);
      return `<rect x="${n(s.x)}" y="${n(s.y)}" width="${n(s.width)}" height="${n(s.height)}" fill="none" stroke="#000" stroke-width="${n(mm(0.1))}"/><line x1="${n(cx - c)}" y1="${n(cy)}" x2="${n(cx + c)}" y2="${n(cy)}" stroke="#000" stroke-width="${n(mm(0.1))}"/><line x1="${n(cx)}" y1="${n(cy - c)}" x2="${n(cx)}" y2="${n(cy + c)}" stroke="#000" stroke-width="${n(mm(0.1))}"/>`;
    })
    .join("");
  const fs = n(mm(2.6));
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${n(page.width)}${u}" height="${n(page.height)}${u}" viewBox="0 0 ${n(page.width)} ${n(page.height)}">${cells}${ticks.join("")}${vticks.join("")}<text x="${n(mm(5))}" y="${n(mm(13))}" font-family="Arial, sans-serif" font-size="${fs}" transform="translate(${n(mm(4))} 0)">Horizontal ruler: ${rulerMm} mm · vertical ruler: ${vRulerMm} mm · label ${n(label.width)}×${n(label.height)} ${label.unit}</text></svg>`;
  return [
    "<!doctype html>",
    '<html lang="en"><head><meta charset="utf-8"><title>Label printer calibration</title><style>',
    printCss(page),
    ".page svg { position: absolute; left: 0; top: 0; }",
    "</style></head><body>",
    `<section class="page">${svg}</section>`,
    "</body></html>",
  ].join("\n");
}
