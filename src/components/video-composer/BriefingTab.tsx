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
import { extractFunctionsError } from '@/lib/functionsError';
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
import { suggestShotDirectorForStyle, getStyleLabel } from '@/config/styleToShotDirector';
import CharacterManager from './CharacterManager';
import VideoModeSelector from './VideoModeSelector';
import BrandKitApplyPanel from './BrandKitApplyPanel';
import StagePanel from './stage/StagePanel';
import DirectorsNote from './stage/DirectorsNote';
import FilmStripModeSelector from './stage/FilmStripModeSelector';
import { useStudioPreferences } from '@/hooks/useStudioPreferences';
import type { VideoMode, AssemblyConfig } from '@/types/video-composer';

const ASPECT_RATIOS: { value: AspectRatio; label: string; desc: string }[] = [
  { value: '16:9', label: '16:9', desc: 'YouTube / Landscape' },
  { value: '9:16', label: '9:16', desc: 'TikTok / Reels / Shorts' },
  { value: '1:1', label: '1:1', desc: 'Instagram Feed' },
  { value: '4:5', label: '4:5', desc: 'Instagram / Facebook' },
];

const cleanActionText = (value: unknown, maxWords = 25) => {
  const text = String(value ?? '').replace(/\s+/g, ' ').replace(/^[-–—:\s]+/, '').trim();
  if (!text) return '';
  const words = text.split(/\s+/).filter(Boolean);
  return words.length > maxWords ? words.slice(0, maxWords).join(' ') : text;
};

const actionFromPrompt = (prompt: unknown, maxWords = 25) => {
  const cleaned = String(prompt ?? '')
    .replace(/\[SceneAction\][\s\S]*?\[\/SceneAction\]\s*/gi, '')
    .replace(/\[CastActions\][\s\S]*?\[\/CastActions\]\s*/gi, '')
    .replace(/^Featuring\s+[^:]{1,500}:\s*/i, '')
    .replace(/,\s*no on-screen text[\s\S]*$/i, '')
    .replace(/\s+/g, ' ')
    .trim();
  if (!cleaned) return '';
  const firstSentence = cleaned.match(/^[^.!?]+[.!?]?/)?.[0] || cleaned;
  const actionClause = firstSentence.split(/,\s*(?:shot on|camera|lens|lighting|golden hour|soft light|shallow depth|filmic|muted palette|anamorphic|no on-screen)/i)[0];
  return cleanActionText(actionClause || firstSentence, maxWords);
};

/**
 * Cast-aware per-character fallback. Returns "" when the prompt doesn't
 * actually mention this character — never copies another character's clause
 * or the generic scene action into a foreign cast slot.
 */
const characterActionFromPrompt = (prompt: unknown, characterName: string | undefined) => {
  const body = String(prompt ?? '')
    .replace(/\[SceneAction\][\s\S]*?\[\/SceneAction\]\s*/gi, '')
    .replace(/\[CastActions\][\s\S]*?\[\/CastActions\]\s*/gi, '')
    .replace(/^Featuring\s+[^:]{1,500}:\s*/i, '')
    .replace(/,\s*no on-screen text[\s\S]*$/i, '');
  const name = String(characterName ?? '').trim();
  if (!name) return '';
  const first = name.split(/\s+/)[0]?.toLowerCase() || '';
  if (first.length < 3) return '';
  const lower = body.toLowerCase();
  if (!lower.includes(name.toLowerCase()) && !lower.includes(first)) return '';
  const clauses = body.split(/[.!?]\s+|;\s+|,\s+(?=(?:while|as|and|then|with|beside|next to)\b)/i);
  const match = clauses.find((clause) => {
    const l = clause.toLowerCase();
    return l.includes(name.toLowerCase()) || l.includes(first);
  });
  if (!match) return '';
  return cleanActionText(match, 12);
};

