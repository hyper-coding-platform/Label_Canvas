import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import { readBarcodes } from "zxing-wasm/reader";
import { center, drag, element, pxPerMm, templateJson, waitForEditor } from "./helpers";

test.beforeEach(async ({ page }) => {
  await page.goto("/?s=bare");
  await page.evaluate(() => localStorage.clear());
});

test.describe("editing workflows", () => {
  test("creates elements from the toolbar", async ({ page }) => {
    await page.goto("/?s=editor");
    await waitForEditor(page);
    const before = (await templateJson(page)).elements.length;
    await page.getByRole("button", { name: "Add text" }).click();
    await page.getByRole("button", { name: "Add QR code" }).click();
    await page.getByRole("button", { name: "Add rectangle" }).click();
    const t = await templateJson(page);
    expect(t.elements.length).toBe(before + 3);
    expect(t.elements.slice(-3).map((e) => e.type)).toEqual(["text", "qrcode", "rect"]);
    await expect(page.getByRole("listbox", { name: "Layers" }).getByRole("option")).toHaveCount(before + 3);
  });

  test("drags an element; geometry moves by the pointer delta (snapped to the 1 mm grid)", async ({ page }) => {
    await page.goto("/?s=editor");
    await waitForEditor(page);
    const before = await element(page, "barcode");
    const k = await pxPerMm(page);
    const from = await center(page.locator('[data-hit-id="barcode"]'));
    await drag(page, from, { x: from.x - 1.2 * k, y: from.y + 5.2 * k });
    await expect.poll(async () => (await element(page, "barcode")).y).not.toBe(before.y);
    const after = await element(page, "barcode");
    expect(after.y - before.y).toBeGreaterThanOrEqual(4);
    expect(after.y - before.y).toBeLessThanOrEqual(6.5);
    expect(after.width).toBe(before.width);
    // One drag = one history entry.
    await page.getByRole("button", { name: "Undo" }).click();
    expect((await element(page, "barcode")).y).toBe(before.y);
  });

  test("resizes with the south-east handle", async ({ page }) => {
    await page.goto("/?s=editor");
    await waitForEditor(page);
    await page.getByTestId("els-layer-mrp").click();
    const before = await element(page, "mrp");
    const k = await pxPerMm(page);
    const handle = await center(page.getByTestId("els-handle-se"));
    await drag(page, handle, { x: handle.x - 10 * k, y: handle.y + 4 * k });
    await expect.poll(async () => (await element(page, "mrp")).height).toBeGreaterThan(before.height);
    const after = await element(page, "mrp");
    expect(after.width).toBeLessThan(before.width);
    expect(after.x).toBe(before.x);
    expect(after.y).toBe(before.y);
  });

  test("edits X, Y, width and height numerically and reflects them on the canvas", async ({ page }) => {
    await page.goto("/?s=editor");
    await waitForEditor(page);
    await page.getByTestId("els-layer-size").click();
    for (const [label, value] of [["X", "5"], ["Y", "24.5"], ["Width", "18"], ["Height", "5"]] as const) {
      const input = page.getByTestId("els-properties-element").getByLabel(label, { exact: true });
      await input.fill(value);
      await input.press("Enter");
    }
    const el = await element(page, "size");
    expect([el.x, el.y, el.width, el.height]).toEqual([5, 24.5, 18, 5]);
    const k = await pxPerMm(page);
    const box = (await page.locator('[data-hit-id="size"]').boundingBox())!;
    expect(box.width).toBeCloseTo(18 * k, 0);
  });

  test("rejects invalid numeric input and keeps the previous value", async ({ page }) => {
    await page.goto("/?s=editor");
    await waitForEditor(page);
    await page.getByTestId("els-layer-size").click();
    const w = page.getByTestId("els-properties-element").getByLabel("Width", { exact: true });
    await w.fill("abc");
    await w.press("Enter");
    await expect(w).toHaveValue("20");
    await w.fill("0");
    await w.press("Enter");
    expect((await element(page, "size")).width).toBe(20);
  });

  test("undo and redo with keyboard shortcuts", async ({ page }) => {
    await page.goto("/?s=editor");
    await waitForEditor(page);
    await page.getByTestId("els-layer-store").click();
    await page.getByTestId("els-canvas").focus();
    await page.keyboard.press("Shift+ArrowRight");
    expect((await element(page, "store")).x).toBe(13);
    await page.keyboard.press("ControlOrMeta+z");
    expect((await element(page, "store")).x).toBe(3);
    await page.keyboard.press("ControlOrMeta+Shift+z");
    expect((await element(page, "store")).x).toBe(13);
  });

  test("saves, reloads the page and restores the saved template", async ({ page }) => {
    await page.goto("/?s=editor");
    await waitForEditor(page);
    await page.getByRole("button", { name: "Add line" }).click();
    const count = (await templateJson(page)).elements.length;
    await page.getByRole("button", { name: "Save" }).click();
    await expect(page.getByTestId("els-save-status")).toHaveText("All changes saved");
    await page.reload();
    await waitForEditor(page);
    expect((await templateJson(page)).elements.length).toBe(count);
  });

  test("shows save failures and keeps changes", async ({ page }) => {
    await page.goto("/?s=editor&failSave=1");
    await waitForEditor(page);
    await page.getByRole("button", { name: "Add line" }).click();
    await page.getByRole("button", { name: "Save" }).click();
    await expect(page.getByTestId("els-save-status")).toHaveText(/Save failed: Server unavailable/);
    await expect(page.getByRole("button", { name: "Save" })).toBeEnabled();
  });
});

