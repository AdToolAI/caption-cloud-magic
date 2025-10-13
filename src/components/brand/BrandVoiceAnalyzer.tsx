import { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Loader2, MessageSquare, Sparkles, Plus, Trash2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

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
        title: "Mindestens 2 Text-Samples benötigt",
        description: "Jeder Text sollte mindestens 20 Zeichen lang sein",
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
        description: "Deine Marken-Stimme wurde erfolgreich erfasst",
        duration: 5000
      });

      onAnalysisComplete();
    } catch (error: any) {
      console.error('Voice analysis error:', error);
      toast({
        title: "Analyse fehlgeschlagen",
        description: error.message || "Konnte Voice nicht analysieren",
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
            Lade 2-5 eigene Texte hoch und lass die KI deine Marken-Stimme analysieren
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
                placeholder="Füge einen typischen Text/Caption deiner Marke ein (mind. 20 Zeichen)..."
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
                Sample hinzufügen
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
                <p className="text-sm font-medium text-muted-foreground">Tonalität</p>
                <Badge variant="secondary" className="mt-1">{existingVoice.tone}</Badge>
              </div>
              <div>
                <p className="text-sm font-medium text-muted-foreground">Stil</p>
                <Badge variant="secondary" className="mt-1">{existingVoice.style}</Badge>
              </div>
              <div>
                <p className="text-sm font-medium text-muted-foreground">Tempo</p>
                <Badge variant="secondary" className="mt-1">{existingVoice.pacing}</Badge>
              </div>
              <div>
                <p className="text-sm font-medium text-muted-foreground">Wortschatz</p>
                <Badge variant="secondary" className="mt-1">{existingVoice.vocabulary_level}</Badge>
              </div>
            </div>

            {existingVoice.personality_traits && (
              <div>
                <p className="text-sm font-medium text-muted-foreground mb-2">Persönlichkeit</p>
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
