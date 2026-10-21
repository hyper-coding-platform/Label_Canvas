/**
 * Neutral render tree (DECISIONS D-009). Both the SVG string serializer and
 * the React converter consume this structure; neither ever interprets
 * strings as markup.
 *
 * Every node is built through `node()`, which enforces a per-tag attribute
 * allowlist and attribute value rules. The serializer re-checks the allowlist
 * so hand-built trees cannot smuggle arbitrary attributes.
 */

export type SvgTag = "svg" | "g" | "rect" | "path" | "line" | "text" | "tspan" | "image" | "clipPath" | "defs" | "title";

export interface RenderNode {
  readonly tag: SvgTag;
  readonly attrs: Readonly<Record<string, string>>;
  readonly children: readonly RenderNode[];
  /** Text content (only for `text`, `tspan`, `title`). Escaped at output. */
  readonly text?: string;
}

const PRESENTATION = ["fill", "fill-opacity", "stroke", "stroke-width", "stroke-dasharray", "stroke-linecap", "stroke-linejoin", "opacity", "transform", "clip-path", "shape-rendering"] as const;
const DATA = ["data-element-id", "data-element-type", "data-placeholder"] as const;

export const ATTRIBUTE_ALLOWLIST: Readonly<Record<SvgTag, ReadonlySet<string>>> = {
  svg: new Set(["xmlns", "width", "height", "viewBox", "preserveAspectRatio", "role", "aria-label", "focusable", ...DATA]),
  g: new Set([...PRESENTATION, ...DATA]),
  rect: new Set(["x", "y", "width", "height", "rx", "ry", ...PRESENTATION, ...DATA]),
  path: new Set(["d", "fill-rule", ...PRESENTATION, ...DATA]),
  line: new Set(["x1", "y1", "x2", "y2", ...PRESENTATION, ...DATA]),
  text: new Set(["x", "y", "font-family", "font-size", "font-weight", "font-style", "text-anchor", "letter-spacing", "xml:space", ...PRESENTATION, ...DATA]),
  tspan: new Set(["x", "y"]),
  image: new Set(["x", "y", "width", "height", "href", "preserveAspectRatio", "opacity", "transform", "clip-path", ...DATA]),
  clipPath: new Set(["id"]),
  defs: new Set([]),
  title: new Set([]),
};

const ID_VALUE = /^[A-Za-z][A-Za-z0-9_.:-]{0,127}$/;
const CLIP_REF = /^url\(#[A-Za-z][A-Za-z0-9_.:-]{0,127}\)$/;
const SAFE_GENERIC = /^[^<>&\u0000-\u001f]*$/; // eslint-disable-line no-control-regex
const TEXT_VALUE = /^[^\u0000-\u001f]*$/; // eslint-disable-line no-control-regex

export class RenderNodeError extends Error {}

/** Validates a single attribute against tag allowlist and value rules. */
export function checkAttribute(tag: SvgTag, name: string, value: string): void {
  if (!ATTRIBUTE_ALLOWLIST[tag].has(name)) throw new RenderNodeError(`Attribute "${name}" is not allowed on <${tag}>.`);
  if (name === "id" && !ID_VALUE.test(value)) throw new RenderNodeError(`Invalid id "${value}".`);
  if (name === "clip-path" && !CLIP_REF.test(value)) throw new RenderNodeError(`Invalid clip-path reference.`);
  if (name === "href") {
    // Image hrefs are pre-validated by the image policy; re-check the scheme here as defence in depth.
    if (!/^(?:data:image\/(?:png|jpeg|gif|webp);base64,|https:\/\/)/.test(value)) throw new RenderNodeError("Disallowed href.");
    return;
  }
  if (name === "aria-label") {
    // Carries user text (template name). Escaped at serialization; only control characters are refused.
    if (!TEXT_VALUE.test(value)) throw new RenderNodeError("aria-label contains control characters.");
    return;
  }
  if (!SAFE_GENERIC.test(value)) throw new RenderNodeError(`Attribute "${name}" contains disallowed characters.`);
}

export function node(tag: SvgTag, attrs: Record<string, string | undefined> = {}, children: readonly RenderNode[] = [], text?: string): RenderNode {
  const clean: Record<string, string> = {};
  for (const [k, v] of Object.entries(attrs)) {
    if (v === undefined) continue;
    checkAttribute(tag, k, v);
    clean[k] = v;
  }
  if (text !== undefined && tag !== "text" && tag !== "tspan" && tag !== "title") throw new RenderNodeError(`<${tag}> cannot contain text.`);
  const n: RenderNode = text === undefined ? { tag, attrs: Object.freeze(clean), children: Object.freeze([...children]) } : { tag, attrs: Object.freeze(clean), children: Object.freeze([...children]), text };
  return Object.freeze(n);
}

/** Depth-first visit (for tests and tooling). */
export function walkNodes(root: RenderNode, visit: (n: RenderNode) => void): void {
  visit(root);
  for (const c of root.children) walkNodes(c, visit);
}
