import { useState } from 'react';
import { motion } from 'framer-motion';
import { Badge } from '@/components/ui/badge';
import { Sparkles, Wand2, Check } from 'lucide-react';
import { GlobalEffects, SceneEffects, SceneAnalysis, TransitionAssignment, AudioEnhancements, AVAILABLE_FILTERS, FilterId } from '@/types/directors-cut';
import { AIStyleTransfer } from '../features/AIStyleTransfer';
import { StepLayoutWrapper } from '../ui/StepLayoutWrapper';
import { cn } from '@/lib/utils';

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
  const [hoveredFilter, setHoveredFilter] = useState<FilterId | null>(null);

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
      description="Wähle einen visuellen Stil für dein Video"
      icon={Wand2}
    >
      {/* Filter/LUT Selection */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="p-6 rounded-2xl backdrop-blur-xl bg-white/5 border border-white/10"
      >
        <div className="flex items-center gap-2 mb-4">
          <Sparkles className="h-5 w-5 text-primary" />
          <h4 className="font-semibold">Filter & LUTs</h4>
          {currentFilter && currentFilter !== 'none' && (
            <Badge variant="secondary" className="ml-auto">
              {AVAILABLE_FILTERS.find(f => f.id === currentFilter)?.name}
            </Badge>
          )}
        </div>
        
        <div className="grid grid-cols-4 sm:grid-cols-5 md:grid-cols-6 lg:grid-cols-8 gap-3">
          {AVAILABLE_FILTERS.map((filter, index) => {
            const isSelected = currentFilter === filter.id || (filter.id === 'none' && !currentFilter);
            const isHovered = hoveredFilter === filter.id;
            
            return (
              <motion.button
                key={filter.id}
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ delay: index * 0.03 }}
                whileHover={{ scale: 1.05, y: -4 }}
                whileTap={{ scale: 0.95 }}
                onClick={() => handleFilterSelect(filter.id)}
                onMouseEnter={() => setHoveredFilter(filter.id)}
                onMouseLeave={() => setHoveredFilter(null)}
                className={cn(
                  "relative aspect-square rounded-xl overflow-hidden transition-all duration-300",
                  "backdrop-blur-sm border-2",
                  isSelected
                    ? "border-primary ring-2 ring-primary/30 shadow-lg shadow-primary/20"
                    : "border-white/10 hover:border-white/30"
                )}
              >
                {/* Filter Preview Background */}
                <div 
                  className="absolute inset-0 bg-gradient-to-br from-gray-600 to-gray-800"
                  style={{ filter: filter.preview || 'none' }}
                />
                
                {/* Glassmorphism overlay */}
                <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/20 to-transparent" />
                
                {/* Filter Name */}
                <span className="absolute bottom-1.5 left-0 right-0 text-[10px] text-white text-center font-medium drop-shadow-lg">
                  {filter.name}
                </span>
                
                {/* Selection Indicator */}
                {isSelected && (
                  <motion.div
                    initial={{ scale: 0 }}
                    animate={{ scale: 1 }}
                    className="absolute top-1.5 right-1.5 w-5 h-5 rounded-full bg-primary flex items-center justify-center"
                  >
                    <Check className="h-3 w-3 text-primary-foreground" />
                  </motion.div>
                )}
                
                {/* Hover glow effect */}
                {isHovered && !isSelected && (
                  <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    className="absolute inset-0 bg-primary/10 pointer-events-none"
                  />
                )}
              </motion.button>
            );
          })}
        </div>
        
        {/* Scope indicator */}
        <p className="text-xs text-muted-foreground mt-4">
          {selectedSceneId 
            ? `Filter wird auf Szene ${scenes.findIndex(s => s.id === selectedSceneId) + 1} angewendet`
            : "Filter wird auf das gesamte Video angewendet"
          }
        </p>
      </motion.div>

      {/* AI Style Transfer Section */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.2 }}
        className="mt-6 p-6 rounded-2xl backdrop-blur-xl bg-white/5 border border-white/10"
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
        />
      </motion.div>
    </StepLayoutWrapper>
  );
}
