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

/** Kurzlabel für die UI (DE). */
export const SCENE_STATE_LABEL: Record<SceneState, string> = {
  idle: 'Bereit',
  plate_queued: 'In der Warteschlange',
  plate_rendering: 'Clip wird generiert',
  plate_ready: 'Clip fertig',
  audio_prep: 'Voiceover wird erzeugt',
  audio_ready: 'Voiceover fertig',
  lipsync_dispatched: 'Lip-Sync wird gestartet',
  lipsync_running: 'Lip-Sync läuft',
  lipsync_muxing: 'Wird zusammengesetzt',
  complete: 'Fertig',
  failed: 'Fehlgeschlagen',
  canceled: 'Abgebrochen',
};

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

export const isTerminalState = (s: SceneState) => TERMINAL.has(s);
export const isRealizedState = (s: SceneState) => REALIZED.has(s);
export const isInFlightState = (s: SceneState) => IN_FLIGHT.has(s);
export const stateProgress = (s: SceneState) => PROGRESS[s] ?? 0;

export const isSceneTerminal = (row: any) => isTerminalState(sceneState(row));
export const isSceneInFlight = (row: any) => isInFlightState(sceneState(row));
export const sceneProgressPercent = (row: any) => stateProgress(sceneState(row));

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

export const canDispatchLipsync = (row: any): boolean => {
  const s = sceneState(row);
  return isRealizedScene(row) && (s === 'audio_ready' || s === 'lipsync_dispatched');
};
