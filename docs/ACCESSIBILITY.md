# Accessibility

## Supported interactions

Every editing operation is possible **without the canvas** (pointer drag is optional):

| Task | Keyboard / assistive-technology path |
| --- | --- |
| Add elements | Toolbar (`role="toolbar"`, roving tabindex: Tab enters, ←/→/Home/End move, Enter/Space activate) |
| Select elements | **Layers** listbox (`role="listbox"`, multi-select): ↑/↓/Home/End move, Shift+↑/↓ extend, Space toggles. The canvas: Ctrl+A selects all |
| Exact position, size, rotation and properties | **Properties** panel: labelled inputs with units; ↑/↓ step (Shift ×10); Enter commits; Escape reverts |
| Move the selection | Arrow keys on the canvas (1 grid unit, or 0.1 mm without snapping; Shift ×10) |
| Reorder, hide, lock | Layer actions group: Bring forward, Send backward, To front, To back, Show/Hide, Lock/Unlock (Alt+↑/↓ in the list also reorders) |
| Undo, redo, duplicate, delete, save | Ctrl/Cmd+Z, Ctrl+Shift+Z or Ctrl+Y, Ctrl+D, Delete/Backspace, Ctrl+S |
| Print preview | Toolbar → modal dialog (`role="dialog"`, `aria-modal`): focus moves inside, Tab is contained, Escape closes, focus returns to the toolbar |

Other behaviour:

* A polite live region announces actions such as "Text added", "Moved 2 elements",
  "Undone", "Saved" and "Save failed".
* Validation errors appear next to the field (`aria-invalid`, `aria-describedby`,
  `role="alert"`) **with an icon and text**, not only colour. Rejected edits are also reported
  in the status bar.
* Selection is shown with a **dashed** outline (pattern plus colour). Selected layers show a
  bar, bold text and `aria-selected`. Hidden layers are struck through and announced
  ("hidden", "locked").
* Focus indicators: a 2 px outline with offset on every control (`:focus-visible`).
* `prefers-reduced-motion` disables transitions and animations inside the editor.
* The editor works at 375 px container width: panels stack below the canvas, with no
  horizontal page scroll.

## Automated checks

* `tests/integration/editor.test.tsx`: axe-core in jsdom. No serious or critical violations
  (colour contrast is excluded in jsdom because it cannot compute styles).
* `tests/browser/editor.spec.ts`: `@axe-core/playwright` in Chromium **with colour contrast**.
  No serious or critical violations in the default editor with an element selected.
* Keyboard-only flow test: toolbar arrows, add, layers selection, delete.
* Print dialog test: focus containment, Escape, focus restoration.

Defects found and fixed by these checks: interactive buttons nested inside listbox options
(axe `nested-interactive`); an inaccurate accessible name ("Add qr code").

## Known limitations

* **The canvas itself is not navigable element by element.** The label preview is decorative
  for assistive technology (`aria-hidden`), and the region is described by instructions.
  Screen-reader users select through the Layers list and edit through the Properties panel,
  which together cover every operation.
* Drag, resize and marquee selection are pointer-only conveniences with keyboard equivalents
  (arrows, numeric fields, list selection). There is no keyboard resize handle; use the
  Width/Height fields.
* Snapping guides are visual only.
* Custom component slots must keep the accessibility contract (forward ids and `aria-*`, keep
  native keyboard behaviour). The SDK cannot verify host components.
* Printed labels are physical artefacts. Ensure your designs meet any legibility requirements
  (minimum font sizes, contrast) that apply to your products.

## Manual verification procedure (before each release)

1. Keyboard only: create a label with text, a barcode and a QR code, set exact positions,
   reorder, hide and show, undo and redo, save, and print preview. Do not use the mouse.
2. Screen reader (NVDA + Firefox on Windows; VoiceOver + Safari on macOS): confirm that the
   toolbar, Layers list (selection state, hidden/locked), Properties fields (labels and
   errors), announcements and the print dialog are read correctly.
3. 200% browser zoom and a 375 px wide container: everything remains reachable.
4. Windows High Contrast / forced colours: controls and focus remain visible.

Record the results in the release notes. **Status: not yet performed for v0.1.0.**
