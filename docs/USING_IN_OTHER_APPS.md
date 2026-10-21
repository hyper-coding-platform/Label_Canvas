# Using the SDK in Other Applications

This guide covers getting `@suriyaprakashm14/erp-label-studio` into another React, Next.js or Node
application and confirming that the application still builds correctly.

* What the package does internally: [IMPLEMENTATION.md](IMPLEMENTATION.md).
* Every export: [API.md](API.md).
* Next.js specifics in more depth: [NEXTJS_INTEGRATION.md](NEXTJS_INTEGRATION.md).

> **Package name.** The package is published on npm as `@suriyaprakashm14/erp-label-studio`.

## 1. What was verified

Each configuration below was built from the packed tarball (not the source folder), the same
way another team would consume it.

| Consumer | Build | Result | Date |
| --- | --- | --- | --- |
| Next.js 16.4.2, App Router, Turbopack (`examples/nextjs-app`) | `next build` + 8 production browser tests | Pass | 2026-10-20 |
| Next.js 16.4.2, App Router, **webpack** (`next build --webpack`) | `next build` | Pass | 2026-10-20 |
| Fresh Vite 8.3.4 + React 19.3.1 + TS 5.9.3 app (outside this repo) | `tsc -b && vite build` (`strict`, `skipLibCheck: false`), then the built app opened in Chromium | Pass: editor and preview rendered, 0 console errors | 2026-10-20 |
| Node ESM script (`/core`: render, SVG, batch) | `node script.mjs` | Pass | 2026-10-20 |
| Node CommonJS `require("…/core")` | Node 25.9 | Pass (requires Node ≥ 20.19 `require(esm)`) | 2026-10-20 |
| TypeScript resolution `bundler`, `node16`, `nodenext` (ESM and CJS packages) | `tsc --noEmit`, `skipLibCheck: false` | Pass | 2026-10-20 |
| TypeScript resolution `node` / `node10` (legacy) | `tsc --noEmit` | **Fails**: "Cannot find module". See §5 | 2026-10-20 |

**Not verified yet:** React 18, the Next.js Pages Router, Remix / React Router framework
mode, Create React App, Jest, pnpm and Yarn PnP. They are expected to work where noted
below, but have not been tested. Treat them as "test in your app first".

## 2. Requirements for the consuming app

| Requirement | Why |
| --- | --- |
| React and React DOM 18.2+ or 19 | Peer dependencies. Your app's single copy is used. Not needed if you import only `/core` |
| A bundler or runtime that understands **ESM** and the package **`exports` map** | The package is ESM-only (no CommonJS build) and exposes only the documented entry points |
| TypeScript `moduleResolution`: `bundler`, `node16` or `nodenext` | The legacy `node` resolution ignores `exports` |
| Node.js ≥ 20.19 for server code | `/core` in route handlers, scripts and workers |
| The bundler can import a `.css` file from a package | For `styles.css` (Vite, Next.js and webpack with css-loader all can) |

## 3. Getting the package into your app

Choose one of these options. **Option A (npm)** is the normal way. Option B (a tarball) is for
unreleased or offline builds and is exactly what the registry delivers.

### A. From npm

```bash
npm install @suriyaprakashm14/erp-label-studio
```

For a private registry (GitHub Packages, Verdaccio, Artifactory, Azure Artifacts), add the
scope to the consuming app's `.npmrc`:

```ini
@your-company:registry=https://npm.your-company.example/
//npm.your-company.example/:_authToken=${NPM_TOKEN}
```

Publishing needs explicit owner authorisation. Follow [RELEASE.md](RELEASE.md).

### B. From a tarball (recommended before publication)

In this repository:

```bash
npm ci
npm run pack:local      # builds, checks, and writes .pack-test/suriyaprakashm14-erp-label-studio.tgz
```

Copy the tarball into the other app with the version in its name, so upgrades are explicit:

```bash
mkdir -p vendor
cp ../Label_Canvas/.pack-test/suriyaprakashm14-erp-label-studio-0.1.0.tgz vendor/
npm install ./vendor/suriyaprakashm14-erp-label-studio-0.1.0.tgz
```

`package.json` in the other app then contains:

