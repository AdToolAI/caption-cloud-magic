import { useState, useRef, useEffect } from 'react';
import { Play, Pause, Maximize2, AlertCircle, Loader2 } from 'lucide-react';
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
  const [originalVideoError, setOriginalVideoError] = useState<string | null>(null);
  const [editedVideoError, setEditedVideoError] = useState<string | null>(null);
  const [originalVideoLoading, setOriginalVideoLoading] = useState(true);
  const [editedVideoLoading, setEditedVideoLoading] = useState(true);
  const [videoDuration, setVideoDuration] = useState(0);
  const [isDragging, setIsDragging] = useState(false);

  const originalVideoRef = useRef<HTMLVideoElement>(null);
  const editedVideoRef = useRef<HTMLVideoElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // Synchronize video playback
  useEffect(() => {
    if (isPlaying) {
      originalVideoRef.current?.play().catch(() => {});
      editedVideoRef.current?.play().catch(() => {});
    } else {
      originalVideoRef.current?.pause();
      editedVideoRef.current?.pause();
    }
  }, [isPlaying]);

  // Reset loading states when URLs change
  useEffect(() => {
    if (originalUrl) {
      setOriginalVideoLoading(true);
      setOriginalVideoError(null);
    }
  }, [originalUrl]);

  useEffect(() => {
    if (editedUrl) {
      setEditedVideoLoading(true);
      setEditedVideoError(null);
    }
  }, [editedUrl]);

  const handlePlayPause = () => {
    setIsPlaying(!isPlaying);
  };

  const handleVideoError = (e: React.SyntheticEvent<HTMLVideoElement>, type: 'original' | 'edited') => {
    const video = e.currentTarget;
    const error = video.error;
    let errorMessage = 'Video konnte nicht geladen werden';
    
    if (error) {
      switch (error.code) {
        case 1: errorMessage = 'Download abgebrochen'; break;
        case 2: errorMessage = 'Netzwerkfehler'; break;
        case 3: errorMessage = 'Dekodierungsfehler'; break;
        case 4: errorMessage = 'Format nicht unterstützt'; break;
      }
    }

    if (type === 'original') {
      setOriginalVideoError(errorMessage);
      setOriginalVideoLoading(false);
    } else {
      setEditedVideoError(errorMessage);
      setEditedVideoLoading(false);
    }
  };

  const handleLoadedMetadata = (e: React.SyntheticEvent<HTMLVideoElement>, type: 'original' | 'edited') => {
    const video = e.currentTarget;
    setVideoDuration(video.duration);
    
    if (type === 'original') {
      setOriginalVideoLoading(false);
    } else {
      setEditedVideoLoading(false);
    }
  };

  const handleTimeUpdate = (e: React.SyntheticEvent<HTMLVideoElement>) => {
    const video = e.currentTarget;
    if (videoDuration > 0) {
      setProgress((video.currentTime / videoDuration) * 100);
    }
  };

  const handleProgressChange = (value: number[]) => {
    const newProgress = value[0];
    setProgress(newProgress);
    
    if (originalVideoRef.current && videoDuration > 0) {
      originalVideoRef.current.currentTime = (newProgress / 100) * videoDuration;
    }
    if (editedVideoRef.current && videoDuration > 0) {
      editedVideoRef.current.currentTime = (newProgress / 100) * videoDuration;
    }
  };

  const handleMouseDown = (e: React.MouseEvent) => {
    setIsDragging(true);
    handleMouseMove(e);
  };

  const handleMouseMove = (e: React.MouseEvent | MouseEvent) => {
    if (!isDragging && e.type !== 'click') return;
    
    const container = containerRef.current;
    if (!container) return;

    const rect = container.getBoundingClientRect();
    const x = ('clientX' in e ? e.clientX : 0) - rect.left;
    const percent = (x / rect.width) * 100;
    setSplitPosition(Math.min(Math.max(percent, 10), 90));
  };

  const handleMouseUp = () => {
    setIsDragging(false);
  };

  useEffect(() => {
    if (isDragging) {
      const handleGlobalMouseMove = (e: MouseEvent) => handleMouseMove(e);
      const handleGlobalMouseUp = () => handleMouseUp();
      
      window.addEventListener('mousemove', handleGlobalMouseMove);
      window.addEventListener('mouseup', handleGlobalMouseUp);
      
      return () => {
        window.removeEventListener('mousemove', handleGlobalMouseMove);
        window.removeEventListener('mouseup', handleGlobalMouseUp);
      };
    }
  }, [isDragging]);

  const renderVideoOrError = (
    url: string | undefined,
    error: string | null,
    loading: boolean,
    ref: React.RefObject<HTMLVideoElement>,
    type: 'original' | 'edited'
  ) => {
    if (!url) {
      return (
        <div className="text-muted-foreground text-sm">
          {type === 'original' ? 'Original Video' : 'Bearbeitete Version wird hier angezeigt'}
        </div>
      );
    }

    if (error) {
      return (
        <div className="flex flex-col items-center gap-2 text-center p-4">
          <AlertCircle className="h-8 w-8 text-destructive" />
          <p className="font-medium text-sm">Video konnte nicht geladen werden</p>
          <p className="text-xs text-muted-foreground">{error}</p>
        </div>
      );
    }

    if (loading) {
      return (
        <div className="flex flex-col items-center gap-2">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
          <p className="text-sm text-muted-foreground">Video lädt...</p>
        </div>
      );
    }

    return (
      <video
        key={url}
        ref={ref}
        src={url}
        crossOrigin="anonymous"
        controls={false}
        className="w-full h-full object-cover"
        loop
        muted
        playsInline
        onError={(e) => handleVideoError(e, type)}
        onLoadedMetadata={(e) => handleLoadedMetadata(e, type)}
        onTimeUpdate={type === 'original' ? handleTimeUpdate : undefined}
      />
    );
  };

  return (
    <div className="space-y-4">
      {/* Split View */}
      <div 
        ref={containerRef}
        className="relative aspect-video bg-muted rounded-lg overflow-hidden"
        onMouseDown={handleMouseDown}
      >
        <div className="grid grid-cols-2 gap-2 h-full">
          {/* Original Video */}
          <div className="relative">
            <div className="absolute inset-0 flex items-center justify-center">
              {renderVideoOrError(originalUrl, originalVideoError, originalVideoLoading, originalVideoRef, 'original')}
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
                  <Loader2 className="h-8 w-8 animate-spin text-primary" />
                  <p className="text-sm text-muted-foreground">Generiere neue Version...</p>
                </div>
              ) : (
                renderVideoOrError(editedUrl, editedVideoError, editedVideoLoading, editedVideoRef, 'edited')
              )}
            </div>
            <div className="absolute top-2 right-2 bg-primary/80 backdrop-blur px-2 py-1 rounded text-xs font-medium text-primary-foreground">
              Bearbeitet
            </div>
          </div>
        </div>

        {/* Interactive Divider Slider */}
        {originalUrl && (
          <div 
            className="absolute top-0 bottom-0 w-1 bg-primary cursor-ew-resize z-10 hover:w-1.5 transition-all"
            style={{ left: `${splitPosition}%` }}
            onMouseDown={(e) => e.stopPropagation()}
          >
            <div className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 w-6 h-6 bg-primary rounded-full flex items-center justify-center shadow-lg">
              <div className="w-1 h-4 bg-primary-foreground rounded" />
            </div>
          </div>
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
            disabled={!originalUrl || originalVideoLoading}
            onValueChange={handleProgressChange}
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
      {originalUrl && videoDuration > 0 && (
        <div className="text-xs text-muted-foreground text-center">
          {Math.floor((progress / 100) * videoDuration)}s / {Math.floor(videoDuration)}s
        </div>
      )}
    </div>
  );
};
