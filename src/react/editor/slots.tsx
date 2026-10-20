/**
 * Replaceable UI primitives ("slots"). Hosts pass their own implementations
 * via `<LabelEditor components={{ Button: MyButton, ... }} />` to render the
 * editor with their design system (Ant Design, MUI, internal kits). Slots
 * only render controls; all edits still flow through validated store commands.
 *
 * Contract for every slot: forward `id`, `aria-*` props and `disabled`, and
 * keep native keyboard behaviour (Enter/Space for buttons, arrow keys in selects).
 */
import { useState, type ComponentType, type KeyboardEvent, type ReactNode } from "react";

export interface ButtonSlotProps {
  readonly children?: ReactNode | undefined;
  readonly onClick: () => void;
  readonly disabled?: boolean | undefined;
  /** Toggle buttons expose `aria-pressed`. */
  readonly pressed?: boolean | undefined;
  readonly title?: string | undefined;
  readonly "aria-label"?: string | undefined;
  readonly variant?: "default" | "primary" | "danger" | "ghost" | undefined;
  readonly icon?: ReactNode | undefined;
  readonly id?: string | undefined;
  readonly tabIndex?: number | undefined;
  readonly onKeyDown?: ((e: KeyboardEvent<HTMLElement>) => void) | undefined;
  /**
   * Callback receiving the rendered <button> element (pass it to `ref`). Used
   * for roving focus in the toolbar. Named without a "Ref" suffix so host
   * components can read props freely under React Compiler lint rules.
   */
  readonly setElement?: ((element: HTMLButtonElement | null) => void) | undefined;
  readonly "data-testid"?: string | undefined;
}

export interface TextInputSlotProps {
  readonly id: string;
  readonly value: string;
  /** Called on every keystroke; the editor commits on `onCommit` (blur/Enter). */
  readonly onChange: (value: string) => void;
  readonly onCommit?: (() => void) | undefined;
  readonly multiline?: boolean | undefined;
  readonly placeholder?: string | undefined;
  readonly disabled?: boolean | undefined;
  readonly invalid?: boolean | undefined;
  readonly "aria-describedby"?: string | undefined;
  readonly "aria-label"?: string | undefined;
}

export interface NumberInputSlotProps {
  readonly id: string;
  /** Committed value. */
  readonly value: number | undefined;
  /** Commit a parsed number (or undefined to clear when `allowEmpty`). Invalid text must not call this. */
  readonly onCommit: (value: number | undefined) => void;
  readonly min?: number | undefined;
  readonly max?: number | undefined;
  readonly step?: number | undefined;
  /** Decimal places to display. */
  readonly precision?: number | undefined;
  readonly unit?: string | undefined;
  readonly allowEmpty?: boolean | undefined;
  readonly disabled?: boolean | undefined;
  readonly invalid?: boolean | undefined;
  readonly "aria-describedby"?: string | undefined;
}

export interface SelectOption<T extends string = string> {
  readonly value: T;
  readonly label: string;
}

export interface SelectSlotProps<T extends string = string> {
  readonly id: string;
  readonly value: T;
  readonly options: readonly SelectOption<T>[];
  readonly onChange: (value: T) => void;
  readonly disabled?: boolean | undefined;
  readonly "aria-describedby"?: string | undefined;
  readonly "aria-label"?: string | undefined;
}

export interface CheckboxSlotProps {
  readonly id: string;
  readonly checked: boolean;
  readonly onChange: (checked: boolean) => void;
  readonly label: string;
  readonly disabled?: boolean | undefined;
}

export interface ColorInputSlotProps {
  readonly id: string;
  /** `#rrggbb`-style colour, `transparent`, or undefined (unset). */
  readonly value: string | undefined;
  readonly onCommit: (value: string | undefined) => void;
  readonly allowEmpty?: boolean | undefined;
  readonly disabled?: boolean | undefined;
  readonly invalid?: boolean | undefined;
  readonly "aria-describedby"?: string | undefined;
}

