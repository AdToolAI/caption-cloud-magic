/**
 * C1 — Lip-Sync Intent: UI/DB divergence contract.
 *
 * Problem this closes: the composer builds its state from the localStorage
 * draft first, so a stale draft value for `lipSyncWithVoiceover` /
 * `dialogMode` / `engineOverride` could show "Lip-Sync AN" while the DB (the
 * only thing the render gates read) still said OFF. The render start was then
 * silently blocked.
 *
 * Contract implemented here:
 *   1. Tri-state — an intent field is `resolved` (with a value) or
 *      `unresolved`. Unresolved is NEVER rendered as OFF; controls disable and
 *      the render start is fail-closed.
 *   2. Scene provenance decides resolution:
 *        local_new           → resolved from the local value (no DB truth yet)
 *        db_known_unhydrated → unresolved (DB-backed, not confirmed this session)
 *        db_hydrated         → resolved from the DB value
 *      `db_hydrated` means "confirmed in THIS session". On mount every stored
 *      `db_hydrated` is downgraded to `db_known_unhydrated`.
 *   3. Dirty markers are pure write-recovery metadata, never a second source
 *      of truth. On every successful hydration they are reconciled:
 *        DB == desired            → write confirmed, drop marker
 *        DB != desired, in-flight → pending ("ungespeichert")
 *        DB != desired, no write  → DB wins, drop marker, surface a hint
 *   4. Legacy drafts (written before C1) never become `local_new`.
 */

import { scopedDraftKey } from '@/lib/local-draft-scope';

// ──────────────────────────────────────────────────────────────────────────
// Types
// ──────────────────────────────────────────────────────────────────────────

export type ScenePersistenceState = 'local_new' | 'db_known_unhydrated' | 'db_hydrated';

export const INTENT_FIELDS = ['lipSyncWithVoiceover', 'dialogMode', 'engineOverride'] as const;
export type IntentField = (typeof INTENT_FIELDS)[number];

export type IntentValue = boolean | string | null;

/** Sentinel for "the DB value for this scene is not known in this session". */
export const UNRESOLVED = Symbol.for('c1.intent.unresolved');
export type Unresolved = typeof UNRESOLVED;

export interface IntentMarker {
  sceneId: string;
  field: IntentField;
  desiredValue: IntentValue;
  mutationId: string;
  setAt: number;
}

export interface ResolvedIntent {
  state: 'resolved' | 'unresolved';
  value: IntentValue | undefined;
  pending: boolean;
  /** A write for this field failed silently — surface "nicht gespeichert". */
  lostWrite: boolean;
}

/** Draft schema version introduced with C1. */
export const DRAFT_SCHEMA_VERSION = 2;

// ──────────────────────────────────────────────────────────────────────────
// Marker store (localStorage, account-scoped) + in-flight registry
// ──────────────────────────────────────────────────────────────────────────

const MARKER_BASE_KEY = 'composer:intent-markers';
/** Markers older than this cannot represent an in-flight write any more. */
const MARKER_MAX_AGE_MS = 5 * 60_000;

const inflight = new Set<string>();
/** sceneId:field → true when the last reconcile proved the write was lost. */
const lostWrites = new Set<string>();

const keyOf = (sceneId: string, field: IntentField) => `${sceneId}:${field}`;

function readMarkers(): IntentMarker[] {
  try {
    const raw = localStorage.getItem(scopedDraftKey(MARKER_BASE_KEY));
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as IntentMarker[]) : [];
  } catch {
    return [];
  }
}

function writeMarkers(markers: IntentMarker[]): void {
  try {
    localStorage.setItem(scopedDraftKey(MARKER_BASE_KEY), JSON.stringify(markers));
  } catch {
    /* ignore */
  }
}

export function getIntentMarker(sceneId: string, field: IntentField): IntentMarker | null {
  return readMarkers().find((m) => m.sceneId === sceneId && m.field === field) ?? null;
}

export function setIntentMarker(marker: IntentMarker): void {
  const rest = readMarkers().filter((m) => !(m.sceneId === marker.sceneId && m.field === marker.field));
  rest.push(marker);
  writeMarkers(rest);
}

export function clearIntentMarker(sceneId: string, field: IntentField): void {
  writeMarkers(readMarkers().filter((m) => !(m.sceneId === sceneId && m.field === field)));
  lostWrites.delete(keyOf(sceneId, field));
}

