import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import { Slider } from '@/components/ui/slider';
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  ShoppingBag, Building2, BookOpen, Palette,
  Wand2, Hand, Plus, X, ArrowRight, Loader2, Sparkles, ShieldAlert, ChevronDown, ChevronUp,
} from 'lucide-react';
import { toast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { useTranslation } from '@/hooks/useTranslation';
import type {
  ComposerBriefing,
  ComposerCategory,
  ComposerScene,
  ComposerMode,
  AspectRatio,
  EmotionalTone,
  ClipQuality,
  ComposerVisualStyle,
  ComposerCharacter,
} from '@/types/video-composer';
import { VISUAL_STYLES } from '@/config/composerVisualStyles';
import CharacterManager from './CharacterManager';
import VideoModeSelector from './VideoModeSelector';
import type { VideoMode } from '@/types/video-composer';

const ASPECT_RATIOS: { value: AspectRatio; label: string; desc: string }[] = [
  { value: '16:9', label: '16:9', desc: 'YouTube / Landscape' },
  { value: '9:16', label: '9:16', desc: 'TikTok / Reels / Shorts' },
  { value: '1:1', label: '1:1', desc: 'Instagram Feed' },
  { value: '4:5', label: '4:5', desc: 'Instagram / Facebook' },
];

interface BriefingTabProps {
  briefing: ComposerBriefing;
  category: ComposerCategory;
  title: string;
  language: string;
  onUpdateBriefing: (b: Partial<ComposerBriefing>) => void;
  onUpdateProject: (p: Record<string, any>) => void;
  onGoToStoryboard: () => void;
  onScenesGenerated: (scenes: ComposerScene[]) => void;
}

/**
 * Returns the label/placeholder set for a given category. Keeps the underlying
 * ComposerBriefing fields (`productName`, `productDescription`, `usps`,
 * `targetAudience`) unchanged but re-labels them per category.
 */
function getCategoryConfig(category: ComposerCategory, t: (k: string) => string) {
  switch (category) {
    case 'corporate-ad':
      return {
        cardTitle: t('videoComposer.briefingForCorporate'),
        primaryNameLabel: t('videoComposer.companyNameLabel'),
        primaryNamePlaceholder: t('videoComposer.companyNamePlaceholder'),
        descriptionLabel: t('videoComposer.industryLabel'),
        descriptionPlaceholder: t('videoComposer.industryPlaceholder'),
        listLabel: t('videoComposer.coreMessages'),
        listPlaceholder: t('videoComposer.coreMessagePlaceholder'),
        showAudience: true,
        showList: true,
        showSecondary: false,
        secondaryLabel: '',
        secondaryPlaceholder: '',
        missingPrimaryToast: t('videoComposer.enterCompanyName'),
      };
    case 'storytelling':
      return {
        cardTitle: t('videoComposer.briefingForStorytelling'),
        primaryNameLabel: t('videoComposer.storyTitleLabel'),
        primaryNamePlaceholder: t('videoComposer.storyTitlePlaceholder'),
        descriptionLabel: t('videoComposer.logline'),
        descriptionPlaceholder: t('videoComposer.loglinePlaceholder'),
        listLabel: t('videoComposer.keyScenes'),
        listPlaceholder: t('videoComposer.keyScenePlaceholder'),
        showAudience: true,
        showList: true,
        showSecondary: true,
        secondaryLabel: t('videoComposer.protagonist'),
        secondaryPlaceholder: t('videoComposer.protagonistPlaceholder'),
        thirdLabel: t('videoComposer.conflict'),
        thirdPlaceholder: t('videoComposer.conflictPlaceholder'),
        audienceOverrideLabel: t('videoComposer.targetEmotion'),
        audienceOverridePlaceholder: t('videoComposer.targetEmotionPlaceholder'),
        missingPrimaryToast: t('videoComposer.enterStoryTitle'),
      };
    case 'custom':
      return {
        cardTitle: t('videoComposer.briefingForEditor'),
        primaryNameLabel: t('videoComposer.editorTitleLabel'),
        primaryNamePlaceholder: t('videoComposer.editorTitlePlaceholder'),
        descriptionLabel: t('videoComposer.editorNotes'),
        descriptionPlaceholder: t('videoComposer.editorNotesPlaceholder'),
        listLabel: t('videoComposer.editorStyleHints'),
        listPlaceholder: t('videoComposer.editorStyleHintsPlaceholder'),
        showAudience: false,
        showList: true,
        showSecondary: false,
        secondaryLabel: '',
        secondaryPlaceholder: '',
        missingPrimaryToast: t('videoComposer.enterEditorTitle'),
      };
    case 'product-ad':
    default:
      return {
        cardTitle: t('videoComposer.briefingForProduct'),
        primaryNameLabel: t('videoComposer.productNameLabel'),
        primaryNamePlaceholder: t('videoComposer.productNamePlaceholder'),
        descriptionLabel: t('videoComposer.description'),
        descriptionPlaceholder: t('videoComposer.descriptionPlaceholder'),
        listLabel: t('videoComposer.usps'),
        listPlaceholder: t('videoComposer.uspPlaceholder'),
        showAudience: true,
        showList: true,
        showSecondary: false,
        secondaryLabel: '',
        secondaryPlaceholder: '',
        missingPrimaryToast: t('videoComposer.enterProductName'),
      };
  }
}

export default function BriefingTab({
  briefing,
  category,
  title,
  language,
  onUpdateBriefing,
  onUpdateProject,
  onGoToStoryboard,
  onScenesGenerated,
}: BriefingTabProps) {
  const { t } = useTranslation();
  const [uspInput, setUspInput] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);
  const TIPS_KEY = 'video-composer-briefing-tips-collapsed';
  const [tipsCollapsed, setTipsCollapsed] = useState<boolean>(() => {
    try { return localStorage.getItem(TIPS_KEY) === '1'; } catch { return false; }
  });
  useEffect(() => {
    try { localStorage.setItem(TIPS_KEY, tipsCollapsed ? '1' : '0'); } catch { /* ignore */ }
  }, [tipsCollapsed]);

  const cfg = getCategoryConfig(category, t);

  const CATEGORIES: { id: ComposerCategory; label: string; icon: React.ElementType; desc: string }[] = [
    { id: 'product-ad', label: t('videoComposer.productVideo'), icon: ShoppingBag, desc: t('videoComposer.productVideoDesc') },
    { id: 'corporate-ad', label: t('videoComposer.corporate'), icon: Building2, desc: t('videoComposer.corporateDesc') },
    { id: 'storytelling', label: t('videoComposer.storytelling'), icon: BookOpen, desc: t('videoComposer.storytellingDesc') },
    { id: 'custom', label: t('videoComposer.editor'), icon: Palette, desc: t('videoComposer.editorDesc') },
  ];

  const TONES: { value: EmotionalTone; label: string }[] = [
    { value: 'professional', label: t('videoComposer.tones.professional') },
    { value: 'energetic', label: t('videoComposer.tones.energetic') },
    { value: 'emotional', label: t('videoComposer.tones.emotional') },
    { value: 'funny', label: t('videoComposer.tones.funny') },
    { value: 'luxury', label: t('videoComposer.tones.luxury') },
    { value: 'minimal', label: t('videoComposer.tones.minimal') },
    { value: 'dramatic', label: t('videoComposer.tones.dramatic') },
    { value: 'friendly', label: t('videoComposer.tones.friendly') },
  ];

  const addUsp = () => {
    if (uspInput.trim()) {
      onUpdateBriefing({ usps: [...briefing.usps, uspInput.trim()] });
      setUspInput('');
    }
  };

  const removeUsp = (index: number) => {
    onUpdateBriefing({ usps: briefing.usps.filter((_, i) => i !== index) });
  };

  const handleGenerateStoryboard = async () => {
    if (!briefing.productName.trim()) {
      toast({ title: cfg.missingPrimaryToast, variant: 'destructive' });
      return;
    }

    if (briefing.mode === 'manual') {
      onUpdateProject({ status: 'storyboard' });
      onGoToStoryboard();
      return;
    }

    setIsGenerating(true);
    try {
      const { data, error } = await supabase.functions.invoke('compose-video-storyboard', {
        body: { briefing, category, language },
      });

      if (error) throw error;
      if (data?.scenes) {
        // Apply default quality to all generated scenes
        const defaultQ: ClipQuality = briefing.defaultQuality || 'standard';
        const scenesWithQuality = data.scenes.map((s: ComposerScene) => ({
          ...s,
          clipQuality: s.clipQuality || defaultQ,
        }));
        onScenesGenerated(scenesWithQuality);
        onUpdateProject({ status: 'storyboard' });
        toast({ title: t('videoComposer.storyboardGenerated'), description: `${data.scenes.length} ${t('videoComposer.scenesCreated')}` });
      }
    } catch (err: any) {
      console.error('Storyboard generation error:', err);
      toast({
        title: t('videoComposer.storyboardError'),
        description: err.message || t('videoComposer.tryAgain'),
        variant: 'destructive',
      });
    } finally {
      setIsGenerating(false);
    }
  };

  const canProceed = briefing.productName.trim().length > 0;

  // Storytelling stores protagonist + conflict in targetAudience as "Protagonist: ... | Conflict: ..."
  const storyMeta = (() => {
    if (category !== 'storytelling') return { protagonist: '', conflict: '' };
    const raw = briefing.targetAudience || '';
    const protagonist = raw.match(/Protagonist:\s*([^|]*)/)?.[1]?.trim() || '';
    const conflict = raw.match(/Conflict:\s*([^|]*)/)?.[1]?.trim() || '';
    return { protagonist, conflict };
  })();

  const updateStoryMeta = (next: { protagonist?: string; conflict?: string }) => {
    const protagonist = next.protagonist ?? storyMeta.protagonist;
    const conflict = next.conflict ?? storyMeta.conflict;
    onUpdateBriefing({ targetAudience: `Protagonist: ${protagonist} | Conflict: ${conflict}` });
  };

  return (
    <div className="space-y-6 max-w-4xl mx-auto">
      {/* Legal Usage Notice */}
      <div className="relative overflow-hidden rounded-xl bg-card/40 backdrop-blur-sm border border-destructive/20 shadow-soft">
        <div
          className="absolute left-0 top-0 bottom-0 w-[3px] bg-gradient-to-b from-destructive via-destructive/60 to-transparent"
          style={{ boxShadow: '0 0 12px hsl(var(--destructive) / 0.4)' }}
        />
        <div className="p-4 pl-5">
          <button
            type="button"
            onClick={() => setTipsCollapsed((v) => !v)}
            className="flex w-full items-center justify-between gap-3 text-left group"
            aria-expanded={!tipsCollapsed}
          >
            <div className="flex items-center gap-2.5">
              <div className="flex h-7 w-7 items-center justify-center rounded-md bg-destructive/10 border border-destructive/30">
                <ShieldAlert className="h-3.5 w-3.5 text-destructive" />
              </div>
              <h3 className="font-display text-sm font-semibold tracking-wide text-destructive">
                {t('videoComposer.aiLegalTitle')}
              </h3>
            </div>
            <span className="text-[10px] uppercase tracking-wider text-muted-foreground/70 flex items-center gap-1 group-hover:text-foreground transition-colors">
              {tipsCollapsed ? t('videoComposer.aiTipsExpand') : t('videoComposer.aiTipsCollapse')}
              {tipsCollapsed ? <ChevronDown className="h-3 w-3" /> : <ChevronUp className="h-3 w-3" />}
            </span>
          </button>

          {!tipsCollapsed && (
            <ul className="mt-4 space-y-2.5 text-xs leading-relaxed text-muted-foreground">
              <li className="flex gap-2.5">
                <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-destructive/70" />
                <span className="text-foreground/90">{t('videoComposer.aiLegalProhibited')}</span>
              </li>
              <li className="flex gap-2.5">
                <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-destructive/70" />
                <span>{t('videoComposer.aiLegalConsequences')}</span>
              </li>
              <li className="flex gap-2.5">
                <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-destructive/70" />
                <span>{t('videoComposer.aiLegalResponsibility')}</span>
              </li>
            </ul>
          )}
        </div>
      </div>

      {/* Mode Selection */}
      <Card className="border-border/40 bg-card/80">
        <CardHeader className="pb-3">
          <CardTitle className="text-base">{t('videoComposer.mode')}</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 gap-3">
            {([
              { mode: 'ai' as ComposerMode, icon: Wand2, label: t('videoComposer.aiAssisted'), desc: t('videoComposer.aiAssistedDesc') },
              { mode: 'manual' as ComposerMode, icon: Hand, label: t('videoComposer.manual'), desc: t('videoComposer.manualDesc') },
            ]).map(({ mode, icon: Icon, label, desc }) => (
              <button
                key={mode}
                onClick={() => onUpdateBriefing({ mode })}
                className={`p-4 rounded-lg border text-left transition-all ${
                  briefing.mode === mode
                    ? 'border-primary bg-primary/5 ring-1 ring-primary/30'
                    : 'border-border/40 hover:border-border'
                }`}
              >
                <Icon className={`h-5 w-5 mb-2 ${briefing.mode === mode ? 'text-primary' : 'text-muted-foreground'}`} />
                <p className="font-medium text-sm">{label}</p>
                <p className="text-xs text-muted-foreground mt-0.5">{desc}</p>
              </button>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Category Selection */}
      <Card className="border-border/40 bg-card/80">
        <CardHeader className="pb-3">
          <CardTitle className="text-base">{t('videoComposer.category')}</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {CATEGORIES.map(({ id, label, icon: Icon, desc }) => (
              <button
                key={id}
                onClick={() => onUpdateProject({ category: id })}
                className={`p-3 rounded-lg border text-left transition-all ${
                  category === id
                    ? 'border-primary bg-primary/5 ring-1 ring-primary/30'
                    : 'border-border/40 hover:border-border'
                }`}
              >
                <Icon className={`h-4 w-4 mb-1.5 ${category === id ? 'text-primary' : 'text-muted-foreground'}`} />
                <p className="font-medium text-xs">{label}</p>
                <p className="text-[10px] text-muted-foreground">{desc}</p>
              </button>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Category-Specific Briefing */}
      <Card className="border-border/40 bg-card/80">
        <CardHeader className="pb-3">
          <CardTitle className="text-base">{cfg.cardTitle}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label className="text-xs">{t('videoComposer.projectName')}</Label>
              <Input
                value={title}
                onChange={(e) => onUpdateProject({ title: e.target.value })}
                placeholder={t('videoComposer.projectNamePlaceholder')}
                className="bg-background/50"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">{cfg.primaryNameLabel}</Label>
              <Input
                value={briefing.productName}
                onChange={(e) => onUpdateBriefing({ productName: e.target.value })}
                placeholder={cfg.primaryNamePlaceholder}
                className="bg-background/50"
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs">{cfg.descriptionLabel}</Label>
            <Textarea
              value={briefing.productDescription}
              onChange={(e) => onUpdateBriefing({ productDescription: e.target.value })}
              placeholder={cfg.descriptionPlaceholder}
              rows={category === 'custom' ? 5 : 3}
              className="bg-background/50 resize-none"
            />
          </div>

          {/* Storytelling: Protagonist + Conflict */}
          {category === 'storytelling' && (
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label className="text-xs">{cfg.secondaryLabel}</Label>
                <Input
                  value={storyMeta.protagonist}
                  onChange={(e) => updateStoryMeta({ protagonist: e.target.value })}
                  placeholder={cfg.secondaryPlaceholder}
                  className="bg-background/50"
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">{cfg.thirdLabel}</Label>
                <Input
                  value={storyMeta.conflict}
                  onChange={(e) => updateStoryMeta({ conflict: e.target.value })}
                  placeholder={cfg.thirdPlaceholder}
                  className="bg-background/50"
                />
              </div>
            </div>
          )}

          {/* List (USPs / Core Messages / Key Scenes / Style Hints) */}
          {cfg.showList && (
            <div className="space-y-1.5">
              <Label className="text-xs">{cfg.listLabel}</Label>
              <div className="flex gap-2">
                <Input
                  value={uspInput}
                  onChange={(e) => setUspInput(e.target.value)}
                  placeholder={cfg.listPlaceholder}
                  className="bg-background/50"
                  onKeyDown={(e) => e.key === 'Enter' && addUsp()}
                />
                <Button size="sm" variant="outline" onClick={addUsp}>
                  <Plus className="h-3.5 w-3.5" />
                </Button>
              </div>
              {briefing.usps.length > 0 && (
                <div className="flex flex-wrap gap-1.5 mt-2">
                  {briefing.usps.map((usp, i) => (
                    <Badge key={i} variant="secondary" className="text-xs gap-1">
                      {usp}
                      <X className="h-3 w-3 cursor-pointer" onClick={() => removeUsp(i)} />
                    </Badge>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Target Audience / Target Emotion (storytelling re-labels) */}
          {cfg.showAudience && category !== 'storytelling' && (
            <div className="space-y-1.5">
              <Label className="text-xs">{t('videoComposer.targetAudience')}</Label>
              <Input
                value={briefing.targetAudience}
                onChange={(e) => onUpdateBriefing({ targetAudience: e.target.value })}
                placeholder={t('videoComposer.targetAudiencePlaceholder')}
                className="bg-background/50"
              />
            </div>
          )}
        </CardContent>
      </Card>

      {/* Style & Format */}
      <Card className="border-border/40 bg-card/80">
        <CardHeader className="pb-3">
          <CardTitle className="text-base">{t('videoComposer.styleFormat')}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label className="text-xs">{t('videoComposer.emotionalTone')}</Label>
              <Select
                value={briefing.tone}
                onValueChange={(v) => onUpdateBriefing({ tone: v as EmotionalTone })}
              >
                <SelectTrigger className="bg-background/50">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {TONES.map((tone) => (
                    <SelectItem key={tone.value} value={tone.value}>{tone.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">{t('videoComposer.language')}</Label>
              <Select
                value={language}
                onValueChange={(v) => onUpdateProject({ language: v })}
              >
                <SelectTrigger className="bg-background/50">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="de">Deutsch</SelectItem>
                  <SelectItem value="en">English</SelectItem>
                  <SelectItem value="es">Español</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Duration Slider */}
          <div className="space-y-2">
            <div className="flex justify-between">
              <Label className="text-xs">{t('videoComposer.videoDuration')}</Label>
              <span className="text-xs font-medium text-primary">{briefing.duration}s</span>
            </div>
            <Slider
              value={[briefing.duration]}
              onValueChange={([v]) => onUpdateBriefing({ duration: v })}
              min={15}
              max={90}
              step={5}
              className="w-full"
            />
            <div className="flex justify-between text-[10px] text-muted-foreground">
              <span>15s</span>
              <span>90s</span>
            </div>
          </div>

          {/* Aspect Ratio */}
          <div className="space-y-1.5">
            <Label className="text-xs">{t('videoComposer.aspectRatio')}</Label>
            <div className="grid grid-cols-4 gap-2">
              {ASPECT_RATIOS.map(({ value, label, desc }) => (
                <button
                  key={value}
                  onClick={() => onUpdateBriefing({ aspectRatio: value })}
                  className={`p-2 rounded-lg border text-center transition-all ${
                    briefing.aspectRatio === value
                      ? 'border-primary bg-primary/5'
                      : 'border-border/40 hover:border-border'
                  }`}
                >
                  <p className="font-medium text-xs">{label}</p>
                  <p className="text-[10px] text-muted-foreground">{desc}</p>
                </button>
              ))}
            </div>
          </div>

          {/* Default Quality Tier */}
          <div className="space-y-1.5">
            <Label className="text-xs">KI-Qualität (Standard für alle Szenen)</Label>
            <div className="grid grid-cols-2 gap-2">
              {([
                { q: 'standard' as ClipQuality, title: 'Standard', desc: '768p / 720p — günstiger', rate: '€0.15/s' },
                { q: 'pro' as ClipQuality, title: 'Pro', desc: '1080p — höhere Auflösung', rate: 'ab €0.20/s' },
              ]).map(({ q, title, desc, rate }) => {
                const isActive = (briefing.defaultQuality || 'standard') === q;
                return (
                  <button
                    key={q}
                    onClick={() => onUpdateBriefing({ defaultQuality: q })}
                    className={`p-3 rounded-lg border text-left transition-all ${
                      isActive
                        ? q === 'pro'
                          ? 'border-amber-500/60 bg-amber-500/5 ring-1 ring-amber-500/30'
                          : 'border-primary bg-primary/5 ring-1 ring-primary/30'
                        : 'border-border/40 hover:border-border'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <p className={`font-medium text-xs ${isActive && q === 'pro' ? 'text-amber-400' : isActive ? 'text-primary' : ''}`}>
                        {title}
                      </p>
                      <span className="text-[10px] text-muted-foreground">{rate}</span>
                    </div>
                    <p className="text-[10px] text-muted-foreground mt-0.5">{desc}</p>
                  </button>
                );
              })}
            </div>
            <p className="text-[10px] text-muted-foreground/70">
              Pro-Szene überschreibbar im Storyboard.
            </p>
          </div>
        </CardContent>
      </Card>

      {/* Video Mode — choose between AI video, AI image, or mixed scenes */}
      <VideoModeSelector
        value={briefing.videoMode || 'video'}
        language={language}
        onChange={(mode: VideoMode) => onUpdateBriefing({ videoMode: mode })}
      />

      {/* Recurring Characters — drives consistency across scenes */}
      <CharacterManager
        characters={briefing.characters || []}
        language={language}
        onChange={(characters: ComposerCharacter[]) => onUpdateBriefing({ characters })}
      />

      {/* Visual Style — drives consistent look across all AI-generated scenes */}
      <Card className="border-border/40 bg-card/80">
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Palette className="h-4 w-4 text-primary" />
            {language === 'de' ? 'Visueller Stil' : language === 'es' ? 'Estilo Visual' : 'Visual Style'}
          </CardTitle>
          <p className="text-xs text-muted-foreground mt-1">
            {language === 'de'
              ? 'Wird auf alle KI-generierten Szenen angewendet — sorgt für einheitlichen Look.'
              : language === 'es'
                ? 'Se aplica a todas las escenas generadas por IA — garantiza un aspecto uniforme.'
                : 'Applied to every AI-generated scene — ensures a consistent look.'}
          </p>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2">
            {VISUAL_STYLES.map((style) => {
              const lang = (language === 'de' || language === 'es' ? language : 'en') as 'de' | 'en' | 'es';
              const isActive = (briefing.visualStyle || 'realistic') === style.id;
              return (
                <button
                  key={style.id}
                  type="button"
                  onClick={() => onUpdateBriefing({ visualStyle: style.id as ComposerVisualStyle })}
                  className={`p-3 rounded-lg border text-left transition-all ${
                    isActive
                      ? 'border-primary bg-primary/5 ring-1 ring-primary/30'
                      : 'border-border/40 hover:border-border'
                  }`}
                >
                  <div className="flex items-start gap-2">
                    <span className="text-lg leading-none">{style.glyph}</span>
                    <div className="min-w-0">
                      <p className={`font-medium text-xs ${isActive ? 'text-primary' : ''}`}>
                        {style.label[lang]}
                      </p>
                      <p className="text-[10px] text-muted-foreground mt-0.5 line-clamp-2">
                        {style.desc[lang]}
                      </p>
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        </CardContent>
      </Card>

      {/* Action */}
      <div className="flex justify-end">
        <Button
          onClick={handleGenerateStoryboard}
          disabled={!canProceed || isGenerating}
          className="gap-2"
          size="lg"
        >
          {isGenerating ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" />
              {t('videoComposer.generatingStoryboard')}
            </>
          ) : briefing.mode === 'ai' ? (
            <>
              <Sparkles className="h-4 w-4" />
              {t('videoComposer.generateStoryboard')}
            </>
          ) : (
            <>
              <ArrowRight className="h-4 w-4" />
              {t('videoComposer.continueToStoryboard')}
            </>
          )}
        </Button>
      </div>
    </div>
  );
}