export interface FieldSlotProps {
  readonly label: string;
  readonly htmlFor: string;
  readonly children: ReactNode;
  readonly error?: string | undefined;
  readonly errorId?: string | undefined;
  readonly hint?: string | undefined;
  readonly inline?: boolean | undefined;
}

export interface SectionSlotProps {
  readonly title: string;
  readonly children: ReactNode;
  readonly id?: string | undefined;
}

export interface EditorComponents {
  readonly Button: ComponentType<ButtonSlotProps>;
  readonly TextInput: ComponentType<TextInputSlotProps>;
  readonly NumberInput: ComponentType<NumberInputSlotProps>;
  readonly Select: ComponentType<SelectSlotProps>;
  readonly Checkbox: ComponentType<CheckboxSlotProps>;
  readonly ColorInput: ComponentType<ColorInputSlotProps>;
  readonly Field: ComponentType<FieldSlotProps>;
  readonly Section: ComponentType<SectionSlotProps>;
}

/* ------------------------------------------------------------- defaults */

export function DefaultButton({ setElement, ...p }: ButtonSlotProps) {
  return (
    <button
      ref={setElement}
      type="button"
      id={p.id}
      className={`els-btn els-btn--${p.variant ?? "default"}${p.icon && !p.children ? " els-btn--icon" : ""}`}
      onClick={p.onClick}
      disabled={p.disabled}
      aria-pressed={p.pressed}
      aria-label={p["aria-label"]}
      title={p.title}
      tabIndex={p.tabIndex}
      onKeyDown={p.onKeyDown}
      data-testid={p["data-testid"]}
    >
      {p.icon}
      {p.children !== undefined && <span>{p.children}</span>}
    </button>
  );
}

export function DefaultTextInput(p: TextInputSlotProps) {
  const common = {
    id: p.id,
    className: "els-input",
    value: p.value,
    placeholder: p.placeholder,
    disabled: p.disabled,
    "aria-invalid": p.invalid || undefined,
    "aria-describedby": p["aria-describedby"],
    "aria-label": p["aria-label"],
    onBlur: () => p.onCommit?.(),
  };
  if (p.multiline) {
    return <textarea {...common} rows={3} onChange={(e) => p.onChange(e.target.value)} />;
  }
  return (
    <input
      {...common}
      type="text"
      onChange={(e) => p.onChange(e.target.value)}
      onKeyDown={(e) => {
        if (e.key === "Enter") p.onCommit?.();
      }}
    />
  );
}

/** Number input with local text state: commits only parsed, finite, in-range values. */
export function DefaultNumberInput(p: NumberInputSlotProps) {
  const format = (v: number | undefined) => (v === undefined ? "" : String(Number(v.toFixed(p.precision ?? 2))));
  const [text, setText] = useState(format(p.value));
  const [focused, setFocused] = useState(false);
  // Re-sync the draft when the committed value changes while not editing (adjust-state-during-render pattern).
  const syncKey = `${p.value}|${p.precision}`;
  const [syncedKey, setSyncedKey] = useState(syncKey);
  if (!focused && syncKey !== syncedKey) {
    setSyncedKey(syncKey);
    setText(format(p.value));
  }
  const commit = (raw: string) => {
    const t = raw.trim();
    if (t === "") {
      if (p.allowEmpty) p.onCommit(undefined);
      else setText(format(p.value));
      return;
    }
    const n = Number(t);
    if (!Number.isFinite(n)) {
      setText(format(p.value));
      return;
    }
    const clamped = Math.min(p.max ?? Infinity, Math.max(p.min ?? -Infinity, n));
    p.onCommit(clamped);
    setText(format(clamped));
  };
  return (
    <span className="els-number">
      <input
        id={p.id}
        className="els-input"
        type="text"
        inputMode="decimal"
        value={text}
        disabled={p.disabled}
        aria-invalid={p.invalid || undefined}
        aria-describedby={p["aria-describedby"]}
        onFocus={() => setFocused(true)}
        onChange={(e) => setText(e.target.value)}
        onBlur={(e) => {
          setFocused(false);
          commit(e.target.value);
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter") commit((e.target as HTMLInputElement).value);
          else if (e.key === "Escape") setText(format(p.value));
          else if (e.key === "ArrowUp" || e.key === "ArrowDown") {
            e.preventDefault();
            const step = (p.step ?? 1) * (e.shiftKey ? 10 : 1) * (e.key === "ArrowUp" ? 1 : -1);
            commit(String((p.value ?? 0) + step));
          }
        }}
      />
      {p.unit && <span className="els-number__unit" aria-hidden="true">{p.unit}</span>}
    </span>
  );
}

