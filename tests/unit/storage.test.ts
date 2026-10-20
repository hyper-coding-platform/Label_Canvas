import { describe, expect, it, vi } from "vitest";
import { TemplateConflictError, TemplateValidationError } from "../../src/core/errors";
import { createLocalStorageTemplateStorage, createMemoryTemplateStorage, duplicateStoredTemplate, type TemplateStorage } from "../../src/core/storage/storage";
import { baseTemplate, textEl, textileTemplate } from "../fixtures/templates";

class MemStorage implements Storage {
  private m = new Map<string, string>();
  constructor(private readonly limitChars = Infinity) {}
  get length() {
    return this.m.size;
  }
  clear() {
    this.m.clear();
  }
  getItem(k: string) {
    return this.m.has(k) ? this.m.get(k)! : null;
  }
  key(i: number) {
    return [...this.m.keys()][i] ?? null;
  }
  removeItem(k: string) {
    this.m.delete(k);
  }
  setItem(k: string, v: string) {
    const total = [...this.m.entries()].reduce((s, [kk, vv]) => s + (kk === k ? 0 : kk.length + vv.length), 0);
    if (total + k.length + v.length > this.limitChars) throw new DOMException("full", "QuotaExceededError");
    this.m.set(k, v);
  }
}

const fixedNow = () => new Date("2026-10-20T10:00:00Z");

function contract(name: string, make: () => TemplateStorage) {
  describe(`${name}: TemplateStorage contract`, () => {
    it("creates, reads, updates with revisions, and detects conflicts", async () => {
      const s = make();
      expect(await s.get("textile-hang-tag")).toBeNull();
      const created = await s.save(textileTemplate, { expectedRevision: null });
      expect(created).toMatchObject({ revision: 1, updatedAt: "2026-10-20T10:00:00.000Z" });
      await expect(s.save(textileTemplate, { expectedRevision: null })).rejects.toBeInstanceOf(TemplateConflictError);
      const updated = await s.save({ ...textileTemplate, name: "Renamed" }, { expectedRevision: 1 });
      expect(updated.revision).toBe(2);
      const err = await s.save(textileTemplate, { expectedRevision: 1 }).catch((e: unknown) => e);
      expect(err).toBeInstanceOf(TemplateConflictError);
      expect(err).toMatchObject({ expectedRevision: 1, actualRevision: 2 });
      expect((await s.get("textile-hang-tag"))?.template.name).toBe("Renamed");
    });

    it("returns copies (callers cannot mutate stored state)", async () => {
      const s = make();
      await s.save(textileTemplate, { expectedRevision: null });
      const a = await s.get("textile-hang-tag");
      (a!.template as { name: string }).name = "mutated";
      expect((await s.get("textile-hang-tag"))!.template.name).toBe(textileTemplate.name);
    });

    it("validates before saving", async () => {
      await expect(make().save(baseTemplate([textEl({ width: -1 })]), { expectedRevision: null })).rejects.toBeInstanceOf(TemplateValidationError);
    });

    it("lists with filters and cursor pagination", async () => {
      const s = make();
      for (let i = 0; i < 5; i += 1) await s.save({ ...textileTemplate, id: `t${i}`, name: i % 2 ? `Shelf ${i}` : `Tag ${i}`, category: i % 2 ? "shelf" : "textile" }, { expectedRevision: null });
      const p1 = await s.list({ limit: 2 });
      expect(p1.items.map((i) => i.id)).toEqual(["t0", "t1"]);
      const p2 = await s.list({ limit: 2, cursor: p1.nextCursor });
      expect(p2.items.map((i) => i.id)).toEqual(["t2", "t3"]);
      const p3 = await s.list({ limit: 2, cursor: p2.nextCursor });
      expect(p3.items.map((i) => i.id)).toEqual(["t4"]);
      expect(p3.nextCursor).toBeUndefined();
      expect((await s.list({ category: "shelf" })).items.map((i) => i.id)).toEqual(["t1", "t3"]);
      expect((await s.list({ search: "TAG" })).items).toHaveLength(3);
    });

    it("deletes with optional revision check and reports missing ids", async () => {
      const s = make();
      await s.save(textileTemplate, { expectedRevision: null });
      await expect(s.delete("textile-hang-tag", { expectedRevision: 7 })).rejects.toBeInstanceOf(TemplateConflictError);
      await s.delete("textile-hang-tag", { expectedRevision: 1 });
      expect(await s.get("textile-hang-tag")).toBeNull();
      await expect(s.delete("textile-hang-tag")).rejects.toMatchObject({ code: "TEMPLATE_NOT_FOUND" });
    });

    it("duplicates under a new id at revision 1", async () => {
      const s = make();
      await s.save(textileTemplate, { expectedRevision: null });
      const d = await duplicateStoredTemplate(s, "textile-hang-tag", "tag-v2", "Tag v2");
      expect(d).toMatchObject({ revision: 1, template: { id: "tag-v2", name: "Tag v2" } });
      await expect(duplicateStoredTemplate(s, "nope", "x")).rejects.toMatchObject({ code: "TEMPLATE_NOT_FOUND" });
    });

    it("honours AbortSignal", async () => {
      const ac = new AbortController();
      ac.abort();
      await expect(make().get("x", { signal: ac.signal })).rejects.toMatchObject({ code: "ABORTED" });
    });
  });
}

