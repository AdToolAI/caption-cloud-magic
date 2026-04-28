import { useState, useEffect } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ArrowLeft, ArrowRight } from 'lucide-react';
import { FormatSelectionStep } from '@/components/universal-creator/steps/FormatSelectionStep';
import { ContentVoiceStep } from '@/components/universal-creator/steps/ContentVoiceStep';
import { SubtitleTimingStep } from '@/components/universal-creator/steps/SubtitleTimingStep';
import { PreviewExportStep } from '@/components/universal-creator/steps/PreviewExportStep';
import { BackgroundAssetSelector } from '@/components/universal-creator/BackgroundAssetSelector';
import { AudioAssetSelector } from '@/components/universal-creator/AudioAssetSelector';
import { SceneTimeline } from '@/components/universal-creator/SceneTimeline';
import { RemotionPreviewPlayer } from '@/components/universal-creator/RemotionPreviewPlayer';
import type { FormatConfig, ContentConfig, SubtitleConfig } from '@/types/universal-creator';
import type { BackgroundAsset } from '@/types/background-assets';
import type { Scene } from '@/types/scene';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { mapBackgroundAssetToUniversalVideo } from '@/lib/background-asset-mapper';
import { useSceneManager } from '@/hooks/useSceneManager';
import { useTranslation } from '@/hooks/useTranslation';

interface WizardStep {
  id: 'format' | 'content' | 'scenes' | 'audio' | 'subtitles' | 'export';
  title: string;
  descKey: string;
}

const WIZARD_STEPS: WizardStep[] = [
  { id: 'format', title: 'Format', descKey: 'uc.stepFormatDesc' },
  { id: 'content', title: 'Content & Voice', descKey: 'uc.stepContentDesc' },
  { id: 'scenes', title: 'Scenes', descKey: 'uc.stepScenesDesc' },
  { id: 'audio', title: 'Audio', descKey: 'uc.stepAudioDesc' },
  { id: 'subtitles', title: 'Subtitles', descKey: 'uc.stepSubtitlesDesc' },
  { id: 'export', title: 'Export', descKey: 'uc.stepExportDesc' },
];

