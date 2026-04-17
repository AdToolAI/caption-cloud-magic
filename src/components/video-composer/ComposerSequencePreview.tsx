import { useEffect, useMemo, useRef, useState, useCallback } from 'react';
import { Play, Pause, Volume2, VolumeX, Film } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Slider } from '@/components/ui/slider';
import type {
  ComposerScene,
  SubtitlesConfig,
  TextPosition,
  GlobalTextOverlay,
} from '@/types/video-composer';
import { useTranslation } from '@/hooks/useTranslation';
import { PreviewTextOverlayLayer } from './PreviewTextOverlayLayer';

interface Props {
  scenes: ComposerScene[];
  subtitles?: SubtitlesConfig;
  /** Timeline-based overlays that span the full video (independent of scenes). */
  globalTextOverlays?: GlobalTextOverlay[];
  /** Voiceover audio URL — plays in sync with the video timeline. */
  voiceoverUrl?: string | null;
  /** Notifies parent of playhead changes so the editor timeline can stay in sync. */
  onTimeUpdate?: (currentTime: number, totalDuration: number) => void;
}

const POSITION_TO_STYLE: Record<TextPosition, React.CSSProperties> = {
  top: { top: '8%', left: '50%', transform: 'translateX(-50%)', textAlign: 'center' },
  center: { top: '50%', left: '50%', transform: 'translate(-50%,-50%)', textAlign: 'center' },
  bottom: { bottom: '14%', left: '50%', transform: 'translateX(-50%)', textAlign: 'center' },
  'top-left': { top: '6%', left: '5%' },
  'top-right': { top: '6%', right: '5%', textAlign: 'right' },
  'bottom-left': { bottom: '14%', left: '5%' },
  'bottom-right': { bottom: '14%', right: '5%', textAlign: 'right' },
};

const formatTime = (s: number) => {
  if (!isFinite(s) || s < 0) s = 0;
  const m = Math.floor(s / 60);
  const sec = Math.floor(s % 60);
  return `${m}:${sec.toString().padStart(2, '0')}`;
};

const CROSSFADE_MS = 400;
const CROSSFADE_LONG_MS = 600;
const STANDBY_READY_BUDGET_MS = 1200;

type Slot = 'A' | 'B';

