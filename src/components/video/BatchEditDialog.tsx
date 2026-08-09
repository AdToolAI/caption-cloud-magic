import { tx } from "@/lib/i18nText";
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
    { name: tx({ de: 'Variante A', en: 'Variant A', es: 'Variante A' }), customizations: {} },
    { name: tx({ de: 'Variante B', en: 'Variant B', es: 'Variante B' }), customizations: {} },
  ]);
  const [isGenerating, setIsGenerating] = useState(false);
  const { toast } = useToast();

  const addVariation = () => {
    setVariations([
      ...variations,
      { name: tx({ de: `Variante ${String.fromCharCode(65 + variations.length)}`, en: `Variant ${String.fromCharCode(65 + variations.length)}`, es: `Variante ${String.fromCharCode(65 + variations.length)}` }), customizations: {} }
    ]);
  };

  const removeVariation = (index: number) => {
    if (variations.length <= 2) {
      toast({
        title: tx({ de: "Mindestanzahl erreicht", en: "Minimum number reached", es: "Se alcanzó el número mínimo" }),
        description: tx({ de: "Du benötigst mindestens 2 Varianten für A/B-Testing.", en: "You need at least 2 variants for A/B testing.", es: "Necesitas al menos 2 variantes para pruebas A/B." }),
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
          title: tx({ de: "✅ Batch-Generierung gestartet", en: "✅ Batch generation started", es: "✅ Generación de lotes iniciada" }),
          description: tx({ de: `${variations.length} Varianten werden erstellt. Kosten: ${data.totalCost} Credits`, en: `${variations.length} variations will be created. Cost: ${data.totalCost} Credits`, es: `Se crearán ${variations.length} variaciones. Costo: ${data.totalCost} créditos` }),
        });
        onOpenChange(false);
      }
    } catch (error) {
      console.error('Batch generation error:', error);
      toast({
        title: tx({ de: "Fehler", en: "Mistake", es: "Error" }),
        description: tx({ de: "Batch-Generierung fehlgeschlagen.", en: "Batch generation failed.", es: "Error en la generación del lote." }),
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
          <DialogTitle>{tx({ de: "Batch-Edit: A/B-Testing Varianten", en: "Batch Edit: A/B Testing Variants", es: "Edición por lotes: variantes de prueba A/B" })}</DialogTitle>
          <DialogDescription>
            {tx({ de: "Erstelle mehrere Versionen gleichzeitig für A/B-Testing", en: "Create multiple versions simultaneously for A/B testing", es: "Cree varias versiones simultáneamente para pruebas A/B" })}
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
                  <Label>{tx({ de: "Skript-Anpassung", en: "Script adjustment", es: "Ajuste del guión" })}</Label>
                  <Textarea
                    placeholder={tx({ de: "Optional: Individueller Skript-Text für diese Variante", en: "Optional: Individual script text for this variant", es: "Opcional: Texto de guion individual para esta variante" })}
                    value={variation.customizations.script_text || ''}
                    onChange={(e) => updateVariation(index, 'script_text', e.target.value)}
                    rows={3}
                  />
                </div>

                <div className="space-y-2">
                  <Label>{tx({ de: "CTA-Text", en: "CTA text", es: "Texto CTA" })}</Label>
                  <Input
                    placeholder={tx({ de: "z.B. 'Jetzt kaufen!'", en: "e.g. 'Buy now!'", es: "p. ej. '¡Comprar ahora!'" })}
                    value={variation.customizations.cta_text || ''}
                    onChange={(e) => updateVariation(index, 'cta_text', e.target.value)}
                  />
                </div>
              </div>

              <div className="text-xs text-muted-foreground">
                {tx({ de: "💡 Ändere nur die Felder, die sich vom Original unterscheiden sollen", en: "💡 Only change fields that should differ from the original", es: "💡 Solo cambie los campos que deban diferir del original" })}
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
            {tx({ de: "Weitere Variante hinzufügen", en: "Add another variant", es: "Agregar otra variante" })}
          </Button>
        </div>

        <div className="p-4 bg-muted rounded-lg space-y-2">
          <div className="flex items-center justify-between">
            <div>
              <p className="font-medium">{tx({ de: "Batch-Generierung", en: "Batch generation", es: "Generación por lotes" })}</p>
              <p className="text-sm text-muted-foreground">
                {tx({ de: `${variations.length} Varianten à 5 Credits`, en: `${variations.length} variants at 5 credits each`, es: `${variations.length} variantes a 5 créditos cada una` })}
              </p>
            </div>
            <div className="text-right">
              <p className="text-2xl font-bold">{totalCost}</p>
              <p className="text-xs text-muted-foreground">Credits</p>
            </div>
          </div>

          <div className="text-xs text-muted-foreground space-y-1">
            <p>{tx({ de: "✅ Perfekt für A/B-Testing verschiedener CTAs", en: "✅ Perfect for A/B testing different CTAs", es: "✅ Perfecto para realizar pruebas A/B de diferentes CTA" })}</p>
            <p>{tx({ de: "✅ Teste mehrere Skript-Varianten parallel", en: "✅ Test multiple script variants in parallel", es: "✅ Pruebe varias variantes de guiones en paralelo" })}</p>
            <p>{tx({ de: "✅ Vergleiche Performance in Analytics", en: "✅ Compare performance in analytics", es: "✅ Comparar rendimiento en análisis" })}</p>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            {tx({ de: "Abbrechen", en: "Cancel", es: "Cancelar" })}
          </Button>
          <Button onClick={handleGenerate} disabled={isGenerating}>
            {isGenerating ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                {tx({ de: `Generiere ${variations.length} Varianten...`, en: `Generating ${variations.length} variants...`, es: `Generando ${variations.length} variantes...` })}
              </>
            ) : (
              <>
                <Copy className="mr-2 h-4 w-4" />
                {tx({ de: "Alle Varianten generieren", en: "Generate all variants", es: "Generar todas las variantes" })}
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
