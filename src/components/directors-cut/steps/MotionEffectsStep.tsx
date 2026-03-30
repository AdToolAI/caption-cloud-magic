import { useState } from 'react';
import { Play } from 'lucide-react';
import { KenBurnsEffect, KenBurnsKeyframe } from '../features/KenBurnsEffect';
import { SpeedRamping, SpeedKeyframe } from '../features/SpeedRamping';
import { StepLayoutWrapper } from '../ui/StepLayoutWrapper';
import type { 
  SceneAnalysis, 
  GlobalEffects, 
  SceneEffects, 
  TransitionAssignment,
  AudioEnhancements,
  TextOverlay 
} from '@/types/directors-cut';

interface MotionEffectsStepProps {
  videoUrl: string;
  videoDuration?: number;
  currentTime?: number;
  scenes: SceneAnalysis[];
  globalEffects: GlobalEffects;
  sceneEffects: Record<string, SceneEffects>;
  transitions: TransitionAssignment[];
  audio: AudioEnhancements;
  onSpeedKeyframesChange?: (keyframes: SpeedKeyframe[]) => void;
  onKenBurnsChange?: (keyframes: KenBurnsKeyframe[]) => void;
  // Controlled state from parent
  initialSpeedKeyframes?: SpeedKeyframe[];
  initialKenBurnsKeyframes?: KenBurnsKeyframe[];
  // Color Grading Props
  colorGrading?: { enabled: boolean; grade: string | null; intensity?: number };
  sceneColorGrading?: Record<string, { grade?: string | null; intensity?: number }>;
  // Text Overlays
  textOverlays?: TextOverlay[];
}

export function MotionEffectsStep({ 
  videoUrl, 
  videoDuration = 30, 
  currentTime = 0,
  scenes,
  globalEffects,
  sceneEffects,
  transitions,
  audio,
  onSpeedKeyframesChange,
  onKenBurnsChange,
  initialSpeedKeyframes,
  initialKenBurnsKeyframes,
  colorGrading,
  sceneColorGrading,
  textOverlays = [],
}: MotionEffectsStepProps) {
  const [selectedSceneId, setSelectedSceneId] = useState<string | null>(null);
  const [kenBurnsKeyframes, setKenBurnsKeyframes] = useState<KenBurnsKeyframe[]>(initialKenBurnsKeyframes ?? []);
  const [speedKeyframes, setSpeedKeyframes] = useState<SpeedKeyframe[]>(initialSpeedKeyframes ?? []);

  const handleKenBurnsChange = (keyframes: KenBurnsKeyframe[]) => {
    setKenBurnsKeyframes(keyframes);
    onKenBurnsChange?.(keyframes);
  };

  const handleSpeedKeyframesChange = (keyframes: SpeedKeyframe[]) => {
    setSpeedKeyframes(keyframes);
    onSpeedKeyframesChange?.(keyframes);
  };

  return (
    <StepLayoutWrapper
      videoUrl={videoUrl}
      videoDuration={videoDuration}
      scenes={scenes}
      selectedSceneId={selectedSceneId}
      onSceneSelect={setSelectedSceneId}
      globalEffects={globalEffects}
      sceneEffects={sceneEffects}
      transitions={transitions}
      audio={audio}
      title="Motion & Kamera"
      description="Ken Burns Effekt und dynamische Geschwindigkeitseffekte"
      icon={Play}
      speedKeyframes={speedKeyframes.map(k => ({ time: k.time, speed: k.speed, sceneId: k.sceneId }))}
      kenBurns={kenBurnsKeyframes}
      colorGrading={colorGrading}
      sceneColorGrading={sceneColorGrading}
      textOverlays={textOverlays}
    >
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <KenBurnsEffect
          keyframes={kenBurnsKeyframes}
          onKeyframesChange={handleKenBurnsChange}
          selectedSceneId={selectedSceneId || undefined}
        />
        <SpeedRamping
          videoDuration={videoDuration}
          keyframes={speedKeyframes}
          onKeyframesChange={handleSpeedKeyframesChange}
          currentTime={currentTime}
          selectedSceneId={selectedSceneId || undefined}
          sceneDuration={
            selectedSceneId 
              ? scenes.find(s => s.id === selectedSceneId)?.end_time - 
                (scenes.find(s => s.id === selectedSceneId)?.start_time || 0)
              : undefined
          }
        />
      </div>
    </StepLayoutWrapper>
  );
}

export type { KenBurnsKeyframe };
