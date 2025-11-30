import { useState, useEffect, useCallback } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { 
  ArrowLeft, ArrowRight, Film, Sparkles, Scissors, Wand2, 
  Palette, Zap, ArrowUpCircle, Volume2, Mic, Download, Check, Play
} from 'lucide-react';
import { motion } from 'framer-motion';
import { VideoImportStep } from '@/components/directors-cut/steps/VideoImportStep';
import { SceneAnalysisStep } from '@/components/directors-cut/steps/SceneAnalysisStep';
import { SceneEditingStep } from '@/components/directors-cut/steps/SceneEditingStep';
import { StyleLookStep } from '@/components/directors-cut/steps/StyleLookStep';
import { ColorCorrectionStep } from '@/components/directors-cut/steps/ColorCorrectionStep';
import { SpecialEffectsStep } from '@/components/directors-cut/steps/SpecialEffectsStep';
import { MotionEffectsStep } from '@/components/directors-cut/steps/MotionEffectsStep';
import { QualityEnhancementStep } from '@/components/directors-cut/steps/QualityEnhancementStep';
import { AudioEnhancementStep } from '@/components/directors-cut/steps/AudioEnhancementStep';
import { VoiceOverStep } from '@/components/directors-cut/steps/VoiceOverStep';
import { ExportRenderStep } from '@/components/directors-cut/steps/ExportRenderStep';
import { DirectorsCutPreviewPlayer } from '@/components/directors-cut/DirectorsCutPreviewPlayer';
import { AICoPilot } from '@/components/directors-cut/ui/AICoPilot';
import { useAICoPilot } from '@/hooks/useAICoPilot';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
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

// 11-Step Configuration with Groups
const STEPS = [
  { id: 1, title: 'Import', icon: Film, group: 'start', description: 'Video auswählen' },
  { id: 2, title: 'KI-Analyse', icon: Sparkles, group: 'start', description: 'Szenen & Auto-Cut' },
  { id: 3, title: 'Szenen', icon: Scissors, group: 'edit', description: 'Manuelle Bearbeitung' },
  { id: 4, title: 'Style', icon: Wand2, group: 'look', description: 'Visueller Stil' },
  { id: 5, title: 'Farbe', icon: Palette, group: 'look', description: 'Farbkorrektur' },
  { id: 6, title: 'VFX', icon: Zap, group: 'look', description: 'Objekt & Cropping' },
  { id: 7, title: 'Motion', icon: Play, group: 'look', description: 'Green Screen & Speed' },
  { id: 8, title: 'Qualität', icon: ArrowUpCircle, group: 'enhance', description: 'KI-Upscaling' },
  { id: 9, title: 'Audio', icon: Volume2, group: 'audio', description: 'Ton & Sound Design' },
  { id: 10, title: 'Voice', icon: Mic, group: 'audio', description: 'KI Voice-Over' },
  { id: 11, title: 'Export', icon: Download, group: 'final', description: 'Video rendern' },
];

const STEP_GROUPS = [
  { id: 'start', label: 'Start', steps: [1, 2] },
  { id: 'edit', label: 'Schnitt', steps: [3] },
  { id: 'look', label: 'Look', steps: [4, 5, 6, 7] },
  { id: 'enhance', label: 'Enhance', steps: [8] },
  { id: 'audio', label: 'Audio', steps: [9, 10] },
  { id: 'final', label: 'Export', steps: [11] },
];

