import { useState, useEffect } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { ArrowLeft, ArrowRight } from 'lucide-react';
import { FormatSelectionStep } from '@/components/universal-creator/steps/FormatSelectionStep';
import { ContentVoiceStep } from '@/components/universal-creator/steps/ContentVoiceStep';
import { SubtitleTimingStep } from '@/components/universal-creator/steps/SubtitleTimingStep';
import { PreviewExportStep } from '@/components/universal-creator/steps/PreviewExportStep';
import { BackgroundAssetSelector } from '@/components/universal-creator/BackgroundAssetSelector';
import { AudioAssetSelector } from '@/components/universal-creator/AudioAssetSelector';
import { SceneTimeline } from '@/components/universal-creator/SceneTimeline';
import { RemotionPreviewPlayer } from '@/components/content-studio/RemotionPreviewPlayer';
import type { FormatConfig, ContentConfig, SubtitleConfig } from '@/types/universal-creator';
import type { BackgroundAsset } from '@/types/background-assets';
import type { Scene } from '@/types/scene';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { mapBackgroundAssetToUniversalVideo } from '@/lib/background-asset-mapper';
import { useSceneManager } from '@/hooks/useSceneManager';

interface WizardStep {
  id: 'format' | 'content' | 'scenes' | 'audio' | 'subtitles' | 'export';
  title: string;
  description: string;
}

