# Security

## Threat model

Templates, records, imported JSON, images and callback inputs are treated as **untrusted**.
For example, a template may come from another tenant, a file upload or a compromised client,
and a record may contain hostile strings.

| Asset | Threat | Mitigation |
| --- | --- | --- |
| Host page (XSS) | Script or markup injection through text, names, colours, images or ids | Render tree with per-tag **attribute allowlist** checked at construction and again at serialization; escaping serializer; React text nodes; no `dangerouslySetInnerHTML`, `innerHTML`, `eval` or `new Function` anywhere (enforced by lint and an architecture test) |
| Host runtime | Prototype pollution through paths or JSON keys | Paths reject `__proto__`, `prototype` and `constructor`; resolution reads own properties only; unknown keys (including JSON `__proto__`) fail validation; validated templates are rebuilt from known keys only |
| Availability | Huge templates, deep nesting, long strings, large images, unbounded batches | Configurable limits checked before expensive work (below); bounded caches; pull-based batches; per-document label cap |
| Data integrity | Wrong or misleading barcodes | Strict symbology validation; check digits verified, never "repaired"; missing or invalid data never produces a symbol |
| Printing | Script running in the print frame | Print iframe sandboxed with `allow-same-origin allow-modals` only (no scripts) and filled through `srcdoc`; the preview iframe is fully sandboxed (`sandbox=""`) |
| Styles | CSS injection through theme tokens | Theme values containing `; { } < >` are dropped; colours in templates must match strict hex patterns |

Out of scope (the host's responsibility): authentication, authorization, tenant isolation,
server-side validation of saved templates (use `parseTemplate` on the server), transport
security, CSP configuration, and auditing who printed what.

## Default limits (`DEFAULT_LIMITS`, override with `limits`)

| Limit | Default |
| --- | --- |
| Template JSON size (`parseTemplate`) | 5 MiB, checked before parsing |
| Elements per template | 1,000 |
| Canvas side | 1–2,000 mm |
| Element overhang beyond the canvas | 1 × canvas size |
| Ids / names / descriptions | 128 / 200 / 2,000 characters |
| Static text, prefix, suffix, fallback | 2,000 characters |
| Resolved (bound) value | 4,096 characters |
| Condition depth / nodes | 4 / 64 |
| Binding path | 8 segments, 256 characters |
| Image data URI | 512 KiB decoded |
| Font size | 400 pt |
| Code 128 data / QR data | 80 characters / 1,024 UTF-8 bytes |
| Batch records (`generateLabels`) | 100,000 |
| Labels per print document | 2,000 |
| localStorage adapter | 2 MiB, 200 templates |

## Image policy

* Default: only `data:image/(png|jpeg|gif|webp);base64,…` up to 512 KiB, and the first bytes
  must match the declared type (magic-number check, `IMAGE_CONTENT_MISMATCH`).
* **SVG images are always rejected**, because they can contain script.
* Remote URLs are rejected unless the host passes `imagePolicy.allowUrl(url)`; even then only
  `https:` is accepted, without embedded credentials. The check runs at validation **and** at
  render time.
* Images are emitted as `<image href>` in SVG and never inlined as markup.

## Safe rendering

* Allowed SVG tags: `svg g rect path line text tspan image clipPath defs title`. Each tag
  has a fixed attribute allowlist with value rules: id patterns, `url(#id)` clip references,
  `href` limited to safe image schemes, and no `< > &` or control characters in generic
  attributes. Event handler attributes cannot be expressed.
* Text content is escaped, and XML-illegal control characters are removed.
* Server-rendered SVG (Node) should be served with `Content-Type: image/svg+xml` and a
  restrictive `Content-Security-Policy` (see `examples/nextjs-app/app/api/labels`).

## Tests

`tests/security/` contains adversarial fixtures: JSON `__proto__`/`constructor` payloads,
poisoned records, script/HTML/CDATA/bidi injection in text, prefixes, fallbacks, titles and
barcode HRI; CSS-breakout colours; `javascript:`, `data:text/html`, SVG data URIs, credential
URLs and `file:` images; 5 MiB JSON (rejected in under 50 ms); 100,000-deep nesting; oversized
strings and barcode payloads; extreme numbers; getters; and throwing host callbacks.

## Dependency hygiene

* Production dependency closure: **qrcode-generator 2.0.4 (MIT)** only. React is a peer.
* `npm run check:licenses` fails if any production dependency uses a license outside
  MIT/ISC/BSD/Apache-2.0/0BSD.
* `npm run audit:prod` (`npm audit --omit=dev`): 0 vulnerabilities on 2026-10-20 (the full dev
  tree also reports 0).
* A clean audit is **not** a security guarantee. The protections above come from design and
  tests.

## Reporting

Report vulnerabilities privately to the repository owner. Do not open public issues for
security problems.
