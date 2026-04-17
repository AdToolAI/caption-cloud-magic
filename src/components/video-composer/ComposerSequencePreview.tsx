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

export default function ComposerSequencePreview({ scenes, subtitles }: Props) {
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

  const videoRef = useRef<HTMLVideoElement>(null);
  const imageStartRef = useRef<number | null>(null);
  const rafRef = useRef<number | null>(null);

  const currentScene = playable[sceneIdx];
  const isImage = currentScene?.uploadType === 'image';
  const mediaUrl = isImage ? currentScene?.uploadUrl : currentScene?.clipUrl;

  // Reset when scenes change drastically
  useEffect(() => {
    setSceneIdx(0);
    setGlobalTime(0);
    setPlaying(false);
    imageStartRef.current = null;
  }, [playable.length]);

  // Load source on scene change
  useEffect(() => {
    if (!currentScene) return;
    if (!isImage && videoRef.current) {
      videoRef.current.currentTime = 0;
      if (playing) {
        videoRef.current.play().catch(() => {});
      }
    }
    if (isImage) {
      imageStartRef.current = playing ? performance.now() : null;
    }
  }, [sceneIdx, isImage, currentScene]);

  // Play/pause
  useEffect(() => {
    if (isImage) {
      imageStartRef.current = playing ? performance.now() : null;
      return;
    }
    if (!videoRef.current) return;
    if (playing) videoRef.current.play().catch(() => {});
    else videoRef.current.pause();
  }, [playing, isImage]);

  const advanceScene = useCallback(() => {
    if (sceneIdx + 1 < playable.length) {
      setSceneIdx(sceneIdx + 1);
    } else {
      setPlaying(false);
      setSceneIdx(0);
      setGlobalTime(0);
    }
  }, [sceneIdx, playable.length]);

  // Image-clip ticker
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

  const onVideoTimeUpdate = () => {
    if (!videoRef.current || isImage) return;
    setGlobalTime((startOffsets[sceneIdx] || 0) + videoRef.current.currentTime);
  };

  const onVideoEnded = () => {
    advanceScene();
  };

  const togglePlay = () => setPlaying(p => !p);

  const handleScrub = (val: number) => {
    if (totalDuration <= 0) return;
    // Find which scene this time lands in
    let idx = 0;
    for (let i = 0; i < playable.length; i++) {
      if (val >= startOffsets[i] && val < startOffsets[i] + (playable[i].durationSeconds || 0)) {
        idx = i;
        break;
      }
      if (i === playable.length - 1) idx = i;
    }
    const localTime = val - startOffsets[idx];
    setSceneIdx(idx);
    setGlobalTime(val);
    if (playable[idx].uploadType === 'image') {
      imageStartRef.current = playing ? performance.now() - localTime * 1000 : null;
    } else {
      requestAnimationFrame(() => {
        if (videoRef.current) {
          videoRef.current.currentTime = localTime;
        }
      });
    }
  };

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

  const overlay = currentScene?.textOverlay;
  const hasOverlayText = overlay && (overlay.text || '').trim().length > 0;

  return (
    <div className="space-y-3">
      {/* Player */}
      <div className="relative bg-black rounded-lg overflow-hidden aspect-video shadow-lg border border-border/40">
        {isImage ? (
          <img
            src={mediaUrl}
            alt=""
            className="w-full h-full object-contain"
          />
        ) : (
          <video
            ref={videoRef}
            src={mediaUrl}
            muted={muted}
            playsInline
            onTimeUpdate={onVideoTimeUpdate}
            onEnded={onVideoEnded}
            className="w-full h-full object-contain"
          />
        )}

        {/* Per-scene text overlay */}
        {hasOverlayText && (
          <div
            className="absolute px-3 py-1 max-w-[90%] pointer-events-none"
            style={{
              ...POSITION_TO_STYLE[overlay!.position],
              color: overlay!.color || '#FFFFFF',
              fontSize: Math.max(12, (overlay!.fontSize || 48) / 2.2),
              fontFamily: overlay!.fontFamily || 'Inter',
              fontWeight: 700,
              textShadow: '0 2px 6px rgba(0,0,0,0.65)',
              lineHeight: 1.15,
            }}
          >
            {overlay!.text}
          </div>
        )}

        {/* Global subtitles preview line */}
        {subtitles?.enabled && (
          <div
            className="absolute left-1/2 -translate-x-1/2 px-3 py-1 rounded-sm whitespace-nowrap pointer-events-none"
            style={{
              top: subtitles.style.position === 'top' ? '6%' : undefined,
              bottom: subtitles.style.position === 'bottom' ? '6%' : undefined,
              color: subtitles.style.color,
              background: subtitles.style.background || 'transparent',
              fontFamily: subtitles.style.font,
              fontSize: Math.max(12, subtitles.style.size / 2.4),
              fontWeight: 600,
              textShadow: subtitles.style.background ? 'none' : '0 2px 6px rgba(0,0,0,0.65)',
            }}
          >
            {t('videoComposer.subtitlesPreviewLine')}
          </div>
        )}

        {/* Scene chip */}
        <div className="absolute top-2 left-2 px-2 py-0.5 rounded bg-black/60 backdrop-blur text-[10px] text-white/90 font-medium">
          {t('videoComposer.sceneOf', { current: sceneIdx + 1, total: playable.length })}
        </div>
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
