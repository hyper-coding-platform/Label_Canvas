/**
 * Browser printing via a hidden iframe.
 *
 * - Only usable in a browser; throws PRINT_UNAVAILABLE elsewhere (SSR, Node).
 * - The iframe is sandboxed with `allow-same-origin allow-modals` only (no
 *   scripts can run inside) and filled through `srcdoc` (no innerHTML).
 * - Opens the browser's print dialog. JavaScript cannot choose a printer,
 *   bypass the dialog, or print silently; direct/unattended thermal printing
 *   needs a host-provided print agent (docs/PRINTING.md).
 * - The iframe and listeners are removed after printing, on timeout, or when
 *   the signal aborts.
 */
import { AbortError, LabelStudioError, throwIfAborted } from "../errors";
import type { DataRecord, LabelTemplate } from "../schema/types";
import { buildPrintDocument, type PrintDocument, type PrintDocumentOptions } from "./document";

export interface PrintOptions extends PrintDocumentOptions {
  readonly signal?: AbortSignal | undefined;
  /** Remove the iframe if `afterprint` never fires (ms). Default 120 000. */
  readonly cleanupTimeoutMs?: number | undefined;
  /** Document in which to create the iframe. Defaults to the global document. */
  readonly ownerDocument?: Document | undefined;
}

export interface PrintResult {
  readonly document: Omit<PrintDocument, "html">;
}

/** Print an already-built HTML print document. */
export async function printHtml(html: string, options: Pick<PrintOptions, "signal" | "cleanupTimeoutMs" | "ownerDocument"> = {}): Promise<void> {
  const doc = options.ownerDocument ?? (typeof document !== "undefined" ? document : undefined);
  if (!doc?.body || typeof doc.createElement !== "function") {
    throw new LabelStudioError("PRINT_UNAVAILABLE", "Printing requires a browser document (it is not available during server rendering).");
  }
  throwIfAborted(options.signal);
  const iframe = doc.createElement("iframe");
  iframe.setAttribute("sandbox", "allow-same-origin allow-modals");
  iframe.setAttribute("aria-hidden", "true");
  iframe.setAttribute("tabindex", "-1");
  iframe.title = "Label print job";
  // Off-screen but laid out at real size (some engines skip printing display:none frames).
  iframe.style.cssText = "position:fixed;right:0;bottom:0;width:1px;height:1px;border:0;opacity:0;pointer-events:none;";
  let cleaned = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const onAbort = () => cleanup();
  const cleanup = () => {
    if (cleaned) return;
    cleaned = true;
    if (timer !== undefined) clearTimeout(timer);
    options.signal?.removeEventListener("abort", onAbort);
    iframe.contentWindow?.removeEventListener("afterprint", cleanup);
    iframe.remove();
  };
  options.signal?.addEventListener("abort", onAbort, { once: true });
  try {
    await new Promise<void>((resolve, reject) => {
      iframe.addEventListener("load", () => resolve(), { once: true });
      iframe.addEventListener("error", () => reject(new LabelStudioError("PRINT_FAILED", "The print document failed to load.")), { once: true });
      iframe.srcdoc = html;
      doc.body.appendChild(iframe);
    });
    if (options.signal?.aborted) throw new AbortError(undefined, options.signal.reason);
    const win = iframe.contentWindow;
    if (!win) throw new LabelStudioError("PRINT_FAILED", "The print frame is not accessible.");
    // Wait for fonts so text metrics in print match the preview.
    await (win.document as Document & { fonts?: FontFaceSet }).fonts?.ready;
    if (options.signal?.aborted) throw new AbortError(undefined, options.signal.reason);
    win.addEventListener("afterprint", cleanup, { once: true });
    timer = setTimeout(cleanup, options.cleanupTimeoutMs ?? 120_000);
    win.focus();
    win.print();
  } catch (e) {
    cleanup();
    throw e instanceof LabelStudioError ? e : new LabelStudioError("PRINT_FAILED", e instanceof Error ? e.message : "Printing failed.", {}, { cause: e });
  }
}

/**
 * Render `records` with `template`, lay them out and open the browser print
 * dialog. Invalid records are skipped and reported (or fail the job with
 * `invalidRecords: "fail"`). Resolves once the dialog has been opened.
 */
export async function printLabels(template: LabelTemplate, records: readonly DataRecord[], options: PrintOptions = {}): Promise<PrintResult> {
  throwIfAborted(options.signal);
  const built = buildPrintDocument(template, records, options);
  if (built.labelCount === 0) throw new LabelStudioError("PRINT_FAILED", "No printable labels: every record failed validation.", { skipped: built.skipped });
  await printHtml(built.html, options);
  const { html: _html, ...rest } = built;
  return { document: rest };
}
