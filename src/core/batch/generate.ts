/**
 * Incremental bulk label generation (docs/PERFORMANCE.md, "Bulk generation").
 *
 * - Pull-based async iterator: a record is read and rendered only when the
 *   consumer asks for the next label, so memory stays bounded regardless of
 *   dataset size (nothing accumulates unless the caller collects it).
 * - Order is always the input order.
 * - Rendering is synchronous CPU work; every `chunkSize` labels the generator
 *   yields to the event loop so a browser UI stays responsive.
 * - Cancellation via AbortSignal (throws AbortError), or by `break`ing out of
 *   the loop (the record iterator is closed).
 * - Per-record problems never abort the batch unless `errorPolicy: "fail-fast"`.
 *   Template errors are fatal (thrown before the first record).
 *
 * For very large jobs run this in a Web Worker (core has no DOM dependency) or
 * on the server, and stream output to its destination in chunks.
 */
import { AbortError, LabelStudioError, throwIfAborted, type Issue } from "../errors";
import type { RenderNode } from "../render/nodes";
import { prepareTemplate, renderLabel, type RenderOptions } from "../render/render-label";
import { renderNodeToSvgString } from "../render/svg-serializer";
import type { DataRecord, LabelTemplate } from "../schema/types";

export interface GenerateOptions extends Omit<RenderOptions, "idPrefix" | "mode"> {
  readonly signal?: AbortSignal | undefined;
  /** `svg` (default): SVG markup string. `node`: render tree (for custom serialisation). */
  readonly output?: "svg" | "node" | undefined;
  /**
   * - `include` (default): yield failed records with `ok: false`, their issues and no output.
   * - `skip`: omit failed records (still counted in progress).
   * - `fail-fast`: throw `LabelStudioError("BATCH_RECORD_FAILED")` on the first failed record.
   */
  readonly errorPolicy?: "include" | "skip" | "fail-fast" | undefined;
  /** Labels rendered between event-loop yields. Default 50. */
  readonly chunkSize?: number | undefined;
  /** Upper bound on records processed (default 100 000). Exceeding it throws LIMIT_EXCEEDED. */
  readonly maxRecords?: number | undefined;
  /** Called after every label (and once at the end) with running totals. Exceptions are reported, not swallowed silently. */
  readonly onProgress?: ((progress: BatchProgress) => void) | undefined;
  /** Prefix for per-label SVG ids; the record index is appended. Default "lbl". */
  readonly idPrefix?: string | undefined;
}

export interface BatchProgress {
  readonly processed: number;
  readonly succeeded: number;
  readonly failed: number;
  readonly done: boolean;
}

export interface GeneratedLabel {
  /** Zero-based index of the record in the input sequence. */
  readonly index: number;
  readonly ok: boolean;
  /** Present when ok and output is "svg". */
  readonly svg?: string;
  /** Present when ok and output is "node". */
  readonly node?: RenderNode;
  /** All issues for this record (errors when !ok, otherwise warnings). */
  readonly issues: readonly Issue[];
}

const yieldToEventLoop = (): Promise<void> => new Promise((resolve) => setTimeout(resolve, 0));

export async function* generateLabels(
  template: LabelTemplate,
  records: Iterable<DataRecord> | AsyncIterable<DataRecord>,
  options: GenerateOptions = {},
): AsyncGenerator<GeneratedLabel, BatchProgress, undefined> {
  const { signal, output = "svg", errorPolicy = "include", onProgress } = options;
  const chunkSize = Math.max(1, Math.floor(options.chunkSize ?? 50));
  const maxRecords = options.maxRecords ?? 100_000;
  const idPrefix = options.idPrefix ?? "lbl";
  throwIfAborted(signal);
  // Validate once; template errors are fatal.
  const prepared = prepareTemplate(template, options);
  const renderOptions: RenderOptions = { ...options, mode: "output" };

  let processed = 0;
  let succeeded = 0;
  let failed = 0;
  const report = (done: boolean) => {
    if (!onProgress) return;
    try {
      onProgress({ processed, succeeded, failed, done });
    } catch (e) {
      throw new LabelStudioError("INVALID_ARGUMENT", "onProgress callback threw.", {}, { cause: e });
    }
  };

  let sinceYield = 0;
  for await (const record of records as AsyncIterable<DataRecord>) {
    throwIfAborted(signal);
    if (processed >= maxRecords) throw new LabelStudioError("LIMIT_EXCEEDED", `Batch exceeds the limit of ${maxRecords} records.`, { maxRecords });
    const index = processed;
    let label: GeneratedLabel;
    try {
      const r = renderLabel(prepared, record, { ...renderOptions, idPrefix: `${idPrefix}${index}` });
      label = r.ok
        ? output === "node"
          ? { index, ok: true, node: r.root, issues: r.issues }
          : { index, ok: true, svg: renderNodeToSvgString(r.root), issues: r.issues }
        : { index, ok: false, issues: r.issues };
    } catch (e) {
      label = { index, ok: false, issues: [{ code: "RENDER_FAILED", severity: "error", path: "", message: e instanceof Error ? e.message : "Render failed." }] };
    }
    processed += 1;
    if (label.ok) succeeded += 1;
    else failed += 1;
    report(false);

    if (!label.ok && errorPolicy === "fail-fast") {
      throw new LabelStudioError("BATCH_RECORD_FAILED", `Record ${index} failed: ${label.issues[0]?.message ?? "invalid"}`, { index, issues: label.issues });
    }
    if (label.ok || errorPolicy === "include") yield label;

    sinceYield += 1;
    if (sinceYield >= chunkSize) {
      sinceYield = 0;
      await yieldToEventLoop();
      if (signal?.aborted) throw new AbortError(undefined, signal.reason);
    }
  }
  report(true);
  return { processed, succeeded, failed, done: true };
}

/** Convenience for small batches: collect all results (bounded by `maxRecords`). */
export async function generateLabelsToArray(template: LabelTemplate, records: Iterable<DataRecord> | AsyncIterable<DataRecord>, options: GenerateOptions = {}): Promise<GeneratedLabel[]> {
  const out: GeneratedLabel[] = [];
  for await (const label of generateLabels(template, records, { maxRecords: 5000, ...options })) out.push(label);
  return out;
}
