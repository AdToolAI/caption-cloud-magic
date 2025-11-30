import { useState } from 'react';
import { KenBurnsEffect, KenBurnsKeyframe } from '../features/KenBurnsEffect';
import { SpeedRamping, SpeedKeyframe } from '../features/SpeedRamping';

interface MotionEffectsStepProps {
  videoUrl: string;
  videoDuration?: number;
  currentTime?: number;
  selectedSceneId?: string;
  onSpeedKeyframesChange?: (keyframes: SpeedKeyframe[]) => void;
  onKenBurnsChange?: (keyframes: KenBurnsKeyframe[]) => void;
}

export function MotionEffectsStep({ 
  videoUrl, 
  videoDuration = 30, 
  currentTime = 0,
  selectedSceneId,
  onSpeedKeyframesChange,
  onKenBurnsChange
}: MotionEffectsStepProps) {
  const [kenBurnsKeyframes, setKenBurnsKeyframes] = useState<KenBurnsKeyframe[]>([]);
  const [speedKeyframes, setSpeedKeyframes] = useState<SpeedKeyframe[]>([]);

  const handleKenBurnsChange = (keyframes: KenBurnsKeyframe[]) => {
    setKenBurnsKeyframes(keyframes);
    onKenBurnsChange?.(keyframes);
  };

  const handleSpeedKeyframesChange = (keyframes: SpeedKeyframe[]) => {
    setSpeedKeyframes(keyframes);
    onSpeedKeyframesChange?.(keyframes);
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h3 className="text-lg font-semibold">Motion & Kamera</h3>
        <p className="text-sm text-muted-foreground">
          Ken Burns Effekt und dynamische Geschwindigkeitseffekte
        </p>
      </div>

      {/* Ken Burns & Speed Ramping */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <KenBurnsEffect
          keyframes={kenBurnsKeyframes}
          onKeyframesChange={handleKenBurnsChange}
          selectedSceneId={selectedSceneId}
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

export type { KenBurnsKeyframe };
