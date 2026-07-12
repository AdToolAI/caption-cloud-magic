import { useState, useEffect, useRef, useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ArrowLeft, ArrowRight, Plus } from 'lucide-react';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { toast } from 'sonner';
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
import { clampAudioVolume } from '@/lib/audioVolume';
import {
  DEFAULT_SUBTITLE_STYLE,
  DEFAULT_MUSIC_VOLUME,
  DEFAULT_VOICEOVER_VOLUME,
  computeDurationInFrames,
} from '@/lib/universalCreatorDefaults';
import { buildUniversalCreatorCustomizations } from '@/lib/universalCreatorRenderPayload';

const BACKUP_STORAGE_KEY = 'universal-creator-backup';
const BACKUP_SCHEMA_VERSION = 2;
const BACKUP_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000; // 7d — long enough for multi-day sessions
const AUTO_RESUME_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

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
  const [searchParams, setSearchParams] = useSearchParams();
  const urlProjectId = searchParams.get('project') || undefined;

  const [currentStep, setCurrentStep] = useState(0);
  const [projectId, setProjectId] = useState<string | undefined>(urlProjectId);
  const [formatConfig, setFormatConfig] = useState<FormatConfig | null>(null);
  const [contentConfig, setContentConfig] = useState<ContentConfig | null>(null);
  const [backgroundAsset, setBackgroundAsset] = useState<BackgroundAsset | null>(null);
  const [audioConfig, setAudioConfig] = useState({
    background_music_id: null as string | null,
    music_volume: DEFAULT_MUSIC_VOLUME,
  });
  const [selectedMusicUrl, setSelectedMusicUrl] = useState<string | null>(null);
  const [subtitleConfig, setSubtitleConfig] = useState<SubtitleConfig>();
  const [videoQuality, setVideoQuality] = useState<'hd' | '4k'>('hd');
  const [isHydrating, setIsHydrating] = useState<boolean>(!!urlProjectId);
  const hydratedRef = useRef(false);
  
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
    const interval = setInterval(() => {
      if (formatConfig && !isHydrating) {
        saveProgress();
      }
    }, 10000);
    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [formatConfig, contentConfig, backgroundAsset, audioConfig, scenes, subtitleConfig, projectId, selectedMusicUrl, videoQuality, isHydrating]);

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

  const handleNewProject = () => {
    localStorage.removeItem(BACKUP_STORAGE_KEY);
    hydratedRef.current = false;
    setProjectId(undefined);
    setFormatConfig(null);
    setContentConfig(null);
    setBackgroundAsset(null);
    setAudioConfig({
      background_music_id: null,
      music_volume: DEFAULT_MUSIC_VOLUME,
    });
    setSelectedMusicUrl(null);
    setSubtitleConfig(undefined);
    setScenes([]);
    setCurrentStep(0);
    setVideoQuality('hd');
    // Clear ?project from URL so no stale resume happens on reload
    if (searchParams.get('project')) {
      const next = new URLSearchParams(searchParams);
      next.delete('project');
      setSearchParams(next, { replace: true });
    }
    toast.success(t('uc.newProjectStarted') || 'Neues Projekt gestartet');
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
              current_step: currentStep,
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
        // Publish new projectId to the URL so reload / share resumes exactly this draft
        const next = new URLSearchParams(searchParams);
        next.set('project', data.id);
        setSearchParams(next, { replace: true });
      } else {
        await supabase
          .from('content_projects')
          .update({
            customizations: {
              format: formatConfig,
              content: contentConfig,
              background: backgroundAsset,
              subtitles: subtitleConfig,
              current_step: currentStep,
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
    const payload = {
      version: BACKUP_SCHEMA_VERSION,
      timestamp: Date.now(),
      state: {
        currentStep,
        projectId,
        formatConfig,
        contentConfig,
        backgroundAsset,
        audioConfig: {
          background_music_id: audioConfig.background_music_id,
          music_volume: clampAudioVolume(audioConfig.music_volume),
        },
        selectedMusicUrl,
        scenes,
        subtitleConfig,
        videoQuality,
      },
    };
    try {
      localStorage.setItem(BACKUP_STORAGE_KEY, JSON.stringify(payload));
    } catch (err) {
      console.warn('[UniversalCreator] Failed to persist backup:', err);
    }
  };

  const restoreFromLocalStorage = () => {
    try {
      const raw = localStorage.getItem(BACKUP_STORAGE_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw);

      // Reject old / unversioned backups so stale audio defaults can never
      // silently overwrite the current session.
      if (parsed?.version !== BACKUP_SCHEMA_VERSION) {
        localStorage.removeItem(BACKUP_STORAGE_KEY);
        return;
      }

      const age = Date.now() - (parsed.timestamp || 0);
      if (age >= BACKUP_MAX_AGE_MS) return;

      const s = parsed.state || {};
      if (typeof s.currentStep === 'number') setCurrentStep(s.currentStep);
      if (s.projectId) setProjectId(s.projectId);
      if (s.formatConfig) setFormatConfig(s.formatConfig);
      if (s.contentConfig) setContentConfig(s.contentConfig);
      if (s.backgroundAsset) setBackgroundAsset(s.backgroundAsset);
      if (s.audioConfig) {
        setAudioConfig({
          background_music_id: s.audioConfig.background_music_id ?? null,
          music_volume: clampAudioVolume(s.audioConfig.music_volume ?? DEFAULT_MUSIC_VOLUME),
        });
      }
      if (s.selectedMusicUrl) setSelectedMusicUrl(s.selectedMusicUrl);
      if (Array.isArray(s.scenes)) setScenes(s.scenes);
      if (s.subtitleConfig) setSubtitleConfig(s.subtitleConfig);
      if (s.videoQuality === 'hd' || s.videoQuality === '4k') setVideoQuality(s.videoQuality);
    } catch (error) {
      console.error('[UniversalCreator] Failed to restore backup:', error);
    }
  };

  // Debounced localStorage backup so rapid state changes don't thrash storage
  const saveDebounceRef = useRef<number | null>(null);
  useEffect(() => {
    if (!formatConfig || isHydrating) return;
    if (saveDebounceRef.current) window.clearTimeout(saveDebounceRef.current);
    saveDebounceRef.current = window.setTimeout(() => {
      saveToLocalStorage();
      // Also push a debounced DB save so ?project=<id> lands in the URL
      // before the user clicks "Next". Guarded by user + formatConfig inside.
      void saveProgress();
    }, 500);
    return () => {
      if (saveDebounceRef.current) window.clearTimeout(saveDebounceRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentStep, formatConfig, contentConfig, backgroundAsset, audioConfig, scenes, subtitleConfig, selectedMusicUrl, projectId, videoQuality, isHydrating]);

  // Hydrate from DB when ?project=<id> is present; otherwise fall back to localStorage backup
  const hydrateFromDb = useCallback(async (id: string) => {
    try {
      const { data, error } = await supabase
        .from('content_projects')
        .select('id, customizations, audio_config, scenes')
        .eq('id', id)
        .maybeSingle();
      if (error || !data) {
        console.warn('[UniversalCreator] Could not hydrate project', id, error);
        setIsHydrating(false);
        // Fall back to any local backup so the user isn't stranded on a blank wizard
        restoreFromLocalStorage();
        return;
      }
      const c = (data.customizations || {}) as any;
      if (c.format) setFormatConfig(c.format);
      if (c.content) setContentConfig(c.content);
      if (c.background) setBackgroundAsset(c.background);
      if (c.subtitles) setSubtitleConfig(c.subtitles);
      if (typeof c.current_step === 'number' && c.current_step >= 0 && c.current_step < WIZARD_STEPS.length) {
        setCurrentStep(c.current_step);
      }
      const ac = (data.audio_config || {}) as any;
      setAudioConfig({
        background_music_id: ac.background_music_id ?? null,
        music_volume: clampAudioVolume(ac.music_volume ?? DEFAULT_MUSIC_VOLUME),
      });
      const sc = (data.scenes as any)?.scenes;
      if (Array.isArray(sc)) setScenes(sc);
      setProjectId(data.id);
    } catch (err) {
      console.error('[UniversalCreator] Hydration failed:', err);
    } finally {
      setIsHydrating(false);
    }
  }, [setScenes]);

  useEffect(() => {
    if (hydratedRef.current) return;
    hydratedRef.current = true;
    if (urlProjectId) {
      void hydrateFromDb(urlProjectId);
      return;
    }
    // Silent Auto-Resume: newest draft of this user, if <7d old.
    (async () => {
      try {
        if (!user) {
          restoreFromLocalStorage();
          return;
        }
        const cutoff = new Date(Date.now() - AUTO_RESUME_MAX_AGE_MS).toISOString();
        const { data, error } = await supabase
          .from('content_projects')
          .select('id, updated_at, status')
          .eq('user_id', user.id)
          .eq('content_type', 'universal')
          .eq('status', 'draft')
          .gte('updated_at', cutoff)
          .order('updated_at', { ascending: false })
          .limit(1)
          .maybeSingle();
        if (!error && data?.id) {
          setIsHydrating(true);
          const next = new URLSearchParams(searchParams);
          next.set('project', data.id);
          setSearchParams(next, { replace: true });
          void hydrateFromDb(data.id);
          return;
        }
      } catch (err) {
        console.warn('[UniversalCreator] Auto-resume lookup failed:', err);
      }
      if (!formatConfig && !contentConfig) {
        restoreFromLocalStorage();
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);

  // React to external URL changes (e.g. user pastes a share link) — reload the wizard
  useEffect(() => {
    if (!hydratedRef.current) return;
    if (urlProjectId && urlProjectId !== projectId) {
      setIsHydrating(true);
      void hydrateFromDb(urlProjectId);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [urlProjectId]);

  const canProceed = () => {
    switch (currentStep) {
      case 0: return formatConfig !== null;
      case 1:
        if (contentConfig?.useVoiceover === false) return true;
        return !!(contentConfig?.scriptText && contentConfig?.voiceoverUrl);
      case 2: return scenes.length > 0;
      case 3: return true;
      case 4: return true; // Untertitel sind optional
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
        <div className="space-y-6">
          <AudioAssetSelector
            selectedMusicId={audioConfig.background_music_id}
            musicVolume={audioConfig.music_volume}
            onMusicSelect={(id) => setAudioConfig(prev => ({ ...prev, background_music_id: id }))}
            onMusicVolumeChange={(vol) => setAudioConfig(prev => ({ ...prev, music_volume: vol }))}
            onMusicUrlChange={setSelectedMusicUrl}
          />
          <OriginalAudioMixPanel
            enabled={contentConfig?.useOriginalAudio === true}
            volume={typeof contentConfig?.originalAudioVolume === 'number' ? contentConfig!.originalAudioVolume! : 0.6}
            onEnabledChange={(v) => setContentConfig(prev => ({ ...(prev || {} as ContentConfig), useOriginalAudio: v }))}
            onVolumeChange={(v) => setContentConfig(prev => ({ ...(prev || {} as ContentConfig), originalAudioVolume: v }))}
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
          selectedMusicUrl={selectedMusicUrl}
          musicVolume={audioConfig.music_volume}
          onMusicVolumeChange={(vol) => setAudioConfig(prev => ({ ...prev, music_volume: vol }))}
          onMusicClear={() => {
            setAudioConfig(prev => ({ ...prev, background_music_id: null }));
            setSelectedMusicUrl(null);
          }}
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
        <div className="flex items-center justify-end mb-4">
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button variant="outline" size="sm" className="gap-2">
                <Plus className="w-4 h-4" />
                Neues Projekt
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Neues Projekt starten?</AlertDialogTitle>
                <AlertDialogDescription>
                  Der aktuelle Fortschritt wird verworfen. Diese Aktion kann nicht rückgängig gemacht werden.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Abbrechen</AlertDialogCancel>
                <AlertDialogAction onClick={handleNewProject}>
                  Neues Projekt starten
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>
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
      <div className={`grid grid-cols-1 gap-6 ${currentStep === 5 ? '' : 'lg:grid-cols-3'}`}>
        <div className={`${currentStep === 5 ? 'min-h-[500px]' : 'lg:col-span-2 min-h-[500px]'}`}>
          {stepContent}
        </div>

        {/* Live Preview Panel */}
        {currentStep !== 5 && <div className="lg:col-span-1">
          <Card className="p-6 sticky top-6 space-y-4">
            <h3 className="text-lg font-semibold">{t('uc.livePreview')}</h3>
            
            {formatConfig && (backgroundAsset || scenes.length > 0) && currentStep === 2 && (() => {
              // Prefer currently-selected background asset (next scene preview),
              // fall back to last added scene, then first scene.
              const previewSource =
                backgroundAsset?.url
                  ? { type: backgroundAsset.type, url: backgroundAsset.url }
                  : (() => {
                      const last = scenes[scenes.length - 1];
                      if (last?.background?.videoUrl) return { type: 'video' as const, url: last.background.videoUrl };
                      if (last?.background?.imageUrl) return { type: 'image' as const, url: last.background.imageUrl };
                      return null;
                    })();

              return (
                <div className="relative rounded-lg overflow-hidden bg-black" style={{ aspectRatio: formatConfig.width / formatConfig.height }}>
                  {previewSource ? (
                    previewSource.type === 'video' ? (
                      <video key={previewSource.url} src={previewSource.url} className="w-full h-full object-contain" loop muted autoPlay playsInline />
                    ) : (
                      <img src={previewSource.url} alt="Background" className="w-full h-full object-contain" />
                    )
                  ) : (
                    <div className="w-full h-full flex items-center justify-center">
                      <p className="text-sm text-muted-foreground">{t('uc.previewLoading')}</p>
                    </div>
                  )}
                  <div className="absolute bottom-2 left-2 bg-black/60 text-white text-xs px-2 py-1 rounded">
                    {backgroundAsset ? t('uc.simplePreview') + ' — ' + (scenes.length > 0 ? '→ next scene' : '→ scene 1') : t('uc.simplePreview')}
                  </div>
                </div>
              );
            })()}

            {formatConfig && (contentConfig?.voiceoverUrl || scenes.length > 0) && currentStep >= 3 && (
              <RemotionPreviewPlayer
                componentName="UniversalCreatorVideo"
                customizations={buildUniversalCreatorCustomizations({
                  contentConfig,
                  subtitleConfig,
                  backgroundAsset,
                  scenes,
                  selectedMusicUrl,
                  musicVolume: audioConfig.music_volume,
                })}
                width={formatConfig.width}
                height={formatConfig.height}
                durationInFrames={computeDurationInFrames({
                  voiceoverDuration: contentConfig?.voiceoverDuration,
                  actualVoiceoverDuration: contentConfig?.actualVoiceoverDuration,
                  scenes,
                }, 30)}
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
        </div>}
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
