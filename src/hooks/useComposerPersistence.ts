import { useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import type {
  ComposerScene,
  ComposerBriefing,
  AssemblyConfig,
  ComposerCategory,
  ComposerStatus,
  AdCampaignMeta,
} from '@/types/video-composer';

/**
 * Persist the assembly_config of an existing composer project to the database.
 * Used by the dashboard (debounced on every change) and AssemblyTab (synchronous
 * pre-render flush) to guarantee the export edge function reads the latest
 * voiceover / music / subtitle URLs.
 */
export async function persistAssemblyConfig(
  projectId: string,
  assemblyConfig: AssemblyConfig
): Promise<void> {
  if (!projectId) return;
  const { error } = await supabase
    .from('composer_projects')
    .update({ assembly_config: assemblyConfig as any })
    .eq('id', projectId);
  if (error) {
    console.warn('[persistence] persistAssemblyConfig failed:', error);
    throw error;
  }
}

/** Persist brand kit selection + auto-sync flag for a composer project. */
export async function persistBrandKit(
  projectId: string,
  brandKitId: string | null,
  autoSync: boolean
): Promise<void> {
  if (!projectId) return;
  const { error } = await supabase
    .from('composer_projects')
    .update({ brand_kit_id: brandKitId, brand_kit_auto_sync: autoSync } as any)
    .eq('id', projectId);
  if (error) {
    console.warn('[persistence] persistBrandKit failed:', error);
  }
}

/** Persist Ad Director campaign metadata. */
export async function persistAdMeta(
  projectId: string,
  adMeta: AdCampaignMeta | null,
  variantStrategy?: string | null,
): Promise<void> {
  if (!projectId) return;
  const { error } = await supabase
    .from('composer_projects')
    .update({
      ad_meta: (adMeta as any) ?? null,
      ad_variant_strategy: variantStrategy ?? adMeta?.variantStrategy ?? null,
    } as any)
    .eq('id', projectId);
  if (error) console.warn('[persistence] persistAdMeta failed:', error);
}

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
  brandKitId?: string | null;
  brandKitAutoSync?: boolean;
  adMeta?: AdCampaignMeta | null;
  adVariantStrategy?: string | null;
  parentProjectId?: string | null;
  cutdownType?: string | null;
}

export interface PersistResult {
  projectId: string;
  scenes: ComposerScene[];
}

const isUuid = (val?: string) =>
  !!val && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(val);

/**
 * Module-scoped in-flight cache to make `ensureProjectPersisted` idempotent
 * across concurrent callers.
 *
 * Without this, a fast double-click on "Alle generieren" — or a parallel
 * auto-save firing while the button handler is mid-flight — would race two
 * `INSERT INTO composer_projects` calls and produce TWO projects with two
 * sets of scenes (observed on 2026-05-31: project `afb52dad` + `d6879016`
 * both got 6 pending scenes, neither rendered, pipeline stuck at 95%).
 *
 * The cache key uses the local project id (UUID once persisted, otherwise a
 * stable temp string from the dashboard). Every concurrent caller awaits the
 * SAME promise → guaranteed single INSERT.
 */
const inFlightPersists = new Map<string, Promise<PersistResult>>();

