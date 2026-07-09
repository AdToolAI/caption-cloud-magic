/**
 * G1 — Script-Timing Detector.
 *
 * Classifies the briefing into one of three tiers so the pipeline can decide
 * whose duration wins (script vs. board) and how many scenes to emit:
 *
 *   Tier 1  SHOT_MARKERS   — explicit "SZENE N" / "Shot N" / "S01" markers
 *                            OR "Sprecher N (0-3s)" style shots with time
 *                            windows. → Script wins, one scene per marker,
 *                            board `totalDurationSec` is IGNORED.
 *   Tier 2  SPEAKER_BLOCKS — "Sprecher 1: …", "Sarah: …" blocks without
 *                            timing. → One scene per speaker turn, total
 *                            duration from board split proportionally.
 *   Tier 3  FREETEXT       — no structured script signals. → Board wins
 *                            (current legacy behavior).
 *
 * The detector is deterministic and side-effect-free. It reads both the raw
 * briefing text and any "## Verbatim Script" block emitted by the client
 * (LITERAL mode), preferring the fenced script when present.
 */

export type ScriptTimingMode = 'SHOT_MARKERS' | 'SPEAKER_BLOCKS' | 'FREETEXT';

export interface DetectedTurn {
  speakerLabel: string;
  text: string;
}

export interface DetectedShot {
  /** 1-based shot index (matches SZENE N when explicit). */
  index: number;
  /** Speaker label as written in the briefing (e.g. "Sprecher 1", "Sarah"). */
  speakerLabel: string | null;
  /** Spoken text for the shot, verbatim (joined turns for legacy consumers). */
  text: string;
  /**
   * Sub-turns inside this top-level shot when the block contains multiple
   * "Sprecher N:" / named-speaker lines (e.g. Shot 1A + 1B inside SZENE 1).
   * Empty when the shot is a single-speaker block.
   */
  dialogTurns: DetectedTurn[];
  /** Explicit start/end in seconds when a "[0-3s]" style marker was found. */
  startSec: number | null;
  endSec: number | null;
  /** Explicit duration when parseable ("(3s)" / "[0-3s]"). */
  durationSec: number | null;
}

export interface ScriptTimingInfo {
  mode: ScriptTimingMode;
  /** Source the mode was inferred from ('verbatim' = ## Verbatim Script). */
  source: 'verbatim' | 'briefing' | 'none';
  shots: DetectedShot[];
  /** Sum of explicit shot durations when all shots carry a duration. */
  computedTotalSec: number | null;
}

const NON_SPEAKER_LABELS =
  /^(szene|scene|shot|kamera|framing|mood|note|tone|dialog|dialogue|voiceover|vo|hook|reveal|cta|pain|proof|beat|setting|location|action|takt|jingle|musik|music|onscreen|caption|regie|director)$/i;

function stripLine(s: string): string {
  return String(s ?? '').replace(/^\s+|\s+$/g, '');
}

