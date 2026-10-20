# Customization: Theme, Layout, Components, Headless

All customization APIs are **versioned public contracts**. Within a major version, slot
props only gain optional fields.

## Theme tokens

```tsx
<LabelEditor theme={{
  colorScheme: "dark",            // sets color-scheme on the editor root only
  fontFamily: "Inter, sans-serif",// default: inherit the host font
  fontSize: "14px",
  colorBackground: "#16181d", colorSurface: "#1f232b", colorSurfaceAlt: "#272c36",
  colorBorder: "#3a4150", colorText: "#e8eaf0", colorTextMuted: "#a3aab8",
  colorAccent: "#6ea8ff", colorAccentText: "#0b1220", colorDanger: "#ff7a7a", colorWarning: "#f5c25b",
  colorFocus: "#9cc3ff", colorCanvas: "#0f1115", colorSelection: "#6ea8ff", colorGuide: "#ff5fd2",
  colorGrid: "rgba(255,255,255,.08)",
  radius: "6px", spacing: "8px", borderWidth: "1px", controlHeight: "32px", shadow: "none",
  density: "compact",             // or "comfortable"
}} />
```

* Each token becomes an inline CSS custom property on the editor root (`--els-color-bg`,
  `--els-radius`, …). You can also set those variables in your own CSS on any ancestor.
* `darkTheme` is a ready-made dark token set.
* Values containing `;`, `{`, `}`, `<` or `>` are ignored, so they cannot break out of the
  declaration.
* **Themes never affect label output.** Printed and rendered labels use only the template.

CSS variables: `--els-font-family`, `--els-font-size`, `--els-color-bg`, `--els-color-surface`,
`--els-color-surface-alt`, `--els-color-border`, `--els-color-text`, `--els-color-text-muted`,
`--els-color-accent`, `--els-color-accent-text`, `--els-color-danger`, `--els-color-warning`,
`--els-color-focus`, `--els-color-canvas`, `--els-color-selection`, `--els-color-guide`,
`--els-color-grid`, `--els-radius`, `--els-space`, `--els-border-width`,
`--els-control-height`, `--els-shadow`, `--els-panel-width`, `--els-min-height`.

## Layout

```tsx
<LabelEditor ui={{
  toolbar: "top",            // "top" | "bottom" | "hidden"
  layersPanel: "left",       // "left" | "right" | "hidden"
  propertiesPanel: "right",  // "left" | "right" | "hidden"
  rulers: true, statusBar: true,
  panelWidth: "280px", minHeight: "480px",
  elementTypes: ["text", "barcode", "qrcode"],   // toolbar "add" buttons
  saveButton: true, printButton: true, templateSettings: true,
}} />
```

Below 760 px of **container** width, the panels stack under the canvas.

## Component slots

Replace primitives with your design system's components:

```tsx
import { Button, Select } from "antd";
import type { ButtonSlotProps, SelectSlotProps } from "@your-org/erp-label-studio";

function AntButton({ setElement, ...p }: ButtonSlotProps) {
  return (
    <Button ref={setElement} type={p.variant === "primary" ? "primary" : "text"} icon={p.icon}
      disabled={p.disabled} title={p.title} aria-label={p["aria-label"]} aria-pressed={p.pressed}
      tabIndex={p.tabIndex} onKeyDown={p.onKeyDown} onClick={p.onClick}>
      {p.children}
    </Button>
  );
}
function AntSelect(p: SelectSlotProps) {
  return <Select id={p.id} value={p.value} options={[...p.options]} onChange={p.onChange} disabled={p.disabled} style={{ width: "100%" }} />;
}
<LabelEditor components={{ Button: AntButton, Select: AntSelect }} />
```

| Slot | Key props |
| --- | --- |
| `Button` | `onClick`, `children?`, `icon?`, `variant` (`default`/`primary`/`danger`/`ghost`), `pressed?` (toggle → `aria-pressed`), `disabled?`, `title?`, `aria-label?`, `tabIndex?`, `onKeyDown?`, `setElement?` |
| `TextInput` | `id`, `value`, `onChange`, `onCommit?` (blur/Enter), `multiline?`, `placeholder?`, `invalid?`, `aria-describedby?` |
| `NumberInput` | `id`, `value`, `onCommit(number \| undefined)`, `min?`, `max?`, `step?`, `precision?`, `unit?`, `allowEmpty?`, `invalid?` |
| `Select` | `id`, `value`, `options: { value, label }[]`, `onChange` |
| `Checkbox` | `id`, `checked`, `onChange`, `label` |
| `ColorInput` | `id`, `value?`, `onCommit`, `allowEmpty?` |
| `Field` | `label`, `htmlFor`, `children`, `error?`, `errorId?`, `hint?` |
| `Section` | `title`, `children`, `id?` |

Contract for slot implementations:

* Forward `id`, `aria-*` and `disabled` to the focusable element, and keep native keyboard
  behaviour. The toolbar uses `tabIndex`, `onKeyDown` and `setElement` for roving focus.
* **Destructure `setElement`** before reading other props (as above). The React Compiler lint
  treats any value passed to `ref` as ref-like.
* `NumberInput` must call `onCommit` only with finite numbers. Text parsing is the slot's job.
* Slots render controls only. Every change goes through validated store commands, so a slot
  cannot bypass template validation or barcode checks.

## Headless

```tsx
import { useEditorStore, useEditorSelector, useEditorCommands, LabelRenderer } from "@your-org/erp-label-studio/headless";

function MyBuilder({ initial }) {
  const store = useEditorStore(initial);
  const cmd = useEditorCommands(store);
  const template = useEditorSelector(store, (s) => s.template);
  const error = useEditorSelector(store, (s) => s.lastRejection?.[0]?.message);
  return (
    <>
      <button onClick={() => cmd.addElement("barcode")}>Add barcode</button>
      <button onClick={cmd.undo}>Undo</button>
      {error && <p role="alert">{error}</p>}
      <LabelRenderer template={template} data={sampleRecord} />
    </>
  );
}
```

* `store.dispatch(command)` validates every result and returns `{ ok, issues }`.
* `snapMove`, `resizeRect`, `alignRects` and the viewport helpers provide the same geometry as
  the default canvas.
* Hybrid mode: create a store with `createEditorStore` and pass it to
  `<LabelEditor store={store} />` to drive the default UI from outside.

## Fonts

Templates reference font **ids**. Register host fonts that are already loaded by your app:

```ts
const fonts = createFontRegistry([{ id: "brand", label: "Brand Sans", stack: '"Brand Sans", Arial, sans-serif',
  metrics: { narrow: .25, lower: .52, upper: .66, digit: .55, space: .27, wide: .85, other: .6, ascent: .8, boldFactor: 1.06 } }]);
<LabelEditor fonts={fonts} />;  renderLabel(t, r, { fonts });
```

The SDK never downloads fonts. If a font is missing on the printing machine, the browser uses
the next font in the stack. Text fitting uses the estimated `metrics`, or
`createCanvasTextMeasurer` for real measurement. Use the **same** measurer for preview and
print so results match.
