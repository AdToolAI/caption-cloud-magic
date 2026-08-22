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

  // ── v223: multi-speaker prompt slim ────────────────────────────────────
  // "Four speakers, X, Y, Z, and W, are ..." → "X, Y, Z, and W are ..."
  // Green Net flags the enumerator ("N speakers, …") as role-instruction.
  [/\b(?:Two|Three|Four|Five|Six|Seven|Eight)\s+speakers?,\s*/gi, "", "speaker-count-prefix"],
  // "Samuel Dusatko is speaking[, while the others are visible and attentive]."
  // → strip entirely; speaker binding lives in dialog_turns, not the image prompt.
  [/\s*[A-Z][a-zA-Z]+(?:\s+[A-Z][a-zA-Z]+){0,2}\s+is\s+speaking(?:,\s*while\s+[^.]+)?\.?/g, "", "is-speaking-suffix"],
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

/**
 * v455 — Negations-Kompression (nur HappyHorse).
 *
 * Lange "no X, no Y, no Z"-Ketten sind semantisch redundant: die gleiche
 * Absicht lässt sich positiv formulieren. Wir entfernen sie deshalb aus dem
 * Payload und ersetzen sie durch kurze positive Direktiven. Topologie-,
 * Identitäts- und Handlungsvorgaben bleiben erhalten (die positiven
 * Ersatzsätze tragen exakt dieselbe Anforderung).
 *
 * Das ist reine Risikoreduktion — der Provider hat KEIN auslösendes Wort
 * genannt.
 */
const POSITIVE_DIRECTIVES: Array<[RegExp, string]> = [
  [
    /\b(cut|cuts|zoom|push-?in|pull-?out|dolly|crane|pan|tilt|reframing|shot change|transition|split-?screen|grid|panel)\b/i,
    "one single continuous shot in one shared frame, camera locked on a tripod with constant framing",
  ],
  [
    /\b(lip-?flap|chewing|muttering|mouth|jaw|syllable|whisper|nodding|bobbing|squint|sleepy|closed eyes)\b/i,
    "mouths stay calmly closed in a natural resting position and eyes stay open and alert",
  ],
  [
    /\b(humans?|bystanders?|people|person|character|posters?|screens?)\b/i,
    "only the described cast is present in the frame",
  ],
  [
    /\b(rendered text|text|caption|subtitle|watermark|logo)\b/i,
    "a clean frame free of on-screen text",
  ],
];

function positiveFor(negClauses: string[]): string[] {
  const out: string[] = [];
  for (const [re, positive] of POSITIVE_DIRECTIVES) {
    if (negClauses.some((c) => re.test(c)) && !out.includes(positive)) {
      out.push(positive);
    }
  }
  return out;
}

const NEG_CLAUSE = /^\s*(?:and\s+)?(?:no|never|not)\b/i;

export function compressNegations(input: string): { out: string; touched: boolean } {
  const sentences = String(input ?? "").split(/(?<=[.!?])\s+/);
  let touched = false;
  const rebuilt = sentences.map((sentence) => {
    const clauses = sentence.split(/,\s*/);
    const negatives = clauses.filter((c) => NEG_CLAUSE.test(c));
    if (negatives.length < 2) return sentence;
    touched = true;
    const positives = clauses.filter((c) => !NEG_CLAUSE.test(c));
    const trailing = /[.!?]\s*$/.test(sentence) ? "." : "";
    const kept = positives
      .join(", ")
      .replace(/[\s,;.]+$/, "")
      .trim();
    const directives = positiveFor(negatives).join("; ");
    const merged = [kept, directives].filter(Boolean).join(kept ? "; " : "");
    return merged ? merged + trailing : "";
  });
  return { out: rebuilt.filter((s) => s.trim().length > 0).join(" ").trim(), touched };
}

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

  // dedupe repeated sentences (after tag/word rewrites a sentence often
  // appears twice — that pattern itself is a Green-Net heuristic).
  const dd = dedupeSentences(s);
  if (dd.touched) touched.push("dedupe-sentences");
  s = dd.out;

  // v455 — harte Negativlisten in positive Direktiven überführen.
  const cn = compressNegations(s);
  if (cn.touched) touched.push("compress-negations");
  s = cn.out;

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

/** v455 — stabile interne Klasse für Provider-Eingabefilter. */
export const PROVIDER_INPUT_FILTER_CLASS = "provider_input_filter";

export type ProviderRejectionClass = "none" | "input_filter" | "invalid_prompt";

/**
 * v455 — Provider-Ablehnungen, die AM IDENTISCHEN PAYLOAD terminal sind.
 * Ein automatischer Retry mit exakt demselben Prompt kann hier nur erneut
 * scheitern und verbrennt Zeit/Kredit.
 */
export function classifyProviderRejection(err: unknown): ProviderRejectionClass {
  const msg = typeof err === "string" ? err : (err as any)?.message ?? String(err ?? "");
  if (!msg) return "none";
  if (isGreenNetRejection(msg)) return "input_filter";
  if (/InvalidParameter|could not process with this prompt/i.test(msg)) {
    return "invalid_prompt";
  }
  return "none";
}

