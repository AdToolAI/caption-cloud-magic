/**
 * useApplyProductionPlan
 *
 * Replaces a project's storyboard from a ProductionPlan while STRICTLY
 * protecting the lipsync pipeline:
 *
 *  - Existing scenes that are rendered, locked, or have lipsync state are
 *    NEVER deleted or mutated. They stay as-is; new plan scenes are added
 *    around them.
 *  - Only "pending, never touched" scenes are eligible for replacement.
 *  - Writes go through the normal Composer state setters (`onUpdateScenes` →
 *    `setScenes`), so propagateDialogLock and pending-resolvers run.
 *  - No direct writes to dialog_shots / syncso_* / dialog_locked_at / etc.
 */

import { useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import {
  cleanVoiceId,
  createVoicePoolPicker,
  type VoicePoolPicker,
} from '@/lib/video-composer/autoVoiceAssignment';
import type {
  ComposerScene,
  AssemblyConfig,
  ComposerBriefing,
  CharacterShot,
  CharacterShotType,
  ScenePerformance,
  PerformanceExpression,
  PerformanceGesture,
  PerformanceGaze,
  PerformanceEnergy,
} from '@/types/video-composer';
import type { TProductionPlan, TPlanScene } from '@/lib/video-composer/briefing/productionPlan';

const DEFAULT_TEXT_OVERLAY = {
  text: '',
  position: 'bottom' as const,
  animation: 'fade-in' as const,
  fontSize: 48,
  color: '#FFFFFF',
};

function newSceneId() {
  return `scene_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

const LIPSYNC_ENGINES = new Set([
  'cinematic-sync', 'sync-polish', 'sync-segments', 'native-dialogue', 'heygen',
]);

const isUuid = (val?: string | null): val is string =>
  !!val && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(val);

// ── Free-form → enum mappers for Performance Layer ────────────────────────

function mapExpression(raw?: string): PerformanceExpression | undefined {
  if (!raw) return undefined;
  const s = raw.toLowerCase();
  if (/(smile|warm|happy|lächel|freundlich|friendly)/.test(s)) return 'warm-smile';
  if (/(curious|neugierig|interest)/.test(s)) return 'curious';
  if (/(concern|worried|sorge|besorgt|sad|trauer)/.test(s)) return 'concerned';
  if (/(confident|selbstbewusst|stark|determined)/.test(s)) return 'confident';
  if (/(surprised|überrascht|shock|staun)/.test(s)) return 'surprised';
  if (/(neutral|ruhig|calm|still|stoisch)/.test(s)) return 'neutral';
  return undefined;
}
function mapGesture(raw?: string): PerformanceGesture | undefined {
  if (!raw) return undefined;
  const s = raw.toLowerCase();
  if (/(point|zeig|finger)/.test(s)) return 'point';
  if (/(open[-\s]?palm|offene hände|gesticulate|gestikulier)/.test(s)) return 'open-palms';
  if (/(chin|kinn|nachdenklich)/.test(s)) return 'hand-on-chin';
  if (/(cross[-\s]?arm|verschränkt)/.test(s)) return 'cross-arms';
  if (/(lean[-\s]?in|lehnt sich|forward)/.test(s)) return 'lean-in';
  if (/(still|ruhig|motionless|reglos)/.test(s)) return 'still';
  return undefined;
}
function mapGaze(raw?: string): PerformanceGaze | undefined {
  if (!raw) return undefined;
  const s = raw.toLowerCase();
  if (/(camera|kamera|to[-\s]?cam|in die kamera)/.test(s)) return 'to-camera';
  if (/(speaker|gegenüber|partner|anderen)/.test(s)) return 'to-speaker';
  if (/(down|boden|denk|thinking|nachdenk)/.test(s)) return 'down-thinking';
  if (/(away|abgewandt|weg|side)/.test(s)) return 'away';
  return undefined;
}
function clampEnergy(n: any): PerformanceEnergy | undefined {
  const v = Number(n);
  if (!Number.isFinite(v)) return undefined;
  const r = Math.max(1, Math.min(5, Math.round(v)));
  return r as PerformanceEnergy;
}

function framingToShotType(framing?: string, fallback: CharacterShotType = 'full'): CharacterShotType {
  if (!framing) return fallback;
  const s = framing.toLowerCase();
  if (/(extreme[-\s]?close|extreme-close-up|ecu)/.test(s)) return 'detail';
  if (/(close[-\s]?up|cu)/.test(s)) return 'detail';
  if (/(profile)/.test(s)) return 'profile';
  if (/(over[-\s]?the[-\s]?shoulder|ots|pov)/.test(s)) return 'pov';
  if (/(back|rücken)/.test(s)) return 'back';
  if (/(silhouette)/.test(s)) return 'silhouette';
  if (/(wide|establish|extreme[-\s]?wide)/.test(s)) return 'full';
  return fallback;
}

function realismFromTone(tone?: string): ComposerScene['realismPreset'] | undefined {
  if (!tone) return undefined;
  const t = tone.toLowerCase();
  if (/(dramatic|luxury|cinematic|epic)/.test(t)) return 'cinematic-spot';
  if (/(friendly|professional|corporate|warm)/.test(t)) return 'lifestyle-hero';
  if (/(documentary|doku|realistic|natural)/.test(t)) return 'documentary';
  return undefined;
}

function motionIntensityFromMusic(energy?: string): NonNullable<ComposerScene['actionBeat']>['motionIntensity'] {
  switch ((energy ?? '').toLowerCase()) {
    case 'drop':
    case 'high':   return 'high';
    case 'mid':    return 'moderate';
    case 'low':    return 'subtle';
    case 'silent': return 'static';
    default:       return 'static';
  }
}

function splitAction(anchorEN?: string): { characterAction?: string; environmentMotion?: string } {
  if (!anchorEN) return {};
  const parts = anchorEN.split(/(?<=[.!?])\s+/);
  if (parts.length <= 1) {
    const words = anchorEN.trim().split(/\s+/);
    if (words.length <= 12) return { characterAction: anchorEN.trim() };
    return {
      characterAction: words.slice(0, 12).join(' '),
      environmentMotion: words.slice(12).join(' '),
    };
  }
  return {
    characterAction: parts[0].trim(),
    environmentMotion: parts.slice(1).join(' ').trim() || undefined,
  };
}


/**
 * A scene is PROTECTED from being deleted/replaced when ANY of these is true:
 *  - clip_url is set            (a render exists)
 *  - lipSyncStatus is set       (lipsync pipeline touched it)
 *  - dialogLockedAt is set      (dialog lock placed)
 *  - lockReferenceUrl is set    (continuity lock placed)
 *  - clip_status is 'generating' (mid-flight, do not yank)
 *  - has rows in dialog_shots   (checked via async DB lookup)
 *
 * NOTE: `clip_status === 'failed'` is intentionally NOT protected on its
 * own — a failed scene with no lipsync state and no clip_url is exactly
 * the case where re-running the Briefing should rewrite the bad prompt.
 */
function isLocallyProtected(s: ComposerScene): boolean {
  if (s.clipUrl) return true;
  if (s.clipStatus === 'generating') return true;
  const anyS = s as any;
  if (anyS.lipSyncStatus) return true;
  if (anyS.dialogLockedAt) return true;
  if (anyS.lockReferenceUrl) return true;
  return false;
}

function planSceneToComposerScene(
  ps: TPlanScene,
  orderIndex: number,
  projectId: string,
  negativePrompt: string | undefined,
  briefingTone: string | undefined,
  projectVoiceId: string | undefined,
  defaultVoicesByCharacter: Record<string, string | undefined> = {},
  genderByCharacter: Record<string, 'male' | 'female' | 'neutral' | null | undefined> = {},
  voicePoolPicker?: VoicePoolPicker,
  voicePoolAssignments: Record<string, string> = {},
): ComposerScene {

  // Build characterShots from resolved cast. The plan stores `characterId`
  // as the BASE brand_characters.id (CastRef invariant) plus an optional
  // separate `outfitLookId`. We still defensively strip any legacy mention
  // prefix in case an older plan flows through.
  const UUID_RE = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i;
  const stripPrefix = (id: string) => {
    if (!id) return id;
    // Multi-segment mention IDs like `catalog:location:<uuid>` or
    // `catalog:character:<uuid>` → return the trailing UUID.
    const m = id.match(UUID_RE);
    if (m && id.includes(':')) return m[0];
    return id.startsWith('lib:') ? id.slice(4) : id.replace(/^(outfit|catalog):/, '');
  };
  const primaryShot = framingToShotType(ps.shotDirector?.framing, 'full');
  const rawShots: CharacterShot[] = (ps.cast ?? [])
    .filter((c) => c.characterId)
    .map((c, i) =>
      ({
        characterId: stripPrefix(c.characterId as string),
        // Per-cast override (Stage-3 mapping completion) wins over the
        // scene default. Falls back to primary/profile split for 2-shots.
        shotType: c.shotType
          ? c.shotType
          : i === 0
            ? primaryShot
            : (primaryShot === 'detail' ? 'profile' : 'profile'),
        // Propagate outfit selection — `prepareSceneAnchor` reads this
        // and swaps the avatar's default portrait for the outfit cover
        // image during anchor composition.
        outfitLookId: c.outfitLookId ?? undefined,
      }) as CharacterShot,
    );

  // Cast-Dedup: collapse multiple slots that resolve to the same person
  // (UUID + legacy slug, or duplicate UUID entries). First occurrence wins
  // its slot index; if a later entry has a more specific shotType, prefer it.
  // Without this dedup, Multi-Portrait Nano Banana 2 burns a slot on a ghost
  // entry and Cast Consistency Map shows a phantom badge.
  const shotSpecificity: Record<string, number> = {
    absent: 0, full: 1, profile: 2, pov: 3, detail: 4,
  };
  const dedupMap = new Map<string, CharacterShot>();
  for (const shot of rawShots) {
    const key = String(shot.characterId).toLowerCase().trim();
    if (!key) continue;
    const existing = dedupMap.get(key);
    if (!existing) {
      dedupMap.set(key, shot);
      continue;
    }
    // Keep the more specific shotType, but preserve the existing outfit
    // selection if the new one doesn't have one.
    const existingRank = shotSpecificity[existing.shotType ?? 'full'] ?? 1;
    const newRank = shotSpecificity[shot.shotType ?? 'full'] ?? 1;
    if (newRank > existingRank) {
      dedupMap.set(key, {
        ...shot,
        outfitLookId: shot.outfitLookId ?? existing.outfitLookId,
      });
    } else if (!existing.outfitLookId && shot.outfitLookId) {
      dedupMap.set(key, { ...existing, outfitLookId: shot.outfitLookId });
    }
  }
  const characterShots: CharacterShot[] = Array.from(dedupMap.values());

  // Build the i2v prompt: English anchor hint + continuity + brand note +
  // scene-level + global negative-prompt suffix.
  const promptParts: string[] = [];
  if (ps.anchorPromptEN?.trim()) promptParts.push(ps.anchorPromptEN.trim());
  if (ps.continuityHint?.trim()) promptParts.push(`Continuity: ${ps.continuityHint.trim()}`);
  if (ps.brandAnchor?.note?.trim()) promptParts.push(`Brand: ${ps.brandAnchor.note.trim()}`);
  const negParts: string[] = [];
  if (ps.negativePromptScene?.trim()) negParts.push(ps.negativePromptScene.trim());
  if (negativePrompt?.trim()) negParts.push(negativePrompt.trim());
  if (negParts.length) {
    promptParts.push(`--no ${negParts.join(', ').replace(/\s+/g, ' ').trim()}`);
  }
  const aiPrompt = promptParts.join(' ') || undefined;

  // Per-character dialog voices (cinematic-sync / heygen use these).
  // Fallback chain: plan voice → brand default → deterministic AI pool (gender-aware,
  // round-robin across the whole apply run) → project-level voice. Result: a speaker
  // is NEVER left without a voice, even when the briefing and the avatar both omit one.
  const dialogVoices: Record<string, string> = {};
  for (const c of ps.cast ?? []) {
    if (!c.characterId) continue;
    const characterId = stripPrefix(c.characterId as string);
    let vid = cleanVoiceId(c.voiceId, defaultVoicesByCharacter)
      || cleanVoiceId(defaultVoicesByCharacter[characterId]);
    if (!vid && voicePoolPicker) {
      // Stable per-character: pick once per apply-run, reuse for every scene
      // that features this speaker so the same person keeps the same voice.
      const cached = voicePoolAssignments[characterId];
      if (cached) {
        vid = cached;
      } else {
        const picked = voicePoolPicker.pick(genderByCharacter[characterId]);
        voicePoolAssignments[characterId] = picked.id;
        vid = picked.id;
      }
    }
    if (!vid) vid = cleanVoiceId(projectVoiceId);
    if (vid) dialogVoices[characterId] = vid;
  }



  const engine = ps.engine ?? 'auto';
  const hasDialogTurns = Array.isArray(ps.dialogTurns) && ps.dialogTurns.length > 0;
  const dialogMode = ps.lipSync || LIPSYNC_ENGINES.has(engine) || !!ps.voiceover?.text || hasDialogTurns;

  // Build dialogScript.
  let dialogScript: string | undefined;
  if (hasDialogTurns) {
    dialogScript = (ps.dialogTurns ?? [])
      .map((t) => {
        const rawKey = (t.speakerMentionKey ?? '').replace(/^@/, '').trim();
        const match = (ps.cast ?? []).find(
          (c) => (c.mentionKey ?? '').replace(/^@/, '').toLowerCase() === rawKey.toLowerCase(),
        );
        const name = (match?.characterName ?? rawKey ?? 'NARRATOR').toUpperCase();
        const moodSuffix = t.mood?.trim() ? ` — ${t.mood.trim().toUpperCase()}` : '';
        return `${name}${moodSuffix}: ${t.text.trim()}`;
      })
      .join('\n');
  } else if (ps.voiceover?.text) {
    dialogScript = characterShots[0]
      ? `${(ps.cast ?? [])[0]?.characterName?.toUpperCase() ?? 'NARRATOR'}: ${ps.voiceover.text}`
      : `NARRATOR: ${ps.voiceover.text}`;
  }

  const sceneType: ComposerScene['sceneType'] = (() => {
    const beat = (ps.beat ?? '').toLowerCase();
    if (beat.includes('hook')) return 'hook';
    if (beat.includes('pain') || beat.includes('problem')) return 'problem';
    if (beat.includes('reveal') || beat.includes('solution') || beat.includes('lösung')) return 'solution';
    if (beat.includes('cta')) return 'cta';
    if (beat.includes('demo')) return 'demo';
    if (beat.includes('proof') || beat.includes('social')) return 'social-proof';
    return 'custom';
  })();

  // ── Performance Layer (Mimik/Gestik/Blick/Energy) ─────────────────────
  // Plan emits ONE performance block per scene → applied to every cast
  // member that resolved to a library character. Free-form German/English
  // hints are mapped to the strict ScenePerformance enums.
  let performance: Record<string, ScenePerformance> | undefined;
  if (ps.performance && characterShots.length > 0) {
    const sp: ScenePerformance = {
      expression: mapExpression(ps.performance.mimik),
      gesture: mapGesture(ps.performance.gestik),
      gaze: mapGaze(ps.performance.blick),
      energy: clampEnergy(ps.performance.energy),
    };
    // Keep only when at least one axis resolved.
    if (sp.expression || sp.gesture || sp.gaze || sp.energy) {
      performance = {};
      for (const cs of characterShots) {
        performance[cs.characterId] = { ...sp };
      }
    }
  }

  // ── ActionBeat (CharacterAction / EnvironmentMotion / MotionIntensity) ─
  const split = splitAction(ps.anchorPromptEN);
  const motionIntensity = motionIntensityFromMusic(ps.musicCue?.energy);
  const actionBeat = (split.characterAction || split.environmentMotion)
    ? {
        characterAction: split.characterAction,
        environmentMotion: split.environmentMotion,
        motionIntensity,
      }
    : undefined;

  // v175: also surface the resolved cast/location IDs as denormalised arrays
  // so downstream readers (Performance-Memory, Brand-Consistency-Scan,
  // Auto-Re-Plan) don't have to re-walk characterShots / shotDirector.
  const mentionedCharacterIds = Array.from(
    new Set(
      (ps.cast ?? [])
        .map((c) => (c.characterId ? stripPrefix(c.characterId) : null))
        .filter((x): x is string => !!x),
    ),
  );
  const mentionedLocationIds = ps.location?.locationId
    ? [stripPrefix(ps.location.locationId)].filter((x) => UUID_RE.test(x))
    : [];

  return {
    id: newSceneId(),
    projectId,
    orderIndex,
    sceneType,
    durationSeconds: Math.round(ps.durationSec),
    // Lip-Sync-Szenen defaulten auf HappyHorse (dialog-fähig). Die Cinematic-Sync-
    // Pipeline migriert bei Bedarf intern auf Hailuo-Plate — die UI bleibt
    // konsistent auf einem dialog-fähigen Modell.
    clipSource: (dialogMode ? 'ai-happyhorse' : 'ai-hailuo') as any,
    clipQuality: 'standard',
    clipStatus: 'pending',
    aiPrompt,
    characterShot: characterShots[0],
    characterShots: characterShots.length ? characterShots : undefined,
    engineOverride: engine !== 'auto' ? (engine as any) : undefined,
    dialogMode,
    dialogScript,
    dialogVoices: Object.keys(dialogVoices).length ? dialogVoices : undefined,
    shotDirector: ps.shotDirector
      ? {
          framing: ps.shotDirector.framing,
          angle: ps.shotDirector.angle,
          movement: ps.shotDirector.movement,
          lighting: ps.shotDirector.lighting,
        }
      : undefined,
    sceneActionUser: ps.anchorPromptEN ?? ps.voiceover?.text,
    sceneActionEn: ps.anchorPromptEN,
    performance,
    actionBeat,
    // Stage-3: scene-level tone wins over briefing-level tone for preset.
    realismPreset: realismFromTone(ps.tone) ?? realismFromTone(briefingTone),
    // Stage-3: per-scene burnt-in overlay (defaults preserved when plan empty).
    textOverlay: (ps.textOverlay && ps.textOverlay.text)
      ? {
          text: ps.textOverlay.text,
          position: ps.textOverlay.position ?? 'bottom',
          animation: ps.textOverlay.animation ?? 'fade-in',
          fontSize: ps.textOverlay.fontSizePx ?? DEFAULT_TEXT_OVERLAY.fontSize,
          color: ps.textOverlay.color ?? DEFAULT_TEXT_OVERLAY.color,
        } as any
      : ({ ...DEFAULT_TEXT_OVERLAY } as any),
    // Stage-3: transition into this scene (plan-driven). Falls back to crossfade.
    transitionType: (ps.transition?.type ?? 'crossfade') as any,
    transitionDuration: ps.transition?.durationSec ?? 0.4,
    // Stage-3: deterministic seed (mapped to composer_scenes.seed).
    seed: typeof ps.seed === 'number' ? ps.seed : undefined,
    retryCount: 0,
    costEuros: 0,
    // Stage-2 plan fields stored on the scene for downstream readers.
    brollKeywords: ps.brollHints,
    brandAnchor: ps.brandAnchor,
    musicCue: ps.musicCue,
    continuityHint: ps.continuityHint,
    negativePromptScene: ps.negativePromptScene,
    // v175: denormalised mention IDs for downstream analytics / Brand-Scan.
    mentionedCharacterIds,
    mentionedLocationIds,
    // v175: per-cast voiceId on the scene root so the upcoming insert path
    // can drop the first speaker into character_voice_id (single-speaker fast-path).
    characterVoiceId: (() => {
      // Prefer the first speaker's resolved voice from `dialogVoices` (already
      // includes the AI pool fallback above), then project default.
      const firstCharId = (ps.cast ?? [])
        .map((c) => (c.characterId ? stripPrefix(c.characterId as string) : null))
        .find((x): x is string => !!x);
      const fromDialog = firstCharId ? dialogVoices[firstCharId] : undefined;
      return fromDialog || cleanVoiceId(projectVoiceId);
    })(),

  } as ComposerScene;
}


function buildAssembly(
  plan: TProductionPlan,
  current: AssemblyConfig | undefined,
  language: string,
): AssemblyConfig {
  const base: AssemblyConfig = current ?? {
    colorGrading: 'none' as any,
    transitionStyle: 'crossfade' as any,
    kineticText: false,
    voiceover: null,
    music: null,
    beatSync: false,
  };
  let next = base;

  if (plan.voice) {
    const v = plan.voice;
    const fullScript = (plan.scenes ?? [])
      .map((s) => s.voiceover?.text?.trim())
      .filter(Boolean)
      .join(' ');
    next = {
      ...next,
      voiceover: {
        enabled: true,
        voiceId: v.voiceId ?? next.voiceover?.voiceId ?? 'JBFqnCBsd6RMkjVDRZzb',
        voiceName: v.voiceName ?? next.voiceover?.voiceName ?? 'George',
        script: fullScript || next.voiceover?.script || '',
        speed: v.speed,
        stability: v.stability,
        similarityBoost: v.similarityBoost,
        styleExaggeration: v.style,
        useSpeakerBoost: v.speakerBoost,
      } as any,
    };
  }

  if (plan.captions) {
    const c = plan.captions;
    next = {
      ...next,
      subtitles: {
        enabled: c.enabled ?? true,
        language,
        style: {
          font: c.font ?? 'Inter Bold',
          size: c.sizePx ?? 64,
          color: c.color ?? '#FFFFFF',
          background: '',
          position: (c.position === 'top' ? 'top' : 'bottom') as 'top' | 'bottom',
        },
      } as any,
    };
  }

  return next;
}

export interface ApplyPlanArgs {
  plan: TProductionPlan;
  projectId: string | undefined;
  language: string;
  currentScenes: ComposerScene[];
  currentAssembly: AssemblyConfig | undefined;
  currentBriefing: ComposerBriefing;
  onUpdateBriefing: (patch: Partial<ComposerBriefing>) => void;
  onUpdateScenes: (scenes: ComposerScene[]) => void;
  onApplyAssembly: (next: AssemblyConfig) => void;
}

export interface ApplyPlanResult {
  scenesNew: number;
  scenesProtected: number;
  scenesReplaced: number;
  verified: boolean;
  warnings: string[];
}

export function useApplyProductionPlan() {
  return useCallback(async (args: ApplyPlanArgs): Promise<ApplyPlanResult> => {
    const {
      plan, projectId, language,
      currentScenes, currentAssembly, currentBriefing,
      onUpdateBriefing, onUpdateScenes, onApplyAssembly,
    } = args;

    if (!isUuid(projectId)) {
      throw new Error('Projekt-ID fehlt — Plan wurde nicht angewendet, damit keine unverbundenen Szenen entstehen.');
    }

    // 1) Project metadata
    const briefingPatch: Partial<ComposerBriefing> = {};
    if (plan.project?.aspectRatio) briefingPatch.aspectRatio = plan.project.aspectRatio as any;
    if (plan.project?.totalDurationSec) {
      briefingPatch.duration = Math.round(plan.project.totalDurationSec);
    }
    if (Object.keys(briefingPatch).length) onUpdateBriefing(briefingPatch);

    // 2) Determine which existing scenes are PROTECTED.
    //    Step 2a: local quick check.
    const locallyProtected = currentScenes.filter(isLocallyProtected);

    //    Step 2b: DB safety net — check dialog_shots for any scene id we might
    //    consider deletable. If a row exists, the scene is protected even if
    //    local state hasn't caught up yet.
    const candidateForDelete = currentScenes.filter((s) => !isLocallyProtected(s));
    let dbProtectedIds = new Set<string>();
    if (projectId && candidateForDelete.length > 0) {
      try {
        const ids = candidateForDelete
          .map((s) => s.id)
          .filter((id) => isUuid(id));
        if (ids.length > 0) {
          const { data, error } = await supabase
            .from('dialog_shots' as any)
            .select('scene_id')
            .in('scene_id', ids);
          if (error) throw error;
          for (const row of (data ?? []) as any[]) {
            if (row?.scene_id) dbProtectedIds.add(row.scene_id);
          }
        }
      } catch (e) {
        console.warn('[useApplyProductionPlan] dialog_shots probe failed, fail-open for failed/canceled repair rows:', e);
        // Fail-open for visibly broken scenes; fail-closed for pending unknowns.
        for (const s of candidateForDelete) {
          const status = String(s.clipStatus ?? '');
          if (status !== 'failed' && status !== 'canceled') dbProtectedIds.add(s.id);
        }
      }
    }

    const protectedScenes = [
      ...locallyProtected,
      ...currentScenes.filter((s) => dbProtectedIds.has(s.id) && !locallyProtected.includes(s)),
    ];
    const deletableScenes = currentScenes.filter(
      (s) => !protectedScenes.includes(s),
    );

    // 3) Resolve default voices for cast characters that the parser matched but
    // did not attach a voiceId to. This never touches the lipsync pipeline; it
    // only fills composer_scenes.dialog_voices / character_voice_id for new rows.
    const characterIds = Array.from(new Set(
      (plan.scenes ?? [])
        .flatMap((s) => s.cast ?? [])
        .map((c) => c.characterId ? String(c.characterId).replace(/^lib:/, '').replace(/^(outfit|catalog):/, '') : null)
        .filter((x): x is string => !!x),
    ));
    const defaultVoicesByCharacter: Record<string, string | undefined> = {};
    const genderByCharacter: Record<string, 'male' | 'female' | 'neutral' | null | undefined> = {};
    if (characterIds.length > 0) {
      const { data, error } = await supabase
        .from('brand_characters')
        .select('id, default_voice_id, gender')
        .in('id', characterIds);
      if (!error) {
        for (const row of (data ?? []) as any[]) {
          const voice = cleanVoiceId(row?.default_voice_id);
          if (row?.id && voice) defaultVoicesByCharacter[String(row.id)] = voice;
          if (row?.id) {
            const g = row?.gender as string | null | undefined;
            genderByCharacter[String(row.id)] = (g === 'male' || g === 'female' || g === 'neutral') ? g : null;
          }
        }
      } else {
        console.warn('[useApplyProductionPlan] default voice lookup failed:', error);
      }
    }

    // 4) Build new scenes from plan. The pool-picker is created once per apply-run
    // so round-robin allocation spans all scenes (max 4 speakers stay distinct),
    // and `voicePoolAssignments` keeps the same character on the same voice
    // across scenes.
    const voicePoolPicker = createVoicePoolPicker();
    const voicePoolAssignments: Record<string, string> = {};
    const newScenes: ComposerScene[] = (plan.scenes ?? [])
      .slice()
      .sort((a, b) => a.index - b.index)
      .map((s, i) =>
        planSceneToComposerScene(
          s,
          protectedScenes.length + i,
          projectId,
          plan.negativePrompt,
          currentBriefing?.tone,
          cleanVoiceId(plan.voice?.voiceId),
          defaultVoicesByCharacter,
          genderByCharacter,
          voicePoolPicker,
          voicePoolAssignments,
        ),
      );


    // Diagnostic: warn when a lipSync-engine scene resolved to 0 characterShots.
    for (const ns of newScenes) {
      const engine = (ns as any).engineOverride ?? ns.clipSource;
      const isLipsync = LIPSYNC_ENGINES.has(String(engine));
      const castCount = (ns.characterShots?.length ?? 0) || (ns.characterShot ? 1 : 0);
      if (isLipsync && castCount === 0) {
        console.warn('[useApplyProductionPlan] lipsync scene has no cast — check mention resolution', {
          orderIndex: ns.orderIndex,
          engine,
        });
      }
    }

    // 5) INSERT new plan-scenes into DB directly, at append-order first. Only
    // after the insert verifies do we delete stale fallback rows. This avoids
    // leaving the project empty if an INSERT constraint/RLS error occurs.
    //     The dashboard's debounced `persistScenesToDb` path only UPDATEs
    //     rows with UUID ids; freshly minted plan-scenes carry temp
    //     `scene_xxx_yyy` ids and were therefore never persisted. Result:
    //     toast said "3 neu / 3 ersetzt" but DB still held the old rows
    //     and reloads brought the Fallback back. Persist here, then swap
    //     temp ids for real UUIDs before handing off to onUpdateScenes.
    if (projectId && newScenes.length > 0) {
        const insertStartOrder = currentScenes.length > 0
          ? Math.max(...currentScenes.map((s) => Number(s.orderIndex ?? 0))) + 1
          : 0;
        const rows = newScenes.map((s, i) => ({
          project_id: projectId,
          order_index: insertStartOrder + i,
          scene_type: s.sceneType,
          duration_seconds: s.durationSeconds,
          clip_source: s.clipSource,
          clip_quality: s.clipQuality || 'standard',
          clip_status: s.clipStatus ?? 'pending',
          with_audio: s.withAudio !== false,
          lip_sync_with_voiceover: (s as any).lipSyncWithVoiceover === true,
          dialog_mode: (s as any).dialogMode === true,
          ai_prompt: s.aiPrompt ?? null,
          text_overlay: (s.textOverlay ?? DEFAULT_TEXT_OVERLAY) as any,
          transition_type: s.transitionType ?? 'crossfade',
          transition_duration: s.transitionDuration ?? 0.4,
          retry_count: s.retryCount ?? 0,
          cost_euros: s.costEuros ?? 0,
          character_shot: (s.characterShot ?? null) as any,
          character_shots: (s.characterShots ?? (s.characterShot ? [s.characterShot] : [])) as any,
          dialog_script: s.dialogScript ?? null,
          dialog_voices: ((s as any).dialogVoices ?? {}) as any,
          dialog_takes: ((s as any).dialogTakes ?? {}) as any,
          engine_override: (s as any).engineOverride ?? 'auto',
          director_modifiers: (s.directorModifiers ?? {}) as any,
          shot_director: (s.shotDirector ?? {}) as any,
          scene_action_user: (s as any).sceneActionUser ?? null,
          scene_action_en: (s as any).sceneActionEn ?? null,
          mentioned_character_ids: ((s as any).mentionedCharacterIds ?? null) as any,
          mentioned_location_ids: ((s as any).mentionedLocationIds ?? null) as any,
          character_voice_id: ((s as any).characterVoiceId ?? null) as any,
          action_beat: ((s as any).actionBeat ?? null) as any,
          realism_preset: (s as any).realismPreset ?? null,
          seed: (s as any).seed ?? null,
        }));
        const { data, error } = await supabase
          .from('composer_scenes')
          .insert(rows as any)
          .select('id, order_index, dialog_script, dialog_voices, ai_prompt, mentioned_character_ids, character_voice_id');
        if (error) {
          console.error('[useApplyProductionPlan] INSERT failed', error);
          throw new Error(`Neue Plan-Szenen konnten nicht gespeichert werden: ${error.message}`);
        } else if (Array.isArray(data)) {
          // Map returned UUIDs back into newScenes (by order_index — stable
          // because we built rows in that exact order).
          const byOrder = new Map<number, string>();
          for (const r of data as any[]) byOrder.set(Number(r.order_index), String(r.id));
          for (let i = 0; i < newScenes.length; i++) {
            const realId = byOrder.get(insertStartOrder + i);
            if (realId) newScenes[i] = { ...newScenes[i], id: realId, orderIndex: insertStartOrder + i };
          }
        }
    }

    // 7) Verify DB state before telling the UI this succeeded.
    const { data: verifyRows, error: verifyError } = await supabase
      .from('composer_scenes')
      .select('id, order_index, dialog_script, dialog_voices, ai_prompt, mentioned_character_ids, character_voice_id')
      .eq('project_id', projectId)
      .order('order_index', { ascending: true });
    if (verifyError) {
      throw new Error(`Storyboard-Verifikation fehlgeschlagen: ${verifyError.message}`);
    }
    const newIds = new Set(newScenes.filter((s) => isUuid(s.id)).map((s) => s.id));
    const persistedNewRows = (verifyRows ?? []).filter((r: any) => newIds.has(String(r.id)));
    const warnings: string[] = [];
    if (persistedNewRows.length !== newScenes.length) {
      throw new Error(`Plan nur teilweise gespeichert: ${persistedNewRows.length}/${newScenes.length} Szenen in der Datenbank gefunden.`);
    }
    const fallbackRows = persistedNewRows.filter((r: any) => /Establishing shot: A relevant setting|Reveal beat for the brand|CTA beat for the brand/i.test(String(r.ai_prompt ?? '')));
    if (fallbackRows.length > 0) warnings.push(`${fallbackRows.length} Szene(n) enthalten noch Fallback-Prompts.`);
    const lipsyncRowsMissingVoice = persistedNewRows.filter((r: any) => {
      const rowScene = newScenes.find((s) => s.id === String(r.id));
      const needsVoice = rowScene?.dialogMode || !!rowScene?.dialogScript;
      if (!needsVoice) return false;
      const voices = r.dialog_voices && typeof r.dialog_voices === 'object' ? r.dialog_voices as Record<string, unknown> : {};
      const speakerIds = new Set(
        (rowScene?.characterShots ?? (rowScene?.characterShot ? [rowScene.characterShot] : []))
          .map((shot) => String(shot.characterId ?? '').trim())
          .filter(Boolean),
      );
      const missingSpeakerVoice = Array.from(speakerIds).some((id) => !voices[id]);
      return !r.character_voice_id || speakerIds.size === 0 || missingSpeakerVoice;
    });
    if (lipsyncRowsMissingVoice.length > 0) warnings.push(`${lipsyncRowsMissingVoice.length} Lip-Sync-Szene(n) ohne Voice-ID.`);

    // 8) Now remove replaceable old/fallback rows. If that fails, roll back the
    // newly inserted plan rows so the user does not end up with duplicate scenes.
    if (deletableScenes.length > 0) {
      const persistedDeletable = deletableScenes
        .map((s) => s.id)
        .filter((id) => isUuid(id));
      if (persistedDeletable.length > 0) {
        const { error } = await supabase
          .from('composer_scenes')
          .delete()
          .in('id', persistedDeletable)
          .eq('project_id', projectId);
        if (error) {
          const insertedIds = newScenes.map((s) => s.id).filter((id) => isUuid(id));
          if (insertedIds.length > 0) {
            await supabase.from('composer_scenes').delete().in('id', insertedIds).eq('project_id', projectId);
          }
          console.error('[useApplyProductionPlan] DB delete failed', error);
          throw new Error(`Alte Storyboard-Szenen konnten nicht ersetzt werden: ${error.message}`);
        }
      }
    }

    // 9) Merge: keep protected scenes at their current order, append new ones.
    const merged = [
      ...protectedScenes.map((s, i) => ({ ...s, orderIndex: i })),
      ...newScenes.map((s, i) => ({ ...s, orderIndex: protectedScenes.length + i })),
    ];
    onUpdateScenes(merged);

    // 10) Assembly (voice + captions).
    const nextAssembly = buildAssembly(plan, currentAssembly, language);
    onApplyAssembly(nextAssembly);

    return {
      scenesNew: newScenes.length,
      scenesProtected: protectedScenes.length,
      scenesReplaced: deletableScenes.length,
      verified: true,
      warnings,
    };
  }, []);
}
