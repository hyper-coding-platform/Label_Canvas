/**
 * Builds a self-contained HTML print document from rendered labels.
 *
 * Markup is assembled only from the escaping SVG serializer and from numbers
 * this module formats itself; no record data is interpolated except through
 * the serializer (which escapes text) and `escapeText` for the title.
 * The document contains no scripts.
 */
import { LabelStudioError, type Issue } from "../errors";
import { formatSvgNumber } from "../geometry/units";
import { prepareTemplate, renderLabel, type RenderOptions } from "../render/render-label";
import { escapeText, renderNodeToSvgString } from "../render/svg-serializer";
import type { DataRecord, LabelTemplate } from "../schema/types";
import { computePageSpec, paginate, type PageSpec, type Placement } from "./layout";
import type { PrintLayout } from "./layout-types";

export interface PrintDocumentOptions extends Omit<RenderOptions, "idPrefix" | "mode"> {
  /** Defaults to one label per page sized to the label (thermal roll). */
  readonly layout?: PrintLayout | undefined;
  readonly copies?: number | undefined;
  /** Skip this many positions on the first sheet (partially used sheets). */
  readonly skipSlots?: number | undefined;
  /**
   * `skip` (default): records with errors are not printed and are reported.
   * `fail`: throw if any record has errors (nothing is printed).
   */
  readonly invalidRecords?: "skip" | "fail" | undefined;
  /** Draw thin outlines around label positions (for calibration on plain paper). */
  readonly showOutlines?: boolean | undefined;
  /** Document title (print job name in most browsers). */
  readonly title?: string | undefined;
  /** Maximum labels per document (after copies). Default 2000; print larger jobs in chunks. */
  readonly maxLabels?: number | undefined;
}

export interface PrintDocument {
  readonly html: string;
  readonly pageCount: number;
  readonly labelCount: number;
  readonly page: PageSpec;
  /** Records that were not printed, with their issues. */
  readonly skipped: readonly { readonly recordIndex: number; readonly issues: readonly Issue[] }[];
  /** Layout warnings (e.g. unprintable area). */
  readonly warnings: readonly Issue[];
}

const n = formatSvgNumber;

export function buildPrintDocument(template: LabelTemplate, records: readonly DataRecord[], options: PrintDocumentOptions = {}): PrintDocument {
  const t = prepareTemplate(template, options);
  const layout: PrintLayout = options.layout ?? { kind: "roll", unit: t.canvas.unit };
  const { page, issues } = computePageSpec(t.canvas, layout);
  const layoutErrors = issues.filter((i) => i.severity === "error");
  if (layoutErrors.length) throw new LabelStudioError("PRINT_FAILED", layoutErrors[0]!.message, { issues: layoutErrors });
  const maxLabels = options.maxLabels ?? 2000;
  const copies = Math.max(1, Math.floor(options.copies ?? 1));
  if (records.length * copies > maxLabels) {
    throw new LabelStudioError("LIMIT_EXCEEDED", `This print job has ${records.length * copies} labels; the limit per document is ${maxLabels}. Print in smaller batches.`, { maxLabels });
  }

  // Render each record once (copies reuse the markup).
  const svgs: (string | null)[] = [];
  const skipped: { recordIndex: number; issues: readonly Issue[] }[] = [];
  records.forEach((record, i) => {
    const r = renderLabel(t, record, { ...options, mode: "output", idPrefix: `p${i}` });
    if (r.ok) svgs.push(renderNodeToSvgString(r.root));
    else {
      svgs.push(null);
      skipped.push({ recordIndex: i, issues: r.issues.filter((x) => x.severity === "error") });
    }
  });
  if (skipped.length && options.invalidRecords === "fail") {
    throw new LabelStudioError("PRINT_FAILED", `${skipped.length} record(s) cannot be printed; first: ${skipped[0]!.issues[0]?.message ?? "invalid"}`, { skipped });
  }
  const printable = svgs.map((s, i) => ({ s, i })).filter((x): x is { s: string; i: number } => x.s !== null);
  const { placements, pageCount } = paginate(printable.length, page, { copies, ...(options.skipSlots !== undefined ? { skipSlots: options.skipSlots } : {}) });
  const html = toHtml(page, placements, (i) => printable[i]!.s, options);
  return { html, pageCount, labelCount: placements.length, page, skipped, warnings: issues.filter((i) => i.severity === "warning") };
}

function toHtml(page: PageSpec, placements: readonly Placement[], svgFor: (printableIndex: number) => string, options: PrintDocumentOptions): string {
  const u = page.unit;
  const pages: string[][] = [];
  for (const p of placements) (pages[p.page] ??= []).push(placeLabel(p, svgFor(p.recordIndex), u, options.showOutlines === true));
  const title = escapeText(options.title ?? "Labels");
  return [
    "<!doctype html>",
    `<html lang="en"><head><meta charset="utf-8"><title>${title}</title>`,
    `<meta name="viewport" content="width=device-width, initial-scale=1">`,
    "<style>",
    printCss(page),
    "</style></head><body>",
    ...pages.map((labels) => `<section class="page">${labels.join("")}</section>`),
    "</body></html>",
  ].join("\n");
}

function placeLabel(p: Placement, svg: string, u: string, outline: boolean): string {
  const s = p.slot;
  const box = `left:${n(s.x)}${u};top:${n(s.y)}${u};width:${n(s.width)}${u};height:${n(s.height)}${u}`;
  const cls = outline ? "label outlined" : "label";
  if (!s.rotated) return `<div class="${cls}" style="${box}">${svg}</div>`;
  // Rotate the label 90° clockwise inside its slot: inner box has the label's own orientation.
  const inner = `width:${n(s.height)}${u};height:${n(s.width)}${u};transform:translateX(${n(s.width)}${u}) rotate(90deg);transform-origin:0 0`;
  return `<div class="${cls}" style="${box}"><div class="rot" style="${inner}">${svg}</div></div>`;
}

/** Print CSS: exact page size, no browser margins, physical units, no scaling. */
export function printCss(page: Pick<PageSpec, "width" | "height" | "unit">): string {
  const u = page.unit;
  const W = `${n(page.width)}${u}`;
  const H = `${n(page.height)}${u}`;
  return [
    `@page { size: ${W} ${H}; margin: 0; }`,
    "html, body { margin: 0; padding: 0; background: #fff; }",
    "* { -webkit-print-color-adjust: exact; print-color-adjust: exact; box-sizing: border-box; }",
    `.page { position: relative; width: ${W}; height: ${H}; overflow: hidden; break-after: page; page-break-after: always; }`,
    ".page:last-child { break-after: auto; page-break-after: auto; }",
    ".label { position: absolute; overflow: hidden; }",
    ".label.outlined { outline: 0.1mm dashed #999; }",
    ".label svg, .rot svg { display: block; width: 100%; height: 100%; }",
    ".rot { position: absolute; left: 0; top: 0; }",
    "@media screen { html { background: #8a8f98; } body { padding: 8mm 0; background: transparent; } .page { margin: 0 auto 8mm; background: #fff; box-shadow: 0 1mm 3mm rgba(0,0,0,.35); } }",
  ].join("\n");
}
