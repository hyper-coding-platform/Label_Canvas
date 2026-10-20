import { useState, type ReactNode } from "react";
import { SYMBOLOGIES, LINEAR_FORMATS, validateBarcodeValue } from "../../core/barcode/adapter";
import type { ElementPatch } from "../../core/editor/commands";
import { alignRects } from "../../core/editor/interactions";
import { displayDecimals, roundTo } from "../../core/geometry/units";
import { checkImageSource } from "../../core/render/image-policy";
import { DEFAULT_LIMITS } from "../../core/schema/limits";
import { getPresetSizes } from "../../core/presets/registry";
import type {
  BarcodeFormat,
  Condition,
  FieldValue,
  LabelCanvas,
  LabelElement,
  LengthUnit,
  TextStyle,
  ValueFormat,
  ValueSource,
} from "../../core/schema/types";
import { shallowArrayEqual, useEditorSelector } from "../headless/hooks";
import { useEditorContext } from "./context";
import { elementDisplayName } from "./LayersPanel";
import type { SelectOption } from "./slots";

type FieldErrors = Readonly<Record<string, string>>;

/** Dispatch an element patch and capture the rejection message for the field that caused it. */
function usePatcher(id: string) {
  const { store } = useEditorContext();
  // Errors reset per element because <ElementProperties> is keyed by element id.
  const [errors, setErrors] = useState<FieldErrors>({});
  const patch = (field: string, p: ElementPatch) => {
    const r = store.dispatch({ type: "updateElement", id, patch: p }, { coalesceKey: `prop:${id}:${field}` });
    setErrors((prev) => {
      const next = { ...prev };
      if (r.ok) delete next[field];
      else next[field] = r.issues.find((i) => i.severity === "error")?.message ?? "Invalid value.";
      return next;
    });
    return r.ok;
  };
  return { errors, patch };
}

/* ------------------------------------------------------------ primitives */

function useIds(name: string) {
  const { idBase } = useEditorContext();
  const id = `${idBase}-prop-${name}`;
  return { id, errorId: `${id}-error` };
}

function NumberProp(p: { name: string; label: string; value: number | undefined; onCommit: (v: number | undefined) => void; error?: string; unit?: string; min?: number; max?: number; step?: number; precision?: number; allowEmpty?: boolean; hint?: string }) {
  const { c, readOnly } = useEditorContext();
  const { id, errorId } = useIds(p.name);
  return (
    <c.Field label={p.label} htmlFor={id} {...(p.error ? { error: p.error, errorId } : {})} {...(p.hint ? { hint: p.hint } : {})}>
      <c.NumberInput
        id={id}
        value={p.value}
        onCommit={p.onCommit}
        disabled={readOnly}
        invalid={!!p.error}
        {...(p.error ? { "aria-describedby": errorId } : {})}
        {...(p.unit ? { unit: p.unit } : {})}
        {...(p.min !== undefined ? { min: p.min } : {})}
        {...(p.max !== undefined ? { max: p.max } : {})}
        {...(p.step !== undefined ? { step: p.step } : {})}
        {...(p.precision !== undefined ? { precision: p.precision } : {})}
        {...(p.allowEmpty ? { allowEmpty: true } : {})}
      />
    </c.Field>
  );
}

function TextProp(p: { name: string; label: string; value: string; onCommit: (v: string) => void; error?: string; multiline?: boolean; placeholder?: string }) {
  const { c, readOnly } = useEditorContext();
  const { id, errorId } = useIds(p.name);
  const [text, setText] = useState(p.value);
  const [synced, setSynced] = useState(p.value);
  if (p.value !== synced) {
    setSynced(p.value);
    setText(p.value);
  }
  return (
    <c.Field label={p.label} htmlFor={id} {...(p.error ? { error: p.error, errorId } : {})}>
      <c.TextInput
        id={id}
        value={text}
        onChange={setText}
        onCommit={() => {
          if (text !== p.value) p.onCommit(text);
        }}
        disabled={readOnly}
        invalid={!!p.error}
        {...(p.error ? { "aria-describedby": errorId } : {})}
        {...(p.multiline ? { multiline: true } : {})}
        {...(p.placeholder ? { placeholder: p.placeholder } : {})}
      />
    </c.Field>
  );
}

function SelectProp<T extends string>(p: { name: string; label: string; value: T; options: readonly SelectOption<T>[]; onChange: (v: T) => void; error?: string }) {
  const { c, readOnly } = useEditorContext();
  const { id, errorId } = useIds(p.name);
  return (
    <c.Field label={p.label} htmlFor={id} {...(p.error ? { error: p.error, errorId } : {})}>
      <c.Select id={id} value={p.value} options={p.options} onChange={(v) => p.onChange(v as T)} disabled={readOnly} {...(p.error ? { "aria-describedby": errorId } : {})} />
    </c.Field>
  );
}

function CheckProp(p: { name: string; label: string; checked: boolean; onChange: (v: boolean) => void }) {
  const { c, readOnly } = useEditorContext();
  const { id } = useIds(p.name);
  return <c.Checkbox id={id} label={p.label} checked={p.checked} onChange={p.onChange} disabled={readOnly} />;
}

