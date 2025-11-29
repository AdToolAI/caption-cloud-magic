import { useState, useRef } from 'react';
import { Upload, X, Image as ImageIcon, ArrowLeft, ArrowRight, Loader2 } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { cn } from '@/lib/utils';
import { calculateSceneCost, TRANSITION_OPTIONS } from '@/types/sora-long-form';
import type { Sora2LongFormProject, Sora2Scene, SceneDuration, TransitionType } from '@/types/sora-long-form';

interface SceneConfiguratorProps {
  project: Sora2LongFormProject;
  scenes: Sora2Scene[];
  onUpdateScenes: (scenes: Sora2Scene[]) => Promise<void>;
  onNext: () => void;
  onBack: () => void;
}

export function SceneConfigurator({
  project,
  scenes,
  onUpdateScenes,
  onNext,
  onBack,
}: SceneConfiguratorProps) {
  const { toast } = useToast();
  const [selectedScene, setSelectedScene] = useState(0);
  const [uploadingImage, setUploadingImage] = useState<number | null>(null);
  const fileInputRefs = useRef<{ [key: number]: HTMLInputElement | null }>({});

  const updateScene = (index: number, updates: Partial<Sora2Scene>) => {
    const newScenes = [...scenes];
    newScenes[index] = { ...newScenes[index], ...updates };
    
    if (updates.duration) {
      newScenes[index].cost_euros = calculateSceneCost(updates.duration, project.model);
    }
    
    onUpdateScenes(newScenes);
  };

  const handleImageUpload = async (index: number, file: File) => {
    if (!file.type.startsWith('image/')) {
      toast({ title: 'Nur Bilder erlaubt', variant: 'destructive' });
      return;
    }

    if (file.size > 10 * 1024 * 1024) {
      toast({ title: 'Bild zu groß (max 10MB)', variant: 'destructive' });
      return;
    }

    setUploadingImage(index);
    try {
      const fileExt = file.name.split('.').pop();
      const fileName = `${project.id}/scene-${index}-${Date.now()}.${fileExt}`;

      const { error: uploadError } = await supabase.storage
        .from('ai-video-reference')
        .upload(fileName, file, { upsert: true });

      if (uploadError) throw uploadError;

      const { data: { publicUrl } } = supabase.storage
        .from('ai-video-reference')
        .getPublicUrl(fileName);

      updateScene(index, { reference_image_url: publicUrl });
      toast({ title: 'Bild hochgeladen' });
    } catch (error) {
      console.error('Upload error:', error);
      toast({ title: 'Upload fehlgeschlagen', variant: 'destructive' });
    } finally {
      setUploadingImage(null);
    }
  };

  const removeImage = (index: number) => {
    updateScene(index, { reference_image_url: undefined });
  };

  const currentScene = scenes[selectedScene];
  const totalCost = scenes.reduce((sum, s) => sum + s.cost_euros, 0);

  return (
    <div className="space-y-6">
      {/* Scene Thumbnails */}
      <div>
        <h3 className="text-lg font-semibold mb-4">Szenen konfigurieren</h3>
        <div className="flex gap-2 overflow-x-auto pb-2">
          {scenes.map((scene, index) => (
            <button
              key={scene.id}
              onClick={() => setSelectedScene(index)}
              className={cn(
                'flex-shrink-0 w-24 h-16 rounded-lg border-2 transition-all overflow-hidden',
                selectedScene === index
                  ? 'border-primary ring-2 ring-primary/50'
                  : 'border-border hover:border-primary/50'
              )}
            >
              {scene.reference_image_url ? (
                <img
                  src={scene.reference_image_url}
                  alt={`Szene ${index + 1}`}
                  className="w-full h-full object-cover"
                />
              ) : (
                <div className="w-full h-full bg-muted flex items-center justify-center">
                  <span className="text-sm font-medium">{index + 1}</span>
                </div>
              )}
            </button>
          ))}
        </div>
      </div>

      {/* Selected Scene Editor */}
      {currentScene && (
        <Card className="p-6">
          <div className="flex items-center justify-between mb-4">
            <h4 className="font-semibold flex items-center gap-2">
              Szene {selectedScene + 1} von {scenes.length}
              <Badge variant="outline">{currentScene.duration} Sek.</Badge>
            </h4>
            <span className="text-sm text-muted-foreground">
              Kosten: {currentScene.cost_euros.toFixed(2)}€
            </span>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Left: Prompt */}
            <div className="space-y-4">
              <div>
                <Label>Visual Prompt</Label>
                <Textarea
                  value={currentScene.prompt}
                  onChange={(e) => updateScene(selectedScene, { prompt: e.target.value })}
                  placeholder="Detaillierte visuelle Beschreibung für Sora 2..."
                  className="mt-1 min-h-[150px]"
                />
                <p className="text-xs text-muted-foreground mt-1">
                  Beschreibe in Englisch für beste Ergebnisse: Kamerawinkel, Beleuchtung, Bewegungen, Stimmung.
                </p>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label>Dauer</Label>
                  <Select
                    value={currentScene.duration.toString()}
                    onValueChange={(v) => updateScene(selectedScene, { duration: parseInt(v) as SceneDuration })}
                  >
                    <SelectTrigger className="mt-1">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="4">4 Sekunden</SelectItem>
                      <SelectItem value="8">8 Sekunden</SelectItem>
                      <SelectItem value="12">12 Sekunden</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Übergang</Label>
                  <Select
                    value={currentScene.transition_type}
                    onValueChange={(v) => updateScene(selectedScene, { transition_type: v as TransitionType })}
                  >
                    <SelectTrigger className="mt-1">
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
              </div>
            </div>

            {/* Right: Image Upload */}
            <div>
              <Label>Referenzbild (Optional - für Image-to-Video)</Label>
              <div className="mt-1">
                {currentScene.reference_image_url ? (
                  <div className="relative aspect-video rounded-lg overflow-hidden border border-border">
                    <img
                      src={currentScene.reference_image_url}
                      alt="Referenz"
                      className="w-full h-full object-cover"
                    />
                    <button
                      onClick={() => removeImage(selectedScene)}
                      className="absolute top-2 right-2 p-1.5 bg-background/80 rounded-full hover:bg-destructive hover:text-destructive-foreground transition-colors"
                    >
                      <X className="h-4 w-4" />
                    </button>
                    <Badge className="absolute bottom-2 left-2 bg-green-500">
                      <ImageIcon className="h-3 w-3 mr-1" />
                      I2V aktiv
                    </Badge>
                  </div>
                ) : (
                  <div
                    onClick={() => fileInputRefs.current[selectedScene]?.click()}
                    className={cn(
                      'aspect-video rounded-lg border-2 border-dashed border-border cursor-pointer transition-colors',
                      'flex flex-col items-center justify-center gap-2 hover:border-primary/50 hover:bg-primary/5'
                    )}
                  >
                    {uploadingImage === selectedScene ? (
                      <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                    ) : (
                      <>
                        <Upload className="h-8 w-8 text-muted-foreground" />
                        <p className="text-sm text-muted-foreground">
                          Bild hochladen für Image-to-Video
                        </p>
                        <p className="text-xs text-muted-foreground">
                          Max 10MB • JPG, PNG, WebP
                        </p>
                      </>
                    )}
                  </div>
                )}
                <input
                  ref={(el) => (fileInputRefs.current[selectedScene] = el)}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) handleImageUpload(selectedScene, file);
                    e.target.value = '';
                  }}
                />
              </div>
            </div>
          </div>
        </Card>
      )}

      {/* Navigation */}
      <Card className="p-4 bg-muted/50">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm text-muted-foreground">
              {scenes.filter(s => s.reference_image_url).length} von {scenes.length} Szenen mit Referenzbild
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
              disabled={scenes.some(s => !s.prompt.trim())}
            >
              Generierung starten
              <ArrowRight className="h-4 w-4 ml-2" />
            </Button>
          </div>
        </div>
      </Card>
    </div>
  );
}
