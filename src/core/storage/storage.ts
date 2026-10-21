/**
 * Template persistence contract (DECISIONS D-014).
 *
 * The SDK never talks to a backend on its own. Hosts implement
 * `TemplateStorage` over their ERP API (or use the bundled adapters for demos
 * and single-browser use). The host remains responsible for authentication,
 * authorisation, tenant isolation and server-side validation.
 *
 * Concurrency: every stored template has a `revision` (1, 2, 3…). `save`
 * takes the revision the caller last saw (`expectedRevision`); a mismatch
 * throws `TemplateConflictError` instead of overwriting someone else's work.
 * `expectedRevision: null` means "create": it conflicts if the id exists.
 */
import { LabelStudioError, TemplateConflictError, TemplateValidationError, throwIfAborted } from "../errors";
import type { LabelTemplate } from "../schema/types";
import { parseTemplate } from "../validation/parse-template";
import { validateTemplate, type ValidateOptions } from "../validation/validate-template";
import { cloneTemplate } from "../validation/clone-template";

export interface StoredTemplate {
  readonly template: LabelTemplate;
  readonly revision: number;
  /** ISO 8601 timestamp of the last save. */
  readonly updatedAt: string;
}

export interface TemplateSummary {
  readonly id: string;
  readonly name: string;
  readonly category?: string | undefined;
  readonly revision: number;
  readonly updatedAt: string;
}

export interface ListOptions {
  /** Opaque cursor from a previous page. */
  readonly cursor?: string | undefined;
  /** Page size (default 50, max 200). */
  readonly limit?: number | undefined;
  readonly category?: string | undefined;
  /** Case-insensitive substring match on name. */
  readonly search?: string | undefined;
  readonly signal?: AbortSignal | undefined;
}

export interface ListResult {
  readonly items: readonly TemplateSummary[];
  readonly nextCursor?: string | undefined;
}

export interface TemplateStorage {
  get(id: string, options?: { readonly signal?: AbortSignal | undefined }): Promise<StoredTemplate | null>;
  save(template: LabelTemplate, options: { readonly expectedRevision: number | null; readonly signal?: AbortSignal | undefined }): Promise<StoredTemplate>;
  delete(id: string, options?: { readonly expectedRevision?: number | undefined; readonly signal?: AbortSignal | undefined }): Promise<void>;
  list(options?: ListOptions): Promise<ListResult>;
}

export interface StorageOptions extends ValidateOptions {
  /** Clock (injectable for tests). */
  readonly now?: (() => Date) | undefined;
}

const summary = (s: StoredTemplate): TemplateSummary => ({ id: s.template.id, name: s.template.name, category: s.template.category, revision: s.revision, updatedAt: s.updatedAt });

function page(all: StoredTemplate[], o: ListOptions = {}): ListResult {
  const limit = Math.min(200, Math.max(1, Math.floor(o.limit ?? 50)));
  const q = o.search?.toLowerCase();
  const filtered = all
    .filter((s) => (!o.category || s.template.category === o.category) && (!q || s.template.name.toLowerCase().includes(q)))
    .sort((a, b) => a.template.id.localeCompare(b.template.id));
  const start = o.cursor ? filtered.findIndex((s) => s.template.id > o.cursor!) : 0;
  const from = start < 0 ? filtered.length : start;
  const items = filtered.slice(from, from + limit);
  const last = items[items.length - 1];
  return from + limit < filtered.length && last ? { items: items.map(summary), nextCursor: last.template.id } : { items: items.map(summary) };
}

function validated(template: LabelTemplate, options: ValidateOptions): LabelTemplate {
  const r = validateTemplate(template, options);
  if (!r.valid || !r.template) throw new TemplateValidationError(r.issues);
  return r.template;
}

/** In-memory storage for tests, demos and server-side caches. Data is lost when the process ends. */
export function createMemoryTemplateStorage(options: StorageOptions & { readonly initial?: readonly LabelTemplate[] | undefined } = {}): TemplateStorage {
  const now = options.now ?? (() => new Date());
  const map = new Map<string, StoredTemplate>();
  for (const t of options.initial ?? []) map.set(t.id, { template: structuredClone(validated(t, options)), revision: 1, updatedAt: now().toISOString() });
  return {
    async get(id, o) {
      throwIfAborted(o?.signal);
      const s = map.get(id);
      return s ? structuredClone(s) : null;
    },
    async save(template, o) {
      throwIfAborted(o.signal);
      const clean = validated(template, options);
      const current = map.get(clean.id);
      const actual = current?.revision ?? null;
      if (actual !== o.expectedRevision) throw new TemplateConflictError(clean.id, o.expectedRevision, actual);
      const stored: StoredTemplate = { template: structuredClone(clean), revision: (actual ?? 0) + 1, updatedAt: now().toISOString() };
      map.set(clean.id, stored);
      return structuredClone(stored);
    },
    async delete(id, o) {
      throwIfAborted(o?.signal);
      const current = map.get(id);
      if (!current) throw new LabelStudioError("TEMPLATE_NOT_FOUND", `Template "${id}" does not exist.`, { id });
      if (o?.expectedRevision !== undefined && o.expectedRevision !== current.revision) throw new TemplateConflictError(id, o.expectedRevision, current.revision);
      map.delete(id);
    },
    async list(o) {
      throwIfAborted(o?.signal);
      return page([...map.values()], o);
    },
  };
}

