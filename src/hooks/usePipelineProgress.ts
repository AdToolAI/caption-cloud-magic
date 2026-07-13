/**
 * usePipelineProgress — leitet aus dem aktuellen Composer-Zustand
 * (Szenen-Status + AssemblyConfig + Render-Status) plus den vom UI emittierten
 * `pipelineEvents` einen gewichteten Gesamtfortschritt + ETA ab.
 *
 * Wichtig:
 *  • Reine Frontend-Ableitung — keine DB-Calls, keine Edge-Function-Hits.
 *  • Soft-Floor (monoton steigend) verhindert das gefühlte „nichts passiert“
 *    während stiller Polling-Pausen.
 *  • Bewusst KEINE Phase-Anteile als Magic-Constants im UI — sie kommen aus
 *    PHASE_WEIGHTS und sind realitätsnah (siehe Plan, Phase 2.3).
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import type { AssemblyConfig, ComposerScene } from '@/types/video-composer';
import { subscribePipelineEvents, type PipelinePhaseId } from '@/lib/pipelineEvents';
import { isLipSyncIntentional } from '@/lib/video-composer/lipSyncIntent';

export interface PipelinePhaseState {
  id: PipelinePhaseId;
  label: string;
  weight: number; // 0..1
  progress: number; // 0..1 (within phase)
  status: 'idle' | 'running' | 'done' | 'failed';
}

interface UsePipelineProgressArgs {
  scenes: ComposerScene[];
  assemblyConfig: AssemblyConfig;
  /** Optional master-render progress 0..100 (from RenderPipelinePanel). */
  renderPercent?: number;
  /** Whether the master render is currently running. */
  renderRunning?: boolean;
  /** Project id — used to persist the run state across unmount / sleep. */
  projectId?: string;
}

// ── sessionStorage persistence ─────────────────────────────────────────
// The render itself is backend-driven, but the *visual* progress state
// (start time, floors, baselines) lives in component refs. When the user
// navigates away or the device sleeps long enough to remount the route,
// those refs vanish and the bar restarts at 0 % / 0s. Persist a snapshot
// per-project so the bar resumes seamlessly.
const STORAGE_PREFIX = 'composer:pipeline-progress:';
const storageKeyFor = (projectId?: string) =>
  `${STORAGE_PREFIX}${projectId || 'default'}`;

interface PersistedSnapshot {
  pipelineStart: number | null;
  runFloor: number;
  floor: Record<PipelinePhaseId, number>;
  startedAt: Record<PipelinePhaseId, number | null>;
  baseline: {
    clipsReady: number;
    clipsTotal: number;
    lipsyncDone: number;
    lipsyncTotal: number;
    dialogShotsDone: number;
    dialogShotsTotal: number;
    voiceoverHadAudio: boolean;
    musicHad: boolean;
  } | null;
  realProgress: { value: number; at: number };
}

function readSnapshot(key: string): PersistedSnapshot | null {
  try {
    const raw = sessionStorage.getItem(key);
    if (!raw) return null;
    return JSON.parse(raw) as PersistedSnapshot;
  } catch {
    return null;
  }
}

function writeSnapshot(key: string, snap: PersistedSnapshot) {
  try {
    sessionStorage.setItem(key, JSON.stringify(snap));
  } catch {
    /* quota / private mode — ignore */
  }
}

function clearSnapshot(key: string) {
  try {
    sessionStorage.removeItem(key);
  } catch {
    /* ignore */
  }
}

const PHASE_WEIGHTS: Record<PipelinePhaseId, number> = {
  clips: 0.55,
  voiceover: 0.10,
  lipsync: 0.20,
  music: 0.05,
  export: 0.10,
};

const PHASE_LABELS_DE: Record<PipelinePhaseId, string> = {
  clips: 'Clips',
  voiceover: 'Voiceover',
  lipsync: 'Lipsync',
  music: 'Musik',
  export: 'Export',
};

// Approximate total wall-clock seconds per phase (used for ETA only).
const PHASE_NOMINAL_SECONDS: Record<PipelinePhaseId, number> = {
  clips: 240, // 4 min for 5 scenes
  voiceover: 30,
  lipsync: 120,
  music: 15,
  export: 90,
};

// v231 — `needs_clip_rerender` is a terminal FAIL state (hard-fail after noop
// ladder). Without it here, the progress bar hangs at ~23% because the scene
// is never counted as "settled" (see sync-so-webhook v134 hard-fail branch).
const TERMINAL_TWOSHOT_STAGES = new Set(['done', 'complete', 'failed', 'audio_mux_failed', 'canceled', 'needs_clip_rerender']);
const TERMINAL_DIALOG_SHOT_STATUSES = new Set(['done', 'failed', 'canceled']);

function isCanceledLipsyncScene(scene: any) {
  return (
    scene?.lipSyncStatus === 'canceled' ||
    scene?.lip_sync_status === 'canceled' ||
    scene?.dialogShots?.status === 'canceled' ||
    scene?.dialog_shots?.status === 'canceled'
  );
}

