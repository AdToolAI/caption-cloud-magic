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
    ? [ps.location.locationId]
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
    characterVoiceId: ((ps.cast ?? []).find((c) => c.voiceId)?.voiceId) ?? undefined,
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

    // 4b) v177 — INSERT new plan-scenes into DB directly.
    //     The dashboard's debounced `persistScenesToDb` path only UPDATEs
    //     rows with UUID ids; freshly minted plan-scenes carry temp
    //     `scene_xxx_yyy` ids and were therefore never persisted. Result:
    //     toast said "3 neu / 3 ersetzt" but DB still held the old rows
    //     and reloads brought the Fallback back. Persist here, then swap
    //     temp ids for real UUIDs before handing off to onUpdateScenes.
    if (projectId && newScenes.length > 0) {
      try {
        const rows = newScenes.map((s, i) => ({
          project_id: projectId,
          order_index: protectedScenes.length + i,
          scene_type: s.sceneType,
          duration_seconds: s.durationSeconds,
          clip_source: s.clipSource,
          clip_quality: s.clipQuality || 'standard',
          clip_status: s.clipStatus ?? 'pending',
          with_audio: s.withAudio !== false,
          lip_sync_with_voiceover: (s as any).lipSyncWithVoiceover === true,
          dialog_mode: (s as any).dialogMode === true,
          ai_prompt: s.aiPrompt ?? null,
          text_overlay: (s.textOverlay ?? null) as any,
          transition_type: s.transitionType,
          transition_duration: s.transitionDuration,
          character_shot: (s.characterShot ?? null) as any,
          character_shots: (s.characterShots ?? (s.characterShot ? [s.characterShot] : null)) as any,
          dialog_script: s.dialogScript ?? null,
          dialog_voices: ((s as any).dialogVoices ?? {}) as any,
          engine_override: (s as any).engineOverride ?? 'auto',
          shot_director: (s.shotDirector ?? {}) as any,
          scene_action_user: (s as any).sceneActionUser ?? null,
          scene_action_en: (s as any).sceneActionEn ?? null,
          mentioned_character_ids: ((s as any).mentionedCharacterIds ?? null) as any,
          mentioned_location_ids: ((s as any).mentionedLocationIds ?? null) as any,
          character_voice_id: ((s as any).characterVoiceId ?? null) as any,
        }));
        const { data, error } = await supabase
          .from('composer_scenes')
          .insert(rows as any)
          .select('id, order_index');
        if (error) {
          console.error('[useApplyProductionPlan] INSERT failed', error);
        } else if (Array.isArray(data)) {
          // Map returned UUIDs back into newScenes (by order_index — stable
          // because we built rows in that exact order).
          const byOrder = new Map<number, string>();
          for (const r of data as any[]) byOrder.set(Number(r.order_index), String(r.id));
          for (let i = 0; i < newScenes.length; i++) {
            const realId = byOrder.get(protectedScenes.length + i);
            if (realId) newScenes[i] = { ...newScenes[i], id: realId };
          }
        }
      } catch (e) {
        console.error('[useApplyProductionPlan] INSERT crashed (non-fatal)', e);
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
