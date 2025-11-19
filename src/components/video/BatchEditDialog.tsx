import { useState } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { VideoCreation } from '@/types/video';
import { Loader2, Plus, X, Copy } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';

interface BatchEditDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  video: VideoCreation;
}

interface Variation {
  name: string;
  customizations: Record<string, any>;
}

export const BatchEditDialog = ({ open, onOpenChange, video }: BatchEditDialogProps) => {
  const [variations, setVariations] = useState<Variation[]>([
    { name: 'Variante A', customizations: {} },
    { name: 'Variante B', customizations: {} },
  ]);
  const [isGenerating, setIsGenerating] = useState(false);
  const { toast } = useToast();

  const addVariation = () => {
    setVariations([
      ...variations,
      { name: `Variante ${String.fromCharCode(65 + variations.length)}`, customizations: {} }
    ]);
  };

  const removeVariation = (index: number) => {
    if (variations.length <= 2) {
      toast({
        title: "Mindestanzahl erreicht",
        description: "Du benötigst mindestens 2 Varianten für A/B-Testing.",
        variant: "destructive",
      });
      return;
    }
    setVariations(variations.filter((_, i) => i !== index));
  };

  const updateVariation = (index: number, field: string, value: any) => {
    const updated = [...variations];
    if (field === 'name') {
      updated[index].name = value;
    } else {
      updated[index].customizations[field] = value;
    }
    setVariations(updated);
  };

  const handleGenerate = async () => {
    setIsGenerating(true);
    try {
      const { data, error } = await supabase.functions.invoke('batch-create-videos', {
        body: {
          originalVideoId: video.id,
          variations: variations.map(v => ({
            name: v.name,
            customizations: {
              ...video.customizations,
              ...v.customizations,
            }
          }))
        }
      });

      if (error) throw error;

      if (data?.success) {
        toast({
          title: "✅ Batch-Generierung gestartet",
          description: `${variations.length} Varianten werden erstellt. Kosten: ${data.totalCost} Credits`,
        });
        onOpenChange(false);
      }
    } catch (error) {
      console.error('Batch generation error:', error);
      toast({
        title: "Fehler",
        description: "Batch-Generierung fehlgeschlagen.",
        variant: "destructive",
      });
    } finally {
      setIsGenerating(false);
    }
  };

  const totalCost = variations.length * 5;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Batch-Edit: A/B-Testing Varianten</DialogTitle>
          <DialogDescription>
            Erstelle mehrere Versionen gleichzeitig für A/B-Testing
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {variations.map((variation, index) => (
            <div key={index} className="border rounded-lg p-4 space-y-4">
              <div className="flex items-center justify-between">
                <Input
                  value={variation.name}
                  onChange={(e) => updateVariation(index, 'name', e.target.value)}
                  className="max-w-xs"
                />
                <div className="flex items-center gap-2">
                  <Badge variant="outline">v{(video.version_number || 1) + index + 1}</Badge>
                  {variations.length > 2 && (
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => removeVariation(index)}
                    >
                      <X className="h-4 w-4" />
                    </Button>
                  )}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Skript-Anpassung</Label>
                  <Textarea
                    placeholder="Optional: Individueller Skript-Text für diese Variante"
                    value={variation.customizations.script_text || ''}
                    onChange={(e) => updateVariation(index, 'script_text', e.target.value)}
                    rows={3}
                  />
                </div>

                <div className="space-y-2">
                  <Label>CTA-Text</Label>
                  <Input
                    placeholder="z.B. 'Jetzt kaufen!'"
                    value={variation.customizations.cta_text || ''}
                    onChange={(e) => updateVariation(index, 'cta_text', e.target.value)}
                  />
                </div>
              </div>

              <div className="text-xs text-muted-foreground">
                💡 Ändere nur die Felder, die sich vom Original unterscheiden sollen
              </div>
            </div>
          ))}

          <Button
            variant="outline"
            onClick={addVariation}
            className="w-full"
            disabled={variations.length >= 5}
          >
            <Plus className="h-4 w-4 mr-2" />
            Weitere Variante hinzufügen
          </Button>
        </div>

        <div className="p-4 bg-muted rounded-lg space-y-2">
          <div className="flex items-center justify-between">
            <div>
              <p className="font-medium">Batch-Generierung</p>
              <p className="text-sm text-muted-foreground">
                {variations.length} Varianten à 5 Credits
              </p>
            </div>
            <div className="text-right">
              <p className="text-2xl font-bold">{totalCost}</p>
              <p className="text-xs text-muted-foreground">Credits</p>
            </div>
          </div>

          <div className="text-xs text-muted-foreground space-y-1">
            <p>✅ Perfekt für A/B-Testing verschiedener CTAs</p>
            <p>✅ Teste mehrere Skript-Varianten parallel</p>
            <p>✅ Vergleiche Performance in Analytics</p>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Abbrechen
          </Button>
          <Button onClick={handleGenerate} disabled={isGenerating}>
            {isGenerating ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Generiere {variations.length} Varianten...
              </>
            ) : (
              <>
                <Copy className="mr-2 h-4 w-4" />
                Alle Varianten generieren
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
