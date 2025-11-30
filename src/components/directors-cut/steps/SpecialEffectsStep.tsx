import { useState } from 'react';
import { Zap } from 'lucide-react';
import { TextOverlayEditor } from '../features/TextOverlayEditor';
import { SmartCropping } from '../features/SmartCropping';
import { StepLayoutWrapper } from '../ui/StepLayoutWrapper';
import type { 
  TextOverlay, 
  SceneAnalysis, 
  GlobalEffects, 
  SceneEffects, 
  TransitionAssignment, 
  AudioEnhancements 
} from '@/types/directors-cut';

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
  // Props for StepLayoutWrapper
  scenes?: SceneAnalysis[];
  selectedSceneId?: string | null;
  onSceneSelect?: (sceneId: string | null) => void;
  globalEffects?: GlobalEffects;
  sceneEffects?: Record<string, SceneEffects>;
  transitions?: TransitionAssignment[];
  audio?: AudioEnhancements;
}

export function SpecialEffectsStep({ 
  videoUrl, 
  videoDuration = 30, 
  currentTime = 0,
  textOverlays = [],
  onTextOverlaysChange,
  scenes = [],
  selectedSceneId = null,
  onSceneSelect = () => {},
  globalEffects = {
    brightness: 100,
    contrast: 100,
    saturation: 100,
    sharpness: 0,
    temperature: 0,
    vignette: 0,
  },
  sceneEffects = {},
  transitions = [],
  audio = {
    master_volume: 100,
    noise_reduction: false,
    noise_reduction_level: 50,
    auto_ducking: false,
    ducking_level: 30,
    voice_enhancement: false,
    added_sounds: [],
  },
}: SpecialEffectsStepProps) {
  const [cropVariants, setCropVariants] = useState<CropVariant[]>([]);

  return (
    <StepLayoutWrapper
      videoUrl={videoUrl}
      videoDuration={videoDuration}
      scenes={scenes}
      selectedSceneId={selectedSceneId}
      onSceneSelect={onSceneSelect}
      globalEffects={globalEffects}
      sceneEffects={sceneEffects}
      transitions={transitions}
      audio={audio}
      title="Spezialeffekte"
      description="Text-Overlays und Smart Cropping"
      icon={Zap}
      showSceneSelector={false}
      textOverlays={textOverlays}
    >
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
    </StepLayoutWrapper>
  );
}
