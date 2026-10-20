import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from "react";
import { isLabelStudioError, type Issue } from "../../core/errors";
import { getPresetSizes } from "../../core/presets/registry";
import { buildCalibrationDocument } from "../../core/print/calibration";
import { buildPrintDocument, type PrintDocument } from "../../core/print/document";
import { printHtml } from "../../core/print/browser-print";
import type { PrintLayout } from "../../core/print/layout-types";
import { useEditorSelector } from "../headless/hooks";
import { useEditorContext } from "./context";

const FOCUSABLE = 'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), iframe, [tabindex]:not([tabindex="-1"])';

/**
 * Print preview + print, rendered inside the editor root (no portal), as a
 * modal dialog with focus containment. The preview iframe shows the exact
 * document that will be printed.
 */
export function PrintDialog({ onClose }: { readonly onClose: () => void }) {
  const { store, records, recordIndex, renderOptions, c, idBase, announce } = useEditorContext();
  const template = useEditorSelector(store, (s) => s.template);
  const dialogRef = useRef<HTMLDivElement>(null);
  const [layoutId, setLayoutId] = useState("roll");
  const [scope, setScope] = useState<"current" | "all">("current");
  const [copies, setCopies] = useState(1);
  const [skipSlots, setSkipSlots] = useState(0);
  const [outlines, setOutlines] = useState(false);
  const [status, setStatus] = useState<string>("");

  const sheets = useMemo(() => getPresetSizes({ category: "sheet" }), []);
  const layout: PrintLayout = useMemo(() => {
    if (layoutId === "roll") return { kind: "roll", unit: template.canvas.unit };
    if (layoutId === "roll-landscape") return { kind: "roll", unit: template.canvas.unit, orientation: "landscape" };
    return sheets.find((s) => s.id === layoutId)!.layout;
  }, [layoutId, sheets, template.canvas.unit]);

  const chosen = useMemo(() => (scope === "all" ? records : records.slice(recordIndex, recordIndex + 1)), [scope, records, recordIndex]);
  const built = useMemo((): { doc: PrintDocument } | { error: string; issues: readonly Issue[] } => {
    try {
      return { doc: buildPrintDocument(template, chosen, { ...renderOptions, layout, copies, skipSlots, showOutlines: outlines, title: template.name }) };
    } catch (e) {
      const details = isLabelStudioError(e) ? (e.details as { issues?: Issue[] }) : {};
      return { error: e instanceof Error ? e.message : "Cannot build the print document.", issues: details.issues ?? [] };
    }
  }, [template, chosen, renderOptions, layout, copies, skipSlots, outlines]);

  // Move focus into the dialog; restore it on close.
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    dialogRef.current?.querySelector<HTMLElement>(FOCUSABLE)?.focus();
    return () => previous?.focus?.();
  }, []);

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key === "Escape") {
      e.preventDefault();
      e.stopPropagation();
      onClose();
      return;
    }
    if (e.key !== "Tab") return;
    const items = Array.from(dialogRef.current?.querySelectorAll<HTMLElement>(FOCUSABLE) ?? []);
    if (items.length === 0) return;
    const first = items[0]!;
    const last = items[items.length - 1]!;
    if (e.shiftKey && document.activeElement === first) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault();
      first.focus();
    }
  };

  const doPrint = async (html: string, what: string) => {
    setStatus(`Opening print dialog for ${what}…`);
    try {
      await printHtml(html);
      setStatus(`Sent ${what} to the browser print dialog.`);
      announce("Print dialog opened");
    } catch (e) {
      setStatus(`Printing failed: ${e instanceof Error ? e.message : "unknown error"}`);
    }
  };

  const titleId = `${idBase}-print-title`;
  const descId = `${idBase}-print-desc`;
  const isSheet = layout.kind === "sheet";
  return (
    <div className="els-dialog-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div ref={dialogRef} className="els-dialog" role="dialog" aria-modal="true" aria-labelledby={titleId} aria-describedby={descId} onKeyDown={onKeyDown} data-testid="els-print-dialog">
        <div className="els-dialog__header">
          <h2 id={titleId} className="els-dialog__title">
            Print preview
          </h2>
          <c.Button variant="ghost" onClick={onClose} aria-label="Close print preview">
            ✕
          </c.Button>
        </div>
        <p id={descId} className="els-hint">
          Set the printer to the media size shown, scaling to 100% (“Actual size”) and margins to none. Browsers always show their print dialog; silent printing needs a print agent.
        </p>
        <div className="els-dialog__body">
          <div className="els-dialog__controls">
            <c.Field label="Media" htmlFor={`${idBase}-print-layout`}>
              <c.Select
                id={`${idBase}-print-layout`}
                value={layoutId}
                onChange={setLayoutId}
                options={[
                  { value: "roll", label: "Label roll (one label per page)" },
                  { value: "roll-landscape", label: "Label roll, rotated 90°" },
                  ...sheets.map((s) => ({ value: s.id, label: s.name })),
                ]}
              />
            </c.Field>
            {records.length > 1 && (
              <c.Field label="Records" htmlFor={`${idBase}-print-scope`}>
                <c.Select id={`${idBase}-print-scope`} value={scope} onChange={(v) => setScope(v as "current" | "all")} options={[{ value: "current", label: "Current preview record" }, { value: "all", label: `All ${records.length} sample records` }]} />
              </c.Field>
            )}
            <c.Field label="Copies of each label" htmlFor={`${idBase}-print-copies`}>
              <c.NumberInput id={`${idBase}-print-copies`} value={copies} min={1} max={500} step={1} precision={0} onCommit={(v) => setCopies(Math.max(1, Math.round(v ?? 1)))} />
            </c.Field>
            {isSheet && (
              <c.Field label="Skip used positions on first sheet" htmlFor={`${idBase}-print-skip`}>
                <c.NumberInput id={`${idBase}-print-skip`} value={skipSlots} min={0} max={200} step={1} precision={0} onCommit={(v) => setSkipSlots(Math.max(0, Math.round(v ?? 0)))} />
              </c.Field>
            )}
            <c.Checkbox id={`${idBase}-print-outlines`} label="Show label outlines (test on plain paper)" checked={outlines} onChange={setOutlines} />
            {"doc" in built ? (
              <p className="els-hint" data-testid="els-print-summary">
                {built.doc.labelCount} label{built.doc.labelCount === 1 ? "" : "s"} on {built.doc.pageCount} page{built.doc.pageCount === 1 ? "" : "s"} · page {built.doc.page.width} × {built.doc.page.height} {built.doc.page.unit}
              </p>
            ) : (
              <p className="els-field__error" role="alert" data-testid="els-print-error">
                ⚠ {built.error}
              </p>
            )}
            {"doc" in built && built.doc.skipped.length > 0 && (
              <div className="els-field__error" role="alert">
                ⚠ {built.doc.skipped.length} record(s) will not print:
                <ul>
                  {built.doc.skipped.slice(0, 5).map((s) => (
                    <li key={s.recordIndex}>
                      Record {s.recordIndex + 1}: {s.issues[0]?.message}
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {"doc" in built && built.doc.warnings.map((w, i) => (
              <p key={i} className="els-hint">
                ⚠ {w.message}
              </p>
            ))}
            <div className="els-row">
              <c.Button variant="primary" disabled={!("doc" in built) || built.doc.labelCount === 0} onClick={() => "doc" in built && void doPrint(built.doc.html, `${built.doc.labelCount} label(s)`)} data-testid="els-print-go">
                Print
              </c.Button>
              <c.Button
                onClick={() => {
                  try {
                    void doPrint(buildCalibrationDocument(template.canvas, layout), "the calibration page");
                  } catch (e) {
                    setStatus(e instanceof Error ? e.message : "Calibration page unavailable.");
                  }
                }}
              >
                Print calibration page
              </c.Button>
            </div>
            <p className="els-hint" role="status" aria-live="polite" data-testid="els-print-status">
              {status}
            </p>
          </div>
          <div className="els-dialog__preview">
            {"doc" in built && (
              // Fully sandboxed preview of the exact print document (no scripts, opaque origin).
              <iframe title="Print preview pages" sandbox="" srcDoc={built.doc.html} className="els-print-frame" data-testid="els-print-frame" />
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