export function UniversalCreator() {
  const { user } = useAuth();
  const { t } = useTranslation();
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
  const [selectedMusicUrl, setSelectedMusicUrl] = useState<string | null>(null);
  const [subtitleConfig, setSubtitleConfig] = useState<SubtitleConfig>();
  const [videoQuality, setVideoQuality] = useState<'hd' | '4k'>('hd');
  
  const getDisplayDimensions = (format: FormatConfig, quality: 'hd' | '4k') => {
    if (quality === 'hd') {
      return { width: format.width, height: format.height };
    }
    const fourKMap: Record<string, { width: number; height: number }> = {
      '9:16': { width: 2160, height: 3840 },
      '16:9': { width: 3840, height: 2160 },
      '1:1': { width: 2160, height: 2160 },
      '4:5': { width: 2160, height: 2700 },
      '4:3': { width: 2880, height: 2160 },
    };
    return fourKMap[format.aspectRatio] || { width: 2160, height: 3840 };
  };
  
  const { scenes, addScene, setScenes } = useSceneManager();

  useEffect(() => {
    const fetchMusicUrl = async () => {
      if (audioConfig.background_music_id) {
        console.log('[UniversalCreator] Fetching music URL for ID:', audioConfig.background_music_id);
        try {
          const { data, error } = await supabase
            .from('universal_audio_assets')
            .select('url, storage_url')
            .eq('id', audioConfig.background_music_id)
            .single();
          
          if (!error && data) {
            if (!data.url && !data.storage_url) {
              setSelectedMusicUrl(null);
              return;
            }
            if (data.storage_url) {
              setSelectedMusicUrl(data.storage_url);
              return;
            }
            if (data.url && (data.url.includes('jamendo.com') || data.url.includes('storage.jamendo.com'))) {
              const { data: uploadData, error: uploadError } = await supabase.functions.invoke('upload-music-to-storage', {
                body: { originalUrl: data.url, projectId }
              });
              if (uploadError) return;
              await supabase
                .from('universal_audio_assets')
                .update({ storage_url: uploadData.storageUrl })
                .eq('id', audioConfig.background_music_id);
              setSelectedMusicUrl(uploadData.storageUrl);
            } else {
              setSelectedMusicUrl(data.url);
            }
          }
        } catch (error) {
          console.error('[UniversalCreator] Exception fetching music URL:', error);
        }
      } else {
        setSelectedMusicUrl(null);
      }
    };
    fetchMusicUrl();
  }, [audioConfig.background_music_id, projectId]);

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

  useEffect(() => {
    const interval = setInterval(() => {
      if (formatConfig) {
        saveProgress();
      }
    }, 10000);
    return () => clearInterval(interval);
  }, [formatConfig, contentConfig, backgroundAsset, audioConfig, scenes, subtitleConfig]);

  const handleNext = async () => {
    if (currentStep < WIZARD_STEPS.length - 1) {
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
  };

  const restoreFromLocalStorage = () => {
    try {
      const backup = localStorage.getItem('universal-creator-backup');
      if (backup) {
        const state = JSON.parse(backup);
        const age = Date.now() - state.timestamp;
        if (age < 3600000) {
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

  useEffect(() => {
    if (formatConfig) {
      saveToLocalStorage();
    }
  }, [formatConfig, contentConfig, backgroundAsset, audioConfig, scenes, subtitleConfig]);

  useEffect(() => {
    if (!formatConfig && !contentConfig) {
      restoreFromLocalStorage();
    }
  }, []);

  const canProceed = () => {
    switch (currentStep) {
      case 0: return formatConfig !== null;
      case 1:
        if (contentConfig?.useVoiceover === false) return true;
        return !!(contentConfig?.scriptText && contentConfig?.voiceoverUrl);
      case 2: return scenes.length > 0;
      case 3: return true;
      case 4:
        if (!contentConfig?.voiceoverUrl) return true;
        return !!(subtitleConfig?.segments && subtitleConfig.segments.length > 0);
      case 5: return true;
      default: return false;
    }
  };

  const handleAddScene = () => {
    if (backgroundAsset) {
      const sceneBackground = mapBackgroundAssetToUniversalVideo(backgroundAsset);
      addScene(sceneBackground, 5);
    } else {
      addScene({ type: 'color', color: '#000000' }, 5);
    }
  };

  let stepContent: React.ReactNode;
  switch (WIZARD_STEPS[currentStep].id) {
    case 'format':
      stepContent = <FormatSelectionStep value={formatConfig} onChange={setFormatConfig} />;
      break;
    case 'content':
      stepContent = <ContentVoiceStep value={contentConfig} onChange={setContentConfig} projectId={projectId || ''} scenes={scenes} />;
      break;
    case 'scenes':
      stepContent = (
        <div className="space-y-6">
          <BackgroundAssetSelector selectedAsset={backgroundAsset} onSelectAsset={setBackgroundAsset} />
          <SceneTimeline scenes={scenes} onScenesChange={setScenes} onAddScene={handleAddScene} />
        </div>
      );
      break;
    case 'audio':
      stepContent = (
        <AudioAssetSelector
          selectedMusicId={audioConfig.background_music_id}
          musicVolume={audioConfig.music_volume}
          onMusicSelect={(id) => setAudioConfig(prev => ({ ...prev, background_music_id: id }))}
          onMusicVolumeChange={(vol) => setAudioConfig(prev => ({ ...prev, music_volume: vol }))}
        />
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
          selectedMusicUrl={selectedMusicUrl}
          musicVolume={audioConfig.music_volume}
          videoQuality={videoQuality}
          onVideoQualityChange={setVideoQuality}
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
                    {t(step.descKey)}
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
        <div className="lg:col-span-2 min-h-[500px]">
          {stepContent}
        </div>

        {/* Live Preview Panel */}
        <div className="lg:col-span-1">
          <Card className="p-6 sticky top-6 space-y-4">
            <h3 className="text-lg font-semibold">{t('uc.livePreview')}</h3>
            
            {formatConfig && (contentConfig?.voiceoverUrl || scenes.length > 0) && currentStep >= 2 && currentStep < 4 && (
              <div className="relative rounded-lg overflow-hidden bg-black" style={{ aspectRatio: formatConfig.width / formatConfig.height }}>
                {scenes.length > 0 && scenes[0]?.background?.videoUrl ? (
                  <video src={scenes[0].background.videoUrl} className="w-full h-full object-contain" loop muted autoPlay playsInline />
                ) : backgroundAsset?.url ? (
                  backgroundAsset.type === 'video' ? (
                    <video src={backgroundAsset.url} className="w-full h-full object-contain" loop muted autoPlay playsInline />
                  ) : (
                    <img src={backgroundAsset.url} alt="Background" className="w-full h-full object-contain" />
                  )
                ) : (
                  <div className="w-full h-full flex items-center justify-center">
                    <p className="text-sm text-muted-foreground">{t('uc.previewLoading')}</p>
                  </div>
                )}
                <div className="absolute bottom-2 left-2 bg-black/60 text-white text-xs px-2 py-1 rounded">
                  {t('uc.simplePreview')}
                </div>
              </div>
            )}

            {formatConfig && (contentConfig?.voiceoverUrl || scenes.length > 0) && currentStep >= 4 && (
              <RemotionPreviewPlayer
                componentName="UniversalCreatorVideo"
                customizations={{
                  ...(contentConfig?.voiceoverUrl && {
                    voiceoverUrl: contentConfig.voiceoverUrl,
                    voiceoverDuration: contentConfig.voiceoverDuration || 30,
                    voiceoverVolume: contentConfig.voiceoverVolume ?? 1.0,
                  }),
                  ...(selectedMusicUrl && {
                    backgroundMusicUrl: selectedMusicUrl,
                    backgroundMusicVolume: audioConfig.music_volume,
                  }),
                  subtitles: subtitleConfig?.segments || [],
                  subtitleStyle: subtitleConfig?.style || {
                    position: 'bottom', font: 'Inter', fontSize: 48, color: '#ffffff',
                    backgroundColor: '#000000', backgroundOpacity: 0.5, animation: 'fade',
                    animationSpeed: 1, outlineStyle: 'stroke', outlineColor: '#000000', outlineWidth: 2,
                  },
                  background: scenes.length > 0 ? undefined : mapBackgroundAssetToUniversalVideo(backgroundAsset),
                  scenes: scenes.length > 0 ? scenes : undefined,
                }}
                width={formatConfig.width}
                height={formatConfig.height}
                durationInFrames={Math.ceil(
                  Math.max(
                    contentConfig?.actualVoiceoverDuration || contentConfig?.voiceoverDuration || 0,
                    scenes.reduce((sum, s) => sum + s.duration, 0),
                    5
                  ) * 30
                ) || 150}
              />
            )}

            {!contentConfig?.voiceoverUrl && scenes.length === 0 && (
              <div className="aspect-video bg-muted rounded-lg flex items-center justify-center">
                <p className="text-sm text-muted-foreground text-center px-4">
                  {currentStep < 2 
                    ? t('uc.previewAvailableAfterScenes')
                    : t('uc.addScenesToSeePreview')
                  }
                </p>
              </div>
            )}

            {/* Config Summary */}
            <div className="space-y-3 text-sm">
              {formatConfig && (
                <div className="space-y-2">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">{t('uc.format')}:</span>
                    <span className="font-medium">{formatConfig.aspectRatio}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">{t('uc.resolution')}:</span>
                    <span className="font-medium flex items-center gap-2">
                      {getDisplayDimensions(formatConfig, videoQuality).width}x
                      {getDisplayDimensions(formatConfig, videoQuality).height}
                      {videoQuality === '4k' && <Badge variant="secondary" className="text-xs">4K</Badge>}
                    </span>
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
                    <span className="text-muted-foreground">{t('uc.voiceOver')}:</span>
                    <span className={`font-medium ${contentConfig.voiceoverUrl ? 'text-green-500' : 'text-muted-foreground'}`}>
                      {contentConfig.voiceoverUrl ? '✓' : t('uc.withoutNarration')}
                    </span>
                  </div>
                  {contentConfig.voiceoverUrl && (
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">{t('uc.duration')}:</span>
                      <span className="font-medium">{contentConfig.voiceoverDuration}s</span>
                    </div>
                  )}
                </div>
              )}

              {scenes.length > 0 ? (
                <div className="space-y-2 pt-2 border-t">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">{t('uc.scenes')}:</span>
                    <span className="font-medium">{scenes.length}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">{t('uc.totalDuration')}:</span>
                    <span className="font-medium">
                      {scenes.reduce((sum, s) => sum + s.duration, 0).toFixed(1)}s
                    </span>
                  </div>
                </div>
              ) : backgroundAsset && (
                <div className="space-y-2 pt-2 border-t">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">{t('uc.background')}:</span>
                    <span className="font-medium capitalize">{backgroundAsset.type}</span>
                  </div>
                </div>
              )}
              
              {subtitleConfig?.segments && subtitleConfig.segments.length > 0 && (
                <div className="space-y-2 pt-2 border-t">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">{t('uc.subtitles')}:</span>
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
            {t('uc.back')}
          </Button>
          
          {currentStep < WIZARD_STEPS.length - 1 && (
            <Button onClick={handleNext} disabled={!canProceed()}>
              {t('uc.next')}
              <ArrowRight className="ml-2 h-4 w-4" />
            </Button>
          )}
        </div>
      </Card>
    </div>
  );
}
