import { useEffect, useMemo, useRef, useState } from 'react';
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
import { Switch } from '@/components/ui/switch';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  ArrowRight,
  ChevronLeft,
  Loader2,
  Mic2,
  Palette,
  Sparkles,
  Wand2,
  Check,
  Layers,
  Scissors,
} from 'lucide-react';
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
import { getTonalityVoice } from '@/config/adTonalityVoiceMap';
import { buildAdScenes } from '@/lib/adDirector/buildAdScenes';
import { useActiveBrandKit } from '@/hooks/useActiveBrandKit';
import type {
  ComposerScene,
  ComposerBriefing,
  VoiceoverConfig,
} from '@/types/video-composer';
import AdComplianceDisclaimer from './AdComplianceDisclaimer';

type Lang = 'de' | 'en' | 'es';

interface AdDirectorWizardProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  language?: string;
  /** Current composer project id — needed for voiceover storage path. Optional;
   *  when missing we fall back to a synthetic id. */
  projectId?: string;
  onScenesGenerated: (payload: {
    scenes: ComposerScene[];
    briefingPatch: Partial<ComposerBriefing>;
    title: string;
    voiceover?: VoiceoverConfig;
    adMeta: {
      framework: AdFrameworkId;
      tonality: AdTonalityId;
      format: AdFormatId;
      goal: AdGoalId;
      brandKitApplied: boolean;
      variantStrategy?: string;
      complianceAcknowledgedAt: string;
      // Stufe 2b — campaign scaling
      renderAllVariants: boolean;
      cutdowns: Array<'15s' | '6s-hook'>;
      autoLogoEndcard: boolean;
      allVariantScripts?: Array<{ id: string; lines: string[] }>;
      // Stage A — multi-aspect bundling
      aspectRatios?: Array<'16:9' | '9:16' | '1:1' | '4:5'>;
    };
  }) => void;
}

type Step = 'format' | 'framework' | 'tonality' | 'briefing' | 'variants' | 'scaling' | 'compliance';

const STEPS: Step[] = [
  'format',
  'framework',
  'tonality',
  'briefing',
  'variants',
  'scaling',
  'compliance',
];

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

interface ScriptVariant {
  id: string;
  label: string;
  lines: string[];
  error?: string | null;
}

const VARIANT_LABELS: Record<string, { de: string; en: string; es: string; desc: { de: string; en: string; es: string } }> = {
  emotional: {
    de: 'Emotional Hook',
    en: 'Emotional Hook',
    es: 'Gancho Emocional',
    desc: {
      de: 'Pathos. Menschliche Wahrheit zuerst.',
      en: 'Pathos. Human truth first.',
      es: 'Pathos. Verdad humana primero.',
    },
  },
  rational: {
    de: 'Rational / Benefit',
    en: 'Rational / Benefit',
    es: 'Racional / Beneficio',
    desc: {
      de: 'Klarer Nutzen. Beweise. Zahlen.',
      en: 'Clear benefit. Proof. Numbers.',
      es: 'Beneficio claro. Pruebas. Cifras.',
    },
  },
  curiosity: {
    de: 'Curiosity Gap',
    en: 'Curiosity Gap',
    es: 'Brecha de Curiosidad',
    desc: {
      de: 'Unerwartet. Widerspruch. Fragezeichen.',
      en: 'Unexpected. Contradiction. Question mark.',
      es: 'Inesperado. Contradicción. Interrogante.',
    },
  },
};

