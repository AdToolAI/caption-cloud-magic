import { describe, it, expect } from 'vitest';
import {
  splitBriefingScenes,
  extractTurnsFromBlock,
  stripQuotedDialog,
} from '../../../../supabase/functions/_shared/briefing/deep/extractDialog.ts';

const BRIEFING = `
## Cast
- @founder (library:11111111-1111-1111-1111-111111111111)
- @creative (library:22222222-2222-2222-2222-222222222222)

SZENE 1
DAUER: 30 Sekunden
ORT: @studio-loft
AKTION: Der Founder dreht sich um. @founder: "Wir starten jetzt." Dann Schnitt, @creative: „Endlich!"

SZENE 2
AKTION: Beide lachen.
@creative: "Das war's."
`;

describe('v421 deterministic dialog extractor', () => {
  it('splits scenes by SZENE markers', () => {
    const blocks = splitBriefingScenes(BRIEFING);
    expect(blocks.map((b) => b.index)).toEqual([1, 2]);
    expect(blocks[0].body).toContain('Wir starten jetzt');
    expect(blocks[1].body).toContain("Das war's");
  });

  it('extracts inline quoted dialogue and ignores structure labels', () => {
    const blocks = splitBriefingScenes(BRIEFING);
    const allowed = new Set(['founder', 'creative']);
    const turns = extractTurnsFromBlock(blocks[0].body, allowed);
    expect(turns).toEqual([
      { mentionKey: '@founder', text: 'Wir starten jetzt.' },
      { mentionKey: '@creative', text: 'Endlich!' },
    ]);
    expect(turns.some((t) => t.mentionKey.includes('dauer') || t.mentionKey.includes('ort'))).toBe(false);
  });

  it('drops mentions that are not part of the scene cast', () => {
    const turns = extractTurnsFromBlock('@ghost: "Hallo"', new Set(['founder']));
    expect(turns).toEqual([]);
  });

  it('falls back to line-start mentions without quotes', () => {
    const turns = extractTurnsFromBlock('@founder: Wir starten jetzt.', new Set(['founder']));
    expect(turns).toEqual([{ mentionKey: '@founder', text: 'Wir starten jetzt.' }]);
  });

  it('strips quoted dialogue from prose', () => {
    const out = stripQuotedDialog('Der Founder dreht sich um. @founder: "Wir starten." Dann Schnitt.');
    expect(out).not.toContain('Wir starten');
    expect(out).toContain('Dann Schnitt.');
  });
});
