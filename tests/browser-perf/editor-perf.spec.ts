import { mkdirSync, writeFileSync } from "node:fs";
import { expect, test, type Page } from "@playwright/test";

const results: Record<string, unknown> = {};

async function metrics(page: Page) {
  const cdp = await page.context().newCDPSession(page);
  await cdp.send("Performance.enable");
  return async () => {
    const { metrics: m } = await cdp.send("Performance.getMetrics");
    const get = (n: string) => m.find((x) => x.name === n)?.value ?? 0;
    return { script: get("ScriptDuration") * 1000, task: get("TaskDuration") * 1000, layout: get("LayoutDuration") * 1000, style: get("RecalcStyleDuration") * 1000, heapMb: get("JSHeapUsedSize") / 1048576 };
  };
}

for (const n of [100, 500, 1000]) {
  test(`editor with ${n} elements: startup, drag and edit cost`, async ({ page }) => {
    const t0 = Date.now();
    await page.goto(`/?s=perf&n=${n}`);
    await expect(page.locator(".els-canvas__label")).toBeVisible();
    await expect(page.locator("[data-hit-id]")).toHaveCount(n);
    const startupMs = Date.now() - t0;
    const read = await metrics(page);

    // Drag one element through 60 pointer moves; measure main-thread cost per move.
    const hit = page.locator('[data-hit-id="e0"]');
    const box = (await hit.boundingBox())!;
    const sx = box.x + box.width / 2;
    const sy = box.y + box.height / 2;
    await page.mouse.move(sx, sy);
    await page.mouse.down();
    const before = await read();
    for (let i = 1; i <= 60; i += 1) await page.mouse.move(sx + i * 2, sy + i);
    const after = await read();
    await page.mouse.up();
    const perMoveScriptMs = (after.script - before.script) / 60;
    const perMoveTaskMs = (after.task - before.task) / 60;
    const perMoveStyleMs = (after.style - before.style) / 60;
    const perMoveLayoutMs = (after.layout - before.layout) / 60;

    // One committed edit (keyboard nudge) → full re-render of the label.
    await page.getByTestId("els-canvas").focus();
    const e0 = await read();
    await page.keyboard.press("ArrowRight");
    await page.waitForTimeout(50);
    const e1 = await read();
    const editTaskMs = e1.task - e0.task;

    // Hand tool: pan the view through 60 pointer moves (starting over an element). Only the
    // stage transform, overlays and rulers update; the label tree is memoized on zoom, not pan.
    await page.keyboard.press("h");
    await page.mouse.move(sx, sy);
    await page.mouse.down();
    const p0 = await read();
    for (let i = 1; i <= 60; i += 1) await page.mouse.move(sx - i * 3, sy - i * 2);
    const p1 = await read();
    await page.mouse.up();
    const perPanMoveTaskMs = (p1.task - p0.task) / 60;
    const perPanMoveScriptMs = (p1.script - p0.script) / 60;

    results[n] = { startupMs, perMoveScriptMs: +perMoveScriptMs.toFixed(2), perMoveTaskMs: +perMoveTaskMs.toFixed(2), perMoveStyleMs: +perMoveStyleMs.toFixed(2), perMoveLayoutMs: +perMoveLayoutMs.toFixed(2), editTaskMs: +editTaskMs.toFixed(1), perPanMoveScriptMs: +perPanMoveScriptMs.toFixed(2), perPanMoveTaskMs: +perPanMoveTaskMs.toFixed(2), heapMb: +after.heapMb.toFixed(1) };
    console.log(`${n} elements:`, results[n]);
    // Generous ceilings for shared CI; precise numbers are recorded in PERFORMANCE.md.
    expect(perMoveTaskMs).toBeLessThan(n <= 100 ? 16 : 50);
    expect(perPanMoveTaskMs).toBeLessThan(n <= 100 ? 16 : 50);
  });
}

test.afterAll(() => {
  mkdirSync(".bench-results", { recursive: true });
  writeFileSync(".bench-results/editor.json", JSON.stringify({ date: new Date().toISOString(), results }, null, 2));
});
