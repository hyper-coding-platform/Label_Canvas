/**
 * @your-org/erp-label-studio/presets
 *
 * Built-in label sizes (retail, hang tags, shelf, shipping, A4 sheets, rolls) and
 * industry templates, plus isolated registries for host-specific presets.
 * Kept out of /core so render-only and server bundles do not ship the catalog.
 * No React, no DOM access at import time.
 */
export { getPresetSizes, getPresetTemplates, getPresetTemplate, createPresetRegistry } from "../core/presets/registry";
export type { PresetRegistry } from "../core/presets/registry";
export type { PresetSize, PresetCategory } from "../core/presets/sizes";
export type { PresetTemplate } from "../core/presets/templates";
