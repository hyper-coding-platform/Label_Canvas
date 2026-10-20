# Data Binding

Templates bind to **records** that the host ERP supplies at render time. The SDK has no
knowledge of your database: you map your data to plain objects and describe the available
fields in a `DataSchema` for the editor.

```ts
const record = {
  store: { name: "Lakshmi Silks" },
  product: { name: "Cotton Kurta", sku: "KRT-IND-042-M", barcode: "260042130115" },
  variant: { size: "M", color: "Indigo" },
  pricing: { mrp: 1299, offerPrice: 999 },
  inventory: { batchNo: "B2026-10" },
};
```

## Field schema (editor)

```ts
const schema: DataSchema = {
  fields: [
    { path: "product.name", label: "Product name", group: "Product", required: true, example: "Cotton Kurta" },
    { path: "pricing.mrp", label: "MRP", group: "Pricing", type: "number", example: 1299 },
  ],
};
<LabelEditor dataSchema={schema} sampleData={[record1, record2]} … />
```

* The **field picker** lists `group › label (path)`. Users can also type a custom path.
* `sampleData` (one record or an array) drives the live preview. Without it, a record is
  built from `example` values (`sampleRecordFromSchema`).
* `inferDataSchema(record)` discovers bindable fields from a real ERP record. Labels are
  humanized from keys; refine them before showing them to users.
* `validateTemplateData(template, record, { schema })` reports bindings to undeclared fields
  and missing required schema fields.

## Paths

A path is a list of segments joined by dots: identifiers (`[A-Za-z_$][A-Za-z0-9_$-]*`, ≤ 64
characters) or array indices (`0`, `1`, …). At most 8 segments and 256 characters. Examples:
`product.sku`, `variants.0.size`, `$meta.batch-no`.

Safety rules (enforced at validation **and** at resolution):

* `__proto__`, `prototype` and `constructor` are rejected anywhere in a path.
* Only **own** properties are read; inherited properties (`toString`, …) are never resolved.
* Numeric segments index arrays only; name segments never index arrays.
* Functions are never called; a function value is treated as missing.
* There is no `eval`, `Function`, template-string evaluation or expression language anywhere.

## Missing values

A value is **missing** when the path does not exist, or the value is `undefined`, `null` or
`""`. The values `0` and `false` are present.

| Situation | Text element | Barcode / QR element |
| --- | --- | --- |
| Present | `prefix + formatted value + suffix` | Encoded after symbology validation. |
| Missing, `fallback` set | The fallback text (no prefix or suffix). | The fallback is encoded (and must be valid for the symbology). |
| Missing, `required: true` | Error `FIELD_REQUIRED_MISSING`; nothing is drawn. | n/a |
| Missing (default) | Nothing is drawn; no issue. | Error `BARCODE_VALUE_MISSING`, **no symbol is generated**. With `whenMissing: "hide"`, nothing is drawn and no issue is raised. |
| Not a scalar (object or array) | Error `FIELD_VALUE_INVALID`. | Error `BARCODE_VALUE_INVALID`. |
| Invalid for the symbology | n/a | Error `BARCODE_VALUE_INVALID`, **no symbol is generated**. |

A record with any error is marked `ok: false`. Bulk generation and printing then skip or
fail it according to your policy. The SDK never produces a plausible-looking barcode for
absent or invalid data. In the editor (`mode: "design"`), such elements are drawn as dashed
red placeholders labelled "No barcode data", which are clearly not symbols.

## Formatting

Formatting is **locale-independent by default**. Output is identical on every server and
browser.

| Format | Without `locale` | With `locale` (uses `Intl`) |
| --- | --- | --- |
| `{ type: "number", decimals: 2, grouping: true }` | `1,299.00` | `en-IN` → `1,299.00`; `de-DE` → `1.299,00` |
| `{ type: "currency", currency: "INR" }` | `INR 1,299.00` | `display: "symbol"` → `₹1,299.00` |
| `{ type: "currency", currency: "INR", display: "none" }` | `1,299.00` | localized number only |
| `{ type: "date", pattern: "DD MMM YYYY" }` | `07 Mar 2026` (UTC) | n/a: patterns are locale-independent (English month names) |
| `{ type: "text", case: "upper", maxLength: 20 }` | Uppercase, truncated by code point | n/a |

* Numbers accept JavaScript numbers, bigint and numeric strings (`"999.50"`).
* Dates accept `YYYY-MM-DD` (interpreted as UTC midnight), full ISO 8601 timestamps with a
  time zone, epoch milliseconds or `Date`. Impossible dates such as `2026-02-30` are
  rejected, never rolled over.
* `timeZone: "local"` uses the runtime's time zone, so output then depends on the machine.
* `Intl` output can differ slightly between ICU versions (for example in spacing characters).
  Use the locale-independent default when byte-for-byte reproducibility matters.
* A symbol such as `₹` can also be added with `prefix: "₹"` and a plain number format, which
  is deterministic.

## Conditions

Declarative conditions control element visibility per record:

```json
{ "field": "pricing.offerPrice", "op": "exists" }
{ "all": [ { "field": "stock.qty", "op": "gt", "value": 0 }, { "not": { "field": "product.discontinued", "op": "eq", "value": true } } ] }
```

| Operator | Meaning |
| --- | --- |
| `exists` / `missing` | The value is (not) `undefined` or `null`. |
| `empty` / `notEmpty` | The value is missing, `""` or an empty array (or the opposite). |
| `eq` / `neq` | Numeric comparison when both sides are numeric, otherwise string comparison. |
| `gt` `gte` `lt` `lte` | Numeric only; non-numeric or missing values make it false. |
| `contains` / `startsWith` | Case-sensitive string tests. |
| `all` / `any` / `not` | Combinators: at most 4 levels deep and 64 nodes. |

## Escaping

Bound text reaches output only through escaping: the SVG serializer escapes `& < > " '` and
strips XML-illegal control characters, and React renders text nodes. Bound values can never
become markup, attributes or URLs.
