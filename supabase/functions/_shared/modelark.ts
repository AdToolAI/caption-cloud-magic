// ============================================================================
// BytePlus ModelArk (Volcengine Ark) client — Seedance 2.5
// ----------------------------------------------------------------------------
// Async task API:
//   POST /contents/generations/tasks   → { id }
//   GET  /contents/generations/tasks/{id} → { status, content: { video_url } }
//
// Region: Asia Pacific (Johor) / ap-southeast-1.
// Secrets: MODELARK_API_KEY (required), MODELARK_RESOURCE_ID (optional
// endpoint/resource id used as the `model` value when the account requires it).
// ============================================================================

export const MODELARK_BASE_URL =
  Deno.env.get("MODELARK_BASE_URL") ?? "https://ark.ap-southeast.bytepluses.com/api/v3";

/** Default published model id for Seedance 2.5 (BytePlus ModelArk). */
export const SEEDANCE_25_MODEL_ID =
  Deno.env.get("MODELARK_SEEDANCE_25_MODEL_ID") ?? "dreamina-seedance-2-5-260628";

/** Prefix used to distinguish ModelArk task ids from Replicate prediction ids. */
export const MODELARK_JOB_PREFIX = "modelark:";

export function modelArkApiKey(): string {
  const key = Deno.env.get("MODELARK_API_KEY");
  if (!key) throw new Error("MODELARK_API_KEY not configured");
  return key;
}

/**
 * Endpoint id takes precedence over the public model id — but only when the
 * configured resource id actually is an inference endpoint (`ep-…`). Any other
 * account/resource identifier is ignored so we never send an invalid `model`.
 */
export function modelArkModelId(): string {
  const resource = (Deno.env.get("MODELARK_RESOURCE_ID") ?? "").trim();
  if (resource.startsWith("ep-")) return resource;
  return SEEDANCE_25_MODEL_ID;
}

export type ModelArkTaskStatus =
  | "queued"
  | "running"
  | "succeeded"
  | "failed"
  | "cancelled";

export interface ModelArkTask {
  id: string;
  status: ModelArkTaskStatus;
  videoUrl?: string;
  error?: string;
  raw: unknown;
}

export interface CreateSeedance25Params {
  prompt: string;
  /**
   * Clip length in seconds (4–30) or `-1` for the provider's smart duration.
   * Video-editing tasks are locked to `-1` by ModelArk.
   */
  duration: number;
  /** '480p' | '720p' — Seedance 2.5 does not support 1080p/4K. */
  resolution?: string;
  /** '16:9' | '4:3' | '1:1' | '3:4' | '9:16' | '21:9' | 'adaptive' */
  aspectRatio?: string;
  /** Image-to-Video: first frame. */
  firstFrameUrl?: string;
  /** Optional last frame for first/last-frame guidance. */
  lastFrameUrl?: string;
  /** Multi-reference images (max 30, role `reference_image`). */
  referenceImageUrls?: string[];
  /** Reference videos (max 10, role `reference_video`). */
  referenceVideoUrls?: string[];
  /** Reference audio clips (max 10, role `reference_audio`). */
  referenceAudioUrls?: string[];
  /** Native audio generation (`generate_audio`). */
  generateAudio?: boolean;
  /** Disable the provider watermark (default true = no watermark). */
  noWatermark?: boolean;
  /** Fixed seed for reproducible output. */
  seed?: number;
}

/** Provider-documented aspect ratio enum for Seedance 2.5. */
export const MODELARK_RATIOS = [
  "16:9",
  "4:3",
  "1:1",
  "3:4",
  "9:16",
  "21:9",
  "adaptive",
] as const;

/** Provider-documented reference-asset caps (30 images + 10 videos + 10 audio). */
export const MODELARK_MAX_REFERENCE_IMAGES = 30;
export const MODELARK_MAX_REFERENCE_VIDEOS = 10;
export const MODELARK_MAX_REFERENCE_AUDIOS = 10;

/**
 * Creates a Seedance 2.5 video generation task.
 *
 * Provider contract (BytePlus ModelArk docs, verified 10.08.2026):
 *  - resolution: 480p | 720p only (1080p/4K rejected)
 *  - duration: 4–30 s, or -1 (smart duration; forced for editing tasks)
 *  - ratio: 16:9 | 4:3 | 1:1 | 3:4 | 9:16 | 21:9 | adaptive; forced to
 *    `adaptive` for first-frame / first+last-frame / video-edit tasks
 *  - reference assets: up to 30 images + 10 videos + 10 audio clips
 *  - the three image input modes (first frame, first+last frame, multimodal
 *    reference) are mutually exclusive
 *  - resolution/ratio/duration/watermark/generate_audio are sent as top-level
 *    body fields (the `--rs`/`--rt` prompt suffix is the legacy path)
 */
