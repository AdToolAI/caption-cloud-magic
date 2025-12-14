import { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Check, Loader2, FileText, Image, Mic, Music, Video, Download, AlertCircle, Hand, Sparkles } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { cn } from '@/lib/utils';
import { supabase } from '@/integrations/supabase/client';
import type { AutoGenerationStep, ConsultationResult } from '@/types/explainer-studio';

interface AutoGenerationProgressProps {
  consultationResult: ConsultationResult;
  userId: string;
  onComplete: (project: any) => void;
  onSwitchToManual: (partialProject: any) => void;
}

interface StepConfig {
  id: AutoGenerationStep;
  label: string;
  description: string;
  icon: any;
}

const STEPS: StepConfig[] = [
  { id: 'script', label: 'Drehbuch', description: 'KI generiert 5-Akt Drehbuch', icon: FileText },
  { id: 'character-sheet', label: 'Charakter', description: 'Character Sheet erstellen', icon: Image },
  { id: 'visuals', label: 'Visuals', description: 'Premium Szenen-Bilder', icon: Image },
  { id: 'voiceover', label: 'Voice-Over', description: 'Professionelle Sprachausgabe', icon: Mic },
  { id: 'music', label: 'Musik', description: 'Passende Hintergrundmusik', icon: Music },
  { id: 'render-16-9', label: '16:9', description: 'YouTube / Website', icon: Video },
  { id: 'render-9-16', label: '9:16', description: 'TikTok / Reels', icon: Video },
  { id: 'render-1-1', label: '1:1', description: 'Social Feed', icon: Video },
];

const STEP_TO_INDEX: Record<string, number> = {
  'pending': 0,
  'script': 0,
  'character-sheet': 1,
  'visuals': 2,
  'voiceover': 3,
  'music': 4,
  'sound-effects': 4,
  'subtitles': 4,
  'render': 5,
  'render-16-9': 5,
  'render-9-16': 6,
  'render-1-1': 7,
  'completed': 8,
};