export default function AdDirectorWizard({
  open,
  onOpenChange,
  language = 'de',
  projectId,
  onScenesGenerated,
}: AdDirectorWizardProps) {
  const lang = (['de', 'en', 'es'].includes(language) ? language : 'de') as Lang;
  const { data: activeBrandKit } = useActiveBrandKit();

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

  // Stage 2 toggles
  const [useBrandKit, setUseBrandKit] = useState(true);
  const [autoVoiceover, setAutoVoiceover] = useState(true);

  // Stage 2b — Campaign Scaling
  const [autoLogoEndcard, setAutoLogoEndcard] = useState(true);
  const [renderAllVariants, setRenderAllVariants] = useState(false);
  const [cutdown15s, setCutdown15s] = useState(false);
  const [cutdown6sHook, setCutdown6sHook] = useState(false);

  // Stage A — Multi-Aspect-Bundling
  const [aspect9x16, setAspect9x16] = useState(false);
  const [aspect1x1, setAspect1x1] = useState(false);
  const [aspect4x5, setAspect4x5] = useState(false);

  // Variant flow state
  const [variantsLoading, setVariantsLoading] = useState(false);
  const [variants, setVariants] = useState<ScriptVariant[] | null>(null);
  const [chosenVariantId, setChosenVariantId] = useState<string | null>(null);

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
    setUseBrandKit(true);
    setAutoVoiceover(true);
    setAutoLogoEndcard(true);
    setRenderAllVariants(false);
    setCutdown15s(false);
    setCutdown6sHook(false);
    setAspect9x16(false);
    setAspect1x1(false);
    setAspect4x5(false);
    setVariants(null);
    setChosenVariantId(null);
    setVariantsLoading(false);
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
      case 'variants':
        return !!chosenVariantId && !!variants?.length;
      case 'scaling':
        return true;
      case 'compliance':
        return acknowledged;
    }
  };

  const fetchVariants = async () => {
    setVariantsLoading(true);
    setVariants(null);
    setChosenVariantId(null);
    const uspList = usps
      .split('\n')
      .map((u) => u.trim())
      .filter(Boolean);
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
          generateVariants: true,
          brandName: useBrandKit ? activeBrandKit?.brand_name ?? '' : '',
        },
      });
      if (error) throw error;
      const vs = (data?.variants ?? []) as ScriptVariant[];
      const okVariants = vs.filter((v) => v.lines.length > 0);
      if (!okVariants.length) {
        toast({
          title: 'Skript-Generator nicht verfügbar',
          description: 'Du kannst den Spot ohne Voiceover-Text fortsetzen.',
        });
        // Synthetic empty variant so the flow continues.
        const fallback: ScriptVariant = {
          id: 'manual',
          label: 'Manuell',
          lines: [],
        };
        setVariants([fallback]);
        setChosenVariantId('manual');
      } else {
        setVariants(okVariants);
        setChosenVariantId(okVariants[0].id);
      }
    } catch (err: any) {
      console.error('[AdDirectorWizard] variants failed:', err);
      toast({
        title: 'Skript-Varianten fehlgeschlagen',
        description: err?.message ?? 'Bitte erneut versuchen.',
        variant: 'destructive',
      });
      const fallback: ScriptVariant = { id: 'manual', label: 'Manuell', lines: [] };
      setVariants([fallback]);
      setChosenVariantId('manual');
    } finally {
      setVariantsLoading(false);
    }
  };

  const goNext = async () => {
    if (!isStepValid(step)) return;
    // When leaving briefing → variants, fetch them eagerly.
    if (step === 'briefing' && !variants) {
      await fetchVariants();
    }
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

      const chosen = variants?.find((v) => v.id === chosenVariantId);
      const scriptLines = chosen?.lines ?? [];

      const brandKitInput =
        useBrandKit && activeBrandKit
          ? {
              brandName: activeBrandKit.brand_name,
              primaryColor: activeBrandKit.primary_color,
              secondaryColor: activeBrandKit.secondary_color,
              accentColor: activeBrandKit.accent_color,
              logoUrl: activeBrandKit.logo_url,
              fontFamily: (activeBrandKit as any).font_family ?? null,
              tagline: (activeBrandKit as any).tagline ?? null,
            }
          : null;

      const built = buildAdScenes({
        frameworkId: framework,
        format,
        goal,
        tonalityId: tonality,
        productName: productName.trim(),
        productDescription: productDescription.trim(),
        scriptLines,
        brandKit: brandKitInput,
        appendLogoEndcard: autoLogoEndcard && !!brandKitInput?.logoUrl,
      });

      // Voiceover Auto-Synth (best-effort)
      let voiceoverConfig: VoiceoverConfig | undefined;
      if (autoVoiceover && scriptLines.length > 0) {
        try {
          const fullScript = scriptLines.filter(Boolean).join('. ').replace(/\.\.+/g, '.').trim();
          const voiceCfg = getTonalityVoice(tonality);
          const voProjectId = projectId || `ad-director-${Date.now()}`;

          const { data: voData, error: voError } = await supabase.functions.invoke(
            'generate-voiceover',
            {
              body: {
                text: fullScript,
                voiceId: voiceCfg.voiceId,
                stability: voiceCfg.stability,
                similarityBoost: voiceCfg.similarityBoost,
                style: voiceCfg.style,
                useSpeakerBoost: voiceCfg.useSpeakerBoost,
                speed: voiceCfg.speed,
                projectId: voProjectId,
              },
            },
          );
          if (voError) throw voError;
          if (voData?.audioUrl) {
            voiceoverConfig = {
              enabled: true,
              voiceId: voData.voiceId || voiceCfg.voiceId,
              voiceName: voData.voiceUsed || voiceCfg.voiceLabel,
              script: fullScript,
              audioUrl: voData.audioUrl,
              speed: voiceCfg.speed,
              stability: voiceCfg.stability,
              similarityBoost: voiceCfg.similarityBoost,
              styleExaggeration: voiceCfg.style,
              useSpeakerBoost: voiceCfg.useSpeakerBoost,
              durationSeconds: voData.duration,
            };
          }
        } catch (voErr: any) {
          console.warn('[AdDirectorWizard] voiceover synth failed:', voErr);
          toast({
            title: 'Voiceover nicht erstellt',
            description:
              'Die Szenen wurden erzeugt — du kannst den Voiceover im Studio nachträglich generieren.',
          });
        }
      }

      onScenesGenerated({
        scenes: built.scenes,
        title: `${productName.trim()} — ${format.toUpperCase()}`,
        voiceover: voiceoverConfig,
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
          brandKitApplied: !!brandKitInput,
          variantStrategy: chosenVariantId ?? undefined,
          complianceAcknowledgedAt: new Date().toISOString(),
          renderAllVariants,
          cutdowns: [
            ...(cutdown15s ? (['15s'] as const) : []),
            ...(cutdown6sHook ? (['6s-hook'] as const) : []),
          ],
          autoLogoEndcard: autoLogoEndcard && !!brandKitInput?.logoUrl,
          allVariantScripts: renderAllVariants
            ? variants?.map((v) => ({ id: v.id, lines: v.lines }))
            : undefined,
          aspectRatios: [
            ...(aspect9x16 ? (['9:16'] as const) : []),
            ...(aspect1x1 ? (['1:1'] as const) : []),
            ...(aspect4x5 ? (['4:5'] as const) : []),
          ],
        },
      });

      toast({
        title: 'Ad Director erstellt',
        description: `${built.scenes.length} Szenen · ${Math.round(built.totalDurationSec)}s${
          voiceoverConfig ? ' · Voiceover ✓' : ''
        }${brandKitInput ? ' · Brand-Kit ✓' : ''}`,
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
              Stage 2
            </Badge>
          </DialogTitle>
          <DialogDescription>
            Professionelle TVC- und Long-Form-Werbespots mit Brand-Kit, A/B-Varianten und Auto-Voiceover.
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

        <ScrollArea className="flex-1 min-h-0 pr-2">
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

                {/* Stage 2 — Brand Kit + Voiceover toggles */}
                <div className="rounded-lg border border-border/40 bg-card/50 p-4 space-y-3">
                  <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    Stage 2 Optionen
                  </p>

                  <div className="flex items-start gap-3">
                    <Palette className="h-4 w-4 mt-0.5 text-primary shrink-0" />
                    <div className="flex-1">
                      <div className="flex items-center justify-between gap-3">
                        <Label htmlFor="ad-brandkit" className="cursor-pointer">
                          Brand-Kit verwenden
                        </Label>
                        <Switch
                          id="ad-brandkit"
                          checked={useBrandKit && !!activeBrandKit}
                          disabled={!activeBrandKit}
                          onCheckedChange={setUseBrandKit}
                        />
                      </div>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        {activeBrandKit
                          ? `Aktives Kit: ${activeBrandKit.brand_name ?? 'Unbenannt'} — Farben & Brand-Name werden in CTA + Hooks gewoben.`
                          : 'Kein aktives Brand-Kit gefunden. Erstelle eins unter Brand Kit, um es hier nutzen zu können.'}
                      </p>
                      {activeBrandKit && useBrandKit && (
                        <div className="flex items-center gap-1.5 mt-2">
                          {[
                            activeBrandKit.primary_color,
                            activeBrandKit.secondary_color,
                            activeBrandKit.accent_color,
                          ]
                            .filter(Boolean)
                            .map((c, i) => (
                              <span
                                key={i}
                                className="h-4 w-4 rounded-full border border-border/60"
                                style={{ backgroundColor: c as string }}
                                title={c as string}
                              />
                            ))}
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="flex items-start gap-3 pt-1 border-t border-border/40">
                    <Mic2 className="h-4 w-4 mt-3 text-primary shrink-0" />
                    <div className="flex-1 pt-2">
                      <div className="flex items-center justify-between gap-3">
                        <Label htmlFor="ad-vo" className="cursor-pointer">
                          Voiceover automatisch generieren
                        </Label>
                        <Switch
                          id="ad-vo"
                          checked={autoVoiceover}
                          onCheckedChange={setAutoVoiceover}
                        />
                      </div>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        Stimme passend zur Tonalität:{' '}
                        <span className="text-foreground font-medium">
                          {getTonalityVoice(tonality).voiceLabel}
                        </span>{' '}
                        (ElevenLabs).
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {step === 'variants' && (
              <div className="space-y-4">
                <h3 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
                  A/B Skript-Varianten
                </h3>
                <p className="text-xs text-muted-foreground">
                  Wähle die Variante, die am besten zu deinem Spot passt — alle drei nutzen dieselbe Tonalität, aber unterschiedliche Hook-Strategien.
                </p>

                {variantsLoading && (
                  <div className="flex items-center gap-2 text-sm text-muted-foreground py-8 justify-center">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Generiere 3 Varianten parallel…
                  </div>
                )}

                {!variantsLoading && variants && (
                  <div className="space-y-2">
                    {variants.map((v) => {
                      const meta = VARIANT_LABELS[v.id];
                      const selected = chosenVariantId === v.id;
                      return (
                        <Card
                          key={v.id}
                          onClick={() => setChosenVariantId(v.id)}
                          className={cn(
                            'p-4 cursor-pointer transition-all hover:border-primary/60',
                            selected && 'border-primary ring-1 ring-primary/40 bg-primary/5',
                          )}
                        >
                          <div className="flex items-start justify-between gap-2 mb-2">
                            <div>
                              <p className="font-semibold text-sm">
                                {meta?.[lang] ?? v.label}
                              </p>
                              {meta?.desc?.[lang] && (
                                <p className="text-[11px] text-muted-foreground">
                                  {meta.desc[lang]}
                                </p>
                              )}
                            </div>
                            {selected && (
                              <Check className="h-4 w-4 text-primary shrink-0" />
                            )}
                          </div>
                          {v.lines.length > 0 ? (
                            <ol className="space-y-1 text-xs text-foreground/80 list-decimal list-inside">
                              {v.lines.map((line, i) => (
                                <li key={i} className="leading-snug">
                                  {line || <span className="text-muted-foreground italic">—</span>}
                                </li>
                              ))}
                            </ol>
                          ) : (
                            <p className="text-xs text-muted-foreground italic">
                              Keine Skript-Zeilen — Spot wird ohne Voiceover-Text erstellt.
                            </p>
                          )}
                        </Card>
                      );
                    })}
                  </div>
                )}

                {!variantsLoading && variants && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={fetchVariants}
                    className="w-full"
                  >
                    <Wand2 className="h-3.5 w-3.5 mr-2" />
                    Neu generieren
                  </Button>
                )}
              </div>
            )}

            {step === 'scaling' && (
              <div className="space-y-5">
                <h3 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
                  Kampagnen-Skalierung
                </h3>
                <p className="text-xs text-muted-foreground">
                  Optional — vervielfache deinen Spot in Cutdowns oder allen drei Skript-Varianten.
                </p>

                <div className="rounded-lg border border-border/40 bg-card/50 p-4">
                  <div className="flex items-start gap-3">
                    <Layers className="h-4 w-4 mt-0.5 text-primary shrink-0" />
                    <div className="flex-1">
                      <div className="flex items-center justify-between gap-3">
                        <Label htmlFor="ad-multi-variant" className="cursor-pointer">
                          Alle 3 A/B-Varianten rendern
                        </Label>
                        <Switch
                          id="ad-multi-variant"
                          checked={renderAllVariants}
                          disabled={!variants || variants.length < 2}
                          onCheckedChange={setRenderAllVariants}
                        />
                      </div>
                      <p className="text-xs text-muted-foreground mt-1">
                        Erzeugt drei Renders (Emotional / Rational / Curiosity). Voller AI-Cost × 3.
                      </p>
                    </div>
                  </div>
                </div>

                <div className="rounded-lg border border-border/40 bg-card/50 p-4 space-y-3">
                  <div className="flex items-start gap-3">
                    <Scissors className="h-4 w-4 mt-0.5 text-primary shrink-0" />
                    <div className="flex-1 space-y-3">
                      <p className="text-sm font-medium">Cutdowns aus dem Master</p>
                      <div className="flex items-center justify-between gap-3">
                        <Label htmlFor="cd-15s" className="cursor-pointer text-sm">+ 15-Sekunden-Cutdown</Label>
                        <Switch id="cd-15s" checked={cutdown15s} onCheckedChange={setCutdown15s} />
                      </div>
                      <div className="flex items-center justify-between gap-3">
                        <Label htmlFor="cd-6s" className="cursor-pointer text-sm">+ 6-Sekunden-Hook (Reels)</Label>
                        <Switch id="cd-6s" checked={cutdown6sHook} onCheckedChange={setCutdown6sHook} />
                      </div>
                      <p className="text-xs text-muted-foreground">
                        Cutdowns recyceln die Master-Clips — kein zusätzlicher AI-Cost.
                      </p>
                    </div>
                  </div>
                </div>


                <div className="rounded-lg border border-border/40 bg-card/50 p-4 space-y-3">
                  <div className="flex items-start gap-3">
                    <Layers className="h-4 w-4 mt-0.5 text-primary shrink-0" />
                    <div className="flex-1 space-y-3">
                      <p className="text-sm font-medium">Multi-Format-Bundling</p>
                      <div className="flex items-center justify-between gap-3">
                        <Label htmlFor="ar-9x16" className="cursor-pointer text-sm">+ 9:16 (Reels / Shorts / TikTok)</Label>
                        <Switch id="ar-9x16" checked={aspect9x16} onCheckedChange={setAspect9x16} />
                      </div>
                      <div className="flex items-center justify-between gap-3">
                        <Label htmlFor="ar-1x1" className="cursor-pointer text-sm">+ 1:1 (Feed-Quadrat)</Label>
                        <Switch id="ar-1x1" checked={aspect1x1} onCheckedChange={setAspect1x1} />
                      </div>
                      <div className="flex items-center justify-between gap-3">
                        <Label htmlFor="ar-4x5" className="cursor-pointer text-sm">+ 4:5 (Instagram-Portrait)</Label>
                        <Switch id="ar-4x5" checked={aspect4x5} onCheckedChange={setAspect4x5} />
                      </div>
                      <p className="text-xs text-muted-foreground">
                        Klont den Master in Format-Varianten — kein zusätzlicher AI-Cost. Master bleibt 16:9.
                      </p>
                    </div>
                  </div>
                </div>
                <div className="rounded-lg border border-border/40 bg-card/50 p-4">
                  <div className="flex items-start gap-3">
                    <Palette className="h-4 w-4 mt-0.5 text-primary shrink-0" />
                    <div className="flex-1">
                      <div className="flex items-center justify-between gap-3">
                        <Label htmlFor="ad-endcard" className="cursor-pointer">Auto-Logo-Endcard (2s)</Label>
                        <Switch
                          id="ad-endcard"
                          checked={autoLogoEndcard && !!activeBrandKit?.logo_url}
                          disabled={!activeBrandKit?.logo_url}
                          onCheckedChange={setAutoLogoEndcard}
                        />
                      </div>
                      <p className="text-xs text-muted-foreground mt-1">
                        {activeBrandKit?.logo_url
                          ? 'Statische Brand-Endcard mit Logo + Tagline. 0 AI-Credits.'
                          : 'Lade ein Logo in dein Brand-Kit, um dies zu nutzen.'}
                      </p>
                    </div>
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
                    <li>
                      <span className="text-foreground">Variante:</span>{' '}
                      {chosenVariantId
                        ? VARIANT_LABELS[chosenVariantId]?.[lang] ?? chosenVariantId
                        : '—'}
                    </li>
                    <li>
                      <span className="text-foreground">Brand-Kit:</span>{' '}
                      {useBrandKit && activeBrandKit
                        ? `✓ ${activeBrandKit.brand_name ?? 'aktiv'}`
                        : '—'}
                    </li>
                    <li>
                      <span className="text-foreground">Voiceover:</span>{' '}
                      {autoVoiceover
                        ? `✓ ${getTonalityVoice(tonality).voiceLabel}`
                        : '—'}
                    </li>
                    <li>
                      <span className="text-foreground">Endcard:</span>{' '}
                      {autoLogoEndcard && activeBrandKit?.logo_url ? '✓ Auto-Logo' : '—'}
                    </li>
                    <li>
                      <span className="text-foreground">A/B-Renders:</span>{' '}
                      {renderAllVariants ? '✓ Alle 3 Varianten' : '1 Variante'}
                    </li>
                    <li>
                      <span className="text-foreground">Cutdowns:</span>{' '}
                      {[cutdown15s && '15s', cutdown6sHook && '6s-Hook'].filter(Boolean).join(', ') || '—'}
                    </li>
                    <li>
                      <span className="text-foreground">Multi-Format:</span>{' '}
                      {[aspect9x16 && '9:16', aspect1x1 && '1:1', aspect4x5 && '4:5'].filter(Boolean).join(', ') || '—'}
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
            disabled={!canBack || generating || variantsLoading}
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
              disabled={!isStepValid(step) || variantsLoading}
              className="gap-2"
            >
              {variantsLoading && step === 'briefing' ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <>
                  Weiter
                  <ArrowRight className="h-4 w-4" />
                </>
              )}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
