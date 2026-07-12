import React, { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Player, PlayerRef } from '@remotion/player';
import { UniversalVideo } from '@/remotion/templates/UniversalVideo';
import { UniversalCreatorVideo } from '@/remotion/templates/UniversalCreatorVideo';
import { Volume2, VolumeX, Play, Pause, Repeat } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { clampAudioVolume } from '@/lib/audioVolume';

const COMPONENT_REGISTRY: Record<string, React.ComponentType<any>> = {
  UniversalVideo,
  UniversalCreatorVideo,
};

const AUDIO_MIX_KEYS = new Set([
  'backgroundMusicVolume',
  'voiceoverVolume',
  'masterVolume',
]);

const stripAudioMixForVisualCompare = (value: any): any => {
  if (Array.isArray(value)) return value.map(stripAudioMixForVisualCompare);
  if (!value || typeof value !== 'object') return value;

  return Object.keys(value)
    .sort()
    .reduce<Record<string, any>>((acc, key) => {
      if (!AUDIO_MIX_KEYS.has(key)) {
        acc[key] = stripAudioMixForVisualCompare(value[key]);
      }
      return acc;
    }, {});
};

const MemoizedPlayer = memo(function MemoizedPlayer({
  playerRef,
  inputProps,
  compositionWidth,
  compositionHeight,
  fps,
  durationInFrames,
  loop,
  numberOfSharedAudioTags,
  initiallyMuted,
  component,
}: {
  playerRef: React.RefObject<PlayerRef>;
  inputProps: any;
  compositionWidth: number;
  compositionHeight: number;
  fps: number;
  durationInFrames: number;
  loop: boolean;
  numberOfSharedAudioTags: number;
  initiallyMuted: boolean;
  component: React.ComponentType<any>;
}) {
  return (
    <Player
      ref={playerRef}
      component={component}
      inputProps={inputProps}
      compositionWidth={compositionWidth}
      compositionHeight={compositionHeight}
      fps={fps}
      durationInFrames={durationInFrames}
      style={{ width: '100%', height: '100%' }}
      controls={false}
      loop={loop}
      numberOfSharedAudioTags={numberOfSharedAudioTags}
      initiallyMuted={initiallyMuted}
    />
  );
}, (prevProps, nextProps) => {
  if (
    prevProps.component !== nextProps.component ||
    prevProps.compositionWidth !== nextProps.compositionWidth ||
    prevProps.compositionHeight !== nextProps.compositionHeight ||
    prevProps.fps !== nextProps.fps ||
    prevProps.durationInFrames !== nextProps.durationInFrames ||
    prevProps.loop !== nextProps.loop ||
    prevProps.initiallyMuted !== nextProps.initiallyMuted
  ) {
    return false;
  }

  return JSON.stringify(stripAudioMixForVisualCompare(prevProps.inputProps)) ===
    JSON.stringify(stripAudioMixForVisualCompare(nextProps.inputProps));
});

interface RemotionPreviewPlayerProps {
  componentName: string;
  customizations: Record<string, any>;
  width?: number;
  height?: number;
  durationInFrames?: number;
  fps?: number;
  loop?: boolean;
  autoPlay?: boolean;
  showControls?: boolean;
  className?: string;
}

