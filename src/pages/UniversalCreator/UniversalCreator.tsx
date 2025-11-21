import { useState } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { ArrowLeft, ArrowRight } from 'lucide-react';
import { FormatSelectionStep } from '@/components/universal-creator/steps/FormatSelectionStep';
import { ContentVoiceStep } from '@/components/universal-creator/steps/ContentVoiceStep';
import { SubtitleTimingStep } from '@/components/universal-creator/steps/SubtitleTimingStep';
import { PreviewExportStep } from '@/components/universal-creator/steps/PreviewExportStep';
import { BackgroundAssetSelector } from '@/components/universal-creator/BackgroundAssetSelector';
import type { FormatConfig, ContentConfig, SubtitleConfig } from '@/types/universal-creator';
import type { BackgroundAsset } from '@/types/background-assets';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';

interface WizardStep {
  id: 'format' | 'content' | 'background' | 'subtitles' | 'export';
  title: string;
  description: string;
}

const WIZARD_STEPS: WizardStep[] = [
  { id: 'format', title: 'Format', description: 'Wähle Platform & Auflösung' },
  { id: 'content', title: 'Content & Voice', description: 'Script & Voice-over erstellen' },
  { id: 'background', title: 'Background', description: 'Hintergrund wählen' },
  { id: 'subtitles', title: 'Subtitles', description: 'Untertitel generieren & stylen' },
  { id: 'export', title: 'Export', description: 'Rendern & Exportieren' },
];

export function UniversalCreator() {
  const { user } = useAuth();
  const [currentStep, setCurrentStep] = useState(0);
  const [projectId, setProjectId] = useState<string>();
  const [formatConfig, setFormatConfig] = useState<FormatConfig | null>(null);
  const [contentConfig, setContentConfig] = useState<ContentConfig | null>(null);
  const [backgroundAsset, setBackgroundAsset] = useState<BackgroundAsset | null>(null);
  const [subtitleConfig, setSubtitleConfig] = useState<SubtitleConfig>();

  const handleNext = async () => {
    if (currentStep < WIZARD_STEPS.length - 1) {
      // Auto-save progress
      await saveProgress();
      setCurrentStep(currentStep + 1);
    }
  };

  const handlePrevious = () => {
    if (currentStep > 0) {
      setCurrentStep(currentStep - 1);
    }
  };

  const saveProgress = async () => {
    if (!user || !formatConfig) return;

    try {
      if (!projectId) {
        // Create new project
        const { data, error } = await supabase
          .from('content_projects')
          .insert([{
            user_id: user.id,
            content_type: 'universal',
            project_name: `Universal Video ${new Date().toLocaleDateString()}`,
            customizations: {
              format: formatConfig,
              content: contentConfig,
              background: backgroundAsset,
              subtitles: subtitleConfig,
            } as any,
            status: 'draft',
            render_engine: 'remotion',
          }])
          .select()
          .single();

        if (error) throw error;
        setProjectId(data.id);
      } else {
        // Update existing project
        await supabase
          .from('content_projects')
          .update({
            customizations: {
              format: formatConfig,
              content: contentConfig,
              background: backgroundAsset,
              subtitles: subtitleConfig,
            } as any,
          })
          .eq('id', projectId);
      }
    } catch (error) {
      console.error('Error saving progress:', error);
    }
  };

  const canProceed = () => {
    switch (currentStep) {
      case 0:
        return formatConfig !== null;
      case 1:
        return contentConfig?.scriptText && contentConfig?.voiceoverUrl;
      case 2:
        return backgroundAsset !== null;
      case 3:
        return subtitleConfig?.segments && subtitleConfig.segments.length > 0;
      case 4:
        return true;
      default:
        return false;
    }
  };

  const CurrentStepComponent = () => {
    switch (WIZARD_STEPS[currentStep].id) {
      case 'format':
        return <FormatSelectionStep value={formatConfig} onChange={setFormatConfig} />;
      case 'content':
        return (
          <ContentVoiceStep
            value={contentConfig}
            onChange={setContentConfig}
            projectId={projectId || ''}
          />
        );
      case 'background':
        return (
          <BackgroundAssetSelector
            selectedAsset={backgroundAsset}
            onSelectAsset={setBackgroundAsset}
          />
        );
      case 'subtitles':
        return (
          <SubtitleTimingStep
            audioUrl={contentConfig?.voiceoverUrl}
            subtitleConfig={subtitleConfig}
            onSubtitleConfigChange={setSubtitleConfig}
          />
        );
      case 'export':
        return (
          <PreviewExportStep
            formatConfig={formatConfig!}
            contentConfig={contentConfig!}
            subtitleConfig={subtitleConfig}
            backgroundAsset={backgroundAsset}
            projectId={projectId || ''}
          />
        );
      default:
        return null;
    }
  };

  return (
    <div className="container mx-auto py-8 px-4 space-y-6 max-w-7xl">
      {/* Progress Stepper */}
      <Card className="p-6">
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
                  <span
                    className={`text-sm font-medium ${
                      index <= currentStep ? 'text-foreground' : 'text-muted-foreground'
                    }`}
                  >
                    {step.title}
                  </span>
                  <p className="text-xs text-muted-foreground hidden md:block">
                    {step.description}
                  </p>
                </div>
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
      <div className="min-h-[500px]">
        <CurrentStepComponent />
      </div>

      {/* Navigation Buttons */}
      <Card className="p-6">
        <div className="flex justify-between">
          <Button variant="outline" onClick={handlePrevious} disabled={currentStep === 0}>
            <ArrowLeft className="mr-2 h-4 w-4" />
            Zurück
          </Button>
          
          {currentStep < WIZARD_STEPS.length - 1 && (
            <Button onClick={handleNext} disabled={!canProceed()}>
              Weiter
              <ArrowRight className="ml-2 h-4 w-4" />
            </Button>
          )}
        </div>
      </Card>
    </div>
  );
}
