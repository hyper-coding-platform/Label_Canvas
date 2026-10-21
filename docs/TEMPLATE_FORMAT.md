# Template Format (schema version 1)

A label template is a JSON document. It describes **design only**. Data comes from the host
ERP at render time, and generated output (SVG, print pages, barcode images) is never stored
in the template.

## Complete example

```json
{
  "schemaVersion": 1,
  "id": "textile-hang-tag",
  "name": "Textile hang tag",
  "category": "textile",
  "canvas": { "width": 50, "height": 75, "unit": "mm", "printerDpi": 203 },
  "elements": [
    {
      "id": "store", "type": "text", "x": 3, "y": 3, "width": 44, "height": 6,
      "content": { "kind": "field", "path": "store.name", "fallback": "STORE" },
      "style": { "fontFamily": "sans", "fontSize": 11, "fontWeight": "bold", "align": "center" }
    },
    { "id": "rule", "type": "line", "x": 3, "y": 10, "width": 44, "height": 1, "strokeWidth": 0.3 },
    {
      "id": "mrp", "type": "text", "x": 3, "y": 30, "width": 44, "height": 8,
      "content": { "kind": "field", "path": "pricing.mrp", "prefix": "MRP ₹", "required": true,
                   "format": { "type": "number", "decimals": 2, "grouping": true } },
      "style": { "fontFamily": "sans", "fontSize": 13, "fontWeight": "bold", "align": "center" }
    },
    {
      "id": "offer", "type": "text", "x": 3, "y": 38, "width": 44, "height": 5,
      "content": { "kind": "field", "path": "pricing.offerPrice", "prefix": "Offer ₹" },
      "style": { "fontFamily": "sans", "fontSize": 8, "align": "center" },
      "condition": { "field": "pricing.offerPrice", "op": "exists" }
    },
    {
      "id": "barcode", "type": "barcode", "x": 3, "y": 44, "width": 44, "height": 18,
      "format": "code128", "value": { "kind": "field", "path": "product.barcode" }
    }
  ]
}
```

## Coordinate system and units

* The origin is the label's **top-left** corner: +x points right, +y points down.
* All lengths use `canvas.unit`: `mm`, `in` or `px`. `px` is the CSS pixel, exactly 1/96 in.
  Units are never mixed within a template.
* **Exceptions:** `fontSize`, `letterSpacing`, `minFontSize` and barcode `textSize` are in
  **points** (1/72 in), whatever the canvas unit.
* `rotation` is in degrees, clockwise, about the element's box centre, in the range `[0, 360)`.
* `elements` array order is paint order: index 0 is painted first, at the bottom.
* Calculations use double precision. Output is rounded to 4 decimal places in SVG; the editor
  displays 2 decimals for mm/px and 3 for inches. Zooming never changes saved values.

## Top level

| Property | Type | Required | Rules |
| --- | --- | --- | --- |
| `schemaVersion` | `1` | yes | Other values are rejected. Use `parseTemplate` to migrate older versions. |
| `id` | string | yes | `^[A-Za-z0-9][A-Za-z0-9._:-]*$`, ≤ 128 characters. |
| `name` | string | yes | 1–200 characters, no control characters. |
| `description` | string | no | ≤ 2000 characters (newlines allowed). |
| `category` | string | no | 1–64 characters (free form, for example `textile`). |
| `tags` | string[] | no | ≤ 32 tags, each 1–64 characters. |
| `canvas` | object | yes | See below. |
| `elements` | array | yes | ≤ 1000 elements (configurable `maxElements`). |

**Unknown properties are errors** at every level. They are never silently ignored.

## `canvas`

| Property | Type | Rules |
| --- | --- | --- |
| `width`, `height` | number | > 0, finite; between 1 mm and 2000 mm after unit conversion. |
| `unit` | `"mm" \| "in" \| "px"` | required |
| `background` | colour | Default `#ffffff`. |
| `cornerRadius` | number | ≥ 0, ≤ half the shorter side. Preview outline only. |
| `printerDpi` | integer 72–2400 | When set, barcode modules snap to whole printer dots. |