test.describe("data and barcodes", () => {
  test("updates the preview when the sample record changes and marks missing barcode data", async ({ page }) => {
    await page.goto("/?s=editor");
    await waitForEditor(page);
    const canvas = page.getByTestId("els-canvas");
    await expect(canvas).toContainText("Cotton Kurta");
    await page.getByLabel("Sample record").selectOption("1");
    await expect(canvas).toContainText("Linen Shirt");
    // Record 2 has no SKU: a marked placeholder, never a barcode.
    await expect(canvas).toContainText("No barcode data");
    await expect(page.locator('[data-element-id="barcode"] [data-placeholder="true"]')).toHaveCount(1);
  });

  test("the on-screen barcode decodes with an independent decoder", async ({ browser }) => {
    // At fit-to-screen zoom a module is ~1.4 CSS px; capture at 3x device pixels so the
    // screenshot has enough resolution (the on-screen preview is not meant for scanning).
    const context = await browser.newContext({ deviceScaleFactor: 3, viewport: { width: 1280, height: 900 } });
    const page = await context.newPage();
    await page.goto("/?s=editor");
    await waitForEditor(page);
    const label = page.locator(".els-canvas__label");
    const png = await label.screenshot();
    const results = await readBarcodes(new Uint8Array(png), { formats: ["Code128"], tryHarder: true });
    expect(results[0]?.text).toBe("KRT-IND-042-M");
    await context.close();
  });

  test("print action reaches the host when it supplies onPrint", async ({ page }) => {
    await page.goto("/?s=editor&hostPrint=1");
    await waitForEditor(page);
    await page.getByRole("button", { name: "Print preview" }).click();
    await expect(page.getByTestId("printed")).toHaveText("1");
  });
});

