import { useRef, useState, useEffect, useCallback } from 'react';
import { Player, PlayerRef } from '@remotion/player';
import { DynamicCompositionLoader, type RemotionComponentId, mapFieldsToProps, getCompositionSettings } from '@/remotion/DynamicCompositionLoader';
import { Button } from '@/components/ui/button';
import { VolumeX, Volume2 } from 'lucide-react';

interface RemotionPreviewPlayerProps {
  componentName: string;
  customizations: Record<string, any>;
  width?: number;
  height?: number;
  durationInFrames?: number;
  remotionComponentId?: RemotionComponentId;
  fieldMappings?: Array<{
    field_key: string;
    remotion_prop_name: string;
    transformation_function?: string | null;
  }>;
}

export const RemotionPreviewPlayer = ({
  componentName,
  customizations,
  width,
  height,
  durationInFrames,
  remotionComponentId,
  fieldMappings = [],
}: RemotionPreviewPlayerProps) => {
  const playerRef = useRef<PlayerRef>(null);
  const [isMuted, setIsMuted] = useState(true);
  const [isPlaying, setIsPlaying] = useState(false);
  
  // Use remotionComponentId if provided, fallback to componentName
  const componentId = (remotionComponentId || componentName) as RemotionComponentId;
  
  // Get default composition settings if not provided
  const compositionSettings = getCompositionSettings(componentId);
  const finalWidth = width || compositionSettings.width;
  const finalHeight = height || compositionSettings.height;
  const finalDuration = durationInFrames || compositionSettings.durationInFrames;

  // Map customizations to Remotion props using field mappings
  const mappedProps = fieldMappings.length > 0
    ? mapFieldsToProps(customizations, fieldMappings)
    : customizations;
  
  // Debug audio props
  console.log('[RemotionPreviewPlayer] Audio props:', {
    voiceoverUrl: mappedProps.voiceoverUrl,
    backgroundMusicUrl: mappedProps.backgroundMusicUrl,
    backgroundMusicVolume: mappedProps.backgroundMusicVolume,
  });

  useEffect(() => {
    // Small timeout to ensure Player has mounted
    const timer = setTimeout(() => {
      const { current } = playerRef;
      if (!current) {
        console.log('[RemotionPreviewPlayer] Player ref not ready after timeout');
        return;
      }

      console.log('[RemotionPreviewPlayer] Setting up event listeners');
      setIsMuted(current.isMuted());

      const onMuteChange = () => {
        console.log('[RemotionPreviewPlayer] Mute changed to:', current.isMuted());
        setIsMuted(current.isMuted());
      };

      const onPlay = () => {
        console.log('[RemotionPreviewPlayer] Playing');
        setIsPlaying(true);
      };
      
      const onPause = () => {
        console.log('[RemotionPreviewPlayer] Paused');
        setIsPlaying(false);
      };
      
      const onError = (e: any) => console.error('[RemotionPreviewPlayer] Error:', e);

      current.addEventListener('mutechange', onMuteChange);
      current.addEventListener('play', onPlay);
      current.addEventListener('pause', onPause);
      current.addEventListener('error', onError);
      
      // Also log current state
      console.log('[RemotionPreviewPlayer] Initial state:', {
        isMuted: current.isMuted(),
      });
    }, 100);
    
    return () => clearTimeout(timer);
  }, []);

  const hasAudio = mappedProps.voiceoverUrl || mappedProps.backgroundMusicUrl;

  console.log('[RemotionPreviewPlayer] Button state:', {
    hasAudio,
    isMuted,
    shouldShowButton: hasAudio && isMuted,
  });

  const handleToggleMute = useCallback((e: React.MouseEvent) => {
    const player = playerRef.current;
    if (!player) {
      console.log('[RemotionPreviewPlayer] Player ref is null');
      return;
    }

    if (player.isMuted()) {
      console.log('[RemotionPreviewPlayer] Unmuting and starting playback');
      player.unmute();
      // Force play with the user event
      player.play(e);
    } else {
      console.log('[RemotionPreviewPlayer] Muting');
      player.mute();
    }
  }, []);

  return (
    <div className="w-full space-y-2">
      {hasAudio && isMuted && (
        <Button 
          type="button"
          onClickCapture={handleToggleMute}
          className="w-full"
          variant="default"
        >
          <VolumeX className="mr-2 h-4 w-4" />
          Audio aktivieren
        </Button>
      )}
      <div className="bg-black rounded-lg overflow-hidden">
        <Player
          ref={playerRef}
          component={DynamicCompositionLoader}
          inputProps={{
            componentId,
            inputProps: mappedProps,
          }}
          durationInFrames={finalDuration}
          compositionWidth={finalWidth}
          compositionHeight={finalHeight}
          fps={compositionSettings.fps}
          style={{
            width: '100%',
            aspectRatio: `${finalWidth}/${finalHeight}`,
          }}
          controls
          showVolumeControls
          clickToPlay
          allowFullscreen={true}
          autoPlay={false}
          logLevel="trace"
        />
      </div>
      {hasAudio && (
        <div className="flex items-center gap-2 text-sm text-muted-foreground px-2">
          {isPlaying ? (
            <span className="text-green-500">▶ Video spielt</span>
          ) : (
            <span className="text-yellow-500">⏸ Video pausiert - drücke Play</span>
          )}
          {isMuted ? " (stumm)" : " (mit Ton)"}
        </div>
      )}
    </div>
  );
};
