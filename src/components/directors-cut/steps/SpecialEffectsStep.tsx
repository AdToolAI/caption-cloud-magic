import { useState } from 'react';
import { TextOverlayEditor } from '../features/TextOverlayEditor';
import { SmartCropping } from '../features/SmartCropping';
import { TextOverlay } from '@/types/directors-cut';

interface CropVariant {
  aspectRatio: string;
  enabled: boolean;
  focusPoint: { x: number; y: number };
  autoTrack: boolean;
}

interface SpecialEffectsStepProps {
  videoUrl: string;
  videoDuration?: number;
  currentTime?: number;
  textOverlays?: TextOverlay[];
  onTextOverlaysChange?: (overlays: TextOverlay[]) => void;
}

export function SpecialEffectsStep({ 
  videoUrl, 
  videoDuration = 30, 
  currentTime = 0,
  textOverlays = [],
  onTextOverlaysChange,
}: SpecialEffectsStepProps) {
  const [cropVariants, setCropVariants] = useState<CropVariant[]>([]);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h3 className="text-lg font-semibold">Spezialeffekte</h3>
        <p className="text-sm text-muted-foreground">
          Text-Overlays und Smart Cropping
        </p>
      </div>

      {/* Text Overlays & Smart Cropping */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <TextOverlayEditor
          overlays={textOverlays}
          onOverlaysChange={onTextOverlaysChange || (() => {})}
          videoDuration={videoDuration}
          currentTime={currentTime}
        />
        <SmartCropping
          sourceAspectRatio="16:9"
          cropVariants={cropVariants}
          onVariantsChange={setCropVariants}
          videoUrl={videoUrl}
        />
      </div>
    </div>
  );
}
