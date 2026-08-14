import { resolveSceneOutput } from "@/lib/composer/output/resolveSceneOutput";
/**
 * v384 — Zustandsmaschine für Composer-Szenen (Client-Seite).
 *
 * Spiegelbild von `supabase/functions/_shared/scene-state.ts`. Beide Dateien
 * MÜSSEN semantisch identisch bleiben — sie sind der einzige Ort, an dem der
 * Zustand einer Szene interpretiert wird.
 *
 * Wahrheit ist `composer_scenes.pipeline_state`. `clip_status`,
 * `twoshot_stage`, `lip_sync_status` sind Legacy-Spiegel (DB-Trigger),
 * `clip_error` ist reiner Anzeigetext und steuert nichts mehr.
 */

export type SceneState =
  | 'idle'
  | 'plate_queued'
  | 'plate_rendering'
  | 'plate_ready'
  | 'audio_prep'
  | 'audio_ready'
  | 'lipsync_dispatched'
  | 'lipsync_running'
  | 'lipsync_muxing'
  | 'complete'
  | 'failed'
  | 'canceled';

export const SCENE_STATES: readonly SceneState[] = [
  'idle',
  'plate_queued',
  'plate_rendering',
  'plate_ready',
  'audio_prep',
  'audio_ready',
  'lipsync_dispatched',
  'lipsync_running',
  'lipsync_muxing',
  'complete',
  'failed',
  'canceled',
];

const TERMINAL: ReadonlySet<SceneState> = new Set<SceneState>(['failed', 'canceled']);

const REALIZED: ReadonlySet<SceneState> = new Set<SceneState>([
  'plate_ready',
  'audio_prep',
  'audio_ready',
  'lipsync_dispatched',
  'lipsync_running',
  'lipsync_muxing',
  'complete',
]);

const IN_FLIGHT: ReadonlySet<SceneState> = new Set<SceneState>([
  'plate_queued',
  'plate_rendering',
  'audio_prep',
  'audio_ready',
  'lipsync_dispatched',
  'lipsync_running',
  'lipsync_muxing',
]);

const PROGRESS: Record<SceneState, number> = {
  idle: 0,
  plate_queued: 5,
  plate_rendering: 25,
  plate_ready: 45,
  audio_prep: 55,
  audio_ready: 65,
  lipsync_dispatched: 72,
  lipsync_running: 85,
  lipsync_muxing: 95,
  complete: 100,
  failed: 100,
  canceled: 100,
};

/**
 * v430 Schritt 6.5 — Label-Wahrheit liegt jetzt ausschließlich in
 * `src/lib/composer/status/sceneStatusPresenter.ts` (+ `SceneStatusBadge`).
 * `SCENE_STATE_LABEL` wurde hier entfernt.
 */

export function isSceneState(v: unknown): v is SceneState {
  return typeof v === 'string' && (SCENE_STATES as readonly string[]).includes(v);
}

/** Identisch zu `public.composer_state_from_legacy()` — nur für Altzeilen. */
export function deriveStateFromLegacy(row: any): SceneState {
  const clipStatus = row?.clip_status ?? row?.clipStatus ?? null;
  const stage = row?.twoshot_stage ?? row?.twoshotStage ?? null;
  const ls = row?.lip_sync_status ?? row?.lipSyncStatus ?? null;
  const clipUrl = row?.clip_url ?? row?.clipUrl ?? null;
  const runId = row?.active_run_id ?? row?.activeRunId ?? null;

  if (clipStatus === 'canceled' || ls === 'canceled') return 'canceled';
  if (clipStatus === 'failed' || stage === 'failed' || stage === 'audio_mux_failed' || ls === 'failed') {
    return 'failed';
  }
  if (ls === 'done' || ls === 'applied' || stage === 'done' || stage === 'complete' || stage === 'applied') {
    return 'complete';
  }
  if (ls === 'stitching') return 'lipsync_muxing';
  if (ls === 'running' || stage === 'lipsync') return 'lipsync_running';
  if (stage === 'master_clip') return 'audio_ready';
  if (stage === 'audio') return 'audio_prep';
  if ((clipStatus === 'ready' || clipStatus === 'completed') && typeof clipUrl === 'string' && clipUrl.length > 0) {
    return 'plate_ready';
  }
  if (clipStatus === 'generating' || clipStatus === 'rendering' || clipStatus === 'processing') {
    return 'plate_rendering';
  }
  if ((clipStatus === 'queued' || clipStatus === 'pending') && runId) return 'plate_queued';
  return 'idle';
}

/** Zustand einer Szene lesen — `pipeline_state` gewinnt immer. */
export function sceneState(row: any): SceneState {
  const s = row?.pipeline_state ?? row?.pipelineState;
  return isSceneState(s) ? s : deriveStateFromLegacy(row);
}

/** v430 Step 5C — diagnostischer/UI-relevanter Unterzustand. */
export type SceneSubstate = string | null;

