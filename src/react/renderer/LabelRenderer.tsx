import { useEffect, useId, useMemo, type CSSProperties } from "react";
import type { Issue } from "../../core/errors";
import { renderLabel, type RenderOptions, type RenderResult } from "../../core/render/render-label";
import type { DataRecord, LabelTemplate } from "../../core/schema/types";
import { renderNodeToReact } from "./to-react";

export interface LabelRendererProps extends Omit<RenderOptions, "idPrefix"> {
  readonly template: LabelTemplate;
  readonly data?: DataRecord | undefined;
  /**
   * Display size. `physical` (default) sizes the SVG in the template's unit
   * (e.g. 50mm), `fill` makes it fill its container width, or pass a CSS width.
   */
  readonly size?: "physical" | "fill" | { readonly width: string } | undefined;
  readonly className?: string | undefined;
  readonly style?: CSSProperties | undefined;
  /** Called after each render with structured issues (also when there are none). */
  readonly onRender?: ((result: Pick<RenderResult, "ok" | "issues">) => void) | undefined;
  /** Rendered instead of the label when the template is invalid. Defaults to an inline message. */
  readonly fallback?: ((error: unknown) => React.ReactNode) | undefined;
}

/**
 * Renders one label for one record. Uses the same deterministic core renderer
 * as export, printing and bulk generation. Does not load the editor.
 */
export function LabelRenderer(props: LabelRendererProps) {
  const { template, data, size = "physical", className, style, onRender, fallback, ...renderOptions } = props;
  const prefix = `els${useId().replace(/[^A-Za-z0-9_-]/g, "")}`;
  const { mode, barcodeAdapter, textMeasurer, imagePolicy, fonts, limits, title, excludeElementIds } = renderOptions;
  const outcome = useMemo((): { result: RenderResult } | { error: unknown } => {
    try {
      return {
        result: renderLabel(template, data, { mode, barcodeAdapter, textMeasurer, imagePolicy, fonts, limits, title, excludeElementIds, idPrefix: prefix } as RenderOptions),
      };
    } catch (error) {
      return { error };
    }
  }, [template, data, prefix, mode, barcodeAdapter, textMeasurer, imagePolicy, fonts, limits, title, excludeElementIds]);

  useEffect(() => {
    if ("result" in outcome) onRender?.({ ok: outcome.result.ok, issues: outcome.result.issues });
    else onRender?.({ ok: false, issues: issuesOf(outcome.error) });
  }, [outcome, onRender]);

  if ("error" in outcome) {
    return fallback ? <>{fallback(outcome.error)}</> : (
      <div className={["els-preview", "els-preview--error", className].filter(Boolean).join(" ")} role="alert" style={style}>
        Label cannot be rendered: {outcome.error instanceof Error ? outcome.error.message : "invalid template"}
      </div>
    );
  }
  const sizing = size === "physical" ? {} : size === "fill" ? { width: "100%", height: "auto" } : { width: size.width, height: "auto" };
  return renderNodeToReact(outcome.result.root, {
    rootProps: { className: ["els-preview", className].filter(Boolean).join(" "), style, ...sizing },
  });
}

function issuesOf(error: unknown): Issue[] {
  if (error && typeof error === "object" && "issues" in error && Array.isArray((error as { issues: unknown }).issues)) return (error as { issues: Issue[] }).issues;
  return [{ code: "RENDER_FAILED", severity: "error", path: "", message: error instanceof Error ? error.message : "Render failed." }];
}
