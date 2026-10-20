import { expect, type Locator, type Page } from "@playwright/test";

export interface TemplateLike {
  canvas: { width: number; height: number; unit: string };
  elements: { id: string; type: string; x: number; y: number; width: number; height: number; visible?: boolean }[];
}

export async function templateJson(page: Page): Promise<TemplateLike> {
  return JSON.parse((await page.getByTestId("template-json").textContent()) ?? "{}") as TemplateLike;
}

export async function element(page: Page, id: string) {
  const t = await templateJson(page);
  const el = t.elements.find((e) => e.id === id);
  if (!el) throw new Error(`element ${id} not found`);
  return el;
}

/** CSS px per mm at the canvas's current zoom. */
export async function pxPerMm(page: Page): Promise<number> {
  const zoom = Number(await page.getByTestId("els-canvas").getAttribute("data-zoom"));
  return (96 / 25.4) * zoom;
}

export async function center(locator: Locator) {
  const b = await locator.boundingBox();
  if (!b) throw new Error("no bounding box");
  return { x: b.x + b.width / 2, y: b.y + b.height / 2 };
}

/** Drag with intermediate moves so pointermove handlers and rAF commits run. */
export async function drag(page: Page, from: { x: number; y: number }, to: { x: number; y: number }, steps = 8) {
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  for (let i = 1; i <= steps; i += 1) {
    await page.mouse.move(from.x + ((to.x - from.x) * i) / steps, from.y + ((to.y - from.y) * i) / steps);
    await page.waitForTimeout(16);
  }
  await page.mouse.up();
}

export async function waitForEditor(page: Page) {
  await expect(page.getByTestId("els-root")).toBeVisible();
  // Fit-to-screen has run once the zoom is not exactly 1 or the label is visible.
  await expect(page.getByTestId("els-overlay")).toBeVisible();
}
