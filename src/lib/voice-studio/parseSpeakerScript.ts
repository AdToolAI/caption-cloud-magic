/**
 * parseSpeakerScript — Multi-speaker voiceover parser.
 *
 * Accepted formats per line:
 *   Sarah: Hello and welcome.
 *   **Matthew:** Thanks Sarah.
 *   [Sarah] Anything else?
 *   Matthew - Sounds great.
 *
 * Continuation lines without a speaker prefix are appended to the previous
 * segment. Empty lines reset the current speaker (forces a fresh prefix).
 *
 * No cast lookup required — the parser derives a normalized `speakerId` from
 * the raw name (lowercase, ascii-folded). The UI maps each speakerId to an
 * engine + voice via the SpeakerMappingBar.
 */

export interface SpeakerSegment {
  /** Normalized id (lowercase first name, e.g. "sarah"). */
  speakerId: string;
  /** Display name as written in the script (e.g. "Sarah"). */
  speakerName: string;
  /** Spoken text for this segment (whitespace-collapsed). */
  text: string;
  /** Optional inline tags found in the original line, e.g. ["whisper"]. */
  tags?: string[];
}

const LINE_RE =
  /^\s*(?:\*\*)?\[?\s*([A-Za-zÀ-ÿ][A-Za-zÀ-ÿ0-9 _.'-]{0,40})\s*\]?(?:\*\*)?\s*[:—–-]\s*(.+)$/;

const TAG_RE = /\[(pause|whisper|excited|sad|laugh|angry|soft|shout)\]/gi;

export function normalizeSpeakerId(name: string): string {
  return name
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim()
    .split(/\s+/)[0]
    .replace(/[^a-z0-9]/g, '');
}

export function parseSpeakerScript(script: string): SpeakerSegment[] {
  const out: SpeakerSegment[] = [];
  if (!script?.trim()) return out;

  const lines = script.split(/\r?\n/);
  let current: SpeakerSegment | null = null;

  for (const raw of lines) {
    const line = raw.trim();
    if (!line) {
      current = null;
      continue;
    }
    const m = LINE_RE.exec(line);
    if (m) {
      const speakerName = m[1].trim();
      let text = m[2].trim();
      const tags: string[] = [];
      text = text.replace(TAG_RE, (_, tag) => {
        tags.push(String(tag).toLowerCase());
        return '';
      }).replace(/\s+/g, ' ').trim();
      current = {
        speakerId: normalizeSpeakerId(speakerName),
        speakerName,
        text,
        tags: tags.length ? tags : undefined,
      };
      if (current.text) out.push(current);
      continue;
    }
    // Continuation line → append to previous block.
    if (current) {
      current.text = (current.text + ' ' + line).replace(/\s+/g, ' ').trim();
    }
  }
  return out;
}

/** Unique speaker list in script order (id + first-seen display name). */
export function uniqueSpeakers(
  segments: SpeakerSegment[],
): Array<{ speakerId: string; speakerName: string }> {
  const seen = new Map<string, string>();
  for (const s of segments) {
    if (!seen.has(s.speakerId)) seen.set(s.speakerId, s.speakerName);
  }
  return Array.from(seen, ([speakerId, speakerName]) => ({ speakerId, speakerName }));
}

/** True when the script contains 2+ distinct speakers (i.e. multi-speaker mode). */
export function isMultiSpeakerScript(script: string): boolean {
  return uniqueSpeakers(parseSpeakerScript(script)).length >= 2;
}