function isActiveTwoshotStage(stage: unknown) {
  return !!stage && !TERMINAL_TWOSHOT_STAGES.has(String(stage));
}

function isActiveDialogShots(dialogShots: any) {
  return !!dialogShots?.status && !TERMINAL_DIALOG_SHOT_STATUSES.has(String(dialogShots.status));
}

// Customer-facing Composer generation should feel like one stable 7–8 minute
// process, not like separate phases racing each other to 70% after 2 minutes.
const RUN_NOMINAL_SECONDS = 480;

export function usePipelineProgress({
  scenes,
  assemblyConfig,
  renderPercent = 0,
  renderRunning = false,
  projectId,
}: UsePipelineProgressArgs) {
  const storageKey = storageKeyFor(projectId);
  // ── Per-run baselines ──────────────────────────────────────────────
  // Captured the moment a phase emits `:start`. They make the bar always
  // start at 0 %, even if some assets from a previous run already exist
  // (e.g. 3 of 4 clips ready → user clicks "generieren" → without this we
  // would resume at 75 %).
  const baselineRef = useRef<{
    clipsReady: number;
    clipsTotal: number;
    lipsyncDone: number;
    lipsyncTotal: number;
    dialogShotsDone: number;
    dialogShotsTotal: number;
    voiceoverHadAudio: boolean;
    musicHad: boolean;
  } | null>(null);
  const floorRef = useRef<Record<PipelinePhaseId, number>>({
    clips: 0, voiceover: 0, lipsync: 0, music: 0, export: 0,
  });
  const startedAtRef = useRef<Record<PipelinePhaseId, number | null>>({
    clips: null, voiceover: null, lipsync: null, music: null, export: null,
  });
  const pipelineStartRef = useRef<number | null>(null);
  const runFloorRef = useRef(0);

  // ── Hydration from sessionStorage ──────────────────────────────────
  // Restore the visual progress state across unmounts (route change,
  // device sleep, parent re-mount). Without this, the bar restarts at
  // 0 % even though the backend render is still mid-flight.
  const hydratedRef = useRef(false);
  const hydratedRealProgressRef = useRef<{ value: number; at: number } | null>(null);
  if (!hydratedRef.current) {
    hydratedRef.current = true;
    const snap = readSnapshot(storageKey);
    if (snap) {
      pipelineStartRef.current = snap.pipelineStart;
      runFloorRef.current = snap.runFloor;
      floorRef.current = snap.floor;
      startedAtRef.current = snap.startedAt;
      baselineRef.current = snap.baseline;
      hydratedRealProgressRef.current = snap.realProgress;
    }
  }
  const lastPersistAtRef = useRef(0);

  // ── Event-driven "start" flags ───────────────────────────────────
  const [eventFlags, setEventFlags] = useState<Record<PipelinePhaseId, boolean>>({
    clips: false, voiceover: false, lipsync: false, music: false, export: false,
  });

  // Snapshot scene/assembly state into refs so the event listener can read
  // the latest values without re-subscribing (which would lose pending events).
  const scenesRef = useRef(scenes);
  const assemblyRef = useRef(assemblyConfig);
  useEffect(() => { scenesRef.current = scenes; }, [scenes]);
  useEffect(() => { assemblyRef.current = assemblyConfig; }, [assemblyConfig]);

  useEffect(() => {
    return subscribePipelineEvents((e) => {
      const [phase, action] = e.type.split(':') as [PipelinePhaseId, 'start' | 'end'];
      if (action === 'start') {
        if (pipelineStartRef.current === null || phase === 'clips') {
          // Fresh run — clear any stale persisted snapshot from a previous run.
          clearSnapshot(storageKey);
          pipelineStartRef.current = Date.now();
          runFloorRef.current = 0;
          floorRef.current = { clips: 0, voiceover: 0, lipsync: 0, music: 0, export: 0 };
          startedAtRef.current = { clips: null, voiceover: null, lipsync: null, music: null, export: null };
        }
        // Reset this phase so it starts at 0 % for the new run.
        floorRef.current[phase] = 0;
        startedAtRef.current[phase] = Date.now();
        // Capture baselines at start time so already-ready assets don't
        // contribute to this run's progress.
        const ss = scenesRef.current;
        const ac = assemblyRef.current;
        const ai = ss.filter((s) => s.clipSource?.startsWith('ai-'));
        const lipTargets = ss.filter(
          (s) =>
            !isCanceledLipsyncScene(s) &&
            (isLipSyncIntentional(s as any) || !!(s as any).twoshotStage),
        );
        const dsTotals = lipTargets.reduce(
          (acc, s) => {
            const ds = (s as any).dialogShots ?? (s as any).dialog_shots ?? null;
            const shots = Array.isArray(ds?.shots) ? ds.shots : [];
            acc.total += shots.length;
            acc.done += shots.filter((sh: any) => sh.status === 'ready').length;
            return acc;
          },
          { done: 0, total: 0 },
        );
        baselineRef.current = {
          clipsReady: ai.filter((s) => s.clipStatus === 'ready').length,
          clipsTotal: ai.length,
          lipsyncDone: lipTargets.filter(
            (s) =>
              ((s as any).lipSyncStatus === 'done' && !!(s as any).lipSyncAppliedAt) ||
              (s as any).twoshotStage === 'done' ||
              (s as any).twoshotStage === 'complete' ||
              ((s as any).dialogShots ?? (s as any).dialog_shots)?.status === 'done',
          ).length,
          lipsyncTotal: lipTargets.length,
          dialogShotsDone: dsTotals.done,
          dialogShotsTotal: dsTotals.total,
          voiceoverHadAudio: !!ac?.voiceover?.audioUrl,
          musicHad: !!ac?.music,
        };
      }
      setEventFlags((prev) => ({ ...prev, [phase]: action === 'start' }));
      setBaselineVersion((v) => v + 1);
    });
  }, []);

  // Bumped whenever baselineRef.current is (re)written so dependent memos
  // recompute. Without this, lazy baseline initialization (below) silently
  // mutates the ref but clipsReal / lipsyncReal / etc. keep stale values.
  const [baselineVersion, setBaselineVersion] = useState(0);

  // ── Lazy baseline initialization ──────────────────────────────────────
  // If the user navigates to the composer while a scene is already mid-flight
  // (generating clip / running lipsync), no `*:start` event fires — yet
  // `clipsReal.running` becomes true and the bar shows up. Without a baseline
  // snapshot, already-ready scenes count toward the run's progress and the
  // bar appears at e.g. 48% instead of 0%. Detect raw activity straight from
  // the scene state and seed the baseline once.
  useEffect(() => {
    if (baselineRef.current !== null) return;
    const ss = scenes;
    const ac = assemblyConfig;
    const hasActiveBackend = ss.some((s) => {
      const sa = s as any;
      if (isCanceledLipsyncScene(sa)) return false;
      if (sa.clipStatus === 'generating') return true;
      if (sa.lipSyncStatus === 'running') return true;
      if (sa.replicatePredictionId) return true;
      const stage = sa.twoshotStage;
      if (isActiveTwoshotStage(stage)) return true;
      const ds = sa.dialogShots ?? sa.dialog_shots ?? null;
      if (isActiveDialogShots(ds)) return true;
      return false;
    });
    if (!hasActiveBackend) return;
    const ai = ss.filter((s) => s.clipSource?.startsWith('ai-'));
    const lipTargets = ss.filter(
      (s) =>
        !isCanceledLipsyncScene(s) &&
        (isLipSyncIntentional(s as any) || !!(s as any).twoshotStage),
    );
    const dsTotals = lipTargets.reduce(
      (acc, s) => {
        const ds = (s as any).dialogShots ?? (s as any).dialog_shots ?? null;
        const shots = Array.isArray(ds?.shots) ? ds.shots : [];
        acc.total += shots.length;
        acc.done += shots.filter((sh: any) => sh.status === 'ready').length;
        return acc;
      },
      { done: 0, total: 0 },
    );
    baselineRef.current = {
      clipsReady: ai.filter((s) => s.clipStatus === 'ready').length,
      clipsTotal: ai.length,
      lipsyncDone: lipTargets.filter(
        (s) =>
          ((s as any).lipSyncStatus === 'done' && !!(s as any).lipSyncAppliedAt) ||
          (s as any).twoshotStage === 'done' ||
          (s as any).twoshotStage === 'complete' ||
          ((s as any).dialogShots ?? (s as any).dialog_shots)?.status === 'done',
      ).length,
      lipsyncTotal: lipTargets.length,
      dialogShotsDone: dsTotals.done,
      dialogShotsTotal: dsTotals.total,
      voiceoverHadAudio: !!ac?.voiceover?.audioUrl,
      musicHad: !!ac?.music,
    };
    if (pipelineStartRef.current === null) {
      pipelineStartRef.current = Date.now();
      runFloorRef.current = 0;
    }
    setBaselineVersion((v) => v + 1);
  }, [scenes, assemblyConfig]);


  // ── Derived per-phase progress (from real state, relative to baseline) ──
  const dialogVoiceCount = (s: ComposerScene) =>
    s.dialogVoices ? Object.keys(s.dialogVoices).length : 0;

  const hasLipsyncScenes = useMemo(
    () =>
      scenes.some(
        (s) => {
          if (isCanceledLipsyncScene(s)) return false;
          // v223: a scene whose master clip failed can never enter lipsync.
          // Do not treat it as a lipsync target — otherwise the global bar
          // shows misleading progress (e.g. 96%) for a scene that hard-failed
          // at image generation (Green-Net reject, etc.).
          const cs = (s as any).clipStatus ?? (s as any).clip_status;
          if (cs === 'failed') return false;
          return (
            isLipSyncIntentional(s as any) ||
            !!(s as any).twoshotStage
          );
        },
      ),
    [scenes],
  );


  const aiScenes = useMemo(
    () => scenes.filter((s) => s.clipSource?.startsWith('ai-')),
    [scenes],
  );

  const clipsReal = useMemo(() => {
    const b = baselineRef.current;
    if (aiScenes.length === 0) return { progress: 0, running: false, done: false, failed: false };
    // A scene also counts as ready when the lipsync chain produced a final
    // clip_url, even if some webhook variant forgot to flip clip_status.
    // Without this the bar gets stuck at ~40% in the Clips phase forever
    // after Sync.so finishes.
    const isReadyOrLipsynced = (s: any) =>
      s.clipStatus === 'ready' ||
      (!!s.clipUrl && (
        s.lipSyncStatus === 'applied' ||
        s.twoshotStage === 'complete' ||
        s.twoshotStage === 'done'
      ));
    const ready = aiScenes.filter(isReadyOrLipsynced).length;
    const generating = aiScenes.filter(
      (s) => s.clipStatus === 'generating' && !isReadyOrLipsynced(s),
    ).length;
    const failed = aiScenes.filter((s) => s.clipStatus === 'failed').length;
    // Stage 7: a scene with an active backend handle (Replicate prediction,
    // dialog-shot pipeline, lipsync stage) also counts as "running" — even
    // when clipStatus momentarily reverts to 'pending' between the optimistic
    // patch and the first DB realtime update. Without this, the progress bar
    // disappears for 5–30 s right after the user clicks "Generieren".
    const backendActive = aiScenes.filter((s) => {
      const sa = s as any;
      if (isCanceledLipsyncScene(sa)) return false;
      if (isReadyOrLipsynced(sa)) return false;
      const stage = sa.twoshotStage;
      const lip = sa.lipSyncStatus;
      const ds = sa.dialogShots ?? sa.dialog_shots ?? null;
      const dsActive = isActiveDialogShots(ds);
      return (
        !!sa.replicatePredictionId ||
        lip === 'running' ||
        isActiveTwoshotStage(stage) ||
        dsActive
      );
    }).length;
    // Progress is measured RELATIVE to the baseline captured on `clips:start`.
    const baseReady = b?.clipsReady ?? 0;
    const baseTotal = b?.clipsTotal ?? aiScenes.length;
    const denom = Math.max(1, baseTotal - baseReady);
    const numer = Math.max(0, ready - baseReady);
    const progress = Math.min(1, numer / denom);
    const running = generating > 0 || backendActive > 0;
    return {
      progress,
      running,
      done: progress >= 1 && !running && failed === 0,
      failed: failed > 0 && !running,
    };
  }, [aiScenes, baselineVersion]);

  const voiceoverReal = useMemo(() => {
    const vo = assemblyConfig?.voiceover;
    const b = baselineRef.current;
    // For Cinematic-Sync / sync-segments flows the user does NOT see an
    // independent "Voiceover" step — `compose-twoshot-audio` is an internal
    // sub-step of Lip-Sync. Suppress the phase entirely when the only audio
    // activity is for lipsync scenes.
    const dialogOnlyAudio =
      hasLipsyncScenes && (!vo?.enabled && !vo?.audioUrl);
    if (dialogOnlyAudio) {
      return { progress: 0, running: false, done: false, applicable: false };
    }
    if (!vo?.enabled && !vo?.audioUrl) {
      return { progress: 0, running: false, done: false, applicable: false };
    }
    if (b?.voiceoverHadAudio) {
      return { progress: 1, running: false, done: true, applicable: false };
    }
    return {
      progress: vo?.audioUrl ? 1 : 0,
      running: !vo?.audioUrl,
      done: !!vo?.audioUrl,
      applicable: true,
    };
  }, [assemblyConfig?.voiceover, hasLipsyncScenes, baselineVersion]);

  const lipsyncReal = useMemo(() => {
    if (!hasLipsyncScenes) {
      return { progress: 0, running: false, done: false, applicable: false, failed: false };
    }
    const targets = scenes.filter(
      (s) => {
        // v182: failed master clip must never count as "lipsync running" — the
        // bar would otherwise spin on a scene where lip-sync is impossible.
        const cs = (s as any).clipStatus ?? (s as any).clip_status;
        const ts = (s as any).twoshotStage ?? (s as any).twoshot_stage;
        const ls = (s as any).lipSyncStatus ?? (s as any).lip_sync_status;
        if (cs === 'failed') return false;
        if (TERMINAL_TWOSHOT_STAGES.has(String(ts))) return false;
        if (ls === 'canceled') return false;
        if (isCanceledLipsyncScene(s)) return false;
        return (
          isLipSyncIntentional(s as any) ||
          !!(s as any).twoshotStage
        );
      },
    );

    const getDialogShots = (s: any) => (s.dialogShots ?? s.dialog_shots ?? null) as
      | { status?: string; shots?: Array<{ status: string }> }
      | null;

    /**
     * lip_sync_status is the authoritative terminal signal — webhook /
     * watchdog / refund paths all write to it. A stale `dialog_shots.status`
     * value (e.g. v4 row with status='queued' but lipSyncStatus='failed')
     * must NOT keep the bar pinned in "running" forever.
     */
    const isTerminalScene = (s: any) =>
      s.lipSyncStatus === 'applied' ||
      s.lipSyncStatus === 'canceled' ||
      s.lipSyncStatus === 'failed' ||
      TERMINAL_TWOSHOT_STAGES.has(String(s.twoshotStage ?? '')) ||
      TERMINAL_DIALOG_SHOT_STATUSES.has(String(getDialogShots(s)?.status ?? ''));

    const done = targets.filter((s) => {
      const ds = getDialogShots(s);
      if (ds?.status === 'done') return true;
      return (
        ((s as any).lipSyncStatus === 'done' && !!(s as any).lipSyncAppliedAt) ||
        (s as any).lipSyncStatus === 'applied' ||
        (s as any).twoshotStage === 'done' ||
        (s as any).twoshotStage === 'complete'
      );
    }).length;

    // A scene is only "really" running if there's evidence of an active
    // provider job AND it's not already in a terminal lipSyncStatus.
    const hasRealJob = (s: any) => {
      if (isTerminalScene(s)) return false;
      const predId = s.replicatePredictionId;
      if (typeof predId === 'string' && predId.startsWith('sync:')) return true;
      const plan = s.audioPlan as any;
      const jobs = plan?.twoshot?.syncJobs?.jobs;
      if (Array.isArray(jobs) && jobs.length > 0) return true;
      if (plan?.twoshot?.heartbeat?.syncJobId) return true;
      const ds = getDialogShots(s);
      if (isActiveDialogShots(ds)) return true;
      if (Array.isArray(ds?.shots) && ds!.shots.some((sh) =>
        ['pending', 'generating', 'generated', 'lipsyncing'].includes(sh.status),
      )) return true;
      return false;
    };
    const running = targets.some(
      (s) =>
        !isTerminalScene(s) &&
        (s as any).lipSyncStatus === 'running' &&
        hasRealJob(s),
    ) || targets.some(
      (s) => {
        if (isTerminalScene(s)) return false;
        const stage = (s as any).twoshotStage;
        if (!isActiveTwoshotStage(stage)) return false;
        // Frühe v5-Stages (Audio-Prep, Anchor-Bau, Master-Plate, Sync.so-Queue,
        // Audio-Mux, Circuit Breaker) zählen als laufend — auch wenn
        // lipSyncStatus noch null/pending/audio_muxing ist. Sonst verschwindet
        // der globale Balken sobald irgendein interner Zwischenschritt läuft.
        if ([
          'audio',
          'anchor',
          'master_clip',
          'preflight',
          'deferred',
          'circuit_open',
          'audio_muxing',
        ].includes(stage)) {
          return true;
        }
        return hasRealJob(s) || (s as any).lipSyncStatus === 'running' || (s as any).lipSyncStatus === 'audio_muxing';
      },
    ) || targets.some((s) => {
      if (isTerminalScene(s)) return false;
      const ds = getDialogShots(s);
      return isActiveDialogShots(ds);
    });

    const failed = targets.some((s) => {
      const ds = getDialogShots(s);
      if (ds?.status === 'failed') return true;
      // Ignore scenes mid auto-retry (clip_error starts with "auto-retry:" and
      // lipSyncStatus has been reset back to pending). Those are recovering,
      // not failed — surfacing them as failed makes the bar flash red while
      // the v4 per-turn path is actually progressing underneath.
      const ce = (s as any).clipError as string | undefined;
      const isAutoRetry = typeof ce === 'string' && ce.startsWith('auto-retry:');
      if (isAutoRetry && (s as any).lipSyncStatus !== 'failed') return false;
      return (s as any).lipSyncStatus === 'failed' ||
        (s as any).twoshotStage === 'failed' ||
        (s as any).twoshotStage === 'audio_mux_failed' ||
        (s as any).twoshotStage === 'needs_clip_rerender';
    });

    const b = baselineRef.current;

    // Per-shot progress (Dialog-Shot v4 pipeline) — finer-grained than scenes.
    const dsTotals = targets.reduce(
      (acc, s) => {
        const ds = getDialogShots(s);
        const shots = Array.isArray(ds?.shots) ? ds!.shots : [];
        acc.total += shots.length;
        acc.done += shots.filter((sh) => sh.status === 'ready').length;
        return acc;
      },
      { done: 0, total: 0 },
    );

    // Count "settled" scenes (terminal in any form) so a single failed scene
    // doesn't keep the bar pinned at 95% — failed counts toward "we're done
    // processing", just with a failure flag surfaced separately.
    const settled = targets.filter(isTerminalScene).length;

    let progress: number;
    if (dsTotals.total > 0) {
      const baseDone = b?.dialogShotsDone ?? 0;
      const denom = Math.max(1, dsTotals.total - baseDone);
      const numer = Math.max(0, dsTotals.done - baseDone);
      progress = Math.min(1, numer / denom);
      if (progress < 1 && done >= targets.length) progress = 1;
      const baseSceneDone = b?.lipsyncDone ?? 0;
      const baseSceneTotal = b?.lipsyncTotal ?? targets.length;
      const sceneDenom = Math.max(1, baseSceneTotal - baseSceneDone);
      const sceneNumer = Math.max(0, done - baseSceneDone);
      progress = Math.max(progress, Math.min(1, sceneNumer / sceneDenom));
    } else {
      const baseDone = b?.lipsyncDone ?? 0;
      const baseTotal = b?.lipsyncTotal ?? targets.length;
      const denom = Math.max(1, baseTotal - baseDone);
      const numer = Math.max(0, done - baseDone);
      progress = Math.min(1, numer / denom);
    }

    // If every target scene is in a terminal state, the lipsync phase is over
    // — force progress to 1 so the soft-floor cap can't keep us at 95%.
    if (settled >= targets.length) {
      progress = 1;
    }

    return {
      progress,
      running: running && settled < targets.length,
      done: progress >= 1 && (!running || settled >= targets.length) && !failed,
      applicable: true,
      failed,
    };
  }, [scenes, hasLipsyncScenes, baselineVersion]);

  const musicReal = useMemo(() => {
    const m = assemblyConfig?.music;
    const b = baselineRef.current;
    if (!m) return { progress: 0, running: false, done: false, applicable: false };
    if (b?.musicHad) return { progress: 1, running: false, done: true, applicable: false };
    return { progress: 1, running: false, done: true, applicable: true };
  }, [assemblyConfig?.music, baselineVersion]);

  const exportReal = useMemo(() => {
    if (!renderRunning && renderPercent <= 0) {
      return { progress: 0, running: false, done: false, applicable: false };
    }
    return {
      progress: Math.min(1, renderPercent / 100),
      running: renderRunning && renderPercent < 100,
      done: renderPercent >= 100,
      applicable: true,
    };
  }, [renderPercent, renderRunning]);

  const [floorTick, setFloorTick] = useState(0);

  // 1-second tick to drive the floor animation while any phase is running.
  useEffect(() => {
    const anyRunning =
      eventFlags.clips || eventFlags.voiceover || eventFlags.lipsync ||
      eventFlags.music || eventFlags.export ||
      clipsReal.running || voiceoverReal.running || lipsyncReal.running ||
      musicReal.running || exportReal.running;
    if (!anyRunning) return;
    const id = window.setInterval(() => setFloorTick((t) => t + 1), 1000);
    return () => window.clearInterval(id);
  }, [
    eventFlags,
    clipsReal.running, voiceoverReal.running, lipsyncReal.running,
    musicReal.running, exportReal.running,
  ]);

  useEffect(() => {
    setEventFlags((prev) => {
      const next = { ...prev };
      if (prev.clips && (clipsReal.done || clipsReal.failed)) next.clips = false;
      if (prev.voiceover && voiceoverReal.done) next.voiceover = false;
      if (prev.lipsync && (lipsyncReal.done || lipsyncReal.failed)) next.lipsync = false;
      if (prev.music && musicReal.done) next.music = false;
      if (prev.export && exportReal.done) next.export = false;
      return next;
    });
  }, [clipsReal.done, clipsReal.failed, voiceoverReal.done, lipsyncReal.done, lipsyncReal.failed, musicReal.done, exportReal.done]);

  const phases: PipelinePhaseState[] = useMemo(() => {
    const list: { id: PipelinePhaseId; real: { progress: number; running: boolean; done: boolean; applicable?: boolean; failed?: boolean } }[] = [
      { id: 'clips', real: { ...clipsReal, applicable: true } },
      { id: 'voiceover', real: voiceoverReal },
      { id: 'lipsync', real: lipsyncReal },
      { id: 'music', real: musicReal },
      { id: 'export', real: exportReal },
    ];

    return list
      .filter((p) => p.real.applicable !== false || eventFlags[p.id])
      .map((p) => {
        const eventRunning = eventFlags[p.id];
        const running = eventRunning || p.real.running;
        const startedAt = startedAtRef.current[p.id];
        if (running && startedAt === null) {
          startedAtRef.current[p.id] = Date.now();
        }
        const elapsedSec = startedAt ? (Date.now() - startedAt) / 1000 : 0;
        // Soft floor — slowly walks the bar so the user sees motion even
        // before any real status update arrives. Caps at 0.95.
        const softFloor = running
          ? Math.min(0.95, (elapsedSec / PHASE_NOMINAL_SECONDS[p.id]) * 0.95)
          : 0;
        const merged = Math.max(p.real.progress, softFloor, floorRef.current[p.id]);
        const next = p.real.done ? 1 : Math.min(0.99, merged);
        floorRef.current[p.id] = Math.max(floorRef.current[p.id], next);
        return {
          id: p.id,
          label: PHASE_LABELS_DE[p.id],
          weight: PHASE_WEIGHTS[p.id],
          progress: floorRef.current[p.id],
          status: ((p.real as any).failed
            ? 'failed'
            : p.real.done
            ? 'done'
            : running
            ? 'running'
            : 'idle') as PipelinePhaseState['status'],
        };
      });
  }, [
    clipsReal, voiceoverReal, lipsyncReal, musicReal, exportReal,
    eventFlags, floorTick,
  ]);

  const phaseOverall = (() => {
    const totalWeight = phases.reduce((sum, p) => sum + p.weight, 0) || 1;
    return (phases.reduce((sum, p) => sum + p.weight * p.progress, 0) / totalWeight) * 100;
  })();

  const activePhase = phases.find((p) => p.status === 'running');
  const isActive = phases.some((p) => p.status === 'running');
  // Pipeline start time = first time anything went "running"
  useEffect(() => {
    if (isActive && pipelineStartRef.current === null) {
      pipelineStartRef.current = Date.now();
      runFloorRef.current = 0;
    }
    if (!isActive && phases.every((p) => p.status !== 'running')) {
      // keep last value briefly; reset 5s after everything settles
      const id = window.setTimeout(() => {
        if (!phases.some((p) => p.status === 'running')) {
          pipelineStartRef.current = null;
          clearSnapshot(storageKey);
        }
      }, 5000);
      return () => window.clearTimeout(id);
    }
  }, [isActive, phases]);

  const elapsedSeconds = pipelineStartRef.current
    ? Math.round((Date.now() - pipelineStartRef.current) / 1000)
    : 0;

  // ── Stall detection ─────────────────────────────────────────────────
  // Track the highest *real* (non-soft-floor) progress we've seen this run.
  // If the bar sits ≥ 90 % for > 4 min without any real movement, declare
  // the pipeline stalled — the UI flips to red + offers a retry, instead of
  // pretending to load forever (observed 2026-05-31: bar stuck at 95% with
  // "Slots 0/3" for 21 min after compose-video-clips silently crashed).
  // v73 — Multi-speaker fan-out (3–4 Sprecher) braucht legitim mehr als 4
  // Minuten (4× Sync.so + 4× Preclip + Audio-Mux). Stall-Threshold dynamisch.
  const lipTargetCount = (scenes ?? []).filter((s: any) =>
    !isCanceledLipsyncScene(s) &&
    (s.twoshotStage ||
      s.engineOverride === 'cinematic-sync' ||
      (s.dialogVoices ? Object.keys(s.dialogVoices).length : 0) > 1),
  ).length;
  const maxSpeakers = (scenes ?? []).reduce((m: number, s: any) => {
    const n = s.dialogVoices ? Object.keys(s.dialogVoices).length : 0;
    return n > m ? n : m;
  }, 0);
  const STALL_THRESHOLD_MS = Math.max(4, maxSpeakers * 3, lipTargetCount * 2) * 60 * 1000;
  const STALL_MIN_PERCENT = 95;
  const realProgressRef = useRef<{ value: number; at: number }>(
    hydratedRealProgressRef.current ?? { value: 0, at: Date.now() },
  );
  const realProgressSum =
    clipsReal.progress * PHASE_WEIGHTS.clips +
    voiceoverReal.progress * PHASE_WEIGHTS.voiceover +
    lipsyncReal.progress * PHASE_WEIGHTS.lipsync +
    musicReal.progress * PHASE_WEIGHTS.music +
    exportReal.progress * PHASE_WEIGHTS.export;
  if (realProgressSum > realProgressRef.current.value + 0.001) {
    realProgressRef.current = { value: realProgressSum, at: Date.now() };
  }
  // v73 — Active backend evidence suppresses the stall flag: as long as
  // a Sync.so job / audio-mux render / non-terminal twoshot stage is
  // visible in the scene state, the run is NOT stalled even if the
  // weighted progress bar hasn't moved (Sync.so passes are long).
  const hasActiveLipsyncEvidence = (scenes ?? []).some((s: any) => {
    if (isCanceledLipsyncScene(s)) return false;
    if (s.lipSyncStatus === 'running' || s.lipSyncStatus === 'audio_muxing') return true;
    if (s.engineOverride === 'cinematic-sync' && s.clipStatus === 'generating') return true;
    const stage = s.twoshotStage;
    if (isActiveTwoshotStage(stage)) return true;
    const ds = s.dialogShots ?? s.dialog_shots ?? null;
    if (isActiveDialogShots(ds)) return true;
    if (ds?.audio_mux?.render_id) return true;
    const predId = s.replicatePredictionId;
    if (typeof predId === 'string' && predId.startsWith('sync:')) return true;
    return false;
  });
  const isStalled =
    isActive &&
    !!pipelineStartRef.current &&
    !hasActiveLipsyncEvidence &&
    runFloorRef.current >= STALL_MIN_PERCENT &&
    Date.now() - realProgressRef.current.at > STALL_THRESHOLD_MS;


  // Reset the stall baseline whenever the pipeline stops being active.
  useEffect(() => {
    if (!isActive) {
      realProgressRef.current = { value: 0, at: Date.now() };
    }
  }, [isActive]);

  // v20: When lipsync transitions from failed → not-failed (auto-retry path
  // resets lip_sync_status from 'failed' back to 'pending' / 'running'), reset
  // the stall baseline AND the run-floor so the bar doesn't keep showing
  // "Fehler" while the new attempt is progressing. Without this, the prior
  // failed-and-recovered v5 attempt leaves runFloorRef ≥90% with no real
  // movement → the 4-min stall window flips hasFailure=true even though v4 is
  // actively making progress underneath.
  const lipsyncFailedRef = useRef<boolean>(false);
  useEffect(() => {
    const wasFailed = lipsyncFailedRef.current;
    lipsyncFailedRef.current = lipsyncReal.failed;
    if (wasFailed && !lipsyncReal.failed) {
      realProgressRef.current = { value: 0, at: Date.now() };
      runFloorRef.current = 0;
      floorRef.current.lipsync = 0;
    }
  }, [lipsyncReal.failed]);

  // Once lipsync is terminal (done or failed) AND no export is running, stop
  // letting the run-soft-percent ramp toward RUN_NOMINAL_SECONDS — otherwise
  // the bar visibly keeps "loading" for minutes after Sync.so reported done.
  // Cap at the actual weighted-phase total instead.
  const lipsyncPhase = phases.find((p) => p.id === 'lipsync');
  const exportPhase = phases.find((p) => p.id === 'export');
  const lipsyncTerminal = !!lipsyncPhase && (lipsyncPhase.status === 'done' || lipsyncPhase.status === 'failed');
  const exportIdleOrDone = !exportPhase || exportPhase.status === 'idle' || exportPhase.status === 'done';
  const waitingForExport = lipsyncTerminal && exportIdleOrDone && !renderRunning;

  const runSoftPercent = isActive && pipelineStartRef.current && !waitingForExport && !isStalled
    ? Math.min(95, Math.max(1, (elapsedSeconds / RUN_NOMINAL_SECONDS) * 95))
    : 0;
  const hasFailure = phases.some((p) => p.status === 'failed') || isStalled;
  const allDone = phases.length > 0 && phases.every((p) => p.status === 'done');
  const completedCleanly = !isActive && !hasFailure && phases.some((p) => p.status === 'done');
  // When lipsync is terminal and we're waiting for the user to trigger the
  // final render, lock the bar at the sum of completed phase weights.
  const currentOverall = allDone || completedCleanly
    ? 100
    : waitingForExport
      ? phaseOverall
      : isActive
        ? runSoftPercent
        : hasFailure
          ? runFloorRef.current
          : phaseOverall;
  runFloorRef.current = isActive && !waitingForExport && !isStalled
    ? Math.max(runFloorRef.current, currentOverall)
    : currentOverall;
  const overallPercent = Math.round(allDone || completedCleanly ? 100 : Math.min(99, runFloorRef.current));
  const etaSeconds = isActive && !waitingForExport && !isStalled ? Math.max(0, RUN_NOMINAL_SECONDS - elapsedSeconds) : 0;

  // ── Persist snapshot (throttled to ~1 Hz) ────────────────────────
  // Survives unmount / device sleep so the bar resumes instead of
  // restarting at 0 % / 0s. Cleared when the run is terminal.
  if (allDone || completedCleanly || hasFailure) {
    if (pipelineStartRef.current === null) {
      // Already settled — make sure no stale snapshot lingers.
      clearSnapshot(storageKey);
    }
  } else if (pipelineStartRef.current !== null) {
    const now = Date.now();
    if (now - lastPersistAtRef.current > 1000) {
      lastPersistAtRef.current = now;
      writeSnapshot(storageKey, {
        pipelineStart: pipelineStartRef.current,
        runFloor: runFloorRef.current,
        floor: floorRef.current,
        startedAt: startedAtRef.current,
        baseline: baselineRef.current,
        realProgress: realProgressRef.current,
      });
    }
  }

  return {
    phases,
    activePhase: activePhase?.id ?? null,
    overallPercent,
    etaSeconds: Math.round(etaSeconds),
    elapsedSeconds,
    isActive: isActive && !isStalled,
    hasFailure,
    isStalled,
    stallHint: isStalled
      ? 'Pipeline scheint zu hängen — bitte erneut auf „Alle generieren" klicken.'
      : null,
  };
}
