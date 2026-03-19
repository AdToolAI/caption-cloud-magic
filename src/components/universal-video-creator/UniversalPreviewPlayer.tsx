import { useState, useRef, useCallback, useMemo } from 'react';
import { Player, PlayerRef } from '@remotion/player';
import { Play, Pause, Volume2, VolumeX, Maximize2, RotateCcw, Download, RefreshCw, AlertCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Slider } from '@/components/ui/slider';
import { cn } from '@/lib/utils';
import { UniversalCreatorVideo } from '@/remotion/templates/UniversalCreatorVideo';

interface UniversalPreviewPlayerProps {
  project: {
    scenes?: any[];
    subtitles?: any[];
    voiceoverUrl?: string;
    backgroundMusicUrl?: string;
    backgroundMusicVolume?: number;
    primaryColor?: string;
    secondaryColor?: string;
    category?: string;
    storytellingStructure?: string;
    outputUrl?: string;
    brandUrl?: string;
  };
  aspectRatio?: '16:9' | '9:16' | '1:1';
  onExport?: () => void;
  showExportButton?: boolean;
}

const ASPECT_DIMENSIONS = {
  '16:9': { width: 1920, height: 1080 },
  '9:16': { width: 1080, height: 1920 },
  '1:1': { width: 1080, height: 1080 },
};

