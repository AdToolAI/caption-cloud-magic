/**
 * Director's Table — the Autopilot cockpit.
 *
 * Three moments, nothing more: the user states what they want, approves a
 * treatment, and watches the production run. Everything technical (prompt
 * grammar, rhythm weights, negative clauses) stays hidden — the customer sees
 * a storyboard, not a machine.
 */

import { useMemo, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Slider } from '@/components/ui/slider';
import { Loader2, Clapperboard, Sparkles, Camera, AlertTriangle, CheckCircle2 } from 'lucide-react';
import { GENRE_LIST, getRecipe } from '@/lib/autopilot/genres';
import { applyRhythm, diversifyCameraMoves } from '@/lib/autopilot/rhythm';
import { preflightTreatment, blockingFindings } from '@/lib/autopilot/preflight';
import { planSoundDesign } from '@/lib/autopilot/soundDesign';
import {
  describeScene,
  compileAnchorPrompt,
  compileMotionPrompt,
  clampPromptWords,
} from '@/lib/autopilot/promptGrammar';
import { useAutopilotProduction } from '@/hooks/useAutopilotProduction';
import { ProductionStage } from '@/components/autopilot/ProductionStage';
import type { AutopilotTreatment, AutopilotGenre, AutopilotAspect } from '@/lib/autopilot/types';
import { cn } from '@/lib/utils';

const ASPECTS: Array<{ value: AutopilotAspect; label: string }> = [
  { value: '9:16', label: 'Hochkant 9:16 — Reels, Shorts, TikTok' },
  { value: '16:9', label: 'Quer 16:9 — YouTube, Website' },
  { value: '1:1', label: 'Quadrat 1:1 — Feed' },
  { value: '4:5', label: 'Portrait 4:5 — Feed' },
];

const LANGUAGES = [
  { value: 'de', label: 'Deutsch' },
  { value: 'en', label: 'Englisch' },
  { value: 'es', label: 'Spanisch' },
];

const BEAT_LABEL: Record<string, string> = {
  hook: 'Aufhänger',
  problem: 'Problem',
  reveal: 'Lösung',
  proof: 'Beweis',
  benefit: 'Nutzen',
  emotion: 'Emotion',
  cta: 'Abbinder',
};

