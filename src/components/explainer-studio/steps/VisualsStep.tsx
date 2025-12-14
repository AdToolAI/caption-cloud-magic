import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  Image, 
  Sparkles, 
  RefreshCw, 
  Check, 
  AlertCircle, 
  ChevronRight, 
  ChevronLeft,
  Loader2,
  Download,
  Wand2
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import type { ExplainerScript, ExplainerBriefing, GeneratedAsset, ScriptScene } from '@/types/explainer-studio';
import { cn } from '@/lib/utils';

interface VisualsStepProps {
  briefing: ExplainerBriefing;
  script: ExplainerScript;
  initialAssets?: GeneratedAsset[];
  onComplete: (assets: GeneratedAsset[]) => void;
  onBack: () => void;
}

type GenerationStatus = 'pending' | 'generating' | 'completed' | 'error';

interface SceneVisualState {
  sceneId: string;
  status: GenerationStatus;
  imageUrl?: string;
  error?: string;
}

export function VisualsStep({ briefing, script, initialAssets, onComplete, onBack }: VisualsStepProps) {
  const [assets, setAssets] = useState<GeneratedAsset[]>(initialAssets || []);
  const [sceneStates, setSceneStates] = useState<SceneVisualState[]>(
    script.scenes.map(scene => {
      const existingAsset = initialAssets?.find(a => a.sceneId === scene.id);
      return {
        sceneId: scene.id,
        status: existingAsset ? 'completed' : 'pending',
        imageUrl: existingAsset?.imageUrl
      };
    })
  );
  const [isGeneratingAll, setIsGeneratingAll] = useState(false);
  const [selectedSceneIndex, setSelectedSceneIndex] = useState(0);

  const selectedScene = script.scenes[selectedSceneIndex];
  const selectedState = sceneStates.find(s => s.sceneId === selectedScene?.id);

  const completedCount = sceneStates.filter(s => s.status === 'completed').length;
  const totalCount = script.scenes.length;
  const progress = (completedCount / totalCount) * 100;

  const generateVisualForScene = async (scene: ScriptScene): Promise<GeneratedAsset | null> => {
    try {
      // Update state to generating
      setSceneStates(prev => prev.map(s => 
        s.sceneId === scene.id ? { ...s, status: 'generating' as GenerationStatus, error: undefined } : s
      ));

      const { data, error } = await supabase.functions.invoke('generate-scene-visual', {
        body: {
          sceneId: scene.id,
          visualDescription: scene.visualDescription,
          style: briefing.style,
          emotionalTone: scene.emotionalTone,
          keyElements: scene.keyElements
        }
      });

      if (error) throw error;

      if (!data?.success || !data?.imageUrl) {
        throw new Error(data?.error || 'Failed to generate image');
      }

      const newAsset: GeneratedAsset = {
        id: crypto.randomUUID(),
        sceneId: scene.id,
        type: 'background',
        imageUrl: data.imageUrl,
        prompt: data.prompt,
        style: briefing.style
      };

      // Update states
      setSceneStates(prev => prev.map(s => 
        s.sceneId === scene.id ? { ...s, status: 'completed' as GenerationStatus, imageUrl: data.imageUrl } : s
      ));

      setAssets(prev => {
        const filtered = prev.filter(a => a.sceneId !== scene.id);
        return [...filtered, newAsset];
      });

      return newAsset;

    } catch (error: any) {
      console.error('Error generating visual:', error);
      setSceneStates(prev => prev.map(s => 
        s.sceneId === scene.id ? { ...s, status: 'error' as GenerationStatus, error: error.message } : s
      ));
      return null;
    }
  };

  const handleGenerateSingle = async () => {
    if (!selectedScene) return;
    
    const result = await generateVisualForScene(selectedScene);
    if (result) {
      toast.success(`Visual für "${selectedScene.title}" generiert`);
    } else {
      toast.error('Fehler bei der Generierung');
    }
  };

  const handleGenerateAll = async () => {
    setIsGeneratingAll(true);
    let successCount = 0;

    for (const scene of script.scenes) {
      const existingState = sceneStates.find(s => s.sceneId === scene.id);
      if (existingState?.status === 'completed') continue;

      const result = await generateVisualForScene(scene);
      if (result) successCount++;

      // Small delay between generations to avoid rate limits
      await new Promise(resolve => setTimeout(resolve, 1000));
    }

    setIsGeneratingAll(false);
    toast.success(`${successCount} von ${totalCount} Visuals generiert`);
  };

  const handleRegenerateScene = async (scene: ScriptScene) => {
    const result = await generateVisualForScene(scene);
    if (result) {
      toast.success(`Visual für "${scene.title}" neu generiert`);
    } else {
      toast.error('Fehler bei der Regenerierung');
    }
  };

  const handleContinue = () => {
    if (completedCount < totalCount) {
      toast.warning('Bitte generiere zuerst alle Szenen-Visuals');
      return;
    }
    onComplete(assets);
  };

  const getSceneTypeColor = (type: string) => {
    const colors: Record<string, string> = {
      hook: 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30',
      problem: 'bg-red-500/20 text-red-400 border-red-500/30',
      solution: 'bg-green-500/20 text-green-400 border-green-500/30',
      feature: 'bg-blue-500/20 text-blue-400 border-blue-500/30',
      proof: 'bg-purple-500/20 text-purple-400 border-purple-500/30',
      cta: 'bg-primary/20 text-primary border-primary/30'
    };
    return colors[type] || 'bg-muted/20 text-muted-foreground border-border';
  };

  return (
    <div className="space-y-6">
      {/* Progress Header */}
      <Card className="bg-card/60 backdrop-blur-xl border-white/10">
        <CardContent className="p-6">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="text-xl font-semibold">Visual Asset Pipeline</h2>
              <p className="text-sm text-muted-foreground">
                KI-generierte Hintergründe für jede Szene
              </p>
            </div>
            <div className="text-right">
              <span className="text-2xl font-bold text-primary">{completedCount}</span>
              <span className="text-muted-foreground">/{totalCount}</span>
              <p className="text-xs text-muted-foreground">Szenen fertig</p>
            </div>
          </div>
          <Progress value={progress} className="h-2" />
          
          <div className="flex gap-3 mt-4">
            <Button
              onClick={handleGenerateAll}
              disabled={isGeneratingAll || completedCount === totalCount}
              className="bg-gradient-to-r from-primary to-purple-500"
            >
              {isGeneratingAll ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Generiere alle...
                </>
              ) : (
                <>
                  <Wand2 className="h-4 w-4 mr-2" />
                  Alle Szenen generieren
                </>
              )}
            </Button>
          </div>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Scene List */}
        <Card className="bg-card/60 backdrop-blur-xl border-white/10">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <Image className="h-4 w-4" />
              Szenen ({script.scenes.length})
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 max-h-[500px] overflow-y-auto">
            {script.scenes.map((scene, index) => {
              const state = sceneStates.find(s => s.sceneId === scene.id);
              const isSelected = index === selectedSceneIndex;

              return (
                <motion.button
                  key={scene.id}
                  onClick={() => setSelectedSceneIndex(index)}
                  className={cn(
                    'w-full p-3 rounded-lg text-left transition-all',
                    'border backdrop-blur-sm',
                    isSelected 
                      ? 'bg-primary/20 border-primary/50 shadow-[0_0_15px_rgba(245,199,106,0.2)]' 
                      : 'bg-muted/10 border-white/10 hover:bg-muted/20'
                  )}
                  whileHover={{ scale: 1.01 }}
                  whileTap={{ scale: 0.99 }}
                >
                  <div className="flex items-center justify-between mb-2">
                    <Badge className={cn('text-xs', getSceneTypeColor(scene.type))}>
                      {scene.type.toUpperCase()}
                    </Badge>
                    <div className="flex items-center gap-1.5">
                      {state?.status === 'completed' && (
                        <Check className="h-4 w-4 text-green-400" />
                      )}
                      {state?.status === 'generating' && (
                        <Loader2 className="h-4 w-4 text-primary animate-spin" />
                      )}
                      {state?.status === 'error' && (
                        <AlertCircle className="h-4 w-4 text-red-400" />
                      )}
                      {state?.status === 'pending' && (
                        <div className="h-4 w-4 rounded-full border-2 border-muted-foreground/30" />
                      )}
                    </div>
                  </div>
                  <p className="text-sm font-medium truncate">{scene.title}</p>
                  <p className="text-xs text-muted-foreground">{scene.durationSeconds}s</p>
                </motion.button>
              );
            })}
          </CardContent>
        </Card>

        {/* Preview & Controls */}
        <Card className="lg:col-span-2 bg-card/60 backdrop-blur-xl border-white/10">
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm font-medium">
                Szene {selectedSceneIndex + 1}: {selectedScene?.title}
              </CardTitle>
              <div className="flex items-center gap-2">
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => setSelectedSceneIndex(Math.max(0, selectedSceneIndex - 1))}
                  disabled={selectedSceneIndex === 0}
                >
                  <ChevronLeft className="h-4 w-4" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => setSelectedSceneIndex(Math.min(script.scenes.length - 1, selectedSceneIndex + 1))}
                  disabled={selectedSceneIndex === script.scenes.length - 1}
                >
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Preview Area */}
            <div className="aspect-video bg-muted/20 rounded-xl border border-white/10 overflow-hidden relative">
              <AnimatePresence mode="wait">
                {selectedState?.status === 'generating' ? (
                  <motion.div
                    key="generating"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    className="absolute inset-0 flex flex-col items-center justify-center"
                  >
                    <div className="relative">
                      <div className="absolute inset-0 bg-primary/20 blur-xl rounded-full animate-pulse" />
                      <Sparkles className="h-12 w-12 text-primary animate-pulse relative z-10" />
                    </div>
                    <p className="text-sm text-muted-foreground mt-4">KI generiert Visual...</p>
                  </motion.div>
                ) : selectedState?.imageUrl ? (
                  <motion.img
                    key={selectedState.imageUrl}
                    src={selectedState.imageUrl}
                    alt={selectedScene?.title}
                    className="w-full h-full object-cover"
                    initial={{ opacity: 0, scale: 0.95 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 1.05 }}
                    transition={{ duration: 0.3 }}
                  />
                ) : (
                  <motion.div
                    key="placeholder"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    className="absolute inset-0 flex flex-col items-center justify-center"
                  >
                    <Image className="h-16 w-16 text-muted-foreground/30 mb-3" />
                    <p className="text-sm text-muted-foreground">Noch kein Visual generiert</p>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>

            {/* Scene Info */}
            <div className="grid grid-cols-2 gap-4">
              <div className="p-3 rounded-lg bg-muted/10 border border-white/5">
                <p className="text-xs text-muted-foreground mb-1">Visual-Beschreibung</p>
                <p className="text-sm">{selectedScene?.visualDescription}</p>
              </div>
              <div className="p-3 rounded-lg bg-muted/10 border border-white/5">
                <p className="text-xs text-muted-foreground mb-1">Stimmung & Elemente</p>
                <p className="text-sm mb-1">{selectedScene?.emotionalTone}</p>
                {selectedScene?.keyElements && (
                  <div className="flex flex-wrap gap-1 mt-2">
                    {selectedScene.keyElements.map((el, i) => (
                      <Badge key={i} variant="outline" className="text-xs">
                        {el}
                      </Badge>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* Action Buttons */}
            <div className="flex gap-3">
              <Button
                onClick={handleGenerateSingle}
                disabled={selectedState?.status === 'generating'}
                className="flex-1"
                variant={selectedState?.status === 'completed' ? 'outline' : 'default'}
              >
                {selectedState?.status === 'generating' ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Generiere...
                  </>
                ) : selectedState?.status === 'completed' ? (
                  <>
                    <RefreshCw className="h-4 w-4 mr-2" />
                    Neu generieren
                  </>
                ) : (
                  <>
                    <Sparkles className="h-4 w-4 mr-2" />
                    Visual generieren
                  </>
                )}
              </Button>
              {selectedState?.imageUrl && (
                <Button
                  variant="outline"
                  onClick={() => window.open(selectedState.imageUrl, '_blank')}
                >
                  <Download className="h-4 w-4 mr-2" />
                  Öffnen
                </Button>
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Navigation */}
      <div className="flex justify-between pt-4">
        <Button variant="outline" onClick={onBack}>
          <ChevronLeft className="h-4 w-4 mr-2" />
          Zurück zum Drehbuch
        </Button>
        <Button 
          onClick={handleContinue}
          disabled={completedCount < totalCount}
          className="bg-gradient-to-r from-primary to-purple-500"
        >
          Weiter zur Animation
          <ChevronRight className="h-4 w-4 ml-2" />
        </Button>
      </div>
    </div>
  );
}