interface BriefingTabProps {
  briefing: ComposerBriefing;
  category: ComposerCategory;
  title: string;
  language: string;
  onUpdateBriefing: (b: Partial<ComposerBriefing>) => void;
  onUpdateProject: (p: Record<string, any>) => void;
  onGoToStoryboard: () => void;
  onScenesGenerated: (scenes: ComposerScene[]) => void;
  /** Fired the moment AI generation kicks off, so the dashboard can flip a
   *  global flag and show a loading panel on the Storyboard tab. */
  onGenerationStart?: () => void;
  /** Fired when AI generation ends (success OR failure) so the loading
   *  panel can be hidden. */
  onGenerationEnd?: () => void;
  /** Fired when AI generation fails or returns 0 scenes. Receives the
   *  user-facing error message + retryable flag so the dashboard can show
   *  a persistent error panel with a retry button. */
  onGenerationFailed?: (err: { message: string; retryable: boolean }) => void;
  /** Counter the dashboard increments to trigger a programmatic re-run of
   *  `handleGenerateStoryboard` (used by the storyboard-error retry button).
   *  Initial value 0 is a no-op. */
  retryStoryboardNonce?: number;
  brandKitId?: string | null;
  brandKitAutoSync?: boolean;
  assemblyConfig?: AssemblyConfig;
  onChangeBrandKit?: (id: string | null) => void;
  onChangeBrandKitAutoSync?: (sync: boolean) => void;
  onApplyAssembly?: (next: AssemblyConfig) => void;
  /** Existing scenes (for Style → Shot Director soft-suggest). */
  scenes?: ComposerScene[];
  /** Callback to update scenes when style soft-suggest applies defaults. */
  onUpdateScenes?: (scenes: ComposerScene[]) => void;
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
  onGenerationStart,
  onGenerationEnd,
  onGenerationFailed,
  brandKitId,
  brandKitAutoSync,
  assemblyConfig,
  onChangeBrandKit,
  onChangeBrandKitAutoSync,
  onApplyAssembly,
  scenes,
  onUpdateScenes,
  retryStoryboardNonce = 0,
}: BriefingTabProps) {
  const { t } = useTranslation();
  const { prefs } = useStudioPreferences();
  const editorMode = prefs.editorMode; // 'quick' | 'direct' | 'studio'
  const showDirect = editorMode !== 'quick';
  const showStudio = editorMode === 'studio';
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

    // Switch to the Storyboard tab IMMEDIATELY so the user sees the
    // loading panel instead of staring at the Briefing form for 10–20s.
    setIsGenerating(true);
    onGenerationStart?.();
    onUpdateProject({ status: 'storyboard' });
    onGoToStoryboard();

    let hadScenes = false;
    try {
      const { data, error } = await supabase.functions.invoke('compose-video-storyboard', {
        body: { briefing, category, language },
      });

      if (error) {
        console.warn('[BriefingTab] storyboard invoke error:', error, 'data:', data);
        // Pull the real server-side message + retryable flag out of the
        // FunctionsHttpError context (supabase-js hides it behind a generic
        // "non-2xx status code" message otherwise). Particularly useful for
        // the 503 "AI Gateway temporarily unavailable" surfaced by the
        // retry+fallback wrapper in compose-video-storyboard.
        let friendly = '';
        let retryable = false;
        try {
          const ctx: any = (error as any)?.context;
          if (ctx && typeof ctx.clone === 'function') {
            const text = await ctx.clone().text();
            if (text) {
              try {
                const j = JSON.parse(text);
                friendly = String(j?.error || j?.message || '').trim();
                retryable = j?.retryable === true;
              } catch { /* not JSON */ }
            }
          }
        } catch { /* ignore */ }
        if (!friendly) friendly = await extractFunctionsError(error);
        const e: any = new Error(friendly || t('videoComposer.tryAgain'));
        e.retryable = retryable;
        throw e;
      }

      const rawScenes = Array.isArray(data?.scenes) ? data.scenes : null;
      if (!rawScenes || rawScenes.length === 0) {
        console.warn('[BriefingTab] storyboard returned no scenes. payload:', data);
        throw new Error(data?.error || t('videoComposer.storyboardError'));
      }


      // Apply default quality to all generated scenes
      const defaultQ: ClipQuality = briefing.defaultQuality || 'standard';
      const FORBIDDEN_MULTI = new Set(['back', 'pov', 'detail', 'silhouette']);
      const joinNames = (names: string[]) => {
        if (names.length <= 1) return names.join('');
        if (names.length === 2) return `${names[0]} and ${names[1]}`;
        return `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`;
      };
      const scenesWithQuality = rawScenes.map((s: ComposerScene) => {
        let aiPrompt = s.aiPrompt;
        let sceneActionEn = s.sceneActionEn || actionFromPrompt(s.aiPrompt, 25);
        let sceneActionUser = s.sceneActionUser || s.sceneActionEn || actionFromPrompt(s.aiPrompt, 25);
        const rawShots = (s.characterShots ?? (s.characterShot ? [s.characterShot] : []));
        let characterShots = rawShots.map((slot) => {
          const ch = briefing.characters?.find((c) => c.id === slot.characterId);
          const fallback = characterActionFromPrompt(s.aiPrompt, ch?.name);
          return {
            ...slot,
            actionEn: slot.actionEn || fallback,
            actionUser: slot.actionUser || slot.actionEn || fallback,
          };
        });

        // Lip-sync safe multi-cast rewrite (mirror of edge function).
        const visible = characterShots.filter((x: any) => x && x.shotType && x.shotType !== 'absent');
        if (visible.length >= 2) {
          let hasFull = false;
          visible.forEach((slot: any, i: number) => {
            if (FORBIDDEN_MULTI.has(slot.shotType)) slot.shotType = i === 0 ? 'full' : 'profile';
            if (slot.shotType === 'full') hasFull = true;
          });
          if (!hasFull) (visible[0] as any).shotType = 'full';

          const castEntries: Array<{ name: string; signature: string; action: string; slot: any }> = [];
          for (const slot of visible) {
            const ch = briefing.characters?.find((c) => c.id === slot.characterId);
            if (!ch?.name) continue;
            const existing = (slot.actionEn || '').trim();
            const fromPrompt = characterActionFromPrompt(aiPrompt, ch.name);
            const finalAction = existing || fromPrompt || 'looks at the others and speaks naturally on camera';
            (slot as any).actionEn = finalAction;
            (slot as any).actionUser = (slot.actionUser || finalAction).trim();
            castEntries.push({ name: ch.name, signature: (ch.signatureItems || '').trim(), action: finalAction, slot });
          }
          if (castEntries.length >= 2) {
            const names = castEntries.map((e) => e.name);
            const groupAction = `${joinNames(names)} share the scene together, each visible to camera with their own action`;
            sceneActionEn = groupAction.split(/\s+/).slice(0, 25).join(' ');
            const userLower = (sceneActionUser || '').toLowerCase();
            const allInUser = names.every((n) => userLower.includes(n.toLowerCase()));
            if (!allInUser) sceneActionUser = sceneActionEn;

            const stripped = String(aiPrompt || '')
              .replace(/\[SceneAction\][\s\S]*?\[\/SceneAction\]\s*/gi, '')
              .replace(/\[CastActions\][\s\S]*?\[\/CastActions\]\s*/gi, '')
              .replace(/^\s*Featuring\s+[^:]{1,500}:\s*/i, '')
              .trim();
            const castClauses = castEntries.map((e) => {
              const sig = e.signature ? ` (${e.signature})` : '';
              return `${e.name}${sig} ${e.action}`;
            });
            const groupClause =
              `Group scene with ${joinNames(names)} all clearly visible on camera, balanced left-to-right composition, every face fully in frame and unobstructed (no back-shots, no POV, no silhouettes, no occlusion, no single-character close-up). ` +
              `Each character has a distinct simultaneous action: ${castClauses.join('; ')}. ` +
              `They are engaged in dialogue — either speaking with one another with eye contact and reactions, or each speaking to camera in clear visible turns — so the mouth movements of every visible character can be lip-synced. `;
            aiPrompt = (groupClause + stripped).trim();
            characterShots = visible;
          }
        }

        return {
          ...s,
          clipQuality: s.clipQuality || defaultQ,
          aiPrompt,
          sceneActionEn,
          sceneActionUser,
          characterShots,
          characterShot: characterShots[0] || s.characterShot,
        } as ComposerScene;
      });
      onScenesGenerated(scenesWithQuality);
      hadScenes = true;
      toast({ title: t('videoComposer.storyboardGenerated'), description: `${rawScenes.length} ${t('videoComposer.scenesCreated')}` });
    } catch (err: any) {
      console.error('Storyboard generation error:', err);
      const isRetryable = err?.retryable === true;
      toast({
        title: isRetryable
          ? (language === 'de' ? 'KI-Dienst ist gerade überlastet'
            : language === 'es' ? 'El servicio de IA está temporalmente saturado'
            : 'AI service is temporarily overloaded')
          : t('videoComposer.storyboardError'),
        description: isRetryable
          ? (language === 'de' ? 'Bitte in ca. 30 Sekunden erneut auf „Storyboard generieren" klicken.'
            : language === 'es' ? 'Por favor, vuelve a pulsar «Generar storyboard» en unos 30 segundos.'
            : 'Please click "Generate storyboard" again in about 30 seconds.')
          : (err?.message || t('videoComposer.tryAgain')),
        variant: 'destructive',
      });
      // Surface the failure to the dashboard so it can render a persistent
      // error panel on the Storyboard tab (with a one-click retry) instead
      // of silently bouncing the user back to Briefing.
      onGenerationFailed?.({
        message: String(err?.message || t('videoComposer.tryAgain')),
        retryable: isRetryable,
      });

    } finally {
      setIsGenerating(false);
      onGenerationEnd?.();
      if (!hadScenes) {
        // No scenes ever made it into state — keep project.status consistent.
        onUpdateProject({ status: 'briefing' });
      }
    }
  };



  const canProceed = briefing.productName.trim().length > 0;

  // Storytelling stores protagonist + conflict in targetAudience as "Protagonist: ... | Conflict: ..."
  const storyMeta = (() => {
    if (category !== 'storytelling') return { protagonist: '', conflict: '' };
    const raw = briefing.targetAudience || '';
    // Match content between "Protagonist: " and " |" (or end of string).
    // Do NOT trim — trimming strips trailing spaces while the user is typing,
    // making it impossible to type multi-word entries with spaces.
    const protagonist = raw.match(/Protagonist: ([^|]*?)(?: \||$)/)?.[1] ?? '';
    const conflict = raw.match(/Conflict: ([^|]*?)(?: \||$)/)?.[1] ?? '';
    return { protagonist, conflict };
  })();

  const updateStoryMeta = (next: { protagonist?: string; conflict?: string }) => {
    const protagonist = next.protagonist ?? storyMeta.protagonist;
    const conflict = next.conflict ?? storyMeta.conflict;
    onUpdateBriefing({ targetAudience: `Protagonist: ${protagonist} | Conflict: ${conflict}` });
  };

  return (
    <div className="space-y-6 max-w-4xl mx-auto">
      {/* Film-strip Mode Selector — visible Quick / Direct / Studio reels */}
      <FilmStripModeSelector />

      {/* Crossfade wrapper — re-keyed on editorMode so panel changes "feel" */}
      <div key={editorMode} className="stage-mode-fade space-y-6">


      {/* Legal Usage Notice */}
      <StagePanel
        tone="destructive"
        slateIndex="00"
        eyebrow="Compliance · Legal"
        title={t('videoComposer.aiLegalTitle')}
        accessory={
          <button
            type="button"
            onClick={() => setTipsCollapsed((v) => !v)}
            className="flex items-center gap-1 font-mono text-[10px] uppercase tracking-wider text-muted-foreground/80 hover:text-foreground transition-colors"
          >
            {tipsCollapsed ? t('videoComposer.aiTipsExpand') : t('videoComposer.aiTipsCollapse')}
            {tipsCollapsed ? <ChevronDown className="h-3 w-3" /> : <ChevronUp className="h-3 w-3" />}
          </button>
        }
      >
        {!tipsCollapsed && (
          <ul className="space-y-2.5 text-xs leading-relaxed text-muted-foreground">
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
      </StagePanel>

      {/* Mode Selection — Direct & Studio only (Quick auto-uses AI mode) */}
      {showDirect && (
        <StagePanel slateIndex="01" eyebrow="Scene · Production Mode" title={t('videoComposer.mode')}>
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
                    ? 'border-amber-300/70 bg-amber-300/5 ring-1 ring-amber-300/30 shadow-[0_0_24px_-12px_hsla(43,90%,68%,0.6)]'
                    : 'border-border/40 hover:border-amber-200/30'
                }`}
              >
                <Icon className={`h-5 w-5 mb-2 ${briefing.mode === mode ? 'text-amber-300' : 'text-muted-foreground'}`} />
                <p className="font-medium text-sm">{label}</p>
                <p className="text-xs text-muted-foreground mt-0.5">{desc}</p>
              </button>
            ))}
          </div>
        </StagePanel>
      )}

      {/* Category Selection */}
      <StagePanel slateIndex="02" eyebrow="Scene · Format" title={t('videoComposer.category')}>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {CATEGORIES.map(({ id, label, icon: Icon, desc }) => (
            <button
              key={id}
              onClick={() => onUpdateProject({ category: id })}
              className={`p-3 rounded-lg border text-left transition-all ${
                category === id
                  ? 'border-amber-300/70 bg-amber-300/5 ring-1 ring-amber-300/30 shadow-[0_0_24px_-12px_hsla(43,90%,68%,0.6)]'
                  : 'border-border/40 hover:border-amber-200/30'
              }`}
            >
              <Icon className={`h-4 w-4 mb-1.5 ${category === id ? 'text-amber-300' : 'text-muted-foreground'}`} />
              <p className="font-medium text-xs">{label}</p>
              <p className="text-[10px] text-muted-foreground">{desc}</p>
            </button>
          ))}
        </div>
      </StagePanel>

      {/* Category-Specific Briefing */}
      <StagePanel slateIndex="03" eyebrow="Scene · Subject" title={cfg.cardTitle}>
        <div className="space-y-4">
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
        </div>
      </StagePanel>

      {/* Style & Format — Quick = compact (AR + Duration only). Direct/Studio = full. */}
      <StagePanel slateIndex="04" eyebrow="Scene · Style & Format" title={t('videoComposer.styleFormat')}>
        <div className="space-y-4">
          {showDirect && (
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
          )}

          {/* Duration Slider */}
          <div className="space-y-2">
            <div className="flex justify-between">
              <Label className="text-xs">{t('videoComposer.videoDuration')}</Label>
              <span className="text-xs font-medium text-amber-300">{briefing.duration}s</span>
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
                      ? 'border-amber-300/70 bg-amber-300/5 ring-1 ring-amber-300/30'
                      : 'border-border/40 hover:border-amber-200/30'
                  }`}
                >
                  <p className="font-medium text-xs">{label}</p>
                  <p className="text-[10px] text-muted-foreground">{desc}</p>
                </button>
              ))}
            </div>
          </div>

          {/* Default Quality Tier — Direct & Studio only */}
          {showDirect && (
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
                            ? 'border-amber-300/70 bg-amber-300/5 ring-1 ring-amber-300/30'
                            : 'border-primary bg-primary/5 ring-1 ring-primary/30'
                          : 'border-border/40 hover:border-amber-200/30'
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <p className={`font-medium text-xs ${isActive && q === 'pro' ? 'text-amber-300' : isActive ? 'text-primary' : ''}`}>
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
          )}
        </div>
      </StagePanel>

      {/* Video Mode — Direct & Studio only */}
      {showDirect && (
        <VideoModeSelector
          value={briefing.videoMode || 'video'}
          language={language}
          onChange={(mode: VideoMode) => onUpdateBriefing({ videoMode: mode })}
        />
      )}

      {/* Recurring Characters — Studio only (advanced) */}
      {showStudio && (
        <CharacterManager
          characters={briefing.characters || []}
          language={language}
          onChange={(characters: ComposerCharacter[]) => onUpdateBriefing({ characters })}
        />
      )}

      {/* Director's Note — Direct & Studio only */}
      {showDirect && (
        <DirectorsNote>
          {language === 'de'
            ? 'Beschreibe markante Kleidung & Objekte ausführlich (Mantel, Krone, Waffe). Die KI wiederholt diese viel zuverlässiger als Gesichter — der Zuschauer erkennt die Person daran. Für echte Gesichts-Konsistenz nutze einen Avatar aus der Bibliothek.'
            : language === 'es'
              ? 'Describe ropa y objetos distintivos en detalle (abrigo, corona, arma). La IA los repite con mucha más fiabilidad que las caras — el espectador reconoce al personaje por ellos. Para consistencia facial real, usa un avatar de la biblioteca.'
              : 'Describe distinctive clothing & props in detail (coat, crown, weapon). The AI repeats those far more reliably than faces — your audience recognises the character by them. For true face consistency, use an avatar from the library.'}
        </DirectorsNote>
      )}



      {/* Visual Style — Direct & Studio only */}
      {showDirect && (
        <StagePanel
          slateIndex="05"
          eyebrow="Scene · Visual Language"
          title={
            <span className="flex items-center gap-2">
              <Palette className="h-4 w-4 text-amber-300" />
              {language === 'de' ? 'Visueller Stil' : language === 'es' ? 'Estilo Visual' : 'Visual Style'}
            </span>
          }
        >
          <p className="text-xs text-muted-foreground mb-3">
            {language === 'de'
              ? 'Wird auf alle KI-generierten Szenen angewendet — sorgt für einheitlichen Look.'
              : language === 'es'
                ? 'Se aplica a todas las escenas generadas por IA — garantiza un aspecto uniforme.'
                : 'Applied to every AI-generated scene — ensures a consistent look.'}
          </p>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2">
            {VISUAL_STYLES.map((style) => {
              const lang = (language === 'de' || language === 'es' ? language : 'en') as 'de' | 'en' | 'es';
              const isActive = (briefing.visualStyle || 'realistic') === style.id;
              return (
                <button
                  key={style.id}
                  type="button"
                  onClick={() => {
                    const styleId = style.id as ComposerVisualStyle;
                    onUpdateBriefing({ visualStyle: styleId });

                    if (scenes && onUpdateScenes && scenes.length > 0) {
                      const emptyScenes = scenes.filter(
                        (s) => !s.shotDirector || Object.values(s.shotDirector).filter(Boolean).length === 0,
                      );
                      if (emptyScenes.length > 0) {
                        const { selection } = suggestShotDirectorForStyle(styleId, undefined);
                        const updated = scenes.map((s) =>
                          emptyScenes.find((es) => es.id === s.id)
                            ? { ...s, shotDirector: selection }
                            : s,
                        );
                        onUpdateScenes(updated);
                        const lang2 = (language === 'de' || language === 'es' ? language : 'en') as 'de' | 'en' | 'es';
                        const styleLabel = getStyleLabel(styleId, lang2);
                        toast({
                          title:
                            lang2 === 'de'
                              ? `Shot Director: ${styleLabel}-Defaults gesetzt`
                              : lang2 === 'es'
                                ? `Director de Plano: ajustes ${styleLabel} aplicados`
                                : `Shot Director: ${styleLabel} defaults applied`,
                          description:
                            lang2 === 'de'
                              ? `Auf ${emptyScenes.length} Szene(n) ohne Kamera-Auswahl. Pro Szene überschreibbar.`
                              : lang2 === 'es'
                                ? `En ${emptyScenes.length} escena(s) sin selección de cámara. Editable por escena.`
                                : `Applied to ${emptyScenes.length} scene(s) with no camera selection. Editable per scene.`,
                          duration: 3500,
                        });
                      }
                    }
                  }}
                  className={`p-3 rounded-lg border text-left transition-all ${
                    isActive
                      ? 'border-amber-300/70 bg-amber-300/5 ring-1 ring-amber-300/30 shadow-[0_0_24px_-12px_hsla(43,90%,68%,0.6)]'
                      : 'border-border/40 hover:border-amber-200/30'
                  }`}
                >
                  <div className="flex items-start gap-2">
                    <span className="text-lg leading-none">{style.glyph}</span>
                    <div className="min-w-0">
                      <p className={`font-medium text-xs ${isActive ? 'text-amber-300' : ''}`}>
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
        </StagePanel>
      )}

      {/* Brand Kit Auto-Apply */}
      {assemblyConfig && onChangeBrandKit && onChangeBrandKitAutoSync && onApplyAssembly && (
        <BrandKitApplyPanel
          brandKitId={brandKitId ?? null}
          autoSync={brandKitAutoSync ?? false}
          assemblyConfig={assemblyConfig}
          onChangeBrandKit={onChangeBrandKit}
          onChangeAutoSync={onChangeBrandKitAutoSync}
          onApplyAssembly={onApplyAssembly}
        />
      )}

      {/* Stock-First Toggle (AI mode only) — opt-in cost saver */}
      {briefing.mode === 'ai' && (
        <Card className="border-emerald-500/40 bg-gradient-to-br from-emerald-500/5 to-card/80 shadow-[0_0_24px_-12px_hsl(142_76%_45%/0.4)]">
          <CardContent className="pt-5">
            <button
              type="button"
              onClick={() => onUpdateBriefing({ preferStock: !briefing.preferStock })}
              className="flex w-full items-start gap-3 text-left"
              aria-pressed={!!briefing.preferStock}
            >
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-emerald-500/15 border border-emerald-500/40 text-base">
                🎁
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <p className="font-semibold text-sm text-emerald-300">
                    {t('videoComposer.stockFirstTitle')}
                  </p>
                  <Badge variant="outline" className="border-emerald-500/50 bg-emerald-500/10 text-emerald-300 text-[10px] h-5">
                    {t('videoComposer.stockFirstBadge')}
                  </Badge>
                </div>
                <p className="text-xs text-muted-foreground mt-1 leading-relaxed">
                  {t('videoComposer.stockFirstDesc')}
                </p>
              </div>
              <div
                className={`mt-1 h-6 w-11 shrink-0 rounded-full border-2 transition-colors ${
                  briefing.preferStock
                    ? 'bg-emerald-500 border-emerald-500'
                    : 'bg-input border-transparent'
                }`}
              >
                <div
                  className={`h-5 w-5 rounded-full bg-background shadow-md transition-transform ${
                    briefing.preferStock ? 'translate-x-5' : 'translate-x-0'
                  }`}
                />
              </div>
            </button>
          </CardContent>
        </Card>
      )}

      {/* Action — gold-gradient cinematic CTA */}
      <div className="flex justify-end pt-2">
        <button
          type="button"
          onClick={handleGenerateStoryboard}
          disabled={!canProceed || isGenerating}
          className={`group relative inline-flex items-center gap-2 px-6 py-3 rounded-full font-mono text-[11px] uppercase tracking-[0.25em] text-[hsl(230_30%_4%)] disabled:opacity-50 disabled:cursor-not-allowed transition-all hover:shadow-[0_0_40px_-8px_hsla(43,90%,68%,0.7)] hover:-translate-y-[1px] ${canProceed && !isGenerating ? 'stage-cta-sheen' : ''}`}
          style={{
            background: 'linear-gradient(180deg, #FFE9A8 0%, #F5C76A 50%, #b78934 100%)',
            boxShadow:
              '0 0 24px -8px hsla(43,90%,68%,0.5), inset 0 1px 0 hsla(0,0%,100%,0.45), inset 0 -1px 0 hsla(0,0%,0%,0.25)',
          }}
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
        </button>
      </div>
      </div>
    </div>
  );
}

