/**
 * sceneEngineRouter — Pure routing logic that decides which generation engine
 * a Composer scene should use for *truly film-grade* output.
 *
 * Three engines (matched to the plan):
 *
 *  1. **heygen-talking-head** — frame-perfect lip-sync via HeyGen Photo Avatar.
 *     Used when a scene has dialog text AND a Brand-Character cast.
 *
 *  2. **sync-polish** — Hailuo/Seedance B-roll + sync.so/lipsync-2 polish.
 *     Used when the user explicitly enables `lipSyncWithVoiceover` on a non-
 *     dialog character close-up. Quality on AI faces is unreliable, so this
 *     is opt-in only.
 *
 *  3. **broll** — Hailuo/Seedance/etc. without lip-sync; VO plays as
 *     off-screen narration. The default for landscape, product, drone shots.
 *
 * The router is a *suggestion* — the SceneCard always lets the user override.
 */
import type { ComposerScene } from '@/types/video-composer';

export type SceneEngine = 'heygen-talking-head' | 'sync-polish' | 'cinematic-sync' | 'sync-segments' | 'broll';

export interface EngineRecommendation {
  engine: SceneEngine;
  /** UI label, German default. */
  label: string;
  /** Short tooltip explaining *why* this engine. */
  reason: string;
  /** Estimated extra cost in EUR over the base AI clip cost (HeyGen ≈ 0.30, sync ≈ 0.05). */
  extraCostEur: number;
}

/** Does this scene contain dialog the user actually wants spoken on-screen? */
export function sceneHasDialog(scene: ComposerScene): boolean {
  const script = (scene.dialogScript ?? '').trim();
  return script.length > 0;
}

/** Does this scene reference at least one Brand-Character (cast)? */
export function sceneHasCast(scene: ComposerScene): boolean {
  if (Array.isArray(scene.characterShots) && scene.characterShots.length > 0) {
    return scene.characterShots.some(
      (cs) => cs && cs.shotType !== 'absent' && (cs.characterId || (cs as any).name),
    );
  }
  if (scene.characterShot && scene.characterShot.shotType !== 'absent') return true;
  return false;
}

/** Approximate HeyGen cost: €0.30 per speaker (capped 1-4). */
export function estimateHeygenCostEur(speakerCount: number): number {
  return Math.max(1, Math.min(4, speakerCount)) * 0.30;
}

/** Count speakers from a dialog script — matches `[NAME]:` or `NAME:` blocks. */
export function countSpeakers(scene: ComposerScene): number {
  const script = (scene.dialogScript ?? '').trim();
  if (!script) return 0;
  const speakers = new Set<string>();
  for (const line of script.split('\n')) {
    const m = line.match(/^\s*\[?([A-Za-zÀ-ÿ][\w\s.'-]{1,40}?)\]?\s*[:：]/);
    if (m) speakers.add(m[1].trim().toLowerCase());
  }
  return speakers.size;
}

export function recommendEngineForScene(scene: ComposerScene): EngineRecommendation {
  const override = scene.engineOverride ?? 'auto';
  const hasDialog = sceneHasDialog(scene);
  const hasCast = sceneHasCast(scene);
  const speakers = Math.max(1, countSpeakers(scene));

  // ── User override wins ─────────────────────────────────────────────
  if (override === 'heygen') {
    return {
      engine: 'heygen-talking-head',
      label: '🎙️ HeyGen Lip-Sync (manuell)',
      reason: 'Vom Nutzer erzwungen — HeyGen Photo-Avatar rendert frame-genauen Lip-Sync.',
      extraCostEur: estimateHeygenCostEur(speakers),
    };
  }
  if (override === 'broll') {
    return {
      engine: 'broll',
      label: '🎬 B-Roll (manuell)',
      reason: 'Vom Nutzer erzwungen — kein Lip-Sync, klassischer B-Roll-Render.',
      extraCostEur: 0,
    };
  }
  if (override === 'sync-polish') {
    return {
      engine: 'sync-polish',
      label: '✨ Sync.so Polish (manuell)',
      reason: 'Vom Nutzer erzwungen — Hailuo + Sync.so Polish-Pass.',
      extraCostEur: 0.05,
    };
  }
  // v70: cinematic-sync-legacy removed. Any persisted value falls through
  // to the sync-segments recommendation below.
  if (override === 'cinematic-sync' || override === 'sync-segments') {
    return {
      engine: 'sync-segments',
      label: speakers >= 2 ? `⚡ Fast Dialog · ${speakers} Sprecher (1-Call)` : '⚡ Fast Dialog · 1-Call',
      reason:
        'Sync.so Segments API: ein einziger Lipsync-Call über die Master-Plate mit segments[] pro Sprecher-Turn. Artlist-Pattern — ~3–5 min statt ~10–15 min, ein Webhook, ein Refund, und bis zu 3 Szenen können parallel laufen.',
      extraCostEur: Math.max(0.20, 0.083 * Math.max(4, speakers * 2)),
    };
  }

  // ── Auto routing ───────────────────────────────────────────────────
  if (hasDialog && hasCast) {
    // Default = Fast Dialog (Sync.so Segments, 1-call).
    // Scales to N speakers in a single API request and lets the platform
    // run 3 scenes in parallel against Sync.so's concurrency limit.
    return {
      engine: 'sync-segments',
      label: speakers >= 2 ? `⚡ Fast Dialog · ${speakers} Sprecher (Auto)` : '⚡ Fast Dialog · 1-Call (Auto)',
      reason:
        'Sync.so Segments API: ein einziger Lipsync-Call über die Master-Plate mit segments[] pro Sprecher-Turn. ~3–5 min statt ~10–15 min, parallel-fähig.',
      extraCostEur: Math.max(0.20, 0.083 * Math.max(4, speakers * 2)),
    };
  }

  if (scene.lipSyncWithVoiceover && hasCast) {
    return {
      engine: 'sync-polish',
      label: '✨ Sync.so Polish',
      reason:
        'B-Roll mit Sync.so-Polish-Pass — Qualität auf KI-Gesichtern variiert, nutze HeyGen für sichere Sprecher-Inserts.',
      extraCostEur: 0.05,
    };
  }

  return {
    engine: 'broll',
    label: '🎬 B-Roll',
    reason: 'Off-Screen-Narration — Voiceover läuft über die Szene, keine Lip-Sync nötig.',
    extraCostEur: 0,
  };
}
