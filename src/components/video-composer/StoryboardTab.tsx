import { useState, useEffect, useMemo } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Plus, ArrowRight, Sparkles, ChevronDown, ChevronUp, Mic, Library, Image as ImageIcon, Loader2 } from 'lucide-react';
import SceneCard from './SceneCard';
import SceneCutDriftIndicator from './SceneCutDriftIndicator';
import HybridExtendDialog from './HybridExtendDialog';
import TalkingHeadDialog from './TalkingHeadDialog';
import SceneSnippetPicker from '@/components/motion-studio/SceneSnippetPicker';
import type { SceneSnippet } from '@/types/motion-studio';
import type { ComposerScene, ClipSource, ComposerCharacter } from '@/types/video-composer';
import { DEFAULT_TEXT_OVERLAY, DEFAULT_ASSEMBLY_CONFIG, getClipCost, getClipRate } from '@/types/video-composer';
import {
  MAX_PROJECT_SECONDS,
  MIN_SCENE_SECONDS,
  canAddScene,
  formatDuration,
  sumAllScenesDuration,
  sumOtherScenesDuration,
  budgetTone,
} from '@/lib/composer/budget';
import { useTranslation } from '@/hooks/useTranslation';
import { useComposerHistoryContext } from './ComposerHistoryContext';
import { sceneToSnakeSnapshot } from '@/lib/video-composer/sceneSnapshot';
import { CastConsistencyMap } from './CastConsistencyMap';
import DriftReportPanel from './briefing/DriftReportPanel';
import StoryboardLeftPane, { type LeftPaneMode } from './StoryboardLeftPane';
import StoryboardScenePlayerList from './StoryboardScenePlayerList';
import SceneStyleMode from './SceneStyleMode';
import SceneAvatarMode from './SceneAvatarMode';
import { useSceneGenerate } from '@/hooks/useSceneGenerate';
import { useSceneRenderConfirm } from '@/lib/composer/sceneRenderConfirm';
import { useGenerateAllClips } from '@/hooks/useGenerateAllClips';
import PipelineProgressBar from './PipelineProgressBar';
import StageStoryboardLoader from './stage/StageStoryboardLoader';
import StageStoryboardError from './stage/StageStoryboardError';
import StagePanel from './stage/StagePanel';

import { Play, CheckCircle2 } from 'lucide-react';

const SCENE_TYPE_LABEL_DE: Record<string, string> = {
  hook: 'Hook',
  problem: 'Problem',
  solution: 'Lösung',
  demo: 'Demo',
  'social-proof': 'Social Proof',
  cta: 'CTA',
  custom: 'Custom',
};

interface StoryboardTabProps {
  scenes: ComposerScene[];
  onUpdateScenes: (scenes: ComposerScene[]) => void;
  /**
   * Inserts a new scene directly into the DB so it survives realtime
   * refetches. Falls back to local-only when the project hasn't been
   * persisted yet.
   */
  onAddScene?: (partial: Partial<ComposerScene>) => Promise<string | undefined> | void;
  /** Inserts N sub-scenes immediately after `parentSceneId`, optionally
   *  removing the parent (used by SceneDialogStudio for SRS lip-sync). */
  onInsertScenesAfter?: (
    parentSceneId: string,
    partials: Partial<ComposerScene>[],
    opts?: { removeParent?: boolean },
  ) => Promise<(string | undefined)[]>;
  onGoToClips: () => void;
  language: string;
  projectId?: string;
  characters?: ComposerCharacter[];
  /** Called when the Talking-Head dialog adds a new character to the briefing. */
  onAddCharacter?: (character: ComposerCharacter) => void;
  preferredAspect?: '16:9' | '9:16' | '1:1' | '4:5';
  /**
   * Block M — Hybrid Extend uses the server-side orchestrator which inserts
   * a new scene row directly. The dashboard must refetch from DB to surface it.
   */
  onRefetchScenes?: () => void | Promise<void>;
  /** Auto-persist hook — saves the project to DB and returns the fresh projectId + scene rows. */
  onEnsurePersisted?: () => Promise<{ projectId: string; scenes: ComposerScene[] }>;
  /** True while the AI is generating the initial storyboard from the
   *  briefing. Shows a loading panel instead of the empty-state. */
  isGeneratingStoryboard?: boolean;
  /** Last storyboard-generation failure (from BriefingTab). When set and
   *  scenes are empty, the Storyboard tab renders an error panel with a
   *  retry button instead of the "no scenes" empty state. */
  storyboardError?: { message: string; retryable?: boolean } | null;
  /** Re-invokes the storyboard generation pipeline with the current briefing. */
  onRetryStoryboard?: () => void;
  /** Switches the parent dashboard back to the Briefing tab so the user
   *  can adjust their inputs. */
  onBackToBriefing?: () => void;
}

