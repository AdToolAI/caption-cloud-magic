import { useEffect, useRef, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Sparkles, Loader2, Wand2, Check, Image as ImageIcon } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import type { PictureMode, QualityTier } from "@/config/pictureStudioModels";
import { PICTURE_MODELS } from "@/config/pictureStudioModels";

export interface PromptHelperResult {
  masterPrompt: string;
  alternatives: string[];
  recommendedTier: QualityTier;
  recommendedMode: PictureMode;
  recommendedStrength: number;
  reasoning: string;
  referenceSummary?: string;
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initialUserText?: string;
  currentMode: PictureMode;
  currentTier: QualityTier;
  referenceImageUrl?: string | null;
  /** When true and a reference image is present, auto-runs the helper in
   *  "Bild übernehmen & verbessern" mode (deep vision analysis + transform/ultra). */
  autoEnhance?: boolean;
  onApply: (result: PromptHelperResult, chosenPrompt: string) => void;
}

const GOALS = ['Werbung', 'Social', 'Portrait', 'Szene', 'Produkt', 'Kunst'];
const STYLES = ['Fotorealistisch', 'Cinematisch', 'Illustration', '3D', 'Anime', 'Aquarell'];
const MOODS = ['Episch', 'Ruhig', 'Dramatisch', 'Hell', 'Düster', 'Verspielt'];

const ENHANCE_DEFAULT_TEXT =
  "Übernimm dieses Bild 1:1 und verbessere Qualität, Realismus, Lichtkonsistenz und Detailtreue — behalte alle Personen, Kleidung, Komposition und Hintergrund exakt bei.";

