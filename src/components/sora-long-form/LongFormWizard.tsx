import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Check, Clock, Film, Wand2, Settings, Play, Download } from 'lucide-react';
import { cn } from '@/lib/utils';
import { FormatStep } from './FormatStep';
import { ScriptGeneratorStep } from './ScriptGeneratorStep';
import { SceneConfigurator } from './SceneConfigurator';
import { SceneGenerationProgress } from './SceneGenerationProgress';
import { TransitionEditor } from './TransitionEditor';
import { FinalExport } from './FinalExport';
import type { Sora2LongFormProject, Sora2Scene } from '@/types/sora-long-form';

interface LongFormWizardProps {
  project: Sora2LongFormProject;
  scenes: Sora2Scene[];
  onUpdateProject: (updates: Partial<Sora2LongFormProject>) => Promise<void>;
  onUpdateScenes: (scenes: Sora2Scene[]) => Promise<void>;
}

const STEPS = [
  { id: 'format', label: 'Format', icon: Clock },
  { id: 'script', label: 'Skript', icon: Wand2 },
  { id: 'scenes', label: 'Szenen', icon: Film },
  { id: 'generate', label: 'Generieren', icon: Play },
  { id: 'transitions', label: 'Übergänge', icon: Settings },
  { id: 'export', label: 'Export', icon: Download },
];

export function LongFormWizard({
  project,
  scenes,
  onUpdateProject,
  onUpdateScenes,
}: LongFormWizardProps) {
  const [currentStep, setCurrentStep] = useState(0);

  const canProceed = () => {
    switch (currentStep) {
      case 0: // Format
        return true;
      case 1: // Script
        return scenes.length > 0;
      case 2: // Scenes
        return scenes.every(s => s.prompt.trim().length > 0);
      case 3: // Generate
        return scenes.every(s => s.status === 'completed');
      case 4: // Transitions
        return true;
      case 5: // Export
        return project.final_video_url !== undefined;
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

  return (
    <div className="max-w-6xl mx-auto">
      {/* Stepper */}
      <div className="mb-8">
        <div className="flex items-center justify-between">
          {STEPS.map((step, index) => {
            const Icon = step.icon;
            const isActive = index === currentStep;
            const isCompleted = index < currentStep;

            return (
              <div
                key={step.id}
                className="flex items-center"
              >
                <button
                  onClick={() => index < currentStep && setCurrentStep(index)}
                  disabled={index > currentStep}
                  className={cn(
                    'flex items-center gap-2 px-4 py-2 rounded-full transition-all',
                    isActive && 'bg-primary text-primary-foreground',
                    isCompleted && 'bg-primary/20 text-primary cursor-pointer hover:bg-primary/30',
                    !isActive && !isCompleted && 'bg-muted text-muted-foreground'
                  )}
                >
                  {isCompleted ? (
                    <Check className="h-4 w-4" />
                  ) : (
                    <Icon className="h-4 w-4" />
                  )}
                  <span className="hidden sm:inline text-sm font-medium">{step.label}</span>
                </button>
                {index < STEPS.length - 1 && (
                  <div
                    className={cn(
                      'h-px w-8 mx-2',
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
          initial={{ opacity: 0, x: 20 }}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0, x: -20 }}
          transition={{ duration: 0.3 }}
        >
          {currentStep === 0 && (
            <FormatStep
              project={project}
              onUpdate={onUpdateProject}
              onNext={handleNext}
            />
          )}
          {currentStep === 1 && (
            <ScriptGeneratorStep
              project={project}
              scenes={scenes}
              onUpdateProject={onUpdateProject}
              onUpdateScenes={onUpdateScenes}
              onNext={handleNext}
              onBack={handleBack}
            />
          )}
          {currentStep === 2 && (
            <SceneConfigurator
              project={project}
              scenes={scenes}
              onUpdateScenes={onUpdateScenes}
              onNext={handleNext}
              onBack={handleBack}
            />
          )}
          {currentStep === 3 && (
            <SceneGenerationProgress
              project={project}
              scenes={scenes}
              onUpdateScenes={onUpdateScenes}
              onUpdateProject={onUpdateProject}
              onNext={handleNext}
              onBack={handleBack}
            />
          )}
          {currentStep === 4 && (
            <TransitionEditor
              project={project}
              scenes={scenes}
              onUpdateScenes={onUpdateScenes}
              onNext={handleNext}
              onBack={handleBack}
            />
          )}
          {currentStep === 5 && (
            <FinalExport
              project={project}
              scenes={scenes}
              onUpdateProject={onUpdateProject}
              onBack={handleBack}
            />
          )}
        </motion.div>
      </AnimatePresence>
    </div>
  );
}
