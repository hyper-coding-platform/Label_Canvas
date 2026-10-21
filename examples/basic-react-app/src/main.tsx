import { StrictMode, useState, type ReactNode } from "react";
import { createRoot } from "react-dom/client";
import { LabelEditor, darkTheme, type ButtonSlotProps, type LabelTemplate, type SelectSlotProps } from "@pythonprakash/erp-label-studio";
import { LabelRenderer } from "@pythonprakash/erp-label-studio/renderer";
import { useEditorCommands, useEditorSelector, useEditorStore, LabelRenderer as HeadlessPreview } from "@pythonprakash/erp-label-studio/headless";
import { parseTemplate } from "@pythonprakash/erp-label-studio/core";
import "@pythonprakash/erp-label-studio/styles.css";
import { dataSchema, makePerfTemplate, sampleRecords, textileTemplate } from "./fixtures";

const params = new URLSearchParams(location.search);
const scenario = params.get("s") ?? "editor";
const STORAGE_KEY = "harness-template";

function Shell({ children }: { children: ReactNode }) {
  return (
    <div className="erp-shell">
      <header className="erp-navbar" data-testid="host-navbar">
        <h1>Acme ERP</h1>
        <span>Branch: Chennai</span>
      </header>
      <nav className="erp-sidebar" data-testid="host-sidebar" aria-label="Main">
        <a href="?s=dashboard">Dashboard</a>
        <a href="?s=inventory">Inventory</a>
        <a href="?s=editor" aria-current="page">
          Stickers
        </a>
      </nav>
      <main className="erp-content" data-testid="host-content">
        {children}
      </main>
    </div>
  );
}

function loadSaved(): LabelTemplate {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) return textileTemplate;
  const r = parseTemplate(raw);
  return r.ok ? r.template : textileTemplate;
}

function EditorScenario() {
  const [template, setTemplate] = useState<LabelTemplate>(loadSaved);
  const [printed, setPrinted] = useState(0);
  const failSave = params.get("failSave") === "1";
  const hostPrint = params.get("hostPrint") === "1";
  return (
    <>
      <h2>Stickers</h2>
      <div className="erp-editor-host">
        <LabelEditor
          template={template}
          onTemplateChange={setTemplate}
          dataSchema={dataSchema}
          sampleData={sampleRecords}
          onSave={async (t) => {
            await new Promise((r) => setTimeout(r, 150));
            if (failSave) throw new Error("Server unavailable");
            localStorage.setItem(STORAGE_KEY, JSON.stringify(t));
          }}
          onPrint={hostPrint ? () => setPrinted((n) => n + 1) : undefined}
        />
      </div>
      <output data-testid="template-json" hidden>
        {JSON.stringify(template)}
      </output>
      <output data-testid="printed">{printed}</output>
    </>
  );
}

/* A different "UI kit" (stands in for Ant Design / MUI) supplied through slots. */
function AcmeButton({ setElement, ...p }: ButtonSlotProps) {
  return (
    <button
      type="button"
      ref={setElement}
      className="acme-btn"
      data-kit="acme"
      aria-label={p["aria-label"]}
      aria-pressed={p.pressed}
      title={p.title}
      disabled={p.disabled}
      tabIndex={p.tabIndex}
      onKeyDown={p.onKeyDown}
      onClick={p.onClick}
      data-testid={p["data-testid"]}
      style={{ border: "2px solid #7c3aed", borderRadius: 999, background: p.pressed ? "#ede9fe" : "#fff", color: "#3b0764", padding: "2px 10px", minHeight: 30 }}
    >
      {p.icon}
      {p.children}
    </button>
  );
}
function AcmeSelect(p: SelectSlotProps) {
  return (
    <select id={p.id} data-kit="acme" value={p.value} disabled={p.disabled} aria-describedby={p["aria-describedby"]} onChange={(e) => p.onChange(e.target.value)} style={{ border: "2px solid #7c3aed", borderRadius: 8 }}>
      {p.options.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
  );
}

function ThemedScenario() {
  const [template, setTemplate] = useState<LabelTemplate>(textileTemplate);
  return (
    <div className="erp-editor-host">
      <LabelEditor
        template={template}
        onTemplateChange={setTemplate}
        dataSchema={dataSchema}
        sampleData={sampleRecords}
        theme={{ ...darkTheme, fontFamily: "Verdana, sans-serif", radius: "2px", density: "compact" }}
        components={{ Button: AcmeButton, Select: AcmeSelect }}
        ui={{ layersPanel: "right", propertiesPanel: "left", toolbar: "bottom", panelWidth: "300px" }}
      />
      <output data-testid="template-json" hidden>
        {JSON.stringify(template)}
      </output>
    </div>
  );
}

function HeadlessScenario() {
  const store = useEditorStore({ ...textileTemplate, elements: [] });
  const cmd = useEditorCommands(store);
  const template = useEditorSelector(store, (s) => s.template);
  const rejection = useEditorSelector(store, (s) => s.lastRejection?.[0]?.message ?? "");
  return (
    <section aria-label="Custom label builder">
      <h2>Custom builder (headless)</h2>
      <button type="button" onClick={() => cmd.addElement("barcode")}>
        Add barcode
      </button>
      <button type="button" onClick={() => cmd.addElement("text")}>
        Add text
      </button>
      <button type="button" onClick={() => store.getState().template.elements[0] && cmd.updateElement(store.getState().template.elements[0]!.id, { width: 0 })}>
        Make invalid
      </button>
      <button type="button" onClick={cmd.undo}>
        Undo
      </button>
      <p data-testid="headless-count">{template.elements.length}</p>
      <p data-testid="headless-error">{rejection}</p>
      <HeadlessPreview template={template} data={sampleRecords[0]} />
    </section>
  );
}

function RendererScenario() {
  return (
    <section>
      <h2>Print preview only</h2>
      {sampleRecords.map((r, i) => (
        <LabelRenderer key={i} template={textileTemplate} data={r} />
      ))}
    </section>
  );
}

function MountLoopScenario() {
  const [mounted, setMounted] = useState(true);
  return (
    <>
      <button type="button" data-testid="toggle" onClick={() => setMounted((m) => !m)}>
        toggle
      </button>
      <div className="erp-editor-host">{mounted && <LabelEditor defaultTemplate={textileTemplate} dataSchema={dataSchema} sampleData={sampleRecords} />}</div>
    </>
  );
}

function InvalidScenario() {
  const bad = { ...textileTemplate, canvas: { ...textileTemplate.canvas, width: -5 } };
  return (
    <div className="erp-editor-host">
      <LabelEditor defaultTemplate={bad} />
    </div>
  );
}

function PerfScenario() {
  const n = Number(params.get("n") ?? 100);
  const [template, setTemplate] = useState<LabelTemplate>(() => makePerfTemplate(n));
  return (
    <div className="erp-editor-host">
      <LabelEditor template={template} onTemplateChange={setTemplate} dataSchema={dataSchema} sampleData={sampleRecords} />
      <output data-testid="element-count" hidden>
        {template.elements.length}
      </output>
    </div>
  );
}

const scenarios: Record<string, () => ReactNode> = {
  perf: () => <PerfScenario />,
  editor: () => <EditorScenario />,
  themed: () => <ThemedScenario />,
  headless: () => <HeadlessScenario />,
  renderer: () => <RendererScenario />,
  mountloop: () => <MountLoopScenario />,
  invalid: () => <InvalidScenario />,
  bare: () => <p>Host page without the editor.</p>,
};

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <Shell>{(scenarios[scenario] ?? scenarios.editor!)()}</Shell>
  </StrictMode>,
);
