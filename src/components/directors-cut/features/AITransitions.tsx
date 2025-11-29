import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Slider } from '@/components/ui/slider';
import { 
  Loader2, 
  Sparkles, 
  Wand2, 
  Play, 
  RotateCcw, 
  Zap,
  CheckCircle2,
  ChevronRight,
  Info
} from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';

export const TRANSITION_TYPES = [
  { 
    id: 'crossfade', 
    name: 'Crossfade', 
    description: 'Sanfte Überblendung für ruhige Übergänge',
    icon: '✦',
    gradient: 'from-blue-500 to-cyan-500',
    aiScore: 0.9,
    bestFor: ['calm', 'peaceful', 'neutral']
  },
  { 
    id: 'dissolve', 
    name: 'Dissolve', 
    description: 'Auflösungs-Effekt für emotionale Momente',
    icon: '✧',
    gradient: 'from-purple-500 to-pink-500',
    aiScore: 0.85,
    bestFor: ['emotional', 'dramatic', 'sad']
  },
  { 
    id: 'wipe', 
    name: 'Wipe', 
    description: 'Horizontaler Wisch für dynamische Szenen',
    icon: '▶',
    gradient: 'from-green-500 to-emerald-500',
    aiScore: 0.75,
    bestFor: ['energetic', 'action', 'fast']
  },
  { 
    id: 'fade', 
    name: 'Fade', 
    description: 'Fade to Black für dramatische Effekte',
    icon: '◐',
    gradient: 'from-slate-600 to-slate-800',
    aiScore: 0.8,
    bestFor: ['dramatic', 'ending', 'mysterious']
  },
  { 
    id: 'slide', 
    name: 'Slide', 
    description: 'Schiebe-Effekt für moderne Videos',
    icon: '→',
    gradient: 'from-orange-500 to-amber-500',
    aiScore: 0.7,
    bestFor: ['modern', 'tech', 'professional']
  },
  { 
    id: 'morph', 
    name: 'AI Morph', 
    description: 'KI-generierter fließender Übergang',
    icon: '∞',
    gradient: 'from-violet-500 via-purple-500 to-fuchsia-500',
    aiScore: 0.95,
    bestFor: ['creative', 'artistic', 'experimental'],
    isPremium: true
  },
];

interface TransitionAssignment {
  sceneId: string;
  transitionType: string;
  duration: number;
  aiSuggested: boolean;
  confidence?: number;
  reasoning?: string;
}

interface Scene {
  id: string;
  startTime: number;
  endTime: number;
  mood?: string;
  energy?: string;
  content?: string;
}

interface AITransitionsProps {
  sceneCount: number;
  transitions: TransitionAssignment[];
  onTransitionsChange: (transitions: TransitionAssignment[]) => void;
  scenes?: Scene[];
  videoMood?: string;
  videoGenre?: string;
}

