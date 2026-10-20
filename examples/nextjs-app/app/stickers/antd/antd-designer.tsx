"use client";

// The same editor, rendered with the host's Ant Design components through slots.
// No package source changes: only the documented `components` and `theme` props.
import { useMemo, useState } from "react";
import { Button, Checkbox, ConfigProvider, Input, InputNumber, Select } from "antd";
import {
  LabelEditor,
  getPresetTemplate,
  type ButtonSlotProps,
  type CheckboxSlotProps,
  type EditorComponents,
  type LabelTemplate,
  type NumberInputSlotProps,
  type SelectSlotProps,
  type TextInputSlotProps,
} from "@your-org/erp-label-studio";
import { PRODUCTS, productSchema, toLabelRecord } from "@/lib/erp-data";

function AntButton({ setElement, ...p }: ButtonSlotProps) {
  return (
    <Button
      ref={setElement}
      id={p.id}
      type={p.variant === "primary" ? "primary" : p.variant === "ghost" ? "text" : "default"}
      danger={p.variant === "danger"}
      icon={p.icon}
      disabled={p.disabled}
      title={p.title}
      aria-label={p["aria-label"]}
      aria-pressed={p.pressed}
      tabIndex={p.tabIndex}
      onKeyDown={p.onKeyDown}
      onClick={p.onClick}
      data-testid={p["data-testid"]}
      data-kit="antd"
      style={p.pressed ? { background: "#e6f4ff" } : undefined}
    >
      {p.children}
    </Button>
  );
}

function AntTextInput(p: TextInputSlotProps) {
  const common = {
    id: p.id,
    value: p.value,
    placeholder: p.placeholder,
    disabled: p.disabled,
    status: p.invalid ? ("error" as const) : undefined,
    "aria-invalid": p.invalid || undefined,
    "aria-describedby": p["aria-describedby"],
    "aria-label": p["aria-label"],
    onBlur: () => p.onCommit?.(),
  };
  return p.multiline ? <Input.TextArea {...common} autoSize={{ minRows: 2, maxRows: 6 }} onChange={(e) => p.onChange(e.target.value)} /> : <Input {...common} onChange={(e) => p.onChange(e.target.value)} onPressEnter={() => p.onCommit?.()} />;
}

function AntNumberInput(p: NumberInputSlotProps) {
  const [draft, setDraft] = useState<number | null>(p.value ?? null);
  const [synced, setSynced] = useState(p.value);
  if (synced !== p.value) {
    setSynced(p.value);
    setDraft(p.value ?? null);
  }
  const commit = () => {
    if (draft === null) {
      if (p.allowEmpty) p.onCommit(undefined);
      else setDraft(p.value ?? null);
    } else if (Number.isFinite(draft)) p.onCommit(draft);
  };
  return (
    <InputNumber<number>
      id={p.id}
      style={{ width: "100%" }}
      value={draft}
      min={p.min}
      max={p.max}
      step={p.step}
      precision={p.precision}
      disabled={p.disabled}
      status={p.invalid ? "error" : undefined}
      aria-describedby={p["aria-describedby"]}
      suffix={p.unit}
      onChange={(v) => setDraft(v)}
      onBlur={commit}
      onPressEnter={commit}
    />
  );
}

function AntSelect(p: SelectSlotProps) {
  return (
    <Select
      id={p.id}
      style={{ width: "100%" }}
      value={p.value}
      disabled={p.disabled}
      options={p.options.map((o) => ({ value: o.value, label: o.label }))}
      onChange={(v: string) => p.onChange(v)}
      aria-describedby={p["aria-describedby"]}
      aria-label={p["aria-label"]}
      data-kit="antd"
    />
  );
}

function AntCheckbox(p: CheckboxSlotProps) {
  return (
    <Checkbox id={p.id} checked={p.checked} disabled={p.disabled} onChange={(e) => p.onChange(e.target.checked)}>
      {p.label}
    </Checkbox>
  );
}

const antComponents: Partial<EditorComponents> = {
  Button: AntButton,
  TextInput: AntTextInput,
  NumberInput: AntNumberInput,
  Select: AntSelect as EditorComponents["Select"],
  Checkbox: AntCheckbox,
};

export function AntdStickerDesigner() {
  const [template, setTemplate] = useState<LabelTemplate>(() => getPresetTemplate("textile-hang-tag", { id: "antd-demo", name: "Hang tag (antd demo)" })!);
  const sampleData = useMemo(() => PRODUCTS.map(toLabelRecord), []);
  return (
    <ConfigProvider theme={{ token: { colorPrimary: "#0f3d3e", borderRadius: 4 } }}>
      <div className="editor-host">
        <LabelEditor
          template={template}
          onTemplateChange={setTemplate}
          dataSchema={productSchema}
          sampleData={sampleData}
          components={antComponents}
          theme={{ colorAccent: "#0f3d3e", radius: "4px", fontFamily: "-apple-system, 'Segoe UI', Roboto, sans-serif", colorSelection: "#0f3d3e" }}
        />
      </div>
      <output data-testid="template-json" hidden>
        {JSON.stringify(template)}
      </output>
    </ConfigProvider>
  );
}
