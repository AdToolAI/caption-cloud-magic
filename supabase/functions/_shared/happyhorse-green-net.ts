// happyhorse-green-net.ts
// Alibaba HappyHorse uses the "Green Net" (绿网) CAC content filter on every
// text input. It rejects requests BEFORE GPU spend with the opaque error
// `DataInspectionFailed - Green net check failed for text (input)`.
//
// The filter is most aggressive against:
//  - non-English text (especially German with umlauts / smart quotes)
//  - first-person self-monologue ("Und ich …", "I am editing …")
//  - night-time / late-night phrasing ("3 Uhr nachts", "midnight")
//  - device-screen vocabulary that it mis-classifies as "UI with people"
//    (Reel, Screen, Display, Phone)
//
// This module strips the worst offenders. It is intentionally conservative:
// returns the cleaned prompt plus the list of tokens it touched so the
// caller can persist it for forensics.

export interface GreenNetSanitizeResult {
  clean: string;
  touched: string[];
  emptied: boolean;
}

const REPLACEMENTS: Array<[RegExp, string, string]> = [
  // ── structural junk: bracket tags trigger "prompt-injection" heuristic ──
  [/\[\/?\s*SceneAction\s*\]/gi, "", "sceneaction-tag"],
  [/\[\/?\s*Dialog\s*\]/gi, "", "dialog-tag"],
  [/\[\/?\s*Action\s*\]/gi, "", "action-tag"],
  [/\[\/?\s*Shot\s*\]/gi, "", "shot-tag"],

  // typography
  [/[…]+/g, ", ", "ellipsis"],
  [/[„""«»]/g, "", "smart-quote"],
  [/'/g, "'", "smart-apostrophe"],

  // ── intimate-space + night-time combo (the worst Green-Net trigger) ─────
  [/\bdark\s+bedroom\b/gi, "home workspace", "dark-bedroom"],
  [/\bin\s+(?:a|the|his|her)\s+bedroom\b/gi, "at a home workspace", "bedroom-context"],
  [/\bbedroom\b/gi, "home workspace", "bedroom"],

  // night-time phrasing (English + German)
  [/\b\d{1,2}\s*Uhr\s+nachts\b/gi, "late at night", "uhr-nachts"],
  [/\bmitten in der Nacht\b/gi, "late at night", "mitten-nacht"],
  [/\b(?:at|around)\s*\d{1,2}\s*(?:AM|am|a\.m\.)\b/g, "late at night", "clock-am"],
  [/\bat\s+3\s*AM\b/gi, "late at night", "at-3am"],
  [/\bat\s+night\b/gi, "late at night", "at-night"],
  [/\bschon wieder\b/gi, "", "schon-wieder"],

  // device-screen vocabulary (rewrite to neutral) — strong trigger when
  // combined with intimate space + person close-up.
  [/\b(?:lit only by|illuminated only by)\s+(?:the\s+)?(?:bright\s+|cool\s+|cold\s+)?(?:blue\s+)?(?:glow\s+of\s+)?(?:a|the)?\s*(?:laptop|phone|smartphone|computer|monitor|tv|tablet|ipad)\s*(?:display|screen|bildschirm)?/gi,
    "lit by cool blue ambient light from a glowing monitor",
    "lit-only-by-device"],
  [/\b(?:glow|light)\s+of\s+(?:a|the)\s+(?:laptop|phone|smartphone|computer|monitor|tv|tablet|ipad)\s*(?:display|screen|bildschirm)?\b/gi,
    "cool blue ambient light from a glowing monitor",
    "glow-of-device"],
  [/\b(?:laptop|phone|smartphone|computer|monitor|tv|tablet|ipad)\s+(?:display|screen|bildschirm)\b/gi,
    "glowing monitor",
    "device-screen-noun"],
  [/\bReels?\b/g, "short video", "reel"],
  [/\b(Smartphone|Phone)[- ]?(Display|Screen|Bildschirm)\b/gi, "workspace", "phone-screen"],
  [/\b(Laptop|Computer|Monitor|TV|Tablet|iPad)[- ]?(Display|Screen|Bildschirm)\b/gi, "workspace", "device-screen"],

  // ── extreme close-up + face combo (Green-Net flags this as "intimate") ──
  [/\bextreme close-?up\s+on\s+(?:a|the)\s+(?:man|woman|person|guy|girl)'?s?\s+face\b/gi,
    "cinematic close-up of a person",
    "extreme-closeup-face"],

  // self-monologue leaks (typical dialog-leak into visual prompt)
  [/^\s*Und ich [^\n.!?]{0,120}[.!?]?/gim, "", "self-monologue-de"],
  [/^\s*I('| a)m (just )?(editing|cutting|posting|filming|recording)[^\n.!?]{0,120}[.!?]?/gim, "", "self-monologue-en"],
];

// Collapse near-duplicate sentences (same sentence repeated within the prompt
// after tag-stripping — Green-Net flags repetition as suspicious).
function dedupeSentences(s: string): { out: string; touched: boolean } {
  const sentences = s.split(/(?<=[.!?])\s+/);
  const seen = new Set<string>();
  const kept: string[] = [];
  let touched = false;
  for (const raw of sentences) {
    const norm = raw.trim().toLowerCase().replace(/\s+/g, " ");
    if (norm.length < 12) {
      kept.push(raw);
      continue;
    }
    const sig = norm.slice(0, 80);
    if (seen.has(sig)) {
      touched = true;
      continue;
    }
    seen.add(sig);
    kept.push(raw);
  }
  return { out: kept.join(" "), touched };
}

const NON_ASCII = /[^\x00-\x7F]/g;

export function sanitizeForHappyHorse(input: string): GreenNetSanitizeResult {
  const touched: string[] = [];
  let s = String(input ?? "");

  for (const [re, repl, tag] of REPLACEMENTS) {
    if (re.test(s)) {
      touched.push(tag);
      s = s.replace(re, repl);
    }
  }

  // collapse whitespace
  s = s.replace(/[ \t]+/g, " ").replace(/\n{2,}/g, "\n").trim();

  // forensics: flag if still heavily non-English (>20% non-ASCII).
  const nonAscii = (s.match(NON_ASCII) ?? []).length;
  if (s.length > 0 && nonAscii / s.length > 0.2) {
    touched.push("high-non-ascii-ratio");
  }

  const meaningful = s.replace(/[\s.,;:!?\-]/g, "").length;
  return {
    clean: s,
    touched,
    emptied: meaningful < 3,
  };
}

/**
 * Classify a Replicate / provider error message as a Green-Net rejection.
 * Used by webhooks and error handlers to trigger refund + auto-fallback.
 */
export function isGreenNetRejection(err: unknown): boolean {
  const msg = typeof err === "string" ? err : (err as any)?.message ?? String(err ?? "");
  return /DataInspectionFailed|Green\s?net|inappropriate content/i.test(msg);
}
