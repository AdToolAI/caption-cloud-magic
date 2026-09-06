// ============================================================================
// RUNTIME CAPABILITY GATE
// ----------------------------------------------------------------------------
// Every generate-*-video function runs this gate BEFORE it touches the wallet
// and BEFORE it dispatches to a provider. An invalid combination is rejected
// with 400 INVALID_MODEL_CAPABILITY — never silently rewritten.
//
// Hard ordering contract (asserted by
// src/test/videoCapabilityGateOrdering.test.ts):
//   parse body -> capability gate -> wallet -> deduct -> provider
//
// The gate also produces the PARITY CONTEXT that must be persisted with the
// generation: model x route x region x mode x tier plus the requested pixels.
// Output measurement updates exactly that tier and nothing else.
// ============================================================================

import {
  getModeSpec,
  getVideoModelSpec,
  parityKeyOf,
  projectTargetFrame,
  validateCapability,
  type CapabilityRequest,
  type CapabilityViolation,
  type ParityKey,
  type PixelFrame,
  type VideoMode,
} from './videoModelSpecs.ts';

/** Columns persisted on `ai_video_generations` to reconstruct the parity key. */
export interface ParityContextColumns {
  parity_model_id: string;
  parity_api_route: string;
  parity_region: string;
  parity_mode: string;
  parity_resolution_label: string;
  requested_width: number | null;
  requested_height: number | null;
}

export interface CapabilityGateResult {
  /** Non-null = reject. The caller MUST return this response untouched. */
  violation: CapabilityViolation | null;
  /** Exact pixel frame promised for this request (null when rejected). */
  targetFrame: PixelFrame | null;
  /** Resolution label the spec resolved (may differ in casing from input). */
  resolutionLabel: string | null;
  /** Route/mode/tier identity of this run. */
  parityKey: ParityKey | null;
  /** Ready-to-insert columns for `ai_video_generations`. */
  parityColumns: ParityContextColumns | null;
}

/** Derives the generation mode from the inputs an edge function received. */
export function inferMode(input: {
  startImageUrl?: string | null;
  endImageUrl?: string | null;
  referenceImageUrls?: unknown[] | null;
  videoUrl?: string | null;
}): VideoMode {
  if (input.videoUrl) return 'v2v';
  if (input.referenceImageUrls && input.referenceImageUrls.length > 0) return 'reference';
  if (input.startImageUrl && input.endImageUrl) return 'firstLast';
  if (input.startImageUrl) return 'i2v';
  return 't2v';
}

export function evaluateCapabilityGate(req: CapabilityRequest): CapabilityGateResult {
  const violation = validateCapability(req);
  if (violation) {
    return { violation, targetFrame: null, resolutionLabel: null, parityKey: null, parityColumns: null };
  }

  const spec = getVideoModelSpec(req.modelId)!;
  const modeSpec = getModeSpec(spec, req.mode)!;
  // validateCapability guarantees an explicit resolution for multi-tier modes,
  // so this fallback only ever hits a single-tier mode.
  const resolution = req.resolution
    ? modeSpec.resolutions.find((r) => r.label.toLowerCase() === req.resolution!.toLowerCase())!
    : modeSpec.resolutions[0];

  const aspectRatio = req.aspectRatio ?? modeSpec.aspectRatios[0];
  const targetFrame = resolution ? projectTargetFrame(resolution, aspectRatio) : null;
  const parityKey = resolution ? parityKeyOf(spec, req.mode, resolution.label) : null;

  return {
    violation: null,
    targetFrame,
    resolutionLabel: resolution?.label ?? null,
    parityKey,
    parityColumns: parityKey
      ? {
          parity_model_id: parityKey.modelId,
          parity_api_route: parityKey.apiRoute,
          parity_region: parityKey.region,
          parity_mode: parityKey.mode,
          parity_resolution_label: parityKey.resolutionLabel,
          requested_width: targetFrame?.width ?? null,
          requested_height: targetFrame?.height ?? null,
        }
      : null,
  };
}

/** 400 response for a violation. Wallet untouched, no provider request made. */
export function capabilityViolationResponse(
  violation: CapabilityViolation,
  corsHeaders: Record<string, string>,
): Response {
  return new Response(
    JSON.stringify({
      error: violation.message,
      code: violation.code,
      field: violation.field,
    }),
    { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
  );
}

export interface CapabilityGatePass {
  response: null;
  targetFrame: PixelFrame | null;
  resolutionLabel: string | null;
  parityKey: ParityKey | null;
  parityColumns: ParityContextColumns | null;
}

/**
 * Convenience wrapper: returns a ready 400 Response or the resolved target.
 */
export function capabilityGate(
  req: CapabilityRequest,
  corsHeaders: Record<string, string>,
): { response: Response } | CapabilityGatePass {
  const result = evaluateCapabilityGate(req);
  if (result.violation) {
    return { response: capabilityViolationResponse(result.violation, corsHeaders) };
  }
  return {
    response: null,
    targetFrame: result.targetFrame,
    resolutionLabel: result.resolutionLabel,
    parityKey: result.parityKey,
    parityColumns: result.parityColumns,
  };
}

/**
 * Looks up the operational state of the exact tier. A tier that regressions
 * disabled must not be submitted again until a passing smoke test clears it.
 */
export async function loadTierDisabled(
  supabase: any,
  req: CapabilityRequest,
): Promise<boolean> {
  try {
    const spec = getVideoModelSpec(req.modelId);
    if (!spec || !req.resolution) return false;
    const key = parityKeyOf(spec, req.mode, req.resolution);
    const { data } = await supabase
      .from('video_model_tier_parity')
      .select('tier_disabled')
      .eq('model_id', key.modelId)
      .eq('api_route', key.apiRoute)
      .eq('region', key.region)
      .eq('mode', key.mode)
      .eq('resolution_label', key.resolutionLabel)
      .maybeSingle();
    return !!data?.tier_disabled;
  } catch (err) {
    // Availability of the parity table must never break a paid run.
    console.error('[videoCapabilityGate] tier state lookup failed:', err);
    return false;
  }
}

/**
 * Async gate used by the edge functions: resolves the tier kill switch first,
 * then validates. Still runs before wallet lookup and provider dispatch.
 */
export async function gateVideoCapability(
  supabase: any,
  req: CapabilityRequest,
  corsHeaders: Record<string, string>,
): Promise<{ response: Response } | CapabilityGatePass> {
  const tierDisabled = await loadTierDisabled(supabase, req);
  return capabilityGate({ ...req, tierDisabled }, corsHeaders);
}
