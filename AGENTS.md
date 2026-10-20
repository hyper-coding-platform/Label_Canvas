# AGENTS.md: Instructions for Coding Sessions

## Start of every session
1. Read this file, `docs/IMPLEMENTATION_PLAN.md`, `docs/ARCHITECTURE.md`,
   `docs/ACCEPTANCE_CRITERIA.md`, `docs/TEST_STRATEGY.md`, and `docs/DECISIONS.md`.
2. Run `git status` and `git log --oneline -15`. Never discard uncommitted user work.
3. Pick the first unchecked task in the plan. Implement only a coherent slice.

## Mandatory verification before marking a task done or committing
```
npm run lint
npm run typecheck
npm test
npm run build
npm run check:package
```
Also run `npm run test:browser` for any change under `src/react/**`, `src/styles/**`
or `examples/**`. Record the commands and their results in the plan's verification log.
Never claim a command passed unless you ran it and saw exit code 0.

## Architectural boundaries (enforced by tests)
* `src/core/**` must not import `react`, `react-dom`, or `src/react/**`, and must
  not touch `window`/`document`/`navigator` at module scope.
* `src/react/renderer/**` must not import `src/react/editor/**`.
* All template mutations go through `EditorStore` commands. UI components never
  mutate templates directly.
* All rendering goes through `renderLabel` → `RenderNode`. There is no second
  layout implementation.

## Prohibited shortcuts
* No `eval`, `new Function`, `with`, string-based `setTimeout`, or expression
  languages in templates.
* No `dangerouslySetInnerHTML` and no `innerHTML` with untrusted data. (The print iframe
  writes a document built only from the escaping serialiser.)
* No global CSS selectors. Every rule is scoped under `.els-root` or `.els-preview`.
* No placeholder exports, TODO-implemented features, or fake test results.
* Do not weaken tests or benchmarks to make them pass. Fix the code or record a
  documented exception.
* Do not mark a barcode format supported without an independent-decoder test.
* Do not publish, tag, or push without explicit owner authorisation.
* Do not commit the user's notes files (`initial_prompt.txt`, `*.txt` notes at root).

## Conventions
* TypeScript strict and `exactOptionalPropertyTypes`. Prefer `readonly` types for public data.
* Files use kebab-case. React components use PascalCase files.
* Errors are `LabelStudioError` subclasses with stable `code`s. Validation returns issues
  instead of throwing.
* Public API changes require updating `docs/API.md`, `tests/unit/public-api.test.ts`, and
  `docs/CHANGELOG.md`.
* Commit messages follow the imperative mood and name the plan step (e.g. `D2: template validation`).