export function DirectorsTable() {
  const { toast } = useToast();

  const [brief, setBrief] = useState('');
  const [genre, setGenre] = useState<AutopilotGenre | 'auto'>('auto');
  const [aspect, setAspect] = useState<AutopilotAspect>('9:16');
  const [language, setLanguage] = useState('de');
  const [duration, setDuration] = useState(20);

  const [loading, setLoading] = useState(false);
  const [starting, setStarting] = useState(false);
  const [approved, setApproved] = useState(false);
  const [productionId, setProductionId] = useState<string | null>(null);
  const [treatment, setTreatment] = useState<AutopilotTreatment | null>(null);

  const { production, scenes: producedScenes, log } = useAutopilotProduction(
    productionId,
    approved,
  );

  /**
   * The model delivers structure; the planner owns time and camera variety.
   * Doing this on the client keeps the storyboard instantly re-plannable when
   * the user drags the duration slider after approval.
   */
  const plannedTreatment = useMemo(() => {
    if (!treatment) return null;
    const scenes = diversifyCameraMoves(
      applyRhythm(treatment.scenes, treatment.totalDurationSeconds),
    );
    return { ...treatment, scenes };
  }, [treatment]);

  const preflight = useMemo(
    () => (plannedTreatment ? preflightTreatment(plannedTreatment) : null),
    [plannedTreatment],
  );

  const mixPlan = useMemo(
    () =>
      plannedTreatment
        ? planSoundDesign(plannedTreatment.scenes, plannedTreatment.genre)
        : null,
    [plannedTreatment],
  );

  const blockers = preflight ? blockingFindings(preflight) : [];

  /** Distinct room tones across the film — shown as a one-line sound summary. */
  const ambienceCues = useMemo(
    () =>
      Array.from(
        new Set(
          (mixPlan?.layers ?? [])
            .map((layer) => layer.ambiencePrompt)
            .filter((cue): cue is string => Boolean(cue)),
        ),
      ),
    [mixPlan],
  );

  const handleDevelop = async () => {
    if (brief.trim().length < 8) {
      toast({
        title: 'Noch zu knapp',
        description: 'Beschreibe in einem Satz, worum es im Video gehen soll.',
        variant: 'destructive',
      });
      return;
    }

    setLoading(true);
    setTreatment(null);
    try {
      const { data, error } = await supabase.functions.invoke('autopilot-treatment', {
        body: {
          brief: brief.trim(),
          genre: genre === 'auto' ? undefined : genre,
          aspect_ratio: aspect,
          language,
          target_duration_seconds: duration,
        },
      });

      if (error) throw error;
      if (data?.error) throw new Error(data.error);

      setProductionId(data.production_id);
      setTreatment(data.treatment as AutopilotTreatment);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unbekannter Fehler';
      toast({
        title: 'Treatment fehlgeschlagen',
        description:
          message === 'credits_exhausted'
            ? 'Dein KI-Guthaben ist aufgebraucht.'
            : message === 'rate_limited'
              ? 'Zu viele Anfragen — bitte kurz warten.'
              : message,
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* ---------------------------------------------------------- Briefing */}
      <Card className="border-primary/20 bg-card/60 p-6 backdrop-blur">
        <div className="mb-5 flex items-center gap-3">
          <div className="rounded-xl bg-primary/10 p-2.5">
            <Clapperboard className="h-5 w-5 text-primary" />
          </div>
          <div>
            <h2 className="font-serif text-xl">Regietisch</h2>
            <p className="text-sm text-muted-foreground">
              Sag, was du brauchst. Die KI entwickelt Konzept, Storyboard und Film.
            </p>
          </div>
        </div>

        <div className="space-y-5">
          <div className="space-y-2">
            <Label htmlFor="autopilot-brief">Was soll entstehen?</Label>
            <Textarea
              id="autopilot-brief"
              value={brief}
              onChange={(event) => setBrief(event.target.value)}
              rows={3}
              placeholder="z. B. Ein Werbevideo für unsere neue Espressomaschine — Zielgruppe Berufstätige, die morgens keine Zeit haben."
              className="resize-none"
            />
          </div>

          <div className="grid gap-4 md:grid-cols-3">
            <div className="space-y-2">
              <Label>Art des Videos</Label>
              <Select value={genre} onValueChange={(value) => setGenre(value as AutopilotGenre | 'auto')}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="auto">Automatisch erkennen</SelectItem>
                  {GENRE_LIST.map((recipe) => (
                    <SelectItem key={recipe.id} value={recipe.id}>
                      {recipe.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Format</Label>
              <Select value={aspect} onValueChange={(value) => setAspect(value as AutopilotAspect)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {ASPECTS.map((item) => (
                    <SelectItem key={item.value} value={item.value}>
                      {item.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Sprache</Label>
              <Select value={language} onValueChange={setLanguage}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {LANGUAGES.map((item) => (
                    <SelectItem key={item.value} value={item.value}>
                      {item.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <Label>Länge</Label>
              <span className="text-sm font-medium text-primary">{duration} Sekunden</span>
            </div>
            <Slider
              value={[duration]}
              onValueChange={([value]) => setDuration(value)}
              min={8}
              max={60}
              step={1}
            />
          </div>

          {genre !== 'auto' && (
            <p className="rounded-lg border border-border/50 bg-muted/30 px-3 py-2 text-xs text-muted-foreground">
              {getRecipe(genre).description}
            </p>
          )}

          <Button onClick={handleDevelop} disabled={loading} size="lg" className="w-full">
            {loading ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Regie denkt nach…
              </>
            ) : (
              <>
                <Sparkles className="mr-2 h-4 w-4" />
                Treatment entwickeln
              </>
            )}
          </Button>
        </div>
      </Card>

      {/* -------------------------------------------------------- Storyboard */}
      {plannedTreatment && (
        <Card className="border-primary/20 bg-card/60 p-6 backdrop-blur">
          <div className="mb-1 flex flex-wrap items-center gap-2">
            <Badge variant="outline">{getRecipe(plannedTreatment.genre).label}</Badge>
            <Badge variant="outline">{plannedTreatment.aspect}</Badge>
            <Badge variant="outline">{plannedTreatment.scenes.length} Szenen</Badge>
            <Badge variant="outline">
              {Math.round(
                plannedTreatment.scenes.reduce((sum, scene) => sum + scene.durationSeconds, 0),
              )}
              s
            </Badge>
          </div>

          <h3 className="font-serif text-2xl">{plannedTreatment.title}</h3>
          <p className="mt-2 max-w-3xl text-sm text-muted-foreground">
            {plannedTreatment.logline}
          </p>

          {blockers.length > 0 && (
            <div className="mt-4 space-y-2 rounded-lg border border-destructive/30 bg-destructive/5 p-3">
              {blockers.map((finding, index) => (
                <div key={index} className="flex items-start gap-2 text-sm text-destructive">
                  <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                  <span>{finding.message}</span>
                </div>
              ))}
            </div>
          )}

          <div className="mt-6 space-y-3">
            {plannedTreatment.scenes.map((scene, index) => (
              <div
                key={scene.id}
                className={cn(
                  'rounded-xl border border-border/50 bg-background/40 p-4',
                  'transition-colors hover:border-primary/40',
                )}
              >
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-mono text-xs text-muted-foreground">
                    {String(index + 1).padStart(2, '0')}
                  </span>
                  <Badge variant="secondary" className="text-xs">
                    {BEAT_LABEL[scene.beat] ?? scene.beat}
                  </Badge>
                  <span className="text-xs text-muted-foreground">
                    {scene.durationSeconds.toFixed(1)}s
                  </span>
                  <span className="ml-auto flex items-center gap-1.5 text-xs text-muted-foreground">
                    <Camera className="h-3.5 w-3.5" />
                    {describeScene(scene)}
                  </span>
                </div>

                <p className="mt-2 text-sm">{scene.action}</p>
                <p className="text-xs text-muted-foreground">{scene.environment}</p>

                {scene.dialogue && (
                  <p className="mt-2 border-l-2 border-primary/40 pl-3 text-sm italic">
                    „{scene.dialogue}“
                  </p>
                )}
              </div>
            ))}
          </div>

          {mixPlan && (
            <div className="mt-5 rounded-lg border border-border/50 bg-muted/20 px-4 py-3 text-xs text-muted-foreground">
              <span className="font-medium text-foreground">Sounddesign: </span>
              {plannedTreatment.musicMood || getRecipe(plannedTreatment.genre).musicMood}
              {ambienceCues.length ? ` · Atmo: ${ambienceCues.slice(0, 3).join(', ')}` : ''}
            </div>
          )}

          <div className="mt-6 flex flex-wrap gap-3">
            <Button
              size="lg"
              disabled={blockers.length > 0 || !productionId}
              onClick={() =>
                toast({
                  title: 'Treatment freigegeben',
                  description:
                    'Die Produktion startet mit der Bildfreigabe — jede Szene wird als Standbild geprüft, bevor sie animiert wird.',
                })
              }
            >
              <CheckCircle2 className="mr-2 h-4 w-4" />
              Freigeben und produzieren
            </Button>
            <Button size="lg" variant="outline" onClick={handleDevelop} disabled={loading}>
              Neu entwickeln
            </Button>
          </div>
        </Card>
      )}
    </div>
  );
}
