import { useState, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  Dialog, 
  DialogContent, 
  DialogHeader, 
  DialogTitle, 
  DialogDescription,
  DialogFooter
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { 
  Shuffle, 
  Zap, 
  TrendingUp, 
  Clock, 
  Sparkles,
  Play,
  Check,
  ArrowRight,
  Film,
  Target,
  BarChart3
} from 'lucide-react';
import { SceneAnalysis } from '@/types/directors-cut';
import { cn } from '@/lib/utils';

interface AISceneRemixProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  scenes: SceneAnalysis[];
  onApplyRemix: (newScenes: SceneAnalysis[]) => void;
}

type RemixStrategy = 'hook-first' | 'chronological' | 'emotional-arc' | 'random' | 'tiktok' | 'youtube' | 'instagram';

interface RemixOption {
  id: RemixStrategy;
  name: string;
  description: string;
  icon: React.ReactNode;
  color: string;
  badge?: string;
}

const remixOptions: RemixOption[] = [
  {
    id: 'hook-first',
    name: 'Hook First',
    description: 'Spannendste Szene zuerst für maximale Aufmerksamkeit',
    icon: <Zap className="w-5 h-5" />,
    color: 'from-amber-500 to-orange-500',
    badge: 'Empfohlen',
  },
  {
    id: 'emotional-arc',
    name: 'Emotional Arc',
    description: 'Aufbau → Höhepunkt → emotionaler Abschluss',
    icon: <TrendingUp className="w-5 h-5" />,
    color: 'from-purple-500 to-pink-500',
  },
  {
    id: 'chronological',
    name: 'Chronologisch',
    description: 'Original-Reihenfolge beibehalten',
    icon: <Clock className="w-5 h-5" />,
    color: 'from-slate-500 to-slate-600',
  },
  {
    id: 'random',
    name: 'Random Shuffle',
    description: 'Zufällige Anordnung für überraschende Ergebnisse',
    icon: <Shuffle className="w-5 h-5" />,
    color: 'from-cyan-500 to-blue-500',
  },
];

const platformOptions: RemixOption[] = [
  {
    id: 'tiktok',
    name: 'TikTok Optimiert',
    description: 'Hook in ersten 3 Sekunden, schnelle Cuts',
    icon: <Target className="w-5 h-5" />,
    color: 'from-pink-500 to-rose-500',
    badge: 'Viral',
  },
  {
    id: 'youtube',
    name: 'YouTube Story',
    description: 'Klassischer Story-Arc mit Intro und Outro',
    icon: <Film className="w-5 h-5" />,
    color: 'from-red-500 to-red-600',
  },
  {
    id: 'instagram',
    name: 'Instagram Aesthetic',
    description: 'Visueller Flow, ästhetische Übergänge',
    icon: <Sparkles className="w-5 h-5" />,
    color: 'from-purple-500 to-pink-500',
  },
];

// Get mood intensity score
const getMoodScore = (mood: string): number => {
  const scores: Record<string, number> = {
    'energetic': 10,
    'action': 9,
    'dynamic': 8,
    'dramatic': 7,
    'exciting': 8,
    'intense': 9,
    'neutral': 5,
    'calm': 3,
    'peaceful': 2,
    'serene': 1,
  };
  return scores[mood?.toLowerCase()] ?? 5;
};

