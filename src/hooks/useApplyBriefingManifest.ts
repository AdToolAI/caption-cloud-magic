/**
 * useApplyBriefingManifest
 *
 * Stage 3 of the Briefing → Storyboard pipeline. Takes a (parsed +
 * user-reviewed) BriefingManifest and writes its accepted fields into
 * existing composer state via callbacks the BriefingTab already exposes.
 *
 * Pure-callback design so this hook stays decoupled from VideoComposerDashboard
 * internals. The dialog passes in whatever subset the user approved.
 */

import { useCallback } from 'react';
import type {
  ComposerScene,
  AssemblyConfig,
  ComposerBriefing,
  CharacterShot,
} from '@/types/video-composer';
import type { TBriefingManifest, TBriefingScene } from '@/lib/video-composer/briefing/manifestSchema';

const DEFAULT_TEXT_OVERLAY = {
  type: 'none' as const,
  text: '',
  position: 'center' as const,
  fontSize: 'medium' as const,
  color: '#FFFFFF',
  fontFamily: 'Inter',
};

function newSceneId() {
  return `scene_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

/** Resolve a "@founder-avatar" / "founder" mention against the unified
 *  mention library (already provided by the caller as a flat character list). */
function resolveCastMention(
  mention: string,
  characters: Array<{ id: string; name: string; reference_image_url?: string | null }>,
): CharacterShot | null {
  const needle = mention.replace(/^@/, '').toLowerCase().replace(/[-_\s]/g, '');
  const hit = characters.find((c) => {
    const n = (c.name ?? '').toLowerCase().replace(/[-_\s]/g, '');
    return n.includes(needle) || needle.includes(n);
  });
  if (!hit) return null;
  return {
    characterId: hit.id,
    characterName: hit.name,
    shotType: 'full',
    referenceImageUrl: hit.reference_image_url ?? undefined,
  } as CharacterShot;
}

function resolveLocationMention(
  mention: string,
  locations: Array<{ id: string; name: string; reference_image_url?: string | null }>,
): { id: string; referenceImageUrl?: string } | null {
  const needle = mention.replace(/^@/, '').toLowerCase().replace(/[-_\s]/g, '');
  const hit = locations.find((l) => {
    const n = (l.name ?? '').toLowerCase().replace(/[-_\s]/g, '');
    return n.includes(needle) || needle.includes(n);
  });
  if (!hit) return null;
  return { id: hit.id, referenceImageUrl: hit.reference_image_url ?? undefined };
}

export interface ApplyBriefingArgs {
  manifest: TBriefingManifest;
  /** Field-level acceptance flags (default all true). */
  accept: {
    project: boolean;
    scenes: boolean;
    voice: boolean;
    captions: boolean;
    negativePrompt: boolean;
  };
  /** Unified mention library (characters + locations) for resolving "@…" tags. */
  characters: Array<{ id: string; name: string; reference_image_url?: string | null }>;
  locations: Array<{ id: string; name: string; reference_image_url?: string | null }>;

  /** Existing composer wiring — passed in to keep this hook decoupled. */
  currentScenes: ComposerScene[];
  currentAssembly: AssemblyConfig | undefined;
  currentBriefing: ComposerBriefing;
  onUpdateBriefing: (patch: Partial<ComposerBriefing>) => void;
  onUpdateScenes: (scenes: ComposerScene[]) => void;
  onApplyAssembly: (next: AssemblyConfig) => void;
}

function manifestSceneToComposerScene(
  ms: TBriefingScene,
  orderIndex: number,
  projectId: string,
  resolveCharacters: (cast: TBriefingScene['cast']) => CharacterShot[],
  negativePrompt: string | undefined,
): ComposerScene {
  const characterShots = resolveCharacters(ms.cast ?? []);
  const primary = characterShots[0];

  // Build the AI prompt: anchor hint (EN) + negative prompt as separate clause.
  const promptParts: string[] = [];
  if (ms.anchorPromptEN?.trim()) promptParts.push(ms.anchorPromptEN.trim());
  const aiPrompt = promptParts.join(' ') || undefined;

  return {
    id: newSceneId(),
    projectId,
    orderIndex,
    sceneType: 'custom',
    durationSeconds: Math.round(ms.durationSec),
    clipSource: 'ai-hailuo' as any,
    clipQuality: 'standard',
    clipStatus: 'pending',
    aiPrompt,
    characterShot: primary,
    characterShots: characterShots.length ? characterShots : undefined,
    engineOverride: ms.engine && ms.engine !== 'auto' ? (ms.engine as any) : undefined,
    dialogMode: ms.engine === 'cinematic-sync' || ms.engine === 'native-dialogue' || !!ms.voiceover?.text,
    shotDirector: ms.shotDirector
      ? {
          framing: ms.shotDirector.framing,
          angle: ms.shotDirector.angle,
          movement: ms.shotDirector.movement,
          lighting: ms.shotDirector.lighting,
        }
      : undefined,
    textOverlay: { ...DEFAULT_TEXT_OVERLAY } as any,
    transitionType: 'none',
    transitionDuration: 0,
    retryCount: 0,
    costEuros: 0,
    // Stash VO and negative prompt so AudioTab/VoiceSubtitlesTab can pick
    // them up later — they live in dialog/notes fields that already exist.
    dialogScript: ms.voiceover?.text
      ? `NARRATOR: ${ms.voiceover.text}`
      : undefined,
  } as ComposerScene;
}

export function useApplyBriefingManifest() {
  return useCallback((args: ApplyBriefingArgs) => {
    const {
      manifest, accept, characters, locations,
      currentScenes, currentAssembly, currentBriefing,
      onUpdateBriefing, onUpdateScenes, onApplyAssembly,
    } = args;

    // ── Project metadata (aspect ratio, duration, name) ──
    if (accept.project && manifest.project) {
      const patch: Partial<ComposerBriefing> = {};
      if (manifest.project.aspectRatio) patch.aspectRatio = manifest.project.aspectRatio;
      if (manifest.project.totalDurationSec) patch.duration = Math.round(manifest.project.totalDurationSec);
      if (Object.keys(patch).length) onUpdateBriefing(patch);
    }

    // ── Scenes ──
    if (accept.scenes && manifest.scenes?.length) {
      const projectId = currentScenes[0]?.projectId ?? '';
      const resolveCharacters = (cast: TBriefingScene['cast']) =>
        (cast ?? [])
          .map((c) => resolveCastMention(c.mentionKey, characters))
          .filter((x): x is CharacterShot => x !== null);

      const newScenes: ComposerScene[] = manifest.scenes
        .sort((a, b) => a.index - b.index)
        .map((s, i) => manifestSceneToComposerScene(
          s, i, projectId, resolveCharacters, manifest.negativePrompt,
        ));

      onUpdateScenes(newScenes);
    }

    // ── Assembly: voice, captions, negative prompt ──
    const baseAssembly: AssemblyConfig = currentAssembly ?? {
      colorGrading: 'none' as any,
      transitionStyle: 'none' as any,
      kineticText: false,
      voiceover: null,
      music: null,
      beatSync: false,
    };
    let assembly: AssemblyConfig = baseAssembly;

    if (accept.voice && manifest.voice) {
      const v = manifest.voice;
      const fullScript = (manifest.scenes ?? [])
        .map((s) => s.voiceover?.text?.trim())
        .filter(Boolean)
        .join(' ');
      assembly = {
        ...assembly,
        voiceover: {
          enabled: true,
          voiceId: v.voiceId ?? assembly.voiceover?.voiceId ?? 'JBFqnCBsd6RMkjVDRZzb',
          voiceName: v.voiceName ?? assembly.voiceover?.voiceName ?? 'George',
          script: fullScript || assembly.voiceover?.script || '',
          speed: v.speed,
          stability: v.stability,
          similarityBoost: v.similarityBoost,
          styleExaggeration: v.style,
          useSpeakerBoost: v.speakerBoost,
        },
      };
    }

    if (accept.captions && manifest.captions) {
      const c = manifest.captions;
      assembly = {
        ...assembly,
        subtitles: {
          enabled: c.enabled ?? true,
          language: currentBriefing?.language ?? 'de',
          style: {
            font: c.font ?? 'Inter',
            size: c.sizePx ?? 64,
            color: c.color ?? '#FFFFFF',
            background: c.strokeColor ? '' : '',
            position: (c.position === 'top' ? 'top' : 'bottom') as 'top' | 'bottom',
          },
        },
      };
    }

    if (accept.project || accept.voice || accept.captions) {
      onApplyAssembly(assembly);
    }

    // Hand back a small summary the dialog can render in a toast.
    return {
      scenesApplied: accept.scenes ? (manifest.scenes?.length ?? 0) : 0,
      voiceApplied: accept.voice && !!manifest.voice,
      captionsApplied: accept.captions && !!manifest.captions,
    };
  }, []);
}
