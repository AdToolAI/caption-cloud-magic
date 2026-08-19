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
  loop: loopProp = true,
  autoPlay = true,
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
    voiceoverStartTime: Math.max(0, Number(customizations?.voiceoverStartTime) || 0),
    musicTrimStart: Math.max(0, Number(customizations?.backgroundMusicClip?.trimStart) || 0),
    musicTrimEnd: Math.max(0, Number(customizations?.backgroundMusicClip?.trimEnd) || 0),
    musicStartTime: Math.max(0, Number(customizations?.backgroundMusicClip?.startTime) || 0),
    musicLoop: customizations?.backgroundMusicClip ? customizations.backgroundMusicClip.loop !== false : true,
  }), [
    customizations?.voiceoverUrl,
    customizations?.backgroundMusicUrl,
    customizations?.voiceoverVolume,
    customizations?.backgroundMusicVolume,
    customizations?.masterVolume,
    customizations?.voiceoverStartTime,
    customizations?.backgroundMusicClip?.trimStart,
    customizations?.backgroundMusicClip?.trimEnd,
    customizations?.backgroundMusicClip?.startTime,
    customizations?.backgroundMusicClip?.loop,
  ]);


  const inputProps: Record<string, any> = useMemo(() => ({
    ...customizations,
    // Preview audio (VO/music) is mixed through persistent HTMLAudioElements below.
    // Original scene audio stays inside the Remotion <Video /> and is controlled
    // via useOriginalAudio + per-scene overrides. previewMode enables SafeVideo's
    // 2s delayRender fallback so buffering doesn't cause a black screen.
    previewMode: true,
    rawMediaMode: true,
    diag: {
      ...(customizations?.diag || {}),
      silentRender: true,
    },
  }), [customizations]);

  

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

    if (voice) {
      const startAt = previewAudio.voiceoverStartTime;
      const localTime = safeTime - startAt;
      if (localTime < 0) {
        voice.pause();
        try { voice.currentTime = 0; } catch { /* noop */ }
      } else if (Number.isFinite(voice.duration)) {
        voice.currentTime = Math.min(localTime, Math.max(0, voice.duration - 0.05));
      } else {
        try { voice.currentTime = localTime; } catch { /* noop */ }
      }
    }

    if (music) {
      const trimStart = previewAudio.musicTrimStart;
      const rawTrimEnd = previewAudio.musicTrimEnd;
      const srcDuration = Number.isFinite(music.duration) && music.duration > 0 ? music.duration : 0;
      const trimEnd = rawTrimEnd > trimStart + 0.05
        ? rawTrimEnd
        : (srcDuration > 0 ? srcDuration : trimStart + 0.05);
      const clipLen = Math.max(0.05, trimEnd - trimStart);
      const offset = previewAudio.musicStartTime;
      const local = safeTime - offset;
      if (local < 0) {
        music.pause();
        try { music.currentTime = trimStart; } catch { /* noop */ }
      } else {
        const inClip = previewAudio.musicLoop ? (local % clipLen) : Math.min(local, clipLen - 0.02);
        try { music.currentTime = trimStart + inClip; } catch { /* noop */ }
      }
    }
  }, [previewAudio.voiceoverStartTime, previewAudio.musicTrimStart, previewAudio.musicTrimEnd, previewAudio.musicStartTime, previewAudio.musicLoop]);

  const playPreviewAudio = useCallback(async () => {
    applyPreviewAudioVolume();
    const now = getPreviewTime();
    seekPreviewAudio(now);
    const voice = voiceoverAudioRef.current;
    const music = musicAudioRef.current;
    const voiceReady = voice && now >= previewAudio.voiceoverStartTime;
    const musicReady = music && now >= previewAudio.musicStartTime;

    await Promise.allSettled([
      voiceReady ? voice!.play() : Promise.resolve(),
      musicReady ? music!.play() : Promise.resolve(),
    ].filter(Boolean) as Promise<void>[]);
  }, [applyPreviewAudioVolume, getPreviewTime, seekPreviewAudio, previewAudio.voiceoverStartTime, previewAudio.musicStartTime]);


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
      // Native loop stays off — we manage looping manually so trimEnd is honored.
      musicAudioRef.current.loop = false;
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

  // Mirror volatile values/callbacks into refs so the player listeners can be
  // registered exactly once (before autoplay) without ever being detached.
  const stateRef = useRef({ loop, isPlaying, isDragging, fps });
  stateRef.current = { loop, isPlaying, isDragging, fps };
  const audioFnRef = useRef({ playPreviewAudio, pausePreviewAudio, seekPreviewAudio });
  audioFnRef.current = { playPreviewAudio, pausePreviewAudio, seekPreviewAudio };

  // NOTE: this listener effect MUST stay declared before the autoplay effect —
  // otherwise the initial 'play' event fires before we subscribe and isPlaying
  // stays false forever (pause button dead, preview audio never starts).
  useEffect(() => {
    const player = playerRef.current;
    if (!player) return;

    const handlePlay = () => {
      setIsPlaying(true);
      void audioFnRef.current.playPreviewAudio();
    };
    const handlePause = () => {
      setIsPlaying(false);
      audioFnRef.current.pausePreviewAudio();
    };
    const handleEnded = () => {
      setIsPlaying(false);
      audioFnRef.current.pausePreviewAudio();
    };
    const handleFrameUpdate = () => {
      const { loop: isLoop, isPlaying: playing, isDragging: dragging, fps: currentFps } = stateRef.current;
      const frame = player.getCurrentFrame();
      const previousFrame = lastSeekedFrameRef.current;
      if (isLoop && playing && frame + 2 < previousFrame) {
        audioFnRef.current.seekPreviewAudio(frame / currentFps);
        void audioFnRef.current.playPreviewAudio();
      }
      lastSeekedFrameRef.current = frame;
      if (!dragging) setCurrentFrame(frame);
    };

    player.addEventListener('play', handlePlay);
    player.addEventListener('pause', handlePause);
    player.addEventListener('ended', handleEnded);
    player.addEventListener('frameupdate', handleFrameUpdate);

    // Adopt the real player state in case playback already started.
    try { setIsPlaying(player.isPlaying()); } catch { /* noop */ }

    return () => {
      player.removeEventListener('play', handlePlay);
      player.removeEventListener('pause', handlePause);
      player.removeEventListener('ended', handleEnded);
      player.removeEventListener('frameupdate', handleFrameUpdate);
    };
  }, []);

  useEffect(() => {
    if (!autoPlay || !playerRef.current) return;
    // Autoplay muted — browsers block audible autoplay.
    // User can enable sound via play/mute toggle (both unmute on gesture).
    try { playerRef.current.setVolume(0); } catch { /* noop */ }
    playerRef.current.play();
    try { setIsPlaying(playerRef.current.isPlaying()); } catch { /* noop */ }
  }, [autoPlay]);


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

      if (voice) {
        const startAt = previewAudio.voiceoverStartTime;
        const localExpected = expected - startAt;
        if (localExpected < 0) {
          // VO has not started yet on the timeline.
          if (!voice.paused) voice.pause();
          if (voice.currentTime > 0.001) {
            try { voice.currentTime = 0; } catch { /* noop */ }
          }
        } else {
          if (voice.paused) {
            void voice.play().catch(() => { /* autoplay blocked, ignore */ });
          }
          if (Math.abs(voice.currentTime - localExpected) > 0.22) {
            voice.currentTime = Math.min(
              localExpected,
              Number.isFinite(voice.duration) ? Math.max(0, voice.duration - 0.05) : localExpected,
            );
          }
        }
      }

      if (music) {
        const trimStart = previewAudio.musicTrimStart;
        const rawTrimEnd = previewAudio.musicTrimEnd;
        const srcDuration = Number.isFinite(music.duration) && music.duration > 0 ? music.duration : 0;
        const trimEnd = rawTrimEnd > trimStart + 0.05
          ? rawTrimEnd
          : (srcDuration > 0 ? srcDuration : trimStart + 0.05);
        const clipLen = Math.max(0.05, trimEnd - trimStart);
        const offset = previewAudio.musicStartTime;
        const localExpected = expected - offset;
        if (localExpected < 0) {
          if (!music.paused) music.pause();
        } else if (!previewAudio.musicLoop && localExpected >= clipLen) {
          if (!music.paused) music.pause();
        } else {
          const inClip = previewAudio.musicLoop
            ? (localExpected % clipLen)
            : Math.min(localExpected, clipLen - 0.02);
          const targetTime = trimStart + inClip;
          if (music.paused) {
            void music.play().catch(() => { /* autoplay blocked */ });
          }
          if (Math.abs(music.currentTime - targetTime) > 0.35) {
            try { music.currentTime = targetTime; } catch { /* noop */ }
          }
        }
      }

      syncRafRef.current = requestAnimationFrame(sync);
    };


    syncRafRef.current = requestAnimationFrame(sync);
    return () => {
      if (syncRafRef.current !== null) cancelAnimationFrame(syncRafRef.current);
      syncRafRef.current = null;
    };
  }, [getPreviewTime, isPlaying, previewAudio.voiceoverStartTime, previewAudio.musicTrimStart, previewAudio.musicTrimEnd, previewAudio.musicStartTime, previewAudio.musicLoop]);

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
    const player = playerRef.current;
    if (!player) return;
    if (!hasEverInteracted) setHasEverInteracted(true);
    player.unmute();
    setIsMuted(false);
    // Player volume drives scene <Video> original audio; keep it in sync with master.
    try { player.setVolume(clampAudioVolume(volume)); } catch { /* noop */ }
    player.play(e);
    setIsPlaying(true);
    void playPreviewAudio();
  }, [hasEverInteracted, playPreviewAudio, volume]);

  const handlePauseClick = useCallback(() => {
    playerRef.current?.pause();
    pausePreviewAudio();
    setIsPlaying(false);
  }, [pausePreviewAudio]);

  // Always derive the action from the real player state — never from a stale
  // React state — so the button can't get stuck on "play" while it's running.
  const handleTogglePlay = useCallback((e: React.MouseEvent) => {
    const player = playerRef.current;
    if (!player) return;
    let running = isPlaying;
    try { running = player.isPlaying(); } catch { /* noop */ }
    if (running) {
      handlePauseClick();
    } else {
      handlePlayClick(e);
    }
  }, [handlePauseClick, handlePlayClick, isPlaying]);


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
      <div className="mx-auto flex items-center justify-center w-full">
        <div
          className="relative overflow-hidden rounded-lg bg-black mx-auto"
          style={{
            aspectRatio: `${width} / ${height}`,
            width: '100%',
            imageRendering: 'auto',
            WebkitBackfaceVisibility: 'hidden',
            backfaceVisibility: 'hidden',
            transform: 'translateZ(0)',
            contain: 'layout paint',
          } as React.CSSProperties}
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
              onClick={handleTogglePlay}
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