import { useState, useEffect } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Plus, ArrowRight, Sparkles, ChevronDown, ChevronUp, Mic, Library } from 'lucide-react';
import SceneCard from './SceneCard';
import HybridExtendDialog from './HybridExtendDialog';
import TalkingHeadDialog from './TalkingHeadDialog';
import SceneSnippetPicker from '@/components/motion-studio/SceneSnippetPicker';
import type { SceneSnippet } from '@/types/motion-studio';
import type { ComposerScene, ClipSource, ComposerCharacter } from '@/types/video-composer';
import { DEFAULT_TEXT_OVERLAY, getClipCost, getClipRate } from '@/types/video-composer';
import { useTranslation } from '@/hooks/useTranslation';
import {
  DndContext,
  closestCenter,
  PointerSensor,
  KeyboardSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core';
import {
  SortableContext,
  arrayMove,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { SortableSceneItem } from './SortableSceneItem';
import { CastConsistencyMap } from './CastConsistencyMap';

interface StoryboardTabProps {
  scenes: ComposerScene[];
  onUpdateScenes: (scenes: ComposerScene[]) => void;
  /**
   * Inserts a new scene directly into the DB so it survives realtime
   * refetches. Falls back to local-only when the project hasn't been
   * persisted yet.
   */
  onAddScene?: (partial: Partial<ComposerScene>) => void | Promise<void>;
  onGoToClips: () => void;
  language: string;
  projectId?: string;
  characters?: ComposerCharacter[];
  preferredAspect?: '16:9' | '9:16' | '1:1' | '4:5';
  /**
   * Block M — Hybrid Extend uses the server-side orchestrator which inserts
   * a new scene row directly. The dashboard must refetch from DB to surface it.
   */
  onRefetchScenes?: () => void | Promise<void>;
}

export default function StoryboardTab({
  scenes,
  onUpdateScenes,
  onAddScene,
  onGoToClips,
  language,
  projectId,
  characters,
  preferredAspect,
  onRefetchScenes,
}: StoryboardTabProps) {
  const { t } = useTranslation();
  const TIPS_KEY = 'video-composer-storyboard-tips-collapsed';
  const [tipsCollapsed, setTipsCollapsed] = useState<boolean>(() => {
    try { return localStorage.getItem(TIPS_KEY) === '1'; } catch { return false; }
  });
  useEffect(() => {
    try { localStorage.setItem(TIPS_KEY, tipsCollapsed ? '1' : '0'); } catch { /* ignore */ }
  }, [tipsCollapsed]);

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
    onUpdateScenes(
      scenes.map((s) => {
        if (s.id !== id) return s;
        const updated = { ...s, ...updates };
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
  };

  const deleteScene = (id: string) => {
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

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const oldIndex = scenes.findIndex((s) => s.id === active.id);
    const newIndex = scenes.findIndex((s) => s.id === over.id);
    if (oldIndex < 0 || newIndex < 0) return;
    const reordered = arrayMove(scenes, oldIndex, newIndex);
    onUpdateScenes(reordered.map((s, i) => ({ ...s, orderIndex: i })));
  };

  const totalDuration = scenes.reduce((sum, s) => sum + s.durationSeconds, 0);
  const totalCost = scenes.reduce((sum, s) => sum + getClipCost(s.clipSource, s.clipQuality || 'standard', s.durationSeconds), 0);

  return (
    <div className="space-y-4 max-w-4xl mx-auto min-w-0">
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
          <Button size="sm" variant="outline" onClick={addScene} className="gap-1 text-xs">
            <Plus className="h-3.5 w-3.5" /> Szene
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
          <Button
            size="sm"
            onClick={onGoToClips}
            disabled={scenes.length === 0}
            className="gap-1 text-xs"
          >
            Clips generieren <ArrowRight className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>

      {/* AI Generation Tips (gold) */}
      <div className="relative overflow-hidden rounded-xl bg-card/40 backdrop-blur-sm border border-gold/20 shadow-soft">
        <div
          className="absolute left-0 top-0 bottom-0 w-[3px] bg-gradient-to-b from-gold via-gold/60 to-transparent"
          style={{ boxShadow: '0 0 12px hsl(var(--primary) / 0.4)' }}
        />
        <div className="p-4 pl-5">
          <button
            type="button"
            onClick={() => setTipsCollapsed((v) => !v)}
            className="flex w-full items-center justify-between gap-3 text-left group"
            aria-expanded={!tipsCollapsed}
          >
            <div className="flex items-center gap-2.5">
              <div className="flex h-7 w-7 items-center justify-center rounded-md bg-gold/10 border border-gold/20">
                <Sparkles className="h-3.5 w-3.5 text-gold" />
              </div>
              <h3 className="font-display text-sm font-semibold tracking-wide text-foreground">
                {t('videoComposer.aiTipsTitle')}
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
        </div>
      </div>

      {/* Cast Consistency Map — shows which character appears in which scene
          and the active continuity anchor (reference image / frame chain / prompt). */}
      <CastConsistencyMap scenes={scenes} characters={characters || []} />

      {/* Scene Cards */}
      {scenes.length === 0 ? (
        <Card className="border-border/40 bg-card/50">
          <CardContent className="py-12 text-center">
            <p className="text-muted-foreground text-sm mb-3">Noch keine Szenen vorhanden</p>
            <Button onClick={addScene} variant="outline" className="gap-2">
              <Plus className="h-4 w-4" /> Erste Szene hinzufügen
            </Button>
          </CardContent>
        </Card>
      ) : (
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
          <SortableContext items={scenes.map((s) => s.id)} strategy={verticalListSortingStrategy}>
            <div className="space-y-3">
              {scenes.map((scene, index) => {
                const hasOtherReadyScenes = scenes.some(
                  (s) => s.id !== scene.id && s.clipStatus === 'ready' && !!s.clipUrl
                );
                return (
                  <SortableSceneItem key={scene.id} id={scene.id}>
                    <SceneCard
                      scene={scene}
                      index={index}
                      totalScenes={scenes.length}
                      projectId={projectId}
                      characters={characters}
                      preferredAspect={preferredAspect}
                      onUpdate={(updates) => updateScene(scene.id, updates)}
                      onDelete={() => deleteScene(scene.id)}
                      onMoveUp={() => moveScene(index, index - 1)}
                      onMoveDown={() => moveScene(index, index + 1)}
                      onHybridExtend={
                        projectId
                          ? (mode) => openHybridDialog(scene, mode)
                          : undefined
                      }
                      hasOtherReadyScenes={hasOtherReadyScenes}
                      language={language}
                    />
                  </SortableSceneItem>
                );
              })}
            </div>
          </SortableContext>
        </DndContext>
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
        onSuccess={() => {
          void onRefetchScenes?.();
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
