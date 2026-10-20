import type { CSSProperties } from "react";

/**
 * Editor design tokens. Each token maps to a `--els-*` CSS custom property
 * on the editor root; unspecified tokens fall back to the stylesheet
 * defaults, which in turn inherit the host font. Tokens never affect
 * rendered or printed label output.
 */
export interface EditorTheme {
  readonly colorScheme?: "light" | "dark" | undefined;
  readonly fontFamily?: string | undefined;
  readonly fontSize?: string | undefined;
  readonly colorBackground?: string | undefined;
  readonly colorSurface?: string | undefined;
  readonly colorSurfaceAlt?: string | undefined;
  readonly colorBorder?: string | undefined;
  readonly colorText?: string | undefined;
  readonly colorTextMuted?: string | undefined;
  readonly colorAccent?: string | undefined;
  readonly colorAccentText?: string | undefined;
  readonly colorDanger?: string | undefined;
  readonly colorWarning?: string | undefined;
  readonly colorFocus?: string | undefined;
  readonly colorCanvas?: string | undefined;
  readonly colorSelection?: string | undefined;
  readonly colorGuide?: string | undefined;
  readonly colorGrid?: string | undefined;
  readonly radius?: string | undefined;
  readonly spacing?: string | undefined;
  readonly density?: "compact" | "comfortable" | undefined;
  readonly borderWidth?: string | undefined;
  readonly controlHeight?: string | undefined;
  readonly shadow?: string | undefined;
}

const TOKEN_VARS: Readonly<Record<Exclude<keyof EditorTheme, "colorScheme" | "density">, string>> = {
  fontFamily: "--els-font-family",
  fontSize: "--els-font-size",
  colorBackground: "--els-color-bg",
  colorSurface: "--els-color-surface",
  colorSurfaceAlt: "--els-color-surface-alt",
  colorBorder: "--els-color-border",
  colorText: "--els-color-text",
  colorTextMuted: "--els-color-text-muted",
  colorAccent: "--els-color-accent",
  colorAccentText: "--els-color-accent-text",
  colorDanger: "--els-color-danger",
  colorWarning: "--els-color-warning",
  colorFocus: "--els-color-focus",
  colorCanvas: "--els-color-canvas",
  colorSelection: "--els-color-selection",
  colorGuide: "--els-color-guide",
  colorGrid: "--els-color-grid",
  radius: "--els-radius",
  spacing: "--els-space",
  borderWidth: "--els-border-width",
  controlHeight: "--els-control-height",
  shadow: "--els-shadow",
};

/** CSS custom properties for a theme (apply to any element wrapping the editor). */
export function themeToCssVariables(theme: EditorTheme | undefined): CSSProperties {
  const style: Record<string, string> = {};
  if (!theme) return style;
  for (const [key, cssVar] of Object.entries(TOKEN_VARS)) {
    const value = theme[key as keyof typeof TOKEN_VARS];
    // Values become inline custom properties; reject characters that could break out of a declaration.
    if (typeof value === "string" && value.length <= 200 && !/[;{}<>]/.test(value)) style[cssVar] = value;
  }
  return style as CSSProperties;
}

/** A ready-made dark theme, also used by tests as the "substantially different" theme. */
export const darkTheme: EditorTheme = Object.freeze({
  colorScheme: "dark",
  colorBackground: "#16181d",
  colorSurface: "#1f232b",
  colorSurfaceAlt: "#272c36",
  colorBorder: "#3a4150",
  colorText: "#e8eaf0",
  colorTextMuted: "#a3aab8",
  colorAccent: "#6ea8ff",
  colorAccentText: "#0b1220",
  colorDanger: "#ff7a7a",
  colorWarning: "#f5c25b",
  colorFocus: "#9cc3ff",
  colorCanvas: "#0f1115",
  colorSelection: "#6ea8ff",
  colorGuide: "#ff5fd2",
  colorGrid: "rgba(255,255,255,0.08)",
});
