import { useRef, useState, useEffect, useCallback } from 'react';
import { Player, PlayerRef } from '@remotion/player';
import { prefetch } from 'remotion';
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
    let mounted = true;
    
    const setupListeners = () => {
      const { current } = playerRef;
      if (!current || !mounted) return;
      
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
      
      console.log('[RemotionPreviewPlayer] Initial state:', {
        isMuted: current.isMuted(),
      });
      
      return () => {
        current.removeEventListener('mutechange', onMuteChange);
        current.removeEventListener('play', onPlay);
        current.removeEventListener('pause', onPause);
        current.removeEventListener('error', onError);
      };
    };
    
    // Try immediately, then with increasing delays for reliability
    const timers = [0, 100, 500, 1000].map(delay => 
      setTimeout(() => {
        if (playerRef.current && mounted) setupListeners();
      }, delay)
    );
    
    return () => {
      mounted = false;
      timers.forEach(clearTimeout);
    };
  }, []);

  // Prefetch audio assets for better playback
  useEffect(() => {
    if (mappedProps.voiceoverUrl) {
      prefetch(mappedProps.voiceoverUrl, { logLevel: 'trace' });
      console.log('[RemotionPreviewPlayer] Voiceover prefetch initiated');
    }
    if (mappedProps.backgroundMusicUrl) {
      prefetch(mappedProps.backgroundMusicUrl, { logLevel: 'trace' });
      console.log('[RemotionPreviewPlayer] Music prefetch initiated');
    }
  }, [mappedProps.voiceoverUrl, mappedProps.backgroundMusicUrl]);

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
      {hasAudio && (
        <Button 
          variant="outline" 
          size="sm"
          className="w-full"
          onClick={() => {
            const audioUrl = mappedProps.voiceoverUrl || mappedProps.backgroundMusicUrl;
            if (!audioUrl) return;
            const audio = new Audio(audioUrl);
            audio.play().then(() => {
              console.log('[Test] Audio plays directly from HTML5 Audio element!');
            }).catch(e => {
              console.error('[Test] Audio failed in HTML5 Audio element:', e);
            });
          }}
        >
          🔊 Test Audio direkt
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
