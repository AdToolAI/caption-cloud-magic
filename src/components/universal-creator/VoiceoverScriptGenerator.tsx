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
import { useTranslation } from "@/hooks/useTranslation";

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
  const { t, language } = useTranslation();

  const handleGenerate = async () => {
    if (!idea.trim()) {
      toast({ title: t('uc.ideaRequired'), description: t('uc.ideaRequiredDesc'), variant: "destructive" });
      return;
    }
    setIsGenerating(true);
    try {
      const { data, error } = await supabase.functions.invoke('generate-voiceover-script', {
        body: { idea, targetDuration, tone, language }
      });
      if (error) throw error;
      setGeneratedScript(data.script);
      setWordCount(data.wordCount);
      setEstimatedDuration(data.estimatedDuration);
      setTips(data.tips || []);
      toast({ title: t('uc.scriptGenerated'), description: t('uc.scriptGeneratedDesc') });
    } catch (error) {
      console.error('Error generating script:', error);
      toast({ title: t('uc.scriptError'), description: t('uc.scriptErrorDesc'), variant: "destructive" });
    } finally { setIsGenerating(false); }
  };

  const handleApply = () => { if (generatedScript) { onScriptGenerated(generatedScript); handleClose(); } };

  const handleClose = () => {
    setIdea(""); setGeneratedScript(""); setWordCount(0); setEstimatedDuration(0); setTips([]);
    onClose();
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="w-5 h-5 text-primary" />
            {t('uc.scriptGenerator')}
          </DialogTitle>
          <DialogDescription>{t('uc.scriptGeneratorDesc')}</DialogDescription>
        </DialogHeader>

        <div className="space-y-4 mt-4">
          <div className="space-y-2">
            <Label htmlFor="idea">{t('uc.yourIdea')}</Label>
            <Textarea id="idea" placeholder={t('uc.ideaPlaceholder')} value={idea} onChange={(e) => setIdea(e.target.value)} rows={3} className="resize-none" />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="tone">{t('uc.toneStyle')}</Label>
              <Select value={tone} onValueChange={setTone}>
                <SelectTrigger id="tone"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="friendly">{t('uc.toneFriendly')}</SelectItem>
                  <SelectItem value="professional">{t('uc.toneProfessional')}</SelectItem>
                  <SelectItem value="energetic">{t('uc.toneEnergetic')}</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="duration">{t('uc.targetDuration')}: {targetDuration}s</Label>
              <Slider id="duration" min={15} max={60} step={5} value={[targetDuration]} onValueChange={(value) => setTargetDuration(value[0])} className="mt-2" />
            </div>
          </div>

          <Button onClick={handleGenerate} disabled={isGenerating || !idea.trim()} className="w-full">
            {isGenerating ? (<><Loader2 className="w-4 h-4 mr-2 animate-spin" />{t('uc.generatingScript')}</>) : (<><Sparkles className="w-4 h-4 mr-2" />{t('uc.generateScriptBtn')}</>)}
          </Button>

          {generatedScript && (
            <div className="space-y-4 p-4 border rounded-lg bg-muted/50">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <CheckCircle2 className="w-4 h-4 text-green-500" />
                  <span>{wordCount} {t('uc.words')} • ~{estimatedDuration}s</span>
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="generated">{t('uc.generatedScriptEditable')}</Label>
                <Textarea id="generated" value={generatedScript} onChange={(e) => setGeneratedScript(e.target.value)} rows={8} className="resize-none font-mono text-sm" />
              </div>
              {tips.length > 0 && (
                <div className="space-y-2">
                  <div className="flex items-center gap-2 text-sm font-medium">
                    <Lightbulb className="w-4 h-4 text-yellow-500" />
                    <span>{t('uc.tipsForRecording')}</span>
                  </div>
                  <ul className="space-y-1 text-sm text-muted-foreground">
                    {tips.map((tip, index) => (
                      <li key={index} className="flex items-start gap-2"><span className="text-primary">✓</span><span>{tip}</span></li>
                    ))}
                  </ul>
                </div>
              )}
              <Button onClick={handleApply} className="w-full" variant="default">{t('uc.applyScript')}</Button>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