export function AITransitions({
  sceneCount,
  transitions,
  onTransitionsChange,
  scenes = [],
  videoMood = 'neutral',
  videoGenre = 'general',
}: AITransitionsProps) {
  const [isGenerating, setIsGenerating] = useState(false);
  const [defaultDuration, setDefaultDuration] = useState(0.5);
  const [selectedTransition, setSelectedTransition] = useState<string | null>(null);
  const [hoveredType, setHoveredType] = useState<string | null>(null);
  const { toast } = useToast();

  const handleAutoGenerate = async () => {
    if (sceneCount < 2) return;
    
    setIsGenerating(true);
    
    try {
      const scenesForAnalysis = scenes.length > 0 
        ? scenes.map((s, i) => ({
            id: s.id || `scene-${i}`,
            startTime: s.startTime,
            endTime: s.endTime,
            mood: s.mood || 'neutral',
            energy: s.energy || 'medium',
            content: s.content || `Scene ${i + 1}`,
          }))
        : Array.from({ length: sceneCount }, (_, i) => ({
            id: `scene-${i}`,
            startTime: i * 5,
            endTime: (i + 1) * 5,
            mood: 'neutral',
            energy: 'medium',
            content: `Scene ${i + 1}`,
          }));

      const { data, error } = await supabase.functions.invoke('director-cut-transitions', {
        body: {
          scenes: scenesForAnalysis,
          video_mood: videoMood,
          video_genre: videoGenre,
        },
      });

      if (error) throw new Error(error.message || 'AI Transition-Analyse fehlgeschlagen');

      const recommendations = data?.analysis?.recommendations || data?.recommendations;
      
      if (recommendations && Array.isArray(recommendations)) {
        const generated: TransitionAssignment[] = recommendations.map((rec: any) => ({
          sceneId: rec.sceneId,
          transitionType: rec.transitionType,
          duration: rec.duration || defaultDuration,
          aiSuggested: true,
          confidence: rec.confidence,
          reasoning: rec.reasoning,
        }));

        onTransitionsChange(generated);
        
        toast({
          title: 'AI Übergänge generiert',
          description: `${generated.length} szenenspezifische Übergänge mit Confidence Scores.`,
        });
      } else {
        throw new Error('Ungültige Antwort vom Server');
      }
    } catch (err: any) {
      console.error('AI Transitions error:', err);
      
      // Intelligent fallback based on mood
      const generated: TransitionAssignment[] = [];
      for (let i = 0; i < sceneCount - 1; i++) {
        const scene = scenes[i];
        const mood = scene?.mood?.toLowerCase() || 'neutral';
        
        let transitionType = 'crossfade';
        let confidence = 0.75;
        let reasoning = 'Standard-Übergang basierend auf Szenen-Analyse';
        
        const matchingType = TRANSITION_TYPES.find(t => 
          t.bestFor.some(m => mood.includes(m))
        );
        
        if (matchingType) {
          transitionType = matchingType.id;
          confidence = matchingType.aiScore;
          reasoning = `${matchingType.name} empfohlen für ${mood} Stimmung`;
        }
        
        generated.push({
          sceneId: `scene-${i + 1}`,
          transitionType,
          duration: defaultDuration,
          aiSuggested: true,
          confidence,
          reasoning,
        });
      }
      
      onTransitionsChange(generated);
      
      toast({
        title: 'Lokale AI-Analyse',
        description: 'Übergänge basierend auf Szenen-Stimmung generiert.',
      });
    } finally {
      setIsGenerating(false);
    }
  };

  const handleApplyToAll = (transitionId: string) => {
    const updated = transitions.map(t => ({
      ...t,
      transitionType: transitionId,
      aiSuggested: false,
    }));
    onTransitionsChange(updated);
    setSelectedTransition(null);
  };

  const getTransitionInfo = (id: string) => TRANSITION_TYPES.find(t => t.id === id);
  
  const totalConfidence = transitions.length > 0
    ? transitions.reduce((sum, t) => sum + (t.confidence || 0.5), 0) / transitions.length
    : 0;

  return (
    <Card className="overflow-hidden backdrop-blur-xl bg-card/80 border-border/50">
      <CardHeader className="pb-3 bg-gradient-to-r from-primary/5 via-transparent to-transparent">
        <CardTitle className="text-sm flex items-center justify-between">
          <div className="flex items-center gap-2">
            <motion.div
              animate={{ rotate: isGenerating ? 360 : 0 }}
              transition={{ duration: 2, repeat: isGenerating ? Infinity : 0 }}
            >
              <Sparkles className="h-4 w-4 text-yellow-500" />
            </motion.div>
            <span>AI Transitions</span>
          </div>
          <div className="flex items-center gap-2">
            {totalConfidence > 0 && (
              <Badge variant="secondary" className="bg-primary/10 text-primary border-0">
                <Zap className="h-3 w-3 mr-1" />
                {Math.round(totalConfidence * 100)}% Avg
              </Badge>
            )}
            <Badge variant="secondary">2 Credits</Badge>
          </div>
        </CardTitle>
      </CardHeader>
      
      <CardContent className="space-y-4">
        {/* AI Generate Button - Hero Style */}
        <motion.div
          whileHover={{ scale: 1.01 }}
          whileTap={{ scale: 0.99 }}
        >
          <Button
            onClick={handleAutoGenerate}
            disabled={isGenerating || sceneCount < 2}
            className="w-full h-14 relative overflow-hidden bg-gradient-to-r from-yellow-500 via-orange-500 to-pink-500 hover:from-yellow-600 hover:via-orange-600 hover:to-pink-600 border-0 shadow-lg"
          >
            {/* Animated Background */}
            <motion.div
              className="absolute inset-0 bg-gradient-to-r from-white/0 via-white/20 to-white/0"
              animate={{ x: ['-200%', '200%'] }}
              transition={{ duration: 2, repeat: Infinity, ease: 'linear' }}
            />
            
            <span className="relative flex items-center gap-2">
              {isGenerating ? (
                <>
                  <Loader2 className="h-5 w-5 animate-spin" />
                  <span>Analysiere Szenen...</span>
                </>
              ) : (
                <>
                  <Wand2 className="h-5 w-5" />
                  <span>AI Übergänge generieren</span>
                  <ChevronRight className="h-4 w-4 ml-1" />
                </>
              )}
            </span>
          </Button>
        </motion.div>

        {sceneCount < 2 && (
          <p className="text-xs text-muted-foreground text-center flex items-center justify-center gap-1">
            <Info className="h-3 w-3" />
            Mindestens 2 Szenen für Übergänge benötigt
          </p>
        )}

        {/* Default Duration Slider */}
        <div className="space-y-2 p-3 rounded-xl bg-muted/30 backdrop-blur-sm">
          <div className="flex justify-between items-center">
            <span className="text-xs font-medium flex items-center gap-1.5">
              Standard-Dauer
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger>
                    <Info className="h-3 w-3 text-muted-foreground" />
                  </TooltipTrigger>
                  <TooltipContent>
                    <p className="text-xs">Wird für neue Übergänge verwendet</p>
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            </span>
            <Badge variant="outline" className="font-mono text-xs">
              {defaultDuration.toFixed(1)}s
            </Badge>
          </div>
          <Slider
            value={[defaultDuration * 10]}
            onValueChange={(v) => setDefaultDuration(v[0] / 10)}
            min={2}
            max={20}
            step={1}
            className="py-1"
          />
        </div>

        {/* Transition Types Grid - 2026 Design */}
        <div className="space-y-2">
          <label className="text-xs font-medium">Übergangstypen wählen</label>
          <div className="grid grid-cols-3 gap-2">
            {TRANSITION_TYPES.map((transition) => {
              const isSelected = selectedTransition === transition.id;
              const isHovered = hoveredType === transition.id;
              
              return (
                <motion.button
                  key={transition.id}
                  onClick={() => setSelectedTransition(isSelected ? null : transition.id)}
                  onHoverStart={() => setHoveredType(transition.id)}
                  onHoverEnd={() => setHoveredType(null)}
                  whileHover={{ scale: 1.03, y: -2 }}
                  whileTap={{ scale: 0.97 }}
                  className={cn(
                    "relative p-3 rounded-xl border-2 transition-all duration-300 text-left overflow-hidden",
                    "backdrop-blur-xl",
                    isSelected
                      ? "border-primary bg-primary/10 shadow-[0_0_20px_hsl(var(--primary)/0.3)]"
                      : "border-border/50 hover:border-primary/50 bg-card/50"
                  )}
                >
                  {/* Animated Preview */}
                  <div className="relative mb-2">
                    <div className={cn(
                      "w-full h-10 rounded-lg overflow-hidden bg-gradient-to-r",
                      transition.gradient
                    )}>
                      <AnimatePresence>
                        {(isHovered || isSelected) && (
                          <motion.div
                            initial={{ x: '-100%', opacity: 0 }}
                            animate={{ x: '100%', opacity: 1 }}
                            exit={{ x: '100%', opacity: 0 }}
                            transition={{ duration: 1.5, repeat: Infinity }}
                            className="absolute inset-0 bg-gradient-to-r from-transparent via-white/30 to-transparent"
                          />
                        )}
                      </AnimatePresence>
                    </div>
                    <div className="absolute inset-0 flex items-center justify-center">
                      <span className="text-xl text-white drop-shadow-lg">{transition.icon}</span>
                    </div>
                  </div>

                  <div className="space-y-0.5">
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] font-semibold">{transition.name}</span>
                      {isSelected && (
                        <motion.div
                          initial={{ scale: 0 }}
                          animate={{ scale: 1 }}
                        >
                          <CheckCircle2 className="h-3 w-3 text-primary" />
                        </motion.div>
                      )}
                    </div>
                    <p className="text-[8px] text-muted-foreground line-clamp-1">
                      {transition.description}
                    </p>
                  </div>

                  {/* Premium Badge */}
                  {transition.isPremium && (
                    <Badge className="absolute -top-1 -right-1 h-4 px-1.5 text-[7px] bg-gradient-to-r from-violet-500 to-fuchsia-500 border-0">
                      PRO
                    </Badge>
                  )}

                  {/* AI Score on Hover */}
                  {isHovered && (
                    <motion.div
                      initial={{ opacity: 0, y: 5 }}
                      animate={{ opacity: 1, y: 0 }}
                      className="absolute bottom-1 right-1"
                    >
                      <Badge variant="secondary" className="text-[7px] px-1 py-0 h-3 bg-black/50 text-white">
                        <Zap className="h-2 w-2 mr-0.5" />
                        {Math.round(transition.aiScore * 100)}%
                      </Badge>
                    </motion.div>
                  )}
                </motion.button>
              );
            })}
          </div>
        </div>

        {/* Apply to All */}
        <AnimatePresence>
          {selectedTransition && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
            >
              <Button
                variant="outline"
                size="sm"
                className="w-full"
                onClick={() => handleApplyToAll(selectedTransition)}
              >
                <CheckCircle2 className="h-3.5 w-3.5 mr-1.5" />
                "{getTransitionInfo(selectedTransition)?.name}" auf alle anwenden
              </Button>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Generated Transitions List with Confidence */}
        {transitions.length > 0 && (
          <div className="space-y-2 pt-2 border-t border-border/50">
            <div className="flex justify-between items-center">
              <label className="text-xs font-medium">
                Zugewiesene Übergänge ({transitions.length})
              </label>
              <Button
                variant="ghost"
                size="sm"
                className="h-6 text-xs hover:bg-destructive/10 hover:text-destructive"
                onClick={() => onTransitionsChange([])}
              >
                <RotateCcw className="h-3 w-3 mr-1" />
                Reset
              </Button>
            </div>
            
            <div className="max-h-48 overflow-y-auto space-y-1.5 pr-1">
              {transitions.map((t, index) => {
                const info = getTransitionInfo(t.transitionType);
                const confidenceColor = t.confidence 
                  ? t.confidence > 0.85 ? 'text-green-500' 
                  : t.confidence > 0.7 ? 'text-yellow-500' 
                  : 'text-orange-500'
                  : 'text-muted-foreground';
                
                return (
                  <motion.div
                    key={t.sceneId}
                    initial={{ opacity: 0, x: -10 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: index * 0.05 }}
                    className="flex items-center justify-between p-2.5 bg-muted/30 backdrop-blur-sm rounded-lg border border-border/30 hover:border-primary/30 transition-colors"
                  >
                    <div className="flex items-center gap-2.5">
                      <div 
                        className={cn(
                          "w-8 h-8 rounded-lg flex items-center justify-center bg-gradient-to-br",
                          info?.gradient || 'from-gray-500 to-gray-600'
                        )}
                      >
                        <span className="text-white text-sm">{info?.icon}</span>
                      </div>
                      <div>
                        <div className="flex items-center gap-1.5">
                          <span className="text-xs font-medium">
                            Szene {index + 1} → {index + 2}
                          </span>
                          {t.aiSuggested && (
                            <Badge variant="secondary" className="h-4 text-[8px] px-1 bg-primary/10 text-primary border-0">
                              <Sparkles className="h-2 w-2 mr-0.5" />
                              AI
                            </Badge>
                          )}
                        </div>
                        <div className="flex items-center gap-2 text-[10px] text-muted-foreground">
                          <span>{info?.name}</span>
                          <span>•</span>
                          <span>{t.duration.toFixed(1)}s</span>
                        </div>
                      </div>
                    </div>
                    
                    <div className="flex items-center gap-2">
                      {t.confidence && (
                        <TooltipProvider>
                          <Tooltip>
                            <TooltipTrigger>
                              <Badge 
                                variant="outline" 
                                className={cn("text-[9px] px-1.5 h-5", confidenceColor)}
                              >
                                <Zap className="h-2.5 w-2.5 mr-0.5" />
                                {Math.round(t.confidence * 100)}%
                              </Badge>
                            </TooltipTrigger>
                            <TooltipContent side="left" className="max-w-[200px]">
                              <p className="text-xs">{t.reasoning || 'AI Confidence Score'}</p>
                            </TooltipContent>
                          </Tooltip>
                        </TooltipProvider>
                      )}
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-6 w-6 hover:bg-primary/10"
                      >
                        <Play className="h-3 w-3" />
                      </Button>
                    </div>
                  </motion.div>
                );
              })}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
