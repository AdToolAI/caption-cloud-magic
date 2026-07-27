// _shared/detectGridIntent.ts
//
// v273 — Grid-Intent-Detector.
// A grid / split-screen / collage layout is only produced when the customer
// explicitly asks for it in the scene prompt or briefing text. Default
// behavior stays "one continuous photograph" (v272 anti-grid hardening).
//
// Recognised signals (DE + EN, case-insensitive, word-boundary aware):
//   grid, 2x2, 2 x 2, four-panel, vier panels, panel grid, panels,
//   split-screen, split screen, split view, kachel(n), tiles, tiled,
//   collage, mosaic, mosaik, interview split, zoom call grid,
//   videocall grid, brady bunch, picture-in-picture, pip layout
//
// The detector runs on plain user prose. It intentionally does NOT match
// stray occurrences of "panel" inside longer words (control panel, solar
// panel, …) — those require the word "grid" nearby to trigger.

export type GridStyle = "2x2" | "split" | "collage";

export interface GridIntent {
  gridRequested: boolean;
  gridStyle?: GridStyle;
}

const RE_2x2 = /\b2\s*[x×]\s*2\b/i;
const RE_GRID = /\b(grid|photo\s*grid|panel\s*grid|four[-\s]?panel|vier\s+panels?|brady\s+bunch|zoom(?:[-\s]?call)?\s+grid|videocall\s+grid|teams\s+grid|meet\s+grid)\b/i;
const RE_SPLIT = /\b(split[-\s]?screen|split[-\s]?view|splitscreen|interview[-\s]?split)\b/i;
const RE_COLLAGE = /\b(collage|mosaic|mosaik)\b/i;
const RE_TILES = /\b(kachel(?:n|ansicht)?|tiled?\s+portraits?|tiles?\s+layout)\b/i;
const RE_PIP = /\b(picture[-\s]?in[-\s]?picture|pip\s+layout)\b/i;

export function detectGridIntent(text: string | null | undefined): GridIntent {
  if (!text) return { gridRequested: false };
  const s = String(text);

  if (RE_2x2.test(s) || RE_GRID.test(s)) {
    return { gridRequested: true, gridStyle: "2x2" };
  }
  if (RE_SPLIT.test(s) || RE_PIP.test(s)) {
    return { gridRequested: true, gridStyle: "split" };
  }
  if (RE_COLLAGE.test(s) || RE_TILES.test(s)) {
    return { gridRequested: true, gridStyle: "collage" };
  }
  return { gridRequested: false };
}