export function RemotionPreviewPlayer({
  componentName,
  customizations,
  width = 1080,
  height = 1920,
  durationInFrames = 300,
  fps = 30,
  loop: loopProp = false,
  autoPlay = false,
  showControls = true,
  className,
}: RemotionPreviewPlayerProps) {
  const playerRef = useRef<PlayerRef>(null);
  const seekBarRef = useRef<HTMLDivElement>(null);
  const voiceoverAudioRef = useRef<HTMLAudioElement | null>(null);
  const musicAudioRef = useRef<HTMLAudioElement | null>(null);
  const syncRafRef = useRef<number | null>(null);
  const lastSeekedFrameRef = useRef<number>(0);

  const [hasEverInteracted, setHasEverInteracted] = useState(false);
  const [isMuted, setIsMuted] = useState(true);
  const [volume, setVolume] = useState(1);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentFrame, setCurrentFrame] = useState(0);
  const [isDragging, setIsDragging] = useState(false);
  const [loop, setLoop] = useState<boolean>(loopProp);

  const resolvedComponent = useMemo(() => {
    return COMPONENT_REGISTRY[componentName] || UniversalCreatorVideo;
  }, [componentName]);

  const previewAudio = useMemo(() => ({
    voiceoverUrl: customizations?.voiceoverUrl || null,
    backgroundMusicUrl: customizations?.backgroundMusicUrl || null,
    voiceoverVolume: clampAudioVolume(customizations?.voiceoverVolume ?? 1),
    backgroundMusicVolume: clampAudioVolume(customizations?.backgroundMusicVolume ?? 0),
    masterVolume: clampAudioVolume(customizations?.masterVolume ?? 1),
  }), [
    customizations?.voiceoverUrl,
    customizations?.backgroundMusicUrl,
    customizations?.voiceoverVolume,
    customizations?.backgroundMusicVolume,
    customizations?.masterVolume,
  ]);

  const inputProps: Record<string, any> = useMemo(() => ({
    ...customizations,
    // Preview audio (VO/music) is mixed through persistent HTMLAudioElements below.
    // Original scene audio stays inside the Remotion <Video /> and is controlled
    // via useOriginalAudio + per-scene overrides. previewMode enables SafeVideo's
    // 2s delayRender fallback so buffering doesn't cause a black screen.
    previewMode: true,
    diag: {
      ...(customizations?.diag || {}),
      silentRender: true,
    },
  }), [customizations]);

  const aspectRatio = width / height;

  const getPreviewTime = useCallback(() => {
    const frame = playerRef.current?.getCurrentFrame?.() ?? lastSeekedFrameRef.current;
    return Math.max(0, frame / fps);
  }, [fps]);

  const applyPreviewAudioVolume = useCallback(() => {
    const master = isMuted ? 0 : clampAudioVolume(volume);
    if (voiceoverAudioRef.current) {
      voiceoverAudioRef.current.volume = clampAudioVolume(previewAudio.voiceoverVolume * previewAudio.masterVolume * master);
    }
    if (musicAudioRef.current) {
      musicAudioRef.current.volume = clampAudioVolume(previewAudio.backgroundMusicVolume * previewAudio.masterVolume * master);
    }
  }, [isMuted, previewAudio.backgroundMusicVolume, previewAudio.masterVolume, previewAudio.voiceoverVolume, volume]);

  const seekPreviewAudio = useCallback((timeSeconds: number) => {
    const safeTime = Math.max(0, timeSeconds);
    const voice = voiceoverAudioRef.current;
    const music = musicAudioRef.current;

    if (voice && Number.isFinite(voice.duration)) {
      voice.currentTime = Math.min(safeTime, Math.max(0, voice.duration - 0.05));
    }

    if (music) {
      const duration = Number.isFinite(music.duration) && music.duration > 0 ? music.duration : 0;
      music.currentTime = duration > 0 ? safeTime % duration : safeTime;
    }
  }, []);

  const playPreviewAudio = useCallback(async () => {
    applyPreviewAudioVolume();
    seekPreviewAudio(getPreviewTime());
    await Promise.allSettled([
      voiceoverAudioRef.current?.play(),
      musicAudioRef.current?.play(),
    ].filter(Boolean) as Promise<void>[]);
  }, [applyPreviewAudioVolume, getPreviewTime, seekPreviewAudio]);

  const pausePreviewAudio = useCallback(() => {
    voiceoverAudioRef.current?.pause();
    musicAudioRef.current?.pause();
  }, []);

  useEffect(() => {
    applyPreviewAudioVolume();
  }, [applyPreviewAudioVolume]);

  useEffect(() => {
    const voice = voiceoverAudioRef.current;
    const music = musicAudioRef.current;

    voice?.pause();
    music?.pause();

    if (previewAudio.voiceoverUrl) {
      voiceoverAudioRef.current = new Audio(previewAudio.voiceoverUrl);
      voiceoverAudioRef.current.preload = 'auto';
      voiceoverAudioRef.current.loop = false;
    } else {
      voiceoverAudioRef.current = null;
    }

    if (previewAudio.backgroundMusicUrl) {
      musicAudioRef.current = new Audio(previewAudio.backgroundMusicUrl);
      musicAudioRef.current.preload = 'auto';
      musicAudioRef.current.loop = true;
    } else {
      musicAudioRef.current = null;
    }

    applyPreviewAudioVolume();

    if (isPlaying) {
      void playPreviewAudio();
    }

    return () => {
      voiceoverAudioRef.current?.pause();
      musicAudioRef.current?.pause();
    };
    // URL changes intentionally rebuild the persistent audio elements.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [previewAudio.voiceoverUrl, previewAudio.backgroundMusicUrl]);

  // Keep Remotion Player volume in sync with the external mix, so the
  // scene <Video>'s original audio track follows master mute/volume.
  const applyPlayerVolume = useCallback(() => {
    const p = playerRef.current;
    if (!p) return;
    const v = isMuted ? 0 : clampAudioVolume(volume);
    try { p.setVolume(v); } catch { /* noop */ }
  }, [isMuted, volume]);

  useEffect(() => {
    applyPlayerVolume();
  }, [applyPlayerVolume]);

  useEffect(() => {
    if (!autoPlay || !playerRef.current) return;
    setHasEverInteracted(true);
    setIsMuted(false);
    playerRef.current.unmute();
    applyPlayerVolume();
    playerRef.current.play();
    void playPreviewAudio();
  }, [autoPlay, playPreviewAudio, applyPlayerVolume]);

  useEffect(() => {
    const player = playerRef.current;
    if (!player) return;

    const handlePlay = () => {
      setIsPlaying(true);
      void playPreviewAudio();
    };
    const handlePause = () => {
      setIsPlaying(false);
      pausePreviewAudio();
    };
    const handleEnded = () => {
      setIsPlaying(false);
      pausePreviewAudio();
    };
    const handleFrameUpdate = () => {
      const frame = player.getCurrentFrame();
      const previousFrame = lastSeekedFrameRef.current;
      if (loop && isPlaying && frame + 2 < previousFrame) {
        seekPreviewAudio(frame / fps);
        void playPreviewAudio();
      }
      lastSeekedFrameRef.current = frame;
      if (!isDragging) setCurrentFrame(frame);
    };

    player.addEventListener('play', handlePlay);
    player.addEventListener('pause', handlePause);
    player.addEventListener('ended', handleEnded);
    player.addEventListener('frameupdate', handleFrameUpdate);

    return () => {
      player.removeEventListener('play', handlePlay);
      player.removeEventListener('pause', handlePause);
      player.removeEventListener('ended', handleEnded);
      player.removeEventListener('frameupdate', handleFrameUpdate);
    };
  }, [fps, isDragging, isPlaying, loop, pausePreviewAudio, playPreviewAudio, seekPreviewAudio]);

  useEffect(() => {
    if (!isPlaying) {
      if (syncRafRef.current !== null) cancelAnimationFrame(syncRafRef.current);
      syncRafRef.current = null;
      return;
    }

    const sync = () => {
      const expected = getPreviewTime();
      const voice = voiceoverAudioRef.current;
      const music = musicAudioRef.current;

      if (voice && !voice.paused && Math.abs(voice.currentTime - expected) > 0.22) {
        voice.currentTime = Math.min(expected, Number.isFinite(voice.duration) ? Math.max(0, voice.duration - 0.05) : expected);
      }

      if (music && !music.paused) {
        const duration = Number.isFinite(music.duration) && music.duration > 0 ? music.duration : 0;
        const expectedMusicTime = duration > 0 ? expected % duration : expected;
        if (Math.abs(music.currentTime - expectedMusicTime) > 0.35) {
          music.currentTime = expectedMusicTime;
        }
      }

      syncRafRef.current = requestAnimationFrame(sync);
    };

    syncRafRef.current = requestAnimationFrame(sync);
    return () => {
      if (syncRafRef.current !== null) cancelAnimationFrame(syncRafRef.current);
      syncRafRef.current = null;
    };
  }, [getPreviewTime, isPlaying]);

  useEffect(() => {
    if (!isDragging) return;

    const updateFromPointer = (clientX: number) => {
      if (!seekBarRef.current || !playerRef.current) return;
      const rect = seekBarRef.current.getBoundingClientRect();
      const pos = Math.max(0, Math.min(clientX - rect.left, rect.width));
      const frame = Math.round((pos / rect.width) * (durationInFrames - 1));
      setCurrentFrame(frame);
      lastSeekedFrameRef.current = frame;
      playerRef.current.seekTo(frame);
      seekPreviewAudio(frame / fps);
    };

    const handleMouseMove = (e: MouseEvent) => updateFromPointer(e.clientX);
    const handleMouseUp = () => setIsDragging(false);

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);

    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [durationInFrames, fps, isDragging, seekPreviewAudio]);

  const formatTime = useCallback((frames: number) => {
    const seconds = Math.floor(frames / fps);
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  }, [fps]);

  const handleSeekStart = useCallback((e: React.PointerEvent) => {
    if (!seekBarRef.current || !playerRef.current) return;
    const rect = seekBarRef.current.getBoundingClientRect();
    const pos = Math.max(0, Math.min(e.clientX - rect.left, rect.width));
    const frame = Math.round((pos / rect.width) * (durationInFrames - 1));
    setCurrentFrame(frame);
    lastSeekedFrameRef.current = frame;
    playerRef.current.seekTo(frame);
    seekPreviewAudio(frame / fps);
    setIsDragging(true);
  }, [durationInFrames, fps, seekPreviewAudio]);

  const handlePlayClick = useCallback((e: React.MouseEvent) => {
    if (!playerRef.current) return;
    if (!hasEverInteracted) setHasEverInteracted(true);
    playerRef.current.unmute();
    setIsMuted(false);
    // Player volume drives scene <Video> original audio; keep it in sync with master.
    try { playerRef.current.setVolume(clampAudioVolume(volume)); } catch { /* noop */ }
    playerRef.current.play(e);
    void playPreviewAudio();
  }, [hasEverInteracted, playPreviewAudio, volume]);

  const handlePauseClick = useCallback(() => {
    playerRef.current?.pause();
    pausePreviewAudio();
  }, [pausePreviewAudio]);

  const toggleMute = useCallback(() => {
    if (isMuted) {
      setIsMuted(false);
      playerRef.current?.unmute();
      try { playerRef.current?.setVolume(clampAudioVolume(volume)); } catch { /* noop */ }
      if (isPlaying) void playPreviewAudio();
    } else {
      setIsMuted(true);
      try { playerRef.current?.setVolume(0); } catch { /* noop */ }
      pausePreviewAudio();
    }
  }, [isMuted, isPlaying, pausePreviewAudio, playPreviewAudio, volume]);

  const handleVolumeChange = useCallback((value: number[]) => {
    const newVolume = clampAudioVolume(value[0]);
    setVolume(newVolume);
    if (newVolume === 0) {
      setIsMuted(true);
    } else if (isMuted) {
      setIsMuted(false);
      if (isPlaying) void playPreviewAudio();
    }
  }, [isMuted, isPlaying, playPreviewAudio]);

  const progressPercent = durationInFrames > 0 ? (currentFrame / durationInFrames) * 100 : 0;

  return (
    <div className={className}>
      <div
        className="relative w-full overflow-hidden rounded-lg bg-black"
        style={{ aspectRatio }}
      >
        <MemoizedPlayer
          playerRef={playerRef}
          inputProps={inputProps}
          compositionWidth={width}
          compositionHeight={height}
          fps={fps}
          durationInFrames={durationInFrames}
          loop={loop}
          numberOfSharedAudioTags={0}
          initiallyMuted={!hasEverInteracted}
          component={resolvedComponent}
        />
      </div>

      {showControls && (
        <div className="flex flex-col gap-2 mt-3 px-3 py-2.5 bg-muted/30 rounded-lg border border-border/50">
          <div className="flex items-center gap-2 w-full">
            <span className="text-xs text-muted-foreground min-w-[2.5rem] text-right">
              {formatTime(currentFrame)}
            </span>
            <div
              ref={seekBarRef}
              className="flex-1 h-2 bg-muted rounded-full cursor-pointer relative group"
              onPointerDown={handleSeekStart}
            >
              <div
                className="h-full bg-primary rounded-full transition-all"
                style={{ width: `${progressPercent}%` }}
              />
              <div
                className="absolute top-1/2 -translate-y-1/2 w-3 h-3 bg-primary rounded-full shadow-md opacity-0 group-hover:opacity-100 transition-opacity"
                style={{ left: `calc(${progressPercent}% - 6px)` }}
              />
            </div>
            <span className="text-xs text-muted-foreground min-w-[2.5rem]">
              {formatTime(durationInFrames)}
            </span>
          </div>

          <div className="flex items-center gap-3">
            <Button
              size="icon"
              variant="ghost"
              onClick={isPlaying ? handlePauseClick : handlePlayClick}
              className="h-9 w-9 text-foreground hover:bg-primary/20"
            >
              {isPlaying ? <Pause className="h-5 w-5" /> : <Play className="h-5 w-5" />}
            </Button>

            <Button
              size="icon"
              variant="ghost"
              onClick={() => setLoop((l) => !l)}
              title={loop ? 'Loop aus' : 'Loop an'}
              aria-pressed={loop}
              className={`h-8 w-8 ${loop ? 'text-primary' : 'text-muted-foreground'} hover:text-foreground`}
            >
              <Repeat className="h-4 w-4" />
            </Button>

            <div className="h-6 w-px bg-border/50" />

            <Button
              size="icon"
              variant="ghost"
              onClick={toggleMute}
              className="h-8 w-8 text-muted-foreground hover:text-foreground"
            >
              {isMuted || volume === 0 ? <VolumeX className="h-4 w-4" /> : <Volume2 className="h-4 w-4" />}
            </Button>
            <input
              type="range"
              min="0"
              max="1"
              step="0.05"
              value={isMuted ? 0 : volume}
              onChange={(e) => handleVolumeChange([parseFloat(e.target.value)])}
              className="w-24 h-1.5 bg-muted rounded-full appearance-none cursor-pointer [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-3 [&::-webkit-slider-thumb]:h-3 [&::-webkit-slider-thumb]:bg-primary [&::-webkit-slider-thumb]:rounded-full"
            />
            <span className="text-xs text-muted-foreground min-w-[2.5rem]">
              {Math.round((isMuted ? 0 : volume) * 100)}%
            </span>
          </div>
        </div>
      )}
    </div>
  );
}