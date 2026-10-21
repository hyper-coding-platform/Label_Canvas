// Template persistence for the demo (imported only by route handlers, i.e. server code). A real ERP would use its database,
// enforce authentication/authorisation and tenant isolation here.
import { createMemoryTemplateStorage, type TemplateStorage } from "@suriyaprakashm14/erp-label-studio/core";
import { getPresetTemplate } from "@suriyaprakashm14/erp-label-studio/presets";

const globalForStore = globalThis as unknown as { __labelTemplates?: TemplateStorage };

export const templateStore: TemplateStorage =
  globalForStore.__labelTemplates ??
  (globalForStore.__labelTemplates = createMemoryTemplateStorage({
    initial: [getPresetTemplate("textile-hang-tag")!],
  }));
