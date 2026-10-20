# Release Process

Publishing is the repository owner's decision. **Never publish, tag or push without
explicit authorization.**

## Versioning

Semantic Versioning applies to the public contracts listed in [API.md](API.md): entry-point
exports, the template schema, slot props, theme tokens, CSS custom property names, and error
and issue codes.

* **Patch:** fixes with no API change.
* **Minor:** new exports, new optional props or slot fields, new presets, new issue codes.
* **Major:** removed or renamed exports, new required props, schema version bump without a
  backward migration, or behaviour changes to existing contracts.

Template schema changes ship a tested migration (`BUILT_IN_MIGRATIONS`) and a schema version
bump.

## Release checklist

1. `git status` is clean; `docs/CHANGELOG.md` has an entry for the version.
2. Update `version` in `package.json` (and the version in `docs/API.md`).
3. Run the gates from a clean install. **Use Node 22 or 24 LTS** (the toolchain's supported
   engines):
   ```bash
   npm ci
   npm run verify            # lint, typecheck, unit+integration+security, build, publint+attw, size
   npm run test:browser:all  # Chromium, Firefox, WebKit
   npm run test:nextjs       # pack → clean install → next build → production server tests
   npm run check:licenses
   npm run audit:prod
   npm run bench && npm run bench:editor   # on the reference machine; update PERFORMANCE.md if numbers move
   ```
4. Inspect the tarball: `npm pack --dry-run`. It must contain only `dist/`, `README.md`,
   `LICENSE`, `docs/CHANGELOG.md` and `package.json` (`test:pack` enforces this).
5. If the release claims printer or scanner compatibility, complete the physical checklist
   in [PRINTING.md](PRINTING.md#physical-validation-checklist), plus the manual accessibility
   check in [ACCESSIBILITY.md](ACCESSIBILITY.md). Attach the results to the release notes.
6. Confirm every mandatory gate in [ACCEPTANCE_CRITERIA.md](ACCEPTANCE_CRITERIA.md).
7. With the owner's authorization:
   ```bash
   git tag v0.1.0 && git push origin v0.1.0
   npm publish --access public     # or --access restricted for a private registry
   ```

## Before the first publish

* Replace the placeholder scope `@your-org`. Search the repository, examples and docs for it.
* Confirm the license: MIT is a placeholder chosen during development; the owner decides.
* Add `repository`, `homepage` and `bugs` fields to `package.json`.
* Make the README's `docs/…` links absolute (repository URLs): only `docs/CHANGELOG.md` ships in the tarball, so relative links do not resolve on the npm page.