const WIZARD_STEPS: WizardStep[] = [
  { id: 'format', title: 'Format', description: 'Wähle Platform & Auflösung' },
  { id: 'content', title: 'Content & Voice', description: 'Script & Voice-over erstellen' },
  { id: 'scenes', title: 'Scenes', description: 'Multi-Scene Timeline erstellen' },
  { id: 'audio', title: 'Audio', description: 'Musik & Sound hinzufügen' },
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
  const [audioConfig, setAudioConfig] = useState({
    background_music_id: null as string | null,
    music_volume: 0.3,
    voiceover_id: null as string | null,
    voiceover_volume: 1.0,
    sound_effects: [] as any[],
  });
  const [subtitleConfig, setSubtitleConfig] = useState<SubtitleConfig>();
  
  // Scene management
  const { scenes, addScene, setScenes } = useSceneManager();

  // Debug component lifecycle
  useEffect(() => {
    console.log('[UniversalCreator] Component mounted');
    return () => console.log('[UniversalCreator] Component unmounted');
  }, []);

  useEffect(() => {
    console.log('[UniversalCreator] Current Step:', currentStep, WIZARD_STEPS[currentStep].title);
  }, [currentStep]);

  useEffect(() => {
    console.log('[UniversalCreator] State Update:', {
      format: !!formatConfig,
      content: !!contentConfig,
      scenes: scenes.length,
      audio: audioConfig,
    });
  }, [formatConfig, contentConfig, scenes, audioConfig]);

  // Auto-save interval
  useEffect(() => {
    const interval = setInterval(() => {
      if (formatConfig) {
        console.log('[UniversalCreator] Auto-saving progress...');
        saveProgress();
      }
    }, 10000);
    
    return () => clearInterval(interval);
  }, [formatConfig, contentConfig, backgroundAsset, audioConfig, scenes, subtitleConfig]);

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
            audio_config: audioConfig,
            scenes: scenes.length > 0 ? (JSON.parse(JSON.stringify({ scenes })) as any) : null,
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
            audio_config: audioConfig,
            scenes: scenes.length > 0 ? (JSON.parse(JSON.stringify({ scenes })) as any) : null,
          })
          .eq('id', projectId);
      }
    } catch (error) {
      console.error('Error saving progress:', error);
    }
  };

  // LocalStorage backup as fallback
  const saveToLocalStorage = () => {
    const state = {
      currentStep,
      formatConfig,
      contentConfig,
      backgroundAsset,
      audioConfig,
      scenes,
      subtitleConfig,
      timestamp: Date.now(),
    };
    localStorage.setItem('universal-creator-backup', JSON.stringify(state));
    console.log('[UniversalCreator] Backup saved to localStorage');
  };

  const restoreFromLocalStorage = () => {
    try {
      const backup = localStorage.getItem('universal-creator-backup');
      if (backup) {
        const state = JSON.parse(backup);
        const age = Date.now() - state.timestamp;
        
        // Only restore if backup is less than 1 hour old
        if (age < 3600000) {
          console.log('[UniversalCreator] Restoring from backup...');
          setCurrentStep(state.currentStep);
          setFormatConfig(state.formatConfig);
          setContentConfig(state.contentConfig);
          setBackgroundAsset(state.backgroundAsset);
          setAudioConfig(state.audioConfig);
          setScenes(state.scenes);
          setSubtitleConfig(state.subtitleConfig);
        }
      }
    } catch (error) {
      console.error('[UniversalCreator] Failed to restore backup:', error);
    }
  };

  // Auto-backup state changes
  useEffect(() => {
    if (formatConfig) {
      saveToLocalStorage();
    }
  }, [formatConfig, contentConfig, backgroundAsset, audioConfig, scenes, subtitleConfig]);

  // Restore on mount
  useEffect(() => {
    if (!formatConfig && !contentConfig) {
      restoreFromLocalStorage();
    }
  }, []);

  const canProceed = () => {
    switch (currentStep) {
      case 0:
        return formatConfig !== null;
      case 1:
        // Voice-over is now optional
        if (contentConfig?.useVoiceover === false) {
          return true; // No voiceover wanted → OK
        }
        // If voiceover wanted, both fields must be filled
        return !!(contentConfig?.scriptText && contentConfig?.voiceoverUrl);
      case 2:
        return scenes.length > 0; // At least one scene required
      case 3:
        return true; // Audio is optional
      case 4:
        // Subtitles only required if voiceover present
        if (!contentConfig?.voiceoverUrl) {
          return true; // No voiceover → subtitles optional
        }
        return !!(subtitleConfig?.segments && subtitleConfig.segments.length > 0);
      case 5:
        return true;
      default:
        return false;
    }
  };

  const handleAddScene = () => {
    if (backgroundAsset) {
      const sceneBackground = mapBackgroundAssetToUniversalVideo(backgroundAsset);
      addScene(sceneBackground, 5);
    } else {
      // Add default color background
      addScene({ type: 'color', color: '#000000' }, 5);
    }
  };

  // Render step content directly to maintain stable component references
  let stepContent: React.ReactNode;

  switch (WIZARD_STEPS[currentStep].id) {
    case 'format':
      stepContent = <FormatSelectionStep value={formatConfig} onChange={setFormatConfig} />;
      break;
    case 'content':
      stepContent = (
        <ContentVoiceStep
          value={contentConfig}
          onChange={setContentConfig}
          projectId={projectId || ''}
        />
      );
      break;
    case 'scenes':
      stepContent = (
        <div className="space-y-6">
          <BackgroundAssetSelector
            selectedAsset={backgroundAsset}
            onSelectAsset={setBackgroundAsset}
          />
          <SceneTimeline 
            scenes={scenes} 
            onScenesChange={setScenes}
            onAddScene={handleAddScene}
          />
        </div>
      );
      break;
    case 'audio':
      stepContent = (
        <div onClick={(e) => e.stopPropagation()}>
          <AudioAssetSelector
            selectedMusicId={audioConfig.background_music_id}
            selectedVoiceoverId={audioConfig.voiceover_id}
            musicVolume={audioConfig.music_volume}
            voiceoverVolume={audioConfig.voiceover_volume}
            onMusicSelect={(id) => {
              setAudioConfig(prev => ({ ...prev, background_music_id: id }));
              saveProgress();
            }}
            onVoiceoverSelect={(id) => {
              setAudioConfig(prev => ({ ...prev, voiceover_id: id }));
              saveProgress();
            }}
            onMusicVolumeChange={(vol) => setAudioConfig(prev => ({ ...prev, music_volume: vol }))}
            onVoiceoverVolumeChange={(vol) => setAudioConfig(prev => ({ ...prev, voiceover_volume: vol }))}
          />
        </div>
      );
      break;
    case 'subtitles':
      stepContent = (
        <SubtitleTimingStep
          audioUrl={contentConfig?.voiceoverUrl}
          subtitleConfig={subtitleConfig}
          onSubtitleConfigChange={setSubtitleConfig}
        />
      );
      break;
    case 'export':
      stepContent = (
        <PreviewExportStep
          formatConfig={formatConfig!}
          contentConfig={contentConfig!}
          subtitleConfig={subtitleConfig}
          backgroundAsset={backgroundAsset}
          projectId={projectId || ''}
          scenes={scenes}
        />
      );
      break;
    default:
      stepContent = null;
  }

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

      {/* Step Content with Live Preview */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Main Content Area */}
        <div className="lg:col-span-2 min-h-[500px]">
          {stepContent}
        </div>

        {/* Live Preview Panel */}
        <div className="lg:col-span-1">
          <Card className="p-6 sticky top-6 space-y-4">
            <h3 className="text-lg font-semibold">Live Preview</h3>
            
            {/* Remotion Player Preview */}
            {formatConfig && (contentConfig?.voiceoverUrl || scenes.length > 0) && currentStep >= 2 && (
              <RemotionPreviewPlayer
                componentName="UniversalVideo"
                customizations={{
                  ...(contentConfig?.voiceoverUrl && {
                    voiceoverUrl: contentConfig.voiceoverUrl,
                    voiceoverDuration: contentConfig.voiceoverDuration || 30,
                  }),
                  subtitles: subtitleConfig?.segments || [],
                  subtitleStyle: subtitleConfig?.style || {
                    position: 'bottom',
                    font: 'Inter',
                    fontSize: 48,
                    color: '#ffffff',
                    backgroundColor: '#000000',
                    backgroundOpacity: 0.5,
                    animation: 'fade',
                    animationSpeed: 1,
                    outlineStyle: 'stroke',
                    outlineColor: '#000000',
                    outlineWidth: 2,
                  },
                  background: scenes.length > 0 ? undefined : mapBackgroundAssetToUniversalVideo(backgroundAsset),
                  scenes: scenes.length > 0 ? scenes : undefined,
                }}
                width={formatConfig.width}
                height={formatConfig.height}
                durationInFrames={Math.ceil(
                  (contentConfig?.voiceoverDuration || 
                   scenes.reduce((sum, s) => sum + s.duration, 0)) * 30
                )}
              />
            )}

            {/* Preview Info */}
            {!contentConfig?.voiceoverUrl && scenes.length === 0 && (
              <div className="aspect-video bg-muted rounded-lg flex items-center justify-center">
                <p className="text-sm text-muted-foreground text-center px-4">
                  {currentStep < 2 
                    ? "Preview wird nach Szenen-Erstellung verfügbar"
                    : "Fügen Sie Szenen hinzu, um die Preview zu sehen"
                  }
                </p>
              </div>
            )}

            {/* Config Summary */}
            <div className="space-y-3 text-sm">
              {formatConfig && (
                <div className="space-y-2">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Format:</span>
                    <span className="font-medium">{formatConfig.aspectRatio}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Auflösung:</span>
                    <span className="font-medium">{formatConfig.width}x{formatConfig.height}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">FPS:</span>
                    <span className="font-medium">{formatConfig.fps}</span>
                  </div>
                </div>
              )}
              
              {contentConfig && (
                <div className="space-y-2 pt-2 border-t">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Voice-over:</span>
                    <span className={`font-medium ${
                      contentConfig.voiceoverUrl ? 'text-green-500' : 'text-muted-foreground'
                    }`}>
                      {contentConfig.voiceoverUrl ? '✓' : 'Ohne Sprechtext'}
                    </span>
                  </div>
                  {contentConfig.voiceoverUrl && (
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Dauer:</span>
                      <span className="font-medium">{contentConfig.voiceoverDuration}s</span>
                    </div>
                  )}
                </div>
              )}

              {scenes.length > 0 ? (
                <div className="space-y-2 pt-2 border-t">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Szenen:</span>
                    <span className="font-medium">{scenes.length}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Gesamt-Dauer:</span>
                    <span className="font-medium">
                      {scenes.reduce((sum, s) => sum + s.duration, 0).toFixed(1)}s
                    </span>
                  </div>
                </div>
              ) : backgroundAsset && (
                <div className="space-y-2 pt-2 border-t">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Hintergrund:</span>
                    <span className="font-medium capitalize">{backgroundAsset.type}</span>
                  </div>
                </div>
              )}
              
              {subtitleConfig?.segments && subtitleConfig.segments.length > 0 && (
                <div className="space-y-2 pt-2 border-t">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Untertitel:</span>
                    <span className="font-medium text-green-500">✓ {subtitleConfig.segments.length}</span>
                  </div>
                </div>
              )}
            </div>
          </Card>
        </div>
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
