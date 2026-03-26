import React, { useMemo, useRef, useState, useCallback, useEffect, memo } from 'react';
import { Player, PlayerRef } from '@remotion/player';
import { UniversalVideo } from '@/remotion/templates/UniversalVideo';
import { Volume2, VolumeX, Play, Pause } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { toast } from '@/hooks/use-toast';

// MemoizedPlayer - ONLY re-renders when audio URLs change, NOT for visual prop changes
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
}) {
  console.log('[MemoizedPlayer] Rendering with audio:', {
    backgroundMusicUrl: !!inputProps?.backgroundMusicUrl,
    voiceoverUrl: !!inputProps?.voiceoverUrl,
  });
  
  return (
    <Player
      ref={playerRef}
      component={UniversalVideo}
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
  const audioEqual = 
    prevProps.inputProps?.backgroundMusicUrl === nextProps.inputProps?.backgroundMusicUrl &&
    prevProps.inputProps?.voiceoverUrl === nextProps.inputProps?.voiceoverUrl;
  
  const subtitlesEqual = 
    JSON.stringify(prevProps.inputProps?.subtitles) === JSON.stringify(nextProps.inputProps?.subtitles) &&
    JSON.stringify(prevProps.inputProps?.subtitleStyle) === JSON.stringify(nextProps.inputProps?.subtitleStyle);
  
  const durationEqual = prevProps.durationInFrames === nextProps.durationInFrames;
  
  return audioEqual && subtitlesEqual && durationEqual;
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
  loop = true,
  autoPlay = false,
  showControls = true,
  className,
}: RemotionPreviewPlayerProps) {
  const playerRef = useRef<PlayerRef>(null);
  const seekBarRef = useRef<HTMLDivElement>(null);
  const hasEverInteractedRef = useRef(false); // NEVER resets - tracks if user ever clicked play
  const [isMuted, setIsMuted] = useState(true);
  const [volume, setVolume] = useState(1);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentFrame, setCurrentFrame] = useState(0);
  const [isDragging, setIsDragging] = useState(false);

  // Separate audio props to keep them STABLE across step changes
  const stableAudioProps = useMemo(() => ({
    backgroundMusicUrl: customizations?.backgroundMusicUrl,
    backgroundMusicVolume: customizations?.backgroundMusicVolume,
    voiceoverUrl: customizations?.voiceoverUrl,
  }), [
    customizations?.backgroundMusicUrl,
    customizations?.backgroundMusicVolume,
    customizations?.voiceoverUrl
  ]);

  const inputProps = useMemo(() => ({
    ...customizations,
    // Override with stable audio refs to prevent unnecessary remounts
    ...stableAudioProps,
  }), [customizations, stableAudioProps]);

  const aspectRatio = width / height;

  // Re-activate audio when audio props change (NO REMOUNT - keep warmed audio tags!)
  useEffect(() => {
    if (hasEverInteractedRef.current && playerRef.current) {
      const timer = setTimeout(() => {
        if (playerRef.current) {
          console.log('[RemotionPreviewPlayer] Re-activating audio after props change');
          playerRef.current.unmute();
          playerRef.current.setVolume(volume);
          setIsMuted(false);
        }
      }, 100);
      return () => clearTimeout(timer);
    }
  }, [inputProps?.backgroundMusicUrl, inputProps?.voiceoverUrl, volume]);

  // Sync player state with component state
  useEffect(() => {
    const player = playerRef.current;
    if (!player) return;

    const handlePlay = () => setIsPlaying(true);
    const handlePause = () => setIsPlaying(false);
    const handleEnded = () => setIsPlaying(false);
    const handleFrameUpdate = () => {
      if (!isDragging) {
        setCurrentFrame(player.getCurrentFrame());
      }
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
  }, [isDragging]);

  // Handle seek bar dragging
  useEffect(() => {
    if (!isDragging) return;

    const handleMouseMove = (e: MouseEvent) => {
      if (!seekBarRef.current || !playerRef.current) return;
      const rect = seekBarRef.current.getBoundingClientRect();
      const pos = Math.max(0, Math.min(e.clientX - rect.left, rect.width));
      const frame = Math.round((pos / rect.width) * (durationInFrames - 1));
      setCurrentFrame(frame);
      playerRef.current.seekTo(frame);
    };

    const handleMouseUp = () => {
      setIsDragging(false);
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);

    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isDragging, durationInFrames]);

  // Format time from frames
  const formatTime = useCallback((frames: number) => {
    const seconds = Math.floor(frames / fps);
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  }, [fps]);

  // Handle seek bar click
  const handleSeekStart = useCallback((e: React.PointerEvent) => {
    if (!seekBarRef.current || !playerRef.current) return;
    const rect = seekBarRef.current.getBoundingClientRect();
    const pos = Math.max(0, Math.min(e.clientX - rect.left, rect.width));
    const frame = Math.round((pos / rect.width) * (durationInFrames - 1));
    setCurrentFrame(frame);
    playerRef.current.seekTo(frame);
    setIsDragging(true);
  }, [durationInFrames]);

  // Play with event object - required for browser autoplay policy!
  const handlePlayClick = useCallback((e: React.MouseEvent) => {
    if (!playerRef.current) return;
    // Mark that user has ever interacted (NEVER resets)
    hasEverInteractedRef.current = true;
    // 1. First unmute
    playerRef.current.unmute();
    // 2. Set volume
    playerRef.current.setVolume(volume);
    // 3. Update state
    setIsMuted(false);
    // 4. Play with event object (CRITICAL for browser policy)
    playerRef.current.play(e);
  }, [volume]);

  const handlePauseClick = useCallback(() => {
    if (!playerRef.current) return;
    playerRef.current.pause();
  }, []);

  const toggleMute = useCallback(() => {
    if (!playerRef.current) return;
    if (isMuted) {
      playerRef.current.unmute();
      playerRef.current.setVolume(volume);
      setIsMuted(false);
    } else {
      playerRef.current.mute();
      setIsMuted(true);
    }
  }, [isMuted, volume]);

  const handleVolumeChange = useCallback((value: number[]) => {
    if (!playerRef.current) return;
    const newVolume = value[0];
    playerRef.current.setVolume(newVolume);
    setVolume(newVolume);
    if (newVolume === 0) {
      playerRef.current.mute();
      setIsMuted(true);
    } else if (isMuted) {
      playerRef.current.unmute();
      setIsMuted(false);
    }
  }, [isMuted]);

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
          numberOfSharedAudioTags={5}
          initiallyMuted={!hasEverInteractedRef.current}
        />
      </div>
      
      {/* Custom Controls - Event-based for browser audio policy */}
      <div className="flex flex-col gap-2 mt-3 px-3 py-2.5 bg-muted/30 rounded-lg border border-border/50">
        {/* Timeline/SeekBar */}
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
              style={{ width: `${(currentFrame / durationInFrames) * 100}%` }}
            />
            <div 
              className="absolute top-1/2 -translate-y-1/2 w-3 h-3 bg-primary rounded-full shadow-md opacity-0 group-hover:opacity-100 transition-opacity"
              style={{ left: `calc(${(currentFrame / durationInFrames) * 100}% - 6px)` }}
            />
          </div>
          <span className="text-xs text-muted-foreground min-w-[2.5rem]">
            {formatTime(durationInFrames)}
          </span>
        </div>

        {/* Playback Controls */}
        <div className="flex items-center gap-3">
          {/* Play/Pause Button */}
          <Button 
            size="icon" 
            variant="ghost" 
            onClickCapture={isPlaying ? handlePauseClick : handlePlayClick}
            className="h-9 w-9 text-foreground hover:bg-primary/20"
          >
            {isPlaying ? <Pause className="h-5 w-5" /> : <Play className="h-5 w-5" />}
          </Button>

          <div className="h-6 w-px bg-border/50" />

          {/* Volume Controls */}
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
    </div>
  );
}
