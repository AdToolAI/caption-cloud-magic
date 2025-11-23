import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Slider } from "@/components/ui/slider";
import { Sparkles, Loader2, CheckCircle2, Lightbulb } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

interface VoiceoverScriptGeneratorProps {
  open: boolean;
  onClose: () => void;
  onScriptGenerated: (script: string) => void;
}

export function VoiceoverScriptGenerator({ open, onClose, onScriptGenerated }: VoiceoverScriptGeneratorProps) {
  const [idea, setIdea] = useState("");
  const [tone, setTone] = useState("friendly");
  const [targetDuration, setTargetDuration] = useState(30);
  const [isGenerating, setIsGenerating] = useState(false);
  const [generatedScript, setGeneratedScript] = useState("");
  const [wordCount, setWordCount] = useState(0);
  const [estimatedDuration, setEstimatedDuration] = useState(0);
  const [tips, setTips] = useState<string[]>([]);
  const { toast } = useToast();

  const handleGenerate = async () => {
    if (!idea.trim()) {
      toast({
        title: "Idee erforderlich",
        description: "Bitte gib eine Idee für dein Voice-over ein",
        variant: "destructive",
      });
      return;
    }

    setIsGenerating(true);
    try {
      const { data, error } = await supabase.functions.invoke('generate-voiceover-script', {
        body: { idea, targetDuration, tone, language: 'de' }
      });

      if (error) throw error;

      setGeneratedScript(data.script);
      setWordCount(data.wordCount);
      setEstimatedDuration(data.estimatedDuration);
      setTips(data.tips || []);

      toast({
        title: "Script generiert",
        description: "Dein Voice-over-Script wurde erfolgreich erstellt",
      });
    } catch (error) {
      console.error('Error generating script:', error);
      toast({
        title: "Fehler",
        description: "Script konnte nicht generiert werden",
        variant: "destructive",
      });
    } finally {
      setIsGenerating(false);
    }
  };

  const handleApply = () => {
    if (generatedScript) {
      onScriptGenerated(generatedScript);
      handleClose();
    }
  };

  const handleClose = () => {
    setIdea("");
    setGeneratedScript("");
    setWordCount(0);
    setEstimatedDuration(0);
    setTips([]);
    onClose();
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="w-5 h-5 text-primary" />
            Voice-over Script Generator
          </DialogTitle>
          <DialogDescription>
            Gib eine einfache Idee ein und erhalte einen natürlichen, gut sprechbaren Text
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 mt-4">
          {/* Idee Input */}
          <div className="space-y-2">
            <Label htmlFor="idea">Deine Idee</Label>
            <Textarea
              id="idea"
              placeholder="z.B. Ein Tutorial über gesunde Ernährung für Anfänger"
              value={idea}
              onChange={(e) => setIdea(e.target.value)}
              rows={3}
              className="resize-none"
            />
          </div>

          {/* Optionale Einstellungen */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="tone">Ton/Stil</Label>
              <Select value={tone} onValueChange={setTone}>
                <SelectTrigger id="tone">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="friendly">Freundlich</SelectItem>
                  <SelectItem value="professional">Professionell</SelectItem>
                  <SelectItem value="energetic">Energetisch</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="duration">
                Ziel-Dauer: {targetDuration}s
              </Label>
              <Slider
                id="duration"
                min={15}
                max={60}
                step={5}
                value={[targetDuration]}
                onValueChange={(value) => setTargetDuration(value[0])}
                className="mt-2"
              />
            </div>
          </div>

          {/* Generate Button */}
          <Button 
            onClick={handleGenerate} 
            disabled={isGenerating || !idea.trim()}
            className="w-full"
          >
            {isGenerating ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Generiere Script...
              </>
            ) : (
              <>
                <Sparkles className="w-4 h-4 mr-2" />
                Script generieren
              </>
            )}
          </Button>

          {/* Generiertes Script */}
          {generatedScript && (
            <div className="space-y-4 p-4 border rounded-lg bg-muted/50">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <CheckCircle2 className="w-4 h-4 text-green-500" />
                  <span>{wordCount} Wörter • ~{estimatedDuration}s Sprechdauer</span>
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="generated">Generiertes Script (bearbeitbar)</Label>
                <Textarea
                  id="generated"
                  value={generatedScript}
                  onChange={(e) => setGeneratedScript(e.target.value)}
                  rows={8}
                  className="resize-none font-mono text-sm"
                />
              </div>

              {/* Tips */}
              {tips.length > 0 && (
                <div className="space-y-2">
                  <div className="flex items-center gap-2 text-sm font-medium">
                    <Lightbulb className="w-4 h-4 text-yellow-500" />
                    <span>Tipps für bessere Aufnahme:</span>
                  </div>
                  <ul className="space-y-1 text-sm text-muted-foreground">
                    {tips.map((tip, index) => (
                      <li key={index} className="flex items-start gap-2">
                        <span className="text-primary">✓</span>
                        <span>{tip}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {/* Apply Button */}
              <Button onClick={handleApply} className="w-full" variant="default">
                Script übernehmen
              </Button>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
