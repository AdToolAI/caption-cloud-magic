import { useState } from 'react';
import { motion } from 'framer-motion';
import { Button } from '@/components/ui/button';
import { Slider } from '@/components/ui/slider';
import { Label } from '@/components/ui/label';
import { RotateCcw, Wand2, Palette, Sun, Contrast, Droplets, Focus, Thermometer, Circle } from 'lucide-react';
import { GlobalEffects, SceneEffects, SceneAnalysis, TransitionAssignment, AudioEnhancements, AVAILABLE_FILTERS } from '@/types/directors-cut';
import { AIColorGrading } from '../features/AIColorGrading';
import { StepLayoutWrapper } from '../ui/StepLayoutWrapper';
import { cn } from '@/lib/utils';

interface ColorCorrectionStepProps {
  effects: GlobalEffects;
  sceneEffects: Record<string, SceneEffects>;
  onEffectsChange: (effects: GlobalEffects) => void;
  onSceneEffectsChange: (sceneEffects: Record<string, SceneEffects>) => void;
  scenes: SceneAnalysis[];
  videoUrl: string;
  videoDuration: number;
  transitions: TransitionAssignment[];
  audio: AudioEnhancements;
  onColorGradingChange?: (enabled: boolean, grade: string | null) => void;
}

const SLIDERS: Array<{
  key: keyof GlobalEffects;
  label: string;
  icon: typeof Sun;
  min: number;
  max: number;
  default: number;
  unit: string;
  showSign?: boolean;
}> = [
  { key: 'brightness', label: 'Helligkeit', icon: Sun, min: 50, max: 150, default: 100, unit: '%' },
  { key: 'contrast', label: 'Kontrast', icon: Contrast, min: 50, max: 150, default: 100, unit: '%' },
  { key: 'saturation', label: 'Sättigung', icon: Droplets, min: 0, max: 200, default: 100, unit: '%' },
  { key: 'sharpness', label: 'Schärfe', icon: Focus, min: 0, max: 100, default: 0, unit: '' },
  { key: 'temperature', label: 'Temperatur', icon: Thermometer, min: -50, max: 50, default: 0, unit: '', showSign: true },
  { key: 'vignette', label: 'Vignette', icon: Circle, min: 0, max: 100, default: 0, unit: '%' },
];

