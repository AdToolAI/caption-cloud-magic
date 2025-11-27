import { useState, useEffect } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { ArrowLeft, ArrowRight, Film, Sparkles, Palette, Volume2, Download } from 'lucide-react';
import { VideoImportStep } from '@/components/directors-cut/steps/VideoImportStep';
import { SceneAnalysisStep } from '@/components/directors-cut/steps/SceneAnalysisStep';
import { VisualEffectsStep } from '@/components/directors-cut/steps/VisualEffectsStep';
import { AudioEnhancementStep } from '@/components/directors-cut/steps/AudioEnhancementStep';
import { ExportRenderStep } from '@/components/directors-cut/steps/ExportRenderStep';
import { DirectorsCutPreviewPlayer } from '@/components/directors-cut/DirectorsCutPreviewPlayer';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import type { 
  SelectedVideo, 
  SceneAnalysis, 
  AppliedEffects, 
  AudioEnhancements,
  ExportSettings 
} from '@/types/directors-cut';

const STEPS = [
  { id: 1, title: 'Video Import', icon: Film, description: 'Video auswählen oder hochladen' },
  { id: 2, title: 'KI-Analyse', icon: Sparkles, description: 'Szenen automatisch erkennen' },
  { id: 3, title: 'Visuelle Effekte', icon: Palette, description: 'Filter und Farbkorrektur' },
  { id: 4, title: 'Audio', icon: Volume2, description: 'Ton optimieren' },
  { id: 5, title: 'Export', icon: Download, description: 'Video rendern' },
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
  
  // Step 3: Visual Effects
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
  
  // Step 4: Audio
  const [audioEnhancements, setAudioEnhancements] = useState<AudioEnhancements>({
    master_volume: 100,
    noise_reduction: false,
    noise_reduction_level: 50,
    auto_ducking: false,
    ducking_level: 30,
    voice_enhancement: false,
    added_sounds: [],
  });
  
  // Voice-Over URL from AI Voice-Over feature
  const [voiceOverUrl, setVoiceOverUrl] = useState<string | undefined>(undefined);
  
  // Step 5: Export
  const [exportSettings, setExportSettings] = useState<ExportSettings>({
    quality: 'hd',
    format: 'mp4',
    fps: 30,
    aspect_ratio: '16:9',
  });
  
  // Preview state
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

  // Check auth and source video from URL params
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

  // Create or update project in database
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

  // AI Scene Analysis
  const handleStartAnalysis = async () => {
    if (!selectedVideo) return;
    
    setIsAnalyzing(true);
    
    try {
      const { data, error } = await supabase.functions.invoke('analyze-video-scenes', {
        body: {
          video_url: selectedVideo.url,
          duration: selectedVideo.duration || 30,
        },
      });
      
      if (error) throw error;
      
      setScenes(data.scenes || []);
      toast.success(`${data.scenes?.length || 0} Szenen erkannt`);
    } catch (error) {
      console.error('Error analyzing video:', error);
      toast.error('Fehler bei der Szenenanalyse');
      
      // Generate mock scenes for demo
      const mockScenes: SceneAnalysis[] = [
        {
          id: '1',
          start_time: 0,
          end_time: 5,
          description: 'Eröffnungsszene',
          mood: 'neutral',
          suggested_effects: [
            { type: 'filter', name: 'cinematic', reason: 'Professioneller Look', confidence: 0.85 }
          ],
          ai_suggestions: ['Cinematic Filter für professionellen Look empfohlen'],
        },
        {
          id: '2',
          start_time: 5,
          end_time: 15,
          description: 'Hauptinhalt',
          mood: 'dynamic',
          suggested_effects: [
            { type: 'filter', name: 'vibrant', reason: 'Erhöht visuelle Wirkung', confidence: 0.78 }
          ],
          ai_suggestions: ['Erhöhte Sättigung für mehr Lebendigkeit'],
        },
        {
          id: '3',
          start_time: 15,
          end_time: 30,
          description: 'Abschluss',
          mood: 'calm',
          suggested_effects: [
            { type: 'filter', name: 'warm', reason: 'Warmes Finish', confidence: 0.82 }
          ],
          ai_suggestions: ['Warme Töne für emotionalen Abschluss'],
        },
      ];
      setScenes(mockScenes);
    } finally {
      setIsAnalyzing(false);
    }
  };

  const canProceed = () => {
    switch (currentStep) {
      case 1:
        return selectedVideo !== null;
      case 2:
        return scenes.length > 0;
      default:
        return true;
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

  // Render current step content
  const renderStepContent = () => {
    switch (currentStep) {
      case 1:
        return (
          <VideoImportStep
            selectedVideo={selectedVideo}
            onVideoSelect={setSelectedVideo}
          />
        );
      case 2:
        return (
          <SceneAnalysisStep
            videoUrl={selectedVideo?.url || ''}
            videoDuration={selectedVideo?.duration || 30}
            scenes={scenes}
            onScenesUpdate={setScenes}
            isAnalyzing={isAnalyzing}
            onStartAnalysis={handleStartAnalysis}
          />
        );
      case 3:
        return (
          <VisualEffectsStep
            effects={appliedEffects.global}
            onEffectsChange={(global) => setAppliedEffects({ ...appliedEffects, global })}
            videoUrl={selectedVideo?.url || ''}
            videoDuration={selectedVideo?.duration || 30}
            currentTime={currentTime}
          />
        );
      case 4:
        return (
          <AudioEnhancementStep
            audio={audioEnhancements}
            onAudioChange={setAudioEnhancements}
            videoUrl={selectedVideo?.url || ''}
            scenes={scenes}
            onVoiceOverGenerated={setVoiceOverUrl}
          />
        );
      case 5:
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

        {/* Progress Steps */}
        <div className="mb-6">
          <div className="flex items-center justify-between">
            {STEPS.map((step, index) => {
              const Icon = step.icon;
              const isActive = currentStep === step.id;
              const isCompleted = currentStep > step.id;
              
              return (
                <div key={step.id} className="flex items-center flex-1">
                  <div className="flex flex-col items-center">
                    <div
                      className={`
                        w-10 h-10 rounded-full flex items-center justify-center transition-all
                        ${isActive ? 'bg-primary text-primary-foreground scale-110' : ''}
                        ${isCompleted ? 'bg-primary/20 text-primary' : ''}
                        ${!isActive && !isCompleted ? 'bg-muted text-muted-foreground' : ''}
                      `}
                    >
                      <Icon className="w-4 h-4" />
                    </div>
                    <span className={`text-xs mt-1 text-center hidden md:block ${isActive ? 'font-medium' : 'text-muted-foreground'}`}>
                      {step.title}
                    </span>
                  </div>
                  {index < STEPS.length - 1 && (
                    <div className={`flex-1 h-0.5 mx-2 ${isCompleted ? 'bg-primary' : 'bg-muted'}`} />
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* Main Content - Split View */}
        <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
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
                <Button
                  variant="outline"
                  onClick={handleBack}
                  disabled={currentStep === 1}
                >
                  <ArrowLeft className="w-4 h-4 mr-2" />
                  Zurück
                </Button>
                <Button
                  onClick={handleNext}
                  disabled={!canProceed()}
                >
                  {currentStep === STEPS.length ? 'Video rendern' : 'Weiter'}
                  {currentStep < STEPS.length && <ArrowRight className="w-4 h-4 ml-2" />}
                </Button>
              </div>
            </Card>
          </div>

          {/* Right: Preview Panel */}
          <div className="xl:col-span-1 space-y-4">
            {/* Live Preview */}
            <Card className="p-4">
              <h3 className="font-semibold mb-3 flex items-center gap-2">
                <Film className="w-4 h-4" />
                Live-Preview
              </h3>
              {selectedVideo ? (
                <DirectorsCutPreviewPlayer
                  videoUrl={selectedVideo.url}
                  effects={appliedEffects.global}
                  audio={audioEnhancements}
                  duration={selectedVideo.duration || 30}
                  currentTime={currentTime}
                  onTimeUpdate={setCurrentTime}
                  styleTransfer={styleTransfer}
                  colorGrading={colorGrading}
                  speedKeyframes={speedKeyframes}
                  chromaKey={chromaKey}
                />
              ) : (
                <div className="aspect-video bg-muted rounded-lg flex items-center justify-center">
                  <p className="text-sm text-muted-foreground">
                    Wähle ein Video aus
                  </p>
                </div>
              )}
            </Card>

            {/* Project Info */}
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
              </div>
            </Card>

            {/* Quick Tips */}
            <Card className="p-4">
              <h3 className="font-semibold mb-3">💡 Tipps</h3>
              <div className="text-sm text-muted-foreground">
                {currentStep === 1 && (
                  <p>Wähle ein Video aus deiner Mediathek oder lade ein neues hoch.</p>
                )}
                {currentStep === 2 && (
                  <p>Die KI analysiert dein Video und erkennt automatisch Szenen.</p>
                )}
                {currentStep === 3 && (
                  <p>Wende Filter und Farbkorrekturen an - Änderungen werden live angezeigt.</p>
                )}
                {currentStep === 4 && (
                  <p>Optimiere den Ton mit Noise Reduction und Voice Enhancement.</p>
                )}
                {currentStep === 5 && (
                  <p>Wähle die Exportqualität und rendere dein finales Video.</p>
                )}
              </div>
            </Card>
          </div>
        </div>
      </div>
    </div>
  );
}