function ColorProp(p: { name: string; label: string; value: string | undefined; onCommit: (v: string | undefined) => void; allowEmpty?: boolean; error?: string }) {
  const { c, readOnly } = useEditorContext();
  const { id, errorId } = useIds(p.name);
  return (
    <c.Field label={p.label} htmlFor={id} {...(p.error ? { error: p.error, errorId } : {})}>
      <c.ColorInput id={id} value={p.value} onCommit={p.onCommit} disabled={readOnly} invalid={!!p.error} {...(p.allowEmpty ? { allowEmpty: true } : {})} {...(p.error ? { "aria-describedby": errorId } : {})} />
    </c.Field>
  );
}

function Section({ id, title, children }: { id: string; title: string; children: ReactNode }) {
  const { c, idBase } = useEditorContext();
  return (
    <c.Section id={`${idBase}-sec-${id}`} title={title}>
      {children}
    </c.Section>
  );
}

const unitStep = (u: LengthUnit) => (u === "in" ? 0.01 : u === "px" ? 1 : 0.1);

/* ----------------------------------------------------------- data fields */

/** Pick a data field from the host's schema, or type a path when no schema is provided. */
export function FieldPicker(p: { name: string; label: string; value: string; onChange: (path: string) => void; error?: string }) {
  const { dataSchema, c, readOnly } = useEditorContext();
  const { id, errorId } = useIds(p.name);
  const [custom, setCustom] = useState(false);
  const known = dataSchema?.fields.some((f) => f.path === p.value) ?? false;
  if (!dataSchema || dataSchema.fields.length === 0 || custom || (!known && p.value !== "")) {
    return (
      <>
        <TextProp name={p.name} label={p.label} value={p.value} onCommit={p.onChange} placeholder="e.g. product.sku" {...(p.error ? { error: p.error } : {})} />
        {dataSchema && dataSchema.fields.length > 0 && (
          <c.Button variant="ghost" onClick={() => setCustom(false)} disabled={readOnly}>
            Choose from data fields
          </c.Button>
        )}
      </>
    );
  }
  const options: SelectOption[] = [
    ...(known ? [] : [{ value: "", label: "Select a field…" }]),
    ...dataSchema.fields.map((f) => ({ value: f.path, label: `${f.group ? `${f.group} › ` : ""}${f.label} (${f.path})` })),
    { value: "__custom__", label: "Custom path…" },
  ];
  return (
    <c.Field label={p.label} htmlFor={id} {...(p.error ? { error: p.error, errorId } : {})}>
      <c.Select
        id={id}
        value={known ? p.value : ""}
        options={options}
        disabled={readOnly}
        onChange={(v) => {
          if (v === "__custom__") setCustom(true);
          else if (v) p.onChange(v);
        }}
        {...(p.error ? { "aria-describedby": errorId } : {})}
      />
    </c.Field>
  );
}

function FormatEditor(p: { name: string; value: ValueFormat | undefined; onChange: (f: ValueFormat | undefined) => void }) {
  const f = p.value;
  const type = f?.type ?? "none";
  const set = (next: ValueFormat | undefined) => p.onChange(next);
  return (
    <>
      <SelectProp
        name={`${p.name}-format`}
        label="Format"
        value={type}
        options={[
          { value: "none", label: "As is" },
          { value: "text", label: "Text" },
          { value: "number", label: "Number" },
          { value: "currency", label: "Currency" },
          { value: "date", label: "Date" },
        ]}
        onChange={(t) =>
          set(t === "none" ? undefined : t === "text" ? { type: "text" } : t === "number" ? { type: "number", decimals: 2 } : t === "currency" ? { type: "currency", currency: "INR", decimals: 2 } : { type: "date", pattern: "DD/MM/YYYY" })
        }
      />
      {f?.type === "text" && (
        <SelectProp name={`${p.name}-case`} label="Case" value={f.case ?? "none"} options={[{ value: "none", label: "Unchanged" }, { value: "upper", label: "UPPERCASE" }, { value: "lower", label: "lowercase" }, { value: "title", label: "Title Case" }]} onChange={(v) => set(withOptional<ValueFormat>(f, "case", v === "none" ? undefined : v))} />
      )}
      {(f?.type === "number" || f?.type === "currency") && (
        <NumberProp name={`${p.name}-decimals`} label="Decimals" value={f.decimals} min={0} max={6} step={1} precision={0} allowEmpty onCommit={(v) => set(withOptional(f, "decimals", v))} />
      )}
      {f?.type === "number" && <CheckProp name={`${p.name}-grouping`} label="Thousands separator" checked={!!f.grouping} onChange={(v) => set(withOptional(f, "grouping", v || undefined))} />}
      {f?.type === "currency" && (
        <>
          <TextProp name={`${p.name}-currency`} label="Currency code" value={f.currency} onCommit={(v) => set({ ...f, currency: v.trim().toUpperCase() })} />
          <SelectProp name={`${p.name}-display`} label="Show currency as" value={f.display ?? (f.locale ? "symbol" : "code")} options={[{ value: "code", label: "Code (INR 1,299.00)" }, { value: "symbol", label: "Symbol (needs locale)" }, { value: "none", label: "Number only" }]} onChange={(v) => set({ ...f, display: v })} />
        </>
      )}
      {(f?.type === "number" || f?.type === "currency") && (
        <TextProp name={`${p.name}-locale`} label="Locale (optional)" value={f.locale ?? ""} placeholder="e.g. en-IN" onCommit={(v) => set(withOptional(f, "locale", v.trim() || undefined))} />
      )}
      {f?.type === "date" && <TextProp name={`${p.name}-pattern`} label="Date pattern" value={f.pattern} placeholder="DD/MM/YYYY" onCommit={(v) => set({ ...f, pattern: v })} />}
    </>
  );
}

