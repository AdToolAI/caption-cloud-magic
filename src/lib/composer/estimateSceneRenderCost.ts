/**
 * estimateSceneRenderCost — pure helper used by the Per-Scene Render
 * Confirm Dialog (Schritt 1). Surfaces a transparent breakdown of what
 * one (or many) scene render(s) cost the user before any API call is
 * fired.
 *
 * Numbers are derived from the same pricing tables the rest of the
 * codebase already trusts:
 *   - CLIP_SOURCE_COSTS (EUR/s, user-facing)         → types/video-composer.ts
 *   - Sync.so lipsync-2-pro: 9 credits/s per pass    → mem://architecture/lipsync/sync-so-pro-model-policy
 *   - ElevenLabs VO: flat ~5 credits per scene       → estimated avg
 *
 * Credit ↔ EUR display ratio: 1 credit ≈ €0.01 (consistent with
 * ESTIMATED_COSTS in src/lib/featureCosts.ts).
 */
import {
  getClipCost,
  type ComposerScene,
  type ClipQuality,
} from '@/types/video-composer';
import { computeProviderEta } from '@/hooks/useProviderEta';
import { getRenderWarnings, aggregateWarnings, type RenderWarning } from '@/lib/video-composer/renderWarnings';

const CREDIT_PER_EUR = 100;     // 1 credit = €0.01
const VO_CREDITS_PER_SCENE = 5; // ~€0.05 ElevenLabs avg
// sync.so lipsync-2-pro: raised 9 → 16 Cr/s (3.5× margin cap on ~€0.046/s raw cost).
// Backend mirrors: compose-dialog-segments, lip-sync-video.
const LIPSYNC_CREDITS_PER_SEC_PER_PASS = 16;
// Wall-clock add-ons (seconds) on top of base provider ETA when audio/lipsync are involved.
const VO_ETA_SECONDS = 8;
const LIPSYNC_ETA_BASE_SECONDS = 45;
const LIPSYNC_ETA_PER_PASS_SECONDS = 35;
// Lambda stitch median for a 4-scene master, conservative.
const STITCH_ETA_SECONDS = 70;

export interface SceneCostLine {
  label: string;
  credits: number;
  eur: number;
  detail?: string;
}

export interface SceneCostBreakdown {
  sceneId: string;
  sceneIndex: number;       // 1-based, for display
  providerCredits: number;
  voCredits: number;
  lipsyncCredits: number;
  totalCredits: number;
  totalEur: number;
  lines: SceneCostLine[];
  /** Estimated wall-clock seconds until clip ready (provider + VO + lipsync). */
  etaSeconds: number;
  /** Provider/config warnings for this scene. */
  warnings: RenderWarning[];
}

export interface AggregatedCost {
  scenes: SceneCostBreakdown[];
  totalCredits: number;
  totalEur: number;
  /** Estimated wall-clock seconds. Parallel scenes assumed → max + 20% overhead. */
  etaSeconds: number;
  /** Deduplicated warnings across all scenes. */
  warnings: RenderWarning[];
}

interface EstimateOpts {
  /** Override speaker / pass count (e.g. dialog with N turns). */
  passes?: number;
  /** Skip lipsync line even if voice is configured. */
  skipLipsync?: boolean;
  /** Skip VO line. */
  skipVoiceover?: boolean;
}

function sceneHasVoiceover(scene: ComposerScene): boolean {
  if (scene.withAudio === false) return false;
  if (scene.dialogScript && scene.dialogScript.trim().length > 0) return true;
  // Voice configured but no explicit script still implies a VO line will run.
  const v: any = (scene as any).voice;
  return !!(v?.voiceId || v?.elevenlabsVoiceId);
}

function sceneUsesLipsync(scene: ComposerScene): boolean {
  if (scene.withAudio === false) return false;
  if ((scene as any).engineOverride === 'cinematic-sync') return true;
  if ((scene as any).lipSyncWithVoiceover === true) return true;
  // Dialog scenes auto-route into lipsync pipeline.
  if (scene.dialogScript && scene.dialogScript.trim().length > 0) return true;
  return false;
}

function passesForScene(scene: ComposerScene): number {
  // One pass per dialog turn; default 1 for single-speaker scenes.
  const turns = (scene as any).dialogVoices
    ? Object.keys((scene as any).dialogVoices).length
    : 1;
  return Math.max(1, turns);
}

export function estimateSceneRenderCost(
  scene: ComposerScene,
  opts: EstimateOpts = {},
): SceneCostBreakdown {
  const quality: ClipQuality = (scene.clipQuality || 'standard') as ClipQuality;
  const durationSec = Math.max(1, Math.round(scene.durationSeconds || 0));

  // Provider clip
  const providerEur = getClipCost(scene.clipSource, quality, durationSec);
  const providerCredits = Math.round(providerEur * CREDIT_PER_EUR);

  const lines: SceneCostLine[] = [];

  if (providerCredits > 0) {
    const ratePerSec = durationSec > 0 ? providerCredits / durationSec : 0;
    lines.push({
      label: `Video (${scene.clipSource}, ${quality}, ${durationSec}s)`,
      credits: providerCredits,
      eur: providerEur,
      detail: `${durationSec}s × ${ratePerSec.toFixed(1)} Cr/s · Provider-Rohkost + Marge`,
    });
  }

  // Voiceover
  const voCredits =
    !opts.skipVoiceover && sceneHasVoiceover(scene) ? VO_CREDITS_PER_SCENE : 0;
  if (voCredits > 0) {
    lines.push({
      label: 'Voiceover (ElevenLabs)',
      credits: voCredits,
      eur: voCredits / CREDIT_PER_EUR,
      detail: 'Flat-Rate pro Szene (TTS-Synthese)',
    });
  }

  // Lipsync
  let lipsyncCredits = 0;
  if (!opts.skipLipsync && sceneUsesLipsync(scene)) {
    const passes = opts.passes ?? passesForScene(scene);
    lipsyncCredits = durationSec * LIPSYNC_CREDITS_PER_SEC_PER_PASS * passes;
    lines.push({
      label: `Lip-Sync (Sync.so pro, ${passes}× Pass${passes > 1 ? 'es' : ''})`,
      credits: lipsyncCredits,
      eur: lipsyncCredits / CREDIT_PER_EUR,
      detail:
        passes > 1
          ? `${passes} Sprecher · ${durationSec}s × ${LIPSYNC_CREDITS_PER_SEC_PER_PASS} Cr/s × ${passes} Passes`
          : `${durationSec}s × ${LIPSYNC_CREDITS_PER_SEC_PER_PASS} Cr/s · 1 Pass`,
    });
  }

  const totalCredits = providerCredits + voCredits + lipsyncCredits;
  return {
    sceneId: scene.id,
    sceneIndex: (scene.orderIndex ?? 0) + 1,
    providerCredits,
    voCredits,
    lipsyncCredits,
    totalCredits,
    totalEur: totalCredits / CREDIT_PER_EUR,
    lines,
  };
}

export function aggregateCost(
  scenes: ComposerScene[],
  opts: EstimateOpts = {},
): AggregatedCost {
  const breakdowns = scenes.map((s) => estimateSceneRenderCost(s, opts));
  return {
    scenes: breakdowns,
    totalCredits: breakdowns.reduce((sum, b) => sum + b.totalCredits, 0),
    totalEur: breakdowns.reduce((sum, b) => sum + b.totalEur, 0),
  };
}

export function formatEur(eur: number): string {
  return `€${eur.toFixed(2)}`;
}
export function formatCredits(credits: number): string {
  return `${credits.toLocaleString('de-DE')} Cr`;
}