export function PromptHelperDialog({
  open, onOpenChange, initialUserText = '',
  currentMode, currentTier, referenceImageUrl, autoEnhance, onApply,
}: Props) {
  const [userText, setUserText] = useState(initialUserText);
  const [goal, setGoal] = useState<string | null>(null);
  const [style, setStyle] = useState<string | null>(null);
  const [mood, setMood] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<PromptHelperResult | null>(null);
  const autoFiredRef = useRef(false);

  const reset = () => { setResult(null); autoFiredRef.current = false; };

  const handleGenerate = async (overrideText?: string, intent: 'enhance' | 'freeform' = 'freeform') => {
    const text = (typeof overrideText === 'string' ? overrideText : userText).trim();
    if (!text) {
      toast.error("Bitte beschreib in deinen Worten was du willst.");
      return;
    }
    setLoading(true);
    setResult(null);
    try {
      const { data, error } = await supabase.functions.invoke('generate-image-prompt', {
        body: {
          userText: text,
          referenceImageUrl: referenceImageUrl || null,
          currentMode,
          currentTier,
          intent,
          filters: { goal, style, mood },
        },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      setResult(data as PromptHelperResult);
    } catch (err: any) {
      console.error('[PromptHelper] error', err);
      toast.error(err?.message || "Prompt-Helfer konnte nicht antworten.");
    } finally {
      setLoading(false);
    }
  };

  // Auto-fire on open when in enhance mode + reference present.
  useEffect(() => {
    if (!open) {
      autoFiredRef.current = false;
      return;
    }
    if (autoEnhance && referenceImageUrl && !autoFiredRef.current) {
      autoFiredRef.current = true;
      setUserText(ENHANCE_DEFAULT_TEXT);
      // small delay so dialog mount finishes before the spinner appears
      setTimeout(() => { void handleGenerate(ENHANCE_DEFAULT_TEXT, 'enhance'); }, 80);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, autoEnhance, referenceImageUrl]);


  const handleApply = (chosen: string) => {
    if (!result) return;
    onApply(result, chosen);
    onOpenChange(false);
    setTimeout(reset, 200);
  };

  const Chip = ({ value, active, onClick }: { value: string; active: boolean; onClick: () => void }) => (
    <button
      type="button"
      onClick={onClick}
      className={`px-3 py-1 text-xs rounded-full border transition-colors ${
        active
          ? 'bg-primary text-primary-foreground border-primary'
          : 'border-border/60 text-muted-foreground hover:text-foreground hover:border-border'
      }`}
    >
      {value}
    </button>
  );

  return (
    <Dialog open={open} onOpenChange={(o) => { onOpenChange(o); if (!o) setTimeout(reset, 200); }}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Wand2 className="h-5 w-5 text-primary" />
            Prompt-Helfer
          </DialogTitle>
          <DialogDescription>
            Sag mir mit deinen Worten was du willst — ich baue daraus den perfekten Prompt
            und empfehle das beste Modell.
          </DialogDescription>
        </DialogHeader>

        <ScrollArea className="flex-1 -mx-6 px-6">
          <div className="space-y-4 py-2">
            {referenceImageUrl && (
              <div className="flex items-center gap-2 p-2 rounded-md bg-primary/5 border border-primary/20 text-xs">
                <ImageIcon className="h-4 w-4 text-primary shrink-0" />
                <span>Dein Referenzbild wird mitanalysiert.</span>
                <img src={referenceImageUrl} alt="ref" className="ml-auto h-10 w-10 object-cover rounded" />
              </div>
            )}

            <div className="space-y-2">
              <Label className="text-xs">Was willst du? (beliebige Sprache)</Label>
              <Textarea
                value={userText}
                onChange={(e) => setUserText(e.target.value)}
                placeholder="z. B. Mach das Bild realistisch und detailliert, behalte alle Personen"
                rows={3}
                className="resize-none bg-background/50"
              />
            </div>

            <div className="space-y-2">
              <Label className="text-xs text-muted-foreground">Schnell-Filter (optional)</Label>
              <div className="space-y-1.5">
                <div className="flex flex-wrap gap-1.5">
                  {GOALS.map(g => <Chip key={g} value={g} active={goal === g} onClick={() => setGoal(goal === g ? null : g)} />)}
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {STYLES.map(s => <Chip key={s} value={s} active={style === s} onClick={() => setStyle(style === s ? null : s)} />)}
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {MOODS.map(m => <Chip key={m} value={m} active={mood === m} onClick={() => setMood(mood === m ? null : m)} />)}
                </div>
              </div>
            </div>

            <Button onClick={() => handleGenerate()} disabled={loading || !userText.trim()} className="w-full">
              {loading ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Analysiere…</>
                       : <><Sparkles className="h-4 w-4 mr-2" /> Prompt bauen</>}
            </Button>

            {result && (
              <div className="space-y-3 pt-2 border-t border-border/50">
                {/* Recommendation */}
                <div className="p-3 rounded-lg bg-gradient-to-br from-primary/10 to-transparent border border-primary/30 space-y-2">
                  <div className="flex items-center gap-2 flex-wrap">
                    <Badge className="bg-primary text-primary-foreground">
                      Empfohlen: {PICTURE_MODELS[result.recommendedTier].label}
                    </Badge>
                    <Badge variant="outline">Modus: {result.recommendedMode}</Badge>
                    {result.recommendedMode === 'transform' && (
                      <Badge variant="outline">Strength: {result.recommendedStrength}%</Badge>
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground">{result.reasoning}</p>
                  {result.referenceSummary && (
                    <p className="text-[11px] italic text-muted-foreground">
                      Erkannt im Referenzbild: {result.referenceSummary}
                    </p>
                  )}
                </div>

                {/* Master prompt */}
                <PromptCard
                  label="Master-Prompt (empfohlen)"
                  prompt={result.masterPrompt}
                  highlight
                  onUse={() => handleApply(result.masterPrompt)}
                />

                {result.alternatives.map((alt, i) => (
                  <PromptCard
                    key={i}
                    label={`Kurz-Variante ${i + 1}`}
                    prompt={alt}
                    onUse={() => handleApply(alt)}
                  />
                ))}
              </div>
            )}
          </div>
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
}

function PromptCard({ label, prompt, highlight, onUse }: {
  label: string; prompt: string; highlight?: boolean; onUse: () => void;
}) {
  return (
    <div className={`p-3 rounded-lg border space-y-2 ${
      highlight ? 'border-primary/40 bg-primary/5' : 'border-border/50 bg-background/30'
    }`}>
      <div className="flex items-center justify-between">
        <Label className="text-xs font-semibold">{label}</Label>
        <Button size="sm" variant={highlight ? "default" : "outline"} onClick={onUse}>
          <Check className="h-3.5 w-3.5 mr-1" /> Übernehmen
        </Button>
      </div>
      <p className="text-xs text-foreground/90 leading-relaxed">{prompt}</p>
    </div>
  );
}
