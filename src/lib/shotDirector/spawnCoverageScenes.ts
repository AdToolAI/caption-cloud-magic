/**
 * spawnCoverageScenes — generate a classic editorial coverage set
 * (Master + per-speaker OTS / single) for a Composer dialog scene.
 *
 * Output is a `Partial<ComposerScene>[]` ready for
 * `VideoComposerDashboard.insertScenesAfter(parentSceneId, partials,
 * { removeParent: false })`. The parent scene is preserved — coverage
 * scenes are siblings inserted right after it.
 *
 * Each spawned scene is tagged with
 *   cinematicPresetSlug = `coverage:${parentSceneId}`
 * for idempotent re-spawn / cleanup (same pattern as the existing SRS
 * sub-scene tagging in SceneDialogStudio).
 */
import type { ComposerScene, CharacterShot } from '@/types/video-composer';
import type { ShotSelection } from '@/config/shotDirector';

export interface CoveragePartial extends Partial<ComposerScene> {
  /** Always set so the caller can tell coverage-scenes apart. */
  cinematicPresetSlug: string;
}

interface BuildOpts {
  /** Inherit the parent's clipSource (ai-hailuo, ai-kling, …). */
  preserveClipSource?: boolean;
}

const COVERAGE_PREFIX = 'coverage:';

export function isCoverageScene(s: ComposerScene): boolean {
  return typeof s.cinematicPresetSlug === 'string' && s.cinematicPresetSlug.startsWith(COVERAGE_PREFIX);
}

export function coverageMarkerFor(parentSceneId: string): string {
  return `${COVERAGE_PREFIX}${parentSceneId}`;
}

/**
 * Build the coverage set. Returns at minimum a Master shot; for each cast
 * member with a brand-character link, an OTS or single close-up coverage
 * shot is appended.
 *
 *   N=1 cast → Master (wide) + Close-up of the speaker
 *   N=2 cast → Master (two-shot) + OTS-A + OTS-B
 *   N≥3 cast → Master (wide) + Single close-up per speaker (capped at 4)
 */
export function buildCoveragePartials(
  scene: ComposerScene,
  opts: BuildOpts = {},
): CoveragePartial[] {
  const marker = coverageMarkerFor(scene.id);
  const cast: CharacterShot[] = (scene.characterShots?.length
    ? scene.characterShots
    : scene.characterShot
      ? [scene.characterShot]
      : []
  ).filter((c) => c && c.characterId);

  const clipSource = opts.preserveClipSource ? scene.clipSource : 'ai-hailuo';
  const baseDuration = Math.max(4, Math.min(scene.durationSeconds ?? 6, 10));
  const basePrompt = (scene.aiPrompt ?? '').trim();

  const baseFields: Partial<ComposerScene> = {
    sceneType: scene.sceneType ?? 'custom',
    clipSource,
    clipQuality: scene.clipQuality ?? 'standard',
    clipStatus: 'pending',
    durationSeconds: baseDuration,
    referenceImageUrl: scene.referenceImageUrl,
    transitionType: 'none',
    transitionDuration: 0,
    withAudio: false,
    lipSyncWithVoiceover: false,
    engineOverride: 'auto',
  };

  const partials: CoveragePartial[] = [];

  // 1. MASTER — always wide / static
  const masterFraming = cast.length >= 2 ? 'two-shot' : 'wide';
  partials.push({
    ...baseFields,
    aiPrompt: appendShotNote(basePrompt, 'Master shot — establish the full scene with all subjects in frame'),
    shotDirector: { framing: masterFraming, movement: 'static' } as ShotSelection,
    characterShots: cast,
    cinematicPresetSlug: marker,
  });

  // 2. Coverage per speaker
  const speakerCap = Math.min(cast.length, 4);
  for (let i = 0; i < speakerCap; i++) {
    const speaker = cast[i];
    const otherCount = cast.length - 1;
    const useOts = cast.length === 2; // classic OTS for 2-handers only
    const shot: ShotSelection = useOts
      ? { framing: 'medium-close', angle: 'over-shoulder', movement: 'static' }
      : { framing: 'close-up', angle: 'eye-level', movement: 'static' };
    const note = useOts
      ? `Over-the-shoulder coverage favoring ${speakerNameFromShot(speaker)} (${otherCount} other in foreground)`
      : `Single close-up coverage of ${speakerNameFromShot(speaker)}`;
    partials.push({
      ...baseFields,
      aiPrompt: appendShotNote(basePrompt, note),
      shotDirector: shot,
      characterShots: useOts ? cast : [speaker],
      characterShot: useOts ? scene.characterShot : speaker,
      cinematicPresetSlug: marker,
    });
  }

  return partials;
}

function speakerNameFromShot(c: CharacterShot): string {
  return (c as any).name ?? (c as any).characterName ?? c.characterId ?? 'subject';
}

function appendShotNote(prompt: string, note: string): string {
  const trimmed = prompt.replace(/\s+$/, '');
  if (!trimmed) return note;
  return `${trimmed}\n\n[Coverage] ${note}.`;
}