test.describe("keyboard and accessibility", () => {
  test("keyboard-only: toolbar arrows, add, layers selection, delete", async ({ page }) => {
    await page.goto("/?s=editor");
    await waitForEditor(page);
    const before = (await templateJson(page)).elements.length;
    await page.getByRole("button", { name: "Add text" }).focus();
    await page.keyboard.press("ArrowRight");
    await expect(page.getByRole("button", { name: "Add barcode" })).toBeFocused();
    await page.keyboard.press("Enter");
    expect((await templateJson(page)).elements.length).toBe(before + 1);
    const list = page.getByRole("listbox", { name: "Layers" });
    await list.focus();
    await page.keyboard.press("Home");
    await expect(list.getByRole("option", { selected: true })).toHaveCount(1);
    await page.keyboard.press("Delete");
    expect((await templateJson(page)).elements.length).toBe(before);
  });

  test("has no serious or critical axe violations (including colour contrast)", async ({ page }) => {
    await page.goto("/?s=editor");
    await waitForEditor(page);
    await page.getByTestId("els-layer-barcode").click();
    const results = await new AxeBuilder({ page }).include('[data-testid="els-root"]').analyze();
    const serious = results.violations.filter((v) => v.impact === "serious" || v.impact === "critical");
    expect(serious.map((v) => `${v.id}: ${v.nodes.slice(0, 3).map((n) => n.target.join(" ")).join(" | ")}`)).toEqual([]);
  });

  test("invalid templates show an accessible error", async ({ page }) => {
    await page.goto("/?s=invalid");
    await expect(page.getByRole("alert")).toContainText("cannot be opened");
  });
});

test.describe("host integration", () => {
  const probe = async (page: Page) =>
    page.evaluate(() => {
      const pick = (el: Element | null) => {
        if (!el) return null;
        const cs = getComputedStyle(el);
        return { font: cs.fontFamily, size: cs.fontSize, bg: cs.backgroundColor, color: cs.color, w: Math.round(el.getBoundingClientRect().width), h: Math.round(el.getBoundingClientRect().height) };
      };
      return {
        html: pick(document.documentElement),
        body: pick(document.body),
        navbar: pick(document.querySelector('[data-testid="host-navbar"]')),
        sidebar: pick(document.querySelector('[data-testid="host-sidebar"]')),
        link: pick(document.querySelector(".erp-sidebar a")),
        h1: pick(document.querySelector(".erp-navbar h1")),
        // No portals or injected nodes outside the host's React root.
        bodyChildren: Array.from(document.body.children).map((c) => c.tagName + (c.id ? "#" + c.id : "")),
        headStyles: document.head.querySelectorAll("style:not([data-vite-dev-id])").length,
      };
    });

  test("the host shell (navbar, sidebar, typography) is unchanged by the editor", async ({ page }) => {
    await page.goto("/?s=bare");
    const bare = await probe(page);
    await page.goto("/?s=editor");
    await waitForEditor(page);
    expect(await probe(page)).toEqual(bare);
    // The editor renders inside the host content area only.
    await expect(page.getByTestId("host-content").getByTestId("els-root")).toBeVisible();
  });

  test("every stylesheet rule from the package is scoped to the editor", async ({ page }) => {
    await page.goto("/?s=editor");
    await waitForEditor(page);
    const unscoped = await page.evaluate(() => {
      const bad: string[] = [];
      const visit = (rules: CSSRuleList) => {
        for (const r of Array.from(rules)) {
          if (r instanceof CSSStyleRule) {
            const fromPackage = r.selectorText.includes(".els-");
            if (fromPackage && !r.selectorText.split(",").every((s) => /\.els-root|\.els-preview/.test(s))) bad.push(r.selectorText);
          } else if ("cssRules" in r) visit((r as CSSGroupingRule).cssRules);
        }
      };
      for (const sheet of Array.from(document.styleSheets)) {
        try {
          visit(sheet.cssRules);
        } catch {
          /* cross-origin sheets are not ours */
        }
      }
      return bad;
    });
    expect(unscoped).toEqual([]);
  });

  test("small viewport: no horizontal page scroll, canvas and panels usable", async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 800 });
    await page.goto("/?s=editor");
    await waitForEditor(page);
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    expect(overflow).toBeLessThanOrEqual(0);
    const canvas = await page.getByTestId("els-canvas").boundingBox();
    expect(canvas!.width).toBeGreaterThan(200);
    expect(canvas!.height).toBeGreaterThan(200);
    await page.getByRole("button", { name: "Add text" }).click();
    await expect(page.getByTestId("els-properties-element")).toBeVisible();
  });

  test("custom theme and replaced components (different UI kit) still edit correctly", async ({ page }) => {
    await page.goto("/?s=themed");
    await waitForEditor(page);
    const add = page.getByRole("button", { name: "Add barcode" });
    await expect(add).toHaveAttribute("data-kit", "acme");
    const before = (await templateJson(page)).elements.length;
    await add.click();
    expect((await templateJson(page)).elements.length).toBe(before + 1);
    const bg = await page.getByTestId("els-root").evaluate((el) => getComputedStyle(el).backgroundColor);
    expect(bg).toBe("rgb(22, 24, 29)");
    const font = await page.getByTestId("els-root").evaluate((el) => getComputedStyle(el).fontFamily);
    expect(font).toContain("Verdana");
    // Layout config: toolbar at bottom, layers on the right.
    const toolbar = (await page.getByRole("toolbar").boundingBox())!;
    const canvas = (await page.getByTestId("els-canvas").boundingBox())!;
    expect(toolbar.y).toBeGreaterThan(canvas.y);
    const layers = (await page.getByTestId("els-panel-layers").boundingBox())!;
    expect(layers.x).toBeGreaterThan(canvas.x);
  });

  test("headless API works without the default editor UI", async ({ page }) => {
    await page.goto("/?s=headless");
    await page.getByRole("button", { name: "Add barcode" }).click();
    await expect(page.getByTestId("headless-count")).toHaveText("1");
    await page.getByRole("button", { name: "Make invalid" }).click();
    await expect(page.getByTestId("headless-error")).not.toHaveText("");
    await expect(page.getByTestId("headless-count")).toHaveText("1");
    await expect(page.locator(".els-root")).toHaveCount(0);
    await expect(page.locator("svg.els-preview")).toHaveCount(1);
  });

  test("renderer-only pages do not load the editor bundle", async ({ page }) => {
    const requested: string[] = [];
    page.on("request", (r) => requested.push(r.url()));
    await page.goto("/renderer.html");
    await expect(page.locator("svg.els-preview")).toHaveCount(2);
    expect(requested.some((u) => /\/dist\/index\.js/.test(u))).toBe(false);
  });

  test("repeated mount/unmount does not leak window listeners", async ({ page, browserName }) => {
    test.skip(browserName !== "chromium", "Listener inspection uses the Chrome DevTools Protocol.");
    await page.goto("/?s=mountloop");
    await waitForEditor(page);
    const cdp = await page.context().newCDPSession(page);
    const count = async () => {
      const { result } = await cdp.send("Runtime.evaluate", { expression: "window" });
      const { listeners } = await cdp.send("DOMDebugger.getEventListeners", { objectId: result.objectId! });
      return listeners.length;
    };
    const toggle = page.getByTestId("toggle");
    await toggle.click();
    await toggle.click();
    await waitForEditor(page);
    const baseline = await count();
    for (let i = 0; i < 20; i += 1) {
      await toggle.click();
      await expect(page.getByTestId("els-root")).toHaveCount(0);
      await toggle.click();
      await expect(page.getByTestId("els-root")).toHaveCount(1);
    }
    expect(await count()).toBe(baseline);
  });
});

