// Client-side TemplateStorage over the host's own HTTP API (see app/api/templates).
// This adapter belongs to the host application: the SDK only defines the contract.
import { LabelStudioError, TemplateConflictError, parseTemplate, type TemplateStorage, type StoredTemplate, type ListResult } from "@your-org/erp-label-studio/core";

async function json<T>(res: Response): Promise<T> {
  return (await res.json()) as T;
}

function toStored(raw: { template: unknown; revision: number; updatedAt: string }): StoredTemplate {
  // Never trust the network: re-validate what the server returns.
  const parsed = parseTemplate(raw.template);
  if (!parsed.ok) throw new LabelStudioError("STORAGE_FAILED", "Server returned an invalid template.", { issues: parsed.issues });
  return { template: parsed.template, revision: raw.revision, updatedAt: raw.updatedAt };
}

export function createFetchTemplateStorage(baseUrl = "/api/templates"): TemplateStorage {
  return {
    async get(id, o) {
      const res = await fetch(`${baseUrl}/${encodeURIComponent(id)}`, { signal: o?.signal ?? null });
      if (res.status === 404) return null;
      if (!res.ok) throw new LabelStudioError("STORAGE_FAILED", `Load failed (${res.status}).`);
      return toStored(await json(res));
    },
    async save(template, o) {
      const res = await fetch(`${baseUrl}/${encodeURIComponent(template.id)}`, {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ template, expectedRevision: o.expectedRevision }),
        signal: o.signal ?? null,
      });
      if (res.status === 409) {
        const body = await json<{ expectedRevision: number | null; actualRevision: number | null }>(res);
        throw new TemplateConflictError(template.id, body.expectedRevision, body.actualRevision);
      }
      if (!res.ok) throw new LabelStudioError("STORAGE_FAILED", `Save failed (${res.status}).`);
      return toStored(await json(res));
    },
    async delete(id, o) {
      const res = await fetch(`${baseUrl}/${encodeURIComponent(id)}`, { method: "DELETE", signal: o?.signal ?? null });
      if (!res.ok) throw new LabelStudioError("STORAGE_FAILED", `Delete failed (${res.status}).`);
    },
    async list(o) {
      const res = await fetch(`${baseUrl}?limit=${o?.limit ?? 50}`, { signal: o?.signal ?? null });
      if (!res.ok) throw new LabelStudioError("STORAGE_FAILED", `List failed (${res.status}).`);
      return json<ListResult>(res);
    },
  };
}
