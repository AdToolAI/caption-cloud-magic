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

// ─────────────────────────────────────────────────────────────────────────
// v316 — Lip-Ready Compressor
//
// The cinematic-sync master plate prompt grew to ~2.4k chars saturated with
// mouth/lip/jaw/breathing/swallow/whisper vocabulary plus long negative
// cascades ("no lip-flap, no chewing pattern, no whispering shapes").
// Green Net reads negations as positives and treats dense mouth/body
// descriptions of people as intimate content → DataInspectionFailed even
// for a harmless office-elevator scene.
//
// The compressor collapses that choreography into one neutral sentence,
// drops negative lists, harmonises contradictory people counts and caps the
// length. Lip-sync quality is unaffected: the mouth is driven by sync-3 in
// post, not by the plate prompt.
// ─────────────────────────────────────────────────────────────────────────

const MOUTH_TOKENS = [
  "mouth", "lip", "lips", "lip-line", "lip-flap", "jaw", "whisper", "whispering",
  "swallow", "chewing", "syllable", "syllables", "muttering", "breathing",
  "nose", "teeth", "tongue",
];

const NEUTRAL_FACE_CLAUSE =
  "Everyone has a calm, natural, neutral facial expression with the face fully visible and unobstructed.";
const NEUTRAL_IDLE_CLAUSE =
  "Everyone shows subtle natural idle motion; heads stay steady, eyes open and alert.";
const CAMERA_LOCK_CLAUSE =
  "Locked static tripod shot with fixed framing for the entire clip.";

const NUMBER_WORDS: Record<string, number> = {
  one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8,
};
const COUNT_WORDS = ["", "one", "two", "three", "four", "five", "six", "seven", "eight"];

function countMouthTokens(sentence: string): number {
  const lower = sentence.toLowerCase();
  let n = 0;
  for (const t of MOUTH_TOKENS) {
    if (new RegExp(`\\b${t}\\b`).test(lower)) n++;
  }
  return n;
}

/** A sentence that is essentially a negative list ("No X, no Y, no Z."). */
function isNegativeList(sentence: string): boolean {
  const lower = sentence.toLowerCase();
  const negs = (lower.match(/\bno\b|\bnever\b|\bwithout\b/g) ?? []).length;
  if (negs === 0) return false;
  const words = lower.split(/\s+/).filter(Boolean).length || 1;
  return negs >= 3 || negs / words > 0.18;
}

function splitSentences(s: string): string[] {
  return s
    .split(/(?<=[.!?])\s+/)
    .map((x) => x.trim())
    .filter(Boolean);
}

function capAtSentenceBoundary(s: string, max: number): string {
  if (s.length <= max) return s;
  const parts = splitSentences(s);
  const kept: string[] = [];
  let len = 0;
  for (const p of parts) {
    if (len + p.length + 1 > max) break;
    kept.push(p);
    len += p.length + 1;
  }
  if (kept.length === 0) return s.slice(0, max).replace(/\s+\S*$/, "") + ".";
  return kept.join(" ");
}

export interface LipReadyCompressResult {
  out: string;
  touched: string[];
}

/**
 * Collapse the lip-sync master-plate choreography into Green-Net-safe text.
 * `hard` shortens further (used for the automatic retry after a rejection).
 */
