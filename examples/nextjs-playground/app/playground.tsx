"use client";

// Playground for the published npm package @pythonprakash/erp-label-studio.
// Pick a preset, edit it, flip the sample data, check the live preview, print, export/import JSON.
// Imports use the package's entry points the way a real app would:
//   root      → the editor UI (LabelEditor, themes)
//   /renderer → preview-only React component
//   /core     → framework-free validation, rendering, printing, JSON
//   /presets  → built-in label sizes and templates

import dynamic from "next/dynamic";
import { useMemo, useState, type CSSProperties } from "react";
import { darkTheme, type LabelTemplate } from "@pythonprakash/erp-label-studio";
import { LabelRenderer } from "@pythonprakash/erp-label-studio/renderer";
import { parseTemplate, printLabels, renderLabel, renderNodeToSvgString, serializeTemplate } from "@pythonprakash/erp-label-studio/core";
import { getPresetSizes, getPresetTemplates, type PresetTemplate } from "@pythonprakash/erp-label-studio/presets";
import { SIZE_DEMO, SIZES } from "./size-demo";

const STORAGE_KEY = "playground-template";

// The editor is interactive-only, so render it on the client. With server rendering, browser
// extensions that inject markup into form controls before React loads (for example the
// "ColorPick Eyedropper" extension adds an <img> next to every colour input) cause hydration
// mismatch warnings. The read-only LabelRenderer preview below is still server-rendered.
const LabelEditor = dynamic(() => import("@pythonprakash/erp-label-studio").then((m) => m.LabelEditor), {
  ssr: false,
  loading: () => <div style={{ height: "100%", display: "grid", placeItems: "center", color: "#555", background: "#fff", border: "1px solid #dde1e6", borderRadius: 8 }}>Loading editor…</div>,
});

type Json = Record<string, unknown>;

/** Immutable set of a dotted path in a plain JSON record (for the quick data buttons). */
function setPath(record: Json, path: string, value: unknown): Json {
  const [head, ...rest] = path.split(".");
  const key = head!;
  if (rest.length === 0) {
    const next = { ...record };
    if (value === undefined) delete next[key];
    else next[key] = value;
    return next;
  }
  const child = record[key] && typeof record[key] === "object" ? (record[key] as Json) : {};
  return { ...record, [key]: setPath(child, rest.join("."), value) };
}

function getPath(record: Json | null, path: string): unknown {
  return path.split(".").reduce<unknown>((v, k) => (v && typeof v === "object" ? (v as Json)[k] : undefined), record);
}

export function Playground() {
  const presets: readonly PresetTemplate[] = useMemo(() => [SIZE_DEMO, ...getPresetTemplates()], []);
  const [presetId, setPresetId] = useState(SIZE_DEMO.id);
  const preset = presets.find((p) => p.id === presetId)!;

  const [template, setTemplate] = useState<LabelTemplate>(() => structuredClone(preset.template) as LabelTemplate);
  const [recordJson, setRecordJson] = useState(() => JSON.stringify(preset.sampleData, null, 2));
  const [dark, setDark] = useState(false);
  const [message, setMessage] = useState("");
  const [importText, setImportText] = useState("");

  // The record used for preview/print (edit the JSON box, or use the quick buttons).
  const record = useMemo(() => {
    try {
      return JSON.parse(recordJson) as Json;
    } catch {
      return null;
    }
  }, [recordJson]);

  const patchRecord = (path: string, value: unknown) => {
    if (!record) return setMessage("Record JSON is invalid.");
    setRecordJson(JSON.stringify(setPath(record, path, value), null, 2));
  };

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
      const r = await printLabels(template, [record], size ? { layout: size.layout } : {});
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

  const box: CSSProperties = { background: "#fff", border: "1px solid #dde1e6", borderRadius: 8, padding: 12 };
  const chip = (active: boolean): CSSProperties => ({ padding: "4px 12px", borderRadius: 6, border: "1px solid #1d2330", background: active ? "#1d2330" : "#fff", color: active ? "#fff" : "#1d2330", fontWeight: active ? 700 : 400, cursor: "pointer" });

  const size = getPath(record, "variant.size");
  const hasOffer = getPath(record, "pricing.offerPrice") !== undefined;
  const lowStock = typeof getPath(record, "stock.qty") === "number" && (getPath(record, "stock.qty") as number) < 5;
  const discontinued = getPath(record, "product.discontinued") === true;

  return (
    <main style={{ padding: 16, display: "grid", gap: 16 }}>
      <header style={{ display: "flex", flexWrap: "wrap", gap: 12, alignItems: "center" }}>
        <strong style={{ fontSize: 18 }}>Label Studio Playground</strong>
        <code style={{ color: "#555" }}>@pythonprakash/erp-label-studio</code>
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
        <button
          onClick={() => {
            const saved = localStorage.getItem(STORAGE_KEY);
            if (saved) {
              setImportText(saved);
              setMessage("Saved template loaded into the import box — click Import");
            } else setMessage("Nothing saved yet");
          }}
        >
          Load saved
        </button>
        <span role="status" style={{ color: "#555" }}>
          {message}
        </span>
      </header>

      {/* Quick data controls: change the record and watch the conditional styles react. */}
      <section style={{ ...box, display: "flex", flexWrap: "wrap", gap: 16, alignItems: "center" }} aria-label="Sample data">
        <span style={{ display: "flex", gap: 6, alignItems: "center" }} role="group" aria-label="Variant size">
          <strong>Size:</strong>
          {SIZES.map((s) => (
            <button key={s} style={chip(size === s)} aria-pressed={size === s} onClick={() => patchRecord("variant.size", s)}>
              {s}
            </button>
          ))}
        </span>
        <label>
          <input type="checkbox" checked={hasOffer} onChange={(e) => patchRecord("pricing.offerPrice", e.target.checked ? 999 : undefined)} /> On sale (star fills, price bold)
        </label>
        <label>
          <input type="checkbox" checked={lowStock} onChange={(e) => patchRecord("stock.qty", e.target.checked ? 2 : 12)} /> Low stock (price turns red)
        </label>
        <label>
          <input type="checkbox" checked={discontinued} onChange={(e) => patchRecord("product.discontinued", e.target.checked)} /> Discontinued (barcode fades)
        </label>
      </section>

      <section style={{ ...box, color: "#444", lineHeight: 1.6 }} aria-label="Editor tips">
        <strong>Try it:</strong> <kbd>V</kbd> Cursor (select, move, resize) · <kbd>H</kbd> Hand (drag or arrow keys to pan; never edits) · hold <kbd>Space</kbd> to pan with any tool ·
        Ctrl+wheel to zoom · <kbd>Esc</kbd> back to Cursor · toolbar <em>Add shape</em> and <em>Pencil</em> · select an element → <em>Conditional style → Add style rule</em>.
      </section>

      {/* The editor fills its container, so give it a height. */}
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