test.describe("viewport and multi-selection", () => {
  test("zoom buttons, ctrl+wheel and fit-to-screen change only the view, never the template", async ({ page }) => {
    await page.goto("/?s=editor");
    await waitForEditor(page);
    const before = JSON.stringify(await templateJson(page));
    const canvas = page.getByTestId("els-canvas");
    const z0 = Number(await canvas.getAttribute("data-zoom"));
    await page.getByRole("button", { name: "Zoom in" }).click();
    const z1 = Number(await canvas.getAttribute("data-zoom"));
    expect(z1).toBeCloseTo(z0 * 1.25, 6);
    const c = await center(canvas);
    await page.mouse.move(c.x, c.y);
    await page.keyboard.down("Control");
    await page.mouse.wheel(0, -300);
    await page.keyboard.up("Control");
    await expect.poll(async () => Number(await canvas.getAttribute("data-zoom"))).toBeGreaterThan(z1);
    await page.getByRole("button", { name: "Fit to screen" }).click();
    expect(Number(await canvas.getAttribute("data-zoom"))).toBeCloseTo(z0, 6);
    expect(JSON.stringify(await templateJson(page))).toBe(before);
  });

  test("shift-click multi-select, group drag and align", async ({ page }) => {
    await page.goto("/?s=editor");
    await waitForEditor(page);
    await page.locator('[data-hit-id="size"]').click();
    await page.locator('[data-hit-id="mrp"]').click({ modifiers: ["Shift"] });
    await expect(page.getByTestId("els-selection-size")).toBeVisible();
    await expect(page.getByTestId("els-selection-mrp")).toBeVisible();
    await expect(page.getByText("2 elements selected")).toBeVisible();
    const [s0, m0] = [await element(page, "size"), await element(page, "mrp")];
    const k = await pxPerMm(page);
    const from = await center(page.locator('[data-hit-id="mrp"]'));
    await drag(page, from, { x: from.x, y: from.y + 3 * k });
    await expect.poll(async () => (await element(page, "mrp")).y).not.toBe(m0.y);
    const [s1, m1] = [await element(page, "size"), await element(page, "mrp")];
    expect(s1.y - s0.y).toBeCloseTo(m1.y - m0.y, 6); // moved together
    await page.getByRole("group", { name: "Align selection" }).getByRole("button", { name: "Right" }).click();
    const [s2, m2] = [await element(page, "size"), await element(page, "mrp")];
    expect(s2.x + s2.width).toBeCloseTo(m2.x + m2.width, 6);
  });

  test("marquee selection selects intersecting elements", async ({ page }) => {
    await page.goto("/?s=editor");
    await waitForEditor(page);
    const label = (await page.locator(".els-canvas__label").boundingBox())!;
    const k = await pxPerMm(page);
    // From outside the label (left of it) across the top 11 mm: store + rule.
    await drag(page, { x: label.x - 8, y: label.y + 1 * k }, { x: label.x + 30 * k, y: label.y + 10.6 * k });
    await expect(page.getByText("2 elements selected")).toBeVisible();
  });
});

