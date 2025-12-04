import { useState } from 'react';
import { Mic } from 'lucide-react';
import { AIVoiceOver } from '../features/AIVoiceOver';
import { StepLayoutWrapper } from '../ui/StepLayoutWrapper';
import type { KenBurnsKeyframe } from '../features/KenBurnsEffect';
import type { 
  SceneAnalysis, 
  GlobalEffects, 
  SceneEffects, 
  TransitionAssignment,
  AudioEnhancements,
  TextOverlay 
} from '@/types/directors-cut';

interface VoiceOverStepProps {
  onVoiceOverGenerated?: (url: string) => void;
  // Video Preview Props
  videoUrl?: string;
  videoDuration?: number;
  scenes?: SceneAnalysis[];
  globalEffects?: GlobalEffects;
  sceneEffects?: Record<string, SceneEffects>;
  transitions?: TransitionAssignment[];
  audio?: AudioEnhancements;
  textOverlays?: TextOverlay[];
  colorGrading?: { enabled: boolean; grade: string | null; intensity?: number };
  sceneColorGrading?: Record<string, { grade?: string | null; intensity?: number }>;
  speedKeyframes?: Array<{ time: number; speed: number; sceneId?: string }>;
  kenBurns?: KenBurnsKeyframe[];
}

export function VoiceOverStep({ 
  onVoiceOverGenerated,
  videoUrl = '',
  videoDuration = 30,
  scenes = [],
  globalEffects = { 
    filter: undefined, 
    brightness: 100, 
    contrast: 100, 
    saturation: 100, 
    sharpness: 0, 
    temperature: 0, 
    vignette: 0 
  },
  sceneEffects = {},
  transitions = [],
  audio = { 
    master_volume: 100, 
    noise_reduction: false, 
    noise_reduction_level: 0, 
    auto_ducking: false, 
    ducking_level: 0, 
    voice_enhancement: false, 
    added_sounds: [] 
  },
  textOverlays = [],
  colorGrading,
  sceneColorGrading,
  speedKeyframes,
  kenBurns,
}: VoiceOverStepProps) {
  const [selectedSceneId, setSelectedSceneId] = useState<string | null>(null);
  const [generatedVoiceOverUrl, setGeneratedVoiceOverUrl] = useState<string | undefined>(undefined);
  const [voiceOverSettings, setVoiceOverSettings] = useState({
    enabled: false,
    scriptText: '',
    voiceId: 'sarah',
    language: 'de-DE',
    speed: 1,
    pitch: 0,
    volume: 80,
    emotionalTone: 'neutral' as 'neutral' | 'enthusiastic' | 'calm' | 'serious' | 'friendly',
  });

  const handleVoiceOverGenerated = (url: string) => {
    setGeneratedVoiceOverUrl(url);
    onVoiceOverGenerated?.(url);
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
      title="KI Voice-Over"
      description="Generiere professionelle Sprachaufnahmen mit KI"
      icon={Mic}
      showSceneSelector={false}
      textOverlays={textOverlays}
      colorGrading={colorGrading}
      sceneColorGrading={sceneColorGrading}
      speedKeyframes={speedKeyframes}
      kenBurns={kenBurns}
      voiceoverUrl={generatedVoiceOverUrl}
    >
      <AIVoiceOver
        settings={voiceOverSettings}
        onSettingsChange={setVoiceOverSettings}
        onVoiceOverGenerated={handleVoiceOverGenerated}
      />
    </StepLayoutWrapper>
  );
}
