/**
 * Remotion Lambda Start Payload Normalizer
 * 
 * Ensures all Lambda invocations send a COMPLETE payload that satisfies
 * the Remotion v4.0.424 ServerlessStartPayload schema.
 */

const REMOTION_VERSION = '4.0.424';

/**
 * r31: Lambda 600s + 8 Lambdas — resolves the deadlock between timeout and rate-limit.
 * At 240s timeout: 8λ → 225 fpl × 2.1s = 472s → TIMEOUT. 20λ → Rate Limit.
 * At 600s timeout: 8λ → 225 fpl × 2.1s = 472s < 600s ✅, well under concurrency limit.
 */
export const LAMBDA_TIMEOUT_SECONDS = 600;
const ESTIMATED_SECONDS_PER_FRAME = 2.0;

/**
 * r31: DUAL-LIMIT scheduling with 600s timeout and max 8 Lambdas.
 * Soft limit (210): preferred, with 0.7 safety margin → 210 × 2.0 = 420s
 * Hard limit (300): absolute max → 300 × 2.0 = 600s
 * For 30fps/60s: 1800 frames / 8 lambdas = 225 fpl → 225 × 2.0 = 450s < 600s ✅
 */
const SOFT_MAX_FRAMES_PER_LAMBDA = Math.floor(LAMBDA_TIMEOUT_SECONDS / ESTIMATED_SECONDS_PER_FRAME * 0.7); // 210
const HARD_MAX_FRAMES_PER_LAMBDA = Math.floor(LAMBDA_TIMEOUT_SECONDS / ESTIMATED_SECONDS_PER_FRAME);       // 300

const TARGET_MAX_LAMBDAS = 8;

/**
 * r39: Scheduling modes for canary rollout.
 * - 'distributed': default multi-Lambda scheduling (legacy behavior)
 * - 'stability': single-Lambda (or max 2) for maximum reliability
 */
export type SchedulingMode = 'distributed' | 'stability';

export interface SchedulingResult {
  framesPerLambda: number;
  estimatedLambdas: number;
  /** If true, caller should reduce fps from 30 to 24 to fit within limits */
  needsFpsReduction: boolean;
  /** r39: Which scheduling mode was used */
  schedulingMode: SchedulingMode;
  /** r42: Estimated runtime in seconds */
  estRuntimeSec?: number;
  /** r42: Whether the estimated runtime fits within the Lambda timeout */
  timeoutBudgetOk?: boolean;
}

/**
 * r40: HOTFIX — 100% stability mode until success rate stabilizes.
 * After stabilization, reduce back to canary (e.g. 0.5 → 0.2).
 */
const STABILITY_CANARY_PERCENT = 1.0;

/**
 * r40: Determine scheduling mode for a new job.
 * - forceStability or any retryable error category → always stability
 * - Otherwise: hash-based deterministic canary (not random)
 */
export function determineSchedulingMode(options?: {
  forceStability?: boolean;
  retryAttempt?: number;
  lastErrorCategory?: string;
  userId?: string;
}): SchedulingMode {
  if (options?.forceStability) return 'stability';
  // r40: Force stability for ALL retryable error categories, not just rate_limit
  const failureAwareCategories = ['rate_limit', 'timeout', 'lambda_crash', 'audio_corruption'];
  if (options?.lastErrorCategory && failureAwareCategories.includes(options.lastErrorCategory)) return 'stability';
  
  // r40: Deterministic hash-based canary (consistent per user)
  if (STABILITY_CANARY_PERCENT >= 1.0) return 'stability';
  if (options?.userId) {
    // Simple hash: sum of char codes mod 100
    const hash = options.userId.split('').reduce((acc, c) => acc + c.charCodeAt(0), 0) % 100;
    if (hash < STABILITY_CANARY_PERCENT * 100) return 'stability';
    return 'distributed';
  }
  // Fallback: random (legacy, should not be reached with userId)
  if (Math.random() < STABILITY_CANARY_PERCENT) return 'stability';
  return 'distributed';
}

