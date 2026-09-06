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
// ============================================================================

import {
  getModeSpec,
  getVideoModelSpec,
  projectTargetFrame,
  validateCapability,
  type CapabilityRequest,
  type CapabilityViolation,
  type PixelFrame,
  type VideoMode,
} from './videoModelSpecs.ts';

export interface CapabilityGateResult {
  /** Non-null = reject. The caller MUST return this response untouched. */
  violation: CapabilityViolation | null;
  /** Exact pixel frame promised for this request (null when rejected). */
  targetFrame: PixelFrame | null;
  /** Resolution label the spec resolved (may differ in casing from input). */
  resolutionLabel: string | null;
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
  if (violation) return { violation, targetFrame: null, resolutionLabel: null };

  const spec = getVideoModelSpec(req.modelId)!;
  const modeSpec = getModeSpec(spec, req.mode)!;
  const resolution = req.resolution
    ? modeSpec.resolutions.find((r) => r.label.toLowerCase() === req.resolution!.toLowerCase())!
    : modeSpec.resolutions[0];

  return {
    violation: null,
    targetFrame: resolution
      ? projectTargetFrame(resolution, req.aspectRatio ?? modeSpec.aspectRatios[0])
      : null,
    resolutionLabel: resolution?.label ?? null,
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

/**
 * Convenience wrapper: returns a ready 400 Response or the resolved target.
 */
export function capabilityGate(
  req: CapabilityRequest,
  corsHeaders: Record<string, string>,
): { response: Response } | { response: null; targetFrame: PixelFrame | null; resolutionLabel: string | null } {
  const result = evaluateCapabilityGate(req);
  if (result.violation) {
    return { response: capabilityViolationResponse(result.violation, corsHeaders) };
  }
  return {
    response: null,
    targetFrame: result.targetFrame,
    resolutionLabel: result.resolutionLabel,
  };
}
