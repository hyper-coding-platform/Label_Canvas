/**
 * Pure template commands: (template, args) → new template. Unchanged
 * elements keep object identity (structural sharing), which keeps history
 * snapshots cheap and lets React skip unchanged elements.
 *
 * Commands do not validate; the EditorStore validates every result before
 * committing it.
 */
import { convertLength } from "../geometry/units";
import type { LabelCanvas, LabelElement, LabelTemplate, LengthUnit } from "../schema/types";

/**
 * A partial element update. Per element type (distributive), every field is
 * optional; an explicit `undefined` removes an optional property.
 */
export type ElementPatch = LabelElement extends infer E ? (E extends unknown ? { readonly [K in Exclude<keyof E, "id" | "type">]?: E[K] | undefined } : never) : never;

export type TemplateMetaPatch = { readonly [K in "name" | "description" | "category" | "tags"]?: LabelTemplate[K] | undefined };

export type EditorCommand =
  | { readonly type: "addElements"; readonly elements: readonly LabelElement[]; readonly index?: number }
  | { readonly type: "updateElement"; readonly id: string; readonly patch: ElementPatch }
  | { readonly type: "updateElements"; readonly updates: readonly { readonly id: string; readonly patch: ElementPatch }[] }
  | { readonly type: "moveElements"; readonly ids: readonly string[]; readonly dx: number; readonly dy: number }
  | { readonly type: "removeElements"; readonly ids: readonly string[] }
  | { readonly type: "duplicateElements"; readonly ids: readonly string[]; readonly offset: number }
  | { readonly type: "reorderElement"; readonly id: string; readonly to: "front" | "back" | "forward" | "backward" | number }
  | { readonly type: "setCanvas"; readonly patch: { readonly [K in keyof LabelCanvas]?: LabelCanvas[K] | undefined }; readonly convertUnits?: boolean }
  | { readonly type: "setMeta"; readonly patch: TemplateMetaPatch };

export interface CommandResult {
  readonly template: LabelTemplate;
  /** Ids to select after the command (e.g. newly added/duplicated). */
  readonly select?: readonly string[];
}

const omitUndefined = <T extends object>(obj: T): T => {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(obj)) if (v !== undefined) out[k] = v;
  return out as T;
};

function mapElements(t: LabelTemplate, ids: ReadonlySet<string>, fn: (el: LabelElement) => LabelElement): LabelTemplate {
  let changed = false;
  const elements = t.elements.map((el) => {
    if (!ids.has(el.id)) return el;
    const next = fn(el);
    if (next !== el) changed = true;
    return next;
  });
  return changed ? { ...t, elements } : t;
}

/**
 * Apply a patch. `undefined` values remove optional properties (e.g.
 * `{ rotation: undefined }` resets rotation).
 */
export function patchElement(el: LabelElement, patch: ElementPatch): LabelElement {
  const merged = { ...el, ...patch, id: el.id, type: el.type } as Record<string, unknown>;
  for (const [k, v] of Object.entries(patch)) if (v === undefined) delete merged[k];
  return merged as unknown as LabelElement;
}

/** Smallest unused `${prefix}-${n}` id. Deterministic for a given template. */
export function generateElementId(taken: ReadonlySet<string>, prefix: string): string {
  for (let n = 1; ; n += 1) {
    const id = `${prefix}-${n}`;
    if (!taken.has(id)) return id;
  }
}

