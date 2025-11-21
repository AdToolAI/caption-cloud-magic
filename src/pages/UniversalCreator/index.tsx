import { useState } from 'react';
import { Helmet } from 'react-helmet-async';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { ArrowLeft, ArrowRight } from 'lucide-react';
import { FormatSelectionStep } from '@/components/universal-creator/steps/FormatSelectionStep';
import type { FormatConfig } from '@/types/universal-creator';

interface WizardStep {
  id: 'format' | 'content' | 'subtitles' | 'preview';
  title: string;
  description: string;
}

const WIZARD_STEPS: WizardStep[] = [
  { id: 'format', title: 'Format & Plattform', description: 'Wähle das richtige Format für deine Zielplattform' },
  { id: 'content', title: 'Content & Voice', description: 'Füge Text hinzu und generiere Voice-over' },
  { id: 'subtitles', title: 'Untertitel & Timing', description: 'Synchronisiere Untertitel mit deinem Audio' },
  { id: 'preview', title: 'Vorschau & Export', description: 'Rendere dein Video in mehreren Formaten' }
];

const UniversalCreator = () => {
  const [currentStep, setCurrentStep] = useState(0);
  const [formatConfig, setFormatConfig] = useState<FormatConfig | null>(null);

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
    if (currentStep === 0) return formatConfig !== null;
    return true;
  };

  return (
    <>
      <Helmet>
        <title>Universal Content Creator | Video erstellen</title>
        <meta name="description" content="Erstelle professionelle Videos mit Voice-over, Untertiteln und Multi-Format Export für alle Social Media Plattformen" />
      </Helmet>

      <div className="container mx-auto py-8 space-y-6">
        {/* Header */}
        <div className="space-y-2">
          <h1 className="text-3xl font-bold">Universal Content Creator</h1>
          <p className="text-muted-foreground">
            Erstelle professionelle Videos mit Voice-over, Untertiteln und Multi-Format Export
          </p>
        </div>

        {/* Progress Stepper */}
        <Card className="p-6">
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              {WIZARD_STEPS.map((step, index) => (
                <div key={step.id} className="flex items-center flex-1">
                  <div className="flex flex-col items-center flex-1">
                    <div 
                      className={`w-10 h-10 rounded-full flex items-center justify-center font-semibold transition-all ${
                        index <= currentStep 
                          ? 'bg-primary text-primary-foreground shadow-lg' 
                          : 'bg-muted text-muted-foreground'
                      }`}
                    >
                      {index + 1}
                    </div>
                    <div className="text-center mt-2">
                      <span className={`text-sm font-medium ${index <= currentStep ? 'text-foreground' : 'text-muted-foreground'}`}>
                        {step.title}
                      </span>
                      <p className="text-xs text-muted-foreground mt-1 max-w-[150px]">
                        {step.description}
                      </p>
                    </div>
                  </div>
                  {index < WIZARD_STEPS.length - 1 && (
                    <div 
                      className={`h-1 flex-1 mx-4 transition-all ${
                        index < currentStep ? 'bg-primary' : 'bg-muted'
                      }`}
                    />
                  )}
                </div>
              ))}
            </div>
          </div>
        </Card>

        {/* Step Content */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Main Content Area */}
          <div className="lg:col-span-2">
            {currentStep === 0 && (
              <FormatSelectionStep
                value={formatConfig}
                onChange={setFormatConfig}
              />
            )}
            {currentStep === 1 && (
              <Card className="p-6">
                <h2 className="text-xl font-semibold mb-4">Content & Voice-over</h2>
                <p className="text-muted-foreground">Coming soon: Text Editor und ElevenLabs Voice-over Integration</p>
              </Card>
            )}
            {currentStep === 2 && (
              <Card className="p-6">
                <h2 className="text-xl font-semibold mb-4">Untertitel & Timing</h2>
                <p className="text-muted-foreground">Coming soon: Automatische Untertitel-Generierung und Editor</p>
              </Card>
            )}
            {currentStep === 3 && (
              <Card className="p-6">
                <h2 className="text-xl font-semibold mb-4">Vorschau & Export</h2>
                <p className="text-muted-foreground">Coming soon: Live Preview und Multi-Format Export</p>
              </Card>
            )}
          </div>

          {/* Preview Panel */}
          <div className="lg:col-span-1">
            <Card className="p-6 sticky top-6">
              <h3 className="text-lg font-semibold mb-4">Vorschau</h3>
              <div 
                className="bg-muted rounded-lg flex items-center justify-center text-muted-foreground"
                style={{
                  aspectRatio: formatConfig?.aspectRatio === '16:9' ? '16/9' :
                             formatConfig?.aspectRatio === '9:16' ? '9/16' :
                             formatConfig?.aspectRatio === '1:1' ? '1/1' :
                             formatConfig?.aspectRatio === '4:5' ? '4/5' :
                             formatConfig?.aspectRatio === '4:3' ? '4/3' : '16/9'
                }}
              >
                {formatConfig ? (
                  <div className="text-center p-4">
                    <p className="text-sm font-medium">
                      {formatConfig.width}x{formatConfig.height}
                    </p>
                    <p className="text-xs">
                      {formatConfig.aspectRatio} • {formatConfig.fps}fps
                    </p>
                  </div>
                ) : (
                  <p className="text-sm">Wähle ein Format aus</p>
                )}
              </div>
              {formatConfig && (
                <div className="mt-4 space-y-2 text-sm">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Plattform:</span>
                    <span className="font-medium capitalize">{formatConfig.platform}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Dauer:</span>
                    <span className="font-medium">{formatConfig.duration}s</span>
                  </div>
                </div>
              )}
            </Card>
          </div>
        </div>

        {/* Navigation Buttons */}
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
              disabled={!canProceed() || currentStep === WIZARD_STEPS.length - 1}
            >
              Weiter
              <ArrowRight className="ml-2 h-4 w-4" />
            </Button>
          </div>
        </Card>
      </div>
    </>
  );
};

export default UniversalCreator;
