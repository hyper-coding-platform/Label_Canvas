"use client";

// Manual visual-testing playground for @suriyaprakashm14/erp-label-studio.
// Pick a preset, edit it, check the live preview, print, export/import JSON.

import { useMemo, useState } from "react";
import {
  LabelEditor,
  LabelRenderer,
  darkTheme,
  getPresetTemplates,
  getPresetSizes,
  parseTemplate,
  printLabels,
  renderLabel,
  renderNodeToSvgString,
  serializeTemplate,
  type LabelTemplate,
} from "@suriyaprakashm14/erp-label-studio";

const STORAGE_KEY = "playground-template";

export function Playground() {
  const presets = getPresetTemplates();
  const [presetId, setPresetId] = useState(presets[0]!.id);
  const preset = presets.find((p) => p.id === presetId)!;

  const [template, setTemplate] = useState<LabelTemplate>(() => structuredClone(preset.template) as LabelTemplate);
  const [recordJson, setRecordJson] = useState(() => JSON.stringify(preset.sampleData, null, 2));
  const [dark, setDark] = useState(false);
  const [message, setMessage] = useState("");
  const [importText, setImportText] = useState("");

  // The record used for preview/print (edit the JSON box to test missing fields etc.).
  const record = useMemo(() => {
    try {
      return JSON.parse(recordJson) as Record<string, unknown>;
    } catch {
      return null;
    }
  }, [recordJson]);

  const loadPreset = (id: string) => {
    const p = presets.find((x) => x.id === id)!;
    setPresetId(id);
    setTemplate(structuredClone(p.template) as LabelTemplate);
    setRecordJson(JSON.stringify(p.sampleData, null, 2));
    setMessage(`Loaded preset "${p.name}"`);
  };

  const issues = useMemo(() => {
    try {
      return renderLabel(template, record ?? undefined).issues;
    } catch (e) {
      return [{ code: "ERROR", severity: "error" as const, path: "", message: (e as Error).message }];
    }
  }, [template, record]);

  const print = async () => {
    if (!record) return setMessage("Record JSON is invalid.");
    const size = getPresetSizes().find((s) => s.id === preset.sizeId);
    try {
      const r = await printLabels(template, [record], { layout: size?.layout });
      setMessage(`Print dialog opened: ${r.document.labelCount} label(s), ${r.document.skipped.length} skipped`);
    } catch (e) {
      setMessage(`Print failed: ${(e as Error).message}`);
    }
  };

  const downloadSvg = () => {
    const r = renderLabel(template, record ?? undefined);
    if (!r.ok) return setMessage(`Cannot export: ${r.issues[0]?.message}`);
    const url = URL.createObjectURL(new Blob([renderNodeToSvgString(r.root)], { type: "image/svg+xml" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = `${template.id}.svg`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const importJson = () => {
    const r = parseTemplate(importText);
    if (r.ok) {
      setTemplate(r.template);
      setMessage(`Imported "${r.template.name}" (${r.warnings.length} warning(s))`);
    } else {
      setMessage(`Import rejected: ${r.issues.slice(0, 3).map((i) => `${i.path || "/"} ${i.message}`).join("; ")}`);
    }
  };

  const box: React.CSSProperties = { background: "#fff", border: "1px solid #dde1e6", borderRadius: 8, padding: 12 };

  return (
    <main style={{ padding: 16, display: "grid", gap: 16 }}>
      <header style={{ display: "flex", flexWrap: "wrap", gap: 12, alignItems: "center" }}>
        <strong style={{ fontSize: 18 }}>Label Studio Playground</strong>
        <label>
          Preset:{" "}
          <select value={presetId} onChange={(e) => loadPreset(e.target.value)}>
            {presets.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </label>
        <label>
          <input type="checkbox" checked={dark} onChange={(e) => setDark(e.target.checked)} /> Dark theme
        </label>
        <button onClick={() => void print()}>Print</button>
        <button onClick={downloadSvg}>Download SVG</button>
        <button onClick={() => navigator.clipboard.writeText(serializeTemplate(template, 2)).then(() => setMessage("Template JSON copied"))}>Copy template JSON</button>
        <button onClick={() => { const saved = localStorage.getItem(STORAGE_KEY); if (saved) { setImportText(saved); setMessage("Saved template loaded into the import box — click Import"); } else setMessage("Nothing saved yet"); }}>
          Load saved
        </button>
        <span role="status" style={{ color: "#555" }}>{message}</span>
      </header>

      {/* The editor: fills its container, so give it a height. */}
      <section style={{ height: 640 }}>
        <LabelEditor
          template={template}
          onTemplateChange={setTemplate}
          dataSchema={preset.dataSchema}
          sampleData={record ? [record] : [preset.sampleData]}
          theme={dark ? darkTheme : undefined}
          onSave={async (t) => {
            localStorage.setItem(STORAGE_KEY, serializeTemplate(t));
            setMessage("Saved to localStorage");
          }}
          onError={(e) => setMessage(`Editor error: ${(e as Error).message}`)}
        />
      </section>

      <section style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))", gap: 16 }}>
        <div style={box}>
          <h3 style={{ marginTop: 0 }}>Live preview (physical size)</h3>
          <LabelRenderer template={template} data={record ?? undefined} />
          <h4>Issues for this record</h4>
          {issues.length === 0 ? (
            <p style={{ color: "green" }}>None</p>
          ) : (
            <ul>
              {issues.map((i, k) => (
                <li key={k} style={{ color: i.severity === "error" ? "#b42318" : "#9a6700" }}>
                  [{i.severity}] {i.code}: {i.message}
                </li>
              ))}
            </ul>
          )}
        </div>

        <div style={box}>
          <h3 style={{ marginTop: 0 }}>Sample record (edit to test bindings)</h3>
          <p style={{ color: "#555", margin: "0 0 8px" }}>Try deleting a field or breaking a barcode value — the preview and issues update.</p>
          <textarea value={recordJson} onChange={(e) => setRecordJson(e.target.value)} rows={14} style={{ width: "100%", fontFamily: "monospace" }} />
          {!record && <p style={{ color: "#b42318" }}>Invalid JSON</p>}
        </div>

        <div style={box}>
          <h3 style={{ marginTop: 0 }}>Import template JSON</h3>
          <textarea value={importText} onChange={(e) => setImportText(e.target.value)} rows={10} placeholder="Paste template JSON here" style={{ width: "100%", fontFamily: "monospace" }} />
          <button onClick={importJson}>Import</button>
        </div>
      </section>
    </main>
  );
}
