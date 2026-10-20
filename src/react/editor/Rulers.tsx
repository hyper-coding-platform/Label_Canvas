import { useEffect, useRef, useState } from "react";
import { pixelsPerUnit } from "../../core/geometry/viewport";
import type { LengthUnit } from "../../core/schema/types";
import { useEditorSelector } from "../headless/hooks";
import { useEditorContext } from "./context";

const STEPS: Record<LengthUnit, readonly number[]> = {
  mm: [1, 2, 5, 10, 20, 50, 100, 200, 500],
  in: [0.0625, 0.125, 0.25, 0.5, 1, 2, 5, 10],
  px: [5, 10, 25, 50, 100, 250, 500, 1000],
};

/** Pick a major tick step so labels are at least ~48 screen px apart. */
export function rulerStep(unit: LengthUnit, ppu: number): number {
  return STEPS[unit].find((s) => s * ppu >= 48) ?? STEPS[unit][STEPS[unit].length - 1]!;
}

function useSize<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const [size, setSize] = useState({ width: 0, height: 0 });
  useEffect(() => {
    const el = ref.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(([entry]) => entry && setSize({ width: entry.contentRect.width, height: entry.contentRect.height }));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return [ref, size] as const;
}

/** Horizontal or vertical ruler aligned to the canvas viewport. Decorative for assistive tech (positions are in the properties panel). */
export function Ruler({ orientation }: { readonly orientation: "horizontal" | "vertical" }) {
  const { store } = useEditorContext();
  const viewport = useEditorSelector(store, (s) => s.viewport);
  const unit = useEditorSelector(store, (s) => s.template.canvas.unit);
  const [ref, size] = useSize<HTMLDivElement>();
  const horizontal = orientation === "horizontal";
  const length = horizontal ? size.width : size.height;
  const ppu = pixelsPerUnit(viewport, unit);
  const pan = horizontal ? viewport.panX : viewport.panY;
  const major = rulerStep(unit, ppu);
  const minor = major / (unit === "in" ? 4 : 5);
  const start = Math.floor(-pan / ppu / minor) * minor;
  const end = (length - pan) / ppu;
  const ticks: { pos: number; major: boolean; value: number }[] = [];
  if (length > 0 && Number.isFinite(ppu) && ppu > 0) {
    for (let v = start, i = 0; v <= end && i < 2000; v += minor, i += 1) {
      const value = Math.round(v / minor) * minor;
      const isMajor = Math.abs(value / major - Math.round(value / major)) < 1e-6;
      ticks.push({ pos: pan + value * ppu, major: isMajor, value });
    }
  }
  const fmt = (v: number) => (unit === "in" ? String(Number(v.toFixed(3))) : String(Math.round(v)));
  return (
    <div ref={ref} className={`els-ruler els-ruler--${orientation}`} aria-hidden="true">
      <svg width="100%" height="100%">
        {ticks.map((t) =>
          horizontal ? (
            <g key={t.value}>
              <line x1={t.pos} x2={t.pos} y1={t.major ? 8 : 14} y2={20} className="els-ruler__tick" />
              {t.major && (
                <text x={t.pos + 2} y={9} className="els-ruler__label">
                  {fmt(t.value)}
                </text>
              )}
            </g>
          ) : (
            <g key={t.value}>
              <line y1={t.pos} y2={t.pos} x1={t.major ? 8 : 14} x2={20} className="els-ruler__tick" />
              {t.major && (
                <text x={9} y={t.pos + 2} className="els-ruler__label" transform={`rotate(-90 9 ${t.pos + 2})`} textAnchor="end">
                  {fmt(t.value)}
                </text>
              )}
            </g>
          ),
        )}
      </svg>
    </div>
  );
}
