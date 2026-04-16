import { useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import type {
  ComposerScene,
  ComposerBriefing,
  AssemblyConfig,
  ComposerCategory,
  ComposerStatus,
} from '@/types/video-composer';

export interface PersistableProject {
  id?: string;
  title: string;
  category: ComposerCategory;
  briefing: ComposerBriefing;
  status: ComposerStatus;
  scenes: ComposerScene[];
  assemblyConfig: AssemblyConfig;
  totalCostEuros: number;
  language: string;
}

export interface PersistResult {
  projectId: string;
  scenes: ComposerScene[];
}

const isUuid = (val?: string) =>
  !!val && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(val);

export function useComposerPersistence() {
  const ensureProjectPersisted = useCallback(
    async (project: PersistableProject): Promise<PersistResult> => {
      const { data: { user }, error: authError } = await supabase.auth.getUser();
      if (authError || !user) {
        throw new Error('Du musst angemeldet sein, um ein Projekt zu speichern.');
      }

      let projectId = project.id;

      // 1. Insert project if not yet persisted
      if (!isUuid(projectId)) {
        const { data: inserted, error: insErr } = await supabase
          .from('composer_projects')
          .insert({
            user_id: user.id,
            title: project.title || 'Motion Studio Projekt',
            category: project.category,
            briefing: project.briefing as any,
            status: project.status || 'draft',
            assembly_config: project.assemblyConfig as any,
            total_cost_euros: project.totalCostEuros || 0,
            language: project.language || 'de',
          })
          .select('id')
          .single();

        if (insErr || !inserted) {
          throw new Error(insErr?.message || 'Projekt konnte nicht angelegt werden');
        }
        projectId = inserted.id;
      }

      // 2. Persist all scenes — upsert by re-inserting any scene that lacks a real UUID
      const persistedScenes: ComposerScene[] = [];

      for (let i = 0; i < project.scenes.length; i++) {
        const scene = project.scenes[i];
        const sceneHasUuid = isUuid(scene.id);

        if (sceneHasUuid) {
          // Update existing
          const { error: updErr } = await supabase
            .from('composer_scenes')
            .update({
              order_index: i,
              scene_type: scene.sceneType,
              duration_seconds: scene.durationSeconds,
              clip_source: scene.clipSource,
              clip_quality: scene.clipQuality || 'standard',
              ai_prompt: scene.aiPrompt ?? null,
              stock_keywords: scene.stockKeywords ?? null,
              upload_url: scene.uploadUrl ?? null,
              upload_type: scene.uploadType ?? null,
              clip_url: scene.clipUrl ?? null,
              clip_status: scene.clipStatus,
              text_overlay: scene.textOverlay as any,
              transition_type: scene.transitionType,
              transition_duration: scene.transitionDuration,
              cost_euros: scene.costEuros,
            } as any)
            .eq('id', scene.id);

          if (updErr) {
            console.warn('[persistence] Scene update failed:', updErr);
          }
          persistedScenes.push({ ...scene, projectId: projectId! });
        } else {
          // Insert new
          const { data: newScene, error: scnErr } = await supabase
            .from('composer_scenes')
            .insert({
              project_id: projectId!,
              order_index: i,
              scene_type: scene.sceneType,
              duration_seconds: scene.durationSeconds,
              clip_source: scene.clipSource,
              clip_quality: scene.clipQuality || 'standard',
              ai_prompt: scene.aiPrompt ?? null,
              stock_keywords: scene.stockKeywords ?? null,
              upload_url: scene.uploadUrl ?? null,
              upload_type: scene.uploadType ?? null,
              clip_url: scene.clipUrl ?? null,
              clip_status: scene.clipStatus || 'pending',
              text_overlay: scene.textOverlay as any,
              transition_type: scene.transitionType || 'fade',
              transition_duration: scene.transitionDuration ?? 0.5,
              cost_euros: scene.costEuros || 0,
              retry_count: scene.retryCount || 0,
            } as any)
            .select('id')
            .single();

          if (scnErr || !newScene) {
            throw new Error(scnErr?.message || `Szene ${i + 1} konnte nicht gespeichert werden`);
          }

          persistedScenes.push({
            ...scene,
            id: newScene.id,
            projectId: projectId!,
          });
        }
      }

      return { projectId: projectId!, scenes: persistedScenes };
    },
    []
  );

  return { ensureProjectPersisted };
}
