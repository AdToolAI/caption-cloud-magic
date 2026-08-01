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

export const AWS_FRAME_PROBE_TAG = "v348-aws-remotion-still";
/** Must match the deployed Remotion Lambda version (see _shared/remotion-payload.ts). */
export const REMOTION_STILL_VERSION = "4.0.462";


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

  // v364 — Kantenlänge deckeln. Ein Still in voller Plate-Auflösung (1928 px)
  // wird für Rekognition komplett heruntergeladen und base64-kodiert; zwei
  // bis drei davon haben den Edge-Worker mit `Memory limit exceeded` getötet,
  // bevor der eigentliche Preclip überhaupt startete. Die Detektion arbeitet
  // mit normalisierten Koordinaten, das Framing bleibt identisch — nur die
  // Byte-Menge sinkt um ~75 %.
  const requested = Math.max(64, Math.round(Number(req.frameSize) || 512));
  const maxEdge = Math.max(256, Math.round(Number(req.maxEdge) || AWS_STILL_MAX_EDGE_PX));
  const size = Math.min(requested, maxEdge);
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

  const outName = `mouth-probe/${crypto.randomUUID()}.png`;
  const payload = {
    type: "still",
    // v348 — Remotion Lambda rejects payloads without a matching `version`
    // field. Without it the invocation returns an empty body, which v347
    // logged as the anonymous `unparsable_lambda_body:` with no detail.
    version: REMOTION_STILL_VERSION,
    serveUrl,
    composition: "DialogTurnFaceCropVideo",
    inputProps: { type: "payload", payload: JSON.stringify(inputProps) },
    imageFormat: "png",
    jpegQuality: 80,
    privacy: "public",
    bucketName: DEFAULT_BUCKET_NAME,
    outName,
    frame: 0,
    attempt: 1,
    maxRetries: 0,
    scale: 1,
    logLevel: "warn",
    envVariables: {},
    chromiumOptions: {},
    dumpBrowserLogs: false,
    offthreadVideoCacheSizeInBytes: null,
    deleteAfter: "1-day",
    timeoutInMilliseconds: Math.min(120_000, Math.max(15_000, remaining - 2_000)),
    downloadBehavior: { type: "play-in-browser" },
    forceWidth: size,
    forceHeight: size,
    forceBucketName: DEFAULT_BUCKET_NAME,
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
      headers: { "Content-Type": "application/json", "X-Amz-Invocation-Type": "RequestResponse" },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });
    const body = await res.text();
    // v348 — full forensics on every non-usable answer. `unparsable_lambda_body`
    // with no content told us nothing in v347.
    const diag =
      `status=${res.status} fnError=${res.headers.get("x-amz-function-error") ?? "none"} ` +
      `reqId=${res.headers.get("x-amzn-requestid") ?? "none"} bytes=${body.length}`;
    if (!res.ok) {
      return { url: null, error: `lambda_${res.status}:${diag}:${body.slice(0, 160)}` };
    }

    let parsed: unknown = null;
    if (body.trim().length > 0) {
      try {
        parsed = JSON.parse(body);
      } catch {
        return { url: null, error: `unparsable_lambda_body:${diag}:${body.slice(0, 120)}` };
      }
    }

    const url = parsed ? extractStillUrl(parsed) : null;
    if (url) return { url, error: null };

    // Fallback: the still is written to a deterministic public S3 key. If the
    // Lambda answered without a usable body but the object exists, use it.
    const s3Url =
      `https://${DEFAULT_BUCKET_NAME}.s3.${AWS_REGION}.amazonaws.com/${outName}`;
    try {
      const head = await fetch(s3Url, { method: "HEAD" });
      if (head.ok) return { url: s3Url, error: null };
    } catch {
      // ignore — reported as measurement outage below
    }

    const errObj = (parsed ?? {}) as Record<string, unknown>;
    const detail = String(
      errObj?.errorMessage ?? errObj?.message ?? errObj?.errorType ?? "no_output_url",
    );
    return { url: null, error: `lambda_still_failed:${diag}:${detail.slice(0, 160)}` };
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
