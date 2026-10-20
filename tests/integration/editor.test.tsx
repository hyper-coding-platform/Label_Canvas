// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import axe from "axe-core";
import { useState } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { LabelEditor, darkTheme, type ButtonSlotProps, type LabelTemplate } from "../../src/entries/index";
import { LabelRenderer, BarcodePreview } from "../../src/entries/renderer";
import { useEditorStore, useEditorCommands, useEditorSelector } from "../../src/entries/headless";
import { baseTemplate, barcodeEl, textEl, textileRecord, textileTemplate } from "../fixtures/templates";

afterEach(cleanup);

const schema = {
  fields: [
    { path: "product.name", label: "Product name", group: "Product", example: "Cotton Kurta" },
    { path: "product.sku", label: "SKU", group: "Product", example: "KRT-1" },
    { path: "pricing.mrp", label: "MRP", group: "Pricing", type: "number" as const, example: 1299 },
  ],
};

function Controlled({ initial, onChange }: { initial: LabelTemplate; onChange?: (t: LabelTemplate) => void }) {
  const [t, setT] = useState(initial);
  return (
    <>
      <LabelEditor
        template={t}
        onTemplateChange={(next) => {
          setT(next);
          onChange?.(next);
        }}
        dataSchema={schema}
      />
      <output data-testid="json">{JSON.stringify(t)}</output>
      <button type="button" onClick={() => setT(baseTemplate([barcodeEl({ id: "ext" })], { id: "external" }))}>
        load external
      </button>
    </>
  );
}

const current = () => JSON.parse(screen.getByTestId("json").textContent!) as LabelTemplate;

