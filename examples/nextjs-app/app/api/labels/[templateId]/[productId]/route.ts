// Server-side rendering with the React-free core: returns the label as SVG.
import { renderLabel, renderNodeToSvgString } from "@your-org/erp-label-studio/core";
import { PRODUCTS, toLabelRecord } from "@/lib/erp-data";
import { templateStore } from "@/lib/template-store";

export async function GET(_request: Request, { params }: { params: Promise<{ templateId: string; productId: string }> }) {
  const { templateId, productId } = await params;
  const stored = await templateStore.get(templateId);
  const product = PRODUCTS.find((p) => p.id === productId);
  if (!stored || !product) return new Response("not found", { status: 404 });
  const result = renderLabel(stored.template, toLabelRecord(product));
  if (!result.ok) return Response.json({ issues: result.issues }, { status: 422 });
  return new Response(renderNodeToSvgString(result.root), {
    headers: { "content-type": "image/svg+xml; charset=utf-8", "content-security-policy": "default-src 'none'; style-src 'unsafe-inline'; img-src data:", "x-content-type-options": "nosniff" },
  });
}
