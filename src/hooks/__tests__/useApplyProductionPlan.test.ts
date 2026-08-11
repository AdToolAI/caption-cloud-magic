import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook } from '@testing-library/react';

/**
 * Snapshot "Plan → Szenen": verifiziert, dass Dauer, Cast, Location,
 * Shot-Direction, Negative Prompt, Captions und (v414) Dialogzeilen aus dem
 * Production Plan im Storyboard ankommen — und dass geschützte Szenen
 * unangetastet bleiben.
 */

const insertedRows: any[] = [];

vi.mock('@/integrations/supabase/client', () => {
  const makeQuery = (table: string) => {
    const q: any = {
      _rows: [] as any[],
      insert(rows: any[]) {
        insertedRows.length = 0;
        insertedRows.push(...rows);
        q._rows = rows.map((r, i) => ({ ...r, id: `11111111-1111-4111-8111-00000000000${i}` }));
        return q;
      },
      select() { return q; },
      eq() { return q; },
      in() { return Promise.resolve({ data: [], error: null }); },
      delete() { return q; },
      order() { return Promise.resolve({ data: q._rows, error: null }); },
      then(resolve: any) { return Promise.resolve({ data: q._rows, error: null }).then(resolve); },
    };
    void table;
    return q;
  };
  const perTable = new Map<string, any>();
  return {
    supabase: {
      from(table: string) {
        if (!perTable.has(table)) perTable.set(table, makeQuery(table));
        return perTable.get(table);
      },
      auth: { getSession: async () => ({ data: { session: null } }) },
    },
  };
});

import { useApplyProductionPlan } from '../useApplyProductionPlan';

const CHAR_A = '22222222-2222-4222-8222-222222222222';
const LOC_A = '33333333-3333-4333-8333-333333333333';

function buildPlan() {
  return {
    project: { name: 'Test', aspectRatio: '9:16', fps: 30, totalDurationSec: 10 },
    negativePrompt: 'blurry, watermark',
    captions: { font: 'Inter', sizePx: 64, color: '#FFFFFF', position: 'bottom' },
    scenes: [
      {
        index: 1,
        label: 'Hook',
        durationSec: 10,
        engine: 'cinematic-sync',
        anchorPromptEN: 'A founder speaks to camera',
        negativePromptScene: 'no text overlay',
        shotDirector: { framing: 'medium', angle: 'eye-level', movement: 'static', lighting: 'soft' },
        cast: [{ mentionKey: 'founder', characterId: CHAR_A, characterName: 'Anna', outfitLookId: null, voiceId: null }],
        location: { mentionKey: 'home-office', locationId: LOC_A, locationName: 'Home Office' },
        dialogTurns: [
          { speakerMentionKey: 'founder', speakerCharacterId: CHAR_A, text: 'Das hier verändert alles.' },
          { speakerMentionKey: 'unknown-person', speakerCharacterId: null, text: 'Meta-Zeile ohne Sprecher' },
        ],
      },
    ],
  } as any;
}

function runApply(applyDialogTurns: boolean) {
  const { result } = renderHook(() => useApplyProductionPlan());
  const scenes: any[] = [];
  return result.current({
    plan: buildPlan(),
    projectId: '44444444-4444-4444-8444-444444444444',
    language: 'de',
    currentScenes: [],
    currentAssembly: undefined,
    currentBriefing: { tone: 'confident' } as any,
    onUpdateBriefing: () => {},
    onUpdateScenes: (next: any[]) => { scenes.push(...next); },
    onApplyAssembly: () => {},
    applyDialogTurns,
  }).then((res) => ({ res, scenes }));
}

describe('useApplyProductionPlan — Plan → Szenen', () => {
  beforeEach(() => { insertedRows.length = 0; });

  it('überträgt Dauer, Cast, Location, Shot-Direction und Negative Prompt', async () => {
    const { scenes } = await runApply(false);
    expect(scenes).toHaveLength(1);
    const s = scenes[0];
    expect(s.durationSeconds).toBe(10);
    expect((s.characterShots ?? []).map((c: any) => c.characterId)).toContain(CHAR_A);
    expect((s.mentionedLocationIds ?? []).includes(LOC_A)).toBe(true);
    expect(s.shotDirector?.framing).toBe('medium');
    expect(String(s.negativePromptScene ?? '')).toContain('no text overlay');
  });

  it('übernimmt Dialogzeilen nur mit auflösbarem Sprecher und nur wenn aktiviert', async () => {
    const off = await runApply(false);
    expect((off.scenes[0] as any).dialogTurns ?? []).toHaveLength(0);

    insertedRows.length = 0;
    const on = await runApply(true);
    const turns = (on.scenes[0] as any).dialogTurns ?? [];
    expect(turns).toHaveLength(1);
    expect(turns[0].characterId).toBe(CHAR_A);
    expect(turns[0].text).toBe('Das hier verändert alles.');
  });
});