describe("LabelEditor (default UI)", () => {
  it("renders toolbar, canvas, layers and properties with accessible names", () => {
    render(<LabelEditor defaultTemplate={textileTemplate} sampleData={textileRecord} />);
    expect(screen.getByRole("toolbar", { name: "Label editor tools" })).toBeTruthy();
    expect(screen.getByRole("region", { name: "Label canvas" })).toBeTruthy();
    expect(screen.getByRole("listbox", { name: "Layers" })).toBeTruthy();
    expect(within(screen.getByRole("listbox", { name: "Layers" })).getAllByRole("option")).toHaveLength(textileTemplate.elements.length);
    expect(screen.getByTestId("els-properties-template")).toBeTruthy();
    // The canvas shows the real rendered label (same renderer as print).
    expect(screen.getByTestId("els-canvas").textContent).toContain("Lakshmi Silks");
  });

  it("adds an element from the toolbar, selects it, and reports the change", async () => {
    const onChange = vi.fn();
    render(<Controlled initial={baseTemplate([])} onChange={onChange} />);
    await userEvent.click(screen.getByRole("button", { name: "Add text" }));
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(current().elements).toHaveLength(1);
    expect(screen.getByRole("option", { name: /Text/ }).getAttribute("aria-selected")).toBe("true");
    expect(screen.getByTestId("els-properties-element")).toBeTruthy();
  });

  it("edits X and width through the properties panel", async () => {
    render(<Controlled initial={baseTemplate([textEl()])} />);
    await userEvent.click(screen.getByTestId("els-layer-t1"));
    const x = screen.getByLabelText("X");
    await userEvent.clear(x);
    await userEvent.type(x, "7.5{Enter}");
    expect(current().elements[0]!.x).toBe(7.5);
    const w = screen.getByLabelText("Width");
    await userEvent.clear(w);
    await userEvent.type(w, "20{Enter}");
    expect(current().elements[0]!.width).toBe(20);
  });

  it("rejects invalid edits, shows the reason, and keeps the template", async () => {
    render(<Controlled initial={baseTemplate([barcodeEl({ format: "ean13", value: { kind: "static", value: "5901234123457" } })])} />);
    await userEvent.click(screen.getByTestId("els-layer-b1"));
    const value = screen.getByLabelText("Barcode data");
    await userEvent.clear(value);
    await userEvent.type(value, "5901234123458");
    fireEvent.blur(value);
    expect((await screen.findAllByText(/check digit/)).length).toBeGreaterThan(0);
    expect(value.getAttribute("aria-invalid")).toBe("true");
    expect((current().elements[0] as { value: { value: string } }).value.value).toBe("5901234123457");
  });

  it("supports keyboard undo/redo, delete and nudge", async () => {
    render(<Controlled initial={baseTemplate([textEl(), barcodeEl()])} />);
    const user = userEvent.setup();
    await user.click(screen.getByTestId("els-layer-t1"));
    const canvas = screen.getByTestId("els-canvas");
    canvas.focus();
    await user.keyboard("{ArrowRight}{ArrowRight}");
    expect(current().elements[0]!.x).toBe(4);
    await user.keyboard("{Delete}");
    expect(current().elements.map((e) => e.id)).toEqual(["b1"]);
    await user.keyboard("{Control>}z{/Control}");
    expect(current().elements.map((e) => e.id)).toEqual(["t1", "b1"]);
    await user.keyboard("{Control>}z{/Control}");
    expect(current().elements[0]!.x).toBe(2); // two nudges coalesced into one entry
    await user.keyboard("{Control>}{Shift>}z{/Shift}{/Control}");
    expect(current().elements[0]!.x).toBe(4);
  });

  it("selects elements with the keyboard in the layers listbox and toggles visibility", async () => {
    render(<Controlled initial={baseTemplate([textEl(), barcodeEl()])} />);
    const user = userEvent.setup();
    const list = screen.getByRole("listbox", { name: "Layers" });
    list.focus();
    await user.keyboard("{ArrowDown}");
    const selected = within(list).getAllByRole("option").filter((o) => o.getAttribute("aria-selected") === "true");
    expect(selected).toHaveLength(1);
    await user.click(screen.getByTestId("els-layer-toggle-visible"));
    expect(current().elements.some((e) => e.visible === false)).toBe(true);
  });

  it("adopts external template replacement and clears history", async () => {
    render(<Controlled initial={baseTemplate([textEl()])} />);
    await userEvent.click(screen.getByRole("button", { name: "Add barcode" }));
    expect((screen.getByRole("button", { name: "Undo" }) as HTMLButtonElement).disabled).toBe(false);
    await userEvent.click(screen.getByRole("button", { name: "load external" }));
    expect(screen.getByTestId("els-layer-ext")).toBeTruthy();
    expect((screen.getByRole("button", { name: "Undo" }) as HTMLButtonElement).disabled).toBe(true);
  });

  it("shows a structured error instead of the editor for invalid templates", () => {
    render(<LabelEditor defaultTemplate={baseTemplate([textEl({ width: -1 })])} />);
    expect(screen.getByRole("alert").textContent).toContain("cannot be opened");
    expect(screen.queryByRole("toolbar")).toBeNull();
  });
});

describe("save flow", () => {
  it("saves once even when clicked repeatedly, then reports success", async () => {
    let resolve!: () => void;
    const onSave = vi.fn(() => new Promise<void>((r) => (resolve = r)));
    render(<LabelEditor defaultTemplate={baseTemplate([textEl()])} onSave={onSave} />);
    await userEvent.click(screen.getByRole("button", { name: "Add line" }));
    const save = screen.getByRole("button", { name: "Save" });
    await userEvent.click(save);
    fireEvent.click(screen.getByRole("button", { name: "Saving…" }));
    expect(onSave).toHaveBeenCalledTimes(1);
    await act(async () => resolve());
    expect(screen.getByTestId("els-save-status").textContent).toBe("All changes saved");
  });

  it("keeps the template dirty and shows the error when saving fails", async () => {
    const onError = vi.fn();
    render(<LabelEditor defaultTemplate={baseTemplate([textEl()])} onSave={() => Promise.reject(new Error("Network down"))} onError={onError} />);
    await userEvent.click(screen.getByRole("button", { name: "Add line" }));
    await userEvent.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() => expect(screen.getByTestId("els-save-status").textContent).toContain("Save failed: Network down"));
    expect(onError).toHaveBeenCalledWith(expect.any(Error));
    expect((screen.getByRole("button", { name: "Save" }) as HTMLButtonElement).disabled).toBe(false);
  });

  it("ignores results that arrive after unmount", async () => {
    let resolve!: () => void;
    const errors = vi.spyOn(console, "error");
    const { unmount } = render(<LabelEditor defaultTemplate={baseTemplate([textEl()])} onSave={() => new Promise<void>((r) => (resolve = r))} />);
    await userEvent.click(screen.getByRole("button", { name: "Add line" }));
    await userEvent.click(screen.getByRole("button", { name: "Save" }));
    unmount();
    await act(async () => resolve());
    expect(errors).not.toHaveBeenCalled();
  });

  it("adopts the stored template returned by onSave", async () => {
    const onChange = vi.fn();
    render(<LabelEditor defaultTemplate={baseTemplate([textEl()])} onTemplateChange={onChange} onSave={(t) => Promise.resolve({ ...t, id: "server-42" })} />);
    await userEvent.click(screen.getByRole("button", { name: "Add line" }));
    await userEvent.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() => expect(onChange).toHaveBeenLastCalledWith(expect.objectContaining({ id: "server-42" })));
  });
});

