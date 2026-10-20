import type { MeasureFont, TextMeasurer } from "../../core/render/text-layout";

/**
 * Browser text measurer using CanvasRenderingContext2D.measureText with the
 * actual installed fonts. Measures at a 100px reference size and scales, so
 * results are independent of template units. Falls back to `fallback` when
 * no canvas is available (SSR, tests). Results are cached in a bounded LRU.
 */
export function createCanvasTextMeasurer(fallback: TextMeasurer, maxEntries = 2000): TextMeasurer {
  let ctx: CanvasRenderingContext2D | null | undefined;
  const cache = new Map<string, number>();
  const getCtx = () => {
    if (ctx !== undefined) return ctx;
    try {
      ctx = typeof document === "undefined" ? null : document.createElement("canvas").getContext("2d");
    } catch {
      ctx = null;
    }
    return ctx;
  };
  return {
    measure(text: string, f: MeasureFont): number {
      const c = getCtx();
      if (!c) return fallback.measure(text, f);
      const font = `${f.italic ? "italic " : ""}${f.bold ? "bold " : ""}100px ${f.font.stack}`;
      const key = `${font}\u0000${text}`;
      let w100 = cache.get(key);
      if (w100 === undefined) {
        c.font = font;
        w100 = c.measureText(text).width;
        if (!Number.isFinite(w100)) return fallback.measure(text, f);
        if (cache.size >= maxEntries) cache.delete(cache.keys().next().value as string);
        cache.set(key, w100);
      } else {
        cache.delete(key);
        cache.set(key, w100);
      }
      let count = 0;
      for (const _ of text) count += 1;
      return (w100 / 100) * f.size + f.letterSpacing * count;
    },
  };
}
