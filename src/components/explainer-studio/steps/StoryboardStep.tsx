import { useState, useCallback } from 'react';
import { motion, AnimatePresence, Reorder } from 'framer-motion';
import { 
  ArrowLeft, ArrowRight, GripVertical, Edit3, Check, X, RefreshCw, 
  Trash2, Plus, Scissors, Merge, ThumbsUp, ThumbsDown, Loader2,
  Clock, Sparkles, Image as ImageIcon
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import type { ExplainerBriefing, ExplainerScript, ScriptScene } from '@/types/explainer-studio';

interface StoryboardStepProps {
  briefing: ExplainerBriefing;
  script: ExplainerScript;
  onComplete: (updatedScript: ExplainerScript) => void;
  onBack: () => void;
}

interface SceneStatus {
  sceneId: string;
  status: 'pending' | 'approved' | 'rejected' | 'regenerating';
}

export function StoryboardStep({ briefing, script: initialScript, onComplete, onBack }: StoryboardStepProps) {
  const [scenes, setScenes] = useState<ScriptScene[]>(initialScript.scenes);
  const [sceneStatuses, setSceneStatuses] = useState<SceneStatus[]>(
    initialScript.scenes.map(s => ({ sceneId: s.id, status: 'pending' as const }))
  );
  const [editingSceneId, setEditingSceneId] = useState<string | null>(null);
  const [regeneratingSceneId, setRegeneratingSceneId] = useState<string | null>(null);

  // Recalculate timing when scenes change
  const recalculateTiming = useCallback((sceneList: ScriptScene[]): ScriptScene[] => {
    let currentTime = 0;
    return sceneList.map(scene => {
      const startTime = currentTime;
      const endTime = currentTime + scene.durationSeconds;
      currentTime = endTime;
      return { ...scene, startTime, endTime };
    });
  }, []);

  // Reorder handler
  const handleReorder = (newOrder: ScriptScene[]) => {
    const retimedScenes = recalculateTiming(newOrder);
    setScenes(retimedScenes);
  };

  // Update scene
  const updateScene = (sceneId: string, updates: Partial<ScriptScene>) => {
    const updated = scenes.map(scene =>
      scene.id === sceneId ? { ...scene, ...updates } : scene
    );
    setScenes(recalculateTiming(updated));
  };

  // Approve scene
  const approveScene = (sceneId: string) => {
    setSceneStatuses(prev => 
      prev.map(s => s.sceneId === sceneId ? { ...s, status: 'approved' } : s)
    );
    toast.success('Szene genehmigt!');
  };

  // Reject scene (mark for regeneration)
  const rejectScene = (sceneId: string) => {
    setSceneStatuses(prev => 
      prev.map(s => s.sceneId === sceneId ? { ...s, status: 'rejected' } : s)
    );
    toast.info('Szene markiert für Regenerierung');
  };

  // Regenerate single scene
  const regenerateScene = async (sceneId: string) => {
    const scene = scenes.find(s => s.id === sceneId);
    if (!scene) return;

    setRegeneratingSceneId(sceneId);
    setSceneStatuses(prev => 
      prev.map(s => s.sceneId === sceneId ? { ...s, status: 'regenerating' } : s)
    );

    try {
      const { data, error } = await supabase.functions.invoke('regenerate-explainer-scene', {
        body: { 
          briefing, 
          sceneType: scene.type,
          sceneIndex: scenes.indexOf(scene),
          previousScene: scenes.indexOf(scene) > 0 ? scenes[scenes.indexOf(scene) - 1] : null,
          nextScene: scenes.indexOf(scene) < scenes.length - 1 ? scenes[scenes.indexOf(scene) + 1] : null,
          currentDuration: scene.durationSeconds
        }
      });

      if (error) throw error;

      if (data?.scene) {
        const newScene: ScriptScene = {
          ...scene,
          spokenText: data.scene.voiceover || scene.spokenText,
          visualDescription: data.scene.visualDescription || scene.visualDescription,
          keyElements: data.scene.keyElements || scene.keyElements,
          emotionalTone: data.scene.mood || scene.emotionalTone,
        };

        const updated = scenes.map(s => s.id === sceneId ? newScene : s);
        setScenes(recalculateTiming(updated));
        setSceneStatuses(prev => 
          prev.map(s => s.sceneId === sceneId ? { ...s, status: 'pending' } : s)
        );
        toast.success('Szene erfolgreich regeneriert!');
      }
    } catch (err) {
      console.error('Scene regeneration error:', err);
      toast.error('Fehler bei der Regenerierung');
      setSceneStatuses(prev => 
        prev.map(s => s.sceneId === sceneId ? { ...s, status: 'pending' } : s)
      );
    } finally {
      setRegeneratingSceneId(null);
    }
  };

  // Delete scene
  const deleteScene = (sceneId: string) => {
    if (scenes.length <= 2) {
      toast.error('Mindestens 2 Szenen erforderlich');
      return;
    }
    const updated = scenes.filter(s => s.id !== sceneId);
    setScenes(recalculateTiming(updated));
    setSceneStatuses(prev => prev.filter(s => s.sceneId !== sceneId));
    toast.success('Szene gelöscht');
  };

  // Split scene
  const splitScene = (sceneId: string) => {
    const sceneIndex = scenes.findIndex(s => s.id === sceneId);
    const scene = scenes[sceneIndex];
    if (!scene || scene.durationSeconds < 6) {
      toast.error('Szene zu kurz zum Teilen (min. 6 Sekunden)');
      return;
    }

    const halfDuration = Math.floor(scene.durationSeconds / 2);
    const firstHalf: ScriptScene = {
      ...scene,
      id: `${scene.id}-1`,
      durationSeconds: halfDuration,
      spokenText: scene.spokenText.slice(0, Math.floor(scene.spokenText.length / 2)),
      visualDescription: scene.visualDescription + ' (Teil 1)',
    };
    const secondHalf: ScriptScene = {
      ...scene,
      id: `${scene.id}-2`,
      durationSeconds: scene.durationSeconds - halfDuration,
      spokenText: scene.spokenText.slice(Math.floor(scene.spokenText.length / 2)),
      visualDescription: scene.visualDescription + ' (Teil 2)',
    };

    const updated = [
      ...scenes.slice(0, sceneIndex),
      firstHalf,
      secondHalf,
      ...scenes.slice(sceneIndex + 1)
    ];
    
    setScenes(recalculateTiming(updated));
    setSceneStatuses(prev => [
      ...prev.slice(0, sceneIndex),
      { sceneId: firstHalf.id, status: 'pending' },
      { sceneId: secondHalf.id, status: 'pending' },
      ...prev.slice(sceneIndex + 1)
    ]);
    toast.success('Szene geteilt');
  };

  // Add new scene
  const addScene = (afterIndex: number) => {
    const newScene: ScriptScene = {
      id: `scene-new-${Date.now()}`,
      type: 'feature',
      title: 'Neue Szene',
      spokenText: '',
      visualDescription: '',
      durationSeconds: 10,
      startTime: 0,
      endTime: 0,
      emotionalTone: 'neutral',
      keyElements: []
    };

    const updated = [
      ...scenes.slice(0, afterIndex + 1),
      newScene,
      ...scenes.slice(afterIndex + 1)
    ];

    setScenes(recalculateTiming(updated));
    setSceneStatuses(prev => [
      ...prev.slice(0, afterIndex + 1),
      { sceneId: newScene.id, status: 'pending' },
      ...prev.slice(afterIndex + 1)
    ]);
    setEditingSceneId(newScene.id);
    toast.success('Neue Szene hinzugefügt');
  };

  const getSceneStatus = (sceneId: string) => 
    sceneStatuses.find(s => s.sceneId === sceneId)?.status || 'pending';

  const allApproved = sceneStatuses.every(s => s.status === 'approved');
  const totalDuration = scenes.reduce((sum, s) => sum + s.durationSeconds, 0);

  const getSceneTypeColor = (type: ScriptScene['type']) => {
    const colors: Record<ScriptScene['type'], string> = {
      'hook': 'bg-red-500/20 text-red-400 border-red-500/30',
      'problem': 'bg-orange-500/20 text-orange-400 border-orange-500/30',
      'solution': 'bg-green-500/20 text-green-400 border-green-500/30',
      'feature': 'bg-blue-500/20 text-blue-400 border-blue-500/30',
      'proof': 'bg-purple-500/20 text-purple-400 border-purple-500/30',
      'cta': 'bg-primary/20 text-primary border-primary/30'
    };
    return colors[type];
  };

  const getSceneTypeEmoji = (type: ScriptScene['type']) => {
    const emojis: Record<ScriptScene['type'], string> = {
      'hook': '🎯', 'problem': '😫', 'solution': '✨',
      'feature': '⚡', 'proof': '📊', 'cta': '🚀'
    };
    return emojis[type];
  };

  const handleComplete = () => {
    const updatedScript: ExplainerScript = {
      ...initialScript,
      scenes: scenes,
      totalDuration: totalDuration
    };
    onComplete(updatedScript);
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold">Storyboard & Szenen-Editor</h2>
          <p className="text-muted-foreground">
            Ordne Szenen per Drag & Drop, bearbeite Texte und genehmige jede Szene
          </p>
        </div>
        <div className="flex items-center gap-4">
          <div className="text-right">
            <div className="text-2xl font-bold text-primary">{totalDuration}s</div>
            <div className="text-xs text-muted-foreground">Gesamtlänge</div>
          </div>
          <Badge variant={allApproved ? "default" : "secondary"} className="gap-1">
            {sceneStatuses.filter(s => s.status === 'approved').length}/{scenes.length} genehmigt
          </Badge>
        </div>
      </div>

      {/* Timeline Overview */}
      <div className="bg-card/40 backdrop-blur-sm border border-white/5 rounded-xl p-4">
        <div className="flex items-center gap-2 mb-3">
          <Clock className="h-4 w-4 text-muted-foreground" />
          <span className="text-sm text-muted-foreground">Timeline-Übersicht</span>
        </div>
        <div className="flex gap-1 h-4 rounded-full overflow-hidden">
          {scenes.map((scene) => {
            const status = getSceneStatus(scene.id);
            return (
              <motion.div
                key={scene.id}
                className={cn(
                  "h-full relative cursor-pointer transition-all",
                  scene.type === 'hook' && 'bg-red-500',
                  scene.type === 'problem' && 'bg-orange-500',
                  scene.type === 'solution' && 'bg-green-500',
                  scene.type === 'feature' && 'bg-blue-500',
                  scene.type === 'proof' && 'bg-purple-500',
                  scene.type === 'cta' && 'bg-primary',
                  status === 'approved' && 'ring-2 ring-green-400 ring-offset-1 ring-offset-background',
                  status === 'rejected' && 'opacity-50'
                )}
                style={{ width: `${(scene.durationSeconds / totalDuration) * 100}%` }}
                whileHover={{ scale: 1.1 }}
              />
            );
          })}
        </div>
        <div className="flex justify-between mt-2 text-xs text-muted-foreground">
          <span>0s</span>
          <span>{Math.floor(totalDuration / 2)}s</span>
          <span>{totalDuration}s</span>
        </div>
      </div>

      {/* Reorderable Scenes */}
      <Reorder.Group
        axis="y"
        values={scenes}
        onReorder={handleReorder}
        className="space-y-4"
      >
        <AnimatePresence>
          {scenes.map((scene, index) => {
            const status = getSceneStatus(scene.id);
            const isEditing = editingSceneId === scene.id;
            const isRegenerating = regeneratingSceneId === scene.id;

            return (
              <Reorder.Item
                key={scene.id}
                value={scene}
                className="list-none"
              >
                <motion.div
                  layout
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, x: -100 }}
                  className={cn(
                    "bg-card/60 backdrop-blur-xl border rounded-2xl transition-all duration-300",
                    status === 'approved' && "border-green-500/50 shadow-[0_0_20px_rgba(34,197,94,0.1)]",
                    status === 'rejected' && "border-red-500/50 opacity-75",
                    status === 'regenerating' && "border-primary/50 animate-pulse",
                    status === 'pending' && "border-white/10 hover:border-white/20",
                    isEditing && "border-primary/50 shadow-[0_0_20px_rgba(245,199,106,0.2)]"
                  )}
                >
                  {/* Scene Header */}
                  <div className="flex items-center gap-4 p-4 border-b border-white/5">
                    {/* Drag Handle */}
                    <div className="cursor-grab active:cursor-grabbing p-2 hover:bg-muted/20 rounded-lg">
                      <GripVertical className="h-5 w-5 text-muted-foreground" />
                    </div>

                    {/* Scene Number & Type */}
                    <div className={cn(
                      "w-12 h-12 rounded-xl flex items-center justify-center text-xl border",
                      getSceneTypeColor(scene.type)
                    )}>
                      {getSceneTypeEmoji(scene.type)}
                    </div>

                    {/* Scene Info */}
                    <div className="flex-1">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium text-muted-foreground">Szene {index + 1}</span>
                        <Badge variant="outline" className={cn("text-xs", getSceneTypeColor(scene.type))}>
                          {scene.type}
                        </Badge>
                        {status === 'approved' && (
                          <Badge className="bg-green-500/20 text-green-400 border-green-500/30">
                            <ThumbsUp className="h-3 w-3 mr-1" /> Genehmigt
                          </Badge>
                        )}
                        {status === 'rejected' && (
                          <Badge className="bg-red-500/20 text-red-400 border-red-500/30">
                            <ThumbsDown className="h-3 w-3 mr-1" /> Abgelehnt
                          </Badge>
                        )}
                      </div>
                      <div className="text-xs text-muted-foreground mt-1">
                        {scene.startTime}s - {scene.endTime}s ({scene.durationSeconds}s)
                      </div>
                    </div>

                    {/* Duration Editor */}
                    <div className="flex items-center gap-2">
                      <Input
                        type="number"
                        min={3}
                        max={30}
                        value={scene.durationSeconds}
                        onChange={(e) => updateScene(scene.id, { durationSeconds: parseInt(e.target.value) || 10 })}
                        className="w-16 text-center bg-muted/20 border-white/10"
                      />
                      <span className="text-xs text-muted-foreground">Sek.</span>
                    </div>

                    {/* Actions */}
                    <div className="flex items-center gap-1">
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => setEditingSceneId(isEditing ? null : scene.id)}
                        className="h-8 w-8"
                      >
                        {isEditing ? <Check className="h-4 w-4" /> : <Edit3 className="h-4 w-4" />}
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => splitScene(scene.id)}
                        className="h-8 w-8"
                        title="Szene teilen"
                      >
                        <Scissors className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => deleteScene(scene.id)}
                        className="h-8 w-8 text-destructive hover:text-destructive"
                        title="Szene löschen"
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>

                  {/* Scene Content */}
                  <div className="p-4 space-y-4">
                    {/* Spoken Text */}
                    <div className="bg-muted/10 rounded-xl p-4 border border-white/5">
                      <label className="text-xs font-medium text-primary mb-2 flex items-center gap-2">
                        🎤 Sprechertext
                      </label>
                      {isEditing ? (
                        <Textarea
                          value={scene.spokenText}
                          onChange={(e) => updateScene(scene.id, { spokenText: e.target.value })}
                          className="bg-muted/20 border-white/10 min-h-[100px] mt-2"
                          placeholder="Sprechertext für diese Szene..."
                        />
                      ) : (
                        <p className="text-sm leading-relaxed mt-2">
                          {scene.spokenText || <span className="text-muted-foreground italic">Kein Sprechertext</span>}
                        </p>
                      )}
                    </div>

                    {/* Visual Description */}
                    <div className="bg-muted/10 rounded-xl p-4 border border-white/5">
                      <label className="text-xs font-medium text-cyan-400 mb-2 flex items-center gap-2">
                        <ImageIcon className="h-3 w-3" /> Visuelle Beschreibung (für KI-Bildgenerierung)
                      </label>
                      {isEditing ? (
                        <Textarea
                          value={scene.visualDescription}
                          onChange={(e) => updateScene(scene.id, { visualDescription: e.target.value })}
                          className="bg-muted/20 border-white/10 min-h-[80px] mt-2"
                          placeholder="Beschreibe das Bild, das generiert werden soll..."
                        />
                      ) : (
                        <p className="text-sm text-muted-foreground leading-relaxed mt-2">
                          {scene.visualDescription || <span className="italic">Keine visuelle Beschreibung</span>}
                        </p>
                      )}
                    </div>

                    {/* Approval Buttons */}
                    <div className="flex items-center justify-between pt-2">
                      <div className="flex items-center gap-2 flex-wrap">
                        {scene.keyElements?.slice(0, 4).map((element, i) => (
                          <Badge key={i} variant="secondary" className="text-xs">
                            {element}
                          </Badge>
                        ))}
                      </div>
                      
                      <div className="flex items-center gap-2">
                        {isRegenerating ? (
                          <Button disabled className="gap-2">
                            <Loader2 className="h-4 w-4 animate-spin" />
                            Regeneriere...
                          </Button>
                        ) : (
                          <>
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => regenerateScene(scene.id)}
                              className="gap-1 border-orange-500/30 text-orange-400 hover:bg-orange-500/10"
                            >
                              <RefreshCw className="h-4 w-4" />
                              Neu generieren
                            </Button>
                            
                            {status !== 'approved' ? (
                              <Button
                                size="sm"
                                onClick={() => approveScene(scene.id)}
                                className="gap-1 bg-green-600 hover:bg-green-700"
                              >
                                <ThumbsUp className="h-4 w-4" />
                                Genehmigen
                              </Button>
                            ) : (
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => rejectScene(scene.id)}
                                className="gap-1 border-red-500/30 text-red-400 hover:bg-red-500/10"
                              >
                                <X className="h-4 w-4" />
                                Zurücknehmen
                              </Button>
                            )}
                          </>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Add Scene Button (between scenes) */}
                  {index < scenes.length - 1 && (
                    <div className="relative -mb-2 flex justify-center">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => addScene(index)}
                        className="absolute -bottom-4 z-10 h-6 px-2 bg-card border border-dashed border-white/20 text-xs text-muted-foreground hover:border-primary hover:text-primary"
                      >
                        <Plus className="h-3 w-3 mr-1" /> Szene einfügen
                      </Button>
                    </div>
                  )}
                </motion.div>
              </Reorder.Item>
            );
          })}
        </AnimatePresence>
      </Reorder.Group>

      {/* Add Scene at End */}
      <div className="flex justify-center">
        <Button
          variant="outline"
          onClick={() => addScene(scenes.length - 1)}
          className="gap-2 border-dashed"
        >
          <Plus className="h-4 w-4" />
          Neue Szene hinzufügen
        </Button>
      </div>

      {/* Navigation */}
      <div className="flex justify-between pt-4 border-t border-white/5">
        <Button variant="outline" onClick={onBack}>
          <ArrowLeft className="h-4 w-4 mr-2" />
          Zurück zum Drehbuch
        </Button>
        
        <div className="flex items-center gap-3">
          {!allApproved && (
            <p className="text-sm text-muted-foreground">
              Bitte genehmige alle Szenen vor dem Fortfahren
            </p>
          )}
          <Button
            onClick={handleComplete}
            disabled={!allApproved}
            className="bg-gradient-to-r from-primary to-purple-500"
          >
            <Sparkles className="h-4 w-4 mr-2" />
            Weiter zu Visuals
            <ArrowRight className="h-4 w-4 ml-2" />
          </Button>
        </div>
      </div>
    </div>
  );
}