function withOptional<T extends object>(obj: T, key: string, value: unknown): T {
  const out: Record<string, unknown> = { ...(obj as Record<string, unknown>) };
  if (value === undefined) delete out[key];
  else out[key] = value;
  return out as T;
}

/** Example values that are valid for each symbology (used when switching format or source). */
export const EXAMPLE_VALUES: Readonly<Record<BarcodeFormat | "qrcode" | "text", string>> = {
  text: "Text",
  code128: "123456",
  "gs1-128": "(01)09501101530003",
  ean13: "5901234123457",
  ean8: "96385074",
  upca: "036000291452",
  itf14: "15400141288763",
  qrcode: "https://example.com",
};

function ValueSourceEditor(p: { name: string; label: string; value: ValueSource; onChange: (v: ValueSource) => void; multiline?: boolean; error?: string; example: string }) {
  const { dataSchema } = useEditorContext();
  const v = p.value;
  const field = v.kind === "field" ? v : null;
  const setField = (patch: { readonly [K in keyof FieldValue]?: FieldValue[K] | undefined }) => {
    if (!field) return;
    const next: Record<string, unknown> = { ...field, ...patch };
    for (const [k, val] of Object.entries(patch)) if (val === undefined || val === "") delete next[k];
    if (next.required === false) delete next.required;
    p.onChange(next as unknown as FieldValue);
  };
  return (
    <>
      <SelectProp
        name={`${p.name}-kind`}
        label={`${p.label} source`}
        value={v.kind}
        options={[{ value: "static", label: "Fixed text" }, { value: "field", label: "Data field" }]}
        onChange={(k) => p.onChange(k === "static" ? { kind: "static", value: p.example } : { kind: "field", path: dataSchema?.fields[0]?.path ?? "value" })}
      />
      {v.kind === "static" ? (
        <TextProp name={`${p.name}-value`} label={p.label} value={v.value} onCommit={(value) => p.onChange({ kind: "static", value })} {...(p.multiline ? { multiline: true } : {})} {...(p.error ? { error: p.error } : {})} />
      ) : (
        <>
          <FieldPicker name={`${p.name}-path`} label="Field" value={v.path} onChange={(path) => setField({ path })} {...(p.error ? { error: p.error } : {})} />
          <TextProp name={`${p.name}-prefix`} label="Prefix" value={v.prefix ?? ""} onCommit={(s) => setField({ prefix: s })} />
          <TextProp name={`${p.name}-suffix`} label="Suffix" value={v.suffix ?? ""} onCommit={(s) => setField({ suffix: s })} />
          <TextProp name={`${p.name}-fallback`} label="When missing, show" value={v.fallback ?? ""} placeholder="(nothing)" onCommit={(s) => setField({ fallback: s })} />
          <CheckProp name={`${p.name}-required`} label="Required (missing value is an error)" checked={!!v.required} onChange={(b) => setField({ required: b })} />
          <FormatEditor name={p.name} value={v.format} onChange={(format) => setField({ format })} />
        </>
      )}
    </>
  );
}

const OPS: readonly SelectOption[] = [
  { value: "exists", label: "has a value" },
  { value: "missing", label: "is missing" },
  { value: "notEmpty", label: "is not empty" },
  { value: "empty", label: "is empty" },
  { value: "eq", label: "equals" },
  { value: "neq", label: "does not equal" },
  { value: "gt", label: "is greater than" },
  { value: "lt", label: "is less than" },
  { value: "contains", label: "contains" },
];

