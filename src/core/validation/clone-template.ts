import { LabelStudioError } from "../errors";
import type { LabelTemplate } from "../schema/types";
import { ID_PATTERN } from "./validate-template";

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
