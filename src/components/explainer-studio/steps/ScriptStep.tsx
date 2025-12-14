import { useState } from 'react';
import { motion } from 'framer-motion';
import { ArrowLeft, ArrowRight, Sparkles, Loader2, Clock, Edit3, RefreshCw, Check } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { cn } from '@/lib/utils';
import { useToast } from '@/hooks/use-toast';
import type { ExplainerBriefing, ExplainerScript, ScriptScene } from '@/types/explainer-studio';

interface ScriptStepProps {
  briefing: ExplainerBriefing;
  initialScript: ExplainerScript | null;
  onComplete: (script: ExplainerScript) => void;
  onBack: () => void;
}

export function ScriptStep({ briefing, initialScript, onComplete, onBack }: ScriptStepProps) {
  const { toast } = useToast();
  const [script, setScript] = useState<ExplainerScript | null>(initialScript);
  const [isGenerating, setIsGenerating] = useState(false);
  const [editingSceneId, setEditingSceneId] = useState<string | null>(null);

  const generateScript = async () => {
    setIsGenerating(true);
    
    try {
      // Simulate AI generation - will be replaced with actual API call
      await new Promise(resolve => setTimeout(resolve, 3000));
      
      const mockScript: ExplainerScript = {
        id: crypto.randomUUID(),
        title: 'Erklärvideo: ' + briefing.productDescription.substring(0, 50) + '...',
        synopsis: 'Ein professionelles Erklärvideo über Ihr Produkt.',
        totalDuration: briefing.duration,
        createdAt: new Date().toISOString(),
        scenes: [
          {
            id: crypto.randomUUID(),
            type: 'hook',
            title: 'Hook',
            spokenText: 'Kennst du das Problem, dass du stundenlang an Social Media Posts sitzt, aber nie weißt, ob sie wirklich ankommen?',
            visualDescription: 'Eine frustrierte Person sitzt vor dem Computer, umgeben von Social Media Icons. Uhr zeigt später Abend.',
            durationSeconds: Math.floor(briefing.duration * 0.15),
            startTime: 0,
            endTime: Math.floor(briefing.duration * 0.15),
            emotionalTone: 'Frustration, Empathie'
          },
          {
            id: crypto.randomUUID(),
            type: 'problem',
            title: 'Problem',
            spokenText: 'Jeden Tag verlierst du wertvolle Zeit mit dem Erstellen, Planen und Analysieren von Content. Zeit, die du eigentlich für dein Kerngeschäft nutzen könntest.',
            visualDescription: 'Split-Screen: Links eine Uhr die tickt, rechts stapeln sich Aufgaben. Kalender füllt sich mit Posts.',
            durationSeconds: Math.floor(briefing.duration * 0.2),
            startTime: Math.floor(briefing.duration * 0.15),
            endTime: Math.floor(briefing.duration * 0.35),
            emotionalTone: 'Stress, Zeitdruck'
          },
          {
            id: crypto.randomUUID(),
            type: 'solution',
            title: 'Lösung',
            spokenText: 'Mit unserer Lösung automatisierst du deinen gesamten Social Media Workflow. Von der Idee bis zur Veröffentlichung – alles an einem Ort.',
            visualDescription: 'Dashboard erscheint. Zentrale Oberfläche mit Kalender, Analytics und Content-Erstellung. Alles fließt zusammen.',
            durationSeconds: Math.floor(briefing.duration * 0.25),
            startTime: Math.floor(briefing.duration * 0.35),
            endTime: Math.floor(briefing.duration * 0.6),
            emotionalTone: 'Erleichterung, Begeisterung'
          },
          {
            id: crypto.randomUUID(),
            type: 'feature',
            title: 'Features',
            spokenText: 'KI-generierte Captions, intelligente Posting-Zeiten und detaillierte Analytics – alles was du brauchst für maximale Reichweite.',
            visualDescription: 'Drei Feature-Cards erscheinen nacheinander mit Icons und kurzen Demos. Engagement-Zahlen steigen.',
            durationSeconds: Math.floor(briefing.duration * 0.2),
            startTime: Math.floor(briefing.duration * 0.6),
            endTime: Math.floor(briefing.duration * 0.8),
            emotionalTone: 'Beeindruckt, Neugier'
          },
          {
            id: crypto.randomUUID(),
            type: 'cta',
            title: 'Call-to-Action',
            spokenText: 'Starte jetzt kostenlos und erlebe, wie einfach Social Media Management sein kann. Klicke auf den Link und spare 2 Stunden pro Tag!',
            visualDescription: 'CTA-Button pulsiert. Countdown oder Angebot erscheint. Logo und Tagline zum Abschluss.',
            durationSeconds: Math.floor(briefing.duration * 0.2),
            startTime: Math.floor(briefing.duration * 0.8),
            endTime: briefing.duration,
            emotionalTone: 'Dringlichkeit, Motivation'
          }
        ]
      };
      
      setScript(mockScript);
      toast({
        title: "Drehbuch generiert!",
        description: "Dein KI-generiertes Drehbuch ist fertig zur Bearbeitung.",
      });
    } catch (error) {
      toast({
        title: "Fehler",
        description: "Das Drehbuch konnte nicht generiert werden.",
        variant: "destructive"
      });
    } finally {
      setIsGenerating(false);
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

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold">KI-Drehbuch Generator</h2>
          <p className="text-muted-foreground">
            Generiere ein professionelles Erklärvideo-Drehbuch basierend auf deinem Briefing
          </p>
        </div>
        
        {!script && (
          <Button
            onClick={generateScript}
            disabled={isGenerating}
            size="lg"
            className="bg-gradient-to-r from-primary to-purple-500 hover:shadow-[0_0_30px_rgba(245,199,106,0.4)]"
          >
            {isGenerating ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Generiere Drehbuch...
              </>
            ) : (
              <>
                <Sparkles className="h-4 w-4 mr-2" />
                Drehbuch generieren
              </>
            )}
          </Button>
        )}
      </div>

      {/* Generation Progress */}
      {isGenerating && (
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-card/60 backdrop-blur-xl border border-white/10 rounded-2xl p-8 text-center"
        >
          <div className="w-16 h-16 rounded-full bg-primary/20 flex items-center justify-center mx-auto mb-4">
            <Sparkles className="h-8 w-8 text-primary animate-pulse" />
          </div>
          <h3 className="text-xl font-semibold mb-2">KI analysiert dein Briefing...</h3>
          <p className="text-muted-foreground mb-4">
            Das Drehbuch wird basierend auf der Loft-Film 5-Akt-Struktur erstellt.
          </p>
          <div className="flex items-center justify-center gap-2 text-sm text-muted-foreground">
            <Clock className="h-4 w-4" />
            <span>Geschätzte Zeit: ~10 Sekunden</span>
          </div>
        </motion.div>
      )}

      {/* Script Display */}
      {script && !isGenerating && (
        <div className="space-y-4">
          {/* Script Header */}
          <div className="bg-card/60 backdrop-blur-xl border border-white/10 rounded-2xl p-6">
            <div className="flex items-start justify-between">
              <div>
                <h3 className="text-lg font-semibold">{script.title}</h3>
                <p className="text-sm text-muted-foreground mt-1">{script.synopsis}</p>
              </div>
              <div className="flex items-center gap-2">
                <div className="text-right">
                  <div className="text-2xl font-bold text-primary">{script.totalDuration}s</div>
                  <div className="text-xs text-muted-foreground">Gesamtlänge</div>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={generateScript}
                  className="ml-4"
                >
                  <RefreshCw className="h-4 w-4 mr-1" />
                  Neu generieren
                </Button>
              </div>
            </div>
          </div>

          {/* Timeline */}
          <div className="bg-card/40 backdrop-blur-sm border border-white/5 rounded-xl p-3">
            <div className="flex gap-1 h-2 rounded-full overflow-hidden">
              {script.scenes.map((scene) => (
                <div
                  key={scene.id}
                  className={cn(
                    "h-full transition-all",
                    scene.type === 'hook' && 'bg-red-500',
                    scene.type === 'problem' && 'bg-orange-500',
                    scene.type === 'solution' && 'bg-green-500',
                    scene.type === 'feature' && 'bg-blue-500',
                    scene.type === 'proof' && 'bg-purple-500',
                    scene.type === 'cta' && 'bg-primary'
                  )}
                  style={{ width: `${(scene.durationSeconds / script.totalDuration) * 100}%` }}
                />
              ))}
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
                      "w-12 h-12 rounded-xl flex items-center justify-center text-2xl border",
                      getSceneTypeColor(scene.type)
                    )}>
                      {getSceneTypeEmoji(scene.type)}
                    </div>
                    <span className="text-xs text-muted-foreground">
                      {scene.startTime}s - {scene.endTime}s
                    </span>
                  </div>

                  {/* Scene Content */}
                  <div className="flex-1 space-y-3">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className={cn(
                          "px-2 py-0.5 rounded text-xs font-medium border",
                          getSceneTypeColor(scene.type)
                        )}>
                          {scene.title}
                        </span>
                        <span className="text-sm text-muted-foreground">
                          {scene.durationSeconds} Sekunden
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
                          <Check className="h-4 w-4" />
                        ) : (
                          <Edit3 className="h-4 w-4" />
                        )}
                      </Button>
                    </div>

                    {/* Spoken Text */}
                    <div>
                      <label className="text-xs font-medium text-muted-foreground mb-1 block">
                        🎤 Sprechertext
                      </label>
                      {editingSceneId === scene.id ? (
                        <Textarea
                          value={scene.spokenText}
                          onChange={(e) => updateScene(scene.id, { spokenText: e.target.value })}
                          className="bg-muted/20 border-white/10 min-h-[80px]"
                        />
                      ) : (
                        <p className="text-sm">{scene.spokenText}</p>
                      )}
                    </div>

                    {/* Visual Description */}
                    <div>
                      <label className="text-xs font-medium text-muted-foreground mb-1 block">
                        🎬 Visuelle Beschreibung
                      </label>
                      {editingSceneId === scene.id ? (
                        <Textarea
                          value={scene.visualDescription}
                          onChange={(e) => updateScene(scene.id, { visualDescription: e.target.value })}
                          className="bg-muted/20 border-white/10 min-h-[60px]"
                        />
                      ) : (
                        <p className="text-sm text-muted-foreground">{scene.visualDescription}</p>
                      )}
                    </div>

                    {/* Emotional Tone */}
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-muted-foreground">Emotion:</span>
                      <span className="text-xs px-2 py-0.5 rounded bg-muted/20 text-muted-foreground">
                        {scene.emotionalTone}
                      </span>
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
