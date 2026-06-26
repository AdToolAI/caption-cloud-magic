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
  // typography
  [/[…]+/g, ", ", "ellipsis"],
  [/[„""«»]/g, "", "smart-quote"],
  [/'/g, "'", "smart-apostrophe"],

  // night-time phrasing
  [/\b\d{1,2}\s*Uhr\s+nachts\b/gi, "late at night", "uhr-nachts"],
  [/\bmitten in der Nacht\b/gi, "late at night", "mitten-nacht"],
  [/\bschon wieder\b/gi, "", "schon-wieder"],

  // device-screen vocabulary (rewrite to neutral)
  [/\bReels?\b/g, "short video", "reel"],
  [/\b(Smartphone|Phone)[- ]?(Display|Screen|Bildschirm)\b/gi, "workspace", "phone-screen"],
  [/\b(Laptop|Computer|Monitor|TV|Tablet|iPad)[- ]?(Display|Screen|Bildschirm)\b/gi, "workspace", "device-screen"],

  // self-monologue leaks (typical dialog-leak into visual prompt)
  [/^\s*Und ich [^\n.!?]{0,120}[.!?]?/gim, "", "self-monologue-de"],
  [/^\s*I('| a)m (just )?(editing|cutting|posting|filming|recording)[^\n.!?]{0,120}[.!?]?/gim, "", "self-monologue-en"],
];

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