export default function StoryboardTab({
  scenes,
  onUpdateScenes,
  onAddScene,
  onInsertScenesAfter,
  onGoToClips,
  language,
  projectId,
  characters,
  onAddCharacter,
  preferredAspect,
  onRefetchScenes,
  onEnsurePersisted,
  isGeneratingStoryboard = false,
  storyboardError = null,
  onRetryStoryboard,
  onBackToBriefing,
}: StoryboardTabProps) {
  const { t } = useTranslation();

  // Defensive: filter out cast entries with no usable `name`.
  // A single library asset that lost its name (e.g. legacy import,
  // mid-edit draft, LLM-generated character row without a name) used to
  // crash the entire Storyboard tab via deeply-nested `.name.toLowerCase()`
  // calls — especially at 4-character casts where one entry is often empty.
  // Single source of truth so every child gets the same sanitized list.
  // FROZEN — see mem/architecture/lipsync/FROZEN-INVARIANTS.md (I.7)
  // Every child below MUST receive `safeCharacters`, never raw `characters`.
  const safeCharacters = useMemo<ComposerCharacter[]>(
    () =>
      (characters ?? []).filter(
        (c): c is ComposerCharacter =>
          !!c && typeof c.name === 'string' && c.name.trim().length > 0,
      ),
    [characters],
  );
  const droppedCharacterCount = (characters?.length ?? 0) - safeCharacters.length;
  useEffect(() => {
    if (droppedCharacterCount > 0) {
      // Soft warning only — no toast spam on every re-render.
      console.warn(
        '[StoryboardTab] ignored',
        droppedCharacterCount,
        'character(s) without a name to keep the storyboard renderable.',
      );
    }
  }, [droppedCharacterCount]);

  // Master "Alle Clips generieren" — replaces the old "→ Clips generieren" tab
  // navigation. Uses the same proven pipeline as ClipsTab (extracted hook).
  const {
    generateAll,
    isGeneratingAll,
    pendingScenes,
    readyCount,
    generatingCount,
    remainingCost,
    allReady,
  } = useGenerateAllClips({
    scenes,
    projectId,
    characters: safeCharacters,
    onUpdateScenes,
    onEnsurePersisted,
    language,
  });
  const TIPS_KEY = 'video-composer-storyboard-tips-collapsed';
  const [tipsCollapsed, setTipsCollapsed] = useState<boolean>(() => {
    try { return localStorage.getItem(TIPS_KEY) === '1'; } catch { return false; }
  });
  useEffect(() => {
    try { localStorage.setItem(TIPS_KEY, tipsCollapsed ? '1' : '0'); } catch { /* ignore */ }
  }, [tipsCollapsed]);

  // Phase 2 — Frame-First Mode toggle (Artlist-style two-step workflow)
  const FRAME_FIRST_KEY = 'video-composer-frame-first-mode';
  const [frameFirstMode, setFrameFirstMode] = useState<boolean>(() => {
    try { return localStorage.getItem(FRAME_FIRST_KEY) === '1'; } catch { return false; }
  });
  useEffect(() => {
    try { localStorage.setItem(FRAME_FIRST_KEY, frameFirstMode ? '1' : '0'); } catch { /* ignore */ }
  }, [frameFirstMode]);

  // Block M — Hybrid Extend dialog state
  const [hybridDialog, setHybridDialog] = useState<{
    open: boolean;
    scene: ComposerScene | null;
    mode: 'forward' | 'backward' | 'bridge' | 'style-ref';
  }>({ open: false, scene: null, mode: 'forward' });

  // Block Q — Talking-Head dialog state
  const [talkingHeadOpen, setTalkingHeadOpen] = useState(false);

  // Scene Library (snippets)
  const [snippetPickerOpen, setSnippetPickerOpen] = useState(false);

  /**
   * Build a partial scene that inherits creative defaults (style, shot,
   * transition, clip-source, duration, …) from the LAST existing scene so
   * a newly added scene visually matches its siblings. Prompt fields are
   * always cleared so the user can start fresh — including via the prompt
   * generator inside the SceneCard.
   */
  const buildInheritedDefaults = (override: Partial<ComposerScene> = {}): Partial<ComposerScene> => {
    const last = scenes.length > 0 ? scenes[scenes.length - 1] : undefined;
    if (!last) return override;
    return {
      // Look & feel
      clipSource: last.clipSource,
      clipQuality: last.clipQuality,
      durationSeconds: last.durationSeconds,
      withAudio: last.withAudio,
      transitionType: last.transitionType,
      transitionDuration: last.transitionDuration,
      shotDirector: last.shotDirector ? { ...last.shotDirector } : undefined,
      directorModifiers: last.directorModifiers ? { ...last.directorModifiers } : undefined,
      cinematicPresetSlug: last.cinematicPresetSlug,
      appliedStylePresetId: last.appliedStylePresetId,
      // Empty text overlay (same style, no copy)
      textOverlay: { ...(last.textOverlay ?? {}), text: '' } as any,
      // Always-empty prompt fields
      aiPrompt: '',
      promptSlots: undefined,
      promptMode: undefined,
      promptSlotOrder: undefined,
      stockKeywords: undefined,
      uploadUrl: undefined,
      uploadType: undefined,
      referenceImageUrl: undefined,
      ...override,
    };
  };

  const insertSnippet = (snippet: SceneSnippet) => {
    const partial = buildInheritedDefaults({
      durationSeconds: snippet.duration_seconds ?? 5,
      clipSource: 'stock',
      aiPrompt: snippet.prompt,
      referenceImageUrl: snippet.reference_image_url ?? snippet.last_frame_url ?? undefined,
    });
    if (onAddScene) {
      void onAddScene(partial);
    } else {
      // Fallback for legacy callers
      const newScene: ComposerScene = {
        id: `scene_${Date.now()}`,
        projectId: projectId ?? '',
        orderIndex: scenes.length,
        sceneType: 'custom',
        durationSeconds: 5,
        clipSource: 'stock',
        clipQuality: 'standard',
        clipStatus: 'pending',
        textOverlay: { ...DEFAULT_TEXT_OVERLAY },
        transitionType: 'none',
        transitionDuration: 0,
        retryCount: 0,
        costEuros: 0,
        ...partial,
      } as ComposerScene;
      onUpdateScenes([...scenes, newScene]);
    }
  };

  const openHybridDialog = (
    scene: ComposerScene,
    mode: 'forward' | 'backward' | 'bridge' | 'style-ref'
  ) => {
    setHybridDialog({ open: true, scene, mode });
  };

  const dialogLang = (language === 'es' ? 'es' : language === 'en' ? 'en' : 'de') as 'de' | 'en' | 'es';

  const addScene = () => {
    const partial = buildInheritedDefaults();
    if (onAddScene) {
      void onAddScene(partial);
      return;
    }
    // Fallback: legacy local-only insert
    const newScene: ComposerScene = {
      id: `scene_${Date.now()}`,
      projectId: '',
      orderIndex: scenes.length,
      sceneType: 'custom',
      durationSeconds: 5,
      clipSource: 'stock',
      clipQuality: 'standard',
      clipStatus: 'pending',
      textOverlay: { ...DEFAULT_TEXT_OVERLAY },
      transitionType: 'none',
      transitionDuration: 0,
      retryCount: 0,
      costEuros: 0,
      ...partial,
    } as ComposerScene;
    onUpdateScenes([...scenes, newScene]);
  };

  const updateScene = (id: string, updates: Partial<ComposerScene>) => {
    let invalidatedAiClip = false;
    onUpdateScenes(
      scenes.map((s) => {
        if (s.id !== id) return s;
        const updated: ComposerScene = { ...s, ...updates };

        // Engine-Wechsel auf einer KI-generierten Szene → bestehenden Clip
        // invalidieren, damit "Alle generieren" im Clips-Tab die Szene wieder
        // aufgreift und mit dem neuen Modell rendert.
        const sourceChanged =
          updates.clipSource !== undefined && updates.clipSource !== s.clipSource;
        const wasAiClip = (s.clipSource || '').startsWith('ai-');
        const newIsAi = (updated.clipSource || '').startsWith('ai-');
        if (sourceChanged && wasAiClip && newIsAi && s.clipStatus === 'ready') {
          updated.clipStatus = 'pending';
          updated.clipUrl = undefined;
          (updated as any).replicatePredictionId = undefined;
          (updated as any).uploadType = undefined;
          invalidatedAiClip = true;
        }

        if (updates.clipSource || updates.durationSeconds || updates.clipQuality) {
          updated.costEuros = getClipCost(
            updated.clipSource,
            updated.clipQuality || 'standard',
            updated.durationSeconds
          );
        }
        return updated;
      })
    );
    if (invalidatedAiClip) {
      // Lazy-import to avoid pulling sonner into module init
      import('sonner').then(({ toast }) => {
        toast.info('Engine geändert', {
          description: 'Szene wird mit dem neuen Modell neu generiert, sobald du auf „Alle generieren" klickst.',
        });
      });
    }
  };

  /**
   * Bulk-Action: aktuellen Engine (clipSource + clipQuality) der ersten Szene
   * auf alle anderen KI-Szenen übertragen. Spart Klicks bei vielen Szenen.
   * Stock- und Upload-Szenen bleiben unangetastet.
   */
  const applyEngineToAll = () => {
    const first = scenes[0];
    if (!first || !first.clipSource?.startsWith('ai-')) return;
    let changed = 0;
    const next = scenes.map((s, idx) => {
      if (idx === 0) return s;
      if (!s.clipSource?.startsWith('ai-')) return s;
      if (s.clipSource === first.clipSource && s.clipQuality === first.clipQuality) return s;
      changed++;
      const updated: ComposerScene = {
        ...s,
        clipSource: first.clipSource,
        clipQuality: first.clipQuality,
      };
      if (s.clipStatus === 'ready') {
        updated.clipStatus = 'pending';
        updated.clipUrl = undefined;
        (updated as any).replicatePredictionId = undefined;
        (updated as any).uploadType = undefined;
      }
      updated.costEuros = getClipCost(
        updated.clipSource,
        updated.clipQuality || 'standard',
        updated.durationSeconds
      );
      return updated;
    });
    if (changed === 0) return;
    onUpdateScenes(next);
    import('sonner').then(({ toast }) => {
      toast.success(`Engine auf ${changed} Szene${changed === 1 ? '' : 'n'} übertragen`);
    });
  };

  const { pushEntry: pushHistoryEntry } = useComposerHistoryContext();

  const deleteScene = (id: string) => {
    const target = scenes.find((s) => s.id === id);
    if (target?.projectId) {
      // Phase 5.6 — record before-state so Cmd+Z can restore the deleted scene
      pushHistoryEntry({
        projectId: target.projectId,
        sceneId: target.id,
        actionType: 'delete-scene',
        label: `Szene ${target.orderIndex + 1} gelöscht`,
        beforeState: sceneToSnakeSnapshot(target),
      }).catch(() => { /* non-fatal */ });
    }
    // Explicit DB delete by id. Previously we relied on
    // ensureProjectPersisted's "delete everything not in local snapshot"
    // cleanup, which has been removed because it silently erased real
    // scenes during realtime races. Persisted scenes must be removed
    // explicitly here; local-only scenes (non-UUID id) only need the
    // local filter below.
    if (target && /^[0-9a-f-]{36}$/i.test(target.id)) {
      import('@/integrations/supabase/client').then(({ supabase }) => {
        supabase
          .from('composer_scenes')
          .delete()
          .eq('id', target.id)
          .then(({ error }) => {
            if (error) console.warn('[StoryboardTab] deleteScene DB delete failed', error);
          });
      });
    }
    onUpdateScenes(
      scenes
        .filter((s) => s.id !== id)
        .map((s, i) => ({ ...s, orderIndex: i }))
    );
  };

  const moveScene = (fromIndex: number, toIndex: number) => {
    if (toIndex < 0 || toIndex >= scenes.length) return;
    const updated = [...scenes];
    const [moved] = updated.splice(fromIndex, 1);
    updated.splice(toIndex, 0, moved);
    onUpdateScenes(updated.map((s, i) => ({ ...s, orderIndex: i })));
  };

  // Storyboard v2 — selected scene drives the right-pane editor.
  const [selectedSceneId, setSelectedSceneId] = useState<string | undefined>(
    scenes[0]?.id,
  );
  // Keep selection valid when scenes change (delete / add / reorder via DB refetch).
  useEffect(() => {
    if (!scenes.length) {
      if (selectedSceneId !== undefined) setSelectedSceneId(undefined);
      return;
    }
    if (!selectedSceneId || !scenes.some((s) => s.id === selectedSceneId)) {
      setSelectedSceneId(scenes[0].id);
    }
  }, [scenes, selectedSceneId]);

  const selectedIndex = useMemo(
    () => scenes.findIndex((s) => s.id === selectedSceneId),
    [scenes, selectedSceneId],
  );
  const selectedScene = selectedIndex >= 0 ? scenes[selectedIndex] : undefined;
  const previousSceneOfSelected =
    selectedIndex > 0 ? scenes[selectedIndex - 1] : undefined;

  // Stage 18 — 3-mode left pane (Editor / Stil / Avatar)
  const [leftMode, setLeftMode] = useState<LeftPaneMode>('editor');

  // Stage 18 — inline scene generation directly from the player tile
  const confirmRender = useSceneRenderConfirm();
  const { generate: generateScene, generating: generatingMap } = useSceneGenerate({
    projectId,
    characters: safeCharacters,
    onOptimisticPatch: (id, patch) => updateScene(id, patch),
    ensureProject: onEnsurePersisted,
    confirmRender: (s) =>
      confirmRender({
        scenes: [s],
        title: `Szene ${(s.orderIndex ?? 0) + 1} rendern?`,
        description:
          'Sobald du bestätigst, startet die Render-Pipeline (Video-Provider, ggf. Voiceover & Lip-Sync). Credits werden verbraucht.',
      }),
  });

  const totalDuration = scenes.reduce((sum, s) => sum + s.durationSeconds, 0);
  const totalCost = scenes.reduce((sum, s) => sum + getClipCost(s.clipSource, s.clipQuality || 'standard', s.durationSeconds), 0);
  const budgetRemaining = Math.max(0, MAX_PROJECT_SECONDS - totalDuration);
  const addSceneAllowed = canAddScene(scenes);
  const tone = budgetTone(totalDuration);
  const budgetBarColor =
    tone === 'red'
      ? 'bg-red-500'
      : tone === 'amber'
        ? 'bg-amber-400'
        : 'bg-emerald-400';
  const budgetTextColor =
    tone === 'red'
      ? 'text-red-300'
      : tone === 'amber'
        ? 'text-amber-300'
        : 'text-emerald-300';

  const handleAddSceneClick = () => {
    if (!addSceneAllowed) {
      void import('sonner').then(({ toast }) => {
        toast.error('Projekt-Budget voll', {
          description: `Maximal ${formatDuration(MAX_PROJECT_SECONDS)} pro Projekt. Kürze oder lösche eine andere Szene, um Platz zu schaffen.`,
        });
      });
      return;
    }
    addScene();
  };

  return (
    <div className="space-y-4 max-w-7xl mx-auto min-w-0">
      {/* Budget Bar — hartes 10-Minuten-Projekt-Limit */}
      <div className="rounded-lg bg-card/60 border border-border/40 px-3 py-2">
        <div className="flex items-center justify-between mb-1.5">
          <span className="text-[11px] uppercase tracking-wider text-muted-foreground">
            Projekt-Budget
          </span>
          <span className={`text-xs font-medium tabular-nums ${budgetTextColor}`}>
            {formatDuration(totalDuration)} / {formatDuration(MAX_PROJECT_SECONDS)}
            {budgetRemaining > 0 && budgetRemaining < MAX_PROJECT_SECONDS && (
              <span className="text-muted-foreground/70 ml-1.5">
                · {formatDuration(budgetRemaining)} frei
              </span>
            )}
          </span>
        </div>
        <div className="h-1.5 w-full rounded-full bg-muted/40 overflow-hidden">
          <div
            className={`h-full transition-all duration-300 ${budgetBarColor}`}
            style={{ width: `${Math.min(100, (totalDuration / MAX_PROJECT_SECONDS) * 100)}%` }}
          />
        </div>
      </div>

      {/* Summary Bar */}
      <div className="flex items-center justify-between p-3 rounded-lg bg-card/60 border border-border/40">
        <div className="flex items-center gap-4 text-xs text-muted-foreground">
          <span>{scenes.length} Szenen</span>
          <span>•</span>
          <span>{totalDuration}s Gesamtdauer</span>
          <span>•</span>
          <span className="text-primary font-medium">~€{totalCost.toFixed(2)}</span>
        </div>
        <div className="flex gap-2">
          <Button
            size="sm"
            variant="outline"
            onClick={handleAddSceneClick}
            disabled={!addSceneAllowed}
            className="gap-1 text-xs"
            title={
              addSceneAllowed
                ? 'Neue Szene hinzufügen'
                : `Budget voll (max. ${formatDuration(MAX_PROJECT_SECONDS)}) — kürze oder lösche eine Szene.`
            }
          >
            <Plus className="h-3.5 w-3.5" /> Szene
          </Button>
          {scenes.length > 1 && scenes[0]?.clipSource?.startsWith('ai-') && (
            <Button
              size="sm"
              variant="outline"
              onClick={applyEngineToAll}
              className="gap-1 text-xs"
              title="Engine der ersten Szene auf alle anderen KI-Szenen übertragen"
            >
              <Sparkles className="h-3.5 w-3.5" /> Engine für alle
            </Button>
          )}
          <Button
            size="sm"
            variant={frameFirstMode ? 'default' : 'outline'}
            onClick={() => setFrameFirstMode((v) => !v)}
            className="gap-1 text-xs"
            title="Artlist-Stil: erst Still-Frame freezen, dann Video — für maximale Kontrolle und nahtlose Übergänge."
          >
            <ImageIcon className="h-3.5 w-3.5" /> Frame-First {frameFirstMode ? '✓' : ''}
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={() => setSnippetPickerOpen(true)}
            className="gap-1 text-xs"
          >
            <Library className="h-3.5 w-3.5" /> Scene Library
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={() => setTalkingHeadOpen(true)}
            className="gap-1 text-xs border-primary/40 text-primary hover:bg-primary/10"
          >
            <Mic className="h-3.5 w-3.5" /> Talking-Head
          </Button>
          {/* Status-Chip + Master-Generate-Button (ersetzt den alten "→ Clips" Tab-Wechsel) */}
          {scenes.length > 0 && (
            <div className="flex items-center gap-1.5 rounded-full border border-border/40 bg-background/50 px-2.5 py-1 text-[11px] font-medium text-muted-foreground">
              {allReady ? (
                <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400" />
              ) : generatingCount > 0 ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin text-primary" />
              ) : null}
              <span className="tabular-nums">
                {readyCount}/{scenes.length} Clips
                {generatingCount > 0 ? ` · ${generatingCount} läuft` : ''}
              </span>
            </div>
          )}
          <Button
            size="sm"
            onClick={generateAll}
            disabled={isGeneratingAll || scenes.length === 0 || pendingScenes.length === 0}
            className="gap-1 text-xs"
            title="Alle ausstehenden KI-Clips parallel generieren"
          >
            {isGeneratingAll ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Play className="h-3.5 w-3.5" />
            )}
            {pendingScenes.length === 0
              ? 'Alle Clips bereit'
              : `Alle generieren (${pendingScenes.length} · €${remainingCost.toFixed(2)})`}
          </Button>
        </div>
      </div>

      {/* Inline Pipeline Progress — visible directly in the workspace,
          not just at the top of the page. Appears the instant the user
          clicks "Generieren" and stays for the full ~7–8 min pipeline.
          Positioned at top-[56px] z-40 so it sits BELOW the global header
          but ABOVE the MotionStudioTopStepper (sticky top-0 z-30) — without
          this z-index, the bar gets hidden behind the stepper and looks
          like it disappeared after click. */}
      <PipelineProgressBar
        scenes={scenes}
        assemblyConfig={DEFAULT_ASSEMBLY_CONFIG}
        projectId={projectId}
        className="!top-[56px] !z-40 !mx-0 !px-3 rounded-xl border border-gold/30 bg-card/90 shadow-[0_4px_24px_-8px_hsl(var(--primary)/0.4)]"
      />



      {/* AI Generation Tips — promoted to Bond StagePanel for Briefing-parity */}
      <StagePanel
        slateIndex="00"
        eyebrow="REEL · NOTES"
        title={t('videoComposer.aiTipsTitle')}
        accessory={
          <button
            type="button"
            onClick={() => setTipsCollapsed((v) => !v)}
            className="text-[10px] uppercase tracking-wider text-muted-foreground/70 hover:text-foreground transition-colors flex items-center gap-1"
            aria-expanded={!tipsCollapsed}
          >
            {tipsCollapsed ? t('videoComposer.aiTipsExpand') : t('videoComposer.aiTipsCollapse')}
            {tipsCollapsed ? <ChevronDown className="h-3 w-3" /> : <ChevronUp className="h-3 w-3" />}
          </button>
        }
      >
        {!tipsCollapsed && (
          <ul className="space-y-2.5 text-xs leading-relaxed text-muted-foreground">
            <li className="flex gap-2.5">
              <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-gold/70" />
              <span>{t('videoComposer.aiTipPrompt')}</span>
            </li>
            <li className="flex gap-2.5">
              <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-gold/70" />
              <span>{t('videoComposer.aiTipPersons')}</span>
            </li>
            <li className="flex gap-2.5">
              <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-gold/70" />
              <span className="text-foreground/90">{t('videoComposer.aiTipCredits')}</span>
            </li>
          </ul>
        )}
      </StagePanel>

      {/* Plan ↔ Storyboard Drift-Check — Briefing-Intelligence v2 */}
      {scenes.length > 0 && (
        <DriftReportPanel projectId={projectId} scenes={scenes} />
      )}

      {/* Cast Consistency Map — Bond glass wrapper for Briefing-parity */}
      {scenes.length > 0 && safeCharacters.length > 0 && (
        <StagePanel
          slateIndex="00"
          eyebrow="CAST · CONTINUITY"
          title="Cast Consistency Map"
        >
          <CastConsistencyMap scenes={scenes} characters={safeCharacters} embedded onUpdateScene={updateScene} />
        </StagePanel>
      )}

      {/* Scene Cards — v2 Layout: Cinematic Filmstrip (left) + persistent Studio editor (right) */}
      {scenes.length === 0 ? (
        isGeneratingStoryboard ? (
          <StageStoryboardLoader />
        ) : storyboardError ? (
          <StageStoryboardError
            error={storyboardError}
            onRetry={onRetryStoryboard}
            onBackToBriefing={onBackToBriefing}
          />
        ) : (
          <StagePanel
            slateIndex="01"
            eyebrow="REEL · EMPTY"
            title="Noch keine Szenen"
          >
            <div className="py-8 text-center">
              <p className="text-muted-foreground text-sm mb-3">Noch keine Szenen vorhanden</p>
              <Button onClick={handleAddSceneClick} disabled={!addSceneAllowed} variant="outline" className="gap-2">
                <Plus className="h-4 w-4" /> Erste Szene hinzufügen
              </Button>
            </div>
          </StagePanel>
        )

      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 lg:gap-6 items-start">
          {/* Left: 3-mode editor pane (Editor / Stil / Avatar) */}
          <div className="lg:col-span-8 min-w-0">
            {selectedScene && (
              <StoryboardLeftPane
                mode={leftMode}
                onModeChange={setLeftMode}
                sceneNumber={selectedIndex + 1}
                totalScenes={scenes.length}
                sceneTypeLabel={SCENE_TYPE_LABEL_DE[selectedScene.sceneType] ?? selectedScene.sceneType}
                editorSlot={
                  <>
                    {previousSceneOfSelected && (
                      <SceneCutDriftIndicator
                        prev={previousSceneOfSelected}
                        next={selectedScene}
                        projectId={projectId}
                        onUpdateNext={(updates) => updateScene(selectedScene.id, updates)}
                        language={dialogLang}
                      />
                    )}
                    <SceneCard
                      key={selectedScene.id}
                      scene={selectedScene}
                      index={selectedIndex}
                      totalScenes={scenes.length}
                      projectId={projectId}
                      characters={safeCharacters}
                      preferredAspect={preferredAspect}
                      onUpdate={(updates) => updateScene(selectedScene.id, updates)}
                      onDelete={() => deleteScene(selectedScene.id)}
                      onMoveUp={() => moveScene(selectedIndex, selectedIndex - 1)}
                      onMoveDown={() => moveScene(selectedIndex, selectedIndex + 1)}
                      onHybridExtend={
                        projectId ? (mode) => openHybridDialog(selectedScene, mode) : undefined
                      }
                      hasOtherReadyScenes={scenes.some(
                        (s) => s.id !== selectedScene.id && s.clipStatus === 'ready' && !!s.clipUrl,
                      )}
                      onAddScene={onAddScene}
                      siblingsDurationSec={sumOtherScenesDuration(scenes, selectedScene.id)}
                      onInsertScenesAfter={onInsertScenesAfter}
                      onAddCharacter={onAddCharacter}
                      language={language}
                      onEnsurePersisted={onEnsurePersisted}
                      previousSceneLastFrameUrl={
                        previousSceneOfSelected
                          ? previousSceneOfSelected.lastFrameUrl ?? previousSceneOfSelected.clipUrl
                          : undefined
                      }
                      previousSceneIndex={selectedIndex > 0 ? selectedIndex : undefined}
                      frameFirstMode={frameFirstMode}
                      embedded
                    />
                  </>
                }
                styleSlot={
                  <SceneStyleMode
                    scene={selectedScene}
                    language={dialogLang}
                    onUpdate={(updates) => updateScene(selectedScene.id, updates)}
                  />
                }
                avatarSlot={
                  <SceneAvatarMode
                    scene={selectedScene}
                    characters={safeCharacters}
                    onUpdate={(updates) => updateScene(selectedScene.id, updates)}
                  />
                }
              />
            )}
          </div>

          {/* Right: inline player tiles with per-scene "Generieren" CTA */}
          <div className="lg:col-span-4 min-w-0 lg:sticky lg:top-4 lg:max-h-[calc(100vh-6rem)] lg:overflow-y-auto lg:pr-2 -mr-2">
            <StoryboardScenePlayerList
              scenes={scenes}
              selectedSceneId={selectedSceneId}
              generatingMap={generatingMap}
              onSelect={setSelectedSceneId}
              onReorder={onUpdateScenes}
              onAddScene={handleAddSceneClick}
              onGenerate={generateScene}
            />
          </div>
        </div>
      )}

      {/* Block M — Hybrid Extend dialog */}
      {projectId && hybridDialog.scene && (
        <HybridExtendDialog
          open={hybridDialog.open}
          onOpenChange={(open) =>
            setHybridDialog((prev) => ({ ...prev, open }))
          }
          projectId={projectId}
          sourceSceneId={hybridDialog.scene.id}
          sourceClipUrl={hybridDialog.scene.clipUrl}
          sourceSceneNumber={(hybridDialog.scene.orderIndex ?? 0) + 1}
          defaultMode={hybridDialog.mode}
          availableScenes={scenes
            .filter((s) => !!s.clipUrl)
            .map((s) => ({
              id: s.id,
              orderIndex: s.orderIndex,
              clipUrl: s.clipUrl,
              sceneType: s.sceneType,
            }))}
          language={dialogLang}
          onSuccess={() => {
            void onRefetchScenes?.();
          }}
        />
      )}

      {/* Block Q — Talking-Head dialog */}
      <TalkingHeadDialog
        open={talkingHeadOpen}
        onOpenChange={setTalkingHeadOpen}
        projectId={projectId}
        briefingCharacters={safeCharacters}
        onAddBriefingCharacter={onAddCharacter}
        availableScenes={scenes.map((s, i) => ({
          id: s.id,
          label: `S${i + 1} — ${s.sceneType}`,
        }))}
        onSuccess={(res) => {
          void onRefetchScenes?.();
          if (res.sceneId) {
            setTimeout(() => {
              const el = document.querySelector(`[data-scene-id="${res.sceneId}"]`);
              el?.scrollIntoView({ behavior: 'smooth', block: 'center' });
            }, 250);
          }
        }}
      />

      {/* Scene Snippet Library */}
      <SceneSnippetPicker
        open={snippetPickerOpen}
        onOpenChange={setSnippetPickerOpen}
        onInsert={insertSnippet}
      />
    </div>
  );
}
