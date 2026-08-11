import { describe, expect, it } from 'vitest';
import {
  detectScriptTimingMode,
  isNonSpeakerLabel,
} from '../../../../supabase/functions/_shared/briefing/deep/detectScriptTimingMode.ts';

/**
 * v420 — Briefing-Blocklabels ("DAUER:", "ORT:", "CAST:") dürfen niemals als
 * Sprecher erkannt werden. Genau daran scheiterte die Sprecher-Zuordnung:
 * der Plan enthielt 11 Dialog-Turns mit @dauer/@ort/@cast/@aktion.
 */

const STRUCTURED_BRIEFING = `
SZENE 1 (30s)
DAUER: 30 Sekunden
ORT: @studio-loft
CAST: @founder, @creative, @marketer, @creator
AKTION: Alle vier sitzen gemeinsam an einem Tisch.
KAMERA: Slow push-in
STIMME: warm, souverän
UNTERTITEL: an
NEGATIVE-PROMPT: blurry, watermark

SZENE 2 (30s)
DAUER: 30 Sekunden
ORT: @studio-loft
AKTION: Gruppenbild, Kamera zieht auf.
`;

const REAL_DIALOG_BRIEFING = `
SZENE 1 (30s)
ORT: @studio-loft
Samuel: Wir haben zu viele Tools.
Kailee: Genau deshalb gibt es AdTool AI.
`;

describe('isNonSpeakerLabel', () => {
  it('erkennt Briefing-Blocklabels in DE/EN/ES', () => {
    for (const label of [
      'DAUER', 'Dauer', 'ORT', 'CAST', 'AKTION', 'STIMME', 'UNTERTITEL',
      'Negative-Prompt', 'Negative Prompt', 'Zielgruppe', 'Tonalität',
      'Duration', 'Location', 'Duración', 'Reparto', 'Übergang',
    ]) {
      expect(isNonSpeakerLabel(label), label).toBe(true);
    }
  });

  it('lässt echte Sprechernamen durch', () => {
    for (const name of ['Samuel', 'Samuel Dusatko', 'Kailee', 'Sarah Dusatko', 'Matthew']) {
      expect(isNonSpeakerLabel(name), name).toBe(false);
    }
  });
});

describe('detectScriptTimingMode', () => {
  it('erzeugt aus reinen Strukturzeilen keine Dialog-Turns', () => {
    const info = detectScriptTimingMode(STRUCTURED_BRIEFING);
    const turns = info.shots.flatMap((s) => s.dialogTurns);
    expect(turns).toHaveLength(0);
    expect(info.shots.every((s) => !s.speakerLabel)).toBe(true);
  });

  it('erkennt echte Dialogzeilen weiterhin', () => {
    const info = detectScriptTimingMode(REAL_DIALOG_BRIEFING);
    const labels = info.shots
      .flatMap((s) => (s.dialogTurns.length ? s.dialogTurns.map((t) => t.speakerLabel) : [s.speakerLabel]))
      .filter(Boolean);
    expect(labels).toEqual(['Samuel', 'Kailee']);
  });

});
