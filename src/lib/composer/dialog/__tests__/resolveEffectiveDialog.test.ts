import { describe, it, expect } from 'vitest';
import {
  resolveEffectiveDialog,
  normalizeDialogTurns,
  type CanonicalTurn,
} from '../resolveEffectiveDialog';

const A = '11111111-1111-4111-8111-111111111111';
const B = '22222222-2222-4222-8222-222222222222';
const C = '33333333-3333-4333-8333-333333333333';
const D = '44444444-4444-4444-8444-444444444444';

const turn = (
  characterId: string,
  text: string,
  order: number,
  turnId?: string,
  displayName?: string,
): CanonicalTurn => ({ characterId, text, order, turnId, displayName });

const cast: Record<string, string> = { anna: A, ben: B, cleo: C, dan: D };
const resolveSpeakerId = (name: string) => {
  const id = cast[name.toLowerCase().trim()];
  return id ? { id, name } : null;
};

describe('resolveEffectiveDialog', () => {
  it('reports in_sync when script and turns match', () => {
    const res = resolveEffectiveDialog({
      dialogScript: 'Anna: Hallo\nBen: Servus',
      dialogTurns: [turn(A, 'Hallo', 0, 't1'), turn(B, 'Servus', 1, 't2')],
    }, { resolveSpeakerId });
    expect(res.diverged).toBe(false);
    expect(res.reason).toBe('in_sync');
    expect(res.source).toBe('turns');
    expect(res.turns.map((t) => t.turnId)).toEqual(['t1', 't2']);
  });

  it('detects a shortened script (6 turns → 4 lines)', () => {
    const turns = [
      turn(A, 'L1', 0, 't1'), turn(B, 'L2', 1, 't2'), turn(C, 'L3', 2, 't3'),
      turn(D, 'L4', 3, 't4'), turn(A, 'L5', 4, 't5'), turn(B, 'L6', 5, 't6'),
    ];
    const res = resolveEffectiveDialog({
      dialogScript: 'Anna: L1\nBen: L2\nCleo: L3\nDan: L4',
      dialogTurns: turns,
    }, { resolveSpeakerId });
    expect(res.diverged).toBe(true);
    expect(res.reason).toBe('count_mismatch');
    expect(res.turns).toHaveLength(4);
    expect(res.turns.map((t) => t.turnId)).toEqual(['t1', 't2', 't3', 't4']);
  });

  it('detects an extended script', () => {
    const res = resolveEffectiveDialog({
      dialogScript: 'Anna: Eins\nBen: Zwei\nAnna: Drei',
      dialogTurns: [turn(A, 'Eins', 0, 't1'), turn(B, 'Zwei', 1, 't2')],
    }, { resolveSpeakerId });
    expect(res.diverged).toBe(true);
    expect(res.reason).toBe('count_mismatch');
    expect(res.turns).toHaveLength(3);
    expect(res.turns[2].turnId).toBeUndefined();
    expect(res.turns[2].characterId).toBe(A);
  });

  it('detects same line count with changed text', () => {
    const res = resolveEffectiveDialog({
      dialogScript: 'Anna: Hallo Welt\nBen: Servus',
      dialogTurns: [turn(A, 'Hallo', 0, 't1'), turn(B, 'Servus', 1, 't2')],
    }, { resolveSpeakerId });
    expect(res.diverged).toBe(true);
    expect(res.reason).toBe('text_mismatch');
    expect(res.turns[0].text).toBe('Hallo Welt');
    expect(res.turns[0].turnId).toBe('t1');
  });

  it('detects a renamed / reassigned speaker', () => {
    const res = resolveEffectiveDialog({
      dialogScript: 'Cleo: Hallo\nBen: Servus',
      dialogTurns: [turn(A, 'Hallo', 0, 't1'), turn(B, 'Servus', 1, 't2')],
    }, { resolveSpeakerId });
    expect(res.diverged).toBe(true);
    expect(res.reason).toBe('speaker_mismatch');
    expect(res.turns[0].characterId).toBe(C);
    // a reassigned line must not inherit the previous speaker's turn id
    expect(res.turns[0].turnId).toBeUndefined();
  });

  it('detects swapped order', () => {
    const res = resolveEffectiveDialog({
      dialogScript: 'Ben: Servus\nAnna: Hallo',
      dialogTurns: [turn(A, 'Hallo', 0, 't1'), turn(B, 'Servus', 1, 't2')],
    }, { resolveSpeakerId });
    expect(res.diverged).toBe(true);
    expect(res.reason).toBe('speaker_mismatch');
    expect(res.turns.map((t) => t.characterId)).toEqual([B, A]);
  });

  it('never destroys turns on an empty script', () => {
    const res = resolveEffectiveDialog({
      dialogScript: '   \n  ',
      dialogTurns: [turn(A, 'Hallo', 0, 't1'), turn(B, 'Servus', 1, 't2')],
    }, { resolveSpeakerId });
    expect(res.diverged).toBe(false);
    expect(res.reason).toBe('empty_script');
    expect(res.turns).toHaveLength(2);
  });

  it('returns no_turns for legacy scenes without dialog_turns', () => {
    const res = resolveEffectiveDialog({ dialogScript: 'Anna: Hallo', dialogTurns: [] });
    expect(res.reason).toBe('no_turns');
    expect(res.turns).toEqual([]);
    expect(res.diverged).toBe(false);
  });

  it('keeps A → B → A as three turns (cardinality contract)', () => {
    const res = resolveEffectiveDialog({
      dialogScript: 'Anna: Eins\nBen: Zwei\nAnna: Drei',
      dialogTurns: [turn(A, 'Eins', 0, 't1'), turn(B, 'Zwei', 1, 't2'), turn(A, 'Drei', 2, 't3')],
    }, { resolveSpeakerId });
    expect(res.diverged).toBe(false);
    expect(res.turns).toHaveLength(3);
  });

  it('handles the four-speaker case with a shortened script', () => {
    const turns = [
      turn(A, 'A1', 0, 't1'), turn(B, 'B1', 1, 't2'), turn(C, 'C1', 2, 't3'),
      turn(D, 'D1', 3, 't4'), turn(A, 'A2', 4, 't5'), turn(B, 'B2', 5, 't6'),
    ];
    const res = resolveEffectiveDialog({
      dialog_script: 'Anna: A1\nBen: B1\nCleo: C1\nDan: D1',
      dialog_turns: turns,
    }, { resolveSpeakerId });
    expect(res.turns).toHaveLength(4);
    expect(new Set(res.turns.map((t) => t.characterId)).size).toBe(4);
    expect(res.turns.map((t) => t.turnId)).toEqual(['t1', 't2', 't3', 't4']);
  });

  it('ignores pure whitespace / unicode-normalization noise', () => {
    const res = resolveEffectiveDialog({
      dialogScript: 'Anna:    Hallo   Welt  ',
      dialogTurns: [turn(A, 'Hallo Welt', 0, 't1')],
    }, { resolveSpeakerId });
    expect(res.diverged).toBe(false);
    expect(res.reason).toBe('in_sync');
  });

  it('accepts snake_case scenes and drops invalid turns', () => {
    const normalized = normalizeDialogTurns([
      { characterId: A, text: 'Hallo', order: 1, turnId: 't1' },
      { characterId: '', text: 'kaputt', order: 0 },
      { characterId: B, text: '   ', order: 2 },
      { character_id: C, text: 'Drei', order: 0 },
    ]);
    expect(normalized.map((t) => t.characterId)).toEqual([C, A]);
    expect(normalized.map((t) => t.order)).toEqual([0, 1]);
  });
});
