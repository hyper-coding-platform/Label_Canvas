import type { BarcodeAdapter, EncodedSymbol, EncodeOptions, SymbologyId } from "./types";

/**
 * Wrap an adapter with a bounded LRU cache of successful encodings.
 *
 * Encoding is deterministic, so caching never changes output. It helps when
 * the same values are encoded repeatedly (the editor re-renders the same
 * label after every edit; QR encoding costs ~1 ms per symbol). Batch jobs with
 * unique values gain nothing and should use the plain adapter.
 *
 * The cache is per wrapper instance (no global state) and bounded by
 * `maxEntries`. Failed encodings are not cached. Returned symbols are shared
 * and must be treated as immutable (the renderer only reads them).
 */
export function createCachingBarcodeAdapter(adapter: BarcodeAdapter, options: { readonly maxEntries?: number | undefined } = {}): BarcodeAdapter & { readonly cacheSize: () => number } {
  const max = Math.max(1, Math.floor(options.maxEntries ?? 256));
  const cache = new Map<string, EncodedSymbol>();
  const key = (format: SymbologyId, value: string, o?: EncodeOptions) => `${format}\u0000${o?.errorCorrection ?? ""}\u0000${value}`;
  return {
    id: `${adapter.id}+cache`,
    formats: adapter.formats,
    validate: (format, value, o) => adapter.validate(format, value, o),
    encode(format, value, o) {
      const k = key(format, value, o);
      const hit = cache.get(k);
      if (hit) {
        cache.delete(k);
        cache.set(k, hit);
        return hit;
      }
      const symbol = adapter.encode(format, value, o);
      if (symbol.kind === "linear") Object.freeze(symbol.bars);
      Object.freeze(symbol);
      if (cache.size >= max) cache.delete(cache.keys().next().value as string);
      cache.set(k, symbol);
      return symbol;
    },
    cacheSize: () => cache.size,
  };
}