function ConditionEditor({ el, patch, error }: { el: LabelElement; patch: (field: string, p: ElementPatch) => boolean; error?: string }) {
  const { c, readOnly } = useEditorContext();
  const cond = el.condition;
  const leaf = cond && "field" in cond ? cond : null;
  if (cond && !leaf) {
    return (
      <div className="els-field">
        <p className="els-hint">This element uses an advanced condition (all/any/not). Edit it in the template JSON, or remove it.</p>
        <c.Button variant="ghost" disabled={readOnly} onClick={() => patch("condition", { condition: undefined })}>
          Remove condition
        </c.Button>
      </div>
    );
  }
  const hasValue = leaf && "value" in leaf;
  const set = (next: Condition | undefined) => patch("condition", { condition: next });
  return (
    <>
      <SelectProp name="cond-mode" label="Show element" value={leaf ? "when" : "always"} options={[{ value: "always", label: "Always" }, { value: "when", label: "Only when…" }]} onChange={(m) => set(m === "always" ? undefined : { field: "product.sku", op: "exists" })} {...(error ? { error } : {})} />
      {leaf && (
        <>
          <FieldPicker name="cond-field" label="Field" value={leaf.field} onChange={(field) => set({ ...leaf, field } as Condition)} />
          <SelectProp
            name="cond-op"
            label="Condition"
            value={leaf.op}
            options={OPS}
            onChange={(op) => set(["exists", "missing", "empty", "notEmpty"].includes(op) ? ({ field: leaf.field, op } as Condition) : ({ field: leaf.field, op, value: hasValue ? leaf.value : "" } as Condition))}
          />
          {hasValue && <TextProp name="cond-value" label="Value" value={String(leaf.value)} onCommit={(v) => set({ ...leaf, value: /^-?\d+(\.\d+)?$/.test(v) && leaf.op !== "contains" ? Number(v) : v } as Condition)} />}
        </>
      )}
    </>
  );
}

/* ------------------------------------------------------- element panels */

function GeometrySection({ el, patch, errors, unit }: { el: LabelElement; patch: (f: string, p: ElementPatch) => boolean; errors: FieldErrors; unit: LengthUnit }) {
  const precision = displayDecimals(unit) + 1;
  const step = unitStep(unit);
  const r = (v: number | undefined) => (v === undefined ? undefined : roundTo(v, 4));
  return (
    <Section id="geometry" title="Position and size">
      <div className="els-grid2">
        <NumberProp name="x" label="X" unit={unit} value={el.x} step={step} precision={precision} onCommit={(v) => v !== undefined && patch("x", { x: r(v)! })} {...errorProp(errors.x)} />
        <NumberProp name="y" label="Y" unit={unit} value={el.y} step={step} precision={precision} onCommit={(v) => v !== undefined && patch("y", { y: r(v)! })} {...errorProp(errors.y)} />
        <NumberProp name="width" label="Width" unit={unit} value={el.width} min={0} step={step} precision={precision} onCommit={(v) => v !== undefined && patch("width", el.type === "qrcode" ? { width: r(v)!, height: r(v)! } : { width: r(v)! })} {...errorProp(errors.width)} />
        <NumberProp name="height" label="Height" unit={unit} value={el.height} min={0} step={step} precision={precision} onCommit={(v) => v !== undefined && patch("height", el.type === "qrcode" ? { width: r(v)!, height: r(v)! } : { height: r(v)! })} {...errorProp(errors.height)} />
        <NumberProp name="rotation" label="Rotation" unit="°" value={el.rotation ?? 0} min={0} max={359.99} step={1} precision={2} onCommit={(v) => patch("rotation", { rotation: v ? ((v % 360) + 360) % 360 : undefined })} {...errorProp(errors.rotation)} />
      </div>
      <div className="els-row">
        <CheckProp name="visible" label="Visible" checked={el.visible !== false} onChange={(b) => patch("visible", { visible: b ? undefined : false })} />
        <CheckProp name="locked" label="Locked" checked={!!el.locked} onChange={(b) => patch("locked", { locked: b || undefined })} />
      </div>
    </Section>
  );
}

const errorProp = (e: string | undefined) => (e ? { error: e } : {});

const FONT_WEIGHTS: readonly SelectOption[] = [{ value: "normal", label: "Regular" }, { value: "bold", label: "Bold" }];

