import { useState } from 'react';
import { AIObjectRemoval } from '../features/AIObjectRemoval';
import { SmartCropping } from '../features/SmartCropping';

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
  onObjectRemovalChange?: (enabled: boolean, count: number) => void;
}

export function SpecialEffectsStep({ 
  videoUrl, 
  videoDuration = 30, 
  currentTime = 0,
  onObjectRemovalChange,
}: SpecialEffectsStepProps) {
  const [removedObjects, setRemovedObjects] = useState<string[]>([]);
  const [cropVariants, setCropVariants] = useState<CropVariant[]>([]);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h3 className="text-lg font-semibold">Spezialeffekte</h3>
        <p className="text-sm text-muted-foreground">
          Objekt-Entfernung und Smart Cropping
        </p>
      </div>

      {/* Object Removal & Smart Cropping */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <AIObjectRemoval
          videoUrl={videoUrl}
          onObjectsRemoved={(objects) => {
            setRemovedObjects(objects);
            onObjectRemovalChange?.(objects.length > 0, objects.length);
          }}
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
