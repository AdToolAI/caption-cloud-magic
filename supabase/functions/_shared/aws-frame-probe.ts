/**
 * aws-frame-probe (v347) — AWS-only still extraction for lip-sync forensics.
 * ==========================================================================
 * HARD PROJECT RULE: frame extraction in the lip-sync pipeline runs on AWS.
 * No Replicate. No lucataco. No `ffmpeg-extract-frame`. Ever.
 *
 * v344–v346 violated that rule by calling `lucataco/ffmpeg-extract-frame`
 * on Replicate. That model was retired, answered every request with
 * `404 Model not found`, and the resulting measurement outage was
 * misclassified as a Sync.so no-op — which hard-failed perfectly good
 * lip-sync passes.
 *
 * This module renders single stills through the SAME Remotion Lambda stack
 * that already produces preclips and plates (`REMOTION_SERVE_URL` +
 * `REMOTION_LAMBDA_FUNCTION_ARN`), using the existing
 * `DialogTurnFaceCropVideo` composition. No new composition is required, so
 * no bundle redeploy is needed.
 *
 * A Sync.so per-pass output is a square preclip, so a full-frame still is
 * produced with cropX/cropY = 0 and cropSize = outputSize.
 */

import { getLambdaFunctionName, AWS_REGION, DEFAULT_BUCKET_NAME } from "./aws-lambda.ts";

export const AWS_FRAME_PROBE_TAG = "v347-aws-remotion-still";

export interface AwsStillRequest {
  /** Video to sample (the Sync.so per-pass output). */
  videoUrl: string;
  /** Timestamp inside the clip, seconds. */
  timestamp: number;
  /** Square edge length of the clip in pixels. */
  frameSize: number;
  /** Absolute wall-clock deadline for the whole probe. */
  deadline: number;
}

export interface AwsStillResult {
  url: string | null;
  error: string | null;
}

/** True when the AWS credentials/config needed for still rendering exist. */
export function awsFrameProbeAvailable(
  getEnv: (name: string) => string | undefined = (name) => Deno.env.get(name),
): boolean {
  return !!(
    getEnv("AWS_ACCESS_KEY_ID") &&
    getEnv("AWS_SECRET_ACCESS_KEY") &&
    getEnv("REMOTION_SERVE_URL")
  );
}

/**
 * Renders one still on AWS Lambda and returns its public S3 URL.
 * Never throws — every failure is reported as `{ url: null, error }` so the
 * caller can distinguish a measurement outage from a provider no-op.
 */
export async function renderAwsStill(req: AwsStillRequest): Promise<AwsStillResult> {
  const remaining = req.deadline - Date.now();
  if (remaining <= 3_000) return { url: null, error: "budget_exhausted" };

  const accessKeyId = Deno.env.get("AWS_ACCESS_KEY_ID");
  const secretAccessKey = Deno.env.get("AWS_SECRET_ACCESS_KEY");
  const sessionToken = Deno.env.get("AWS_SESSION_TOKEN") || undefined;
  const serveUrl = Deno.env.get("REMOTION_SERVE_URL") || "";
  if (!accessKeyId || !secretAccessKey) {
    return { url: null, error: "aws_credentials_missing" };
  }
  if (!serveUrl) {
    return { url: null, error: "remotion_serve_url_missing" };
  }

  const size = Math.max(64, Math.round(Number(req.frameSize) || 512));
  const t = Math.max(0.01, Number(req.timestamp) || 0.01);

  // The Sync.so output is a square single-face clip, so the "crop" is the
  // whole frame. DialogTurnFaceCropVideo seeks via `startSec`, therefore
  // frame 0 of the still render is exactly the requested timestamp.
  const inputProps = {
    masterVideoUrl: req.videoUrl,
    startSec: t,
    endSec: t + 0.1,
    outputSize: size,
    srcWidth: size,
    srcHeight: size,
    cropX: 0,
    cropY: 0,
    cropSize: size,
  };

  const payload = {
    type: "still",
    serveUrl,
    composition: "DialogTurnFaceCropVideo",
    inputProps: { type: "payload", payload: JSON.stringify(inputProps) },
    imageFormat: "png",
    privacy: "public",
    bucketName: DEFAULT_BUCKET_NAME,
    outName: `mouth-probe/${crypto.randomUUID()}.png`,
    frame: 0,
    attempt: 1,
    maxRetries: 0,
    scale: 1,
    logLevel: "warn",
    envVariables: {},
    chromiumOptions: {},
    offthreadVideoCacheSizeInBytes: null,
    deleteAfter: "1-day",
    timeoutInMilliseconds: Math.min(120_000, Math.max(15_000, remaining - 2_000)),
    downloadBehavior: { type: "play-in-browser" },
    forceWidth: size,
    forceHeight: size,
  };

  const { AwsClient } = await import("npm:aws4fetch@1.0.18");
  const aws = new AwsClient({ accessKeyId, secretAccessKey, sessionToken, region: AWS_REGION });
  const lambdaUrl =
    `https://lambda.${AWS_REGION}.amazonaws.com/2015-03-31/functions/${getLambdaFunctionName()}/invocations`;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), Math.max(5_000, req.deadline - Date.now()));
  try {
    const res = await aws.fetch(lambdaUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });
    const body = await res.text();
    if (!res.ok) {
      return { url: null, error: `lambda_${res.status}:${body.slice(0, 160)}` };
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(body);
    } catch {
      return { url: null, error: `unparsable_lambda_body:${body.slice(0, 120)}` };
    }

    const url = extractStillUrl(parsed);
    if (url) return { url, error: null };

    const errObj = parsed as Record<string, unknown> | null;
    const detail = String(
      errObj?.errorMessage ?? errObj?.message ?? errObj?.errorType ?? "no_output_url",
    );
    return { url: null, error: `lambda_still_failed:${detail.slice(0, 160)}` };
  } catch (e) {
    const msg = (e as Error)?.name === "AbortError"
      ? "timeout"
      : (e as Error)?.message ?? String(e);
    return { url: null, error: msg.slice(0, 160) };
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Reads the still URL out of a Remotion Lambda `still` response.
 * Remotion has used `output`, `url` and `publicUrl` across versions.
 */
export function extractStillUrl(out: unknown): string | null {
  if (!out || typeof out !== "object") return null;
  const o = out as Record<string, unknown>;
  for (const key of ["output", "url", "publicUrl", "outputFile"]) {
    const value = o[key];
    if (typeof value === "string" && /^https?:\/\//.test(value)) return value;
  }
  return null;
}
