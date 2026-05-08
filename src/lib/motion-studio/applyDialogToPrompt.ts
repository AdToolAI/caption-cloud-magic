// Auto-injects a dialog summary into the scene prompt as a deterministic marker:
//
//   [Dialog: Matthew → "Welcome…", Sarah → "Tired of…"] <rest of prompt>
//
// - Idempotent: re-running with the same blocks doesn't duplicate the marker.
// - Updates: a new script replaces the existing marker.
// - Cleanup: empty blocks remove the marker entirely.
// - Localised label per UI language.

import type { DialogBlock } from '@/lib/talking-head/parseDialogScript';

type Lang = 'de' | 'en' | 'es';

const LABEL: Record<Lang, string> = {
  de: 'Dialog',
  en: 'Dialog',
  es: 'Diálogo',
};

const MARKER_RE = /^\s*\[(?:Dialog|Diálogo)\s*:\s*[^\]]*\]\s*/i;

function stripExistingMarker(prompt: string): string {
  return prompt.replace(MARKER_RE, '');
}

function snippet(text: string, max = 60): string {
  const t = text.trim().replace(/\s+/g, ' ');
  return t.length <= max ? t : t.slice(0, max - 1).trimEnd() + '…';
}

export function applyDialogToPrompt(
  prompt: string,
  blocks: DialogBlock[] | undefined,
  lang: Lang = 'de',
): string {
  const prose = stripExistingMarker(prompt || '');
  const list = (blocks ?? []).filter((b) => b && b.text?.trim());
  if (list.length === 0) return prose.trimStart();

  const tokens = list.map((b) => `${b.speakerName} → "${snippet(b.text)}"`);
  const marker = `[${LABEL[lang]}: ${tokens.join(', ')}] `;
  return marker + prose.trimStart();
}
