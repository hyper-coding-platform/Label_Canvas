/**
 * Enforces module boundaries from ARCHITECTURE.md / AGENTS.md by scanning sources.
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = join(__dirname, "..", "..", "src");

function files(dir: string): string[] {
  return readdirSync(dir).flatMap((f) => {
    const p = join(dir, f);
    return statSync(p).isDirectory() ? files(p) : /\.(ts|tsx)$/.test(f) ? [p] : [];
  });
}

const all = files(ROOT).map((p) => ({ path: relative(ROOT, p).replace(/\\/g, "/"), text: readFileSync(p, "utf8") }));
const imports = (text: string) => [...text.matchAll(/(?:from|import)\s*\(?\s*["']([^"']+)["']/g)].map((m) => m[1]!);

describe("architecture boundaries", () => {
  it("core never imports React or React layers", () => {
    for (const f of all.filter((f) => f.path.startsWith("core/"))) {
      for (const spec of imports(f.text)) {
        expect(spec, `${f.path} imports ${spec}`).not.toMatch(/^react(-dom)?(\/|$)|\/react\//);
      }
    }
  });

  it("core does not touch browser globals at module scope", () => {
    for (const f of all.filter((f) => f.path.startsWith("core/"))) {
      // Allowed only inside functions; module-scope usage would break SSR. Simple heuristic:
      // flag lines at column 0 referencing window/document/navigator.
      const offending = f.text.split("\n").filter((l) => /^(?:const|let|var|export const)\b.*\b(window|document|navigator|localStorage)\b/.test(l));
      expect(offending, f.path).toEqual([]);
    }
  });

  it("renderer does not import editor code", () => {
    for (const f of all.filter((f) => f.path.startsWith("react/renderer/"))) {
      for (const spec of imports(f.text)) expect(spec, f.path).not.toMatch(/editor/);
    }
  });

  it("no dynamic code evaluation or raw HTML injection anywhere in src", () => {
    for (const f of all) {
      expect(f.text, f.path).not.toMatch(/\beval\s*\(|new\s+Function\s*\(|dangerouslySetInnerHTML|\.innerHTML\s*=|outerHTML\s*=|insertAdjacentHTML/);
    }
  });

  it("no TODO/FIXME placeholders in src", () => {
    for (const f of all) expect(f.text, f.path).not.toMatch(/\b(TODO|FIXME|XXX)\b|not implemented/i);
  });
});
