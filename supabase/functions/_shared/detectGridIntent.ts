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

const GRID_TERM = String.raw`(?:2\s*[x×]\s*2|grid|photo\s*grid|panel\s*grid|four[-\s]?panel|vier\s+panels?|brady\s+bunch|zoom(?:[-\s]?call)?\s+grid|videocall\s+grid|teams\s+grid|meet\s+grid|split[-\s]?screen|split[-\s]?view|splitscreen|interview[-\s]?split|collage|mosaic|mosaik|kachel(?:n|ansicht)?|tiled?\s+portraits?|tiles?\s+layout|picture[-\s]?in[-\s]?picture|pip\s+layout)`;

// v454 — Grid mode is an explicit opt-in. The old detector matched a bare
// "grid" anywhere in the enriched prompt, including the system's own
// "NO 2x2 grid" clauses. Require affirmative layout language instead.
const RE_POSITIVE_PREFIX = new RegExp(
  String.raw`\b(?:create|make|render|compose|arrange|show|use|display|format|layout|as|in|into|als|erstelle|erzeuge|rendere|komponiere|ordne|zeige|verwende|im|como|crear|crea|renderiza|compone|organiza|muestra|usa|en)\b[^.!?\n]{0,48}\b${GRID_TERM}\b`,
  "i",
);
const RE_POSITIVE_SUFFIX = new RegExp(
  String.raw`\b${GRID_TERM}\b[^.!?\n]{0,32}\b(?:layout|composition|view|format|style|anordnung|ansicht|komposition|formato|composición|vista)\b`,
  "i",
);
const RE_NEGATED = new RegExp(
  String.raw`\b(?:no|not|never|without|avoid|forbid(?:den)?|kein(?:e[rmns]?)?|nie|ohne|vermeide|verboten|sin|nunca|evita|prohibid[oa])\b[^.!?\n]{0,36}\b${GRID_TERM}\b`,
  "i",
);

export function detectGridIntent(text: string | null | undefined): GridIntent {
  if (!text) return { gridRequested: false };
  const s = String(text)
    .split(/(?<=[.!?\n])/)
    .filter((clause) => !RE_NEGATED.test(clause))
    .join(" ");

  if (!RE_POSITIVE_PREFIX.test(s) && !RE_POSITIVE_SUFFIX.test(s)) {
    return { gridRequested: false };
  }

  if (/\b(?:2\s*[x×]\s*2|grid|four[-\s]?panel|vier\s+panels?|brady\s+bunch)\b/i.test(s)) {
    return { gridRequested: true, gridStyle: "2x2" };
  }
  if (/\b(?:split[-\s]?screen|split[-\s]?view|splitscreen|interview[-\s]?split|picture[-\s]?in[-\s]?picture|pip\s+layout)\b/i.test(s)) {
    return { gridRequested: true, gridStyle: "split" };
  }
  if (/\b(?:collage|mosaic|mosaik|kachel(?:n|ansicht)?|tiled?\s+portraits?|tiles?\s+layout)\b/i.test(s)) {
    return { gridRequested: true, gridStyle: "collage" };
  }
  return { gridRequested: false };
}
