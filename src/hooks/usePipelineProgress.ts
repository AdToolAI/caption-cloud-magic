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
  status: 'idle' | 'running' | 'done';
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
  voiceover: 45,
  lipsync: 90,
  music: 20,
  export: 70,
};

export function usePipelineProgress({
  scenes,
  assemblyConfig,
  renderPercent = 0,
  renderRunning = false,
}: UsePipelineProgressArgs) {
  // ── Event-driven "start" flags ───────────────────────────────────
  // The UI emits `clips:start` / `voiceover:start` right after the user
  // clicks, so the bar shows motion before any server state updates.
  const [eventFlags, setEventFlags] = useState<Record<PipelinePhaseId, boolean>>({
    clips: false,
    voiceover: false,
    lipsync: false,
    music: false,
    export: false,
  });

  useEffect(() => {
    return subscribePipelineEvents((e) => {
      const [phase, action] = e.type.split(':') as [PipelinePhaseId, 'start' | 'end'];
      setEventFlags((prev) => ({ ...prev, [phase]: action === 'start' }));
    });
  }, []);

  // ── Derived per-phase progress (from real state) ──────────────────
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
    if (aiScenes.length === 0) return { progress: 1, running: false, done: scenes.length > 0 };
    const ready = aiScenes.filter((s) => s.clipStatus === 'ready').length;
    const generating = aiScenes.filter((s) => s.clipStatus === 'generating').length;
    const progress = ready / aiScenes.length;
    return {
      progress,
      running: generating > 0,
      done: progress >= 1,
    };
  }, [aiScenes, scenes.length]);

  const voiceoverReal = useMemo(() => {
    const vo = assemblyConfig?.voiceover;
    if (!vo?.enabled && !vo?.audioUrl) {
      return { progress: 0, running: false, done: false, applicable: false };
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
      return { progress: 0, running: false, done: false, applicable: false };
    }
    const targets = scenes.filter(
      (s) =>
        (s as any).twoshotStage ||
        s.engineOverride === 'cinematic-sync' ||
        ((s.dialogVoices?.length ?? 0) > 1),
    );
    const done = targets.filter(
      (s) =>
        (s as any).lipSyncStatus === 'ready' ||
        (s as any).twoshotStage === 'complete',
    ).length;
    const running = targets.some(
      (s) =>
        (s as any).lipSyncStatus === 'running' ||
        ((s as any).twoshotStage && (s as any).twoshotStage !== 'complete' && (s as any).twoshotStage !== 'failed'),
    );
    const progress = targets.length === 0 ? 0 : done / targets.length;
    return { progress, running, done: progress >= 1, applicable: true };
  }, [scenes, hasLipsyncScenes]);

  const musicReal = useMemo(() => {
    const m = assemblyConfig?.music;
    if (!m) return { progress: 0, running: false, done: false, applicable: false };
    return {
      progress: 1,
      running: false,
      done: true,
      applicable: true,
    };
  }, [assemblyConfig?.music]);

  const exportReal = useMemo(() => {
    if (!renderRunning && renderPercent <= 0) {
      return { progress: 0, running: false, done: false, applicable: true };
    }
    return {
      progress: Math.min(1, renderPercent / 100),
      running: renderRunning && renderPercent < 100,
      done: renderPercent >= 100,
      applicable: true,
    };
  }, [renderPercent, renderRunning]);

  // ── Soft floor — monoton steigender Mindest-Fortschritt pro Phase ──
  // Damit der Balken auch ohne neuen Server-Tick spürbar wandert. Capped
  // bei 0.95, sodass der echte "done"-Tick auf 1.0 springt.
  const floorRef = useRef<Record<PipelinePhaseId, number>>({
    clips: 0,
    voiceover: 0,
    lipsync: 0,
    music: 0,
    export: 0,
  });
  const startedAtRef = useRef<Record<PipelinePhaseId, number | null>>({
    clips: null,
    voiceover: null,
    lipsync: null,
    music: null,
    export: null,
  });
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

  const phases: PipelinePhaseState[] = useMemo(() => {
    const list: { id: PipelinePhaseId; real: { progress: number; running: boolean; done: boolean; applicable?: boolean } }[] = [
      { id: 'clips', real: { ...clipsReal, applicable: true } },
      { id: 'voiceover', real: voiceoverReal },
      { id: 'lipsync', real: lipsyncReal },
      { id: 'music', real: musicReal },
      { id: 'export', real: exportReal },
    ];

    return list
      .filter((p) => p.real.applicable !== false)
      .map((p) => {
        const eventRunning = eventFlags[p.id];
        const running = eventRunning || p.real.running;
        const startedAt = startedAtRef.current[p.id];
        if (running && startedAt === null) {
          startedAtRef.current[p.id] = Date.now();
        }
        const elapsedSec = startedAt ? (Date.now() - startedAt) / 1000 : 0;
        // Floor grows ~0.3 %/s while running; soft cap 0.95 unless real says done.
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
          status: (p.real.done
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

  const totalWeight = phases.reduce((sum, p) => sum + p.weight, 0) || 1;
  const overallPercent = Math.round(
    (phases.reduce((sum, p) => sum + p.weight * p.progress, 0) / totalWeight) * 100,
  );

  const activePhase = phases.find((p) => p.status === 'running');
  const isActive = phases.some((p) => p.status === 'running');

  // ETA across remaining + active phases
  const etaSeconds = useMemo(() => {
    if (!isActive) return 0;
    return phases.reduce((sum, p) => {
      if (p.status === 'done') return sum;
      const remaining = 1 - p.progress;
      return sum + remaining * PHASE_NOMINAL_SECONDS[p.id];
    }, 0);
  }, [phases, isActive]);

  // Pipeline start time = first time anything went "running"
  const pipelineStartRef = useRef<number | null>(null);
  useEffect(() => {
    if (isActive && pipelineStartRef.current === null) {
      pipelineStartRef.current = Date.now();
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

  return {
    phases,
    activePhase: activePhase?.id ?? null,
    overallPercent,
    etaSeconds: Math.round(etaSeconds),
    elapsedSeconds,
    isActive,
  };
}
