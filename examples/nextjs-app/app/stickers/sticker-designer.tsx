"use client";

import { useMemo } from "react";
import { LabelEditor, useTemplateStorage } from "@pythonprakash/erp-label-studio";
import { createFetchTemplateStorage } from "@/lib/fetch-storage";
import { PRODUCTS, productSchema, toLabelRecord } from "@/lib/erp-data";

export function StickerDesigner({ templateId }: { templateId: string }) {
  const storage = useMemo(() => createFetchTemplateStorage(), []);
  const { state, save } = useTemplateStorage(storage, templateId);
  const sampleData = useMemo(() => PRODUCTS.map(toLabelRecord), []);

  if (state.status === "loading") return <p role="status">Loading template…</p>;
  if (state.status === "not-found") return <p role="alert">Template not found.</p>;
  if (state.status === "error") return <p role="alert">Could not load the template.</p>;
  return (
    <div className="editor-host">
      <p data-testid="revision">Revision {state.stored.revision}</p>
      <LabelEditor defaultTemplate={state.stored.template} dataSchema={productSchema} sampleData={sampleData} onSave={save} />
    </div>
  );
}
