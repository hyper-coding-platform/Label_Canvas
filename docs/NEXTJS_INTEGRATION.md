# Next.js Integration (App Router)

Verified with **Next.js 16.4.2** (Turbopack) and **React 19.3.1**, using the packed tarball
installed into `examples/nextjs-app` (`npm run test:nextjs`): `next build` type-checks and
prerenders the editor pages, and a production server passes 8 browser tests, including
hydration without console errors. React 18.2+ is allowed by the peer range but **not yet
verified** (see [TEST_STRATEGY.md](TEST_STRATEGY.md)).

## 1. Install

```bash
npm install @your-org/erp-label-studio
```

`react` and `react-dom` are peer dependencies: your app provides them, so no second React
copy is bundled.

## 2. Import the stylesheet once

```tsx
// app/layout.tsx (server component)
import "@your-org/erp-label-studio/styles.css";
```

Every rule is scoped under `.els-root` or `.els-preview`. The stylesheet contains no resets,
no `html`/`body` rules and no fonts, so your shell is unaffected.

## 3. Mount the editor in a client component

The main entry and `/renderer` and `/headless` are marked `"use client"`. Server components
render your page and pass serializable props (templates and records are plain JSON).

```tsx
// app/stickers/page.tsx (server component: your ERP shell renders around it)
import { StickerDesigner } from "./sticker-designer";
export default function StickersPage() {
  return (
    <>
      <h1>Stickers</h1>
      <StickerDesigner templateId="textile-hang-tag" />
    </>
  );
}
```

```tsx
// app/stickers/sticker-designer.tsx
"use client";
import { useMemo } from "react";
import { LabelEditor, useTemplateStorage } from "@your-org/erp-label-studio";
import { createFetchTemplateStorage } from "@/lib/fetch-storage"; // your adapter over your API
import { productSchema, PRODUCTS, toLabelRecord } from "@/lib/erp-data";

export function StickerDesigner({ templateId }: { templateId: string }) {
  const storage = useMemo(() => createFetchTemplateStorage(), []);
  const { state, save } = useTemplateStorage(storage, templateId);
  const sampleData = useMemo(() => PRODUCTS.map(toLabelRecord), []);
  if (state.status === "loading") return <p role="status">Loading template…</p>;
  if (state.status !== "ready") return <p role="alert">Could not load the template.</p>;
  return (
    <div style={{ height: 680 }}>
      <LabelEditor defaultTemplate={state.stored.template} dataSchema={productSchema} sampleData={sampleData} onSave={save} />
    </div>
  );
}
```

The editor fills its container. Give the container a height (or let `ui.minHeight`, 480px by
default, apply).

## 4. Server-side code uses `/core`

`/core` has no React import and touches no browser globals when imported. Use it in route
handlers, server actions and workers:

```ts
// app/api/templates/[id]/route.ts: validate on the server, enforce revisions
import { parseTemplate, TemplateConflictError } from "@your-org/erp-label-studio/core";
export async function PUT(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const body = await req.json();
  const parsed = parseTemplate(body.template);        // never trust the client
  if (!parsed.ok) return Response.json({ issues: parsed.issues }, { status: 422 });
  try {
    return Response.json(await db.save(parsed.template, { expectedRevision: body.expectedRevision }));
  } catch (e) {
    if (e instanceof TemplateConflictError) return Response.json({ expectedRevision: e.expectedRevision, actualRevision: e.actualRevision }, { status: 409 });
    throw e;
  }
}
```

```ts
// app/api/labels/[templateId]/[productId]/route.ts: server-rendered SVG
import { renderLabel, renderNodeToSvgString } from "@your-org/erp-label-studio/core";
const result = renderLabel(template, record);
if (!result.ok) return Response.json({ issues: result.issues }, { status: 422 });
return new Response(renderNodeToSvgString(result.root), { headers: { "content-type": "image/svg+xml; charset=utf-8" } });
```

`printLabels` is browser-only; it throws `PRINT_UNAVAILABLE` on the server. Call it from
client components.

## 5. Renderer-only pages

Pages that only preview or print should import from `/renderer` and `/core`. The editor
bundle is then never loaded (verified in `tests/browser/editor.spec.ts`).

```tsx
"use client";
import { LabelRenderer } from "@your-org/erp-label-studio/renderer";
<LabelRenderer template={template} data={record} />
```

## SSR notes

* The editor renders on the server: it uses `useId` for stable ids and no `window` or
  `document` during render. Measuring, wheel listeners and `ResizeObserver` start in effects.
* The canvas fits the label to its container after mount, so the first client paint can
  differ from the server HTML only in zoom, which is applied in an effect (no hydration
  mismatch).
* No `transpilePackages` setting is needed; the package ships standard ES2020 ESM.
* In a monorepo with several lockfiles, Next.js may warn about the workspace root; set
  `turbopack.root` in `next.config` (see `examples/nextjs-app/next.config.mjs`).

## Running the example

```bash
npm run test:pack                          # build, pack, clean-install into the example, next build
npm --prefix examples/nextjs-app run start # http://localhost:3100
```

Routes: `/stickers` (API-backed editor), `/stickers/antd` (Ant Design controls through slots),
`/print` (batch preview and print), `/api/labels/textile-hang-tag/p1` (server-rendered SVG).