Colours: `#rgb`, `#rgba`, `#rrggbb`, `#rrggbbaa` or `transparent`.

## Common element properties

| Property | Type | Rules |
| --- | --- | --- |
| `id` | string | Same pattern as the template id; unique within the template. |
| `type` | `text \| barcode \| qrcode \| image \| rect \| line \| shape \| drawing` | Unknown types are errors. |
| `name` | string | Layer name shown in the editor. |
| `x`, `y` | number | Finite. |
| `width`, `height` | number | > 0. |
| `rotation` | number | `[0, 360)`. |
| `visible` | boolean | Default true. Hidden elements are neither rendered nor printed. |
| `locked` | boolean | Locked elements can be selected but not moved or resized in the editor. |
| `condition` | Condition | The element renders only when the condition holds for the record ([DATA_BINDING.md](DATA_BINDING.md)). |
| `styleRules` | StyleRule[] | ≤ 16 `{ when: Condition, set: StyleOverride }` rules that change the element's appearance per record ([DATA_BINDING.md](DATA_BINDING.md#conditional-styles)). |

Bounds: an element that extends past the canvas produces the warning `ELEMENT_EXCEEDS_CANVAS`
(it is clipped). One lying entirely outside produces the warning `ELEMENT_OUTSIDE_CANVAS`.
An element further than one canvas width or height beyond the canvas is an error,
`ELEMENT_FAR_OUT_OF_BOUNDS`.

## Element types

**`text`**: `content: ValueSource` (required), `style: TextStyle` (required), `background?`,
`border?: { width, color, radius? }`, `padding?`.

`TextStyle`: `fontFamily` (font id: `sans`, `serif`, `mono`, `condensed` or host-registered;
unknown ids give a warning and fall back to sans), `fontSize` (pt, 0.5–400), `fontWeight`
(`normal`/`bold`), `fontStyle` (`normal`/`italic`), `color`, `align` (`left`/`center`/`right`),
`verticalAlign` (`top`/`middle`/`bottom`), `lineHeight` (0.5–5 × font size, default 1.2),
`letterSpacing` (pt), `overflow` (`clip` default / `shrink` / `ellipsis` / `wrap`),
`maxLines` (for `wrap`), `minFontSize` (pt, for `shrink`, default 4).

**`barcode`**: `format` (`code128`, `gs1-128`, `ean13`, `ean8`, `upca`, `itf14`), `value: ValueSource`,
`showText?` (default true), `textSize?` (pt, default 8), `color?`, `background?`,
`moduleWidth?` (fixed X-dimension in template units; omit to fit the width), `bearer?`
(ITF-14 only: `none`, `frame`, `top-bottom`), `whenMissing?` (`error` default, or `hide`).
Static values are validated against the symbology when the template is validated. See
[BARCODES.md](BARCODES.md).

**`qrcode`**: `value: ValueSource`, `errorCorrection?` (`L`/`M`/`Q`/`H`, default `M`),
`quietZone?` (modules, 0–20, default 4; values below 4 give a warning), `color?`, `background?`,
`whenMissing?`. QR codes are always square, scaled to the shorter side and centred.

**`image`**: `src` (PNG, JPEG, GIF or WebP data URI ≤ 512 KiB whose bytes match the declared
type, or an https URL allowed by the host `ImagePolicy`), `fit?` (`contain` default, `cover`,
`fill`), `alt?`. SVG images are never accepted.

**`rect`**: `fill?`, `stroke?`, `strokeWidth?` (≥ 0), `cornerRadius?`.

**`line`**: `strokeWidth` (required, > 0, ≤ box height), `stroke?`, `dash?` (`solid`,
`dashed`, `dotted`). The line is drawn horizontally through the box's vertical centre; use
`rotation` for other angles.

**`shape`**: `shape` (required: `ellipse`, `triangle`, `diamond`, `pentagon`, `hexagon`,
`octagon`, `star`, `arrow`), `fill?`, `stroke?`, `strokeWidth?` (≥ 0, ≤ half the shorter side;
default 0 = no outline). The outline is stretched to fill the box, inset by half the stroke.

