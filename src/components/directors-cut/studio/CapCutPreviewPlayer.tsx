import React, { useRef, useEffect, useCallback, useState } from 'react';
import { Play, Pause, SkipBack, SkipForward, Volume2, VolumeX, Maximize2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Slider } from '@/components/ui/slider';
import { SceneAnalysis } from '@/types/directors-cut';
import { cn } from '@/lib/utils';

interface CapCutPreviewPlayerProps {
  videoUrl: string;
  isPlaying: boolean;
  currentTime: number;
  duration: number;
  volume: number;
  isMuted: boolean;
  autoMuteVideo?: boolean;
  scenes: SceneAnalysis[];
  onPlayPause: () => void;
  onSeek: (time: number) => void;
  onTimeUpdate: (time: number) => void;
  onVolumeChange: (volume: number) => void;
  onMuteToggle: () => void;
  onPlayingChange?: (playing: boolean) => void;
}

const formatTime = (seconds: number): string => {
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
};

export const CapCutPreviewPlayer: React.FC<CapCutPreviewPlayerProps> = ({
  videoUrl,
  isPlaying,
  currentTime,
  duration,
  volume,
  isMuted,
  autoMuteVideo = false,
  scenes,
  onPlayPause,
  onSeek,
  onTimeUpdate,
  onVolumeChange,
  onMuteToggle,
  onPlayingChange,
}) => {
  const mainVideoRef = useRef<HTMLVideoElement>(null);
  const additionalVideoRef = useRef<HTMLVideoElement>(null);
  const animationRef = useRef<number>();
  const lastSceneIdRef = useRef<string | null>(null);

  // Find current scene based on currentTime
  const currentScene = scenes.find(
    s => currentTime >= s.start_time && currentTime < s.end_time
  );

  // Determine if we're playing additionalMedia or main video
  const isAdditionalMedia = currentScene?.additionalMedia?.type === 'video';
  const activeVideoUrl = isAdditionalMedia 
    ? currentScene.additionalMedia!.url 
    : videoUrl;

  // Calculate time within the current video source
  const getVideoTime = useCallback(() => {
    if (!currentScene) return currentTime;
    
    if (isAdditionalMedia) {
      // For additionalMedia, time is relative to scene start
      return currentTime - currentScene.start_time;
    } else {
      // For original video, use the original start_time from the source
      // Find cumulative original video time up to this scene
      let originalTime = 0;
      for (const scene of scenes) {
        if (scene.id === currentScene.id) {
          originalTime += (currentTime - scene.start_time);
          break;
        }
        if (!scene.additionalMedia) {
          originalTime += (scene.end_time - scene.start_time);
        }
      }
      return originalTime;
    }
  }, [currentTime, currentScene, isAdditionalMedia, scenes]);

  // Animation loop for time updates during playback
  useEffect(() => {
    if (!isPlaying) {
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
      }
      return;
    }

    const update = () => {
      const activeVideo = isAdditionalMedia ? additionalVideoRef.current : mainVideoRef.current;
      
      if (activeVideo && !activeVideo.paused && currentScene) {
        let newGlobalTime: number;
        
        if (isAdditionalMedia) {
          // additionalMedia: scene_start + video_currentTime
          newGlobalTime = currentScene.start_time + activeVideo.currentTime;
        } else {
          // Original video - calculate global time
          newGlobalTime = currentScene.start_time + (activeVideo.currentTime - getOriginalStartTime());
        }
        
        // Check if we've reached the end of current scene
        if (newGlobalTime >= currentScene.end_time) {
          // Find next scene
          const currentIndex = scenes.findIndex(s => s.id === currentScene.id);
          const nextScene = scenes[currentIndex + 1];
          
          if (nextScene) {
            onTimeUpdate(nextScene.start_time);
          } else {
            // End of all scenes
            onPlayingChange?.(false);
            onTimeUpdate(duration);
          }
        } else {
          onTimeUpdate(newGlobalTime);
        }
      }
      
      animationRef.current = requestAnimationFrame(update);
    };

    animationRef.current = requestAnimationFrame(update);

    return () => {
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
      }
    };
  }, [isPlaying, isAdditionalMedia, currentScene, scenes, duration, onTimeUpdate, onPlayingChange]);

  // Calculate original video start time for current scene
  const getOriginalStartTime = useCallback(() => {
    if (!currentScene || isAdditionalMedia) return 0;
    
    let originalTime = 0;
    for (const scene of scenes) {
      if (scene.id === currentScene.id) break;
      if (!scene.additionalMedia) {
        originalTime += (scene.end_time - scene.start_time);
      }
    }
    return originalTime;
  }, [currentScene, isAdditionalMedia, scenes]);

  // Handle scene changes - sync video position
  useEffect(() => {
    if (!currentScene) return;

    const sceneChanged = lastSceneIdRef.current !== currentScene.id;
    lastSceneIdRef.current = currentScene.id;

    if (isAdditionalMedia) {
      // Switch to additionalMedia video
      const additionalVideo = additionalVideoRef.current;
      const mainVideo = mainVideoRef.current;
      
      if (additionalVideo) {
        const relativeTime = currentTime - currentScene.start_time;
        if (Math.abs(additionalVideo.currentTime - relativeTime) > 0.3 || sceneChanged) {
          additionalVideo.currentTime = Math.max(0, relativeTime);
        }
        
        if (isPlaying && additionalVideo.paused) {
          additionalVideo.play().catch(() => {});
        }
      }
      
      // Pause main video
      if (mainVideo && !mainVideo.paused) {
        mainVideo.pause();
      }
    } else {
      // Switch to main video
      const mainVideo = mainVideoRef.current;
      const additionalVideo = additionalVideoRef.current;
      
      if (mainVideo) {
        const targetTime = getOriginalStartTime() + (currentTime - currentScene.start_time);
        if (Math.abs(mainVideo.currentTime - targetTime) > 0.3 || sceneChanged) {
          mainVideo.currentTime = Math.max(0, targetTime);
        }
        
        if (isPlaying && mainVideo.paused) {
          mainVideo.play().catch(() => {});
        }
      }
      
      // Pause additional video
      if (additionalVideo && !additionalVideo.paused) {
        additionalVideo.pause();
      }
    }
  }, [currentTime, currentScene, isAdditionalMedia, isPlaying, getOriginalStartTime]);

  // Handle play/pause
  const handlePlayPause = useCallback(async () => {
    const activeVideo = isAdditionalMedia ? additionalVideoRef.current : mainVideoRef.current;
    
    if (!activeVideo) {
      onPlayPause();
      return;
    }

    try {
      if (isPlaying) {
        activeVideo.pause();
        onPlayingChange?.(false);
      } else {
        await activeVideo.play();
        onPlayingChange?.(true);
      }
    } catch (error) {
      console.error('Video play error:', error);
    }
  }, [isPlaying, isAdditionalMedia, onPlayPause, onPlayingChange]);

  // Handle seek
  const handleSeek = useCallback((time: number) => {
    onSeek(time);
  }, [onSeek]);

  const handleSkip = (delta: number) => {
    const newTime = Math.max(0, Math.min(duration, currentTime + delta));
    handleSeek(newTime);
  };

  // Update volume
  useEffect(() => {
    const effectiveVolume = (autoMuteVideo || isMuted) ? 0 : volume / 100;
    if (mainVideoRef.current) {
      mainVideoRef.current.volume = effectiveVolume;
    }
    if (additionalVideoRef.current) {
      additionalVideoRef.current.volume = effectiveVolume;
    }
  }, [volume, isMuted, autoMuteVideo]);

  // Stop playback when isPlaying becomes false
  useEffect(() => {
    if (!isPlaying) {
      mainVideoRef.current?.pause();
      additionalVideoRef.current?.pause();
    }
  }, [isPlaying]);

  return (
    <div className="h-full flex flex-col rounded-lg overflow-hidden bg-[#0d0d0d]">
      {/* Video Container */}
      <div className="flex-1 relative flex items-center justify-center bg-black min-h-0">
        {/* Blackscreen overlay */}
        {currentScene?.isBlackscreen && (
          <div className="absolute inset-0 bg-black flex flex-col items-center justify-center z-10">
            <div className="text-white/30 text-sm font-medium">Blackscreen</div>
            <div className="text-white/20 text-xs mt-1">Szene {scenes.indexOf(currentScene) + 1}</div>
          </div>
        )}

        {/* Main video (original source) */}
        <video
          ref={mainVideoRef}
          src={videoUrl}
          className={cn(
            "max-w-full max-h-full object-contain cursor-pointer",
            isAdditionalMedia && "hidden"
          )}
          onClick={handlePlayPause}
          muted={autoMuteVideo || isMuted}
          playsInline
          preload="auto"
        />

        {/* Additional video (uploaded scenes) */}
        <video
          ref={additionalVideoRef}
          src={currentScene?.additionalMedia?.url || ''}
          className={cn(
            "max-w-full max-h-full object-contain cursor-pointer",
            !isAdditionalMedia && "hidden"
          )}
          onClick={handlePlayPause}
          muted={autoMuteVideo || isMuted}
          playsInline
          preload="auto"
        />
        
        {/* Play overlay when paused */}
        {!isPlaying && (
          <div 
            className="absolute inset-0 flex items-center justify-center cursor-pointer z-20"
            onClick={handlePlayPause}
          >
            <div className="w-16 h-16 rounded-full bg-white/20 backdrop-blur-sm flex items-center justify-center hover:bg-white/30 transition-colors">
              <Play className="h-8 w-8 text-white ml-1" />
            </div>
          </div>
        )}

        {/* Fullscreen button */}
        <Button
          variant="ghost"
          size="sm"
          className="absolute top-2 right-2 h-8 w-8 p-0 bg-black/50 hover:bg-black/70 text-white z-20"
          onClick={() => {
            const activeVideo = isAdditionalMedia ? additionalVideoRef.current : mainVideoRef.current;
            activeVideo?.requestFullscreen();
          }}
        >
          <Maximize2 className="h-4 w-4" />
        </Button>
      </div>

      {/* Scene Thumbnails */}
      {scenes.length > 0 && (
        <div className="h-12 flex gap-1 p-1 bg-[#1a1a1a] overflow-x-auto">
          {scenes.map((scene, index) => (
            <button
              key={scene.id}
              onClick={() => handleSeek(scene.start_time)}
              className={cn(
                "h-full aspect-video rounded flex-shrink-0 border-2 transition-all overflow-hidden",
                currentTime >= scene.start_time && currentTime < scene.end_time
                  ? "border-[#00d4ff]"
                  : "border-transparent hover:border-white/30"
              )}
            >
              <div className={cn(
                "w-full h-full flex items-center justify-center text-xs",
                scene.additionalMedia ? "bg-emerald-600/50 text-white" : "bg-[#2a2a2a] text-white/60"
              )}>
                {scene.additionalMedia ? '📹' : ''} {index + 1}
              </div>
            </button>
          ))}
        </div>
      )}

      {/* Controls */}
      <div className="h-12 flex items-center gap-3 px-3 bg-[#242424]">
        {/* Skip back */}
        <Button
          variant="ghost"
          size="sm"
          className="h-8 w-8 p-0 text-white/70 hover:text-white hover:bg-white/10"
          onClick={() => handleSkip(-5)}
        >
          <SkipBack className="h-4 w-4" />
        </Button>

        {/* Play/Pause */}
        <Button
          variant="ghost"
          size="sm"
          className="h-9 w-9 p-0 rounded-full bg-[#00d4ff] hover:bg-[#00b8e0] text-black"
          onClick={handlePlayPause}
        >
          {isPlaying ? (
            <Pause className="h-4 w-4" />
          ) : (
            <Play className="h-4 w-4 ml-0.5" />
          )}
        </Button>

        {/* Skip forward */}
        <Button
          variant="ghost"
          size="sm"
          className="h-8 w-8 p-0 text-white/70 hover:text-white hover:bg-white/10"
          onClick={() => handleSkip(5)}
        >
          <SkipForward className="h-4 w-4" />
        </Button>

        {/* Time display */}
        <span className="text-xs text-white/70 font-mono min-w-[90px]">
          {formatTime(currentTime)} / {formatTime(duration)}
        </span>

        {/* Seek slider */}
        <div className="flex-1 mx-2">
          <Slider
            value={[currentTime]}
            max={duration || 100}
            step={0.1}
            onValueChange={([value]) => handleSeek(value)}
            className="cursor-pointer"
          />
        </div>

        {/* Volume */}
        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            size="sm"
            className="h-8 w-8 p-0 text-white/70 hover:text-white hover:bg-white/10"
            onClick={onMuteToggle}
          >
            {isMuted ? (
              <VolumeX className="h-4 w-4" />
            ) : (
              <Volume2 className="h-4 w-4" />
            )}
          </Button>
          <Slider
            value={[isMuted ? 0 : volume]}
            max={100}
            step={1}
            onValueChange={([value]) => onVolumeChange(value)}
            className="w-20 cursor-pointer"
          />
        </div>
      </div>
    </div>
  );
};