test.describe("conditional style, shapes and pencil", () => {
  test("a style rule highlights the size that matches the sample record", async ({ page }) => {
    await page.goto("/?s=editor");
    await waitForEditor(page);
    await page.getByTestId("els-layer-size").click();
    await page.getByTestId("els-add-style-rule").click();
    const rule = page.getByTestId("els-style-rule-0");
    await rule.getByLabel("Field").selectOption("variant.size");
    await rule.getByLabel("Value").fill("M");
    await rule.getByLabel("Value").press("Enter");
    const group = page.locator('.els-canvas__label g[data-element-id="size"]');
    // Record 1 has size M: black box, white text.
    await expect(group.locator('rect[fill="#000000"]')).toHaveCount(1);
    await expect(group.locator("text")).toHaveAttribute("fill", "#ffffff");
    // Record 2 has size XL: no highlight.
    // Click empty canvas space (outside the label) to deselect and show the template settings.
    await page.getByTestId("els-canvas").click({ position: { x: 4, y: 4 } });
    await page.getByLabel("Sample record").selectOption("1");
    await expect(group.locator('rect[fill="#000000"]')).toHaveCount(0);
    await expect(group.locator("text")).toHaveAttribute("fill", "#000000");
  });

  test("adds a shape, and the pencil draws a freehand stroke until Escape", async ({ page }) => {
    await page.goto("/?s=editor");
    await waitForEditor(page);
    const before = (await templateJson(page)).elements.length;
    await page.getByRole("button", { name: "Add shape" }).click();
    await expect(page.locator('.els-canvas__label g[data-element-type="shape"] path')).toHaveCount(1);
    const pencil = page.getByRole("button", { name: "Pencil: draw freehand" });
    await pencil.click();
    await expect(pencil).toHaveAttribute("aria-pressed", "true");
    const box = (await page.getByTestId("els-overlay").boundingBox())!;
    const from = { x: box.x + box.width * 0.2, y: box.y + box.height * 0.6 };
    await page.mouse.move(from.x, from.y);
    await page.mouse.down();
    for (let i = 1; i <= 12; i += 1) {
      await page.mouse.move(from.x + i * 8, from.y + Math.sin(i / 2) * 20);
      await page.waitForTimeout(16);
    }
    await expect(page.getByTestId("els-pencil-preview")).toBeVisible();
    await page.mouse.up();
    const t = await templateJson(page);
    expect(t.elements.length).toBe(before + 2);
    expect(t.elements.at(-1)!.type).toBe("drawing");
    await expect(page.locator('.els-canvas__label g[data-element-type="drawing"] path')).toHaveCount(1);
    await expect(page.getByTestId("els-pencil-preview")).toHaveCount(0);
    await page.keyboard.press("Escape");
    await expect(pencil).toHaveAttribute("aria-pressed", "false");
  });
});

