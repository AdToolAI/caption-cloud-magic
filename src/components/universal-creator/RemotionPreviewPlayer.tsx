import { useMemo, useRef, useState, useCallback, useEffect } from 'react';
import { Player, PlayerRef } from '@remotion/player';
import { UniversalVideo } from '@/remotion/templates/UniversalVideo';
import { Volume2, VolumeX, Play, Pause } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Slider } from '@/components/ui/slider';

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
  const [isMuted, setIsMuted] = useState(true); // Start muted for browser policy
  const [volume, setVolume] = useState(1);
  const [isPlaying, setIsPlaying] = useState(false);

  const inputProps = useMemo(() => ({
    ...customizations,
  }), [customizations]);

  // Calculate aspect ratio for responsive sizing
  const aspectRatio = width / height;

  // Sync player state with component state
  useEffect(() => {
    const player = playerRef.current;
    if (!player) return;

    const handlePlay = () => setIsPlaying(true);
    const handlePause = () => setIsPlaying(false);
    const handleEnded = () => setIsPlaying(false);

    player.addEventListener('play', handlePlay);
    player.addEventListener('pause', handlePause);
    player.addEventListener('ended', handleEnded);

    return () => {
      player.removeEventListener('play', handlePlay);
      player.removeEventListener('pause', handlePause);
      player.removeEventListener('ended', handleEnded);
    };
  }, []);

  // Play with event object - required for browser autoplay policy!
  const handlePlayClick = useCallback((e: React.MouseEvent) => {
    if (!playerRef.current) return;
    // Unmute when user clicks play (user gesture allows audio)
    playerRef.current.unmute();
    playerRef.current.setVolume(volume);
    setIsMuted(false);
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
        <Player
          ref={playerRef}
          component={UniversalVideo}
          inputProps={inputProps}
          durationInFrames={durationInFrames}
          compositionWidth={width}
          compositionHeight={height}
          fps={fps}
          loop={loop}
          autoPlay={false}
          controls={false}
          initiallyMuted={true}
          numberOfSharedAudioTags={5}
          style={{
            width: '100%',
            height: '100%',
          }}
        />
      </div>
      
      {/* Custom Controls - Event-based for browser audio policy */}
      <div className="flex items-center gap-3 mt-3 px-3 py-2.5 bg-muted/30 rounded-lg border border-border/50">
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
        <Slider
          value={[isMuted ? 0 : volume]}
          onValueChange={handleVolumeChange}
          max={1}
          step={0.05}
          className="w-28"
        />
        <span className="text-xs text-muted-foreground min-w-[2.5rem]">
          {Math.round((isMuted ? 0 : volume) * 100)}%
        </span>
      </div>
    </div>
  );
}
