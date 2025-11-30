import React from 'react';
import { Play, Pause, SkipBack, SkipForward, Volume2, VolumeX, Maximize2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Slider } from '@/components/ui/slider';
import { SceneAnalysis } from '@/types/directors-cut';
import { cn } from '@/lib/utils';

interface CapCutPreviewPlayerProps {
  videoRef: React.RefObject<HTMLVideoElement>;
  videoUrl: string;
  isPlaying: boolean;
  currentTime: number;
  duration: number;
  volume: number;
  isMuted: boolean;
  scenes: SceneAnalysis[];
  onPlayPause: () => void;
  onSeek: (time: number) => void;
  onTimeUpdate: () => void;
  onVolumeChange: (volume: number) => void;
  onMuteToggle: () => void;
}

const formatTime = (seconds: number): string => {
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
};

export const CapCutPreviewPlayer: React.FC<CapCutPreviewPlayerProps> = ({
  videoRef,
  videoUrl,
  isPlaying,
  currentTime,
  duration,
  volume,
  isMuted,
  scenes,
  onPlayPause,
  onSeek,
  onTimeUpdate,
  onVolumeChange,
  onMuteToggle,
}) => {
  const handleSkip = (delta: number) => {
    const newTime = Math.max(0, Math.min(duration, currentTime + delta));
    onSeek(newTime);
  };

  return (
    <div className="h-full flex flex-col rounded-lg overflow-hidden bg-[#0d0d0d]">
      {/* Video Container */}
      <div className="flex-1 relative flex items-center justify-center bg-black min-h-0">
        <video
          ref={videoRef}
          src={videoUrl}
          className="max-w-full max-h-full object-contain cursor-pointer"
          onClick={onPlayPause}
          onTimeUpdate={onTimeUpdate}
          playsInline
          preload="auto"
        />
        
        {/* Play overlay when paused */}
        {!isPlaying && (
          <div 
            className="absolute inset-0 flex items-center justify-center cursor-pointer"
            onClick={onPlayPause}
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
          className="absolute top-2 right-2 h-8 w-8 p-0 bg-black/50 hover:bg-black/70 text-white"
          onClick={() => videoRef.current?.requestFullscreen()}
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
              onClick={() => onSeek(scene.start_time)}
              className={cn(
                "h-full aspect-video rounded flex-shrink-0 border-2 transition-all overflow-hidden",
                currentTime >= scene.start_time && currentTime < scene.end_time
                  ? "border-[#00d4ff]"
                  : "border-transparent hover:border-white/30"
              )}
            >
              <div className="w-full h-full bg-[#2a2a2a] flex items-center justify-center text-xs text-white/60">
                {index + 1}
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
          onClick={onPlayPause}
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
            onValueChange={([value]) => onSeek(value)}
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
