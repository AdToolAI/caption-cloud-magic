/**
 * transition-frame (v417) — server-side continuity frame extraction.
 *
 * Phase 2 shipped the transition frame only as a browser-canvas capture in
 * `ClipsTab`. Every render path that does NOT go through that click (single
 * scene re-render, Autopilot, server jobs) had no previous frame at all and
 * silently degraded to a hard cut, while the UI still promised "seamless".
 *
 * This helper closes that gap on the server:
 *   1. Reuse the previous scene's persisted `last_frame_url` when present.
 *   2. Otherwise render ONE still of the previous clip through the already
 *      deployed Remotion Lambda bundle (AWS-only — Replicate/lucataco stays
 *      banned for every frame grab, see the AWS-only motion-probe contract),
 *      store it in `composer-frames` and persist it on the previous scene.
 *   3. On any failure return a reason. The caller then simply has no
 *      previous frame, which the resolver already handles as `match-cut`.
 *      No throw, no new guard, no new state machine.
 *
 * The extraction never touches `reference_image_url` — the lip-sync anchor is
 * structurally out of reach here.
 */

import { AwsClient } from "npm:aws4fetch@1.0.18";
import { getLambdaFunctionName, AWS_REGION } from "./aws-lambda.ts";

const REMOTION_VERSION = "4.0.462";
/** Composition of the deployed bundle that renders a plain master clip. */
const STILL_COMPOSITION = "DialogStitchVideo";
const STILL_FPS = 30;
/** Distance from the clip end we sample the transition frame at. */
const END_OFFSET_SECONDS = 0.08;

export interface TransitionFrameArgs {
  supabaseAdmin: any;
  userId: string;
  projectId: string;
  /** Scene whose clip the frame is taken FROM (the predecessor). */
  previousSceneId: string;
  previousClipUrl: string;
  previousDurationSeconds?: number;
}

export interface TransitionFrameResult {
  url?: string;
  cached?: boolean;
  reason?: string;
}

/**
 * Returns the transition frame of `previousClipUrl`, extracting and
 * persisting it once. Never throws.
 */
export async function ensureTransitionFrame(
  args: TransitionFrameArgs,
): Promise<TransitionFrameResult> {
  const {
    supabaseAdmin,
    userId,
    projectId,
    previousSceneId,
    previousClipUrl,
    previousDurationSeconds,
  } = args;

  if (!previousClipUrl) return { reason: "no_previous_clip" };

  // 1 — cache on the predecessor scene
  try {
    const { data: prevRow } = await supabaseAdmin
      .from("composer_scenes")
      .select("last_frame_url, clip_url")
      .eq("id", previousSceneId)
      .maybeSingle();
    const cached = String((prevRow as any)?.last_frame_url ?? "");
    const cachedFor = String((prevRow as any)?.clip_url ?? "");
    // Only reuse when the cache belongs to the clip we are chaining from —
    // a re-rendered predecessor must not hand out its old frame.
    if (cached && (!cachedFor || cachedFor === previousClipUrl)) {
      return { url: cached, cached: true };
    }
  } catch (_e) {
    // fall through to extraction
  }

  const accessKeyId = Deno.env.get("AWS_ACCESS_KEY_ID") ?? "";
  const secretAccessKey = Deno.env.get("AWS_SECRET_ACCESS_KEY") ?? "";
  const sessionToken = Deno.env.get("AWS_SESSION_TOKEN") ?? undefined;
  const serveUrl = Deno.env.get("REMOTION_SERVE_URL") ?? "";
  if (!accessKeyId || !secretAccessKey) return { reason: "aws_credentials_missing" };
  if (!serveUrl) return { reason: "remotion_serve_url_missing" };

  const durationSec = Math.max(Number(previousDurationSeconds) || 0, 1);
  const sampleSec = Math.max(durationSec - END_OFFSET_SECONDS, 0.05);
  const totalFrames = Math.max(3, Math.ceil(durationSec * STILL_FPS));
  const frame = Math.min(totalFrames - 1, Math.max(0, Math.round(sampleSec * STILL_FPS)));

  const payload = {
    type: "still",
    serveUrl,
    composition: STILL_COMPOSITION,
    inputProps: {
      type: "payload",
      payload: JSON.stringify({
        masterVideoUrl: previousClipUrl,
        masterAudioUrl: "",
        totalSec: durationSec,
        shots: [],
      }),
    },
    version: REMOTION_VERSION,
    imageFormat: "jpeg",
    jpegQuality: 85,
    frame,
    privacy: "public",
    attempt: 1,
    logLevel: "warn",
    outName: `transition-${previousSceneId}-${Date.now()}.jpeg`,
    timeoutInMilliseconds: 120000,
    chromiumOptions: {},
    scale: 1,
    downloadBehavior: { type: "play-in-browser", fileName: null },
    forceHeight: null,
    forceWidth: null,
    bucketName: null,
    offthreadVideoCacheSizeInBytes: null,
    deleteAfter: null,
    envVariables: {},
    forcePathStyle: false,
  };

  try {
    const aws = new AwsClient({ accessKeyId, secretAccessKey, sessionToken, region: AWS_REGION });
    const lambdaUrl =
      `https://lambda.${AWS_REGION}.amazonaws.com/2015-03-31/functions/${getLambdaFunctionName()}/invocations`;
    const res = await aws.fetch(lambdaUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    if (!res.ok) {
      return { reason: `lambda_http_${res.status}` };
    }
    const parsed = JSON.parse(await res.text());
    const output: string | undefined = parsed?.output ?? parsed?.url;
    if (!output || typeof output !== "string") {
      return { reason: parsed?.errorType ? `lambda_${parsed.errorType}` : "lambda_no_output" };
    }

    const stillRes = await fetch(output);
    if (!stillRes.ok) return { reason: `still_download_${stillRes.status}` };
    const bytes = new Uint8Array(await stillRes.arrayBuffer());
    if (bytes.byteLength < 1024) return { reason: "still_too_small" };

    // Storage RLS: the user id MUST be the first path segment.
    const path = `${userId}/${projectId}/transition-frames/${previousSceneId}-${Date.now()}.jpeg`;
    const { error: upErr } = await supabaseAdmin.storage
      .from("composer-frames")
      .upload(path, bytes, { contentType: "image/jpeg", upsert: true, cacheControl: "31536000" });
    if (upErr) return { reason: `upload_failed:${upErr.message}` };

    const { data: pub } = supabaseAdmin.storage.from("composer-frames").getPublicUrl(path);
    const publicUrl = pub?.publicUrl as string | undefined;
    if (!publicUrl) return { reason: "public_url_missing" };

    await supabaseAdmin
      .from("composer_scenes")
      .update({ last_frame_url: publicUrl })
      .eq("id", previousSceneId);

    return { url: publicUrl };
  } catch (e) {
    return { reason: `extraction_failed:${(e as Error).message.slice(0, 120)}` };
  }
}