/**
 * r31: Adaptive framesPerLambda with 600s timeout and max 8 Lambdas.
 * 
 * Dual-limit logic:
 *   - If concurrencySafe <= 210 (soft limit): use it (safe + fast)
 *   - If concurrencySafe <= 300 (hard limit): use concurrencySafe (tight but ok)
 *   - If concurrencySafe > 300: signal fps reduction needed
 */
export function calculateFramesPerLambda(
  durationInFrames: number | undefined,
  options?: { retryAttempt?: number; maxLambdas?: number; schedulingMode?: SchedulingMode }
): number {
  return calculateScheduling(durationInFrames, options).framesPerLambda;
}

export function calculateScheduling(
  durationInFrames: number | undefined,
  options?: { retryAttempt?: number; maxLambdas?: number; schedulingMode?: SchedulingMode }
): SchedulingResult {
  const frameCount = durationInFrames ?? 900;
  const schedulingMode = options?.schedulingMode ?? 'distributed';
  const retryAttempt = options?.retryAttempt ?? 0;
  
  // r55-phase5: STABILITY MODE — graduated Lambda count for Loft-Film 30fps support
  // ≤500 frames → 1λ, ≤1000 → 2λ, >1000 → 3λ (allows 30fps/60s = 1800 frames safely)
  if (schedulingMode === 'stability') {
    const stabilityLambdas = frameCount <= 500 ? 1 : frameCount <= 1000 ? 2 : 3;
    const fpl = Math.ceil(frameCount / stabilityLambdas);
    const estRuntimeSec = fpl * ESTIMATED_SECONDS_PER_FRAME;
    const needsFpsReduction = estRuntimeSec > LAMBDA_TIMEOUT_SECONDS;
    const timeoutBudgetOk = !needsFpsReduction;
    
    console.log(`[remotion-payload] r55-phase5 STABILITY scheduling: frames=${frameCount}, fpl=${fpl}, lambdas=${stabilityLambdas}, needsFpsReduction=${needsFpsReduction}, estTime=${estRuntimeSec.toFixed(1)}s, timeout=${LAMBDA_TIMEOUT_SECONDS}s, timeoutBudgetOk=${timeoutBudgetOk}`);
    return { framesPerLambda: fpl, estimatedLambdas: stabilityLambdas, needsFpsReduction, schedulingMode, estRuntimeSec, timeoutBudgetOk };
  }
  
  // DISTRIBUTED MODE (legacy behavior)
  const maxLambdas = options?.maxLambdas ?? TARGET_MAX_LAMBDAS;
  
  // For retries, reduce max Lambdas further (attempt 1: 6, attempt 2: 4, attempt 3: 3)
  const effectiveMaxLambdas = retryAttempt > 0 
    ? Math.max(3, maxLambdas - retryAttempt * 2)
    : maxLambdas;
  
  // How many frames per lambda to stay within concurrency limit
  const concurrencySafe = Math.ceil(frameCount / effectiveMaxLambdas);
  
  let framesPerLambda: number;
  let needsFpsReduction = false;
  
  if (concurrencySafe <= SOFT_MAX_FRAMES_PER_LAMBDA) {
    framesPerLambda = Math.max(concurrencySafe, 100);
  } else if (concurrencySafe <= HARD_MAX_FRAMES_PER_LAMBDA) {
    framesPerLambda = concurrencySafe;
  } else {
    framesPerLambda = HARD_MAX_FRAMES_PER_LAMBDA;
    needsFpsReduction = true;
  }
  
  const estimatedLambdas = Math.ceil(frameCount / framesPerLambda);
  const estRuntimeSec = framesPerLambda * ESTIMATED_SECONDS_PER_FRAME;
  const timeoutBudgetOk = !needsFpsReduction;
  console.log(`[remotion-payload] r42 DISTRIBUTED scheduling: frames=${frameCount}, fpl=${framesPerLambda}, lambdas=${estimatedLambdas}, maxLambdas=${effectiveMaxLambdas}, retry=${retryAttempt}, needsFpsReduction=${needsFpsReduction}, estTime=${estRuntimeSec.toFixed(1)}s, timeout=${LAMBDA_TIMEOUT_SECONDS}s, timeoutBudgetOk=${timeoutBudgetOk}`);
  
  return { framesPerLambda, estimatedLambdas, needsFpsReduction, schedulingMode, estRuntimeSec, timeoutBudgetOk };
}