describe("customisation", () => {
  it("renders with replaced UI components and still edits through the store", async () => {
    const CustomButton = ({ setElement, ...p }: ButtonSlotProps) => (
      <button type="button" data-kit="acme" aria-label={p["aria-label"]} aria-pressed={p.pressed} disabled={p.disabled} onClick={p.onClick} tabIndex={p.tabIndex} onKeyDown={p.onKeyDown} ref={setElement}>
        {p["aria-label"] ?? p.children}
      </button>
    );
    const onChange = vi.fn();
    render(<LabelEditor defaultTemplate={baseTemplate([])} components={{ Button: CustomButton }} onTemplateChange={onChange} />);
    const add = screen.getByRole("button", { name: "Add QR code" });
    expect(add.getAttribute("data-kit")).toBe("acme");
    await userEvent.click(add);
    expect(onChange.mock.calls[0]![0].elements[0].type).toBe("qrcode");
  });

  it("applies theme tokens as scoped CSS variables and honours layout config", () => {
    render(<LabelEditor defaultTemplate={baseTemplate([])} theme={{ ...darkTheme, radius: "0px", fontFamily: "Inter, sans-serif" }} ui={{ layersPanel: "hidden", statusBar: false, rulers: false }} />);
    const root = screen.getByTestId("els-root");
    expect(root.style.getPropertyValue("--els-color-bg")).toBe("#16181d");
    expect(root.style.getPropertyValue("--els-radius")).toBe("0px");
    expect(root.style.getPropertyValue("--els-font-family")).toBe("Inter, sans-serif");
    expect(root.getAttribute("data-color-scheme")).toBe("dark");
    expect(screen.queryByTestId("els-panel-layers")).toBeNull();
    expect(screen.queryByTestId("els-status")).toBeNull();
    // Nothing is written outside the editor root.
    expect(document.documentElement.getAttribute("style")).toBeNull();
    expect(document.body.getAttribute("style")).toBeNull();
  });

  it("rejects theme values that could break out of a CSS declaration", () => {
    render(<LabelEditor defaultTemplate={baseTemplate([])} theme={{ colorAccent: "red; background: url(x)" }} />);
    expect(screen.getByTestId("els-root").style.getPropertyValue("--els-color-accent")).toBe("");
  });
});

describe("headless API", () => {
  function HeadlessUi() {
    const store = useEditorStore(baseTemplate([]));
    const cmd = useEditorCommands(store);
    const count = useEditorSelector(store, (s) => s.template.elements.length);
    const canUndo = useEditorSelector(store, (s) => s.canUndo);
    const rejected = useEditorSelector(store, (s) => s.lastRejection?.[0]?.code ?? "");
    return (
      <div>
        <button type="button" onClick={() => cmd.addElement("barcode")}>my add</button>
        <button type="button" onClick={() => cmd.updateElement(store.getState().template.elements[0]!.id, { width: -1 })}>break it</button>
        <button type="button" disabled={!canUndo} onClick={cmd.undo}>my undo</button>
        <span data-testid="count">{count}</span>
        <span data-testid="rejected">{rejected}</span>
      </div>
    );
  }

  it("works without the default UI and still enforces validation", async () => {
    render(<HeadlessUi />);
    await userEvent.click(screen.getByText("my add"));
    expect(screen.getByTestId("count").textContent).toBe("1");
    await userEvent.click(screen.getByText("break it"));
    expect(screen.getByTestId("rejected").textContent).toBe("NUMBER_OUT_OF_RANGE");
    await userEvent.click(screen.getByText("my undo"));
    expect(screen.getByTestId("count").textContent).toBe("0");
    expect(document.querySelector(".els-root")).toBeNull();
  });
});

