import { useCallback, useEffect, useRef, useState } from "react";
import type { StoredTemplate, TemplateStorage } from "../../core/storage/storage";
import type { LabelTemplate } from "../../core/schema/types";

export type TemplateStorageState =
  | { readonly status: "loading" }
  | { readonly status: "not-found" }
  | { readonly status: "error"; readonly error: unknown }
  | { readonly status: "ready"; readonly stored: StoredTemplate };

export interface UseTemplateStorageResult {
  readonly state: TemplateStorageState;
  /**
   * Save with optimistic concurrency against the loaded revision. Resolves
   * with the stored template (pass it back from the editor's `onSave`).
   * Rejects with TemplateConflictError if someone else saved first.
   */
  readonly save: (template: LabelTemplate) => Promise<LabelTemplate>;
  readonly reload: () => void;
}

/**
 * Load a template by id from a TemplateStorage and save it back with
 * revision checks. In-flight loads are aborted on id change/unmount and stale
 * responses are ignored (each request is tagged with a key).
 */
export function useTemplateStorage(storage: TemplateStorage, id: string | null): UseTemplateStorageResult {
  const [nonce, setNonce] = useState(0);
  const key = `${id ?? ""}\u0000${nonce}`;
  const [result, setResult] = useState<{ key: string; state: TemplateStorageState } | null>(null);
  const revision = useRef<number | null>(null);
  const storageRef = useRef(storage);

  useEffect(() => {
    storageRef.current = storage;
    if (id === null) return;
    const ac = new AbortController();
    storage.get(id, { signal: ac.signal }).then(
      (stored) => {
        if (ac.signal.aborted) return;
        revision.current = stored?.revision ?? null;
        setResult({ key, state: stored ? { status: "ready", stored } : { status: "not-found" } });
      },
      (error: unknown) => {
        if (!ac.signal.aborted) setResult({ key, state: { status: "error", error } });
      },
    );
    return () => ac.abort();
  }, [storage, id, key]);

  const state: TemplateStorageState = id === null ? { status: "not-found" } : result?.key === key ? result.state : { status: "loading" };

  const save = useCallback(
    async (template: LabelTemplate) => {
      const stored = await storageRef.current.save(template, { expectedRevision: revision.current });
      revision.current = stored.revision;
      setResult({ key, state: { status: "ready", stored } });
      return stored.template;
    },
    [key],
  );
  const reload = useCallback(() => setNonce((n) => n + 1), []);
  return { state, save, reload };
}
