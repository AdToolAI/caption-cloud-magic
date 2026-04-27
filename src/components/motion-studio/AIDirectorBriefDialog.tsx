import { useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Slider } from '@/components/ui/slider';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Sparkles, Wand2, Loader2, Film, Clock, Camera } from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { useTranslation } from '@/hooks/useTranslation';

export interface DirectorScene {
  shot: string;
  prompt: string;
  durationSeconds: number;
  cameraMove?: string;
  castName?: string;
  locationHint?: string;
  vibe?: string;
}

export interface DirectorPlan {
  title: string;
  logline: string;
  scenes: DirectorScene[];
  totalDurationSeconds: number;
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  castNames: string[];
  locationNames: string[];
  /** Called when the user accepts the plan. */
  onApply: (plan: DirectorPlan) => void;
}

export default function AIDirectorBriefDialog({
  open,
  onOpenChange,
  castNames,
  locationNames,
  onApply,
}: Props) {
  const { language } = useTranslation();
  const [brief, setBrief] = useState('');
  const [duration, setDuration] = useState<number>(30);
  const [loading, setLoading] = useState(false);
  const [plan, setPlan] = useState<DirectorPlan | null>(null);

  const reset = () => {
    setPlan(null);
  };

  const generate = async () => {
    if (brief.trim().length < 10) {
      toast.error('Brief zu kurz — bitte mindestens 10 Zeichen');
      return;
    }
    setLoading(true);
    setPlan(null);
    try {
      const { data, error } = await supabase.functions.invoke(
        'motion-studio-director',
        {
          body: {
            brief: brief.trim(),
            targetDurationSeconds: duration,
            language,
            castNames,
            locationNames,
          },
        }
      );
      if (error) throw error;
      if (!data?.plan) throw new Error('Kein Plan zurückgegeben');
      setPlan(data.plan as DirectorPlan);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Director-Fehler';
      console.error('[AIDirector] error:', err);
      toast.error(msg);
    } finally {
      setLoading(false);
    }
  };

  const apply = () => {
    if (!plan) return;
    onApply(plan);
    onOpenChange(false);
    setBrief('');
    setPlan(null);
    toast.success(`Storyboard "${plan.title}" geladen — ${plan.scenes.length} Szenen ✨`);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Wand2 className="h-5 w-5 text-primary" />
            AI-Director casten
          </DialogTitle>
          <DialogDescription>
            Beschreibe deine Idee in einem Satz — der KI-Regisseur baut daraus ein
            komplettes Storyboard mit Shot-Plan, Kamera-Bewegungen und Prompts.
          </DialogDescription>
        </DialogHeader>

        {!plan ? (
          <div className="space-y-4 overflow-y-auto pr-1">
            <div className="space-y-2">
              <Label htmlFor="brief">Brief</Label>
              <Textarea
                id="brief"
                value={brief}
                onChange={(e) => setBrief(e.target.value)}
                placeholder="z.B. Espresso-Brand-Spot: Ein Barista in einer minimalen Berliner Bar zaubert morgens die perfekte Tasse — Fokus auf Handwerk, warmes Licht, Slow Motion am Ende."
                rows={5}
                className="resize-none"
              />
              <p className="text-[11px] text-muted-foreground">
                Tipp: Stil, Stimmung und Hauptbild kurz nennen. Cast/Location werden
                automatisch verwendet, wenn passend.
              </p>
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label className="flex items-center gap-1.5">
                  <Clock className="h-3.5 w-3.5" /> Ziel-Dauer
                </Label>
                <span className="text-sm font-bold tabular-nums text-primary">
                  {duration}s
                </span>
              </div>
              <Slider
                value={[duration]}
                onValueChange={(v) => setDuration(v[0])}
                min={15}
                max={90}
                step={5}
              />
            </div>

            <div className="grid grid-cols-2 gap-3 text-xs">
              <div className="rounded-lg border border-border/40 bg-muted/30 p-3">
                <div className="text-muted-foreground mb-1">Verfügbarer Cast</div>
                <div className="flex flex-wrap gap-1">
                  {castNames.length === 0 ? (
                    <span className="text-muted-foreground">—</span>
                  ) : (
                    castNames.slice(0, 6).map((n) => (
                      <Badge key={n} variant="secondary" className="text-[10px]">
                        {n}
                      </Badge>
                    ))
                  )}
                </div>
              </div>
              <div className="rounded-lg border border-border/40 bg-muted/30 p-3">
                <div className="text-muted-foreground mb-1">Verfügbare Locations</div>
                <div className="flex flex-wrap gap-1">
                  {locationNames.length === 0 ? (
                    <span className="text-muted-foreground">—</span>
                  ) : (
                    locationNames.slice(0, 6).map((n) => (
                      <Badge key={n} variant="secondary" className="text-[10px]">
                        {n}
                      </Badge>
                    ))
                  )}
                </div>
              </div>
            </div>

            <Button
              onClick={generate}
              disabled={loading || brief.trim().length < 10}
              className="w-full gap-2 bg-gradient-to-r from-primary to-accent"
            >
              {loading ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Director arbeitet …
                </>
              ) : (
                <>
                  <Sparkles className="h-4 w-4" />
                  Storyboard generieren
                </>
              )}
            </Button>
          </div>
        ) : (
          <div className="flex flex-col gap-3 overflow-hidden">
            <div className="rounded-lg bg-gradient-to-br from-primary/10 to-accent/5 p-4 border border-primary/30">
              <div className="text-[10px] uppercase tracking-wider text-primary mb-1">
                Vorschlag
              </div>
              <h3 className="text-base font-bold leading-tight">{plan.title}</h3>
              <p className="text-xs text-muted-foreground mt-1">{plan.logline}</p>
              <div className="flex items-center gap-3 mt-2 text-[11px] text-muted-foreground">
                <span className="flex items-center gap-1">
                  <Film className="h-3 w-3" /> {plan.scenes.length} Szenen
                </span>
                <span className="flex items-center gap-1">
                  <Clock className="h-3 w-3" /> {plan.totalDurationSeconds}s gesamt
                </span>
              </div>
            </div>

            <ScrollArea className="flex-1 max-h-[40vh]">
              <ol className="space-y-2 pr-2">
                {plan.scenes.map((s, i) => (
                  <li
                    key={i}
                    className="rounded-lg border border-border/40 bg-card/60 p-3 text-xs"
                  >
                    <div className="flex items-center gap-2 mb-1.5 flex-wrap">
                      <Badge className="bg-primary/15 text-primary border-primary/30">
                        #{i + 1} · {s.shot}
                      </Badge>
                      {s.cameraMove && (
                        <Badge variant="outline" className="gap-1 text-[10px]">
                          <Camera className="h-3 w-3" /> {s.cameraMove}
                        </Badge>
                      )}
                      <span className="text-[10px] tabular-nums text-muted-foreground ml-auto">
                        {s.durationSeconds}s
                      </span>
                    </div>
                    <p className="text-foreground/90 leading-snug">{s.prompt}</p>
                    {(s.castName || s.locationHint) && (
                      <div className="flex gap-2 mt-1.5 flex-wrap">
                        {s.castName && (
                          <span className="text-[10px] text-muted-foreground">
                            Cast: {s.castName}
                          </span>
                        )}
                        {s.locationHint && (
                          <span className="text-[10px] text-muted-foreground">
                            Location: {s.locationHint}
                          </span>
                        )}
                      </div>
                    )}
                  </li>
                ))}
              </ol>
            </ScrollArea>

            <div className="flex gap-2">
              <Button variant="outline" onClick={reset} className="flex-1">
                Verwerfen
              </Button>
              <Button
                onClick={apply}
                className="flex-1 gap-2 bg-gradient-to-r from-primary to-accent"
              >
                <Sparkles className="h-4 w-4" /> Übernehmen
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
