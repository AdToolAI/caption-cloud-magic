import { useEffect, useMemo, useRef, useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
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
  ChevronUp, ChevronDown, Trash2, GripVertical,
  Sparkles, Upload, Video, Image as ImageIcon, Wand2, Beaker,
  ArrowRight, ArrowLeft, Link2, Palette,
} from 'lucide-react';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from '@/components/ui/dialog';
import CompareLabGrid from '@/components/compare-lab/CompareLabGrid';
import type {
  ComposerScene,
  SceneType,
  ClipSource,
  ClipQuality,
  TransitionStyle,
  ComposerCharacter,
} from '@/types/video-composer';
import { SCENE_TYPE_LABELS, CLIP_SOURCE_LABELS, getClipCost, getClipRate, QUALITY_LABELS } from '@/types/video-composer';

import SceneMediaUpload from './SceneMediaUpload';
import StockMediaBrowser, { type StockMediaItem } from './StockMediaBrowser';
import SceneReferenceImageUpload from './SceneReferenceImageUpload';
import { CharacterShotBadge, CharacterShotPicker } from './CharacterShotBadge';
import DirectorPresetPicker from '@/components/motion-studio/DirectorPresetPicker';
import SceneShotDirectorPanel from './SceneShotDirectorPanel';
import CinematicStylePresets from '@/components/ai-video/CinematicStylePresets';
import { buildShotPromptSuffix } from '@/lib/shotDirector/buildShotPromptSuffix';
import PromptMentionEditor from '@/components/motion-studio/PromptMentionEditor';
import StructuredPromptBuilder from '@/components/motion-studio/StructuredPromptBuilder';
import StylePresetPicker from '@/components/motion-studio/StylePresetPicker';
import MultiEnginePromptPreview from '@/components/motion-studio/MultiEnginePromptPreview';
import { applyDirectorModifiers } from '@/lib/motion-studio/directorPresets';
import { resolveMentions } from '@/lib/motion-studio/mentionParser';
import {
  stitchSlots,
  naiveSplitToSlots,
  hasAnySlot,
  type PromptSlots,
} from '@/lib/motion-studio/structuredPromptStitcher';
import { clipSourceToModelKey } from '@/lib/motion-studio/promptTokenLimits';
import { ModelSelector } from '@/components/ai-video/ModelSelector';
import { COMPOSER_AVAILABLE_MODELS, modelIdToSource, sourceToModelId } from '@/lib/video-composer/modelMapping';
import { useMotionStudioLibrary } from '@/hooks/useMotionStudioLibrary';
import { useStylePresets } from '@/hooks/useStylePresets';
import { supabase } from '@/integrations/supabase/client';
import { toast } from '@/hooks/use-toast';
import SceneCommentBadge from './SceneCommentBadge';
import SceneCommentSheet from './SceneCommentSheet';
import { useSceneCommentCounts } from '@/hooks/useComposerCollaboration';

interface SceneCardProps {
  scene: ComposerScene;
  index: number;
  totalScenes: number;
  projectId?: string;
  characters?: ComposerCharacter[];
  /** Aspect ratio from briefing — used to filter Stock Library results. */
  preferredAspect?: '16:9' | '9:16' | '1:1' | '4:5';
  onUpdate: (updates: Partial<ComposerScene>) => void;
  onDelete: () => void;
  onMoveUp: () => void;
  onMoveDown: () => void;
  /**
   * Block M — opens the Hybrid Extend dialog for this scene.
   * Parent owns the dialog state because it needs to refetch scenes after success.
   */
  onHybridExtend?: (mode: 'forward' | 'backward' | 'bridge' | 'style-ref') => void;
  /** True if at least one OTHER scene in the project has a clip_url (enables Bridge button). */
  hasOtherReadyScenes?: boolean;
  language: string;
}

const SCENE_TYPES: SceneType[] = ['hook', 'problem', 'solution', 'demo', 'social-proof', 'cta', 'custom'];

const sceneTypeColor: Record<SceneType, string> = {
  hook: 'bg-red-500/20 text-red-400',
  problem: 'bg-orange-500/20 text-orange-400',
  solution: 'bg-green-500/20 text-green-400',
  demo: 'bg-blue-500/20 text-blue-400',
  'social-proof': 'bg-purple-500/20 text-purple-400',
  cta: 'bg-primary/20 text-primary',
  custom: 'bg-muted text-muted-foreground',
};

// Text overlay editing has moved to the dedicated "Text & Subtitles" tab.

