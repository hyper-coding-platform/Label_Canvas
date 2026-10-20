import { LabelStudioError } from "../errors";
import type { LabelTemplate } from "../schema/types";
import { validateTemplate, ID_PATTERN } from "../validation/validate-template";
import { builtInSizes as loadBuiltInSizes, type PresetCategory, type PresetSize } from "./sizes";
import { builtInTemplates as loadBuiltInTemplates, type PresetTemplate } from "./templates";

/** Freeze recursively, including inside containers that are already frozen. */
const deepFreeze = <T>(v: T, seen = new WeakSet<object>()): T => {
  if (v && typeof v === "object" && !seen.has(v)) {
    seen.add(v);
    Object.freeze(v);
    for (const x of Object.values(v)) deepFreeze(x, seen);
  }
  return v;
};

/**
 * Deep-copy a template under a new id/name. The copy shares nothing with the
 * source, so editing it never affects presets or other templates.
 */
export function cloneTemplate(template: LabelTemplate, overrides: { id?: string; name?: string } = {}): LabelTemplate {
  const copy = structuredClone(template) as LabelTemplate & { id: string; name: string };
  const id = overrides.id ?? `${template.id}-copy`;
  if (!ID_PATTERN.test(id)) throw new LabelStudioError("INVALID_ARGUMENT", `Invalid template id "${id}".`);
  return { ...copy, id, name: overrides.name ?? `${template.name} (copy)` };
}

export interface PresetRegistry {
  listSizes(filter?: { category?: PresetCategory }): readonly PresetSize[];
  getSize(id: string): PresetSize | undefined;
  listTemplates(filter?: { category?: string }): readonly PresetTemplate[];
  /** Returns a deep copy of the preset template (safe to edit), or undefined. */
  getTemplate(id: string, overrides?: { id?: string; name?: string }): LabelTemplate | undefined;
  /** Register a host-specific size (replaces a custom size with the same id; built-ins cannot be replaced). */
  addSize(size: PresetSize): void;
  /** Register a host-specific template; it is validated first. */
  addTemplate(preset: PresetTemplate): void;
}

/**
 * Create an isolated preset registry. Each registry starts with the built-ins;
 * additions are local to the registry instance (no global mutable state).
 */
export function createPresetRegistry(): PresetRegistry {
  const sizes = new Map<string, PresetSize>(deepFreeze(loadBuiltInSizes()).map((s) => [s.id, s]));
  const templates = new Map<string, PresetTemplate>(deepFreeze(loadBuiltInTemplates()).map((t) => [t.id, t]));
  const builtInSizes = new Set(sizes.keys());
  const builtInTemplates = new Set(templates.keys());
  return {
    listSizes: (filter) => [...sizes.values()].filter((s) => !filter?.category || s.category === filter.category),
    getSize: (id) => sizes.get(id),
    listTemplates: (filter) => [...templates.values()].filter((t) => !filter?.category || t.category === filter.category),
    getTemplate(id, overrides) {
      const p = templates.get(id);
      return p ? cloneTemplate(p.template, { id: overrides?.id ?? p.template.id, name: overrides?.name ?? p.template.name }) : undefined;
    },
    addSize(size) {
      if (builtInSizes.has(size.id)) throw new LabelStudioError("INVALID_ARGUMENT", `Built-in size "${size.id}" cannot be replaced; use a different id.`);
      if (!ID_PATTERN.test(size.id) || !(size.width > 0) || !(size.height > 0)) throw new LabelStudioError("INVALID_ARGUMENT", `Invalid preset size "${size.id}".`);
      sizes.set(size.id, deepFreeze(structuredClone(size)));
    },
    addTemplate(preset) {
      if (builtInTemplates.has(preset.id)) throw new LabelStudioError("INVALID_ARGUMENT", `Built-in template "${preset.id}" cannot be replaced; use a different id.`);
      const r = validateTemplate(preset.template);
      if (!r.valid || !r.template) throw new LabelStudioError("TEMPLATE_INVALID", `Preset template "${preset.id}" is invalid.`, { issues: r.issues });
      templates.set(preset.id, deepFreeze({ ...structuredClone(preset), template: r.template }));
    },
  };
}

let defaultRegistryInstance: PresetRegistry | undefined;
const defaultRegistry = (): PresetRegistry => (defaultRegistryInstance ??= createPresetRegistry());

/** Built-in preset sizes (read-only). */
export function getPresetSizes(filter?: { category?: PresetCategory }): readonly PresetSize[] {
  return defaultRegistry().listSizes(filter);
}

/** Built-in preset templates (read-only). Use `cloneTemplate(p.template)` or `getPresetTemplate(id)` to obtain an editable copy. */
export function getPresetTemplates(filter?: { category?: string }): readonly PresetTemplate[] {
  return defaultRegistry().listTemplates(filter);
}

/** An editable deep copy of a built-in template. */
export function getPresetTemplate(id: string, overrides?: { id?: string; name?: string }): LabelTemplate | undefined {
  return defaultRegistry().getTemplate(id, overrides);
}

