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
    const { current } = playerRef;
    if (!current) {
      console.log('[RemotionPreviewPlayer] Player ref not ready');
      return;
    }

    console.log('[RemotionPreviewPlayer] Setting up mute listener, current muted:', current.isMuted());
    setIsMuted(current.isMuted());

    const onMuteChange = () => {
      console.log('[RemotionPreviewPlayer] Mute changed to:', current.isMuted());
      setIsMuted(current.isMuted());
    };

    current.addEventListener('mutechange', onMuteChange);
    return () => {
      current.removeEventListener('mutechange', onMuteChange);
    };
  }, [playerRef]);

  const hasAudio = mappedProps.voiceoverUrl || mappedProps.backgroundMusicUrl;

  console.log('[RemotionPreviewPlayer] Button state:', {
    hasAudio,
    isMuted,
    shouldShowButton: hasAudio && isMuted,
  });

  const handleToggleMute = useCallback(() => {
    const player = playerRef.current;
    if (!player) {
      console.log('[RemotionPreviewPlayer] Player ref is null');
      return;
    }

    if (player.isMuted()) {
      console.log('[RemotionPreviewPlayer] Calling unmute()');
      player.unmute();
    } else {
      console.log('[RemotionPreviewPlayer] Calling mute()');
      player.mute();
    }
  }, []);

  return (
    <div className="w-full space-y-2">
      {hasAudio && isMuted && (
        <Button 
          type="button"
          onClick={handleToggleMute}
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
        />
      </div>
      {hasAudio && (
        <div className="flex items-center gap-2 text-sm text-muted-foreground px-2">
          {isMuted ? (
            <>
              <VolumeX className="h-4 w-4" />
              <span>Audio stummgeschaltet</span>
            </>
          ) : (
            <>
              <Volume2 className="h-4 w-4 text-green-500" />
              <span>Audio aktiv</span>
            </>
          )}
        </div>
      )}
    </div>
  );
};