function pickScriptBody(briefing: string): { body: string; source: 'verbatim' | 'briefing' | 'none' } {
  const src = String(briefing ?? '');
  const fenced = src.match(/##\s+Verbatim\s+Script[^\n]*\n```[a-z]*\n([\s\S]*?)\n```/i);
  if (fenced) return { body: fenced[1], source: 'verbatim' };
  const plain = src.match(/##\s+Verbatim\s+Script[^\n]*\n([\s\S]*?)(?:\n##\s+|$)/i);
  if (plain) return { body: plain[1], source: 'verbatim' };
  // No dedicated block — inspect the raw briefing.
  return { body: src, source: 'briefing' };
}

function parseTimeWindow(head: string): { startSec: number | null; endSec: number | null; durationSec: number | null } {
  // Accept "[0-3s]", "(0-3s)", "0–3s", "3s", "(3s)".
  const range = head.match(/[\[(]?\s*(\d{1,3})\s*[-–]\s*(\d{1,3})\s*s?\s*[\])]?/);
  if (range) {
    const a = parseInt(range[1], 10);
    const b = parseInt(range[2], 10);
    if (Number.isFinite(a) && Number.isFinite(b) && b > a) {
      return { startSec: a, endSec: b, durationSec: b - a };
    }
  }
  const single = head.match(/[\[(]?\s*(\d{1,3})\s*s\b\s*[\])]?/);
  if (single) {
    const d = parseInt(single[1], 10);
    if (Number.isFinite(d) && d > 0 && d <= 120) {
      return { startSec: null, endSec: null, durationSec: d };
    }
  }
  return { startSec: null, endSec: null, durationSec: null };
}

/**
 * Split a body into shots using strict SZENE/SCENE/SHOT markers. Returns
 * an empty array when no markers are present.
 */
function extractByShotMarkers(body: string): DetectedShot[] {
  const src = String(body ?? '');
  const markerRe = /(?:^|\n)\s*(?:szene|scene|shot)\s*(\d{1,2})\b([^\n]*)/gi;
  const marks: Array<{ index: number; head: string; start: number; end: number }> = [];
  for (const m of src.matchAll(markerRe)) {
    const idx = parseInt(m[1], 10);
    if (!Number.isFinite(idx)) continue;
    const start = (m.index ?? 0) + m[0].length;
    marks.push({ index: idx, head: m[2] ?? '', start, end: src.length });
  }
  if (marks.length === 0) return [];
  for (let i = 0; i < marks.length - 1; i++) marks[i].end = marks[i + 1].start;

  const shots: DetectedShot[] = [];
  for (const mk of marks) {
    const block = src.slice(mk.start, mk.end);
    const { startSec, endSec, durationSec } = parseTimeWindow(mk.head);
    const lines = block.split('\n').map(stripLine).filter(Boolean);
    // Collect ALL speaker/turn lines inside the SZENE block. Multiple
    // "Sprecher N:" / "Sarah:" lines become sub-turns of this scene.
    const turns: DetectedTurn[] = [];
    for (const line of lines) {
      // Skip sub-shot heading lines ("Shot 1A", "1A —", "Framing: …").
      if (/^(?:shot|sub-?shot)\s*\d+[a-z]?\b/i.test(line)) continue;
      // "Sprecher 1 (0-3s): Text" OR "Sarah: Text" OR "Sarah — Text".
      const dl = line.match(
        /^([A-ZÄÖÜ][A-Za-zÄÖÜäöüß0-9\-\.\s]{1,40}?)\s*(?:[\[(][^\])]*[\])])?\s*[:—-]\s+(.+)$/,
      );
      if (!dl) continue;
      const label = dl[1].trim();
      if (NON_SPEAKER_LABELS.test(label)) continue;
      const text = dl[2].trim();
      if (!text) continue;
      turns.push({ speakerLabel: label, text });
    }
    let speakerLabel: string | null = null;
    let text = '';
    if (turns.length > 0) {
      speakerLabel = turns[0].speakerLabel;
      text = turns.map((t) => t.text).join(' ').trim();
    } else {
      text = lines.join(' ').trim();
    }
    shots.push({
      index: mk.index,
      speakerLabel,
      text,
      dialogTurns: turns,
      startSec,
      endSec,
      durationSec,
    });
  }
  return shots;
}

/**
 * "Sprecher 1 (0-3s): Text" style lines — very common in short-form ad
 * briefings. One shot per line.
 */
