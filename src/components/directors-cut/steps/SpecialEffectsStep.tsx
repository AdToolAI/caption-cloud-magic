import { useState } from 'react';
import { AIObjectRemoval } from '../features/AIObjectRemoval';
import { SmartCropping } from '../features/SmartCropping';
import { GreenScreenChromaKey } from '../features/GreenScreenChromaKey';
import { SpeedRamping, SpeedKeyframe } from '../features/SpeedRamping';

interface CropVariant {
  aspectRatio: string;
  enabled: boolean;
  focusPoint: { x: number; y: number };
  autoTrack: boolean;
}

interface ChromaKeySettings {
  enabled: boolean;
  color: string;
  tolerance: number;
  edgeSoftness: number;
  spillSuppression: number;
  backgroundUrl?: string;
}

interface SpecialEffectsStepProps {
  videoUrl: string;
  videoDuration?: number;
  currentTime?: number;
  onObjectRemovalChange?: (enabled: boolean, count: number) => void;
  onSpeedKeyframesChange?: (keyframes: SpeedKeyframe[]) => void;
  onChromaKeyChange?: (settings: ChromaKeySettings) => void;
}

export function SpecialEffectsStep({ 
  videoUrl, 
  videoDuration = 30, 
  currentTime = 0,
  onObjectRemovalChange,
  onSpeedKeyframesChange,
  onChromaKeyChange
}: SpecialEffectsStepProps) {
  const [removedObjects, setRemovedObjects] = useState<string[]>([]);
  const [cropVariants, setCropVariants] = useState<CropVariant[]>([]);
  const [chromaKeySettings, setChromaKeySettings] = useState<ChromaKeySettings>({
    enabled: false,
    color: '#00ff00',
    tolerance: 30,
    edgeSoftness: 2,
    spillSuppression: 50,
  });
  const [speedKeyframes, setSpeedKeyframes] = useState<SpeedKeyframe[]>([]);

  const handleChromaKeyChange = (settings: ChromaKeySettings) => {
    setChromaKeySettings(settings);
    onChromaKeyChange?.(settings);
  };

  const handleSpeedKeyframesChange = (keyframes: SpeedKeyframe[]) => {
    setSpeedKeyframes(keyframes);
    onSpeedKeyframesChange?.(keyframes);
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h3 className="text-lg font-semibold">Spezialeffekte</h3>
        <p className="text-sm text-muted-foreground">
          Erweiterte VFX-Tools für professionelle Bearbeitung
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

      {/* Green Screen & Speed Ramping */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 pt-6 border-t">
        <GreenScreenChromaKey
          videoUrl={videoUrl}
          settings={chromaKeySettings}
          onSettingsChange={handleChromaKeyChange}
        />
        <SpeedRamping
          videoDuration={videoDuration}
          keyframes={speedKeyframes}
          onKeyframesChange={handleSpeedKeyframesChange}
          currentTime={currentTime}
        />
      </div>
    </div>
  );
}
