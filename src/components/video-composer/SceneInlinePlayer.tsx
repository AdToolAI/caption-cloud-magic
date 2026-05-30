/**
 * SceneInlinePlayer — Stage 18: 16:9 mini-player tile for a single scene.
 *
 * Replaces the previous filmstrip thumbnail. Behaviours:
 *   - Has a clip → shows the video (autoplay-on-hover, muted, loop).
 *   - Has only a still frame / reference → shows it as poster + hover hint.
 *   - Empty → shows a friendly placeholder.
 *   - Status `generating` → animated shimmer with "Szene wird gebaut…".
 *     **No** Lambda/Replicate/Lipsync details surface here — the user sees
 *     ONE state ("Wird gebaut") and ONE result (the finished clip with VO &
 *     lip-sync already merged by the backend pipeline).
 *   - Center call-to-action button: "Generieren" / "Neu generieren".
 *
 * Selection styling (gold border + glow) is controlled by `isActive`.
 */
import { useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Play, RefreshCw, Sparkles, ImageIcon, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { useTranslation } from '@/hooks/useTranslation';
import type { ComposerScene } from '@/types/video-composer';

interface Props {
  scene: ComposerScene;
  index: number;
  isActive: boolean;
  isGenerating: boolean;
  onSelect: () => void;
  onGenerate: () => void;
}

const SCENE_TYPE_LABEL: Record<string, string> = {
  hook: 'Hook',
  problem: 'Problem',
  solution: 'Lösung',
  demo: 'Demo',
  'social-proof': 'Social Proof',
  cta: 'CTA',
  custom: 'Custom',
};

export default function SceneInlinePlayer({
  scene,
  index,
  isActive,
  isGenerating,
  onSelect,
  onGenerate,
}: Props) {
  const { t } = useTranslation();
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const [hovering, setHovering] = useState(false);

  const clipUrl = scene.clipUrl;
  const posterUrl =
    scene.firstFrameUrl ||
    scene.referenceImageUrl ||
    scene.lockReferenceUrl ||
    undefined;
  const status = scene.clipStatus;

  // Pipeline-Vollständigkeit: Bei Cinematic-Sync/Dialog-/Talking-Head-Szenen
  // ist der Clip erst dann "wirklich fertig", wenn auch der Lip-Sync sauber
  // durchgelaufen ist. Sonst zeigen wir keinen grünen Haken.
  const dialogVoiceCount = scene.dialogVoices ? Object.keys(scene.dialogVoices).length : 0;
  const needsLipsync =
    scene.engineOverride === 'cinematic-sync' ||
    !!(scene as any).twoshotStage ||
    dialogVoiceCount > 1;
  const lipSyncStatus = (scene as any).lipSyncStatus as string | null | undefined;
  const twoshotStage = (scene as any).twoshotStage as string | null | undefined;
  const lipSyncAppliedAt = (scene as any).lipSyncAppliedAt as string | null | undefined;
  const lipsyncDone =
    !needsLipsync ||
    (lipSyncStatus === 'done' && !!lipSyncAppliedAt) ||
    twoshotStage === 'done' ||
    twoshotStage === 'complete';
  const lipsyncFailed = lipSyncStatus === 'failed' || twoshotStage === 'failed';
  const lipsyncRunning =
    needsLipsync &&
    !lipsyncDone &&
    !lipsyncFailed &&
    (lipSyncStatus === 'running' ||
      (twoshotStage && twoshotStage !== 'failed') ||
      status === 'ready'); // clip ready, lip-sync still pending

  const isReady = status === 'ready' && !!clipUrl && lipsyncDone && !lipsyncFailed;
  const isFailed = status === 'failed' || lipsyncFailed;
  // Stage 6 self-heal: a scene marked `generating` is only really working if
  // there is an actual backend handle (Replicate prediction, sync.so job,
  // twoshot stage in flight). Otherwise it's a stale optimistic patch from a
  // previous session — show "Wartet" + Generieren-CTA instead of a fake
  // "Baut…" overlay that never resolves.
  const hasActiveBackendJob =
    !!(scene as any).replicatePredictionId ||
    lipSyncStatus === 'running' ||
    (twoshotStage && twoshotStage !== 'failed' && twoshotStage !== 'done' && twoshotStage !== 'complete');
  const isWorking =
    isGenerating ||
    (status === 'generating' && hasActiveBackendJob) ||
    lipsyncRunning;


  const handleMouseEnter = () => {
    setHovering(true);
    if (videoRef.current && isReady) {
      videoRef.current.play().catch(() => {});
    }
  };
  const handleMouseLeave = () => {
    setHovering(false);
    if (videoRef.current && isReady) {
      videoRef.current.pause();
      videoRef.current.currentTime = 0;
    }
  };

  const typeLabel = SCENE_TYPE_LABEL[scene.sceneType] ?? scene.sceneType;
  const cost = (scene.costEuros ?? 0).toFixed(2);

  return (
    <motion.div
      layout
      onClick={onSelect}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
      className={cn(
        'group relative flex flex-col rounded-2xl overflow-hidden cursor-pointer transition-all duration-300',
        'bg-card/40 backdrop-blur-sm border',
        isActive
          ? 'border-primary/70 shadow-[0_0_28px_-6px_hsl(var(--primary)/0.55)] ring-1 ring-primary/40'
          : 'border-border/40 hover:border-primary/40',
      )}
    >
      {/* Stage area (16:9) */}
      <div className="relative w-full aspect-video bg-black/60 overflow-hidden">
        {/* Index pill */}
        <div className="absolute top-1.5 left-1.5 z-20 flex items-center gap-1">
          <span className="px-1.5 py-0.5 rounded-md bg-black/60 backdrop-blur text-[9px] font-mono font-bold text-primary border border-primary/30">
            S{String(index + 1).padStart(2, '0')}
          </span>
          <span className="px-1.5 py-0.5 rounded-md bg-black/60 backdrop-blur text-[9px] uppercase tracking-wider text-foreground/80 border border-border/40">
            {typeLabel}
          </span>
        </div>

        {/* Status badge top-right */}
        <div className="absolute top-1.5 right-1.5 z-20 flex flex-col items-end gap-1">
          {isReady && (
            <span className="px-1.5 py-0.5 rounded-md bg-emerald-500/15 backdrop-blur text-[9px] font-semibold text-emerald-300 border border-emerald-500/40">
              ✓ {t('videoComposer.clipReadyBadge')}
            </span>
          )}
          {isWorking && (
            <span className="px-1.5 py-0.5 rounded-md bg-primary/15 backdrop-blur text-[9px] font-semibold text-primary border border-primary/40 flex items-center gap-1">
              <Loader2 className="h-2.5 w-2.5 animate-spin" />
              {lipsyncRunning && status === 'ready' ? 'Lip-Sync' : 'Baut'}
            </span>
          )}
          {!isReady && !isWorking && !isFailed && (
            <span className="px-1.5 py-0.5 rounded-md bg-muted/40 backdrop-blur text-[9px] uppercase tracking-wider text-muted-foreground border border-border/40">
              Wartet
            </span>
          )}
          {isFailed && (
            <span className="px-1.5 py-0.5 rounded-md bg-destructive/15 backdrop-blur text-[9px] font-semibold text-destructive border border-destructive/40">
              ✕ Fehler
            </span>
          )}
          {/* Stage 5 warn: legacy HappyHorse master with multi-speaker dialog →
              lip-sync was generated against the wrong plate. Re-render swaps to Hailuo. */}
          {scene.clipSource === 'ai-happyhorse' &&
            scene.engineOverride === 'cinematic-sync' &&
            dialogVoiceCount >= 2 && (
              <span
                title="Lip-Sync auf altem HappyHorse-Master. Bitte 🔁 Lip-Sync neu rendern — wird automatisch mit Hailuo erzeugt."
                className="px-1.5 py-0.5 rounded-md bg-amber-500/15 backdrop-blur text-[9px] font-semibold text-amber-300 border border-amber-500/40"
              >
                ⚠ Re-Render empfohlen
              </span>
            )}
        </div>


        {/* Media layer */}
        {isReady ? (
          <video
            ref={videoRef}
            src={clipUrl}
            poster={posterUrl}
            muted
            loop
            playsInline
            preload="metadata"
            className="absolute inset-0 w-full h-full object-cover"
          />
        ) : posterUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={posterUrl}
            alt={`Scene ${index + 1} preview`}
            className="absolute inset-0 w-full h-full object-cover opacity-80"
          />
        ) : (
          <div className="absolute inset-0 flex items-center justify-center bg-gradient-to-br from-card/40 to-black/40">
            <ImageIcon className="h-7 w-7 text-muted-foreground/40" />
          </div>
        )}

        {/* Working shimmer overlay */}
        <AnimatePresence>
          {isWorking && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="absolute inset-0 bg-gradient-to-br from-black/70 via-primary/10 to-black/70 backdrop-blur-[2px] flex flex-col items-center justify-center text-center px-3"
            >
              <motion.div
                animate={{ rotate: 360 }}
                transition={{ duration: 2.4, repeat: Infinity, ease: 'linear' }}
                className="h-9 w-9 rounded-full border-2 border-primary/40 border-t-primary"
              />
              {(() => {
                // Dreistufiges Label für Cinematic-Sync — spiegelt den
                // tatsächlichen Fortschritt (Audio-Prep → Master fertig →
                // Sync.so läuft) statt eines einzigen statischen Spinners.
                let title = 'Szene wird gebaut…';
                let sub = 'VO & Lip-Sync inklusive';
                if (status === 'ready' && lipsyncRunning) {
                  if (twoshotStage === 'audio') {
                    title = 'Audio wird vorbereitet…';
                    sub = 'Sync.so wartet auf Voiceover';
                  } else if (lipSyncStatus === 'running') {
                    title = 'Lip-Sync läuft…';
                    sub = 'Sync.so · ~60 s pro Sprecher-Turn';
                  } else if (twoshotStage === 'master_clip' || !twoshotStage) {
                    title = 'Master-Plate fertig — Sync.so wird gestartet…';
                    sub = 'Gleich geht\'s los';
                  } else {
                    title = 'Lip-Sync startet…';
                    sub = 'Sync.so · ~60 s pro Sprecher-Turn';
                  }
                }
                return (
                  <>
                    <p className="mt-2 text-[11px] font-semibold text-primary tracking-wide">
                      {title}
                    </p>
                    <p className="mt-0.5 text-[9px] text-muted-foreground">{sub}</p>
                  </>
                );
              })()}

            </motion.div>
          )}
        </AnimatePresence>


        {/* Center generate / re-roll CTA — hidden while playing */}
        {!isWorking && (!isReady || hovering) && (
          <div className="absolute inset-0 z-10 flex items-center justify-center pointer-events-none">
            <Button
              size="sm"
              variant={isReady ? 'outline' : 'default'}
              onClick={(e) => {
                e.stopPropagation();
                onGenerate();
              }}
              className={cn(
                'pointer-events-auto gap-1.5 text-[11px] font-semibold shadow-2xl',
                isReady
                  ? 'bg-black/70 backdrop-blur border-primary/40 text-primary hover:bg-primary/15'
                  : 'bg-primary text-primary-foreground hover:bg-primary/90 shadow-[0_0_24px_-4px_hsl(var(--primary)/0.7)]',
              )}
            >
              {isReady ? (
                <>
                  <RefreshCw className="h-3 w-3" /> Neu generieren
                </>
              ) : (
                <>
                  <Sparkles className="h-3 w-3" /> Generieren
                </>
              )}
            </Button>
          </div>
        )}

        {/* Hover play hint (when ready & not hovered) */}
        {isReady && !hovering && (
          <div className="absolute bottom-1.5 right-1.5 z-10 px-1.5 py-0.5 rounded-md bg-black/60 backdrop-blur text-[9px] text-foreground/80 flex items-center gap-1 border border-border/40">
            <Play className="h-2.5 w-2.5 fill-current" /> Hover
          </div>
        )}
      </div>

      {/* Footer info bar */}
      <div className="px-2.5 py-1.5 flex items-center justify-between gap-2 border-t border-border/30 bg-card/50">
        <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground min-w-0">
          <span className="font-medium text-foreground/80 truncate">
            {scene.durationSeconds}s
          </span>
          {scene.clipSource?.startsWith('ai-') && (
            <span className="truncate">{scene.clipSource.replace('ai-', '')}</span>
          )}
        </div>
        <span className="text-[10px] font-mono text-primary/80 shrink-0">€{cost}</span>
      </div>
    </motion.div>
  );
}
