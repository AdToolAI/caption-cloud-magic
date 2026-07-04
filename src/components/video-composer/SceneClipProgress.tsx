import { useEffect, useRef, useState } from 'react';
import { XCircle, Sparkles, Clock, Image as ImageIcon, Film, Zap, Loader2, Grid2x2, Scissors, RotateCcw } from 'lucide-react';
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

  // Cinematic-Sync state — Dialog-Shot pipeline (1..N speakers).
  // Each speaker turn becomes its own Hailuo plate + Sync.so lipsync.
  const isCinematic = scene.engineOverride === 'cinematic-sync';
  const dialogShotsState = (scene as any).dialogShots ?? (scene as any).dialog_shots ?? null;
  const lipSyncCanceled = scene.lipSyncStatus === 'canceled' || dialogShotsState?.status === 'canceled';
  const shouldBeSceneLipsync =
    !lipSyncCanceled &&
    (isCinematic ||
      scene.dialogMode === true ||
      scene.lipSyncWithVoiceover === true);
  const wrongTalkingHeadReady =
    shouldBeSceneLipsync &&
    scene.clipStatus === 'ready' &&
    typeof scene.clipUrl === 'string' &&
    scene.clipUrl.includes('/talking-head-renders/');
  const lipSyncRunning = isCinematic && !lipSyncCanceled && scene.lipSyncStatus === 'running';

  const resetWrongRenderPath = async () => {
    if (busy) return;
    setBusy(true);
    try {
      const { error } = await supabase
        .from('composer_scenes')
        .update({
          clip_url: null,
          clip_status: 'generating',
          clip_error: null,
          engine_override: 'cinematic-sync',
          lip_sync_with_voiceover: true,
          lip_sync_status: 'pending',
          twoshot_stage: 'audio',
          dialog_shots: null,
          lip_sync_source_clip_url: null,
          replicate_prediction_id: null,
        })
        .eq('id', scene.id);
      if (error) throw error;

      const { data: invokeData, error: invokeError } = await supabase.functions.invoke('compose-video-clips', {
        body: {
          projectId: scene.projectId,
          scenes: [
            {
              id: scene.id,
              projectId: scene.projectId,
              sceneType: scene.sceneType,
              clipSource: scene.clipSource,
              clipQuality: scene.clipQuality || 'standard',
              aiPrompt: scene.aiPrompt || '',
              negativePrompt: (scene as any).negativePrompt || undefined,
              uploadUrl: scene.uploadUrl,
              referenceImageUrl: scene.referenceImageUrl,
              durationSeconds: scene.durationSeconds,
              characterShot: scene.characterShot,
              characterShots: scene.characterShots,
              dialogScript: scene.dialogScript,
              dialogVoices: scene.dialogVoices,
              engineOverride: 'cinematic-sync',
              lipSyncWithVoiceover: true,
              dialogMode: scene.dialogMode === true,
              withAudio: scene.withAudio !== false,
            },
          ],
        },
      });
      if (invokeError) throw invokeError;
      if (invokeData && (invokeData as any).ok === false) {
        throw new Error((invokeData as any).error || (invokeData as any).message || 'Render konnte nicht gestartet werden.');
      }
      toast({
        title: 'Renderpfad neu gestartet',
        description: 'Die Szene läuft jetzt über HappyHorse/Hailuo + Sync.so.',
      });
    } catch (err) {
      toast({
        title: 'Reset fehlgeschlagen',
        description: err instanceof Error ? err.message : String(err),
        variant: 'destructive',
      });
    } finally {
      setBusy(false);
    }
  };

  // ── Dialog-Shot pipeline progress (per-shot status) ──────────────────────
  // `dialog_shots` is written by `compose-dialog-scene` and updated by
  // `poll-dialog-shots`. Each shot has its own lifecycle: pending →
  // generating → generated → lipsyncing → ready (or failed).
  const dialogShots: Array<{
    idx: number;
    speaker_name?: string;
    status: 'pending' | 'generating' | 'generated' | 'lipsyncing' | 'ready' | 'failed';
    error?: string;
  }> = Array.isArray(dialogShotsState?.shots)
    ? dialogShotsState.shots
    : Array.isArray(dialogShotsState?.passes)
      ? dialogShotsState.passes.map((p: any) => ({
          idx: Number(p?.idx ?? 0),
          speaker_name: p?.speaker_name,
          status:
            p?.status === 'done' ? 'ready'
              : p?.status === 'rendering' || p?.status === 'retrying' ? 'lipsyncing'
                : p?.status === 'failed' || p?.status === 'canceled_by_scene_failure' ? 'failed'
                  : 'pending',
          error: p?.error ?? p?.last_error,
        }))
      : [];
  const isDialog = isCinematic && !lipSyncCanceled && (dialogShots.length > 0 || lipSyncRunning);
  const dialogReady = dialogShots.filter((s) => s.status === 'ready').length;
  const dialogTotal = dialogShots.length;
  const showDialogOverlay = isDialog && !hqReady && !['done', 'canceled'].includes(String(dialogShotsState?.status ?? ''));

  if (wrongTalkingHeadReady) {
    return (
      <div className="relative w-full h-full bg-destructive/10 border border-destructive/40 flex flex-col items-center justify-center gap-1 p-2 text-center">
        <XCircle className="h-5 w-5 text-destructive" />
        <span className="text-[9px] text-destructive font-semibold">Falscher Renderpfad</span>
        <span className="text-[8px] text-muted-foreground leading-tight">
          Talking-Head statt Szene + Sync.so
        </span>
        <button
          type="button"
          onClick={resetWrongRenderPath}
          disabled={busy}
          className="mt-1 bg-amber-500/90 hover:bg-amber-500 text-black rounded px-2 py-1 text-[9px] flex items-center gap-1 font-semibold disabled:opacity-60"
        >
          {busy ? <Loader2 className="h-2.5 w-2.5 animate-spin" /> : <RotateCcw className="h-2.5 w-2.5" />}
          Sauber neu starten
        </button>
      </div>
    );
  }

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
          {/* Per-shot progress bar while dialog pipeline is finishing on top of a ready master clip */}
          {isDialog && !['done', 'canceled'].includes(String(dialogShotsState?.status ?? '')) && (
            <DialogShotsBar shots={dialogShots} ready={dialogReady} total={dialogTotal} />
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
          {isDialog && dialogShotsState?.status === 'done' && typeof scene.continuityDriftScore === 'number' && scene.continuityDriftScore > 0.35 && (
            <div
              className="absolute bottom-1 left-1 bg-amber-500/90 text-black rounded px-1.5 py-0.5 text-[9px] font-semibold flex items-center gap-1 shadow"
              title={`Continuity-Drift ${scene.continuityDriftScore.toFixed(2)} — Charakter-Identität weicht vom Anchor ab. Re-Render empfohlen.`}
            >
              ⚠ Drift {scene.continuityDriftScore.toFixed(2)}
            </div>
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
        {showDialogOverlay && <DialogShotsBar shots={dialogShots} ready={dialogReady} total={dialogTotal} />}
      </div>
    );
  }

  // PREVIEW READY but HQ still pending/failed → autoplay proxy + offer regen
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

interface DialogShotsBarProps {
  shots: Array<{
    idx: number;
    speaker_name?: string;
    status: 'pending' | 'generating' | 'generated' | 'lipsyncing' | 'ready' | 'failed';
    error?: string;
  }>;
  ready: number;
  total: number;
}

/**
 * Per-shot progress overlay for the Dialog-Shot Pipeline (1..N speakers).
 * Each shot = 1 Hailuo plate + 1 Sync.so lipsync for one speaker turn.
 */
function DialogShotsBar({ shots, ready, total }: DialogShotsBarProps) {
  const headline = total > 0
    ? `🎭 Dialog-Shots · ${ready}/${total}`
    : '🎭 Dialog-Shots · Audio wird vorbereitet…';
  return (
    <div className="absolute inset-x-0 top-0 bg-gradient-to-b from-black/85 via-black/60 to-transparent px-2 py-1.5 pointer-events-none">
      <div className="flex items-center gap-1 mb-1">
        <Loader2 className="h-3 w-3 text-emerald-300 animate-spin shrink-0" />
        <span className="text-[9px] font-bold text-emerald-200 uppercase tracking-wide truncate">
          {headline}
        </span>
      </div>
      {total > 0 && (
        <div className="flex items-center gap-0.5">
          {shots.map((s) => {
            const isReady = s.status === 'ready';
            const isFailed = s.status === 'failed';
            const isActive = s.status === 'generating' || s.status === 'lipsyncing' || s.status === 'generated';
            return (
              <div
                key={s.idx}
                className={cn(
                  'h-1 flex-1 rounded-full transition-colors',
                  isReady && 'bg-emerald-400',
                  isFailed && 'bg-destructive',
                  isActive && 'bg-emerald-300 animate-pulse',
                  !isReady && !isFailed && !isActive && 'bg-white/15',
                )}
                title={`Shot ${s.idx + 1}${s.speaker_name ? ' · ' + s.speaker_name : ''} · ${s.status}${s.error ? ' · ' + s.error : ''}`}
              />
            );
          })}
        </div>
      )}
    </div>
  );
}