function TextSection({ el, patch, errors, unit }: { el: Extract<LabelElement, { type: "text" }>; patch: (f: string, p: ElementPatch) => boolean; errors: FieldErrors; unit: LengthUnit }) {
  const { fonts } = useEditorContext();
  const s = el.style;
  const setStyle = (field: string, next: { readonly [K in keyof TextStyle]?: TextStyle[K] | undefined }) => {
    const style: Record<string, unknown> = { ...s, ...next };
    for (const [k, v] of Object.entries(next)) if (v === undefined) delete style[k];
    return patch(field, { style: style as unknown as TextStyle });
  };
  const fontOptions = [...fonts.values()].map((f) => ({ value: f.id, label: f.label }));
  if (!fonts.has(s.fontFamily)) fontOptions.push({ value: s.fontFamily, label: `${s.fontFamily} (not available)` });
  return (
    <>
      <Section id="content" title="Content">
        <ValueSourceEditor name="content" label="Text" example={EXAMPLE_VALUES.text} value={el.content} multiline onChange={(content) => patch("content", { content })} {...errorProp(errors.content)} />
      </Section>
      <Section id="typography" title="Typography">
        <SelectProp name="font" label="Font" value={s.fontFamily} options={fontOptions} onChange={(fontFamily) => setStyle("font", { fontFamily })} />
        <div className="els-grid2">
          <NumberProp name="fontSize" label="Size" unit="pt" value={s.fontSize} min={0.5} max={DEFAULT_LIMITS.maxFontSizePt} step={0.5} precision={2} onCommit={(v) => v !== undefined && setStyle("fontSize", { fontSize: v })} {...errorProp(errors.fontSize)} />
          <SelectProp name="weight" label="Weight" value={s.fontWeight ?? "normal"} options={FONT_WEIGHTS} onChange={(v) => setStyle("weight", { fontWeight: v === "bold" ? "bold" : undefined })} />
          <SelectProp name="align" label="Align" value={s.align ?? "left"} options={[{ value: "left", label: "Left" }, { value: "center", label: "Center" }, { value: "right", label: "Right" }]} onChange={(v) => setStyle("align", { align: v === "left" ? undefined : v })} />
          <SelectProp name="valign" label="Vertical" value={s.verticalAlign ?? "top"} options={[{ value: "top", label: "Top" }, { value: "middle", label: "Middle" }, { value: "bottom", label: "Bottom" }]} onChange={(v) => setStyle("valign", { verticalAlign: v === "top" ? undefined : v })} />
          <NumberProp name="lineHeight" label="Line height" value={s.lineHeight ?? 1.2} min={0.5} max={5} step={0.1} precision={2} onCommit={(v) => setStyle("lineHeight", { lineHeight: v })} {...errorProp(errors.lineHeight)} />
          <NumberProp name="letterSpacing" label="Letter spacing" unit="pt" value={s.letterSpacing ?? 0} min={-10} max={100} step={0.1} precision={2} onCommit={(v) => setStyle("letterSpacing", { letterSpacing: v || undefined })} />
        </div>
        <CheckProp name="italic" label="Italic" checked={s.fontStyle === "italic"} onChange={(b) => setStyle("italic", { fontStyle: b ? "italic" : undefined })} />
        <SelectProp
          name="overflow"
          label="When text does not fit"
          value={s.overflow ?? "clip"}
          options={[{ value: "clip", label: "Clip" }, { value: "shrink", label: "Shrink to fit" }, { value: "ellipsis", label: "Truncate with …" }, { value: "wrap", label: "Wrap lines" }]}
          onChange={(v) => setStyle("overflow", { overflow: v === "clip" ? undefined : v })}
        />
        {s.overflow === "wrap" && <NumberProp name="maxLines" label="Max lines" value={s.maxLines} min={1} max={100} step={1} precision={0} allowEmpty onCommit={(v) => setStyle("maxLines", { maxLines: v })} />}
        {s.overflow === "shrink" && <NumberProp name="minFontSize" label="Minimum size" unit="pt" value={s.minFontSize ?? 4} min={0.5} max={s.fontSize} step={0.5} precision={2} onCommit={(v) => setStyle("minFontSize", { minFontSize: v })} />}
        <ColorProp name="color" label="Text colour" value={s.color ?? "#000000"} onCommit={(v) => setStyle("color", { color: v === "#000000" ? undefined : v })} />
      </Section>
      <Section id="box" title="Box">
        <ColorProp name="background" label="Background" value={el.background} allowEmpty onCommit={(v) => patch("background", { background: v })} {...errorProp(errors.background)} />
        <div className="els-grid2">
          <NumberProp name="padding" label="Padding" unit={unit} value={el.padding ?? 0} min={0} step={unitStep(unit)} precision={3} onCommit={(v) => patch("padding", { padding: v || undefined })} {...errorProp(errors.padding)} />
          <NumberProp name="borderWidth" label="Border" unit={unit} value={el.border?.width ?? 0} min={0} step={unitStep(unit)} precision={3} onCommit={(v) => patch("border", { border: v ? { width: v, color: el.border?.color ?? "#000000", ...(el.border?.radius !== undefined ? { radius: el.border.radius } : {}) } : undefined })} {...errorProp(errors.border)} />
        </div>
        {el.border && <ColorProp name="borderColor" label="Border colour" value={el.border.color} onCommit={(v) => v && patch("border", { border: { ...el.border!, color: v } })} />}
      </Section>
    </>
  );
}

