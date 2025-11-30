import React, { useRef, useState, useEffect, useMemo, useCallback } from 'react';
import { Player, PlayerRef } from '@remotion/player';
import { Button } from '@/components/ui/button';
import { Slider } from '@/components/ui/slider';
import { Play, Pause, VolumeX, Volume2, Maximize2, RotateCcw } from 'lucide-react';
import { DirectorsCutVideo } from '@/remotion/templates/DirectorsCutVideo';
import { GlobalEffects, AudioEnhancements, SceneEffects, SceneAnalysis, TransitionAssignment, TextOverlay } from '@/types/directors-cut';
import type { KenBurnsKeyframe } from './features/KenBurnsEffect';

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
  className?: string;
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
  speedKeyframes,
  chromaKey,
  kenBurns,
  voiceoverUrl,
  backgroundMusicUrl,
  textOverlays = [],
  className = '',
  children,
}) => {
  const playerRef = useRef<PlayerRef>(null);
  
  // Native HTML5 Audio refs for reliable audio playback
  const sourceAudioRef = useRef<HTMLAudioElement | null>(null);
  const voiceoverAudioRef = useRef<HTMLAudioElement | null>(null);
  const backgroundMusicAudioRef = useRef<HTMLAudioElement | null>(null);
  
  const [isPlaying, setIsPlaying] = useState(false);
  const [isMuted, setIsMuted] = useState(true);
  const [internalTime, setInternalTime] = useState(currentTime);
  const [playerReady, setPlayerReady] = useState(false);

  const fps = 30;
  const durationInFrames = Math.ceil(duration * fps);

  // ==================== DEBUG LOGS ====================
  // Log INPUT scenes prop (from parent)
  useEffect(() => {
    console.log('[DirectorsCutPreviewPlayer] ========== INPUT SCENES DEBUG ==========');
    console.log('[DirectorsCutPreviewPlayer] scenes prop received:', scenes.map(s => ({
      id: s.id,
      start_time: s.start_time,
      end_time: s.end_time,
      original_start_time: s.original_start_time,
      original_end_time: s.original_end_time,
      playbackRate: s.playbackRate
    })));
    console.log('[DirectorsCutPreviewPlayer] transitions prop:', transitions);
    console.log('[DirectorsCutPreviewPlayer] ===========================================');
  }, [scenes, transitions]);
  // ==================== END DEBUG LOGS ====================

  // Convert scenes to Remotion format with effects and Time Remapping data
  // CRITICAL: Ensure originalStartTime is ALWAYS set (fallback to startTime if undefined)
  const remotionScenes = useMemo(() => {
    const converted = scenes.map(scene => {
      // CRITICAL: If original_start_time is missing, use start_time as fallback
      const originalStart = scene.original_start_time ?? scene.start_time;
      const originalEnd = scene.original_end_time ?? scene.end_time;
      
      return {
        id: scene.id,
        startTime: scene.start_time,
        endTime: scene.end_time,
        // Time Remapping fields - MUST always have values
        originalStartTime: originalStart,
        originalEndTime: originalEnd,
        playbackRate: scene.playbackRate ?? 1.0,
        effects: sceneEffects[scene.id] || undefined,
        // Additional Media Support - pass through additionalMedia and isFromOriginalVideo
        additionalMedia: scene.additionalMedia,
        isFromOriginalVideo: scene.isFromOriginalVideo ?? true,
      };
    });
    
    console.log('[DirectorsCutPreviewPlayer] ========== REMOTION SCENES (after conversion) ==========');
    converted.forEach(s => {
      const hasMedia = s.additionalMedia ? `additionalMedia=${s.additionalMedia.type}` : 'original';
      console.log(`[DirectorsCutPreviewPlayer] ${s.id}: timeline=${s.startTime.toFixed(2)}-${s.endTime.toFixed(2)}s, original=${s.originalStartTime.toFixed(2)}-${s.originalEndTime.toFixed(2)}s, rate=${s.playbackRate}, ${hasMedia}`);
    });
    console.log('[DirectorsCutPreviewPlayer] =========================================================');
    
    return converted;
  }, [scenes, sceneEffects]);

  // Convert transitions to Remotion format with robust ID mapping
  const remotionTransitions = useMemo(() => {
    console.log('[DirectorsCutPreviewPlayer] Converting transitions:', transitions);
    console.log('[DirectorsCutPreviewPlayer] Available scenes:', scenes.map(s => s.id));
    
    return transitions.map((t, index) => {
      // Try exact match first
      let sceneIndex = scenes.findIndex(s => s.id === t.sceneId);
      
      // If not found, try numeric part extraction (e.g., "scene_1" → "1")
        if (sceneIndex < 0 && t.sceneId.includes('scene-')) {
          const numericPart = t.sceneId.replace('scene-', '');
        sceneIndex = scenes.findIndex(s => s.id === numericPart);
      }
      
      // If still not found, try pure numeric extraction
      if (sceneIndex < 0) {
        const numericPart = t.sceneId.replace(/\D/g, '');
        sceneIndex = scenes.findIndex(s => s.id === numericPart);
      }
      
      // Final fallback: use index position
      if (sceneIndex < 0) {
        sceneIndex = index;
      }
      
      console.log(`[DirectorsCutPreviewPlayer] Transition mapping: ${t.sceneId} → sceneIndex ${sceneIndex}, type: ${t.transitionType}`);
      
      return {
        sceneIndex,
        type: t.transitionType,
        duration: t.duration,
      };
    });
  }, [transitions, scenes]);

  // Build input props for Remotion
  const inputProps = useMemo(() => ({
    sourceVideoUrl: videoUrl,
    brightness: effects.brightness,
    contrast: effects.contrast,
    saturation: effects.saturation,
    sharpness: effects.sharpness,
    temperature: effects.temperature,
    vignette: effects.vignette,
    filter: effects.filter,
    // Scene-specific effects
    scenes: remotionScenes,
    sceneEffects,
    // Transitions
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
    speedKeyframes,
    chromaKey: chromaKey ? {
      enabled: chromaKey.enabled,
      color: chromaKey.color,
      tolerance: chromaKey.tolerance,
      backgroundUrl: chromaKey.backgroundUrl,
    } : undefined,
    // Ken Burns effect
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
  }), [
    videoUrl, effects, audio, duration, styleTransfer, 
    colorGrading, speedKeyframes, chromaKey, kenBurns, voiceoverUrl, backgroundMusicUrl,
    remotionScenes, sceneEffects, remotionTransitions, textOverlays
  ]);

  // DEBUG: Log when effects change
  useEffect(() => {
    console.log('[DirectorsCutPreviewPlayer] ========== EFFECTS DEBUG ==========');
    console.log('[DirectorsCutPreviewPlayer] brightness:', effects.brightness);
    console.log('[DirectorsCutPreviewPlayer] contrast:', effects.contrast);
    console.log('[DirectorsCutPreviewPlayer] saturation:', effects.saturation);
    console.log('[DirectorsCutPreviewPlayer] sharpness:', effects.sharpness);
    console.log('[DirectorsCutPreviewPlayer] temperature:', effects.temperature);
    console.log('[DirectorsCutPreviewPlayer] vignette:', effects.vignette);
    console.log('[DirectorsCutPreviewPlayer] ===========================================');
  }, [effects]);

  // ==================== NATIVE AUDIO SETUP ====================
  // Setup native HTML5 audio elements for reliable playback
  useEffect(() => {
    console.log('[DirectorsCutPreviewPlayer] Setting up native audio elements');
    console.log('[DirectorsCutPreviewPlayer] videoUrl:', videoUrl);
    console.log('[DirectorsCutPreviewPlayer] voiceoverUrl:', voiceoverUrl);
    console.log('[DirectorsCutPreviewPlayer] backgroundMusicUrl:', backgroundMusicUrl);

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

    // Create Source Video Audio (the original audio from the video file)
    if (videoUrl) {
      const sourceAudio = new Audio(videoUrl);
      sourceAudio.preload = 'auto';
      sourceAudio.crossOrigin = 'anonymous';
      sourceAudio.volume = (audio.master_volume || 100) / 100;
      sourceAudioRef.current = sourceAudio;
      console.log('[DirectorsCutPreviewPlayer] Source audio element created');
    }

    // Create Voiceover Audio
    if (voiceoverUrl) {
      const vo = new Audio(voiceoverUrl);
      vo.preload = 'auto';
      vo.crossOrigin = 'anonymous';
      vo.volume = 1.0;
      voiceoverAudioRef.current = vo;
      console.log('[DirectorsCutPreviewPlayer] Voiceover audio element created');
    }

    // Create Background Music Audio
    if (backgroundMusicUrl) {
      const bg = new Audio(backgroundMusicUrl);
      bg.preload = 'auto';
      bg.crossOrigin = 'anonymous';
      bg.volume = 0.3;
      bg.loop = true;
      backgroundMusicAudioRef.current = bg;
      console.log('[DirectorsCutPreviewPlayer] Background music audio element created');
    }

    // Cleanup on unmount
    return () => {
      console.log('[DirectorsCutPreviewPlayer] Cleaning up native audio elements');
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
      console.log('[DirectorsCutPreviewPlayer] Updated source audio volume:', (audio.master_volume || 100) / 100);
    }
  }, [audio.master_volume]);
  // ==================== END NATIVE AUDIO SETUP ====================

  // Generate player key to force re-render when effects change
  const playerKey = useMemo(() => {
    return `player-${effects.brightness}-${effects.contrast}-${effects.saturation}-${effects.sharpness}-${effects.temperature}-${effects.vignette}`;
  }, [effects.brightness, effects.contrast, effects.saturation, effects.sharpness, effects.temperature, effects.vignette]);

  // Handle player events
  useEffect(() => {
    const player = playerRef.current;
    if (!player) return;

    const onPlay = () => setIsPlaying(true);
    const onPause = () => setIsPlaying(false);
    const onTimeUpdateEvent = () => {
      const frame = player.getCurrentFrame();
      const time = frame / fps;
      setInternalTime(time);
      onTimeUpdate?.(time);
    };
    const onEnded = () => {
      setIsPlaying(false);
      setInternalTime(0);
      // Reset player to frame 0 so video can be replayed
      player.seekTo(0);
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
  }, [onTimeUpdate]);

  // Sync external time changes
  useEffect(() => {
    const player = playerRef.current;
    if (player && Math.abs(currentTime - internalTime) > 0.5) {
      player.seekTo(Math.floor(currentTime * fps));
      setInternalTime(currentTime);
    }
  }, [currentTime, internalTime]);

  const handlePlayPause = useCallback(() => {
    const player = playerRef.current;
    if (!player) return;

    if (isPlaying) {
      player.pause();
      // Pause native audio
      sourceAudioRef.current?.pause();
      voiceoverAudioRef.current?.pause();
      backgroundMusicAudioRef.current?.pause();
      console.log('[DirectorsCutPreviewPlayer] Paused native audio');
    } else {
      // If at the end of video, seek to start before playing
      const currentFrame = player.getCurrentFrame();
      if (currentFrame >= durationInFrames - 1) {
        player.seekTo(0);
        setInternalTime(0);
        // Reset native audio to start
        if (sourceAudioRef.current) sourceAudioRef.current.currentTime = 0;
        if (voiceoverAudioRef.current) voiceoverAudioRef.current.currentTime = 0;
        if (backgroundMusicAudioRef.current) backgroundMusicAudioRef.current.currentTime = 0;
      }
      player.play();
      // Play native audio if not muted
      if (!isMuted) {
        sourceAudioRef.current?.play().catch(e => console.warn('[DirectorsCutPreviewPlayer] Source audio play failed:', e));
        voiceoverAudioRef.current?.play().catch(e => console.warn('[DirectorsCutPreviewPlayer] Voiceover play failed:', e));
        backgroundMusicAudioRef.current?.play().catch(e => console.warn('[DirectorsCutPreviewPlayer] Background music play failed:', e));
        console.log('[DirectorsCutPreviewPlayer] Started native audio playback');
      }
    }
  }, [isPlaying, durationInFrames, isMuted]);

  const handleMuteToggle = useCallback(async (e: React.MouseEvent) => {
    const player = playerRef.current;
    if (!player) return;

    if (isMuted) {
      // CRITICAL: Resume AudioContext first - browsers keep it suspended by default
      try {
        const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
        if (AudioContextClass) {
          const ctx = new AudioContextClass();
          if (ctx.state === 'suspended') {
            await ctx.resume();
            console.log('[DirectorsCutPreviewPlayer] AudioContext resumed successfully');
          }
        }
      } catch (err) {
        console.warn('[DirectorsCutPreviewPlayer] AudioContext resume failed:', err);
      }
      
      player.unmute();
      player.play(e);
      setIsMuted(false);
      
      // Start native audio playback
      console.log('[DirectorsCutPreviewPlayer] Starting native audio after unmute');
      sourceAudioRef.current?.play().catch(e => console.warn('[DirectorsCutPreviewPlayer] Source audio play failed:', e));
      voiceoverAudioRef.current?.play().catch(e => console.warn('[DirectorsCutPreviewPlayer] Voiceover play failed:', e));
      backgroundMusicAudioRef.current?.play().catch(e => console.warn('[DirectorsCutPreviewPlayer] Background music play failed:', e));
    } else {
      player.mute();
      setIsMuted(true);
      
      // Pause native audio
      sourceAudioRef.current?.pause();
      voiceoverAudioRef.current?.pause();
      backgroundMusicAudioRef.current?.pause();
      console.log('[DirectorsCutPreviewPlayer] Paused native audio on mute');
    }
  }, [isMuted]);

  const handleSeek = useCallback((value: number[]) => {
    const player = playerRef.current;
    if (!player) return;

    const newTime = value[0];
    const frame = Math.floor(newTime * fps);
    player.seekTo(frame);
    setInternalTime(newTime);
    onTimeUpdate?.(newTime);
    
    // Sync native audio time
    if (sourceAudioRef.current) {
      sourceAudioRef.current.currentTime = newTime;
    }
    if (voiceoverAudioRef.current) {
      voiceoverAudioRef.current.currentTime = newTime;
    }
    if (backgroundMusicAudioRef.current) {
      backgroundMusicAudioRef.current.currentTime = newTime;
    }
    console.log('[DirectorsCutPreviewPlayer] Synced native audio to:', newTime);
  }, [onTimeUpdate]);

  const handleReset = useCallback(() => {
    const player = playerRef.current;
    if (!player) return;

    player.seekTo(0);
    player.pause();
    setInternalTime(0);
    setIsPlaying(false);
    
    // Reset native audio
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
    console.log('[DirectorsCutPreviewPlayer] Reset native audio');
  }, []);

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  return (
    <div className={`flex flex-col gap-3 ${className}`}>
      {/* Video Player */}
      <div className="relative aspect-video bg-black rounded-lg overflow-hidden">
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
        
        {/* Custom overlays passed as children */}
        {children}
        
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
      <div className="flex items-center gap-3">
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