export function UniversalPreviewPlayer({
  project,
  aspectRatio = '16:9',
  onExport,
  showExportButton = true,
}: UniversalPreviewPlayerProps) {
  const playerRef = useRef<PlayerRef>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [volume, setVolume] = useState(0.8);
  const [currentTime, setCurrentTime] = useState(0);
  const [selectedAspect, setSelectedAspect] = useState<'16:9' | '9:16' | '1:1'>(aspectRatio);
  const [isVideoEnded, setIsVideoEnded] = useState(false);

  const brandUrl = project.brandUrl;

  const dimensions = ASPECT_DIMENSIONS[selectedAspect];
  
  // Calculate total duration from scenes
  const totalDuration = useMemo(() => {
    if (!project.scenes || project.scenes.length === 0) return 30;
    return project.scenes.reduce((sum, scene) => sum + (scene.duration || 5), 0);
  }, [project.scenes]);

  const fps = 30;
  const durationInFrames = Math.ceil(totalDuration * fps);

  const inputProps = useMemo(() => ({
    scenes: project.scenes || [],
    subtitles: project.subtitles || [],
    voiceoverUrl: project.voiceoverUrl || '',
    backgroundMusicUrl: project.backgroundMusicUrl || '',
    backgroundMusicVolume: project.backgroundMusicVolume || 0.2,
    masterVolume: isMuted ? 0 : volume,
    primaryColor: project.primaryColor || '#F5C76A',
    secondaryColor: project.secondaryColor || '#22d3ee',
    category: (project.category || 'social-reel') as 'product-ad' | 'social-reel' | 'explainer' | 'testimonial' | 'tutorial' | 'event-promo' | 'brand-story' | 'educational' | 'announcement' | 'behind-scenes' | 'comparison' | 'showcase',
    storytellingStructure: (project.storytellingStructure || 'hook-problem-solution') as 'hook-problem-solution' | 'aida' | 'pas' | 'hero-journey' | 'before-after' | 'three-act' | 'listicle' | 'day-in-life' | 'challenge' | 'transformation',
    targetWidth: dimensions.width,
    targetHeight: dimensions.height,
    fps,
    showProgressBar: false,
    showWatermark: false,
  }), [project, isMuted, volume, dimensions]);

  const handlePlayPause = useCallback(() => {
    if (!playerRef.current) return;
    
    if (isPlaying) {
      playerRef.current.pause();
    } else {
      playerRef.current.play();
    }
    setIsPlaying(!isPlaying);
  }, [isPlaying]);

  const handleSeek = useCallback((newTime: number[]) => {
    if (!playerRef.current) return;
    const frame = Math.floor(newTime[0] * fps);
    playerRef.current.seekTo(frame);
    setCurrentTime(newTime[0]);
  }, [fps]);

  const handleVolumeChange = useCallback((newVolume: number[]) => {
    setVolume(newVolume[0]);
    if (newVolume[0] > 0 && isMuted) {
      setIsMuted(false);
    }
  }, [isMuted]);

  const handleMuteToggle = useCallback(() => {
    setIsMuted(!isMuted);
  }, [isMuted]);

  const handleRestart = useCallback(() => {
    if (!playerRef.current) return;
    playerRef.current.seekTo(0);
    setCurrentTime(0);
    playerRef.current.play();
    setIsPlaying(true);
  }, []);

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  // Calculate container aspect ratio for responsive sizing
  const containerStyle = useMemo(() => {
    const aspectRatioValue = dimensions.width / dimensions.height;
    if (selectedAspect === '9:16') {
      return { maxWidth: '350px', margin: '0 auto' };
    }
    return { width: '100%' };
  }, [selectedAspect, dimensions]);

  // Check if project has enough data for preview
  const hasValidData = useMemo(() => {
    return (project.scenes && project.scenes.length > 0) || !!project.outputUrl;
  }, [project.scenes, project.outputUrl]);

  const hasScenes = project.scenes && project.scenes.length > 0;

  if (!hasValidData) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-center">
        <div className="w-20 h-20 rounded-full bg-muted/20 flex items-center justify-center mb-6 border border-white/10">
          <AlertCircle className="h-10 w-10 text-muted-foreground" />
        </div>
        <h3 className="text-lg font-semibold mb-2">Keine Video-Daten</h3>
        <p className="text-sm text-muted-foreground max-w-md">
          Das Projekt enthält keine Szenen. Bitte generiere zuerst ein Video.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Aspect Ratio Selector */}
      <div className="flex items-center justify-center gap-2 mb-4">
        {(['16:9', '9:16', '1:1'] as const).map((ratio) => (
          <Button
            key={ratio}
            variant={selectedAspect === ratio ? 'default' : 'outline'}
            size="sm"
            onClick={() => setSelectedAspect(ratio)}
            className={cn(
              'transition-all',
              selectedAspect === ratio && 'bg-[#F5C76A] text-black hover:bg-[#F5C76A]/90'
            )}
          >
            {ratio === '16:9' && 'YouTube'}
            {ratio === '9:16' && 'TikTok/Reels'}
            {ratio === '1:1' && 'Social'}
          </Button>
        ))}
      </div>

      {/* Player Container */}
      <div 
        className="relative bg-black rounded-xl overflow-hidden border border-white/10 shadow-2xl"
        style={containerStyle}
      >
        {hasScenes ? (
          <>
            <div style={{ aspectRatio: `${dimensions.width}/${dimensions.height}` }}>
              <Player
                ref={playerRef}
                component={UniversalCreatorVideo}
                inputProps={inputProps}
                durationInFrames={durationInFrames}
                fps={fps}
                compositionWidth={dimensions.width}
                compositionHeight={dimensions.height}
                style={{ width: '100%', height: '100%' }}
                controls={false}
                loop={false}
                clickToPlay={false}
                spaceKeyToPlayOrPause={true}
                numberOfSharedAudioTags={4}
              />
            </div>

            {/* Custom Controls Overlay */}
            <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/90 via-black/50 to-transparent p-4">
              {/* Progress Bar */}
              <div className="mb-3">
                <Slider
                  value={[currentTime]}
                  min={0}
                  max={totalDuration}
                  step={0.1}
                  onValueChange={handleSeek}
                  className="cursor-pointer"
                />
                <div className="flex justify-between text-xs text-white/60 mt-1">
                  <span>{formatTime(currentTime)}</span>
                  <span>{formatTime(totalDuration)}</span>
                </div>
              </div>

              {/* Control Buttons */}
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={handlePlayPause}
                    className="text-white hover:bg-white/10 h-10 w-10"
                  >
                    {isPlaying ? (
                      <Pause className="h-5 w-5" />
                    ) : (
                      <Play className="h-5 w-5 ml-0.5" />
                    )}
                  </Button>

                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={handleRestart}
                    className="text-white hover:bg-white/10 h-8 w-8"
                  >
                    <RotateCcw className="h-4 w-4" />
                  </Button>

                  <div className="flex items-center gap-2 ml-2">
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={handleMuteToggle}
                      className="text-white hover:bg-white/10 h-8 w-8"
                    >
                      {isMuted || volume === 0 ? (
                        <VolumeX className="h-4 w-4" />
                      ) : (
                        <Volume2 className="h-4 w-4" />
                      )}
                    </Button>
                    <Slider
                      value={[isMuted ? 0 : volume]}
                      min={0}
                      max={1}
                      step={0.1}
                      onValueChange={handleVolumeChange}
                      className="w-20"
                    />
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  {showExportButton && onExport && (
                    <Button
                      onClick={onExport}
                      className="bg-[#F5C76A] text-black hover:bg-[#F5C76A]/90 gap-2"
                      size="sm"
                    >
                      <Download className="h-4 w-4" />
                      Exportieren
                    </Button>
                  )}
                </div>
              </div>
            </div>
          </>
        ) : project.outputUrl ? (
          <video
            src={project.outputUrl}
            controls
            autoPlay={false}
            className="w-full h-full"
            style={{ aspectRatio: `${dimensions.width}/${dimensions.height}` }}
          />
        ) : null}
      </div>

      {/* Download button for MP4 fallback */}
      {!hasScenes && project.outputUrl && (
        <div className="flex items-center justify-center gap-3">
          <a
            href={project.outputUrl}
            download
            target="_blank"
            rel="noopener noreferrer"
          >
            <Button className="bg-[#F5C76A] text-black hover:bg-[#F5C76A]/90 gap-2">
              <Download className="h-4 w-4" />
              Video herunterladen
            </Button>
          </a>
        </div>
      )}

      {/* Scene Info */}
      {hasScenes && (
        <div className="text-center text-sm text-muted-foreground">
          {project.scenes!.length} Szenen • {formatTime(totalDuration)} Gesamtdauer
        </div>
      )}
    </div>
  );
}