function BarcodeSection({ el, patch, errors, unit }: { el: Extract<LabelElement, { type: "barcode" }>; patch: (f: string, p: ElementPatch) => boolean; errors: FieldErrors; unit: LengthUnit }) {
  const info = SYMBOLOGIES[el.format];
  return (
    <Section id="barcode" title="Barcode">
      <SelectProp<BarcodeFormat> name="format" label="Format" value={el.format} options={LINEAR_FORMATS.map((f) => ({ value: f, label: SYMBOLOGIES[f].label }))} onChange={(format) =>
          // Keep a fixed value only if it is valid for the new symbology; otherwise use that format's example.
          patch("format", el.value.kind === "static" && !validateBarcodeValue(format, el.value.value).ok ? { format, value: { kind: "static", value: EXAMPLE_VALUES[format] } } : { format })
        }
        {...errorProp(errors.format)}
      />
      <p className="els-hint">{info.description}</p>
      <ValueSourceEditor name="bcvalue" label="Barcode data" example={EXAMPLE_VALUES[el.format]} value={el.value} onChange={(value) => patch("value", { value })} {...errorProp(errors.value)} />
      <SelectProp name="whenMissing" label="If data is missing" value={el.whenMissing ?? "error"} options={[{ value: "error", label: "Report an error (no barcode)" }, { value: "hide", label: "Hide the barcode" }]} onChange={(v) => patch("whenMissing", { whenMissing: v === "error" ? undefined : v })} />
      <CheckProp name="showText" label="Show human-readable text" checked={el.showText !== false} onChange={(b) => patch("showText", { showText: b ? undefined : false })} />
      <div className="els-grid2">
        {el.showText !== false && <NumberProp name="textSize" label="Text size" unit="pt" value={el.textSize ?? 8} min={2} max={72} step={0.5} precision={1} onCommit={(v) => patch("textSize", { textSize: v === 8 ? undefined : v })} {...errorProp(errors.textSize)} />}
        <NumberProp name="moduleWidth" label="Bar width (X)" unit={unit} value={el.moduleWidth} min={0} step={unitStep(unit) / 10} precision={4} allowEmpty hint="Empty = fit to width" onCommit={(v) => patch("moduleWidth", { moduleWidth: v || undefined })} {...errorProp(errors.moduleWidth)} />
      </div>
      {el.format === "itf14" && <SelectProp name="bearer" label="Bearer bars" value={el.bearer ?? "none"} options={[{ value: "none", label: "None" }, { value: "top-bottom", label: "Top and bottom" }, { value: "frame", label: "Frame" }]} onChange={(v) => patch("bearer", { bearer: v === "none" ? undefined : v })} />}
      <ColorProp name="bcColor" label="Bar colour" value={el.color ?? "#000000"} onCommit={(v) => patch("color", { color: v === "#000000" ? undefined : v })} />
      <ColorProp name="bcBackground" label="Background" value={el.background} allowEmpty onCommit={(v) => patch("background", { background: v })} />
    </Section>
  );
}

function QrSection({ el, patch, errors }: { el: Extract<LabelElement, { type: "qrcode" }>; patch: (f: string, p: ElementPatch) => boolean; errors: FieldErrors }) {
  return (
    <Section id="qr" title="QR code">
      <ValueSourceEditor name="qrvalue" label="QR data" example={EXAMPLE_VALUES.qrcode} value={el.value} multiline onChange={(value) => patch("value", { value })} {...errorProp(errors.value)} />
      <SelectProp name="ec" label="Error correction" value={el.errorCorrection ?? "M"} options={[{ value: "L", label: "L (7%)" }, { value: "M", label: "M (15%)" }, { value: "Q", label: "Q (25%)" }, { value: "H", label: "H (30%)" }]} onChange={(v) => patch("errorCorrection", { errorCorrection: v === "M" ? undefined : v })} {...errorProp(errors.errorCorrection)} />
      <NumberProp name="quiet" label="Quiet zone (modules)" value={el.quietZone ?? 4} min={0} max={20} step={1} precision={0} onCommit={(v) => patch("quietZone", { quietZone: v === 4 ? undefined : v })} />
      <SelectProp name="qrMissing" label="If data is missing" value={el.whenMissing ?? "error"} options={[{ value: "error", label: "Report an error (no QR)" }, { value: "hide", label: "Hide the QR code" }]} onChange={(v) => patch("whenMissing", { whenMissing: v === "error" ? undefined : v })} />
      <ColorProp name="qrColor" label="Colour" value={el.color ?? "#000000"} onCommit={(v) => patch("color", { color: v === "#000000" ? undefined : v })} />
      <ColorProp name="qrBackground" label="Background" value={el.background} allowEmpty onCommit={(v) => patch("background", { background: v })} />
    </Section>
  );
}

function ImageSection({ el, patch, errors }: { el: Extract<LabelElement, { type: "image" }>; patch: (f: string, p: ElementPatch) => boolean; errors: FieldErrors }) {
  const { idBase, readOnly, renderOptions } = useEditorContext();
  const [fileError, setFileError] = useState<string | null>(null);
  const inputId = `${idBase}-prop-image-file`;
  const maxBytes = renderOptions.imagePolicy?.maxBytes ?? renderOptions.limits?.maxImageBytes ?? DEFAULT_LIMITS.maxImageBytes;
  const onFile = (file: File | undefined) => {
    setFileError(null);
    if (!file) return;
    if (file.size > maxBytes) {
      setFileError(`Image is ${Math.ceil(file.size / 1024)} KB; the limit is ${Math.floor(maxBytes / 1024)} KB.`);
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      const src = String(reader.result);
      const check = checkImageSource(src, renderOptions.imagePolicy, maxBytes);
      if (!check.ok) setFileError(check.message);
      else if (!patch("src", { src })) setFileError(errors.src ?? "Image rejected.");
    };
    reader.onerror = () => setFileError("The file could not be read.");
    reader.readAsDataURL(file);
  };
  return (
    <Section id="image" title="Image">
      <div className={`els-field${fileError ? " els-field--invalid" : ""}`}>
        <label className="els-field__label" htmlFor={inputId}>
          Image file (PNG, JPEG, GIF, WebP)
        </label>
        <input id={inputId} className="els-file" type="file" accept="image/png,image/jpeg,image/gif,image/webp" disabled={readOnly} aria-describedby={fileError ? `${inputId}-error` : undefined} onChange={(e) => onFile(e.target.files?.[0])} />
        {fileError && (
          <div className="els-field__error" id={`${inputId}-error`} role="alert">
            ⚠ {fileError}
          </div>
        )}
      </div>
      <SelectProp name="fit" label="Fit" value={el.fit ?? "contain"} options={[{ value: "contain", label: "Contain" }, { value: "cover", label: "Cover (crop)" }, { value: "fill", label: "Stretch" }]} onChange={(v) => patch("fit", { fit: v === "contain" ? undefined : v })} />
      <TextProp name="alt" label="Description (alt text)" value={el.alt ?? ""} onCommit={(v) => patch("alt", { alt: v || undefined })} />
    </Section>
  );
}

