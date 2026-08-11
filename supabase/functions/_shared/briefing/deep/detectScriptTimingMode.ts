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
  /** J6 — 'ensemble_showcase' (split-screen w/ all speakers, no dialog),
   *  'endcard' (branding, no speaker), or null for regular dialog shots. */
  sceneKind?: 'ensemble_showcase' | 'endcard' | null;
  /** J4 — Free-text "Location:" line inside the shot's briefing block. */
  locationHint?: string | null;
  /** J6 — On-screen overlay/text-caption for endcards. */
  overlayText?: string | null;
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
 * Split a body into scenes using top-level markers. Two-pass:
 *   Pass A: match only "SZENE N" / "SCENE N" as top-level.
 *   Pass B: only if Pass A yields 0 markers, match "SHOT N" as top-level.
 *
 * Sub-shot markers ("Shot 1A", "Shot 1B") that appear *inside* a Szene block
 * are read as dialogTurn boundaries: each Shot Xy captures the next speaker
 * line PLUS any per-sub-shot duration ("Shot 1A (2.5s)"), and the scene's
 * `durationSec` is derived by summing sub-shot durations when explicit.
 */
function extractByShotMarkers(body: string): DetectedShot[] {
  const src = String(body ?? '');
  const runPass = (re: RegExp) => {
    const marks: Array<{ index: number; head: string; contentStart: number; headStart: number; end: number }> = [];
    for (const m of src.matchAll(re)) {
      const idx = parseInt(m[1], 10);
      if (!Number.isFinite(idx)) continue;
      const headStart = m.index ?? 0;
      const contentStart = headStart + m[0].length;
      marks.push({ index: idx, head: m[2] ?? '', headStart, contentStart, end: src.length });
    }
    // Block ends BEFORE the next heading so we don't leak "Szene 2" into
    // scene 1's dialog.
    for (let i = 0; i < marks.length - 1; i++) marks[i].end = marks[i + 1].headStart;
    return marks;
  };
  // Pass A — Szene/Scene ONLY (top-level).
  let marks = runPass(/(?:^|\n)\s*(?:szene|scene)\s*(\d{1,2})\b([^\n]*)/gi);
  // Pass B — fall back to Shot as top-level when no Szene markers exist.
  if (marks.length === 0) {
    marks = runPass(/(?:^|\n)\s*shot\s*(\d{1,2})\b([^\n]*)/gi);
  }
  if (marks.length === 0) return [];

  const shots: DetectedShot[] = [];
  for (const mk of marks) {
    const block = src.slice(mk.contentStart, mk.end);
    const headTiming = parseTimeWindow(mk.head);
    const lines = block.split('\n').map(stripLine).filter(Boolean);

    // Walk the block line-by-line so we can attach a "Shot 1A (2.5s)" heading
    // to the *next* speaker line as a per-turn duration.
    const turns: Array<DetectedTurn & { durationSec: number | null }> = [];
    let pendingSubDuration: number | null = null;
    for (const line of lines) {
      const subShotMatch = line.match(/^(?:shot|sub-?shot)\s*\d+[a-z]?\b([^\n]*)/i);
      if (subShotMatch) {
        const t = parseTimeWindow(subShotMatch[1] ?? '');
        pendingSubDuration = t.durationSec ?? null;
        continue;
      }
      const dl = line.match(
        /^([A-ZÄÖÜ][A-Za-zÄÖÜäöüß0-9\-\.\s]{1,40}?)\s*(?:[\[(]([^\])]*)[\])])?\s*[:—-]\s+(.+)$/,
      );
      if (!dl) continue;
      const label = dl[1].trim();
      if (NON_SPEAKER_LABELS.test(label)) continue;
      const inlineTiming = dl[2] ? parseTimeWindow(`(${dl[2]})`).durationSec : null;
      const text = dl[3].trim();
      if (!text) continue;
      turns.push({
        speakerLabel: label,
        text,
        durationSec: inlineTiming ?? pendingSubDuration,
      });
      pendingSubDuration = null;
    }

    // Scene duration: explicit header timing wins, else sum of sub-shot
    // durations when *all* turns carry a duration, else null.
    let durationSec: number | null = headTiming.durationSec;
    if (durationSec == null && turns.length > 0 && turns.every((t) => t.durationSec != null)) {
      durationSec = turns.reduce((a, t) => a + (t.durationSec ?? 0), 0);
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
      dialogTurns: turns.map((t) => ({ speakerLabel: t.speakerLabel, text: t.text })),
      startSec: headTiming.startSec,
      endSec: headTiming.endSec,
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
  // Common continuous-scene form: "0–3s Sprecher 1: Text". These are
  // internal turns unless an explicit scene-count contract says otherwise.
  const timedPrefixRe =
    /^\s*(\d{1,3}(?:[,.]\d+)?)\s*[-–—]\s*(\d{1,3}(?:[,.]\d+)?)\s*(?:s|sek\.?|sekunden|sec\.?|seconds)?\s+(?:Sprecher|Speaker|Talent|Person|Charakter|Character|Rolle|Role)\s*(\d{1,2})\s*[:—-]\s*(.+?)\s*$/gim;
  const shots: DetectedShot[] = [];
  let i = 0;
  for (const m of src.matchAll(timedPrefixRe)) {
    i += 1;
    const start = parseFloat(String(m[1]).replace(',', '.'));
    const end = parseFloat(String(m[2]).replace(',', '.'));
    const durationSec = Number.isFinite(start) && Number.isFinite(end) && end > start
      ? Math.round((end - start) * 10) / 10
      : null;
    const label = `Sprecher ${parseInt(m[3], 10)}`;
    shots.push({
      index: i,
      speakerLabel: label,
      text: stripLine(m[4]),
      dialogTurns: [],
      startSec: Number.isFinite(start) ? start : null,
      endSec: Number.isFinite(end) ? end : null,
      durationSec,
    });
  }
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

/**
 * J1 — Sub-Shot markers as canonical scenes.
 *
 * Briefings frequently structure content as top-level "SZENE N" containers
 * with nested "Shot 1A / 1B / 2A / …" sub-shots that carry their own time
 * windows (in a "Zeit: ca. 0–2,5 Sekunden" line or in the header). When the
 * user names ≥3 sub-shots each with their own timing, THOSE are the real
 * scenes — merging them back to top-level Szene containers collapses the
 * intended shot structure and loses per-speaker durations.
 *
 * This detector runs BEFORE `extractByShotMarkers`. Only fires when it finds
 * ≥3 sub-shot markers so it can't misfire on ambiguous prose.
 */
function extractBySubShotMarkers(body: string): DetectedShot[] {
  const src = String(body ?? '');
  const re = /(?:^|\n)\s*shot\s*(\d{1,2})\s*([a-zA-Z])\b([^\n]*)/gi;
  const marks: Array<{ label: string; head: string; contentStart: number; headStart: number; end: number }> = [];
  for (const m of src.matchAll(re)) {
    const label = `${m[1]}${(m[2] ?? '').toUpperCase()}`;
    const headStart = m.index ?? 0;
    marks.push({ label, head: m[3] ?? '', headStart, contentStart: headStart + m[0].length, end: src.length });
  }
  if (marks.length < 3) return [];
  for (let i = 0; i < marks.length - 1; i++) marks[i].end = marks[i + 1].headStart;

  const shots: DetectedShot[] = [];
  marks.forEach((mk, idx) => {
    const block = src.slice(mk.contentStart, mk.end);

    // Timing: prefer header ("Shot 1A (0-2,5s)"), else a "Zeit:" line.
    let timing = parseTimeWindow(mk.head);
    if (timing.durationSec == null) {
      const zeitRange = block.match(
        /(?:zeit|time|dauer)\s*:?\s*(?:ca\.?\s*)?([\d]+(?:[.,]\d+)?)\s*[-–—]\s*([\d]+(?:[.,]\d+)?)\s*(?:sek\w*|sec\w*|s\b)/i,
      );
      if (zeitRange) {
        const a = parseFloat(zeitRange[1].replace(',', '.'));
        const b = parseFloat(zeitRange[2].replace(',', '.'));
        if (Number.isFinite(a) && Number.isFinite(b) && b > a) {
          timing = { startSec: a, endSec: b, durationSec: Math.round((b - a) * 10) / 10 };
        }
      } else {
        const zeitSingle = block.match(
          /(?:zeit|time|dauer)\s*:?\s*(?:ca\.?\s*)?([\d]+(?:[.,]\d+)?)\s*(?:sek\w*|sec\w*|s\b)/i,
        );
        if (zeitSingle) {
          const d = parseFloat(zeitSingle[1].replace(',', '.'));
          if (Number.isFinite(d) && d > 0 && d <= 120) {
            timing = { startSec: null, endSec: null, durationSec: d };
          }
        }
      }
    }

    // Speaker label: "Shot 1A — Sprecher 1" style header suffix.
    let speakerLabel: string | null = null;
    const spkInHead = mk.head.match(/[-–—]\s*(sprecher\s*\d+|speaker\s*\d+|talent\s*\d+)/i);
    if (spkInHead) speakerLabel = spkInHead[1].replace(/\s+/g, ' ').trim();

    // Spoken text: prefer "Text:" section with quoted body.
    let text = '';
    const textLabel = block.match(
      /(?:^|\n)\s*(?:text|dialog|dialogue|voiceover|vo)\s*:?\s*\n?\s*[„"'"]?([^\n"„"'"]{2,400})[""'"„]?/i,
    );
    if (textLabel) text = stripLine(textLabel[1]).replace(/^[„"'"]+|["""'"„]+$/g, '');
    if (!text) {
      const anyQuote = block.match(/[„"'"]([^\n"„"'"]{3,400})[""'"„]/);
      if (anyQuote) text = stripLine(anyQuote[1]);
    }

    // J4 — location freetext: "Location: <text>" or "Setting: <text>" or
    // "Ort: <text>". Take the first line only.
    let locationHint: string | null = null;
    const locMatch = block.match(/(?:^|\n)\s*(?:location|setting|ort|schauplatz)\s*:\s*([^\n]{3,200})/i);
    if (locMatch) locationHint = stripLine(locMatch[1]).replace(/[.,;:]+$/, '');

    // J6 — showcase vs endcard vs regular dialog shot.
    let sceneKind: 'ensemble_showcase' | 'endcard' | null = null;
    let overlayText: string | null = null;
    const headAndBlock = `${mk.head}\n${block}`;
    if (/\b(?:endcard|end[- ]?card|outro|branding|logo[- ]?reveal|call[- ]?to[- ]?action|cta[- ]?card)\b/i.test(headAndBlock)) {
      sceneKind = 'endcard';
      const overlayMatch = block.match(/(?:^|\n)\s*(?:overlay|caption|onscreen|on[- ]?screen|text)\s*:\s*([^\n]{2,120})/i);
      if (overlayMatch) overlayText = stripLine(overlayMatch[1]).replace(/^[„"'"]+|["""'"„]+$/g, '');
    } else if (/\b(?:split[- ]?screen|multi[- ]?frame|showcase|quad[- ]?split|ensemble\s+shot)\b/i.test(headAndBlock)) {
      sceneKind = 'ensemble_showcase';
    }
    // Endcards have no dialog by definition.
    const finalText = sceneKind === 'endcard' ? '' : text;
    const finalSpeaker = sceneKind === 'endcard' ? null : speakerLabel;

    shots.push({
      index: idx + 1,
      speakerLabel: finalSpeaker,
      text: finalText,
      dialogTurns: finalText && finalSpeaker ? [{ speakerLabel: finalSpeaker, text: finalText }] : [],
      startSec: timing.startSec,
      endSec: timing.endSec,
      durationSec: timing.durationSec,
      sceneKind,
      locationHint,
      overlayText,
    });
  });
  return shots;
}

export function detectScriptTimingMode(briefing: string): ScriptTimingInfo {
  const { body, source } = pickScriptBody(briefing);
  const trimmed = String(body ?? '').trim();
  if (!trimmed) {
    return { mode: 'FREETEXT', source: 'none', shots: [], computedTotalSec: null };
  }

  // Tier 1a — explicit SZENE/SCENE/SHOT top-level markers WIN when present
  // (>= 2). Top-level briefing hierarchy takes precedence over nested sub-shots.
  const marker = extractByShotMarkers(trimmed);
  const subs = extractBySubShotMarkers(trimmed);
  if (marker.length >= 2) {
    const allTimed = marker.every((s) => s.durationSec != null);
    return {
      mode: 'SHOT_MARKERS',
      source,
      shots: marker,
      computedTotalSec: allTimed ? marker.reduce((a, s) => a + (s.durationSec ?? 0), 0) : null,
    };
  }

  // J1 — Sub-shot markers as a fallback when no top-level SZENE present.
  if (subs.length >= 3) {
    const allTimed = subs.every((s) => s.durationSec != null);
    return {
      mode: 'SHOT_MARKERS',
      source,
      shots: subs,
      computedTotalSec: allTimed ? subs.reduce((a, s) => a + (s.durationSec ?? 0), 0) : null,
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
