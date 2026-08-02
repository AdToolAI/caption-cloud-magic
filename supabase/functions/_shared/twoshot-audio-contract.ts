/**
 * Generation contract for persisted two-shot voiceover rows.
 * A scene id is stable across regenerations, therefore it is never sufficient
 * provenance for reusing generated audio.
 */

export const TWOSHOT_AUDIO_PLAN_VERSION = 2;

export interface AudioGenerationIdentity {
  activeRunId: string;
  plateGeneration: number;
  inputHash: string;
}

export interface PersistedAudioMetadata {
  active_run_id?: unknown;
  plate_generation?: unknown;
  audio_plan_version?: unknown;
  audio_input_hash?: unknown;
  speakers?: unknown;
  segments?: unknown;
  spoken_seconds?: unknown;
  scene_duration_seconds?: unknown;
}

export async function hashTwoshotAudioInput(input: unknown): Promise<string> {
  const bytes = new TextEncoder().encode(JSON.stringify(input));
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export function isReusableTwoshotAudio(
  metadata: PersistedAudioMetadata | null | undefined,
  identity: AudioGenerationIdentity,
): boolean {
  if (!metadata) return false;
  return metadata.active_run_id === identity.activeRunId &&
    Number(metadata.plate_generation) === identity.plateGeneration &&
    Number(metadata.audio_plan_version) === TWOSHOT_AUDIO_PLAN_VERSION &&
    metadata.audio_input_hash === identity.inputHash &&
    Array.isArray(metadata.speakers) && metadata.speakers.length > 0 &&
    Array.isArray(metadata.segments) &&
    Number(metadata.scene_duration_seconds) > 0;
}

export function buildTwoshotPlanFromMetadata(
  metadata: PersistedAudioMetadata,
  url: string,
  duration: number,
): Record<string, unknown> | null {
  const speakers = Array.isArray(metadata.speakers) ? metadata.speakers : [];
  const segments = Array.isArray(metadata.segments) ? metadata.segments : [];
  const totalSec = Number(metadata.scene_duration_seconds || duration);
  if (!url || speakers.length === 0 || !Number.isFinite(totalSec) || totalSec <= 0) return null;
  const multi = speakers.length >= 2;
  return {
    segments,
    speakers,
    spokenSec: Number(metadata.spoken_seconds ?? 0),
    totalSec,
    url,
    useExternalAudio: multi,
    embeddedAudio: !multi,
    generatedAt: new Date().toISOString(),
    audioPlanVersion: TWOSHOT_AUDIO_PLAN_VERSION,
  };
}

export function isCompleteTwoshotPlan(plan: unknown): boolean {
  const p = (plan ?? {}) as Record<string, unknown>;
  return typeof p.url === "string" && p.url.length > 0 &&
    Array.isArray(p.speakers) && p.speakers.length > 0 &&
    Number(p.totalSec) > 0;
}