function ShapeSection({ el, patch, errors, unit }: { el: Extract<LabelElement, { type: "rect" | "line" }>; patch: (f: string, p: ElementPatch) => boolean; errors: FieldErrors; unit: LengthUnit }) {
  return (
    <Section id="shape" title={el.type === "rect" ? "Rectangle" : "Line"}>
      {el.type === "rect" && <ColorProp name="fill" label="Fill" value={el.fill} allowEmpty onCommit={(v) => patch("fill", { fill: v })} />}
      <ColorProp name="stroke" label={el.type === "rect" ? "Border colour" : "Colour"} value={el.stroke ?? (el.type === "line" ? "#000000" : undefined)} allowEmpty={el.type === "rect"} onCommit={(v) => patch("stroke", { stroke: v })} />
      <div className="els-grid2">
        <NumberProp name="strokeWidth" label={el.type === "rect" ? "Border width" : "Thickness"} unit={unit} value={el.strokeWidth ?? 0} min={0} step={unitStep(unit) / 2} precision={3} onCommit={(v) => patch("strokeWidth", { strokeWidth: el.type === "rect" ? v || undefined : v })} {...errorProp(errors.strokeWidth)} />
        {el.type === "rect" && <NumberProp name="radius" label="Corner radius" unit={unit} value={el.cornerRadius ?? 0} min={0} step={unitStep(unit)} precision={3} onCommit={(v) => patch("cornerRadius", { cornerRadius: v || undefined })} {...errorProp(errors.cornerRadius)} />}
      </div>
      {el.type === "line" && <SelectProp name="dash" label="Style" value={el.dash ?? "solid"} options={[{ value: "solid", label: "Solid" }, { value: "dashed", label: "Dashed" }, { value: "dotted", label: "Dotted" }]} onChange={(v) => patch("dash", { dash: v === "solid" ? undefined : v })} />}
    </Section>
  );
}

function ElementProperties({ el, unit }: { el: LabelElement; unit: LengthUnit }) {
  const { patch, errors } = usePatcher(el.id);
  return (
    <div data-testid="els-properties-element">
      <Section id="element" title={elementDisplayName(el)}>
        <TextProp name="name" label="Layer name" value={el.name ?? ""} placeholder="(automatic)" onCommit={(v) => patch("name", { name: v.trim() || undefined })} {...errorProp(errors.name)} />
      </Section>
      <GeometrySection el={el} patch={patch} errors={errors} unit={unit} />
      {el.type === "text" && <TextSection el={el} patch={patch} errors={errors} unit={unit} />}
      {el.type === "barcode" && <BarcodeSection el={el} patch={patch} errors={errors} unit={unit} />}
      {el.type === "qrcode" && <QrSection el={el} patch={patch} errors={errors} />}
      {el.type === "image" && <ImageSection el={el} patch={patch} errors={errors} />}
      {(el.type === "rect" || el.type === "line") && <ShapeSection el={el} patch={patch} errors={errors} unit={unit} />}
      <Section id="visibility" title="Conditional visibility">
        <ConditionEditor el={el} patch={patch} {...errorProp(errors.condition)} />
      </Section>
    </div>
  );
}

function MultiSelection({ ids }: { ids: readonly string[] }) {
  const { store, c, readOnly, announce } = useEditorContext();
  const align = (mode: Parameters<typeof alignRects>[1]) => {
    const els = store.getState().template.elements.filter((e) => ids.includes(e.id) && !e.locked);
    const deltas = alignRects(els.map((e) => ({ x: e.x, y: e.y, width: e.width, height: e.height })), mode);
    const r = store.dispatch({ type: "updateElements", updates: els.map((e, i) => ({ id: e.id, patch: { x: roundTo(e.x + deltas[i]!.x, 4), y: roundTo(e.y + deltas[i]!.y, 4) } })) });
    if (r.ok) announce(`Aligned ${els.length} elements`);
  };
  return (
    <Section id="multi" title={`${ids.length} elements selected`}>
      <div className="els-align" role="group" aria-label="Align selection">
        {(["left", "hcenter", "right", "top", "vcenter", "bottom"] as const).map((m) => (
          <c.Button key={m} variant="ghost" disabled={readOnly} onClick={() => align(m)}>
            {{ left: "Left", hcenter: "Centre", right: "Right", top: "Top", vcenter: "Middle", bottom: "Bottom" }[m]}
          </c.Button>
        ))}
      </div>
    </Section>
  );
}

