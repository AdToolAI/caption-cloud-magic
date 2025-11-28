import React, { useRef, useState, useEffect, useMemo, useCallback } from 'react';
import { Player, PlayerRef } from '@remotion/player';
import { Button } from '@/components/ui/button';
import { Slider } from '@/components/ui/slider';
import { Play, Pause, VolumeX, Volume2, Maximize2, RotateCcw } from 'lucide-react';
import { DirectorsCutVideo } from '@/remotion/templates/DirectorsCutVideo';
import { GlobalEffects, AudioEnhancements, SceneEffects, SceneAnalysis, TransitionAssignment } from '@/types/directors-cut';

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
  speedKeyframes?: Array<{ time: number; speed: number }>;
  chromaKey?: {
    enabled: boolean;
    color: string;
    tolerance: number;
    backgroundUrl?: string;
  };
  voiceoverUrl?: string;
  backgroundMusicUrl?: string;
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
  voiceoverUrl,
  backgroundMusicUrl,
  className = '',
  children,
}) => {
  const playerRef = useRef<PlayerRef>(null);
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
  const remotionScenes = useMemo(() => {
    const converted = scenes.map(scene => ({
      id: scene.id,
      startTime: scene.start_time,
      endTime: scene.end_time,
      // Time Remapping fields
      originalStartTime: scene.original_start_time,
      originalEndTime: scene.original_end_time,
      playbackRate: scene.playbackRate,
      effects: sceneEffects[scene.id] || undefined,
    }));
    
    console.log('[DirectorsCutPreviewPlayer] ========== REMOTION SCENES (after conversion) ==========');
    console.log('[DirectorsCutPreviewPlayer] remotionScenes:', converted.map(s => ({
      id: s.id,
      startTime: s.startTime,
      endTime: s.endTime,
      originalStartTime: s.originalStartTime,
      originalEndTime: s.originalEndTime,
      playbackRate: s.playbackRate
    })));
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
    masterVolume: audio.master_volume,
    voiceoverUrl,
    voiceoverVolume: 100,
    backgroundMusicUrl,
    backgroundMusicVolume: 30,
    durationInSeconds: duration,
  }), [
    videoUrl, effects, audio, duration, styleTransfer, 
    colorGrading, speedKeyframes, chromaKey, voiceoverUrl, backgroundMusicUrl,
    remotionScenes, sceneEffects, remotionTransitions
  ]);

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
    } else {
      // If at the end of video, seek to start before playing
      const currentFrame = player.getCurrentFrame();
      if (currentFrame >= durationInFrames - 1) {
        player.seekTo(0);
        setInternalTime(0);
      }
      player.play();
    }
  }, [isPlaying, durationInFrames]);

  const handleMuteToggle = useCallback((e: React.MouseEvent) => {
    const player = playerRef.current;
    if (!player) return;

    if (isMuted) {
      player.unmute();
      player.play(e);
      setIsMuted(false);
    } else {
      player.mute();
      setIsMuted(true);
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
  }, [onTimeUpdate]);

  const handleReset = useCallback(() => {
    const player = playerRef.current;
    if (!player) return;

    player.seekTo(0);
    player.pause();
    setInternalTime(0);
    setIsPlaying(false);
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
