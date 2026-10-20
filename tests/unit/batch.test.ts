import { describe, expect, it, vi } from "vitest";
import { generateLabels, generateLabelsToArray } from "../../src/core/batch/generate";
import { AbortError, LabelStudioError, TemplateValidationError } from "../../src/core/errors";
import { baseTemplate, barcodeEl, textEl, textileRecord, textileTemplate } from "../fixtures/templates";

const tpl = baseTemplate([textEl(), barcodeEl()]);
const good = (i: number) => ({ product: { name: `Item ${i}`, sku: `SKU-${i}` } });
const bad = (i: number) => ({ product: { name: `Item ${i}` } }); // missing barcode value

async function collect<T>(it: AsyncGenerator<T, unknown>): Promise<T[]> {
  const out: T[] = [];
  for await (const x of it) out.push(x);
  return out;
}

describe("generateLabels", () => {
  it("yields labels in input order with SVG output, across chunk boundaries", async () => {
    const labels = await collect(generateLabels(tpl, Array.from({ length: 25 }, (_, i) => good(i)), { chunkSize: 10 }));
    expect(labels.map((l) => l.index)).toEqual(Array.from({ length: 25 }, (_, i) => i));
    expect(labels.every((l) => l.ok && l.svg?.startsWith("<svg"))).toBe(true);
    expect(labels[7]!.svg).toContain("SKU-7");
    // Unique ids per label (safe to combine in one document).
    expect(labels[3]!.svg).toContain('id="lbl3-clip-0"');
  });

  it("distinguishes invalid records under each error policy", async () => {
    const records = [good(0), bad(1), good(2), bad(3)];
    const include = await collect(generateLabels(tpl, records));
    expect(include.map((l) => [l.index, l.ok])).toEqual([[0, true], [1, false], [2, true], [3, false]]);
    expect(include[1]!.issues[0]!.code).toBe("BARCODE_VALUE_MISSING");
    expect(include[1]!.svg).toBeUndefined();
    const skip = await collect(generateLabels(tpl, records, { errorPolicy: "skip" }));
    expect(skip.map((l) => l.index)).toEqual([0, 2]);
    await expect(collect(generateLabels(tpl, records, { errorPolicy: "fail-fast" }))).rejects.toMatchObject({ code: "BATCH_RECORD_FAILED", details: { index: 1 } });
  });

  it("reports progress and returns totals", async () => {
    const onProgress = vi.fn();
    const gen = generateLabels(tpl, [good(0), bad(1), good(2)], { onProgress });
    let r = await gen.next();
    while (!r.done) r = await gen.next();
    expect(r.value).toEqual({ processed: 3, succeeded: 2, failed: 1, done: true });
    expect(onProgress).toHaveBeenLastCalledWith({ processed: 3, succeeded: 2, failed: 1, done: true });
    expect(onProgress).toHaveBeenCalledTimes(4);
  });

  it("cancels via AbortSignal before start and mid-batch", async () => {
    const pre = new AbortController();
    pre.abort();
    await expect(collect(generateLabels(tpl, [good(0)], { signal: pre.signal }))).rejects.toBeInstanceOf(AbortError);

    const ac = new AbortController();
    const seen: number[] = [];
    const run = (async () => {
      for await (const l of generateLabels(tpl, Array.from({ length: 1000 }, (_, i) => good(i)), { signal: ac.signal, chunkSize: 5 })) {
        seen.push(l.index);
        if (l.index === 12) ac.abort();
      }
    })();
    await expect(run).rejects.toMatchObject({ code: "ABORTED" });
    expect(seen.length).toBeLessThan(20);
  });

  it("closes the record source when the consumer stops early", async () => {
    let closed = false;
    let produced = 0;
    function* source() {
      try {
        for (let i = 0; ; i += 1) {
          produced += 1;
          yield good(i);
        }
      } finally {
        closed = true;
      }
    }
    for await (const l of generateLabels(tpl, source())) if (l.index === 2) break;
    expect(closed).toBe(true);
    expect(produced).toBe(3); // pull-based: nothing rendered ahead of the consumer
  });

  it("accepts async iterables (e.g. paginated ERP API)", async () => {
    async function* pages() {
      for (let p = 0; p < 3; p += 1) {
        await new Promise((r) => setTimeout(r, 1));
        for (let i = 0; i < 4; i += 1) yield good(p * 4 + i);
      }
    }
    const labels = await collect(generateLabels(tpl, pages()));
    expect(labels).toHaveLength(12);
    expect(labels.map((l) => l.index)).toEqual(Array.from({ length: 12 }, (_, i) => i));
  });

  it("enforces maxRecords and rejects invalid templates up front", async () => {
    await expect(collect(generateLabels(tpl, Array.from({ length: 6 }, (_, i) => good(i)), { maxRecords: 5 }))).rejects.toMatchObject({ code: "LIMIT_EXCEEDED" });
    const gen = generateLabels(baseTemplate([textEl({ width: -1 })]), [good(0)]);
    await expect(gen.next()).rejects.toBeInstanceOf(TemplateValidationError);
  });

  it("node output and array helper", async () => {
    const [l] = await generateLabelsToArray(textileTemplate, [textileRecord], { output: "node" });
    expect(l!.node?.tag).toBe("svg");
    expect(l!.svg).toBeUndefined();
  });

  it("reports onProgress exceptions instead of swallowing them", async () => {
    const gen = generateLabels(tpl, [good(0)], { onProgress: () => { throw new Error("boom"); } });
    await expect(gen.next()).rejects.toBeInstanceOf(LabelStudioError);
  });
});
