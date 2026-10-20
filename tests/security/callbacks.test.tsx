// @vitest-environment jsdom
import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createEditorStore } from "../../src/core/editor/editor-store";
import { LabelEditor } from "../../src/entries/index";
import { baseTemplate, textEl } from "../fixtures/templates";

afterEach(cleanup);

describe("host callback failures do not break the editor", () => {
  it("onTemplateChange throwing is reported via onError; editing continues", async () => {
    const onError = vi.fn();
    render(<LabelEditor defaultTemplate={baseTemplate([])} onTemplateChange={() => { throw new Error("host bug"); }} onError={onError} />);
    await userEvent.click(screen.getByRole("button", { name: "Add text" }));
    await userEvent.click(screen.getByRole("button", { name: "Add line" }));
    expect(onError).toHaveBeenCalledTimes(2);
    expect(within(screen.getByRole("listbox", { name: "Layers" })).getAllByRole("option")).toHaveLength(2);
  });

  it("onSave throwing synchronously becomes a save error", async () => {
    const onError = vi.fn();
    render(<LabelEditor defaultTemplate={baseTemplate([textEl()])} onSave={() => { throw new Error("sync failure"); }} onError={onError} />);
    await userEvent.click(screen.getByRole("button", { name: "Add line" }));
    await userEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(screen.getByTestId("els-save-status").textContent).toContain("Save failed: sync failure");
    expect(onError).toHaveBeenCalled();
  });

  it("onSelectionChange and onPrint throwing are reported", async () => {
    const onError = vi.fn();
    render(<LabelEditor defaultTemplate={baseTemplate([textEl()])} onSelectionChange={() => { throw new Error("sel"); }} onPrint={() => { throw new Error("print"); }} onError={onError} />);
    await userEvent.click(screen.getByTestId("els-layer-t1"));
    await userEvent.click(screen.getByRole("button", { name: "Print preview" }));
    expect(onError.mock.calls.map((c) => (c[0] as Error).message)).toEqual(expect.arrayContaining(["sel", "print"]));
  });

  it("a throwing store listener does not block other listeners or corrupt state", async () => {
    const store = createEditorStore(baseTemplate([textEl()]));
    const seen: number[] = [];
    const errors: unknown[] = [];
    const handler = (e: unknown) => errors.push(e);
    process.on("uncaughtException", handler);
    store.subscribe(() => {
      throw new Error("bad listener");
    });
    store.subscribe(() => seen.push(store.getState().version));
    store.dispatch({ type: "moveElements", ids: ["t1"], dx: 1, dy: 0 });
    expect(seen).toEqual([1]);
    expect(store.getState().template.elements[0]!.x).toBe(3);
    await new Promise((r) => setTimeout(r, 0));
    process.off("uncaughtException", handler);
    expect(errors).toHaveLength(1);
  });
});
