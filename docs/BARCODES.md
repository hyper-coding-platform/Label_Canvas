# Barcodes and QR Codes

The built-in adapter supports exactly the formats below. Each one is verified by decoding the
package's own rendered SVG with an independent decoder (zxing-cpp via `zxing-wasm`, after
rasterization with resvg): `tests/integration/barcode-encoders-decode.test.ts`,
`render-decode.test.ts` and `presets.test.ts`. **Data Matrix, PDF417, UPC-E, EAN add-ons and
GS1 DataBar are not supported.** Custom `BarcodeAdapter`s can add formats.

| Format | Accepted data | Check digit | HRI text | Quiet zone (modules) | X-dimension guidance |
| --- | --- | --- | --- | --- | --- |
| `code128` | ASCII 0–127, 1–80 characters | Mod-103 symbol check (automatic) | Data as given | 10 + 10 | ≥ 0.19 mm recommended (warning below) |
| `gs1-128` | Bracketed GS1 element strings: `(01)09501101530003(10)LOT42` | GS1 mod-10 verified for GTIN/SSCC/GLN AIs | `(AI)data…` | 10 + 10 | GS1 logistics nominal 0.495 mm; warning below 0.25 mm |
| `ean13` | 12 digits (check digit computed) or 13 digits (check digit verified) | GS1 mod-10 | 13 digits | 11 + 7 | Nominal 0.33 mm; warning below 0.264 mm (80 %) |
| `ean8` | 7 digits or 8 digits (verified) | GS1 mod-10 | 8 digits | 7 + 7 | as EAN-13 |
| `upca` | 11 digits or 12 digits (verified) | GS1 mod-10 | 12 digits | 9 + 9 | as EAN-13 |
| `itf14` | 13 digits or 14 digits (verified) | GS1 mod-10 | 14 digits | 10 + 10 | Warning below 0.264 mm; wide:narrow 2.5 (2.25–3.0) |
| `qrcode` | Any Unicode text, UTF-8 ≤ 1024 bytes (lower at level H) | Reed–Solomon (EC levels L/M/Q/H) | none | 4 (configurable; warning below 4) | Warning below 0.25 mm per module |

A check digit that is supplied but wrong is **rejected, never silently replaced**.

## Code 128

* The encoder chooses code sets A/B/C by dynamic programming, using set C for digit runs.
  Numeric item codes therefore produce much wider bars at the same size: for example, 12
  digits take 6 symbol characters, against 13 for a 13-character alphanumeric SKU.
* SHIFT is not used, so output can occasionally be one symbol character longer than the
  theoretical minimum. Extended characters (FNC4, Latin-1) are not supported and are rejected.
* Code 128 is **not** a GS1 symbol. Use `gs1-128` for Application Identifier data.

## GS1-128

* Input must use bracketed AIs. Each AI is checked against a table of supported AIs:
  `00`, `01`, `02`, `10`, `11`, `12`, `13`, `15`, `16`, `17`, `20`, `21`, `22`, `240`, `241`,
  `250`, `251`, `30`, `37`, `310n`–`316n`, `320n`, `330n`, `390n`, `392n`, `400`, `401`, `402`,
  `403`, `410`–`415`, `420`, `422`, `7003`, `8005`, `8020`, `90`, `91`–`99`. Unknown AIs are
  rejected.
* Validated: lengths (fixed and variable), numeric and character set 82 data, check digits
  (GTIN, SSCC, GLN, GSIN), YYMMDD dates (day `00` allowed), no duplicate AIs, and at most 48
  data characters.
* FNC1 is placed directly after the start character, and after every variable-length element
  except the last. The predefined-length AI prefixes (00–04, 11–20, 31–36, 41) need no
  separator.
* Limitations: `(` and `)` cannot appear in data because they delimit AIs. The SDK validates
  *structure*, not business meaning: it does not check that a GTIN is allocated to you.

## EAN-13, EAN-8 and UPC-A

* The HRI text is printed centred below the bars. The traditional layout with the first digit
  outside the guard bars is **not** used.
* Small labels often **truncate** the bar height. Below half of the nominal height for the
  current X-dimension, the warning `BARCODE_TRUNCATED` is reported, because truncated symbols
  may not scan omnidirectionally at a point of sale. Verify with your scanners.

## ITF-14

* With `printerDpi` set, wide bars snap to whole dots while the wide:narrow ratio is kept
  within 2.25–3.0.
* `bearer: "frame"` or `"top-bottom"` adds bearer bars 2X thick around the symbol. Printing
  directly on corrugated board usually calls for larger bearers; set the element size
  accordingly.

## QR Code

* Numeric and alphanumeric mode are used automatically when the whole value fits those
  character sets; otherwise byte mode with UTF-8. No ECI header is emitted. Mainstream
  decoders detect UTF-8, but some legacy scanners assume ISO-8859-1.
* The symbol version is chosen automatically. Long values produce dense codes, so check
  `BARCODE_MODULE_TOO_SMALL`.

## Geometry rules (renderer)

* **Uniform module scaling only.** The symbol plus its quiet zones is scaled to the element
  width (or uses a fixed `moduleWidth`) and centred. Bars are never stretched non-uniformly
  and quiet zones are always reserved.
* With a fixed `moduleWidth` that does not fit, the result is the error `BARCODE_DOES_NOT_FIT`;
  the symbol is never squeezed.
* With `canvas.printerDpi`, the X-dimension snaps **down** to whole printer dots so every bar
  edge lands on a dot boundary. If that falls below one dot, the result is the error
  `BARCODE_TOO_SMALL_FOR_PRINTER`. Snapping can reduce the symbol width noticeably at
  203 dpi (8 dots/mm): plan barcode widths in multiples of the module count.
* An element too short for the bars plus HRI text gives the error `BARCODE_TOO_SHORT`.
* Output is vector (`<path>`, `shape-rendering="crispEdges"`).

## Scanner compatibility

Automated decoding proves the **symbol structure** is correct. It does **not** prove that a
printed label scans on your hardware: print quality, contrast, media, X-dimension and scanner
type all matter. Before claiming hardware compatibility, run the physical checklist in
[PRINTING.md](PRINTING.md#physical-validation-checklist) with your printers and scanners,
ideally including an ISO/IEC 15416 grade from a barcode verifier for retail symbols.
