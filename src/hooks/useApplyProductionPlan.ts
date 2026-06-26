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
 *  - clip_status !== 'pending'  (already generating or done)
 *  - clip_url is set            (a render exists)
 *  - lipSyncStatus is set       (lipsync pipeline touched it)
 *  - dialogLockedAt is set      (dialog lock placed)
 *  - lockReferenceUrl is set    (continuity lock placed)
 *  - has rows in dialog_shots   (checked via async DB lookup)
 */
function isLocallyProtected(s: ComposerScene): boolean {
  if (s.clipStatus && s.clipStatus !== 'pending') return true;
  if (s.clipUrl) return true;
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
): ComposerScene {
  // Build characterShots from resolved cast. The plan stores `characterId`
  // as the BASE brand_characters.id (CastRef invariant) plus an optional
  // separate `outfitLookId`. We still defensively strip any legacy mention
  // prefix in case an older plan flows through.
  const stripPrefix = (id: string) =>
    id.startsWith('lib:') ? id.slice(4) : id.replace(/^(outfit|catalog):/, '');
  const primaryShot = framingToShotType(ps.shotDirector?.framing, 'full');
  const characterShots: CharacterShot[] = (ps.cast ?? [])
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
  // Fallback to project-level voice if the resolved cast member has no voiceId,
  // so compose-dialog-segments never errors with `missing_voice`.
  const dialogVoices: Record<string, string> = {};
  for (const c of ps.cast ?? []) {
    if (!c.characterId) continue;
    const vid = c.voiceId || projectVoiceId;
    if (vid) dialogVoices[stripPrefix(c.characterId)] = vid;
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
    realismPreset: realismFromTone(briefingTone),
    textOverlay: { ...DEFAULT_TEXT_OVERLAY } as any,
    transitionType: 'crossfade',
    transitionDuration: 0.4,
    retryCount: 0,
    costEuros: 0,
    // Stage-2 plan fields stored on the scene for downstream readers.
    brollKeywords: ps.brollHints,
    brandAnchor: ps.brandAnchor,
    musicCue: ps.musicCue,
    continuityHint: ps.continuityHint,
    negativePromptScene: ps.negativePromptScene,
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
}

export function useApplyProductionPlan() {
  return useCallback(async (args: ApplyPlanArgs): Promise<ApplyPlanResult> => {
    const {
      plan, projectId, language,
      currentScenes, currentAssembly, currentBriefing,
      onUpdateBriefing, onUpdateScenes, onApplyAssembly,
    } = args;

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
          .filter((id) => /^[0-9a-f]{8}-[0-9a-f]{4}-/i.test(id));
        if (ids.length > 0) {
          const { data } = await supabase
            .from('dialog_shots' as any)
            .select('scene_id')
            .in('scene_id', ids);
          for (const row of (data ?? []) as any[]) {
            if (row?.scene_id) dbProtectedIds.add(row.scene_id);
          }
        }
      } catch (e) {
        console.warn('[useApplyProductionPlan] dialog_shots probe failed, treating all as protected (safe-fail):', e);
        // Safe-fail: if we can't verify, we KEEP all scenes (never delete).
        for (const s of candidateForDelete) dbProtectedIds.add(s.id);
      }
    }

    const protectedScenes = [
      ...locallyProtected,
      ...currentScenes.filter((s) => dbProtectedIds.has(s.id) && !locallyProtected.includes(s)),
    ];
    const deletableScenes = currentScenes.filter(
      (s) => !protectedScenes.includes(s),
    );

    // 3) Build new scenes from plan.
    const newScenes: ComposerScene[] = (plan.scenes ?? [])
      .slice()
      .sort((a, b) => a.index - b.index)
      .map((s, i) =>
        planSceneToComposerScene(s, protectedScenes.length + i, projectId ?? '', plan.negativePrompt, currentBriefing?.tone, plan.voice?.voiceId),
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

    // 4) Hard-delete deletableScenes from DB (so realtime doesn't bring them back).
    if (projectId && deletableScenes.length > 0) {
      const persistedDeletable = deletableScenes
        .map((s) => s.id)
        .filter((id) => /^[0-9a-f]{8}-[0-9a-f]{4}-/i.test(id));
      if (persistedDeletable.length > 0) {
        try {
          await supabase
            .from('composer_scenes')
            .delete()
            .in('id', persistedDeletable)
            .eq('project_id', projectId);
        } catch (e) {
          console.warn('[useApplyProductionPlan] DB delete failed (non-fatal):', e);
        }
      }
    }

    // 5) Merge: keep protected scenes at their current order, append new ones.
    const merged = [
      ...protectedScenes.map((s, i) => ({ ...s, orderIndex: i })),
      ...newScenes.map((s, i) => ({ ...s, orderIndex: protectedScenes.length + i })),
    ];
    onUpdateScenes(merged);

    // 6) Assembly (voice + captions).
    const nextAssembly = buildAssembly(plan, currentAssembly, language);
    onApplyAssembly(nextAssembly);

    return {
      scenesNew: newScenes.length,
      scenesProtected: protectedScenes.length,
      scenesReplaced: deletableScenes.length,
    };
  }, []);
}
