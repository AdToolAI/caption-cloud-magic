import { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Loader2, MessageSquare, Sparkles, Plus, Trash2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { tx } from "@/lib/i18nText";

interface BrandVoiceAnalyzerProps {
  brandKitId: string;
  existingVoice?: any;
  onAnalysisComplete: () => void;
}

export function BrandVoiceAnalyzer({ brandKitId, existingVoice, onAnalysisComplete }: BrandVoiceAnalyzerProps) {
  const { toast } = useToast();
  const [samples, setSamples] = useState<string[]>(['', '', '']);
  const [isAnalyzing, setIsAnalyzing] = useState(false);

  const addSample = () => {
    if (samples.length < 5) {
      setSamples([...samples, '']);
    }
  };

  const removeSample = (index: number) => {
    if (samples.length > 1) {
      setSamples(samples.filter((_, i) => i !== index));
    }
  };

  const updateSample = (index: number, value: string) => {
    const newSamples = [...samples];
    newSamples[index] = value;
    setSamples(newSamples);
  };

  const handleAnalyze = async () => {
    const validSamples = samples.filter(s => s.trim().length > 20);
    
    if (validSamples.length < 2) {
      toast({
        title: tx({ de: "Mindestens 2 Text-Samples benötigt", en: "At least 2 text samples required", es: "Se requieren al menos 2 muestras de texto" }),
        description: tx({ de: "Jeder Text sollte mindestens 20 Zeichen lang sein", en: "Each text should be at least 20 characters long", es: "Cada texto debe tener al menos 20 caracteres." }),
        variant: "destructive"
      });
      return;
    }

    setIsAnalyzing(true);

    try {
      const { data, error } = await supabase.functions.invoke('analyze-brand-voice', {
        body: {
          brandKitId,
          textSamples: validSamples
        }
      });

      if (error) throw error;

      toast({
        title: "Brand Voice analysiert! 🎉",
        description: tx({ de: "Deine Marken-Stimme wurde erfolgreich erfasst", en: "Your brand voice has been successfully captured", es: "Tu voz de marca ha sido capturada con éxito" }),
        duration: 5000
      });

      onAnalysisComplete();
    } catch (error: any) {
      console.error('Voice analysis error:', error);
      toast({
        title: tx({ de: "Analyse fehlgeschlagen", en: "Analysis failed", es: "El análisis falló" }),
        description: error.message || tx({ de: "Konnte Voice nicht analysieren", en: "Couldn't analyze voice", es: "No se pudo analizar la voz" }),
        variant: "destructive"
      });
    } finally {
      setIsAnalyzing(false);
    }
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <MessageSquare className="h-5 w-5" />
            Brand Voice Assistent
          </CardTitle>
          <CardDescription>
            {tx({ de: "Lade 2-5 eigene Texte hoch und lass die KI deine Marken-Stimme analysieren", en: "Upload 2-5 of your own texts and let the AI analyze your brand voice", es: "Sube 2-5 de tus propios textos y deja que la IA analice la voz de tu marca" })}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {samples.map((sample, index) => (
            <div key={index} className="space-y-2">
              <div className="flex items-center justify-between">
                <Label htmlFor={`sample-${index}`}>
                  Text-Sample {index + 1}
                </Label>
                {samples.length > 1 && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => removeSample(index)}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                )}
              </div>
              <Textarea
                id={`sample-${index}`}
                value={sample}
                onChange={(e) => updateSample(index, e.target.value)}
                placeholder={tx({ de: "Füge einen typischen Text/Caption deiner Marke ein (mind. 20 Zeichen)...", en: "Add a typical text/caption from your brand (min. 20 characters)...", es: "Añade un texto/leyenda típico de tu marca (mín. 20 caracteres)..." })}
                rows={4}
                className="resize-none"
              />
            </div>
          ))}

          <div className="flex gap-2">
            {samples.length < 5 && (
              <Button
                variant="outline"
                onClick={addSample}
                className="flex-1"
              >
                <Plus className="mr-2 h-4 w-4" />
                {tx({ de: "Sample hinzufügen", en: "Add Sample", es: "Añadir muestra" })}
              </Button>
            )}
            <Button
              onClick={handleAnalyze}
              disabled={isAnalyzing}
              className="flex-1"
            >
              {isAnalyzing ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Analysiere...
                </>
              ) : (
                <>
                  <Sparkles className="mr-2 h-4 w-4" />
                  Voice analysieren
                </>
              )}
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Existing Voice Profile */}
      {existingVoice && Object.keys(existingVoice).length > 0 && (
        <Card className="border-primary">
          <CardHeader>
            <CardTitle className="text-lg">Aktuelle Brand Voice</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid md:grid-cols-2 gap-4">
              <div>
                <p className="text-sm font-medium text-muted-foreground">{tx({ de: "Tonalität", en: "Tone of Voice", es: "Tono de Voz" })}</p>
                <Badge variant="secondary" className="mt-1">{existingVoice.tone}</Badge>
              </div>
              <div>
                <p className="text-sm font-medium text-muted-foreground">{tx({ de: "Stil", en: "Style", es: "Estilo" })}</p>
                <Badge variant="secondary" className="mt-1">{existingVoice.style}</Badge>
              </div>
              <div>
                <p className="text-sm font-medium text-muted-foreground">{tx({ de: "Tempo", en: "Pacing", es: "Ritmo" })}</p>
                <Badge variant="secondary" className="mt-1">{existingVoice.pacing}</Badge>
              </div>
              <div>
                <p className="text-sm font-medium text-muted-foreground">{tx({ de: "Wortschatz", en: "Vocabulary", es: "Vocabulario" })}</p>
                <Badge variant="secondary" className="mt-1">{existingVoice.vocabulary_level}</Badge>
              </div>
            </div>

            {existingVoice.personality_traits && (
              <div>
                <p className="text-sm font-medium text-muted-foreground mb-2">{tx({ de: "Persönlichkeit", en: "Personality", es: "Personalidad" })}</p>
                <div className="flex flex-wrap gap-2">
                  {existingVoice.personality_traits.map((trait: string, idx: number) => (
                    <Badge key={idx} variant="outline">{trait}</Badge>
                  ))}
                </div>
              </div>
            )}

            {existingVoice.voice_summary && (
              <div className="pt-2 border-t">
                <p className="text-sm italic text-muted-foreground">
                  "{existingVoice.voice_summary}"
                </p>
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