export interface NormalizedStartPayload {
  type: 'start';
  serveUrl: string;
  composition: string;
  inputProps: { type: 'payload'; payload: string } | { type: 'bucket-url'; hash: string };
  codec: string;
  imageFormat: string;
  version: string;

  // Required fields with defaults
  logLevel: string;
  frameRange: [number, number] | null;
  timeoutInMilliseconds: number;
  chromiumOptions: Record<string, unknown>;
  scale: number;
  everyNthFrame: number;
  concurrencyPerLambda: number;
  downloadBehavior: { type: string; fileName: string | null };
  muted: boolean;
  overwrite: boolean;
  rendererFunctionName: string | null;
  framesPerLambda: number | null;
  concurrency: number | null;
  envVariables: Record<string, string>;
  privacy: string;
  audioCodec: string | null;
  x264Preset: string | null;
  audioBitrate: string | null;
  videoBitrate: string | null;
  encodingBufferSize: string | null;
  encodingMaxRate: string | null;
  webhook: { url: string; secret: string | null; customData?: Record<string, unknown> } | null;
  forceHeight: number | null;
  forceWidth: number | null;
  bucketName: string | null;
  offthreadVideoCacheSizeInBytes: number | null;
  deleteAfter: string | null;
  colorSpace: string | null;
  preferLossless: boolean;
  forcePathStyle: boolean;

  // Optional explicit metadata
  durationInFrames?: number;
  fps?: number;
  height?: number;
  width?: number;
  outName?: string;
  jpegQuality?: number;
  maxRetries?: number;

  [key: string]: unknown;
}

/**
 * Takes a partial/incomplete Lambda start payload and returns a fully
 * normalized payload that Remotion v4.0.424 will accept.
 */