export async function createSeedance25Task(params: CreateSeedance25Params): Promise<string> {
  const {
    prompt,
    duration,
    resolution = "720p",
    aspectRatio = "16:9",
    firstFrameUrl,
    lastFrameUrl,
    referenceImageUrls,
    referenceVideoUrls,
    referenceAudioUrls,
    generateAudio = false,
    noWatermark = true,
    seed,
  } = params;

  const safeResolution = resolution === "480p" ? "480p" : "720p";
  const smartDuration = duration === -1;
  const safeDuration = smartDuration ? -1 : Math.max(4, Math.min(30, Math.round(duration)));

  const refImages = (referenceImageUrls ?? []).filter(Boolean).slice(0, MODELARK_MAX_REFERENCE_IMAGES);
  const refVideos = (referenceVideoUrls ?? []).filter(Boolean).slice(0, MODELARK_MAX_REFERENCE_VIDEOS);
  const refAudios = (referenceAudioUrls ?? []).filter(Boolean).slice(0, MODELARK_MAX_REFERENCE_AUDIOS);
  const useReferenceMode = refImages.length > 0;
  const usesFrameGuidance = !useReferenceMode && !!firstFrameUrl;
  // ModelArk locks the ratio to `adaptive` whenever the geometry comes from an
  // input asset (frame guidance or a reference/edit video).
  const ratioLocked = usesFrameGuidance || refVideos.length > 0;
  const requestedRatio = (MODELARK_RATIOS as readonly string[]).includes(aspectRatio)
    ? aspectRatio
    : "16:9";
  const safeRatio = ratioLocked ? "adaptive" : requestedRatio;

  const content: Array<Record<string, unknown>> = [
    { type: "text", text: prompt.trim() },
  ];

  if (useReferenceMode) {
    for (const ref of refImages) {
      content.push({ type: "image_url", image_url: { url: ref }, role: "reference_image" });
    }
  } else {
    if (firstFrameUrl) {
      content.push({ type: "image_url", image_url: { url: firstFrameUrl }, role: "first_frame" });
    }
    if (firstFrameUrl && lastFrameUrl) {
      content.push({ type: "image_url", image_url: { url: lastFrameUrl }, role: "last_frame" });
    }
  }

  for (const video of refVideos) {
    content.push({ type: "video_url", video_url: { url: video }, role: "reference_video" });
  }
  for (const audio of refAudios) {
    content.push({ type: "audio_url", audio_url: { url: audio }, role: "reference_audio" });
  }

  // Documented body parameters (preferred over the legacy `--rs/--rt/...`
  // prompt suffix): invalid values come back as a clean 400 instead of being
  // silently ignored inside the prompt text.
  const payload: Record<string, unknown> = {
    model: modelArkModelId(),
    content,
    resolution: safeResolution,
    ratio: safeRatio,
    duration: safeDuration,
    watermark: !noWatermark,
    generate_audio: !!generateAudio,
  };
  if (typeof seed === "number" && Number.isFinite(seed)) payload.seed = seed;

  const res = await fetch(`${MODELARK_BASE_URL}/contents/generations/tasks`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${modelArkApiKey()}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });


  const bodyText = await res.text();
  if (!res.ok) {
    throw new Error(`ModelArk create failed (${res.status}): ${bodyText.slice(0, 500)}`);
  }

  let json: any;
  try {
    json = JSON.parse(bodyText);
  } catch {
    throw new Error(`ModelArk returned non-JSON response: ${bodyText.slice(0, 200)}`);
  }

  const taskId = json?.id ?? json?.data?.id ?? json?.task_id;
  if (!taskId) throw new Error(`ModelArk response has no task id: ${bodyText.slice(0, 200)}`);
  return String(taskId);
}

/** Polls a single ModelArk task. */
export async function getModelArkTask(taskId: string): Promise<ModelArkTask> {
  const res = await fetch(
    `${MODELARK_BASE_URL}/contents/generations/tasks/${encodeURIComponent(taskId)}`,
    { headers: { Authorization: `Bearer ${modelArkApiKey()}` } },
  );

  const bodyText = await res.text();
  if (!res.ok) {
    throw new Error(`ModelArk poll failed (${res.status}): ${bodyText.slice(0, 300)}`);
  }

  let json: any;
  try {
    json = JSON.parse(bodyText);
  } catch {
    throw new Error(`ModelArk poll returned non-JSON: ${bodyText.slice(0, 200)}`);
  }

  const status = String(json?.status ?? json?.data?.status ?? "running") as ModelArkTaskStatus;
  const videoUrl =
    json?.content?.video_url ??
    json?.data?.content?.video_url ??
    json?.result?.video_url ??
    undefined;
  const error =
    json?.error?.message ??
    json?.data?.error?.message ??
    (status === "failed" ? "Generation failed at provider" : undefined);

  return { id: taskId, status, videoUrl, error, raw: json };
}

/** Strips the `modelark:` prefix from a stored job id. */
export function extractModelArkTaskId(jobId: string | null | undefined): string | null {
  if (!jobId) return null;
  return jobId.startsWith(MODELARK_JOB_PREFIX)
    ? jobId.slice(MODELARK_JOB_PREFIX.length)
    : null;
}

/**
 * Downloads the generated MP4 and stores it permanently in Supabase Storage.
 * The provider URL expires within hours, so this must run right after the task
 * completes. Returns the permanent public URL, or the provider URL as fallback.
 */
export async function storeModelArkVideo(
  supabaseAdmin: any,
  bucket: string,
  path: string,
  videoUrl: string,
): Promise<string> {
  try {
    const res = await fetch(videoUrl);
    if (!res.ok) throw new Error(`download failed: ${res.status}`);
    const bytes = await res.arrayBuffer();

    const { error: uploadError } = await supabaseAdmin.storage
      .from(bucket)
      .upload(path, bytes, { contentType: "video/mp4", upsert: true });
    if (uploadError) throw uploadError;

    const { data } = supabaseAdmin.storage.from(bucket).getPublicUrl(path);
    return data?.publicUrl ?? videoUrl;
  } catch (err) {
    console.error("[modelark] storage fallback, using provider URL:", err);
    return videoUrl;
  }
}
