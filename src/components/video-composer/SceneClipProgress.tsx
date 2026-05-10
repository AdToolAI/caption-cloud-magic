import { useEffect, useRef, useState } from 'react';
import { XCircle, Sparkles, Clock, Image as ImageIcon, Film, Zap, Loader2, Grid2x2, Scissors } from 'lucide-react';
import type { ComposerScene } from '@/types/video-composer';
import { SceneGenerationSkeleton } from './SceneGenerationSkeleton';
import { supabase } from '@/integrations/supabase/client';
import { toast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';
import RerollVariantGrid from './RerollVariantGrid';
import LeadInTrimSheet from './LeadInTrimSheet';
import { detectLeadInTrim } from '@/lib/video-composer/detectLeadInTrim';

/** Providers that produce an i2v lead-in freeze worth auto-trimming. */
const I2V_PROVIDERS: ReadonlyArray<string> = [
  'ai-hailuo', 'ai-kling', 'ai-wan', 'ai-seedance',
  'ai-luma', 'ai-veo', 'ai-sora', 'ai-pika', 'ai-happyhorse',
];

interface SceneClipProgressProps {
  scene: ComposerScene;
  index: number;
  /** Optional aspect hint forwarded to the LTX fast-preview call. */
  aspectRatio?: '16:9' | '9:16' | '1:1' | '4:5';
}

/**
 * Visual progress display for a scene's preview slot.
 * Phase 5.1 — when a Fast-Preview proxy exists (LTX, ~3s, 384px) we surface it
 * as a muted/looping overlay so the user can sanity-check composition while the
 * HQ render still runs. The "⚡ Schnell-Vorschau" trigger appears for AI scenes
 * that have a prompt but no clip yet (or that previously failed).
 */
export function SceneClipProgress({ scene, index, aspectRatio }: SceneClipProgressProps) {
  // Robust image detection: covers AI-image scenes whose uploadType
  // hasn't synced yet but whose clipSource already identifies them.
  const isImageScene =
    scene.uploadType === 'image' || scene.clipSource === 'ai-image';

  const isAi = scene.clipSource.startsWith('ai-');
  const hasPrompt = !!(scene.aiPrompt && scene.aiPrompt.trim().length >= 4);
  const previewStatus = scene.previewStatus ?? 'idle';
  const hasPreview = !!scene.previewClipUrl && previewStatus === 'ready';
  const hqReady = scene.clipUrl && scene.clipStatus === 'ready';

  const [busy, setBusy] = useState(false);
  const [gridOpen, setGridOpen] = useState(false);
  const [trimOpen, setTrimOpen] = useState(false);
  const variantCount = (scene.seedVariations ?? []).length;
  const variantsGenerating = (scene.seedVariations ?? []).some((v) => v?.status === 'generating');

  // Phase 5.5 — Auto-detect lead-in freeze ONCE per clipUrl, only for i2v
  // providers that haven't been trimmed yet (clip_lead_in_trim_seconds === 0).
  // The compose-video-clips function seeds a heuristic default; we only run
  // when that heuristic returned 0 and the clip looks i2v.
  const autoDetectedRef = useRef<string | null>(null);
  useEffect(() => {
    const url = scene.clipUrl;
    if (!url) return;
    if (autoDetectedRef.current === url) return;
    if ((scene.clipLeadInTrimSeconds ?? 0) > 0) return;
    if (!I2V_PROVIDERS.includes(scene.clipSource)) return;
    if (scene.clipStatus !== 'ready') return;
    autoDetectedRef.current = url;
    (async () => {
      try {
        const { trimSeconds } = await detectLeadInTrim(url);
        if (trimSeconds > 0) {
          await supabase
            .from('composer_scenes')
            .update({ clip_lead_in_trim_seconds: trimSeconds })
            .eq('id', scene.id);
        }
      } catch { /* silent — Smart-Trim is opt-in best-effort */ }
    })();
  }, [scene.clipUrl, scene.clipStatus, scene.clipSource, scene.clipLeadInTrimSeconds, scene.id]);

  const triggerFastPreview = async () => {
    if (busy) return;
    if (!hasPrompt) {
      toast({ title: 'Prompt fehlt', description: 'Bitte zuerst einen Prompt schreiben.', variant: 'destructive' });
      return;
    }
    setBusy(true);
    try {
      const { error } = await supabase.functions.invoke('generate-fast-preview', {
        body: {
          sceneId: scene.id,
          prompt: scene.aiPrompt,
          startImageUrl: scene.referenceImageUrl || scene.firstFrameUrl || undefined,
          aspectRatio: aspectRatio === '4:5' ? '9:16' : (aspectRatio ?? '16:9'),
        },
      });
      if (error) throw error;
      toast({
        title: '⚡ Schnell-Vorschau gestartet',
        description: '~10 Sekunden bis zum 3-Sekunden-Proxy.',
      });
    } catch (err) {
      toast({
        title: 'Vorschau fehlgeschlagen',
        description: err instanceof Error ? err.message : String(err),
        variant: 'destructive',
      });
    } finally {
      setBusy(false);
    }
  };

  // Cinematic-Sync state — render-engine === 'cinematic-sync' has 2 phases
  // (1) Hailuo i2v re-render of real scene  (2) Sync.so lip-sync polish.
  const isCinematic = scene.engineOverride === 'cinematic-sync';
  const lipSyncRunning = isCinematic && scene.lipSyncStatus === 'running';

  // ── Two-Shot Hook pipeline (6-stage progress) ────────────────────────────
  // Active whenever the audio-plan has ≥ 2 speakers (multi-character dialog).
  // Stages are written by `compose-twoshot-audio`, `compose-video-clips` and
  // `compose-twoshot-lipsync`. We render an overlay with a 6-step bar so the
  // user can see exactly where the pipeline is in real time.
  const speakerCount = scene.audioPlan?.speakers?.length ?? 0;
  const isTwoShot = speakerCount >= 2;
  const twoshotStage = scene.twoshotStage ?? null;
  const TWO_SHOT_STAGES: Array<{ key: NonNullable<typeof twoshotStage>; label: string }> = [
    { key: 'audio', label: 'Voiceover' },
    { key: 'anchor', label: 'Anchor' },
    { key: 'master_clip', label: 'Master-Clip' },
    { key: 'lipsync_1', label: 'Lip-Sync 1/2' },
    { key: 'lipsync_2', label: 'Lip-Sync 2/2' },
    { key: 'continuity', label: 'Continuity' },
  ];
  const stageIndex = (() => {
    if (!twoshotStage || twoshotStage === 'done') return -1;
    return TWO_SHOT_STAGES.findIndex((s) => s.key === twoshotStage);
  })();
  const currentStageLabel = stageIndex >= 0 ? TWO_SHOT_STAGES[stageIndex].label : null;
  const showTwoShotOverlay =
    isTwoShot &&
    twoshotStage &&
    twoshotStage !== 'done' &&
    !hqReady; // once HQ is ready (and stage = done) we hide the bar

  // READY → show video / image (with optional Fast-Preview swap badge if both exist)
  if (hqReady) {
    if (isImageScene) {
      return (
        <div className="relative w-full h-full">
          <img src={scene.clipUrl} alt={`Szene ${index + 1}`} className="w-full h-full object-cover" />
          <div className="absolute top-1 right-1 bg-black/60 backdrop-blur rounded px-1.5 py-0.5 flex items-center gap-1">
            <ImageIcon className="h-2.5 w-2.5 text-white" />
            <span className="text-[8px] text-white font-medium">Ken Burns</span>
          </div>
        </div>
      );
    }
    const trim = Math.max(0, Number(scene.clipLeadInTrimSeconds ?? 0));
    const showTrimButton = I2V_PROVIDERS.includes(scene.clipSource);
    return (
      <>
        <div className="relative w-full h-full">
          <video
            src={scene.clipUrl}
            className="w-full h-full object-cover"
            controls
            playsInline
            preload="metadata"
            onLoadedMetadata={(e) => {
              const el = e.currentTarget;
              try { el.volume = 0.9; } catch { /* noop */ }
              if (trim > 0) {
                try {
                  if (isFinite(el.duration) && trim < el.duration - 0.1) {
                    el.currentTime = trim;
                  }
                } catch { /* noop */ }
              }
            }}
          />
          {/* Cinematic-Sync — Hailuo done, Sync.so still running */}
          {lipSyncRunning && (
            <div className="absolute inset-0 bg-black/55 backdrop-blur-[1px] flex flex-col items-center justify-center gap-1 pointer-events-none">
              <Loader2 className="h-5 w-5 text-emerald-300 animate-spin" />
              <span className="text-[10px] text-emerald-200 font-semibold uppercase tracking-wide">Lip-Sync läuft</span>
              <span className="text-[8px] text-emerald-100/80">Sync.so · ~60 s</span>
            </div>
          )}
          {showTrimButton && !lipSyncRunning && (
            <button
              type="button"
              onClick={() => setTrimOpen(true)}
              className="absolute top-1 right-1 bg-black/70 hover:bg-black/90 text-amber-300 rounded px-1.5 py-0.5 text-[9px] flex items-center gap-1 border border-amber-500/40 shadow"
              title={trim > 0 ? `Lead-In: ${trim.toFixed(2)}s — anpassen` : 'Smart-Trim öffnen'}
            >
              <Scissors className="h-2.5 w-2.5" />
              {trim > 0 ? `${trim.toFixed(2)}s` : 'Trim'}
            </button>
          )}
        </div>
        <LeadInTrimSheet scene={scene} open={trimOpen} onOpenChange={setTrimOpen} />
      </>
    );
  }

  // GENERATING (HQ) → Phase 5.2 provider-tinted skeleton with live ETA
  if (scene.clipStatus === 'generating') {
    return (
      <div className="relative w-full h-full">
        <SceneGenerationSkeleton scene={scene} />
        {hasPreview && (
          <video
            src={scene.previewClipUrl!}
            className="absolute inset-0 w-full h-full object-cover opacity-90 pointer-events-none"
            autoPlay
            muted
            loop
            playsInline
          />
        )}
        {hasPreview && (
          <div className="absolute top-1 left-1 bg-amber-500/90 text-black rounded px-1.5 py-0.5 flex items-center gap-1 shadow">
            <Zap className="h-2.5 w-2.5" />
            <span className="text-[8px] font-bold uppercase tracking-wide">Vorschau</span>
          </div>
        )}
        {/* Cinematic-Sync — explicit phase 1 banner so user knows the OLD HeyGen avatar is being replaced */}
        {isCinematic && (
          <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-emerald-950/95 via-emerald-900/80 to-transparent px-2 py-1.5 pointer-events-none">
            <div className="flex items-center gap-1.5">
              <Loader2 className="h-3 w-3 text-emerald-300 animate-spin shrink-0" />
              <div className="min-w-0">
                <div className="text-[9px] font-bold text-emerald-200 uppercase tracking-wide truncate">
                  🎬 Echte Szene wird gerendert
                </div>
                <div className="text-[8px] text-emerald-100/80 truncate">
                  Hailuo · ~60 s · danach Lip-Sync
                </div>
              </div>
            </div>
          </div>
        )}
        {showTwoShotOverlay && <TwoShotStageBar stages={TWO_SHOT_STAGES} stageIndex={stageIndex} currentLabel={currentStageLabel} />}
  if (hasPreview) {
    return (
      <div className="relative w-full h-full bg-black">
        <video
          src={scene.previewClipUrl!}
          className="w-full h-full object-cover"
          autoPlay
          muted
          loop
          playsInline
        />
        <div className="absolute top-1 left-1 bg-amber-500/90 text-black rounded px-1.5 py-0.5 flex items-center gap-1 shadow">
          <Zap className="h-2.5 w-2.5" />
          <span className="text-[8px] font-bold uppercase tracking-wide">Schnell-Vorschau</span>
        </div>
        {isAi && hasPrompt && (
          <button
            type="button"
            onClick={triggerFastPreview}
            disabled={busy}
            className="absolute bottom-1 right-1 bg-black/70 hover:bg-black/90 text-white rounded px-1.5 py-0.5 text-[9px] flex items-center gap-1 transition"
            title="Schnell-Vorschau neu generieren"
          >
            {busy ? <Loader2 className="h-2.5 w-2.5 animate-spin" /> : <Zap className="h-2.5 w-2.5" />}
            Reroll
          </button>
        )}
      </div>
    );
  }

  // FAILED (HQ) → red error state (preserve fast-preview retry)
  if (scene.clipStatus === 'failed') {
    return (
      <div className="relative w-full h-full bg-destructive/10 border border-destructive/30 flex flex-col items-center justify-center gap-1">
        <XCircle className="h-5 w-5 text-destructive" />
        <span className="text-[9px] text-destructive font-medium">Fehlgeschlagen</span>
        {isAi && hasPrompt && (
          <button
            type="button"
            onClick={triggerFastPreview}
            disabled={busy || previewStatus === 'generating'}
            className="absolute bottom-1 right-1 bg-amber-500/90 hover:bg-amber-500 text-black rounded px-1.5 py-0.5 text-[9px] flex items-center gap-1 font-semibold"
          >
            {busy || previewStatus === 'generating'
              ? <Loader2 className="h-2.5 w-2.5 animate-spin" />
              : <Zap className="h-2.5 w-2.5" />}
            Vorschau
          </button>
        )}
      </div>
    );
  }

  // PREVIEW GENERATING (HQ pending) → shimmer w/ amber border
  if (previewStatus === 'generating') {
    return (
      <div className="relative w-full h-full bg-amber-500/10 border border-amber-500/40 flex flex-col items-center justify-center gap-1 overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-r from-amber-500/0 via-amber-500/30 to-amber-500/0 animate-pulse" />
        <Zap className="h-4 w-4 text-amber-400 relative z-10" />
        <span className="text-[9px] text-amber-300 font-medium relative z-10">Schnell-Vorschau läuft…</span>
        <span className="text-[8px] text-amber-300/70 relative z-10">~10 Sek.</span>
      </div>
    );
  }

  // PENDING → placeholder + ⚡ trigger + 4× grid trigger
  const Icon = scene.clipSource === 'upload' || scene.clipSource === 'stock' ? Film : Sparkles;
  return (
    <>
      <div className="relative w-full h-full bg-muted/20 border border-dashed border-border/40 flex flex-col items-center justify-center gap-1">
        <Icon className="h-4 w-4 text-muted-foreground/50" />
        <span className="text-[9px] text-muted-foreground/60">Szene {index + 1}</span>
        <span className="text-[8px] text-muted-foreground/40 flex items-center gap-0.5">
          <Clock className="h-2 w-2" /> bereit zum Generieren
        </span>
        {isAi && hasPrompt && (
          <div className="absolute bottom-1 right-1 flex gap-1">
            <button
              type="button"
              onClick={() => setGridOpen(true)}
              disabled={busy}
              className={cn(
                'rounded px-1.5 py-0.5 text-[9px] flex items-center gap-1 font-semibold shadow transition',
                'bg-black/70 hover:bg-black text-amber-300 border border-amber-500/40',
              )}
              title="4 Takes parallel mit verschiedenen Seeds (Reroll Pro)"
            >
              {variantsGenerating
                ? <Loader2 className="h-2.5 w-2.5 animate-spin" />
                : <Grid2x2 className="h-2.5 w-2.5" />}
              4×
              {variantCount > 0 && !variantsGenerating && (
                <span className="text-[8px] text-amber-300/70">({variantCount})</span>
              )}
            </button>
            <button
              type="button"
              onClick={triggerFastPreview}
              disabled={busy}
              className={cn(
                'rounded px-1.5 py-0.5 text-[9px] flex items-center gap-1 font-semibold shadow transition',
                'bg-amber-500/90 hover:bg-amber-500 text-black',
              )}
              title="3-Sekunden-Vorschau in ca. 10 Sek. (LTX, ~0.005 €)"
            >
              {busy ? <Loader2 className="h-2.5 w-2.5 animate-spin" /> : <Zap className="h-2.5 w-2.5" />}
              Schnell-Vorschau
            </button>
          </div>
        )}
      </div>
      <RerollVariantGrid
        scene={scene}
        open={gridOpen}
        onOpenChange={setGridOpen}
        aspectRatio={aspectRatio}
      />
    </>
  );
}
