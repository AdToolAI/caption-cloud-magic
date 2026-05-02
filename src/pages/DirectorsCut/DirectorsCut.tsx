import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { Card } from '@/components/ui/card';
import { saveDraft, loadDraft, clearDraft, consumeReloadReset, installReloadFlag, SubtitleSafeZone, DEFAULT_SUBTITLE_SAFE_ZONE } from '@/lib/directors-cut-draft';
import { extractTimestampedFrames, extractRefinementFrames, detectBoundariesAsync, type TimestampedFrame, type DetectedBoundary } from '@/lib/directors-cut-scene-detection';
import { Button } from '@/components/ui/button';
import { 
  ArrowLeft, Film, RotateCcw
} from 'lucide-react';
import { useTranslation } from '@/hooks/useTranslation';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel,
  AlertDialogContent, AlertDialogDescription, AlertDialogFooter,
  AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { CapCutEditor } from '@/components/directors-cut/studio';
import { VideoImportStep } from '@/components/directors-cut/steps/VideoImportStep';
import { AICoPilot } from '@/components/directors-cut/ui/AICoPilot';
import { useAICoPilot } from '@/hooks/useAICoPilot';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import type { KenBurnsKeyframe } from '@/components/directors-cut/features/KenBurnsEffect';
import type { 
  SelectedVideo, 
  SceneAnalysis, 
  AppliedEffects, 
  AudioEnhancements,
  ExportSettings,
  GlobalEffects,
  SceneEffects,
  TransitionAssignment,
  TextOverlay
} from '@/types/directors-cut';

