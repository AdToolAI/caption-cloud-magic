import { useState } from 'react';
import { AIVideoUpscaling } from '../features/AIVideoUpscaling';
import { AIFrameInterpolation } from '../features/AIFrameInterpolation';
import { AIVideoRestoration } from '../features/AIVideoRestoration';
import { StepLayoutWrapper } from '../ui/StepLayoutWrapper';
import { Sparkles } from 'lucide-react';
import type { SceneAnalysis, GlobalEffects, SceneEffects, TransitionAssignment, AudioEnhancements } from '@/types/directors-cut';

interface QualityEnhancementStepProps {
  videoUrl?: string;
  videoDuration?: number;
  scenes?: SceneAnalysis[];
  globalEffects?: GlobalEffects;
  sceneEffects?: Record<string, SceneEffects>;
  transitions?: TransitionAssignment[];
  audio?: AudioEnhancements;
  onUpscalingChange?: (enabled: boolean, resolution: string) => void;
  onInterpolationChange?: (enabled: boolean, fps: number) => void;
  onRestorationChange?: (enabled: boolean, level: string) => void;
  // Color Grading Props
  colorGrading?: { enabled: boolean; grade: string | null; intensity?: number };
  sceneColorGrading?: Record<string, { grade?: string | null; intensity?: number }>;
}

export function QualityEnhancementStep({ 
  videoUrl,
  videoDuration = 30,
  scenes = [],
  globalEffects,
  sceneEffects = {},
  transitions = [],
  audio,
  onUpscalingChange,
  onInterpolationChange,
  onRestorationChange,
  colorGrading,
  sceneColorGrading,
}: QualityEnhancementStepProps) {
  const [selectedSceneId, setSelectedSceneId] = useState<string | undefined>();
  
  const [upscalingSettings, setUpscalingSettings] = useState({
    enabled: false,
    targetResolution: '4k' as '2k' | '4k' | '8k',
    enhanceDetails: true,
    denoiseStrength: 30,
    sharpnessBoost: 20,
  });
  
  const [interpolationSettings, setInterpolationSettings] = useState({
    enabled: false,
    targetFps: 60 as 60 | 120 | 240,
    motionSmoothing: 50,
    preserveMotionBlur: true,
    slowMotionFactor: 1,
  });
  
  const [restorationSettings, setRestorationSettings] = useState({
    enabled: false,
    removeGrain: false,
    grainStrength: 50,
    removeScratches: false,
    scratchDetection: 50,
    stabilizeFootage: false,
    stabilizationStrength: 50,
    colorCorrection: false,
    enhanceFaces: false,
    deinterlace: false,
  });

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
      title="KI-Qualität"
      description="Verbessere Auflösung, Framerate und Bildqualität mit KI"
      icon={Sparkles}
      showSceneSelector={false}
      colorGrading={colorGrading}
      sceneColorGrading={sceneColorGrading}
    >
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <AIVideoUpscaling
          videoUrl={videoUrl}
          settings={upscalingSettings}
          onSettingsChange={(settings) => {
            setUpscalingSettings(settings);
            onUpscalingChange?.(settings.enabled, settings.targetResolution);
          }}
        />
        <AIFrameInterpolation
          videoUrl={videoUrl}
          settings={interpolationSettings}
          onSettingsChange={(settings) => {
            setInterpolationSettings(settings);
            onInterpolationChange?.(settings.enabled, settings.targetFps);
          }}
        />
        <AIVideoRestoration
          videoUrl={videoUrl}
          settings={restorationSettings}
          onSettingsChange={(settings) => {
            setRestorationSettings(settings);
            onRestorationChange?.(settings.enabled, settings.enabled ? 'standard' : '');
          }}
        />
      </div>
    </StepLayoutWrapper>
  );
}
