// Auto-injects a dialog summary into the scene prompt as a deterministic,
// idempotent marker pair:
//
//   [Dialog] Spoken dialog (visible lip-sync): Matthew says: "Welcome…".
//   Sarah replies: "Tired of wasting hours…". [/Dialog] <rest of prompt>
//
// - Idempotent: re-running with the same blocks doesn't duplicate the marker.
// - Updates: a new script replaces the existing marker.
// - Cleanup: empty blocks remove the marker entirely.
// - The spoken-lines body is always English so AI video models can interpret
//   it as an actual mouth/expression directive.

import type { DialogBlock } from '@/lib/talking-head/parseDialogScript';

type Lang = 'de' | 'en' | 'es';

// Tolerant matcher: matches the wrapper-pair anywhere at start, plus the
// legacy `[Dialog: …]` single-bracket marker so older prompts get cleaned up.
const WRAPPER_RE = /^\s*\[Dialog\][\s\S]*?\[\/Dialog\]\s*/i;
const LEGACY_RE = /^\s*\[(?:Dialog|Diálogo)\s*:\s*[^\]]*\]\s*/i;

function stripExistingMarker(prompt: string): string {
  return prompt.replace(WRAPPER_RE, '').replace(LEGACY_RE, '');
}

function snippet(text: string, max = 240): string {
  const t = text.trim().replace(/\s+/g, ' ');
  return t.length <= max ? t : t.slice(0, max - 1).trimEnd() + '…';
}

/** English spoken-lines body. Always English regardless of UI language.
 *  IMPORTANT: We deliberately do NOT pass the literal spoken text into the
 *  prompt. Modern i2v / t2v models (Hailuo, Kling, Wan, Sora…) tend to
 *  render quoted strings as on-screen captions, which then appears as
 *  burned-in subtitles in the final video. The actual words are spoken via
 *  the ElevenLabs voiceover track — the prompt only needs to describe the
 *  speaking behaviour and forbid on-screen text. */
export function buildSpokenLinesBlock(blocks: DialogBlock[]): string {
  if (!blocks?.length) return '';
  const speakers = Array.from(new Set(blocks.map((b) => b.speakerName).filter(Boolean)));
  const who =
    speakers.length === 0
      ? 'the character'
      : speakers.length === 1
      ? speakers[0]
      : `${speakers.slice(0, -1).join(', ')} and ${speakers[speakers.length - 1]}`;
  return `${who} ${speakers.length > 1 ? 'are' : 'is'} speaking to camera with natural, subtle lip-sync mouth movement and matching facial expression. Do NOT render any on-screen text, captions, subtitles, signs, watermarks, logos or written words anywhere in the frame.`;
}

export function applyDialogToPrompt(
  prompt: string,
  blocks: DialogBlock[] | undefined,
  _lang: Lang = 'de',
): string {
  const prose = stripExistingMarker(prompt || '');
  const list = (blocks ?? []).filter((b) => b && b.text?.trim());
  if (list.length === 0) return prose.trimStart();

  const body = buildSpokenLinesBlock(list);
  const marker = `[Dialog] ${body} [/Dialog] `;
  return marker + prose.trimStart();
}
