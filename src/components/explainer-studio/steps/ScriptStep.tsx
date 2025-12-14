import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { ArrowLeft, ArrowRight, Sparkles, Loader2, Clock, Edit3, RefreshCw, Check, AlertCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import type { ExplainerBriefing, ExplainerScript, ScriptScene } from '@/types/explainer-studio';

interface ScriptStepProps {
  briefing: ExplainerBriefing;
  initialScript: ExplainerScript | null;
  onComplete: (script: ExplainerScript) => void;
  onBack: () => void;
}

// Map API response to internal format
function mapApiSceneToInternal(apiScene: any, index: number, totalDuration: number): ScriptScene {
  const sceneTypes: ScriptScene['type'][] = ['hook', 'problem', 'solution', 'feature', 'cta'];
  const type = sceneTypes[Math.min(index, sceneTypes.length - 1)];
  
  // Calculate timing based on scene order
  const sceneDuration = apiScene.duration || Math.floor(totalDuration / 5);
  const startTime = index === 0 ? 0 : undefined; // Will be calculated below
  
  return {
    id: apiScene.id || `scene-${index + 1}`,
    type,
    title: apiScene.title || `Szene ${index + 1}`,
    spokenText: apiScene.voiceover || '',
    visualDescription: apiScene.visualDescription || '',
    durationSeconds: sceneDuration,
    startTime: 0, // Will be recalculated
    endTime: 0, // Will be recalculated
    emotionalTone: apiScene.mood || 'neutral',
    keyElements: apiScene.keyElements || []
  };
}

function calculateSceneTiming(scenes: ScriptScene[]): ScriptScene[] {
  let currentTime = 0;
  return scenes.map(scene => {
    const startTime = currentTime;
    const endTime = currentTime + scene.durationSeconds;
    currentTime = endTime;
    return { ...scene, startTime, endTime };
  });
}

export function ScriptStep({ briefing, initialScript, onComplete, onBack }: ScriptStepProps) {
  const [script, setScript] = useState<ExplainerScript | null>(initialScript);
  const [isGenerating, setIsGenerating] = useState(false);
  const [editingSceneId, setEditingSceneId] = useState<string | null>(null);
  const [generationProgress, setGenerationProgress] = useState(0);

  // Auto-generate on mount if no script exists
  useEffect(() => {
    if (!script && !isGenerating) {
      // Small delay to allow UI to settle
      const timer = setTimeout(() => generateScript(), 500);
      return () => clearTimeout(timer);
    }
  }, []);

  const generateScript = async () => {
    setIsGenerating(true);
    setGenerationProgress(0);
    
    // Simulate progress
    const progressInterval = setInterval(() => {
      setGenerationProgress(prev => Math.min(prev + 10, 90));
    }, 800);

    try {
      const { data, error } = await supabase.functions.invoke('generate-explainer-script', {
        body: { briefing }
      });

      clearInterval(progressInterval);
      setGenerationProgress(100);

      if (error) {
        console.error('Script generation error:', error);
        toast.error('Fehler bei der Drehbuch-Generierung', {
          description: error.message || 'Bitte versuche es erneut.'
        });
        return;
      }

      if (data?.error) {
        toast.error('KI-Fehler', {
          description: data.error
        });
        return;
      }

      const apiScript = data.script;
      
      // Transform API response to internal format
      const totalDuration = typeof briefing.duration === 'number' ? briefing.duration : parseInt(String(briefing.duration)) || 60;
      const scenes = apiScript.scenes.map((s: any, i: number) => 
        mapApiSceneToInternal(s, i, totalDuration)
      );
      const timedScenes = calculateSceneTiming(scenes);
      
      const generatedScript: ExplainerScript = {
        id: crypto.randomUUID(),
        title: apiScript.title || 'Erklärvideo',
        synopsis: apiScript.summary || '',
        totalDuration: timedScenes.reduce((sum, s) => sum + s.durationSeconds, 0),
        createdAt: new Date().toISOString(),
        scenes: timedScenes
      };
      
      setScript(generatedScript);
      toast.success('Drehbuch erfolgreich generiert!', {
        description: `${generatedScript.scenes.length} Szenen, ${generatedScript.totalDuration} Sekunden`
      });

    } catch (err) {
      console.error('Unexpected error:', err);
      clearInterval(progressInterval);
      toast.error('Unerwarteter Fehler', {
        description: 'Bitte versuche es erneut.'
      });
    } finally {
      setIsGenerating(false);
      setGenerationProgress(0);
    }
  };

  const updateScene = (sceneId: string, updates: Partial<ScriptScene>) => {
    if (!script) return;
    
    setScript({
      ...script,
      scenes: script.scenes.map(scene =>
        scene.id === sceneId ? { ...scene, ...updates } : scene
      )
    });
  };

  const getSceneTypeColor = (type: ScriptScene['type']) => {
    switch (type) {
      case 'hook': return 'bg-red-500/20 text-red-400 border-red-500/30';
      case 'problem': return 'bg-orange-500/20 text-orange-400 border-orange-500/30';
      case 'solution': return 'bg-green-500/20 text-green-400 border-green-500/30';
      case 'feature': return 'bg-blue-500/20 text-blue-400 border-blue-500/30';
      case 'proof': return 'bg-purple-500/20 text-purple-400 border-purple-500/30';
      case 'cta': return 'bg-primary/20 text-primary border-primary/30';
    }
  };

  const getSceneTypeEmoji = (type: ScriptScene['type']) => {
    switch (type) {
      case 'hook': return '🎯';
      case 'problem': return '😫';
      case 'solution': return '✨';
      case 'feature': return '⚡';
      case 'proof': return '📊';
      case 'cta': return '🚀';
    }
  };

  const getSceneTypeName = (type: ScriptScene['type']) => {
    switch (type) {
      case 'hook': return 'Hook';
      case 'problem': return 'Problem';
      case 'solution': return 'Lösung';
      case 'feature': return 'Features';
      case 'proof': return 'Beweis';
      case 'cta': return 'Call-to-Action';
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold">KI-Drehbuch Generator</h2>
          <p className="text-muted-foreground">
            Professionelles 5-Akt-Drehbuch nach der Loft-Film Methode
          </p>
        </div>
        
        {!script && !isGenerating && (
          <Button
            onClick={generateScript}
            size="lg"
            className="bg-gradient-to-r from-primary to-purple-500 hover:shadow-[0_0_30px_rgba(245,199,106,0.4)]"
          >
            <Sparkles className="h-4 w-4 mr-2" />
            Drehbuch generieren
          </Button>
        )}
      </div>

      {/* Generation Progress */}
      {isGenerating && (
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-card/60 backdrop-blur-xl border border-white/10 rounded-2xl p-8"
        >
          <div className="flex items-center gap-6">
            <div className="w-20 h-20 rounded-2xl bg-primary/20 flex items-center justify-center">
              <Sparkles className="h-10 w-10 text-primary animate-pulse" />
            </div>
            <div className="flex-1">
              <h3 className="text-xl font-semibold mb-2">KI analysiert dein Briefing...</h3>
              <p className="text-muted-foreground mb-4">
                Erstelle 5-Akt-Struktur mit Hook, Problem, Lösung, Features und CTA
              </p>
              
              {/* Progress Bar */}
              <div className="h-2 bg-muted/30 rounded-full overflow-hidden">
                <motion.div
                  className="h-full bg-gradient-to-r from-primary to-purple-500"
                  initial={{ width: 0 }}
                  animate={{ width: `${generationProgress}%` }}
                  transition={{ duration: 0.3 }}
                />
              </div>
              
              <div className="flex items-center justify-between mt-2 text-sm text-muted-foreground">
                <div className="flex items-center gap-2">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  <span>Generiere professionelles Drehbuch...</span>
                </div>
                <span>{generationProgress}%</span>
              </div>
            </div>
          </div>
        </motion.div>
      )}

      {/* Script Display */}
      {script && !isGenerating && (
        <div className="space-y-4">
          {/* Script Header */}
          <div className="bg-card/60 backdrop-blur-xl border border-white/10 rounded-2xl p-6">
            <div className="flex items-start justify-between">
              <div className="flex-1">
                <h3 className="text-lg font-semibold">{script.title}</h3>
                <p className="text-sm text-muted-foreground mt-1">{script.synopsis}</p>
              </div>
              <div className="flex items-center gap-4 ml-4">
                <div className="text-right">
                  <div className="text-2xl font-bold text-primary">{script.totalDuration}s</div>
                  <div className="text-xs text-muted-foreground">Gesamtlänge</div>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={generateScript}
                >
                  <RefreshCw className="h-4 w-4 mr-1" />
                  Neu generieren
                </Button>
              </div>
            </div>
          </div>

          {/* Timeline Visualization */}
          <div className="bg-card/40 backdrop-blur-sm border border-white/5 rounded-xl p-4">
            <div className="flex items-center gap-2 mb-2">
              <Clock className="h-4 w-4 text-muted-foreground" />
              <span className="text-sm text-muted-foreground">Timeline</span>
            </div>
            <div className="flex gap-1 h-3 rounded-full overflow-hidden">
              {script.scenes.map((scene) => (
                <motion.div
                  key={scene.id}
                  className={cn(
                    "h-full transition-all cursor-pointer relative group",
                    scene.type === 'hook' && 'bg-red-500',
                    scene.type === 'problem' && 'bg-orange-500',
                    scene.type === 'solution' && 'bg-green-500',
                    scene.type === 'feature' && 'bg-blue-500',
                    scene.type === 'proof' && 'bg-purple-500',
                    scene.type === 'cta' && 'bg-primary'
                  )}
                  style={{ width: `${(scene.durationSeconds / script.totalDuration) * 100}%` }}
                  whileHover={{ scale: 1.1 }}
                />
              ))}
            </div>
            <div className="flex justify-between mt-2 text-xs text-muted-foreground">
              <span>0s</span>
              <span>{Math.floor(script.totalDuration / 2)}s</span>
              <span>{script.totalDuration}s</span>
            </div>
          </div>

          {/* Scenes */}
          <div className="space-y-4">
            {script.scenes.map((scene, index) => (
              <motion.div
                key={scene.id}
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: index * 0.1 }}
                className={cn(
                  "bg-card/60 backdrop-blur-xl border rounded-2xl p-6 transition-all duration-300",
                  editingSceneId === scene.id 
                    ? "border-primary/50 shadow-[0_0_20px_rgba(245,199,106,0.2)]" 
                    : "border-white/10 hover:border-white/20"
                )}
              >
                <div className="flex items-start gap-4">
                  {/* Scene Number & Type */}
                  <div className="flex flex-col items-center gap-2">
                    <div className={cn(
                      "w-14 h-14 rounded-xl flex items-center justify-center text-2xl border",
                      getSceneTypeColor(scene.type)
                    )}>
                      {getSceneTypeEmoji(scene.type)}
                    </div>
                    <div className="text-center">
                      <span className="text-xs font-medium block">{scene.startTime}s - {scene.endTime}s</span>
                      <span className="text-xs text-muted-foreground">{scene.durationSeconds}s</span>
                    </div>
                  </div>

                  {/* Scene Content */}
                  <div className="flex-1 space-y-4">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <span className="text-sm font-medium text-muted-foreground">
                          Akt {index + 1}
                        </span>
                        <span className={cn(
                          "px-3 py-1 rounded-lg text-sm font-medium border",
                          getSceneTypeColor(scene.type)
                        )}>
                          {getSceneTypeName(scene.type)}
                        </span>
                      </div>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setEditingSceneId(
                          editingSceneId === scene.id ? null : scene.id
                        )}
                      >
                        {editingSceneId === scene.id ? (
                          <>
                            <Check className="h-4 w-4 mr-1" />
                            Fertig
                          </>
                        ) : (
                          <>
                            <Edit3 className="h-4 w-4 mr-1" />
                            Bearbeiten
                          </>
                        )}
                      </Button>
                    </div>

                    {/* Spoken Text */}
                    <div className="bg-muted/10 rounded-xl p-4 border border-white/5">
                      <label className="text-xs font-medium text-primary mb-2 flex items-center gap-2">
                        🎤 Sprechertext
                      </label>
                      {editingSceneId === scene.id ? (
                        <Textarea
                          value={scene.spokenText}
                          onChange={(e) => updateScene(scene.id, { spokenText: e.target.value })}
                          className="bg-muted/20 border-white/10 min-h-[100px] mt-2"
                        />
                      ) : (
                        <p className="text-sm leading-relaxed">{scene.spokenText}</p>
                      )}
                    </div>

                    {/* Visual Description */}
                    <div className="bg-muted/10 rounded-xl p-4 border border-white/5">
                      <label className="text-xs font-medium text-cyan-400 mb-2 flex items-center gap-2">
                        🎬 Visuelle Beschreibung
                      </label>
                      {editingSceneId === scene.id ? (
                        <Textarea
                          value={scene.visualDescription}
                          onChange={(e) => updateScene(scene.id, { visualDescription: e.target.value })}
                          className="bg-muted/20 border-white/10 min-h-[80px] mt-2"
                        />
                      ) : (
                        <p className="text-sm text-muted-foreground leading-relaxed">{scene.visualDescription}</p>
                      )}
                    </div>

                    {/* Key Elements & Mood */}
                    <div className="flex items-center gap-4 flex-wrap">
                      <div className="flex items-center gap-2">
                        <span className="text-xs text-muted-foreground">Stimmung:</span>
                        <span className="text-xs px-2 py-1 rounded-lg bg-muted/20 text-muted-foreground capitalize">
                          {scene.emotionalTone}
                        </span>
                      </div>
                      {scene.keyElements && scene.keyElements.length > 0 && (
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-xs text-muted-foreground">Elemente:</span>
                          {scene.keyElements.slice(0, 3).map((element, i) => (
                            <span 
                              key={i}
                              className="text-xs px-2 py-1 rounded-lg bg-primary/10 text-primary/80"
                            >
                              {element}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </motion.div>
            ))}
          </div>
        </div>
      )}

      {/* Navigation */}
      <div className="flex justify-between pt-4">
        <Button variant="outline" onClick={onBack}>
          <ArrowLeft className="h-4 w-4 mr-2" />
          Zurück
        </Button>
        
        <Button
          onClick={() => script && onComplete(script)}
          disabled={!script}
          className="bg-gradient-to-r from-primary to-purple-500"
        >
          Weiter zu Visuals
          <ArrowRight className="h-4 w-4 ml-2" />
        </Button>
      </div>
    </div>
  );
}
