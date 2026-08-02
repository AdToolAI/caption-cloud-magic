// cast-clause.ts
// v370 — Single source of truth for the cast block inside image/video prompts.
//
// The HappyHorse plate prompt used to carry the cast in three competing
// shapes at once:
//   [Besetzung: Matthew Dusatko (Profil), Sarah Dusatko (Profil), Kailee]
//   Exactly four people in frame: in frame: Samuel Dusatko.
//   Exactly four people in frame: Samuel Dusatko.
// Duplicated, self-contradicting (count != names) and with a German bracket
// tag the provider reads as a role instruction — the classic trigger for
// `InvalidParameter - Could not process with this prompt`.
//
// This module builds ONE deterministic cast sentence from structured data and
// removes every other cast artefact. It is idempotent: running it twice on the
// same text yields byte-identical output.

const NUMBER_WORDS: Record<string, number> = {
  one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8,
  ein: 1, eine: 1, zwei: 2, drei: 3, vier: 4, fünf: 5, sechs: 6, sieben: 7, acht: 8,
};
const COUNT_WORDS = ["", "one", "two", "three", "four", "five", "six", "seven", "eight"];

/** Bracket tags that carry a cast list ("[Besetzung: …]", "[Cast: …]"). */
const CAST_TAG_RE = /\[\s*(?:besetzung|cast|castlist|cast\s*list|characters?)\s*:?\s*([^\]]*)\]/gi;

/**
 * "Exactly 4 distinct people: A, B, C" / "Exactly four people in frame: A".
 * Group 1 = count, group 2 = raw name blob (optional).
 */
const CAST_HEADER_RE =
  /\bexactly\s+(\d+|one|two|three|four|five|six|seven|eight)\s+(?:distinct\s+)?(?:people|persons|person)\b(?:\s+in\s+(?:the\s+)?frame)?\s*(?::\s*([^.;]*))?/gi;

const NAME_STOPWORDS = new Set([
  "all", "each", "every", "both", "the", "they", "no", "none", "and", "und",
  "locked", "exactly", "in", "frame", "people", "person", "persons", "profil",
  "profile", "visible", "standing", "framed", "captured",
]);

const NAME_SHAPE = /^[A-ZÄÖÜ][\p{L}'’.\-]*(?:\s+[A-ZÄÖÜ][\p{L}'’.\-]*){0,3}$/u;

