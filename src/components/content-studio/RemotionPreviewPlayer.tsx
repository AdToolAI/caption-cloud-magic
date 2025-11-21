import { Player } from '@remotion/player';
import { DynamicCompositionLoader, type RemotionComponentId, mapFieldsToProps, getCompositionSettings } from '@/remotion/DynamicCompositionLoader';

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

  return (
    <div className="w-full bg-black rounded-lg overflow-hidden">
      <Player
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
      />
    </div>
  );
};