function extractBySpeakerWithTiming(body: string): DetectedShot[] {
  const src = String(body ?? '');
  // Handles Sprecher/Speaker/Talent 1..9 optionally followed by "(0-3s)" or "[0-3s]".
  const re =
    /^\s*(?:Sprecher|Speaker|Talent|Person|Charakter|Character|Rolle|Role)\s*(\d{1,2})\s*([\[(][^\])]*[\])])?\s*[:—-]\s*(.+?)\s*$/gim;
  const shots: DetectedShot[] = [];
  let i = 0;
  for (const m of src.matchAll(re)) {
    i += 1;
    const label = `Sprecher ${parseInt(m[1], 10)}`;
    const timingRaw = m[2] ?? '';
    const { startSec, endSec, durationSec } = parseTimeWindow(timingRaw);
    shots.push({
      index: i,
      speakerLabel: label,
      text: stripLine(m[3]),
      dialogTurns: [],
      startSec,
      endSec,
      durationSec,
    });
  }
  return shots;
}

/**
 * Named speakers ("Sarah: …", "Matthew: …") without timing. Falls into
 * Tier 2. One shot per line.
 */
function extractByNamedSpeakerBlocks(body: string): DetectedShot[] {
  const src = String(body ?? '');
  const shots: DetectedShot[] = [];
  let i = 0;
  for (const rawLine of src.split('\n')) {
    const line = stripLine(rawLine);
    if (!line) continue;
    const m = line.match(/^([A-ZÄÖÜ][A-Za-zÄÖÜäöüß0-9\-\.\s]{1,40}?)\s*[:—-]\s+(.+)$/);
    if (!m) continue;
    const label = stripLine(m[1]);
    if (NON_SPEAKER_LABELS.test(label)) continue;
    if (/^(sprecher|speaker|talent|person|charakter|character|rolle|role)\s*\d+/i.test(label)) continue;
    i += 1;
    shots.push({
      index: i,
      speakerLabel: label,
      text: stripLine(m[2]),
      dialogTurns: [],
      startSec: null,
      endSec: null,
      durationSec: null,
    });
  }
  return shots;
}

export function detectScriptTimingMode(briefing: string): ScriptTimingInfo {
  const { body, source } = pickScriptBody(briefing);
  const trimmed = String(body ?? '').trim();
  if (!trimmed) {
    return { mode: 'FREETEXT', source: 'none', shots: [], computedTotalSec: null };
  }

  // Tier 1a — explicit SZENE/SCENE/SHOT markers.
  const marker = extractByShotMarkers(trimmed);
  if (marker.length >= 2) {
    const allTimed = marker.every((s) => s.durationSec != null);
    return {
      mode: 'SHOT_MARKERS',
      source,
      shots: marker,
      computedTotalSec: allTimed ? marker.reduce((a, s) => a + (s.durationSec ?? 0), 0) : null,
    };
  }

  // Tier 1b — Sprecher/Speaker N with explicit timings.
  const numbered = extractBySpeakerWithTiming(trimmed);
  if (numbered.length >= 2 && numbered.every((s) => s.durationSec != null)) {
    return {
      mode: 'SHOT_MARKERS',
      source,
      shots: numbered,
      computedTotalSec: numbered.reduce((a, s) => a + (s.durationSec ?? 0), 0),
    };
  }

  // Tier 1c — Sprecher/Speaker N without timings but multiple → still Tier 1
  // when we're inside a Verbatim Script fence (the user meant these to be
  // shot-level directives, script wins). Otherwise treat as Tier 2.
  if (numbered.length >= 2 && source === 'verbatim') {
    return {
      mode: 'SHOT_MARKERS',
      source,
      shots: numbered,
      computedTotalSec: null,
    };
  }
  if (numbered.length >= 2) {
    return {
      mode: 'SPEAKER_BLOCKS',
      source,
      shots: numbered,
      computedTotalSec: null,
    };
  }

  // Tier 2 — Named speakers.
  const named = extractByNamedSpeakerBlocks(trimmed);
  if (named.length >= 2) {
    return {
      mode: 'SPEAKER_BLOCKS',
      source,
      shots: named,
      computedTotalSec: null,
    };
  }

  return { mode: 'FREETEXT', source, shots: [], computedTotalSec: null };
}
