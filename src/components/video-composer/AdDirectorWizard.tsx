import { useMemo, useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { ArrowRight, ChevronLeft, Loader2, Sparkles, Wand2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { toast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import {
  AD_STORY_FRAMEWORKS,
  type AdFrameworkId,
  type AdFormatId,
  type AdGoalId,
} from '@/config/adStoryFrameworks';
import { AD_TONALITY_PROFILES, type AdTonalityId } from '@/config/adTonalityProfiles';
import { buildAdScenes } from '@/lib/adDirector/buildAdScenes';
import type { ComposerScene, ComposerBriefing } from '@/types/video-composer';
import AdComplianceDisclaimer from './AdComplianceDisclaimer';

type Lang = 'de' | 'en' | 'es';

interface AdDirectorWizardProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  language?: string;
  onScenesGenerated: (payload: {
    scenes: ComposerScene[];
    briefingPatch: Partial<ComposerBriefing>;
    title: string;
    adMeta: {
      framework: AdFrameworkId;
      tonality: AdTonalityId;
      format: AdFormatId;
      goal: AdGoalId;
      complianceAcknowledgedAt: string;
    };
  }) => void;
}

type Step = 'format' | 'framework' | 'tonality' | 'briefing' | 'compliance';

const STEPS: Step[] = ['format', 'framework', 'tonality', 'briefing', 'compliance'];

const FORMATS: Array<{ id: AdFormatId; label: string; desc: string; sec: number }> = [
  { id: 'tvc-15', label: 'TVC 15s', desc: 'Reels / Pre-Roll', sec: 15 },
  { id: 'tvc-30', label: 'TVC 30s', desc: 'Standard TV / Online', sec: 30 },
  { id: 'tvc-60', label: 'TVC 60s', desc: 'Cinema / Brand Spot', sec: 60 },
  { id: 'longform', label: 'Long-Form 90s', desc: 'Branded Content', sec: 90 },
];

const GOALS: Array<{ id: AdGoalId; label: { de: string; en: string; es: string } }> = [
  { id: 'awareness', label: { de: 'Awareness', en: 'Awareness', es: 'Notoriedad' } },
  { id: 'conversion', label: { de: 'Conversion', en: 'Conversion', es: 'Conversión' } },
  { id: 'brand-build', label: { de: 'Brand Building', en: 'Brand Building', es: 'Construcción de Marca' } },
  { id: 'launch', label: { de: 'Launch', en: 'Launch', es: 'Lanzamiento' } },
];

export default function AdDirectorWizard({
  open,
  onOpenChange,
  language = 'de',
  onScenesGenerated,
}: AdDirectorWizardProps) {
  const lang = (['de', 'en', 'es'].includes(language) ? language : 'de') as Lang;

  const [step, setStep] = useState<Step>('format');
  const [format, setFormat] = useState<AdFormatId>('tvc-30');
  const [goal, setGoal] = useState<AdGoalId>('conversion');
  const [framework, setFramework] = useState<AdFrameworkId>('problem-solution');
  const [tonality, setTonality] = useState<AdTonalityId>('minimal-premium');
  const [productName, setProductName] = useState('');
  const [productDescription, setProductDescription] = useState('');
  const [usps, setUsps] = useState('');
  const [targetAudience, setTargetAudience] = useState('');
  const [acknowledged, setAcknowledged] = useState(false);
  const [generating, setGenerating] = useState(false);

  const stepIdx = STEPS.indexOf(step);
  const canBack = stepIdx > 0;
  const canNext = stepIdx < STEPS.length - 1;

  const tonalityProfile = useMemo(
    () => AD_TONALITY_PROFILES.find((t) => t.id === tonality)!,
    [tonality],
  );

  const reset = () => {
    setStep('format');
    setFormat('tvc-30');
    setGoal('conversion');
    setFramework('problem-solution');
    setTonality('minimal-premium');
    setProductName('');
    setProductDescription('');
    setUsps('');
    setTargetAudience('');
    setAcknowledged(false);
    setGenerating(false);
  };

  const handleClose = (next: boolean) => {
    if (!next) reset();
    onOpenChange(next);
  };

  const isStepValid = (s: Step): boolean => {
    switch (s) {
      case 'format':
        return !!format && !!goal;
      case 'framework':
        return !!framework;
      case 'tonality':
        return !!tonality;
      case 'briefing':
        return productName.trim().length > 0 && productDescription.trim().length > 0;
      case 'compliance':
        return acknowledged;
    }
  };

  const goNext = () => {
    if (!isStepValid(step)) return;
    if (canNext) setStep(STEPS[stepIdx + 1]);
  };

  const goBack = () => {
    if (canBack) setStep(STEPS[stepIdx - 1]);
  };

  const handleGenerate = async () => {
    if (!isStepValid('compliance')) return;
    setGenerating(true);
    try {
      const uspList = usps
        .split('\n')
        .map((u) => u.trim())
        .filter(Boolean);

      // 1. Ask the edge function for scripted lines per beat (best-effort).
      let scriptLines: string[] = [];
      try {
        const { data, error } = await supabase.functions.invoke('generate-ad-script', {
          body: {
            frameworkId: framework,
            tonalityId: tonality,
            format,
            goal,
            language: lang,
            productName: productName.trim(),
            productDescription: productDescription.trim(),
            usps: uspList,
            targetAudience: targetAudience.trim(),
          },
        });
        if (error) throw error;
        if (Array.isArray(data?.lines)) scriptLines = data.lines as string[];
      } catch (err) {
        console.warn('[AdDirectorWizard] script generation failed, falling back to empty lines:', err);
        toast({
          title: 'Skript-Generator nicht verfügbar',
          description: 'Szenen werden ohne Voiceover-Text erstellt — du kannst sie im Studio ergänzen.',
        });
      }

      // 2. Build ComposerScene[] from framework + templates + scripts.
      const built = buildAdScenes({
        frameworkId: framework,
        format,
        goal,
        tonalityId: tonality,
        productName: productName.trim(),
        productDescription: productDescription.trim(),
        scriptLines,
      });

      onScenesGenerated({
        scenes: built.scenes,
        title: `${productName.trim()} — ${format.toUpperCase()}`,
        briefingPatch: {
          productName: productName.trim(),
          productDescription: productDescription.trim(),
          usps: uspList,
          targetAudience: targetAudience.trim(),
          duration: built.totalDurationSec,
          aspectRatio: '16:9',
        },
        adMeta: {
          framework,
          tonality,
          format,
          goal,
          complianceAcknowledgedAt: new Date().toISOString(),
        },
      });

      toast({
        title: 'Ad Director erstellt',
        description: `${built.scenes.length} Szenen · ${Math.round(built.totalDurationSec)}s · ${tonalityProfile.label[lang]}`,
      });
      handleClose(false);
    } catch (err: any) {
      console.error('[AdDirectorWizard] generation failed:', err);
      toast({
        title: 'Erstellung fehlgeschlagen',
        description: err?.message ?? 'Bitte erneut versuchen.',
        variant: 'destructive',
      });
    } finally {
      setGenerating(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-xl">
            <Sparkles className="h-5 w-5 text-primary" />
            Ad Director Mode
            <Badge variant="outline" className="ml-2 text-[10px] uppercase tracking-wider">
              Stage 1
            </Badge>
          </DialogTitle>
          <DialogDescription>
            Professionelle TVC- und Long-Form-Werbespots in 5 Schritten.
          </DialogDescription>
        </DialogHeader>

        {/* Step indicator */}
        <div className="flex items-center gap-2 px-1 pb-2">
          {STEPS.map((s, i) => (
            <div
              key={s}
              className={cn(
                'h-1 flex-1 rounded-full transition-colors',
                i <= stepIdx ? 'bg-primary' : 'bg-muted',
              )}
            />
          ))}
        </div>

        <ScrollArea className="flex-1 pr-2">
          <div className="space-y-6 pb-2">
            {step === 'format' && (
              <div className="space-y-4">
                <h3 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
                  Format & Ziel
                </h3>
                <div className="grid grid-cols-2 gap-3">
                  {FORMATS.map((f) => (
                    <Card
                      key={f.id}
                      onClick={() => setFormat(f.id)}
                      className={cn(
                        'p-4 cursor-pointer transition-all hover:border-primary/60',
                        format === f.id && 'border-primary ring-1 ring-primary/40 bg-primary/5',
                      )}
                    >
                      <p className="font-semibold">{f.label}</p>
                      <p className="text-xs text-muted-foreground mt-1">{f.desc}</p>
                    </Card>
                  ))}
                </div>

                <div className="space-y-2 pt-2">
                  <Label className="text-xs uppercase tracking-wider text-muted-foreground">
                    Kampagnenziel
                  </Label>
                  <div className="flex flex-wrap gap-2">
                    {GOALS.map((g) => (
                      <Button
                        key={g.id}
                        type="button"
                        variant={goal === g.id ? 'default' : 'outline'}
                        size="sm"
                        onClick={() => setGoal(g.id)}
                      >
                        {g.label[lang]}
                      </Button>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {step === 'framework' && (
              <div className="space-y-4">
                <h3 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
                  Story-Framework
                </h3>
                <div className="space-y-2">
                  {AD_STORY_FRAMEWORKS.filter(
                    (f) => f.bestFormats.includes(format) || f.bestGoals.includes(goal),
                  )
                    .concat(
                      AD_STORY_FRAMEWORKS.filter(
                        (f) =>
                          !f.bestFormats.includes(format) && !f.bestGoals.includes(goal),
                      ),
                    )
                    .map((f) => {
                      const recommended =
                        f.bestFormats.includes(format) && f.bestGoals.includes(goal);
                      return (
                        <Card
                          key={f.id}
                          onClick={() => setFramework(f.id)}
                          className={cn(
                            'p-3 cursor-pointer flex items-start gap-3 transition-all hover:border-primary/60',
                            framework === f.id &&
                              'border-primary ring-1 ring-primary/40 bg-primary/5',
                          )}
                        >
                          <span className="text-2xl leading-none">{f.glyph}</span>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              <p className="font-medium">{f.label[lang]}</p>
                              {recommended && (
                                <Badge variant="secondary" className="text-[10px]">
                                  Empfohlen
                                </Badge>
                              )}
                              <Badge variant="outline" className="text-[10px]">
                                {f.beats.length} Beats
                              </Badge>
                            </div>
                            <p className="text-xs text-muted-foreground mt-0.5">
                              {f.desc[lang]}
                            </p>
                          </div>
                        </Card>
                      );
                    })}
                </div>
              </div>
            )}

            {step === 'tonality' && (
              <div className="space-y-4">
                <h3 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
                  Tonalität
                </h3>
                <p className="text-xs text-muted-foreground">
                  Sprachliche Profile basierend auf Werbetheorie — keine geschützten Markennamen.
                </p>
                <div className="grid grid-cols-2 gap-2">
                  {AD_TONALITY_PROFILES.map((t) => (
                    <Card
                      key={t.id}
                      onClick={() => setTonality(t.id)}
                      className={cn(
                        'p-3 cursor-pointer flex items-start gap-2 transition-all hover:border-primary/60',
                        tonality === t.id &&
                          'border-primary ring-1 ring-primary/40 bg-primary/5',
                      )}
                    >
                      <span className="text-xl leading-none">{t.glyph}</span>
                      <div className="min-w-0">
                        <p className="text-sm font-medium truncate">{t.label[lang]}</p>
                        <p className="text-[11px] text-muted-foreground line-clamp-2">
                          {t.shortDesc[lang]}
                        </p>
                      </div>
                    </Card>
                  ))}
                </div>
              </div>
            )}

            {step === 'briefing' && (
              <div className="space-y-4">
                <h3 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
                  Briefing
                </h3>
                <div className="space-y-3">
                  <div className="space-y-1.5">
                    <Label htmlFor="ad-product-name">Produkt / Service*</Label>
                    <Input
                      id="ad-product-name"
                      value={productName}
                      onChange={(e) => setProductName(e.target.value)}
                      placeholder="z. B. Aurora Skincare Serum"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="ad-product-desc">Kurzbeschreibung*</Label>
                    <Textarea
                      id="ad-product-desc"
                      value={productDescription}
                      onChange={(e) => setProductDescription(e.target.value)}
                      placeholder="Was ist es, für wen, was macht es besonders?"
                      rows={3}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="ad-usps">USPs (eine pro Zeile)</Label>
                    <Textarea
                      id="ad-usps"
                      value={usps}
                      onChange={(e) => setUsps(e.target.value)}
                      placeholder={'48h Hydration\nVegan & cruelty-free\nKlinisch getestet'}
                      rows={3}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="ad-audience">Zielgruppe</Label>
                    <Input
                      id="ad-audience"
                      value={targetAudience}
                      onChange={(e) => setTargetAudience(e.target.value)}
                      placeholder="z. B. urbane Frauen, 28–42, qualitätsbewusst"
                    />
                  </div>
                </div>
              </div>
            )}

            {step === 'compliance' && (
              <div className="space-y-4">
                <h3 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
                  Compliance & Bestätigung
                </h3>
                <AdComplianceDisclaimer
                  acknowledged={acknowledged}
                  onAcknowledge={setAcknowledged}
                  language={lang}
                />
                <div className="rounded-lg border border-border/40 bg-card/50 p-4 space-y-2 text-sm">
                  <p className="font-medium">Zusammenfassung</p>
                  <ul className="text-xs text-muted-foreground space-y-1">
                    <li>
                      <span className="text-foreground">Format:</span>{' '}
                      {FORMATS.find((f) => f.id === format)?.label}
                    </li>
                    <li>
                      <span className="text-foreground">Ziel:</span>{' '}
                      {GOALS.find((g) => g.id === goal)?.label[lang]}
                    </li>
                    <li>
                      <span className="text-foreground">Framework:</span>{' '}
                      {AD_STORY_FRAMEWORKS.find((f) => f.id === framework)?.label[lang]}
                    </li>
                    <li>
                      <span className="text-foreground">Tonalität:</span>{' '}
                      {tonalityProfile.label[lang]}
                    </li>
                    <li>
                      <span className="text-foreground">Produkt:</span> {productName || '—'}
                    </li>
                  </ul>
                </div>
              </div>
            )}
          </div>
        </ScrollArea>

        <DialogFooter className="flex items-center justify-between gap-2 sm:justify-between">
          <Button
            type="button"
            variant="ghost"
            onClick={goBack}
            disabled={!canBack || generating}
          >
            <ChevronLeft className="h-4 w-4 mr-1" />
            Zurück
          </Button>
          {step === 'compliance' ? (
            <Button
              type="button"
              onClick={handleGenerate}
              disabled={!isStepValid('compliance') || generating}
              className="gap-2"
            >
              {generating ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Wand2 className="h-4 w-4" />
              )}
              Spot generieren
            </Button>
          ) : (
            <Button
              type="button"
              onClick={goNext}
              disabled={!isStepValid(step)}
              className="gap-2"
            >
              Weiter
              <ArrowRight className="h-4 w-4" />
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
