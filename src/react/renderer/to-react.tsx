import { createElement, type ReactElement, type ReactNode, type SVGProps } from "react";
import type { RenderNode } from "../../core/render/nodes";

/** SVG attribute → React prop names. Only allow-listed render-node attributes ever reach here. */
const PROP_NAMES: Readonly<Record<string, string>> = {
  "stroke-width": "strokeWidth",
  "stroke-dasharray": "strokeDasharray",
  "stroke-linecap": "strokeLinecap",
  "stroke-linejoin": "strokeLinejoin",
  "fill-rule": "fillRule",
  "fill-opacity": "fillOpacity",
  "clip-path": "clipPath",
  "font-family": "fontFamily",
  "font-size": "fontSize",
  "font-weight": "fontWeight",
  "font-style": "fontStyle",
  "text-anchor": "textAnchor",
  "letter-spacing": "letterSpacing",
  "shape-rendering": "shapeRendering",
  "xml:space": "xmlSpace",
};

export interface ToReactOptions {
  /** Extra transform prepended for element groups (e.g. live drag offset), keyed by element id. */
  readonly elementTransform?: ((elementId: string) => string | undefined) | undefined;
  /** Props merged onto the root <svg> (sizing, className, aria). */
  readonly rootProps?: SVGProps<SVGSVGElement> | undefined;
}

function convert(n: RenderNode, key: number, o: ToReactOptions, isRoot: boolean): ReactElement {
  const props: Record<string, unknown> = { key };
  for (const [k, v] of Object.entries(n.attrs)) props[PROP_NAMES[k] ?? k] = v;
  const id = n.attrs["data-element-id"];
  if (id !== undefined && n.tag === "g" && o.elementTransform) {
    const extra = o.elementTransform(id);
    if (extra) props.transform = n.attrs.transform ? `${extra} ${n.attrs.transform}` : extra;
  }
  if (isRoot && o.rootProps) Object.assign(props, o.rootProps);
  const children: ReactNode[] = n.children.map((c, i) => convert(c, i, o, false));
  if (n.text !== undefined) children.unshift(n.text);
  return createElement(n.tag, props, ...children);
}

/** Convert a render tree to React SVG elements. Text is passed as React text children (escaped by React). */
export function renderNodeToReact(root: RenderNode, options: ToReactOptions = {}): ReactElement {
  return convert(root, 0, options, true);
}
