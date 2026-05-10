/**
 * Phase 5.6 — Snake-case snapshot helper.
 * Converts a camelCase ComposerScene (in-memory shape) into the snake_case
 * row layout expected by the `composer_scenes` table so we can persist a
 * before-state snapshot in the undo-stack and `upsert` it back on undo.
 *
 * Only the fields that are actually present in the DB and meaningful to
 * restore are included. Unknown fields are omitted to keep the payload lean
 * and forward-compatible.
 */
import type { ComposerScene } from '@/types/video-composer';

export function sceneToSnakeSnapshot(scene: ComposerScene): Record<string, unknown> {
  return {
    id: scene.id,
    project_id: scene.projectId,
    order_index: scene.orderIndex,
    scene_type: (scene as unknown as { sceneType?: string }).sceneType ?? null,
    title: (scene as unknown as { title?: string }).title ?? null,
    description: (scene as unknown as { description?: string }).description ?? null,
    ai_prompt: scene.aiPrompt ?? null,
    duration_seconds: scene.durationSeconds,
    clip_source: scene.clipSource,
    clip_quality: scene.clipQuality ?? 'standard',
    clip_url: scene.clipUrl ?? null,
    clip_status: scene.clipStatus,
    clip_lead_in_trim_seconds: scene.clipLeadInTrimSeconds ?? 0,
    reference_image_url: (scene as unknown as { referenceImageUrl?: string }).referenceImageUrl ?? null,
    first_frame_url: (scene as unknown as { firstFrameUrl?: string }).firstFrameUrl ?? null,
    seed: scene.seed ?? null,
    seed_variations: scene.seedVariations ?? null,
    preview_clip_url: scene.previewClipUrl ?? null,
    preview_status: scene.previewStatus ?? null,
    text_overlay: scene.textOverlay ?? null,
    transition_type: scene.transitionType ?? null,
    transition_duration: scene.transitionDuration ?? null,
    upload_type: (scene as unknown as { uploadType?: string }).uploadType ?? null,
  };
}
