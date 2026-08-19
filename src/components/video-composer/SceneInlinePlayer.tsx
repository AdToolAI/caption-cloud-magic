import { tx } from '@/lib/i18nText';
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
import { useEffect, useRef, useState } from 'react';
import { presentSceneError } from '@/lib/composer/errors/sceneErrorPresenter';
import { motion, AnimatePresence } from 'framer-motion';
import { Play, RefreshCw, Sparkles, ImageIcon, Loader2, AlertTriangle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { useTranslation } from '@/hooks/useTranslation';
import { useResetLipSync } from '@/hooks/useResetLipSync';
import type { ComposerScene } from '@/types/video-composer';
import { isLipSyncIntentional } from '@/lib/video-composer/lipSyncIntent';
import { countSceneSpeakers } from '@/lib/composer/countSceneSpeakers';
import { clipStatusFromState, isInFlightState, sceneState } from '@/lib/composer/sceneState';

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
  solution: tx({ de: "Lösung", en: "Solution", es: "Solución" }),
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
  const { t, language } = useTranslation();
  const notRenderedLabel = tx({ de: 'Noch nicht gerendert', en: 'Not rendered yet', es: 'Aún no renderizado' });
  const { reset: resetLipSync, resettingId } = useResetLipSync();
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const [hovering, setHovering] = useState(false);

  const clipUrl = scene.clipUrl;
  // Only true scene outputs count as a thumbnail. `referenceImageUrl` /
  // `lockReferenceUrl` are the *anchor* / front image and would otherwise
  // bleed into every not-yet-rendered scene, faking a render result.
  const posterUrl = scene.firstFrameUrl || scene.lastFrameUrl || undefined;
  const status = clipStatusFromState(sceneState(scene));
  const pipelineState = sceneState(scene);

  // Pipeline-Vollständigkeit: Bei Cinematic-Sync/Dialog-/Talking-Head-Szenen
  // ist der Clip erst dann "wirklich fertig", wenn auch der Lip-Sync sauber
  // durchgelaufen ist. Sonst zeigen wir keinen grünen Haken.
  const dialogVoiceCount = scene.dialogVoices ? countSceneSpeakers(scene) : 0;
  const needsLipsync =
    isLipSyncIntentional(scene) ||
    dialogVoiceCount > 1;
  const lipSyncAppliedAt = (scene as any).lipSyncAppliedAt as string | null | undefined;
  const dialogShots: any =
    (scene as any).dialogShots ?? (scene as any).dialog_shots ?? null;
  const lipsyncCanceled = pipelineState === 'canceled';
  const lipsyncDone =
    lipsyncCanceled ||
    !needsLipsync ||
    pipelineState === 'complete';
  const lipsyncFailed = pipelineState === 'failed';
  const lipsyncRunning =
    needsLipsync &&
    ['audio_prep', 'audio_ready', 'lipsync_dispatched', 'lipsync_running', 'lipsync_muxing'].includes(pipelineState);

  // v388 — Die frühere 9-Minuten-Eigenanzeige ist entfernt. Sie hat die
  // Szene in der Oberfläche als "Fehler" dargestellt, während der Server sie
  // noch als laufend führte — die Anzeige widersprach damit dem einzigen
  // gültigen Zustand. Terminal ist eine Szene ausschließlich dann, wenn der
  // Zustandsautomat das sagt. Für echte Hänger greift der Server-Watchdog.
  const isReady = !!clipUrl && (needsLipsync ? pipelineState === 'complete' : ['plate_ready', 'complete'].includes(pipelineState));
  const isFailed = pipelineState === 'failed';

  // Stage 6 self-heal: a scene marked `generating` is only really working if
  // there is an actual backend handle (Replicate prediction, sync.so job,
  // twoshot stage in flight). Otherwise it's a stale optimistic patch from a
  // previous session — show "Wartet" + Generieren-CTA instead of a fake
  // "Baut…" overlay that never resolves.
  const hasActiveBackendJob = !lipsyncCanceled && isInFlightState(pipelineState);
  const isWorking =
    !isFailed && (
      isGenerating ||
      hasActiveBackendJob ||
      lipsyncRunning
    );

  // ── Plan v72 — Start-Limbo detection ────────────────────────────────────
  // A scene parked in `master_clip` with NO provider job for >3 min means the
  // dispatcher never reached Sync.so. The server watchdog auto-recovers, but
  // we also surface an honest "Start hängt" banner + manual reset button so
  // the user is never staring at a silent spinner.
  const replicatePredId =
    (scene as any).replicatePredictionId ?? (scene as any).replicate_prediction_id;
  const hasProviderJobForLimbo =
    (typeof replicatePredId === 'string' && replicatePredId.startsWith('sync:')) ||
    !!dialogShots?.sync_job_id ||
    (Array.isArray(dialogShots?.shots) &&
      dialogShots.shots.some((s: any) => s?.sync_job_id)) ||
    (Array.isArray(dialogShots?.passes) &&
      dialogShots.passes.some((p: any) => p?.job_id));
  const inStartLimbo =
    lipsyncRunning &&
    pipelineState === 'audio_ready' &&
    !hasProviderJobForLimbo;
  const limboSinceRef = useRef<number | null>(null);
  const [limboStuck, setLimboStuck] = useState(false);
  useEffect(() => {
    if (!inStartLimbo) {
      limboSinceRef.current = null;
      if (limboStuck) setLimboStuck(false);
      return;
    }
    if (limboSinceRef.current == null) limboSinceRef.current = Date.now();
    const checkStuck = () => {
      if (limboSinceRef.current == null) return;
      const ageMs = Date.now() - limboSinceRef.current;
      // v94: 3min → 6min, weil der normale Dispatcher-Pfad (compose-dialog-scene
      // → poll-dialog-shots cron) im Worst-Case 60-90s pro Stage-Übergang kostet.
      // Der gelbe "Start hängt"-Banner ist nur UI; die Pipeline läuft unverändert.
      if (ageMs >= 6 * 60_000 && !limboStuck) setLimboStuck(true);
    };
    checkStuck();
    const handle = setInterval(checkStuck, 15_000);
    return () => clearInterval(handle);
  }, [inStartLimbo, limboStuck]);


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
              {lipsyncRunning && status === 'ready' ? 'Lip-Sync' : tx({ de: 'Baut', en: 'Building', es: 'Construyendo' })}
            </span>
          )}
          {!isReady && !isWorking && !isFailed && (
            <span className="px-1.5 py-0.5 rounded-md bg-muted/40 backdrop-blur text-[9px] uppercase tracking-wider text-muted-foreground border border-border/40">
              {tx({ de: "Wartet", en: "Waiting", es: "Esperando" })}
            </span>
          )}
          {isFailed && (
            <span className="px-1.5 py-0.5 rounded-md bg-destructive/15 backdrop-blur text-[9px] font-semibold text-destructive border border-destructive/40">
              ✕ {tx({ de: "Fehler", en: "Error", es: "Error" })}
            </span>
          )}
          {/* Stage 5 warn: legacy HappyHorse master with multi-speaker dialog →
              lip-sync was generated against the wrong plate. Re-render swaps to Hailuo. */}
          {!isWorking &&
            scene.clipSource === 'ai-happyhorse' &&
            isLipSyncIntentional(scene) &&
            dialogVoiceCount >= 2 && (
              <span
                title={tx({ de: "Die Lippensynchronisation läuft auf einem veralteten Video. Bitte die Lippensynchronisation neu erstellen.", en: "Lip-sync is running on an outdated video. Please re-create the lip-sync.", es: "La sincronización labial usa un video desactualizado. Vuelve a crearla." })}
                className="px-1.5 py-0.5 rounded-md bg-amber-500/15 backdrop-blur text-[9px] font-semibold text-amber-300 border border-amber-500/40"
              >
                ⚠ {tx({ de: "Re-Render empfohlen", en: "Re-render recommended", es: "Se recomienda volver a renderizar" })}
              </span>
            )}
        </div>


        {/* Media layer — während eines laufenden Neustarts darf NIE das
            Ergebnis des Vorlaufs zu sehen sein (sonst wirkt der Re-Render,
            als würde nichts passieren). */}
        {isReady && !isWorking ? (
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
        ) : posterUrl && !isWorking ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={posterUrl}
            alt={`Scene ${index + 1} preview`}
            className="absolute inset-0 w-full h-full object-cover opacity-80"
          />
        ) : (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-1.5 bg-gradient-to-br from-card/40 to-black/40">
            <ImageIcon className="h-7 w-7 text-muted-foreground/40" />
            <span className="text-[10px] uppercase tracking-[0.16em] text-muted-foreground/60">{notRenderedLabel}</span>
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
                // Stufiges Label für Cinematic-Sync — spiegelt jeden Schritt
                // der v5-Pipeline wider, damit der Nutzer immer sieht, wo
                // es gerade steht (statt eines stummen Spinners).
                const audioUrl = (scene as any).audioPlan?.twoshot?.url;
                // Plan v71: ehrliche Unterscheidung "wird gestartet" vs. "läuft".
                // Ein Provider-Job existiert nur, wenn dialog_shots.shots[] /
                // .passes[] / .sync_job_id oder replicate_prediction_id 'sync:'
                // gesetzt ist. Ohne das ist die Szene noch im Dispatch-Limbo.
                const ds: any = (scene as any).dialogShots ?? (scene as any).dialog_shots ?? null;
                const rpid = (scene as any).replicatePredictionId ?? (scene as any).replicate_prediction_id;
                const hasProviderJob =
                  (typeof rpid === 'string' && rpid.startsWith('sync:')) ||
                  !!ds?.sync_job_id ||
                  (Array.isArray(ds?.shots) && ds.shots.some((s: any) => s?.sync_job_id)) ||
                  (Array.isArray(ds?.passes) && ds.passes.some((p: any) => p?.job_id));
                // v353 — Die NOOP-Retry-Stufen wurden abgeschafft: ein
                // nachgewiesenes Passthrough ist sofort terminal. Es gibt
                // daher keinen "NOOP-Retry läuft"-Zustand mehr.
                const passesArr: any[] = Array.isArray(ds?.passes) ? ds.passes : [];

                const totalPasses = passesArr.length;
                const donePasses = passesArr.filter((p: any) => p?.status === "done" || p?.status === "failed").length;
                let title = tx({ de: 'Szene wird gebaut…', en: 'Scene is being built…', es: 'La escena se está creando…' });
                let sub = isLipSyncIntentional(scene) ? tx({ de: 'VO & Lip-Sync inklusive', en: 'VO & lip-sync included', es: 'VO y sincronización labial incluidas' }) : tx({ de: 'Nur Bild-Render', en: 'Image render only', es: 'Solo renderizado de imagen' });
                if (lipsyncRunning) {
                  if (pipelineState === 'lipsync_muxing') {
                    title = tx({ de: 'Lip-Sync wird zusammengesetzt…', en: 'Lip-sync is being assembled…', es: 'La sincronización labial se está ensamblando…' });
                    sub = tx({ de: 'Finaler Render läuft', en: 'Final render running', es: 'Renderizado final en curso' });
                  } else if (pipelineState === 'lipsync_running' && hasProviderJob) {

                    title = tx({ de: 'Lip-Sync läuft…', en: 'Lip-sync running…', es: 'Sincronización labial en curso…' });
                    sub = totalPasses > 0
                      ? `${tx({ de: 'Durchgang', en: 'Pass', es: 'Pasada' })} ${Math.min(donePasses + 1, totalPasses)}/${totalPasses}`
                      : tx({ de: '~60 s pro Sprecher', en: '~60s per speaker', es: '~60 s por hablante' });
                  } else if (pipelineState === 'audio_prep') {
                    if (audioUrl) {
                      title = tx({ de: 'Audio fertig — Lip-Sync wird gestartet…', en: 'Audio ready — starting lip-sync…', es: 'Audio listo — iniciando sincronización labial…' });
                      sub = tx({ de: 'Gleich geht\'s los', en: 'Starting shortly', es: 'Comenzando en breve' });
                    } else {
                      title = tx({ de: 'Audio wird vorbereitet…', en: 'Audio is being prepared…', es: 'El audio se está preparando…' });
                      sub = tx({ de: 'Voiceover wird generiert', en: 'Voiceover is being generated', es: 'Se está generando la voz en off' });
                    }
                  } else if (pipelineState === 'lipsync_dispatched' && hasProviderJob) {
                    title = tx({ de: 'Lip-Sync läuft…', en: 'Lip-sync running…', es: 'Sincronización labial en curso…' });
                    sub = tx({ de: '~60 s pro Sprecher', en: '~60s per speaker', es: '~60 s por hablante' });
                  } else if (pipelineState === 'audio_ready' && !hasProviderJob) {
                    // Recovery-Fenster: server-watchdog dispatcht spätestens nach 3 min.
                    if (limboStuck) {
                      title = tx({ de: 'Start hängt — wird neu angestoßen', en: 'Start is stuck — retrying', es: 'El inicio está bloqueado — reintentando' });
                      sub = tx({ de: 'Server-Watchdog versucht es erneut · jederzeit manuell neu starten', en: 'Server watchdog is retrying · you can restart manually anytime', es: 'El vigilante del servidor está reintentando · puedes reiniciar manualmente en cualquier momento' });
                    } else {
                      title = tx({ de: 'Lip-Sync wird gestartet…', en: 'Starting lip-sync…', es: 'Iniciando sincronización labial…' });
                      sub = tx({ de: 'Bereit — Lippensynchronisation wird angestoßen', en: 'Ready — lip-sync is being triggered', es: 'Listo — se está iniciando la sincronización labial' });
                    }
                  } else if (pipelineState === 'audio_ready' && audioUrl) {
                    title = tx({ de: 'Lip-Sync wird gestartet…', en: 'Starting lip-sync…', es: 'Iniciando sincronización labial…' });
                    sub = tx({ de: '~60 s pro Sprecher', en: '~60s per speaker', es: '~60 s por hablante' });
                  } else {
                    title = tx({ de: 'Lip-Sync startet…', en: 'Lip-sync starting…', es: 'Iniciando sincronización labial…' });
                    sub = tx({ de: '~60 s pro Sprecher', en: '~60s per speaker', es: '~60 s por hablante' });
                  }
                }
                return (
                  <>
                    <p className={cn(
                      "mt-2 text-[11px] font-semibold tracking-wide",
                      limboStuck ? "text-amber-300" : "text-primary",
                    )}>
                      {limboStuck && <AlertTriangle className="inline h-3 w-3 mr-1 -mt-0.5" />}
                      {title}
                    </p>
                    <p className="mt-0.5 text-[9px] text-muted-foreground">{sub}</p>
                    {limboStuck && (
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={resettingId === scene.id}
                        onClick={(e) => {
                          e.stopPropagation();
                          resetLipSync(scene.id);
                        }}
                        className="mt-2 h-6 px-2 text-[10px] gap-1 bg-amber-500/10 border-amber-500/40 text-amber-200 hover:bg-amber-500/20"
                      >
                        {resettingId === scene.id ? (
                          <Loader2 className="h-2.5 w-2.5 animate-spin" />
                        ) : (
                          <RefreshCw className="h-2.5 w-2.5" />
                        )}
                        {tx({ de: "Lip-Sync neu anstoßen", en: "Retrigger lip-sync", es: "Reiniciar sincronización labial" })}
                      </Button>
                    )}
                  </>
                );
              })()}

            </motion.div>
          )}
        </AnimatePresence>

        {/* v124 — Failure overlay: shows the actual backend error (e.g.
            anchor_identity_failed) plus a Re-Render button, instead of an
            endless tx({ de: "Szene wird gebaut…", en: "Scene is building…", es: "La escena se está construyendo…" }) spinner. */}
        {isFailed && (() => {
          // v430/6.3: Kundentext kommt ausschließlich aus dem zentralen Presenter.
          // Rohtext bleibt als Debug-Detail im title-Attribut.
          const p = presentSceneError(
            (scene as any).clipError ?? (scene as any).clip_error,
          );
          const friendly = [tx(p.headline), p.hint ? tx(p.hint) : null]
            .filter(Boolean)
            .join(' ');
          return (
            <div className="absolute inset-0 z-10 flex flex-col items-center justify-center bg-gradient-to-br from-destructive/30 via-black/70 to-destructive/30 backdrop-blur-[2px] px-3 text-center">
              <AlertTriangle className="h-7 w-7 text-destructive mb-1.5" />
              <p className="text-[11px] font-semibold text-destructive-foreground">
                {tx({ de: "Szene fehlgeschlagen", en: "Scene failed", es: "La escena falló" })}
              </p>
              <p
                className="mt-1 text-[9px] leading-snug text-foreground/80 line-clamp-4"
                title={p.code ? `${p.code} · ${p.raw.slice(0, 300)}` : p.raw.slice(0, 300)}
              >
                {friendly}
              </p>
              <div className="mt-2 flex items-center gap-1.5">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={(e) => {
                    e.stopPropagation();
                    onGenerate();
                  }}
                  className="h-6 px-2 text-[10px] gap-1 bg-destructive/10 border-destructive/40 text-destructive-foreground hover:bg-destructive/20"
                >
                  <RefreshCw className="h-2.5 w-2.5" />
                  {tx({ de: "Neu rendern", en: "Re-render", es: "Volver a renderizar" })}
                </Button>
              </div>
            </div>
          );
        })()}





        {/* Center generate / re-roll CTA — hidden while playing */}
        {!isWorking && !isFailed && (!isReady || hovering) && (
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
                  <RefreshCw className="h-3 w-3" /> {tx({ de: "Neu generieren", en: "Regenerate", es: "Regenerar" })}
                </>
              ) : (
                <>
                  <Sparkles className="h-3 w-3" /> {tx({ de: "Generieren", en: "Generate", es: "Generar" })}
                </>
              )}
            </Button>
          </div>
        )}

        {/* Hover play hint (when ready & not hovered) */}
        {isReady && !hovering && (
          <div className="absolute bottom-1.5 right-1.5 z-10 px-1.5 py-0.5 rounded-md bg-black/60 backdrop-blur text-[9px] text-foreground/80 flex items-center gap-1 border border-border/40">
            <Play className="h-2.5 w-2.5 fill-current" /> {tx({ de: "Hover", en: "Hover", es: "Pasar cursor" })}
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