```json
"dependencies": {
  "@suriyaprakashm14/erp-label-studio": "file:vendor/suriyaprakashm14-erp-label-studio-0.1.0.tgz"
}
```

Commit `vendor/*.tgz` and the updated lockfile so CI and teammates install the same build.

**Upgrading.** Build a new tarball, give it a new file name (bump `version` in this repo's
`package.json` first), and run `npm install ./vendor/<new>.tgz`. npm records the tarball's
integrity hash in the lockfile, so overwriting a tarball under the same name causes
`EINTEGRITY` errors or a stale cached copy.

### C. Monorepo workspace

If the other app lives in the same npm/pnpm/Yarn workspace, add this repo as a workspace
package and depend on it with `"@suriyaprakashm14/erp-label-studio": "*"` (npm) or `"workspace:*"`
(pnpm/Yarn). Two rules:

1. **Build first.** Consumers read `dist/`, which is not committed. Run `npm run build` in
   the SDK before building the app, for example as a workspace `prebuild` step or a
   Turborepo/Nx dependency.
2. **One React.** Hoist `react` and `react-dom` to the workspace root, so the SDK's
   dev-dependency copy is not resolved separately.

### D. Linking a local folder (`file:../Label_Canvas`, `npm link`): avoid

npm creates a symlink to this repository. Bundlers then resolve `react` from this repo's own
`node_modules`, which holds a React dev-dependency, and you get **two React copies**
("Invalid hook call"). If you must link for a quick experiment, dedupe React in the app:

```ts
// vite.config.ts
export default defineConfig({ resolve: { dedupe: ["react", "react-dom"] } });
```

For webpack or Next.js, alias `react` and `react-dom` to the app's own copies. Prefer the
tarball for anything you will commit.

### E. Git URL dependency: does not work as is

`npm install git+https://…/Label_Canvas.git` installs the repository without `dist/`, which
is git-ignored, and there is no `prepare` script to build it, so every import fails. Use a
tarball or a registry instead.

## 4. Wiring it up by framework

The rules are the same everywhere:

* Import `styles.css` **once**, at the app root.
* Use the **root entry, `/renderer` and `/headless` only in client code**.
* Use **`/core` anywhere**: server, worker, browser or Node.

| Entry | Contents | Where to import it |
| --- | --- | --- |
| `@suriyaprakashm14/erp-label-studio` | Editor + everything below | Client components only |
| `@suriyaprakashm14/erp-label-studio/renderer` | `LabelRenderer`, `BarcodePreview` (no editor code) | Client components only |
| `@suriyaprakashm14/erp-label-studio/headless` | Hooks for your own editor UI | Client components only |
| `@suriyaprakashm14/erp-label-studio/core` | Validate, render SVG, batch, print, storage | Anywhere |
| `@suriyaprakashm14/erp-label-studio/presets` | Built-in sizes and industry templates | Anywhere |
| `@suriyaprakashm14/erp-label-studio/styles.css` | Scoped styles (`.els-root`, `.els-preview`) | Once at the root |

Import only from these paths. Deep imports such as `…/dist/core.js` are blocked by the
`exports` map and fail with `ERR_PACKAGE_PATH_NOT_EXPORTED`.

### Next.js, App Router (verified)

```tsx
// app/layout.tsx
import "@suriyaprakashm14/erp-label-studio/styles.css";
```

```tsx
// app/labels/label-designer.tsx
"use client";
import { LabelEditor, getPresetTemplate } from "@suriyaprakashm14/erp-label-studio";

export function LabelDesigner() {
  return (
    <div style={{ height: 640 }}>
      <LabelEditor defaultTemplate={getPresetTemplate("textile-hang-tag")!} onSave={async (t) => { /* call your API */ }} />
    </div>
  );
}
```

* The page itself can stay a server component that renders `<LabelDesigner />`.
* Route handlers and server actions use `/core` (`parseTemplate`, `renderLabel`,
  `renderNodeToSvgString`).
* `next.config` needs **no** `transpilePackages` entry.
* Both Turbopack (the default) and `--webpack` builds pass.

Full walkthrough: [NEXTJS_INTEGRATION.md](NEXTJS_INTEGRATION.md).

### Next.js, Pages Router (not yet verified)

