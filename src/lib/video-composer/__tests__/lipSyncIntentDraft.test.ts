/**
 * C1 — Lip-Sync Intent: UI/DB divergence contract tests.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import {
  UNRESOLVED,
  DRAFT_SCHEMA_VERSION,
  migrateLegacyDraft,
  downgradeHydratedOnMount,
  prepareDraftForSession,
  beginIntentWrite,
  endIntentWrite,
  reconcileIntentMarkers,
  resolveIntentField,
  resolveSceneIntent,
  isSceneIntentUnresolved,
  getIntentMarker,
  clearSceneIntentMarkers,
  persistIntentWrite,
  __resetIntentRuntime,
} from '../lipSyncIntentDraft';

const SCENE = '11111111-1111-4111-8111-111111111111';

beforeEach(() => {
  localStorage.clear();
  __resetIntentRuntime();
});

describe('resolution (tri-state)', () => {
  it('DB unknown → unresolved, never OFF', () => {
    const r = resolveIntentField(SCENE, 'lipSyncWithVoiceover', UNRESOLVED);
    expect(r.state).toBe('unresolved');
    expect(r.value).toBeUndefined();
  });

  it('DB=false + stale draft=true → UI false', () => {
    const r = resolveIntentField(SCENE, 'lipSyncWithVoiceover', false);
    expect(r).toMatchObject({ state: 'resolved', value: false });
  });

  it('DB=true + stale draft=false → UI true', () => {
    const r = resolveIntentField(SCENE, 'lipSyncWithVoiceover', true);
    expect(r).toMatchObject({ state: 'resolved', value: true });
  });

  it('engineOverride = null is a legitimate persisted value, not UNRESOLVED', () => {
    const r = resolveIntentField(SCENE, 'engineOverride', null);
    expect(r.state).toBe('resolved');
    expect(r.value).toBeNull();
  });

  it('db_known_unhydrated scene resolves unresolved even with a local value', () => {
    const scene = { id: SCENE, scenePersistenceState: 'db_known_unhydrated' as const, lipSyncWithVoiceover: true };
    expect(isSceneIntentUnresolved(scene)).toBe(true);
    expect(resolveSceneIntent(scene, 'lipSyncWithVoiceover').state).toBe('unresolved');
  });

  it('local_new scene keeps its local intent (controls enabled)', () => {
    const scene = { id: 'scene_1', scenePersistenceState: 'local_new' as const, lipSyncWithVoiceover: true };
    expect(isSceneIntentUnresolved(scene)).toBe(false);
    expect(resolveSceneIntent(scene, 'lipSyncWithVoiceover')).toMatchObject({ state: 'resolved', value: true });
  });

  it('db_hydrated scene resolves from the hydrated value', () => {
    const scene = { id: SCENE, scenePersistenceState: 'db_hydrated' as const, lipSyncWithVoiceover: false };
    expect(resolveSceneIntent(scene, 'lipSyncWithVoiceover')).toMatchObject({ state: 'resolved', value: false });
  });
});

describe('marker reconciliation', () => {
  it('DB == desired → marker confirmed and dropped', () => {
    beginIntentWrite(SCENE, 'lipSyncWithVoiceover', true);
    endIntentWrite(SCENE, 'lipSyncWithVoiceover', true);
    const [outcome] = reconcileIntentMarkers(SCENE, { lipSyncWithVoiceover: true }).filter(
      (o) => o.field === 'lipSyncWithVoiceover',
    );
    expect(outcome.result).toBe('confirmed');
    expect(getIntentMarker(SCENE, 'lipSyncWithVoiceover')).toBeNull();
  });

  it('DB != desired + write in flight → pending, marker survives', () => {
    beginIntentWrite(SCENE, 'lipSyncWithVoiceover', true);
    const outcome = reconcileIntentMarkers(SCENE, { lipSyncWithVoiceover: false }).find(
      (o) => o.field === 'lipSyncWithVoiceover',
    )!;
    expect(outcome.result).toBe('pending');
    expect(getIntentMarker(SCENE, 'lipSyncWithVoiceover')).not.toBeNull();
    expect(resolveIntentField(SCENE, 'lipSyncWithVoiceover', false)).toMatchObject({ value: true, pending: true });
  });

  it('orphaned marker (browser death after write) → DB wins, marker dropped', () => {
    beginIntentWrite(SCENE, 'lipSyncWithVoiceover', true);
    __resetIntentRuntime(); // simulates a fresh page load: no in-flight write
    const outcome = reconcileIntentMarkers(SCENE, { lipSyncWithVoiceover: false }).find(
      (o) => o.field === 'lipSyncWithVoiceover',
    )!;
    expect(outcome.result).toBe('lost');
    expect(getIntentMarker(SCENE, 'lipSyncWithVoiceover')).toBeNull();
    expect(resolveIntentField(SCENE, 'lipSyncWithVoiceover', false)).toMatchObject({ value: false, lostWrite: true });
  });

  it('browser death BEFORE the DB commit → marker recovers as confirmed when DB matches', () => {
    beginIntentWrite(SCENE, 'dialogMode', true);
    __resetIntentRuntime();
    const outcome = reconcileIntentMarkers(SCENE, { dialogMode: true }).find((o) => o.field === 'dialogMode')!;
    expect(outcome.result).toBe('confirmed');
  });

  it('reset flow clears every marker of the scene', () => {
    beginIntentWrite(SCENE, 'lipSyncWithVoiceover', true);
    beginIntentWrite(SCENE, 'engineOverride', 'cinematic-sync');
    clearSceneIntentMarkers(SCENE);
    expect(getIntentMarker(SCENE, 'lipSyncWithVoiceover')).toBeNull();
    expect(getIntentMarker(SCENE, 'engineOverride')).toBeNull();
  });
});

describe('persistIntentWrite', () => {
  it('rolls back the optimistic patch and drops the marker on a failed write', async () => {
    let value: boolean | null = false;
    const ok = await persistIntentWrite({
      sceneId: SCENE,
      field: 'lipSyncWithVoiceover',
      desiredValue: true,
      previousValue: false,
      applyLocal: (v) => { value = v; },
      write: async () => ({ ok: false, error: new Error('boom') }),
    });
    expect(ok).toBe(false);
    expect(value).toBe(false);
    expect(getIntentMarker(SCENE, 'lipSyncWithVoiceover')).toBeNull();
  });

  it('keeps the confirmed value on success', async () => {
    let value: boolean | null = false;
    const ok = await persistIntentWrite({
      sceneId: SCENE,
      field: 'lipSyncWithVoiceover',
      desiredValue: true,
      previousValue: false,
      applyLocal: (v) => { value = v; },
      write: async () => ({ ok: true }),
    });
    expect(ok).toBe(true);
    expect(value).toBe(true);
  });
});

describe('legacy draft migration', () => {
  const legacy: any = {
    scenes: [
      { id: SCENE, lipSyncWithVoiceover: true, dialogMode: true, engineOverride: 'cinematic-sync' },
    ],
  };

  it('never turns a missing provenance status into local_new', () => {
    const migrated = migrateLegacyDraft(legacy)!;
    expect(migrated.scenes[0].scenePersistenceState).toBe('db_known_unhydrated');
  });

  it('drops the stale intent fields of legacy scenes', () => {
    const migrated = migrateLegacyDraft(legacy)!;
    expect(migrated.scenes[0].lipSyncWithVoiceover).toBeUndefined();
    expect(migrated.scenes[0].dialogMode).toBeUndefined();
    expect(migrated.scenes[0].engineOverride).toBeUndefined();
  });

  it('is idempotent', () => {
    const once = migrateLegacyDraft(legacy)!;
    const twice = migrateLegacyDraft(once)!;
    expect(twice).toEqual(once);
    expect(twice.draftSchemaVersion).toBe(DRAFT_SCHEMA_VERSION);
  });

  it('does not reclassify C1 scenes that are explicitly local_new', () => {
    const draft: any = {
      scenes: [{ id: 'scene_9', scenePersistenceState: 'local_new', lipSyncWithVoiceover: true }],
    };
    const migrated = migrateLegacyDraft(draft)!;
    expect(migrated.scenes[0].scenePersistenceState).toBe('local_new');
    expect(migrated.scenes[0].lipSyncWithVoiceover).toBe(true);
  });
});

describe('session semantics', () => {
  it('db_hydrated is downgraded on a new mount', () => {
    const draft: any = {
      draftSchemaVersion: DRAFT_SCHEMA_VERSION,
      scenes: [{ id: SCENE, scenePersistenceState: 'db_hydrated', lipSyncWithVoiceover: true }],
    };
    const prepared = downgradeHydratedOnMount(draft)!;
    expect(prepared.scenes[0].scenePersistenceState).toBe('db_known_unhydrated');
    expect(isSceneIntentUnresolved(prepared.scenes[0] as any)).toBe(true);
  });

  it('prepareDraftForSession migrates and downgrades in one pass', () => {
    const draft: any = {
      scenes: [
        { id: SCENE, lipSyncWithVoiceover: true },
        { id: 'scene_2', scenePersistenceState: 'db_hydrated', lipSyncWithVoiceover: true },
        { id: 'scene_3', scenePersistenceState: 'local_new', lipSyncWithVoiceover: true },
      ],
    };
    const prepared = prepareDraftForSession(draft)!;
    expect(prepared.scenes[0].scenePersistenceState).toBe('db_known_unhydrated');
    expect(prepared.scenes[1].scenePersistenceState).toBe('db_known_unhydrated');
    expect(prepared.scenes[2].scenePersistenceState).toBe('local_new');
  });
});
