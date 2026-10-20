# Changelog

All notable changes to `@your-org/erp-label-studio` are documented here. The format follows
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
