/**
 * The idea gallery.
 *
 * Five concepts, each already checked against what the production pipeline can
 * actually deliver. The feasibility badge is not decoration: an idea shown here
 * has been repaired to fit scene limits, people-per-shot and total runtime, so
 * "auswählen" really does mean the film can be built.
 */

import { useMemo } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { ArrowLeft, Clapperboard, Sparkles, Target, Clock, CheckCircle2, Info } from 'lucide-react';
import { NARRATIVE_ANGLES, type AutopilotIdea, type AutopilotStrategy } from '@/lib/autopilot/strategy';
import { assessIdeaSet, needsChapterMode } from '@/lib/autopilot/ideaFeasibility';
import { estimateProductionCost, formatEuro } from '@/lib/autopilot/costEstimate';
import type { LauncherOptions } from '@/components/autopilot/AutopilotIdeaLauncher';
import { cn } from '@/lib/utils';

interface Props {
  strategy: AutopilotStrategy;
  ideas: AutopilotIdea[];
  options: LauncherOptions;
  onSelect: (idea: AutopilotIdea) => void;
  onBack: () => void;
}

const BEAT_LABEL: Record<string, string> = {
  hook: 'Aufhänger',
  problem: 'Problem',
  reveal: 'Lösung',
  proof: 'Beweis',
  benefit: 'Nutzen',
  emotion: 'Emotion',
  cta: 'Abbinder',
};

