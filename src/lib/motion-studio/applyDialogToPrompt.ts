// Auto-injects a dialog summary into the scene prompt as a deterministic,
// idempotent marker pair:
//
//   [Dialog]
//   Audio plan (exact, do not deviate):
//   - 0.00s–3.42s  Matthew Dusatko speaks: "Welcome…"
//   - 3.57s–7.18s  Sarah Dusatko speaks: "Tired of…"
//   Total spoken duration: 7.18s. Use this exact speaker order and timing
//   for lip-sync.
//   Do NOT render any on-screen text, captions, …
//   [/Dialog]
//
// - Idempotent: re-running with the same blocks doesn't duplicate the marker.
// - Updates: a new script replaces the existing marker.
// - Cleanup: empty blocks remove the marker entirely.
// - Falls back to a plain spoken-lines body when no per-block durations exist
//   yet (i.e. before the user clicks "Generate voiceover").
// - The body is always English so AI video models can interpret it as an
//   actual mouth/expression directive.

import type { DialogBlock } from '@/lib/talking-head/parseDialogScript';

type Lang = 'de' | 'en' | 'es';

/** Default breath between consecutive speakers, in seconds. Single source of
 *  truth — the SceneDialogStudio uses the same constant when computing the
 *  cumulative `startSec` per block. */
export const INTER_SPEAKER_GAP_SEC = 0.15;

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

function fmtSec(n: number): string {
  return (Math.round(n * 100) / 100).toFixed(2);
}

const NEGATIVE_CAPTION_RULE =
  'Do NOT render any on-screen text, captions, subtitles, signs, watermarks, logos or written words anywhere in the frame.';

/** English spoken-lines body. Two variants:
 *  1. **Audio-plan variant** (when every block has a real `durationSec`):
 *     emits exact `start–end` ranges per speaker plus a total duration.
 *     This is what the AI video / lip-sync engine should treat as ground
 *     truth — same data Artlist's "Audio Plan" passes downstream.
 *  2. **Sprachlicher Fallback** (no durations yet): natural-language summary
 *     of speakers + lines, like before. */
export function buildSpokenLinesBlock(blocks: DialogBlock[]): string {
  if (!blocks?.length) return '';

  const haveTiming = blocks.every(
    (b) => typeof b.durationSec === 'number' && b.durationSec > 0,
  );

  if (haveTiming) {
    let cursor = 0;
    const lines: string[] = [];
    for (const b of blocks) {
      const start =
        typeof b.startSec === 'number' && b.startSec >= 0 ? b.startSec : cursor;
      const end = start + (b.durationSec ?? 0);
      lines.push(
        `- ${fmtSec(start)}s–${fmtSec(end)}s  ${b.speakerName} speaks: "${snippet(b.text, 200)}"`,
      );
      cursor = end + INTER_SPEAKER_GAP_SEC;
    }
    const total = cursor - INTER_SPEAKER_GAP_SEC;
    return [
      'Audio plan (exact, do not deviate):',
      ...lines,
      `Total spoken duration: ${fmtSec(total)}s. Use this exact speaker order and timing for lip-sync.`,
      NEGATIVE_CAPTION_RULE,
    ].join('\n');
  }

  // Fallback: no per-block timing yet — keep the previous textual body.
  const speakers = Array.from(new Set(blocks.map((b) => b.speakerName).filter(Boolean)));
  const intro =
    speakers.length <= 1
      ? `${speakers[0] ?? 'The character'} speaks to camera with natural, subtle lip-sync mouth movement and matching facial expression.`
      : `${speakers.slice(0, -1).join(', ')} and ${speakers[speakers.length - 1]} speak to camera in turns with natural, subtle lip-sync mouth movement and matching facial expression. Timing must follow this exact speaker order.`;
  const lines = blocks
    .map((b) => `- ${b.speakerName} says: "${snippet(b.text, 200)}"`)
    .join('\n');
  return `${intro}\n${lines}\n${NEGATIVE_CAPTION_RULE}`;
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
  const marker = `[Dialog]\n${body}\n[/Dialog]\n\n`;
  return marker + prose.trimStart();
}
