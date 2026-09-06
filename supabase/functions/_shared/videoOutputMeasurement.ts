// ============================================================================
// OUTPUT MEASUREMENT — the delivered file is the verdict.
// ----------------------------------------------------------------------------
// Every finished generation is measured against the frame the capability gate
// promised. The verdict is persisted on the generation together with the FULL
// parity context (model x api route x region x mode x tier) and folded into the
// per-tier parity state: three consecutive mismatches downgrade that ONE tier
// from FULL_PARITY to VERIFY. A t2v mismatch never touches i2v, and a Replicate
// route mismatch never touches the same model on a direct-provider route.
// ============================================================================

import { probeRemoteVideo } from './mp4-probe.ts';
import {
  applyOutputMeasurement,
  classifyMeasuredOutput,
  getModeSpec,
  getVideoModelSpec,
  parityKeyOf,
  projectTargetFrame,
  resolveVideoModelId,
  type OutputVerdict,
  type ParityKey,
  type ParityStatus,
  type PixelFrame,
  type ResolutionSpec,
  type VideoMode,
} from './videoModelSpecs.ts';

export interface MeasurableGeneration {
  id: string;
  model: string;
  resolution?: string | null;
  aspect_ratio?: string | null;
  video_url?: string | null;
  /** Parity context written by the gate. Falls back to inference when absent. */
  parity_model_id?: string | null;
  parity_api_route?: string | null;
  parity_region?: string | null;
  parity_mode?: string | null;
  parity_resolution_label?: string | null;
  requested_width?: number | null;
  requested_height?: number | null;
}

/**
 * Type-safe row -> measurement input. Callers MUST pass the single row object
 * they are iterating; the parity context can therefore never be read off a
 * different (or undefined) variable — that class of bug is a compile error now.
 */
export function measurableFromRow(
  row: MeasurableGeneration,
  patch: { video_url: string },
): MeasurableGeneration {
  return {
    id: row.id,
    model: row.model,
    resolution: row.resolution ?? null,
    aspect_ratio: row.aspect_ratio ?? null,
    video_url: patch.video_url,
    parity_model_id: row.parity_model_id ?? null,
    parity_api_route: row.parity_api_route ?? null,
    parity_region: row.parity_region ?? null,
    parity_mode: row.parity_mode ?? null,
    parity_resolution_label: row.parity_resolution_label ?? null,
    requested_width: row.requested_width ?? null,
    requested_height: row.requested_height ?? null,
  };
}

function findTier(
  modelId: string,
  mode: VideoMode,
  label?: string | null,
): ResolutionSpec | undefined {
  const spec = getVideoModelSpec(modelId);
  if (!spec) return undefined;
  const modeSpec = getModeSpec(spec, mode);
  const pool = modeSpec ? modeSpec.resolutions : spec.modes.flatMap((m) => m.resolutions);
  if (label) {
    const hit = pool.find((r) => r.label.toLowerCase() === label.toLowerCase());
    if (hit) return hit;
  }
  return pool[0];
}

export interface MeasurementResult {
  verdict: OutputVerdict | 'UNMEASURED';
  target?: PixelFrame;
  measured?: PixelFrame;
  reason?: string;
}

/**
 * Measures a completed generation and records the verdict. Never throws — a
 * measurement failure is telemetry, never a reason to fail a paid run.
 */
export async function recordGenerationOutput(
  supabase: any,
  generation: MeasurableGeneration,
): Promise<MeasurementResult> {
  try {
    if (!generation.video_url) return { verdict: 'UNMEASURED', reason: 'no video url' };
    const modelId = resolveVideoModelId(generation.parity_model_id ?? generation.model);
    const spec = getVideoModelSpec(modelId);
    if (!spec) return { verdict: 'UNMEASURED', reason: `no spec for ${generation.model}` };

    const mode = (generation.parity_mode as VideoMode | null) ?? spec.modes[0]?.mode ?? 't2v';
    const label = generation.parity_resolution_label ?? generation.resolution;
    const tier = findTier(modelId, mode, label);
    if (!tier) return { verdict: 'UNMEASURED', reason: `no spec tier for ${generation.model}` };

    // The frame the user was promised: the gate's requested pixels when we have
    // them, otherwise re-projected from the tier.
    const target: PixelFrame =
      generation.requested_width && generation.requested_height
        ? { width: generation.requested_width, height: generation.requested_height }
        : projectTargetFrame(tier, generation.aspect_ratio ?? '16:9');

    const probed = await probeRemoteVideo(generation.video_url);
    const measured: PixelFrame = { width: probed.width, height: probed.height };
    const verdict = classifyMeasuredOutput(target, measured);

    await supabase
      .from('ai_video_generations')
      .update({
        measured_width: measured.width,
        measured_height: measured.height,
        measured_fps: probed.fps ?? null,
        measured_duration_seconds: probed.durationSeconds ?? null,
        measured_container: probed.container ?? null,
        measured_size_bytes: probed.sizeBytes ?? null,
        measured_bitrate_bps:
          probed.sizeBytes && probed.durationSeconds
            ? Math.round((probed.sizeBytes * 8) / probed.durationSeconds)
            : null,
        target_width: target.width,
        target_height: target.height,
        output_verdict: verdict,
        measured_at: new Date().toISOString(),
      })
      .eq('id', generation.id);

    const key: ParityKey = generation.parity_api_route
      ? {
          modelId,
          apiRoute: generation.parity_api_route,
          region: generation.parity_region ?? spec.region,
          mode,
          resolutionLabel: tier.label,
        }
      : parityKeyOf(spec, mode, tier.label);

    await updateTierParity(supabase, key, tier.parityStatus, verdict);

    return { verdict, target, measured };
  } catch (err) {
    console.error('[videoOutputMeasurement] measurement failed:', err);
    return { verdict: 'UNMEASURED', reason: String(err) };
  }
}

async function updateTierParity(
  supabase: any,
  key: ParityKey,
  specStatus: ParityStatus,
  verdict: OutputVerdict,
): Promise<void> {
  const { data: row } = await supabase
    .from('video_model_tier_parity')
    .select('parity_status, consecutive_mismatches, tier_disabled')
    .eq('model_id', key.modelId)
    .eq('api_route', key.apiRoute)
    .eq('region', key.region)
    .eq('mode', key.mode)
    .eq('resolution_label', key.resolutionLabel)
    .maybeSingle();

  const next = applyOutputMeasurement(
    {
      parityStatus: (row?.parity_status as ParityStatus) ?? specStatus,
      consecutiveMismatches: row?.consecutive_mismatches ?? 0,
      tierDisabled: row?.tier_disabled ?? false,
    },
    verdict,
  );

  await supabase.from('video_model_tier_parity').upsert(
    {
      model_id: key.modelId,
      api_route: key.apiRoute,
      region: key.region,
      mode: key.mode,
      resolution_label: key.resolutionLabel,
      parity_status: next.parityStatus,
      consecutive_mismatches: next.consecutiveMismatches,
      tier_disabled: next.tierDisabled,
      last_verdict: verdict,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'model_id,api_route,region,mode,resolution_label' },
  );

  if (next.downgraded) {
    console.warn(
      `[videoOutputMeasurement] ${key.modelId} ${key.apiRoute}/${key.region}/${key.mode} ${key.resolutionLabel} downgraded FULL_PARITY -> VERIFY after ${next.consecutiveMismatches} mismatches`,
    );
  }
}
