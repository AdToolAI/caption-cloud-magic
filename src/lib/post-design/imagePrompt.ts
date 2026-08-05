/**
 * Layout-First-Bildvertrag + Textfrei-Vertrag.
 *
 * Das Layout steht zuerst fest. Aus der Position der Text-Ebenen leiten wir
 * eine Negativraum-Zone ab und schreiben sie als harten kompositorischen
 * Befehl in den englischen Bild-Prompt. Zusätzlich wird der Motivkern von
 * schriftauslösenden Begriffen (Screens, Schilder, Marken) befreit und der
 * Negativ-Block steht als letzter Absatz — dort wirkt er am stärksten.
 */
import type { PostDesign } from "./schema";

export type NegativeZone = "bottom" | "top" | "left" | "right" | "center";

const ZONE_CLAUSE: Record<NegativeZone, string> = {
  bottom:
    "composition keeps the entire lower half calm, empty and uncluttered; all subject detail sits in the upper half",
  top: "composition keeps the entire upper half calm, empty and uncluttered; all subject detail sits in the lower half",
  left: "composition keeps the left half calm, empty and uncluttered; the subject sits on the right side",
  right: "composition keeps the right half calm, empty and uncluttered; the subject sits on the left side",
  center:
    "composition keeps the central area calm and uncluttered with a wide, quiet middle band; detail sits near the edges",
};

/** Begriffe, die Bildmodelle fast immer mit Fake-Schrift füllen. */
const TEXT_TRIGGERS: { re: RegExp; replacement: string }[] = [
  { re: /\b(dashboards?|user interfaces?|interfaces?|uis?|apps?|softwares?|websites?|web pages?|analytics? (?:panels?|charts?|graphs?))\b/gi, replacement: "abstract glowing light shapes" },
  { re: /\b(screens?|displays?|monitors?|tablets?|laptops?|smartphones?|phones?|computers?|holograms?|hud)\b/gi, replacement: "softly lit surface" },
  { re: /\b(signs?|signage|billboards?|posters?|banners?|labels?|packaging|boxes with print|book covers?|magazines?|newspapers?|documents?|charts?|graphs?|slides?)\b/gi, replacement: "plain surface" },
  { re: /\b(logos?|logotypes?|wordmarks?|brand marks?|watermarks?|typography|lettering|captions?|slogans?|headlines?|texts?|words?|writing)\b/gi, replacement: "clean shape" },
];

const TEXT_FREE_MANDATE =
  "TEXT-FREE MANDATE (highest priority): render absolutely NO text, NO letters, NO words, NO numbers, " +
  "NO typography, NO captions, NO slogans, NO logos, NO brand marks, NO watermarks, NO signage, " +
  "NO posters, NO labels, NO printed packaging, NO screens or displays showing any content, NO user interfaces, " +
  "NO charts with labels. Every surface stays blank and unmarked.";

const STRICT_ADDENDUM =
  "Additionally: all devices are switched off with dark blank surfaces, all objects are unbranded and unlabeled, " +
  "prefer people, hands, materials, textures, architecture and light over any object that could carry writing.";

const BASE_STYLE =
  "photorealistic advertising photography, square 1:1 framing, natural depth of field, cinematic lighting";

/** Entfernt schriftauslösende Begriffe und Markennamen aus dem Motivkern. */
export function sanitizeSubject(subject: string, brandName?: string | null): string {
  let out = subject;
  const brand = (brandName ?? "").trim();
  if (brand.length >= 2) {
    const escaped = brand.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    out = out.replace(new RegExp(escaped, "gi"), "the product");
  }
  for (const t of TEXT_TRIGGERS) out = out.replace(t.re, t.replacement);
  return out.replace(/\s+/g, " ").trim();
}

/** Leitet die Negativraum-Zone aus den tatsächlichen Textboxen eines Layouts ab. */
export function negativeZoneForDesign(design: PostDesign): NegativeZone {
  const slide = design.slides[0];
  const boxes = (slide?.layers ?? []).filter(
    (l) => l.type === "text" || l.type === "badge" || l.type === "logo",
  );
  if (!boxes.length) return "bottom";

  let top = 1;
  let bottom = 0;
  let left = 1;
  let right = 0;
  for (const b of boxes) {
    top = Math.min(top, b.y);
    bottom = Math.max(bottom, b.y + b.h);
    left = Math.min(left, b.x);
    right = Math.max(right, b.x + b.w);
  }

  const centerY = (top + bottom) / 2;
  const width = right - left;
  const centerX = (left + right) / 2;

  // Schmale, seitlich sitzende Textsäule -> horizontale Zone.
  if (width <= 0.6) return centerX < 0.5 ? "left" : "right";
  if (centerY >= 0.58) return "bottom";
  if (centerY <= 0.42) return "top";
  return "center";
}

/**
 * Baut den finalen Bild-Prompt: bereinigtes englisches Motiv + Negativraum +
 * Textverbote als letzter Absatz. Deutsche Briefings werden nie direkt an das
 * Bildmodell gereicht.
 */
export function buildImagePrompt(options: {
  /** Englischer Motiv-Prompt der KI. */
  imagePrompt?: string | null;
  /** Fallback, falls kein englischer Prompt vorliegt. */
  brief: string;
  zone: NegativeZone;
  /** Optionale Variation für "Motiv neu denken". */
  angle?: string;
  /** Markenname, der aus dem Motiv entfernt wird. */
  brandName?: string | null;
  /** Verschärfter Wiederholungsversuch nach erkanntem Text im Bild. */
  strict?: boolean;
}): string {
  const core = (options.imagePrompt || "").trim();
  const raw = core || `advertising key visual matching this concept: ${options.brief.trim().slice(0, 300)}`;
  const subject = sanitizeSubject(raw, options.brandName);

  const parts = [subject];
  if (options.angle) parts.push(options.angle);
  parts.push(ZONE_CLAUSE[options.zone]);
  parts.push(BASE_STYLE);
  const body = parts.join(". ");

  const mandate = options.strict ? `${TEXT_FREE_MANDATE} ${STRICT_ADDENDUM}` : TEXT_FREE_MANDATE;
  return `${body}.\n\n${mandate}`.slice(0, 1400);
}
