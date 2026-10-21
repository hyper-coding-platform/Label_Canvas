# Changelog

All notable changes to `@pythonprakash/erp-label-studio` are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the project uses
[Semantic Versioning](https://semver.org/).

## [0.1.0] - Unreleased

First implementation, not yet published.

### Added

* Versioned template schema v1 with strict validation, `parseTemplate`, and an explicit
  migration framework.
* Safe data binding: dot paths, formatting (text, number, currency, date), fallbacks,
  required fields, and declarative conditions.
* Built-in encoders for Code 128, GS1-128, EAN-13, EAN-8, UPC-A and ITF-14, plus QR (via
  qrcode-generator), each verified by independent decoding.
* Deterministic renderer: render tree → SVG string or React; text fitting (clip, shrink,
  ellipsis, wrap); dot snapping; quiet zones.
* Bulk generation (`generateLabels`): pull-based, ordered, cancellable, with progress and
  error policies.
* Printing: roll and sheet layouts, print documents, browser printing, calibration page,
  editor print preview.
* 19 preset sizes and 10 industry templates; preset registry; `cloneTemplate`;
  `inferDataSchema`.
* Template storage contract with revisions and conflicts; memory and localStorage adapters;
  `useTemplateStorage`.
* Embeddable `LabelEditor` (`BarcodeEditor`): toolbar, SVG canvas (drag, resize, marquee,
  zoom, pan, rulers, grid, snapping, guides), layers, properties, status bar, keyboard
  shortcuts, theme tokens, layout config, component slots, controlled and uncontrolled modes.
* Headless API (`/headless`) and renderer-only entry (`/renderer`).
* Next.js App Router example with Ant Design slots and API-backed persistence.
* Conditional styles: `styleRules` on every element (`when` condition + `set` overrides for
  fill, colour, stroke, stroke width, opacity and text weight/style/size), with
  `applyStyleRules` and `STYLE_OVERRIDE_KEYS` in `/core` and a **Conditional style** section
  in the editor's properties panel.
* `shape` element (ellipse, triangle, diamond, pentagon, hexagon, octagon, star, arrow;
  `SHAPE_KINDS`) and `drawing` element (freehand strokes), with an **Add shape** button, a
  **Pencil** tool (`EditorSettings.tool`) and `createDrawingElement` in `/headless`.
* New limits `maxStyleRules` (16) and `maxDrawingPoints` (2,000); new issue codes
  `TOO_MANY_STYLE_RULES` and `DRAWING_POINTS_INVALID`.
* **Cursor** and **Hand** canvas tools (`EditorSettings.tool`: `"select" | "hand" | "pencil"`,
  type `EditorTool`). Hand pans the view by mouse, touch or pen, with arrow keys, or with V/H
  and Escape to switch, and it never changes the template, history or dirty state. `panBy` is in
  `/headless`.
* `@pythonprakash/erp-label-studio/presets` entry: the built-in sizes and templates
  (`getPresetSizes`, `getPresetTemplates`, `getPresetTemplate`, `createPresetRegistry`).

### Changed (before first publish)

* Published as **`@pythonprakash/erp-label-studio`** (public, MIT © 2026 pythonprakash).

* **`/core` no longer exports the preset catalog**, which keeps it within its size budget.
  Migrate `import { getPresetTemplate } from "@pythonprakash/erp-label-studio/core"` to
  `"@pythonprakash/erp-label-studio/presets"`. The root entry still re-exports the presets, and
  `cloneTemplate` remains in `/core`.