export function IdeaGallery({ strategy, ideas, options, onSelect, onBack }: Props) {
  const checked = useMemo(
    () =>
      assessIdeaSet(ideas, {
        castCount: options.characterIds.length,
        lipSyncEnabled: options.lipSync,
        lipSyncSpeakers: options.lipSyncSpeakers,
        totalDurationSeconds: options.duration,
      }),
    [ideas, options],
  );

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <Button variant="ghost" size="sm" onClick={onBack}>
          <ArrowLeft className="mr-2 h-4 w-4" /> Briefing ändern
        </Button>
        <Badge variant="outline" className="border-primary/30">
          {checked.length} Ideen · alle produzierbar
        </Badge>
      </div>

      {/* ----------------------------------------------------------- strategy */}
      <Card className="border-primary/20 bg-card/60 p-6 backdrop-blur">
        <div className="mb-4 flex items-center gap-3">
          <div className="rounded-xl bg-primary/10 p-2.5">
            <Target className="h-5 w-5 text-primary" />
          </div>
          <div>
            <h3 className="font-serif text-lg">Die Strategie dahinter</h3>
            <p className="text-sm text-muted-foreground">
              Alle fünf Ideen zahlen auf dieselbe Position ein — nur der Weg dorthin ist verschieden.
            </p>
          </div>
        </div>

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <StrategyCell label="Zielgruppe" value={strategy.audience} />
          <StrategyCell label="Der Nutzen" value={strategy.benefit} />
          <StrategyCell label="Das Kaufhemmnis" value={strategy.objection} />
          <StrategyCell label="Tonalität" value={strategy.tone} />
          <StrategyCell label="Nach 3 Sekunden denkt der Zuschauer" value={strategy.threeSecondThought} />
          <StrategyCell label="Das bleibt hängen" value={strategy.takeaway} />
        </div>
      </Card>

      {/* -------------------------------------------------------------- ideas */}
      <div className="grid gap-5 lg:grid-cols-2">
        {checked.map((idea) => {
          const angle = NARRATIVE_ANGLES.find((a) => a.id === idea.angle);
          const totalSeconds = idea.beats.reduce((acc, b) => acc + b.seconds, 0);
          const cost = estimateProductionCost({
            sceneCount: idea.beats.length,
            totalDurationSeconds: totalSeconds,
            voiceoverEnabled: options.voiceover,
            lipSyncEnabled: options.lipSync,
            lipSyncSpeakers: options.lipSyncSpeakers,
            speakingSeconds: options.lipSync ? (idea.speakingScenes || 1) * 4 : 0,
          });

          return (
            <Card
              key={idea.index}
              className="flex flex-col border-border/60 bg-card/60 p-6 backdrop-blur transition-colors hover:border-primary/40"
            >
              <div className="mb-3 flex items-start justify-between gap-3">
                <div>
                  {angle && (
                    <Badge variant="secondary" className="mb-2 text-[11px] font-normal">
                      {angle.label}
                    </Badge>
                  )}
                  <h3 className="font-serif text-xl leading-tight">{idea.title}</h3>
                </div>
                <FeasibilityBadge score={idea.feasibilityScore ?? 100} />
              </div>

              <p className="text-sm italic text-primary/90">„{idea.hook}“</p>
              <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{idea.logline}</p>

              <Separator className="my-4" />

              <ol className="space-y-2">
                {idea.beats.map((beat, i) => (
                  <li key={i} className="flex gap-3 text-sm">
                    <span className="mt-0.5 w-20 shrink-0 text-xs uppercase tracking-wide text-muted-foreground">
                      {BEAT_LABEL[beat.beat] ?? beat.beat}
                    </span>
                    <span className="flex-1 leading-snug">{beat.description}</span>
                    <span className="shrink-0 text-xs text-muted-foreground">
                      {beat.seconds.toFixed(1)}s
                    </span>
                  </li>
                ))}
              </ol>

              <div className="mt-4 rounded-lg bg-background/40 p-3">
                <p className="text-xs leading-relaxed text-muted-foreground">
                  <span className="font-medium text-foreground">Bildwelt: </span>
                  {idea.visualWorld}
                </p>
                <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
                  <span className="font-medium text-foreground">Warum das wirkt: </span>
                  {idea.rationale}
                </p>
              </div>

              {idea.feasibilityNotes && idea.feasibilityNotes.length > 0 && (
                <ul className="mt-3 space-y-1">
                  {idea.feasibilityNotes.map((note, i) => (
                    <li key={i} className="flex items-start gap-1.5 text-[11px] text-muted-foreground">
                      <Info className="mt-0.5 h-3 w-3 shrink-0" /> {note}
                    </li>
                  ))}
                </ul>
              )}

              <div className="mt-auto pt-5">
                <div className="mb-3 flex items-center justify-between text-sm">
                  <span className="flex items-center gap-1.5 text-muted-foreground">
                    <Clock className="h-3.5 w-3.5" /> {Math.round(totalSeconds)}s · {idea.beats.length} Szenen
                  </span>
                  <span className="font-medium">
                    ca. {cost.totalCredits} Cr · {formatEuro(cost.totalEuros)}
                  </span>
                </div>

                {needsChapterMode(totalSeconds) && (
                  <p className="mb-3 text-[11px] text-amber-500">
                    Langformat — wir produzieren in Kapiteln und schneiden sie am Ende zusammen.
                  </p>
                )}

                <Button className="w-full" onClick={() => onSelect(idea)}>
                  <Clapperboard className="mr-2 h-4 w-4" /> Diese Idee umsetzen
                </Button>
              </div>
            </Card>
          );
        })}
      </div>

      <p className="flex items-center justify-center gap-2 text-xs text-muted-foreground">
        <Sparkles className="h-3.5 w-3.5" />
        Nach der Auswahl entsteht das Storyboard. Produziert wird erst, wenn du es freigibst.
      </p>
    </div>
  );
}

function StrategyCell({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-border/50 bg-background/30 p-3">
      <p className="text-[11px] uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="mt-1 text-sm leading-snug">{value}</p>
    </div>
  );
}

function FeasibilityBadge({ score }: { score: number }) {
  const tone =
    score >= 85
      ? 'border-emerald-500/40 text-emerald-500'
      : score >= 65
        ? 'border-amber-500/40 text-amber-500'
        : 'border-destructive/40 text-destructive';
  return (
    <Badge variant="outline" className={cn('shrink-0 gap-1 whitespace-nowrap', tone)}>
      <CheckCircle2 className="h-3 w-3" /> {score}% umsetzbar
    </Badge>
  );
}
