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
    frameRange: (partial.frameRange as [number, number] | null) ?? null,
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
    audioCodec: (partial.audioCodec as string | null) ?? null,
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
 * Returns a diagnostic summary of the payload for logging (no sensitive data).
 */
export function payloadDiagnostics(payload: NormalizedStartPayload): Record<string, unknown> {
  return {
    version: payload.version,
    type: payload.type,
    composition: payload.composition,
    codec: payload.codec,
    hasWebhook: !!payload.webhook,
    hasBucketName: !!payload.bucketName,
    hasFrameRange: !!payload.frameRange,
    durationInFrames: payload.durationInFrames,
    fps: payload.fps,
    width: payload.width,
    height: payload.height,
    keyCount: Object.keys(payload).length,
    serveUrlPrefix: (payload.serveUrl || '').substring(0, 80),
    // ✅ Scheduling forensics
    scheduling: {
      framesPerLambda: payload.framesPerLambda,
      concurrency: payload.concurrency,
      concurrencyPerLambda: (payload as any).concurrencyPerLambda,
      hasConcurrencyKey: 'concurrency' in payload,
      concurrencyIsNull: payload.concurrency === null,
    },
  };
}