export function ColorCorrectionStep({ 
  effects, 
  sceneEffects,
  onEffectsChange, 
  onSceneEffectsChange,
  scenes,
  videoUrl,
  videoDuration,
  transitions,
  audio,
  onColorGradingChange 
}: ColorCorrectionStepProps) {
  const [isAutoEnhancing, setIsAutoEnhancing] = useState(false);
  const [selectedGrade, setSelectedGrade] = useState<string | null>(null);
  const [gradeIntensity, setGradeIntensity] = useState(0.7);
  const [selectedSceneId, setSelectedSceneId] = useState<string | null>(null);

  // Get current effects based on selection (global or scene-specific)
  const getCurrentEffects = (): GlobalEffects => {
    if (selectedSceneId && sceneEffects[selectedSceneId]) {
      return { ...effects, ...sceneEffects[selectedSceneId] };
    }
    return effects;
  };

  const currentEffects = getCurrentEffects();

  const handleSliderChange = (key: string, value: number[]) => {
    if (selectedSceneId) {
      // Update scene-specific effects
      onSceneEffectsChange({
        ...sceneEffects,
        [selectedSceneId]: {
          ...sceneEffects[selectedSceneId],
          [key]: value[0],
        },
      });
    } else {
      // Update global effects
      onEffectsChange({ ...effects, [key]: value[0] });
    }
  };

  const handleReset = () => {
    const resetValues = {
      brightness: 100,
      contrast: 100,
      saturation: 100,
      sharpness: 0,
      temperature: 0,
      vignette: 0,
    };

    if (selectedSceneId) {
      // Reset scene-specific effects
      const newSceneEffects = { ...sceneEffects };
      delete newSceneEffects[selectedSceneId];
      onSceneEffectsChange(newSceneEffects);
    } else {
      // Reset global effects
      onEffectsChange({ ...effects, ...resetValues });
    }
  };

  const handleAutoEnhance = async () => {
    setIsAutoEnhancing(true);
    await new Promise(resolve => setTimeout(resolve, 1500));
    
    const enhancedValues = {
      brightness: 105,
      contrast: 110,
      saturation: 115,
      sharpness: 15,
    };

    if (selectedSceneId) {
      onSceneEffectsChange({
        ...sceneEffects,
        [selectedSceneId]: {
          ...sceneEffects[selectedSceneId],
          ...enhancedValues,
        },
      });
    } else {
      onEffectsChange({ ...effects, ...enhancedValues });
    }
    
    setIsAutoEnhancing(false);
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
      title="Farbkorrektur"
      description="Passe Helligkeit, Kontrast und Farben an"
      icon={Palette}
    >
      {/* Action Buttons */}
      <div className="flex gap-3 mb-6">
        <Button 
          variant="outline" 
          size="sm" 
          onClick={handleReset}
          className="backdrop-blur-sm bg-white/5 border-white/10 hover:bg-white/10"
        >
          <RotateCcw className="h-4 w-4 mr-2" />
          {selectedSceneId ? 'Szene zurücksetzen' : 'Alle zurücksetzen'}
        </Button>
        <Button 
          size="sm" 
          onClick={handleAutoEnhance}
          disabled={isAutoEnhancing}
          className="bg-gradient-to-r from-purple-500 to-pink-500 hover:from-purple-600 hover:to-pink-600 border-0"
        >
          <Wand2 className="h-4 w-4 mr-2" />
          {isAutoEnhancing ? 'Analysiere...' : 'AI Auto-Enhance'}
        </Button>
      </div>

      {/* Sliders Grid with Glassmorphism */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {SLIDERS.map((slider, index) => {
          const value = currentEffects[slider.key as keyof GlobalEffects] as number;
          const Icon = slider.icon;
          const isModified = value !== slider.default;
          
          return (
            <motion.div
              key={slider.key}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: index * 0.05 }}
              className={cn(
                "p-4 rounded-xl backdrop-blur-xl border transition-all duration-300",
                isModified 
                  ? "bg-primary/10 border-primary/30" 
                  : "bg-white/5 border-white/10 hover:bg-white/10"
              )}
            >
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <Icon className={cn(
                    "h-4 w-4",
                    isModified ? "text-primary" : "text-muted-foreground"
                  )} />
                  <Label className="text-sm font-medium">{slider.label}</Label>
                </div>
                <span className={cn(
                  "text-sm font-mono",
                  isModified ? "text-primary" : "text-muted-foreground"
                )}>
                  {slider.showSign && value > 0 ? '+' : ''}{value}{slider.unit}
                </span>
              </div>
              <Slider
                value={[value]}
                onValueChange={(v) => handleSliderChange(slider.key as keyof GlobalEffects, v)}
                min={slider.min}
                max={slider.max}
                step={1}
                className="mt-2"
              />
              {/* Visual indicator for default */}
              {slider.default !== slider.min && slider.default !== slider.max && (
                <div 
                  className="relative h-1 mt-1"
                  style={{
                    marginLeft: `${((slider.default - slider.min) / (slider.max - slider.min)) * 100}%`,
                  }}
                >
                  <div className="absolute w-0.5 h-2 bg-muted-foreground/30 -translate-x-1/2 -top-1" />
                </div>
              )}
            </motion.div>
          );
        })}
      </div>

      {/* AI Color Grading Section */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.4 }}
        className="mt-8 p-6 rounded-2xl backdrop-blur-xl bg-white/5 border border-white/10"
      >
        <AIColorGrading
          selectedGrade={selectedGrade}
          gradeIntensity={gradeIntensity}
          onGradeSelect={(grade) => {
            setSelectedGrade(grade);
            onColorGradingChange?.(!!grade, grade);
          }}
          onIntensityChange={setGradeIntensity}
          videoUrl={videoUrl}
        />
      </motion.div>
    </StepLayoutWrapper>
  );
}