contract("memory", () => createMemoryTemplateStorage({ now: fixedNow }));
contract("localStorage", () => createLocalStorageTemplateStorage({ storage: new MemStorage(), now: fixedNow }));

describe("localStorage adapter specifics", () => {
  it("enforces its byte quota and template count", async () => {
    const s = createLocalStorageTemplateStorage({ storage: new MemStorage(), quotaBytes: 2000, now: fixedNow });
    await expect(s.save(textileTemplate, { expectedRevision: null })).rejects.toMatchObject({ code: "STORAGE_QUOTA_EXCEEDED" });
    const c = createLocalStorageTemplateStorage({ storage: new MemStorage(), maxTemplates: 1 });
    await c.save(textileTemplate, { expectedRevision: null });
    await expect(c.save({ ...textileTemplate, id: "other" }, { expectedRevision: null })).rejects.toMatchObject({ code: "STORAGE_QUOTA_EXCEEDED" });
  });

  it("translates browser quota errors", async () => {
    const s = createLocalStorageTemplateStorage({ storage: new MemStorage(100) });
    await expect(s.save(textileTemplate, { expectedRevision: null })).rejects.toMatchObject({ code: "STORAGE_QUOTA_EXCEEDED" });
  });

  it("skips and reports corrupted or tampered entries", async () => {
    const backing = new MemStorage();
    const onCorruptEntry = vi.fn();
    const s = createLocalStorageTemplateStorage({ storage: backing, onCorruptEntry });
    await s.save(textileTemplate, { expectedRevision: null });
    backing.setItem("els:template:broken", "{not json");
    backing.setItem("els:template:evil", JSON.stringify({ template: { ...textileTemplate, id: "evil", elements: [{ id: "x", type: "script" }] }, revision: 1, updatedAt: "x" }));
    backing.setItem("els:template:mismatch", JSON.stringify({ template: textileTemplate, revision: 1, updatedAt: "x" }));
    backing.setItem("unrelated", "keep");
    expect((await s.list()).items.map((i) => i.id)).toEqual(["textile-hang-tag"]);
    expect(onCorruptEntry).toHaveBeenCalledTimes(3);
    expect(await s.get("evil")).toBeNull();
    await expect(s.save({ ...textileTemplate, id: "broken" }, { expectedRevision: null })).rejects.toMatchObject({ code: "STORAGE_FAILED" });
    expect(backing.getItem("unrelated")).toBe("keep");
  });

  it("fails clearly where localStorage does not exist", async () => {
    // Node 25+ defines a global localStorage; remove it to model SSR/workers.
    vi.stubGlobal("localStorage", undefined);
    await expect(createLocalStorageTemplateStorage().list()).rejects.toMatchObject({ code: "STORAGE_FAILED" });
    vi.unstubAllGlobals();
  });
});
