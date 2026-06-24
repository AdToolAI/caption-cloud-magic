/**
 * parseDialogScript — Shared screenplay-style dialog parser.
 *
 * Format (one block per line):
 *   Sarah: Hi! Welcome to our store.
 *   Matthew: Thanks Sarah, what do you recommend?
 *
 * Phase C — Tonality markers (optional, after the speaker name):
 *   Sarah [whisper]: Come closer…
 *   Matthew [shouting]: WATCH OUT!
 *
 * Returns one DialogBlock per matched line. Continuation lines (without a
 * "NAME:" prefix) are appended to the previous block's text.
 *
 * Speaker matching is case-insensitive and falls back to first-name match,
 * so "Sarah:" resolves to "Sarah Dusatko" in the cast.
 *
 * Used by:
 *  - components/video-composer/TalkingHeadDialog.tsx (Dialog tab)
 *  - components/video-composer/SceneDialogStudio.tsx (per-scene inline studio)
 */

import type { ComposerCharacter } from '@/types/video-composer';
import {
  normalizeTonalityMarker,
  type DialogTonalityId,
} from '@/config/dialogTonalityPresets';

export interface DialogBlock {
  speakerId: string;
  speakerName: string;
  text: string;
  /** Real TTS duration in seconds (set after voiceover is generated). */
  durationSec?: number;
  /** Cumulative start offset within the scene, in seconds (0-based). */
  startSec?: number;
  /** Optional per-line tonality marker. Drives ElevenLabs voice_settings modulation. */
  tonality?: DialogTonalityId;
}

/**
 * Primary form: `Name [— Mood]? [tonality]?: text` — requires a colon.
 * Captures: 1=name, 2=mood (after em/en/hyphen dash), 3=bracket tonality, 4=text.
 */
const LINE_RE_PRIMARY =
  /^\s*([A-Za-zÀ-ÿ][A-Za-zÀ-ÿ0-9 _.'-]{0,60}?)\s*(?:[—–-]\s*([A-Za-zÀ-ÿ ]{1,32}?))?\s*(?:\[([^\]]{1,32})\])?\s*:\s*(.+)$/;

/**
 * Fallback form: `Name [tonality]? — text` — em-dash / en-dash / hyphen as
 * the only separator (legacy screenplays without a trailing colon).
 */
const LINE_RE_FALLBACK =
  /^\s*([A-Za-zÀ-ÿ][A-Za-zÀ-ÿ0-9 _.'-]{0,60})\s*(?:\[([^\]]{1,32})\])?\s*[—–-]\s*(.+)$/;

export function parseDialogScript(
  script: string,
  cast: ComposerCharacter[],
): DialogBlock[] {
  const blocks: DialogBlock[] = [];
  if (!script?.trim()) return blocks;

  const lines = script.split(/\r?\n/);
  let current: DialogBlock | null = null;

  for (const raw of lines) {
    const line = raw.trim();
    if (!line) {
      current = null;
      continue;
    }
    let speakerName: string | undefined;
    let moodRaw: string | undefined;
    let tonalityRaw: string | undefined;
    let text: string | undefined;
    const mP = LINE_RE_PRIMARY.exec(line);
    if (mP) {
      speakerName = mP[1].trim();
      moodRaw = mP[2]?.trim();
      tonalityRaw = mP[3]?.trim();
      text = mP[4].trim();
    } else {
      const mF = LINE_RE_FALLBACK.exec(line);
      if (mF) {
        speakerName = mF[1].trim();
        tonalityRaw = mF[2]?.trim();
        text = mF[3].trim();
      }
    }
    if (speakerName && text) {
      const spk = speakerName.toLowerCase();
      const spkFirst = spk.split(/\s+/)[0];
      const c = cast.find((x) => {
        const xn = (x.name || '').toLowerCase();
        if (!xn) return false;
        const xnFirst = xn.split(/\s+/)[0];
        return (
          xn === spk ||
          xnFirst === spk ||           // cast "Sarah Dusatko" ↔ script "Sarah"
          xn === spkFirst ||           // cast "Sarah" ↔ script "Sarah Dusatko"
          xnFirst === spkFirst ||      // both share a first name
          xn.includes(spkFirst) ||     // tolerant substring
          spk.includes(xnFirst)
        );
      });
      if (c) {
        const tonality =
          normalizeTonalityMarker(tonalityRaw) ??
          normalizeTonalityMarker(moodRaw);
        current = { speakerId: c.id, speakerName: c.name, text, tonality };
        blocks.push(current);
        continue;
      }
    }
    // Continuation line → append to last block.
    if (current) current.text += ' ' + line;
  }
  return blocks;
}

/** De-duplicated speaker list in script order. */
export function uniqueSpeakers(
  blocks: DialogBlock[],
  cast: ComposerCharacter[],
): ComposerCharacter[] {
  return Array.from(new Set(blocks.map((b) => b.speakerId)))
    .map((id) => cast.find((c) => c.id === id)!)
    .filter(Boolean);
}
