// Renderer-only consumer: must not pull in the editor UI bundle.
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { LabelRenderer } from "@suriyaprakashm14/erp-label-studio/renderer";
import "@suriyaprakashm14/erp-label-studio/styles.css";
import { sampleRecords, textileTemplate } from "./fixtures";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <main>
      <h1>Print preview</h1>
      {sampleRecords.map((r, i) => (
        <LabelRenderer key={i} template={textileTemplate} data={r} />
      ))}
    </main>
  </StrictMode>,
);