export function DirectorsCut() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { t } = useTranslation();
  const [user, setUser] = useState<any>(null);
  
  const [projectId, setProjectId] = useState<string | null>(null);
  
  // Step 1: Video Import
  const [selectedVideo, setSelectedVideo] = useState<SelectedVideo | null>(null);
  
  // Scene Analysis
  const [scenes, setScenes] = useState<SceneAnalysis[]>([]);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [transitions, setTransitions] = useState<TransitionAssignment[]>([]);
  // AI-detected cut markers — propagated into the studio so scene-add / snapping
  // can use them as the canonical anchor grid.
  const [aiCutMarkers, setAiCutMarkers] = useState<Array<{ time: number; confidence?: number; source?: 'auto' | 'manual' }>>([]);

  useEffect(() => {
    if (scenes.length > 1 && transitions.length === 0) {
      const defaultTransitions: TransitionAssignment[] = scenes
        .slice(0, -1)
        .map((scene) => ({
          sceneId: scene.id,
          transitionType: 'none',
          duration: 0.5,
          aiSuggested: false,
        }));
      setTransitions(defaultTransitions);
    }
  }, [scenes]);
  
  // Visual Effects
  const [appliedEffects, setAppliedEffects] = useState<AppliedEffects>({
    global: {
      brightness: 100,
      contrast: 100,
      saturation: 100,
      sharpness: 0,
      temperature: 0,
      vignette: 0,
    },
    scenes: {},
  });
  
  // Audio
  const [audioEnhancements, setAudioEnhancements] = useState<AudioEnhancements>({
    master_volume: 100,
    noise_reduction: false,
    noise_reduction_level: 50,
    auto_ducking: false,
    ducking_level: 30,
    voice_enhancement: false,
    added_sounds: [],
  });
  
  const [voiceOverUrl, setVoiceOverUrl] = useState<string | undefined>(undefined);
  
  // Export
  const [exportSettings, setExportSettings] = useState<ExportSettings>({
    quality: 'hd',
    format: 'mp4',
    fps: 30,
    aspect_ratio: '16:9',
  });
  
  // Premium feature states
  const [styleTransfer, setStyleTransfer] = useState({
    enabled: false,
    style: null as string | null,
    intensity: 0.8,
  });
  const [colorGrading, setColorGrading] = useState({
    enabled: false,
    grade: null as string | null,
    intensity: 0.7,
  });
  const [sceneColorGrading, setSceneColorGrading] = useState<Record<string, { grade?: string | null; intensity?: number }>>({});
  const [speedKeyframes, setSpeedKeyframes] = useState<Array<{ id: string; time: number; speed: number; sceneId?: string; easing?: string }>>([]);
  const [kenBurnsKeyframes, setKenBurnsKeyframes] = useState<KenBurnsKeyframe[]>([]);
  const [chromaKey, setChromaKey] = useState({
    enabled: false,
    color: '#00ff00',
    tolerance: 30,
    backgroundUrl: undefined as string | undefined,
  });
  const [upscaling, setUpscaling] = useState({
    enabled: false,
    targetResolution: '4k',
  });
  const [interpolation, setInterpolation] = useState({
    enabled: false,
    targetFps: 60,
  });
  const [restoration, setRestoration] = useState({
    enabled: false,
    level: 'standard',
  });
  const [objectRemoval, setObjectRemoval] = useState({
    enabled: false,
    objectsCount: 0,
  });
  const [textOverlays, setTextOverlays] = useState<TextOverlay[]>([]);

  // CapCut Editor propagated state
  const [capCutAudioTracks, setCapCutAudioTracks] = useState<any[]>([]);
  const [capCutSubtitleTrack, setCapCutSubtitleTrack] = useState<any | undefined>(undefined);
  const [backgroundMusicUrl, setBackgroundMusicUrl] = useState<string | undefined>(undefined);
  const [subtitleSafeZone, setSubtitleSafeZone] = useState<SubtitleSafeZone>(DEFAULT_SUBTITLE_SAFE_ZONE);
  const [cleanedVideoUrl, setCleanedVideoUrl] = useState<string | undefined>(undefined);

  // --- On mount: real F5 reload → reset; SPA navigation → restore draft ---
  const draftLoadedRef = useRef(false);

  useEffect(() => {
    // Install beforeunload flag so we know if the *next* load is a reload
    const removeFlag = installReloadFlag();

    if (!draftLoadedRef.current) {
      draftLoadedRef.current = true;

      if (consumeReloadReset()) {
        // Real browser reload while DC was open → clear everything
        clearDraft();
      } else {
        // SPA navigation back → restore previous session
        const draft = loadDraft();
        if (draft && draft.selectedVideo) {
          setSelectedVideo(draft.selectedVideo);
          setScenes(draft.scenes || []);
          setTransitions(draft.transitions || []);
          setAppliedEffects(draft.appliedEffects || appliedEffects);
          setAudioEnhancements(draft.audioEnhancements || audioEnhancements);
          setExportSettings(draft.exportSettings || exportSettings);
          setStyleTransfer(draft.styleTransfer || styleTransfer);
          setColorGrading(draft.colorGrading || colorGrading);
          setSceneColorGrading(draft.sceneColorGrading || {});
          setSpeedKeyframes(draft.speedKeyframes || []);
          setKenBurnsKeyframes(draft.kenBurnsKeyframes || []);
          setChromaKey(draft.chromaKey || chromaKey);
          setUpscaling(draft.upscaling || upscaling);
          setInterpolation(draft.interpolation || interpolation);
          setRestoration(draft.restoration || restoration);
          setObjectRemoval(draft.objectRemoval || objectRemoval);
          setTextOverlays(draft.textOverlays || []);
          setVoiceOverUrl(draft.voiceOverUrl);
          setBackgroundMusicUrl(draft.backgroundMusicUrl);
          setCapCutAudioTracks(draft.capCutAudioTracks || []);
          setCapCutSubtitleTrack(draft.capCutSubtitleTrack);
          setSubtitleSafeZone(draft.subtitleSafeZone || DEFAULT_SUBTITLE_SAFE_ZONE);
          setCleanedVideoUrl(draft.cleanedVideoUrl);
        }
      }
    }

    return removeFlag;
  }, []);

  // --- Auto-save draft on state changes (debounced) + flush on unmount ---
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const latestSnapshotRef = useRef<Parameters<typeof saveDraft>[0] | null>(null);

  // Keep a ref to the latest snapshot so we can flush it synchronously on unmount
  const currentSnapshot = useMemo(() => ({
    currentStep: selectedVideo ? 10 : 1,
    selectedVideo,
    scenes,
    transitions,
    appliedEffects,
    audioEnhancements,
    exportSettings,
    styleTransfer,
    colorGrading,
    sceneColorGrading,
    speedKeyframes,
    kenBurnsKeyframes,
    chromaKey,
    upscaling,
    interpolation,
    restoration,
    objectRemoval,
    textOverlays,
    voiceOverUrl,
    backgroundMusicUrl,
    capCutAudioTracks,
    capCutSubtitleTrack,
    subtitleSafeZone,
    cleanedVideoUrl,
  }), [selectedVideo, scenes, transitions, appliedEffects, audioEnhancements, exportSettings, styleTransfer, colorGrading, sceneColorGrading, speedKeyframes, kenBurnsKeyframes, chromaKey, upscaling, interpolation, restoration, objectRemoval, textOverlays, voiceOverUrl, backgroundMusicUrl, capCutAudioTracks, capCutSubtitleTrack, subtitleSafeZone, cleanedVideoUrl]);

  latestSnapshotRef.current = currentSnapshot;

  useEffect(() => {
    if (!draftLoadedRef.current) return;
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(() => {
      saveDraft(currentSnapshot);
    }, 500);
    return () => {
      // On unmount (navigating away): flush the latest state immediately
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
      if (latestSnapshotRef.current) {
        saveDraft(latestSnapshotRef.current);
      }
    };
  }, [currentSnapshot]);

  // Original (source) video duration — never changes based on scene edits.
  // Used to decide whether a new/empty scene should pass-through the source
  // or render as a true blackscreen placeholder beyond the source.
  const originalVideoDuration = useMemo(() => {
    return selectedVideo?.duration || 0;
  }, [selectedVideo?.duration]);

  // Timeline (composite) duration — extends beyond the source when scenes
  // are appended (e.g. uploaded clips) but never shrinks below the source.
  const actualTotalDuration = useMemo(() => {
    const base = originalVideoDuration || 30;
    if (scenes.length === 0) return base;
    return Math.max(base, ...scenes.map(s => s.end_time));
  }, [scenes, originalVideoDuration]);

  // AI Co-Pilot command handler
  const handleCoPilotCommand = useCallback((command: string, params?: Record<string, any>) => {
    switch (command) {
      case 'apply_style':
        if (params?.style) {
          setStyleTransfer({ enabled: true, style: params.style, intensity: 0.8 });
          toast.success(t('dc.styleApplied', { style: params.style }));
        }
        break;
      case 'apply_color':
        if (params?.preset) {
          setColorGrading({ enabled: true, grade: params.preset, intensity: 0.7 });
          toast.success(t('dc.colorCorrectionApplied', { preset: params.preset }));
        }
        break;
      case 'adjust_volume':
        if (params?.change) {
          setAudioEnhancements(prev => ({
            ...prev,
            master_volume: Math.max(0, Math.min(200, prev.master_volume + params.change * 100)),
          }));
        }
        break;
      case 'noise_reduction':
        setAudioEnhancements(prev => ({ ...prev, noise_reduction: true }));
        toast.success(t('dc.noiseReductionActivated'));
        break;
      case 'export':
        if (params?.quality === '4k') {
          setExportSettings(prev => ({ ...prev, quality: '4k' }));
        }
        break;
    }
  }, []);

  // AI Co-Pilot
  const coPilot = useAICoPilot({
    context: {
      currentStep: selectedVideo ? 10 : 1,
      scenesCount: scenes.length,
      hasTransitions: transitions.length > 0,
      hasEffects: styleTransfer.enabled || colorGrading.enabled,
      videoDuration: selectedVideo?.duration || 0,
      videoUrl: selectedVideo?.url,
    },
    onCommand: handleCoPilotCommand,
  });

  useEffect(() => {
    const checkAuth = async () => {
      const { data: { user: authUser } } = await supabase.auth.getUser();
      if (!authUser) {
        navigate('/auth');
        return;
      }
      setUser(authUser);
    };
    checkAuth();
    
    const sourceVideoUrl = searchParams.get('source_video');
    const sourceProjectId = searchParams.get('project_id');
    
    if (sourceVideoUrl) {
      setSelectedVideo({
        id: sourceProjectId || undefined,
        url: sourceVideoUrl,
        name: t('dc.importedVideo'),
        source: 'universal_creator',
      });
    }
  }, [searchParams, navigate]);

  const saveProject = async () => {
    if (!user || !selectedVideo) return null;
    
    try {
      if (projectId) {
        const { error } = await supabase
          .from('director_cut_projects')
          .update({
            source_video_url: selectedVideo.url,
            source_video_id: selectedVideo.id || null,
            duration_seconds: selectedVideo.duration || null,
            scene_analysis: scenes as any,
            applied_effects: appliedEffects as any,
            audio_enhancements: audioEnhancements as any,
            export_settings: exportSettings as any,
            updated_at: new Date().toISOString(),
          })
          .eq('id', projectId);
          
        if (error) throw error;
        return projectId;
      } else {
        const { data, error } = await supabase
          .from('director_cut_projects')
          .insert({
            user_id: user.id,
            source_video_url: selectedVideo.url,
            source_video_id: selectedVideo.id || null,
            duration_seconds: selectedVideo.duration || null,
            project_name: selectedVideo.name || t('dc.untitledProject'),
          })
          .select('id')
          .single();
          
        if (error) throw error;
        setProjectId(data.id);
        return data.id;
      }
    } catch (error) {
      console.error('Error saving project:', error);
      toast.error(t('dc.errorSavingProject'));
      return null;
    }
  };

  // Measure real video duration from URL
  const measureVideoDuration = (url: string): Promise<number> => {
    return new Promise((resolve) => {
      const video = document.createElement('video');
      video.preload = 'metadata';
      video.onloadedmetadata = () => {
        const dur = video.duration;
        video.src = '';
        resolve(isFinite(dur) && dur > 0 ? dur : 0);
      };
      video.onerror = () => {
        video.src = '';
        resolve(0);
      };
      video.src = url;
    });
  };

  const handleStartAnalysis = async () => {
    if (!selectedVideo) return;
    
    setIsAnalyzing(true);
    
    try {
      toast.info(t('dc.extractingFrames'));
      
      let canonicalDuration = selectedVideo.duration || 0;
      if (!canonicalDuration) {
        const measured = await measureVideoDuration(selectedVideo.url);
        if (measured > 0) {
          canonicalDuration = measured;
          setSelectedVideo(prev => prev ? { ...prev, duration: measured } : prev);
        } else {
          canonicalDuration = 30;
        }
      }
      
      let timestampedFrames: TimestampedFrame[] = [];
      let detectedBoundaries: DetectedBoundary[] = [];
      
      try {
        timestampedFrames = await extractTimestampedFrames(selectedVideo.url, canonicalDuration);
        toast.info(t('dc.framesExtracted', { count: timestampedFrames.length }));
        
        const coarseResult = await detectBoundariesAsync(timestampedFrames);
        
        if (coarseResult.boundaries.length > 0) {
          toast.info(t('dc.candidatesFound', { count: coarseResult.boundaries.length }));
          try {
            const refinementFrames = await extractRefinementFrames(
              selectedVideo.url, canonicalDuration,
              coarseResult.boundaries.map(b => b.time)
            );
            const refined = await detectBoundariesAsync(timestampedFrames, refinementFrames);
            detectedBoundaries = refined.boundaries;
          } catch {
            detectedBoundaries = coarseResult.boundaries;
          }
        } else {
          detectedBoundaries = coarseResult.boundaries;
        }
      } catch (frameError) {
        console.warn('[DirectorsCut] Frame extraction failed:', frameError);
      }
      
      const framesForAI: Array<{ time: number; image: string }> = [];
      if (timestampedFrames.length > 0) {
        for (const boundary of detectedBoundaries) {
          const beforeIdx = timestampedFrames.findIndex(f => f.time >= boundary.time) - 1;
          const afterIdx = timestampedFrames.findIndex(f => f.time >= boundary.time);
          if (beforeIdx >= 0) framesForAI.push(timestampedFrames[beforeIdx]);
          if (afterIdx >= 0 && afterIdx < timestampedFrames.length) framesForAI.push(timestampedFrames[afterIdx]);
        }
        
        const boundaryTimes = [0, ...detectedBoundaries.map(b => b.time), canonicalDuration];
        for (let s = 0; s < boundaryTimes.length - 1; s++) {
          const midTime = (boundaryTimes[s] + boundaryTimes[s + 1]) / 2;
          const closest = timestampedFrames.reduce((best, f) => 
            Math.abs(f.time - midTime) < Math.abs(best.time - midTime) ? f : best
          );
          if (!framesForAI.find(f => Math.abs(f.time - closest.time) < 0.3)) {
            framesForAI.push(closest);
          }
        }
        
        framesForAI.sort((a, b) => a.time - b.time);
      }
      
      const sceneBoundaries = detectedBoundaries.map(b => ({
        time: b.time,
        type: b.type,
        score: b.score,
      }));
      
      const clientExtractionFailed = timestampedFrames.length === 0;
      
      const { data, error } = await supabase.functions.invoke('analyze-video-scenes', {
        body: {
          video_url: selectedVideo.url,
          duration: canonicalDuration,
          frames: framesForAI.length > 0 ? framesForAI : undefined,
          scene_boundaries: sceneBoundaries,
          client_extraction_failed: clientExtractionFailed,
        },
      });
      
      if (error) throw error;
      
      if (data?.ok === false) {
        toast.error(data.error || t('dc.sceneAnalysisFailed'));
        setIsAnalyzing(false);
        return;
      }
      
      const rawScenes = data.scenes || [];
      const sortedScenes = [...rawScenes].sort((a: any, b: any) => a.start_time - b.start_time);
      
      const MIN_SCENE_DURATION = 3.0;
      const stableScenes: any[] = [];
      for (const scene of sortedScenes) {
        const dur = (scene.end_time || 0) - (scene.start_time || 0);
        if (dur < MIN_SCENE_DURATION && stableScenes.length > 0) {
          stableScenes[stableScenes.length - 1].end_time = scene.end_time;
        } else {
          stableScenes.push({ ...scene });
        }
      }
      
      const normalizedScenes: SceneAnalysis[] = [];
      let currentTimelinePosition = 0;

      for (let i = 0; i < stableScenes.length; i++) {
        const scene = stableScenes[i];
        const originalDuration = scene.end_time - scene.start_time;
        const safeDuration = Math.max(0.5, originalDuration);
        const timelineStart = currentTimelinePosition;
        const timelineEnd = currentTimelinePosition + safeDuration;
        
        normalizedScenes.push({
          ...scene,
          id: `scene-${i + 1}`,
          start_time: timelineStart,
          end_time: timelineEnd,
          original_start_time: scene.original_start_time ?? scene.start_time,
          original_end_time: scene.original_end_time ?? scene.end_time,
          playbackRate: 1.0,
        });
        
        currentTimelinePosition = timelineEnd;
      }
      
      setScenes(normalizedScenes);
      setAiCutMarkers(detectedBoundaries.map(b => ({
        time: b.time,
        confidence: Math.min(1, Math.max(0, b.score ?? 0.7)),
        source: 'auto' as const,
      })));
      toast.success(t('dc.scenesDetected', { count: normalizedScenes.length }));
    } catch (error) {
      console.error('Error analyzing video:', error);
      toast.error(t('dc.sceneAnalysisError'));
    } finally {
      setIsAnalyzing(false);
    }
  };

  // Reset entire project
  const handleResetProject = useCallback(() => {
    clearDraft();
    setSelectedVideo(null);
    setScenes([]);
    setTransitions([]);
    setAppliedEffects({ global: { brightness: 100, contrast: 100, saturation: 100, sharpness: 0, temperature: 0, vignette: 0 }, scenes: {} });
    setAudioEnhancements({ master_volume: 100, noise_reduction: false, noise_reduction_level: 50, auto_ducking: false, ducking_level: 30, voice_enhancement: false, added_sounds: [] });
    setExportSettings({ quality: 'hd', format: 'mp4', fps: 30, aspect_ratio: '16:9' });
    setStyleTransfer({ enabled: false, style: null, intensity: 0.8 });
    setColorGrading({ enabled: false, grade: null, intensity: 0.7 });
    setSceneColorGrading({});
    setSpeedKeyframes([]);
    setKenBurnsKeyframes([]);
    setChromaKey({ enabled: false, color: '#00ff00', tolerance: 30, backgroundUrl: undefined });
    setUpscaling({ enabled: false, targetResolution: '4k' });
    setInterpolation({ enabled: false, targetFps: 60 });
    setRestoration({ enabled: false, level: 'standard' });
    setObjectRemoval({ enabled: false, objectsCount: 0 });
    setTextOverlays([]);
    setVoiceOverUrl(undefined);
    setBackgroundMusicUrl(undefined);
    setCapCutAudioTracks([]);
    setCapCutSubtitleTrack(undefined);
    setSubtitleSafeZone(DEFAULT_SUBTITLE_SAFE_ZONE);
    toast.success(t('dc.projectReset'));
  }, []);

  // Two modes: Import (no video) or Studio (video selected)
  const isInStudio = !!selectedVideo;

  return (
    <div className="min-h-screen bg-background">
      {/* IMPORT MODE: Show video import screen */}
      {!isInStudio && (
        <div className="container mx-auto px-4 py-6">
          <div className="flex items-center justify-between mb-6">
            <div>
              <h1 className="text-3xl font-bold">{t('dc.pageTitle')}</h1>
              <p className="text-muted-foreground">
                {t('dc.importSubtitle')}
              </p>
            </div>
            <Button variant="outline" onClick={() => navigate('/mediathek')}>
              <ArrowLeft className="h-4 w-4 mr-2" />
              {t('dc.toMediaLibrary')}
            </Button>
          </div>

          <div className="max-w-3xl mx-auto">
            <Card className="p-6">
              <div className="flex items-center gap-3 mb-6">
                <Film className="w-5 h-5 text-primary" />
                <div>
                  <h2 className="text-lg font-semibold">{t('dc.importVideo')}</h2>
                  <p className="text-sm text-muted-foreground">{t('dc.importVideoDesc')}</p>
                </div>
              </div>
              
              <VideoImportStep selectedVideo={selectedVideo} onVideoSelect={(video) => {
                setSelectedVideo(video);
                if (video) {
                  saveProject();
                }
              }} />
            </Card>
          </div>
        </div>
      )}

      {/* STUDIO MODE: Full CapCut Editor */}
      {isInStudio && (
        <CapCutEditor
          videoUrl={selectedVideo.url}
          videoDuration={actualTotalDuration}
          originalVideoDuration={originalVideoDuration || actualTotalDuration}
          scenes={scenes}
          audioEnhancements={audioEnhancements}
          onAudioChange={setAudioEnhancements}
          onScenesUpdate={setScenes}
          voiceOverUrl={voiceOverUrl}
          // Visual effects
          textOverlays={textOverlays}
          onTextOverlaysChange={setTextOverlays}
          appliedEffects={appliedEffects}
          transitions={transitions}
          onTransitionsChange={setTransitions}
          colorGrading={colorGrading}
          sceneColorGrading={sceneColorGrading}
          styleTransfer={styleTransfer}
          speedKeyframes={speedKeyframes}
          kenBurns={kenBurnsKeyframes}
          // New studio props
          onEffectsChange={(global) => setAppliedEffects(prev => ({ ...prev, global }))}
          onSceneEffectsChange={(scenes) => setAppliedEffects(prev => ({ ...prev, scenes }))}
          onColorGradingChange={(enabled, grade, intensity) => setColorGrading(prev => ({ ...prev, enabled, grade, intensity: intensity ?? prev.intensity }))}
          onStyleTransferChange={(enabled, style) => setStyleTransfer(prev => ({ ...prev, enabled, style }))}
          chromaKey={chromaKey}
          onChromaKeyChange={(ck) => setChromaKey({ ...ck, backgroundUrl: ck.backgroundUrl ?? undefined })}
          upscaling={upscaling}
          onUpscalingChange={(enabled, resolution) => setUpscaling({ enabled, targetResolution: resolution })}
          interpolation={interpolation}
          onInterpolationChange={(enabled, fps) => setInterpolation({ enabled, targetFps: fps })}
          restoration={restoration}
          onRestorationChange={(enabled, level) => setRestoration({ enabled, level })}
          exportSettings={exportSettings}
          onExportSettingsChange={setExportSettings}
          isAnalyzing={isAnalyzing}
          onStartAnalysis={handleStartAnalysis}
          onVoiceOverGenerated={setVoiceOverUrl}
          // Callbacks for propagation
          onAudioTracksChange={setCapCutAudioTracks}
          onSubtitleTrackChange={setCapCutSubtitleTrack}
          onBackgroundMusicUrlChange={setBackgroundMusicUrl}
          initialSubtitleTrack={capCutSubtitleTrack}
          projectId={projectId}
          onCleanedVideoUrlChange={(url) => setCleanedVideoUrl(url || undefined)}
          onSaveProject={saveProject}
          subtitleSafeZone={subtitleSafeZone}
          onSubtitleSafeZoneChange={setSubtitleSafeZone}
          // Reset + navigation
          onResetProject={handleResetProject}
          onBackToImport={() => setSelectedVideo(null)}
        />
      )}

      {/* AI Co-Pilot */}
      <AICoPilot
        isOpen={coPilot.isOpen}
        onOpenChange={coPilot.setIsOpen}
        messages={coPilot.messages}
        suggestions={coPilot.suggestions}
        isProcessing={coPilot.isProcessing}
        onSendMessage={coPilot.sendMessage}
        onDismissSuggestion={coPilot.dismissSuggestion}
        onExecuteSuggestion={coPilot.executeSuggestionAction}
        onClearMessages={coPilot.clearMessages}
      />
    </div>
  );
}
