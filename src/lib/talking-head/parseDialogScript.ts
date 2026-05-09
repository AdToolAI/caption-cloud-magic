/**
 * parseDialogScript — Shared screenplay-style dialog parser.
 *
 * Format (one block per line):
 *   Sarah: Hi! Welcome to our store.
 *   Matthew: Thanks Sarah, what do you recommend?
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

export interface DialogBlock {
  speakerId: string;
  speakerName: string;
  text: string;
  /** Real TTS duration in seconds (set after voiceover is generated). */
  durationSec?: number;
  /** Cumulative start offset within the scene, in seconds (0-based). */
  startSec?: number;
}

const LINE_RE = /^\s*([A-Za-zÀ-ÿ][A-Za-zÀ-ÿ0-9 _.-]{0,40})\s*[:—-]\s*(.+)$/;

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
    const m = LINE_RE.exec(line);
    if (m) {
      const speakerName = m[1].trim();
      const text = m[2].trim();
      const spk = speakerName.toLowerCase();
      const spkFirst = spk.split(/\s+/)[0];
      const c = cast.find((x) => {
        const xn = x.name.toLowerCase();
        const xnFirst = xn.split(/\s+/)[0];
        return (
          xn === spk ||
          xnFirst === spk ||           // cast "Sarah Dusatko" ↔ script "Sarah"
          xn === spkFirst ||           // cast "Sarah" ↔ script "Sarah Dusatko"
          xnFirst === spkFirst         // both share a first name
        );
      });
      if (c) {
        current = { speakerId: c.id, speakerName: c.name, text };
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