export default function ComposerSequencePreview({
  scenes,
  subtitles,
  globalTextOverlays,
  voiceoverUrl,
  onTimeUpdate,
}: Props) {
  const { t } = useTranslation();
  // Filter playable scenes (have a clipUrl OR are an image upload with uploadUrl)
  const playable = useMemo(
    () =>
      scenes.filter(
        s => s.clipUrl || (s.uploadType === 'image' && s.uploadUrl),
      ),
    [scenes],
  );

  const startOffsets = useMemo(() => {
    const arr: number[] = [];
    let acc = 0;
    for (const s of playable) {
      arr.push(acc);
      acc += s.durationSeconds || 0;
    }
    return arr;
  }, [playable]);

  const totalDuration = useMemo(
    () => playable.reduce((sum, s) => sum + (s.durationSeconds || 0), 0),
    [playable],
  );

  const [sceneIdx, setSceneIdx] = useState(0);
  const [globalTime, setGlobalTime] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [muted, setMuted] = useState(true);

  // ── Dual-slot ping-pong refs/state ─────────────────────────────
  const videoARef = useRef<HTMLVideoElement>(null);
  const videoBRef = useRef<HTMLVideoElement>(null);
  const [activeSlot, setActiveSlot] = useState<Slot>('A');
  // src per slot — controlled imperatively so React doesn't reset playback.
  const [slotASrc, setSlotASrc] = useState<string | undefined>(undefined);
  const [slotBSrc, setSlotBSrc] = useState<string | undefined>(undefined);
  // Opacity per slot — drives the CSS crossfade.
  const [slotAOpacity, setSlotAOpacity] = useState(1);
  const [slotBOpacity, setSlotBOpacity] = useState(0);

  const audioRef = useRef<HTMLAudioElement>(null);
  const imageStartRef = useRef<number | null>(null);
  const rafRef = useRef<number | null>(null);
  /** Guard: prevent double-advance from time-cap + onEnded racing. */
  const advancedRef = useRef(false);
  /** Holds onto a pause-at-end freeze timer for clips shorter than durationSeconds. */
  const freezeTimerRef = useRef<number | null>(null);
  /** True during the 400ms crossfade window — used to ignore stale timeupdates. */
  const transitioningRef = useRef(false);
  /** Track which scene index each slot currently holds (so we know what's preloaded). */
  const slotASceneIdxRef = useRef<number>(-1);
  const slotBSceneIdxRef = useRef<number>(-1);

  const currentScene = playable[sceneIdx];
  const isImage = currentScene?.uploadType === 'image';
  const mediaUrl = isImage ? currentScene?.uploadUrl : currentScene?.clipUrl;

  const getActiveVideo = useCallback(
    () => (activeSlot === 'A' ? videoARef.current : videoBRef.current),
    [activeSlot],
  );
  const getStandbyVideo = useCallback(
    () => (activeSlot === 'A' ? videoBRef.current : videoARef.current),
    [activeSlot],
  );

  // ── Reset when scene set changes ───────────────────────────────
  useEffect(() => {
    setSceneIdx(0);
    setGlobalTime(0);
    setPlaying(false);
    imageStartRef.current = null;
  }, [playable.length]);

  // ── Initial load: put scene 0 into slot A ──────────────────────
  useEffect(() => {
    if (!playable.length) return;
    const first = playable[0];
    if (first.uploadType !== 'image' && first.clipUrl) {
      setSlotASrc(first.clipUrl);
      slotASceneIdxRef.current = 0;
    }
    setActiveSlot('A');
    setSlotAOpacity(1);
    setSlotBOpacity(0);
    // Preload scene 1 into B
    const next = playable[1];
    if (next && next.uploadType !== 'image' && next.clipUrl) {
      setSlotBSrc(next.clipUrl);
      slotBSceneIdxRef.current = 1;
    } else {
      setSlotBSrc(undefined);
      slotBSceneIdxRef.current = -1;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playable]);

  // ── Preload next scene into the standby slot whenever sceneIdx changes ─
  useEffect(() => {
    if (!playable.length) return;
    const nextIdx = sceneIdx + 1;
    const next = playable[nextIdx];
    const standbyIsA = activeSlot === 'B';
    if (next && next.uploadType !== 'image' && next.clipUrl) {
      if (standbyIsA) {
        if (slotASceneIdxRef.current !== nextIdx) {
          setSlotASrc(next.clipUrl);
          slotASceneIdxRef.current = nextIdx;
        }
      } else {
        if (slotBSceneIdxRef.current !== nextIdx) {
          setSlotBSrc(next.clipUrl);
          slotBSceneIdxRef.current = nextIdx;
        }
      }
    }
  }, [sceneIdx, activeSlot, playable]);

  // ── Play/pause handling for the ACTIVE video slot ──────────────
  useEffect(() => {
    if (isImage) {
      imageStartRef.current = playing ? performance.now() : null;
      return;
    }
    const v = getActiveVideo();
    if (!v) return;
    if (playing) v.play().catch(() => {});
    else v.pause();
  }, [playing, isImage, activeSlot, getActiveVideo]);

  const advanceScene = useCallback(() => {
    if (sceneIdx + 1 >= playable.length) {
      setPlaying(false);
      setSceneIdx(0);
      setGlobalTime(0);
      return;
    }
    const nextIdx = sceneIdx + 1;
    const nextScene = playable[nextIdx];
    const fromIsImage = isImage;
    const toIsImage = nextScene.uploadType === 'image';

    advancedRef.current = false;

    // Image → anything OR anything → image: skip crossfade between video slots,
    // do a quick fade and swap state. (Image lives in its own <img>.)
    if (fromIsImage || toIsImage) {
      setSceneIdx(nextIdx);
      setGlobalTime(startOffsets[nextIdx] || 0);
      // For video destinations, ensure the new clip lands in active slot A.
      if (!toIsImage && nextScene.clipUrl) {
        setActiveSlot('A');
        setSlotASrc(nextScene.clipUrl);
        slotASceneIdxRef.current = nextIdx;
        setSlotAOpacity(1);
        setSlotBOpacity(0);
      }
      return;
    }

    // Video → Video: ping-pong crossfade.
    const standby = getStandbyVideo();
    const standbyHoldsNext =
      (activeSlot === 'A' ? slotBSceneIdxRef.current : slotASceneIdxRef.current) === nextIdx;

    transitioningRef.current = true;

    const performSwap = (fadeMs: number) => {
      // Reset standby to frame 0 (it's preloaded → instant).
      if (standby) {
        try {
          if (standby.readyState >= 1) standby.currentTime = 0;
        } catch { /* noop */ }
        standby.muted = true; // standby always silent
        if (playing) standby.play().catch(() => {});
      }
      // Crossfade
      if (activeSlot === 'A') {
        setSlotAOpacity(0);
        setSlotBOpacity(1);
      } else {
        setSlotBOpacity(0);
        setSlotAOpacity(1);
      }
      // After fade: pause old active, swap activeSlot, advance index.
      window.setTimeout(() => {
        const oldActive = getActiveVideo();
        try { oldActive?.pause(); } catch { /* noop */ }
        setActiveSlot(prev => (prev === 'A' ? 'B' : 'A'));
        setSceneIdx(nextIdx);
        setGlobalTime(startOffsets[nextIdx] || 0);
        transitioningRef.current = false;
      }, fadeMs);
    };

    if (standby && standbyHoldsNext && standby.readyState >= 2) {
      performSwap(CROSSFADE_MS);
    } else {
      // Standby not warm yet — set src if mismatched, then wait briefly.
      if (standby && nextScene.clipUrl && !standbyHoldsNext) {
        if (activeSlot === 'A') {
          setSlotBSrc(nextScene.clipUrl);
          slotBSceneIdxRef.current = nextIdx;
        } else {
          setSlotASrc(nextScene.clipUrl);
          slotASceneIdxRef.current = nextIdx;
        }
      }
      let done = false;
      const fire = (longer: boolean) => {
        if (done) return;
        done = true;
        performSwap(longer ? CROSSFADE_LONG_MS : CROSSFADE_MS);
      };
      const onReady = () => fire(false);
      if (standby) {
        standby.addEventListener('canplay', onReady, { once: true });
        standby.addEventListener('loadeddata', onReady, { once: true });
      }
      // Safety: even if it never fires, swap with longer crossfade after budget.
      window.setTimeout(() => {
        if (standby) {
          standby.removeEventListener('canplay', onReady);
          standby.removeEventListener('loadeddata', onReady);
        }
        fire(true);
      }, STANDBY_READY_BUDGET_MS);
    }
  }, [
    sceneIdx,
    playable,
    isImage,
    activeSlot,
    getActiveVideo,
    getStandbyVideo,
    startOffsets,
    playing,
  ]);

  // ── Image-clip ticker ──────────────────────────────────────────
  useEffect(() => {
    if (!isImage || !playing || !currentScene) return;
    const dur = currentScene.durationSeconds || 3;
    const tick = () => {
      const start = imageStartRef.current ?? performance.now();
      const elapsed = (performance.now() - start) / 1000;
      const local = Math.min(elapsed, dur);
      setGlobalTime((startOffsets[sceneIdx] || 0) + local);
      if (elapsed >= dur) {
        advanceScene();
        return;
      }
      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
    return () => {
      if (rafRef.current != null) cancelAnimationFrame(rafRef.current);
    };
  }, [isImage, playing, currentScene, sceneIdx, startOffsets, advanceScene]);

  const onVideoTimeUpdate = (e: React.SyntheticEvent<HTMLVideoElement>) => {
    if (isImage) return;
    // Only honor timeupdates from the currently active slot.
    const isASource = e.currentTarget === videoARef.current;
    const fromActive = (isASource && activeSlot === 'A') || (!isASource && activeSlot === 'B');
    if (!fromActive) return;
    if (transitioningRef.current) return;
    const v = e.currentTarget;
    const sceneDur = currentScene?.durationSeconds || 0;
    const local = v.currentTime;

    if (sceneDur > 0 && local >= sceneDur && !advancedRef.current) {
      advancedRef.current = true;
      setGlobalTime((startOffsets[sceneIdx] || 0) + sceneDur);
      advanceScene();
      return;
    }
    setGlobalTime((startOffsets[sceneIdx] || 0) + local);
  };

  const onVideoEnded = (e: React.SyntheticEvent<HTMLVideoElement>) => {
    const isASource = e.currentTarget === videoARef.current;
    const fromActive = (isASource && activeSlot === 'A') || (!isASource && activeSlot === 'B');
    if (!fromActive) return;
    if (advancedRef.current) return;
    const v = e.currentTarget;
    const sceneDur = currentScene?.durationSeconds || 0;
    const local = v?.currentTime ?? 0;
    if (sceneDur > 0 && local < sceneDur - 0.05) {
      const remainMs = Math.max(0, (sceneDur - local) * 1000);
      const startedAt = performance.now();
      const baseGlobal = (startOffsets[sceneIdx] || 0) + local;
      const tick = () => {
        if (advancedRef.current) return;
        const elapsed = (performance.now() - startedAt) / 1000;
        const next = Math.min(baseGlobal + elapsed, (startOffsets[sceneIdx] || 0) + sceneDur);
        setGlobalTime(next);
        if (elapsed * 1000 < remainMs) {
          rafRef.current = requestAnimationFrame(tick);
        }
      };
      rafRef.current = requestAnimationFrame(tick);
      freezeTimerRef.current = window.setTimeout(() => {
        advancedRef.current = true;
        advanceScene();
      }, remainMs);
      return;
    }
    advancedRef.current = true;
    advanceScene();
  };

  const togglePlay = () => setPlaying(p => !p);

  const handleScrub = (val: number) => {
    if (totalDuration <= 0) return;
    let idx = 0;
    for (let i = 0; i < playable.length; i++) {
      if (val >= startOffsets[i] && val < startOffsets[i] + (playable[i].durationSeconds || 0)) {
        idx = i;
        break;
      }
      if (i === playable.length - 1) idx = i;
    }
    const localTime = val - startOffsets[idx];
    const target = playable[idx];
    advancedRef.current = false;
    setSceneIdx(idx);
    setGlobalTime(val);

    if (target.uploadType === 'image') {
      imageStartRef.current = playing ? performance.now() - localTime * 1000 : null;
      return;
    }

    // Hard-cut on scrub: load into active slot A, hide B.
    transitioningRef.current = false;
    setActiveSlot('A');
    setSlotAOpacity(1);
    setSlotBOpacity(0);
    if (target.clipUrl) {
      if (slotASceneIdxRef.current !== idx) {
        setSlotASrc(target.clipUrl);
        slotASceneIdxRef.current = idx;
      }
      requestAnimationFrame(() => {
        const v = videoARef.current;
        if (v) {
          try { v.currentTime = localTime; } catch { /* noop */ }
          if (playing) v.play().catch(() => {});
        }
      });
    }
  };

  // Notify parent of playhead changes so the timeline editor stays in sync.
  useEffect(() => {
    onTimeUpdate?.(globalTime, totalDuration);
  }, [globalTime, totalDuration, onTimeUpdate]);

  // ── Voiceover audio sync ──────────────────────────────────────
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio || !voiceoverUrl) return;
    audio.muted = muted;
    if (playing) {
      if (Math.abs(audio.currentTime - globalTime) > 0.25) {
        audio.currentTime = Math.min(globalTime, audio.duration || globalTime);
      }
      audio.play().catch(() => {});
    } else {
      audio.pause();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playing, voiceoverUrl, muted]);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio || !voiceoverUrl) return;
    if (Math.abs(audio.currentTime - globalTime) > 0.4) {
      audio.currentTime = Math.min(globalTime, audio.duration || globalTime);
    }
  }, [globalTime, voiceoverUrl]);

  // Find the active subtitle segment for the current playhead time.
  const activeSubtitle = useMemo(() => {
    if (!subtitles?.enabled || !subtitles.segments?.length) return null;
    return (
      subtitles.segments.find(
        (seg) => globalTime >= seg.startTime && globalTime <= seg.endTime,
      ) || null
    );
  }, [subtitles, globalTime]);

  if (playable.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-border/60 bg-background/30 p-8 text-center">
        <Film className="h-8 w-8 mx-auto text-muted-foreground/50 mb-2" />
        <p className="text-sm text-muted-foreground">
          {t('videoComposer.clipsMissingForPreview')}
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {/* Player */}
      <div className="relative bg-black rounded-lg overflow-hidden aspect-video shadow-lg border border-border/40">
        {isImage && (
          <img
            src={mediaUrl}
            alt=""
            className="absolute inset-0 w-full h-full object-contain z-10"
          />
        )}

        {/* Slot A */}
        <video
          ref={videoARef}
          src={slotASrc}
          muted={activeSlot === 'A' ? muted : true}
          playsInline
          preload="auto"
          onTimeUpdate={onVideoTimeUpdate}
          onEnded={onVideoEnded}
          className="absolute inset-0 w-full h-full object-contain"
          style={{
            opacity: isImage ? 0 : slotAOpacity,
            transition: `opacity ${CROSSFADE_MS}ms ease-in-out`,
          }}
        />

        {/* Slot B */}
        <video
          ref={videoBRef}
          src={slotBSrc}
          muted={activeSlot === 'B' ? muted : true}
          playsInline
          preload="auto"
          onTimeUpdate={onVideoTimeUpdate}
          onEnded={onVideoEnded}
          className="absolute inset-0 w-full h-full object-contain"
          style={{
            opacity: isImage ? 0 : slotBOpacity,
            transition: `opacity ${CROSSFADE_MS}ms ease-in-out`,
          }}
        />

        {/* Global timeline-based text overlays (independent of scene boundaries) */}
        {globalTextOverlays && globalTextOverlays.length > 0 && (
          <PreviewTextOverlayLayer
            overlays={globalTextOverlays}
            currentTime={globalTime}
            totalDuration={totalDuration}
          />
        )}

        {/* Time-synced subtitle line — only shows the segment matching the playhead */}
        {subtitles?.enabled && activeSubtitle && (
          <div
            className="absolute left-1/2 -translate-x-1/2 px-3 py-1 rounded-sm pointer-events-none max-w-[90%] text-center z-20"
            style={{
              top: subtitles.style.position === 'top' ? '6%' : undefined,
              bottom: subtitles.style.position === 'bottom' ? '6%' : undefined,
              color: subtitles.style.color,
              background: subtitles.style.background || 'transparent',
              fontFamily: subtitles.style.font,
              fontSize: Math.max(12, subtitles.style.size / 2.4),
              fontWeight: 600,
              textShadow: subtitles.style.background ? 'none' : '0 2px 6px rgba(0,0,0,0.65)',
              lineHeight: 1.2,
            }}
          >
            {activeSubtitle.text}
          </div>
        )}

        {/* Empty-state hint when subtitles enabled but no segments generated yet */}
        {subtitles?.enabled && !subtitles.segments?.length && (
          <div className="absolute bottom-2 left-1/2 -translate-x-1/2 px-2 py-1 rounded bg-black/60 backdrop-blur text-[10px] text-white/70 pointer-events-none z-20">
            {t('videoComposer.subtitlesEmptyHint')}
          </div>
        )}

        {/* Status chip — voiceover + subtitles indicator */}
        {(voiceoverUrl || (subtitles?.enabled && subtitles.segments?.length)) && (
          <div className="absolute top-2 right-2 px-2 py-0.5 rounded bg-black/60 backdrop-blur text-[10px] text-white/90 font-medium flex items-center gap-1.5 z-20">
            {voiceoverUrl && <span>🎙️</span>}
            {subtitles?.enabled && subtitles.segments?.length ? (
              <span>{subtitles.segments.length} {t('videoComposer.subtitlesShortLabel')}</span>
            ) : null}
          </div>
        )}

        {/* Scene chip */}
        <div className="absolute top-2 left-2 px-2 py-0.5 rounded bg-black/60 backdrop-blur text-[10px] text-white/90 font-medium z-20">
          {t('videoComposer.sceneOf', { current: sceneIdx + 1, total: playable.length })}
        </div>

        {/* Hidden voiceover audio — synced with the video timeline */}
        {voiceoverUrl && (
          <audio
            ref={audioRef}
            src={voiceoverUrl}
            preload="auto"
            className="hidden"
          />
        )}
      </div>

      {/* Controls */}
      <div className="flex items-center gap-3">
        <Button
          size="icon"
          variant="default"
          onClick={togglePlay}
          className="h-9 w-9 shrink-0"
        >
          {playing ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
        </Button>

        <div className="text-xs text-muted-foreground tabular-nums w-20 shrink-0">
          {formatTime(globalTime)} / {formatTime(totalDuration)}
        </div>

        <div className="flex-1">
          <Slider
            value={[Math.min(globalTime, totalDuration)]}
            min={0}
            max={Math.max(totalDuration, 0.1)}
            step={0.05}
            onValueChange={([v]) => handleScrub(v)}
          />
        </div>

        <Button
          size="icon"
          variant="ghost"
          onClick={() => setMuted(m => !m)}
          className="h-9 w-9 shrink-0"
        >
          {muted ? <VolumeX className="h-4 w-4" /> : <Volume2 className="h-4 w-4" />}
        </Button>
      </div>

      {/* Scene dots */}
      <div className="flex items-center justify-center gap-1.5">
        {playable.map((s, i) => (
          <button
            key={s.id}
            onClick={() => handleScrub(startOffsets[i])}
            className={`h-1.5 rounded-full transition-all ${
              i === sceneIdx ? 'w-6 bg-primary' : 'w-1.5 bg-muted-foreground/40 hover:bg-muted-foreground/70'
            }`}
            aria-label={`Scene ${i + 1}`}
          />
        ))}
      </div>
    </div>
  );
}
