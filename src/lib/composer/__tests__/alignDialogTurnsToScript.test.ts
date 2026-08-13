import { describe, it, expect } from 'vitest';
import { alignDialogTurnsToScript, parseScriptLines, type CanonicalTurn } from '../alignDialogTurnsToScript';

const MATTHEW = '11111111-1111-4111-8111-111111111111';
const SARAH = '22222222-2222-4222-8222-222222222222';
const KAILEE = '33333333-3333-4333-8333-333333333333';
const SAMUEL = '44444444-4444-4444-8444-444444444444';

const cast = [
  { id: MATTHEW, name: 'Matthew Dusatko' },
  { id: SARAH, name: 'Sarah Dusatko' },
  { id: KAILEE, name: 'Kailee' },
  { id: SAMUEL, name: 'Samuel Dusatko' },
];

const resolveSpeakerId = (name: string) => {
  const b = name.toLowerCase().trim();
  const hit = cast.find((c) => {
    const a = c.name.toLowerCase();
    return a === b || a.split(/\s+/)[0] === b.split(/\s+/)[0];
  });
  return hit ?? null;
};

const turns: CanonicalTurn[] = [
  { turnId: 't1', characterId: MATTHEW, text: 'Ganz ehrlich, fünf Tools.', order: 0 },
  { turnId: 't2', characterId: SARAH, text: 'Video, Bilder, Stimmen.', order: 1 },
  { turnId: 't3', characterId: KAILEE, text: 'Und wenn der Kunde ändert.', order: 2 },
  { turnId: 't4', characterId: SAMUEL, text: 'Alles in ein Studio.', order: 3 },
  { turnId: 't5', characterId: MATTHEW, text: 'Alles in ein einziges?', order: 4 },
  { turnId: 't6', characterId: SAMUEL, text: 'Alles.', order: 5 },
];

describe('parseScriptLines', () => {
  it('splits name and text and skips blanks', () => {
    expect(parseScriptLines('Sarah: Hallo\n\nKailee: Ja')).toEqual([
      { speakerName: 'Sarah', text: 'Hallo' },
      { speakerName: 'Kailee', text: 'Ja' },
    ]);
  });
});

describe('alignDialogTurnsToScript', () => {
  it('shortens the turn list when the script is shortened', () => {
    const script = [
      'Matthew Dusatko: Kurz.',
      'Sarah Dusatko: Kürzer.',
      'Kailee: Noch kürzer.',
      'Samuel Dusatko: Fertig.',
    ].join('\n');
    const out = alignDialogTurnsToScript({ turns, script, resolveSpeakerId })!;
    expect(out).toHaveLength(4);
    expect(out.map((t) => t.characterId)).toEqual([MATTHEW, SARAH, KAILEE, SAMUEL]);
    expect(out.map((t) => t.turnId)).toEqual(['t1', 't2', 't3', 't4']);
    expect(out.map((t) => t.text)).toEqual(['Kurz.', 'Kürzer.', 'Noch kürzer.', 'Fertig.']);
    expect(out.map((t) => t.order)).toEqual([0, 1, 2, 3]);
  });

  it('keeps the existing behaviour when line count matches', () => {
    const script = turns.map((t, i) => `${cast.find((c) => c.id === t.characterId)!.name}: Zeile ${i}`).join('\n');
    const out = alignDialogTurnsToScript({ turns, script, resolveSpeakerId })!;
    expect(out).toHaveLength(6);
    expect(out.map((t) => t.turnId)).toEqual(['t1', 't2', 't3', 't4', 't5', 't6']);
    expect(out[5].text).toBe('Zeile 5');
  });

  it('adds a new turn for an extra line and resolves its speaker by name', () => {
    const script = [
      ...turns.map((t) => `${cast.find((c) => c.id === t.characterId)!.name}: ${t.text}`),
      'Kailee: Eine Zeile mehr.',
    ].join('\n');
    const out = alignDialogTurnsToScript({ turns, script, resolveSpeakerId })!;
    expect(out).toHaveLength(7);
    expect(out[6].characterId).toBe(KAILEE);
    expect(out[6].turnId).toBeUndefined();
  });

  it('re-assigns the speaker when the written name points to another cast member', () => {
    const script = 'Sarah Dusatko: Erste Zeile.';
    const out = alignDialogTurnsToScript({ turns, script, resolveSpeakerId })!;
    expect(out[0].characterId).toBe(SARAH);
    // must not inherit Matthew's turn id
    expect(out[0].turnId).toBeUndefined();
  });

  it('returns null when there is nothing to align', () => {
    expect(alignDialogTurnsToScript({ turns, script: '   ' })).toBeNull();
    expect(alignDialogTurnsToScript({ turns: [], script: 'Sarah: Hi' })).toBeNull();
  });
});
