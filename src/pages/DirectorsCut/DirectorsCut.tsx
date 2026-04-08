import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { Card } from '@/components/ui/card';
import { saveDraft, loadDraft, clearDraft, SubtitleSafeZone, DEFAULT_SUBTITLE_SAFE_ZONE } from '@/lib/directors-cut-draft';
import { extractTimestampedFrames, extractRefinementFrames, detectBoundariesAsync, type TimestampedFrame, type DetectedBoundary } from '@/lib/directors-cut-scene-detection';
import { Button } from '@/components/ui/button';
import { 
  ArrowLeft, Film, RotateCcw
} from 'lucide-react';
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
  const [user, setUser] = useState<any>(null);
  
  const [projectId, setProjectId] = useState<string | null>(null);
  
  // Step 1: Video Import
  const [selectedVideo, setSelectedVideo] = useState<SelectedVideo | null>(null);
  
  // Scene Analysis
  const [scenes, setScenes] = useState<SceneAnalysis[]>([]);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [transitions, setTransitions] = useState<TransitionAssignment[]>([]);

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

  // --- Draft restoration on mount ---
  const draftLoadedRef = useRef(false);
  useEffect(() => {
    if (draftLoadedRef.current) return;
    draftLoadedRef.current = true;
    const draft = loadDraft();
    if (!draft || !draft.selectedVideo) return;
    setSelectedVideo(draft.selectedVideo);
    if (draft.scenes?.length) setScenes(draft.scenes);
    if (draft.transitions?.length) setTransitions(draft.transitions);
    if (draft.appliedEffects) setAppliedEffects(draft.appliedEffects);
    if (draft.audioEnhancements) setAudioEnhancements(draft.audioEnhancements);
    if (draft.exportSettings) setExportSettings(draft.exportSettings);
    if (draft.styleTransfer) setStyleTransfer(draft.styleTransfer);
    if (draft.colorGrading) setColorGrading(draft.colorGrading);
    if (draft.sceneColorGrading) setSceneColorGrading(draft.sceneColorGrading);
    if (draft.speedKeyframes) setSpeedKeyframes(draft.speedKeyframes);
    if (draft.kenBurnsKeyframes) setKenBurnsKeyframes(draft.kenBurnsKeyframes);
    if (draft.chromaKey) setChromaKey(draft.chromaKey);
    if (draft.upscaling) setUpscaling(draft.upscaling);
    if (draft.interpolation) setInterpolation(draft.interpolation);
    if (draft.restoration) setRestoration(draft.restoration);
    if (draft.objectRemoval) setObjectRemoval(draft.objectRemoval);
    if (draft.textOverlays) setTextOverlays(draft.textOverlays);
    if (draft.voiceOverUrl) setVoiceOverUrl(draft.voiceOverUrl);
    if (draft.backgroundMusicUrl) setBackgroundMusicUrl(draft.backgroundMusicUrl);
    if (draft.capCutAudioTracks) setCapCutAudioTracks(draft.capCutAudioTracks);
    if (draft.capCutSubtitleTrack) setCapCutSubtitleTrack(draft.capCutSubtitleTrack);
    if (draft.subtitleSafeZone) setSubtitleSafeZone(draft.subtitleSafeZone);
    if (draft.cleanedVideoUrl) setCleanedVideoUrl(draft.cleanedVideoUrl);
  }, []);

  // --- Auto-save draft on state changes (debounced) ---
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (!draftLoadedRef.current) return;
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(() => {
      saveDraft({
        currentStep: selectedVideo ? 10 : 1, // Always save as "in studio" if video selected
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
      });
    }, 500);
    return () => { if (saveTimerRef.current) clearTimeout(saveTimerRef.current); };
  }, [selectedVideo, scenes, transitions, appliedEffects, audioEnhancements, exportSettings, styleTransfer, colorGrading, sceneColorGrading, speedKeyframes, kenBurnsKeyframes, chromaKey, upscaling, interpolation, restoration, objectRemoval, textOverlays, voiceOverUrl, backgroundMusicUrl, capCutAudioTracks, capCutSubtitleTrack, subtitleSafeZone, cleanedVideoUrl]);

  // Dynamic video duration
  const actualTotalDuration = useMemo(() => {
    if (scenes.length === 0) return selectedVideo?.duration || 30;
    return Math.max(...scenes.map(s => s.end_time));
  }, [scenes, selectedVideo?.duration]);

  // AI Co-Pilot command handler
  const handleCoPilotCommand = useCallback((command: string, params?: Record<string, any>) => {
    switch (command) {
      case 'apply_style':
        if (params?.style) {
          setStyleTransfer({ enabled: true, style: params.style, intensity: 0.8 });
          toast.success(`Style "${params.style}" angewendet`);
        }
        break;
      case 'apply_color':
        if (params?.preset) {
          setColorGrading({ enabled: true, grade: params.preset, intensity: 0.7 });
          toast.success(`Farbkorrektur "${params.preset}" angewendet`);
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
        toast.success('Rauschunterdrückung aktiviert');
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
        name: 'Importiertes Video',
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
            project_name: selectedVideo.name || 'Unbenanntes Projekt',
          })
          .select('id')
          .single();
          
        if (error) throw error;
        setProjectId(data.id);
        return data.id;
      }
    } catch (error) {
      console.error('Error saving project:', error);
      toast.error('Fehler beim Speichern des Projekts');
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
      toast.info('Extrahiere Video-Frames für Schnitterkennung...');
      
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
        toast.info(`${timestampedFrames.length} Frames extrahiert, analysiere Übergänge...`);
        
        const coarseResult = await detectBoundariesAsync(timestampedFrames);
        
        if (coarseResult.boundaries.length > 0) {
          toast.info(`${coarseResult.boundaries.length} Kandidaten gefunden, verfeinere...`);
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
        toast.error(data.error || 'Szenenanalyse fehlgeschlagen');
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
      toast.success(`${normalizedScenes.length} Szenen erkannt`);
    } catch (error) {
      console.error('Error analyzing video:', error);
      toast.error('Fehler bei der Szenenanalyse. Bitte versuche es erneut.');
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
    toast.success('Projekt zurückgesetzt');
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
              <h1 className="text-3xl font-bold">Universal Director's Cut</h1>
              <p className="text-muted-foreground">
                Importiere ein Video und bearbeite es im Studio
              </p>
            </div>
            <Button variant="outline" onClick={() => navigate('/mediathek')}>
              <ArrowLeft className="h-4 w-4 mr-2" />
              Zur Mediathek
            </Button>
          </div>

          <div className="max-w-3xl mx-auto">
            <Card className="p-6">
              <div className="flex items-center gap-3 mb-6">
                <Film className="w-5 h-5 text-primary" />
                <div>
                  <h2 className="text-lg font-semibold">Video importieren</h2>
                  <p className="text-sm text-muted-foreground">Wähle ein Video aus deiner Mediathek oder lade ein neues hoch</p>
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
