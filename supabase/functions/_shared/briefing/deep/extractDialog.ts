/**
 * v421 — Deterministischer Dialog-Extraktor.
 *
 * EINZIGE Quelle für `dialogTurns`. Das Sprachmodell liefert Struktur,
 * Bildsprache und Timing — aber keine Sprecherzeilen mehr. Dialog steht im
 * Briefing wörtlich; ihn "erkennen" zu lassen erfand Sprecher, machte aus
 * Blocklabels (`DAUER:`, `ORT:`, `CAST:`) Mentions und verlor die Reihenfolge.
 *
 * Erkannt werden:
 *   1. `@mention: "Text"` — auch mehrfach mitten in einem Prosablock,
 *      gerade und typografische Anführungszeichen.
 *   2. `@mention: Text` am Zeilenanfang (ohne Anführungszeichen).
 *   3. `Name: "Text"` / `Name: Text` am Zeilenanfang, wenn `Name` eindeutig
 *      einem Cast-Slot entspricht.
 *
 * Blocklabels sind strukturell ausgeschlossen (`isNonSpeakerLabel`).
 */

import { isNonSpeakerLabel } from './detectScriptTimingMode.ts';

export interface ExtractedTurn {
  mentionKey: string; // "@founder"
  text: string;
}

export interface ExtractedSceneDialog {
  /** 1-based scene index as written in the briefing (SZENE 1 → 1). */
  index: number;
  turns: ExtractedTurn[];
}

const OPEN_Q = '"\u201C\u201E\u00AB\u2018\u201A\u0027';
const CLOSE_Q = '"\u201D\u201C\u201E\u00BB\u2019\u2018\u0027';

const QUOTED_RE = new RegExp(
  `@([a-z0-9][a-z0-9_-]{1,47})\\s*:\\s*[${OPEN_Q}]([^${CLOSE_Q}]{1,600})[${CLOSE_Q}]`,
  'gi',
);

const LINE_MENTION_RE = /^\s*@([a-z0-9][a-z0-9_-]{1,47})\s*:\s*(.+)$/i;
const LINE_NAME_RE = /^\s*([A-Za-zÄÖÜäöüßÁÉÍÓÚÑ][A-Za-zÄÖÜäöüßÁÉÍÓÚÑ0-9.\- ]{1,40}?)\s*:\s*(.+)$/;

export function normalizeMentionKey(v: string): string {
  return String(v ?? '')
    .trim()
    .toLowerCase()
    .replace(/^@/, '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/ß/g, 'ss')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function stripQuotes(v: string): string {
  return String(v ?? '')
    .trim()
    .replace(new RegExp(`^[${OPEN_Q}]+`), '')
    .replace(new RegExp(`[${CLOSE_Q}]+$`), '')
    .trim();
}

/** Splits the briefing into SZENE/SCENE/ESCENA blocks. One block when none. */
export function splitBriefingScenes(briefing: string): Array<{ index: number; body: string }> {
  const src = String(briefing ?? '');
  const re = /(?:^|\n)\s*(?:#+\s*)?(?:szene|scene|escena)\s*(\d{1,2})\b[^\n]*/gi;
  const marks: Array<{ index: number; start: number; end: number }> = [];
  for (const m of src.matchAll(re)) {
    const at = (m.index ?? 0) + m[0].length;
    marks.push({ index: parseInt(m[1], 10), start: at, end: src.length });
  }
  if (!marks.length) return [{ index: 1, body: src }];
  for (let i = 0; i < marks.length - 1; i++) {
    marks[i].end = src.indexOf('\n', marks[i + 1].start - 1) >= 0 ? marks[i + 1].start : marks[i].end;
  }
  // Recompute ends precisely: a block ends where the next marker begins.
  const starts: number[] = [];
  for (const m of src.matchAll(/(?:^|\n)\s*(?:#+\s*)?(?:szene|scene|escena)\s*\d{1,2}\b/gi)) {
    starts.push(m.index ?? 0);
  }
  marks.forEach((mk, i) => {
    const nextStart = starts[i + 1];
    mk.end = nextStart != null && nextStart > mk.start ? nextStart : src.length;
  });
  return marks.map((mk) => ({ index: mk.index, body: src.slice(mk.start, mk.end) }));
}

/**
 * Extracts dialogue turns from one briefing block.
 * `allowedMentions` = the scene's cast mention keys (normalized, without "@").
 * `nameToMention` maps a character display name (normalized) to its mention.
 */
export function extractTurnsFromBlock(
  body: string,
  allowedMentions: Set<string>,
  nameToMention?: Map<string, string>,
): ExtractedTurn[] {
  const src = String(body ?? '');
  const turns: ExtractedTurn[] = [];
  const accept = (rawMention: string, rawText: string) => {
    const key = normalizeMentionKey(rawMention);
    if (!key || isNonSpeakerLabel(key)) return;
    if (allowedMentions.size && !allowedMentions.has(key)) return;
    const text = stripQuotes(rawText);
    if (!text || text.length < 2) return;
    turns.push({ mentionKey: `@${key}`, text });
  };

  // 1) Quoted inline dialogue — the authoritative form.
  for (const m of src.matchAll(QUOTED_RE)) accept(m[1], m[2]);
  if (turns.length) return turns;

  // 2) Line-based forms.
  for (const rawLine of src.split('\n')) {
    const line = rawLine.trim();
    if (!line) continue;
    const mm = line.match(LINE_MENTION_RE);
    if (mm) {
      accept(mm[1], mm[2]);
      continue;
    }
    const nm = line.match(LINE_NAME_RE);
    if (!nm) continue;
    const label = nm[1].trim();
    if (isNonSpeakerLabel(label)) continue;
    const mapped = nameToMention?.get(normalizeMentionKey(label));
    if (!mapped) continue;
    accept(mapped, nm[2]);
  }
  return turns;
}

/** Removes `@mention: "…"` quotes from prose so prompts don't duplicate them. */
export function stripQuotedDialog(text: string): string {
  return String(text ?? '')
    .replace(QUOTED_RE, '')
    .replace(/[ \t]{2,}/g, ' ')
    .replace(/\s+([.,;:])/g, '$1')
    .trim();
}
