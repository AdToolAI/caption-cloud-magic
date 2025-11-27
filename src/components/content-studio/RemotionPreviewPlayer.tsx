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
  const voiceoverRef = useRef<HTMLAudioElement | null>(null);
  const backgroundMusicRef = useRef<HTMLAudioElement | null>(null);
  
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

  // Set up native HTML5 audio elements for preview playback
  useEffect(() => {
    console.log('[RemotionPreviewPlayer] Setting up native audio elements');

    // Clean up any existing audio
    voiceoverRef.current?.pause();
    backgroundMusicRef.current?.pause();

    // Voiceover audio
    if (mappedProps.voiceoverUrl) {
      const vo = new Audio(mappedProps.voiceoverUrl);
      vo.preload = 'auto';
      vo.crossOrigin = 'anonymous';
      voiceoverRef.current = vo;
      console.log('[RemotionPreviewPlayer] Voiceover audio element created');
    } else {
      voiceoverRef.current = null;
    }

    // Background music audio
    if (mappedProps.backgroundMusicUrl) {
      const bg = new Audio(mappedProps.backgroundMusicUrl);
      bg.preload = 'auto';
      bg.crossOrigin = 'anonymous';
      bg.volume = typeof mappedProps.backgroundMusicVolume === 'number'
        ? mappedProps.backgroundMusicVolume
        : 0.3;
      backgroundMusicRef.current = bg;
      console.log('[RemotionPreviewPlayer] Background music audio element created');
    } else {
      backgroundMusicRef.current = null;
    }

    return () => {
      console.log('[RemotionPreviewPlayer] Cleaning up native audio elements');
      voiceoverRef.current?.pause();
      backgroundMusicRef.current?.pause();
      voiceoverRef.current = null;
      backgroundMusicRef.current = null;
    };
  }, [mappedProps.voiceoverUrl, mappedProps.backgroundMusicUrl, mappedProps.backgroundMusicVolume]);

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
        // Start native audio when the player starts
        voiceoverRef.current?.play().catch((e) => {
          console.error('[RemotionPreviewPlayer] Failed to play voiceover audio:', e);
        });
        backgroundMusicRef.current?.play().catch((e) => {
          console.error('[RemotionPreviewPlayer] Failed to play background music audio:', e);
        });
        setIsPlaying(true);
      };
      const onPause = () => {
        console.log('[RemotionPreviewPlayer] Paused');
        // Pause native audio when the player pauses
        voiceoverRef.current?.pause();
        backgroundMusicRef.current?.pause();
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


  const hasAudio = mappedProps.voiceoverUrl || mappedProps.backgroundMusicUrl;

  console.log('[RemotionPreviewPlayer] Button state:', {
    hasAudio,
    isMuted,
    shouldShowButton: hasAudio && isMuted,
  });

  const handlePlay = useCallback((e: React.MouseEvent) => {
    const player = playerRef.current;
    if (!player) {
      console.log('[RemotionPreviewPlayer] Player ref is null');
      return;
    }

    console.log('[RemotionPreviewPlayer] Starting playback with audio');

    // Start native audio first (voiceover + background music)
    if (voiceoverRef.current) {
      voiceoverRef.current.currentTime = 0;
      voiceoverRef.current.play().catch((err) => {
        console.error('[RemotionPreviewPlayer] Error playing voiceover audio:', err);
      });
    }

    if (backgroundMusicRef.current) {
      backgroundMusicRef.current.currentTime = 0;
      backgroundMusicRef.current.play().catch((err) => {
        console.error('[RemotionPreviewPlayer] Error playing background music audio:', err);
      });
    }

    // Then unmute and play the Remotion player
    if (player.isMuted()) {
      player.unmute();
    }
    player.play(e);
  }, []);

  const handleToggleMute = useCallback((e: React.MouseEvent) => {
    const player = playerRef.current;
    if (!player) {
      console.log('[RemotionPreviewPlayer] Player ref is null');
      return;
    }

    if (player.isMuted()) {
      console.log('[RemotionPreviewPlayer] Unmuting and starting playback');
      player.unmute();
      // Resume native audio when unmuting
      voiceoverRef.current?.play().catch((err) => {
        console.error('[RemotionPreviewPlayer] Error resuming voiceover audio:', err);
      });
      backgroundMusicRef.current?.play().catch((err) => {
        console.error('[RemotionPreviewPlayer] Error resuming background music audio:', err);
      });
      player.play(e);
    } else {
      console.log('[RemotionPreviewPlayer] Muting');
      player.mute();
      // Also pause native audio when muting
      voiceoverRef.current?.pause();
      backgroundMusicRef.current?.pause();
    }
  }, []);

  return (
    <div className="w-full space-y-2">
      {hasAudio && (isMuted || !isPlaying) && (
        <Button 
          type="button"
          onClickCapture={handlePlay}
          className="w-full text-lg py-6"
          variant="default"
          size="lg"
        >
          <VolumeX className="mr-2 h-5 w-5" />
          ▶ Video starten (mit Audio)
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
          clickToPlay={false}
          allowFullscreen={true}
          autoPlay={false}
          initiallyMuted={true}
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
