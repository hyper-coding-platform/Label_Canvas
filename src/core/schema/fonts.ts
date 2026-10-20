/**
 * Controlled font set. Templates reference fonts by id; ids map to CSS font
 * stacks that rely on widely installed system fonts. The SDK never downloads
 * or injects fonts. Hosts can register extra ids (see `FontRegistry`).
 */
export interface FontDefinition {
  readonly id: string;
  readonly label: string;
  /** CSS `font-family` value. */
  readonly stack: string;
  /** Average advance width per character class, as a fraction of the em, used by the default text measurer. */
  readonly metrics: FontMetrics;
}

export interface FontMetrics {
  readonly narrow: number;
  readonly lower: number;
  readonly upper: number;
  readonly digit: number;
  readonly space: number;
  readonly wide: number;
  readonly other: number;
  /** Ascent as a fraction of the em (baseline offset from line top). */
  readonly ascent: number;
  /** Multiplier applied to all widths for bold. */
  readonly boldFactor: number;
}

const SANS_METRICS: FontMetrics = { narrow: 0.25, lower: 0.53, upper: 0.68, digit: 0.556, space: 0.278, wide: 0.86, other: 0.6, ascent: 0.8, boldFactor: 1.07 };
const SERIF_METRICS: FontMetrics = { narrow: 0.27, lower: 0.48, upper: 0.68, digit: 0.5, space: 0.25, wide: 0.86, other: 0.56, ascent: 0.8, boldFactor: 1.06 };
const MONO_METRICS: FontMetrics = { narrow: 0.6, lower: 0.6, upper: 0.6, digit: 0.6, space: 0.6, wide: 0.6, other: 0.6, ascent: 0.78, boldFactor: 1 };
const CONDENSED_METRICS: FontMetrics = { narrow: 0.2, lower: 0.43, upper: 0.55, digit: 0.456, space: 0.228, wide: 0.7, other: 0.48, ascent: 0.8, boldFactor: 1.06 };

export const BUILT_IN_FONTS: readonly FontDefinition[] = Object.freeze([
  { id: "sans", label: "Sans-serif", stack: 'Arial, Helvetica, "Liberation Sans", sans-serif', metrics: SANS_METRICS },
  { id: "serif", label: "Serif", stack: '"Times New Roman", Times, "Liberation Serif", serif', metrics: SERIF_METRICS },
  { id: "mono", label: "Monospace", stack: '"Courier New", Courier, "Liberation Mono", monospace', metrics: MONO_METRICS },
  { id: "condensed", label: "Condensed", stack: '"Arial Narrow", "Roboto Condensed", "Liberation Sans Narrow", sans-serif-condensed, sans-serif', metrics: CONDENSED_METRICS },
]);

export const FONT_ID_PATTERN = /^[a-z][a-z0-9-]{0,31}$/;
/** Characters permitted in a registered font stack (no quotes other than ", no url(), no semicolons). */
const FONT_STACK_PATTERN = /^[A-Za-z0-9 ,"-]{1,300}$/;

export type FontRegistry = ReadonlyMap<string, FontDefinition>;

export function createFontRegistry(extra: readonly FontDefinition[] = []): FontRegistry {
  const map = new Map<string, FontDefinition>();
  for (const f of BUILT_IN_FONTS) map.set(f.id, f);
  for (const f of extra) {
    if (!FONT_ID_PATTERN.test(f.id)) throw new TypeError(`Invalid font id "${f.id}".`);
    if (!FONT_STACK_PATTERN.test(f.stack)) throw new TypeError(`Font stack for "${f.id}" contains disallowed characters.`);
    map.set(f.id, Object.freeze({ ...f, metrics: Object.freeze({ ...f.metrics }) }));
  }
  return map;
}

export const DEFAULT_FONT_REGISTRY: FontRegistry = createFontRegistry();

export function getFont(registry: FontRegistry, id: string): FontDefinition {
  return registry.get(id) ?? registry.get("sans")!;
}