export function normalizeStartPayload(partial: Record<string, unknown>): NormalizedStartPayload {
  // Ensure inputProps is in serialized format
  let inputProps = partial.inputProps as any;
  if (inputProps && typeof inputProps === 'object' && inputProps.type !== 'payload' && inputProps.type !== 'bucket-url') {
    inputProps = {
      type: 'payload',
      payload: JSON.stringify(inputProps),
    };
  }

  const normalized: NormalizedStartPayload = {
    // Core fields (caller must provide)
    type: 'start',
    serveUrl: (partial.serveUrl as string) || '',
    composition: (partial.composition as string) || 'UniversalCreatorVideo',
    inputProps: inputProps || { type: 'payload', payload: '{}' },
    codec: (partial.codec as string) || 'h264',
    imageFormat: (partial.imageFormat as string) || 'jpeg',

    // CRITICAL: version field
    version: REMOTION_VERSION,

    // Required schema fields with safe defaults
    logLevel: (partial.logLevel as string) || 'warn',
    frameRange: (partial.frameRange as [number, number] | null) ?? 
      (typeof partial.durationInFrames === 'number' && partial.durationInFrames > 0 
        ? [0, (partial.durationInFrames as number) - 1] as [number, number]
        : null),
    timeoutInMilliseconds: (partial.timeoutInMilliseconds as number) || 300000,
    chromiumOptions: (partial.chromiumOptions as Record<string, unknown>) || {},
    scale: (partial.scale as number) || 1,
    everyNthFrame: (partial.everyNthFrame as number) || 1,
    concurrencyPerLambda: (partial.concurrencyPerLambda as number) || 1,
    downloadBehavior: (partial.downloadBehavior as any) || { type: 'play-in-browser', fileName: null },
    muted: (partial.muted as boolean) ?? (partial._silentRender ? true : false),
    overwrite: (partial.overwrite as boolean) ?? true,
    rendererFunctionName: (partial.rendererFunctionName as string | null) ?? null,
    framesPerLambda: (partial.framesPerLambda as number | null) ?? null,
    privacy: (partial.privacy as string) || 'public',
    audioCodec: partial._silentRender ? null : ((partial.audioCodec as string) || 'aac'),
    x264Preset: (partial.x264Preset as string) || 'medium',
    audioBitrate: (partial.audioBitrate as string | null) ?? null,
    videoBitrate: (partial.videoBitrate as string | null) ?? null,
    encodingBufferSize: (partial.encodingBufferSize as string | null) ?? null,
    encodingMaxRate: (partial.encodingMaxRate as string | null) ?? null,
    webhook: (partial.webhook as any) || null,
    forceHeight: (partial.forceHeight as number | null) ?? null,
    forceWidth: (partial.forceWidth as number | null) ?? null,
    bucketName: (partial.bucketName as string | null) ?? null,
    offthreadVideoCacheSizeInBytes: (partial.offthreadVideoCacheSizeInBytes as number | null) ?? null,
    deleteAfter: (partial.deleteAfter as string | null) ?? null,
    colorSpace: (partial.colorSpace as string | null) ?? null,
    envVariables: (partial.envVariables && typeof partial.envVariables === 'object' && !Array.isArray(partial.envVariables))
      ? (partial.envVariables as Record<string, string>)
      : {},
    preferLossless: (partial.preferLossless as boolean) ?? false,
    forcePathStyle: (partial.forcePathStyle as boolean) ?? false,
  };

  // r39: Adaptive scheduling with scheduling mode support
  const explicitFPL = partial.framesPerLambda as number | undefined;
  const retryAttempt = (partial._retryAttempt as number) || 0;
  const schedulingMode = (partial._schedulingMode as SchedulingMode) || 'distributed';
  normalized.framesPerLambda = explicitFPL ?? calculateFramesPerLambda(
    partial.durationInFrames as number | undefined,
    { retryAttempt, schedulingMode }
  );
  // r39D: CRITICAL — force concurrency to null, delete any stale key
  normalized.concurrency = null;
  normalized.concurrencyPerLambda = (partial.concurrencyPerLambda as number) || 1;

  // Pass through optional metadata fields
  if (partial.durationInFrames != null) normalized.durationInFrames = partial.durationInFrames as number;
  if (partial.fps != null) normalized.fps = partial.fps as number;
  if (partial.height != null) normalized.height = partial.height as number;
  if (partial.width != null) normalized.width = partial.width as number;
  if (partial.outName != null) normalized.outName = partial.outName as string;
  if (partial.jpegQuality != null) normalized.jpegQuality = partial.jpegQuality as number;
  if (partial.maxRetries != null) normalized.maxRetries = partial.maxRetries as number;

  return normalized;
}

/**
 * Creates a STRICT MINIMAL payload with ONLY the fields documented in the
 * official Remotion v4 Lambda renderMediaOnLambda API.
 */