/** Drop every marker + pending flag for a scene (used by the reset flow). */
export function clearSceneIntentMarkers(sceneId: string): void {
  writeMarkers(readMarkers().filter((m) => m.sceneId !== sceneId));
  for (const field of INTENT_FIELDS) {
    inflight.delete(keyOf(sceneId, field));
    lostWrites.delete(keyOf(sceneId, field));
  }
}

export function isIntentWriteInFlight(sceneId: string, field: IntentField): boolean {
  return inflight.has(keyOf(sceneId, field));
}

/** Test seam — clears the in-memory registries. */
export function __resetIntentRuntime(): void {
  inflight.clear();
  lostWrites.clear();
}

// ──────────────────────────────────────────────────────────────────────────
// Reconciliation
// ──────────────────────────────────────────────────────────────────────────

export interface ReconcileOutcome {
  field: IntentField;
  result: 'confirmed' | 'pending' | 'lost' | 'none';
}

const sameValue = (a: IntentValue | undefined, b: IntentValue | undefined) => {
  // `null` and 'auto' are distinct persisted values; only strict equality counts.
  return a === b;
};

/**
 * Called after EVERY successful hydration of a scene from the DB.
 * `dbValues` carries the camelCase values read from the row.
 */
export function reconcileIntentMarkers(
  sceneId: string,
  dbValues: Partial<Record<IntentField, IntentValue>>,
): ReconcileOutcome[] {
  const out: ReconcileOutcome[] = [];
  for (const field of INTENT_FIELDS) {
    const marker = getIntentMarker(sceneId, field);
    if (!marker) {
      out.push({ field, result: 'none' });
      continue;
    }
    const dbValue = dbValues[field];
    if (sameValue(dbValue, marker.desiredValue)) {
      clearIntentMarker(sceneId, field);
      inflight.delete(keyOf(sceneId, field));
      out.push({ field, result: 'confirmed' });
      continue;
    }
    const stillInFlight =
      inflight.has(keyOf(sceneId, field)) && Date.now() - marker.setAt < MARKER_MAX_AGE_MS;
    if (stillInFlight) {
      out.push({ field, result: 'pending' });
      continue;
    }
    // Orphaned marker — no active write backs it. DB wins.
    clearIntentMarker(sceneId, field);
    lostWrites.add(keyOf(sceneId, field));
    out.push({ field, result: 'lost' });
  }
  return out;
}

// ──────────────────────────────────────────────────────────────────────────
// Resolver
// ──────────────────────────────────────────────────────────────────────────

export function resolveIntentField(
  sceneId: string,
  field: IntentField,
  dbValue: IntentValue | Unresolved,
): ResolvedIntent {
  const pending = isIntentWriteInFlight(sceneId, field);
  const lostWrite = lostWrites.has(keyOf(sceneId, field));
  if (dbValue === UNRESOLVED) {
    return { state: 'unresolved', value: undefined, pending, lostWrite };
  }
  const marker = getIntentMarker(sceneId, field);
  if (marker && pending) {
    return { state: 'resolved', value: marker.desiredValue, pending: true, lostWrite: false };
  }
  return { state: 'resolved', value: dbValue as IntentValue, pending: false, lostWrite };
}

/**
 * Convenience for components: resolves straight from the scene's provenance.
 * `local_new` resolves from the local value, `db_hydrated` from the local
 * value (which at that point IS the hydrated DB value), everything else is
 * unresolved.
 */
export function resolveSceneIntent(
  scene: { id: string; scenePersistenceState?: ScenePersistenceState } & Partial<
    Record<IntentField, IntentValue>
  >,
  field: IntentField,
): ResolvedIntent {
  const provenance = scene.scenePersistenceState ?? 'db_known_unhydrated';
  const dbValue: IntentValue | Unresolved =
    provenance === 'db_known_unhydrated' ? UNRESOLVED : ((scene[field] ?? null) as IntentValue);
  return resolveIntentField(scene.id, field, dbValue);
}

/** True when any of the three intent fields is not resolvable for this scene. */
export function isSceneIntentUnresolved(scene: {
  id: string;
  scenePersistenceState?: ScenePersistenceState;
}): boolean {
  return (scene.scenePersistenceState ?? 'db_known_unhydrated') === 'db_known_unhydrated';
}

// ──────────────────────────────────────────────────────────────────────────
// User-writer helper — mark → write → confirm / rollback
// ──────────────────────────────────────────────────────────────────────────

