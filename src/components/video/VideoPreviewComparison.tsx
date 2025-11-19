import { useState, useRef, useEffect } from 'react';
import { Play, Pause, Maximize2, AlertCircle, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Slider } from '@/components/ui/slider';

interface VideoPreviewComparisonProps {
  originalUrl?: string;
  editedUrl?: string;
  thumbnailUrl?: string;
  isGenerating?: boolean;
}

export const VideoPreviewComparison = ({ 
  originalUrl, 
  editedUrl,
  thumbnailUrl,
  isGenerating = false 
}: VideoPreviewComparisonProps) => {
  const [isPlaying, setIsPlaying] = useState(false);
  const [progress, setProgress] = useState(0);
  const [splitPosition, setSplitPosition] = useState(50);
  const [originalVideoError, setOriginalVideoError] = useState<string | null>(null);
  const [editedVideoError, setEditedVideoError] = useState<string | null>(null);
  const [originalVideoLoading, setOriginalVideoLoading] = useState(false);
  const [editedVideoLoading, setEditedVideoLoading] = useState(false);
  const [videoDuration, setVideoDuration] = useState(0);
  const [isDragging, setIsDragging] = useState(false);
  const [showOriginalPlayer, setShowOriginalPlayer] = useState(false);
  const [showEditedPlayer, setShowEditedPlayer] = useState(false);

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
      console.log('[VideoPreview] Original URL changed:', originalUrl);
      setOriginalVideoError(null);
      setShowOriginalPlayer(false);
    }
  }, [originalUrl]);

  useEffect(() => {
    if (editedUrl) {
      console.log('[VideoPreview] Edited URL changed:', editedUrl);
      setEditedVideoError(null);
      setShowEditedPlayer(false);
    }
  }, [editedUrl]);

  // Timeout fallback for original video
  useEffect(() => {
    if (!showOriginalPlayer || !originalUrl) return;
    
    console.log('[VideoPreview] Starting original video load timeout');
    setOriginalVideoLoading(true);
    
    const timeout = window.setTimeout(() => {
      if (originalVideoLoading) {
        console.warn('[VideoPreview] Original video timeout after 10s');
        setOriginalVideoError('Laden dauert ungewöhnlich lange. Öffne das Video direkt im neuen Tab.');
        setOriginalVideoLoading(false);
      }
    }, 10000);
    
    return () => clearTimeout(timeout);
  }, [showOriginalPlayer, originalUrl]);

  // Timeout fallback for edited video
  useEffect(() => {
    if (!showEditedPlayer || !editedUrl) return;
    
    console.log('[VideoPreview] Starting edited video load timeout');
    setEditedVideoLoading(true);
    
    const timeout = window.setTimeout(() => {
      if (editedVideoLoading) {
        console.warn('[VideoPreview] Edited video timeout after 10s');
        setEditedVideoError('Laden dauert ungewöhnlich lange. Öffne das Video direkt im neuen Tab.');
        setEditedVideoLoading(false);
      }
    }, 10000);
    
    return () => clearTimeout(timeout);
  }, [showEditedPlayer, editedUrl]);

  const handlePlayPause = () => {
    setIsPlaying(!isPlaying);
  };

  const handleVideoError = (e: React.SyntheticEvent<HTMLVideoElement>, type: 'original' | 'edited') => {
    const video = e.currentTarget;
    const error = video.error;
    let errorMessage = 'Video konnte nicht geladen werden';
    
    console.error(`[VideoPreview] ${type} video error:`, error);
    
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
    console.log(`[VideoPreview] ${type} video metadata loaded, duration:`, video.duration);
    if (type === 'original') {
      setVideoDuration(video.duration);
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
    type: 'original' | 'edited',
    url: string | undefined,
    error: string | null,
    loading: boolean,
    showPlayer: boolean,
    setShowPlayer: (show: boolean) => void,
    ref: React.RefObject<HTMLVideoElement>
  ) => {
    if (!url) {
      return (
        <div className="flex items-center justify-center h-full bg-muted">
          <p className="text-sm text-muted-foreground">
            {type === 'original' ? 'Kein Original-Video verfügbar' : 'Keine bearbeitete Version verfügbar'}
          </p>
        </div>
      );
    }

    if (error) {
      return (
        <div className="flex flex-col items-center justify-center h-full p-4 bg-muted gap-2">
          <AlertCircle className="h-8 w-8 text-destructive" />
          <p className="text-sm font-medium text-destructive">Video konnte nicht geladen werden</p>
          <p className="text-xs text-muted-foreground">{error}</p>
          <a
            href={url}
            target="_blank"
            rel="noreferrer"
            className="mt-2 text-xs text-primary underline hover:no-underline"
          >
            Video im neuen Tab öffnen
          </a>
        </div>
      );
    }

    // Thumbnail-First: Show thumbnail until user clicks
    if (!showPlayer && thumbnailUrl) {
      return (
        <button
          type="button"
          className="relative w-full h-full group cursor-pointer"
          onClick={() => {
            console.log(`[VideoPreview] User clicked to load ${type} video`);
            setShowPlayer(true);
          }}
        >
          <img 
            src={thumbnailUrl} 
            alt="Video Vorschau"
            className="w-full h-full object-cover"
          />
          <div className="absolute inset-0 flex items-center justify-center bg-black/20 group-hover:bg-black/30 transition-colors">
            <Play className="h-12 w-12 text-white drop-shadow-lg" />
          </div>
          <div className="absolute bottom-3 right-3 text-xs bg-black/70 text-white px-2 py-1 rounded">
            Klicken zum Laden
          </div>
        </button>
      );
    }

    if (loading) {
      return (
        <div className="flex flex-col items-center justify-center h-full p-4 bg-muted gap-2">
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
        preload="metadata"
        poster={thumbnailUrl || undefined}
        controls={false}
        className="w-full h-full object-cover"
        loop
        muted
        playsInline
        onError={(e) => handleVideoError(e, type)}
        onLoadedMetadata={(e) => handleLoadedMetadata(e, type)}
        onLoadedData={() => {
          console.log(`[VideoPreview] ${type} video data loaded`);
          if (type === 'original') {
            setOriginalVideoLoading(false);
          } else {
            setEditedVideoLoading(false);
          }
        }}
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
              {renderVideoOrError('original', originalUrl, originalVideoError, originalVideoLoading, showOriginalPlayer, setShowOriginalPlayer, originalVideoRef)}
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
                renderVideoOrError('edited', editedUrl, editedVideoError, editedVideoLoading, showEditedPlayer, setShowEditedPlayer, editedVideoRef)
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