export function DirectorsCut() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [user, setUser] = useState<any>(null);
  
  const [currentStep, setCurrentStep] = useState(1);
  const [projectId, setProjectId] = useState<string | null>(null);
  
  // Step 1: Video Import
  const [selectedVideo, setSelectedVideo] = useState<SelectedVideo | null>(null);
  
  // Step 2: Scene Analysis
  const [scenes, setScenes] = useState<SceneAnalysis[]>([]);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [transitions, setTransitions] = useState<TransitionAssignment[]>([]);

  useEffect(() => {
    console.log('[DirectorsCut] transitions state changed:', transitions);
  }, [transitions]);

  useEffect(() => {
    if (scenes.length > 1 && transitions.length === 0) {
      const defaultTransitions: TransitionAssignment[] = scenes
        .slice(0, -1)
        .map((scene) => ({
          sceneId: scene.id,
          transitionType: 'crossfade',
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
  
  const [currentTime, setCurrentTime] = useState(0);
  
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
  const [speedKeyframes, setSpeedKeyframes] = useState<Array<{ time: number; speed: number }>>([]);
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

  // AI Co-Pilot command handler
  const handleCoPilotCommand = useCallback((command: string, params?: Record<string, any>) => {
    switch (command) {
      case 'analyze_scenes':
        if (currentStep !== 2) setCurrentStep(2);
        toast.info('Szenenanalyse wird gestartet...');
        break;
      case 'generate_transitions':
        if (currentStep !== 2 && currentStep !== 3) setCurrentStep(2);
        toast.info('KI-Übergänge werden generiert...');
        break;
      case 'auto_cut':
        if (currentStep !== 2) setCurrentStep(2);
        toast.info('Auto-Cut wird aktiviert...');
        break;
      case 'apply_style':
        setCurrentStep(4);
        if (params?.style) {
          setStyleTransfer({ enabled: true, style: params.style, intensity: 0.8 });
          toast.success(`Style "${params.style}" angewendet`);
        }
        break;
      case 'open_styles':
        setCurrentStep(4);
        break;
      case 'apply_color':
        setCurrentStep(5);
        if (params?.preset) {
          setColorGrading({ enabled: true, grade: params.preset, intensity: 0.7 });
          toast.success(`Farbkorrektur "${params.preset}" angewendet`);
        }
        break;
      case 'open_color':
        setCurrentStep(5);
        break;
      case 'adjust_volume':
        setCurrentStep(9);
        if (params?.change) {
          setAudioEnhancements(prev => ({
            ...prev,
            master_volume: Math.max(0, Math.min(200, prev.master_volume + params.change * 100)),
          }));
        }
        break;
      case 'noise_reduction':
        setCurrentStep(9);
        setAudioEnhancements(prev => ({ ...prev, noise_reduction: true }));
        toast.success('Rauschunterdrückung aktiviert');
        break;
      case 'export':
        setCurrentStep(11);
        if (params?.quality === '4k') {
          setExportSettings(prev => ({ ...prev, quality: '4k' }));
        }
        break;
      case 'open_export':
        setCurrentStep(11);
        break;
      case 'next_step':
        if (currentStep < STEPS.length) setCurrentStep(currentStep + 1);
        break;
      case 'prev_step':
        if (currentStep > 1) setCurrentStep(currentStep - 1);
        break;
    }
  }, [currentStep]);

  // AI Co-Pilot
  const coPilot = useAICoPilot({
    context: {
      currentStep,
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

  const extractVideoFrames = async (videoUrl: string, duration: number): Promise<string[]> => {
    return new Promise((resolve, reject) => {
      const video = document.createElement('video');
      video.crossOrigin = 'anonymous';
      video.preload = 'metadata';
      
      video.onerror = () => resolve([]);
      
      video.onloadedmetadata = async () => {
        const frames: string[] = [];
        const frameCount = Math.min(40, Math.ceil(duration * 2));
        
        const canvas = document.createElement('canvas');
        canvas.width = 512;
        canvas.height = 288;
        const ctx = canvas.getContext('2d');
        
        if (!ctx) {
          resolve([]);
          return;
        }
        
        try {
          for (let i = 0; i < frameCount; i++) {
            const time = i * 0.5;
            video.currentTime = time;
            
            await new Promise<void>((seekResolve) => {
              video.onseeked = () => seekResolve();
            });
            
            ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
            const frameData = canvas.toDataURL('image/jpeg', 0.6);
            frames.push(frameData);
          }
        } catch (frameError) {
          console.error('[extractVideoFrames] Frame extraction error:', frameError);
        }
        
        resolve(frames);
      };
      
      video.src = videoUrl;
    });
  };

  const handleStartAnalysis = async () => {
    if (!selectedVideo) return;
    
    setIsAnalyzing(true);
    
    try {
      toast.info('Extrahiere Video-Frames für KI-Analyse...');
      const frames = await extractVideoFrames(selectedVideo.url, selectedVideo.duration || 30);
      
      const { data, error } = await supabase.functions.invoke('analyze-video-scenes', {
        body: {
          video_url: selectedVideo.url,
          duration: selectedVideo.duration || 30,
          frames: frames.length > 0 ? frames : undefined,
        },
      });
      
      if (error) throw error;
      
      const rawScenes = data.scenes || [];
      const sortedScenes = [...rawScenes].sort((a: any, b: any) => a.start_time - b.start_time);
      
      const normalizedScenes: SceneAnalysis[] = [];
      let currentTimelinePosition = 0;
      const videoDuration = selectedVideo.duration || 30;

      for (let i = 0; i < sortedScenes.length; i++) {
        const scene = sortedScenes[i];
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

      if (normalizedScenes.length > 0) {
        const lastIdx = normalizedScenes.length - 1;
        if (normalizedScenes[lastIdx].end_time > videoDuration) {
          normalizedScenes[lastIdx].end_time = videoDuration;
          normalizedScenes[lastIdx].original_end_time = videoDuration;
        }
      }
      
      setScenes(normalizedScenes);
      toast.success(`${normalizedScenes.length || 0} Szenen erkannt (Vision AI)`);
    } catch (error) {
      console.error('Error analyzing video:', error);
      toast.error('Fehler bei der Szenenanalyse');
      
      const mockScenes: SceneAnalysis[] = [
        {
          id: '1',
          start_time: 0,
          end_time: 5,
          original_start_time: 0,
          original_end_time: 5,
          playbackRate: 1.0,
          description: 'Eröffnungsszene',
          mood: 'neutral',
          suggested_effects: [{ type: 'filter', name: 'cinematic', reason: 'Professioneller Look', confidence: 0.85 }],
          ai_suggestions: ['Cinematic Filter für professionellen Look empfohlen'],
        },
        {
          id: '2',
          start_time: 5,
          end_time: 15,
          original_start_time: 5,
          original_end_time: 15,
          playbackRate: 1.0,
          description: 'Hauptinhalt',
          mood: 'dynamic',
          suggested_effects: [{ type: 'filter', name: 'vibrant', reason: 'Erhöht visuelle Wirkung', confidence: 0.78 }],
          ai_suggestions: ['Erhöhte Sättigung für mehr Lebendigkeit'],
        },
        {
          id: '3',
          start_time: 15,
          end_time: 30,
          original_start_time: 15,
          original_end_time: 30,
          playbackRate: 1.0,
          description: 'Abschluss',
          mood: 'calm',
          suggested_effects: [{ type: 'filter', name: 'warm', reason: 'Warmes Finish', confidence: 0.82 }],
          ai_suggestions: ['Warme Töne für emotionalen Abschluss'],
        },
      ];
      setScenes(mockScenes);
    } finally {
      setIsAnalyzing(false);
    }
  };

  const handleApplySuggestions = (effects: Partial<GlobalEffects>, sceneEffects?: Record<string, SceneEffects>) => {
    setAppliedEffects(prev => ({
      ...prev,
      global: { ...prev.global, ...effects },
      scenes: sceneEffects ? { ...prev.scenes, ...sceneEffects } : prev.scenes,
    }));
  };

  const canProceed = () => {
    switch (currentStep) {
      case 1: return selectedVideo !== null;
      case 2: return scenes.length > 0;
      default: return true;
    }
  };

  const handleNext = async () => {
    if (currentStep === 1 && selectedVideo) {
      await saveProject();
    }
    if (currentStep < STEPS.length) {
      setCurrentStep(currentStep + 1);
    }
  };

  const handleBack = () => {
    if (currentStep > 1) {
      setCurrentStep(currentStep - 1);
    }
  };

  const renderStepContent = () => {
    switch (currentStep) {
      case 1:
        return <VideoImportStep selectedVideo={selectedVideo} onVideoSelect={setSelectedVideo} />;
      case 2:
        return (
          <SceneAnalysisStep
            videoUrl={selectedVideo?.url || ''}
            videoDuration={selectedVideo?.duration || 30}
            scenes={scenes}
            onScenesUpdate={setScenes}
            isAnalyzing={isAnalyzing}
            onStartAnalysis={handleStartAnalysis}
            onApplySuggestions={handleApplySuggestions}
            appliedEffects={appliedEffects.global}
            sceneEffects={appliedEffects.scenes}
            transitions={transitions}
            onTransitionsChange={setTransitions}
          />
        );
      case 3:
        return (
          <SceneEditingStep
            videoUrl={selectedVideo?.url || ''}
            videoDuration={selectedVideo?.duration || 30}
            scenes={scenes}
            onScenesUpdate={setScenes}
            transitions={transitions}
            onTransitionsChange={setTransitions}
          />
        );
      case 4:
        return (
          <StyleLookStep
            effects={appliedEffects.global}
            sceneEffects={appliedEffects.scenes}
            onEffectsChange={(global) => setAppliedEffects({ ...appliedEffects, global })}
            onSceneEffectsChange={(sceneEffects) => setAppliedEffects({ ...appliedEffects, scenes: sceneEffects })}
            scenes={scenes}
            videoUrl={selectedVideo?.url || ''}
            videoDuration={selectedVideo?.duration || 30}
            transitions={transitions}
            audio={audioEnhancements}
            onStyleTransferChange={(enabled, style) => setStyleTransfer(prev => ({ ...prev, enabled, style }))}
          />
        );
      case 5:
        return (
          <ColorCorrectionStep
            effects={appliedEffects.global}
            sceneEffects={appliedEffects.scenes}
            onEffectsChange={(global) => setAppliedEffects({ ...appliedEffects, global })}
            onSceneEffectsChange={(sceneEffects) => setAppliedEffects({ ...appliedEffects, scenes: sceneEffects })}
            scenes={scenes}
            videoUrl={selectedVideo?.url || ''}
            videoDuration={selectedVideo?.duration || 30}
            transitions={transitions}
            audio={audioEnhancements}
            onColorGradingChange={(enabled, grade, intensity) => setColorGrading(prev => ({ ...prev, enabled, grade, intensity: intensity ?? prev.intensity }))}
            colorGrading={colorGrading}
          />
        );
      case 6:
        return (
          <SpecialEffectsStep
            videoUrl={selectedVideo?.url || ''}
            videoDuration={selectedVideo?.duration || 30}
            currentTime={currentTime}
            textOverlays={textOverlays}
            onTextOverlaysChange={setTextOverlays}
            scenes={scenes}
            selectedSceneId={null}
            onSceneSelect={() => {}}
            globalEffects={appliedEffects.global}
            sceneEffects={appliedEffects.scenes}
            transitions={transitions}
            audio={audioEnhancements}
          />
        );
      case 7:
        return (
          <MotionEffectsStep
            videoUrl={selectedVideo?.url || ''}
            videoDuration={selectedVideo?.duration || 30}
            currentTime={currentTime}
          />
        );
      case 8:
        return (
          <QualityEnhancementStep
            onUpscalingChange={(enabled, resolution) => setUpscaling({ enabled, targetResolution: resolution })}
            onInterpolationChange={(enabled, fps) => setInterpolation({ enabled, targetFps: fps })}
            onRestorationChange={(enabled, level) => setRestoration({ enabled, level })}
          />
        );
      case 9:
        return (
          <AudioEnhancementStep
            audio={audioEnhancements}
            onAudioChange={setAudioEnhancements}
            videoUrl={selectedVideo?.url || ''}
            scenes={scenes}
          />
        );
      case 10:
        return (
          <VoiceOverStep
            onVoiceOverGenerated={setVoiceOverUrl}
          />
        );
      case 11:
        return (
          <ExportRenderStep
            exportSettings={exportSettings}
            onExportSettingsChange={setExportSettings}
            videoUrl={selectedVideo?.url || ''}
            effects={appliedEffects.global}
            audio={audioEnhancements}
            scenes={scenes}
            voiceOverUrl={voiceOverUrl}
            videoDuration={selectedVideo?.duration}
            premiumFeatures={{ styleTransfer, colorGrading, upscaling, interpolation, restoration, objectRemoval }}
            onRender={() => console.log('Render started')}
          />
        );
      default:
        return null;
    }
  };

  return (
    <div className="min-h-screen bg-background">
      <div className="container mx-auto px-4 py-6">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-3xl font-bold">Universal Director's Cut</h1>
            <p className="text-muted-foreground">
              Professionelle Video-Nachbearbeitung mit KI-Unterstützung
            </p>
          </div>
          <Button variant="outline" onClick={() => navigate(-1)}>
            Zurück
          </Button>
        </div>

        {/* Modern 2026 Professional Stepper */}
        <div className="mb-8 px-2">
          {/* Progress Line Container */}
          <div className="relative">
            {/* Background Progress Track */}
            <div className="absolute top-6 left-8 right-8 h-0.5 bg-border/50 rounded-full" />
            
            {/* Animated Progress Fill */}
            <motion.div 
              className="absolute top-6 left-8 h-0.5 bg-gradient-to-r from-primary via-primary to-primary/60 rounded-full"
              initial={{ width: '0%' }}
              animate={{ width: `${((currentStep - 1) / (STEPS.length - 1)) * 100}%` }}
              transition={{ duration: 0.5, ease: 'easeOut' }}
              style={{ maxWidth: 'calc(100% - 4rem)' }}
            />
            
            {/* Step Cards */}
            <div className="relative flex justify-between">
              {STEPS.map((step, index) => {
                const Icon = step.icon;
                const isActive = currentStep === step.id;
                const isCompleted = currentStep > step.id;
                const isUpcoming = currentStep < step.id;
                
                return (
                  <motion.button
                    key={step.id}
                    onClick={() => setCurrentStep(step.id)}
                    className="relative flex flex-col items-center group"
                    whileHover={{ scale: 1.05 }}
                    whileTap={{ scale: 0.98 }}
                  >
                    {/* Step Circle */}
                    <motion.div
                      className={`
                        relative w-12 h-12 rounded-xl flex items-center justify-center
                        backdrop-blur-xl border transition-all duration-300 cursor-pointer
                        ${isActive ? 'bg-primary text-primary-foreground border-primary shadow-lg shadow-primary/30' : ''}
                        ${isCompleted ? 'bg-primary/15 text-primary border-primary/30 hover:bg-primary/25' : ''}
                        ${isUpcoming ? 'bg-card/50 text-muted-foreground border-border/50 hover:border-border hover:bg-card/80' : ''}
                      `}
                      initial={false}
                      animate={isActive ? { scale: 1.1 } : { scale: 1 }}
                      transition={{ duration: 0.2 }}
                    >
                      {isCompleted ? (
                        <Check className="w-5 h-5" />
                      ) : (
                        <Icon className="w-5 h-5" />
                      )}
                      
                      {/* Active Pulsing Ring */}
                      {isActive && (
                        <motion.div 
                          className="absolute inset-0 rounded-xl border-2 border-primary"
                          animate={{ 
                            opacity: [0.3, 0.8, 0.3],
                            scale: [1, 1.08, 1]
                          }}
                          transition={{ 
                            duration: 2, 
                            repeat: Infinity,
                            ease: 'easeInOut'
                          }}
                        />
                      )}
                      
                      {/* Step Number Badge */}
                      <span className={`
                        absolute -top-1 -right-1 w-4 h-4 rounded-full text-[10px] font-bold
                        flex items-center justify-center
                        ${isActive ? 'bg-primary-foreground text-primary' : ''}
                        ${isCompleted ? 'bg-primary text-primary-foreground' : ''}
                        ${isUpcoming ? 'bg-muted text-muted-foreground' : ''}
                      `}>
                        {step.id}
                      </span>
                    </motion.div>
                    
                    {/* Label */}
                    <motion.div 
                      className="mt-2 text-center"
                      initial={false}
                      animate={{ 
                        opacity: isActive ? 1 : 0.7,
                        y: isActive ? 0 : 2
                      }}
                    >
                      <span className={`
                        text-xs font-medium block
                        ${isActive ? 'text-primary' : ''}
                        ${isCompleted ? 'text-foreground' : ''}
                        ${isUpcoming ? 'text-muted-foreground' : ''}
                      `}>
                        {step.title}
                      </span>
                      
                      {/* Description on hover/active */}
                      <motion.span
                        className="text-[10px] text-muted-foreground hidden sm:block"
                        initial={{ opacity: 0, height: 0 }}
                        animate={{ 
                          opacity: isActive ? 1 : 0,
                          height: isActive ? 'auto' : 0
                        }}
                      >
                        {step.description}
                      </motion.span>
                    </motion.div>
                  </motion.button>
                );
              })}
            </div>
          </div>
          
          {/* Progress Text */}
          <div className="flex justify-center mt-4">
            <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-muted/50 backdrop-blur-sm">
              <span className="text-xs text-muted-foreground">Schritt</span>
              <span className="text-sm font-semibold text-foreground">{currentStep}</span>
              <span className="text-xs text-muted-foreground">von {STEPS.length}</span>
              <div className="w-px h-3 bg-border mx-1" />
              <span className="text-xs font-medium text-primary">
                {Math.round((currentStep / STEPS.length) * 100)}%
              </span>
            </div>
          </div>
        </div>

        {/* Main Content */}
        <div className="grid grid-cols-1 xl:grid-cols-3 gap-6 mt-8">
          {/* Left: Controls */}
          <div className="xl:col-span-2">
            <Card className="p-6">
              <div className="flex items-center gap-3 mb-6">
                {(() => {
                  const CurrentIcon = STEPS[currentStep - 1].icon;
                  return <CurrentIcon className="w-5 h-5 text-primary" />;
                })()}
                <div>
                  <h2 className="text-lg font-semibold">{STEPS[currentStep - 1].title}</h2>
                  <p className="text-sm text-muted-foreground">{STEPS[currentStep - 1].description}</p>
                </div>
              </div>
              
              {renderStepContent()}

              {/* Navigation */}
              <div className="flex justify-between mt-6 pt-4 border-t">
                <Button variant="outline" onClick={handleBack} disabled={currentStep === 1}>
                  <ArrowLeft className="w-4 h-4 mr-2" />
                  Zurück
                </Button>
                <Button onClick={handleNext} disabled={!canProceed()}>
                  {currentStep === STEPS.length ? 'Video rendern' : 'Weiter'}
                  {currentStep < STEPS.length && <ArrowRight className="w-4 h-4 ml-2" />}
                </Button>
              </div>
            </Card>
          </div>

          {/* Right: Preview Panel */}
          <div className="xl:col-span-1 space-y-4">
            <Card className="p-4">
              <h3 className="font-semibold mb-3 flex items-center gap-2">
                <Film className="w-4 h-4" />
                Live-Preview
              </h3>
              {selectedVideo ? (
                <DirectorsCutPreviewPlayer
                  videoUrl={selectedVideo.url}
                  effects={appliedEffects.global}
                  sceneEffects={appliedEffects.scenes}
                  scenes={scenes}
                  transitions={transitions}
                  audio={audioEnhancements}
                  duration={selectedVideo.duration || 30}
                  currentTime={currentTime}
                  onTimeUpdate={setCurrentTime}
                  styleTransfer={styleTransfer}
                  colorGrading={colorGrading}
                  speedKeyframes={speedKeyframes}
                  chromaKey={chromaKey}
                  voiceoverUrl={voiceOverUrl}
                  textOverlays={textOverlays}
                />
              ) : (
                <div className="aspect-video bg-muted rounded-lg flex items-center justify-center">
                  <p className="text-sm text-muted-foreground">Wähle ein Video aus</p>
                </div>
              )}
            </Card>

            <Card className="p-4">
              <h3 className="font-semibold mb-3">Projekt-Info</h3>
              <div className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Status:</span>
                  <span className="font-medium">
                    {isAnalyzing ? 'Analysiert...' : scenes.length > 0 ? 'Bereit' : 'Warte auf Video'}
                  </span>
                </div>
                {selectedVideo && (
                  <>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Video:</span>
                      <span className="font-medium truncate max-w-[120px]">{selectedVideo.name}</span>
                    </div>
                    {selectedVideo.duration && (
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Dauer:</span>
                        <span className="font-medium">{Math.round(selectedVideo.duration)}s</span>
                      </div>
                    )}
                  </>
                )}
                {scenes.length > 0 && (
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Szenen:</span>
                    <span className="font-medium">{scenes.length}</span>
                  </div>
                )}
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Schritt:</span>
                  <span className="font-medium">{currentStep} / {STEPS.length}</span>
                </div>
              </div>
            </Card>

            <Card className="p-4">
              <h3 className="font-semibold mb-3">💡 Tipps</h3>
              <div className="text-sm text-muted-foreground">
                {currentStep === 1 && <p>Wähle ein Video aus deiner Mediathek oder lade ein neues hoch.</p>}
                {currentStep === 2 && <p>Die KI analysiert dein Video und erkennt automatisch Szenen.</p>}
                {currentStep === 3 && <p>Bearbeite Szenen und füge Übergänge hinzu.</p>}
                {currentStep === 4 && <p>Wähle einen visuellen Stil für dein Video.</p>}
                {currentStep === 5 && <p>Passe Helligkeit, Kontrast und Farben an.</p>}
                {currentStep === 6 && <p>Nutze Spezialeffekte wie Green Screen oder Speed Ramping.</p>}
                {currentStep === 7 && <p>Verbessere die Videoqualität mit KI-Upscaling.</p>}
                {currentStep === 8 && <p>Optimiere den Ton mit Noise Reduction.</p>}
                {currentStep === 9 && <p>Füge KI-Voice-Over und Sound Design hinzu.</p>}
                {currentStep === 10 && <p>Wähle die Exportqualität und rendere dein Video.</p>}
              </div>
            </Card>
          </div>
        </div>
      </div>

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
