import React, { useRef, useState, useEffect, useMemo, useCallback } from 'react';
import { Player, PlayerRef } from '@remotion/player';
import { Button } from '@/components/ui/button';
import { Slider } from '@/components/ui/slider';
import { Play, Pause, VolumeX, Volume2, Maximize2, RotateCcw } from 'lucide-react';
import { DirectorsCutVideo } from '@/remotion/templates/DirectorsCutVideo';
import { GlobalEffects, AudioEnhancements, SceneEffects, SceneAnalysis, TransitionAssignment, TextOverlay } from '@/types/directors-cut';
import type { KenBurnsKeyframe } from './features/KenBurnsEffect';
import { SubtitleTrack, DEFAULT_SUBTITLE_STYLE } from '@/types/timeline';
import { cn } from '@/lib/utils';

const SUBTITLE_FONT_SIZES = {
  small: '16px',
  medium: '24px',
  large: '32px',
  xl: '48px',
};

interface DirectorsCutPreviewPlayerProps {
  videoUrl: string;
  effects: GlobalEffects;
  sceneEffects?: Record<string, SceneEffects>;
  scenes?: SceneAnalysis[];
  transitions?: TransitionAssignment[];
  audio: AudioEnhancements;
  duration: number;
  currentTime?: number;
  onTimeUpdate?: (time: number) => void;
  styleTransfer?: {
    enabled: boolean;
    style: string | null;
    intensity: number;
  };
  colorGrading?: {
    enabled: boolean;
    grade: string | null;
    intensity: number;
  };
  sceneColorGrading?: Record<string, { grade?: string | null; intensity?: number }>;
  speedKeyframes?: Array<{ time: number; speed: number; sceneId?: string }>;
  chromaKey?: {
    enabled: boolean;
    color: string;
    tolerance: number;
    backgroundUrl?: string;
  };
  kenBurns?: KenBurnsKeyframe[];
  voiceoverUrl?: string;
  backgroundMusicUrl?: string;
  textOverlays?: TextOverlay[];
  subtitleTrack?: SubtitleTrack;
  externalIsPlaying?: boolean;
  onPlayingChange?: (isPlaying: boolean) => void;
  originalAudioMuted?: boolean;
  initialMuted?: boolean;
  className?: string;
  fillContainer?: boolean;
  children?: React.ReactNode;
}

