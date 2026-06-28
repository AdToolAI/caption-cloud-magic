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
import { buildInvokePrompt } from '@/lib/motion-studio/buildInvokePrompt';
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
  /**
   * Schritt 1 — cost-confirm gate. When provided, render is blocked
   * until the user approves the cost breakdown. Returning false cancels.
   */
  confirmRender?: (scene: ComposerScene) => Promise<boolean>;
}

export function useSceneGenerate(opts: UseSceneGenerateOpts) {
  const [generating, setGenerating] = useState<Record<string, boolean>>({});

  const generate = useCallback(
    async (scene: ComposerScene) => {
      if (!scene) return;
      // ── Schritt 1: Cost-Confirm-Gate ──────────────────────────────────
      // Block BEFORE optimistic feedback so the UI doesn't show a fake
      // "Baut…" state if the user cancels.
      if (opts.confirmRender) {
        const ok = await opts.confirmRender(scene);
        if (!ok) return;
      }
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
        const sceneAlreadyPersisted = /^[0-9a-f-]{36}$/i.test(scene.id);
        const projectAlreadyPersisted = !!pid && /^[0-9a-f-]{36}$/i.test(pid);

        // Only run the (potentially expensive, formerly destructive) full
        // project persistence when something is genuinely unpersisted. For an
        // already-saved scene in an already-saved project we just dispatch
        // the render — touching the rest of the storyboard here is what used
        // to make Szene 2 disappear when Szene 3 was started.
        if (opts.ensureProject && (!sceneAlreadyPersisted || !projectAlreadyPersisted)) {
          let persisted: { projectId: string; scenes: ComposerScene[] } | undefined;
          try {
            persisted = await opts.ensureProject();
          } catch (persistErr: any) {
            opts.onOptimisticPatch?.(scene.id, { clipStatus: previousStatus });
            emitPipelineEvent({ type: 'clips:end' });
            setGenerating((prev) => ({ ...prev, [scene.id]: false }));
            toast({
              title: 'Projekt konnte nicht gespeichert werden',
              description: persistErr?.message || 'Bitte erneut versuchen.',
              variant: 'destructive',
            });
            return;
          }
          if (!persisted) {
            opts.onOptimisticPatch?.(scene.id, { clipStatus: previousStatus });
            emitPipelineEvent({ type: 'clips:end' });
            setGenerating((prev) => ({ ...prev, [scene.id]: false }));
            toast({
              title: 'Projekt konnte nicht gespeichert werden',
              description: 'Bitte erneut versuchen.',
              variant: 'destructive',
            });
            return;
          }
          pid = persisted.projectId;
          // Match by id first (stable), fall back to orderIndex only if the
          // scene was just inserted and got a fresh UUID.
          const dbScene =
            persisted.scenes.find((s) => s.id === scene.id) ??
            persisted.scenes.find((s) => s.orderIndex === scene.orderIndex);
          if (dbScene) workingScene = { ...dbScene, ...scene, id: dbScene.id };
        }

        // Stage 7: clear any stale `auto-reset:` marker BEFORE the invoke so
        // the row visibly flips to `generating` even if realtime races the
        // edge function's own pre-mark. Without this, an old
        // `talking_head_master_invalid_for_cinematic_sync` marker keeps the
        // UI on "Wartet" forever for 1-speaker cinematic-sync scenes.
        if (/^[0-9a-f-]{36}$/i.test(workingScene.id) && workingScene.clipSource?.startsWith('ai-')) {
          try {
            await supabase
              .from('composer_scenes')
              .update({ clip_status: 'generating', clip_error: null })
              .eq('id', workingScene.id);
          } catch (preErr) {
            console.warn('[useSceneGenerate] pre-mark failed', preErr);
          }
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

        // The edge function now returns HTTP 200 with `{ok:false, error, stage}`
        // on early-phase crashes (so supabase-js doesn't bury the message
        // behind a generic "non-2xx" string). Detect and surface it.
        if (data && (data as any).ok === false) {
          const reason = (data as any).error || (data as any).message || 'Unbekannter Fehler.';
          const stage = (data as any).stage ? ` [${(data as any).stage}]` : '';
          opts.onOptimisticPatch?.(scene.id, { clipStatus: 'failed' });
          toast({
            title: 'Generierung fehlgeschlagen',
            description: `${reason}${stage}`,
            variant: 'destructive',
          });
          emitPipelineEvent({ type: 'clips:end' });
          return;
        }

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
