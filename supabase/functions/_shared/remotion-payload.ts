/**
 * Remotion Lambda Start Payload Normalizer
 * 
 * Ensures all Lambda invocations send a COMPLETE payload that satisfies
 * the Remotion v4.0.424 ServerlessStartPayload schema.
 * 
 * Without the `version` field and other required keys, Lambda rejects
 * the payload with "Version mismatch / incompatible payload".
 */

const REMOTION_VERSION = '4.0.424';

/**
 * Calculates framesPerLambda using Remotion's internal algorithm.
 * This ensures exactly ONE scheduling field is set, preventing the
 * "Both framesPerLambda and concurrency were set" error.
 */
function calculateFramesPerLambda(durationInFrames: number | undefined): number {
  const frameCount = durationInFrames ?? 900; // default ~30s @ 30fps
  // Remotion interpolates concurrency between 75 and 150 over [0, 18000] frames
  const t = Math.min(Math.max(frameCount / 18000, 0), 1);
  const concurrency = Math.round(75 + t * (150 - 75));
  const raw = Math.ceil(frameCount / concurrency);
  return Math.max(raw, 20); // minimum 20
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

    // ✅ CRITICAL: version field — without this Remotion rejects the payload
    version: REMOTION_VERSION,

    // Required schema fields with safe defaults
    logLevel: (partial.logLevel as string) || 'warn',
    // ✅ r13: Deterministic frameRange — always set to [0, durationInFrames-1] if missing
    frameRange: (partial.frameRange as [number, number] | null) ?? 
      (typeof partial.durationInFrames === 'number' && partial.durationInFrames > 0 
        ? [0, (partial.durationInFrames as number) - 1] as [number, number]
        : null),
    timeoutInMilliseconds: (partial.timeoutInMilliseconds as number) || 300000,
    chromiumOptions: (partial.chromiumOptions as Record<string, unknown>) || {},
    scale: (partial.scale as number) || 1,
    everyNthFrame: (partial.everyNthFrame as number) || 1,
    // ⚠️ concurrencyPerLambda intentionally NOT defaulted — see neutral scheduling below
    concurrencyPerLambda: (partial.concurrencyPerLambda as number) || 1, // placeholder, will be removed below
    downloadBehavior: (partial.downloadBehavior as any) || { type: 'play-in-browser', fileName: null },
    muted: (partial.muted as boolean) ?? false,
    overwrite: (partial.overwrite as boolean) ?? true,
    rendererFunctionName: (partial.rendererFunctionName as string | null) ?? null,
    framesPerLambda: (partial.framesPerLambda as number | null) ?? null,
    privacy: (partial.privacy as string) || 'public',
    audioCodec: (partial.audioCodec as string) || 'aac',
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

  // ✅ NULL-SAFE SCHEDULING: Set framesPerLambda explicitly AND concurrency to null.
  // Remotion's validator checks `concurrency !== null && framesPerFunction !== null`.
  // If concurrency is undefined (deleted/missing), `undefined !== null` is true → false positive.
  // By explicitly setting concurrency: null, the check correctly evaluates to false.
  const explicitFPL = partial.framesPerLambda as number | undefined;
  normalized.framesPerLambda = explicitFPL ?? calculateFramesPerLambda(partial.durationInFrames as number | undefined);
  normalized.concurrency = null; // ← CRITICAL: explicit null, NOT undefined/deleted
  normalized.concurrencyPerLambda = (partial.concurrencyPerLambda as number) || 1; // ← REQUIRED: browser tabs per Lambda

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
 * No extra fields, no nullable placeholders — just the bare minimum.
 * This is used to isolate whether our normalizeStartPayload adds fields
 * that confuse the Lambda's internal Zod parser.
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
    // ✅ ONLY framesPerLambda — concurrency explicitly null
    framesPerLambda: opts.durationInFrames
      ? Math.max(20, Math.ceil(opts.durationInFrames / 75))
      : 20,
    concurrency: null,
    scale: 1,
    everyNthFrame: 1,
    timeoutInMilliseconds: 300000,
    chromiumOptions: {},
    downloadBehavior: { type: 'play-in-browser' },
    audioCodec: 'aac',
    envVariables: {},
    // ✅ r13: Deterministic frameRange
    frameRange: opts.durationInFrames && opts.durationInFrames > 0
      ? [0, opts.durationInFrames - 1]
      : [0, 59], // fallback: 2s @ 30fps
    // ✅ Video dimensions — explicit to skip calculateMetadata
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
  return {
    version: (payload as any).version,
    type: (payload as any).type,
    composition: (payload as any).composition,
    codec: (payload as any).codec,
    hasWebhook: !!(payload as any).webhook,
    hasBucketName: !!(payload as any).bucketName,
    // ✅ r13: Enhanced frameRange forensics
    hasFrameRange: !!(payload as any).frameRange,
    hasFrameRangeKey: 'frameRange' in payload,
    frameRangeValue: fr ?? null,
    frameRangeType: fr === null ? 'null' : fr === undefined ? 'undefined' : Array.isArray(fr) ? `array[${fr.length}]` : typeof fr,
    durationInFrames: (payload as any).durationInFrames,
    fps: (payload as any).fps,
    width: (payload as any).width,
    height: (payload as any).height,
    keyCount: Object.keys(payload).length,
    serveUrlPrefix: ((payload as any).serveUrl || '').substring(0, 80),
    payloadMode: (payload as any)._payloadMode || 'normalized',
    audioCodec: (payload as any).audioCodec,
    // ✅ r15: envVariables forensics
    hasEnvVariablesKey: 'envVariables' in payload,
    envVariablesType: typeof (payload as any).envVariables,
    envVariablesSerializedLength: (() => { try { return JSON.stringify((payload as any).envVariables).length; } catch { return -1; } })(),
    bundle_canary: 'r15-envVariables-fix',
    // ✅ Scheduling forensics
    scheduling: {
      framesPerLambda: (payload as any).framesPerLambda,
      concurrency: (payload as any).concurrency,
      concurrencyPerLambda: (payload as any).concurrencyPerLambda,
      hasConcurrencyKey: 'concurrency' in payload,
      concurrencyIsNull: (payload as any).concurrency === null,
    },
  };
}
