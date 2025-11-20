import { useState } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { ArrowLeft, ArrowRight } from 'lucide-react';
import { TemplateSelectionStep } from './steps/TemplateSelectionStep';
import { CustomizationStep } from './steps/CustomizationStep';
import { ExportStep } from './steps/ExportStep';
import type { ContentTemplate } from '@/types/content-studio';

interface UniversalVideoCreatorProps {
  contentType: 'ad' | 'story' | 'reel';
}

interface WizardStep {
  id: 'template' | 'customize' | 'export';
  title: string;
  component: React.ComponentType<any>;
}

const WIZARD_STEPS: WizardStep[] = [
  { id: 'template', title: 'Template wählen', component: TemplateSelectionStep },
  { id: 'customize', title: 'Anpassen', component: CustomizationStep },
  { id: 'export', title: 'Exportieren & Rendern', component: ExportStep }
];

export const UniversalVideoCreator = ({ contentType }: UniversalVideoCreatorProps) => {
  const [currentStep, setCurrentStep] = useState(0);
  const [selectedTemplate, setSelectedTemplate] = useState<ContentTemplate | null>(null);
  const [customizations, setCustomizations] = useState<Record<string, any>>({});
  const [projectId, setProjectId] = useState<string | null>(null);

  const CurrentStepComponent = WIZARD_STEPS[currentStep].component;

  const handleNext = () => {
    if (currentStep < WIZARD_STEPS.length - 1) {
      setCurrentStep(currentStep + 1);
    }
  };

  const handlePrevious = () => {
    if (currentStep > 0) {
      setCurrentStep(currentStep - 1);
    }
  };

  const canProceed = () => {
    if (currentStep === 0) return selectedTemplate !== null;
    if (currentStep === 1) return Object.keys(customizations).length > 0;
    return true;
  };

  return (
    <div className="container mx-auto py-8 space-y-6">
      {/* Progress Stepper */}
      <Card className="p-6">
        <div className="flex items-center justify-between">
          {WIZARD_STEPS.map((step, index) => (
            <div key={step.id} className="flex items-center flex-1">
              <div className="flex flex-col items-center flex-1">
                <div 
                  className={`w-10 h-10 rounded-full flex items-center justify-center font-semibold transition-colors ${
                    index <= currentStep 
                      ? 'bg-primary text-primary-foreground' 
                      : 'bg-muted text-muted-foreground'
                  }`}
                >
                  {index + 1}
                </div>
                <span className={`text-sm mt-2 ${index <= currentStep ? 'text-foreground' : 'text-muted-foreground'}`}>
                  {step.title}
                </span>
              </div>
              {index < WIZARD_STEPS.length - 1 && (
                <div 
                  className={`h-1 flex-1 mx-4 transition-colors ${
                    index < currentStep ? 'bg-primary' : 'bg-muted'
                  }`}
                />
              )}
            </div>
          ))}
        </div>
      </Card>

      {/* Step Content */}
      <CurrentStepComponent
        contentType={contentType}
        selectedTemplate={selectedTemplate}
        onTemplateSelect={setSelectedTemplate}
        customizations={customizations}
        onCustomizationsChange={setCustomizations}
        projectId={projectId}
        onProjectIdChange={setProjectId}
      />

      {/* Navigation Buttons */}
      {currentStep < 2 && (
        <Card className="p-6">
          <div className="flex justify-between">
            <Button
              variant="outline"
              onClick={handlePrevious}
              disabled={currentStep === 0}
            >
              <ArrowLeft className="mr-2 h-4 w-4" />
              Zurück
            </Button>
            <Button
              onClick={handleNext}
              disabled={!canProceed()}
            >
              Weiter
              <ArrowRight className="ml-2 h-4 w-4" />
            </Button>
          </div>
        </Card>
      )}
    </div>
  );
};
