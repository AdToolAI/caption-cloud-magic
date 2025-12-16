import { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Check, Loader2, FileText, Image, Mic, Music, Video, AlertCircle, Hand, Sparkles, Crown, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { supabase } from '@/integrations/supabase/client';
import type { UniversalVideoConsultationResult, VideoCategory } from '@/types/universal-video-creator';

interface UniversalAutoGenerationProgressProps {
  consultationResult: UniversalVideoConsultationResult;
  userId: string;
  category: VideoCategory;
  onComplete: (project: any) => void;
  onSwitchToManual: (partialProject: any) => void;
}

type GenerationStep = 'script' | 'visuals' | 'voiceover' | 'music' | 'render-16-9' | 'render-9-16' | 'render-1-1';

interface StepConfig {
  id: GenerationStep;
  label: string;
  description: string;
  icon: any;
}

const STEPS: StepConfig[] = [
  { id: 'script', label: 'Drehbuch', description: 'KI generiert kategoriespezifisches Drehbuch', icon: FileText },
  { id: 'visuals', label: 'Visuals', description: 'Premium Szenen-Bilder generieren', icon: Image },
  { id: 'voiceover', label: 'Voice-Over', description: 'Professionelle Sprachausgabe', icon: Mic },
  { id: 'music', label: 'Musik', description: 'Passende Hintergrundmusik', icon: Music },
  { id: 'render-16-9', label: '16:9', description: 'YouTube / Website', icon: Video },
  { id: 'render-9-16', label: '9:16', description: 'TikTok / Reels', icon: Video },
  { id: 'render-1-1', label: '1:1', description: 'Social Feed', icon: Video },
];

const STEP_TO_INDEX: Record<string, number> = {
  'pending': 0,
  'script': 0,
  'visuals': 1,
  'voiceover': 2,
  'music': 3,
  'render-16-9': 4,
  'render-9-16': 5,
  'render-1-1': 6,
  'completed': 7,
};

export function UniversalAutoGenerationProgress({ 
  consultationResult, 
  userId,
  category,
  onComplete, 
  onSwitchToManual 
}: UniversalAutoGenerationProgressProps) {
  const [currentStepIndex, setCurrentStepIndex] = useState(0);
  const [completedSteps, setCompletedSteps] = useState<GenerationStep[]>([]);
  const [isGenerating, setIsGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [project, setProject] = useState<any>(null);
  const [progress, setProgress] = useState(0);
  const [generatedAssets, setGeneratedAssets] = useState<Record<string, string>>({});
  const [statusMessage, setStatusMessage] = useState<string>('Initialisiere...');
  const progressIdRef = useRef<string | null>(null);
  const channelRef = useRef<any>(null);
  const pollIntervalRef = useRef<number | null>(null);

  useEffect(() => {
    startAutoGeneration();

    return () => {
      if (channelRef.current) {
        supabase.removeChannel(channelRef.current);
      }
      if (pollIntervalRef.current) {
        clearInterval(pollIntervalRef.current);
      }
    };
  }, []);

  const subscribeToProgress = (progressId: string) => {
    console.log('[UniversalAutoGen] Subscribing to progress:', progressId);
    
    const channel = supabase
      .channel(`universal-video-progress-${progressId}`)
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'universal_video_generation_progress',
          filter: `id=eq.${progressId}`
        },
        (payload) => {
          console.log('[UniversalAutoGen] Progress update:', payload.new);
          handleProgressUpdate(payload.new as any);
        }
      )
      .subscribe((status) => {
        console.log('[UniversalAutoGen] Subscription status:', status);
        if (status !== 'SUBSCRIBED') {
          startFallbackPolling(progressId);
        }
      });
    
    channelRef.current = channel;
    startFallbackPolling(progressId);
  };

  const startFallbackPolling = (progressId: string) => {
    if (pollIntervalRef.current) return;
    
    console.log('[UniversalAutoGen] 🔄 Starting fallback polling');
    
    // Immediate first fetch
    (async () => {
      const { data } = await supabase
        .from('universal_video_generation_progress')
        .select('*')
        .eq('id', progressId)
        .single();
      if (data) {
        handleProgressUpdate(data);
      }
    })();
    
    pollIntervalRef.current = window.setInterval(async () => {
      try {
        const { data, error } = await supabase
          .from('universal_video_generation_progress')
          .select('*')
          .eq('id', progressId)
          .single();
        
        if (data && !error) {
          handleProgressUpdate(data);
        }
      } catch (e) {
        console.error('[UniversalAutoGen] Polling error:', e);
      }
    }, 1000);
  };

  const handleProgressUpdate = (data: any) => {
    const stepIndex = STEP_TO_INDEX[data.current_step] ?? 0;
    setCurrentStepIndex(stepIndex);
    setProgress(data.progress || 0);
    setStatusMessage(data.message || 'Verarbeite...');
    
    const completed: GenerationStep[] = [];
    for (let i = 0; i < stepIndex; i++) {
      completed.push(STEPS[i].id);
    }
    setCompletedSteps(completed);
    
    if (data.assets_json && Array.isArray(data.assets_json)) {
      const assetMap: Record<string, string> = {};
      data.assets_json.forEach((asset: any, idx: number) => {
        if (asset.imageUrl) {
          assetMap[`scene-${idx}`] = asset.imageUrl;
        }
      });
      setGeneratedAssets(assetMap);
    }
    
    if (data.error) {
      setError(data.error);
      setIsGenerating(false);
      if (pollIntervalRef.current) {
        clearInterval(pollIntervalRef.current);
        pollIntervalRef.current = null;
      }
    }
    
    if (data.current_step === 'completed' && data.project_data) {
      setProject(data.project_data);
      setIsGenerating(false);
      if (pollIntervalRef.current) {
        clearInterval(pollIntervalRef.current);
        pollIntervalRef.current = null;
      }
      onComplete(data.project_data);
    }
  };

  const startAutoGeneration = async () => {
    setIsGenerating(true);
    setError(null);
    setStatusMessage('🚀 Starte KI-Generierung...');
    setProgress(0);

    try {
      console.log('[UniversalAutoGen] 🚀 Calling auto-generate-universal-video...');
      
      const response = await supabase.functions.invoke('auto-generate-universal-video', {
        body: {
          consultationResult,
          userId,
          category,
        }
      });

      console.log('[UniversalAutoGen] Response received:', response.data);

      if (response.error) {
        throw new Error(response.error.message);
      }

      const data = response.data;
      
      if (data.progressId) {
        console.log('[UniversalAutoGen] ✅ Got progressId:', data.progressId);
        progressIdRef.current = data.progressId;
        subscribeToProgress(data.progressId);
        
        const { data: initialProgress } = await supabase
          .from('universal_video_generation_progress')
          .select('*')
          .eq('id', data.progressId)
          .single();
        
        if (initialProgress) {
          handleProgressUpdate(initialProgress);
        }
      }

      if (data.project) {
        setProject(data.project);
        onComplete(data.project);
      }

    } catch (err) {
      console.error('[UniversalAutoGen] ❌ Error:', err);
      setError(err instanceof Error ? err.message : 'Ein Fehler ist aufgetreten');
      setIsGenerating(false);
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
        <motion.div 
          initial={{ scale: 0.9 }}
          animate={{ scale: 1 }}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-[#F5C76A]/10 border border-[#F5C76A]/30 mb-4"
        >
          <span className="relative flex h-2 w-2">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[#F5C76A] opacity-75" />
            <span className="relative inline-flex rounded-full h-2 w-2 bg-[#F5C76A]" />
          </span>
          <span className="text-sm font-medium text-[#F5C76A]">Universal Video Creator aktiv</span>
        </motion.div>
        
        <h2 className="text-3xl font-bold mb-2">
          <span className="bg-gradient-to-r from-[#F5C76A] via-amber-300 to-[#F5C76A] bg-clip-text text-transparent">
            Dein {category.charAt(0).toUpperCase() + category.slice(1)}-Video wird erstellt
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
        className="mb-8 p-4 bg-card/40 backdrop-blur-xl border border-white/10 rounded-2xl"
      >
        <div className="flex justify-between text-sm mb-3">
          <span className="text-muted-foreground flex items-center gap-2">
            <Crown className="h-4 w-4 text-[#F5C76A]" />
            {statusMessage}
          </span>
          <span className="text-[#F5C76A] font-bold">{Math.round(progress)}%</span>
        </div>
        <div className="h-3 bg-muted/20 rounded-full overflow-hidden border border-white/5">
          <motion.div
            className="h-full bg-gradient-to-r from-[#F5C76A] via-amber-400 to-[#F5C76A] relative"
            initial={{ width: 0 }}
            animate={{ width: `${progress}%` }}
            transition={{ duration: 0.5, ease: 'easeOut' }}
          >
            <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/30 to-transparent animate-[shimmer_2s_infinite]" 
                 style={{ backgroundSize: '200% 100%' }} />
          </motion.div>
        </div>
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
                "relative p-4 rounded-xl border backdrop-blur-sm transition-all duration-300",
                isCompleted && "bg-[#F5C76A]/10 border-[#F5C76A]/30 shadow-[0_0_15px_rgba(245,199,106,0.1)]",
                isCurrent && "bg-[#F5C76A]/20 border-[#F5C76A]/50 shadow-[0_0_25px_rgba(245,199,106,0.2)]",
                isPending && "bg-muted/10 border-white/5 opacity-50"
              )}
            >
              <div className="flex items-center gap-3 mb-2">
                <div className={cn(
                  "w-8 h-8 rounded-lg flex items-center justify-center transition-all",
                  isCompleted && "bg-[#F5C76A] text-black",
                  isCurrent && "bg-[#F5C76A]/30 border border-[#F5C76A]/50",
                  isPending && "bg-muted/20 border border-white/10"
                )}>
                  {isCompleted ? (
                    <Check className="h-4 w-4" />
                  ) : isCurrent ? (
                    <Loader2 className="h-4 w-4 animate-spin text-[#F5C76A]" />
                  ) : (
                    <Icon className="h-4 w-4 text-muted-foreground" />
                  )}
                </div>
                <span className={cn(
                  "text-sm font-medium",
                  isCompleted && "text-[#F5C76A]",
                  isCurrent && "text-[#F5C76A]"
                )}>{step.label}</span>
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
        className="bg-card/40 backdrop-blur-xl border border-white/10 rounded-2xl p-6 mb-6 relative overflow-hidden"
      >
        <div className="absolute inset-0 bg-gradient-to-br from-[#F5C76A]/5 via-transparent to-purple-500/5 pointer-events-none" />
        
        <div className="flex items-center gap-4 relative">
          <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-[#F5C76A]/20 to-amber-500/10 flex items-center justify-center border border-[#F5C76A]/30">
            {isGenerating ? (
              <Loader2 className="h-6 w-6 text-[#F5C76A] animate-spin" />
            ) : (
              <Sparkles className="h-6 w-6 text-[#F5C76A]" />
            )}
          </div>
          <div>
            <h3 className="text-lg font-semibold text-[#F5C76A]">{currentStep.label}</h3>
            <p className="text-sm text-muted-foreground">{statusMessage}</p>
          </div>
        </div>

        {/* Generated Assets Preview */}
        {Object.keys(generatedAssets).length > 0 && (
          <div className="mt-6 grid grid-cols-5 gap-2">
            <AnimatePresence>
              {Object.entries(generatedAssets).map(([key, url], index) => (
                <motion.div
                  key={key}
                  initial={{ opacity: 0, scale: 0.8 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={{ delay: index * 0.1 }}
                  className="aspect-video rounded-lg overflow-hidden border border-[#F5C76A]/30 shadow-[0_0_10px_rgba(245,199,106,0.1)]"
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
            <div className="flex-1">
              <p className="font-medium text-destructive">Fehler bei der Generierung</p>
              <p className="text-sm text-muted-foreground">{error}</p>
            </div>
            <Button 
              variant="outline" 
              size="sm"
              onClick={() => {
                setError(null);
                startAutoGeneration();
              }}
              className="border-destructive/30 hover:bg-destructive/10"
            >
              <RefreshCw className="h-4 w-4 mr-2" />
              Erneut versuchen
            </Button>
          </div>
        </motion.div>
      )}

      {/* Switch to Manual Button */}
      <div className="flex justify-center">
        <Button
          variant="ghost"
          onClick={handleSwitchToManual}
          className="text-muted-foreground hover:text-foreground"
        >
          <Hand className="h-4 w-4 mr-2" />
          Zur manuellen Bearbeitung wechseln
        </Button>
      </div>
    </div>
  );
}
