import { useMemo, type CSSProperties } from "react";
import type { BarcodeAdapter } from "../../core/barcode/types";
import type { BarcodeFormat, LabelTemplate, LengthUnit } from "../../core/schema/types";
import { LabelRenderer, type LabelRendererProps } from "./LabelRenderer";

export interface BarcodePreviewProps {
  readonly format: BarcodeFormat | "qrcode";
  readonly value: string;
  /** Physical size in `unit`. Defaults: 50×20 mm for linear, 25×25 mm for QR. */
  readonly width?: number | undefined;
  readonly height?: number | undefined;
  readonly unit?: LengthUnit | undefined;
  readonly showText?: boolean | undefined;
  readonly errorCorrection?: "L" | "M" | "Q" | "H" | undefined;
  readonly printerDpi?: number | undefined;
  readonly barcodeAdapter?: BarcodeAdapter | undefined;
  readonly className?: string | undefined;
  readonly style?: CSSProperties | undefined;
  readonly size?: LabelRendererProps["size"] | undefined;
  readonly onRender?: LabelRendererProps["onRender"] | undefined;
}

/** Standalone preview of a single barcode or QR code, rendered by the core renderer. */
export function BarcodePreview(props: BarcodePreviewProps) {
  const { format, value, unit = "mm", showText = true, errorCorrection, printerDpi, barcodeAdapter, className, style, size, onRender } = props;
  const width = props.width ?? (format === "qrcode" ? 25 : 50);
  const height = props.height ?? (format === "qrcode" ? 25 : 20);
  const template = useMemo((): LabelTemplate => {
    const box = { id: "symbol", x: 0, y: 0, width, height };
    return {
      schemaVersion: 1,
      id: "barcode-preview",
      name: `${format} ${value}`.slice(0, 200),
      canvas: { width, height, unit, ...(printerDpi ? { printerDpi } : {}) },
      elements: [
        format === "qrcode"
          ? { ...box, type: "qrcode", value: { kind: "field", path: "value" }, ...(errorCorrection ? { errorCorrection } : {}) }
          : { ...box, type: "barcode", format, value: { kind: "field", path: "value" }, showText },
      ],
    };
  }, [format, value, width, height, unit, showText, errorCorrection, printerDpi]);
  const data = useMemo(() => ({ value }), [value]);
  return (
    <LabelRenderer
      template={template}
      data={data}
      className={className}
      style={style}
      {...(size ? { size } : {})}
      {...(barcodeAdapter ? { barcodeAdapter } : {})}
      {...(onRender ? { onRender } : {})}
    />
  );
}