Import the stylesheet in `pages/_app.tsx`. Pages render on the server too, and the editor is
written to be SSR-safe, so direct use is expected to work. If you hit a hydration or
`window` problem, load the editor on the client only and report the issue:

```tsx
import dynamic from "next/dynamic";
const LabelDesigner = dynamic(() => import("../components/label-designer").then((m) => m.LabelDesigner), { ssr: false });
```

### Vite + React (verified)

```tsx
// src/main.tsx
import "@suriyaprakashm14/erp-label-studio/styles.css";
import { LabelEditor } from "@suriyaprakashm14/erp-label-studio";
```

No Vite configuration is needed. `@vitejs/plugin-react` is enough.

### webpack 5, Create React App, Rsbuild

Standard ESM packages with an `exports` map work in webpack 5. You need a CSS rule
(`style-loader`/`css-loader` or `MiniCssExtractPlugin`) for the stylesheet import. CRA and
Rsbuild include one. webpack 4 does not support `exports` maps and is not supported.

### Remix / React Router framework mode (not yet verified)

Import `styles.css` through the framework's stylesheet mechanism (for example a `links`
export with `?url`). Use the React entries in route components and `/core` in loaders and
actions.

### Node server, CLI or worker (verified for ESM)

```js
import { parseTemplate, renderLabel, renderNodeToSvgString, generateLabels } from "@suriyaprakashm14/erp-label-studio/core";

const parsed = parseTemplate(jsonFromDb);
if (!parsed.ok) throw new Error(JSON.stringify(parsed.issues));
const result = renderLabel(parsed.template, record);
const svg = result.ok ? renderNodeToSvgString(result.root) : null;
```

* `/core` does not need React installed.
* In a CommonJS project on Node ≥ 20.19, `require("@suriyaprakashm14/erp-label-studio/core")` works.
  On older Node versions, use `await import(…)`.
* `printLabels` is browser-only and throws `PRINT_UNAVAILABLE` on the server. Use
  `buildPrintDocument` or `generateLabels` there instead.

### Web Worker (bulk generation off the main thread)

```ts
// label-worker.ts
import { generateLabels } from "@suriyaprakashm14/erp-label-studio/core";
self.onmessage = async ({ data: { template, records } }) => {
  for await (const label of generateLabels(template, records)) self.postMessage(label);
};
```

```ts
const worker = new Worker(new URL("./label-worker.ts", import.meta.url), { type: "module" });
```

## 5. TypeScript settings in the consuming app

Type declarations ship with the package. No `@types` package is needed.

```jsonc
{
  "compilerOptions": {
    "moduleResolution": "bundler",   // or "node16" / "nodenext"; NOT "node" / "node10"
    "module": "esnext",              // "preserve" also works; with node16/nodenext use the matching module
    "jsx": "react-jsx"
  }
}
```

* With `"moduleResolution": "node"`, TypeScript reports *Cannot find module
  '@suriyaprakashm14/erp-label-studio/core'… Consider updating to 'node16', 'nodenext', or
  'bundler'*. Change the setting. Next.js and Vite templates already use `bundler`.
* `strict`, `exactOptionalPropertyTypes` and `skipLibCheck: false` are all compatible with
  the shipped types, and none of them are required.
* If TypeScript complains about the CSS import, add `declare module "*.css";` to a `.d.ts`
  file. Vite (`vite/client` types) and Next.js already handle this.

## 6. Checking that your app builds correctly

Run these in the **consuming app** after installing or upgrading the SDK.

### Step 1: install and resolve

```bash
npm ls @suriyaprakashm14/erp-label-studio react react-dom
```

You should see **one** `react` and **one** `react-dom` (deduped). A second copy listed under
`@suriyaprakashm14/erp-label-studio/node_modules` means the install was linked rather than packed
(see §3D).

### Step 2: entry points resolve

Save as `scripts/check-label-sdk.mjs` in the consuming app and run it with
`node scripts/check-label-sdk.mjs`:

