import { NextResponse } from "next/server";
import { TemplateConflictError, TemplateValidationError, parseTemplate } from "@pythonprakash/erp-label-studio/core";
import { templateStore } from "@/lib/template-store";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const stored = await templateStore.get(id);
  return stored ? NextResponse.json(stored) : NextResponse.json({ error: "not found" }, { status: 404 });
}

export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = (await request.json()) as { template?: unknown; expectedRevision?: unknown };
  // Server-side validation is mandatory: never trust the client.
  const parsed = parseTemplate(body.template);
  if (!parsed.ok) return NextResponse.json({ error: "invalid template", issues: parsed.issues }, { status: 422 });
  if (parsed.template.id !== id) return NextResponse.json({ error: "id mismatch" }, { status: 400 });
  const expected = body.expectedRevision === null ? null : Number(body.expectedRevision);
  try {
    return NextResponse.json(await templateStore.save(parsed.template, { expectedRevision: expected }));
  } catch (e) {
    if (e instanceof TemplateConflictError) return NextResponse.json({ expectedRevision: e.expectedRevision, actualRevision: e.actualRevision }, { status: 409 });
    if (e instanceof TemplateValidationError) return NextResponse.json({ error: "invalid template", issues: e.issues }, { status: 422 });
    throw e;
  }
}
