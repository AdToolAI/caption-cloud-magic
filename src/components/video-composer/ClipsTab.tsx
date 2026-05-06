import { useState, useEffect, useCallback } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Progress } from '@/components/ui/progress';
import { Loader2, Play, RefreshCw, ArrowRight, CheckCircle, XCircle, Clock, Search, Film, DollarSign, Sparkles, Lightbulb, X, Link2, Save, Check } from 'lucide-react';
import { useFrameContinuity } from '@/hooks/useFrameContinuity';
import { useSaveSceneToLibrary } from '@/hooks/useSaveSceneToLibrary';
import { toast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import type { ComposerScene, ComposerCharacter } from '@/types/video-composer';
import { SCENE_TYPE_LABELS, CLIP_SOURCE_LABELS, getClipCost, QUALITY_LABELS } from '@/types/video-composer';
import { SceneClipProgress } from './SceneClipProgress';
import { probeMediaDuration } from '@/lib/probeMp4Duration';
import { composePromptLayers } from '@/lib/motion-studio/composePromptLayers';
import { useMotionStudioLibrary } from '@/hooks/useMotionStudioLibrary';
import { useBrandCharacters, buildCharacterPromptInjection } from '@/hooks/useBrandCharacters';
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
import ContinuityGuardianStrip from './ContinuityGuardianStrip';
import RenderPipelinePanel from './RenderPipelinePanel';

interface ClipsTabProps {
  scenes: ComposerScene[];
  projectId?: string;
  visualStyle?: string;
  characters?: ComposerCharacter[];
  onUpdateScenes: (scenes: ComposerScene[]) => void;
  onGoToVoiceSubtitles: () => void;
  onEnsurePersisted?: () => Promise<{ projectId: string; scenes: ComposerScene[] }>;
}

const statusConfig: Record<string, { color: string; bg: string; label: string }> = {
  pending: { color: 'text-muted-foreground', bg: 'bg-muted/40 border-border/40', label: 'Ausstehend' },
  generating: { color: 'text-accent', bg: 'bg-accent/15 border-accent/40 animate-pulse', label: 'Generiert…' },
  ready: { color: 'text-green-400', bg: 'bg-green-500/15 border-green-500/40', label: 'Fertig' },
  failed: { color: 'text-destructive', bg: 'bg-destructive/15 border-destructive/40', label: 'Fehlgeschlagen' },
};

export default function ClipsTab({ scenes, projectId, visualStyle, characters, onUpdateScenes, onGoToVoiceSubtitles, onEnsurePersisted }: ClipsTabProps) {
  const [isGeneratingAll, setIsGeneratingAll] = useState(false);
  const [singleGenerating, setSingleGenerating] = useState<Record<string, boolean>>({});
  const { extractLastFrame, extractingSceneId } = useFrameContinuity();
  const { save: saveSceneToLibrary, savingSceneId, savedSceneIds } = useSaveSceneToLibrary();
  // Library for @-mention resolution at generation time
  const { characters: libCharacters, locations: libLocations } = useMotionStudioLibrary();
  const { characters: brandChars } = useBrandCharacters();
  // Phase 2 — auto-inject the user's favorite Brand Character (if any).
  const activeBrandChar = brandChars.find((c) => c.is_favorite) ?? brandChars[0];
  const brandCharacterInput = activeBrandChar
    ? {
        name: activeBrandChar.name,
        identityCardPrompt: buildCharacterPromptInjection(activeBrandChar),
        referenceImageUrl: activeBrandChar.reference_image_url,
      }
    : undefined;

  /**
   * Frame-to-Shot Continuity:
   * Extrahiert den letzten Frame der aktuellen Szene und setzt ihn als
   * `referenceImageUrl` der nachfolgenden Szene → nahtlose Bild-Übergänge
   * bei AI-Generierung (i2v).
   */
  const handleApplyContinuityToNext = useCallback(
    async (currentScene: ComposerScene, nextScene: ComposerScene) => {
      if (!currentScene.clipUrl) {
        toast({ title: 'Kein Clip vorhanden', description: 'Generiere zuerst diese Szene.' });
        return;
      }
      const result = await extractLastFrame({
        videoUrl: currentScene.clipUrl,
        sceneId: currentScene.id,
        projectId,
        durationSeconds: currentScene.durationSeconds,
      });
      if (!result) return;
      const updated = scenes.map((s) =>
        s.id === nextScene.id
          ? { ...s, referenceImageUrl: result.lastFrameUrl, clipStatus: 'pending' as const }
          : s
      );
      onUpdateScenes(updated);
      toast({
        title: 'Continuity aktiviert ✨',
        description: `Szene ${scenes.findIndex(s => s.id === nextScene.id) + 1} startet jetzt nahtlos.`,
      });
    },
    [scenes, projectId, extractLastFrame, onUpdateScenes]
  );
  const [stockSearch, setStockSearch] = useState<Record<string, string>>({});
  const [stockResults, setStockResults] = useState<Record<string, any[]>>({});
  const [searchingStock, setSearchingStock] = useState<Record<string, boolean>>({});
  const [previousStatuses, setPreviousStatuses] = useState<Record<string, string>>({});
  const [rerollHintDismissed, setRerollHintDismissed] = useState<boolean>(() => {
    if (typeof window === 'undefined') return false;
    return localStorage.getItem('composer-reroll-hint-dismissed') === '1';
  });
  const [rerollTarget, setRerollTarget] = useState<ComposerScene | null>(null);

  const dismissRerollHint = () => {
    setRerollHintDismissed(true);
    try { localStorage.setItem('composer-reroll-hint-dismissed', '1'); } catch {}
  };

  // Drag & drop sensors for reordering scenes within the Clips tab
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

  const allReady = scenes.every((s) => s.clipStatus === 'ready' || (s.clipSource === 'upload' && s.uploadUrl));
  const readyCount = scenes.filter((s) => s.clipStatus === 'ready' || (s.clipSource === 'upload' && s.uploadUrl)).length;
  const generatingCount = scenes.filter((s) => s.clipStatus === 'generating').length;
  const pendingScenes = scenes.filter(s => s.clipStatus !== 'ready' && s.clipStatus !== 'generating' && !(s.clipSource === 'upload' && s.uploadUrl));
  const progressPercent = scenes.length > 0 ? (readyCount / scenes.length) * 100 : 0;

  // Calculate total cost (only pending AI scenes)
  const remainingCost = pendingScenes.reduce((sum, s) => {
    if (s.clipSource.startsWith('ai-')) {
      return sum + getClipCost(s.clipSource, s.clipQuality || 'standard', s.durationSeconds);
    }
    return sum;
  }, 0);

  // Polling logic — extracted so we can also trigger it immediately
  const pollScenes = useCallback(async () => {
    if (!projectId) return;
    const { data } = await supabase
      .from('composer_scenes')
      .select('id, clip_status, clip_url, duration_seconds, upload_type')
      .eq('project_id', projectId);

    if (!data) return;

    let changed = false;
    const newPrev: Record<string, string> = { ...previousStatuses };
    // Collect scenes that just transitioned to "ready" so we can probe their
    // real MP4 duration (Hailuo etc. often deliver shorter clips than requested)
    // and then update DB + UI in a single follow-up pass. This is the
    // single source of truth for downstream WAV padding + composition math.
    const justReady: Array<{ sceneId: string; clipUrl: string }> = [];

    const updatedScenes = scenes.map((scene, idx) => {
      const dbScene = data.find((d: any) => d.id === scene.id);
      if (
        dbScene &&
        (dbScene.clip_status !== scene.clipStatus ||
          dbScene.clip_url !== scene.clipUrl ||
          (dbScene.upload_type && dbScene.upload_type !== scene.uploadType))
      ) {
        changed = true;
        // Toast on transition generating → ready
        if (scene.clipStatus === 'generating' && dbScene.clip_status === 'ready') {
          toast({ title: `Szene ${idx + 1} fertig ✓`, description: SCENE_TYPE_LABELS[scene.sceneType]?.de });
          if (dbScene.clip_url) {
            justReady.push({ sceneId: scene.id, clipUrl: dbScene.clip_url });
          }
        }
        if (scene.clipStatus === 'generating' && dbScene.clip_status === 'failed') {
          toast({ title: `Szene ${idx + 1} fehlgeschlagen`, variant: 'destructive' });
        }
        newPrev[scene.id] = dbScene.clip_status;
        return {
          ...scene,
          clipStatus: dbScene.clip_status as ComposerScene['clipStatus'],
          clipUrl: dbScene.clip_url || scene.clipUrl,
          uploadType: (dbScene.upload_type as ComposerScene['uploadType']) || scene.uploadType,
        };
      }
      return scene;
    });
    if (changed) {
      setPreviousStatuses(newPrev);
      onUpdateScenes(updatedScenes);
    }

    // Probe each just-ready clip for its real MP4 duration. Update DB + UI
    // when the real value differs from the configured nominal duration.
    // We do this *after* the main state update so the user sees the clip
    // immediately, then sees the corrected duration shortly after.
    if (justReady.length > 0) {
      Promise.all(
        justReady.map(async ({ sceneId, clipUrl }) => {
          try {
            const realDur = await probeMediaDuration(clipUrl);
            const sceneNow = updatedScenes.find(s => s.id === sceneId);
            const nominal = sceneNow?.durationSeconds ?? 0;
            // Only persist if there is a meaningful drift (>50ms)
            if (Math.abs(realDur - nominal) > 0.05) {
              console.log(`[ClipsTab] Scene ${sceneId} real duration ${realDur.toFixed(3)}s (nominal ${nominal}s) — syncing`);
              const { error: upErr } = await supabase
                .from('composer_scenes')
                .update({ duration_seconds: realDur })
                .eq('id', sceneId);
              if (upErr) {
                console.warn('[ClipsTab] Failed to persist real duration:', upErr);
                return { sceneId, realDur, persisted: false };
              }
              return { sceneId, realDur, persisted: true };
            }
            return { sceneId, realDur, persisted: false };
          } catch (e) {
            console.warn('[ClipsTab] probeMediaDuration failed:', e);
            return null;
          }
        })
      ).then((results) => {
        const persistedUpdates = results.filter((r): r is { sceneId: string; realDur: number; persisted: boolean } => !!r && r.persisted);
        if (persistedUpdates.length === 0) return;
        // Apply real durations to UI state in one batch
        const merged = updatedScenes.map(s => {
          const u = persistedUpdates.find(p => p.sceneId === s.id);
          return u ? { ...s, durationSeconds: u.realDur } : s;
        });
        onUpdateScenes(merged);
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId, scenes, onUpdateScenes]);

  // Poll every 3s while generating
  useEffect(() => {
    if (generatingCount === 0) return;
    const interval = setInterval(pollScenes, 3000);
    return () => clearInterval(interval);
  }, [generatingCount, pollScenes]);

  const ensureProject = async (): Promise<{ projectId: string; scenes: ComposerScene[] } | null> => {
    // Always call onEnsurePersisted (when available) so the LATEST Storyboard
    // edits (prompt, slots, director settings, …) are flushed to DB before
    // compose-video-clips runs. This prevents the "edits not picked up /
    // reverted on tab switch" bug where projectId already exists and the
    // short-circuit skipped persistence.
    if (onEnsurePersisted) {
      try {
        return await onEnsurePersisted();
      } catch (err: any) {
        toast({ title: 'Fehler', description: err.message || 'Projekt konnte nicht gespeichert werden', variant: 'destructive' });
        return null;
      }
    }
    if (projectId) return { projectId, scenes };
    return null;
  };


  const handleGenerateAll = async () => {
    setIsGeneratingAll(true);
    try {
      const persisted = await ensureProject();
      if (!persisted) {
        setIsGeneratingAll(false);
        return;
      }
      const { projectId: pid, scenes: pScenes } = persisted;

      const scenesPayload = pScenes
        .filter(s => s.clipStatus !== 'ready' && !(s.clipSource === 'upload' && s.uploadUrl))
        .map(s => {
          // Centralized prompt composer (Phase 1) — replaces the previous
          // resolveMentions + applyDirectorModifiers + buildShotPromptSuffix
          // chain. Resolves axis conflicts, injects brand character, and
          // splits negative phrases out of the positive prompt.
          const composed = composePromptLayers({
            rawPrompt: s.aiPrompt || '',
            directorModifiers: s.directorModifiers,
            shotDirector: s.shotDirector,
            cinematicStylePresetId: (s as any).cinematicStylePresetId,
            brandCharacter: brandCharacterInput,
            libraryCharacters: libCharacters,
            libraryLocations: libLocations,
          });
          // Sherlock-Holmes Anchor: when this scene targets a cast member that
          // is linked to a Brand Character (avatar portrait), fall back to
          // their portrait as the i2v anchor frame for vastly better face
          // consistency. We only override when the scene has no own anchor.
          const castMember = s.characterShot && s.characterShot.shotType !== 'absent'
            ? characters?.find((c) => c.id === s.characterShot!.characterId)
            : undefined;
          const castAnchor = castMember?.referenceImageUrl;
          return {
            id: s.id,
            clipSource: s.clipSource,
            clipQuality: s.clipQuality || 'standard',
            aiPrompt: composed.finalPrompt,
            negativePrompt: composed.negativePrompt || undefined,
            stockKeywords: s.stockKeywords,
            uploadUrl: s.uploadUrl,
            referenceImageUrl:
              s.referenceImageUrl ||
              composed.referenceImageUrl ||
              castAnchor ||
              brandCharacterInput?.referenceImageUrl,
            durationSeconds: s.durationSeconds,
            characterShot: s.characterShot,
            withAudio: s.withAudio !== false,
          };
        });

      if (scenesPayload.length === 0) {
        toast({ title: 'Alle Clips sind bereits fertig!' });
        setIsGeneratingAll(false);
        return;
      }

      // Optimistically mark AI scenes as generating
      const optimistic = pScenes.map(s => {
        if (scenesPayload.some(p => p.id === s.id) && s.clipSource.startsWith('ai-')) {
          return { ...s, clipStatus: 'generating' as const };
        }
        return s;
      });
      onUpdateScenes(optimistic);

      const { data, error } = await supabase.functions.invoke('compose-video-clips', {
        body: { projectId: pid, scenes: scenesPayload, visualStyle, characters },
      });
      if (error) throw error;

      const updatedScenes = optimistic.map(scene => {
        const result = data?.results?.find((r: any) => r.sceneId === scene.id);
        if (result) {
          const isAiImage = scene.clipSource === 'ai-image';
          return {
            ...scene,
            clipStatus: result.status as any,
            clipUrl: result.clipUrl || scene.clipUrl,
            // For ai-image scenes that resolve immediately to 'ready', mark
            // uploadType 'image' so the preview player picks the <img> path
            // without waiting for a DB poll cycle.
            uploadType:
              isAiImage && result.status === 'ready'
                ? 'image'
                : scene.uploadType,
            replicatePredictionId: result.predictionId || scene.replicatePredictionId,
          };
        }
        return scene;
      });
      onUpdateScenes(updatedScenes);

      const failedResults = (data?.results || []).filter((r: any) => r.status === 'failed');
      if (failedResults.length > 0) {
        console.error('[ClipsTab] Failed clip details:', failedResults);
        toast({
          title: `${failedResults.length} Clip(s) fehlgeschlagen`,
          description: 'Generierung fehlgeschlagen — bitte erneut versuchen. Details in der Konsole.',
          variant: 'destructive',
        });
      } else {
        toast({
          title: 'Clip-Generierung gestartet',
          description: `${data?.generatingCount || 0} KI-Clips werden generiert (€${remainingCost.toFixed(2)}).`,
        });
      }
      // Trigger immediate poll
      setTimeout(pollScenes, 500);
    } catch (err: any) {
      console.error('Generate clips error:', err);
      toast({ title: 'Fehler', description: 'Clip-Generierung fehlgeschlagen — bitte erneut versuchen.', variant: 'destructive' });
    } finally {
      setIsGeneratingAll(false);
    }
  };

  const handleGenerateSingle = async (scene: ComposerScene) => {
    setSingleGenerating(prev => ({ ...prev, [scene.id]: true }));
    try {
      const persisted = await ensureProject();
      if (!persisted) {
        setSingleGenerating(prev => ({ ...prev, [scene.id]: false }));
        return;
      }
      const { projectId: pid, scenes: pScenes } = persisted;

      // Find the up-to-date scene from persisted list (id may have been replaced)
      const targetScene = pScenes.find(s => s.orderIndex === scene.orderIndex) || scene;

      // Optimistic update
      if (targetScene.clipSource.startsWith('ai-')) {
        const optimistic = pScenes.map(s =>
          s.id === targetScene.id ? { ...s, clipStatus: 'generating' as const } : s
        );
        onUpdateScenes(optimistic);
      }

      // Centralized prompt composer (Phase 1)
      const composedSingle = composePromptLayers({
        rawPrompt: targetScene.aiPrompt || '',
        directorModifiers: targetScene.directorModifiers,
        shotDirector: targetScene.shotDirector,
        cinematicStylePresetId: (targetScene as any).cinematicStylePresetId,
        brandCharacter: brandCharacterInput,
        libraryCharacters: libCharacters,
        libraryLocations: libLocations,
      });

      const { data, error } = await supabase.functions.invoke('compose-video-clips', {
        body: {
          projectId: pid,
          visualStyle,
          characters,
          scenes: [{
            id: targetScene.id,
            clipSource: targetScene.clipSource,
            clipQuality: targetScene.clipQuality || 'standard',
            aiPrompt: composedSingle.finalPrompt,
            negativePrompt: composedSingle.negativePrompt || undefined,
            stockKeywords: targetScene.stockKeywords,
            uploadUrl: targetScene.uploadUrl,
            referenceImageUrl: (() => {
              const cm = targetScene.characterShot && targetScene.characterShot.shotType !== 'absent'
                ? characters?.find((c) => c.id === targetScene.characterShot!.characterId)
                : undefined;
              return targetScene.referenceImageUrl || composedSingle.referenceImageUrl || cm?.referenceImageUrl || brandCharacterInput?.referenceImageUrl;
            })(),
            durationSeconds: targetScene.durationSeconds,
            characterShot: targetScene.characterShot,
            withAudio: targetScene.withAudio !== false,
          }],
        },
      });
      if (error) throw error;

      const result = data?.results?.[0];
      if (result) {
        const updatedScenes = pScenes.map(s => {
          if (s.id !== targetScene.id) return s;
          const isAiImage = s.clipSource === 'ai-image';
          return {
            ...s,
            clipStatus: result.status,
            clipUrl: result.clipUrl || s.clipUrl,
            uploadType:
              isAiImage && result.status === 'ready' ? 'image' : s.uploadType,
            replicatePredictionId: result.predictionId || s.replicatePredictionId,
          };
        });
        onUpdateScenes(updatedScenes);
      }
      toast({ title: 'Generierung gestartet', description: `Szene ${(targetScene.orderIndex ?? 0) + 1}` });
      setTimeout(pollScenes, 500);
    } catch (err: any) {
      toast({ title: 'Fehler', description: err.message, variant: 'destructive' });
    } finally {
      setSingleGenerating(prev => ({ ...prev, [scene.id]: false }));
    }
  };

  const handleSearchStock = async (sceneId: string) => {
    const query = stockSearch[sceneId];
    if (!query) return;

    setSearchingStock(prev => ({ ...prev, [sceneId]: true }));
    try {
      const { data, error } = await supabase.functions.invoke('search-stock-videos', {
        body: { query, perPage: 6 },
      });
      if (error) throw error;
      setStockResults(prev => ({ ...prev, [sceneId]: data?.videos || [] }));
    } catch (err) {
      toast({ title: 'Stock-Suche fehlgeschlagen', variant: 'destructive' });
    } finally {
      setSearchingStock(prev => ({ ...prev, [sceneId]: false }));
    }
  };

  const handleSelectStock = (sceneId: string, videoUrl: string) => {
    const updatedScenes = scenes.map(s =>
      s.id === sceneId ? { ...s, clipUrl: videoUrl, clipStatus: 'ready' as const, clipSource: 'stock' as const } : s
    );
    onUpdateScenes(updatedScenes);
    setStockResults(prev => ({ ...prev, [sceneId]: [] }));
    toast({ title: 'Stock-Video ausgewählt' });
  };

  return (
    <div className="space-y-4 max-w-4xl mx-auto">
      {/* Hebel 8: Multi-Scene Render Pipeline (Render All & Stitch → Director's Cut) */}
      <RenderPipelinePanel
        projectId={projectId}
        scenes={scenes}
        pendingCount={pendingScenes.length}
        failedCount={scenes.filter((s) => s.clipStatus === 'failed').length}
        isAllReady={allReady}
        onGenerateAll={handleGenerateAll}
      />
      {/* Re-Roll Hint Banner */}
      {!rerollHintDismissed && scenes.some(s => s.clipSource.startsWith('ai-')) && (
        <div className="relative p-3 rounded-lg border border-amber-500/30 bg-gradient-to-r from-amber-500/10 to-amber-500/5 flex items-start gap-3">
          <Lightbulb className="h-4 w-4 text-amber-400 flex-shrink-0 mt-0.5" />
          <div className="flex-1 text-[11px] text-foreground/90 leading-relaxed">
            <span className="font-semibold text-amber-300">Nicht zufrieden mit einer Szene?</span>{' '}
            Klicke auf <span className="inline-flex items-center gap-0.5 px-1 py-0.5 rounded bg-amber-500/15 border border-amber-500/30 text-amber-300 font-medium"><RefreshCw className="h-2.5 w-2.5" />Neu generieren</span> bei einer fertigen Szene, um sie erneut zu erstellen — jeder Re-Roll kostet erneut Credits, aber du kannst Stil, Prompt oder Charakter-Shot vorher anpassen.
          </div>
          <button
            onClick={dismissRerollHint}
            className="flex-shrink-0 text-amber-400/60 hover:text-amber-300 transition-colors"
            aria-label="Hinweis schließen"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      )}

      {/* Summary Bar with Progress */}
      <div className="p-3 rounded-lg bg-card/60 border border-border/40 space-y-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="text-xs font-medium">
              {readyCount}/{scenes.length} Clips fertig
            </div>
            {generatingCount > 0 && (
              <div className="flex items-center gap-1.5 text-xs text-accent">
                <Loader2 className="h-3 w-3 animate-spin" />
                {generatingCount} werden generiert…
              </div>
            )}
            {remainingCost > 0 && (
              <div className="flex items-center gap-1 text-xs text-amber-400">
                <DollarSign className="h-3 w-3" />
                €{remainingCost.toFixed(2)} verbleibend
              </div>
            )}
          </div>
          <div className="flex gap-2">
            <Button
              size="sm"
              variant="outline"
              onClick={handleGenerateAll}
              disabled={isGeneratingAll || scenes.length === 0 || pendingScenes.length === 0}
              className="gap-1 text-xs"
            >
              {isGeneratingAll ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Play className="h-3.5 w-3.5" />}
              {pendingScenes.length === 0
                ? 'Alle Clips bereit'
                : `Alle generieren (${pendingScenes.length} • €${remainingCost.toFixed(2)})`}
            </Button>
            <Button
              size="sm"
              onClick={onGoToVoiceSubtitles}
              disabled={!allReady && readyCount === 0}
              className="gap-1 text-xs"
            >
              Weiter zu Voiceover & Untertitel <ArrowRight className="h-3.5 w-3.5" />
            </Button>
          </div>
        </div>
        <Progress value={progressPercent} className="h-1.5" />
        <p className="text-[10px] text-muted-foreground/70 italic">
          Credits werden pro Generierung abgezogen — Re-Rolls kosten erneut.
        </p>
      </div>

      {/* Re-Roll Confirmation Dialog */}
      <AlertDialog open={!!rerollTarget} onOpenChange={(open) => !open && setRerollTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              Szene {(rerollTarget?.orderIndex ?? 0) + 1} neu generieren?
            </AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-2">
                <p>
                  Dies kostet erneut{' '}
                  <span className="font-semibold text-amber-400">
                    €{rerollTarget ? getClipCost(rerollTarget.clipSource, rerollTarget.clipQuality || 'standard', rerollTarget.durationSeconds).toFixed(2) : '0.00'}
                  </span>
                  . Der vorherige Clip wird ersetzt.
                </p>
                <p className="text-xs text-muted-foreground">
                  💡 Tipp: Passe vorher den Prompt im Storyboard-Tab oder den Charakter-Shot-Typ an, um ein anderes Ergebnis zu bekommen.
                </p>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Abbrechen</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (rerollTarget) {
                  const target = rerollTarget;
                  setRerollTarget(null);
                  handleGenerateSingle(target);
                }
              }}
              className="bg-amber-500 hover:bg-amber-600 text-amber-950"
            >
              Neu generieren €{rerollTarget ? getClipCost(rerollTarget.clipSource, rerollTarget.clipQuality || 'standard', rerollTarget.durationSeconds).toFixed(2) : '0.00'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Continuity Guardian — Reference-Chaining 2.0 */}
      <ContinuityGuardianStrip
        scenes={scenes}
        projectId={projectId}
        onUpdateScenes={onUpdateScenes}
        onRepairScene={(s) => handleGenerateSingle(s)}
      />

      {/* Clip Cards */}
      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
        <SortableContext items={scenes.map((s) => s.id)} strategy={verticalListSortingStrategy}>
          <div className="grid gap-3">
            {scenes.map((scene, i) => {
              const status = statusConfig[scene.clipStatus] || statusConfig.pending;
          const sceneQuality = scene.clipQuality || 'standard';
          const costPerClip = scene.clipSource.startsWith('ai-')
            ? getClipCost(scene.clipSource, sceneQuality, scene.durationSeconds)
            : 0;
          const isUpload = scene.clipSource === 'upload';
          const hasUpload = !!scene.uploadUrl;
          const isAi = scene.clipSource.startsWith('ai-');
          const isStock = scene.clipSource === 'stock';
          const isThisGenerating = singleGenerating[scene.id] || scene.clipStatus === 'generating';

          return (
            <SortableSceneItem
              key={scene.id}
              id={scene.id}
              badge={
                <span className="text-[10px] font-mono text-muted-foreground/70 px-1">#{i + 1}</span>
              }
            >
            <Card className="border-border/40 bg-card/80 overflow-hidden w-full max-w-full">
              <CardContent className="p-3 space-y-2 overflow-hidden">
                <div className="flex items-stretch gap-3 min-w-0 w-full">
                  {/* Larger preview slot */}
                  <div className="w-36 h-20 rounded border border-border/30 flex-shrink-0 overflow-hidden">
                    <SceneClipProgress scene={scene} index={i} />
                  </div>

                  {/* Info */}
                  <div className="flex-1 min-w-0 flex flex-col justify-between overflow-hidden">
                    <div className="min-w-0 overflow-hidden">
                      <div className="flex items-center gap-2 mb-1 flex-wrap">
                        <span className="text-xs font-medium">Szene {i + 1}</span>
                        <Badge variant="secondary" className="text-[10px]">
                          {SCENE_TYPE_LABELS[scene.sceneType]?.de}
                        </Badge>
                        <span className="text-[10px] text-muted-foreground">{scene.durationSeconds}s</span>
                        {costPerClip > 0 && (
                          <span className="text-[10px] text-amber-400">€{costPerClip.toFixed(2)}</span>
                        )}
                        <span
                          className={`text-[10px] px-2 py-0.5 rounded-full border ${status.bg} ${status.color}`}
                        >
                          {status.label}
                        </span>
                      </div>
                      <p
                        className="text-[11px] text-foreground/80 overflow-hidden text-ellipsis break-words"
                        style={{
                          display: '-webkit-box',
                          WebkitLineClamp: 2,
                          WebkitBoxOrient: 'vertical',
                        }}
                        title={scene.aiPrompt || scene.stockKeywords || ''}
                      >
                        {scene.aiPrompt || scene.stockKeywords || (isUpload ? 'Eigener Upload' : 'Kein Prompt')}
                      </p>
                      <p
                        className="text-[10px] text-muted-foreground/70 mt-0.5 flex items-center gap-1.5 flex-wrap overflow-hidden"
                        style={{
                          display: '-webkit-box',
                          WebkitLineClamp: 1,
                          WebkitBoxOrient: 'vertical',
                        }}
                      >
                        <span>{CLIP_SOURCE_LABELS[scene.clipSource]?.de}</span>
                        {isAi && (
                          <span className={`px-1.5 py-0 rounded text-[9px] border ${
                            sceneQuality === 'pro'
                              ? 'border-amber-500/40 bg-amber-500/10 text-amber-400'
                              : 'border-border/40 bg-muted/40 text-muted-foreground'
                          }`}>
                            {QUALITY_LABELS[scene.clipSource][sceneQuality]}
                          </span>
                        )}
                        {isAi && scene.referenceImageUrl && (
                          <span className="px-1.5 py-0 rounded text-[9px] border border-primary/40 bg-primary/10 text-primary inline-flex items-center gap-1">
                            <Sparkles className="h-2.5 w-2.5" />
                            Mit Referenzbild
                          </span>
                        )}
                        {scene.clipStatus === 'generating' && isAi && (
                          <span className="text-accent inline-flex items-center gap-1">
                            <Loader2 className="h-2.5 w-2.5 animate-spin" />
                            KI rendert ca. 30–60s…
                          </span>
                        )}
                      </p>
                    </div>
                  </div>

                  {/* Actions */}
                  <div className="flex flex-col gap-1 justify-center">
                    {/* Pending AI → Generate button */}
                    {isAi && scene.clipStatus === 'pending' && (
                      <Button
                        size="sm"
                        onClick={() => handleGenerateSingle(scene)}
                        disabled={isThisGenerating}
                        className="gap-1 text-[10px] h-7 px-2"
                      >
                        {isThisGenerating ? (
                          <Loader2 className="h-3 w-3 animate-spin" />
                        ) : (
                          <Sparkles className="h-3 w-3" />
                        )}
                        Generieren €{costPerClip.toFixed(2)}
                      </Button>
                    )}
                    {/* Failed → Retry */}
                    {scene.clipStatus === 'failed' && (
                      <Button
                        size="sm"
                        variant="destructive"
                        onClick={() => handleGenerateSingle(scene)}
                        disabled={isThisGenerating}
                        className="gap-1 text-[10px] h-7 px-2"
                      >
                        {isThisGenerating ? (
                          <Loader2 className="h-3 w-3 animate-spin" />
                        ) : (
                          <RefreshCw className="h-3 w-3" />
                        )}
                        Erneut versuchen
                      </Button>
                    )}
                    {/* Ready → Re-roll */}
                    {scene.clipStatus === 'ready' && isAi && (
                      <Button
                        size="sm"
                        variant="outline"
                        className="gap-1 text-[10px] h-7 px-2 border-amber-500/40 text-amber-400 hover:bg-amber-500/10 hover:text-amber-300"
                        title="Diese Szene neu generieren (kostet erneut Credits)"
                        disabled={isThisGenerating}
                        onClick={() => setRerollTarget(scene)}
                      >
                        {isThisGenerating ? (
                          <Loader2 className="h-3 w-3 animate-spin" />
                        ) : (
                          <RefreshCw className="h-3 w-3" />
                        )}
                        Neu generieren €{costPerClip.toFixed(2)}
                      </Button>
                    )}
                    {/* Save single scene to media library (manual, no auto-save) */}
                    {scene.clipStatus === 'ready' && scene.clipUrl && (() => {
                      const isSaved = savedSceneIds.has(scene.id);
                      const isSaving = savingSceneId === scene.id;
                      return (
                        <Button
                          size="sm"
                          variant="outline"
                          className="gap-1 text-[10px] h-7 px-2 border-primary/40 text-primary hover:bg-primary/10 disabled:opacity-60"
                          title={isSaved ? 'Diese Szene ist bereits in deiner Mediathek' : 'Diese Szene als eigenständigen Clip in deiner Mediathek ablegen'}
                          disabled={isSaving || isSaved}
                          onClick={() => saveSceneToLibrary(scene, projectId)}
                        >
                          {isSaving ? (
                            <Loader2 className="h-3 w-3 animate-spin" />
                          ) : isSaved ? (
                            <Check className="h-3 w-3" />
                          ) : (
                            <Save className="h-3 w-3" />
                          )}
                          {isSaved ? 'Gespeichert' : 'In Mediathek'}
                        </Button>
                      );
                    })()}
                    {/* Frame-to-Shot Continuity → use last frame as next scene's start */}
                    {scene.clipStatus === 'ready' && scene.clipUrl && (() => {
                      const next = scenes[i + 1];
                      if (!next) return null;
                      const nextIsAi = next.clipSource.startsWith('ai-');
                      if (!nextIsAi) return null;
                      const isExtracting = extractingSceneId === scene.id;
                      const alreadyApplied = !!next.referenceImageUrl;
                      return (
                        <Button
                          size="sm"
                          variant="outline"
                          className="gap-1 text-[10px] h-7 px-2 border-primary/40 text-primary hover:bg-primary/10"
                          title="Letzten Frame dieser Szene als Startbild der nächsten Szene nutzen — für nahtlose Übergänge."
                          disabled={isExtracting || alreadyApplied}
                          onClick={() => handleApplyContinuityToNext(scene, next)}
                        >
                          {isExtracting ? (
                            <Loader2 className="h-3 w-3 animate-spin" />
                          ) : (
                            <Link2 className="h-3 w-3" />
                          )}
                          {alreadyApplied ? 'Continuity ✓' : 'Continuity → #' + (i + 2)}
                        </Button>
                      );
                    })()}
                    {/* Generating disabled marker */}
                    {scene.clipStatus === 'generating' && (
                      <Button size="sm" disabled className="gap-1 text-[10px] h-7 px-2">
                        <Loader2 className="h-3 w-3 animate-spin" />
                        Wird generiert…
                      </Button>
                    )}
                    {/* Stock pending */}
                    {isStock && scene.clipStatus !== 'ready' && (
                      <Button
                        size="sm"
                        variant="outline"
                        className="gap-1 text-[10px] h-7 px-2"
                        onClick={() => {
                          setStockSearch(prev => ({ ...prev, [scene.id]: scene.stockKeywords || scene.aiPrompt || '' }));
                          setStockResults(prev => ({ ...prev, [scene.id]: prev[scene.id] || [] }));
                        }}
                      >
                        <Search className="h-3 w-3" />
                        Stock suchen
                      </Button>
                    )}
                    {/* Upload missing */}
                    {isUpload && !hasUpload && (
                      <span className="text-[10px] text-muted-foreground italic px-2">
                        Datei im Storyboard hochladen
                      </span>
                    )}
                    {/* Stock alt search button (always available) */}
                    {!isStock && scene.clipStatus !== 'generating' && (
                      <Button
                        size="icon"
                        variant="ghost"
                        className="h-7 w-7"
                        title="Stock-Alternative suchen"
                        onClick={() => {
                          setStockSearch(prev => ({ ...prev, [scene.id]: scene.stockKeywords || scene.aiPrompt || '' }));
                          setStockResults(prev => ({ ...prev, [scene.id]: prev[scene.id] || [] }));
                        }}
                      >
                        <Film className="h-3.5 w-3.5" />
                      </Button>
                    )}
                  </div>
                </div>

                {/* Stock Search Inline */}
                {stockSearch[scene.id] !== undefined && (
                  <div className="space-y-2 pt-2 border-t border-border/20">
                    <div className="flex gap-2">
                      <Input
                        value={stockSearch[scene.id]}
                        onChange={(e) => setStockSearch(prev => ({ ...prev, [scene.id]: e.target.value }))}
                        placeholder="Stock-Video suchen..."
                        className="h-7 text-xs"
                        onKeyDown={(e) => e.key === 'Enter' && handleSearchStock(scene.id)}
                      />
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => handleSearchStock(scene.id)}
                        disabled={searchingStock[scene.id]}
                        className="h-7 text-xs gap-1"
                      >
                        {searchingStock[scene.id] ? <Loader2 className="h-3 w-3 animate-spin" /> : <Search className="h-3 w-3" />}
                        Suchen
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => {
                          setStockSearch(prev => { const n = { ...prev }; delete n[scene.id]; return n; });
                          setStockResults(prev => { const n = { ...prev }; delete n[scene.id]; return n; });
                        }}
                        className="h-7 text-xs"
                      >
                        ✕
                      </Button>
                    </div>

                    {stockResults[scene.id]?.length > 0 && (
                      <div className="grid grid-cols-3 gap-2">
                        {stockResults[scene.id].map((video: any) => (
                          <button
                            key={video.id}
                            onClick={() => handleSelectStock(scene.id, video.url)}
                            className="relative rounded overflow-hidden border border-border/30 hover:border-primary/60 transition-colors group"
                          >
                            <img
                              src={video.thumbnail_url}
                              alt="Stock Video"
                              className="w-full h-16 object-cover"
                            />
                            <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity">
                              <span className="text-[9px] text-white font-medium">Auswählen</span>
                            </div>
                            <div className="absolute bottom-0.5 right-0.5">
                              <Badge variant="secondary" className="text-[8px] px-1 py-0">
                                {video.duration_sec}s • {video.source}
                              </Badge>
                            </div>
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </CardContent>
            </Card>
            </SortableSceneItem>
          );
        })}
          </div>
        </SortableContext>
      </DndContext>
    </div>
  );
}