```js
const core = await import("@suriyaprakashm14/erp-label-studio/core");
const presets = await import("@suriyaprakashm14/erp-label-studio/presets");
const t = presets.getPresetTemplate("textile-hang-tag");
const r = core.renderLabel(t, { store: { name: "S" }, product: { name: "N", barcode: "260042130115" }, pricing: { mrp: 1 } });
if (!r.ok) throw new Error("render failed: " + JSON.stringify(r.issues));
console.log("core OK, svg bytes:", core.renderNodeToSvgString(r.root).length);

const main = await import("@suriyaprakashm14/erp-label-studio");          // needs react + react-dom installed
if (typeof main.LabelEditor !== "function") throw new Error("LabelEditor missing");
import.meta.resolve("@suriyaprakashm14/erp-label-studio/styles.css");
console.log("entries OK");
```

### Step 3: type-check and production build

```bash
npx tsc --noEmit        # catches moduleResolution problems and API misuse
npm run build           # next build / vite build / your bundler
```

### Step 4: run it

Open the page that hosts the editor in the production build (`next start`, `vite preview`,
and so on) and check:

* [ ] The editor is styled. If not, `styles.css` is not imported.
* [ ] The browser console shows no errors. "Invalid hook call" means two Reacts (Step 1).
* [ ] The editor has height. Give its container a height, or set `ui={{ minHeight: … }}`.
* [ ] Your navbar, sidebar and fonts look unchanged. The SDK styles are scoped, so if
  something changed, report it.
* [ ] A barcode preview appears for a record with valid data, and a clearly marked "No
  barcode data" placeholder appears for a record without it.
* [ ] Print preview opens from a click.

### Step 5: add it to the app's CI

Add Steps 2 and 3 to the consuming app's CI pipeline, so an SDK upgrade that breaks the
integration fails the build instead of reaching production.

### How this repository checks it for you

Before any tarball is handed out, run `npm run verify` and `npm run test:nextjs` here.
`test:nextjs` (`scripts/test-pack.mjs` + `playwright.nextjs.config.ts`) packs the SDK, checks
the tarball's file list, clean-installs it into `examples/nextjs-app`, resolves every entry
point, confirms internal paths are blocked, runs `next build`, and runs 8 browser tests
against the production server.

## 7. Bundle size in your app

Only what you import is bundled (`sideEffects` allows tree-shaking; only the CSS is kept):

| Import | Size (min + brotli, React excluded; measured 2026-10-22) |
| --- | --- |
| `/core`, render only | ≈ 27.1 kB |
| `/core`, everything | ≈ 33.8 kB |
| `/presets` on top of `/core` | ≈ +4.6 kB |
| `/renderer` | ≈ 28.1 kB |
| `/headless` | ≈ 32.3 kB |
| Root entry with `LabelEditor` | ≈ 63.6 kB |
| `styles.css` | ≈ 2.5 kB |

The verified Vite app (editor, renderer and `/core` together with React 19) built to 130 kB
gzip in total. Pages that only preview or print should import `/renderer` and `/core`, so
the editor code is never loaded. Current budgets: [PERFORMANCE.md](PERFORMANCE.md).

## 8. Common integration problems

| Symptom | Fix |
| --- | --- |
| `Cannot find module '@suriyaprakashm14/erp-label-studio/core'` in TypeScript only | Set `moduleResolution` to `bundler`, `node16` or `nodenext` (§5) |
| `Module not found` at build time for every entry | `dist/` missing: a git or folder install without a build (§3C–E). Use a tarball |
| "Invalid hook call" / two Reacts | Install from a tarball or registry, or dedupe React (§3D) |
| `ERR_PACKAGE_PATH_NOT_EXPORTED` | A deep import. Use only the five documented entry paths |
| `ERR_REQUIRE_ESM` | Node < 20.19 with `require`. Upgrade Node or use `import()` |
| "You're importing a component that needs useState" | An editor or renderer component used in a server component. Move it into a `"use client"` file |
| `EINTEGRITY` after replacing a tarball | Give each tarball a new version and file name, then reinstall (§3B) |
| Jest: `SyntaxError: Cannot use import statement outside a module` | Jest does not transform `node_modules` ESM by default. Prefer Vitest, or configure Jest for ESM (`transformIgnorePatterns` excluding `@suriyaprakashm14/erp-label-studio`). Not verified |

More: [TROUBLESHOOTING.md](TROUBLESHOOTING.md).
