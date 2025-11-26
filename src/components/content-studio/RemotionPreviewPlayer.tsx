import { useRef, useState, useEffect } from 'react';
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
    const player = playerRef.current;
    if (!player) return;
    
    const onMuteChange = () => setIsMuted(player.isMuted());
    player.addEventListener('mutechange', onMuteChange);
    
    return () => player.removeEventListener('mutechange', onMuteChange);
  }, []);

  const hasAudio = mappedProps.voiceoverUrl || mappedProps.backgroundMusicUrl;

  return (
    <div className="w-full bg-black rounded-lg overflow-hidden">
      {hasAudio && isMuted && (
        <Button 
          onClick={() => playerRef.current?.unmute()}
          className="mb-2 w-full"
          variant="secondary"
        >
          <VolumeX className="mr-2 h-4 w-4" />
          Audio aktivieren
        </Button>
      )}
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
      {hasAudio && (
        <div className="flex items-center gap-2 text-sm text-muted-foreground mt-2 px-2 pb-2">
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
