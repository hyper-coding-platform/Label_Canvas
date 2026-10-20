/** Minimal inline icon set (24×24, stroke-based). Decorative: always aria-hidden. */
const PATHS: Record<string, string> = {
  text: "M5 6V4h14v2M12 4v16M9 20h6",
  barcode: "M4 5v14M7 5v14M9 5v14M12 5v14M15 5v14M17 5v14M20 5v14",
  qrcode: "M4 4h6v6H4zM14 4h6v6h-6zM4 14h6v6H4zM14 14h2v2h-2zM18 18h2v2h-2zM14 18h2M18 14h2",
  image: "M4 5h16v14H4zM4 16l5-5 4 4 3-3 4 4M15 9h.01",
  rect: "M4 6h16v12H4z",
  line: "M4 12h16",
  undo: "M9 14L4 9l5-5M4 9h10a6 6 0 010 12h-3",
  redo: "M15 14l5-5-5-5M20 9H10a6 6 0 000 12h3",
  duplicate: "M8 8h12v12H8zM4 16V4h12",
  trash: "M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13",
  zoomIn: "M11 4a7 7 0 100 14 7 7 0 000-14zM20 20l-4-4M11 8v6M8 11h6",
  zoomOut: "M11 4a7 7 0 100 14 7 7 0 000-14zM20 20l-4-4M8 11h6",
  fit: "M4 9V4h5M15 4h5v5M20 15v5h-5M9 20H4v-5",
  grid: "M4 4h16v16H4zM4 9.3h16M4 14.6h16M9.3 4v16M14.6 4v16",
  snap: "M6 4v8a6 6 0 0012 0V4M6 8h4M14 8h4",
  ruler: "M3 17L17 3l4 4L7 21zM7 13l2 2M10 10l2 2M13 7l2 2",
  save: "M5 4h11l3 3v13H5zM8 4v5h7V4M8 20v-6h8v6",
  print: "M7 9V4h10v5M7 17H4v-7h16v7h-3M7 14h10v6H7z",
  eye: "M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12zM12 9a3 3 0 100 6 3 3 0 000-6z",
  eyeOff: "M3 3l18 18M10.6 6.1A10 10 0 0112 6c6 0 10 6 10 6a17 17 0 01-3 3.6M6.6 6.6A17 17 0 002 12s4 7 10 7a10 10 0 004.4-1",
  lock: "M6 11h12v9H6zM8 11V7a4 4 0 018 0v4",
  unlock: "M6 11h12v9H6zM8 11V7a4 4 0 017.5-2",
  up: "M12 19V5M6 11l6-6 6 6",
  down: "M12 5v14M18 13l-6 6-6-6",
  preview: "M4 5h16v14H4zM8 9h8M8 13h5",
};

export type IconName = keyof typeof PATHS;

export function Icon({ name }: { readonly name: IconName }) {
  return (
    <svg className="els-icon" viewBox="0 0 24 24" width="18" height="18" aria-hidden="true" focusable="false">
      <path d={PATHS[name]} fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
