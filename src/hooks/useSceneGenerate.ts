/**
 * useSceneGenerate — Stage 18: in-place scene generation from the storyboard
 * inline player.
 *
 * Calls the existing `compose-video-clips` edge function for ONE scene and
 * lets the dashboard's realtime subscription (`useComposerScenesRealtime`)
 * pick up the resulting status changes. Keeps the user on the storyboard —
 * no tab switch to the legacy ClipsTab is required.
 *
 * Power-user features (frame anchor pre-composition, brand-character auto
 * inject, snapshot history, cinematic-sync dedicated path) remain available
 * inside ClipsTab for the small set of users who deep-link `?tab=clips`.
 */
import { useCallback, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from '@/hooks/use-toast';
import { extractFunctionsError } from '@/lib/functionsError';
import { emitPipelineEvent } from '@/lib/pipelineEvents';
import type {
  ComposerScene,
  ComposerCharacter,
} from '@/types/video-composer';

interface UseSceneGenerateOpts {
  projectId?: string;
  visualStyle?: string;
  characters?: ComposerCharacter[];
  /** Apply a local optimistic patch (e.g. set clipStatus='generating'). */
  onOptimisticPatch?: (sceneId: string, patch: Partial<ComposerScene>) => void;
  /** Persist the project (assign DB UUIDs) before generating. */
  ensureProject?: () => Promise<{ projectId: string; scenes: ComposerScene[] } | undefined>;
}

export function useSceneGenerate(opts: UseSceneGenerateOpts) {
  const [generating, setGenerating] = useState<Record<string, boolean>>({});

  const generate = useCallback(
    async (scene: ComposerScene) => {
      if (!scene) return;
      // ── INSTANT FEEDBACK (0s) ───────────────────────────────────────
      // Fire BEFORE any slow async (ensureProject, anchor compose, edge
      // function). The user must see the loading state on the very next
      // frame after clicking, not 30s later.
      setGenerating((prev) => ({ ...prev, [scene.id]: true }));
      emitPipelineEvent({ type: 'clips:start' });
      if (scene.clipSource?.startsWith('ai-')) {
        opts.onOptimisticPatch?.(scene.id, { clipStatus: 'generating' });
      }
      const previousStatus = scene.clipStatus;
      try {
        let pid = opts.projectId;
        let workingScene = scene;
        if (opts.ensureProject) {
          const persisted = await opts.ensureProject();
          if (!persisted) {
            opts.onOptimisticPatch?.(scene.id, { clipStatus: previousStatus });
            emitPipelineEvent({ type: 'clips:end' });
            setGenerating((prev) => ({ ...prev, [scene.id]: false }));
            return;
          }
          pid = persisted.projectId;
          const dbScene = persisted.scenes.find((s) => s.orderIndex === scene.orderIndex);
          if (dbScene) workingScene = { ...dbScene, ...scene, id: dbScene.id };
        }

        const { data, error } = await supabase.functions.invoke('compose-video-clips', {
          body: {
            projectId: pid,
            visualStyle: opts.visualStyle,
            characters: opts.characters,
            scenes: [
              {
                id: workingScene.id,
                clipSource: workingScene.clipSource,
                clipQuality: workingScene.clipQuality || 'standard',
                aiPrompt: workingScene.aiPrompt,
                stockKeywords: workingScene.stockKeywords,
                uploadUrl: workingScene.uploadUrl,
                referenceImageUrl: workingScene.referenceImageUrl,
                durationSeconds: workingScene.durationSeconds,
                characterShot: workingScene.characterShot,
                characterShots: workingScene.characterShots,
                dialogScript: workingScene.dialogScript,
                dialogVoices: workingScene.dialogVoices,
                engineOverride: workingScene.engineOverride ?? 'auto',
                withAudio: workingScene.withAudio !== false,
                shotDirector: workingScene.shotDirector,
                directorModifiers: workingScene.directorModifiers,
              },
            ],
          },
        });
        if (error) throw error;

        const result = data?.results?.[0];
        if (result) {
          opts.onOptimisticPatch?.(workingScene.id, {
            clipStatus: result.status,
            clipUrl: result.clipUrl || workingScene.clipUrl,
            replicatePredictionId: result.predictionId || workingScene.replicatePredictionId,
          });
        }
        toast({
          title: 'Generierung gestartet',
          description: `Szene ${(workingScene.orderIndex ?? 0) + 1} wird gebaut…`,
        });
        // Intentionally do NOT emit clips:end on success — the server only
        // STARTED generation. Real `clipStatus === 'generating'` keeps the
        // pipeline bar alive until realtime flips the scene to ready/failed.
      } catch (err: any) {
        opts.onOptimisticPatch?.(scene.id, { clipStatus: previousStatus });
        console.error('[useSceneGenerate] failed', err);
        const realMsg = await extractFunctionsError(err);
        toast({
          title: 'Generierung fehlgeschlagen',
          description: realMsg || err?.message || 'Bitte erneut versuchen.',
          variant: 'destructive',
        });
        emitPipelineEvent({ type: 'clips:end' });
      } finally {
        setGenerating((prev) => ({ ...prev, [scene.id]: false }));
      }
    },
    [opts],
  );

  return { generate, generating } as const;
}