/** Identisch zu `public.composer_substate_from_legacy()` — nur für Altzeilen. */
export function deriveSubstateFromLegacy(row: any): SceneSubstate {
  const clipStatus = row?.clip_status ?? row?.clipStatus ?? null;
  const stage = row?.twoshot_stage ?? row?.twoshotStage ?? null;
  const ls = row?.lip_sync_status ?? row?.lipSyncStatus ?? null;

  if (clipStatus === 'awaiting_manual_face_map') return 'awaiting_manual_face_map';
  if (clipStatus === 'awaiting_confirmation' && stage === 'preview') return 'awaiting_confirmation';
  if (typeof stage === 'string' && stage.startsWith('syncso_pass_')) return stage;
  if (typeof stage === 'string' && stage.startsWith('syncso_fanout_')) return stage;
  if (typeof stage === 'string' && stage.startsWith('syncso_retry_')) return stage;
  if (stage === 'circuit_open') return 'circuit_open';
  if (stage === 'deferred') return 'deferred';
  if (stage === 'needs_clip_rerender') return 'needs_clip_rerender';
  if (stage === 'anchor') return 'anchor';
  if (stage === 'anchor_soft_pass') return 'anchor_soft_pass';
  if (stage === 'preview') return 'preview';
  if (stage === 'audio_mux_failed') return 'audio_mux_failed';
  if (stage === 'failed' && ls === 'failed') return 'lipsync_failed';
  return null;
}

/** Unterzustand einer Szene lesen — `pipeline_substate` gewinnt immer. */
export function sceneSubstate(row: any): SceneSubstate {
  const sub = row?.pipeline_substate ?? row?.pipelineSubstate ?? null;
  if (sub === null || sub === undefined) return deriveSubstateFromLegacy(row);
  return typeof sub === 'string' && sub.length > 0 ? sub : null;
}

export const isTerminalState = (s: SceneState) => TERMINAL.has(s);
export const isRealizedState = (s: SceneState) => REALIZED.has(s);
export const isInFlightState = (s: SceneState) => IN_FLIGHT.has(s);
export const stateProgress = (s: SceneState) => PROGRESS[s] ?? 0;

export const isSceneTerminal = (row: any) => isTerminalState(sceneState(row));
export const isSceneInFlight = (row: any) => isInFlightState(sceneState(row));
export const sceneProgressPercent = (row: any) => stateProgress(sceneState(row));

/**
 * v430 Schritt 5D — 1:1-Parität zum alten `clip_status === 'ready'`.
 * Spiegel von `supabase/functions/_shared/scene-state.ts`.
 *
 * Ready/Failed exklusiv klassifizieren:
 *   ready  = legacyClipReadyEquivalent(...)
 *   failed = !ready && sceneState(row) === 'failed'
 */
export function legacyClipReadyEquivalent(input: {
  state: SceneState;
  hasEffectiveOutput: boolean;
}): boolean {
  if (REALIZED.has(input.state)) return true;
  if (input.state === 'failed' && input.hasEffectiveOutput) return true;
  return false;
}

export function legacyClipReadyEquivalentRow(row: any): boolean {
  const out = resolveSceneOutput(row);
  return legacyClipReadyEquivalent({
    state: sceneState(row),
    hasEffectiveOutput: typeof out.effectiveUrl === 'string' && out.effectiveUrl.length > 0,
  });
}

export function legacyClipFailedEquivalentRow(row: any): boolean {
  if (legacyClipReadyEquivalentRow(row)) return false;
  return sceneState(row) === 'failed';
}

/**
 * v388 — Legacy-Projektion.
 * Einzige erlaubte Quelle fuer die alten `clipStatus`-Anzeigewerte in der
 * Oberflaeche. Komponenten, die noch auf `pending | generating | ready |
 * failed` verzweigen, bekommen den Wert aus dem Zustandsautomaten statt aus
 * der Alt-Spalte — damit kann die Anzeige dem Server nicht mehr
 * widersprechen.
 */
export function clipStatusFromState(
  s: SceneState,
): 'pending' | 'generating' | 'ready' | 'failed' {
  switch (s) {
    case 'failed':
      return 'failed';
    case 'plate_queued':
    case 'plate_rendering':
      return 'generating';
    case 'idle':
    case 'canceled':
      return 'pending';
    default:
      // plate_ready, audio_prep, audio_ready, lipsync_*, complete
      return 'ready';
  }
}


/**
 * v384 — Realized-Vertrag: belastbare Master-Plate aus dem AKTUELLEN Lauf.
 * Kein Diagnosetext (`clip_error`) beeinflusst dieses Urteil mehr.
 */
export function isRealizedScene(row: any): boolean {
  if (!row) return false;
  if (!isRealizedState(sceneState(row))) return false;

  const clipUrl = row.clip_url ?? row.clipUrl ?? null;
  if (typeof clipUrl !== 'string' || clipUrl.length === 0) return false;

  const gen = row.plate_generation ?? row.plateGeneration ?? null;
  const readyGen = row.plate_ready_generation ?? row.plateReadyGeneration ?? null;
  if (gen != null && Number(readyGen) !== Number(gen)) return false;

  return true;
}

export const canStartAudioPrep = (row: any): boolean => {
  const s = sceneState(row);
  return isRealizedScene(row) && (s === 'plate_ready' || s === 'audio_prep');
};

/** START-Vertrag: darf ueberhaupt ein Lip-Sync-Lauf beginnen? */
export const canDispatchLipsync = (row: any): boolean => {
  const s = sceneState(row);
  return isRealizedScene(row) && (s === 'audio_ready' || s === 'lipsync_dispatched');
};

/**
 * v394 — FORTSETZUNGS-Vertrag (Zwilling von `_shared/scene-state.ts`).
 * Ein weiterer Pass eines bereits laufenden Lip-Syncs darf dispatcht werden.
 */
export const canContinueLipsync = (row: any): boolean => {
  const s = sceneState(row);
  return isRealizedScene(row) && (s === 'lipsync_dispatched' || s === 'lipsync_running');
};