describe("renderer components", () => {
  it("LabelRenderer renders the label SVG at physical size", () => {
    const { container } = render(<LabelRenderer template={textileTemplate} data={textileRecord} />);
    const svg = container.querySelector("svg")!;
    expect(svg.getAttribute("width")).toBe("50mm");
    expect(svg.textContent).toContain("MRP ₹1,299.00");
  });

  it("LabelRenderer reports issues and falls back for invalid templates", () => {
    const onRender = vi.fn();
    render(<LabelRenderer template={baseTemplate([barcodeEl()])} data={{}} onRender={onRender} />);
    expect(onRender).toHaveBeenCalledWith(expect.objectContaining({ ok: false, issues: [expect.objectContaining({ code: "BARCODE_VALUE_MISSING" })] }));
    render(<LabelRenderer template={baseTemplate([textEl({ width: -1 })])} />);
    expect(screen.getByRole("alert").textContent).toContain("cannot be rendered");
  });

  it("BarcodePreview renders bars or reports invalid values", () => {
    const onRender = vi.fn();
    const { container } = render(<BarcodePreview format="ean13" value="590123412345" onRender={onRender} />);
    expect(container.querySelector("path[shape-rendering='crispEdges']")).toBeTruthy();
    expect(container.textContent).toContain("5901234123457");
    render(<BarcodePreview format="ean13" value="12" onRender={onRender} />);
    expect(onRender).toHaveBeenLastCalledWith(expect.objectContaining({ ok: false }));
  });
});

describe("accessibility (axe-core, jsdom)", () => {
  it("has no serious or critical violations in the default editor", async () => {
    const { container } = render(<LabelEditor defaultTemplate={textileTemplate} sampleData={textileRecord} dataSchema={schema} onSave={() => undefined} />);
    await userEvent.click(screen.getByTestId("els-layer-barcode"));
    const results = await axe.run(container, { rules: { "color-contrast": { enabled: false } } });
    const serious = results.violations.filter((v) => v.impact === "serious" || v.impact === "critical");
    expect(serious.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(" ")).slice(0, 3).join(", ")}`)).toEqual([]);
  });
});

describe("storage integration (useTemplateStorage + LabelEditor)", () => {
  it("loads, saves with revisions, and surfaces conflicts from concurrent writers", async () => {
    const { createMemoryTemplateStorage } = await import("../../src/entries/core");
    const { useTemplateStorage } = await import("../../src/entries/headless");
    const storage = createMemoryTemplateStorage({ initial: [textileTemplate] });
    function Page() {
      const { state, save } = useTemplateStorage(storage, "textile-hang-tag");
      if (state.status === "loading") return <p>Loading…</p>;
      if (state.status !== "ready") return <p role="alert">{state.status}</p>;
      return (
        <>
          <span data-testid="rev">{state.stored.revision}</span>
          <LabelEditor defaultTemplate={state.stored.template} onSave={save} />
        </>
      );
    }
    render(<Page />);
    expect(screen.getByText("Loading…")).toBeTruthy();
    await screen.findByTestId("els-root");
    expect(screen.getByTestId("rev").textContent).toBe("1");
    await userEvent.click(screen.getByRole("button", { name: "Add line" }));
    await userEvent.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() => expect(screen.getByTestId("rev").textContent).toBe("2"));
    // Another user saves in the meantime.
    const other = (await storage.get("textile-hang-tag"))!;
    await storage.save({ ...other.template, name: "Changed elsewhere" }, { expectedRevision: 2 });
    await userEvent.click(screen.getByRole("button", { name: "Add line" }));
    await userEvent.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() => expect(screen.getByTestId("els-save-status").textContent).toMatch(/Save failed: .*modified elsewhere/));
    expect((await storage.get("textile-hang-tag"))!.template.name).toBe("Changed elsewhere");
  });
});
