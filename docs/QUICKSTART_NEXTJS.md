# Quick Start: Add the Label Designer to Your Next.js App

About 10 minutes. You need a Next.js App Router project (Next.js 15+ or 16, React 19) and
Node.js 20.19 or later.

> This exact procedure was tested on 2026-10-20 on a brand-new `create-next-app` project
> (Next.js 16.4.2, React 19.3): install from a download URL, `next build`, `next start`, and
> the page opened in Chromium with no console errors.

---

## Step 1: Install

**A. From npm (recommended):**

```bash
npm install @pythonprakash/erp-label-studio
```

**B. Offline, or a build that is not on npm.** Get
`pythonprakash-erp-label-studio-0.1.0.tgz` (built with `npm run pack:local`, or wherever it was shared), then:

```bash
mkdir vendor
# move the downloaded .tgz into vendor/
npm install ./vendor/pythonprakash-erp-label-studio-0.1.0.tgz
```

Commit `vendor/` and `package-lock.json`, so your teammates and CI get the same version.

> ⚠️ Do **not** use `npm install github:hyper-coding-platform/Label_Canvas` or the repository's git URL. The
> repository does not contain the built files, so imports will fail. Install from npm or the `.tgz`.

## Step 2: Add the stylesheet (one line)

At the top of `app/layout.tsx`:

```tsx
import "@pythonprakash/erp-label-studio/styles.css";
```

The styles only apply inside the label editor. Your own layout, fonts and theme are not
affected.

## Step 3: Add a page with the editor

Create **`app/labels/label-designer.tsx`**:

```tsx
"use client";
import { useState } from "react";
import { LabelEditor, LabelRenderer, getPresetTemplate, type LabelTemplate } from "@pythonprakash/erp-label-studio";

const sample = { store: { name: "My Store" }, product: { name: "Cotton Kurta", barcode: "260042130115" }, pricing: { mrp: 1299 } };

export function LabelDesigner() {
  const [template, setTemplate] = useState<LabelTemplate>(() => getPresetTemplate("textile-hang-tag")!);
  return (
    <>
      <div style={{ height: 640 }}>
        <LabelEditor
          template={template}
          onTemplateChange={setTemplate}
          sampleData={[sample]}
          onSave={async (t) => { console.log("save this JSON to your API:", JSON.stringify(t)); }}
        />
      </div>
      <h2>Preview</h2>
      <LabelRenderer template={template} data={sample} />
    </>
  );
}
```

Create **`app/labels/page.tsx`**:

```tsx
import { LabelDesigner } from "./label-designer";

export default function LabelsPage() {
  return (
    <main style={{ padding: 16 }}>
      <h1>Label designer</h1>
      <LabelDesigner />
    </main>
  );
}
```

Optional: render labels as SVG on the server. Create **`app/api/label-svg/route.ts`**:

```ts
import { renderLabel, renderNodeToSvgString } from "@pythonprakash/erp-label-studio/core";
import { getPresetTemplate } from "@pythonprakash/erp-label-studio/presets";

export function GET() {
  const template = getPresetTemplate("textile-hang-tag")!;
  const result = renderLabel(template, { store: { name: "My Store" }, product: { name: "Cotton Kurta", barcode: "260042130115" }, pricing: { mrp: 1299 } });
  if (!result.ok) return Response.json({ issues: result.issues }, { status: 422 });
  return new Response(renderNodeToSvgString(result.root), { headers: { "content-type": "image/svg+xml; charset=utf-8" } });
}
```

**Rule of thumb:**

* Editor and preview components go in files that start with `"use client"`.
* Server code (API routes, server actions) imports only from
  `@pythonprakash/erp-label-studio/core`.

## Step 4: Test it

### 4a. Development

```bash
npm run dev
```

Open <http://localhost:3000/labels> and check:

- [ ] The editor appears, styled, with a toolbar, the label canvas and side panels.
- [ ] You can drag an element and the **Preview** below updates.
- [ ] Ctrl+Z undoes and Ctrl+Y redoes.
- [ ] Clicking **Save** prints the template JSON in the browser console.
- [ ] **Print preview** opens a preview of the printed label.
- [ ] Your navbar, sidebar and fonts look exactly as before.
- [ ] The browser console (F12) shows no red errors.
- [ ] <http://localhost:3000/api/label-svg> shows the label image, if you added the route.

### 4b. Production build (do this before merging)

```bash
npx tsc --noEmit     # type check
npm run build        # must finish without errors
npm start            # then repeat the checklist on http://localhost:3000/labels
```

### 4c. Real printer (before using it for real labels)

1. Click **Print preview**, then **Print**. In the browser print dialog, set **Scale: 100% / Actual size** and **Margins: None**.
2. Print one label, measure it with a ruler, and compare with the template size.
3. Scan the barcode with your actual scanner. It must read `260042130115`.

## Step 5: Connect your own data

* **Your fields:** pass `dataSchema={{ fields: [{ path: "product.sku", label: "SKU" }, …] }}`
  to `LabelEditor`. Users can then bind elements to your data. See
  [DATA_BINDING.md](DATA_BINDING.md).
* **Saving:** in `onSave`, send `JSON.stringify(template)` to your API. On the server, always
  check it with `parseTemplate(body)` from `/core` before storing it. See
  [INTEGRATION.md](INTEGRATION.md).
* **Templates:** use `getPresetTemplates()` for the 10 built-in templates, or load a saved one.

## If something goes wrong

| You see | Fix |
| --- | --- |
| `Module not found: @pythonprakash/erp-label-studio` | Install from npm or the `.tgz` (Step 1), not the git URL. Then delete `node_modules` and `.next` and run `npm install` again |
| Editor has no styling | The Step 2 import is missing from `app/layout.tsx` |
| "You're importing a component that needs useState…" | The file using `LabelEditor` is missing `"use client"` on its first line |
| Editor is flat or has zero height | Give its parent a height, as in `<div style={{ height: 640 }}>` |
| "Invalid hook call" | Two copies of React. Run `npm ls react`: there should be only one |
| TypeScript: "Cannot find module …/core" | In `tsconfig.json`, set `"moduleResolution": "bundler"` (the Next.js default) |
| Labels print too small or too big | Set the print scale to 100% / Actual size. See [PRINTING.md](PRINTING.md) |

More detail: [USING_IN_OTHER_APPS.md](USING_IN_OTHER_APPS.md) ·
[NEXTJS_INTEGRATION.md](NEXTJS_INTEGRATION.md) · [TROUBLESHOOTING.md](TROUBLESHOOTING.md)

---

## For the maintainer: publishing a release they can install

You do this once per version.

```bash
# 1. Make sure everything passes
npm run verify
npm run test:nextjs

# 2. Build the installable file (bump "version" in package.json first for a new release)
npm run pack:local
# → .pack-test/pythonprakash-erp-label-studio-<version>.tgz
```

3. Push the repository to GitHub.
4. On GitHub, go to **Releases → Draft a new release**. Create tag `v<version>`, attach the
   `.tgz` from `.pack-test/` as a release asset, and publish.
5. Share the release link and this guide (`docs/QUICKSTART_NEXTJS.md`).

* **New version:** bump the version, then repeat steps 1–4. Users run Step 1 again with the
  new file name.
* **Private repository:** direct `npm install <url>` of release assets does not work without
  authentication, so users follow Step 1, option B. Alternatively, publish to GitHub
  Packages ([RELEASE.md](RELEASE.md)).