export function DefaultSelect(p: SelectSlotProps) {
  return (
    <select id={p.id} className="els-input els-select" value={p.value} disabled={p.disabled} aria-describedby={p["aria-describedby"]} aria-label={p["aria-label"]} onChange={(e) => p.onChange(e.target.value)}>
      {p.options.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
  );
}

export function DefaultCheckbox(p: CheckboxSlotProps) {
  return (
    <label className="els-checkbox" htmlFor={p.id}>
      <input id={p.id} type="checkbox" checked={p.checked} disabled={p.disabled} onChange={(e) => p.onChange(e.target.checked)} />
      <span>{p.label}</span>
    </label>
  );
}

const HEX = /^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{4}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/;

export function DefaultColorInput(p: ColorInputSlotProps) {
  const [text, setText] = useState(p.value ?? "");
  const [synced, setSynced] = useState(p.value);
  if (p.value !== synced) {
    setSynced(p.value);
    setText(p.value ?? "");
  }
  const swatch = p.value && /^#[0-9a-fA-F]{6}$/.test(p.value) ? p.value : p.value && /^#[0-9a-fA-F]{3}$/.test(p.value) ? `#${[...p.value.slice(1)].map((c) => c + c).join("")}` : "#000000";
  const commit = (v: string) => {
    const t = v.trim();
    if (t === "" && p.allowEmpty) p.onCommit(undefined);
    else if (HEX.test(t) || t === "transparent") p.onCommit(t);
    else setText(p.value ?? "");
  };
  return (
    <span className="els-color">
      <input type="color" className="els-color__swatch" value={swatch} disabled={p.disabled} aria-hidden="true" tabIndex={-1} onChange={(e) => p.onCommit(e.target.value)} />
      <input
        id={p.id}
        className="els-input"
        type="text"
        value={text}
        placeholder={p.allowEmpty ? "none" : "#000000"}
        disabled={p.disabled}
        aria-invalid={p.invalid || undefined}
        aria-describedby={p["aria-describedby"]}
        onChange={(e) => setText(e.target.value)}
        onBlur={(e) => commit(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") commit((e.target as HTMLInputElement).value);
        }}
      />
    </span>
  );
}

export function DefaultField(p: FieldSlotProps) {
  return (
    <div className={`els-field${p.inline ? " els-field--inline" : ""}${p.error ? " els-field--invalid" : ""}`}>
      <label className="els-field__label" htmlFor={p.htmlFor}>
        {p.label}
      </label>
      <div className="els-field__control">{p.children}</div>
      {p.hint && !p.error && <div className="els-field__hint">{p.hint}</div>}
      {p.error && (
        <div className="els-field__error" id={p.errorId} role="alert">
          <span aria-hidden="true">⚠ </span>
          {p.error}
        </div>
      )}
    </div>
  );
}

export function DefaultSection(p: SectionSlotProps) {
  return (
    <section className="els-section" aria-labelledby={p.id ? `${p.id}-title` : undefined}>
      <h3 className="els-section__title" id={p.id ? `${p.id}-title` : undefined}>
        {p.title}
      </h3>
      <div className="els-section__body">{p.children}</div>
    </section>
  );
}

export const DEFAULT_COMPONENTS: EditorComponents = {
  Button: DefaultButton,
  TextInput: DefaultTextInput,
  NumberInput: DefaultNumberInput,
  Select: DefaultSelect as ComponentType<SelectSlotProps>,
  Checkbox: DefaultCheckbox,
  ColorInput: DefaultColorInput,
  Field: DefaultField,
  Section: DefaultSection,
};