export function AISceneRemix({ 
  open, 
  onOpenChange, 
  scenes, 
  onApplyRemix 
}: AISceneRemixProps) {
  const [selectedStrategy, setSelectedStrategy] = useState<RemixStrategy>('hook-first');
  const [previewScenes, setPreviewScenes] = useState<SceneAnalysis[]>([]);
  const [isPreviewMode, setIsPreviewMode] = useState(false);

  // Calculate remixed scenes based on strategy
  const getRemixedScenes = (strategy: RemixStrategy): SceneAnalysis[] => {
    const sceneCopy = [...scenes];
    
    switch (strategy) {
      case 'hook-first': {
        // Sort by mood intensity, highest first
        return sceneCopy.sort((a, b) => getMoodScore(b.mood) - getMoodScore(a.mood));
      }
      
      case 'emotional-arc': {
        // Build-up → Climax → Resolution
        const sorted = sceneCopy.sort((a, b) => getMoodScore(a.mood) - getMoodScore(b.mood));
        const midPoint = Math.floor(sorted.length / 2);
        const buildUp = sorted.slice(0, midPoint);
        const climax = sorted.slice(midPoint);
        // Reverse climax so highest intensity is in the middle
        return [...buildUp, ...climax.reverse()];
      }
      
      case 'chronological': {
        // Original order (by original start time or index)
        return sceneCopy.sort((a, b) => {
          const aStart = a.original_start_time ?? a.start_time;
          const bStart = b.original_start_time ?? b.start_time;
          return aStart - bStart;
        });
      }
      
      case 'random': {
        // Fisher-Yates shuffle
        for (let i = sceneCopy.length - 1; i > 0; i--) {
          const j = Math.floor(Math.random() * (i + 1));
          [sceneCopy[i], sceneCopy[j]] = [sceneCopy[j], sceneCopy[i]];
        }
        return sceneCopy;
      }
      
      case 'tiktok': {
        // Most engaging scene first, then alternate intensity
        const sorted = sceneCopy.sort((a, b) => getMoodScore(b.mood) - getMoodScore(a.mood));
        const hook = sorted.shift();
        const rest = sorted.sort((a, b) => {
          // Alternate between high and low intensity
          const aScore = getMoodScore(a.mood);
          const bScore = getMoodScore(b.mood);
          return Math.abs(aScore - 5) - Math.abs(bScore - 5);
        });
        return hook ? [hook, ...rest] : rest;
      }
      
      case 'youtube': {
        // Intro (medium) → Build → Climax → Outro (calm)
        const sorted = sceneCopy.sort((a, b) => getMoodScore(a.mood) - getMoodScore(b.mood));
        const calm = sorted.filter(s => getMoodScore(s.mood) <= 4);
        const intense = sorted.filter(s => getMoodScore(s.mood) > 4);
        const intro = calm.shift();
        const outro = calm.pop() || calm.shift();
        return [intro, ...intense, outro].filter(Boolean) as SceneAnalysis[];
      }
      
      case 'instagram': {
        // Group by similar moods for smooth visual flow
        const grouped: Record<string, SceneAnalysis[]> = {};
        sceneCopy.forEach(s => {
          const key = s.mood || 'neutral';
          if (!grouped[key]) grouped[key] = [];
          grouped[key].push(s);
        });
        return Object.values(grouped).flat();
      }
      
      default:
        return sceneCopy;
    }
  };

  // Recalculate timing for remixed scenes
  const recalculateTiming = (remixedScenes: SceneAnalysis[]): SceneAnalysis[] => {
    let currentTime = 0;
    return remixedScenes.map((scene, index) => {
      const duration = scene.end_time - scene.start_time;
      const newScene = {
        ...scene,
        id: `scene-${index + 1}`,
        start_time: currentTime,
        end_time: currentTime + duration,
      };
      currentTime += duration;
      return newScene;
    });
  };

  const handlePreview = () => {
    const remixed = getRemixedScenes(selectedStrategy);
    const withTiming = recalculateTiming(remixed);
    setPreviewScenes(withTiming);
    setIsPreviewMode(true);
  };

  const handleApply = () => {
    const finalScenes = isPreviewMode 
      ? previewScenes 
      : recalculateTiming(getRemixedScenes(selectedStrategy));
    onApplyRemix(finalScenes);
    onOpenChange(false);
    setIsPreviewMode(false);
  };

  const displayScenes = isPreviewMode ? previewScenes : scenes;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <div className="p-2 rounded-lg bg-gradient-to-br from-purple-500 to-pink-500 text-white">
              <Shuffle className="w-5 h-5" />
            </div>
            AI Scene Remix
          </DialogTitle>
          <DialogDescription>
            Lass die KI deine Szenen intelligent neu anordnen für maximale Wirkung
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6 py-4">
          {/* Strategy Selection */}
          <div className="space-y-3">
            <h4 className="text-sm font-medium flex items-center gap-2">
              <BarChart3 className="w-4 h-4 text-primary" />
              Remix-Strategie
            </h4>
            <div className="grid grid-cols-2 gap-2">
              {remixOptions.map((option) => (
                <motion.div
                  key={option.id}
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                >
                  <Card
                    className={cn(
                      'cursor-pointer transition-all border-2',
                      selectedStrategy === option.id
                        ? 'border-primary bg-primary/5'
                        : 'border-transparent hover:border-border'
                    )}
                    onClick={() => {
                      setSelectedStrategy(option.id);
                      setIsPreviewMode(false);
                    }}
                  >
                    <CardContent className="p-3 flex items-start gap-3">
                      <div className={cn(
                        'p-2 rounded-lg bg-gradient-to-br text-white shrink-0',
                        option.color
                      )}>
                        {option.icon}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="font-medium text-sm">{option.name}</span>
                          {option.badge && (
                            <Badge variant="secondary" className="text-[10px]">
                              {option.badge}
                            </Badge>
                          )}
                          {selectedStrategy === option.id && (
                            <Check className="w-4 h-4 text-primary ml-auto" />
                          )}
                        </div>
                        <p className="text-xs text-muted-foreground mt-0.5">
                          {option.description}
                        </p>
                      </div>
                    </CardContent>
                  </Card>
                </motion.div>
              ))}
            </div>
          </div>

          {/* Platform Optimization */}
          <div className="space-y-3">
            <h4 className="text-sm font-medium flex items-center gap-2">
              <Target className="w-4 h-4 text-primary" />
              Platform-Optimierung
            </h4>
            <div className="grid grid-cols-3 gap-2">
              {platformOptions.map((option) => (
                <motion.div
                  key={option.id}
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                >
                  <Card
                    className={cn(
                      'cursor-pointer transition-all border-2',
                      selectedStrategy === option.id
                        ? 'border-primary bg-primary/5'
                        : 'border-transparent hover:border-border'
                    )}
                    onClick={() => {
                      setSelectedStrategy(option.id);
                      setIsPreviewMode(false);
                    }}
                  >
                    <CardContent className="p-3 text-center">
                      <div className={cn(
                        'p-2 rounded-lg bg-gradient-to-br text-white inline-flex mb-2',
                        option.color
                      )}>
                        {option.icon}
                      </div>
                      <div className="flex items-center justify-center gap-1">
                        <span className="font-medium text-xs">{option.name}</span>
                        {option.badge && (
                          <Badge variant="secondary" className="text-[9px] px-1">
                            {option.badge}
                          </Badge>
                        )}
                      </div>
                    </CardContent>
                  </Card>
                </motion.div>
              ))}
            </div>
          </div>

          {/* Preview Section */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <h4 className="text-sm font-medium flex items-center gap-2">
                <Film className="w-4 h-4 text-primary" />
                {isPreviewMode ? 'Vorschau der neuen Reihenfolge' : 'Aktuelle Reihenfolge'}
              </h4>
              {!isPreviewMode && (
                <Button size="sm" variant="outline" onClick={handlePreview}>
                  <Play className="w-3.5 h-3.5 mr-1.5" />
                  Vorschau
                </Button>
              )}
            </div>
            
            <div className="flex gap-2 overflow-x-auto pb-2">
              <AnimatePresence mode="popLayout">
                {displayScenes.map((scene, index) => (
                  <motion.div
                    key={scene.id}
                    layout
                    initial={{ opacity: 0, scale: 0.8 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.8 }}
                    transition={{ delay: index * 0.05 }}
                    className="shrink-0"
                  >
                    <Card className="w-32 overflow-hidden">
                      <div className="h-16 bg-gradient-to-br from-muted to-muted/50 flex items-center justify-center">
                        <span className="text-2xl font-bold text-muted-foreground/30">
                          {index + 1}
                        </span>
                      </div>
                      <CardContent className="p-2">
                        <div className="flex items-center gap-1 mb-1">
                          <Badge 
                            variant="outline" 
                            className="text-[9px] px-1 capitalize"
                          >
                            {scene.mood || 'neutral'}
                          </Badge>
                        </div>
                        <p className="text-[10px] text-muted-foreground line-clamp-2">
                          {scene.description}
                        </p>
                        <div className="text-[9px] text-muted-foreground/70 mt-1 font-mono">
                          {(scene.end_time - scene.start_time).toFixed(1)}s
                        </div>
                      </CardContent>
                    </Card>
                  </motion.div>
                ))}
              </AnimatePresence>
            </div>

            {isPreviewMode && (
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                className="p-3 rounded-lg bg-green-500/10 border border-green-500/30 text-sm text-green-700 dark:text-green-400"
              >
                ✓ Vorschau aktiv - Klicke "Anwenden" um die neue Reihenfolge zu übernehmen
              </motion.div>
            )}
          </div>
        </div>

        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={() => {
            onOpenChange(false);
            setIsPreviewMode(false);
          }}>
            Abbrechen
          </Button>
          <Button onClick={handleApply} className="bg-gradient-to-r from-purple-500 to-pink-500">
            <Sparkles className="w-4 h-4 mr-1.5" />
            {isPreviewMode ? 'Anwenden' : 'Remix & Anwenden'}
            <ArrowRight className="w-4 h-4 ml-1.5" />
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