export function AutoGenerationProgress({ 
  consultationResult, 
  userId, 
  onComplete, 
  onSwitchToManual 
}: AutoGenerationProgressProps) {
  const [currentStepIndex, setCurrentStepIndex] = useState(0);
  const [completedSteps, setCompletedSteps] = useState<AutoGenerationStep[]>([]);
  const [isGenerating, setIsGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [project, setProject] = useState<any>(null);
  const [progress, setProgress] = useState(0);
  const [generatedAssets, setGeneratedAssets] = useState<Record<string, string>>({});
  const [statusMessage, setStatusMessage] = useState<string>('Initialisiere...');
  const progressIdRef = useRef<string | null>(null);
  const channelRef = useRef<any>(null);

  useEffect(() => {
    startAutoGeneration();

    return () => {
      // Cleanup realtime subscription
      if (channelRef.current) {
        supabase.removeChannel(channelRef.current);
      }
    };
  }, []);

  const subscribeToProgress = (progressId: string) => {
    console.log('[AutoGen] Subscribing to progress:', progressId);
    
    const channel = supabase
      .channel(`explainer-progress-${progressId}`)
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'explainer_generation_progress',
          filter: `id=eq.${progressId}`
        },
        (payload) => {
          console.log('[AutoGen] Progress update:', payload.new);
          const newData = payload.new as any;
          
          // Update step
          const stepIndex = STEP_TO_INDEX[newData.current_step] ?? 0;
          setCurrentStepIndex(stepIndex);
          setProgress(newData.progress || 0);
          setStatusMessage(newData.message || 'Verarbeite...');
          
          // Mark completed steps
          const completed: AutoGenerationStep[] = [];
          for (let i = 0; i < stepIndex; i++) {
            completed.push(STEPS[i].id);
          }
          setCompletedSteps(completed);
          
          // Update assets from JSON
          if (newData.assets_json && Array.isArray(newData.assets_json)) {
            const assetMap: Record<string, string> = {};
            newData.assets_json.forEach((asset: any, idx: number) => {
              if (asset.imageUrl) {
                assetMap[`scene-${idx}`] = asset.imageUrl;
              }
            });
            setGeneratedAssets(assetMap);
          }
          
          // Check for error
          if (newData.error) {
            setError(newData.error);
            setIsGenerating(false);
          }
          
          // Check for completion
          if (newData.current_step === 'completed' && newData.project_data) {
            setProject(newData.project_data);
            setIsGenerating(false);
            onComplete(newData.project_data);
          }
        }
      )
      .subscribe();
    
    channelRef.current = channel;
  };

  const startAutoGeneration = async () => {
    setIsGenerating(true);
    setError(null);
    setStatusMessage('Starte KI-Generierung...');

    try {
      // Start the auto-generation process
      const response = await supabase.functions.invoke('auto-generate-explainer', {
        body: {
          consultationResult,
          userId,
        }
      });

      if (response.error) {
        throw new Error(response.error.message);
      }

      const data = response.data;
      
      // Subscribe to realtime progress updates
      if (data.progressId) {
        progressIdRef.current = data.progressId;
        subscribeToProgress(data.progressId);
      }

      // If already complete (fast path)
      if (data.project) {
        setProject(data.project);
        
        // Poll for render completion
        if (data.project.renderResults) {
          await pollRenderStatus(data.project.renderResults);
        }

        onComplete(data.project);
      }

    } catch (err) {
      console.error('Auto-generation error:', err);
      setError(err instanceof Error ? err.message : 'Ein Fehler ist aufgetreten');
      setIsGenerating(false);
    }
  };

  const pollRenderStatus = async (renderResults: Record<string, any>) => {
    const pendingFormats = Object.entries(renderResults)
      .filter(([_, r]) => r.status === 'rendering')
      .map(([format]) => format);

    if (pendingFormats.length === 0) return;

    // Poll every 10 seconds
    const maxAttempts = 60; // 10 minutes max
    let attempts = 0;

    while (attempts < maxAttempts) {
      await new Promise(resolve => setTimeout(resolve, 10000));
      attempts++;

      for (const format of pendingFormats) {
        try {
          const { data } = await supabase.functions.invoke('check-remotion-progress', {
            body: { renderId: renderResults[format].renderId }
          });

          if (data?.done) {
            renderResults[format] = {
              status: 'completed',
              outputUrl: data.outputFile,
            };
            
            // Update progress for render steps
            const formatIndex = format === '16:9' ? 5 : format === '9:16' ? 6 : 7;
            setCurrentStepIndex(formatIndex + 1);
            setCompletedSteps(prev => [...prev, STEPS[formatIndex].id]);
            setProgress(Math.min(100, 70 + (formatIndex - 4) * 10));
          }
        } catch (e) {
          console.error(`Error checking render status for ${format}:`, e);
        }
      }

      // Check if all complete
      const allComplete = Object.values(renderResults).every(
        (r: any) => r.status === 'completed' || r.status === 'failed'
      );

      if (allComplete) break;
    }
  };

  const handleSwitchToManual = () => {
    onSwitchToManual(project);
  };

  const currentStep = STEPS[currentStepIndex] || STEPS[STEPS.length - 1];

  return (
    <div className="max-w-4xl mx-auto">
      {/* Header */}
      <motion.div
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        className="text-center mb-8"
      >
        <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-primary/20 border border-primary/30 mb-4">
          <span className="relative flex h-2 w-2">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-primary opacity-75" />
            <span className="relative inline-flex rounded-full h-2 w-2 bg-primary" />
          </span>
          <span className="text-sm font-medium text-primary">KI-Video-Erstellung aktiv</span>
        </div>
        
        <h2 className="text-3xl font-bold mb-2">
          <span className="bg-gradient-to-r from-primary via-purple-400 to-cyan-400 bg-clip-text text-transparent">
            Dein Video wird erstellt
          </span>
        </h2>
        <p className="text-muted-foreground">
          Lehn dich zurück – die KI arbeitet für dich
        </p>
      </motion.div>

      {/* Progress Bar */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="mb-8"
      >
        <div className="flex justify-between text-sm mb-2">
          <span className="text-muted-foreground">{statusMessage}</span>
          <span className="text-primary font-medium">{Math.round(progress)}%</span>
        </div>
        <Progress value={progress} className="h-3" />
      </motion.div>

      {/* Steps Grid */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
        {STEPS.map((step, index) => {
          const Icon = step.icon;
          const isCompleted = completedSteps.includes(step.id);
          const isCurrent = index === currentStepIndex && isGenerating;
          const isPending = index > currentStepIndex;

          return (
            <motion.div
              key={step.id}
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ delay: index * 0.1 }}
              className={cn(
                "relative p-4 rounded-xl border transition-all duration-300",
                isCompleted && "bg-primary/10 border-primary/30",
                isCurrent && "bg-primary/20 border-primary/50 shadow-[0_0_20px_rgba(245,199,106,0.2)]",
                isPending && "bg-muted/20 border-white/10 opacity-50"
              )}
            >
              <div className="flex items-center gap-3 mb-2">
                <div className={cn(
                  "w-8 h-8 rounded-lg flex items-center justify-center",
                  isCompleted && "bg-primary text-primary-foreground",
                  isCurrent && "bg-primary/30",
                  isPending && "bg-muted/30"
                )}>
                  {isCompleted ? (
                    <Check className="h-4 w-4" />
                  ) : isCurrent ? (
                    <Loader2 className="h-4 w-4 animate-spin text-primary" />
                  ) : (
                    <Icon className="h-4 w-4" />
                  )}
                </div>
                <span className="text-sm font-medium">{step.label}</span>
              </div>
              <p className="text-xs text-muted-foreground">{step.description}</p>
            </motion.div>
          );
        })}
      </div>

      {/* Current Step Detail */}
      <motion.div
        key={currentStepIndex}
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="bg-card/60 backdrop-blur-xl border border-white/10 rounded-2xl p-6 mb-6"
      >
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 rounded-xl bg-primary/20 flex items-center justify-center">
            {isGenerating ? (
              <Loader2 className="h-6 w-6 text-primary animate-spin" />
            ) : (
              <Sparkles className="h-6 w-6 text-primary" />
            )}
          </div>
          <div>
            <h3 className="text-lg font-semibold">{currentStep.label}</h3>
            <p className="text-sm text-muted-foreground">{statusMessage}</p>
          </div>
        </div>

        {/* Show generated visuals preview */}
        {Object.keys(generatedAssets).length > 0 && (
          <div className="mt-6 grid grid-cols-5 gap-2">
            <AnimatePresence>
              {Object.entries(generatedAssets).map(([key, url], index) => (
                <motion.div
                  key={key}
                  initial={{ opacity: 0, scale: 0.8 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={{ delay: index * 0.1 }}
                  className="aspect-video rounded-lg overflow-hidden border border-white/10"
                >
                  <img src={url} alt={key} className="w-full h-full object-cover" />
                </motion.div>
              ))}
            </AnimatePresence>
          </div>
        )}
      </motion.div>

      {/* Error State */}
      {error && (
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-destructive/10 border border-destructive/30 rounded-xl p-4 mb-6"
        >
          <div className="flex items-center gap-3">
            <AlertCircle className="h-5 w-5 text-destructive" />
            <div>
              <p className="font-medium text-destructive">Fehler bei der Generierung</p>
              <p className="text-sm text-muted-foreground">{error}</p>
            </div>
          </div>
        </motion.div>
      )}

      {/* Actions */}
      <div className="flex justify-center gap-4">
        <Button
          variant="outline"
          onClick={handleSwitchToManual}
          className="flex items-center gap-2"
        >
          <Hand className="h-4 w-4" />
          Zum manuellen Modus wechseln
        </Button>
      </div>

      {/* Estimated time */}
      <motion.p
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.5 }}
        className="text-center text-sm text-muted-foreground mt-8"
      >
        ⏱️ Geschätzte Restzeit: ~{Math.max(1, Math.ceil((100 - progress) / 15))} Minuten
      </motion.p>
    </div>
  );
}
