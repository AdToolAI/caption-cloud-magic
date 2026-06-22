/**
 * useGenerateAllClips — extrahiert aus ClipsTab.handleGenerateAll, damit der
 * gleiche "Alle Clips generieren"-Flow auch vom Storyboard-Tab aus aufgerufen
 * werden kann (Stage 19: Clips-Tab wird ausgeblendet).
 *
 * Die Funktion ist 1:1 die bestehende, getestete Pipeline-Logik:
 *   1. ensureProject (persistiert ggf. das Projekt)
 *   2. Eligible scenes filtern (kein 'ready', kein cinematic-sync-in-progress)
 *   3. composeFinalPrompt pro Szene
 *   4. prepareSceneAnchor parallel (Nano-Banana Composition)
 *   5. compose-video-clips Edge Function aufrufen
 *   6. Optimistic clip_status='generating' + frozen first frame
 *
 * Edge Functions, DB-Schema und Realtime-Subscriptions bleiben unberührt.
 */
import { useCallback, useMemo, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from '@/hooks/use-toast';
import { extractFunctionsError } from '@/lib/functionsError';
import type { ComposerScene, ComposerCharacter } from '@/types/video-composer';
import { getClipCost } from '@/types/video-composer';
import { composeFinalPrompt, type DirectorLanguage } from '@/lib/motion-studio/composeFinalPrompt';
import { derivePerformanceEntries } from '@/lib/motion-studio/buildPerformanceBlock';

import { sceneFeaturesCharacter } from '@/lib/motion-studio/sceneFeaturesCharacter';
import { prepareSceneAnchor } from '@/lib/motion-studio/prepareSceneAnchor';
import { useUnifiedMentionLibrary } from '@/hooks/useUnifiedMentionLibrary';
import { useBrandCharacters, buildCharacterPromptInjection } from '@/hooks/useBrandCharacters';
import { emitPipelineEvent } from '@/lib/pipelineEvents';
import { emitStageEvent } from '@/lib/stage/stageEvents';

interface UseGenerateAllClipsArgs {
  scenes: ComposerScene[];
  projectId?: string;
  visualStyle?: string;
  characters?: ComposerCharacter[];
  language?: string;
  onUpdateScenes: (scenes: ComposerScene[]) => void;
  onEnsurePersisted?: () => Promise<{ projectId: string; scenes: ComposerScene[] }>;
}

function isScenePipelineReady(scene: ComposerScene) {
  const dialogVoiceCount = scene.dialogVoices ? Object.keys(scene.dialogVoices).length : 0;
  const needsLipsync =
    scene.engineOverride === 'cinematic-sync' ||
    !!(scene as any).twoshotStage ||
    dialogVoiceCount > 1;
  if (scene.clipSource === 'upload' && !!scene.uploadUrl && !needsLipsync) return true;
  if (scene.clipStatus !== 'ready') return false;
  if (!needsLipsync) return true;
  return (
    ((scene as any).lipSyncStatus === 'done' && !!(scene as any).lipSyncAppliedAt) ||
    (scene as any).twoshotStage === 'done' ||
    (scene as any).twoshotStage === 'complete'
  );
}

export function useGenerateAllClips({
  scenes,
  projectId,
  visualStyle,
  characters,
  language,
  onUpdateScenes,
  onEnsurePersisted,
}: UseGenerateAllClipsArgs) {
  const [isGeneratingAll, setIsGeneratingAll] = useState(false);

  const directorLanguage: DirectorLanguage =
    language === 'de' ? 'de' : language === 'es' ? 'es' : 'en';

  const { characters: libCharacters, locations: libLocations } = useUnifiedMentionLibrary();
  const { characters: brandChars } = useBrandCharacters();
  const activeBrandChar = brandChars.find((c) => c.is_favorite) ?? brandChars[0];

  const buildBrandInputForScene = useCallback(
    (scene: ComposerScene) => {
      if (!activeBrandChar) return undefined;
      const applies = sceneFeaturesCharacter(scene, { name: activeBrandChar.name });
      return {
        name: activeBrandChar.name,
        identityCardPrompt: buildCharacterPromptInjection(activeBrandChar),
        referenceImageUrl: activeBrandChar.reference_image_url,
        applies,
      };
    },
    [activeBrandChar],
  );

  // ── Derived counters for the storyboard master-button ─────────────
  const readyCount = useMemo(
    () =>
      scenes.filter(isScenePipelineReady).length,
    [scenes],
  );

  const generatingCount = useMemo(
    () => scenes.filter((s) => s.clipStatus === 'generating' || (s as any).lipSyncStatus === 'running').length,
    [scenes],
  );

  const pendingScenes = useMemo(
    () =>
      scenes.filter(
        (s) =>
          s.clipStatus !== 'ready' &&
          !(s.clipSource === 'upload' && s.uploadUrl) &&
          !(
            s.clipStatus === 'generating' &&
            s.engineOverride === 'cinematic-sync' &&
            !!(s as any).twoshotStage &&
            (s as any).twoshotStage !== 'failed'
          ),
      ),
    [scenes],
  );

  const remainingCost = useMemo(
    () =>
      pendingScenes
        .filter((s) => s.clipSource.startsWith('ai-'))
        .reduce((sum, s) => sum + getClipCost(s.clipSource, s.clipQuality, s.durationSeconds), 0),
    [pendingScenes],
  );

  const allReady = scenes.length > 0 && scenes.every(isScenePipelineReady);

  // ── Action ────────────────────────────────────────────────────────
  const generateAll = useCallback(async () => {
    if (isGeneratingAll) return;
    setIsGeneratingAll(true);
    // ── INSTANT FEEDBACK (0s) ────────────────────────────────────────
    // Fire BEFORE ensureProject / Nano-Banana so the bar moves on the
    // very next frame. Also flip every pending AI scene to 'generating'
    // locally so the per-scene shimmer appears instantly.
    emitPipelineEvent({ type: 'clips:start' });
    const pendingNow = scenes.filter(
      (s) =>
        s.clipStatus !== 'ready' &&
        !(s.clipSource === 'upload' && s.uploadUrl) &&
        s.clipSource?.startsWith('ai-'),
    );
    if (pendingNow.length > 0) {
      onUpdateScenes(
        scenes.map((s) =>
          pendingNow.some((p) => p.id === s.id)
            ? { ...s, clipStatus: 'generating' as const }
            : s,
        ),
      );
    }
    try {
      // 1. ensureProject
      let persisted: { projectId: string; scenes: ComposerScene[] } | null = null;
      if (onEnsurePersisted) {
        try {
          persisted = await onEnsurePersisted();
        } catch (err: any) {
          toast({
            title: 'Fehler',
            description: err?.message || 'Projekt konnte nicht gespeichert werden',
            variant: 'destructive',
          });
          emitPipelineEvent({ type: 'clips:end' });
          setIsGeneratingAll(false);
          return;
        }
      } else if (projectId) {
        persisted = { projectId, scenes };
      }
      if (!persisted) {
        emitPipelineEvent({ type: 'clips:end' });
        setIsGeneratingAll(false);
        return;
      }
      const { projectId: pid, scenes: pScenes } = persisted;

      const eligibleScenes = pScenes.filter(
        (s) =>
          s.clipStatus !== 'ready' &&
          !(s.clipSource === 'upload' && s.uploadUrl) &&
          !(
            s.clipStatus === 'generating' &&
            s.engineOverride === 'cinematic-sync' &&
            !!(s as any).twoshotStage &&
            (s as any).twoshotStage !== 'failed'
          ) &&
          // Stage 8 (May 31 2026): don't re-trigger Cinematic-Sync scenes that
          // are already mid-lipsync — that's the root cause of "5 min later
          // the scene starts from scratch again with doubled audio". A scene
          // is mid-lipsync when lip_sync_status is pending/running/stitching
          // and lip_sync_applied_at hasn't been written yet.
          !(
            s.engineOverride === 'cinematic-sync' &&
            !(s as any).lipSyncAppliedAt &&
            ['pending', 'running', 'stitching'].includes(
              String((s as any).lipSyncStatus ?? ''),
            )
          ),
      );

      // 3. compose prompts
      const composedByScene = new Map<string, ReturnType<typeof composeFinalPrompt>>();
      for (const s of eligibleScenes) {
        const brandCharacterInput = buildBrandInputForScene(s);
        composedByScene.set(
          s.id,
          composeFinalPrompt({
            rawPrompt: s.aiPrompt || '',
            directorModifiers: s.directorModifiers,
            shotDirector: s.shotDirector,
            cinematicStylePresetId: (s as any).cinematicStylePresetId,
            brandCharacter: brandCharacterInput,
            libraryCharacters: libCharacters,
            libraryLocations: libLocations,
            audioPlan: s.audioPlan,
            performanceEntries: derivePerformanceEntries(s, characters),
            language: directorLanguage,
          }),
        );
      }


      // 4. scene-aware character anchor (parallel)
      const anchorByScene = new Map<string, Awaited<ReturnType<typeof prepareSceneAnchor>>>();
      await Promise.all(
        eligibleScenes
          .filter((s) => s.clipSource.startsWith('ai-'))
          .map(async (s) => {
            if (s.engineOverride === 'cinematic-sync') {
              anchorByScene.set(s.id, { composed: false });
              return;
            }
            const composed = composedByScene.get(s.id);
            const prepared = await prepareSceneAnchor(
              s,
              characters,
              activeBrandChar,
              composed?.finalPrompt || s.aiPrompt || '',
              '16:9',
              {},
              libLocations,
            );
            anchorByScene.set(s.id, prepared);
          }),
      );

      const scenesPayload = eligibleScenes.map((s) => {
        const composed = composedByScene.get(s.id)!;
        const prepared = anchorByScene.get(s.id);
        return {
          id: s.id,
          clipSource: s.clipSource,
          clipQuality: s.clipQuality || 'standard',
          aiPrompt: composed.finalPrompt,
          negativePrompt: composed.negativePrompt || undefined,
          stockKeywords: s.stockKeywords,
          uploadUrl: s.uploadUrl,
          referenceImageUrl: prepared?.firstFrameUrl,
          subjectReferenceUrl: prepared?.subjectReferenceUrl,
          durationSeconds: s.durationSeconds,
          characterShot: s.characterShot,
          characterShots: s.characterShots,
          dialogScript: s.dialogScript,
          dialogVoices: s.dialogVoices,
          engineOverride: s.engineOverride ?? 'auto',
          withAudio: s.withAudio !== false,
        };
      });

      if (scenesPayload.length === 0) {
        toast({ title: 'Alle Clips sind bereits fertig!' });
        emitPipelineEvent({ type: 'clips:end' });
        setIsGeneratingAll(false);
        return;
      }

      // 6. Optimistic update + freeze first frame
      const optimistic = pScenes.map((s) => {
        if (scenesPayload.some((p) => p.id === s.id) && s.clipSource.startsWith('ai-')) {
          const prep = anchorByScene.get(s.id);
          const frozenRef =
            prep?.composed && prep.firstFrameUrl ? prep.firstFrameUrl : s.referenceImageUrl;
          return { ...s, clipStatus: 'generating' as const, referenceImageUrl: frozenRef };
        }
        return s;
      });
      onUpdateScenes(optimistic);

      const { data, error } = await supabase.functions.invoke('compose-video-clips', {
        body: { projectId: pid, scenes: scenesPayload, visualStyle, characters },
      });
      if (error) throw error;

      // Edge function returns HTTP 200 with `{ok:false}` on early-phase crashes.
      if (data && (data as any).ok === false) {
        const reason = (data as any).error || (data as any).message || 'Unbekannter Fehler.';
        const stage = (data as any).stage ? ` [${(data as any).stage}]` : '';
        toast({
          title: 'Generierung fehlgeschlagen',
          description: `${reason}${stage}`,
          variant: 'destructive',
        });
        emitPipelineEvent({ type: 'clips:end' });
        return;
      }

      const updatedScenes = optimistic.map((scene) => {
        const result = data?.results?.find((r: any) => r.sceneId === scene.id);
        if (result) {
          const isAiImage = scene.clipSource === 'ai-image';
          return {
            ...scene,
            clipStatus: result.status as any,
            clipUrl: result.clipUrl || scene.clipUrl,
            uploadType:
              isAiImage && result.status === 'ready' ? 'image' : scene.uploadType,
            replicatePredictionId: result.predictionId || scene.replicatePredictionId,
          };
        }
        return scene;
      });
      onUpdateScenes(updatedScenes);

      const failedResults = (data?.results || []).filter((r: any) => r.status === 'failed');
      if (failedResults.length > 0) {
        toast({
          title: `${failedResults.length} Clip(s) fehlgeschlagen`,
          description: 'Generierung fehlgeschlagen — bitte erneut versuchen.',
          variant: 'destructive',
        });
      } else {
        toast({
          title: 'Clip-Generierung gestartet',
          description: `${data?.generatingCount || 0} KI-Clips werden generiert (€${remainingCost.toFixed(2)}).`,
        });
      }
    } catch (err: any) {
      console.error('[useGenerateAllClips] failed:', err);
      const realMsg = await extractFunctionsError(err);
      toast({
        title: 'Fehler',
        description:
          realMsg || 'Clip-Generierung fehlgeschlagen — bitte erneut versuchen.',
        variant: 'destructive',
      });
      emitPipelineEvent({ type: 'clips:end' });
    } finally {
      // Do NOT emit clips:end on success — the server only STARTED rendering.
      // The pipeline bar stays alive via real `clipStatus === 'generating'`
      // until realtime flips scenes to ready/failed.
      setIsGeneratingAll(false);
    }
  }, [
    isGeneratingAll,
    onEnsurePersisted,
    projectId,
    scenes,
    onUpdateScenes,
    buildBrandInputForScene,
    libCharacters,
    libLocations,
    directorLanguage,
    characters,
    activeBrandChar,
    visualStyle,
    remainingCost,
  ]);

  return {
    generateAll,
    isGeneratingAll,
    pendingScenes,
    readyCount,
    generatingCount,
    remainingCost,
    allReady,
  };
}