export function compressLipReadyPlate(input: string, hard = false): LipReadyCompressResult {
  const touched: string[] = [];
  let s = String(input ?? "");

  // 1) numbered directive blocks ("[3 SHOT] …", "[8 NEGATIVE] …") and the
  //    legacy "no on-screen text" tail.
  if (/\[\s*\d+\s+NEGATIVE\s*\]/i.test(s)) {
    s = s.replace(/\[\s*\d+\s+NEGATIVE\s*\][^.]*\.?/gi, "");
    touched.push("negative-block");
  }
  if (/\[\s*\d+\s+[A-Z]+\s*\]/.test(s)) {
    s = s.replace(/\[\s*\d+\s+([A-Z]+)\s*\]/g, "");
    touched.push("numbered-directive-tag");
  }
  if (/no on-screen text/i.test(s)) {
    s = s.replace(/,?\s*no on-screen text[^.]*\.?/gi, "");
    touched.push("no-onscreen-text-tail");
  }

  // 1b) rescue the cast lock BEFORE the mouth-block filter deletes it —
  //     "Exactly 2 distinct people: Samuel Dusatko, …" sits inside the same
  //     sentence as the mouth/jaw directive.
  let castClause = "";
  let castCount = 0;
  const exact = s.match(
    /\bexactly\s+(\d+|one|two|three|four|five|six|seven|eight)\s+(?:distinct\s+)?(?:people|persons|person)\s*:?\s*([^,.;—]*)/i,
  );
  if (exact) {
    const raw = exact[1].toLowerCase();
    const n = NUMBER_WORDS[raw] ?? Number(raw);
    if (Number.isFinite(n) && n >= 1 && n <= 8) {
      castCount = n;
      const names = (exact[2] || "").trim().replace(/\s+/g, " ");
      const word = COUNT_WORDS[n] ?? String(n);
      castClause = names
        ? `Exactly ${word} ${n === 1 ? "person" : "people"} in frame: ${names}.`
        : `Exactly ${word} ${n === 1 ? "person" : "people"} in frame.`;
      touched.push("cast-lock-preserved");
    }
  }

  // 1c) internal bracket tags ("[Besetzung: … ]") read as role instructions.
  if (/\[[^\]]*\]/.test(s)) {
    s = s.replace(/\[[^\]]*\]/g, " ");
    touched.push("bracket-tag");
  }

  // 2) sentence-level pass: drop mouth-choreography and negative lists.
  const sentences = splitSentences(s);
  const kept: string[] = [];
  let droppedMouth = false;
  let droppedNegative = false;
  let droppedCamera = false;

  for (const sentence of sentences) {
    const lower = sentence.toLowerCase();
    const mouthHits = countMouthTokens(sentence);
    const cameraLock =
      /\b(locked|static)\b/.test(lower) && /\bcamera\b/.test(lower);

    if (cameraLock) {
      droppedCamera = true;
      continue;
    }
    if (mouthHits >= 2 || (hard && mouthHits >= 1)) {
      droppedMouth = true;
      continue;
    }
    if (isNegativeList(sentence)) {
      droppedNegative = true;
      continue;
    }
    kept.push(sentence);
  }

  if (castClause) kept.unshift(castClause);
  if (droppedMouth) {
    touched.push("mouth-choreography-collapsed");
    kept.push(NEUTRAL_FACE_CLAUSE);
    if (!hard) kept.push(NEUTRAL_IDLE_CLAUSE);
  }
  if (droppedNegative) touched.push("negative-list-dropped");
  if (droppedCamera) {
    touched.push("camera-lock-collapsed");
    kept.push(CAMERA_LOCK_CLAUSE);
  }
  s = kept.join(" ");

  // 3) harmonise contradictory people counts against the cast lock.
  if (castCount > 0) {
    const word = COUNT_WORDS[castCount] ?? String(castCount);
    const before = s;
    let first = true;
    s = s.replace(
      /\b(one|two|three|four|five|six|seven|eight|\d+)\s+(people|persons)\b/gi,
      (m, num) => {
        if (first) { first = false; return m; } // keep the cast clause itself
        const val = NUMBER_WORDS[String(num).toLowerCase()] ?? Number(num);
        return val === castCount ? m : `${word} ${castCount === 1 ? "person" : "people"}`;
      },
    );
    if (s !== before) touched.push("people-count-harmonised");
  }


  // 4) whitespace + length cap.
  s = s.replace(/\s*,\s*,+/g, ",").replace(/[ \t]+/g, " ").replace(/\s+([,.])/g, "$1").trim();
  const cap = hard ? 520 : 900;
  if (s.length > cap) {
    s = capAtSentenceBoundary(s, cap);
    touched.push(hard ? "length-cap-hard" : "length-cap");
  }

  return { out: s, touched };
}

export function sanitizeForHappyHorse(
  input: string,
  opts: { compress?: boolean; hard?: boolean } = {},
): GreenNetSanitizeResult {
  const touched: string[] = [];
  let s = String(input ?? "");

  const compress = opts.compress !== false;
  if (compress) {
    const c = compressLipReadyPlate(s, opts.hard === true);
    if (c.touched.length > 0) {
      touched.push(...c.touched);
      s = c.out;
    }
  }

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

/** Aggressive variant used for the single automatic retry after a rejection. */
export function hardSanitizeForHappyHorse(input: string): GreenNetSanitizeResult {
  return sanitizeForHappyHorse(input, { compress: true, hard: true });
}


/**
 * Classify a Replicate / provider error message as a Green-Net rejection.
 * Used by webhooks and error handlers to trigger refund + auto-fallback.
 */
export function isGreenNetRejection(err: unknown): boolean {
  const msg = typeof err === "string" ? err : (err as any)?.message ?? String(err ?? "");
  return /DataInspectionFailed|Green\s?net|inappropriate content/i.test(msg);
}
