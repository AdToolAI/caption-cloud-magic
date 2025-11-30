import { useState, useRef } from 'react';
import { Wand2, Loader2, Plus, Trash2, ArrowLeft, ArrowRight, Upload, X, ImageIcon } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { getRequiredSceneCount, calculateSceneCost, TRANSITION_OPTIONS } from '@/types/sora-long-form';
import type { Sora2LongFormProject, Sora2Scene, SceneDuration, TransitionType } from '@/types/sora-long-form';

interface ScriptGeneratorStepProps {
  project: Sora2LongFormProject;
  scenes: Sora2Scene[];
  onUpdateProject: (updates: Partial<Sora2LongFormProject>) => Promise<void>;
  onUpdateScenes: (scenes: Sora2Scene[]) => Promise<void>;
  onNext: () => void;
  onBack: () => void;
}

const TONE_OPTIONS = [
  { value: 'professional', label: 'Professionell' },
  { value: 'casual', label: 'Locker' },
  { value: 'dramatic', label: 'Dramatisch' },
  { value: 'inspirational', label: 'Inspirierend' },
  { value: 'educational', label: 'Lehrreich' },
];

export function ScriptGeneratorStep({
  project,
  scenes,
  onUpdateProject,
  onUpdateScenes,
  onNext,
  onBack,
}: ScriptGeneratorStepProps) {
  const { toast } = useToast();
  const [idea, setIdea] = useState('');
  const [tone, setTone] = useState('professional');
  const [generating, setGenerating] = useState(false);
  const [referenceImage, setReferenceImage] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const requiredScenes = getRequiredSceneCount(project.target_duration);

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Check file size (max 5MB)
    if (file.size > 5 * 1024 * 1024) {
      toast({ title: 'Bild zu groß', description: 'Maximal 5MB erlaubt', variant: 'destructive' });
      return;
    }

    // Check file type
    if (!file.type.startsWith('image/')) {
      toast({ title: 'Ungültiges Format', description: 'Nur Bilder erlaubt', variant: 'destructive' });
      return;
    }

    setReferenceImage(file);
    const reader = new FileReader();
    reader.onload = (e) => setImagePreview(e.target?.result as string);
    reader.readAsDataURL(file);
  };

  const removeImage = () => {
    setReferenceImage(null);
    setImagePreview(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    const file = e.dataTransfer.files[0];
    if (file && file.type.startsWith('image/')) {
      if (file.size > 5 * 1024 * 1024) {
        toast({ title: 'Bild zu groß', description: 'Maximal 5MB erlaubt', variant: 'destructive' });
        return;
      }
      setReferenceImage(file);
      const reader = new FileReader();
      reader.onload = (e) => setImagePreview(e.target?.result as string);
      reader.readAsDataURL(file);
    }
  };

  const convertToBase64 = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        const result = reader.result as string;
        // Remove data URL prefix to get pure base64
        const base64 = result.split(',')[1];
        resolve(base64);
      };
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  };

  const generateScript = async () => {
    if (!idea.trim()) {
      toast({ title: 'Bitte gib eine Idee ein', variant: 'destructive' });
      return;
    }

    setGenerating(true);
    try {
      // Prepare request body
      const requestBody: any = {
        idea,
        targetDuration: project.target_duration,
        aspectRatio: project.aspect_ratio,
        tone,
        language: 'de',
      };

      // Add reference image if present
      if (referenceImage) {
        requestBody.referenceImageBase64 = await convertToBase64(referenceImage);
      }

      const { data, error } = await supabase.functions.invoke('generate-long-form-script', {
        body: requestBody,
      });

      if (error) throw error;

      // Convert generated script to scenes
      const newScenes: Sora2Scene[] = data.scenes.map((scene: any, index: number) => ({
        id: `temp-${Date.now()}-${index}`,
        project_id: project.id,
        scene_order: index,
        duration: scene.duration as SceneDuration,
        prompt: scene.visualPrompt,
        status: 'pending' as const,
        transition_type: scene.suggestedTransition as TransitionType,
        transition_duration: 0.5,
        cost_euros: calculateSceneCost(scene.duration, project.model),
      }));

      await onUpdateProject({ script: data.synopsis });
      await onUpdateScenes(newScenes);

      toast({ 
        title: 'Skript generiert!', 
        description: `${newScenes.length} Szenen erstellt${referenceImage ? ' (basierend auf Bildanalyse)' : ''}` 
      });
    } catch (error) {
      console.error('Error generating script:', error);
      toast({ title: 'Fehler', description: 'Skript konnte nicht generiert werden', variant: 'destructive' });
    } finally {
      setGenerating(false);
    }
  };

  const addEmptyScene = () => {
    const newScene: Sora2Scene = {
      id: `temp-${Date.now()}`,
      project_id: project.id,
      scene_order: scenes.length,
      duration: 12,
      prompt: '',
      status: 'pending',
      transition_type: 'crossfade',
      transition_duration: 0.5,
      cost_euros: calculateSceneCost(12, project.model),
    };
    onUpdateScenes([...scenes, newScene]);
  };

  const updateScene = (index: number, updates: Partial<Sora2Scene>) => {
    const newScenes = [...scenes];
    newScenes[index] = { ...newScenes[index], ...updates };
    
    if (updates.duration) {
      newScenes[index].cost_euros = calculateSceneCost(updates.duration, project.model);
    }
    
    onUpdateScenes(newScenes);
  };

  const removeScene = (index: number) => {
    const newScenes = scenes.filter((_, i) => i !== index).map((s, i) => ({ ...s, scene_order: i }));
    onUpdateScenes(newScenes);
  };

  const totalDuration = scenes.reduce((sum, s) => sum + s.duration, 0);
  const totalCost = scenes.reduce((sum, s) => sum + s.cost_euros, 0);

  return (
    <div className="space-y-6">
      {/* AI Script Generator */}
      <Card className="p-6">
        <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
          <Wand2 className="h-5 w-5 text-primary" />
          AI Skript-Generator mit Vision
        </h3>
        <p className="text-sm text-muted-foreground mb-4">
          Lade ein Referenzbild hoch und beschreibe deine Idee. Die AI analysiert das Bild und erstellt {requiredScenes} Szenen mit nahtlosen Übergängen.
        </p>
        
        <div className="space-y-4">
          {/* Reference Image Upload */}
          <div>
            <Label className="flex items-center gap-2 mb-2">
              <ImageIcon className="h-4 w-4" />
              Referenzbild (optional)
            </Label>
            <div
              className={`border-2 border-dashed rounded-lg p-4 transition-colors ${
                imagePreview ? 'border-primary/50 bg-primary/5' : 'border-muted-foreground/25 hover:border-primary/50'
              }`}
              onDrop={handleDrop}
              onDragOver={(e) => e.preventDefault()}
            >
              {imagePreview ? (
                <div className="flex items-center gap-4">
                  <div className="relative">
                    <img 
                      src={imagePreview} 
                      alt="Referenz" 
                      className="max-h-32 rounded-lg object-contain"
                    />
                    <Button
                      variant="destructive"
                      size="icon"
                      className="absolute -top-2 -right-2 h-6 w-6"
                      onClick={removeImage}
                    >
                      <X className="h-3 w-3" />
                    </Button>
                  </div>
                  <div className="flex-1">
                    <p className="text-sm font-medium">{referenceImage?.name}</p>
                    <p className="text-xs text-muted-foreground">
                      Die AI analysiert dieses Bild und erstellt darauf basierend visuelle Prompts mit Frame-Chain-Kontinuität
                    </p>
                  </div>
                </div>
              ) : (
                <div 
                  className="text-center cursor-pointer"
                  onClick={() => fileInputRef.current?.click()}
                >
                  <Upload className="h-8 w-8 mx-auto mb-2 text-muted-foreground" />
                  <p className="text-sm font-medium">Bild hochladen oder hierher ziehen</p>
                  <p className="text-xs text-muted-foreground mt-1">
                    PNG, JPG bis 5MB • Das Bild wird analysiert für präzise Szenen-Prompts
                  </p>
                </div>
              )}
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                onChange={handleImageUpload}
                className="hidden"
              />
            </div>
          </div>

          {/* Video Idea */}
          <div>
            <Label>Video-Idee</Label>
            <Textarea
              value={idea}
              onChange={(e) => setIdea(e.target.value)}
              placeholder={referenceImage 
                ? "z.B. Ein elegantes Werbevideo für dieses Produkt mit Fokus auf Details und Atmosphäre..."
                : "z.B. Ein inspirierendes Video über die Schönheit der Natur, von Sonnenaufgang bis Sonnenuntergang..."
              }
              className="mt-1 min-h-[100px]"
            />
          </div>

          {/* Tone & Generate Button */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label>Ton</Label>
              <Select value={tone} onValueChange={setTone}>
                <SelectTrigger className="mt-1">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {TONE_OPTIONS.map((opt) => (
                    <SelectItem key={opt.value} value={opt.value}>
                      {opt.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-end">
              <Button
                onClick={generateScript}
                disabled={generating || !idea.trim()}
                className="w-full"
              >
                {generating ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    {referenceImage ? 'Analysiere Bild...' : 'Generiere...'}
                  </>
                ) : (
                  <>
                    <Wand2 className="h-4 w-4 mr-2" />
                    {referenceImage ? 'Mit Bild generieren' : 'Skript generieren'}
                  </>
                )}
              </Button>
            </div>
          </div>

          {referenceImage && (
            <p className="text-xs text-primary bg-primary/10 p-2 rounded">
              💡 Das Bild wird analysiert: Objekte, Farben, Stil und Atmosphäre fließen in die Szenen-Prompts ein. 
              Die AI plant nahtlose Übergänge für Frame-Chain-Generierung.
            </p>
          )}
        </div>
      </Card>

      {/* Scenes List */}
      <div>
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold">
            Szenen ({scenes.length} / {requiredScenes} empfohlen)
          </h3>
          <Button variant="outline" size="sm" onClick={addEmptyScene}>
            <Plus className="h-4 w-4 mr-2" />
            Szene hinzufügen
          </Button>
        </div>

        {scenes.length === 0 ? (
          <Card className="p-8 text-center">
            <p className="text-muted-foreground">
              Nutze den AI-Generator oben oder füge manuell Szenen hinzu.
            </p>
          </Card>
        ) : (
          <div className="space-y-4">
            {scenes.map((scene, index) => (
              <Card key={scene.id} className="p-4">
                <div className="flex items-start gap-4">
                  <div className="flex-shrink-0 w-8 h-8 rounded-full bg-primary/20 flex items-center justify-center text-sm font-semibold">
                    {index + 1}
                  </div>
                  <div className="flex-1 space-y-3">
                    <div>
                      <Label className="text-xs">Visual Prompt</Label>
                      <Textarea
                        value={scene.prompt}
                        onChange={(e) => updateScene(index, { prompt: e.target.value })}
                        placeholder="Detaillierte visuelle Beschreibung für Sora 2..."
                        className="mt-1 text-sm"
                      />
                    </div>
                    <div className="grid grid-cols-3 gap-3">
                      <div>
                        <Label className="text-xs">Dauer</Label>
                        <Select
                          value={scene.duration.toString()}
                          onValueChange={(v) => updateScene(index, { duration: parseInt(v) as SceneDuration })}
                        >
                          <SelectTrigger className="mt-1 h-9">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="4">4 Sek.</SelectItem>
                            <SelectItem value="8">8 Sek.</SelectItem>
                            <SelectItem value="12">12 Sek.</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      <div>
                        <Label className="text-xs">Übergang</Label>
                        <Select
                          value={scene.transition_type}
                          onValueChange={(v) => updateScene(index, { transition_type: v as TransitionType })}
                        >
                          <SelectTrigger className="mt-1 h-9">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {TRANSITION_OPTIONS.map((opt) => (
                              <SelectItem key={opt.value} value={opt.value}>
                                {opt.label}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="flex items-end">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => removeScene(index)}
                          className="text-destructive hover:text-destructive"
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  </div>
                </div>
              </Card>
            ))}
          </div>
        )}
      </div>

      {/* Summary & Navigation */}
      <Card className="p-4 bg-muted/50">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm text-muted-foreground">
              Gesamtdauer: <span className="font-semibold text-foreground">{totalDuration} Sekunden</span>
              {' • '}
              Geschätzte Kosten: <span className="font-semibold text-primary">{totalCost.toFixed(2)}€</span>
            </p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={onBack}>
              <ArrowLeft className="h-4 w-4 mr-2" />
              Zurück
            </Button>
            <Button
              onClick={onNext}
              disabled={scenes.length === 0 || scenes.some(s => !s.prompt.trim())}
            >
              Weiter
              <ArrowRight className="h-4 w-4 ml-2" />
            </Button>
          </div>
        </div>
      </Card>
    </div>
  );
}
