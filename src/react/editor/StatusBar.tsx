import { useEditorSelector } from "../headless/hooks";
import { useEditorContext } from "./context";

export function StatusBar() {
  const { store, save, records, recordIndex } = useEditorContext();
  const warnings = useEditorSelector(store, (s) => s.warnings);
  const rejection = useEditorSelector(store, (s) => s.lastRejection);
  const dirty = useEditorSelector(store, (s) => s.dirty);
  const count = useEditorSelector(store, (s) => s.template.elements.length);
  const canvas = useEditorSelector(store, (s) => s.template.canvas);
  return (
    <div className="els-status" data-testid="els-status">
      <span>
        {canvas.width} × {canvas.height} {canvas.unit}
      </span>
      <span>{count} element{count === 1 ? "" : "s"}</span>
      {records.length > 1 && (
        <span>
          Record {recordIndex + 1} of {records.length}
        </span>
      )}
      {warnings.length > 0 && <span className="els-status__warn">⚠ {warnings.length} warning{warnings.length === 1 ? "" : "s"}</span>}
      {rejection && (
        <span className="els-status__error" role="alert">
          Change rejected: {rejection.find((i) => i.severity === "error")?.message ?? "invalid template"}
        </span>
      )}
      <span className="els-status__save" aria-live="polite" data-testid="els-save-status">
        {save.status.state === "saving"
          ? "Saving…"
          : save.status.state === "error"
            ? `Save failed: ${save.status.message}`
            : dirty
              ? "Unsaved changes"
              : save.status.state === "saved"
                ? "All changes saved"
                : ""}
      </span>
    </div>
  );
}