export function buildStrictMinimalPayload(opts: {
  serveUrl: string;
  composition: string;
  inputProps: Record<string, unknown>;
  codec?: string;
  webhook?: { url: string; secret: string | null; customData?: Record<string, unknown> } | null;
  outName?: string;
  bucketName?: string;
  durationInFrames?: number;
  fps?: number;
  width?: number;
  height?: number;
  logLevel?: string;
  schedulingMode?: SchedulingMode;
}): Record<string, unknown> {
  // r39: Use scheduling mode for strict payload too
  const fpl = opts.durationInFrames
    ? calculateFramesPerLambda(opts.durationInFrames, { schedulingMode: opts.schedulingMode })
    : 100;

  const payload: Record<string, unknown> = {
    type: 'start',
    serveUrl: opts.serveUrl,
    composition: opts.composition,
    codec: opts.codec || 'h264',
    version: REMOTION_VERSION,
    imageFormat: 'jpeg',
    inputProps: {
      type: 'payload',
      payload: JSON.stringify(opts.inputProps),
    },
    logLevel: opts.logLevel || 'verbose',
    privacy: 'public',
    maxRetries: 1,
    overwrite: true,
    muted: false,
    framesPerLambda: fpl,
    concurrency: null, // r39D: always null
    scale: 1,
    everyNthFrame: 1,
    timeoutInMilliseconds: 300000,
    chromiumOptions: {},
    downloadBehavior: { type: 'play-in-browser' },
    audioCodec: 'aac',
    x264Preset: 'medium',
    envVariables: {},
    frameRange: opts.durationInFrames && opts.durationInFrames > 0
      ? [0, opts.durationInFrames - 1]
      : [0, 59],
    ...(opts.durationInFrames != null ? { durationInFrames: opts.durationInFrames } : {}),
    ...(opts.fps != null ? { fps: opts.fps } : {}),
    ...(opts.width != null ? { width: opts.width } : {}),
    ...(opts.height != null ? { height: opts.height } : {}),
  };

  if (opts.webhook) payload.webhook = opts.webhook;
  if (opts.outName) payload.outName = opts.outName;
  if (opts.bucketName) payload.bucketName = opts.bucketName;

  return payload;
}

/**
 * Returns a diagnostic summary of the payload for logging (no sensitive data).
 */
export function payloadDiagnostics(payload: NormalizedStartPayload | Record<string, unknown>): Record<string, unknown> {
  const fr = (payload as any).frameRange;
  const fpl = (payload as any).framesPerLambda;
  const dif = (payload as any).durationInFrames;
  return {
    version: (payload as any).version,
    type: (payload as any).type,
    composition: (payload as any).composition,
    codec: (payload as any).codec,
    hasWebhook: !!(payload as any).webhook,
    hasBucketName: !!(payload as any).bucketName,
    hasFrameRange: !!(payload as any).frameRange,
    hasFrameRangeKey: 'frameRange' in payload,
    frameRangeValue: fr ?? null,
    frameRangeType: fr === null ? 'null' : fr === undefined ? 'undefined' : Array.isArray(fr) ? `array[${fr.length}]` : typeof fr,
    durationInFrames: dif,
    fps: (payload as any).fps,
    width: (payload as any).width,
    height: (payload as any).height,
    keyCount: Object.keys(payload).length,
    serveUrlPrefix: ((payload as any).serveUrl || '').substring(0, 80),
    payloadMode: (payload as any)._payloadMode || 'normalized',
    audioCodec: (payload as any).audioCodec,
    x264Preset: (payload as any).x264Preset,
    hasEnvVariablesKey: 'envVariables' in payload,
    envVariablesType: typeof (payload as any).envVariables,
    envVariablesSerializedLength: (() => { try { return JSON.stringify((payload as any).envVariables).length; } catch { return -1; } })(),
    bundle_canary: 'r42-errorIsolation',
    // r39: Enhanced scheduling forensics
    scheduling: {
      framesPerLambda: fpl,
      estimatedLambdas: (dif && fpl) ? Math.ceil(dif / fpl) : 'unknown',
      estRuntimeSec: fpl ? (fpl * ESTIMATED_SECONDS_PER_FRAME) : 'unknown',
      timeoutBudgetOk: fpl ? (fpl * ESTIMATED_SECONDS_PER_FRAME <= LAMBDA_TIMEOUT_SECONDS) : 'unknown',
      targetMaxLambdas: TARGET_MAX_LAMBDAS,
      concurrency: (payload as any).concurrency,
      concurrencyPerLambda: (payload as any).concurrencyPerLambda,
      hasConcurrencyKey: 'concurrency' in payload,
      concurrencyIsNull: (payload as any).concurrency === null,
    },
  };
}