export default function SceneCard({
  scene,
  index,
  totalScenes,
  projectId,
  characters,
  preferredAspect,
  onUpdate,
  onDelete,
  onMoveUp,
  onMoveDown,
  onHybridExtend,
  hasOtherReadyScenes,
  language,
}: SceneCardProps) {
  const lang = (language === 'es' ? 'es' : language === 'en' ? 'en' : 'de') as 'de' | 'en' | 'es';
  const isStock = scene.clipSource === 'stock' || scene.clipSource === 'stock-image';
  const clipSourceIcon = scene.clipSource.startsWith('ai-') ? Sparkles : isStock ? Video : Upload;
  const ClipIcon = clipSourceIcon;
  const activeChar = scene.characterShot
    ? characters?.find((c) => c.id === scene.characterShot!.characterId)
    : undefined;
  // Library for live mention resolution preview
  const { characters: libCharacters, locations: libLocations } = useMotionStudioLibrary();
  // Stock browser open state
  const [stockBrowserOpen, setStockBrowserOpen] = useState(false);
  // Block K — Style Preset Picker open state
  const [stylePickerOpen, setStylePickerOpen] = useState(false);
  // Block K-5 — Inspire-Me loading flag
  const [inspiring, setInspiring] = useState(false);
  // Block K-6 — Multi-Engine Preview open state
  const [multiEngineOpen, setMultiEngineOpen] = useState(false);
  // Block L — Inline Compare Lab dialog open state
  const [compareLabOpen, setCompareLabOpen] = useState(false);
  // Real-Time Collaboration — comment thread for this scene
  const [commentSheetOpen, setCommentSheetOpen] = useState(false);
  const { data: commentCounts } = useSceneCommentCounts(projectId);
  const sceneCounts = (scene.id && commentCounts?.[scene.id]) || { total: 0, open: 0 };
  const [currentUserId, setCurrentUserId] = useState<string | undefined>(undefined);
  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => setCurrentUserId(data.user?.id));
  }, []);

  // Block K-5: pull system presets to seed inspire variation
  const { systemPresets } = useStylePresets();

  const promptMode: 'free' | 'structured' = scene.promptMode ?? 'free';
  const promptSlots: PromptSlots = scene.promptSlots ?? {};
  const promptSlotOrder = scene.promptSlotOrder;

  // K-P1 — Cmd/Ctrl + Shift + S toggles Free ↔ Structured for the focused card.
  const cardRef = useRef<HTMLDivElement | null>(null);
  const isMac = useMemo(
    () => typeof navigator !== 'undefined' && /Mac/i.test(navigator.platform),
    []
  );
  const shortcutLabel = isMac ? '⌘⇧S' : 'Ctrl+Shift+S';

  const togglePromptMode = () => {
    if (promptMode === 'free') {
      // Free → Structured: naive split (KI-Extractor optional, später)
      const nextSlots = hasAnySlot(promptSlots) ? promptSlots : naiveSplitToSlots(scene.aiPrompt || '');
      onUpdate({ promptMode: 'structured', promptSlots: nextSlots });
    } else {
      // Structured → Free: deterministic stitch (respect custom slot order)
      const stitched = stitchSlots(promptSlots, promptSlotOrder);
      onUpdate({ promptMode: 'free', aiPrompt: stitched || scene.aiPrompt });
    }
  };

  useEffect(() => {
    if (!scene.clipSource.startsWith('ai-')) return;
    const handler = (e: KeyboardEvent) => {
      const mod = isMac ? e.metaKey : e.ctrlKey;
      if (!mod || !e.shiftKey) return;
      if (e.key.toLowerCase() !== 's') return;
      // Only fire when focus is inside this card
      if (!cardRef.current?.contains(document.activeElement)) return;
      e.preventDefault();
      togglePromptMode();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [promptMode, promptSlots, promptSlotOrder, scene.aiPrompt, scene.clipSource, isMac]);

  const handleSlotsChange = (next: PromptSlots) => {
    const stitched = stitchSlots(next, promptSlotOrder);
    onUpdate({ promptSlots: next, aiPrompt: stitched });
  };

  const handleOrderChange = (order: Array<keyof PromptSlots>) => {
    const safeOrder = order.filter((k) => k !== 'negative') as NonNullable<typeof scene.promptSlotOrder>;
    const stitched = stitchSlots(promptSlots, safeOrder);
    onUpdate({ promptSlotOrder: safeOrder, aiPrompt: stitched });
  };

  // Block K-5 — Inspire Me: roll a random scene idea via the edge function.
  // Optionally seeds the AI with a random system preset's name for variation.
  const handleInspireMe = async () => {
    setInspiring(true);
    try {
      const seed =
        systemPresets && systemPresets.length > 0
          ? systemPresets[Math.floor(Math.random() * systemPresets.length)]
          : null;
      const targetModel = clipSourceToModelKey(scene.clipSource) ?? 'ai-sora';
      const { data, error } = await supabase.functions.invoke(
        'structured-prompt-compose',
        {
          body: {
            mode: 'inspire',
            language: lang,
            targetModel,
            seedStyle: seed?.name,
            contextHint: scene.aiPrompt?.slice(0, 400) ?? '',
          },
        }
      );
      if (error) throw error;
      const newSlots: PromptSlots | undefined = data?.slots;
      if (!newSlots || Object.keys(newSlots).length === 0) {
        throw new Error('Empty inspire response');
      }
      // Apply slots + flip to structured mode + sync free-text via stitcher.
      onUpdate({
        promptMode: 'structured',
        promptSlots: newSlots,
        aiPrompt: stitchSlots(newSlots, promptSlotOrder),
        // If the seed brought director modifiers along, apply them too.
        ...(seed?.director_modifiers
          ? { directorModifiers: seed.director_modifiers }
          : {}),
      });
      toast({
        title: lang === 'de' ? '🎲 Neue Szenenidee' : lang === 'es' ? '🎲 Nueva idea de escena' : '🎲 Fresh scene idea',
        description: seed?.name
          ? lang === 'de'
            ? `Inspiriert von „${seed.name}"`
            : lang === 'es'
            ? `Inspirado en "${seed.name}"`
            : `Inspired by "${seed.name}"`
          : undefined,
      });
    } catch (e: any) {
      console.error('[SceneCard] inspire failed', e);
      toast({
        title: lang === 'de' ? 'Inspire fehlgeschlagen' : lang === 'es' ? 'Falló la inspiración' : 'Inspire failed',
        description: e?.message ?? '',
        variant: 'destructive',
      });
    } finally {
      setInspiring(false);
    }
  };


  const handleStockSelect = (item: StockMediaItem) => {
    onUpdate({
      clipSource: item.type === 'video' ? 'stock' : 'stock-image',
      clipUrl: item.url,
      clipStatus: 'ready',
      stockMediaThumb: item.thumbnailUrl || undefined,
      stockMediaSource: item.source === 'upload' ? undefined : item.source,
      stockMediaAuthor: item.authorName ? { name: item.authorName, url: item.authorUrl } : undefined,
      uploadType: item.type,
    });
  };

  return (
    <Card ref={cardRef as any} className="border-border/40 bg-card/80 group overflow-hidden">
      <CardContent className="p-4 overflow-hidden">
        <div className="flex gap-3 min-w-0">
          {/* Drag handle + order */}
          <div className="flex flex-col items-center gap-1 pt-1">
            <GripVertical className="h-4 w-4 text-muted-foreground/40" />
            <span className="text-[10px] font-mono text-muted-foreground">{index + 1}</span>
            <div className="flex flex-col gap-0.5 mt-1">
              <Button size="icon" variant="ghost" className="h-5 w-5" onClick={onMoveUp} disabled={index === 0}>
                <ChevronUp className="h-3 w-3" />
              </Button>
              <Button size="icon" variant="ghost" className="h-5 w-5" onClick={onMoveDown} disabled={index === totalScenes - 1}>
                <ChevronDown className="h-3 w-3" />
              </Button>
            </div>
          </div>

          {/* Content */}
          <div className="flex-1 min-w-0 space-y-3">
            {/* Top row */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Select value={scene.sceneType} onValueChange={(v) => onUpdate({ sceneType: v as SceneType })}>
                  <SelectTrigger className="h-7 w-auto gap-1 text-xs border-none p-0 px-2">
                    <Badge className={`${sceneTypeColor[scene.sceneType]} text-[10px] border-none`}>
                      {SCENE_TYPE_LABELS[scene.sceneType]?.[lang] || scene.sceneType}
                    </Badge>
                  </SelectTrigger>
                  <SelectContent>
                    {SCENE_TYPES.map((t) => (
                      <SelectItem key={t} value={t} className="text-xs">
                        {SCENE_TYPE_LABELS[t]?.[lang] || t}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>

                <span className="text-xs text-muted-foreground">{scene.durationSeconds}s</span>
                <span className="text-[10px] text-primary">€{getClipCost(scene.clipSource, scene.clipQuality || 'standard', scene.durationSeconds).toFixed(2)}</span>
                {scene.characterShot && scene.characterShot.shotType !== 'absent' && (
                  <CharacterShotBadge shot={scene.characterShot} characterName={activeChar?.name} />
                )}
                {scene.hybridMode && (
                  <Badge
                    variant="outline"
                    className="text-[9px] h-4 px-1.5 gap-1 border-primary/40 text-primary"
                    title={
                      lang === 'de'
                        ? 'Hybrid-Szene: Frame-anker zur Quellszene'
                        : lang === 'es'
                        ? 'Escena híbrida: anclada por frame a la escena fuente'
                        : 'Hybrid scene: frame-anchored to source'
                    }
                  >
                    {scene.hybridMode === 'bridge' ? (
                      <Link2 className="h-2.5 w-2.5" />
                    ) : scene.hybridMode === 'style-ref' ? (
                      <Palette className="h-2.5 w-2.5" />
                    ) : (
                      <Link2 className="h-2.5 w-2.5" />
                    )}
                    {scene.hybridMode === 'forward'
                      ? 'Sequel'
                      : scene.hybridMode === 'backward'
                      ? 'Prequel'
                      : scene.hybridMode === 'bridge'
                      ? 'Crossfade'
                      : scene.hybridMode === 'style-ref'
                      ? 'Style-Echo'
                      : scene.hybridMode}
                  </Badge>
                )}
              </div>

              <div className="flex items-center gap-1">
                {scene.id && projectId && (
                  <SceneCommentBadge
                    total={sceneCounts.total}
                    open={sceneCounts.open}
                    onClick={() => setCommentSheetOpen(true)}
                  />
                )}
                <Button size="icon" variant="ghost" className="h-6 w-6 opacity-0 group-hover:opacity-100 text-destructive" onClick={onDelete}>
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </div>
            </div>

            {/* Duration slider */}
            <Slider
              value={[scene.durationSeconds]}
              onValueChange={([v]) => onUpdate({ durationSeconds: v })}
              min={3}
              max={15}
              step={1}
              className="w-full"
            />

            {/* 🎬 Director Mode — Hybrid Production actions (only when source clip is ready) */}
            {onHybridExtend && scene.clipStatus === 'ready' && scene.clipUrl && (
              <div className="flex flex-wrap items-center gap-1.5 pt-1 rounded-md border border-primary/20 bg-gradient-to-r from-primary/5 via-transparent to-primary/5 px-2 py-1.5">
                <span className="text-[9px] uppercase tracking-wider font-semibold text-primary flex items-center gap-1">
                  🎬 {lang === 'de' ? 'Director Mode' : lang === 'es' ? 'Director Mode' : 'Director Mode'}
                </span>
                <Button
                  size="sm"
                  variant="outline"
                  className="h-7 text-[10px] gap-1.5"
                  onClick={() => onHybridExtend('backward')}
                  title={
                    lang === 'de'
                      ? 'Prequel — was passierte vor dieser Szene?'
                      : lang === 'es'
                      ? 'Prequel — ¿qué pasó antes de esta escena?'
                      : 'Prequel — what happened before this scene?'
                  }
                >
                  <ArrowLeft className="h-3 w-3" />
                  {lang === 'de' ? 'Prequel' : lang === 'es' ? 'Prequel' : 'Prequel'}
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  className="h-7 text-[10px] gap-1.5"
                  onClick={() => onHybridExtend('forward')}
                  title={
                    lang === 'de'
                      ? 'Sequel — wie geht die Szene weiter?'
                      : lang === 'es'
                      ? 'Sequel — ¿cómo continúa la escena?'
                      : 'Sequel — how does the scene continue?'
                  }
                >
                  <ArrowRight className="h-3 w-3" />
                  {lang === 'de' ? 'Sequel' : lang === 'es' ? 'Sequel' : 'Sequel'}
                </Button>
                {hasOtherReadyScenes && (
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-7 text-[10px] gap-1.5"
                    onClick={() => onHybridExtend('bridge')}
                    title={
                      lang === 'de'
                        ? 'Crossfade — morphender Übergang in eine andere Szene'
                        : lang === 'es'
                        ? 'Crossfade — transición con morphing hacia otra escena'
                        : 'Crossfade — morphing transition to another scene'
                    }
                  >
                    <Link2 className="h-3 w-3" />
                    {lang === 'de' ? 'Crossfade' : lang === 'es' ? 'Crossfade' : 'Crossfade'}
                  </Button>
                )}
                <Button
                  size="sm"
                  variant="outline"
                  className="h-7 text-[10px] gap-1.5"
                  onClick={() => onHybridExtend('style-ref')}
                  title={
                    lang === 'de'
                      ? 'Style-Echo — neue Szene, gleiche Bildsprache'
                      : lang === 'es'
                      ? 'Style-Echo — nueva escena, mismo lenguaje visual'
                      : 'Style-Echo — new scene, same visual language'
                  }
                >
                  <Palette className="h-3 w-3" />
                  {lang === 'de' ? 'Style-Echo' : lang === 'es' ? 'Style-Echo' : 'Style-Echo'}
                </Button>
              </div>
            )}
            {/* Clip source — 3 compact tabs (Stock / KI / Upload) + KI-Modell-Dropdown */}
            {(() => {
              const isAi = scene.clipSource.startsWith('ai-');
              const isStockImage = scene.clipSource === 'stock-image';
              const isUpload = scene.clipSource === 'upload';
              const sourceMode: 'stock' | 'ai' | 'upload' = isAi ? 'ai' : isUpload ? 'upload' : 'stock';
              const currentModelId = isAi ? sourceToModelId(scene.clipSource, scene.clipQuality) : '';

              const tabs: Array<{ id: 'stock' | 'ai' | 'upload'; label: string }> = [
                { id: 'stock',  label: lang === 'de' ? '🎁 Stock'        : lang === 'es' ? '🎁 Stock' : '🎁 Stock' },
                { id: 'ai',     label: lang === 'de' ? '🤖 KI-Generiert' : lang === 'es' ? '🤖 IA'    : '🤖 AI-Generated' },
                { id: 'upload', label: lang === 'de' ? '⬆ Eigenes'      : lang === 'es' ? '⬆ Propio' : '⬆ Upload' },
              ];

              const handleTabChange = (id: 'stock' | 'ai' | 'upload') => {
                if (id === 'stock') {
                  const next: ClipSource = isStockImage ? 'stock-image' : 'stock';
                  onUpdate({ clipSource: next });
                  setStockBrowserOpen(true);
                } else if (id === 'upload') {
                  onUpdate({ clipSource: 'upload' });
                } else if (!isAi) {
                  onUpdate({ clipSource: 'ai-hailuo', clipQuality: scene.clipQuality ?? 'standard' });
                }
              };

              return (
                <div className="space-y-2">
                  <div className="flex gap-1.5 p-1 rounded-lg bg-card/40 border border-border/40">
                    {tabs.map((tab) => {
                      const active = sourceMode === tab.id;
                      const isStockTab = tab.id === 'stock';
                      return (
                        <button
                          key={tab.id}
                          onClick={() => handleTabChange(tab.id)}
                          className={`flex-1 px-2.5 py-1.5 rounded-md text-[11px] font-medium transition-all flex items-center justify-center gap-1.5 ${
                            active
                              ? isStockTab
                                ? 'bg-emerald-500/15 text-emerald-300 ring-1 ring-emerald-500/40'
                                : tab.id === 'ai'
                                  ? 'bg-primary/15 text-primary ring-1 ring-primary/40'
                                  : 'bg-muted text-foreground ring-1 ring-border'
                              : 'text-muted-foreground hover:text-foreground hover:bg-card/60'
                          }`}
                        >
                          {tab.label}
                          {isStockTab && active && (
                            <span className="ml-0.5 px-1 rounded bg-emerald-500/25 text-emerald-200 text-[8px] font-semibold uppercase tracking-wide">
                              Free
                            </span>
                          )}
                        </button>
                      );
                    })}
                  </div>

                  {sourceMode === 'stock' && (
                    <div className="flex gap-1.5">
                      {([
                        { src: 'stock' as ClipSource,       label: lang === 'de' ? 'Video' : lang === 'es' ? 'Vídeo' : 'Video', icon: Video },
                        { src: 'stock-image' as ClipSource, label: lang === 'de' ? 'Bild'  : lang === 'es' ? 'Imagen' : 'Image', icon: ImageIcon },
                      ]).map((opt) => {
                        const active = scene.clipSource === opt.src;
                        const Icon = opt.icon;
                        return (
                          <button
                            key={opt.src}
                            onClick={() => { onUpdate({ clipSource: opt.src }); setStockBrowserOpen(true); }}
                            className={`px-2.5 py-1 rounded-md text-[10px] border transition-all flex items-center gap-1.5 ${
                              active
                                ? 'border-emerald-500/60 bg-emerald-500/10 text-emerald-300'
                                : 'border-border/40 text-muted-foreground hover:border-border'
                            }`}
                          >
                            <Icon className="h-2.5 w-2.5" />
                            {opt.label}
                          </button>
                        );
                      })}
                    </div>
                  )}

                  {sourceMode === 'ai' && (
                    <div className="space-y-1">
                      <Label className="text-[10px] text-muted-foreground">
                        {lang === 'de' ? 'KI-Modell · Qualität & Preis im Dropdown' : lang === 'es' ? 'Modelo IA' : 'AI Model'}
                      </Label>
                      <ModelSelector
                        value={currentModelId}
                        onChange={(modelId) => {
                          const next = modelIdToSource(modelId);
                          onUpdate({ clipSource: next.clipSource, clipQuality: next.clipQuality });
                        }}
                        currency="EUR"
                        hasSora2Access={true}
                        models={COMPOSER_AVAILABLE_MODELS}
                        className="h-11 bg-card/60 backdrop-blur-sm border-border/60 hover:border-primary/40 transition-colors text-xs"
                      />
                    </div>
                  )}
                </div>
              );
            })()}

            {/* Effects badges (AI-selected procedural effects layered above the clip) */}
            {scene.effects && scene.effects.length > 0 && (
              <div className="flex flex-wrap gap-1.5 items-center">
                <span className="text-[9px] uppercase tracking-wider text-muted-foreground/70 flex items-center gap-1">
                  <Wand2 className="h-2.5 w-2.5" />
                  Effekte
                </span>
                {scene.effects.map((eff, i) => (
                  <Badge
                    key={`${eff.id}-${i}`}
                    variant="outline"
                    className="text-[9px] px-1.5 py-0 h-4 border-amber-500/30 bg-amber-500/5 text-amber-300/90"
                  >
                    {eff.id}
                  </Badge>
                ))}
              </div>
            )}

            {/* Character Shot picker — only when characters are defined in the briefing AND it's an AI scene */}
            {scene.clipSource.startsWith('ai-') && characters && characters.length > 0 && (
              <CharacterShotPicker
                characters={characters}
                value={scene.characterShot}
                onChange={(next) => onUpdate({ characterShot: next })}
              />
            )}
            {scene.clipSource.startsWith('ai-') && (
              <div className="space-y-2">
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between gap-2">
                    <Label className="text-[10px] text-muted-foreground">
                      {lang === 'de'
                        ? 'KI-Prompt (EN) — bearbeitbar'
                        : lang === 'es'
                        ? 'Prompt IA (EN) — editable'
                        : 'AI Prompt (EN) — editable'}
                    </Label>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-5 px-2 text-[9px] gap-1 text-primary/80 hover:text-primary"
                      onClick={togglePromptMode}
                      title={`${lang === 'de' ? 'Modus wechseln' : lang === 'es' ? 'Cambiar modo' : 'Switch mode'} (${shortcutLabel})`}
                    >
                      {promptMode === 'free'
                        ? (lang === 'de' ? '🧱 Strukturiert' : lang === 'es' ? '🧱 Estructurado' : '🧱 Structured')
                        : (lang === 'de' ? '📝 Freitext' : lang === 'es' ? '📝 Texto libre' : '📝 Free text')}
                    </Button>
                  </div>

                  {promptMode === 'free' ? (
                    <>
                      <PromptMentionEditor
                        value={scene.aiPrompt || ''}
                        onChange={(v) => onUpdate({ aiPrompt: v })}
                        placeholder={
                          lang === 'de'
                            ? 'Describe the scene… nutze @charakter und @location aus deiner Library'
                            : lang === 'es'
                            ? 'Describe la escena… usa @personaje y @ubicación de tu biblioteca'
                            : 'Describe the scene visually… use @character and @location from your library'
                        }
                        rows={3}
                      />
                      <p className="text-[10px] leading-relaxed text-muted-foreground/80 italic">
                        {lang === 'de'
                          ? 'ℹ️ Tippe @ um Charaktere & Locations zu taggen. Untertitel werden automatisch ausgeschlossen — füge sie im Tab „Voiceover & Untertitel" hinzu.'
                          : lang === 'es'
                          ? 'ℹ️ Escribe @ para etiquetar personajes y ubicaciones. Los subtítulos se excluyen automáticamente — añádelos en la pestaña "Voz y subtítulos".'
                          : 'ℹ️ Type @ to tag characters & locations. Subtitles are automatically excluded — add them in the "Voice & Subtitles" tab.'}
                      </p>
                    </>
                  ) : (
                    <StructuredPromptBuilder
                      slots={promptSlots}
                      onChange={handleSlotsChange}
                      clipSource={scene.clipSource}
                      contextHint={scene.aiPrompt}
                      composedPrompt={stitchSlots(promptSlots, promptSlotOrder)}
                      language={lang}
                      order={promptSlotOrder}
                      onOrderChange={handleOrderChange}
                      onOpenStylePresets={() => setStylePickerOpen(true)}
                      onSavePreset={() => setStylePickerOpen(true)}
                      onInspireMe={inspiring ? undefined : handleInspireMe}
                    />
                  )}
                </div>

                {/* Block K-6 — Multi-Engine Preview (only in structured mode with content) */}
                {promptMode === 'structured' && hasAnySlot(promptSlots) && (
                  <div className="space-y-1">
                    <button
                      type="button"
                      onClick={() => setMultiEngineOpen((v) => !v)}
                      className="text-[10px] text-primary/80 hover:text-primary flex items-center gap-1"
                    >
                      <Sparkles className="h-2.5 w-2.5" />
                      {multiEngineOpen
                        ? lang === 'de'
                          ? 'Multi-Engine ausblenden'
                          : lang === 'es'
                          ? 'Ocultar multi-motor'
                          : 'Hide multi-engine'
                        : lang === 'de'
                        ? 'Multi-Engine Vorschau anzeigen'
                        : lang === 'es'
                        ? 'Mostrar vista multi-motor'
                        : 'Show multi-engine preview'}
                    </button>
                    {multiEngineOpen && (
                      <MultiEnginePromptPreview
                        slots={promptSlots}
                        language={lang}
                        order={promptSlotOrder}
                        defaultModel={clipSourceToModelKey(scene.clipSource) ?? 'ai-sora'}
                      />
                    )}
                  </div>
                )}

                {/* Block L — Inline Compare Lab launcher */}
                {(scene.aiPrompt?.trim() || hasAnySlot(promptSlots)) && (
                  <div className="pt-1">
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      onClick={() => setCompareLabOpen(true)}
                      className="h-7 text-[10px] gap-1.5"
                    >
                      <Beaker className="h-3 w-3" />
                      {lang === 'de'
                        ? 'Auf Engines vergleichen'
                        : lang === 'es'
                        ? 'Comparar en motores'
                        : 'Compare on engines'}
                    </Button>
                  </div>
                )}

                <StylePresetPicker
                  open={stylePickerOpen}
                  onOpenChange={setStylePickerOpen}
                  currentSlots={promptSlots}
                  currentModifiers={scene.directorModifiers || {}}
                  onApply={(preset) => {
                    onUpdate({
                      promptMode: 'structured',
                      promptSlots: preset.slots,
                      directorModifiers: preset.director_modifiers,
                      appliedStylePresetId: preset.id,
                      aiPrompt: stitchSlots(preset.slots, promptSlotOrder),
                    });
                  }}
                  language={lang}
                />


                <DirectorPresetPicker
                  modifiers={scene.directorModifiers || {}}
                  basePrompt={scene.aiPrompt || ''}
                  onChange={(directorModifiers) => onUpdate({ directorModifiers })}
                />

                <CinematicStylePresets
                  value={scene.shotDirector || {}}
                  onApply={(sel) => onUpdate({ shotDirector: sel })}
                  compact
                />

                <SceneShotDirectorPanel
                  value={scene.shotDirector || {}}
                  onChange={(shotDirector) => onUpdate({ shotDirector })}
                  language={lang}
                />

                {(() => {
                  const hasMods = scene.directorModifiers && Object.values(scene.directorModifiers).some(Boolean);
                  const hasShot = scene.shotDirector && Object.values(scene.shotDirector).some(Boolean);
                  const resolved = resolveMentions(scene.aiPrompt || '', libCharacters, libLocations);
                  const hasMentions = resolved.matches.length > 0;
                  if (!hasMods && !hasMentions && !hasShot) return null;
                  const withMods = applyDirectorModifiers(resolved.prompt, scene.directorModifiers || {});
                  const shotSuffix = buildShotPromptSuffix(scene.shotDirector || {});
                  const finalPrompt = [withMods, shotSuffix].filter(Boolean).join(' ');
                  return (
                    <div className="rounded-md border border-dashed border-primary/30 bg-background/40 p-2">
                      <div className="flex items-center justify-between mb-1">
                        <Label className="text-[10px] text-muted-foreground">
                          {lang === 'de' ? 'Finaler Prompt (Vorschau)' : lang === 'es' ? 'Prompt final (vista previa)' : 'Final prompt (preview)'}
                        </Label>
                        {resolved.referenceImageUrl && (
                          <Badge variant="outline" className="text-[8px] h-3 px-1 border-primary/40 text-primary">
                            i2v ref
                          </Badge>
                        )}
                      </div>
                      <p className="text-[10px] font-mono leading-relaxed text-foreground/80 break-words whitespace-pre-line">
                        {finalPrompt}
                      </p>
                    </div>
                  );
                })()}

              </div>
            )}

            {(scene.clipSource === 'stock' || scene.clipSource === 'stock-image') && (
              <div className="space-y-2 rounded-md border border-emerald-500/30 bg-emerald-500/5 p-2">
                <div className="flex items-center gap-1.5 text-[10px] text-emerald-300/90">
                  <span>🎁</span>
                  <span className="font-medium">Free Stock Library</span>
                  <span className="text-emerald-300/60">· Pexels × Pixabay · 0 Credits</span>
                </div>
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-1.5 min-w-0">
                    {scene.stockMediaThumb || scene.clipUrl ? (
                      <img
                        src={scene.stockMediaThumb || scene.clipUrl}
                        alt="stock thumbnail"
                        className="w-10 h-7 rounded object-cover flex-shrink-0"
                      />
                    ) : (
                      <div className="w-10 h-7 rounded bg-muted/40 flex items-center justify-center flex-shrink-0">
                        {scene.clipSource === 'stock' ? <Video className="h-3 w-3 text-muted-foreground" /> : <ImageIcon className="h-3 w-3 text-muted-foreground" />}
                      </div>
                    )}
                    <div className="min-w-0">
                      <p className="text-[10px] text-muted-foreground truncate">
                        {scene.clipUrl
                          ? (scene.stockMediaAuthor?.name
                              ? `${scene.stockMediaSource} · ${scene.stockMediaAuthor.name}`
                              : 'Stock ausgewählt')
                          : (scene.clipSource === 'stock' ? 'Kein Video gewählt' : 'Kein Bild gewählt')}
                      </p>
                    </div>
                  </div>
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-7 text-[10px] gap-1 border-emerald-500/40 hover:bg-emerald-500/10 hover:border-emerald-500/70"
                    onClick={() => setStockBrowserOpen(true)}
                  >
                    <Video className="h-3 w-3" />
                    Bibliothek öffnen
                  </Button>
                </div>
                <Input
                  value={scene.stockKeywords || ''}
                  onChange={(e) => onUpdate({ stockKeywords: e.target.value })}
                  placeholder="Optional: Suchbegriffe für AI-Auto-Pick"
                  className="text-xs bg-background/50 h-7"
                />
              </div>
            )}

            {scene.clipSource === 'upload' && (
              <SceneMediaUpload
                projectId={projectId}
                sceneId={scene.id}
                uploadUrl={scene.uploadUrl}
                uploadType={scene.uploadType}
                onChange={(url, type) =>
                  onUpdate({
                    uploadUrl: url ?? undefined,
                    uploadType: type ?? undefined,
                    clipUrl: url ?? undefined,
                    clipStatus: url ? 'ready' : 'pending',
                  })
                }
              />
            )}

            {/* Universal Reference Image — available in every clip-source mode */}
            <div className="space-y-1.5 pt-1 border-t border-border/30">
              <div className="text-[10px] text-muted-foreground/80 leading-snug">
                {scene.clipSource.startsWith('ai-')
                  ? (lang === 'de'
                      ? 'Optionales Referenzbild — die KI orientiert sich daran (Image-to-Video).'
                      : lang === 'es'
                      ? 'Imagen de referencia opcional — la IA se basa en ella (Image-to-Video).'
                      : 'Optional reference image — the AI uses it as visual guide (image-to-video).')
                  : (lang === 'de'
                      ? 'Optionales Referenzbild — wird für Continuity, Brand-Character-Sync und spätere KI-Übergänge verwendet.'
                      : lang === 'es'
                      ? 'Imagen de referencia opcional — usada para continuidad, sincronización de personajes y transiciones IA.'
                      : 'Optional reference image — used for continuity, brand-character sync and later AI transitions.')}
              </div>
              <SceneReferenceImageUpload
                projectId={projectId}
                sceneId={scene.id}
                referenceImageUrl={scene.referenceImageUrl}
                onChange={(url) => onUpdate({ referenceImageUrl: url ?? undefined })}
              />
            </div>

            {/* Transitions disabled in Composer — handled in Director's Cut */}
            <div
              className="flex items-center gap-1.5 px-2 py-1 rounded bg-muted/40 border border-border/30"
              title="Übergänge werden im Universal Director's Cut nachträglich hinzugefügt (sauberer & flexibler)."
            >
              <span className="text-[10px] text-muted-foreground">
                Harter Schnitt → Übergänge im Director's Cut
              </span>
            </div>
          </div>

          {/* Thumbnail preview */}
          <div className="w-24 h-16 rounded bg-muted/30 border border-border/20 flex items-center justify-center flex-shrink-0 overflow-hidden">
            {(scene.uploadType === 'image' || scene.clipSource === 'ai-image' || scene.clipSource === 'stock-image') && (scene.clipUrl || scene.uploadUrl) ? (
              <img src={scene.clipUrl || scene.uploadUrl} alt="" className="w-full h-full object-cover" />
            ) : scene.clipUrl ? (
              <video src={scene.clipUrl} className="w-full h-full object-cover" muted />
            ) : scene.uploadUrl ? (
              <video src={scene.uploadUrl} className="w-full h-full object-cover" muted />
            ) : (
              <ClipIcon className="h-5 w-5 text-muted-foreground/30" />
            )}
          </div>
        </div>
      </CardContent>

      {/* Stock Media Browser modal */}
      <StockMediaBrowser
        open={stockBrowserOpen}
        onOpenChange={setStockBrowserOpen}
        initialType={scene.clipSource === 'stock-image' ? 'image' : 'video'}
        preferredAspect={preferredAspect}
        onSelect={handleStockSelect}
      />

      {/* Block L — Inline Compare Lab Dialog */}
      <Dialog open={compareLabOpen} onOpenChange={setCompareLabOpen}>
        <DialogContent className="max-w-5xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Beaker className="h-5 w-5 text-primary" />
              {lang === 'de'
                ? `Compare Lab — Szene ${index + 1}`
                : lang === 'es'
                ? `Compare Lab — Escena ${index + 1}`
                : `Compare Lab — Scene ${index + 1}`}
            </DialogTitle>
            <DialogDescription>
              {lang === 'de'
                ? 'Vergleiche denselben Prompt parallel auf bis zu 6 KI-Video-Engines. Wähle einen Sieger und übernimm ihn in deine Szene.'
                : lang === 'es'
                ? 'Compara el mismo prompt en hasta 6 motores de vídeo IA en paralelo. Elige un ganador y aplícalo a tu escena.'
                : 'Compare the same prompt across up to 6 AI video engines in parallel. Pick a winner and apply it to your scene.'}
            </DialogDescription>
          </DialogHeader>
          <CompareLabGrid
            initialPrompt={
              promptMode === 'structured'
                ? stitchSlots(promptSlots, promptSlotOrder)
                : (scene.aiPrompt ?? '')
            }
            initialAspectRatio={
              preferredAspect === '4:5' ? '1:1' : (preferredAspect ?? '16:9') as '16:9' | '9:16' | '1:1'
            }
            composerSceneId={scene.id}
            onWinnerSelected={(_engine, videoUrl) => {
              if (videoUrl) {
                onUpdate({
                  clipSource: 'upload',
                  uploadUrl: videoUrl,
                  uploadType: 'video',
                });
                toast({
                  title: lang === 'de' ? 'Sieger übernommen' : lang === 'es' ? 'Ganador aplicado' : 'Winner applied',
                  description:
                    lang === 'de'
                      ? 'Das gewählte Video wurde der Szene zugewiesen.'
                      : lang === 'es'
                      ? 'El vídeo seleccionado se asignó a la escena.'
                      : 'The selected video has been assigned to the scene.',
                });
                setCompareLabOpen(false);
              }
            }}
          />
        </DialogContent>
      </Dialog>
      {scene.id && projectId && (
        <SceneCommentSheet
          open={commentSheetOpen}
          onOpenChange={setCommentSheetOpen}
          sceneId={scene.id}
          projectId={projectId}
          sceneLabel={`Scene ${index + 1}`}
          currentUserId={currentUserId}
          canEdit={true}
        />
      )}
    </Card>
  );
}
