import { Resvg } from "@resvg/resvg-js";
import { expect, test, type ConsoleMessage, type Page } from "@playwright/test";
import { readBarcodes } from "zxing-wasm/reader";

/** Collect console errors/warnings (hydration mismatches surface here). */
function watchConsole(page: Page) {
  const messages: string[] = [];
  page.on("console", (m: ConsoleMessage) => {
    if (m.type() === "error" || m.type() === "warning") messages.push(`${m.type()}: ${m.text()}`);
  });
  page.on("pageerror", (e) => messages.push(`pageerror: ${e.message}`));
  return messages;
}

test("server-rendered HTML contains the host shell and the editor markup (SSR works)", async ({ request }) => {
  const html = await (await request.get("/stickers/antd")).text();
  expect(html).toContain('data-testid="host-navbar"');
  expect(html).toContain('data-testid="host-sidebar"');
  expect(html).toContain("els-root");
  expect(html).toContain("Label editor tools");
});

test("/stickers hydrates without errors, loads via the API, saves with revisions and persists", async ({ page }) => {
  const messages = watchConsole(page);
  await page.goto("/stickers");
  await expect(page.getByTestId("els-root")).toBeVisible();
  const rev0 = Number((await page.getByTestId("revision").textContent())!.replace(/\D/g, ""));
  const options = page.getByRole("listbox", { name: "Layers" }).getByRole("option");
  const before = await options.count();
  await page.getByRole("button", { name: "Add line" }).click();
  await page.getByRole("button", { name: "Save" }).click();
  await expect(page.getByTestId("els-save-status")).toHaveText("All changes saved");
  await expect(page.getByTestId("revision")).toHaveText(`Revision ${rev0 + 1}`);
  await page.reload();
  await expect(page.getByTestId("els-root")).toBeVisible();
  await expect(options).toHaveCount(before + 1);
  expect(messages.filter((m) => /hydrat|did not match|error/i.test(m))).toEqual([]);
});

test("a concurrent save from elsewhere is reported as a conflict", async ({ page, request }) => {
  await page.goto("/stickers");
  await expect(page.getByTestId("els-root")).toBeVisible();
  const current = await (await request.get("/api/templates/textile-hang-tag")).json();
  const put = await request.put("/api/templates/textile-hang-tag", { data: { template: { ...current.template, name: "Edited by someone else" }, expectedRevision: current.revision } });
  expect(put.status()).toBe(200);
  await page.getByRole("button", { name: "Add line" }).click();
  await page.getByRole("button", { name: "Save" }).click();
  await expect(page.getByTestId("els-save-status")).toHaveText(/Save failed: .*modified elsewhere/);
});

test("the API rejects invalid templates server-side", async ({ request }) => {
  const res = await request.put("/api/templates/textile-hang-tag", { data: { template: { schemaVersion: 1, id: "textile-hang-tag", name: "x", canvas: { width: -1, height: 1, unit: "mm" }, elements: [] }, expectedRevision: 1 } });
  expect(res.status()).toBe(422);
});

test("Ant Design controls drive the editor (different UI framework via slots)", async ({ page }) => {
  const messages = watchConsole(page);
  await page.goto("/stickers/antd");
  await expect(page.getByTestId("els-root")).toBeVisible();
  const add = page.getByRole("button", { name: "Add barcode" });
  await expect(add).toHaveClass(/ant-btn/);
  await add.click();
  const t = JSON.parse((await page.getByTestId("template-json").textContent())!);
  expect(t.elements.at(-1).type).toBe("barcode");
  // Edit X through an Ant Design InputNumber.
  const x = page.getByTestId("els-properties-element").getByLabel("X", { exact: true });
  await x.fill("4");
  await x.press("Enter");
  await expect.poll(async () => JSON.parse((await page.getByTestId("template-json").textContent())!).elements.at(-1).x).toBe(4);
  expect(messages.filter((m) => /hydrat|did not match/i.test(m))).toEqual([]);
});

test("the host navbar and sidebar look identical on the dashboard and the stickers page", async ({ page }) => {
  const probe = () =>
    page.evaluate(() => {
      const s = (sel: string, withHeight: boolean) => {
        const el = document.querySelector(sel)!;
        const cs = getComputedStyle(el);
        const r = el.getBoundingClientRect();
        return [cs.fontFamily, cs.fontSize, cs.backgroundColor, cs.color, cs.padding, Math.round(r.width), withHeight ? Math.round(r.height) : "-"].join("|");
      };
      // The sidebar's height follows the host grid row (content height), so only its styles and width are compared.
      return { nav: s('[data-testid="host-navbar"]', true), side: s('[data-testid="host-sidebar"]', false), link: s(".erp-sidebar a", true), body: getComputedStyle(document.body).fontFamily };
    });
  await page.goto("/");
  const a = await probe();
  await page.goto("/stickers");
  await expect(page.getByTestId("els-root")).toBeVisible();
  expect(await probe()).toEqual(a);
});

test("server-side SVG rendering (core only) produces a scannable label", async ({ request }) => {
  const res = await request.get("/api/labels/textile-hang-tag/p2");
  expect(res.headers()["content-type"]).toContain("image/svg+xml");
  const svg = await res.text();
  expect(svg).toContain("Linen Shirt");
  const png = new Resvg(svg, { background: "white", fitTo: { mode: "zoom", value: 6 } }).render().asPng();
  const decoded = await readBarcodes(new Uint8Array(png), { formats: ["Code128"], tryHarder: true });
  expect(decoded[0]?.text).toBe("260042130122");
});

test("print page: batch check via generateLabels in the browser", async ({ page }) => {
  await page.goto("/print");
  await expect(page.locator("svg.els-preview")).toHaveCount(3);
  await page.getByRole("button", { name: "Check batch" }).click();
  await expect(page.getByTestId("batch-status")).toHaveText("3 ready, 0 with problems");
});
