import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Slider } from '@/components/ui/slider';
import { Loader2, Sparkles, Wand2, Play, RotateCcw } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';

const TRANSITION_TYPES = [
  { 
    id: 'crossfade', 
    name: 'Crossfade', 
    description: 'Sanfte Überblendung',
    preview: 'linear-gradient(90deg, rgba(0,0,0,0) 0%, rgba(0,0,0,1) 100%)',
    aiScore: 0.9
  },
  { 
    id: 'dissolve', 
    name: 'Dissolve', 
    description: 'Auflösungs-Effekt',
    preview: 'radial-gradient(circle, rgba(0,0,0,0) 30%, rgba(0,0,0,1) 100%)',
    aiScore: 0.85
  },
  { 
    id: 'wipe', 
    name: 'Wipe', 
    description: 'Horizontaler Wisch',
    preview: 'linear-gradient(90deg, #3b82f6 50%, transparent 50%)',
    aiScore: 0.75
  },
  { 
    id: 'zoom', 
    name: 'Zoom', 
    description: 'Zoom-Übergang',
    preview: 'radial-gradient(circle, #8b5cf6 0%, transparent 70%)',
    aiScore: 0.8
  },
  { 
    id: 'slide', 
    name: 'Slide', 
    description: 'Schiebe-Effekt',
    preview: 'linear-gradient(135deg, #10b981 50%, transparent 50%)',
    aiScore: 0.7
  },
  { 
    id: 'morph', 
    name: 'AI Morph', 
    description: 'KI-generierter Übergang',
    preview: 'conic-gradient(from 0deg, #f59e0b, #ef4444, #8b5cf6, #3b82f6, #f59e0b)',
    aiScore: 0.95
  },
  { 
    id: 'glitch', 
    name: 'Glitch', 
    description: 'Digital-Störung',
    preview: 'repeating-linear-gradient(90deg, #ef4444 0px, #ef4444 2px, transparent 2px, transparent 4px)',
    aiScore: 0.65
  },
  { 
    id: 'blur', 
    name: 'Blur', 
    description: 'Unschärfe-Übergang',
    preview: 'linear-gradient(180deg, rgba(255,255,255,0.8) 0%, rgba(255,255,255,0) 100%)',
    aiScore: 0.82
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
  const { toast } = useToast();

  const handleAutoGenerate = async () => {
    if (sceneCount < 2) return;
    
    setIsGenerating(true);
    
    try {
      // Build scenes array for the Edge Function
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

      if (error) {
        throw new Error(error.message || 'AI Transition-Analyse fehlgeschlagen');
      }

      if (data?.recommendations && Array.isArray(data.recommendations)) {
        const generated: TransitionAssignment[] = data.recommendations.map((rec: any) => ({
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
          description: `${generated.length} Übergänge wurden analysiert und empfohlen. (${data.credits_used || 2} Credits)`,
        });
      } else {
        throw new Error('Ungültige Antwort vom Server');
      }
    } catch (err: any) {
      console.error('AI Transitions error:', err);
      toast({
        title: 'Fehler',
        description: err.message || 'AI Transition-Analyse fehlgeschlagen',
        variant: 'destructive',
      });
      
      // Fallback to local generation
      const generated: TransitionAssignment[] = [];
      for (let i = 0; i < sceneCount - 1; i++) {
        const types = TRANSITION_TYPES.sort((a, b) => b.aiScore - a.aiScore);
        const selectedType = types[i % types.length];
        
        generated.push({
          sceneId: `scene-${i}`,
          transitionType: selectedType.id,
          duration: defaultDuration,
          aiSuggested: false,
        });
      }
      onTransitionsChange(generated);
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
  };

  const handleUpdateTransition = (index: number, transitionId: string) => {
    const updated = [...transitions];
    updated[index] = {
      ...updated[index],
      transitionType: transitionId,
      aiSuggested: false,
    };
    onTransitionsChange(updated);
  };

  const getTransitionInfo = (id: string) => TRANSITION_TYPES.find(t => t.id === id);

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-sm flex items-center gap-2">
          <Sparkles className="h-4 w-4 text-yellow-500" />
          AI Transitions
          <Badge variant="secondary" className="ml-auto">2 Credits</Badge>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* AI Generate Button */}
        <Button
          onClick={handleAutoGenerate}
          disabled={isGenerating || sceneCount < 2}
          className="w-full bg-gradient-to-r from-yellow-500 to-orange-500 hover:from-yellow-600 hover:to-orange-600"
        >
          {isGenerating ? (
            <>
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              Generiere Übergänge...
            </>
          ) : (
            <>
              <Wand2 className="h-4 w-4 mr-2" />
              AI Übergänge generieren
            </>
          )}
        </Button>

        {sceneCount < 2 && (
          <p className="text-xs text-muted-foreground text-center">
            Mindestens 2 Szenen für Übergänge benötigt
          </p>
        )}

        {/* Default Duration */}
        <div className="space-y-2">
          <div className="flex justify-between">
            <span className="text-xs font-medium">Standard-Dauer</span>
            <span className="text-xs text-muted-foreground">{defaultDuration.toFixed(1)}s</span>
          </div>
          <Slider
            value={[defaultDuration * 10]}
            onValueChange={(v) => setDefaultDuration(v[0] / 10)}
            min={2}
            max={20}
            step={1}
          />
        </div>

        {/* Transition Types Grid */}
        <div className="space-y-2">
          <label className="text-xs font-medium">Übergangstypen</label>
          <div className="grid grid-cols-4 gap-2">
            {TRANSITION_TYPES.map((transition) => (
              <button
                key={transition.id}
                onClick={() => setSelectedTransition(
                  selectedTransition === transition.id ? null : transition.id
                )}
                className={`
                  relative p-2 rounded-lg border-2 transition-all text-center
                  ${selectedTransition === transition.id 
                    ? 'border-primary ring-2 ring-primary/20' 
                    : 'border-border hover:border-primary/50'
                  }
                `}
              >
                <div 
                  className="w-full h-8 rounded mb-1"
                  style={{ background: transition.preview }}
                />
                <span className="text-[9px] font-medium block">{transition.name}</span>
                {transition.id === 'morph' && (
                  <Badge className="absolute -top-1 -right-1 h-4 px-1 text-[8px]">AI</Badge>
                )}
              </button>
            ))}
          </div>
        </div>

        {/* Apply Selected to All */}
        {selectedTransition && (
          <Button
            variant="outline"
            size="sm"
            className="w-full"
            onClick={() => handleApplyToAll(selectedTransition)}
          >
            "{getTransitionInfo(selectedTransition)?.name}" auf alle anwenden
          </Button>
        )}

        {/* Generated Transitions List */}
        {transitions.length > 0 && (
          <div className="space-y-2 pt-2 border-t">
            <div className="flex justify-between items-center">
              <label className="text-xs font-medium">
                Zugewiesene Übergänge ({transitions.length})
              </label>
              <Button
                variant="ghost"
                size="sm"
                className="h-6 text-xs"
                onClick={() => onTransitionsChange([])}
              >
                <RotateCcw className="h-3 w-3 mr-1" />
                Reset
              </Button>
            </div>
            <div className="max-h-40 overflow-y-auto space-y-1">
              {transitions.map((t, index) => {
                const info = getTransitionInfo(t.transitionType);
                return (
                  <div
                    key={t.sceneId}
                    className="flex items-center justify-between p-2 bg-muted/50 rounded"
                  >
                    <div className="flex items-center gap-2">
                      <div 
                        className="w-6 h-6 rounded"
                        style={{ background: info?.preview }}
                      />
                      <div>
                        <span className="text-[10px] font-medium">
                          Szene {index + 1} → {index + 2}
                        </span>
                        <span className="text-[9px] text-muted-foreground ml-2">
                          {info?.name}
                        </span>
                        {t.confidence && (
                          <span className="text-[8px] text-green-600 ml-1">
                            ({Math.round(t.confidence * 100)}%)
                          </span>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-1">
                      {t.aiSuggested && (
                        <Badge variant="outline" className="h-4 text-[8px]">AI</Badge>
                      )}
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-5 w-5"
                      >
                        <Play className="h-3 w-3" />
                      </Button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
