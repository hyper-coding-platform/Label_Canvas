import { checkAttribute, type RenderNode } from "./nodes";

const ATTR_ESCAPES: Record<string, string> = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };
const TEXT_ESCAPES: Record<string, string> = { "&": "&amp;", "<": "&lt;", ">": "&gt;" };

export function escapeAttribute(value: string): string {
  return value.replace(/[&<>"']/g, (c) => ATTR_ESCAPES[c]!);
}

/** Escape text content; strips characters that are illegal in XML 1.0. */
export function escapeText(value: string): string {
  // eslint-disable-next-line no-control-regex
  return value.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F￾￿]/g, "").replace(/[&<>]/g, (c) => TEXT_ESCAPES[c]!);
}

/**
 * Serialize a render tree to a standalone, well-formed SVG document fragment.
 * Attributes are re-validated against the allowlist and escaped.
 */
export function renderNodeToSvgString(root: RenderNode): string {
  const out: string[] = [];
  write(root, out);
  return out.join("");
}

function write(n: RenderNode, out: string[]): void {
  out.push("<", n.tag);
  for (const [k, v] of Object.entries(n.attrs)) {
    checkAttribute(n.tag, k, v);
    out.push(" ", k, '="', escapeAttribute(v), '"');
  }
  if (n.children.length === 0 && n.text === undefined) {
    out.push("/>");
    return;
  }
  out.push(">");
  if (n.text !== undefined) out.push(escapeText(n.text));
  for (const c of n.children) write(c, out);
  out.push("</", n.tag, ">");
}