/** "Matthew Dusatko (Profil)" → "Matthew Dusatko". */
export function normalizeCastName(raw: string): string {
  return String(raw ?? "")
    .replace(/\([^)]*\)/g, " ")
    .replace(/["„“”«»]/g, "")
    .replace(/[\s,;:]+$/g, "")
    .replace(/^[\s,;:\-–]+/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function isLikelyName(candidate: string): boolean {
  if (!candidate) return false;
  const lower = candidate.toLowerCase();
  if (NAME_STOPWORDS.has(lower)) return false;
  if (lower.split(/\s+/).some((w) => NAME_STOPWORDS.has(w) && w !== "de")) return false;
  if (candidate.length > 48) return false;
  return NAME_SHAPE.test(candidate);
}

/**
 * Parse a comma/and separated name blob. Stops at the first token that does
 * not look like a person name, so trailing prose ("all standing in a line")
 * never leaks into the cast list.
 */
export function parseNameList(blob: string): string[] {
  return parseNameListWithRest(blob).names;
}

/**
 * Like {@link parseNameList} but also returns the prose that follows the name
 * list ("…, all standing in a single line…"), so removing a cast header never
 * deletes the framing directives that share its sentence.
 */
export function parseNameListWithRest(
  blob: string,
): { names: string[]; rest: string } {
  const text = String(blob ?? "");
  const sep = /\s*(?:,|;|\band\b|\bund\b|&|\/)\s*/g;
  const names: string[] = [];
  let cursor = 0;

  while (cursor <= text.length) {
    sep.lastIndex = cursor;
    const m = sep.exec(text);
    const end = m ? m.index : text.length;
    const chunk = text.slice(cursor, end).replace(/\bin\s+frame\s*:/gi, " ");
    const name = normalizeCastName(chunk);
    if (!isLikelyName(name)) break;
    names.push(name);
    if (!m) {
      cursor = text.length;
      break;
    }
    cursor = sep.lastIndex;
  }

  return { names, rest: text.slice(cursor) };
}

function dedupeNames(names: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const n of names) {
    const key = n.toLowerCase();
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push(n);
  }
  return out;
}

/** Collect cast names from bracket tags and from existing cast headers. */
export function extractCastNames(text: string): string[] {
  const s = String(text ?? "");
  const names: string[] = [];
  for (const m of s.matchAll(CAST_TAG_RE)) names.push(...parseNameList(m[1] ?? ""));
  for (const m of s.matchAll(CAST_HEADER_RE)) names.push(...parseNameList(m[2] ?? ""));
  return dedupeNames(names);
}

/** Highest explicit people count stated anywhere in the text. */
export function extractCastCount(text: string): number {
  let max = 0;
  for (const m of String(text ?? "").matchAll(CAST_HEADER_RE)) {
    const raw = String(m[1] ?? "").toLowerCase();
    const n = NUMBER_WORDS[raw] ?? Number(raw);
    if (Number.isFinite(n) && n >= 1 && n <= 8) max = Math.max(max, n);
  }
  return max;
}

/**
 * Build the one canonical cast sentence. The stated number ALWAYS equals the
 * number of listed names when names are known.
 */
export function buildCastClause(names: string[], fallbackCount = 0): string | null {
  const clean = dedupeNames((names ?? []).map(normalizeCastName).filter(isLikelyName));
  const count = clean.length > 0 ? clean.length : Math.max(0, Math.min(8, fallbackCount));
  if (count <= 0) return null;
  const word = COUNT_WORDS[count] ?? String(count);
  const noun = count === 1 ? "person" : "people";
  return clean.length > 0
    ? `Exactly ${word} ${noun} in frame: ${clean.join(", ")}.`
    : `Exactly ${word} ${noun} in frame.`;
}

/** True when a whole sentence is nothing but a cast header. */
export function isCastClauseSentence(sentence: string): boolean {
  const s = String(sentence ?? "").trim();
  if (!s) return false;
  const stripped = s.replace(CAST_HEADER_RE, "").replace(/^[\s:,.;]+|[\s:,.;]+$/g, "");
  return stripped.length === 0;
}

export interface CastNormalizeResult {
  out: string;
  names: string[];
  count: number;
  clause: string | null;
  touched: string[];
}

/**
 * Remove every cast artefact from `text` and hoist ONE canonical cast clause
 * to the front. Idempotent.
 *
 * @param knownNames authoritative cast names (assignmentLock / dialog_turns);
 *                   they win over anything parsed out of the prompt text.
 */
export function normalizeCastInPrompt(
  text: string,
  knownNames: string[] = [],
): CastNormalizeResult {
  let s = String(text ?? "");
  const touched: string[] = [];

  const fromText = extractCastNames(s);
  const fallbackCount = extractCastCount(s);
  const names = dedupeNames([
    ...(knownNames ?? []).map(normalizeCastName).filter(isLikelyName),
    ...fromText,
  ]);

  // 1) drop cast bracket tags (names already rescued above)
  if (CAST_TAG_RE.test(s)) {
    CAST_TAG_RE.lastIndex = 0;
    s = s.replace(CAST_TAG_RE, " ");
    touched.push("cast-tag-stripped");
  }
  CAST_TAG_RE.lastIndex = 0;

  // 2) remove every inline cast header, keeping the surrounding prose
  let removedHeaders = 0;
  s = s.replace(CAST_HEADER_RE, (_m, _count, blob) => {
    removedHeaders++;
    // keep the prose that followed the name list (framing/blocking directives)
    const rest = parseNameListWithRest(String(blob ?? "")).rest;
    return rest ? ` ${rest.replace(/^[\s,;:]+/, "")}` : " ";
  });
  CAST_HEADER_RE.lastIndex = 0;
  if (removedHeaders > 1) touched.push("duplicate-cast-clause-removed");

  // 3) tidy the seams the removals left behind
  s = s
    .replace(/\s*,\s*,+/g, ", ")
    .replace(/[ \t]+/g, " ")
    .replace(/\s+([,.;])/g, "$1")
    .replace(/([.;])\s*,/g, "$1")
    .replace(/(^|[.!?]\s+)[,;:]\s*/g, "$1")
    .trim();
  s = s.replace(/(^|[.!?]\s+)([a-zäöü])/g, (_m, pre, ch) => pre + ch.toUpperCase());

  const clause = buildCastClause(names, fallbackCount);
  const count = clause ? (names.length > 0 ? names.length : fallbackCount) : 0;

  if (clause) {
    s = s ? `${clause} ${s}` : clause;
    touched.push("cast-clause-canonical");
  }

  return { out: s.trim(), names, count, clause, touched };
}

export interface CastContractIssue {
  code: "bracket_tag" | "duplicate_cast_clause" | "count_name_mismatch";
  detail: string;
}

/** Pre-dispatch contract check — cheap, no rewriting. */
export function validateCastContract(text: string): {
  ok: boolean;
  issues: CastContractIssue[];
} {
  const s = String(text ?? "");
  const issues: CastContractIssue[] = [];

  CAST_TAG_RE.lastIndex = 0;
  if (CAST_TAG_RE.test(s)) {
    issues.push({ code: "bracket_tag", detail: "cast bracket tag still present" });
  }
  CAST_TAG_RE.lastIndex = 0;

  const headers = [...s.matchAll(CAST_HEADER_RE)];
  CAST_HEADER_RE.lastIndex = 0;
  if (headers.length > 1) {
    issues.push({
      code: "duplicate_cast_clause",
      detail: `${headers.length} cast clauses`,
    });
  }
  for (const h of headers) {
    const raw = String(h[1] ?? "").toLowerCase();
    const stated = NUMBER_WORDS[raw] ?? Number(raw);
    const listed = parseNameList(h[2] ?? "").length;
    if (listed > 0 && Number.isFinite(stated) && stated !== listed) {
      issues.push({
        code: "count_name_mismatch",
        detail: `stated ${stated} vs listed ${listed}`,
      });
    }
  }

  return { ok: issues.length === 0, issues };
}
