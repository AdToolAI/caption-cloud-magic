import { useMemo } from 'react';
import { Player } from '@remotion/player';
import { UniversalVideo } from '@/remotion/templates/UniversalVideo';

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
  const inputProps = useMemo(() => ({
    ...customizations,
  }), [customizations]);

  // Calculate aspect ratio for responsive sizing
  const aspectRatio = width / height;

  return (
    <div className={className}>
      <div 
        className="relative w-full overflow-hidden rounded-lg bg-black"
        style={{ aspectRatio }}
      >
        <Player
          component={UniversalVideo}
          inputProps={inputProps}
          durationInFrames={durationInFrames}
          compositionWidth={width}
          compositionHeight={height}
          fps={fps}
          loop={loop}
          autoPlay={autoPlay}
          controls={showControls}
          style={{
            width: '100%',
            height: '100%',
          }}
        />
      </div>
    </div>
  );
}
