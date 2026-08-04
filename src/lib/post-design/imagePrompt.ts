/**
 * Layout-First-Bildvertrag.
 *
 * Das Layout steht zuerst fest. Aus der Position der Text-Ebenen leiten wir
 * eine Negativraum-Zone ab und schreiben sie als harten kompositorischen
 * Befehl in den englischen Bild-Prompt. So bleibt garantiert Platz für den
 * Text — und die KI bäckt keinen eigenen Text ins Bild.
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

const HARD_CONSTRAINTS =
  "photorealistic advertising photography, square 1:1 framing, natural depth of field, cinematic lighting, " +
  "absolutely no text, no letters, no words, no numbers, no captions, no typography, no logo, no brand mark, " +
  "no watermark, no signage, no UI elements, no frames, no collage";

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
 * Baut den finalen Bild-Prompt: englisches Motiv + Negativraum + harte
 * Textverbote. Deutsche Briefings werden nie direkt an das Bildmodell gereicht.
 */
export function buildImagePrompt(options: {
  /** Englischer Motiv-Prompt der KI. */
  imagePrompt?: string | null;
  /** Fallback, falls kein englischer Prompt vorliegt. */
  brief: string;
  zone: NegativeZone;
  /** Optionale Variation für "Motiv neu denken". */
  angle?: string;
}): string {
  const core = (options.imagePrompt || "").trim();
  const subject = core || `advertising key visual matching this concept: ${options.brief.trim().slice(0, 300)}`;
  const parts = [
    subject.replace(/\s+/g, " "),
    ZONE_CLAUSE[options.zone],
    HARD_CONSTRAINTS,
  ];
  if (options.angle) parts.splice(1, 0, options.angle);
  return parts.join(". ").slice(0, 1200);
}