export interface PersistIntentWriteArgs<T extends IntentValue> {
  sceneId: string;
  field: IntentField;
  desiredValue: T;
  previousValue: T;
  /** Optimistic local patch (UI). */
  applyLocal: (value: T) => void;
  /** Executed on failure to undo `applyLocal`. */
  rollbackLocal?: (value: T) => void;
  /** The actual DB write. Must resolve with the value read back from the DB. */
  write: (value: T) => Promise<{ ok: true; confirmedValue?: T } | { ok: false; error: unknown }>;
  onError?: (error: unknown) => void;
}

let mutationCounter = 0;
const nextMutationId = () => `m${Date.now()}_${(mutationCounter += 1)}`;

export async function persistIntentWrite<T extends IntentValue>(
  args: PersistIntentWriteArgs<T>,
): Promise<boolean> {
  const { sceneId, field, desiredValue, previousValue, applyLocal, rollbackLocal, write, onError } = args;
  const mutationId = nextMutationId();
  const k = keyOf(sceneId, field);

  setIntentMarker({ sceneId, field, desiredValue, mutationId, setAt: Date.now() });
  lostWrites.delete(k);
  inflight.add(k);
  applyLocal(desiredValue);

  try {
    const result = await write(desiredValue);
    inflight.delete(k);
    if (result.ok) {
      const confirmed = (result.confirmedValue ?? desiredValue) as T;
      clearIntentMarker(sceneId, field);
      if (!sameValue(confirmed, desiredValue)) applyLocal(confirmed);
      return true;
    }
    clearIntentMarker(sceneId, field);
    (rollbackLocal ?? applyLocal)(previousValue);
    onError?.((result as { error: unknown }).error);
    return false;
  } catch (error) {
    inflight.delete(k);
    clearIntentMarker(sceneId, field);
    (rollbackLocal ?? applyLocal)(previousValue);
    onError?.(error);
    return false;
  }
}

// ──────────────────────────────────────────────────────────────────────────
// Legacy draft migration
// ──────────────────────────────────────────────────────────────────────────

interface DraftLike {
  draftSchemaVersion?: number;
  scenes?: any[];
  [k: string]: any;
}

const PROVENANCE_VALUES: ScenePersistenceState[] = ['local_new', 'db_known_unhydrated', 'db_hydrated'];

const hasExplicitProvenance = (scene: any): scene is { scenePersistenceState: ScenePersistenceState } =>
  PROVENANCE_VALUES.includes(scene?.scenePersistenceState);

/**
 * Idempotent one-time migration of pre-C1 drafts.
 *
 * A missing provenance status must NEVER be read as `local_new` — an old
 * DB-backed scene with a stale `lipSyncWithVoiceover=true` would otherwise be
 * treated as canonical again. Legacy scenes therefore always become
 * `db_known_unhydrated` and their three intent fields are dropped; the DB
 * hydration is the only thing that may restore them.
 *
 * Already-versioned C1 drafts and scenes carrying an explicit provenance
 * (including `local_new`) are never reclassified.
 */
export function migrateLegacyDraft<T extends DraftLike>(draft: T | null | undefined): T | null {
  if (!draft) return draft ?? null;
  if (draft.draftSchemaVersion === DRAFT_SCHEMA_VERSION) return draft;

  const scenes = Array.isArray(draft.scenes)
    ? draft.scenes.map((scene: any) => {
        if (hasExplicitProvenance(scene)) return scene;
        const { lipSyncWithVoiceover, dialogMode, engineOverride, ...rest } = scene ?? {};
        return { ...rest, scenePersistenceState: 'db_known_unhydrated' as ScenePersistenceState };
      })
    : draft.scenes;

  return { ...draft, draftSchemaVersion: DRAFT_SCHEMA_VERSION, scenes } as T;
}

/**
 * Session-mount downgrade: `db_hydrated` only ever means "confirmed in this
 * session". Runs after `migrateLegacyDraft`, before any intent resolution.
 */
export function downgradeHydratedOnMount<T extends DraftLike>(draft: T | null | undefined): T | null {
  if (!draft) return draft ?? null;
  if (!Array.isArray(draft.scenes)) return draft;
  return {
    ...draft,
    scenes: draft.scenes.map((scene: any) =>
      scene?.scenePersistenceState === 'db_hydrated'
        ? { ...scene, scenePersistenceState: 'db_known_unhydrated' as ScenePersistenceState }
        : scene,
    ),
  } as T;
}

/** `migrateLegacyDraft` + `downgradeHydratedOnMount` in the mandated order. */
export function prepareDraftForSession<T extends DraftLike>(draft: T | null | undefined): T | null {
  return downgradeHydratedOnMount(migrateLegacyDraft(draft));
}
