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

// Customer-facing Composer generation should feel like one stable 7–8 minute
// process, not like separate phases racing each other to 70% after 2 minutes.
const RUN_NOMINAL_SECONDS = 480;

export function usePipelineProgress({
  scenes,
  assemblyConfig,
  renderPercent = 0,
  renderRunning = false,
}: UsePipelineProgressArgs) {
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
            (s as any).twoshotStage ||
            s.engineOverride === 'cinematic-sync' ||
            (s.dialogVoices ? Object.keys(s.dialogVoices).length : 0) > 1,
        );
        baselineRef.current = {
          clipsReady: ai.filter((s) => s.clipStatus === 'ready').length,
          clipsTotal: ai.length,
          lipsyncDone: lipTargets.filter(
            (s) =>
              ((s as any).lipSyncStatus === 'done' && !!(s as any).lipSyncAppliedAt) ||
              (s as any).twoshotStage === 'done' ||
              (s as any).twoshotStage === 'complete',
          ).length,
          lipsyncTotal: lipTargets.length,
          voiceoverHadAudio: !!ac?.voiceover?.audioUrl,
          musicHad: !!ac?.music,
        };
      }
      setEventFlags((prev) => ({ ...prev, [phase]: action === 'start' }));
    });
  }, []);

  // ── Derived per-phase progress (from real state, relative to baseline) ──
  const dialogVoiceCount = (s: ComposerScene) =>
    s.dialogVoices ? Object.keys(s.dialogVoices).length : 0;

  const hasLipsyncScenes = useMemo(
    () =>
      scenes.some(
        (s) =>
          (s as any).twoshotStage ||
          s.engineOverride === 'cinematic-sync' ||
          dialogVoiceCount(s) > 1,
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
    const ready = aiScenes.filter((s) => s.clipStatus === 'ready').length;
    const generating = aiScenes.filter((s) => s.clipStatus === 'generating').length;
    const failed = aiScenes.filter((s) => s.clipStatus === 'failed').length;
    // Progress is measured RELATIVE to the baseline captured on `clips:start`.
    const baseReady = b?.clipsReady ?? 0;
    const baseTotal = b?.clipsTotal ?? aiScenes.length;
    const denom = Math.max(1, baseTotal - baseReady);
    const numer = Math.max(0, ready - baseReady);
    const progress = Math.min(1, numer / denom);
    return {
      progress,
      running: generating > 0,
      done: progress >= 1 && generating === 0 && failed === 0,
      failed: failed > 0 && generating === 0,
    };
  }, [aiScenes]);

  const voiceoverReal = useMemo(() => {
    const vo = assemblyConfig?.voiceover;
    const b = baselineRef.current;
    if (!vo?.enabled && !vo?.audioUrl) {
      return { progress: 0, running: false, done: false, applicable: false };
    }
    // If audio already existed at baseline, this phase isn't part of the run.
    if (b?.voiceoverHadAudio) {
      return { progress: 1, running: false, done: true, applicable: false };
    }
    return {
      progress: vo?.audioUrl ? 1 : 0,
      running: !vo?.audioUrl,
      done: !!vo?.audioUrl,
      applicable: true,
    };
  }, [assemblyConfig?.voiceover]);

  const lipsyncReal = useMemo(() => {
    if (!hasLipsyncScenes) {
      return { progress: 0, running: false, done: false, applicable: false, failed: false };
    }
    const targets = scenes.filter(
      (s) =>
        (s as any).twoshotStage ||
        s.engineOverride === 'cinematic-sync' ||
        dialogVoiceCount(s) > 1,
    );
    const done = targets.filter(
      (s) =>
        ((s as any).lipSyncStatus === 'done' && !!(s as any).lipSyncAppliedAt) ||
        (s as any).twoshotStage === 'done' ||
        (s as any).twoshotStage === 'complete',
    ).length;
    // A scene is only "really" running if there's evidence of an active
    // provider job. Otherwise twoshot_stage='lipsync_*' + pending status
    // is a zombie state (the watchdog/client will repair it within a
    // tick) and must NOT keep the progress bar pinned at 95 %.
    const hasRealJob = (s: any) => {
      const predId = s.replicatePredictionId;
      if (typeof predId === 'string' && predId.startsWith('sync:')) return true;
      const plan = s.audioPlan as any;
      const jobs = plan?.twoshot?.syncJobs?.jobs;
      if (Array.isArray(jobs) && jobs.length > 0) return true;
      if (plan?.twoshot?.heartbeat?.syncJobId) return true;
      return false;
    };
    const running = targets.some(
      (s) =>
        (s as any).lipSyncStatus === 'running' &&
        hasRealJob(s),
    ) || targets.some(
      (s) => {
        const stage = (s as any).twoshotStage;
        if (!stage || ['complete', 'done', 'failed'].includes(stage)) return false;
        // Audio/anchor/master_clip stages legitimately precede the sync job.
        if (['audio', 'anchor', 'master_clip'].includes(stage)) {
          return (s as any).lipSyncStatus === 'running';
        }
        return hasRealJob(s);
      },
    );
    const failed = targets.some((s) => (s as any).lipSyncStatus === 'failed' || (s as any).twoshotStage === 'failed');
    const b = baselineRef.current;
    const baseDone = b?.lipsyncDone ?? 0;
    const baseTotal = b?.lipsyncTotal ?? targets.length;
    const denom = Math.max(1, baseTotal - baseDone);
    const numer = Math.max(0, done - baseDone);
    const progress = Math.min(1, numer / denom);
    return { progress, running, done: progress >= 1 && !running && !failed, applicable: true, failed };
  }, [scenes, hasLipsyncScenes]);

  const musicReal = useMemo(() => {
    const m = assemblyConfig?.music;
    const b = baselineRef.current;
    if (!m) return { progress: 0, running: false, done: false, applicable: false };
    if (b?.musicHad) return { progress: 1, running: false, done: true, applicable: false };
    return { progress: 1, running: false, done: true, applicable: true };
  }, [assemblyConfig?.music]);

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
        }
      }, 5000);
      return () => window.clearTimeout(id);
    }
  }, [isActive, phases]);

  const elapsedSeconds = pipelineStartRef.current
    ? Math.round((Date.now() - pipelineStartRef.current) / 1000)
    : 0;

  const runSoftPercent = isActive && pipelineStartRef.current
    ? Math.min(95, Math.max(1, (elapsedSeconds / RUN_NOMINAL_SECONDS) * 95))
    : 0;
  const hasFailure = phases.some((p) => p.status === 'failed');
  const allDone = phases.length > 0 && phases.every((p) => p.status === 'done');
  const completedCleanly = !isActive && !hasFailure && phases.some((p) => p.status === 'done');
  const currentOverall = allDone || completedCleanly ? 100 : isActive ? runSoftPercent : hasFailure ? runFloorRef.current : phaseOverall;
  runFloorRef.current = isActive ? Math.max(runFloorRef.current, currentOverall) : currentOverall;
  const overallPercent = Math.round(allDone || completedCleanly ? 100 : Math.min(99, runFloorRef.current));
  const etaSeconds = isActive ? Math.max(0, RUN_NOMINAL_SECONDS - elapsedSeconds) : 0;

  return {
    phases,
    activePhase: activePhase?.id ?? null,
    overallPercent,
    etaSeconds: Math.round(etaSeconds),
    elapsedSeconds,
    isActive,
  };
}
