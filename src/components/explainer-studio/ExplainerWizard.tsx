import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Check, FileText, Image, Play, Music, Download, Sparkles } from 'lucide-react';
import { cn } from '@/lib/utils';
import { BriefingStep } from './steps/BriefingStep';
import { ScriptStep } from './steps/ScriptStep';
import { VisualsStep } from './steps/VisualsStep';
import { AnimationStep, type AnimationConfig } from './steps/AnimationStep';
import { AudioStep, type AudioConfig } from './steps/AudioStep';
import { ExportStep } from './steps/ExportStep';
import type { ExplainerProject, ExplainerBriefing, ExplainerScript, GeneratedAsset } from '@/types/explainer-studio';

const STEPS = [
  { id: 'briefing', label: 'Briefing', icon: FileText, description: 'Produkt & Zielgruppe' },
  { id: 'script', label: 'Drehbuch', icon: Sparkles, description: 'KI-generiert' },
  { id: 'visuals', label: 'Visuals', icon: Image, description: 'Assets generieren' },
  { id: 'animation', label: 'Animation', icon: Play, description: 'Bewegung & Übergänge' },
  { id: 'audio', label: 'Audio', icon: Music, description: 'Voice-Over & Musik' },
  { id: 'export', label: 'Export', icon: Download, description: 'Rendern & Download' },
];

interface ExplainerWizardProps {
  project?: ExplainerProject;
  onProjectUpdate?: (project: ExplainerProject) => void;
}

export function ExplainerWizard({ project, onProjectUpdate }: ExplainerWizardProps) {
  const [currentStep, setCurrentStep] = useState(0);
  const [briefing, setBriefing] = useState<ExplainerBriefing | null>(project?.briefing || null);
  const [script, setScript] = useState<ExplainerScript | null>(project?.script || null);
  const [assets, setAssets] = useState<GeneratedAsset[]>(project?.assets || []);
  const [animationConfig, setAnimationConfig] = useState<AnimationConfig | null>(null);
  const [audioConfig, setAudioConfig] = useState<AudioConfig | null>(null);

  const canProceed = () => {
    switch (currentStep) {
      case 0: // Briefing
        return briefing !== null && 
               briefing.productDescription.length >= 20 &&
               briefing.targetAudience.length > 0;
      case 1: // Script
        return script !== null && script.scenes.length > 0;
      case 2: // Visuals
        return assets.length >= (script?.scenes.length || 0);
      case 3: // Animation
        return animationConfig !== null;
      case 4: // Audio
        return audioConfig !== null && audioConfig.voiceoverUrl !== null;
      case 5: // Export
        return true;
      default:
        return false;
    }
  };

  const handleNext = () => {
    if (currentStep < STEPS.length - 1 && canProceed()) {
      setCurrentStep(currentStep + 1);
    }
  };

  const handleBack = () => {
    if (currentStep > 0) {
      setCurrentStep(currentStep - 1);
    }
  };

  const handleBriefingComplete = (newBriefing: ExplainerBriefing) => {
    setBriefing(newBriefing);
    handleNext();
  };

  const handleScriptComplete = (newScript: ExplainerScript) => {
    setScript(newScript);
    handleNext();
  };

  const handleVisualsComplete = (newAssets: GeneratedAsset[]) => {
    setAssets(newAssets);
    handleNext();
  };

  const handleAnimationComplete = (config: AnimationConfig) => {
    setAnimationConfig(config);
    handleNext();
  };

  const handleAudioComplete = (config: AudioConfig) => {
    setAudioConfig(config);
    handleNext();
  };

  return (
    <div className="max-w-7xl mx-auto">
      {/* Stepper */}
      <div className="mb-8 overflow-x-auto pb-2">
        <div className="flex items-center justify-between min-w-max gap-2">
          {STEPS.map((step, index) => {
            const Icon = step.icon;
            const isActive = index === currentStep;
            const isCompleted = index < currentStep;

            return (
              <div key={step.id} className="flex items-center">
                <motion.button
                  onClick={() => index < currentStep && setCurrentStep(index)}
                  disabled={index > currentStep}
                  className={cn(
                    'flex items-center gap-2 px-4 py-2.5 rounded-xl transition-all duration-300',
                    'border backdrop-blur-sm',
                    isActive && 'bg-primary/20 border-primary/50 text-primary shadow-[0_0_20px_rgba(245,199,106,0.3)]',
                    isCompleted && 'bg-primary/10 border-primary/30 text-primary cursor-pointer hover:bg-primary/20',
                    !isActive && !isCompleted && 'bg-muted/20 border-white/10 text-muted-foreground'
                  )}
                  whileHover={isCompleted ? { scale: 1.02 } : {}}
                  whileTap={isCompleted ? { scale: 0.98 } : {}}
                >
                  <div className={cn(
                    'w-8 h-8 rounded-lg flex items-center justify-center',
                    isActive && 'bg-primary text-primary-foreground',
                    isCompleted && 'bg-primary/30 text-primary',
                    !isActive && !isCompleted && 'bg-muted/30 text-muted-foreground'
                  )}>
                    {isCompleted ? (
                      <Check className="h-4 w-4" />
                    ) : (
                      <Icon className="h-4 w-4" />
                    )}
                  </div>
                  <div className="hidden lg:block text-left">
                    <div className="text-sm font-medium">{step.label}</div>
                    <div className="text-xs text-muted-foreground">{step.description}</div>
                  </div>
                </motion.button>
                {index < STEPS.length - 1 && (
                  <div
                    className={cn(
                      'h-px w-6 lg:w-10 mx-1',
                      isCompleted ? 'bg-primary' : 'bg-border'
                    )}
                  />
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Step Content */}
      <AnimatePresence mode="wait">
        <motion.div
          key={currentStep}
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -20 }}
          transition={{ duration: 0.3 }}
        >
          {currentStep === 0 && (
            <BriefingStep
              initialBriefing={briefing}
              onComplete={handleBriefingComplete}
            />
          )}
          {currentStep === 1 && briefing && (
            <ScriptStep
              briefing={briefing}
              initialScript={script}
              onComplete={handleScriptComplete}
              onBack={handleBack}
            />
          )}
          {currentStep === 2 && briefing && script && (
            <VisualsStep
              briefing={briefing}
              script={script}
              initialAssets={assets}
              onComplete={handleVisualsComplete}
              onBack={handleBack}
            />
          )}
          {currentStep === 3 && briefing && script && assets.length > 0 && (
            <AnimationStep
              briefing={briefing}
              script={script}
              assets={assets}
              onComplete={handleAnimationComplete}
              onBack={handleBack}
            />
          )}
          {currentStep === 4 && briefing && script && (
            <AudioStep
              briefing={briefing}
              script={script}
              onComplete={handleAudioComplete}
              onBack={handleBack}
            />
          )}
          {currentStep === 5 && briefing && script && assets.length > 0 && animationConfig && audioConfig && (
            <ExportStep
              briefing={briefing}
              script={script}
              assets={assets}
              animationConfig={animationConfig}
              audioConfig={audioConfig}
              onBack={handleBack}
            />
          )}
        </motion.div>
      </AnimatePresence>
    </div>
  );
}
