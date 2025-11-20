import { Player } from '@remotion/player';
import { RemotionRoot } from '@/remotion/Root';

interface RemotionPreviewPlayerProps {
  componentName: string;
  customizations: Record<string, any>;
  width?: number;
  height?: number;
  durationInFrames?: number;
}

export const RemotionPreviewPlayer = ({
  componentName,
  customizations,
  width = 1080,
  height = 1920,
  durationInFrames = 450,
}: RemotionPreviewPlayerProps) => {
  return (
    <div className="w-full bg-black rounded-lg overflow-hidden">
      <Player
        component={RemotionRoot}
        inputProps={customizations}
        durationInFrames={durationInFrames}
        compositionWidth={width}
        compositionHeight={height}
        fps={30}
        style={{
          width: '100%',
          aspectRatio: `${width}/${height}`,
        }}
        controls
        showVolumeControls
        clickToPlay
      />
    </div>
  );
};
