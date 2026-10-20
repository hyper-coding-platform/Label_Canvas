/**
 * Text measurement and layout (DECISIONS D-010).
 *
 * Core layout is DOM-free and deterministic. The default measurer estimates
 * advance widths from per-font character-class averages; it is approximate
 * (typically within ±10% for Latin text in Arial/Helvetica). Hosts that need
 * tighter fitting can inject a canvas-based measurer from the renderer entry.
 */
import type { FontDefinition, FontMetrics } from "../schema/fonts";
import type { TextOverflow } from "../schema/types";

export interface MeasureFont {
  readonly font: FontDefinition;
  /** Font size in template units. */
  readonly size: number;
  readonly bold: boolean;
  readonly italic: boolean;
  /** Extra spacing per character, template units. */
  readonly letterSpacing: number;
}

export interface TextMeasurer {
  /** Advance width of `text` (single line) in template units. Must be pure for identical input. */
  measure(text: string, font: MeasureFont): number;
}

const NARROW = new Set("iljI.,:;'!|`·");
const SEMI = new Set("frt()[]{}-\"/\\ ");
const WIDE = new Set("mwMW@%Æ");

function charWidth(ch: string, m: FontMetrics): number {
  if (NARROW.has(ch)) return m.narrow;
  if (ch === " ") return m.space;
  if (SEMI.has(ch)) return (m.narrow + m.lower) / 2;
  if (WIDE.has(ch)) return m.wide;
  const cp = ch.codePointAt(0)!;
  if (cp >= 48 && cp <= 57) return m.digit;
  if (cp >= 97 && cp <= 122) return m.lower;
  if (cp >= 65 && cp <= 90) return m.upper;
  if (cp >= 0x2e80) return 1; // CJK and other full-width scripts
  return m.other;
}

export const estimateTextMeasurer: TextMeasurer = Object.freeze({
  measure(text: string, f: MeasureFont): number {
    let em = 0;
    let count = 0;
    for (const ch of text) {
      em += charWidth(ch, f.font.metrics);
      count += 1;
    }
    const factor = f.bold ? f.font.metrics.boldFactor : 1;
    return em * f.size * factor + f.letterSpacing * count;
  },
});

export interface LayoutInput {
  readonly text: string;
  readonly font: MeasureFont;
  /** Available box (template units), already reduced by padding. */
  readonly width: number;
  readonly height: number;
  readonly lineHeight: number;
  readonly overflow: TextOverflow;
  readonly maxLines?: number;
  /** Minimum size (template units) for `shrink`. */
  readonly minSize: number;
}

export interface LayoutResult {
  readonly lines: readonly string[];
  /** Font size actually used (template units); differs from input only for `shrink`. */
  readonly size: number;
  /** True when content had to be clipped or truncated. */
  readonly overflowed: boolean;
  readonly truncated: boolean;
}

const ELLIPSIS = "…";

function fitsBlock(lines: readonly string[], font: MeasureFont, input: LayoutInput, measurer: TextMeasurer): boolean {
  if (lines.length * font.size * input.lineHeight > input.height + 1e-9) return false;
  return lines.every((l) => measurer.measure(l, font) <= input.width + 1e-9);
}

/** Truncate `line` with an ellipsis so it fits `width`. */
export function truncateToWidth(line: string, width: number, font: MeasureFont, measurer: TextMeasurer): string {
  if (measurer.measure(line, font) <= width) return line;
  const chars = Array.from(line);
  let lo = 0;
  let hi = chars.length;
  while (lo < hi) {
    const mid = Math.ceil((lo + hi) / 2);
    if (measurer.measure(chars.slice(0, mid).join("").trimEnd() + ELLIPSIS, font) <= width) lo = mid;
    else hi = mid - 1;
  }
  return lo === 0 ? (measurer.measure(ELLIPSIS, font) <= width ? ELLIPSIS : "") : chars.slice(0, lo).join("").trimEnd() + ELLIPSIS;
}

/** Greedy word wrap; words longer than the line are broken by character. */
export function wrapText(text: string, width: number, font: MeasureFont, measurer: TextMeasurer): string[] {
  const out: string[] = [];
  for (const paragraph of text.split("\n")) {
    const tokens = paragraph.split(/(\s+)/).filter((t) => t.length > 0);
    let line = "";
    for (const tok of tokens) {
      if (/^\s+$/.test(tok)) {
        if (line !== "") line += tok; // keep inner whitespace; drop leading
        continue;
      }
      if (measurer.measure(line + tok, font) <= width) {
        line += tok;
        continue;
      }
      if (line.trim() !== "") out.push(line.trimEnd());
      if (measurer.measure(tok, font) <= width) {
        line = tok;
        continue;
      }
      // Break an overlong word by character.
      let chunk = "";
      for (const ch of Array.from(tok)) {
        if (chunk !== "" && measurer.measure(chunk + ch, font) > width) {
          out.push(chunk);
          chunk = ch;
        } else chunk += ch;
      }
      line = chunk;
    }
    out.push(line.trimEnd());
  }
  return out;
}

export function layoutText(input: LayoutInput, measurer: TextMeasurer): LayoutResult {
  const { font, overflow } = input;
  const paragraphs = input.text.split("\n");

  if (overflow === "shrink") {
    if (fitsBlock(paragraphs, font, input, measurer)) return { lines: paragraphs, size: font.size, overflowed: false, truncated: false };
    let lo = input.minSize;
    let hi = font.size;
    if (!fitsBlock(paragraphs, { ...font, size: lo }, input, measurer)) {
      return { lines: paragraphs, size: lo, overflowed: true, truncated: false };
    }
    for (let i = 0; i < 24 && hi - lo > 1e-4; i += 1) {
      const mid = (lo + hi) / 2;
      if (fitsBlock(paragraphs, { ...font, size: mid }, input, measurer)) lo = mid;
      else hi = mid;
    }
    return { lines: paragraphs, size: lo, overflowed: false, truncated: false };
  }

  if (overflow === "ellipsis") {
    const maxLinesByHeight = Math.max(1, Math.floor((input.height + 1e-9) / (font.size * input.lineHeight)));
    let lines = paragraphs.map((p) => truncateToWidth(p, input.width, font, measurer));
    let truncated = lines.some((l, i) => l !== paragraphs[i]);
    if (lines.length > maxLinesByHeight) {
      lines = lines.slice(0, maxLinesByHeight);
      const last = lines.length - 1;
      lines[last] = truncateToWidth(lines[last]! + ELLIPSIS, input.width, font, measurer);
      truncated = true;
    }
    return { lines, size: font.size, overflowed: truncated, truncated };
  }

  if (overflow === "wrap") {
    let lines = wrapText(input.text, input.width, font, measurer);
    let truncated = false;
    const limit = Math.min(input.maxLines ?? Infinity, Math.max(1, Math.floor((input.height + 1e-9) / (font.size * input.lineHeight))));
    if (lines.length > limit) {
      lines = lines.slice(0, limit);
      lines[limit - 1] = truncateToWidth(`${lines[limit - 1]!}${ELLIPSIS}`, input.width, font, measurer);
      truncated = true;
    }
    return { lines, size: font.size, overflowed: truncated || !fitsBlock(lines, font, input, measurer), truncated };
  }

  // clip
  return { lines: paragraphs, size: font.size, overflowed: !fitsBlock(paragraphs, font, input, measurer), truncated: false };
}
