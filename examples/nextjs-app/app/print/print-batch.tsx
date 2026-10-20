"use client";

import { useState } from "react";
import { LabelRenderer } from "@your-org/erp-label-studio/renderer";
import { generateLabels, printLabels, type DataRecord, type LabelTemplate } from "@your-org/erp-label-studio/core";

export function PrintBatch({ template, records }: { template: LabelTemplate; records: DataRecord[] }) {
  const [status, setStatus] = useState("");
  const verify = async () => {
    let ok = 0;
    let failed = 0;
    for await (const label of generateLabels(template, records)) {
      if (label.ok) ok += 1;
      else failed += 1;
    }
    setStatus(`${ok} ready, ${failed} with problems`);
  };
  return (
    <section>
      <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
        {records.map((r, i) => (
          <LabelRenderer key={i} template={template} data={r} />
        ))}
      </div>
      <p>
        <button type="button" onClick={() => void verify()}>
          Check batch
        </button>{" "}
        <button type="button" onClick={() => void printLabels(template, records).then((r) => setStatus(`Printing ${r.document.labelCount} labels`), (e: Error) => setStatus(e.message))}>
          Print all
        </button>
      </p>
      <p role="status" data-testid="batch-status">
        {status}
      </p>
    </section>
  );
}
