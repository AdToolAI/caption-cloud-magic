// ============================================================================
// OUTPUT MEASUREMENT — the delivered file is the verdict.
// ----------------------------------------------------------------------------
// Every finished generation is measured against the frame the capability gate
// promised. The verdict is persisted on the generation and folded into the
// per-tier parity state: three consecutive mismatches downgrade a tier from
// FULL_PARITY to VERIFY and mark it yellow in the provider health report.
// ============================================================================

import { probeRemoteVideo } from './mp4-probe.ts';
import {
  applyOutputMeasurement,
  classifyMeasuredOutput,
  getVideoModelSpec,
  projectTargetFrame,
  resolveVideoModelId,
  type OutputVerdict,
  type ParityStatus,
  type PixelFrame,
  type ResolutionSpec,
} from './videoModelSpecs.ts';

export interface MeasurableGeneration {
  id: string;
  model: string;
  resolution?: string | null;
  aspect_ratio?: string | null;
  video_url?: string | null;
}

function findTier(modelId: string, label?: string | null): ResolutionSpec | undefined {
  const spec = getVideoModelSpec(modelId);
  if (!spec) return undefined;
  const all = spec.modes.flatMap((m) => m.resolutions);
  if (label) {
    const hit = all.find((r) => r.label.toLowerCase() === label.toLowerCase());
    if (hit) return hit;
  }
  return all[0];
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
    const modelId = resolveVideoModelId(generation.model);
    const tier = findTier(modelId, generation.resolution);
    if (!tier) return { verdict: 'UNMEASURED', reason: `no spec tier for ${generation.model}` };

    const target = projectTargetFrame(tier, generation.aspect_ratio ?? '16:9');
    const probed = await probeRemoteVideo(generation.video_url);
    const measured: PixelFrame = { width: probed.width, height: probed.height };
    const verdict = classifyMeasuredOutput(target, measured);

    await supabase
      .from('ai_video_generations')
      .update({
        measured_width: measured.width,
        measured_height: measured.height,
        target_width: target.width,
        target_height: target.height,
        output_verdict: verdict,
      })
      .eq('id', generation.id);

    await updateTierParity(supabase, modelId, tier.label, tier.parityStatus, verdict);

    return { verdict, target, measured };
  } catch (err) {
    console.error('[videoOutputMeasurement] measurement failed:', err);
    return { verdict: 'UNMEASURED', reason: String(err) };
  }
}

async function updateTierParity(
  supabase: any,
  modelId: string,
  resolutionLabel: string,
  specStatus: ParityStatus,
  verdict: OutputVerdict,
): Promise<void> {
  const { data: row } = await supabase
    .from('video_model_tier_parity')
    .select('parity_status, consecutive_mismatches, tier_disabled')
    .eq('model_id', modelId)
    .eq('resolution_label', resolutionLabel)
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
      model_id: modelId,
      resolution_label: resolutionLabel,
      parity_status: next.parityStatus,
      consecutive_mismatches: next.consecutiveMismatches,
      tier_disabled: next.tierDisabled,
      last_verdict: verdict,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'model_id,resolution_label' },
  );

  if (next.downgraded) {
    console.warn(
      `[videoOutputMeasurement] ${modelId} ${resolutionLabel} downgraded FULL_PARITY -> VERIFY after ${next.consecutiveMismatches} mismatches`,
    );
  }
}