test.describe("Hand and Cursor tools", () => {
  const overlayBox = async (page: Page) => (await page.getByTestId("els-overlay").boundingBox())!;
  /** Screen x of the horizontal ruler's 0 tick, read from the DOM (Playwright's boundingBox() of SVG text is unreliable in WebKit). */
  const rulerZeroX = (page: Page) =>
    page.evaluate(() => {
      const label = [...document.querySelectorAll(".els-ruler--horizontal .els-ruler__label")].find((t) => t.textContent === "0");
      // Centre of the tick line: engines differ on whether its box includes the stroke width.
      const r = label?.previousElementSibling?.getBoundingClientRect();
      return r ? r.x + r.width / 2 : Number.NaN;
    });

  test("cursor edits, hand pans (zoomed, to the edges), and only real edits are saved", async ({ page }) => {
    const errors: string[] = [];
    page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
    page.on("pageerror", (e) => errors.push(e.message));
    await page.goto("/?s=editor");
    await waitForEditor(page);
    const k = await pxPerMm(page);

    // 1–3. Cursor: select and move an element.
    await expect(page.getByRole("button", { name: "Cursor: select and edit" })).toHaveAttribute("aria-pressed", "true");
    const start = await element(page, "barcode");
    const from = await center(page.locator('[data-hit-id="barcode"]'));
    await drag(page, from, { x: from.x + 3 * k, y: from.y });
    await expect.poll(async () => (await element(page, "barcode")).x).toBeCloseTo(start.x + 3, 0);
    const moved = await element(page, "barcode");
    await page.getByRole("button", { name: "Save" }).click();
    await expect(page.getByTestId("els-save-status")).toHaveText("All changes saved");

    // 4–6. Hand: dragging over the element moves the view, never the element.
    const hand = page.getByRole("button", { name: "Hand: pan the view" });
    await hand.click();
    await expect(hand).toHaveAttribute("aria-pressed", "true");
    await expect(page.getByTestId("els-canvas")).toHaveCSS("cursor", "grab");
    const json = JSON.stringify(await templateJson(page));
    const box0 = await overlayBox(page);
    const ruler0 = await rulerZeroX(page);
    expect(ruler0).toBeCloseTo(box0.x, 0);
    const over = await center(page.locator('[data-hit-id="barcode"]'));
    await drag(page, over, { x: over.x - 60, y: over.y - 40 });
    const box1 = await overlayBox(page);
    expect(box1.x - box0.x).toBeCloseTo(-60, 0);
    expect(box1.y - box0.y).toBeCloseTo(-40, 0);
    // Rulers follow the view exactly: the 0 tick stays on the label's left edge.
    expect(await rulerZeroX(page)).toBeCloseTo(box1.x, 0);
    expect(JSON.stringify(await templateJson(page))).toBe(json);
    // The pan started over the selected barcode: the selection is unchanged and no resize handles appear.
    await expect(page.getByTestId("els-selection-barcode")).toHaveCount(1);
    await expect(page.getByTestId("els-handle-se")).toHaveCount(0);

    // 7. Zoom in, then pan to the bottom-right corner of the enlarged label.
    for (let i = 0; i < 4; i += 1) await page.getByRole("button", { name: "Zoom in" }).click();
    const canvasBox = (await page.getByTestId("els-canvas").boundingBox())!;
    let label = await overlayBox(page);
    expect(label.width).toBeGreaterThan(canvasBox.width);
    const c = { x: canvasBox.x + canvasBox.width / 2, y: canvasBox.y + canvasBox.height / 2 };
    for (let i = 0; i < 6 && label.x + label.width > canvasBox.x + canvasBox.width; i += 1) {
      await drag(page, c, { x: c.x - canvasBox.width * 0.4, y: c.y - canvasBox.height * 0.4 }, 4);
      label = await overlayBox(page);
    }
    // The bottom-right corner is actually inside the visible canvas (not panned past it).
    expect(label.x + label.width).toBeLessThanOrEqual(canvasBox.x + canvasBox.width);
    expect(label.x + label.width).toBeGreaterThan(canvasBox.x);
    expect(label.y + label.height).toBeLessThanOrEqual(canvasBox.y + canvasBox.height + 1);
    expect(label.y + label.height).toBeGreaterThan(canvasBox.y);
    expect(JSON.stringify(await templateJson(page))).toBe(json);
    // Panning and zooming never make the document dirty.
    await expect(page.getByTestId("els-save-status")).toHaveText("All changes saved");

    // 8. Back to Cursor: fit, then resize with a handle.
    await page.keyboard.press("v");
    await page.getByRole("button", { name: "Fit to screen" }).click();
    await page.getByTestId("els-layer-mrp").click();
    const mrp = await element(page, "mrp");
    const kk = await pxPerMm(page);
    const handle = await center(page.getByTestId("els-handle-se"));
    await drag(page, handle, { x: handle.x, y: handle.y + 4 * kk });
    await expect.poll(async () => (await element(page, "mrp")).height).toBeGreaterThan(mrp.height);
    const resized = await element(page, "mrp");

    // 9–10. Save and reload: element edits persist; nothing from the view does.
    await page.getByRole("button", { name: "Save" }).click();
    await expect(page.getByTestId("els-save-status")).toHaveText("All changes saved");
    await page.reload();
    await waitForEditor(page);
    expect(await element(page, "barcode")).toEqual(moved);
    expect(await element(page, "mrp")).toEqual(resized);
    expect(Object.keys(await templateJson(page))).not.toContain("viewport");
    expect(errors).toEqual([]);
  });

  test("touch and pen pointers pan with the Hand tool; Space+drag pans with the Cursor", async ({ page }) => {
    await page.goto("/?s=editor");
    await waitForEditor(page);
    const canvas = page.getByTestId("els-canvas");
    const json = JSON.stringify(await templateJson(page));
    await page.getByRole("button", { name: "Hand: pan the view" }).click();
    for (const [pointerType, pointerId] of [["touch", 11], ["pen", 12]] as const) {
      const b0 = await overlayBox(page);
      const base = { pointerType, pointerId, isPrimary: true, bubbles: true };
      await canvas.dispatchEvent("pointerdown", { ...base, button: 0, buttons: 1, clientX: 300, clientY: 300 });
      await canvas.dispatchEvent("pointermove", { ...base, buttons: 1, clientX: 340, clientY: 330 });
      await canvas.dispatchEvent("pointerup", { ...base, button: 0, buttons: 0, clientX: 340, clientY: 330 });
      const b1 = await overlayBox(page);
      expect(b1.x - b0.x, pointerType).toBeCloseTo(40, 0);
      expect(b1.y - b0.y, pointerType).toBeCloseTo(30, 0);
    }
    await page.keyboard.press("Escape");
    await expect(page.getByRole("button", { name: "Cursor: select and edit" })).toHaveAttribute("aria-pressed", "true");
    const b0 = await overlayBox(page);
    const over = await center(page.locator('[data-hit-id="barcode"]'));
    await canvas.focus();
    await page.keyboard.down("Space");
    await drag(page, over, { x: over.x + 50, y: over.y });
    await page.keyboard.up("Space");
    expect((await overlayBox(page)).x - b0.x).toBeCloseTo(50, 0);
    expect(JSON.stringify(await templateJson(page))).toBe(json);
  });
});
