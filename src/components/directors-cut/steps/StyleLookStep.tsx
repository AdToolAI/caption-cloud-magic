import { useState } from 'react';
import { motion } from 'framer-motion';
import { Wand2 } from 'lucide-react';
import { GlobalEffects, SceneEffects, SceneAnalysis, TransitionAssignment, AudioEnhancements, FilterId } from '@/types/directors-cut';
import { AIStyleTransfer } from '../features/AIStyleTransfer';
import { StepLayoutWrapper } from '../ui/StepLayoutWrapper';

interface StyleLookStepProps {
  effects: GlobalEffects;
  sceneEffects: Record<string, SceneEffects>;
  onEffectsChange: (effects: GlobalEffects) => void;
  onSceneEffectsChange: (sceneEffects: Record<string, SceneEffects>) => void;
  scenes: SceneAnalysis[];
  videoUrl: string;
  videoDuration: number;
  transitions: TransitionAssignment[];
  audio: AudioEnhancements;
  onStyleTransferChange?: (enabled: boolean, style: string | null) => void;
}

export function StyleLookStep({ 
  effects, 
  sceneEffects,
  onEffectsChange,
  onSceneEffectsChange,
  scenes,
  videoUrl,
  videoDuration,
  transitions,
  audio,
  onStyleTransferChange 
}: StyleLookStepProps) {
  const [selectedStyle, setSelectedStyle] = useState<string | null>(null);
  const [styleIntensity, setStyleIntensity] = useState(0.8);
  const [selectedSceneId, setSelectedSceneId] = useState<string | null>(null);

  // Get current filter based on selection
  const getCurrentFilter = (): string | undefined => {
    if (selectedSceneId && sceneEffects[selectedSceneId]?.filter) {
      return sceneEffects[selectedSceneId].filter;
    }
    return effects.filter;
  };

  const currentFilter = getCurrentFilter();

  const handleFilterSelect = (filterId: FilterId) => {
    if (selectedSceneId) {
      // Apply to specific scene
      onSceneEffectsChange({
        ...sceneEffects,
        [selectedSceneId]: {
          ...sceneEffects[selectedSceneId],
          filter: filterId === 'none' ? undefined : filterId,
        },
      });
    } else {
      // Apply globally
      onEffectsChange({ ...effects, filter: filterId === 'none' ? undefined : filterId });
    }
  };

  return (
    <StepLayoutWrapper
      videoUrl={videoUrl}
      videoDuration={videoDuration}
      scenes={scenes}
      selectedSceneId={selectedSceneId}
      onSceneSelect={setSelectedSceneId}
      globalEffects={effects}
      sceneEffects={sceneEffects}
      transitions={transitions}
      audio={audio}
      title="Style & Look"
      description="Wähle Filter und Stile für dein Video"
      icon={Wand2}
    >
      {/* Combined AI Style Transfer + Filter Selection with Split-View */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="p-5 rounded-2xl backdrop-blur-xl bg-white/5 border border-white/10"
      >
        <AIStyleTransfer
          selectedStyle={selectedStyle}
          styleIntensity={styleIntensity}
          onStyleSelect={(style) => {
            setSelectedStyle(style);
            onStyleTransferChange?.(!!style, style);
          }}
          onIntensityChange={setStyleIntensity}
          videoUrl={videoUrl}
          // Pass filter props for integrated view
          currentFilter={currentFilter}
          onFilterSelect={handleFilterSelect}
          selectedSceneId={selectedSceneId}
          scenesCount={scenes.length}
        />
      </motion.div>
    </StepLayoutWrapper>
  );
}