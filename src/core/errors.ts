/**
 * Structured errors. Every error thrown by the SDK is a `LabelStudioError`
 * with a stable machine-readable `code`; consumers should branch on `code`,
 * never on `message`.
 */

export type ErrorCode =
  | "TEMPLATE_INVALID"
  | "TEMPLATE_PARSE_FAILED"
  | "SCHEMA_VERSION_UNSUPPORTED"
  | "MIGRATION_FAILED"
  | "BINDING_PATH_INVALID"
  | "BARCODE_VALUE_INVALID"
  | "BARCODE_FORMAT_UNSUPPORTED"
  | "RENDER_FAILED"
  | "LIMIT_EXCEEDED"
  | "TEMPLATE_CONFLICT"
  | "TEMPLATE_NOT_FOUND"
  | "STORAGE_FAILED"
  | "STORAGE_QUOTA_EXCEEDED"
  | "PRINT_FAILED"
  | "PRINT_UNAVAILABLE"
  | "ABORTED"
  | "BATCH_RECORD_FAILED"
  | "INVALID_ARGUMENT";

/** A single validation or render finding. */
export interface Issue {
  /** Stable issue code, e.g. `ELEMENT_ID_DUPLICATE`. */
  readonly code: string;
  readonly severity: "error" | "warning";
  /** JSON-pointer-like location, e.g. `/elements/3/width`. Empty string = root. */
  readonly path: string;
  readonly message: string;
  /** Element id the issue relates to, when applicable. */
  readonly elementId?: string;
}

export class LabelStudioError extends Error {
  readonly code: ErrorCode;
  readonly details: Readonly<Record<string, unknown>>;

  constructor(code: ErrorCode, message: string, details: Record<string, unknown> = {}, options?: { cause?: unknown }) {
    super(message, options?.cause === undefined ? undefined : { cause: options.cause });
    this.name = "LabelStudioError";
    this.code = code;
    this.details = Object.freeze({ ...details });
  }
}

export class TemplateValidationError extends LabelStudioError {
  readonly issues: readonly Issue[];
  constructor(issues: readonly Issue[], message = summarizeIssues(issues)) {
    super("TEMPLATE_INVALID", message, { issueCount: issues.length });
    this.name = "TemplateValidationError";
    this.issues = Object.freeze([...issues]);
  }
}

export class BarcodeValueError extends LabelStudioError {
  readonly format: string;
  readonly reason: string;
  constructor(format: string, reason: string, message: string) {
    super("BARCODE_VALUE_INVALID", message, { format, reason });
    this.name = "BarcodeValueError";
    this.format = format;
    this.reason = reason;
  }
}

export class TemplateConflictError extends LabelStudioError {
  readonly expectedRevision: number | null;
  readonly actualRevision: number | null;
  constructor(id: string, expectedRevision: number | null, actualRevision: number | null) {
    super(
      "TEMPLATE_CONFLICT",
      `Template "${id}" was modified elsewhere (expected revision ${String(expectedRevision)}, found ${String(actualRevision)}).`,
      { id, expectedRevision, actualRevision },
    );
    this.name = "TemplateConflictError";
    this.expectedRevision = expectedRevision;
    this.actualRevision = actualRevision;
  }
}

export class AbortError extends LabelStudioError {
  constructor(message = "The operation was aborted.", cause?: unknown) {
    super("ABORTED", message, {}, { cause });
    this.name = "AbortError";
  }
}

export function isLabelStudioError(value: unknown): value is LabelStudioError {
  return value instanceof LabelStudioError;
}

export function summarizeIssues(issues: readonly Issue[]): string {
  const errors = issues.filter((i) => i.severity === "error");
  if (errors.length === 0) return "No validation errors.";
  const first = errors[0]!;
  const more = errors.length > 1 ? ` (+${errors.length - 1} more)` : "";
  return `${first.path || "/"}: ${first.message}${more}`;
}

/** Throws `AbortError` if the signal is aborted. */
export function throwIfAborted(signal: AbortSignal | undefined): void {
  if (signal?.aborted) throw new AbortError(undefined, signal.reason);
}
