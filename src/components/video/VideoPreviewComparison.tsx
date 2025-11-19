import { useState } from 'react';
import ReactPlayer from 'react-player';
import { Play, Pause, Maximize2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Slider } from '@/components/ui/slider';

interface VideoPreviewComparisonProps {
  originalUrl?: string;
  editedUrl?: string;
  isGenerating?: boolean;
}

export const VideoPreviewComparison = ({ 
  originalUrl, 
  editedUrl,
  isGenerating = false 
}: VideoPreviewComparisonProps) => {
  const [isPlaying, setIsPlaying] = useState(false);
  const [progress, setProgress] = useState(0);
  const [splitPosition, setSplitPosition] = useState(50);

  const handlePlayPause = () => {
    setIsPlaying(!isPlaying);
  };

  const handleProgress = (state: any) => {
    setProgress(state.played * 100);
  };

  return (
    <div className="space-y-4">
      {/* Split View */}
      <div className="relative aspect-video bg-muted rounded-lg overflow-hidden">
        <div className="grid grid-cols-2 gap-2 h-full">
          {/* Original Video */}
          <div className="relative">
            <div className="absolute inset-0 flex items-center justify-center">
              {originalUrl ? (
                <video
                  src={originalUrl}
                  autoPlay={isPlaying}
                  controls={false}
                  className="w-full h-full object-cover"
                  loop
                />
              ) : (
                <div className="text-muted-foreground text-sm">
                  Original Video
                </div>
              )}
            </div>
            <div className="absolute top-2 left-2 bg-background/80 backdrop-blur px-2 py-1 rounded text-xs font-medium">
              Original
            </div>
          </div>

          {/* Edited Video */}
          <div className="relative">
            <div className="absolute inset-0 flex items-center justify-center">
              {isGenerating ? (
                <div className="flex flex-col items-center gap-2">
                  <div className="animate-spin h-8 w-8 border-2 border-primary border-t-transparent rounded-full" />
                  <p className="text-sm text-muted-foreground">Generiere neue Version...</p>
                </div>
              ) : editedUrl ? (
                <video
                  src={editedUrl}
                  autoPlay={isPlaying}
                  controls={false}
                  className="w-full h-full object-cover"
                  loop
                />
              ) : (
                <div className="text-muted-foreground text-sm">
                  Bearbeitete Version wird hier angezeigt
                </div>
              )}
            </div>
            <div className="absolute top-2 right-2 bg-primary/80 backdrop-blur px-2 py-1 rounded text-xs font-medium text-primary-foreground">
              Bearbeitet
            </div>
          </div>
        </div>

        {/* Divider Slider */}
        {originalUrl && (
          <div 
            className="absolute top-0 bottom-0 w-1 bg-primary cursor-ew-resize z-10"
            style={{ left: `${splitPosition}%` }}
          />
        )}
      </div>

      {/* Controls */}
      <div className="flex items-center gap-4">
        <Button
          variant="outline"
          size="icon"
          onClick={handlePlayPause}
          disabled={!originalUrl}
        >
          {isPlaying ? (
            <Pause className="h-4 w-4" />
          ) : (
            <Play className="h-4 w-4" />
          )}
        </Button>

        {/* Progress Bar */}
        <div className="flex-1">
          <Slider
            value={[progress]}
            max={100}
            step={0.1}
            disabled={!originalUrl}
            className="cursor-pointer"
          />
        </div>

        <Button
          variant="outline"
          size="icon"
          disabled={!originalUrl}
        >
          <Maximize2 className="h-4 w-4" />
        </Button>
      </div>

      {/* Timestamp */}
      {originalUrl && (
        <div className="text-xs text-muted-foreground text-center">
          {Math.floor(progress / 100 * 30)}s / 30s
        </div>
      )}
    </div>
  );
};