function TemplateSettings() {
  const { store, records, recordIndex, setRecordIndex } = useEditorContext();
  const template = useEditorSelector(store, (s) => s.template);
  const [errors, setErrors] = useState<FieldErrors>({});
  const canvas = template.canvas;
  const setCanvas = (field: string, patch: { readonly [K in keyof LabelCanvas]?: LabelCanvas[K] | undefined }, convertUnits = false) => {
    const r = store.dispatch({ type: "setCanvas", patch, convertUnits });
    setErrors((prev) => {
      const next = { ...prev };
      if (r.ok) delete next[field];
      else next[field] = r.issues.find((i) => i.severity === "error")?.message ?? "Invalid value.";
      return next;
    });
  };
  const setName = (name: string) => {
    const r = store.dispatch({ type: "setMeta", patch: { name } });
    setErrors((prev) => (r.ok ? withOptional<FieldErrors>(prev, "name", undefined) : { ...prev, name: r.issues[0]?.message ?? "Invalid name." }));
  };
  const step = unitStep(canvas.unit);
  return (
    <div data-testid="els-properties-template">
      <Section id="template" title="Label">
        <TextProp name="tplName" label="Template name" value={template.name} onCommit={setName} {...errorProp(errors.name)} />
        <div className="els-grid2">
          <NumberProp name="canvasW" label="Width" unit={canvas.unit} value={canvas.width} min={0} step={step} precision={displayDecimals(canvas.unit) + 1} onCommit={(v) => v !== undefined && setCanvas("width", { width: v })} {...errorProp(errors.width)} />
          <NumberProp name="canvasH" label="Height" unit={canvas.unit} value={canvas.height} min={0} step={step} precision={displayDecimals(canvas.unit) + 1} onCommit={(v) => v !== undefined && setCanvas("height", { height: v })} {...errorProp(errors.height)} />
        </div>
        <SelectProp
          name="sizePreset"
          label="Size preset"
          value={getPresetSizes().find((p) => p.width === canvas.width && p.height === canvas.height && p.unit === canvas.unit)?.id ?? ""}
          options={[{ value: "", label: "Custom size" }, ...getPresetSizes().map((p) => ({ value: p.id, label: p.name }))]}
          onChange={(id) => {
            const p = getPresetSizes().find((x) => x.id === id);
            // Element positions are kept; elements outside the new size are reported as warnings.
            if (p) setCanvas("width", { width: p.width, height: p.height, unit: p.unit, printerDpi: p.printerDpi }, p.unit !== canvas.unit);
          }}
          {...errorProp(errors.width)}
        />
        <SelectProp<LengthUnit> name="unit" label="Units" value={canvas.unit} options={[{ value: "mm", label: "Millimetres (mm)" }, { value: "in", label: "Inches (in)" }, { value: "px", label: "CSS pixels (px)" }]} onChange={(unit) => setCanvas("unit", { unit }, true)} {...errorProp(errors.unit)} />
        <SelectProp name="dpi" label="Printer resolution" value={String(canvas.printerDpi ?? "")} options={[{ value: "", label: "Not set (no dot snapping)" }, { value: "203", label: "203 dpi (8 dots/mm)" }, { value: "300", label: "300 dpi (12 dots/mm)" }, { value: "600", label: "600 dpi" }]} onChange={(v) => setCanvas("printerDpi", { printerDpi: v ? Number(v) : undefined })} {...errorProp(errors.printerDpi)} />
        <ColorProp name="canvasBg" label="Background" value={canvas.background ?? "#ffffff"} onCommit={(v) => setCanvas("background", { background: v === "#ffffff" ? undefined : v })} {...errorProp(errors.background)} />
        <NumberProp name="canvasRadius" label="Corner radius (preview)" unit={canvas.unit} value={canvas.cornerRadius ?? 0} min={0} step={step} precision={3} onCommit={(v) => setCanvas("cornerRadius", { cornerRadius: v || undefined })} {...errorProp(errors.cornerRadius)} />
      </Section>
      {records.length > 1 && (
        <Section id="sample" title="Preview data">
          <SelectProp name="record" label="Sample record" value={String(recordIndex)} options={records.map((_, i) => ({ value: String(i), label: `Record ${i + 1}` }))} onChange={(v) => setRecordIndex(Number(v))} />
        </Section>
      )}
    </div>
  );
}

export function PropertiesPanel() {
  const { store, ui } = useEditorContext();
  const selection = useEditorSelector(store, (s) => s.selection, shallowArrayEqual);
  const unit = useEditorSelector(store, (s) => s.template.canvas.unit);
  const el = useEditorSelector(store, (s) => (s.selection.length === 1 ? s.template.elements.find((e) => e.id === s.selection[0]) : undefined));
  return (
    <div className="els-properties" data-testid="els-properties">
      {selection.length === 0 ? ui.templateSettings ? <TemplateSettings /> : <p className="els-empty">Select an element to edit its properties.</p> : selection.length > 1 ? <MultiSelection ids={selection} /> : el ? <ElementProperties key={el.id} el={el} unit={unit} /> : null}
    </div>
  );
}