**`drawing`**: a freehand (pencil) stroke. `points` (required: flat `[x0, y0, x1, y1, …]`,
2–2000 points, every coordinate in `[0, 1]` relative to the box inset by half the stroke),
`strokeWidth` (required, > 0, ≤ the shorter side), `stroke?`. It is drawn as a smoothed path
with round caps and joins. Because points are relative, resizing the box scales the drawing.

## Value sources

```json
{ "kind": "static", "value": "Fixed text" }
{ "kind": "field", "path": "product.sku", "prefix": "SKU ", "suffix": "", "fallback": "N/A",
  "required": false, "format": { "type": "text", "case": "upper" } }
```

Formats: `text` (`case`, `maxLength`), `number` (`decimals` 0–6, `grouping`, `locale`),
`currency` (`currency` ISO 4217, `decimals`, `display` `code`/`symbol`/`none`, `locale`; `symbol`
requires `locale`), `date` (`pattern` with tokens `YYYY YY MMMM MMM MM M DD D HH mm`,
`timeZone` `UTC`/`local`). Details are in [DATA_BINDING.md](DATA_BINDING.md).

## Validation issue codes

Errors (the template is rejected): `NOT_OBJECT`, `TYPE_MISMATCH`, `REQUIRED_PROPERTY_MISSING`,
`UNKNOWN_PROPERTY`, `SCHEMA_VERSION_MISSING`, `SCHEMA_VERSION_UNSUPPORTED`, `STRING_INVALID`,
`STRING_EMPTY`, `STRING_CONTROL_CHARACTERS`, `TEXT_TOO_LONG`, `NUMBER_NOT_FINITE`,
`NUMBER_OUT_OF_RANGE`, `NUMBER_NOT_INTEGER`, `ENUM_INVALID`, `COLOR_INVALID`, `UNIT_INVALID`,
`CANVAS_TOO_LARGE`, `CANVAS_TOO_SMALL`, `TOO_MANY_ELEMENTS`, `TOO_MANY_TAGS`,
`ELEMENT_TYPE_UNKNOWN`, `ELEMENT_ID_DUPLICATE`, `ROTATION_INVALID`, `ELEMENT_FAR_OUT_OF_BOUNDS`,
`BINDING_PATH_INVALID`, `BINDING_PATH_FORBIDDEN`, `FORMAT_INVALID`, `LOCALE_INVALID`,
`CONDITION_INVALID`, `CONDITION_TOO_DEEP`, `CONDITION_TOO_COMPLEX`, `TOO_MANY_STYLE_RULES`,
`DRAWING_POINTS_INVALID`,
`BARCODE_FORMAT_UNSUPPORTED`, `BARCODE_VALUE_INVALID`, `IMAGE_SOURCE_INVALID`,
`IMAGE_URL_NOT_ALLOWED`, `IMAGE_TOO_LARGE`, `IMAGE_CONTENT_MISMATCH`, `TEMPLATE_TOO_LARGE`,
`JSON_INVALID`, `MIGRATION_FAILED`.

Warnings (the template stays valid): `ELEMENT_EXCEEDS_CANVAS`, `ELEMENT_OUTSIDE_CANVAS`,
`FONT_UNKNOWN`, `QR_QUIET_ZONE_SMALL`, `BEARER_IGNORED`.

## Migrations and compatibility

* `parseTemplate` runs explicit, ordered migrations from the template's version up to
  `CURRENT_SCHEMA_VERSION`, then validates the result. Each migration converts exactly
  version *n* to *n+1* on a structured clone, and its output must validate.
* Versions newer than the SDK, and versions without a migration path, are rejected with
  `SCHEMA_VERSION_UNSUPPORTED`. They are never reinterpreted as the current version.
* Within a major version of the package, templates saved by an older minor version remain
  valid. A future schema version will ship a tested migration from version 1.
* Store `serializeTemplate(template)` output. Validation produces a canonical key order, so
  serializing a parsed template is a fixed point.