export interface LocalStorageOptions extends StorageOptions {
  /** Storage object (default: `window.localStorage`, resolved lazily). */
  readonly storage?: Storage | undefined;
  /** Key namespace. Default `els:template:`. */
  readonly keyPrefix?: string | undefined;
  /** Maximum total bytes (UTF-16 length × 2) used by this adapter. Default 2 MiB. */
  readonly quotaBytes?: number | undefined;
  readonly maxTemplates?: number | undefined;
  /** Called for corrupted or invalid entries skipped during `list`/`get`. */
  readonly onCorruptEntry?: ((key: string, error: unknown) => void) | undefined;
}

/**
 * Browser localStorage adapter. Limitations (docs/API.md): per-browser and
 * per-origin only, not shared between users or devices, can be cleared by the
 * user at any time, synchronous (blocks the main thread for large data), and
 * NOT a substitute for server-side storage with access control.
 * Entries are validated on read; corrupted entries are skipped and reported.
 */
export function createLocalStorageTemplateStorage(options: LocalStorageOptions = {}): TemplateStorage {
  const prefix = options.keyPrefix ?? "els:template:";
  const quota = options.quotaBytes ?? 2 * 1024 * 1024;
  const maxTemplates = options.maxTemplates ?? 200;
  const now = options.now ?? (() => new Date());
  const store = (): Storage => {
    const s = options.storage ?? (typeof localStorage !== "undefined" ? localStorage : undefined);
    if (!s) throw new LabelStudioError("STORAGE_FAILED", "localStorage is not available in this environment.");
    return s;
  };
  const keys = (s: Storage) => {
    const out: string[] = [];
    for (let i = 0; i < s.length; i += 1) {
      const k = s.key(i);
      if (k?.startsWith(prefix)) out.push(k);
    }
    return out;
  };
  const read = (s: Storage, key: string): StoredTemplate | null => {
    const raw = s.getItem(key);
    if (raw === null) return null;
    try {
      const parsed = JSON.parse(raw) as { template?: unknown; revision?: unknown; updatedAt?: unknown };
      const r = parseTemplate(parsed.template, options);
      if (!r.ok) throw new TemplateValidationError(r.issues);
      if (typeof parsed.revision !== "number" || !Number.isInteger(parsed.revision) || parsed.revision < 1 || typeof parsed.updatedAt !== "string") throw new Error("Invalid revision metadata.");
      if (`${prefix}${r.template.id}` !== key) throw new Error("Key does not match template id.");
      return { template: r.template, revision: parsed.revision, updatedAt: parsed.updatedAt };
    } catch (e) {
      options.onCorruptEntry?.(key, e);
      return null;
    }
  };
  const usedBytes = (s: Storage, except?: string) => keys(s).reduce((sum, k) => (k === except ? sum : sum + (k.length + (s.getItem(k)?.length ?? 0)) * 2), 0);

  return {
    async get(id, o) {
      throwIfAborted(o?.signal);
      return read(store(), prefix + id);
    },
    async save(template, o) {
      throwIfAborted(o.signal);
      const s = store();
      const clean = validated(template, options);
      const key = prefix + clean.id;
      const exists = s.getItem(key) !== null;
      const current = exists ? read(s, key) : null;
      if (exists && !current) throw new LabelStudioError("STORAGE_FAILED", `Stored entry for "${clean.id}" is corrupted; delete it before saving.`, { id: clean.id });
      const actual = current?.revision ?? null;
      if (actual !== o.expectedRevision) throw new TemplateConflictError(clean.id, o.expectedRevision, actual);
      if (!exists && keys(s).length >= maxTemplates) throw new LabelStudioError("STORAGE_QUOTA_EXCEEDED", `At most ${maxTemplates} templates can be stored locally.`, { maxTemplates });
      const stored: StoredTemplate = { template: clean, revision: (actual ?? 0) + 1, updatedAt: now().toISOString() };
      const value = JSON.stringify(stored);
      if (usedBytes(s, key) + (key.length + value.length) * 2 > quota) {
        throw new LabelStudioError("STORAGE_QUOTA_EXCEEDED", `Saving would exceed the local storage quota of ${quota} bytes.`, { quota });
      }
      try {
        s.setItem(key, value);
      } catch (e) {
        throw new LabelStudioError("STORAGE_QUOTA_EXCEEDED", "The browser refused to store the template (storage full or disabled).", {}, { cause: e });
      }
      return structuredClone(stored);
    },
    async delete(id, o) {
      throwIfAborted(o?.signal);
      const s = store();
      const key = prefix + id;
      if (s.getItem(key) === null) throw new LabelStudioError("TEMPLATE_NOT_FOUND", `Template "${id}" does not exist.`, { id });
      if (o?.expectedRevision !== undefined) {
        const current = read(s, key);
        if (current && current.revision !== o.expectedRevision) throw new TemplateConflictError(id, o.expectedRevision, current.revision);
      }
      s.removeItem(key);
    },
    async list(o) {
      throwIfAborted(o?.signal);
      const s = store();
      return page(keys(s).map((k) => read(s, k)).filter((x): x is StoredTemplate => x !== null), o);
    },
  };
}

/** Create a copy of a stored template under a new id (revision 1). */
export async function duplicateStoredTemplate(storage: TemplateStorage, id: string, newId: string, newName?: string): Promise<StoredTemplate> {
  const src = await storage.get(id);
  if (!src) throw new LabelStudioError("TEMPLATE_NOT_FOUND", `Template "${id}" does not exist.`, { id });
  return storage.save(cloneTemplate(src.template, { id: newId, ...(newName ? { name: newName } : {}) }), { expectedRevision: null });
}