export const DirectorsCutPreviewPlayer: React.FC<DirectorsCutPreviewPlayerProps> = ({
  videoUrl,
  effects,
  sceneEffects = {},
  scenes = [],
  transitions = [],
  audio,
  duration,
  currentTime = 0,
  onTimeUpdate,
  styleTransfer,
  colorGrading,
  sceneColorGrading,
  speedKeyframes,
  chromaKey,
  kenBurns,
  voiceoverUrl,
  backgroundMusicUrl,
  textOverlays = [],
  subtitleTrack,
  externalIsPlaying,
  onPlayingChange,
  originalAudioMuted = false,
  initialMuted = true,
  className = '',
  fillContainer = false,
  children,
}) => {
  const playerRef = useRef<PlayerRef>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const onTimeUpdateRef = useRef(onTimeUpdate);
  
  // Keep ref in sync
  useEffect(() => {
    onTimeUpdateRef.current = onTimeUpdate;
  }, [onTimeUpdate]);
  
  // Native HTML5 Audio refs for reliable audio playback
  const sourceAudioRef = useRef<HTMLAudioElement | null>(null);
  const voiceoverAudioRef = useRef<HTMLAudioElement | null>(null);
  const backgroundMusicAudioRef = useRef<HTMLAudioElement | null>(null);
  
  const [isPlaying, setIsPlaying] = useState(false);
  const [isMuted, setIsMuted] = useState(initialMuted);
  const internalTimeRef = useRef(currentTime);
  const [displayTime, setDisplayTime] = useState(currentTime);
  const [playerReady, setPlayerReady] = useState(false);
  const hasAutoStartedAudio = useRef(false);

  // Sync isMuted when initialMuted prop changes
  useEffect(() => {
    setIsMuted(initialMuted);
  }, [initialMuted]);

  const fps = 30;
  
  // Calculate total transition overlap for TransitionSeries duration adjustment
  const transitionOverlapFrames = useMemo(() => {
    if (!scenes.length || !transitions.length) return 0;
    let totalOverlap = 0;
    transitions.forEach((t, index) => {
      // Only count transitions that are between scenes (not after the last scene)
      let sceneIndex = scenes.findIndex(s => s.id === t.sceneId);
      if (sceneIndex < 0) sceneIndex = index;
      if (sceneIndex < scenes.length - 1 && t.transitionType !== 'none') {
        totalOverlap += Math.max(1, Math.floor((t.duration || 0.5) * fps));
      }
    });
    return totalOverlap;
  }, [scenes, transitions]);

  const durationInFrames = Math.max(1, Math.ceil(duration * fps) - transitionOverlapFrames);

  // Convert scenes to Remotion format with effects and Time Remapping data
  const remotionScenes = useMemo(() => {
    return scenes.map(scene => {
      const originalStart = scene.original_start_time ?? scene.start_time;
      const originalEnd = scene.original_end_time ?? scene.end_time;
      
      return {
        id: scene.id,
        startTime: scene.start_time,
        endTime: scene.end_time,
        originalStartTime: originalStart,
        originalEndTime: originalEnd,
        playbackRate: scene.playbackRate ?? 1.0,
        effects: sceneEffects[scene.id] || undefined,
        additionalMedia: scene.additionalMedia,
        isFromOriginalVideo: scene.isFromOriginalVideo ?? true,
      };
    });
  }, [scenes, sceneEffects]);

  // Convert transitions to Remotion format with robust ID mapping
  const remotionTransitions = useMemo(() => {
    return transitions.map((t, index) => {
      let sceneIndex = scenes.findIndex(s => s.id === t.sceneId);
      
      if (sceneIndex < 0 && t.sceneId.includes('scene-')) {
        const numericPart = t.sceneId.replace('scene-', '');
        sceneIndex = scenes.findIndex(s => s.id === numericPart);
      }
      
      if (sceneIndex < 0) {
        const numericPart = t.sceneId.replace(/\D/g, '');
        sceneIndex = scenes.findIndex(s => s.id === numericPart);
      }
      
      if (sceneIndex < 0) {
        sceneIndex = index;
      }
      
      return {
        sceneIndex,
        type: t.transitionType,
        duration: t.duration,
      };
    });
  }, [transitions, scenes]);

  // Build input props for Remotion — previewMode skips Remotion audio
  const inputProps = useMemo(() => ({
    sourceVideoUrl: videoUrl,
    brightness: effects.brightness,
    contrast: effects.contrast,
    saturation: effects.saturation,
    sharpness: effects.sharpness,
    temperature: effects.temperature,
    vignette: effects.vignette,
    filter: effects.filter,
    scenes: remotionScenes,
    sceneEffects,
    transitions: remotionTransitions,
    styleTransfer: styleTransfer ? {
      enabled: styleTransfer.enabled,
      style: styleTransfer.style || undefined,
      intensity: styleTransfer.intensity,
    } : undefined,
    colorGrading: colorGrading ? {
      enabled: colorGrading.enabled,
      grade: colorGrading.grade || undefined,
      intensity: colorGrading.intensity,
    } : undefined,
    sceneColorGrading,
    speedKeyframes,
    chromaKey: chromaKey ? {
      enabled: chromaKey.enabled,
      color: chromaKey.color,
      tolerance: chromaKey.tolerance,
      backgroundUrl: chromaKey.backgroundUrl,
    } : undefined,
    kenBurns: kenBurns?.map(k => ({
      id: k.id,
      sceneId: k.sceneId,
      startZoom: k.startZoom,
      endZoom: k.endZoom,
      startX: k.startX,
      startY: k.startY,
      endX: k.endX,
      endY: k.endY,
      easing: k.easing,
    })),
    masterVolume: audio.master_volume,
    voiceoverUrl,
    voiceoverVolume: 100,
    backgroundMusicUrl,
    backgroundMusicVolume: 30,
    durationInSeconds: duration,
    textOverlays: textOverlays.map(o => ({
      id: o.id,
      text: o.text,
      animation: o.animation,
      position: o.position,
      customPosition: o.customPosition,
      startTime: o.startTime,
      endTime: o.endTime,
      style: o.style,
    })),
    previewMode: true,
  }), [
    videoUrl, effects, audio, duration, styleTransfer, 
    colorGrading, sceneColorGrading, speedKeyframes, chromaKey, kenBurns, voiceoverUrl, backgroundMusicUrl,
    remotionScenes, sceneEffects, remotionTransitions, textOverlays
  ]);

  // Find current subtitles based on displayTime (throttled)
  const currentSubtitles = useMemo(() => {
    if (!subtitleTrack?.visible) return [];
    return subtitleTrack.clips.filter(
      sub => displayTime >= sub.startTime && displayTime < sub.endTime
    );
  }, [subtitleTrack, displayTime]);

  // Sync with external isPlaying state (from CapCutEditor)
  useEffect(() => {
    if (externalIsPlaying === undefined) return;
    
    const player = playerRef.current;
    if (!player) return;
    
    if (externalIsPlaying && !isPlaying) {
      player.play();
      setIsPlaying(true);
      if (!isMuted) {
        if (!originalAudioMuted) {
          sourceAudioRef.current?.play().catch(() => {});
        }
        voiceoverAudioRef.current?.play().catch(() => {});
        backgroundMusicAudioRef.current?.play().catch(() => {});
      }
    } else if (!externalIsPlaying && isPlaying) {
      player.pause();
      setIsPlaying(false);
      sourceAudioRef.current?.pause();
      voiceoverAudioRef.current?.pause();
      backgroundMusicAudioRef.current?.pause();
    }
  }, [externalIsPlaying, isPlaying, isMuted, originalAudioMuted]);

  // ==================== NATIVE AUDIO SETUP ====================
  useEffect(() => {
    // Cleanup existing audio elements
    if (sourceAudioRef.current) {
      sourceAudioRef.current.pause();
      sourceAudioRef.current = null;
    }
    if (voiceoverAudioRef.current) {
      voiceoverAudioRef.current.pause();
      voiceoverAudioRef.current = null;
    }
    if (backgroundMusicAudioRef.current) {
      backgroundMusicAudioRef.current.pause();
      backgroundMusicAudioRef.current = null;
    }

    if (videoUrl) {
      const sourceAudio = new Audio(videoUrl);
      sourceAudio.preload = 'auto';
      sourceAudio.volume = isMuted ? 0 : (audio.master_volume || 100) / 100;
      sourceAudioRef.current = sourceAudio;
    }

    if (voiceoverUrl) {
      const vo = new Audio(voiceoverUrl);
      vo.preload = 'auto';
      vo.volume = isMuted ? 0 : 1.0;
      voiceoverAudioRef.current = vo;
    }

    if (backgroundMusicUrl) {
      const bg = new Audio(backgroundMusicUrl);
      bg.preload = 'auto';
      bg.volume = isMuted ? 0 : 0.3;
      bg.loop = true;
      backgroundMusicAudioRef.current = bg;
    }

    return () => {
      sourceAudioRef.current?.pause();
      voiceoverAudioRef.current?.pause();
      backgroundMusicAudioRef.current?.pause();
      sourceAudioRef.current = null;
      voiceoverAudioRef.current = null;
      backgroundMusicAudioRef.current = null;
    };
  }, [videoUrl, voiceoverUrl, backgroundMusicUrl]);

  // Update source audio volume when master_volume changes
  useEffect(() => {
    if (sourceAudioRef.current) {
      sourceAudioRef.current.volume = (audio.master_volume || 100) / 100;
    }
  }, [audio.master_volume]);

  // Stable player key — only remount on structural changes, not effect sliders
  const playerKey = useMemo(() => {
    return `player-${videoUrl}-${durationInFrames}`;
  }, [videoUrl, durationInFrames]);

  // Handle player events — use ref for onTimeUpdate to avoid re-registering listeners
  useEffect(() => {
    const player = playerRef.current;
    if (!player) return;

    const onPlay = () => {
      setIsPlaying(true);
      // Auto-start native audio when player plays
      if (!isMuted) {
        if (!originalAudioMuted && sourceAudioRef.current) {
          sourceAudioRef.current.play().catch(() => {});
        }
        voiceoverAudioRef.current?.play().catch(() => {});
        backgroundMusicAudioRef.current?.play().catch(() => {});
      }
    };
    const onPause = () => {
      setIsPlaying(false);
      sourceAudioRef.current?.pause();
      voiceoverAudioRef.current?.pause();
      backgroundMusicAudioRef.current?.pause();
    };
    let lastDisplayUpdateTime = 0;
    let lastParentUpdateTime = 0;
    const onTimeUpdateEvent = () => {
      const now = performance.now();
      const frame = player.getCurrentFrame();
      const time = frame / fps;
      internalTimeRef.current = time;
      // Throttle display updates to ~4/sec to reduce React re-renders
      if (now - lastDisplayUpdateTime > 250) {
        lastDisplayUpdateTime = now;
        setDisplayTime(time);
      }
      // Throttle parent updates to ~4/sec to reduce upstream re-renders
      if (now - lastParentUpdateTime > 250) {
        lastParentUpdateTime = now;
        onTimeUpdateRef.current?.(time);
      }
      
      // Keep native audio in sync (correct drift > 0.5s)
      if (sourceAudioRef.current && !sourceAudioRef.current.paused) {
        if (Math.abs(sourceAudioRef.current.currentTime - time) > 0.5) {
          sourceAudioRef.current.currentTime = time;
        }
      }
      if (voiceoverAudioRef.current && !voiceoverAudioRef.current.paused) {
        if (Math.abs(voiceoverAudioRef.current.currentTime - time) > 0.5) {
          voiceoverAudioRef.current.currentTime = time;
        }
      }
    };
    const onEnded = () => {
      setIsPlaying(false);
      internalTimeRef.current = 0;
      setDisplayTime(0);
      player.seekTo(0);
      
      if (sourceAudioRef.current) {
        sourceAudioRef.current.pause();
        sourceAudioRef.current.currentTime = 0;
      }
      if (voiceoverAudioRef.current) {
        voiceoverAudioRef.current.pause();
        voiceoverAudioRef.current.currentTime = 0;
      }
      if (backgroundMusicAudioRef.current) {
        backgroundMusicAudioRef.current.pause();
        backgroundMusicAudioRef.current.currentTime = 0;
      }
    };

    player.addEventListener('play', onPlay);
    player.addEventListener('pause', onPause);
    player.addEventListener('timeupdate', onTimeUpdateEvent);
    player.addEventListener('ended', onEnded);

    setPlayerReady(true);

    return () => {
      player.removeEventListener('play', onPlay);
      player.removeEventListener('pause', onPause);
      player.removeEventListener('timeupdate', onTimeUpdateEvent);
      player.removeEventListener('ended', onEnded);
    };
  }, [playerKey]);

  // Sync external time changes
  useEffect(() => {
    const player = playerRef.current;
    if (currentTime === 0 && internalTime > 0.5) return;
    
    if (player && Math.abs(currentTime - internalTime) > 0.5) {
      player.seekTo(Math.floor(currentTime * fps));
      setInternalTime(currentTime);
    }
  }, [currentTime, internalTime]);

  const handlePlayPause = useCallback(() => {
    const player = playerRef.current;
    if (!player) return;

    const newPlayingState = !isPlaying;

    if (isPlaying) {
      player.pause();
      sourceAudioRef.current?.pause();
      voiceoverAudioRef.current?.pause();
      backgroundMusicAudioRef.current?.pause();
    } else {
      const currentFrame = player.getCurrentFrame();
      if (currentFrame >= durationInFrames - 1) {
        player.seekTo(0);
        setInternalTime(0);
        if (sourceAudioRef.current) sourceAudioRef.current.currentTime = 0;
        if (voiceoverAudioRef.current) voiceoverAudioRef.current.currentTime = 0;
        if (backgroundMusicAudioRef.current) backgroundMusicAudioRef.current.currentTime = 0;
      }
      player.play();
      // Auto-unmute player if initialMuted is false and user hasn't interacted with mute yet
      if (!isMuted) {
        try {
          player.unmute();
        } catch {}
        if (!originalAudioMuted) {
          sourceAudioRef.current?.play().catch(() => {});
        }
        voiceoverAudioRef.current?.play().catch(() => {});
        backgroundMusicAudioRef.current?.play().catch(() => {});
      }
    }

    setIsPlaying(newPlayingState);
    onPlayingChange?.(newPlayingState);
  }, [isPlaying, durationInFrames, isMuted, onPlayingChange, originalAudioMuted]);

  const handleMuteToggle = useCallback(async (e: React.MouseEvent) => {
    const player = playerRef.current;
    if (!player) return;

    if (isMuted) {
      try {
        const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
        if (AudioContextClass) {
          const ctx = new AudioContextClass();
          if (ctx.state === 'suspended') {
            await ctx.resume();
          }
        }
      } catch (err) {
        // AudioContext resume failed silently
      }
      
      player.unmute();
      player.play(e);
      setIsMuted(false);
      
      if (!originalAudioMuted) {
        sourceAudioRef.current?.play().catch(() => {});
      }
      voiceoverAudioRef.current?.play().catch(() => {});
      backgroundMusicAudioRef.current?.play().catch(() => {});
    } else {
      player.mute();
      setIsMuted(true);
      
      sourceAudioRef.current?.pause();
      voiceoverAudioRef.current?.pause();
      backgroundMusicAudioRef.current?.pause();
    }
  }, [isMuted, originalAudioMuted]);

  const handleSeek = useCallback((value: number[]) => {
    const player = playerRef.current;
    if (!player) return;

    const newTime = value[0];
    const frame = Math.floor(newTime * fps);
    player.seekTo(frame);
    setInternalTime(newTime);
    onTimeUpdateRef.current?.(newTime);
    
    if (sourceAudioRef.current) {
      sourceAudioRef.current.currentTime = newTime;
    }
    if (voiceoverAudioRef.current) {
      voiceoverAudioRef.current.currentTime = newTime;
    }
    if (backgroundMusicAudioRef.current) {
      backgroundMusicAudioRef.current.currentTime = newTime;
    }
  }, []);

  const handleReset = useCallback(() => {
    const player = playerRef.current;
    if (!player) return;

    player.seekTo(0);
    player.pause();
    setInternalTime(0);
    setIsPlaying(false);
    
    if (sourceAudioRef.current) {
      sourceAudioRef.current.pause();
      sourceAudioRef.current.currentTime = 0;
    }
    if (voiceoverAudioRef.current) {
      voiceoverAudioRef.current.pause();
      voiceoverAudioRef.current.currentTime = 0;
    }
    if (backgroundMusicAudioRef.current) {
      backgroundMusicAudioRef.current.pause();
      backgroundMusicAudioRef.current.currentTime = 0;
    }
  }, []);

  const handleFullscreen = useCallback(async () => {
    if (containerRef.current) {
      try {
        await containerRef.current.requestFullscreen();
        if (isMuted) {
          const player = playerRef.current;
          if (player) {
            player.unmute();
            setIsMuted(false);
          }
        }
      } catch (e) {
        // Fullscreen not supported
      }
    }
  }, [isMuted]);

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  return (
    <div 
      ref={containerRef}
      className={`flex flex-col ${fillContainer ? 'h-full overflow-hidden' : 'gap-3'} ${className}`}
    >
      {/* Video Player */}
      <div className={`relative bg-black rounded-lg overflow-hidden ${fillContainer ? 'flex-1 min-h-0' : 'aspect-video'}`}>
        <Player
          key={playerKey}
          ref={playerRef}
          component={DirectorsCutVideo}
          inputProps={inputProps}
          durationInFrames={durationInFrames}
          fps={fps}
          compositionWidth={1920}
          compositionHeight={1080}
          style={{
            width: '100%',
            height: '100%',
          }}
          controls={false}
          autoPlay={false}
          loop={false}
        />
        
        {/* Fullscreen Button */}
        <Button
          variant="ghost"
          size="sm"
          className="absolute top-2 right-12 h-8 w-8 p-0 bg-black/50 hover:bg-black/70 text-white z-20"
          onClick={handleFullscreen}
        >
          <Maximize2 className="h-4 w-4" />
        </Button>

        {/* Custom overlays passed as children */}
        {children}
        
        {/* Subtitle Overlay */}
        {currentSubtitles.map(subtitle => (
          <div 
            key={subtitle.id}
            className={cn(
              "absolute left-0 right-0 flex justify-center px-4 z-30 pointer-events-none",
              (subtitle.position || DEFAULT_SUBTITLE_STYLE.position) === 'top' && "top-[10%]",
              (subtitle.position || DEFAULT_SUBTITLE_STYLE.position) === 'center' && "top-1/2 -translate-y-1/2",
              (subtitle.position || DEFAULT_SUBTITLE_STYLE.position) === 'bottom' && "bottom-[15%]"
            )}
          >
            <div
              className="text-center max-w-[80%] leading-relaxed whitespace-pre-wrap"
              style={{
                fontSize: SUBTITLE_FONT_SIZES[(subtitle.fontSize || DEFAULT_SUBTITLE_STYLE.fontSize) as keyof typeof SUBTITLE_FONT_SIZES],
                fontFamily: subtitle.fontFamily || DEFAULT_SUBTITLE_STYLE.fontFamily,
                color: subtitle.color || DEFAULT_SUBTITLE_STYLE.color,
                backgroundColor: subtitle.backgroundColor || DEFAULT_SUBTITLE_STYLE.backgroundColor,
                padding: '8px 16px',
                borderRadius: '8px',
                textShadow: '2px 2px 4px rgba(0,0,0,0.8)',
                display: '-webkit-box',
                WebkitLineClamp: subtitle.maxLines || DEFAULT_SUBTITLE_STYLE.maxLines,
                WebkitBoxOrient: 'vertical' as const,
                overflow: 'hidden',
                WebkitTextStroke: subtitle.textStroke 
                  ? `${subtitle.textStrokeWidth || DEFAULT_SUBTITLE_STYLE.textStrokeWidth}px ${subtitle.textStrokeColor || DEFAULT_SUBTITLE_STYLE.textStrokeColor}` 
                  : undefined,
                paintOrder: subtitle.textStroke ? 'stroke fill' : undefined,
              }}
            >
              {subtitle.text}
            </div>
          </div>
        ))}
        
        {/* Audio Activation Button - Clickable when muted */}
        {isMuted && (
          <button 
            onClick={handleMuteToggle}
            className="absolute top-2 left-2 z-10 group"
          >
            <div className="flex items-center gap-2 px-3 py-1.5 rounded-md bg-black/70 backdrop-blur-sm 
                            text-white text-xs font-medium cursor-pointer
                            hover:bg-primary/80 hover:scale-105 transition-all duration-200
                            border border-white/20 hover:border-primary/50">
              <Volume2 className="w-4 h-4 group-hover:animate-pulse" />
              <span>🔊 Audio aktivieren</span>
            </div>
          </button>
        )}

        {/* Play Button Overlay */}
        {!isPlaying && (
          <button
            onClick={handlePlayPause}
            className="absolute inset-0 flex items-center justify-center bg-black/30 hover:bg-black/40 transition-colors"
          >
            <div className="w-16 h-16 rounded-full bg-white/90 flex items-center justify-center">
              <Play className="w-8 h-8 text-black ml-1" />
            </div>
          </button>
        )}
      </div>

      {/* Controls */}
      <div className={`flex items-center ${fillContainer ? 'gap-2 py-2 shrink-0' : 'gap-3'}`}>
        <Button
          variant="ghost"
          size="icon"
          onClick={handlePlayPause}
          className="h-8 w-8"
        >
          {isPlaying ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
        </Button>

        <Button
          variant="ghost"
          size="icon"
          onClick={handleReset}
          className="h-8 w-8"
        >
          <RotateCcw className="h-4 w-4" />
        </Button>

        <span className="text-xs text-muted-foreground min-w-[80px]">
          {formatTime(internalTime)} / {formatTime(duration)}
        </span>

        <Slider
          value={[internalTime]}
          min={0}
          max={duration}
          step={0.1}
          onValueChange={handleSeek}
          className="flex-1"
        />

        <Button
          variant="ghost"
          size="icon"
          onClick={handleMuteToggle}
          className="h-8 w-8"
        >
          {isMuted ? <VolumeX className="h-4 w-4" /> : <Volume2 className="h-4 w-4" />}
        </Button>
      </div>
    </div>
  );
};
