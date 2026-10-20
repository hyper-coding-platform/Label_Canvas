# Embedding in an ERP

The label editor is a **feature inside your page**, not an application. It renders only
inside its own root element and leaves your shell alone.

To install the package into another app and confirm that app still builds, see
[USING_IN_OTHER_APPS.md](USING_IN_OTHER_APPS.md).

## What the SDK does and does not do

| The SDK owns | Your ERP owns |
| --- | --- |
| Canvas interactions, element properties, barcode/QR settings | App shell: navbar, sidebar, header, footer, routing |
| Template validation, data binding, undo/redo | Authentication, authorization, tenant isolation |
| Preview, print layout, print document | Product data, API calls, persistence |
| Scoped styles under `.els-root` / `.els-preview` | Global CSS, fonts, theme, notifications, workflows |

The SDK never creates routes, requires a login, calls a hard-coded backend, writes to
`document.body`, injects global CSS or fonts, or stores data unless you give it a storage
adapter. Dialogs (the print preview) render **inside** the editor root, so the editor works
in tabs, drawers and modals.

Verified in real browsers (`tests/browser/editor.spec.ts`, `tests/nextjs/nextjs.spec.ts`):

* host navbar and sidebar computed styles are identical with and without the editor;
* every package CSS rule is scoped to `.els-root` or `.els-preview`;
* no nodes are added outside the host's React root;
* there is no horizontal page scroll at 375 px, and panels stack in narrow containers
  (container queries, so the layout follows the editor's container, not the window);
* 20 mount/unmount cycles leave no extra window listeners.

## Minimal embedding

```tsx
"use client";
import { LabelEditor } from "@your-org/erp-label-studio";
import "@your-org/erp-label-studio/styles.css";

<div style={{ height: 640 }}>
  <LabelEditor defaultTemplate={template} dataSchema={schema} sampleData={records} onSave={save} />
</div>
```

## Four integration levels

1. **Default UI.** `LabelEditor` as is.
2. **Themed UI.** Pass `theme` tokens such as your colours, font and radius. See
   [CUSTOMIZATION.md](CUSTOMIZATION.md).
3. **Your components.** Pass `components` slots (for example Ant Design `Button`, `Select`,
   `InputNumber`). The example `examples/nextjs-app/app/stickers/antd` is browser-tested.
4. **Headless.** Build your own UI with `/headless` hooks over `createEditorStore`. The
   default UI is not loaded. Example: the `?s=headless` scenario in
   `examples/basic-react-app`.

At every level, edits go through validated store commands, so custom UI cannot produce an
invalid template or a wrong barcode.

## Persistence

Implement `TemplateStorage` over your API, or pass any `onSave(template)` callback.

```ts
interface TemplateStorage {
  get(id, { signal? }): Promise<StoredTemplate | null>;            // { template, revision, updatedAt }
  save(template, { expectedRevision, signal? }): Promise<StoredTemplate>;  // null = create
  delete(id, { expectedRevision?, signal? }): Promise<void>;
  list({ cursor?, limit?, category?, search?, signal? }): Promise<ListResult>;
}
```

* **Ownership and ids.** Template ids are yours. Choose ids that are unique per tenant, or
  store `(tenantId, templateId)` server-side.
* **Versions and concurrency.** Every save checks `expectedRevision`. If someone else saved
  first, `TemplateConflictError` is thrown and the editor shows "Save failed: … modified
  elsewhere" while keeping the user's changes, so the user can reload or merge. Revisions
  increase by 1 per save.
* **Validation.** Adapters validate before saving. Your **server must validate again** with
  `parseTemplate`; never trust client-sent templates.
* **Import and export.** Use `serializeTemplate(template)` and `parseTemplate(json)`.
  Imports are size-checked, migrated, validated and normalized.
* **Duplicating.** `duplicateStoredTemplate(storage, id, newId)` or `cloneTemplate`.
  Duplicates start at revision 1. Preset templates are always copied, so later changes to
  built-in presets never alter your saved templates.
* **Save failures.** `onSave` rejections are shown to the user and passed to `onError`; the
  editor stays dirty. Only one save runs at a time.
* **localStorage adapter.** Single browser, user-clearable, synchronous, quota-limited
  (2 MiB / 200 templates by default). Use it for drafts and demos, never as the system of
  record.

## Data

Map your data to plain records and describe them with a `DataSchema`
([DATA_BINDING.md](DATA_BINDING.md)). Typical textile, retail or warehouse fields such as
SKU, name, size, colour, fabric, batch, MRP and store all work through paths. The SDK makes
no assumptions about your data model.

## Bulk printing from ERP data

```ts
for await (const label of generateLabels(template, fetchProductsPage(), { signal, onProgress })) {
  if (label.ok) await sendToArchiveOrPrintAgent(label.svg!);
  else report(label.index, label.issues);
}
```

`generateLabels` accepts async iterables, so it can stream from paginated APIs. For very large
jobs, run it in a Web Worker (`/core` has no DOM dependency) or on the server, and print or
send output in chunks of at most a few thousand labels.