export function applyCommand(t: LabelTemplate, cmd: EditorCommand): CommandResult {
  switch (cmd.type) {
    case "addElements": {
      const taken = new Set(t.elements.map((e) => e.id));
      const added = cmd.elements.map((el) => {
        const id = taken.has(el.id) ? generateElementId(taken, el.type) : el.id;
        taken.add(id);
        return id === el.id ? el : ({ ...el, id } as LabelElement);
      });
      const index = cmd.index === undefined ? t.elements.length : Math.max(0, Math.min(t.elements.length, cmd.index));
      const elements = [...t.elements.slice(0, index), ...added, ...t.elements.slice(index)];
      return { template: { ...t, elements }, select: added.map((e) => e.id) };
    }
    case "updateElement":
      return { template: mapElements(t, new Set([cmd.id]), (el) => patchElement(el, cmd.patch)) };
    case "updateElements": {
      const byId = new Map(cmd.updates.map((u) => [u.id, u.patch]));
      return { template: mapElements(t, new Set(byId.keys()), (el) => patchElement(el, byId.get(el.id)!)) };
    }
    case "moveElements": {
      if (cmd.dx === 0 && cmd.dy === 0) return { template: t };
      return { template: mapElements(t, new Set(cmd.ids), (el) => (el.locked ? el : ({ ...el, x: el.x + cmd.dx, y: el.y + cmd.dy } as LabelElement))) };
    }
    case "removeElements": {
      const ids = new Set(cmd.ids);
      const elements = t.elements.filter((e) => !ids.has(e.id));
      return { template: elements.length === t.elements.length ? t : { ...t, elements }, select: [] };
    }
    case "duplicateElements": {
      const ids = new Set(cmd.ids);
      const taken = new Set(t.elements.map((e) => e.id));
      const out: LabelElement[] = [];
      const newIds: string[] = [];
      for (const el of t.elements) {
        out.push(el);
        if (!ids.has(el.id)) continue;
        const id = generateElementId(taken, el.type);
        taken.add(id);
        newIds.push(id);
        const copy = { ...el, id, x: el.x + cmd.offset, y: el.y + cmd.offset, locked: undefined } as Record<string, unknown>;
        if (el.name) copy.name = `${el.name} copy`;
        out.push(omitUndefined(copy) as unknown as LabelElement);
      }
      return { template: newIds.length ? { ...t, elements: out } : t, select: newIds };
    }
    case "reorderElement": {
      const from = t.elements.findIndex((e) => e.id === cmd.id);
      if (from < 0) return { template: t };
      const last = t.elements.length - 1;
      const to =
        cmd.to === "front" ? last : cmd.to === "back" ? 0 : cmd.to === "forward" ? Math.min(last, from + 1) : cmd.to === "backward" ? Math.max(0, from - 1) : Math.max(0, Math.min(last, cmd.to));
      if (to === from) return { template: t };
      const elements = [...t.elements];
      const [el] = elements.splice(from, 1);
      elements.splice(to, 0, el!);
      return { template: { ...t, elements } };
    }
    case "setCanvas": {
      const nextUnit = cmd.patch.unit;
      if (cmd.convertUnits && nextUnit && nextUnit !== t.canvas.unit) return { template: convertTemplateUnits(t, nextUnit, cmd.patch) };
      return { template: { ...t, canvas: omitUndefined({ ...t.canvas, ...cmd.patch } as LabelCanvas) } };
    }
    case "setMeta":
      return { template: omitUndefined({ ...t, ...cmd.patch } as LabelTemplate) };
  }
}

const LENGTH_KEYS = ["x", "y", "width", "height", "padding", "strokeWidth", "cornerRadius", "moduleWidth"] as const;

/** Convert all lengths in a template to another unit (typographic sizes stay in points). */
export function convertTemplateUnits(t: LabelTemplate, unit: LengthUnit, canvasPatch: { readonly [K in keyof LabelCanvas]?: LabelCanvas[K] | undefined } = {}): LabelTemplate {
  const from = t.canvas.unit;
  const c = (v: number) => convertLength(v, from, unit);
  // Convert existing canvas lengths, then apply explicit patch values (already in the new unit).
  const canvas = omitUndefined<Record<string, unknown>>({
    ...t.canvas,
    width: c(t.canvas.width),
    height: c(t.canvas.height),
    cornerRadius: t.canvas.cornerRadius === undefined ? undefined : c(t.canvas.cornerRadius),
    ...canvasPatch,
    unit,
  });
  const elements = t.elements.map((el) => {
    const out: Record<string, unknown> = { ...el };
    for (const k of LENGTH_KEYS) if (typeof out[k] === "number") out[k] = c(out[k] as number);
    if (el.type === "text" && el.border) out.border = omitUndefined({ ...el.border, width: c(el.border.width), radius: el.border.radius === undefined ? undefined : c(el.border.radius) });
    return out as unknown as LabelElement;
  });
  return { ...t, canvas: canvas as unknown as LabelCanvas, elements };
}