export function useComposerPersistence() {
  const ensureProjectPersisted = useCallback(
    async (project: PersistableProject): Promise<PersistResult> => {
      const cacheKey = project.id || '__new__';
      const existing = inFlightPersists.get(cacheKey);
      if (existing) return existing;
      const promise = (async () => {
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
            brand_kit_id: project.brandKitId ?? null,
            brand_kit_auto_sync: project.brandKitAutoSync ?? false,
            ad_meta: (project.adMeta as any) ?? null,
            ad_variant_strategy: project.adVariantStrategy ?? project.adMeta?.variantStrategy ?? null,
            parent_project_id: project.parentProjectId ?? null,
            cutdown_type: project.cutdownType ?? null,
          } as any)
          .select('id')
          .single();

        if (insErr || !inserted) {
          throw new Error(insErr?.message || 'Projekt konnte nicht angelegt werden');
        }
        projectId = inserted.id;
      }

      // 2. (REMOVED) Destructive "delete every DB scene not present locally" cleanup.
      //    This step silently erased real scenes whenever the local snapshot was
      //    momentarily stale (realtime tick mid-flight, scene just inserted by
      //    another tab, sessionStorage hydration race after sleep/tab-switch),
      //    which is exactly the "Szene 2 verschwindet wenn Szene 3 startet" bug.
      //    Real deletes go through deleteScene → explicit DELETE by id.

      // 3. Two-phase write to satisfy UNIQUE(project_id, order_index):
      //    Phase A — push every existing row to a temporary negative order_index
      //    Phase B — write the final order_index in the target loop
      const existingIds = project.scenes.filter(s => isUuid(s.id)).map(s => s.id);
      if (existingIds.length > 0) {
        // Move each existing scene to a unique negative slot to free real slots
        for (let i = 0; i < existingIds.length; i++) {
          await supabase
            .from('composer_scenes')
            .update({ order_index: -(i + 1) } as any)
            .eq('id', existingIds[i]);
        }
      }

      // 4. Persist scenes (update existing, insert new) at their final order_index
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
              lip_sync_with_voiceover: scene.lipSyncWithVoiceover === true,
              ai_prompt: scene.aiPrompt ?? null,
              stock_keywords: scene.stockKeywords ?? null,
              upload_url: scene.uploadUrl ?? null,
              upload_type: scene.uploadType ?? null,
              reference_image_url: scene.referenceImageUrl ?? null,
              clip_url: scene.clipUrl ?? null,
              clip_status: scene.clipStatus,
              text_overlay: scene.textOverlay as any,
              transition_type: scene.transitionType,
              transition_duration: scene.transitionDuration,
              cost_euros: scene.costEuros,
              character_shot: (scene.characterShot ?? null) as any,
              character_shots: (scene.characterShots ?? (scene.characterShot ? [scene.characterShot] : [])) as any,
              dialog_script: scene.dialogScript ?? null,
              dialog_voices: (scene.dialogVoices ?? {}) as any,
              dialog_mode: scene.dialogMode ?? false,
              dialog_takes: (scene.dialogTakes ?? {}) as any,
              engine_override: scene.engineOverride ?? 'auto',
              director_modifiers: (scene.directorModifiers ?? {}) as any,
              shot_director: (scene.shotDirector ?? {}) as any,
              prompt_slots: (scene.promptSlots ?? null) as any,
              prompt_mode: scene.promptMode ?? null,
              prompt_slot_order: (scene.promptSlotOrder ?? null) as any,
              applied_style_preset_id: scene.appliedStylePresetId ?? null,
              cinematic_preset_slug: scene.cinematicPresetSlug ?? null,
              // Block M — Hybrid Production
              hybrid_mode: scene.hybridMode ?? null,
              first_frame_url: scene.firstFrameUrl ?? null,
              last_frame_url: scene.lastFrameUrl ?? null,
              end_reference_image_url: scene.endReferenceImageUrl ?? null,
              hybrid_target_scene_id: scene.hybridTargetSceneId ?? null,
              audio_plan: (scene.audioPlan ?? null) as any,
              dialog_locked_at: scene.dialogLockedAt ?? null,
              lock_reference_url: (scene as any).lockSource === 'inherited' ? null : (scene.lockReferenceUrl ?? null),
              continuity_locked: scene.continuityLocked === true,
              action_beat: (scene.actionBeat ?? null) as any,
              realism_preset: scene.realismPreset ?? null,
              scene_action_user: scene.sceneActionUser ?? null,
              scene_action_en: scene.sceneActionEn ?? null,
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
              lip_sync_with_voiceover: scene.lipSyncWithVoiceover === true,
              ai_prompt: scene.aiPrompt ?? null,
              stock_keywords: scene.stockKeywords ?? null,
              upload_url: scene.uploadUrl ?? null,
              upload_type: scene.uploadType ?? null,
              reference_image_url: scene.referenceImageUrl ?? null,
              clip_url: scene.clipUrl ?? null,
              clip_status: scene.clipStatus || 'pending',
              text_overlay: scene.textOverlay as any,
              transition_type: scene.transitionType || 'fade',
              transition_duration: scene.transitionDuration ?? 0.5,
              cost_euros: scene.costEuros || 0,
              retry_count: scene.retryCount || 0,
              character_shot: (scene.characterShot ?? null) as any,
              character_shots: (scene.characterShots ?? (scene.characterShot ? [scene.characterShot] : [])) as any,
              dialog_script: scene.dialogScript ?? null,
              dialog_voices: (scene.dialogVoices ?? {}) as any,
              dialog_mode: scene.dialogMode ?? false,
              dialog_takes: (scene.dialogTakes ?? {}) as any,
              engine_override: scene.engineOverride ?? 'auto',
              director_modifiers: (scene.directorModifiers ?? {}) as any,
              shot_director: (scene.shotDirector ?? {}) as any,
              prompt_slots: (scene.promptSlots ?? null) as any,
              prompt_mode: scene.promptMode ?? null,
              prompt_slot_order: (scene.promptSlotOrder ?? null) as any,
              applied_style_preset_id: scene.appliedStylePresetId ?? null,
              cinematic_preset_slug: scene.cinematicPresetSlug ?? null,
              // Block M — Hybrid Production
              hybrid_mode: scene.hybridMode ?? null,
              first_frame_url: scene.firstFrameUrl ?? null,
              last_frame_url: scene.lastFrameUrl ?? null,
              end_reference_image_url: scene.endReferenceImageUrl ?? null,
              hybrid_target_scene_id: scene.hybridTargetSceneId ?? null,
              audio_plan: (scene.audioPlan ?? null) as any,
              dialog_locked_at: scene.dialogLockedAt ?? null,
              lock_reference_url: (scene as any).lockSource === 'inherited' ? null : (scene.lockReferenceUrl ?? null),
              continuity_locked: scene.continuityLocked === true,
              action_beat: (scene.actionBeat ?? null) as any,
              realism_preset: scene.realismPreset ?? null,
              scene_action_user: scene.sceneActionUser ?? null,
              scene_action_en: scene.sceneActionEn ?? null,
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
      })();
      inFlightPersists.set(cacheKey, promise);
      try {
        return await promise;
      } finally {
        inFlightPersists.delete(cacheKey);
      }
    },
    []
  );

  return { ensureProjectPersisted };
}
