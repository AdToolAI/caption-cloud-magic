import { useState } from 'react';
import { GreenScreenChromaKey } from '../features/GreenScreenChromaKey';
import { SpeedRamping, SpeedKeyframe } from '../features/SpeedRamping';

interface ChromaKeySettings {
  enabled: boolean;
  color: string;
  tolerance: number;
  edgeSoftness: number;
  spillSuppression: number;
  backgroundUrl?: string;
}

interface MotionEffectsStepProps {
  videoUrl: string;
  videoDuration?: number;
  currentTime?: number;
  onSpeedKeyframesChange?: (keyframes: SpeedKeyframe[]) => void;
  onChromaKeyChange?: (settings: ChromaKeySettings) => void;
}

export function MotionEffectsStep({ 
  videoUrl, 
  videoDuration = 30, 
  currentTime = 0,
  onSpeedKeyframesChange,
  onChromaKeyChange
}: MotionEffectsStepProps) {
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
        <h3 className="text-lg font-semibold">Motion & Keying</h3>
        <p className="text-sm text-muted-foreground">
          Green Screen und dynamische Geschwindigkeitseffekte
        </p>
      </div>

      {/* Green Screen & Speed Ramping */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
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
