/**
 * Remotion Lambda Start Payload Normalizer
 * 
 * Ensures all Lambda invocations send a COMPLETE payload that satisfies
 * the Remotion v4.0.424 ServerlessStartPayload schema.
 */

const REMOTION_VERSION = '4.0.424';

/**
 * Lambda Timeout-basierte Kalibrierung.
 * Die AWS Lambda-Funktion hat ein HARTES 120s Timeout.
 */
const LAMBDA_TIMEOUT_SECONDS = 120;
const ESTIMATED_SECONDS_PER_FRAME = 0.5;

/**
 * r26: DUAL-LIMIT scheduling.
 * Soft limit (168): preferred, with 0.7 safety margin — used when concurrency allows.
 * Hard limit (240): absolute max based on 120s timeout — used when concurrency demands it.
 */
const SOFT_MAX_FRAMES_PER_LAMBDA = Math.floor(LAMBDA_TIMEOUT_SECONDS / ESTIMATED_SECONDS_PER_FRAME * 0.7); // 168
const HARD_MAX_FRAMES_PER_LAMBDA = Math.floor(LAMBDA_TIMEOUT_SECONDS / ESTIMATED_SECONDS_PER_FRAME);       // 240

const TARGET_MAX_LAMBDAS = 8;

export interface SchedulingResult {
  framesPerLambda: number;
  estimatedLambdas: number;
  /** If true, caller should reduce fps from 30 to 24 to fit within limits */
  needsFpsReduction: boolean;
}

/**
 * r26: Fixed adaptive framesPerLambda calculation.
 * 
 * OLD BUG: min(168, max(concurrencySafe, 100)) always capped at 168 → forced 11 Lambdas for 60s video.
 * 
 * NEW LOGIC (dual-limit):
 *   - If concurrencySafe <= 168 (soft limit): use 168 (safe + fast)
 *   - If concurrencySafe <= 240 (hard limit): use concurrencySafe (prioritize concurrency)
 *   - If concurrencySafe > 240: signal fps reduction needed (240 frames = 120s timeout limit)
 */
export function calculateFramesPerLambda(
  durationInFrames: number | undefined,
  options?: { retryAttempt?: number; maxLambdas?: number }
): number {
  return calculateScheduling(durationInFrames, options).framesPerLambda;
}

export function calculateScheduling(
  durationInFrames: number | undefined,
  options?: { retryAttempt?: number; maxLambdas?: number }
): SchedulingResult {
  const frameCount = durationInFrames ?? 900;
  const maxLambdas = options?.maxLambdas ?? TARGET_MAX_LAMBDAS;
  const retryAttempt = options?.retryAttempt ?? 0;
  
  // For retries, reduce max Lambdas further (attempt 1: 6, attempt 2: 4, attempt 3: 3)
  const effectiveMaxLambdas = retryAttempt > 0 
    ? Math.max(3, maxLambdas - retryAttempt * 2)
    : maxLambdas;
  
  // How many frames per lambda to stay within concurrency limit
  const concurrencySafe = Math.ceil(frameCount / effectiveMaxLambdas);
  
  let framesPerLambda: number;
  let needsFpsReduction = false;
  
  if (concurrencySafe <= SOFT_MAX_FRAMES_PER_LAMBDA) {
    // Easy case: concurrency fits within soft limit → use soft limit (faster per-lambda)
    framesPerLambda = Math.max(concurrencySafe, 100);
  } else if (concurrencySafe <= HARD_MAX_FRAMES_PER_LAMBDA) {
    // Medium case: need more frames/lambda to stay under concurrency, but still within timeout
    // e.g., 1800 frames / 8 lambdas = 225 fpl → 225 * 0.5s = 112.5s < 120s ✅
    framesPerLambda = concurrencySafe;
  } else {
    // Hard case: even at 240 fpl we'd exceed timeout → signal fps reduction
    framesPerLambda = HARD_MAX_FRAMES_PER_LAMBDA;
    needsFpsReduction = true;
  }
  
  const estimatedLambdas = Math.ceil(frameCount / framesPerLambda);
  console.log(`[remotion-payload] r26 calculateScheduling: frames=${frameCount}, fpl=${framesPerLambda}, lambdas=${estimatedLambdas}, maxLambdas=${effectiveMaxLambdas}, retry=${retryAttempt}, needsFpsReduction=${needsFpsReduction}`);
  
  return { framesPerLambda, estimatedLambdas, needsFpsReduction };
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
    muted: (partial.muted as boolean) ?? false,
    overwrite: (partial.overwrite as boolean) ?? true,
    rendererFunctionName: (partial.rendererFunctionName as string | null) ?? null,
    framesPerLambda: (partial.framesPerLambda as number | null) ?? null,
    privacy: (partial.privacy as string) || 'public',
    audioCodec: (partial.audioCodec as string) || 'aac',
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

  // r25: Adaptive scheduling with concurrency awareness
  const explicitFPL = partial.framesPerLambda as number | undefined;
  const retryAttempt = (partial._retryAttempt as number) || 0;
  normalized.framesPerLambda = explicitFPL ?? calculateFramesPerLambda(
    partial.durationInFrames as number | undefined,
    { retryAttempt }
  );
  normalized.concurrency = null; // CRITICAL: explicit null
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
}): Record<string, unknown> {
  // r25: Use adaptive scheduling for strict payload too
  const fpl = opts.durationInFrames
    ? calculateFramesPerLambda(opts.durationInFrames)
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
    concurrency: null,
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
    bundle_canary: 'r25-adaptive-scheduling',
    // r25: Enhanced scheduling forensics
    scheduling: {
      framesPerLambda: fpl,
      estimatedLambdas: (dif && fpl) ? Math.ceil(dif / fpl) : 'unknown',
      targetMaxLambdas: TARGET_MAX_LAMBDAS,
      concurrency: (payload as any).concurrency,
      concurrencyPerLambda: (payload as any).concurrencyPerLambda,
      hasConcurrencyKey: 'concurrency' in payload,
      concurrencyIsNull: (payload as any).concurrency === null,
    },
  };
}
